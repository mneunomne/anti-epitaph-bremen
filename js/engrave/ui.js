// the desk itself: settings on the left, the wall in the middle, the
// record on the right, the ledger underneath. everything saves itself.
(function () {
	const AE = window.AE;
	const { Tiling, Imaging, Project, Exporter, Bed } = AE;

	const $ = id => document.getElementById(id);
	const LAST = 'ae.lastProject';

	let project = null;      // the record being worked on
	let img = null;          // the source, full size, as an <img> or canvas
	let plan = null;         // tiles for the current settings
	let selected = null;     // tile id
	let srcStats = null;     // the loaded picture's own tonal extremes
	let view = 'simulation';

	// preview caches. the wall is redrawn on every slider move, so the
	// expensive parts — resampling the source, running the levels — are
	// kept until the thing they depend on actually changes
	const cache = { k: 0, src: null, laser: null, inverted: null, sig: '', clay: [], claySize: '' };

	// ---------------------------------------------------------------
	// small helpers
	// ---------------------------------------------------------------
	let toastTimer;
	function toast(msg) {
		const t = $('toast');
		t.textContent = msg;
		t.classList.add('show');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
	}

	function busy(on, text, frac) {
		$('busy').hidden = !on;
		if (text) $('busyText').textContent = text;
		$('busyFill').style.width = ((frac || 0) * 100) + '%';
	}

	let saveTimer;
	function save(immediate) {
		clearTimeout(saveTimer);
		const go = () => project && Project.save(project);
		if (immediate) return go();
		saveTimer = setTimeout(go, 400);
	}

	const num = (v, fallback) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);
	const fmt = v => (Math.round(v * 10) / 10).toString();

	// ---------------------------------------------------------------
	// loading a source image
	// ---------------------------------------------------------------
	function decode(blob) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(blob);
			const el = new Image();
			el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
			el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that image')); };
			el.src = url;
		});
	}

	async function useBlob(blob, name) {
		const el = await decode(blob);
		img = el;
		srcStats = null;
		project.image = { name: name || blob.name || 'image', type: blob.type, blob };
		cache.k = 0; cache.sig = '';
		Project.note(project, 'source image: ' + project.image.name);
		fitRange(true);
		save();
		refresh();
	}

	// pull the picture's own black and white points out to the full range.
	// done on load because a scan that is not fitted never asks the machine
	// for full power anywhere, and comes back as a haze instead of a picture
	function fitRange(quiet) {
		if (!img || !project) return;
		const r = srcStats || (srcStats = Imaging.autoRange(img));
		project.laser.inLo = r.lo;
		project.laser.inHi = r.hi;
		// the two boxes have to follow immediately even on a quiet fit:
		// readForm reads the dom, so a stale box would hand the old range
		// straight back the next time any control is touched
		$('inLo').value = r.lo;
		$('inHi').value = r.hi;
		Project.note(project, `range fitted to the picture: ${r.lo}–${r.hi}`);
		if (!quiet) { readForm(); toast(`range ${r.lo}–${r.hi}`); }
	}

	// the three files the piece itself uses, offered as a shortcut. they
	// only load when the folder is served over http — from file:// the
	// browser refuses to read a sibling file, and the picker is the way in
	const BUNDLED = [
		'images/Lote_53_-_Quadro_Easy-Resizecom copy.jpg',
		'images/Screenshot 2026-07-16 at 19.43.01.png',
		'images/Screenshot 2026-07-31 at 22.04.34.png',
		'images/fire.png'
	];

	function buildBundled() {
		const wrap = $('bundled');
		wrap.className = 'bundled-list';
		wrap.innerHTML = '';
		for (const path of BUNDLED) {
			const b = document.createElement('button');
			b.textContent = '↳ ' + path.replace('images/', '');
			b.onclick = async () => {
				try {
					const res = await fetch(encodeURI(path));
					if (!res.ok) throw new Error(res.status);
					await useBlob(await res.blob(), path.split('/').pop());
				} catch (e) {
					toast('serve this folder over http to use the bundled images, or pick a file');
				}
			};
			wrap.appendChild(b);
		}
	}

	// ---------------------------------------------------------------
	// the wall
	// ---------------------------------------------------------------
	const STATUS_COLOR = {
		pending: '#6d665e', queued: '#d4a13c', engraved: '#7fa86a',
		failed: '#c0563e', skipped: '#4f4b47'
	};

	// a move is a change of power along a scanline, so what a mode costs is
	// how often it changes its mind. measured over two resolutions: grayscale
	// shifts on nearly every pixel, a hard threshold almost never, and the
	// three noisy modes sit between — random a little cheaper than dither
	// because it leaves longer runs of bare clay in the light tones.
	const MOVES_PER_PX = { grayscale: 1, threshold: 0.2, dither: 0.5, scatter: 0.5, random: 0.45 };

	function laserSig() {
		const l = project.laser;
		return [l.mode, l.brightness, l.contrast, l.gamma, l.invert, l.threshold,
			l.inLo, l.inHi, l.noise, l.seed, cache.k].join('|');
	}

	// resample the source to roughly the size the wall is drawn at, then
	// run the levels once for the whole picture instead of per brick
	function ensurePreview(pxPerMM) {
		if (!img || !plan) return;
		const win = plan.win;
		let k = (plan.wall.w * pxPerMM) / win.w;
		k = Math.min(1, k);
		// keep the resampled source under control on very wide walls
		k = Math.min(k, 2400 / Math.max(img.width, img.height));

		if (!cache.src || Math.abs(k - cache.k) / (cache.k || 1) > 0.08) {
			cache.k = k;
			cache.src = Imaging.fitCanvas(img, Math.max(img.width, img.height) * k);
			cache.sig = '';
		}
		const sig = laserSig();
		if (sig !== cache.sig) {
			cache.sig = sig;
			cache.laser = Imaging.process(cache.src, project.laser);
			// the pale-burn simulation needs the ash negative of the same pass
			cache.inverted = Imaging.burnLayer(cache.laser);
		}
	}

	// a handful of clay faces, reused around the wall — a unique texture
	// per brick is thousands of canvases and reads no differently
	function clayPool(w, h) {
		const tone = bodyTone();
		const key = Math.round(w) + 'x' + Math.round(h) + ':' + tone;
		if (cache.claySize !== key) {
			cache.claySize = key;
			cache.clay = Array.from({ length: 10 }, (_, i) =>
				Imaging.clayTexture(Math.max(2, w), Math.max(2, h), i + 3, tone));
		}
		return cache.clay;
	}

	const bodyTone = () => (project && project.sim.body) || 'sooty';

	// the tone a fully fired area reaches, as a fill for the burnt word
	let swatch = null;
	function scarSwatch() {
		if (!swatch) {
			swatch = Imaging.canvas(8, 8);
			const x = swatch.getContext('2d');
			x.fillStyle = 'rgb(230,221,201)';
			x.fillRect(0, 0, 8, 8);
		}
		return swatch;
	}
	// a dark body swallows a black hairline, so the joint has to switch sides
	const darkBody = () => bodyTone() !== 'red';

	// the letters as they fall across one brick, filled with whatever should
	// show through them. the stage draws every tile's scar out of one shared
	// raster, so the word cannot be cut from it the way the exporter cuts it
	// — filling the letters with the bare clay lands on the same picture.
	function wordPatch(rect, w, h, fill) {
		const g = Imaging.wordGeom(project.word, plan.wall);
		if (!g || !(g.size > 0)) return null;
		const c = Imaging.canvas(w, h);
		const x = c.getContext('2d');
		const sx = c.width / rect.w, sy = c.height / rect.h;
		x.setTransform(sx, 0, 0, sy, -rect.x * sx, -rect.y * sy);
		x.font = `700 ${g.size}px ${g.face}`;
		x.textAlign = 'center';
		x.textBaseline = 'middle';
		x.fillStyle = '#fff';
		x.fillText(g.text, g.cx, g.cy);
		x.setTransform(1, 0, 0, 1, 0, 0);
		x.globalCompositeOperation = 'source-in';
		x.drawImage(fill, 0, 0, c.width, c.height);
		return c;
	}

	let layout = null;   // the scale and the world of the last draw, for hit testing

	// which of the cached rasters this view is looking at
	function baseRaster() {
		return view === 'source' ? cache.src
			: view === 'laser' ? cache.laser
				: project.sim.polarity === 'lighter' ? cache.inverted : cache.laser;
	}

	// one brick as it will come out: the clay, the scar the head leaves on it,
	// and the word cut back out of that.
	//
	// `rect` is the piece of the wall being shown, in millimetres — the bare
	// face on the wall, the whole engraved area on the bed, since the bed is
	// showing what the beam covers and the beam covers the bleed too. `src` is
	// the window into the source that matches it, `dest` where it lands.
	function paintFace(ctx, rect, src, dest, clay) {
		const k = cache.k, base = baseRaster(), d = dest;
		if (!base) return;
		if (!clay) {
			ctx.fillStyle = '#fff';
			ctx.fillRect(d.x, d.y, d.w, d.h);
			ctx.drawImage(base, src.x * k, src.y * k, src.w * k, src.h * k, d.x, d.y, d.w, d.h);
			return;
		}
		ctx.drawImage(clay, d.x, d.y, d.w, d.h);
		if (project.sim.polarity === 'lighter') {
			// the body is the black point and the scar only adds to it —
			// nothing here may darken a brick. see claySimulate
			ctx.globalAlpha = Imaging.SCAR_ALPHA;
			ctx.drawImage(base, src.x * k, src.y * k, src.w * k, src.h * k, d.x, d.y, d.w, d.h);
			ctx.globalAlpha = 1;
			if (project.word.text.trim()) {
				// cut out: the bare body back through the letters.
				// burnt: the letters at full scar instead.
				const cut = project.word.mode !== 'burn';
				const patch = wordPatch(rect, Math.max(2, Math.round(d.w)), Math.max(2, Math.round(d.h)),
					cut ? clay : scarSwatch());
				if (patch) {
					ctx.globalAlpha = cut ? 1 : Imaging.SCAR_ALPHA;
					ctx.drawImage(patch, d.x, d.y, d.w, d.h);
				}
			}
		} else {
			ctx.globalCompositeOperation = 'multiply';
			ctx.drawImage(base, src.x * k, src.y * k, src.w * k, src.h * k, d.x, d.y, d.w, d.h);
		}
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	function label(ctx, text, cx, cy, size) {
		ctx.font = `${size}px ui-monospace, monospace`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = 'rgba(0,0,0,0.55)';
		ctx.fillText(text, cx + 1, cy + 1);
		ctx.fillStyle = 'rgba(255,255,255,0.92)';
		ctx.fillText(text, cx, cy);
	}

	function draw() {
		const cv = $('stage'), ctx = cv.getContext('2d');
		if (!plan) return;

		const wrap = $('canvasWrap');
		const availW = Math.max(240, wrap.clientWidth - 36);
		const availH = Math.max(200, wrap.clientHeight - 36);
		const dpr = Math.min(devicePixelRatio || 1, 2);

		// the bed is a world of its own: the machine's square, in machine
		// millimetres, Y counting up from its corner. if the work has been
		// asked to go past the bed the canvas grows to show that it has.
		const bed = view === 'bed' ? Bed.layout(project, plan) : null;
		const world = bed
			? {
				w: Math.max(bed.bed.w, bed.used ? bed.used.maxX + bed.margin : 0),
				h: Math.max(bed.bed.h, bed.used ? bed.used.maxY + bed.margin : 0)
			}
			: { w: plan.wall.w, h: plan.wall.h };

		const s = Math.min(availW / world.w, availH / world.h);
		const cssW = world.w * s, cssH = world.h * s;
		cv.style.width = cssW + 'px';
		cv.style.height = cssH + 'px';
		cv.width = Math.round(cssW * dpr);
		cv.height = Math.round(cssH * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		layout = { s, world, bed, dpr };

		ensurePreview(s * dpr);
		if (bed) drawBed(ctx, bed, s, cssW, cssH, dpr);
		else drawWall(ctx, s, cssW, cssH, dpr);
	}

	function drawWall(ctx, s, cssW, cssH, dpr) {
		// mortar
		ctx.fillStyle = view === 'source' ? '#2a2724' : darkBody() ? '#5c554f' : '#9c948a';
		ctx.fillRect(0, 0, cssW, cssH);

		if (!img) {
			ctx.fillStyle = '#5a544d';
			ctx.font = '13px monospace';
			ctx.textAlign = 'center';
			ctx.fillText('load a source image', cssW / 2, cssH / 2);
			return;
		}

		const pool = clayPool(plan.wall.face.w * s * dpr, plan.wall.face.h * s * dpr);
		const labels = $('showLabels').checked;
		const joints = $('showGrid').checked;
		const sim = view === 'simulation' || view === 'status';
		const bedSet = new Set(project.bed.ids);

		for (const t of plan.list) {
			const dest = { x: t.x * s, y: t.y * s, w: t.w * s, h: t.h * s };
			// the crop without bleed: on screen a brick shows its own face
			const src = {
				x: t.src.x + (t.out.bleed / t.out.w) * t.src.w,
				y: t.src.y + (t.out.bleed / t.out.h) * t.src.h,
				w: (t.w / t.out.w) * t.src.w, h: (t.h / t.out.h) * t.src.h
			};
			const clay = sim ? pool[(t.row * 7 + t.col * 3) % pool.length] : null;
			paintFace(ctx, { x: t.x, y: t.y, w: t.w, h: t.h }, src, dest, clay);

			if (view === 'status') {
				const st = (project.tiles[t.id] || {}).status || 'pending';
				ctx.fillStyle = STATUS_COLOR[st];
				ctx.globalAlpha = st === 'pending' ? 0.35 : 0.72;
				ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
				ctx.globalAlpha = 1;
			}

			if (joints) {
				ctx.strokeStyle = darkBody() ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.35)';
				ctx.lineWidth = 1;
				ctx.strokeRect(dest.x + 0.5, dest.y + 0.5, dest.w - 1, dest.h - 1);
			}

			if (labels && dest.w > 30 && dest.h > 11) {
				label(ctx, t.label, dest.x + dest.w / 2, dest.y + dest.h / 2,
					Math.min(dest.h * 0.42, dest.w * 0.19, 15));
			}

			if (t.id === selected) {
				ctx.strokeStyle = '#e08a4e';
				ctx.lineWidth = 2;
				ctx.strokeRect(dest.x + 1, dest.y + 1, dest.w - 2, dest.h - 2);
			}

			// on the machine right now: the handful the joint file is written
			// for. drawn on every view, because it is the one thing about a
			// brick that is true whatever you are looking at — and inside the
			// selection ring, so a brick that is both still says both.
			if (bedSet.has(t.id)) {
				ctx.save();
				ctx.setLineDash([4, 3]);
				ctx.strokeStyle = 'rgba(240,236,230,0.95)';
				ctx.lineWidth = 2;
				ctx.strokeRect(dest.x + 3.5, dest.y + 3.5, dest.w - 7, dest.h - 7);
				ctx.restore();
			}
		}
	}

	// the machine's square with the bricks that are on it, drawn the way the
	// machine counts: X to the right, Y up, origin at the near corner. this is
	// the picture the joint gcode describes, and the point of it is to be able
	// to see, before sending anything, that the head stays on the bricks.
	function drawBed(ctx, bed, s, cssW, cssH, dpr) {
		const Y = mm => cssH - mm * s;                    // the bed counts up
		const rect = (x, y, w, h) => [x * s, Y(y + h), w * s, h * s];

		// anything outside the machine's own square is not somewhere the head
		// can be sent, so it is not drawn as bed
		ctx.fillStyle = '#171614';
		ctx.fillRect(0, 0, cssW, cssH);
		ctx.fillStyle = '#26231f';
		ctx.fillRect(...rect(0, 0, bed.bed.w, bed.bed.h));
		ctx.strokeStyle = '#4a453f';
		ctx.lineWidth = 1;
		ctx.strokeRect(...rect(0, 0, bed.bed.w, bed.bed.h).map((v, i) => i < 2 ? v + 0.5 : v - 1));

		// the inset the first face is laid to
		if (bed.margin > 0) {
			ctx.save();
			ctx.setLineDash([3, 4]);
			ctx.strokeStyle = 'rgba(255,255,255,0.10)';
			ctx.strokeRect(...rect(bed.margin, bed.margin,
				Math.max(0, bed.bed.w - bed.margin * 2), Math.max(0, bed.bed.h - bed.margin * 2)));
			ctx.restore();
		}

		if (!bed.slots.length) {
			ctx.fillStyle = '#5a544d';
			ctx.font = '13px monospace';
			ctx.textAlign = 'center';
			ctx.fillText('shift-click bricks on the wall to put them on the bed', cssW / 2, cssH / 2);
			return;
		}

		const pool = clayPool(bed.cell.w * s * dpr, bed.cell.h * s * dpr);
		const labels = $('showLabels').checked;

		for (const sl of bed.slots) {
			const t = sl.tile;
			const d = { x: sl.x * s, y: Y(sl.y + sl.h), w: sl.w * s, h: sl.h * s };
			// on the bed a face is shown whole, bleed and all: the bleed is
			// burnt, and what is burnt is what has to fit
			const wallRect = { x: t.x - t.out.bleed, y: t.y - t.out.bleed, w: t.out.w, h: t.out.h };
			const clay = pool[(t.row * 7 + t.col * 3) % pool.length];
			if (!img) { ctx.fillStyle = '#3a3633'; ctx.fillRect(d.x, d.y, d.w, d.h); }
			else if (!sl.turn) paintFace(ctx, wallRect, t.src, d, clay);
			else {
				// laid on its side. the frame it is painted into is turned
				// rather than the picture, so what the stage shows is exactly
				// what Gcode.quarterTurn will put on the brick — anticlockwise,
				// the top of the picture down the left-hand edge.
				ctx.save();
				ctx.translate(d.x, d.y + d.h);
				ctx.rotate(-Math.PI / 2);
				paintFace(ctx, wallRect, t.src, { x: 0, y: 0, w: d.h, h: d.w }, clay);
				ctx.restore();
			}

			// the brick edge inside the engraved area — the bleed hangs off it
			if (t.out.bleed > 0) {
				ctx.save();
				ctx.setLineDash([2, 3]);
				ctx.strokeStyle = 'rgba(255,255,255,0.35)';
				ctx.lineWidth = 1;
				ctx.strokeRect(...rect(sl.x + t.out.bleed, sl.y + t.out.bleed,
					sl.turn ? t.h : t.w, sl.turn ? t.w : t.h));
				ctx.restore();
			}

			// a face the machine cannot reach is called out as such
			const off = bed.origin.x + sl.x + sl.w > bed.bed.w || bed.origin.y + sl.y + sl.h > bed.bed.h
				|| bed.origin.x + sl.x < 0 || bed.origin.y + sl.y < 0;
			ctx.strokeStyle = off ? '#c0563e' : t.id === selected ? '#e08a4e' : 'rgba(230,224,216,0.55)';
			ctx.lineWidth = off || t.id === selected ? 2 : 1;
			ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);

			if (labels && d.w > 34 && d.h > 12) {
				label(ctx, `${sl.n}· ${sl.label}`, d.x + d.w / 2, d.y + d.h / 2,
					Math.min(d.h * 0.4, d.w * 0.15, 14));
			}
		}

		// what the head is told to walk before the beam comes on
		if (bed.frame && bed.used) {
			ctx.save();
			ctx.setLineDash([6, 4]);
			ctx.strokeStyle = 'rgba(192,122,82,0.85)';
			ctx.lineWidth = 1;
			ctx.strokeRect(...rect(bed.used.minX, bed.used.minY, bed.used.w, bed.used.h));
			ctx.restore();
		}
	}

	function tileAt(clientX, clientY) {
		const cv = $('stage'), r = cv.getBoundingClientRect();
		if (!layout || !plan) return null;
		const mx = (clientX - r.left) / layout.s, my = (clientY - r.top) / layout.s;
		if (layout.bed) {
			const y = layout.world.h - my;               // back into machine millimetres
			const sl = layout.bed.slots.find(s => mx >= s.x && mx <= s.x + s.w && y >= s.y && y <= s.y + s.h);
			return sl ? sl.tile : null;
		}
		return plan.list.find(t => mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) || null;
	}

	// ---------------------------------------------------------------
	// the bed
	// ---------------------------------------------------------------
	// a wall is metres across and the machine reaches 410 mm, so the wall is
	// never cut as a wall. these are the few bricks that are lying on the
	// machine at this moment, and they are the ones the joint file is for.
	const onBed = id => project.bed.ids.indexOf(id) >= 0;

	function setBed(ids, why) {
		project.bed.ids = ids;
		if (why) Project.note(project, why);
		save();
		renderBed();
		renderInspector();
		draw();
		if (why) updateLog();
	}

	function toggleBed(id) {
		const ids = project.bed.ids.slice();
		const at = ids.indexOf(id);
		if (at < 0) ids.push(id); else ids.splice(at, 1);
		setBed(ids);
	}

	function renderBed() {
		if (!plan || !project) return;
		const lay = Bed.layout(project, plan);
		const n = lay.slots.length;
		const box = $('bedList');

		box.innerHTML = n ? lay.slots.map(s => {
			// a face the head cannot reach, called out one by one rather than
			// as a single "it does not fit"
			const off = lay.origin.x + s.x + s.w > lay.bed.w || lay.origin.y + s.y + s.h > lay.bed.h
				|| lay.origin.x + s.x < 0 || lay.origin.y + s.y < 0;
			return `<div class="${off ? 'off' : ''}" data-id="${s.id}" title="${off ? 'past the edge of the work area' : 'show it'}">
				<b>${s.n}</b><span>${s.label}</span>
				<i>X${fmt(lay.origin.x + s.x)} Y${fmt(lay.origin.y + s.y)}</i>
				<button data-off="${s.id}" title="take it off the bed">×</button>
			</div>`;
		}).join('') : '<div><i>nothing on the bed — shift-click the bricks that are on it</i></div>';

		box.querySelectorAll('[data-off]').forEach(b => b.onclick = e => {
			e.stopPropagation();
			toggleBed(b.dataset.off);
		});
		box.querySelectorAll('div[data-id]').forEach(d => d.onclick = () => selectTile(d.dataset.id));

		const hint = $('bedHint');
		if (!n) {
			hint.className = 'hint';
			hint.textContent = `the bed holds ${lay.per || 0} of this face${lay.turn ? ' turned' : ''} at a time` +
				(lay.per ? `, ${lay.cols} across × ${lay.rows} deep.` : ' — the face is bigger than the work area.');
		} else if (lay.fits) {
			hint.className = 'hint';
			hint.textContent = `${n} brick${n === 1 ? '' : 's'}${lay.turn ? ', turned a quarter turn' : ''} ` +
				`— the work is ${fmt(lay.used.w)} × ${fmt(lay.used.h)} mm ` +
				`of ${fmt(lay.bed.w)} × ${fmt(lay.bed.h)}, and ${lay.why}. ` +
				`nothing in the file goes outside it. the bed holds ${lay.per}${lay.turn ? ' turned' : ''}.`;
		} else {
			hint.className = 'hint bad';
			hint.textContent = `${n} brick${n === 1 ? '' : 's'} will not fit: ${lay.why}. ` +
				`take some off, or make the joint between them smaller.`;
		}
		$('bedGcode').disabled = !n || !lay.fits || !img;
		$('bedGcode').textContent = n
			? `one gcode for ${n} brick${n === 1 ? '' : 's'}`
			: 'one gcode for these bricks';
	}

	// the whole bed as a single file. the head is walked round the work first,
	// then burns one face at a time; between the faces it jumps, it does not
	// scan — see Gcode.sheet.
	async function exportBed() {
		if (!img) return toast('load a source image first');
		const lay = Bed.layout(project, plan);
		if (!lay.slots.length) return toast('put some bricks on the bed first');
		if (!lay.fits) return toast(lay.why);

		busy(true, 'rasterising…', 0);
		try {
			const out = await Bed.build(project, img, plan, null, {
				onProgress: (i, k, l) => busy(true, `${l} — ${i}/${k}`, k ? i / k : 0)
			});
			const names = out.lay.slots.map(s => s.label);
			const tag = names.length <= 4 ? names.join('+') : `${names[0]}+${names.length - 1}`;
			const safe = project.name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'wall';
			AE.download(new Blob([out.text], { type: 'text/plain' }),
				`${safe}-bed-${tag}.${AE.Gcode.EXT}`);
			Project.note(project, `one file for ${names.length} brick${names.length === 1 ? '' : 's'}: ` +
				`${names.join(' ')} — ${AE.Gcode.clock(out.stats.seconds)} at speed`);
			save(true); updateLog();
			toast(`${names.length} bricks · ${(out.text.length / 1048576).toFixed(1)} MB · ~${AE.Gcode.clock(out.stats.seconds)}`);
		} catch (e) {
			console.error(e);
			toast('that file could not be written: ' + e.message);
		} finally {
			busy(false);
		}
	}

	// ---------------------------------------------------------------
	// readouts
	// ---------------------------------------------------------------
	function updateFoot() {
		if (!plan) return;
		const f = plan.wall.face;
		const dpi = project.laser.dpi;
		const px = { w: Tiling.mmToPx(f.w, dpi), h: Tiling.mmToPx(f.h, dpi) };

		if (view === 'bed') {
			const lay = Bed.layout(project, plan);
			const b = [`work area <b>${fmt(lay.bed.w)} × ${fmt(lay.bed.h)} mm</b> · holds <b>${lay.per}</b> ` +
				`of this face${lay.turn ? ' <b>turned</b>' : ''}`];
			if (lay.slots.length) {
				b.push(`on it <b>${lay.slots.length}</b> · the head keeps to ` +
					`<b class="${lay.fits ? '' : 'bad'}">X${fmt(lay.reach.minX)}–${fmt(lay.reach.maxX)} ` +
					`Y${fmt(lay.reach.minY)}–${fmt(lay.reach.maxY)}</b>` +
					(lay.overscan ? ` · run-up <b>${fmt(lay.overscan)} mm</b>` : ''));
				b.push(`the work <b>${fmt(lay.used.w)} × ${fmt(lay.used.h)} mm</b>`);
				if (!lay.fits) b.push(`<span class="bad">${lay.why}</span>`);
			} else {
				b.push('shift-click a brick on the wall to put it on the bed');
			}
			$('stageFoot').innerHTML = b.map(x => `<span>${x}</span>`).join('');
			return;
		}

		const bits = [
			`wall <b>${fmt(plan.wall.w)} × ${fmt(plan.wall.h)} mm</b> · ${(plan.wall.w / 1000).toFixed(2)} × ${(plan.wall.h / 1000).toFixed(2)} m`,
			`face <b>${fmt(f.w)} × ${fmt(f.h)} mm</b> → ${px.w} × ${px.h} px`,
			`<b>${plan.list.length}</b> bricks`
		];

		if (img) {
			// how much real detail the source has once it is blown up to
			// wall size. asking for 254 dpi off a 90 dpi scan buys nothing
			const eff = plan.win.w / (plan.wall.w / Tiling.MM_PER_INCH);
			const cls = eff < dpi * 0.5 ? 'bad' : eff < dpi ? 'warn' : '';
			bits.push(`source resolves <b class="${cls}">${Math.round(eff)} dpi</b> at this size`);
			const st = plan.win.stretch;
			if (Math.abs(st - 1) > 0.005) {
				bits.push(`<span class="${Math.abs(st - 1) > 0.06 ? 'warn' : ''}">distortion ${st.toFixed(3)}×</span>`);
			}
		}
		$('stageFoot').innerHTML = bits.map(b => `<span>${b}</span>`).join('');
	}

	function updateTally() {
		if (!plan) return;
		const s = Project.stats(project, plan);
		$('tally').innerHTML = Project.STATUSES
			.map(k => `<div class="t-${k}"><span>${k}</span><b>${s[k]}</b></div>`).join('');
		$('progressFill').style.width = s.percent + '%';
		$('progressText').textContent = `${s.engraved}/${s.total} · ${s.percent}%`;
	}

	function updateLog() {
		$('logList').innerHTML = project.log.slice(0, 40).map(e =>
			`<div><time>${e.at.slice(5, 16).replace('T', ' ')}</time>${e.text}</div>`).join('')
			|| '<div>nothing yet.</div>';
	}

	// ---------------------------------------------------------------
	// inspector
	// ---------------------------------------------------------------
	let thumbToken = 0;

	function renderInspector() {
		const body = $('inspBody');
		const t = plan && plan.list.find(x => x.id === selected);
		if (!t) {
			$('inspLabel').textContent = '—';
			body.innerHTML = '<p class="hint">click a brick on the wall.</p>';
			return;
		}
		const r = Project.rec(project, t.id);
		const dpi = project.laser.dpi;
		$('inspLabel').textContent = t.label;

		body.innerHTML = `
			<img id="inspThumb" alt="">
			<div class="chip-row">
				${Project.STATUSES.map(s =>
			`<button class="chip${r.status === s ? ' on' : ''}" data-status="${s}">${s}</button>`).join('')}
			</div>
			<div class="row"><span>course / position</span><b>${t.row + 1} / ${t.col + 1}</b></div>
			<div class="row"><span>face</span><b>${fmt(t.w)} × ${fmt(t.h)} mm</b></div>
			<div class="row"><span>engraved area</span><b>${fmt(t.out.w)} × ${fmt(t.out.h)} mm</b></div>
			<div class="row"><span>raster</span><b>${Tiling.mmToPx(t.out.w, dpi)} × ${Tiling.mmToPx(t.out.h, dpi)} px</b></div>
			<div class="row"><span>marked</span><b>${r.date || '—'}</b></div>
			<label>operator <input type="text" id="inspOperator" value="${(r.operator || '').replace(/"/g, '&quot;')}"></label>
			<label>passes / power <input type="text" id="inspPasses" value="${(r.passes || '').replace(/"/g, '&quot;')}"></label>
			<label>notes <textarea id="inspNotes">${r.notes || ''}</textarea></label>
			<button id="inspBed" class="wide">${onBed(t.id) ? 'take it off the bed' : 'put it on the bed'}</button>
			<button id="inspDownload" class="wide">download this brick</button>
			<p class="hint">keys: e engraved · q queued · f failed · s skipped · p pending · b on the bed · arrows move</p>`;

		body.querySelectorAll('.chip').forEach(c => c.onclick = () => {
			Project.setStatus(project, t.id, c.dataset.status, t.label);
			save(); renderInspector(); updateTally(); updateLog(); renderLedger(); draw();
		});
		const field = (id, key) => {
			const el = $(id);
			el.oninput = () => { Project.rec(project, t.id)[key] = el.value; save(); renderLedger(); };
		};
		field('inspOperator', 'operator');
		field('inspPasses', 'passes');
		field('inspNotes', 'notes');
		$('inspDownload').onclick = () => downloadOne(t);
		$('inspBed').onclick = () => toggleBed(t.id);

		// the thumbnail is cut from the original at full quality, so what it
		// shows is exactly what the file will contain
		const token = ++thumbToken;
		if (img) {
			const w = 360, h = Math.max(1, Math.round(360 * t.out.h / t.out.w));
			const burned = Imaging.stampWord(
				Imaging.process(Imaging.crop(img, t.src, w, h), project.laser),
				t, plan.wall, project.word);
			const shown = view === 'simulation'
				? Imaging.claySimulate(burned, project.sim.polarity, t.row * 7 + t.col * 3 + 3, bodyTone())
				: burned;
			Imaging.toBlob(shown).then(b => {
				if (token !== thumbToken) return;
				const el = $('inspThumb');
				if (el) el.src = URL.createObjectURL(b);
			});
		}
	}

	function selectTile(id) {
		selected = id;
		renderInspector();
		renderLedger();
		draw();
	}

	// ---------------------------------------------------------------
	// ledger
	// ---------------------------------------------------------------
	function ledgerRows() {
		if (!plan) return [];
		const q = $('ledgerSearch').value.trim().toLowerCase();
		const st = $('ledgerStatus').value;
		return plan.list.map(t => ({ t, r: Project.rec(project, t.id) }))
			.filter(({ t, r }) => (!st || (r.status || 'pending') === st))
			.filter(({ t, r }) => !q || t.label.toLowerCase().includes(q)
				|| (r.notes || '').toLowerCase().includes(q)
				|| (r.operator || '').toLowerCase().includes(q));
	}

	const LEDGER_CAP = 600;   // a wall this big is browsed on the canvas, not in a table

	function renderLedger() {
		const all = ledgerRows();
		const rows = all.slice(0, LEDGER_CAP);
		const body = document.querySelector('#ledger tbody');
		body.innerHTML = rows.map(({ t, r }) => `
			<tr data-id="${t.id}" class="${t.id === selected ? 'sel' : ''}">
				<td>${t.label}</td><td>${t.row + 1}</td><td>${t.col + 1}</td>
				<td class="st" data-s="${r.status}">${r.status}</td>
				<td>${r.date || ''}</td><td>${r.operator || ''}</td><td>${r.passes || ''}</td>
				<td class="notes">${(r.notes || '').replace(/</g, '&lt;')}</td>
			</tr>`).join('');
		if (all.length > rows.length) {
			body.insertAdjacentHTML('beforeend',
				`<tr><td colspan="8" class="notes">…and ${all.length - rows.length} more — narrow the filter, or export the csv</td></tr>`);
		}
		body.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => selectTile(tr.dataset.id));
	}

	// ---------------------------------------------------------------
	// export
	// ---------------------------------------------------------------
	async function simulationBlob() {
		// the wall as it should end up, at a size worth keeping
		const s = Math.min(2200 / plan.wall.w, 2200 / plan.wall.h, 4);
		const cv = Imaging.canvas(plan.wall.w * s, plan.wall.h * s);
		const ctx = cv.getContext('2d');
		ctx.fillStyle = darkBody() ? '#5c554f' : '#9c948a';
		ctx.fillRect(0, 0, cv.width, cv.height);
		const pool = clayPool(plan.wall.face.w * s, plan.wall.face.h * s);
		for (const t of plan.list) {
			const dx = t.x * s, dy = t.y * s, dw = t.w * s, dh = t.h * s;
			const pxW = Math.max(2, Math.round(dw)), pxH = Math.max(2, Math.round(dh));
			const sx = t.src.x + (t.out.bleed / t.out.w) * t.src.w;
			const sy = t.src.y + (t.out.bleed / t.out.h) * t.src.h;
			const sw = (t.w / t.out.w) * t.src.w, sh = (t.h / t.out.h) * t.src.h;
			const burned = Imaging.stampWord(
				Imaging.process(Imaging.crop(img, { x: sx, y: sy, w: sw, h: sh }, pxW, pxH), project.laser),
				t, plan.wall, project.word);
			ctx.drawImage(pool[(t.row * 7 + t.col * 3) % pool.length], dx, dy, dw, dh);
			if (project.sim.polarity === 'lighter') {
				ctx.globalAlpha = Imaging.SCAR_ALPHA;
				ctx.drawImage(Imaging.burnLayer(burned), dx, dy, dw, dh);
			} else {
				ctx.globalCompositeOperation = 'multiply';
				ctx.drawImage(burned, dx, dy, dw, dh);
			}
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = 1;
		}
		return Imaging.toBlob(cv);
	}

	function scopeIds() {
		const scope = $('exportScope').value;
		if (scope === 'all') return null;
		if (scope === 'one') return selected ? [selected] : [];
		if (scope === 'bed') return project.bed.ids.slice();
		const want = scope === 'todo'
			? id => (Project.rec(project, id).status !== 'engraved')
			: id => (Project.rec(project, id).status === 'queued');
		return plan.list.filter(t => want(t.id)).map(t => t.id);
	}

	async function exportZip() {
		if (!img) return toast('load a source image first');
		const only = scopeIds();
		if (only && !only.length) return toast('nothing in that selection');

		busy(true, 'rasterising…', 0);
		try {
			const sim = await simulationBlob();
			const res = await Exporter.buildZip(project, img, {
				only, simulation: sim, gcode: $('withGcode').checked,
				onProgress: (i, n, label) => busy(true, `${label} — ${i}/${n}`, n ? i / n : 0)
			});
			AE.download(res.blob, res.filename);
			Project.note(project, `exported ${res.rows.length} brick${res.rows.length === 1 ? '' : 's'}`);
			save(true); updateLog();
			toast(`${res.rows.length} bricks · ${(res.blob.size / 1048576).toFixed(1)} MB`);
		} catch (e) {
			console.error(e);
			toast('export failed: ' + e.message);
		} finally {
			busy(false);
		}
	}

	async function downloadOne(t) {
		if (!img) return toast('load a source image first');
		busy(true, t.label, 0.5);
		try {
			const res = await Exporter.buildZip(project, img, {
				only: [t.id], gcode: $('withGcode').checked
			});
			AE.download(res.blob, `${project.name.replace(/[^\w.-]+/g, '_')}-${t.label}.zip`);
		} finally {
			busy(false);
		}
	}

	function exportCsv() {
		const rows = ledgerRows();
		const head = ['label', 'course', 'position', 'status', 'engraved_at', 'operator', 'passes', 'notes'];
		const cell = v => /[",\n]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? '');
		const csv = [head.join(','), ...rows.map(({ t, r }) => [
			t.label, t.row + 1, t.col + 1, r.status, r.date, r.operator, r.passes, r.notes
		].map(cell).join(','))].join('\n') + '\n';
		AE.download(new Blob([csv], { type: 'text/csv' }),
			`${project.name.replace(/[^\w.-]+/g, '_')}-ledger.csv`);
	}

	// ---------------------------------------------------------------
	// form <-> project
	// ---------------------------------------------------------------
	function fillSelects() {
		$('preset').innerHTML = Object.entries(Tiling.PRESETS)
			.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
		$('face').innerHTML = Object.entries(Tiling.FACES)
			.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
		$('bodyTone').innerHTML = Object.entries(Imaging.BODIES)
			.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
		$('bedArrange').innerHTML = Object.entries(Bed.ARRANGE)
			.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
		$('bedTurn').innerHTML = Object.entries(Bed.TURN)
			.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
		$('ledgerStatus').innerHTML = '<option value="">every status</option>' +
			Project.STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
	}

	function syncForm() {
		const p = project;
		$('preset').value = p.preset;
		$('bLength').value = p.brick.length;
		$('bWidth').value = p.brick.width;
		$('bHeight').value = p.brick.height;
		$('face').value = p.face;
		$('cols').value = p.grid.cols;
		$('rows').value = p.grid.rows;
		$('gapX').value = p.gap.x;
		$('gapY').value = p.gap.y;
		$('fit').value = p.grid.fit;
		$('offsetX').value = Math.round((p.grid.offsetX || 0) * 100);
		$('offsetY').value = Math.round((p.grid.offsetY || 0) * 100);
		$('originRow').value = p.grid.originRow;
		// an imported project may carry a resolution the list does not offer
		const dpiSel = $('dpi');
		if (![...dpiSel.options].some(o => o.value === String(p.laser.dpi))) {
			dpiSel.insertAdjacentHTML('beforeend',
				`<option value="${p.laser.dpi}">${p.laser.dpi} dpi — ${(25.4 / p.laser.dpi).toFixed(2)} mm</option>`);
		}
		dpiSel.value = String(p.laser.dpi);
		$('mode').value = p.laser.mode;
		$('threshold').value = p.laser.threshold;
		$('noise').value = p.laser.noise;
		$('seed').value = p.laser.seed;
		$('brightness').value = p.laser.brightness;
		$('contrast').value = p.laser.contrast;
		$('gamma').value = Math.round(p.laser.gamma * 100);
		$('fires').value = p.laser.invert ? 'light' : 'dark';
		$('inLo').value = p.laser.inLo;
		$('inHi').value = p.laser.inHi;
		$('bleed').value = p.laser.bleed;
		$('gcFeed').value = p.gcode.feed;
		$('gcPower').value = p.gcode.power;
		$('gcLaserMode').value = p.gcode.laserMode;
		$('gcSMax').value = p.gcode.sMax;
		$('gcPasses').value = p.gcode.passes;
		$('gcBidir').checked = !!p.gcode.bidirectional;
		$('gcOverscan').value = p.gcode.overscan;
		$('gcOriginX').value = p.gcode.originX;
		$('gcOriginY').value = p.gcode.originY;
		$('gcAir').checked = !!p.gcode.airAssist;
		$('wordText').value = p.word.text;
		$('wordMode').value = p.word.mode;
		$('wordSize').value = p.word.size;
		$('wordX').value = p.word.x;
		$('wordY').value = p.word.y;
		$('polarity').value = p.sim.polarity;
		$('bodyTone').value = p.sim.body;
		$('bedW').value = p.bed.w;
		$('bedH').value = p.bed.h;
		$('bedArrange').value = p.bed.arrange;
		$('bedTurn').value = p.bed.turn;
		$('bedMargin').value = p.bed.margin;
		$('bedGap').value = p.bed.gap;
		$('bedFrame').checked = !!p.bed.frame;
		syncOutputs();
	}

	function syncOutputs() {
		const p = project;
		$('thresholdV').value = p.laser.threshold;
		$('brightnessV').value = p.laser.brightness;
		$('contrastV').value = p.laser.contrast + '%';
		$('gammaV').value = p.laser.gamma.toFixed(2);
		$('wordSizeV').value = p.word.size + '%';
		$('wordXV').value = p.word.x + '%';
		$('wordYV').value = p.word.y + '%';
		const wg = plan ? Imaging.wordGeom(p.word, plan.wall) : null;
		$('wordHint').textContent = wg
			? `set ${fmt(wg.size)} mm tall, ${p.word.mode === 'burn' ? 'burnt over' : 'cut out of'} the picture` +
			  ` — it runs across the bricks, not inside one.`
			: 'the ware\u2019s name, laid across the whole wall.';
		$('noiseV').value = p.laser.noise + '%';
		// random decides every pixel against the cut, so it wants the cut shown
		const m = p.laser.mode;
		document.querySelectorAll('.thresholdOnly').forEach(el =>
			el.style.display = (m === 'threshold' || m === 'random') ? '' : 'none');
		document.querySelectorAll('.noiseOnly').forEach(el =>
			el.style.display = (m === 'random' || m === 'scatter') ? '' : 'none');
		$('noiseHint').textContent = m === 'random'
			? 'every pixel decided on its own against a cut that wanders — grain and no pattern at all, ' +
			'and the heaviest file of the five since the power changes constantly along a scanline.'
			: 'the weave broken up. the error is still carried forward, so the tone stays exactly as ' +
			'honest as plain dither. at grain 0% this is plain dither, and random is a bare threshold.';

		// how much of the available bleach the picture actually asks for.
		// a plate left unfitted can sit at a few percent and read as a haze,
		// which is worth saying out loud rather than leaving to be noticed
		// on the brick.
		// asked of the picture's own brightest tone, not of the curve: a
		// curve always reaches full power at 255, but a plate that never
		// gets near 255 never asks for it
		if (!img) {
			$('rangeHint').textContent = 'the range fits itself to a picture the moment one is loaded.';
		} else {
			if (!srcStats) srcStats = Imaging.autoRange(img);
			const lut = Imaging.buildLUT(p.laser);
			const reach = Math.round(100 * (255 - lut[p.laser.invert ? srcStats.max : srcStats.min]) / 255);
			$('rangeHint').textContent =
				`the plate itself runs ${srcStats.min}–${srcStats.max}; read between ${p.laser.inLo} and ${p.laser.inHi}. ` +
				`its strongest tone asks for ${reach}% of the bleach` +
				(reach < 70 ? ' — fit the range, or it burns as a haze.' : '.');
		}
		const f = Tiling.faceSize(p.brick, p.face);
		$('faceHint').textContent = `each engraving is ${fmt(f.w)} × ${fmt(f.h)} mm`;

		const g = p.gcode;
		const note = [`S${Math.round(g.sMax * g.power / 100)} where it burns, ` +
			`${(25.4 / p.laser.dpi).toFixed(3)} mm between lines.`];
		// M3 holds the commanded power through acceleration, so the head has to
		// already be at speed when it meets the first lit pixel. the run-up is
		// v²/2a — a nominal 1000 mm/s², since the desk cannot read $120.
		const runUp = Math.pow(g.feed / 60, 2) / 2000;
		if (g.laserMode === 'M3' && g.overscan < runUp * 0.8) {
			note.push(`at ${g.feed} mm/min M3 wants about ${runUp.toFixed(1)} mm of overscan, ` +
				`or the start of every row burns deeper than the rest. M4 does not.`);
		}
		// a raster .gc is one move per change of power, and dithered art
		// changes about every other pixel — measured at 0.5 moves/px over two
		// resolutions, ~10.5 bytes a move. grayscale changes nearly every
		// pixel. it adds up faster than anyone expects, and the zip writer
		// stores without compressing, so say so before the browser finds out.
		const px = Tiling.mmToPx(f.w + 2 * (p.laser.bleed || 0), p.laser.dpi) *
			Tiling.mmToPx(f.h + 2 * (p.laser.bleed || 0), p.laser.dpi);
		const perBrick = px * (MOVES_PER_PX[p.laser.mode] == null ? 0.5 : MOVES_PER_PX[p.laser.mode]) * 10.5;
		const wall = perBrick * p.grid.cols * p.grid.rows;
		const size = b => b > 1e9 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(0) + ' MB';
		note.push(`roughly ${size(perBrick)} of gcode a brick, ${size(wall)} for the wall${p.laser.mode === 'grayscale' ? ' — grayscale shifts power almost every pixel; dither is far smaller' : ''}.`);
		if (wall > 3e8) note.push('export in batches with the scope selector, or untick gcode.');
		$('gcHint').textContent = note.join(' ');
		$('imgHint').textContent = p.image
			? `${p.image.name} — ${img ? img.width + ' × ' + img.height + ' px' : 'loading…'}`
			: 'no image loaded';
	}

	// read every control back into the project, then redraw
	function readForm() {
		const p = project;
		p.preset = $('preset').value;
		p.brick.length = Math.max(1, num($('bLength').value, p.brick.length));
		p.brick.width = Math.max(1, num($('bWidth').value, p.brick.width));
		p.brick.height = Math.max(1, num($('bHeight').value, p.brick.height));
		p.face = $('face').value;
		p.grid.cols = Math.min(200, Math.max(1, Math.round(num($('cols').value, p.grid.cols))));
		p.grid.rows = Math.min(200, Math.max(1, Math.round(num($('rows').value, p.grid.rows))));
		p.gap.x = Math.max(0, num($('gapX').value, p.gap.x));
		p.gap.y = Math.max(0, num($('gapY').value, p.gap.y));
		p.grid.fit = $('fit').value;
		p.grid.offsetX = num($('offsetX').value, 0) / 100;
		p.grid.offsetY = num($('offsetY').value, 0) / 100;
		p.grid.originRow = $('originRow').value;
		p.laser.dpi = Math.round(num($('dpi').value, p.laser.dpi));
		p.laser.mode = $('mode').value;
		p.laser.threshold = Math.round(num($('threshold').value, p.laser.threshold));
		p.laser.noise = Math.min(100, Math.max(0, Math.round(num($('noise').value, p.laser.noise))));
		p.laser.seed = Math.min(99999, Math.max(1, Math.round(num($('seed').value, p.laser.seed))));
		p.laser.brightness = Math.round(num($('brightness').value, p.laser.brightness));
		p.laser.contrast = Math.round(num($('contrast').value, p.laser.contrast));
		p.laser.gamma = num($('gamma').value, p.laser.gamma * 100) / 100;
		p.laser.invert = $('fires').value === 'light';
		p.laser.inLo = Math.min(254, Math.max(0, Math.round(num($('inLo').value, p.laser.inLo))));
		p.laser.inHi = Math.min(255, Math.max(p.laser.inLo + 1, Math.round(num($('inHi').value, p.laser.inHi))));
		p.laser.bleed = Math.max(0, num($('bleed').value, 0));
		p.gcode.feed = Math.max(1, Math.round(num($('gcFeed').value, p.gcode.feed)));
		p.gcode.power = Math.min(100, Math.max(0, num($('gcPower').value, p.gcode.power)));
		p.gcode.laserMode = $('gcLaserMode').value;
		p.gcode.sMax = Math.max(1, Math.round(num($('gcSMax').value, p.gcode.sMax)));
		p.gcode.passes = Math.min(20, Math.max(1, Math.round(num($('gcPasses').value, p.gcode.passes))));
		p.gcode.bidirectional = $('gcBidir').checked;
		p.gcode.overscan = Math.max(0, num($('gcOverscan').value, p.gcode.overscan));
		p.gcode.originX = num($('gcOriginX').value, p.gcode.originX);
		p.gcode.originY = num($('gcOriginY').value, p.gcode.originY);
		p.gcode.airAssist = $('gcAir').checked;
		p.word.text = $('wordText').value;
		p.word.mode = $('wordMode').value;
		p.word.size = num($('wordSize').value, p.word.size);
		p.word.x = num($('wordX').value, p.word.x);
		p.word.y = num($('wordY').value, p.word.y);
		p.sim.polarity = $('polarity').value;
		p.sim.body = $('bodyTone').value;
		p.bed.w = Math.max(20, num($('bedW').value, p.bed.w));
		p.bed.h = Math.max(20, num($('bedH').value, p.bed.h));
		p.bed.arrange = $('bedArrange').value;
		p.bed.turn = $('bedTurn').value;
		p.bed.margin = Math.max(0, num($('bedMargin').value, p.bed.margin));
		p.bed.gap = Math.max(0, num($('bedGap').value, p.bed.gap));
		p.bed.frame = $('bedFrame').checked;
		syncOutputs();
		save();
		refresh();
	}

	// ---------------------------------------------------------------
	// the loop
	// ---------------------------------------------------------------
	function refresh() {
		if (!project) return;
		// with no image there is still a wall to lay out; a 1×1 stand-in
		// keeps the geometry honest until a picture arrives
		plan = Tiling.tiles(project, img || { width: 1, height: 1 });
		Project.prune(project, plan);
		// a brick taken off the wall cannot be on the machine
		const live = new Set(plan.list.map(t => t.id));
		if (project.bed.ids.some(id => !live.has(id))) {
			project.bed.ids = project.bed.ids.filter(id => live.has(id));
		}
		syncOutputs();
		if (selected && !plan.list.some(t => t.id === selected)) selected = null;
		updateFoot();
		updateTally();
		renderLedger();
		renderInspector();
		renderBed();
		draw();
	}

	// ---------------------------------------------------------------
	// projects
	// ---------------------------------------------------------------
	async function refreshProjectList() {
		const all = await Project.list();
		$('projectSel').innerHTML = all
			.map(p => `<option value="${p.id}">${p.name.replace(/</g, '&lt;')}</option>`).join('');
		if (project) $('projectSel').value = project.id;
	}

	async function openProject(p) {
		project = p;
		selected = null;
		img = null;
		cache.k = 0; cache.sig = ''; cache.src = null;
		localStorage.setItem(LAST, p.id);
		fillSelects();
		syncForm();
		updateLog();
		refresh();
		await refreshProjectList();
		if (p.image && p.image.blob) {
			try {
				img = await decode(p.image.blob);
			} catch (e) {
				toast('the stored image could not be read');
			}
			syncOutputs();
			refresh();
		}
	}

	async function newProject(name) {
		const p = Project.blank(name || prompt('name this wall', 'bremen wall') || 'untitled wall');
		Project.note(p, 'project created');
		await Project.save(p);
		await openProject(p);
		toast('new project');
	}

	// ---------------------------------------------------------------
	// wiring
	// ---------------------------------------------------------------
	function bind() {
		const controls = ['preset', 'bLength', 'bWidth', 'bHeight', 'face', 'cols', 'rows',
			'gapX', 'gapY', 'fit', 'offsetX', 'offsetY', 'originRow', 'dpi', 'mode',
			'threshold', 'noise', 'seed', 'brightness', 'contrast', 'gamma', 'fires',
			'inLo', 'inHi', 'bleed', 'polarity', 'bodyTone',
			'wordText', 'wordMode', 'wordSize', 'wordX', 'wordY',
			'gcFeed', 'gcPower', 'gcLaserMode', 'gcSMax', 'gcPasses', 'gcBidir',
			'gcOverscan', 'gcOriginX', 'gcOriginY', 'gcAir',
			'bedW', 'bedH', 'bedArrange', 'bedTurn', 'bedMargin', 'bedGap', 'bedFrame'];
		controls.forEach(id => {
			const el = $(id);
			el.addEventListener('input', () => {
				// choosing a named format fills the three boxes for you
				if (id === 'preset') {
					const d = Tiling.PRESETS[el.value];
					if (d && el.value !== 'custom') {
						$('bLength').value = d.length; $('bWidth').value = d.width; $('bHeight').value = d.height;
					}
				} else if (['bLength', 'bWidth', 'bHeight'].includes(id)) {
					$('preset').value = 'custom';
				}
				readForm();
			});
		});

		$('fitRows').onclick = () => {
			if (!img) return toast('load a source image first');
			$('rows').value = Tiling.rowsForAspect(project, img.width / img.height);
			readForm();
			toast(`${project.grid.rows} courses — distortion ${plan.win.stretch.toFixed(3)}×`);
		};

		$('fitRange').onclick = () => fitRange(false);

		// a different grain from the same picture. the seed is saved with the
		// project, so the one you settle on is the one that gets cut.
		$('reseed').onclick = () => {
			project.laser.seed = 1 + Math.floor(Math.random() * 99999);
			syncForm(); save(true); refresh();
			toast('seed ' + project.laser.seed);
		};

		// the bed
		$('bedAdd').onclick = () => {
			if (!selected) return toast('click a brick first');
			if (onBed(selected)) return toast('it is already on the bed');
			toggleBed(selected);
		};
		$('bedQueued').onclick = () => {
			const ids = plan.list.filter(t => Project.rec(project, t.id).status === 'queued').map(t => t.id);
			if (!ids.length) return toast('nothing is queued');
			setBed(ids, `the bed: ${ids.length} queued brick${ids.length === 1 ? '' : 's'}`);
			toast(`${ids.length} on the bed`);
		};
		$('bedClear').onclick = () => setBed([]);
		$('bedGcode').onclick = exportBed;

		$('resetLaser').onclick = () => {
			const d = Project.blank().laser;
			Object.assign(project.laser, {
				brightness: d.brightness, contrast: d.contrast, gamma: d.gamma,
				invert: d.invert, threshold: d.threshold
			});
			fitRange(true);
			syncForm(); readForm();
		};

		// views
		$('views').addEventListener('click', e => {
			const b = e.target.closest('button');
			if (!b) return;
			view = b.dataset.view;
			$('views').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
			draw();
			updateFoot();
			renderInspector();
		});
		$('showLabels').onchange = draw;
		$('showGrid').onchange = draw;

		// source image
		$('pickFile').onclick = () => $('file').click();
		$('file').onchange = e => e.target.files[0] && useBlob(e.target.files[0], e.target.files[0].name);
		const drop = $('drop');
		['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
			e.preventDefault(); drop.classList.add('over');
		}));
		['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
			e.preventDefault(); drop.classList.remove('over');
		}));
		drop.addEventListener('drop', e => {
			const f = e.dataTransfer.files[0];
			if (f && f.type.startsWith('image/')) useBlob(f, f.name);
		});

		// the wall. a plain click reads a brick; shift — or cmd, for the hand
		// that expects it — puts it on the machine, or takes it off again, so
		// a bedful is picked out by running along a course with shift down.
		$('stage').addEventListener('click', e => {
			const t = tileAt(e.clientX, e.clientY);
			if (!t) return;
			if (e.shiftKey || e.metaKey || e.ctrlKey) {
				selected = t.id;
				toggleBed(t.id);
				renderLedger();
			} else {
				selectTile(t.id);
			}
		});
		// double click walks a brick straight to engraved and back
		$('stage').addEventListener('dblclick', e => {
			const t = tileAt(e.clientX, e.clientY);
			if (!t) return;
			const r = Project.rec(project, t.id);
			Project.setStatus(project, t.id, r.status === 'engraved' ? 'pending' : 'engraved', t.label);
			save(); selectTile(t.id); updateTally(); updateLog();
		});

		// keyboard, once a brick is selected
		addEventListener('keydown', e => {
			if (!selected || !plan) return;
			if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
			if (e.key === 'b') { toggleBed(selected); e.preventDefault(); return; }
			const map = { e: 'engraved', q: 'queued', f: 'failed', s: 'skipped', p: 'pending' };
			if (map[e.key]) {
				const t = plan.list.find(x => x.id === selected);
				Project.setStatus(project, selected, map[e.key], t.label);
				save(); renderInspector(); updateTally(); updateLog(); renderLedger(); draw();
				e.preventDefault();
				return;
			}
			const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[e.key];
			if (!d) return;
			const cur = plan.list.find(x => x.id === selected);
			const next = plan.list.find(x => x.row === cur.row + d[0] && x.col === cur.col + d[1]);
			if (next) { selectTile(next.id); e.preventDefault(); }
		});

		// bulk
		document.querySelectorAll('[data-bulk]').forEach(b => b.onclick = () => {
			const s = b.dataset.bulk;
			if (!confirm(`set all ${plan.list.length} bricks to ${s}?`)) return;
			for (const t of plan.list) Project.rec(project, t.id).status = s;
			if (s === 'pending') for (const t of plan.list) Project.rec(project, t.id).date = '';
			Project.note(project, `all bricks → ${s}`);
			save(); refresh(); updateLog();
		});

		// ledger
		$('ledgerSearch').oninput = renderLedger;
		$('ledgerStatus').onchange = renderLedger;
		$('exportCsv').onclick = exportCsv;
		$('exportBtn').onclick = exportZip;

		// projects
		$('projectSel').onchange = async e => {
			const p = await Project.load(e.target.value);
			if (p) openProject(p);
		};
		$('newProj').onclick = () => newProject();
		$('renameProj').onclick = async () => {
			const n = prompt('rename', project.name);
			if (!n) return;
			project.name = n;
			await Project.save(project);
			refreshProjectList();
		};
		$('dupProj').onclick = async () => {
			const copy = Project.migrate(JSON.parse(JSON.stringify({ ...project, image: null })));
			copy.id = Project.blank().id;
			copy.name = project.name + ' (copy)';
			copy.image = project.image;   // the blob is shared by reference, then cloned on save
			Project.note(copy, 'copied from ' + project.name);
			await Project.save(copy);
			await openProject(copy);
		};
		$('delProj').onclick = async () => {
			if (!confirm(`delete "${project.name}" and its record? this cannot be undone.`)) return;
			await Project.remove(project.id);
			const all = await Project.list();
			if (all.length) openProject(await Project.load(all[0].id));
			else newProject('untitled wall');
		};

		// backup
		$('exportJson').onclick = async () => {
			const text = await Project.toJSON(project);
			AE.download(new Blob([text], { type: 'application/json' }),
				`${project.name.replace(/[^\w.-]+/g, '_')}.json`);
		};
		$('importJson').onclick = () => $('jsonFile').click();
		$('jsonFile').onchange = async e => {
			const f = e.target.files[0];
			if (!f) return;
			try {
				const p = await Project.fromJSON(await f.text());
				await Project.save(p);
				await openProject(p);
				toast('imported');
			} catch (err) {
				toast('that file could not be read as a project');
			}
			e.target.value = '';
		};

		let resizeTimer;
		addEventListener('resize', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(draw, 120);
		});
		addEventListener('beforeunload', () => save(true));
	}

	// ---------------------------------------------------------------
	async function start() {
		fillSelects();
		buildBundled();
		bind();
		const all = await Project.list();
		const last = localStorage.getItem(LAST);
		if (all.length) {
			const pick = all.find(p => p.id === last) || all[0];
			await openProject(await Project.load(pick.id));
		} else {
			const p = Project.blank('bremen wall');
			Project.note(p, 'project created');
			await Project.save(p);
			await openProject(p);
		}
	}

	start().catch(e => {
		console.error(e);
		document.body.insertAdjacentHTML('afterbegin',
			`<p style="padding:14px;color:#c0563e">the desk could not start: ${e.message}</p>`);
	});
})();

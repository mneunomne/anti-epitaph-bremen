// the desk itself: settings on the left, the wall in the middle, the
// record on the right, the ledger underneath. everything saves itself.
(function () {
	const AE = window.AE;
	const { Tiling, Imaging, Project, Exporter } = AE;

	const $ = id => document.getElementById(id);
	const LAST = 'ae.lastProject';

	let project = null;      // the record being worked on
	let img = null;          // the source, full size, as an <img> or canvas
	let plan = null;         // tiles for the current settings
	let selected = null;     // tile id
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
		project.image = { name: name || blob.name || 'image', type: blob.type, blob };
		cache.k = 0; cache.sig = '';
		Project.note(project, 'source image: ' + project.image.name);
		save();
		refresh();
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

	function laserSig() {
		const l = project.laser;
		return [l.mode, l.brightness, l.contrast, l.gamma, l.invert, l.threshold, cache.k].join('|');
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
			// the pale-burn simulation needs the negative of the same pass
			const inv = Imaging.canvas(cache.laser.width, cache.laser.height);
			const ix = inv.getContext('2d');
			ix.filter = 'invert(1)';
			ix.drawImage(cache.laser, 0, 0);
			cache.inverted = inv;
		}
	}

	// a handful of clay faces, reused around the wall — a unique texture
	// per brick is thousands of canvases and reads no differently
	function clayPool(w, h) {
		const key = Math.round(w) + 'x' + Math.round(h);
		if (cache.claySize !== key) {
			cache.claySize = key;
			cache.clay = Array.from({ length: 10 }, (_, i) =>
				Imaging.clayTexture(Math.max(2, w), Math.max(2, h), i + 3));
		}
		return cache.clay;
	}

	let layout = null;   // px-per-mm and origin of the last draw, for hit testing

	function draw() {
		const cv = $('stage'), ctx = cv.getContext('2d');
		if (!plan) return;

		const wrap = $('canvasWrap');
		const availW = Math.max(240, wrap.clientWidth - 36);
		const availH = Math.max(200, wrap.clientHeight - 36);
		const dpr = Math.min(devicePixelRatio || 1, 2);

		let s = Math.min(availW / plan.wall.w, availH / plan.wall.h);
		const cssW = plan.wall.w * s, cssH = plan.wall.h * s;
		cv.style.width = cssW + 'px';
		cv.style.height = cssH + 'px';
		cv.width = Math.round(cssW * dpr);
		cv.height = Math.round(cssH * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		layout = { s };

		// mortar
		ctx.fillStyle = view === 'source' ? '#2a2724' : '#9c948a';
		ctx.fillRect(0, 0, cssW, cssH);

		if (!img) {
			ctx.fillStyle = '#5a544d';
			ctx.font = '13px monospace';
			ctx.textAlign = 'center';
			ctx.fillText('load a source image', cssW / 2, cssH / 2);
			return;
		}

		ensurePreview(s * dpr);
		const k = cache.k;
		const base = view === 'source' ? cache.src
			: view === 'laser' ? cache.laser
				: project.sim.polarity === 'lighter' ? cache.inverted : cache.laser;
		const pool = clayPool(plan.wall.face.w * s * dpr, plan.wall.face.h * s * dpr);
		const labels = $('showLabels').checked;
		const joints = $('showGrid').checked;

		for (const t of plan.list) {
			const dx = t.x * s, dy = t.y * s, dw = t.w * s, dh = t.h * s;
			// the crop without bleed: on screen a brick shows its own face
			const sx = t.src.x + (t.out.bleed / t.out.w) * t.src.w;
			const sy = t.src.y + (t.out.bleed / t.out.h) * t.src.h;
			const sw = (t.w / t.out.w) * t.src.w, sh = (t.h / t.out.h) * t.src.h;

			if (view === 'simulation' || view === 'status') {
				ctx.drawImage(pool[(t.row * 7 + t.col * 3) % pool.length], dx, dy, dw, dh);
				ctx.globalCompositeOperation = project.sim.polarity === 'lighter' ? 'screen' : 'multiply';
				ctx.globalAlpha = project.sim.polarity === 'lighter' ? 0.85 : 1;
				ctx.drawImage(base, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh);
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = 1;
			} else {
				ctx.fillStyle = '#fff';
				ctx.fillRect(dx, dy, dw, dh);
				ctx.drawImage(base, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh);
			}

			if (view === 'status') {
				const st = (project.tiles[t.id] || {}).status || 'pending';
				ctx.fillStyle = STATUS_COLOR[st];
				ctx.globalAlpha = st === 'pending' ? 0.35 : 0.72;
				ctx.fillRect(dx, dy, dw, dh);
				ctx.globalAlpha = 1;
			}

			if (joints) {
				ctx.strokeStyle = 'rgba(0,0,0,0.35)';
				ctx.lineWidth = 1;
				ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
			}

			if (labels && dw > 30 && dh > 11) {
				const size = Math.min(dh * 0.42, dw * 0.19, 15);
				ctx.font = `${size}px ui-monospace, monospace`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = 'rgba(0,0,0,0.55)';
				ctx.fillText(t.label, dx + dw / 2 + 1, dy + dh / 2 + 1);
				ctx.fillStyle = 'rgba(255,255,255,0.92)';
				ctx.fillText(t.label, dx + dw / 2, dy + dh / 2);
			}

			if (t.id === selected) {
				ctx.strokeStyle = '#e08a4e';
				ctx.lineWidth = 2;
				ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
			}
		}
	}

	function tileAt(clientX, clientY) {
		const cv = $('stage'), r = cv.getBoundingClientRect();
		if (!layout || !plan) return null;
		const mx = (clientX - r.left) / layout.s, my = (clientY - r.top) / layout.s;
		return plan.list.find(t => mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) || null;
	}

	// ---------------------------------------------------------------
	// readouts
	// ---------------------------------------------------------------
	function updateFoot() {
		if (!plan) return;
		const f = plan.wall.face;
		const dpi = project.laser.dpi;
		const px = { w: Tiling.mmToPx(f.w, dpi), h: Tiling.mmToPx(f.h, dpi) };
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
			<button id="inspDownload" class="wide">download this brick</button>
			<p class="hint">keys: e engraved · q queued · f failed · s skipped · p pending · arrows move</p>`;

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

		// the thumbnail is cut from the original at full quality, so what it
		// shows is exactly what the file will contain
		const token = ++thumbToken;
		if (img) {
			const w = 360, h = Math.max(1, Math.round(360 * t.out.h / t.out.w));
			const burned = Imaging.process(Imaging.crop(img, t.src, w, h), project.laser);
			const shown = view === 'simulation'
				? Imaging.claySimulate(burned, project.sim.polarity, t.row * 7 + t.col * 3 + 3)
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
		ctx.fillStyle = '#9c948a';
		ctx.fillRect(0, 0, cv.width, cv.height);
		const pool = clayPool(plan.wall.face.w * s, plan.wall.face.h * s);
		for (const t of plan.list) {
			const dx = t.x * s, dy = t.y * s, dw = t.w * s, dh = t.h * s;
			const pxW = Math.max(2, Math.round(dw)), pxH = Math.max(2, Math.round(dh));
			const sx = t.src.x + (t.out.bleed / t.out.w) * t.src.w;
			const sy = t.src.y + (t.out.bleed / t.out.h) * t.src.h;
			const sw = (t.w / t.out.w) * t.src.w, sh = (t.h / t.out.h) * t.src.h;
			const burned = Imaging.process(Imaging.crop(img, { x: sx, y: sy, w: sw, h: sh }, pxW, pxH), project.laser);
			ctx.drawImage(pool[(t.row * 7 + t.col * 3) % pool.length], dx, dy, dw, dh);
			ctx.globalCompositeOperation = project.sim.polarity === 'lighter' ? 'screen' : 'multiply';
			ctx.globalAlpha = project.sim.polarity === 'lighter' ? 0.85 : 1;
			if (project.sim.polarity === 'lighter') {
				const inv = Imaging.canvas(pxW, pxH);
				const ix = inv.getContext('2d');
				ix.filter = 'invert(1)';
				ix.drawImage(burned, 0, 0);
				ctx.drawImage(inv, dx, dy, dw, dh);
			} else {
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
		$('brightness').value = p.laser.brightness;
		$('contrast').value = p.laser.contrast;
		$('gamma').value = Math.round(p.laser.gamma * 100);
		$('invert').checked = !!p.laser.invert;
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
		$('polarity').value = p.sim.polarity;
		syncOutputs();
	}

	function syncOutputs() {
		const p = project;
		$('thresholdV').value = p.laser.threshold;
		$('brightnessV').value = p.laser.brightness;
		$('contrastV').value = p.laser.contrast + '%';
		$('gammaV').value = p.laser.gamma.toFixed(2);
		document.querySelectorAll('.thresholdOnly').forEach(el =>
			el.style.display = p.laser.mode === 'threshold' ? '' : 'none');
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
		const perBrick = px * (p.laser.mode === 'grayscale' ? 1 : p.laser.mode === 'threshold' ? 0.2 : 0.5) * 10.5;
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
		p.laser.brightness = Math.round(num($('brightness').value, p.laser.brightness));
		p.laser.contrast = Math.round(num($('contrast').value, p.laser.contrast));
		p.laser.gamma = num($('gamma').value, p.laser.gamma * 100) / 100;
		p.laser.invert = $('invert').checked;
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
		p.sim.polarity = $('polarity').value;
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
		syncOutputs();
		if (selected && !plan.list.some(t => t.id === selected)) selected = null;
		updateFoot();
		updateTally();
		renderLedger();
		renderInspector();
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
			'threshold', 'brightness', 'contrast', 'gamma', 'invert', 'bleed', 'polarity',
			'gcFeed', 'gcPower', 'gcLaserMode', 'gcSMax', 'gcPasses', 'gcBidir',
			'gcOverscan', 'gcOriginX', 'gcOriginY', 'gcAir'];
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

		$('resetLaser').onclick = () => {
			Object.assign(project.laser, {
				brightness: 0, contrast: 120, gamma: 1, invert: false, threshold: 128
			});
			syncForm(); readForm();
		};

		// views
		$('views').addEventListener('click', e => {
			const b = e.target.closest('button');
			if (!b) return;
			view = b.dataset.view;
			$('views').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
			draw();
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

		// the wall
		$('stage').addEventListener('click', e => {
			const t = tileAt(e.clientX, e.clientY);
			if (t) selectTile(t.id);
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

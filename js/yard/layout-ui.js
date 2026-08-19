// the pallet plan.
//
// three pallets, three pictures, and however many blank bricks there are.
// the field on screen is the field on the floor at 1:1 in millimetres, so
// what is drawn here is what has to be carried there.
(function () {
	const AE = window.AE;
	const { Plan, Pack, Imaging, YardExport } = AE;
	const $ = id => document.getElementById(id);

	let plan = null;
	let imgs = [];              // decoded, index-parallel to plan.images
	let res = null;             // the built field
	let view = 'simulation';
	let selected = null;        // position id
	let layout = null;          // px-per-mm of the last draw, for hit testing
	const cache = {};           // per image: resampled source and its burn

	const num = (v, fb) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fb);
	const mm = v => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

	function toast(msg) {
		const t = $('toast');
		t.textContent = msg;
		t.classList.add('show');
		clearTimeout(toast.t);
		toast.t = setTimeout(() => t.classList.remove('show'), 2400);
	}

	function busy(on, text, frac) {
		$('busy').hidden = !on;
		if (text) $('busyText').textContent = text;
		$('busyFill').style.width = Math.round((frac || 0) * 100) + '%';
	}

	let saveT = null;
	function save(now) {
		clearTimeout(saveT);
		const go = () => plan && Plan.save(plan);
		if (now) go(); else saveT = setTimeout(go, 400);
	}

	// ---------------------------------------------------------------
	// sources
	// ---------------------------------------------------------------
	function decode(blob) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(blob);
			const im = new Image();
			im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
			im.onerror = e => { URL.revokeObjectURL(url); reject(e); };
			im.src = url;
		});
	}

	async function loadImages() {
		imgs = [];
		for (let i = 0; i < plan.images.length; i++) {
			const s = plan.images[i];
			if (!s.blob) { imgs.push(null); continue; }
			try {
				const im = await decode(s.blob);
				im.opt = s;              // fit, offsets and zoom stay live
				imgs.push(im);
			} catch (e) { imgs.push(null); }
		}
		Object.keys(cache).forEach(k => delete cache[k]);
	}

	async function useBlob(i, blob, name) {
		plan.images[i] = Object.assign(plan.images[i] || Plan.slot(), {
			blob, name: name || blob.name || 'image', type: blob.type
		});
		const im = await decode(blob);
		im.opt = plan.images[i];
		imgs[i] = im;
		delete cache[i];
		Plan.note(plan, `image ${i + 1} — ${plan.images[i].name}`);
		save(true);
		rebuild();
		renderSlots();
	}

	// ---------------------------------------------------------------
	// the field
	// ---------------------------------------------------------------
	function rebuild() {
		imgs.forEach((im, i) => { if (im) im.opt = plan.images[i]; });
		res = Plan.build(plan, imgs);
		draw();
		updateFoot();
		renderLedger();
		renderInspector();
		renderTally();
		renderHoles();
		renderLog();
	}

	const STATUS_COLOR = {
		pending: '#6d665e', queued: '#d4a13c', engraved: '#7fa86a',
		failed: '#c0563e', skipped: '#4f4b47'
	};

	function laserSig(i) {
		const l = plan.laser;
		return [i, l.mode, l.brightness, l.contrast, l.gamma, l.invert, l.threshold,
			l.noise, l.seed, (cache[i] || {}).k].join('|');
	}

	// one resample and one levels pass per image, not per brick. the
	// factor follows how big the field is drawn, so zooming the browser
	// does not leave the preview soft.
	function ensurePreview(i, pxPerMM) {
		const img = imgs[i];
		if (!img) return null;
		const c = cache[i] = cache[i] || {};
		const pl = res.placed.find(p => p.image === i && p.win);
		let k = pl ? (pl.region.w * pxPerMM) / pl.win.w : 1;
		k = Math.min(1, k, 2400 / Math.max(img.width, img.height));

		if (!c.src || Math.abs(k - c.k) / (c.k || 1) > 0.08) {
			c.k = k;
			c.src = Imaging.fitCanvas(img, Math.max(img.width, img.height) * k);
			c.sig = '';
		}
		const sig = laserSig(i);
		if (sig !== c.sig) {
			c.sig = sig;
			c.laser = Imaging.process(c.src, plan.laser);
			const inv = Imaging.canvas(c.laser.width, c.laser.height);
			const ix = inv.getContext('2d');
			ix.filter = 'invert(1)';
			ix.drawImage(c.laser, 0, 0);
			c.inverted = inv;
		}
		return c;
	}

	// a handful of clay faces, reused around the field — a unique texture
	// per brick is a hundred canvases and reads no differently
	function clayPool() {
		// 'red' pins the pallets desk to the old pale terracotta body — the
		// engraving desk moved to the dark stock we actually cut on, and the
		// two should not drift apart by accident
		if (!clayPool.list) clayPool.list = Array.from({ length: 8 }, (_, i) => Imaging.clayTexture(240, 120, i + 3, 'red'));
		return clayPool.list;
	}

	function renderField(ctx, s, opt) {
		const showCodes = opt.codes, showDeck = opt.deck, dpr = opt.dpr || 1;
		ctx.fillStyle = view === 'source' ? '#2a2724' : '#151312';
		ctx.fillRect(0, 0, res.geom.w * s, res.geom.h * s);

		// the pallets themselves
		for (const p of res.geom.pallets) {
			ctx.fillStyle = '#7d7263';
			ctx.fillRect(p.x * s, p.y * s, p.w * s, p.h * s);
			if (showDeck) {
				ctx.fillStyle = '#a2917a';
				for (const b of Pack.deckBoards(p)) ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
			}
			ctx.strokeStyle = 'rgba(0,0,0,.5)';
			ctx.lineWidth = 1;
			ctx.strokeRect(p.x * s + .5, p.y * s + .5, p.w * s - 1, p.h * s - 1);
			ctx.fillStyle = 'rgba(0,0,0,.35)';
			ctx.font = `${Math.max(11, 26 * s)}px ui-monospace, monospace`;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'top';
			ctx.fillText(p.key, p.x * s + 6, p.y * s + 5);
		}

		// positions deliberately left bare, so a hole reads as a decision
		ctx.setLineDash([5, 4]);
		ctx.strokeStyle = 'rgba(255,255,255,.28)';
		for (const h of res.holes) ctx.strokeRect(h.x * s, h.y * s, h.w * s, h.h * s);
		ctx.setLineDash([]);

		const previews = {};
		for (const i of new Set(res.placed.map(p => p.image))) {
			if (i != null) previews[i] = ensurePreview(i, s * dpr);
		}
		const pool = clayPool();

		res.placed.forEach((pl, idx) => {
			const dx = pl.x * s, dy = pl.y * s, dw = pl.w * s, dh = pl.h * s;
			const c = previews[pl.image];
			const base = !c ? null
				: view === 'source' ? c.src
					: view === 'laser' ? c.laser
						: plan.sim.polarity === 'lighter' ? c.inverted : c.laser;

			// the crop the brick actually shows: its own face, bleed excluded
			let sx = 0, sy = 0, sw = 0, sh = 0;
			if (pl.src) {
				const b = pl.out.bleed;
				sx = pl.src.x + (b / pl.out.w) * pl.src.w;
				sy = pl.src.y + (b / pl.out.h) * pl.src.h;
				sw = (pl.w / pl.out.w) * pl.src.w;
				sh = (pl.h / pl.out.h) * pl.src.h;
			}

			if (view === 'plan' || !base) {
				ctx.drawImage(pool[idx % pool.length], dx, dy, dw, dh);
			} else if (view === 'simulation' || view === 'status') {
				ctx.drawImage(pool[idx % pool.length], dx, dy, dw, dh);
				ctx.globalCompositeOperation = plan.sim.polarity === 'lighter' ? 'screen' : 'multiply';
				ctx.globalAlpha = plan.sim.polarity === 'lighter' ? .85 : 1;
				ctx.drawImage(base, sx * c.k, sy * c.k, sw * c.k, sh * c.k, dx, dy, dw, dh);
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = 1;
			} else {
				ctx.fillStyle = '#fff';
				ctx.fillRect(dx, dy, dw, dh);
				ctx.drawImage(base, sx * c.k, sy * c.k, sw * c.k, sh * c.k, dx, dy, dw, dh);
			}

			if (view === 'status') {
				const st = Plan.statusOf(plan, pl.id);
				ctx.fillStyle = STATUS_COLOR[st];
				ctx.globalAlpha = st === 'pending' ? .35 : .72;
				ctx.fillRect(dx, dy, dw, dh);
				ctx.globalAlpha = 1;
			}

			ctx.strokeStyle = 'rgba(0,0,0,.45)';
			ctx.lineWidth = 1;
			ctx.strokeRect(dx + .5, dy + .5, dw - 1, dh - 1);

			if (showCodes && dw > 34 && dh > 10) {
				const size = Math.min(dh * .34, dw * .145, 14);
				ctx.font = `${size}px ui-monospace, monospace`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = 'rgba(0,0,0,.6)';
				ctx.fillText(pl.id, dx + dw / 2 + 1, dy + dh / 2 + 1);
				ctx.fillStyle = 'rgba(255,255,255,.92)';
				ctx.fillText(pl.id, dx + dw / 2, dy + dh / 2);
			}

			// where the burnt code would land, if it is switched on
			if (plan.mark.burn && dw > 30) {
				const m = plan.mark;
				const px = m.size * s;
				ctx.fillStyle = 'rgba(255,255,255,.75)';
				ctx.fillRect(
					(m.corner === 'tr' || m.corner === 'br') ? dx + dw - px * 4.2 : dx + px * .4,
					(m.corner === 'tl' || m.corner === 'tr') ? dy + px * .4 : dy + dh - px * 1.4,
					px * 3.8, px);
			}

			if (pl.id === selected) {
				ctx.strokeStyle = '#e08a4e';
				ctx.lineWidth = 2;
				ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
			}
		});
	}

	function draw() {
		const cv = $('stage'), ctx = cv.getContext('2d');
		if (!res) return;
		const wrap = $('canvasWrap');
		const availW = Math.max(240, wrap.clientWidth - 36);
		const availH = Math.max(200, wrap.clientHeight - 36);
		const dpr = Math.min(devicePixelRatio || 1, 2);
		const s = Math.min(availW / res.geom.w, availH / res.geom.h);

		cv.style.width = res.geom.w * s + 'px';
		cv.style.height = res.geom.h * s + 'px';
		cv.width = Math.round(res.geom.w * s * dpr);
		cv.height = Math.round(res.geom.h * s * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		layout = { s };

		renderField(ctx, s, { codes: $('showCodes').checked, deck: $('showDeck').checked, dpr });
	}

	function slotAt(clientX, clientY) {
		const r = $('stage').getBoundingClientRect();
		if (!layout || !res) return null;
		const mx = (clientX - r.left) / layout.s, my = (clientY - r.top) / layout.s;
		const hit = p => mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h;
		return res.placed.find(hit) || res.holes.find(hit) || null;
	}

	// the whole field as one image, for the zip and for looking at
	async function fieldBlob() {
		const s = Math.min(3000 / res.geom.w, 2000 / res.geom.h);
		const c = Imaging.canvas(res.geom.w * s, res.geom.h * s);
		const keep = view;
		view = 'simulation';
		renderField(c.getContext('2d'), s, { codes: false, deck: true, dpr: 1 });
		view = keep;
		return Imaging.toBlob(c);
	}

	// ---------------------------------------------------------------
	// readouts
	// ---------------------------------------------------------------
	function updateFoot() {
		const cov = Pack.coverage(res);
		const g = res.grid;

		// can the source actually carry the dpi being asked for at this size
		let worst = null;
		for (const pl of res.placed) {
			if (!pl.win || !pl.region) continue;
			const eff = pl.win.w / pl.region.w * 25.4;
			if (worst == null || eff < worst) worst = eff;
		}

		const bits = [
			`<span>field <b>${mm(res.geom.w)} × ${mm(res.geom.h)} mm</b></span>`,
			`<span>grid <b>${g.cols} × ${g.rows}</b> = ${g.perPallet} a pallet, ${res.full} full</span>`,
			`<span>bricks <b>${res.placed.length}</b></span>`,
			`<span>coverage <b>${(cov.fraction * 100).toFixed(1)}%</b> of ${(cov.max * 100).toFixed(0)}%</span>`
		];
		if (res.holes.length) bits.push(`<span>${res.holes.length} left bare</span>`);
		// with the bricks butted there is no joint for the bleed to fall
		// into, so it engraves a strip its neighbour is carrying too
		const bl = plan.laser.bleed || 0;
		if (bl > 0 && (g.jointX < bl * 2 || g.jointY < bl * 2)) {
			bits.push(`<span class="warn">${mm(bl)} mm bleed runs onto the neighbouring brick — the joint is ${mm(Math.min(g.jointX, g.jointY))} mm</span>`);
		}
		const missing = res.geom.pallets.filter(p => !imgs[(plan.assign.map || [])[p.index]]).map(p => p.key);
		if (plan.assign.mode !== 'span' && missing.length) bits.push(`<span class="warn">no image on ${missing.join(' ')}</span>`);
		if (plan.assign.mode === 'span' && !imgs[plan.assign.span]) bits.push('<span class="warn">no image loaded</span>');
		if (worst != null && worst < plan.laser.dpi * 0.9) {
			bits.push(`<span class="bad">the source resolves ~${Math.round(worst)} dpi at this size — ${plan.laser.dpi} buys only file size</span>`);
		}
		$('stageFoot').innerHTML = bits.join('');
	}

	function renderTally() {
		const s = Plan.stats(plan, res);
		$('tally').innerHTML = Plan.STATUSES
			.map(st => `<div class="t-${st}"><span>${st}</span><b>${s[st]}</b></div>`).join('');
		$('progressFill').style.width = s.percent + '%';
		$('progressText').textContent = `${s.engraved} / ${s.total} engraved`;
	}

	function renderHoles() {
		$('holes').innerHTML = res.holes
			.map(h => `<span data-id="${esc(h.id)}" title="click to fill it back in">${esc(h.id)}</span>`).join('');
		$('holesHint').textContent = res.holes.length
			? `${res.holes.length} positions left bare — ${res.placed.length} bricks needed`
			: `no holes — ${res.placed.length} bricks needed`;
		$('holes').querySelectorAll('[data-id]').forEach(el => el.onclick = () => {
			plan.skip = plan.skip.filter(x => x !== el.dataset.id);
			Plan.note(plan, `${el.dataset.id} filled back in`);
			save(true); rebuild();
		});
	}

	function renderLog() {
		$('logList').innerHTML = plan.log.slice(0, 60).map(l =>
			`<div><time>${l.at.slice(5, 16).replace('T', ' ')}</time>${esc(l.text)}</div>`).join('');
	}

	function renderInspector() {
		const pl = res.placed.find(p => p.id === selected);
		const hole = res.holes.find(p => p.id === selected);
		$('inspLabel').textContent = selected || '—';
		const box = $('inspBody');

		if (hole) {
			box.innerHTML = `
				<div class="row"><span>pallet ${hole.pallet}</span><b>course ${hole.row}, pos ${hole.pos}</b></div>
				<p class="hint">left bare on purpose. no brick, no file.</p>
				<button id="iFill" class="wide">put a brick back here</button>`;
			$('iFill').onclick = () => {
				plan.skip = plan.skip.filter(x => x !== hole.id);
				save(true); rebuild();
			};
			return;
		}
		if (!pl) { box.innerHTML = '<p class="hint">click a position on the field.</p>'; return; }

		const r = plan.record[pl.id] || {};
		box.innerHTML = `
			<div class="row"><span>lies on</span><b>pallet ${pl.pallet}, course ${pl.row}, pos ${pl.pos}</b></div>
			<div class="row"><span>at</span><b>X${mm(pl.x)} Y${mm(pl.y)}</b></div>
			<div class="row"><span>face</span><b>${mm(pl.w)} × ${mm(pl.h)} mm${pl.rot ? ', turned' : ''}</b></div>
			<div class="row"><span>carries</span><b>image ${pl.image == null || !imgs[pl.image] ? '— none —' : pl.image + 1}</b></div>
			<canvas id="inspThumb"></canvas>
			<div class="chip-row">${Plan.STATUSES
				.map(s => `<span class="chip${(r.status || 'pending') === s ? ' on' : ''}" data-status="${s}">${s}</span>`).join('')}</div>
			<div class="pair">
				<label>operator <input type="text" id="iOperator" value="${esc(r.operator)}"></label>
				<label>passes <input type="text" id="iPasses" value="${esc(r.passes)}"></label>
			</div>
			<label>notes <textarea id="iNotes">${esc(r.notes)}</textarea></label>
			<div class="row"><span>engraved</span><b>${esc(r.date) || '—'}</b></div>
			<div class="bulk">
				<button id="iDownload">download this one</button>
				<button id="iBare" class="danger">leave bare</button>
			</div>`;

		box.querySelectorAll('.chip').forEach(c => c.onclick = () => {
			Plan.setStatus(plan, pl.id, c.dataset.status);
			save(true); rebuild();
		});
		const bind = (id, key) => $(id) && $(id).addEventListener('change', () => {
			Plan.rec(plan, pl.id)[key] = $(id).value;
			save();
		});
		bind('iOperator', 'operator'); bind('iPasses', 'passes'); bind('iNotes', 'notes');

		$('iDownload').onclick = () => downloadOne(pl);
		$('iBare').onclick = () => {
			plan.skip.push(pl.id);
			Plan.note(plan, `${pl.id} left bare`);
			save(true); rebuild();
		};

		// what this brick will actually carry, at preview size
		if (pl.src && imgs[pl.image]) {
			const c = $('inspThumb');
			const w = 240, h = Math.max(1, Math.round(240 * pl.out.h / pl.out.w));
			const cropped = Imaging.crop(imgs[pl.image], pl.src, w, h);
			const burned = Imaging.process(cropped, plan.laser);
			YardExport.stampCode(burned, pl.id, plan.mark, pl.out, w / pl.out.w * 25.4);
			c.width = w; c.height = h;
			c.getContext('2d').drawImage(burned, 0, 0);
		} else if ($('inspThumb')) $('inspThumb').remove();
	}

	// ---------------------------------------------------------------
	// the ledger
	// ---------------------------------------------------------------
	function ledgerRows() {
		const q = $('ledgerSearch').value.trim().toLowerCase();
		const st = $('ledgerStatus').value;
		return res.placed.filter(pl => {
			const r = plan.record[pl.id] || {};
			if (st && (r.status || 'pending') !== st) return false;
			if (q && !`${pl.id} ${r.notes || ''} ${r.operator || ''}`.toLowerCase().includes(q)) return false;
			return true;
		});
	}

	function renderLedger() {
		const body = $('ledger').querySelector('tbody');
		const rows = ledgerRows();
		body.innerHTML = rows.map(pl => {
			const r = plan.record[pl.id] || {};
			return `<tr class="${pl.id === selected ? 'sel' : ''}" data-id="${esc(pl.id)}">
				<td><b>${esc(pl.id)}</b></td>
				<td>${pl.pallet}</td>
				<td>${pl.row}.${String(pl.pos).padStart(2, '0')}</td>
				<td>${pl.image == null || !imgs[pl.image] ? '—' : pl.image + 1}</td>
				<td class="st" data-s="${r.status || 'pending'}">${r.status || 'pending'}</td>
				<td>${esc(r.date)}</td>
				<td>${esc(r.operator)}</td>
				<td class="notes">${esc(r.notes)}</td>
			</tr>`;
		}).join('');
		body.querySelectorAll('tr').forEach(tr => tr.onclick = () => selectSlot(tr.dataset.id));
		$('ledgerCount').textContent = `${rows.length} of ${res.placed.length}`;
	}

	function selectSlot(id) {
		selected = id;
		renderInspector();
		renderLedger();
		draw();
	}

	// ---------------------------------------------------------------
	// export
	// ---------------------------------------------------------------
	function scopeIds() {
		const scope = $('exportScope').value;
		if (scope === 'one') return selected ? [selected] : [];
		if (scope === 'todo') return res.placed.filter(p => Plan.statusOf(plan, p.id) !== 'engraved').map(p => p.id);
		if (scope === 'queued') return res.placed.filter(p => Plan.statusOf(plan, p.id) === 'queued').map(p => p.id);
		return null;
	}

	async function exportZip() {
		const only = scopeIds();
		if (only && !only.length) { toast('that selection is empty'); return; }
		busy(true, 'rasterising…', 0);
		try {
			const sim = await fieldBlob();
			const out = await YardExport.buildZip(plan, imgs, {
				only, gcode: $('withGcode').checked, simulation: sim,
				onProgress: (i, n, label) => busy(true, `${label} — ${i + 1} of ${n}`, n ? i / n : 0)
			});
			AE.download(out.blob, out.filename);
			Plan.note(plan, `exported ${out.rows.length} positions`);
			save(true);
			renderLog();
			toast(`${out.rows.length} files — ${out.filename}`);
		} catch (e) {
			console.error(e);
			toast('export failed: ' + e.message);
		} finally { busy(false); }
	}

	async function downloadOne(pl) {
		busy(true, pl.id, 0);
		try {
			const out = await YardExport.buildZip(plan, imgs, { only: [pl.id], gcode: $('withGcode').checked });
			AE.download(out.blob, `${pl.id}.zip`);
		} finally { busy(false); }
	}

	function exportCsv() {
		const cols = ['id', 'pallet', 'course', 'pos', 'x_mm', 'y_mm', 'image',
			'status', 'engraved_at', 'operator', 'passes', 'notes'];
		const cell = v => {
			const s = String(v == null ? '' : v);
			return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
		};
		const rows = res.placed.map(pl => {
			const r = plan.record[pl.id] || {};
			return cols.map(k => cell({
				id: pl.id, pallet: pl.pallet, course: pl.row, pos: pl.pos,
				x_mm: mm(pl.x), y_mm: mm(pl.y),
				image: pl.image == null ? '' : pl.image + 1,
				status: r.status || 'pending', engraved_at: r.date || '',
				operator: r.operator || '', passes: r.passes || '', notes: r.notes || ''
			}[k])).join(',');
		});
		AE.download(new Blob([[cols.join(','), ...rows].join('\n') + '\n'], { type: 'text/csv' }),
			`layout-${new Date().toISOString().slice(0, 10)}.csv`);
	}

	// ---------------------------------------------------------------
	// the panels
	// ---------------------------------------------------------------
	function renderSlots() {
		const box = $('slots');
		box.innerHTML = plan.images.map((s, i) => `
			<div class="slot" data-slot="${i}">
				<header><b>image ${i + 1}</b><span>${esc(s.name) || 'empty'}</span></header>
				<canvas class="thumb" data-thumb="${i}"></canvas>
				<div class="mini">
					<button data-pick="${i}">choose…</button>
					<button data-clear="${i}">clear</button>
				</div>
				<label>fit
					<select data-fit="${i}">
						<option value="cover" ${s.fit === 'cover' ? 'selected' : ''}>cover — crop the overflow</option>
						<option value="contain" ${s.fit === 'contain' ? 'selected' : ''}>contain — keep it whole</option>
						<option value="stretch" ${s.fit === 'stretch' ? 'selected' : ''}>stretch — distort to fill</option>
					</select>
				</label>
				<div class="pair">
					<label>shift ↔ <input type="range" data-ox="${i}" min="-100" max="100" value="${s.offsetX * 100}"></label>
					<label>shift ↕ <input type="range" data-oy="${i}" min="-100" max="100" value="${s.offsetY * 100}"></label>
				</div>
				<label>zoom <input type="range" data-zoom="${i}" min="100" max="400" value="${(s.zoom || 1) * 100}"></label>
			</div>`).join('');

		box.querySelectorAll('[data-thumb]').forEach(c => {
			const i = +c.dataset.thumb, im = imgs[i];
			c.width = 240; c.height = 62;
			const x = c.getContext('2d');
			x.fillStyle = '#000'; x.fillRect(0, 0, 240, 62);
			if (im) {
				const k = Math.max(240 / im.width, 62 / im.height);
				x.drawImage(im, (240 - im.width * k) / 2, (62 - im.height * k) / 2, im.width * k, im.height * k);
			}
		});

		box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
			pickSlot = +b.dataset.pick;
			$('imgFile').click();
		});
		box.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => {
			const i = +b.dataset.clear;
			plan.images[i] = Plan.slot();
			imgs[i] = null; delete cache[i];
			save(true); rebuild(); renderSlots();
		});
		box.querySelectorAll('[data-fit]').forEach(el => el.addEventListener('change', () => {
			plan.images[+el.dataset.fit].fit = el.value; save(); rebuild();
		}));
		box.querySelectorAll('[data-ox]').forEach(el => el.addEventListener('input', () => {
			plan.images[+el.dataset.ox].offsetX = +el.value / 100; save(); rebuild();
		}));
		box.querySelectorAll('[data-oy]').forEach(el => el.addEventListener('input', () => {
			plan.images[+el.dataset.oy].offsetY = +el.value / 100; save(); rebuild();
		}));
		box.querySelectorAll('[data-zoom]').forEach(el => el.addEventListener('input', () => {
			plan.images[+el.dataset.zoom].zoom = +el.value / 100; save(); rebuild();
		}));

		// dropping an image onto a slot is quicker than the file picker
		box.querySelectorAll('.slot').forEach(el => {
			['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, e => {
				e.preventDefault(); el.classList.add('over');
			}));
			['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, () => el.classList.remove('over')));
			el.addEventListener('drop', e => {
				e.preventDefault();
				const f = e.dataTransfer.files[0];
				if (f && /^image\//.test(f.type)) useBlob(+el.dataset.slot, f, f.name);
			});
		});

		// which image sits on which pallet
		$('assignRow').innerHTML = res && plan.assign.mode === 'per-pallet'
			? res.geom.pallets.map(p => `
				<label>pallet ${p.key}
					<select data-map="${p.index}">
						${plan.images.map((s, i) =>
				`<option value="${i}" ${(plan.assign.map || [])[p.index] === i ? 'selected' : ''}>image ${i + 1}${s.name ? ' — ' + esc(s.name) : ''}</option>`).join('')}
					</select>
				</label>`).join('')
			: `<label>image across the whole field
					<select data-span="1">${plan.images.map((s, i) =>
				`<option value="${i}" ${plan.assign.span === i ? 'selected' : ''}>image ${i + 1}${s.name ? ' — ' + esc(s.name) : ''}</option>`).join('')}</select>
				</label>`;
		$('assignRow').querySelectorAll('[data-map]').forEach(el => el.onchange = () => {
			plan.assign.map = plan.assign.map || [];
			plan.assign.map[+el.dataset.map] = +el.value;
			save(); rebuild();
		});
		$('assignRow').querySelectorAll('[data-span]').forEach(el => el.onchange = () => {
			plan.assign.span = +el.value; save(); rebuild();
		});
	}

	let pickSlot = 0;

	// ---------------------------------------------------------------
	// form ↔ plan
	// ---------------------------------------------------------------
	const FIELDS = {
		brickL: ['brick', 'length', v => v], brickW: ['brick', 'width', v => v],
		brickH: ['brick', 'height', v => v],
		palCount: ['pallets', 'count', v => Math.max(1, Math.min(8, Math.round(v)))],
		palW: ['pallets', 'w', v => v], palH: ['pallets', 'h', v => v],
		palGap: ['pallets', 'gap', v => v], palMargin: ['pallets', 'margin', v => v],
		gapX: ['lay', 'gapX', v => v], gapY: ['lay', 'gapY', v => v],
		dpi: ['laser', 'dpi', v => v], threshold: ['laser', 'threshold', v => v],
		brightness: ['laser', 'brightness', v => v], contrast: ['laser', 'contrast', v => v],
		gamma: ['laser', 'gamma', v => v / 100], bleed: ['laser', 'bleed', v => v],
		noise: ['laser', 'noise', v => v], seed: ['laser', 'seed', v => Math.max(1, Math.round(v))],
		gcFeed: ['gcode', 'feed', v => v], gcPower: ['gcode', 'power', v => v],
		gcSMax: ['gcode', 'sMax', v => v], gcPasses: ['gcode', 'passes', v => v],
		gcOverscan: ['gcode', 'overscan', v => v],
		gcOriginX: ['gcode', 'originX', v => v], gcOriginY: ['gcode', 'originY', v => v],
		markSize: ['mark', 'size', v => v]
	};

	function syncForm() {
		for (const [id, [group, key]] of Object.entries(FIELDS)) {
			const el = $(id);
			if (!el) continue;
			el.value = id === 'gamma' ? Math.round(plan[group][key] * 100) : plan[group][key];
		}
		$('arrange').value = plan.pallets.arrange;
		$('orient').value = plan.lay.orient;
		$('align').value = plan.lay.align;
		$('spread').checked = plan.lay.spread !== false;
		$('fillAll').checked = plan.lay.count == null;
		$('count').value = plan.lay.count == null ? '' : plan.lay.count;
		$('count').disabled = plan.lay.count == null;
		$('mode').value = plan.laser.mode;
		$('invert').checked = plan.laser.invert;
		$('gcLaserMode').value = plan.gcode.laserMode;
		$('gcBidir').checked = plan.gcode.bidirectional;
		$('gcAir').checked = plan.gcode.airAssist;
		$('polarity').value = plan.sim.polarity;
		$('assignMode').value = plan.assign.mode;
		$('markBurn').checked = plan.mark.burn;
		$('markCorner').value = plan.mark.corner;
		syncOutputs();
	}

	function syncOutputs() {
		$('thresholdV').value = plan.laser.threshold;
		$('brightnessV').value = plan.laser.brightness;
		$('contrastV').value = plan.laser.contrast + '%';
		$('gammaV').value = plan.laser.gamma.toFixed(2);
		$('noiseV').value = plan.laser.noise + '%';
		// random dithers around the cut, so it wants the cut visible too
		const m = plan.laser.mode;
		document.querySelectorAll('.thresholdOnly').forEach(el =>
			el.style.display = (m === 'threshold' || m === 'random') ? '' : 'none');
		document.querySelectorAll('.noiseOnly').forEach(el =>
			el.style.display = (m === 'random' || m === 'scatter') ? '' : 'none');
		$('noiseHint').textContent = m === 'random'
			? 'every pixel decided on its own — grainy, and the heaviest file of the five, since the power changes constantly along a scanline'
			: 'the weave broken up. the tone stays honest, the file grows a little.';
		$('arrangeHint').textContent = plan.pallets.arrange === 'column'
			? `${plan.pallets.count} pallets end to end`
			: `${plan.pallets.count} pallets side by side`;
		const f = Pack.faceOf(plan.brick, plan.lay.orient);
		$('brickHint').textContent = `bed face ${mm(f.w)} × ${mm(f.h)} mm as laid — every brick, every file`;

		const cfg = { brick: plan.brick, pallets: plan.pallets, lay: plan.lay };
		const cap = Pack.capacity(cfg);
		$('countHint').textContent = plan.lay.count == null
			? `the whole grid — ${cap.full} bricks`
			: `${cap.full} would fill it`;

		// the joint you type is only ever a minimum — it decides how many
		// bricks fit. this is the joint that actually gets laid, which on
		// a justified field is a good deal wider.
		const g = Pack.grid(cfg);
		const asked = plan.lay.gapX === plan.lay.gapY ? mm(plan.lay.gapX) : `${mm(plan.lay.gapX)} / ${mm(plan.lay.gapY)}`;
		const laid = `<b>${mm(g.jointX)} ↔ / ${mm(g.jointY)} ↕</b>`;
		const border = `bare deck ${mm(g.borderX[0])} / ${mm(g.borderX[1])} mm at the sides, ` +
			`${mm(g.borderY[0])} / ${mm(g.borderY[1])} mm at the ends`;
		$('jointHint').innerHTML = plan.lay.align === 'justify'
			? `${g.cols} × ${g.rows} fit at ${asked} mm, so the joints open to ${laid} mm to reach both edges`
			: `joints as laid ${laid} mm — ${border}`;
	}

	function readForm() {
		for (const [id, [group, key, cast]] of Object.entries(FIELDS)) {
			const el = $(id);
			if (!el) continue;
			plan[group][key] = cast(num(el.value, plan[group][key]));
		}
		plan.pallets.arrange = $('arrange').value;
		plan.lay.orient = $('orient').value;
		plan.lay.align = $('align').value;
		plan.lay.spread = $('spread').checked;
		plan.lay.count = $('fillAll').checked ? null : Math.max(0, Math.round(num($('count').value, 0)));
		$('count').disabled = $('fillAll').checked;
		plan.laser.mode = $('mode').value;
		plan.laser.invert = $('invert').checked;
		plan.gcode.laserMode = $('gcLaserMode').value;
		plan.gcode.bidirectional = $('gcBidir').checked;
		plan.gcode.airAssist = $('gcAir').checked;
		plan.sim.polarity = $('polarity').value;
		plan.assign.mode = $('assignMode').value;
		plan.mark.burn = $('markBurn').checked;
		plan.mark.corner = $('markCorner').value;
		// a fourth pallet needs a fourth slot, and a slot nobody has chosen
		// an image for defaults to its own number rather than to nothing
		while (plan.images.length < Math.max(3, plan.pallets.count)) plan.images.push(Plan.slot());
		plan.assign.map = plan.assign.map || [];
		for (let i = 0; i < plan.pallets.count; i++) {
			if (plan.assign.map[i] == null) plan.assign.map[i] = Math.min(i, plan.images.length - 1);
		}
		syncOutputs();
	}

	// ---------------------------------------------------------------
	// plans
	// ---------------------------------------------------------------
	async function refreshList() {
		const all = await Plan.list();
		$('planSel').innerHTML = all.map(p =>
			`<option value="${p.id}" ${plan && p.id === plan.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
	}

	async function openPlan(p) {
		plan = p;
		selected = null;
		localStorage.setItem('ae-plan-last', p.id);
		await loadImages();
		syncForm();
		await refreshList();
		res = Plan.build(plan, imgs);
		rebuild();
		renderSlots();
	}

	async function newPlan(name) {
		const p = Plan.blank(name);
		await Plan.save(p);
		await openPlan(p);
	}

	// ---------------------------------------------------------------
	function bind() {
		const ids = Object.keys(FIELDS).concat(['arrange', 'orient', 'align', 'spread', 'fillAll', 'count',
			'mode', 'invert', 'gcLaserMode', 'gcBidir', 'gcAir', 'polarity', 'assignMode',
			'markBurn', 'markCorner']);
		ids.forEach(id => {
			const el = $(id);
			if (!el) return;
			el.addEventListener('input', () => {
				readForm();
				save();
				rebuild();
				// the slots list the pallets, so they are redrawn after the
				// field, never from the shape the field used to have
				if (id === 'assignMode' || id === 'palCount') renderSlots();
			});
		});

		// the quickest way back from a plan saved with joints in it
		$('buttTight').onclick = () => {
			plan.lay.gapX = 0; plan.lay.gapY = 0;
			plan.pallets.margin = 0;
			Plan.note(plan, 'joints and margin zeroed — bricks butted');
			syncForm(); save(true); rebuild();
		};

		$('clearHoles').onclick = () => {
			if (!plan.skip.length) { toast('nothing is left bare'); return; }
			plan.skip = [];
			Plan.note(plan, 'every hole filled back in');
			save(true); rebuild();
		};

		$('views').addEventListener('click', e => {
			const b = e.target.closest('button[data-view]');
			if (!b) return;
			view = b.dataset.view;
			[...$('views').children].forEach(c => c.classList.toggle('on', c === b));
			draw();
		});
		['showCodes', 'showDeck'].forEach(id => $(id).addEventListener('change', draw));

		$('stage').addEventListener('click', e => {
			const pl = slotAt(e.clientX, e.clientY);
			if (pl) selectSlot(pl.id);
		});
		$('stage').addEventListener('dblclick', e => {
			const pl = slotAt(e.clientX, e.clientY);
			if (!pl || !res.placed.includes(pl)) return;
			Plan.setStatus(plan, pl.id, 'engraved');
			save(true); rebuild();
		});
		addEventListener('resize', () => draw());

		$('imgFile').onchange = e => {
			const f = e.target.files[0];
			if (f) useBlob(pickSlot, f, f.name);
			e.target.value = '';
		};

		$('exportBtn').onclick = exportZip;
		$('exportCsv').onclick = exportCsv;

		$('resetLaser').onclick = () => {
			Object.assign(plan.laser, { brightness: 0, contrast: 120, gamma: 1, invert: false, threshold: 128 });
			syncForm(); save(); rebuild();
		};
		// a different grain from the same picture — the seed is saved, so
		// the one you settle on is the one that gets cut
		$('reseed').onclick = () => {
			plan.laser.seed = 1 + Math.floor(Math.random() * 99999);
			syncForm(); save(true); rebuild();
		};

		document.querySelectorAll('[data-bulk]').forEach(b => b.onclick = () => {
			const st = b.dataset.bulk;
			res.placed.forEach(pl => Plan.setStatus(plan, pl.id, st));
			Plan.note(plan, `all ${res.placed.length} → ${st}`);
			save(true); rebuild();
		});

		['ledgerSearch', 'ledgerStatus'].forEach(id => $(id).addEventListener('input', renderLedger));

		addEventListener('keydown', e => {
			if (/input|textarea|select/i.test(document.activeElement.tagName)) return;
			if (!selected || !res) return;
			const idx = res.placed.findIndex(p => p.id === selected);
			if (idx < 0) return;
			if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
				const j = Math.max(0, Math.min(res.placed.length - 1, idx + (e.key === 'ArrowRight' ? 1 : -1)));
				selectSlot(res.placed[j].id);
				e.preventDefault();
				return;
			}
			const st = { e: 'engraved', q: 'queued', f: 'failed', s: 'skipped', p: 'pending' }[e.key];
			if (st) {
				Plan.setStatus(plan, selected, st);
				save(true); rebuild();
			}
		});

		$('planSel').onchange = async e => {
			const p = await Plan.load(e.target.value);
			if (p) openPlan(p);
		};
		$('newPlan').onclick = () => {
			const name = prompt('name for the plan', 'three pallets');
			if (name) newPlan(name);
		};
		$('renamePlan').onclick = async () => {
			const name = prompt('rename', plan.name);
			if (!name) return;
			plan.name = name;
			await Plan.save(plan);
			refreshList();
		};
		$('delPlan').onclick = async () => {
			if (!confirm(`delete the plan "${plan.name}"?`)) return;
			await Plan.remove(plan.id);
			const all = await Plan.list();
			if (all.length) openPlan(await Plan.load(all[0].id)); else newPlan('three pallets');
		};
		$('exportJson').onclick = async () => {
			AE.download(new Blob([await Plan.toJSON(plan)], { type: 'application/json' }),
				plan.name.replace(/[^\w.-]+/g, '_') + '.json');
		};
		$('importJson').onclick = () => $('jsonFile').click();
		$('jsonFile').onchange = async e => {
			const f = e.target.files[0];
			if (!f) return;
			const p = await Plan.fromJSON(await f.text());
			await Plan.save(p);
			await openPlan(p);
			e.target.value = '';
			toast('plan imported');
		};
	}

	(async function boot() {
		bind();
		const all = await Plan.list();
		const last = localStorage.getItem('ae-plan-last');
		const pick = all.find(p => p.id === last) || all[0];
		if (pick) await openPlan(await Plan.load(pick.id));
		else await newPlan('three pallets');
	})();
})();

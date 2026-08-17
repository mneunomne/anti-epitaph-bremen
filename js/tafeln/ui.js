/* ui.js — one block at a time, and every setting on it exposed.
 *
 * The defaults in plate.js are one reading of the printed page. This panel
 * takes them apart: the faces, the size of each corpus, every gap and every
 * rule, the canvas the block sits on, and the press it is run through. What
 * is exported is the same render at whatever multiple is asked for — the
 * type is set at the export size, so a 4× plate is four times the type.
 */
(function () {
	'use strict';

	const AE = window.AE;
	const { Model, Plate, Ink } = AE.Tafeln;
	const $ = id => document.getElementById(id);
	const KEY = 'ae.tafeln.block.v3';

	let list = [], data = new Map(), plate = null, L = null;
	let zoom = 1, fitted = true, inkT = null;

	const S = {
		year: null, place: null, rawUnits: false,
		cats: Model.DEFAULT_CATS.slice(),
		width: 520, maxRows: 14,
		kicker: true, total: true, foot: false,
		canvas: { fit: true, w: 900, h: 640, align: 'center', margin: 24 },
		m: {},                                   // overrides on Plate.DEFAULTS
		ink: Object.assign({}, Ink.DEFAULTS),
	};

	const num = (v, fb) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fb);
	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const M = () => Plate.metrics(S.m);

	function toast(msg) {
		const t = $('toast');
		t.textContent = msg;
		t.classList.add('show');
		clearTimeout(toast.t);
		toast.t = setTimeout(() => t.classList.remove('show'), 2200);
	}
	const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

	/* ------------------------------------------------------- the controls */

	// the faces on disk are variable over 400–700 and the fat faces have the
	// one weight, so the list stops where the fonts do
	const WEIGHTS = [[400, 'regular'], [500, 'medium'], [600, 'semibold'], [700, 'bold']];

	// every metric, grouped the way it is thought about rather than the way
	// it happens to sit in the layout pass
	const PANEL = [
		{
			id: 'type', title: 'the type', items: [
				{ k: 'display', kind: 'face', label: 'display face — the place' },
				{ k: 'text', kind: 'face', label: 'text face — everything else' },
				{
					k: 'titleFit', kind: 'select', label: 'a name too wide', opts: [
						['squeeze', 'squeeze it to fit'], ['shrink', 'shrink it to fit'], ['wrap', 'break it in two']],
				},
				{ k: 'titleSize', min: 8, max: 72, step: 0.5, label: 'place name' },
				{ k: 'titleTrack', min: -6, max: 24, step: 0.5, label: 'name tracking', unit: '%' },
				{ k: 'kickerSize', min: 5, max: 24, step: 0.5, label: '“Einfuhr von”' },
				{ k: 'headSize', min: 5, max: 24, step: 0.5, label: 'column heads' },
				{ k: 'headTrack', min: 0, max: 40, step: 1, label: 'head tracking', unit: '%' },
				{ k: 'rowSize', min: 5, max: 28, step: 0.5, label: 'the goods’ names' },
				{ k: 'rowWeight', kind: 'select', label: 'the goods’ weight', opts: WEIGHTS },
				{ k: 'figFace', kind: 'face', same: 'the text face', label: 'the figures — Quantum and Werth' },
				{ k: 'figSize', min: 5, max: 28, step: 0.5, label: 'the figures' },
				{ k: 'figWeight', kind: 'select', label: 'the figures’ weight', opts: WEIGHTS },
				{ k: 'totalWeight', kind: 'select', label: 'the sum’s weight', opts: WEIGHTS },
				{ k: 'footSize', min: 5, max: 20, step: 0.5, label: 'the year and pages' },
			],
		},
		{
			id: 'space', title: 'the spacing', items: [
				{ k: 'padX', min: 0, max: 48, step: 0.5, label: 'inside the frame ↔' },
				{ k: 'padTop', min: 0, max: 48, step: 0.5, label: 'inside the frame ↑' },
				{ k: 'padBottom', min: 0, max: 48, step: 0.5, label: 'inside the frame ↓' },
				{ k: 'kickerGap', min: 0, max: 30, step: 0.5, label: 'under “Einfuhr von”' },
				{ k: 'titleGap', min: 0, max: 40, step: 0.5, label: 'under the name' },
				{ k: 'underGap', min: 0, max: 40, step: 0.5, label: 'under the heavy rule' },
				{ k: 'headLead', min: 4, max: 44, step: 0.5, label: 'the head line' },
				{ k: 'rowLead', min: 5, max: 44, step: 0.2, label: 'between the goods' },
				{ k: 'colGap', min: 0, max: 30, step: 0.5, label: 'inside a column' },
				{ k: 'totalGap', min: 0, max: 24, step: 0.5, label: 'over the sum' },
				{ k: 'totalLead', min: 5, max: 44, step: 0.5, label: 'the sum line' },
				{ k: 'footLead', min: 4, max: 36, step: 0.5, label: 'the foot line' },
			],
		},
		{
			id: 'rules', title: 'the rules', items: [
				{ k: 'frameOuter', min: 0, max: 10, step: 0.1, label: 'the heavy frame' },
				{ k: 'frameGap', min: 0, max: 16, step: 0.1, label: 'the white between' },
				{ k: 'frameInner', min: 0, max: 6, step: 0.1, label: 'the hair inside' },
				{ k: 'underRule', min: 0, max: 10, step: 0.1, label: 'under the name' },
				{ k: 'underInset', min: 0, max: 45, step: 0.5, label: 'held clear each side', unit: '%' },
				{ k: 'headRule', min: 0, max: 8, step: 0.1, label: 'under the heads' },
				{ k: 'hair', min: 0, max: 4, step: 0.1, label: 'the column rules' },
				{ k: 'totalRule', min: 0, max: 8, step: 0.1, label: 'over the sum' },
				{ k: 'leaderGap', min: 0, max: 200, step: 5, label: 'before the dots', unit: '%' },
				{ k: 'leaderStep', min: 10, max: 200, step: 5, label: 'between the dots', unit: '%' },
				{ k: 'leaderSize', min: 1, max: 15, step: 0.5, label: 'the dots', unit: '%' },
			],
		},
	];

	const INK = [
		{ k: 'bite', min: 0, max: 4, step: 0.05, label: 'the edge wanders' },
		{ k: 'spread', min: -0.5, max: 0.5, step: 0.01, label: 'ink gains ↔ starves' },
		{ k: 'grain', min: 0, max: 0.4, step: 0.005, label: 'mottling' },
		{ k: 'coarse', min: 1, max: 14, step: 0.1, label: 'the paper texture' },
		{ k: 'dust', min: 0, max: 1, step: 0.02, label: 'specks in the white' },
		{ k: 'soft', min: 0.01, max: 0.4, step: 0.01, label: 'how hard the edge falls' },
	];

	function control(it, val, ns) {
		const id = `${ns}_${it.k}`;
		if (it.kind === 'face') {
			// a face that may defer to another one carries the empty option first
			const same = it.same
				? `<option value=""${val ? '' : ' selected'}>${esc(it.same)}</option>` : '';
			return `<label class="ctl">${it.label}<select id="${id}" data-ns="${ns}" data-k="${it.k}">` + same +
				Plate.FACES.map(f => `<option value="${f.id}"${f.id === val ? ' selected' : ''}>${esc(f.label)}</option>`).join('') +
				`</select></label>`;
		}
		if (it.kind === 'select') {
			return `<label class="ctl">${it.label}<select id="${id}" data-ns="${ns}" data-k="${it.k}">` +
				it.opts.map(([v, t]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`).join('') +
				`</select></label>`;
		}
		return `<label class="ctl rng">${it.label}` +
			`<input type="range" id="${id}" data-ns="${ns}" data-k="${it.k}" ` +
			`min="${it.min}" max="${it.max}" step="${it.step}" value="${val}">` +
			`<output id="${id}_v">${val}${it.unit || ''}</output></label>`;
	}

	function buildPanel() {
		const m = M();
		for (const g of PANEL) {
			$('p_' + g.id).innerHTML = g.items.map(it => control(it, m[it.k], 'm')).join('');
		}
		$('p_ink').innerHTML = INK.map(it => control(it, S.ink[it.k], 'ink')).join('');

		document.querySelectorAll('[data-ns]').forEach(el => {
			const ns = el.dataset.ns, k = el.dataset.k;
			const spec = (ns === 'ink' ? INK : PANEL.flatMap(g => g.items)).find(i => i.k === k);
			el.oninput = () => {
				const v = el.tagName === 'SELECT'
					? (/^-?\d+$/.test(el.value) ? +el.value : el.value)
					: num(el.value, 0);
				if (ns === 'ink') S.ink[k] = v; else S.m[k] = v;
				const out = $(`${ns}_${k}_v`);
				if (out) out.value = v + (spec && spec.unit ? spec.unit : '');
				if (fitted) fit();
				paint(); save();
			};
		});
	}

	function syncPanel() {
		const m = M();
		document.querySelectorAll('[data-ns]').forEach(el => {
			const ns = el.dataset.ns, k = el.dataset.k;
			const v = ns === 'ink' ? S.ink[k] : m[k];
			el.value = v;
			const out = $(`${ns}_${k}_v`);
			if (out) {
				const spec = (ns === 'ink' ? INK : PANEL.flatMap(g => g.items)).find(i => i.k === k);
				out.value = v + (spec && spec.unit ? spec.unit : '');
			}
		});
	}

	/* ---------------------------------------------------------------- data */

	function rebuild() {
		list = Model.plates(S.year, { rawUnits: S.rawUnits, cats: S.cats });
		data = new Map(list.map(p => [p.id, p]));
		if (!data.has(S.place)) S.place = list.length ? list[0].id : null;
		plate = S.place ? data.get(S.place) : null;
		if (plate) S.maxRows = Math.min(S.maxRows, plate.rows.length);
	}

	const opts = () => ({
		width: S.width, maxRows: S.maxRows,
		kicker: S.kicker, total: S.total, foot: S.foot, m: S.m,
	});

	// the canvas the block sits on, and where in it the block lands
	function frame() {
		L = Plate.layout(plate, opts());
		const c = S.canvas;
		const w = c.fit ? L.w + c.margin * 2 : c.w;
		const h = c.fit ? L.h + c.margin * 2 : c.h;
		let x = c.margin, y = c.margin;
		if (!c.fit) {
			x = c.align === 'left' ? c.margin : c.align === 'right' ? w - L.w - c.margin : (w - L.w) / 2;
			y = c.align === 'top' ? c.margin : (h - L.h) / 2;
		}
		return { w, h, x, y };
	}

	/* -------------------------------------------------------------- canvas */

	function fit() {
		if (!plate) return;
		const f = frame();
		const wrap = $('canvasWrap'), pad = 48;
		zoom = Math.max(0.08, Math.min(4,
			Math.min((wrap.clientWidth - pad) / f.w, (wrap.clientHeight - pad) / f.h)));
		$('zoom').value = Math.round(zoom * 100);
		$('zoomV').value = Math.round(zoom * 100) + '%';
	}

	// clean first — inking a few million pixels on every drag of a slider is
	// what makes a panel feel dead, so the press runs a beat later
	function render(withInk) {
		const cv = $('stage');
		if (!plate) return;
		const f = frame();
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const s = zoom * dpr;

		cv.width = Math.max(1, Math.round(f.w * s));
		cv.height = Math.max(1, Math.round(f.h * s));
		cv.style.width = Math.round(f.w * zoom) + 'px';
		cv.style.height = Math.round(f.h * zoom) + 'px';

		const ctx = cv.getContext('2d', { willReadFrequently: true });
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, cv.width, cv.height);
		Plate.draw(ctx, plate, f.x * s, f.y * s, L, s, { paper: null });
		if (withInk && S.ink.on) Ink.apply(cv, S.ink, s);
	}

	function draw() {
		render(false);
		clearTimeout(inkT);
		if (S.ink.on) inkT = setTimeout(() => render(true), 90);
		foot();
	}

	function foot() {
		const f = frame();
		const fold = Plate.bodyRows(plate, S.maxRows);
		$('stageFoot').innerHTML =
			`<span>block <b>${Math.round(L.w)} × ${Math.round(L.h)}</b></span>` +
			`<span>canvas <b>${Math.round(f.w)} × ${Math.round(f.h)}</b></span>` +
			`<span>showing <b>${fold.shown.length}</b> of <b>${plate.rows.length}</b> goods</span>` +
			(fold.folded ? `<span class="warn"><b>${fold.folded.count}</b> folded into one line</span>` : '') +
			`<span>Werth <b>${Model.figure(plate.total)}</b> Ld'or</span>` +
			(plate.partial ? `<span class="warn">some figures are dashes</span>` : '');
	}

	function paint() { draw(); side(); }

	/* ----------------------------------------------------------------- side */

	// the six printed classes plus what could not be placed, each with what it
	// holds in the block in hand, so turning one off says what it costs
	function cats() {
		if (!plate) return;
		const on = new Set(S.cats);
		$('cats').innerHTML = Model.CATEGORIES.map(c => {
			const n = plate.tally[c.key] || 0;
			return `<label class="${on.has(c.key) ? '' : 'off'} ${n ? '' : 'none'}">` +
				`<input type="checkbox" data-cat="${c.key}"${on.has(c.key) ? ' checked' : ''}>` +
				`<span>${esc(c.de)}</span><span class="n">${n}</span></label>`;
		}).join('');
	}

	function picker() {
		const q = $('placeSearch').value.trim().toLowerCase();
		const rows = list.filter(p => !q || p.title.toLowerCase().includes(q));
		$('picker').innerHTML = rows.map(p =>
			`<button data-pick="${esc(p.id)}" class="${p.id === S.place ? 'on' : ''}">` +
			`<span>${esc(p.title)}</span>` +
			`<span class="n">${p.rows.length} · ${Model.figure(p.total)}</span></button>`
		).join('') || '<p class="hint">nothing under that name.</p>';
		const on = $('picker').querySelector('.on');
		if (on && !q) on.scrollIntoView({ block: 'nearest' });
	}

	// Every good the place sent, and what the block is doing with it: which of
	// the six classes it was read into, what share of the sum it carries, and
	// where the reading had to do something the page did not — a figure the
	// volumes left as a dash, two lines added together across a column break,
	// a measure restored to net pounds. A row greyed out is one folded into
	// "Uebrige Waaren"; the bar is that good's share of the block's Werth.
	const SHORT = new Map(Model.CATEGORIES.map(c => [c.key, c.short]));

	function goodsList(fold) {
		const shown = new Set(fold.shown.map(r => r.article + r.unit));
		const total = plate.total || 0;
		return plate.rows.map(r => {
			const has = Number.isFinite(r.value);
			const share = has && total > 0 ? (r.value / total) * 100 : null;
			const note = [];
			if (!has) note.push('<b class="g-flag">Werth ein Strich</b>');
			if (!Number.isFinite(r.qty)) note.push('<b class="g-flag">kein Quantum</b>');
			if (r.merged) note.push(`<b class="g-flag">${r.merged + 1} Zeilen addirt</b>`);
			if (r.unit === Model.NETTO) note.push('<b class="g-flag net">Nto. ergänzt</b>');
			return `<div class="good ${shown.has(r.article + r.unit) ? '' : 'out'}">` +
				`<span class="g-n" title="${esc(r.article)}">${esc(r.article)}</span>` +
				`<span class="g-q">${Model.figure(r.qty)} <i>${esc(r.unit)}</i></span>` +
				`<span class="g-v">${Model.figure(r.value)}</span>` +
				`<span class="g-meta">` +
				`<span class="g-cat c-${r.cat}">${esc(SHORT.get(r.cat) || r.cat)}</span>` +
				(share == null ? '' :
					`<span class="g-bar"><i style="width:${Math.min(100, share).toFixed(1)}%"></i></span>` +
					`<span class="g-pc">${share < 0.1 ? '<0.1' : share.toFixed(1)}%</span>`) +
				note.join('') +
				`</span></div>`;
		}).join('');
	}

	function side() {
		if (!plate) return;
		cats();
		$('blockName').textContent = plate.title;
		$('width').value = S.width;
		$('rows').max = plate.rows.length;
		$('rows').value = S.maxRows;
		$('kicker').checked = S.kicker;
		$('total').checked = S.total;
		$('foot').checked = S.foot;
		$('rawUnits').checked = S.rawUnits;
		$('inkOn').checked = S.ink.on;
		$('canvasFit').checked = S.canvas.fit;
		$('canvasW').value = S.canvas.w;
		$('canvasH').value = S.canvas.h;
		$('canvasMargin').value = S.canvas.margin;
		$('canvasAlign').value = S.canvas.align;
		$('canvasFixed').hidden = S.canvas.fit;

		const at = list.findIndex(p => p.id === S.place);
		$('rank').textContent = `${at + 1} of ${list.length} by Werth`;
		// which of the two printings this block came off — the country lists
		// are much the finer, and a block built off the by-article table is
		// the coarser reading, not the whole of what the place sent
		const src = plate.source === 'verzeichniss'
			? 'off the Waarenverzeichniss' : 'off the by-article table';
		$('pages').textContent = (plate.pages.length
			? `S. ${plate.pages[0]}–${plate.pages[plate.pages.length - 1]} · ` : '') + src;
		$('source').textContent = src;
		$('source').className = plate.source === 'verzeichniss' ? 'hint' : 'hint warnhint';

		const fold = Plate.bodyRows(plate, S.maxRows);
		$('rowsV').value = `${fold.shown.length} / ${plate.rows.length}`;
		$('goods').innerHTML = goodsList(fold);
	}

	/* --------------------------------------------------------------- export */

	async function exportPng() {
		const s = num($('exScale').value, 2);
		const f = frame();
		const cv = document.createElement('canvas');
		cv.width = Math.round(f.w * s);
		cv.height = Math.round(f.h * s);
		const ctx = cv.getContext('2d', { willReadFrequently: true });
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, cv.width, cv.height);
		Plate.draw(ctx, plate, f.x * s, f.y * s, L, s, { paper: null });
		if (S.ink.on) Ink.apply(cv, S.ink, s);

		const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${S.year}-${S.place}.png`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
		toast(`${cv.width} × ${cv.height} png`);
	}

	function exportCsv() {
		const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
		const lines = [['waare', 'quantum', 'maass', 'werth_ldor'].join(',')];
		for (const r of plate.rows) lines.push([q(r.article), r.qty ?? '', q(r.unit), r.value ?? ''].join(','));
		lines.push([q('Werth im Ganzen'), '', '', plate.total ?? ''].join(','));
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
		a.download = `${S.year}-${S.place}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	}

	/* ------------------------------------------------------------------- ui */

	function step(d) {
		const at = list.findIndex(p => p.id === S.place);
		const next = list[Math.max(0, Math.min(list.length - 1, at + d))];
		if (!next || next.id === S.place) return;
		S.place = next.id; plate = next;
		S.maxRows = Math.min(S.maxRows, plate.rows.length);
		picker(); if (fitted) fit(); paint(); save();
	}

	function wire() {
		$('yearSel').innerHTML = Model.years().map(y => `<option>${y}</option>`).join('');
		$('yearSel').value = S.year;
		$('yearSel').onchange = e => {
			S.year = e.target.value; rebuild(); picker();
			if (fitted) fit(); paint(); save();
		};
		$('rawUnits').onchange = e => {
			S.rawUnits = e.target.checked; rebuild(); picker(); paint(); save();
		};

		const changed = reframe => { if (fitted) fit(); paint(); save(); };

		$('cats').onchange = e => {
			const b = e.target.closest('[data-cat]'); if (!b) return;
			const k = b.dataset.cat;
			const at = S.cats.indexOf(k);
			if (at >= 0) S.cats.splice(at, 1); else S.cats.push(k);
			if (!S.cats.length) S.cats = [k];        // never leave a block with nothing in it
			rebuild(); picker(); changed();
		};
		$('catsAll').onclick = () => {
			S.cats = Model.CATEGORIES.map(c => c.key);
			rebuild(); picker(); changed();
		};
		$('catsDefault').onclick = () => {
			S.cats = Model.DEFAULT_CATS.slice();
			rebuild(); picker(); changed();
		};

		$('placeSearch').oninput = picker;
		$('picker').onclick = e => {
			const b = e.target.closest('[data-pick]'); if (!b) return;
			S.place = b.dataset.pick; plate = data.get(S.place);
			S.maxRows = Math.min(S.maxRows, plate.rows.length);
			picker(); if (fitted) fit(); paint(); save();
		};
		$('prev').onclick = () => step(-1);
		$('next').onclick = () => step(1);

		$('width').oninput = e => { S.width = Math.max(160, Math.min(3000, num(e.target.value, 520))); changed(); };
		$('rows').oninput = e => { S.maxRows = Math.max(1, num(e.target.value, 14)); changed(); };
		$('allRows').onclick = () => { S.maxRows = plate.rows.length; changed(); };
		['kicker', 'total', 'foot'].forEach(k => $(k).onchange = e => { S[k] = e.target.checked; changed(); });

		$('canvasFit').onchange = e => { S.canvas.fit = e.target.checked; changed(); };
		$('canvasW').oninput = e => { S.canvas.w = Math.max(100, num(e.target.value, 900)); changed(); };
		$('canvasH').oninput = e => { S.canvas.h = Math.max(100, num(e.target.value, 640)); changed(); };
		$('canvasMargin').oninput = e => { S.canvas.margin = Math.max(0, num(e.target.value, 24)); changed(); };
		$('canvasAlign').onchange = e => { S.canvas.align = e.target.value; changed(); };
		$('fitToBlock').onclick = () => {
			S.canvas.w = Math.round(L.w + S.canvas.margin * 2);
			S.canvas.h = Math.round(L.h + S.canvas.margin * 2);
			changed();
		};

		$('inkOn').onchange = e => { S.ink.on = e.target.checked; changed(); };
		$('reseed').onclick = () => { S.ink.seed = 1 + ((Math.random() * 99999) | 0); changed(); toast('seed ' + S.ink.seed); };

		$('resetType').onclick = () => { S.m = {}; buildPanel(); changed(); toast('back to the volume’s own setting'); };
		$('resetInk').onclick = () => {
			const on = S.ink.on;
			S.ink = Object.assign({}, Ink.DEFAULTS, { on });
			syncPanel(); changed();
		};

		$('zoom').oninput = e => {
			zoom = num(e.target.value, 100) / 100; fitted = false;
			$('zoomV').value = Math.round(zoom * 100) + '%'; draw();
		};
		$('zoomFit').onclick = () => { fitted = true; fit(); draw(); };
		$('zoom1').onclick = () => { fitted = false; zoom = 1; $('zoom').value = 100; $('zoomV').value = '100%'; draw(); };

		$('exportPng').onclick = exportPng;
		$('exportCsv').onclick = exportCsv;

		window.addEventListener('keydown', e => {
			if (/input|select|textarea/i.test(e.target.tagName)) return;
			if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); step(1); }
			else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); step(-1); }
		});
		window.addEventListener('resize', () => { if (fitted) { fit(); draw(); } });
	}

	/* ----------------------------------------------------------------- boot */

	async function boot() {
		if (!window.HANDEL) { document.body.innerHTML = '<p style="padding:40px">the volumes did not load.</p>'; return; }

		// canvas silently falls back to a system serif unless a face is really
		// resident, so every one on the list is asked for before the first draw
		try {
			const jobs = [];
			for (const f of Plate.FACES) {
				for (const [w] of WEIGHTS) jobs.push(document.fonts.load(`${w} 24px ${f.css}`).catch(() => { }));
				jobs.push(document.fonts.load(`italic 400 12px ${f.css}`).catch(() => { }));
			}
			await Promise.all(jobs);
			await document.fonts.ready;
		} catch (e) { /* draw with what there is */ }

		try {
			const kept = JSON.parse(localStorage.getItem(KEY));
			if (kept) {
				Object.assign(S, kept);
				S.canvas = Object.assign({ fit: true, w: 900, h: 640, align: 'center', margin: 24 }, kept.canvas);
				S.ink = Object.assign({}, Ink.DEFAULTS, kept.ink);
				S.m = kept.m || {};
				if (!Array.isArray(S.cats) || !S.cats.length) S.cats = Model.DEFAULT_CATS.slice();
			}
		} catch (e) { }

		const years = Model.years();
		if (!years.includes(S.year)) S.year = years[years.length - 1];
		rebuild();
		if (!plate) { document.body.innerHTML = '<p style="padding:40px">that volume has no blocks.</p>'; return; }

		wire();
		buildPanel();
		picker();
		fit();
		paint();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();

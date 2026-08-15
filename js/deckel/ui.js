/* ui.js — the workbench for the top face.
 *
 * One face, as large as the window will take it, and every measurement on it
 * exposed. The panel is built off a list rather than written out by hand, so
 * a setting added to bed.js is a line here and nothing else.
 */
(function () {
	'use strict';

	const AE = window.AE;
	const { Model, Plate, Ink } = AE.Tafeln;
	const { Bed, Net } = AE.Deckel;
	const $ = id => document.getElementById(id);
	const KEY = 'ae.deckel.v1';

	let list = [], data = new Map(), plate = null;
	let zoom = 4, fitted = false, inkT = null;

	const S = {
		year: null, place: null, rawUnits: false,
		m: {},                                   // overrides on Bed.DEFAULTS
		ink: Object.assign({}, Ink.DEFAULTS, { on: false }),
		white: false, exPpmm: 24,
		// the brick the top sits on, when the whole thing is laid out flat
		view: 'top',                             // top · net
		rows: 3, course: 0, sides: 1, nameOn: 'none',
		figuresOn: 'header', currency: 'first',
		goodsSize: 50, figSize: 50, heads: true,
		fold: true, cut: true, panelNames: true,
	};

	const num = (v, fb) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fb);
	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const M = () => Object.assign({}, Bed.DEFAULTS, S.m);
	const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

	function toast(msg) {
		const t = $('toast');
		t.textContent = msg;
		t.classList.add('show');
		clearTimeout(toast.t);
		toast.t = setTimeout(() => t.classList.remove('show'), 2200);
	}

	/* ------------------------------------------------------- the controls */

	const WEIGHTS = [[400, 'regular'], [500, 'medium'], [600, 'semibold'], [700, 'bold']];

	const PANEL = [
		{
			id: 'parts', items: [
				{ k: 'kicker', kind: 'check', label: '“Einfuhr von” over the name' },
				{ k: 'source', kind: 'check', label: 'the printing, the year, the pages' },
				{ k: 'ships', kind: 'check', label: 'the ships that carried it' },
				{
					k: 'shipsWhat', kind: 'select', label: 'and of the ships', opts: [
						['ships', 'the count alone'],
						['all', 'ships · Lasten · Mann'],
						['full', 'laden and empty as well']],
				},
				{ k: 'sum', kind: 'check', label: 'the sum' },
				{ k: 'sumLeaders', kind: 'check', label: 'leader dots to the sum' },
				{ k: 'mark', kind: 'text', label: 'the money is called' },
			],
		},
		{
			id: 'type', items: [
				{ k: 'display', kind: 'face', label: 'display face — the place' },
				{ k: 'text', kind: 'face', label: 'text face — everything else' },
				{ k: 'figFace', kind: 'face', same: 'as the text face', label: 'the figures' },
				{ k: 'titleSize', min: 6, max: 46, step: 0.5, label: 'the place', unit: ' mm' },
				{ k: 'kickerSize', min: 2, max: 18, step: 0.5, label: '“Einfuhr von”', unit: ' mm' },
				{ k: 'sourceSize', min: 2, max: 16, step: 0.5, label: 'the printing and pages', unit: ' mm' },
				{ k: 'shipsSize', min: 2, max: 18, step: 0.5, label: 'the ships', unit: ' mm' },
				{ k: 'shipsWeight', kind: 'select', label: 'the ships’ weight', opts: WEIGHTS },
				{ k: 'sumLabelSize', min: 2, max: 18, step: 0.5, label: '“Werth im Ganzen”', unit: ' mm' },
				{ k: 'sumSize', min: 3, max: 30, step: 0.5, label: 'the sum', unit: ' mm' },
				{ k: 'sumWeight', kind: 'select', label: 'the sum’s weight', opts: WEIGHTS },
				{ k: 'markSize', min: 20, max: 120, step: 1, label: 'the money, of the sum', unit: '%' },
			],
		},
		{
			id: 'space', items: [
				{ k: 'bedPadX', min: 0, max: 40, step: 0.5, label: 'in from the sides', unit: ' mm' },
				{ k: 'bedPadTop', min: 0, max: 30, step: 0.5, label: 'in from the back', unit: ' mm' },
				{ k: 'bedPadBottom', min: 0, max: 30, step: 0.5, label: 'in from the front', unit: ' mm' },
				{ k: 'kickerGap', min: 0, max: 20, step: 0.5, label: 'under “Einfuhr von”', unit: ' mm' },
				{ k: 'titleGap', min: 0, max: 20, step: 0.5, label: 'under the name', unit: ' mm' },
				{ k: 'underGap', min: 0, max: 20, step: 0.5, label: 'under the heavy rule', unit: ' mm' },
				{ k: 'sourceGap', min: 0, max: 20, step: 0.5, label: 'under the printing', unit: ' mm' },
				{ k: 'shipsGap', min: 0, max: 20, step: 0.5, label: 'under the ships', unit: ' mm' },
				{ k: 'sumGap', min: 0, max: 20, step: 0.5, label: 'over the sum', unit: ' mm' },
				{ k: 'markGap', min: 0, max: 10, step: 0.2, label: 'before the money', unit: ' mm' },
			],
		},
		{
			id: 'rules', items: [
				{ k: 'underRule', min: 0, max: 8, step: 0.1, label: 'under the name', unit: ' mm' },
				{ k: 'underInset', min: 0, max: 45, step: 0.5, label: 'held clear each side', unit: '%' },
				{ k: 'shipsRule', min: 0, max: 5, step: 0.1, label: 'over the ships', unit: ' mm' },
				{ k: 'sumRule', min: 0, max: 5, step: 0.1, label: 'over the sum', unit: ' mm' },
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

	const ITEMS = PANEL.flatMap(g => g.items);
	const spec = (ns, k) => (ns === 'ink' ? INK : ITEMS).find(i => i.k === k);

	function control(it, val, ns) {
		const id = `${ns}_${it.k}`;
		const head = `<label class="ctl">${it.label}`;
		const tag = `id="${id}" data-ns="${ns}" data-k="${it.k}"`;

		if (it.kind === 'check') {
			return `<label class="check"><input type="checkbox" ${tag}${val ? ' checked' : ''}> ${it.label}</label>`;
		}
		if (it.kind === 'text') {
			return `${head}<input type="text" ${tag} value="${esc(val)}"></label>`;
		}
		if (it.kind === 'face') {
			const same = it.same
				? `<option value=""${val ? '' : ' selected'}>${esc(it.same)}</option>` : '';
			return `${head}<select ${tag}>` + same + Plate.FACES.map(f =>
				`<option value="${f.id}"${f.id === val ? ' selected' : ''}>${esc(f.label)}</option>`).join('') +
				`</select></label>`;
		}
		if (it.kind === 'select') {
			return `${head}<select ${tag}>` + it.opts.map(([v, t]) =>
				`<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`).join('') +
				`</select></label>`;
		}
		return `<label class="ctl rng">${it.label}` +
			`<input type="range" ${tag} min="${it.min}" max="${it.max}" step="${it.step}" value="${val}">` +
			`<output id="${id}_v">${val}${it.unit || ''}</output></label>`;
	}

	function buildPanel() {
		const m = M();
		for (const g of PANEL) $('p_' + g.id).innerHTML = g.items.map(it => control(it, m[it.k], 'm')).join('');
		$('p_ink').innerHTML = INK.map(it => control(it, S.ink[it.k], 'ink')).join('');

		document.querySelectorAll('[data-ns]').forEach(el => {
			const ns = el.dataset.ns, k = el.dataset.k;
			const on = () => {
				const v = el.type === 'checkbox' ? el.checked
					: el.type === 'text' ? el.value
						: el.tagName === 'SELECT' ? (/^-?\d+$/.test(el.value) ? +el.value : el.value)
							: num(el.value, 0);
				if (ns === 'ink') S.ink[k] = v; else S.m[k] = v;
				const out = $(`${ns}_${k}_v`);
				const sp = spec(ns, k);
				if (out) out.value = v + (sp && sp.unit ? sp.unit : '');
				paint(); save();
			};
			el.oninput = on;
			el.onchange = on;
		});
	}

	function syncPanel() {
		const m = M();
		document.querySelectorAll('[data-ns]').forEach(el => {
			const ns = el.dataset.ns, k = el.dataset.k;
			const v = ns === 'ink' ? S.ink[k] : m[k];
			if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
			const out = $(`${ns}_${k}_v`);
			const sp = spec(ns, k);
			if (out) out.value = v + (sp && sp.unit ? sp.unit : '');
		});
	}

	/* ---------------------------------------------------------------- data */

	function rebuild() {
		list = Model.plates(S.year, { rawUnits: S.rawUnits });
		data = new Map(list.map(p => [p.id, p]));
		if (!data.has(S.place)) S.place = list.length ? list[0].id : null;
		plate = S.place ? data.get(S.place) : null;
	}

	// `ink` on the face is the colour it is printed in; the press is `press`
	const opts = extra => Object.assign({}, M(), {
		press: S.ink.on ? S.ink : null,
	}, extra || {});

	// What faces.js needs to set the four sides. Only what the two faces have
	// any business sharing is handed over — the type, the colour, the press,
	// the fineness, what the money is called — and named one by one rather
	// than by spreading the bed's settings across it. Spread, this face's own
	// margin and its own column split silently became the stretcher's, and the
	// sides came out set to a face they are not.
	const sideOpts = o => ({
		ppmm: o.ppmm, clay: o.clay, ink: o.ink, press: o.press,
		display: o.display, text: o.text, figFace: o.figFace,
		mark: o.mark, markSize: o.markSize, markGap: o.markGap,
		nameSize: o.nameSize,
		rows: S.rows, course: S.course, sides: S.sides, nameOn: S.nameOn,
		goodsSize: S.goodsSize, figSize: S.figSize, heads: S.heads,
		figuresOn: S.figuresOn, currency: S.currency,
		fold: S.fold, cut: S.cut, panelNames: S.panelNames,
		bedOn: 'full',
	});

	const courses = () => AE.Stapel.Faces.courses(plate, Math.max(1, S.rows), S.sides, 0, S.heads).length;

	/* -------------------------------------------------------------- canvas */

	// what is on the stage, in millimetres — one face, or the whole net
	const sheet = () => S.view === 'net'
		? { w: Net.SHEET.w, h: Net.SHEET.h }
		: { w: Bed.BED.l, h: Bed.BED.d };

	function fit() {
		const wrap = $('canvasWrap'), pad = 56;
		const s = sheet();
		zoom = Math.max(0.2, Math.min(9,
			Math.min((wrap.clientWidth - pad) / s.w, (wrap.clientHeight - pad) / s.h)));
		$('zoom').value = Math.round(zoom * 100);
		$('zoomV').value = Math.round(zoom * 100) + '%';
	}

	// the faces are drawn at a working fineness and put on the screen at the
	// zoom asked for, so the sketch never inks more pixels than it has to
	function render() {
		if (!plate) return;
		const o = opts({ ppmm: 8 });
		const { canvas: bed, at } = Bed.draw(plate, o);
		let img = bed, net = null;
		if (S.view === 'net') {
			net = Net.draw(plate, sideOpts(o), bed);
			img = net.canvas;
		}

		const cv = $('stage');
		const s = sheet();
		const w = Math.round(s.w * zoom), h = Math.round(s.h * zoom);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		cv.style.width = w + 'px'; cv.style.height = h + 'px';
		const x = cv.getContext('2d');
		x.imageSmoothingQuality = 'high';
		x.drawImage(img, 0, 0, cv.width, cv.height);
		foot(at, net);
	}

	function paint() {
		clearTimeout(inkT);
		inkT = setTimeout(render, S.ink.on ? 60 : 0);
		side();
	}

	function foot(at, net) {
		const m = M();
		const over = at.slack < 0;
		const s = sheet();
		$('stageFoot').innerHTML =
			`<span>${net ? 'the sheet' : 'the face'} <b>${s.w} × ${s.h}</b> mm</span>` +
			`<span>at ${S.exPpmm} px/mm <b>${Math.round(s.w * S.exPpmm)} × ${Math.round(s.h * S.exPpmm)}</b> px</span>` +
			(net ? `<span>course <b>${net.course + 1}</b> of <b>${net.courses}</b>` +
				` — <b>${net.load.front.length + net.load.back.length}</b> goods on it</span>` : '') +
			`<span class="${over ? 'bad' : ''}">${over
				? `<b>${Math.abs(at.slack).toFixed(1)} mm</b> off the face`
				: `<b>${at.slack.toFixed(1)} mm</b> of white left on the face`}</span>` +
			(at.shipsText ? `<span>${esc(at.shipsText)}</span>` : `<span class="warn">no ships counted</span>`) +
			`<span>Werth <b>${Model.figure(plate.total)}</b> ${esc(m.mark)}</span>`;
	}

	/* ----------------------------------------------------------------- side */

	function picker() {
		const q = $('placeSearch').value.trim().toLowerCase();
		const rows = list.filter(p => !q || p.title.toLowerCase().includes(q));
		$('picker').innerHTML = rows.map(p => {
			const s = Bed.shipsOf(S.year, p.id);
			return `<button data-pick="${esc(p.id)}" class="${p.id === S.place ? 'on' : ''}">` +
				`<span>${esc(p.title)}</span>` +
				`<span class="n">${s ? '⚓ ' + Model.figure(s.ships_total) + ' · ' : ''}${Model.figure(p.total)}</span></button>`;
		}).join('') || '<p class="hint">nothing under that name.</p>';
		const on = $('picker').querySelector('.on');
		if (on && !q) on.scrollIntoView({ block: 'nearest' });
	}

	// how many courses this place stands in, at the setting in hand — the top
	// is the first of them, and it is the one the bed belongs to
	function bounds() {
		const n = courses();
		S.course = Math.max(0, Math.min(n - 1, S.course));
		$('course').max = n - 1;
		$('course').value = S.course;
		$('courseV').value = `${S.course + 1} of ${n}`;
	}

	function side() {
		if (!plate) return;
		bounds();
		$('faceName').textContent = plate.title;
		const at = list.findIndex(p => p.id === S.place);
		$('rank').textContent = `${at + 1} of ${list.length} by Werth`;

		const s = Bed.shipsOf(S.year, plate.id);
		$('shipsPanel').innerHTML = s
			? `<div class="good"><span class="g-n">Schiffe angekommen</span><span class="g-v">${Model.figure(s.ships_total)}</span></div>` +
			`<div class="good"><span class="g-n">davon beladen</span><span class="g-v">${Model.figure(s.ships_laden)}</span></div>` +
			`<div class="good"><span class="g-n">leer</span><span class="g-v">${Model.figure(s.ships_empty)}</span></div>` +
			`<div class="good"><span class="g-n">Lasten</span><span class="g-v">${Model.figure(s.capacity)}</span></div>` +
			`<div class="good"><span class="g-n">Mann</span><span class="g-v">${Model.figure(s.crew)}</span></div>` +
			`<div class="good"><span class="g-n">Werth der Ladung</span><span class="g-v">${Model.figure(s.cargo_value)}</span></div>` +
			`<p class="hint">the goods itemised here come to ${Model.figure(plate.full)}.</p>`
			: '<p class="hint">the harbour table does not break this place out.</p>';
	}

	/* --------------------------------------------------------------- export */

	async function exportPng() {
		const o = opts({ ppmm: S.exPpmm, clay: S.white ? '#ffffff' : M().clay });
		const bed = Bed.draw(plate, o).canvas;
		// the net comes off as one sheet — the four sides and the top in the
		// arrangement they would be cut and folded in
		const canvas = S.view === 'net' ? Net.draw(plate, sideOpts(o), bed).canvas : bed;
		const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		const what = S.view === 'net' ? `netz-c${S.course + 1}` : 'deckel';
		a.download = `bremen-${S.year}-${S.place}-${what}-${canvas.width}x${canvas.height}.png`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 4000);
		toast(`${canvas.width} × ${canvas.height} png`);
	}

	/* ------------------------------------------------------------------- ui */

	function step(d) {
		const at = list.findIndex(p => p.id === S.place);
		const next = list[Math.max(0, Math.min(list.length - 1, at + d))];
		if (!next || next.id === S.place) return;
		S.place = next.id; plate = next;
		picker(); paint(); save();
	}

	function wire() {
		$('yearSel').innerHTML = Model.years().map(y => `<option>${y}</option>`).join('');
		$('yearSel').value = S.year;
		$('yearSel').onchange = e => { S.year = e.target.value; rebuild(); picker(); paint(); save(); };
		$('rawUnits').onchange = e => { S.rawUnits = e.target.checked; rebuild(); picker(); paint(); save(); };

		$('placeSearch').oninput = picker;
		$('picker').onclick = e => {
			const b = e.target.closest('[data-pick]'); if (!b) return;
			S.place = b.dataset.pick; plate = data.get(S.place);
			picker(); paint(); save();
		};
		$('prev').onclick = () => step(-1);
		$('next').onclick = () => step(1);

		// --- the brick round the top
		const view = v => {
			S.view = v;
			$('vTop').classList.toggle('on', v === 'top');
			$('vNet').classList.toggle('on', v === 'net');
			$('exportPng').textContent = v === 'net' ? 'export the sheet' : 'export the top';
			if (fitted) fit();
			paint(); save();
		};
		$('vTop').onclick = () => view('top');
		$('vNet').onclick = () => view('net');

		$('rows').oninput = e => {
			S.rows = Math.max(1, Math.min(8, num(e.target.value, 3)));
			$('rowsV').value = S.rows;
			bounds(); paint(); save();
		};
		$('course').oninput = e => {
			S.course = Math.max(0, num(e.target.value, 0));
			$('courseV').value = S.course + 1;
			paint(); save();
		};
		$('sides').onchange = e => { S.sides = +e.target.value; bounds(); paint(); save(); };
		for (const k of ['figuresOn', 'currency', 'nameOn']) {
			$(k).onchange = e => { S[k] = e.target.value; paint(); save(); };
		}
		for (const k of ['fold', 'cut', 'panelNames', 'heads']) {
			$(k).onchange = e => { S[k] = e.target.checked; paint(); save(); };
		}
		for (const k of ['goodsSize', 'figSize']) {
			$(k).oninput = e => {
				S[k] = num(e.target.value, 50);
				$(k + 'V').value = S[k] + '%';
				paint(); save();
			};
		}

		$('zoom').oninput = e => {
			zoom = num(e.target.value, 400) / 100; fitted = false;
			$('zoomV').value = Math.round(zoom * 100) + '%'; render();
		};
		$('zoomFit').onclick = () => { fitted = true; fit(); render(); };
		$('zoom1').onclick = () => { fitted = false; zoom = 1; $('zoom').value = 100; $('zoomV').value = '100%'; render(); };

		$('inkOn').onchange = e => { S.ink.on = e.target.checked; paint(); save(); };
		$('reseed').onclick = () => { S.ink.seed = 1 + ((Math.random() * 99999) | 0); paint(); toast('seed ' + S.ink.seed); };
		$('resetInk').onclick = () => {
			const on = S.ink.on;
			S.ink = Object.assign({}, Ink.DEFAULTS, { on });
			syncPanel(); paint(); save();
		};
		$('reset').onclick = () => { S.m = {}; buildPanel(); paint(); save(); toast('back to the sketch’s own setting'); };

		$('exWhite').onchange = e => { S.white = e.target.checked; save(); };
		$('exPpmm').onchange = e => { S.exPpmm = num(e.target.value, 24); paint(); save(); };
		$('exportPng').onclick = exportPng;

		// what the sketch settled on, in the shape faces.js takes it
		$('copySettings').onclick = async () => {
			const txt = JSON.stringify(S.m, null, '\t');
			try { await navigator.clipboard.writeText(txt); toast('the settings are on the clipboard'); }
			catch (e) { console.log(txt); toast('written to the console'); }
		};

		window.addEventListener('keydown', e => {
			if (/input|select|textarea/i.test(e.target.tagName)) return;
			if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); step(1); }
			else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); step(-1); }
		});
		window.addEventListener('resize', () => { if (fitted) { fit(); render(); } });
	}

	/* ----------------------------------------------------------------- boot */

	async function boot() {
		if (!window.HANDEL) { document.body.innerHTML = '<p style="padding:40px">the volumes did not load.</p>'; return; }

		try {
			const jobs = [];
			for (const f of Plate.FACES) {
				for (const [w] of WEIGHTS) jobs.push(document.fonts.load(`${w} 24px ${f.css}`).catch(() => { }));
				jobs.push(document.fonts.load(`italic 400 12px ${f.css}`).catch(() => { }));
			}
			await Promise.all(jobs);
			await document.fonts.ready;
		} catch (e) { }

		try {
			const kept = JSON.parse(localStorage.getItem(KEY));
			if (kept) {
				Object.assign(S, kept);
				S.ink = Object.assign({}, Ink.DEFAULTS, kept.ink);
				S.m = kept.m || {};
			}
		} catch (e) { }

		const years = Model.years();
		if (!years.includes(S.year)) S.year = years[0];
		rebuild();
		if (!plate) { document.body.innerHTML = '<p style="padding:40px">that volume has no places.</p>'; return; }

		$('exPpmm').value = S.exPpmm;
		$('exWhite').checked = S.white;
		$('inkOn').checked = S.ink.on;
		$('rows').value = S.rows; $('rowsV').value = S.rows;
		$('sides').value = S.sides;
		$('nameOn').value = S.nameOn;
		$('figuresOn').value = S.figuresOn;
		$('currency').value = S.currency;
		for (const k of ['fold', 'cut', 'panelNames', 'heads']) $(k).checked = S[k];
		$('goodsSize').value = S.goodsSize; $('goodsSizeV').value = S.goodsSize + '%';
		$('figSize').value = S.figSize; $('figSizeV').value = S.figSize + '%';
		$('vTop').classList.toggle('on', S.view === 'top');
		$('vNet').classList.toggle('on', S.view === 'net');
		$('exportPng').textContent = S.view === 'net' ? 'export the sheet' : 'export the top';
		wire();
		buildPanel();
		picker();
		fitted = true; fit();
		paint();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();

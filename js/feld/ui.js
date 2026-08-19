/* ui.js — das Feld, where every place is given the same bricks.
 *
 * der Stapel is a page about height: a stack stands as high as the place had
 * goods to send, and from above the yard is a ranking whether or not one was
 * wanted. This page takes the height away. Every place gets the same X bricks
 * of Y goods, filled from the top of whatever the filtering has left, and its
 * name goes on a side rather than over the plan. What is left to read is how
 * many places there were, and what each of them chiefly sent.
 *
 * The cut is the whole argument of the page, so the panels say what it costs:
 * how many goods are being left on the floor, and what share of the Werth the
 * few on the faces actually hold.
 */
(function () {
	'use strict';

	const AE = window.AE;
	const { Model, Plate, Ink } = AE.Tafeln;
	const { Faces, Scene } = AE.Stapel;
	const { Bricks } = AE.Feld;
	const $ = id => document.getElementById(id);
	// v2: the settings became overrides on faces.js rather than copies of it
	const KEY = 'ae.feld.v2';

	let list = [], data = new Map();

	const S = {
		year: null, places: [], rawUnits: false,
		cats: Model.DEFAULT_CATS.slice(),
		exclude: [], minValue: 0,
		bricks: 1, rows: 3,
		gap: 2, outline: true, nameOn: 'near', pallet: false, order: 'werth',
		nameSize: 23,
		// overrides on faces.js and nothing more, so that a decision taken
		// there arrives here without being copied
		face: {},
		clay: '#5e3321', ink: '#d2c3b9',
		ppmm: 6,
		layout: { cols: 6, gapX: 60, gapZ: 60, stagger: 0, jitter: 0, turn: 0, seed: 7 },
		// overrides on ink.js, the same way the faces are overrides on faces.js
		press: { on: false },
	};

	const LAYOUT = { cols: 6, gapX: 60, gapZ: 60, stagger: 0, jitter: 0, turn: 0, seed: 7 };

	const { FACE, WEIGHTS } = AE.Stapel.Panel;

	const num = (v, fb) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fb);
	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

	function toast(msg) {
		const t = $('toast');
		t.textContent = msg;
		t.classList.add('show');
		clearTimeout(toast.t);
		toast.t = setTimeout(() => t.classList.remove('show'), 2400);
	}

	const chosen = () => S.places.map(id => data.get(id)).filter(Boolean);

	// how many goods a place actually gets to show
	const per = () => Math.max(1, S.bricks) * Math.max(1, S.rows);

	// The order the bricks are set out in. Picked order is the order of the
	// list, which is by Werth, so left to right the field reads as a ranking —
	// which is sometimes exactly what is not wanted, because a ranking is an
	// argument, and this page was made to stop the stacks making one.
	function ordered() {
		const ps = chosen().slice();
		if (S.order === 'name') return ps.sort((a, b) => a.title.localeCompare(b.title, 'de'));
		if (S.order === 'goods') return ps.sort((a, b) => b.rows.length - a.rows.length);
		if (S.order === 'werth') return ps.sort((a, b) => (b.total || 0) - (a.total || 0));
		if (S.order === 'shuffle') {
			// Fisher–Yates off the field's own seed, so `shuffle` deals the
			// bricks again as well as knocking them about
			let x = (S.layout.seed >>> 0) || 1;
			const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
			for (let i = ps.length - 1; i > 0; i--) {
				const j = Math.floor(rnd() * (i + 1));
				[ps[i], ps[j]] = [ps[j], ps[i]];
			}
			return ps;
		}
		return ps;                                   // as picked
	}

	const faceOpts = () => Object.assign({
		ppmm: S.ppmm, rows: S.rows, bricks: S.bricks,
		clay: S.clay, ink: S.ink,
		gap: S.gap, outline: S.outline, nameOn: S.nameOn, pallet: S.pallet,
		nameSize: S.nameSize,
		layout: S.layout,
		press: S.press.on ? Object.assign({}, Ink.DEFAULTS, S.press) : null,
	}, S.face);

	/* ---------------------------------------------------------------- data */

	function rebuild() {
		list = Model.plates(S.year, {
			rawUnits: S.rawUnits, cats: S.cats, exclude: S.exclude, minValue: S.minValue,
		});
		data = new Map(list.map(p => [p.id, p]));
		S.places = S.places.filter(id => data.has(id));
		if (!S.places.length && list.length) S.places = list.slice(0, 12).map(p => p.id);
	}

	function stand(reframe) {
		const ps = ordered();
		if (!ps.length) return;
		const b = Scene.build(ps, faceOpts());
		if (reframe) Scene.frame();

		const n = per();
		// what is actually on the faces, against what the places had to give
		const shownRows = ps.reduce((s, p) => s + Math.min(n, p.rows.length), 0);
		const leftOut = ps.reduce((s, p) => s + Math.max(0, p.rows.length - n), 0);
		const shownWerth = ps.reduce((s, p) =>
			s + Bricks.take(p, { bricks: S.bricks, rows: S.rows })
				.reduce((t, r) => t + (r.value || 0), 0), 0);
		const full = ps.reduce((s, p) => s + (p.full || 0), 0);
		const mb = b.bytes / 1048576;

		cats();
		goodsPanel();

		// the honest reckoning of the cut: a few goods a place hold most of what
		// it sent almost everywhere, and saying so is the point of the page —
		// the tail is long but it is not heavy
		$('share').textContent = full
			? `the ${n} on the faces hold ${(shownWerth / full * 100).toFixed(1)}% of the Werth — ` +
			`${Model.figure(Math.round(shownWerth))} of ${Model.figure(full)}`
			: '';

		$('foot').innerHTML =
			`<span class="tally"><b>${b.bricks}</b> brick${b.bricks === 1 ? '' : 's'}</span>` +
			`<span><b>${b.stacks}</b> place${b.stacks === 1 ? '' : 's'} — <b>${S.bricks} × ${S.rows}</b> each</span>` +
			`<span><b>${shownRows}</b> goods shown, <b>${leftOut}</b> left on the floor</span>` +
			`<span>field <b>${Math.round(b.field.w)} × ${Math.round(b.field.d)}</b> mm · <b>${Math.round(b.height)}</b> mm high</span>` +
			`<span>Werth <b>${Model.figure(Math.round(shownWerth))}</b> Ld'or of <b>${Model.figure(full)}</b></span>` +
			(b.onPallet
				? `<span class="${b.fits ? '' : 'bad'}">${b.fits ? 'on the pallet' : 'hangs off the pallet'}</span>`
				: '') +
			`<span class="${mb > 400 ? 'bad' : mb > 200 ? 'warn' : ''}">${b.textures} faces · ${mb.toFixed(0)} MB</span>`;
		side();
	}

	/* ---------------------------------------------------------------- side */

	// the six printed classes plus what could not be placed, each with what it
	// holds across the places in hand. Turning one off here does not shorten a
	// brick — it changes which goods are the largest ones left, and so what the
	// faces carry.
	function cats() {
		const tally = {};
		for (const p of chosen()) for (const k in p.tally) tally[k] = (tally[k] || 0) + p.tally[k];
		const on = new Set(S.cats);
		$('cats').innerHTML = Model.CATEGORIES.map(c => {
			const n = tally[c.key] || 0;
			return `<label class="${on.has(c.key) ? '' : 'off'} ${n ? '' : 'none'}">` +
				`<input type="checkbox" data-cat="${c.key}"${on.has(c.key) ? ' checked' : ''}>` +
				`<span>${esc(c.de)}</span><span class="n">${n}</span></label>`;
		}).join('');
	}

	function picker() {
		const q = $('placeSearch').value.trim().toLowerCase();
		const on = new Set(S.places);
		const n = per();
		const rows = list.filter(p => !q || p.title.toLowerCase().includes(q));
		$('picker').innerHTML = rows.map(p =>
			`<button data-pick="${esc(p.id)}" class="${on.has(p.id) ? 'on' : ''}">` +
			`<span>${esc(p.title)}</span>` +
			`<span class="n">${Math.min(n, p.rows.length)} of ${p.rows.length}</span></button>`
		).join('') || '<p class="hint">nothing under that name.</p>';
		$('chosenCount').textContent = `${S.places.length} of ${list.length} standing`;
	}

	// The Werth floor is not a linear thing — the useful steps run over three
	// orders of magnitude — so the slider walks a list rather than a range.
	const FLOOR = [0, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

	// Every good standing in the yard, biggest Werth first, each one strikable
	// everywhere at once. Here striking one out never shortens a brick: it only
	// promotes the next good up onto the face it vacated.
	function goodsPanel() {
		const q = $('goodSearch').value.trim().toLowerCase();
		const by = new Map();
		for (const p of chosen()) {
			for (const r of p.rows) {
				const g = by.get(r.article) || { article: r.article, value: 0, places: 0 };
				g.value += r.value || 0; g.places++;
				by.set(r.article, g);
			}
		}
		const rows = [...by.values()]
			.filter(g => !q || g.article.toLowerCase().includes(q))
			.sort((a, b) => b.value - a.value);

		$('excluded').innerHTML = S.exclude.length
			? S.exclude.map(a =>
				`<div class="laid-row struck" data-restore="${esc(a)}">` +
				`<span class="nm">${esc(a)}</span><button class="x" title="put it back">+</button></div>`).join('')
			: '<p class="hint">nothing struck out.</p>';
		$('excludedCount').textContent = S.exclude.length ? `${S.exclude.length} struck out` : '';

		$('goodsList').innerHTML = rows.slice(0, 200).map(g =>
			`<div class="laid-row" data-strike="${esc(g.article)}">` +
			`<span class="nm">${esc(g.article)}</span>` +
			`<span class="pos">${Model.figure(g.value)}</span>` +
			`<button class="x" title="strike it from every table">×</button></div>`
		).join('') || '<p class="hint">nothing under that name.</p>';
	}

	function side() {
		const ps = ordered();

		$('chosenList').innerHTML = ps.map(p =>
			`<div class="laid-row" data-drop="${esc(p.id)}"><span class="nm">${esc(p.title)}</span>` +
			`<span class="pos">${Math.min(per(), p.rows.length)}/${p.rows.length}</span>` +
			`<button class="x" title="take it out">×</button></div>`
		).join('') || '<p class="hint">nothing standing yet.</p>';

		// what every place is carrying, place by place, in the order they stand
		const line = r => `<div><span>${esc(r.article)}</span><b>${Model.figure(r.value)}</b></div>`;
		$('courses').innerHTML = ps.slice(0, 40).map(p => {
			const take = Bricks.take(p, { bricks: S.bricks, rows: S.rows });
			const rest = Math.max(0, p.rows.length - take.length);
			return `<div class="course"><span class="c-n">${esc(p.title)}</span><div class="c-g">` +
				take.map(line).join('') +
				(rest ? `<div class="c-back">— ${rest} more left on the floor —</div>` : '') +
				`</div></div>`;
		}).join('') + (ps.length > 40 ? `<p class="hint">and ${ps.length - 40} more.</p>` : '');
	}

	/* ------------------------------------------------------------------ ui */

	function wire() {
		$('yearSel').innerHTML = Model.years().map(y => `<option>${y}</option>`).join('');
		$('yearSel').value = S.year;
		$('yearSel').onchange = e => { S.year = e.target.value; rebuild(); picker(); stand(true); save(); };
		$('rawUnits').onchange = e => { S.rawUnits = e.target.checked; rebuild(); picker(); stand(false); save(); };

		const redo = reframe => { stand(reframe); save(); };

		$('cats').onchange = e => {
			const b = e.target.closest('[data-cat]'); if (!b) return;
			const k = b.dataset.cat;
			const at = S.cats.indexOf(k);
			if (at >= 0) S.cats.splice(at, 1); else S.cats.push(k);
			if (!S.cats.length) S.cats = [k];        // never leave a brick with nothing on it
			rebuild(); picker(); redo(false);
		};
		$('catsAll').onclick = () => {
			S.cats = Model.CATEGORIES.map(c => c.key);
			rebuild(); picker(); redo(false);
		};
		$('catsDefault').onclick = () => {
			S.cats = Model.DEFAULT_CATS.slice();
			rebuild(); picker(); redo(false);
		};

		$('goodSearch').oninput = goodsPanel;
		$('goodsList').onclick = e => {
			const row = e.target.closest('[data-strike]'); if (!row) return;
			const a = row.dataset.strike;
			if (!S.exclude.includes(a)) S.exclude.push(a);
			rebuild(); picker(); redo(false);
		};
		$('excluded').onclick = e => {
			const row = e.target.closest('[data-restore]'); if (!row) return;
			S.exclude = S.exclude.filter(a => a !== row.dataset.restore);
			rebuild(); picker(); redo(false);
		};
		$('clearStruck').onclick = () => { S.exclude = []; rebuild(); picker(); redo(false); };
		$('minValue').oninput = e => {
			S.minValue = FLOOR[Math.max(0, Math.min(FLOOR.length - 1, +e.target.value))];
			$('minValueV').value = S.minValue ? Model.figure(S.minValue) + " Ld'or" : 'no floor';
			rebuild(); picker(); redo(false);
		};

		$('placeSearch').oninput = picker;
		$('picker').onclick = e => {
			const b = e.target.closest('[data-pick]'); if (!b) return;
			const id = b.dataset.pick;
			const at = S.places.indexOf(id);
			if (at >= 0) { if (S.places.length > 1) S.places.splice(at, 1); }
			else S.places.push(id);
			picker(); redo(true);
		};
		$('chosenList').onclick = e => {
			const row = e.target.closest('[data-drop]'); if (!row) return;
			if (S.places.length <= 1) return;
			S.places = S.places.filter(id => id !== row.dataset.drop);
			picker(); redo(true);
		};
		// Every place carries three faces of its own — the goods, the figures
		// and the name — and none of them can be shared, so the texture goes up
		// with the count of places and nothing else. A field of all 122 at the
		// fineness a single brick wants would be most of a gigabyte, so picking
		// a large field drops the fineness with it. It can be put back by hand.
		const coarsen = n => {
			const want = n > 60 ? 3 : n > 24 ? 4 : n > 8 ? 5 : S.ppmm;
			if (S.ppmm > want) { S.ppmm = want; sync(); }
		};

		$('pickTop').onclick = () => {
			const n = num($('pickN').value, 12);
			S.places = list.slice(0, Math.max(1, n)).map(p => p.id);
			coarsen(S.places.length);
			picker(); redo(true);
		};
		$('pickAll').onclick = () => {
			S.places = list.map(p => p.id);
			coarsen(S.places.length);
			picker(); redo(true);
			toast(`${S.places.length} places standing`);
		};
		$('clearPicked').onclick = () => { S.places = S.places.slice(0, 1); picker(); redo(true); };

		$('bricks').oninput = e => {
			S.bricks = Math.max(1, Math.min(6, num(e.target.value, 1)));
			$('bricksV').value = S.bricks; picker(); redo(true);
		};
		$('rows').oninput = e => {
			S.rows = Math.max(1, Math.min(8, num(e.target.value, 3)));
			$('rowsV').value = S.rows; picker(); redo(false);
		};
		$('gap').oninput = e => { S.gap = num(e.target.value, 2); $('gapV').value = S.gap; redo(false); };
		$('outline').onchange = e => { S.outline = e.target.checked; redo(false); };
		$('nameOn').onchange = e => { S.nameOn = e.target.value; redo(false); };
		$('pallet').onchange = e => { S.pallet = e.target.checked; redo(true); };
		$('fitPallet').onclick = () => {
			const f = Scene.fitToPallet(S.places.length);
			if (!f) { toast(`${S.places.length} bricks will not go on one pallet`); return; }
			S.layout.cols = f.cols; S.layout.gapX = f.gapX; S.layout.gapZ = f.gapZ;
			sync(); redo(true);
			toast(`${f.cols} across, gaps ${f.gapX} × ${f.gapZ} mm`);
		};
		$('order').onchange = e => { S.order = e.target.value; redo(true); };
		$('nameSize').oninput = e => {
			S.nameSize = num(e.target.value, 23);
			$('nameSizeV').value = S.nameSize + ' mm';
			redo(false);
		};
		$('clay').oninput = e => { S.clay = e.target.value; redo(false); };
		$('inkCol').oninput = e => { S.ink = e.target.value; redo(false); };
		$('ppmm').oninput = e => { S.ppmm = num(e.target.value, 6); $('ppmmV').value = S.ppmm + ' px/mm'; redo(false); };

		// --- the field
		const fld = (id, key, unit) => $(id).oninput = e => {
			S.layout[key] = num(e.target.value, S.layout[key]);
			$(id + 'V').value = S.layout[key] + (unit || '');
			redo(true);
		};
		fld('cols', 'cols', '');
		fld('gapX', 'gapX', ' mm');
		fld('gapZ', 'gapZ', ' mm');
		fld('stagger', 'stagger', '%');
		fld('jitter', 'jitter', ' mm');
		fld('turn', 'turn', '°');
		$('reshuffle').onclick = () => {
			S.layout.seed = 1 + ((Math.random() * 99999) | 0);
			redo(true);
			toast(S.order === 'shuffle' ? 'dealt again — seed ' + S.layout.seed : 'seed ' + S.layout.seed);
		};

		const Panel = AE.Stapel.Panel;
		const panels = () => {
			Panel.build('p_face', FACE, 'face', S.face, () => redo(false));
			Panel.build('p_press', Panel.PRESS, 'press', S.press, () => redo(false), Ink.DEFAULTS);
		};
		panels();
		$('resetFace').onclick = () => {
			S.face = {}; panels(); redo(false);
			toast('the faces back to what faces.js says');
		};
		$('resetPress').onclick = () => {
			const on = S.press.on;
			S.press = { on }; panels(); redo(false);
			toast('the press back to its own setting');
		};

		$('pressOn').onchange = e => { S.press.on = e.target.checked; redo(false); };
		$('reseed').onclick = () => { S.press.seed = 1 + ((Math.random() * 99999) | 0); redo(false); };

		$('vPlan').onclick = () => { Scene.view(0, 0, true); Scene.frame(); };
		$('vFront').onclick = () => { Scene.view(0, 0.12, false); Scene.frame(); };
		$('vCorner').onclick = () => { Scene.view(-0.52, 0.17, false); Scene.frame(); };
		$('vFrame').onclick = () => Scene.frame();
		$('exportPng').onclick = () => {
			const a = document.createElement('a');
			a.href = Scene.snapshot();
			a.download = `${S.year}-feld-${S.places.length}.png`;
			a.click();
			toast('view saved');
		};
	}

	function sync() {
		$('bricks').value = S.bricks; $('bricksV').value = S.bricks;
		$('rows').value = S.rows; $('rowsV').value = S.rows;
		$('gap').value = S.gap; $('gapV').value = S.gap;
		$('ppmm').value = S.ppmm; $('ppmmV').value = S.ppmm + ' px/mm';
		$('outline').checked = S.outline;
		$('nameOn').value = S.nameOn;
		$('pallet').checked = S.pallet;
		$('order').value = S.order;
		$('minValue').max = FLOOR.length - 1;
		$('minValue').value = Math.max(0, FLOOR.indexOf(S.minValue));
		$('minValueV').value = S.minValue ? Model.figure(S.minValue) + " Ld'or" : 'no floor';
		$('nameSize').value = S.nameSize; $('nameSizeV').value = S.nameSize + ' mm';
		$('clay').value = S.clay;
		$('inkCol').value = S.ink;
		$('rawUnits').checked = S.rawUnits;
		$('pressOn').checked = S.press.on;
		const L = S.layout;
		$('cols').value = L.cols; $('colsV').value = L.cols;
		$('gapX').value = L.gapX; $('gapXV').value = L.gapX + ' mm';
		$('gapZ').value = L.gapZ; $('gapZV').value = L.gapZ + ' mm';
		$('stagger').value = L.stagger; $('staggerV').value = L.stagger + '%';
		$('jitter').value = L.jitter; $('jitterV').value = L.jitter + ' mm';
		$('turn').value = L.turn; $('turnV').value = L.turn + '°';
	}

	/* ---------------------------------------------------------------- boot */

	async function boot() {
		if (!window.HANDEL) { document.body.innerHTML = '<p style="padding:40px">the volumes did not load.</p>'; return; }
		if (!window.THREE) { document.body.innerHTML = '<p style="padding:40px">three.js did not load.</p>'; return; }

		// a canvas texture takes whatever face is resident when it is drawn,
		// so the faces have to be in before the first brick is made
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
			// a view saved before the stock was darkened carries the old
			// bright terracotta and its black ink, and a stored value beats
			// a default — so the two nobody chose are dropped
			if (kept && kept.clay === '#d98741') delete kept.clay;
			if (kept && kept.ink === '#12100e') delete kept.ink;
			if (kept) {
				Object.assign(S, kept);
				S.layout = Object.assign({}, LAYOUT, kept.layout);
				S.press = Object.assign({ on: false }, kept.press);
				S.face = kept.face || {};
				if (!Array.isArray(S.places)) S.places = [];
				if (!Array.isArray(S.cats) || !S.cats.length) S.cats = Model.DEFAULT_CATS.slice();
				if (!Array.isArray(S.exclude)) S.exclude = [];
			}
		} catch (e) { }

		const years = Model.years();
		if (!years.includes(S.year)) S.year = years[0];
		rebuild();
		if (!chosen().length) { document.body.innerHTML = '<p style="padding:40px">that volume has no places.</p>'; return; }

		Scene.init($('stage'), $('canvasWrap'));
		Scene.setBuilder(Bricks.pile);      // the same bricks for everyone, not a stack apiece
		Scene.setFramePad(1.1);             // a field one brick high does not want the air a yard does
		Scene.view(-0.52, 0.17, false);     // low, because everything worth reading is on a side
		wire(); sync(); picker(); stand(true);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();

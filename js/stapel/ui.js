/* ui.js — the yard where the stacks are stood up.
 *
 * One place, or as many as are picked. Nothing about a stack is chosen: the
 * height is the number of goods that place sent, divided by what fits on a
 * face. What *is* chosen is the field they stand on — how many to a row and
 * how far apart — and from straight above that field is the comparison.
 */
(function () {
	'use strict';

	const AE = window.AE;
	const { Model, Plate, Ink } = AE.Tafeln;
	const { Faces, Scene } = AE.Stapel;
	const $ = id => document.getElementById(id);
	// v3: the settings became overrides on faces.js rather than copies of it,
	// so an older save would go on overriding what faces.js now says
	const KEY = 'ae.stapel.v3';

	let list = [], data = new Map();

	const S = {
		year: null, places: [], rawUnits: false,
		cats: Model.DEFAULT_CATS.slice(),
		exclude: [], minValue: 0,
		many: false,
		rows: 3, gap: 2, outline: true, everyFace: true, nameOn: 'none',
		sides: 1, bedOn: 'full', pallet: false, order: 'werth',
		maxBricks: 12,          // 0 stands for as many as the place has goods
		nameSize: 23,
		// Overrides on faces.js, nothing more. What is not here is whatever
		// faces.js says today, so a decision taken there arrives on its own.
		face: {}, bed: {},
		clay: '#d98741', ink: '#12100e',
		ppmm: 8,
		exScope: 'one', exPpmm: 24, exGround: 'clay',
		layout: { cols: 4, gapX: 120, gapZ: 120, stagger: 0, jitter: 0, turn: 0, seed: 7 },
		// overrides on ink.js, the same way the faces are overrides on faces.js
		press: { on: false },
	};

	const { FACE, BED, WEIGHTS } = AE.Stapel.Panel;

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

	// The order the stacks are set out in. The picked order is the order of the
	// list, which is by Werth, so left to right the yard reads as a ranking —
	// which is sometimes exactly what is not wanted, because a ranking is an
	// argument. Shuffled, the field says only how many there are and how far
	// each runs.
	function ordered() {
		const ps = chosen().slice();
		if (S.order === 'name') return ps.sort((a, b) => a.title.localeCompare(b.title, 'de'));
		if (S.order === 'goods') return ps.sort((a, b) => b.rows.length - a.rows.length);
		if (S.order === 'werth') return ps.sort((a, b) => (b.total || 0) - (a.total || 0));
		if (S.order === 'shuffle') {
			// Fisher–Yates off the field's own seed, so `shuffle` deals the
			// stacks again as well as knocking them about
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
		ppmm: S.ppmm, rows: S.rows, clay: S.clay, ink: S.ink,
		gap: S.gap, outline: S.outline, everyFace: S.everyFace, nameOn: S.nameOn,
		sides: S.sides, bedOn: S.bedOn, pallet: S.pallet, maxBricks: S.maxBricks,
		nameSize: S.nameSize,
		layout: S.layout,
		press: S.press.on ? Object.assign({}, Ink.DEFAULTS, S.press) : null,
	}, S.face, S.bed);

	/* --------------------------------------------------------- the panels */

	function panels() {
		const Panel = AE.Stapel.Panel;
		const redraw = () => { stand(false); save(); };
		Panel.build('p_face', FACE, 'face', S.face, redraw);
		Panel.build('p_bed', BED, 'bed', S.bed, redraw);
		Panel.build('p_press', Panel.PRESS, 'press', S.press, redraw, Ink.DEFAULTS);
	}

	/* ---------------------------------------------------------------- data */

	function rebuild() {
		list = Model.plates(S.year, {
			rawUnits: S.rawUnits, cats: S.cats, exclude: S.exclude, minValue: S.minValue,
		});
		data = new Map(list.map(p => [p.id, p]));
		S.places = S.places.filter(id => data.has(id));
		if (!S.places.length && list.length) S.places = [list[0].id];
		if (!S.many) S.places = S.places.slice(0, 1);
	}

	function stand(reframe) {
		const ps = ordered();
		if (!ps.length) return;
		const b = Scene.build(ps, faceOpts());
		if (reframe) Scene.frame();

		const goods = ps.reduce((s, p) => s + p.rows.length, 0);
		const werth = ps.reduce((s, p) => s + (p.total || 0), 0);
		const mb = b.bytes / 1048576;
		cats();
		goodsPanel();

		// what all the filtering together has left of what the places sent —
		// the number to judge a floor by, since cutting the tail off Newyork
		// costs almost nothing and cutting its head off costs everything
		const full = ps.reduce((s, p) => s + (p.full || 0), 0);
		$('share').textContent = full
			? `keeps ${(werth / full * 100).toFixed(1)}% of the Werth — ${Model.figure(werth)} of ${Model.figure(full)}`
			: '';

		// the brick count is the thing that would have to be carried, so it
		// leads — one brick to a course, across every stack in the yard
		$('foot').innerHTML =
			`<span class="tally"><b>${b.bricks}</b> brick${b.bricks === 1 ? '' : 's'}</span>` +
			`<span><b>${b.stacks}</b> stack${b.stacks === 1 ? '' : 's'}</span>` +
			`<span><b>${goods}</b> goods, ${S.rows * S.sides} to a brick${S.sides === 2 ? ' (both sides)' : ''}</span>` +
			(b.stacks === 1
				? `<span>stack <b>${Math.round(b.height)}</b> mm</span>`
				: `<span>tallest <b>${b.tallest}</b> bricks — <b>${Math.round(b.height)}</b> mm · field <b>${Math.round(b.field.w)} × ${Math.round(b.field.d)}</b> mm</span>`) +
			`<span>Werth <b>${Model.figure(werth)}</b> Ld'or</span>` +
			(b.onPallet
				? `<span class="${b.fits ? '' : 'bad'}">${b.fits ? 'on the pallet' : 'hangs off the pallet'}</span>`
				: '') +
			`<span class="${mb > 400 ? 'bad' : mb > 200 ? 'warn' : ''}">${b.textures} faces · ${mb.toFixed(0)} MB</span>`;
		side();
		exFoot();
	}

	/* ---------------------------------------------------------------- side */

	// the six printed classes plus what could not be placed, each with what it
	// holds across the stacks in hand, so turning one off says what it costs
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
		const rows = list.filter(p => !q || p.title.toLowerCase().includes(q));
		$('picker').innerHTML = rows.map(p => {
			const cs = Faces.courses(p, S.rows, S.sides, S.maxBricks, faceOpts().heads).length;
			return `<button data-pick="${esc(p.id)}" class="${on.has(p.id) ? 'on' : ''}">` +
				`<span>${esc(p.title)}</span>` +
				`<span class="n">${p.rows.length} · ${cs}c</span></button>`;
		}).join('') || '<p class="hint">nothing under that name.</p>';
		const el = $('picker').querySelector('.on');
		if (el && !q && !S.many) el.scrollIntoView({ block: 'nearest' });
		$('chosenCount').textContent = S.many ? `${S.places.length} picked` : '';
	}

	// The Werth floor is not a linear thing — the useful steps run over three
	// orders of magnitude — so the slider walks a list rather than a range.
	const FLOOR = [0, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

	// Every good standing in the yard, biggest Werth first, each one strikable
	// everywhere at once. This is the list to cut a place down by hand when a
	// floor is too blunt — Newyork's tail is small goods, but somewhere else
	// the thing making a stack unwieldy is one good you simply do not want.
	function goodsPanel() {
		const q = $('goodSearch').value.trim().toLowerCase();
		const ps = chosen();
		const by = new Map();
		for (const p of ps) {
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
		const ps = chosen();
		// with both sides printed there is no bare face left for the name —
		// unless the Werth has gone round onto the stretcher, which gives the
		// two ends back
		const spent = S.sides === 2 && faceOpts().figuresOn !== 'stretcher';
		$('nameOn').disabled = spent;
		$('nameRow').classList.toggle('spent', spent);
		$('placeName').textContent = S.many
			? (ps.length === 1 ? ps[0].title : `${ps.length} places`)
			: (ps[0] ? ps[0].title : '—');
		$('manyOnly').hidden = !S.many;
		$('oneOnly').hidden = S.many;
		$('manyPick').hidden = !S.many;

		if (S.many) {
			$('chosenList').innerHTML = ps.map(p =>
				`<div class="laid-row" data-drop="${esc(p.id)}"><span class="nm">${esc(p.title)}</span>` +
				`<span class="pos">${Math.ceil(p.rows.length / (S.rows * S.sides))}c</span>` +
				`<button class="x" title="take it out">×</button></div>`
			).join('') || '<p class="hint">nothing picked yet.</p>';
			return;
		}

		const p = ps[0];
		if (!p) return;
		const cs = Faces.courses(p, S.rows, S.sides, S.maxBricks, faceOpts().heads);
		const line = r => `<div><span>${esc(r.article)}</span><b>${Model.figure(r.value)}</b></div>`;
		$('courses').innerHTML = cs.map((load, i) =>
			`<div class="course"><span class="c-n">${i + 1}</span><div class="c-g">` +
			load.front.map(line).join('') +
			(load.back.length ? `<div class="c-back">— the back —</div>` + load.back.map(line).join('') : '') +
			`</div></div>`
		).join('');
	}

	/* --------------------------------------------------------- as files */

	// what the export writes, off the one list in faces.js — the same faces in
	// the same order with the same marks the yard prints and the engraver burns
	function facesOf(plate, o) {
		// a file is named for the mark that is on the face — br.3b and no more,
		// so a folder of them sorts into stacks and reads like the bricks do
		return Faces.faceList(plate, o).map(f => [f.tag, () => f.make()]);
	}

	// what the export is about to write, so the button can say so before it is
	// pressed rather than after
	const exPlates = () => (S.exScope === 'all' ? ordered() : chosen().slice(0, 1));
	function exCount() {
		const o = faceOpts();
		return exPlates().reduce((n, p) => n + facesOf(p, o).length, 0);
	}

	async function exportFaces() {
		// the clay is the brick, not the printing — on paper the same face wants
		// the white the volumes are printed on, so the ground is the export's own
		const o = Object.assign(faceOpts(), {
			ppmm: S.exPpmm,
			clay: S.exGround === 'white' ? '#ffffff' : S.clay,
		});
		const ps = exPlates();
		if (!ps.length) return;

		const btn = $('exportFaces');
		btn.disabled = true;
		let n = 0, total = ps.reduce((s, p) => s + facesOf(p, o).length, 0);
		for (const plate of ps) {
			for (const [name, make] of facesOf(plate, o)) {
				const canvas = make();
				const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				a.download = `${S.year}-${name}.png`;
				a.click();
				setTimeout(() => URL.revokeObjectURL(a.href), 8000);
				// the canvas is a few million pixels and there may be a hundred of
				// them; letting go of each one and giving the browser a beat to
				// take the download is what keeps a long export standing up
				canvas.width = canvas.height = 0;
				btn.textContent = `writing ${++n} of ${total}…`;
				await new Promise(r => setTimeout(r, 140));
			}
		}
		btn.disabled = false;
		exFoot();
		toast(`${total} png${total === 1 ? '' : 's'} at ${S.exPpmm} px/mm`);
	}

	// what a face comes out as at the fineness asked for, and how many there are
	function exFoot() {
		const px = mm => Math.round(mm * S.exPpmm);
		const n = exCount();
		$('exSize').textContent =
			`a stretcher ${px(Faces.BRICK.l)} × ${px(Faces.BRICK.h)} px · ` +
			`a header ${px(Faces.BRICK.d)} × ${px(Faces.BRICK.h)} · ` +
			`a bed ${px(Faces.BRICK.l)} × ${px(Faces.BRICK.d)}`;
		$('exportFaces').textContent = `export the faces — ${n} file${n === 1 ? '' : 's'}`;
	}

	/* ------------------------------------------------------------------ ui */

	function step(d) {
		if (S.many) return;
		const at = list.findIndex(p => p.id === S.places[0]);
		const next = list[Math.max(0, Math.min(list.length - 1, at + d))];
		if (!next || next.id === S.places[0]) return;
		S.places = [next.id];
		picker(); stand(true); save();
	}

	function wire() {
		$('yearSel').innerHTML = Model.years().map(y => `<option>${y}</option>`).join('');
		$('yearSel').value = S.year;
		$('yearSel').onchange = e => { S.year = e.target.value; rebuild(); picker(); stand(true); save(); };
		$('rawUnits').onchange = e => { S.rawUnits = e.target.checked; rebuild(); picker(); stand(false); save(); };

		const redo = reframe => { stand(reframe); save(); };

		$('many').onchange = e => {
			S.many = e.target.checked;
			if (!S.many) S.places = S.places.slice(0, 1);
			// a yard full of stacks at full resolution is a lot of texture,
			// so the default drops when the field opens up
			if (S.many && S.ppmm > 5) { S.ppmm = 4; sync(); }
			picker(); redo(true);
		};

		$('cats').onchange = e => {
			const b = e.target.closest('[data-cat]'); if (!b) return;
			const k = b.dataset.cat;
			const at = S.cats.indexOf(k);
			if (at >= 0) S.cats.splice(at, 1); else S.cats.push(k);
			if (!S.cats.length) S.cats = [k];        // never leave a stack with nothing on it
			rebuild(); picker(); redo(true);
		};
		$('catsAll').onclick = () => {
			S.cats = Model.CATEGORIES.map(c => c.key);
			rebuild(); picker(); redo(true);
		};
		$('catsDefault').onclick = () => {
			S.cats = Model.DEFAULT_CATS.slice();
			rebuild(); picker(); redo(true);
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
			rebuild(); picker(); redo(true);
		};

		$('placeSearch').oninput = picker;
		$('picker').onclick = e => {
			const b = e.target.closest('[data-pick]'); if (!b) return;
			const id = b.dataset.pick;
			if (!S.many) S.places = [id];
			else {
				const at = S.places.indexOf(id);
				if (at >= 0) { if (S.places.length > 1) S.places.splice(at, 1); }
				else S.places.push(id);
			}
			picker(); redo(true);
		};
		$('chosenList').onclick = e => {
			const row = e.target.closest('[data-drop]'); if (!row) return;
			if (S.places.length <= 1) return;
			S.places = S.places.filter(id => id !== row.dataset.drop);
			picker(); redo(true);
		};
		$('pickTop').onclick = () => {
			const n = num($('pickN').value, 8);
			S.places = list.slice(0, Math.max(1, n)).map(p => p.id);
			S.many = true; $('many').checked = true;
			if (S.ppmm > 5) { S.ppmm = 4; sync(); }
			picker(); redo(true);
		};
		$('clearPicked').onclick = () => { S.places = S.places.slice(0, 1); picker(); redo(true); };

		$('prev').onclick = () => step(-1);
		$('next').onclick = () => step(1);

		$('rows').oninput = e => {
			S.rows = Math.max(1, Math.min(8, num(e.target.value, 3)));
			$('rowsV').value = S.rows; picker(); redo(true);
		};
		$('gap').oninput = e => { S.gap = num(e.target.value, 2); $('gapV').value = S.gap; redo(false); };
		$('outline').onchange = e => { S.outline = e.target.checked; redo(false); };
		$('everyFace').onchange = e => { S.everyFace = e.target.checked; redo(false); };
		$('nameOn').onchange = e => { S.nameOn = e.target.value; redo(false); };
		$('sides').onchange = e => { S.sides = +e.target.value; picker(); redo(true); };
		$('maxBricks').oninput = e => {
			S.maxBricks = Math.max(0, num(e.target.value, 12));
			$('maxBricksV').value = S.maxBricks ? S.maxBricks + ' bricks' : 'as many as it takes';
			picker(); redo(true);
		};
		$('bedOn').onchange = e => { S.bedOn = e.target.value; redo(false); };
		$('pallet').onchange = e => { S.pallet = e.target.checked; redo(true); };
		$('fitPallet').onclick = () => {
			const f = Scene.fitToPallet(S.places.length);
			if (!f) { toast(`${S.places.length} stacks will not go on one pallet`); return; }
			S.layout.cols = f.cols; S.layout.gapX = f.gapX; S.layout.gapZ = f.gapZ;
			sync(); redo(true);
			toast(`${f.cols} across, gaps ${f.gapX} × ${f.gapZ} mm`);
		};
		$('order').onchange = e => { S.order = e.target.value; redo(true); };
		// the bed and the ends are a fixed size whatever a brick carries, so
		// everything printed on them is set in millimetres
		for (const k of ['nameSize']) {
			$(k).oninput = e => {
				S[k] = num(e.target.value, S[k]);
				$(k + 'V').value = S[k] + ' mm';
				redo(false);
			};
		}
		$('resetBed').onclick = () => {
			S.bed = {}; panels(); redo(false);
			toast('the top back to der Deckel’s setting');
		};
		$('resetPress').onclick = () => {
			const on = S.press.on;
			S.press = { on }; panels(); redo(false);
			toast('the press back to its own setting');
		};
		$('resetFace').onclick = () => {
			S.face = {}; panels(); redo(false);
			toast('the faces back to what faces.js says');
		};
		$('clay').oninput = e => { S.clay = e.target.value; redo(false); };
		$('inkCol').oninput = e => { S.ink = e.target.value; redo(false); };
		$('ppmm').oninput = e => { S.ppmm = num(e.target.value, 8); $('ppmmV').value = S.ppmm + ' px/mm'; redo(false); };

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


		$('pressOn').onchange = e => { S.press.on = e.target.checked; redo(false); };
		$('reseed').onclick = () => { S.press.seed = 1 + ((Math.random() * 99999) | 0); redo(false); };

		$('vPlan').onclick = () => { Scene.view(0, 0, true); Scene.frame(); };
		$('vFront').onclick = () => { Scene.view(0, 0.12, false); Scene.frame(); };
		$('vCorner').onclick = () => { Scene.view(-0.62, 0.30, false); Scene.frame(); };
		$('vFrame').onclick = () => Scene.frame();
		$('exScope').onchange = e => { S.exScope = e.target.value; exFoot(); save(); };
		$('exGround').onchange = e => { S.exGround = e.target.value; save(); };
		$('exPpmm').oninput = e => {
			S.exPpmm = Math.max(4, num(e.target.value, 24));
			$('exPpmmV').value = S.exPpmm + ' px/mm';
			exFoot(); save();
		};
		$('exportFaces').onclick = exportFaces;

		$('exportPng').onclick = () => {
			const a = document.createElement('a');
			a.href = Scene.snapshot();
			a.download = `${S.year}-${S.many ? S.places.length + 'stapel' : Faces.namesFor(S.year)[S.places[0]] || S.places[0]}.png`;
			a.click();
			toast('view saved');
		};

		window.addEventListener('keydown', e => {
			if (/input|select|textarea/i.test(e.target.tagName)) return;
			if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); step(1); }
			else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); step(-1); }
		});
	}

	function sync() {
		$('many').checked = S.many;
		$('rows').value = S.rows; $('rowsV').value = S.rows;
		$('gap').value = S.gap; $('gapV').value = S.gap;
		$('ppmm').value = S.ppmm; $('ppmmV').value = S.ppmm + ' px/mm';
		$('outline').checked = S.outline;
		$('everyFace').checked = S.everyFace;
		$('nameOn').value = S.nameOn;
		$('sides').value = S.sides;
		$('maxBricks').value = S.maxBricks;
		$('maxBricksV').value = S.maxBricks ? S.maxBricks + ' bricks' : 'as many as it takes';
		$('bedOn').value = S.bedOn;
		$('pallet').checked = S.pallet;
		$('order').value = S.order;
		$('minValue').max = FLOOR.length - 1;
		$('minValue').value = Math.max(0, FLOOR.indexOf(S.minValue));
		$('minValueV').value = S.minValue ? Model.figure(S.minValue) + " Ld'or" : 'no floor';
		$('nameSize').value = S.nameSize; $('nameSizeV').value = S.nameSize + ' mm';
		$('clay').value = S.clay;
		$('inkCol').value = S.ink;
		$('exScope').value = S.exScope;
		$('exGround').value = S.exGround;
		$('exPpmm').value = S.exPpmm; $('exPpmmV').value = S.exPpmm + ' px/mm';
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
			if (kept) {
				Object.assign(S, kept);
				S.layout = Object.assign({ cols: 4, gapX: 120, gapZ: 120, stagger: 0, jitter: 0, turn: 0, seed: 7 }, kept.layout);
				S.press = Object.assign({ on: false }, kept.press);
				S.bed = kept.bed || {};
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
		wire(); sync(); panels(); picker(); stand(true);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();

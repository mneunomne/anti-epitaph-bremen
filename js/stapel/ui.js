/* ui.js — the yard where the stacks are stood up.
 *
 * One good, or as many as are picked. Nothing about a stack is chosen: the
 * height is the number of places that sent the good, divided by what fits on
 * a face. What *is* chosen is the field they stand on — how many to a row and
 * how far apart — and from straight above that field is the comparison.
 *
 * The yard used to be cut the other way, a stack to a place and its goods
 * running down it. Turned round, the same figures answer the other question —
 * not what a place sent, but who a good came from — and the two cuts agree
 * cell for cell, because they are the same cells filed under a different
 * head. What changes is what a tall stack means: it is no longer a place with
 * a long list but a good with many senders. Wein 1851 came from 25 places and
 * stands nine courses; most goods came from one and stand a single brick,
 * which is the honest shape of this axis and not a fault in it.
 */
(function () {
	'use strict';

	const AE = window.AE;
	const { Model, Plate, Ink } = AE.Tafeln;
	const { Faces, Scene } = AE.Stapel;
	const $ = id => document.getElementById(id);
	// v3: the settings became overrides on faces.js rather than copies of it,
	// so an older save would go on overriding what faces.js now says.
	// v4: the yard is cut by good, so what was picked is a list of goods and
	// what was struck out is a list of places — the same two keys meaning the
	// other thing entirely, which an old save cannot be read into.
	const KEY = 'ae.stapel.v4';

	// `all` is every good the volume has, cut only by what has been struck out
	// and by the floor; `list` is that again with the classes applied. A good
	// has one class, so a class cuts whole goods out of the yard rather than
	// rows out of a stack — and the panel needs the uncut list to say how many
	// each class would take with it.
	let all = [], list = [], data = new Map(), names = new Map();

	const S = {
		year: null, wares: [], rawUnits: false,
		cats: Model.DEFAULT_CATS.slice(),
		exclude: [], minValue: 0,
		many: false,
		rows: 3, gap: 2, outline: true, everyFace: true, nameOn: 'none',
		sides: 1, bedOn: 'none', pallet: false, order: 'tallest',
		faceVary: 'brick',      // a face per brick, per stack, or one throughout
		pictureProject: '',     // which brenntisch project lends the tops their picture
		maxBricks: 12,          // 0 stands for as many places as the good had
		nameSize: 23,
		// Overrides on faces.js, nothing more. What is not here is whatever
		// faces.js says today, so a decision taken there arrives on its own.
		face: {}, bed: {},
		clay: '#5e3321', ink: '#d2c3b9',
		ppmm: 8,
		exScope: 'one', exPpmm: 24, exGround: 'clay',
		layout: { cols: 6, rows: 8, gapX: 120, gapZ: 120, stagger: 0, jitter: 0, turn: 0, seed: 7 },
		// overrides on ink.js, the same way the faces are overrides on faces.js
		press: { on: false },
	};

	const { WARE, BED, WEIGHTS } = AE.Stapel.Panel;

	/* ------------------------------------------------- the engraved tops */

	// The picture is not the yard's own: it is whatever is loaded on the
	// brenntisch, read straight out of the cabinet the two pages share. That
	// way the tops of a stack and a wall of the same picture are cut from one
	// setting-up, and dialling the levels in one place does not leave the
	// other showing something else.
	let picture = null;      // { id, name, img, laser, body, polarity }

	async function loadPicture(id) {
		picture = null;
		if (!id || !AE.db) return;
		const p = await AE.db.get(id).catch(() => null);
		if (!p || !p.image || !p.image.blob) return;
		const img = await new Promise((res, rej) => {
			const url = URL.createObjectURL(p.image.blob);
			const el = new Image();
			el.onload = () => { URL.revokeObjectURL(url); res(el); };
			el.onerror = () => { URL.revokeObjectURL(url); rej(new Error('unreadable')); };
			el.src = url;
		}).catch(() => null);
		if (!img) return;
		picture = {
			id, name: p.image.name || p.name, img,
			laser: p.laser, body: (p.sim && p.sim.body) || 'sooty',
			polarity: (p.sim && p.sim.polarity) || 'lighter',
		};
	}

	async function pictureList() {
		const sel = $('pictureProject');
		if (!sel) return;
		const all = AE.db ? await AE.db.all().catch(() => []) : [];
		const withImage = all.filter(p => p.image && p.image.blob);
		sel.innerHTML = '<option value="">— nothing chosen —</option>' +
			withImage.map(p => `<option value="${p.id}">${(p.name || 'untitled').replace(/</g, '&lt;')}</option>`).join('');
		sel.value = withImage.some(p => p.id === S.pictureProject) ? S.pictureProject : '';
		if (!sel.value) S.pictureProject = '';
		// a bed with no picture behind it falls back to the printed one, which
		// looks exactly like nothing having happened. so say which of the two
		// it is rather than leaving it to be guessed at.
		$('pictureHint').textContent = !withImage.length
			? 'no project on the engraving desk has a picture in it yet — open the engraving desk, load one, and it will appear in this list.'
			: !sel.value
				? 'choose one — until you do, the tops keep their printed bed.'
				: 'the picture is stretched over the whole footprint of the yard; each top is cut its own square of it, and the good\u2019s name is taken out of that square rather than printed on it.';
	}

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

	const chosen = () => S.wares.map(id => data.get(id)).filter(Boolean);

	// The order the stacks are set out in. The picked order is the order of the
	// list, which is by Werth, so left to right the yard reads as a ranking —
	// which is sometimes exactly what is not wanted, because a ranking is an
	// argument. Shuffled, the field says only how many there are and how far
	// each runs.
	// How tall a stack will actually stand, asked of the same function that
	// builds it. Not the same as how many places a good came from: the ceiling
	// folds a long tail into one brick and the head takes a line off the top
	// course, so two goods with very different lists can come out the same
	// height, and sorting on the list would order them by a difference the
	// yard does not show.
	const heightOf = p => Faces.courses(p, S.rows, S.sides, S.maxBricks, faceOpts().heads).length;

	// how far a stack may drift from its true place in the height order,
	// as a share of the spread between the tallest and the shortest
	const LOOSE = 0.3;

	function ordered() {
		const ps = chosen().slice();
		// Stacks fill the yard row by row from the back, so tallest-first
		// stands the deep ones at the back and steps down towards the front.
		// Nothing then hides behind anything taller than itself, and the beds
		// — which is where the picture is — all stay in sight.
		//
		// Strictly sorted, though, that comes out as a perfect flight of
		// steps, and a yard laid out as a bar chart stops looking like a
		// yard. So the height is loosened before it is sorted on: each stack
		// is nudged by up to a share of the whole spread, dealt off the
		// field's own seed. Two stacks of near enough the same height will
		// trade places and sometimes cross a row; the tallest and the
		// shortest never will, because the nudge is smaller than the
		// distance between them. `shuffle` deals it again.
		if (S.order === 'tallest') {
			const h = new Map(ps.map(p => [p.id, heightOf(p)]));
			const hs = [...h.values()];
			const spread = Math.max(1, Math.max(...hs) - Math.min(...hs));
			let x = (S.layout.seed >>> 0) || 1;
			const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
			const key = new Map(ps.map(p => [p.id, h.get(p.id) + (rnd() - 0.5) * spread * LOOSE]));
			return ps.sort((a, b) => key.get(b.id) - key.get(a.id));
		}
		if (S.order === 'name') return ps.sort((a, b) => a.title.localeCompare(b.title, 'de'));
		if (S.order === 'places') return ps.sort((a, b) => b.rows.length - a.rows.length);
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
		nameSize: S.nameSize, faceVary: S.faceVary,
		picture: S.bedOn === 'picture' ? picture : null,
		// what the tail is called where a ceiling folds it — here it is a tail
		// of places, not of goods
		fold: 'Uebrige Länder',
		layout: S.layout,
		press: S.press.on ? Object.assign({}, Ink.DEFAULTS, S.press) : null,
	}, S.face, S.bed);

	/* --------------------------------------------------------- the panels */

	function panels() {
		const Panel = AE.Stapel.Panel;
		const redraw = () => { stand(false); save(); };
		Panel.build('p_face', WARE, 'face', S.face, redraw);
		Panel.build('p_bed', BED, 'bed', S.bed, redraw);
		Panel.build('p_press', Panel.PRESS, 'press', S.press, redraw, Ink.DEFAULTS);
	}

	/* ---------------------------------------------------------------- data */

	function rebuild() {
		names = Model.placeNames(S.year);
		// a good every one of whose places has been struck out or cut by the
		// floor is not a short stack, it is no stack at all
		all = Model.wares(S.year, {
			rawUnits: S.rawUnits, exclude: S.exclude, minValue: S.minValue,
		}).filter(p => p.rows.length);
		const want = new Set(S.cats);
		list = all.filter(p => want.has(p.cat));
		data = new Map(list.map(p => [p.id, p]));
		S.wares = S.wares.filter(id => data.has(id));
		if (!S.wares.length && list.length) S.wares = [list[0].id];
		if (!S.many) S.wares = S.wares.slice(0, 1);
	}

	function stand(reframe) {
		const ps = ordered();
		if (!ps.length) return;
		const b = Scene.build(ps, faceOpts());
		if (reframe) Scene.frame();

		const cells = ps.reduce((s, p) => s + p.rows.length, 0);
		const werth = ps.reduce((s, p) => s + (p.total || 0), 0);
		const mb = b.bytes / 1048576;
		cats();
		placesPanel();

		// what all the filtering together has left of what came in under these
		// names — the number to judge a floor by, since cutting the tail off
		// Caffee costs almost nothing and cutting its head off costs everything
		const full = ps.reduce((s, p) => s + (p.full || 0), 0);
		$('share').textContent = full
			? `keeps ${(werth / full * 100).toFixed(1)}% of the Werth — ${Model.figure(werth)} of ${Model.figure(full)}`
			: '';

		// the brick count is the thing that would have to be carried, so it
		// leads — one brick to a course, across every stack in the yard
		$('foot').innerHTML =
			`<span class="tally"><b>${b.bricks}</b> brick${b.bricks === 1 ? '' : 's'}</span>` +
			`<span><b>${b.stacks}</b> stack${b.stacks === 1 ? '' : 's'}</span>` +
			`<span><b>${cells}</b> place${cells === 1 ? '' : 's'}, ${S.rows * S.sides} to a brick${S.sides === 2 ? ' (both sides)' : ''}</span>` +
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

	// The six printed classes plus what could not be placed, each with the
	// number of goods it holds in the volume as it now stands — because a class
	// belongs to a good and not to one of its lines, so turning one off takes
	// that many whole stacks out of the yard rather than thinning the ones
	// standing in it.
	function cats() {
		const tally = {};
		for (const p of all) tally[p.cat] = (tally[p.cat] || 0) + 1;
		const on = new Set(S.cats);
		$('cats').innerHTML = Model.CATEGORIES.map(c => {
			const n = tally[c.key] || 0;
			return `<label class="${on.has(c.key) ? '' : 'off'} ${n ? '' : 'none'}">` +
				`<input type="checkbox" data-cat="${c.key}"${on.has(c.key) ? ' checked' : ''}>` +
				`<span>${esc(c.de)}</span><span class="n">${n}</span></label>`;
		}).join('');
	}

	// every good the classes have left, with the places it came from and the
	// courses that many places stand in
	function picker() {
		const q = $('placeSearch').value.trim().toLowerCase();
		const on = new Set(S.wares);
		const rows = list.filter(p => !q || p.title.toLowerCase().includes(q));
		$('picker').innerHTML = rows.map(p => {
			const cs = Faces.courses(p, S.rows, S.sides, S.maxBricks, faceOpts().heads).length;
			return `<button data-pick="${esc(p.id)}" class="${on.has(p.id) ? 'on' : ''}">` +
				`<span>${esc(p.title)}</span>` +
				`<span class="n">${p.rows.length} · ${cs}c</span></button>`;
		}).join('') || '<p class="hint">nothing under that name.</p>';
		const el = $('picker').querySelector('.on');
		if (el && !q && !S.many) el.scrollIntoView({ block: 'nearest' });
		$('chosenCount').textContent = S.many ? `${S.wares.length} picked` : '';
	}

	// The Werth floor is not a linear thing — the useful steps run over three
	// orders of magnitude — so the slider walks a list rather than a range.
	const FLOOR = [0, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

	// Every place standing in the yard, biggest Werth first, each one strikable
	// everywhere at once. This is the list to cut a stack down by hand when a
	// floor is too blunt — a good's tail is usually places that sent a little
	// of it, but sometimes the thing making a stack unwieldy is one sender you
	// simply are not asking about.
	function placesPanel() {
		const q = $('goodSearch').value.trim().toLowerCase();
		const by = new Map();
		for (const p of chosen()) {
			for (const r of p.rows) {
				if (r.place === 'folded') continue;         // a tail, not a place
				const g = by.get(r.place) || { place: r.place, title: r.title, value: 0, goods: 0 };
				g.value += r.value || 0; g.goods++;
				by.set(r.place, g);
			}
		}
		const rows = [...by.values()]
			.filter(g => !q || g.title.toLowerCase().includes(q))
			.sort((a, b) => b.value - a.value);

		// a struck-out place is out of every stack, so its name has to come
		// from the volume rather than from a block it is no longer in
		$('excluded').innerHTML = S.exclude.length
			? S.exclude.map(id =>
				`<div class="laid-row struck" data-restore="${esc(id)}">` +
				`<span class="nm">${esc(names.get(id) || id)}</span>` +
				`<button class="x" title="put it back">+</button></div>`).join('')
			: '<p class="hint">nothing struck out.</p>';
		$('excludedCount').textContent = S.exclude.length ? `${S.exclude.length} struck out` : '';

		$('goodsList').innerHTML = rows.slice(0, 200).map(g =>
			`<div class="laid-row" data-strike="${esc(g.place)}">` +
			`<span class="nm">${esc(g.title)}</span>` +
			`<span class="pos">${Model.figure(g.value)}</span>` +
			`<button class="x" title="strike it from every table">×</button></div>`
		).join('') || '<p class="hint">nothing under that name.</p>';
	}

	function side() {
		const ps = chosen();
		// with both sides printed there is no bare face left for the name: the
		// pair round the back is carrying the next places
		const spent = S.sides === 2;
		$('nameOn').disabled = spent;
		$('nameRow').classList.toggle('spent', spent);
		$('placeName').textContent = S.many
			? (ps.length === 1 ? ps[0].title : `${ps.length} goods`)
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
		const o = faceOpts();
		const cs = Faces.courses(p, S.rows, S.sides, S.maxBricks, o.heads, o.fold);
		const line = r => `<div><span>${esc(Faces.rowName(r))}</span><b>${Model.figure(r.value)}</b></div>`;
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
			`a long face ${px(Faces.BRICK.l)} × ${px(Faces.BRICK.h)} px · ` +
			`a small one ${px(Faces.BRICK.d)} × ${px(Faces.BRICK.h)} · ` +
			`a bed ${px(Faces.BRICK.l)} × ${px(Faces.BRICK.d)}`;
		$('exportFaces').textContent = `export the faces — ${n} file${n === 1 ? '' : 's'}`;
	}

	/* ------------------------------------------------------------------ ui */

	function step(d) {
		if (S.many) return;
		const at = list.findIndex(p => p.id === S.wares[0]);
		const next = list[Math.max(0, Math.min(list.length - 1, at + d))];
		if (!next || next.id === S.wares[0]) return;
		S.wares = [next.id];
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
			if (!S.many) S.wares = S.wares.slice(0, 1);
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

		$('goodSearch').oninput = placesPanel;
		$('goodsList').onclick = e => {
			const row = e.target.closest('[data-strike]'); if (!row) return;
			const id = row.dataset.strike;
			if (!S.exclude.includes(id)) S.exclude.push(id);
			rebuild(); picker(); redo(false);
		};
		$('excluded').onclick = e => {
			const row = e.target.closest('[data-restore]'); if (!row) return;
			S.exclude = S.exclude.filter(id => id !== row.dataset.restore);
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
			if (!S.many) S.wares = [id];
			else {
				const at = S.wares.indexOf(id);
				if (at >= 0) { if (S.wares.length > 1) S.wares.splice(at, 1); }
				else S.wares.push(id);
			}
			picker(); redo(true);
		};
		$('chosenList').onclick = e => {
			const row = e.target.closest('[data-drop]'); if (!row) return;
			if (S.wares.length <= 1) return;
			S.wares = S.wares.filter(id => id !== row.dataset.drop);
			picker(); redo(true);
		};
		$('pickTop').onclick = () => {
			const n = num($('pickN').value, 8);
			S.wares = list.slice(0, Math.max(1, n)).map(p => p.id);
			S.many = true; $('many').checked = true;
			if (S.ppmm > 5) { S.ppmm = 4; sync(); }
			picker(); redo(true);
		};
		$('clearPicked').onclick = () => { S.wares = S.wares.slice(0, 1); picker(); redo(true); };

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
		$('faceVary').onchange = e => { S.faceVary = e.target.value; redo(false); };
		$('bedOn').onchange = async e => {
			S.bedOn = e.target.value;
			sync();
			if (S.bedOn === 'picture') { await pictureList(); await loadPicture(S.pictureProject); }
			redo(false);
		};
		$('pictureProject').onchange = async e => {
			S.pictureProject = e.target.value;
			await loadPicture(S.pictureProject);
			await pictureList();
			redo(false);
		};
		$('pallet').onchange = e => { S.pallet = e.target.checked; redo(true); };
		$('fitPallet').onclick = () => {
			const f = Scene.fitToPallet(S.wares.length);
			if (!f) { toast(`${S.wares.length} stacks will not go on one pallet`); return; }
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
		fld('gridRows', 'rows', '');
		fld('gapX', 'gapX', ' mm');
		fld('gapZ', 'gapZ', ' mm');
		fld('stagger', 'stagger', '%');
		fld('jitter', 'jitter', ' mm');
		fld('turn', 'turn', '°');
		fld('seed', 'seed', '');
		$('reshuffle').onclick = () => {
			S.layout.seed = 1 + ((Math.random() * 200) | 0);   // within reach of the slider
			// the button and the slider are one knob, so the slider has to
			// follow — otherwise the two disagree about what deal is standing
			$('seed').value = S.layout.seed; $('seedV').value = S.layout.seed;
			redo(true);
			toast(S.order === 'shuffle' || S.order === 'tallest'
				? 'dealt again — seed ' + S.layout.seed : 'seed ' + S.layout.seed);
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
			const one = Faces.namesFor(S.year, 'ware')[S.wares[0]] || 'stapel';
			a.href = Scene.snapshot();
			a.download = `${S.year}-${S.many ? S.wares.length + 'stapel' : one}.png`;
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
		$('faceVary').value = S.faceVary;
		$('pictureRow').hidden = S.bedOn !== 'picture';
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
		$('gridRows').value = L.rows; $('gridRowsV').value = L.rows;
		$('gapX').value = L.gapX; $('gapXV').value = L.gapX + ' mm';
		$('gapZ').value = L.gapZ; $('gapZV').value = L.gapZ + ' mm';
		$('stagger').value = L.stagger; $('staggerV').value = L.stagger + '%';
		$('jitter').value = L.jitter; $('jitterV').value = L.jitter + ' mm';
		$('seed').value = L.seed; $('seedV').value = L.seed;
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
				// a view saved before the stock was darkened carries the old
				// bright terracotta, and a stored value beats a default — so
				// the one colour nobody chose is dropped rather than kept
				// a view saved before the stock was darkened carries the old
				// bright terracotta and its black ink, and a stored value
				// beats a default — so the two nobody chose are dropped
				if (kept.clay === '#d98741') delete kept.clay;
				if (kept.ink === '#12100e') delete kept.ink;
				// likewise the ordering nobody chose: the yard now opens with
				// the tall stacks at the back so the beds are all in sight
				if (kept.order === 'werth') delete kept.order;
				// and the field it was saved with: the yard used to be as many
				// rows deep as it needed and filled solid from the back, so
				// every stack was walled in by its neighbours. it is now the
				// wall's own six by eight, most of it empty, and a saved
				// four-column field would keep it from ever being that.
				if (kept.layout && kept.layout.cols === 4) delete kept.layout.cols;
				Object.assign(S, kept);
				S.layout = Object.assign({ cols: 6, rows: 8, gapX: 120, gapZ: 120, stagger: 0, jitter: 0, turn: 0, seed: 7 }, kept.layout);
				S.press = Object.assign({ on: false }, kept.press);
				S.bed = kept.bed || {};
				S.face = kept.face || {};
				if (!Array.isArray(S.wares)) S.wares = [];
				if (!Array.isArray(S.cats) || !S.cats.length) S.cats = Model.DEFAULT_CATS.slice();
				if (!Array.isArray(S.exclude)) S.exclude = [];
			}
		} catch (e) { }

		const years = Model.years();
		if (!years.includes(S.year)) S.year = years[0];
		rebuild();
		if (!chosen().length) { document.body.innerHTML = '<p style="padding:40px">that volume has no goods.</p>'; return; }

		Scene.init($('stage'), $('canvasWrap'));
		wire(); sync(); panels(); picker();
		// the tops cannot be drawn before the picture is decoded, so the yard
		// waits for it rather than being built twice
		if (S.bedOn === 'picture') { await pictureList(); await loadPicture(S.pictureProject); }
		stand(true);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();

/* ui.js — der Brenner: the bricks, laid on the bed of a laser.
 *
 * der Stapel is where a brick is set; this is where it is cut. Nothing about
 * a face is decided here — the faces are exactly what faces.js prints, off
 * the one list, with the marks the yard shows — and what this page adds is
 * only the three things the machine needs: which faces are wanted, how they
 * lie on a 410 × 410 bed, and what the head is to do with them.
 *
 * It also keeps a register. A yard of any size is more bricks than an
 * afternoon holds, and the one thing worse than cutting a face twice is
 * standing in front of a heap of card wondering which ones those are.
 */
(function () {
	'use strict';

	const AE = window.AE;
	const { Model, Plate, Ink } = AE.Tafeln;
	const { Faces } = AE.Stapel;
	const { Nest } = AE.Brenner;
	// the engraving desk's own emitter — the dialect that has run on the machine
	const Gcode = AE.Gcode;
	const $ = id => document.getElementById(id);
	// v2: the burn settings became the engraving desk's, so an older save
	// would carry names this page no longer means anything by
	const KEY = 'ae.brenner.v2';

	let list = [], data = new Map(), sheets = [], at = 0;

	const S = {
		year: null, places: [], pick: {}, done: {}, arrange: {},
		hideDone: false,
		bed: { bedW: 410, bedH: 410, margin: 5, gap: 4, turn: true, oneSideAtATime: true, frameFirst: true },
		// the desk's defaults, at the setting the tested file was cut with
		burn: Object.assign({}, Gcode.DEFAULTS, {
			lines: 10, feed: 6000, power: 100, rapid: 6000, laserMode: 'M3',
		}),
		// what the faces are cut from: the yard's own setting, on white
		face: {},
		// and the yard's press, if it is wanted on the bricks themselves
		press: { on: false },
	};

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

	/* ----------------------------------------------------------- the faces */

	// a face is known by its volume, its place and its mark, so the register
	// survives a change of setting that renumbers nothing
	const keyOf = (p, f) => `${S.year}/${p.id}/${f.tag}`;

	// The faces are cut on white in black, whatever the yard is coloured: the
	// laser reads darkness, and clay on clay is nothing to read. The press, if
	// it is wanted, is run over that — so what is burnt is what was designed,
	// grain and all.
	// The mottling and the specks are paper: on a page they are what makes a
	// sheet look printed, and burnt they are a few hundred lines of scanning
	// for a few hundred specks of char. So the press comes to the bed without
	// them — what is left is the wandering edge and the ink gaining, which are
	// the type itself and cost the head nothing to follow.
	const press = () => S.press.on
		? Object.assign({}, Ink.DEFAULTS, S.press, { grain: 0, dust: 0 })
		: null;
	const faceOpts = extra => Object.assign({
		clay: '#ffffff', ink: '#000000',
	}, S.face, { press: press() }, extra || {});

	function facesFor(plate) {
		return Faces.faceList(plate, faceOpts());
	}

	// Which way up the brick has to lie for this face, which is the same thing
	// as how far its surface stands off the bed — and so what may share a sheet
	// with what. A brick on its underside presents its top 45 mm up; stood on a
	// long side, 95; on an end, 196.
	const BR = Faces.BRICK;
	const tallOf = f => f.w === BR.l && f.h === BR.d ? BR.h : f.w === BR.l ? BR.d : BR.l;

	// a face belongs to one brick, and a brick shows one face at a time. The
	// name faces belong to no course — they are the same drawing for all of
	// them — so each is its own.
	const brickOf = (p, f) => f.course ? `${p.id}/${f.course}` : `${p.id}/${f.id}`;

	// everything picked, in the order the places were picked and the faces stand
	function chosen() {
		const out = [];
		for (const id of S.places) {
			const p = data.get(id);
			if (!p) continue;
			for (const f of facesFor(p)) {
				const k = keyOf(p, f);
				if (S.pick[k]) out.push({ plate: p, face: f, key: k });
			}
		}
		return out;
	}

	/* ---------------------------------------------------------- the layout */

	function relay() {
		const items = chosen().map(c => ({
			w: c.face.w, h: c.face.h, tag: c.face.tag, kind: c.face.kind,
			letter: c.face.letter, tall: tallOf(c.face),
			key: c.key, plate: c.plate, face: c.face,
			brick: brickOf(c.plate, c.face),
		}));
		const packed = Nest.nest(items, Object.assign({}, S.bed, { arrange: S.arrange }));
		sheets = packed.sheets;
		if (at >= sheets.length) at = Math.max(0, sheets.length - 1);
		if (packed.tooBig.length) toast(`${packed.tooBig.length} face${packed.tooBig.length === 1 ? '' : 's'} will not go on this bed`);
	}

	/* --------------------------------------------------------- the drawing */

	// the bed at whatever scale the window gives it, with every face on it
	function draw() {
		const cv = $('stage'), wrap = $('canvasWrap');
		const B = S.bed;
		const pad = 40;
		const z = Math.max(0.2, Math.min(
			(wrap.clientWidth - pad) / B.bedW, (wrap.clientHeight - pad) / B.bedH));
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		cv.width = Math.round(B.bedW * z * dpr);
		cv.height = Math.round(B.bedH * z * dpr);
		cv.style.width = Math.round(B.bedW * z) + 'px';
		cv.style.height = Math.round(B.bedH * z) + 'px';

		const x = cv.getContext('2d');
		const P = mm => mm * z * dpr;
		x.fillStyle = '#141210';
		x.fillRect(0, 0, cv.width, cv.height);

		// the bed, and the margin the head is not to go into
		x.strokeStyle = '#4a423a';
		x.lineWidth = Math.max(1, dpr);
		x.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
		x.setLineDash([P(3), P(3)]);
		x.strokeStyle = '#6d665e';
		x.strokeRect(P(B.margin), P(B.margin), P(B.bedW - B.margin * 2), P(B.bedH - B.margin * 2));
		x.setLineDash([]);

		const sheet = sheets[at];
		if (!sheet) { foot(); return; }

		// the frame: every cell of the grid, filled or not, since it is the
		// same grid on every sheet of this side and the empty ones are where
		// the last sheet stops rather than a different arrangement
		x.strokeStyle = '#3a3633';
		x.lineWidth = Math.max(1, dpr);
		x.font = `${Math.round(P(6))}px ui-monospace, monospace`;
		x.textAlign = 'left';
		x.textBaseline = 'top';
		for (const c of sheet.cells) {
			const yTop = B.bedH - c.y - sheet.grid.cell.h;
			x.strokeRect(P(c.x), P(yTop), P(sheet.grid.cell.w), P(sheet.grid.cell.h));
			x.fillStyle = '#4a423a';
			x.fillText(String(c.n + 1), P(c.x + 1.5), P(yTop + 1.5));
		}

		for (const it of sheet.items) {
			// the bed's origin is at the bottom left, the canvas's at the top
			const yTop = B.bedH - it.y - it.h;
			const canvas = it.face.make({ ppmm: 4, clay: '#ffffff', ink: '#000000', press: press() });
			x.save();
			x.translate(P(it.x), P(yTop));
			if (it.rot) { x.translate(P(it.w), 0); x.rotate(Math.PI / 2); }
			x.drawImage(canvas, 0, 0, P(it.rot ? it.h : it.w), P(it.rot ? it.w : it.h));
			x.restore();

			const held = picked && picked.brick === it.brick;
			x.strokeStyle = held ? '#6f9bb5' : S.done[it.key] ? '#7fa86a' : '#c07a52';
			x.lineWidth = Math.max(held ? 3 : 1, dpr * (held ? 3 : 1));
			x.strokeRect(P(it.x), P(yTop), P(it.w), P(it.h));
		}
		foot();
	}

	// a brick picked up off the bed, waiting to be put somewhere else
	let picked = null;

	// where on the bed a click landed, and what is under it
	function hit(ev) {
		const sheet = sheets[at]; if (!sheet) return null;
		const cv = $('stage'), r = cv.getBoundingClientRect();
		const mmX = (ev.clientX - r.left) / r.width * S.bed.bedW;
		const mmY = S.bed.bedH - (ev.clientY - r.top) / r.height * S.bed.bedH;
		return sheet.items.find(it =>
			mmX >= it.x && mmX <= it.x + it.w && mmY >= it.y && mmY <= it.y + it.h) || null;
	}

	// the rectangle the head will keep to, run-up and all
	function work(sheet) {
		if (!sheet || !sheet.items.length) return null;
		const b = sheet.items.reduce((a, it) => ({
			minX: Math.min(a.minX, it.x), minY: Math.min(a.minY, it.y),
			maxX: Math.max(a.maxX, it.x + it.w), maxY: Math.max(a.maxY, it.y + it.h),
		}), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
		const over = Math.max(0, S.burn.overscan || 0);
		return {
			minX: b.minX - over, minY: b.minY, maxX: b.maxX + over, maxY: b.maxY,
			out: b.minX - over < 0 || b.minY < 0
				|| b.maxX + over > S.bed.bedW || b.maxY > S.bed.bedH,
		};
	}

	function foot() {
		const sheet = sheets[at];
		const n = chosen().length;
		const doneOn = sheet ? sheet.items.filter(i => S.done[i.key]).length : 0;
		const area = sheet ? sheet.items.reduce((s, i) => s + i.w * i.h, 0) : 0;
		const bed = S.bed.bedW * S.bed.bedH;
		$('sheetNo').textContent = sheets.length
			? `sheet ${at + 1} of ${sheets.length} — ${sheet ? sheet.label : ''}`
			: 'nothing picked';
		$('foot').innerHTML =
			`<span class="tally"><b>${n}</b> face${n === 1 ? '' : 's'} picked</span>` +
			`<span><b>${sheets.length}</b> sheet${sheets.length === 1 ? '' : 's'}</span>` +
			(sheet
				? `<span><b>${sheet.items.length}</b> of <b>${sheet.grid.per}</b> cells · ${esc(sheet.label)}</span>` +
				(picked ? `<span class="warn">holding <b>${esc(picked.tag)}</b> — click where it goes</span>` : '') +
				`<span>the frame <b>${sheet.grid.cols} × ${sheet.grid.rows}</b> of ` +
				`<b>${sheet.grid.cell.w} × ${sheet.grid.cell.h}</b> mm${sheet.grid.rot ? ', turned' : ''}</span>` +
				`<span>the brick stands <b>${sheet.tall}</b> mm — focus once for the sheet</span>` +
				(() => {
					const wk = work(sheet);
					if (!wk) return '';
					const r = `X${Math.round(wk.minX)}–${Math.round(wk.maxX)} · ` +
						`Y${Math.round(wk.minY)}–${Math.round(wk.maxY)}`;
					return wk.out
						? `<span class="bad">the head would go to ${r} — outside the bed</span>`
						: `<span>the head keeps to <b>${r}</b></span>`;
				})() +
				`<span><b>${(area / bed * 100).toFixed(0)}%</b> of the bed</span>` +
				(doneOn ? `<span class="warn"><b>${doneOn}</b> of them already burnt</span>` : '')
				: '') +
			`<span>${S.burn.lines} lines/mm · F${S.burn.feed} · ${S.burn.power}% · ${S.burn.laserMode}</span>`;
		$('jobLine').textContent = sheets.length
			? `${n} faces · ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}` : '';
		const d = Object.keys(S.done).length;
		$('doneLine').textContent = d ? `${d} faces registered as burnt` : 'nothing burnt yet';
		// what a frame would have to be cut to, for each side that is standing
		const frames = [];
		for (const s of sheets) {
			if (frames.some(f => f.group === s.group)) continue;
			frames.push({ group: s.group, text: `${s.label}: ${s.grid.cols} × ${s.grid.rows} of ` +
				`${s.grid.cell.w} × ${s.grid.cell.h} mm, ${Math.round(s.grid.w)} × ${Math.round(s.grid.h)} over all` });
		}
		$('frameLine').innerHTML = frames.length
			? frames.map(f => esc(f.text)).join('<br>') : '—';
	}

	/* ----------------------------------------------------------- the lists */

	function picker() {
		const q = $('placeSearch').value.trim().toLowerCase();
		const on = new Set(S.places);
		const rows = list.filter(p => !q || p.title.toLowerCase().includes(q));
		$('picker').innerHTML = rows.map(p =>
			`<button data-pick="${esc(p.id)}" class="${on.has(p.id) ? 'on' : ''}">` +
			`<span>${esc(p.title)}</span>` +
			`<span class="n">${esc(Faces.namesFor(S.year)[p.id] || '')} · ${p.rows.length}</span></button>`
		).join('') || '<p class="hint">nothing under that name.</p>';
	}

	function faceRows() {
		const html = [];
		for (const id of S.places) {
			const p = data.get(id);
			if (!p) continue;
			const fs = facesFor(p);
			html.push(`<div class="f-place">${esc(p.title)} <span>${fs.length} faces</span></div>`);
			for (const f of fs) {
				const k = keyOf(p, f);
				const done = !!S.done[k];
				if (done && S.hideDone) continue;
				html.push(
					`<label class="f-row ${done ? 'done' : ''}">` +
					`<input type="checkbox" data-face="${esc(k)}"${S.pick[k] ? ' checked' : ''}>` +
					`<span class="f-tag">${esc(f.tag)}</span>` +
					`<span class="f-kind">${esc(f.kind)}</span>` +
					`<span class="f-size">${f.w} × ${f.h}</span>` +
					`<button class="f-done" data-done="${esc(k)}" title="burnt already">${done ? '✓' : '·'}</button>` +
					`</label>`);
			}
		}
		$('faceList').innerHTML = html.join('') || '<p class="hint">pick a place.</p>';
	}

	function all() { return S.places.flatMap(id => { const p = data.get(id); return p ? facesFor(p).map(f => keyOf(p, f)) : []; }); }

	/* --------------------------------------------------------- the g-code */

	// One sheet, one raster. The frame is drawn into a single canvas at the
	// scan resolution and handed to the desk's emitter whole, so the head
	// sweeps the width of the bed in one line and the gaps between the bricks
	// are travelled dark rather than stopped for — which is what keeps the
	// burn even across a row.
	function sheetCode(i) {
		const sheet = sheets[i];
		if (!sheet) return null;
		const gr = sheet.grid;
		const B = S.bed;
		const ppmm = Math.max(1, S.burn.lines);

		// the frame's own rectangle, in bed coordinates
		const boxX = B.margin;
		const boxY = B.bedH - B.margin - gr.h;
		const cv = document.createElement('canvas');
		cv.width = Math.round(gr.w * ppmm);
		cv.height = Math.round(gr.h * ppmm);
		const x = cv.getContext('2d', { willReadFrequently: true });
		x.fillStyle = '#ffffff';
		x.fillRect(0, 0, cv.width, cv.height);

		for (const it of sheet.items) {
			const face = it.face.make({ ppmm, clay: '#ffffff', ink: '#000000', press: press() });
			// the box counts down from its top edge; the bed counts up
			const left = (it.x - boxX) * ppmm;
			const top = ((boxY + gr.h) - (it.y + it.h)) * ppmm;
			x.save();
			x.translate(left, top);
			if (it.rot) { x.translate(it.w * ppmm, 0); x.rotate(Math.PI / 2); }
			x.drawImage(face, 0, 0);
			x.restore();
		}

		// what the head is to keep to: the cells that actually hold a brick,
		// and not the frame it would have filled. One face on a sheet frames
		// that one face.
		const used = sheet.items.reduce((b, it) => ({
			minX: Math.min(b.minX, it.x), minY: Math.min(b.minY, it.y),
			maxX: Math.max(b.maxX, it.x + it.w), maxY: Math.max(b.maxY, it.y + it.h),
		}), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

		const o = Object.assign({}, Gcode.DEFAULTS, S.burn, {
			originX: boxX, originY: boxY, binary: true,
			frame: S.bed.frameFirst ? used : null,
			// and it parks in the corner of the work, not of the bed
			parkX: used.minX, parkY: used.minY,
		});
		const { gray, w, h } = Gcode.fromCanvas(cv);
		const r = Gcode.raster(gray, w, h, gr.w, gr.h, o);
		const text = Gcode.wrap(r, o, {
			title: `bremen ${S.year} — ${sheet.label} — frame ${sheet.batch + 1}` +
				` — ${sheet.items.length} of ${gr.per}: ` + sheet.items.map(t => t.tag).join(' '),
			subtitle: `${gr.cols} × ${gr.rows} cells of ${gr.cell.w} × ${gr.cell.h} mm` +
				`${gr.rot ? ' (turned)' : ''}, ${B.gap} mm apart, brick 1 at ` +
				`${Math.round(sheet.cells[0].x)}, ${Math.round(sheet.cells[0].y)}, filling up the column` +
				` — ${sheet.items.length} in use, the head keeping to X${Math.round(used.minX)}–` +
				`${Math.round(used.maxX)} Y${Math.round(used.minY)}–${Math.round(used.maxY)}` +
				` — the brick stands ${sheet.tall} mm, one face up`,
		});
		return { text, stats: r, sheet };
	}

	function download(text, name) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 4000);
	}

	const mmss = s => Gcode.clock(s);

	async function exportSheets(which) {
		const from = which === 'one' ? at : 0;
		const to = which === 'one' ? at + 1 : sheets.length;
		if (!sheets.length) { toast('nothing to burn'); return; }
		let secs = 0;
		for (let i = from; i < to; i++) {
			const out = sheetCode(i);
			if (!out) continue;
			secs += out.stats.seconds || 0;
			// .gc, as the engraver's own app expects on disk — the text is the
			// same whatever it is called, but the file picker filters on it
			// the year, the side, the frame — what is on it is in the header
			download(out.text, `${S.year}-${out.sheet.letter.toUpperCase()}${out.sheet.batch + 1}.gc`);
			await new Promise(r => setTimeout(r, 150));
		}
		toast(`${to - from} file${to - from === 1 ? '' : 's'} · about ${mmss(secs)} of burning`);
	}

	/* ------------------------------------------------------------------- ui */

	function repaint() { relay(); faceRows(); draw(); save(); }

	function wire() {
		$('yearSel').innerHTML = Model.years().map(y => `<option>${y}</option>`).join('');
		$('yearSel').value = S.year;
		$('yearSel').onchange = e => { S.year = e.target.value; rebuild(); picker(); repaint(); };

		$('placeSearch').oninput = picker;
		$('picker').onclick = e => {
			const b = e.target.closest('[data-pick]'); if (!b) return;
			const id = b.dataset.pick;
			const i = S.places.indexOf(id);
			if (i >= 0) S.places.splice(i, 1); else S.places.push(id);
			// a place picked comes with everything on it that is not burnt yet
			if (i < 0) {
				const p = data.get(id);
				for (const f of facesFor(p)) {
					const k = keyOf(p, f);
					if (!S.done[k]) S.pick[k] = true;
				}
			}
			picker(); repaint();
		};

		$('faceList').onclick = e => {
			const d = e.target.closest('[data-done]');
			if (d) {
				e.preventDefault();
				const k = d.dataset.done;
				if (S.done[k]) delete S.done[k]; else S.done[k] = true;
				repaint();
			}
		};
		$('faceList').onchange = e => {
			const b = e.target.closest('[data-face]'); if (!b) return;
			if (b.checked) S.pick[b.dataset.face] = true; else delete S.pick[b.dataset.face];
			repaint();
		};
		$('allFaces').onclick = () => { for (const k of all()) S.pick[k] = true; repaint(); };
		$('freshFaces').onclick = () => {
			S.pick = {};
			for (const k of all()) if (!S.done[k]) S.pick[k] = true;
			repaint();
		};
		$('noFaces').onclick = () => { S.pick = {}; repaint(); };
		$('hideDone').onchange = e => { S.hideDone = e.target.checked; repaint(); };

		// pick a brick up, then put it on another — the whole frame-full is
		// rewritten, so its flip side follows it
		$('stage').onclick = e => {
			const it = hit(e); if (!it) { picked = null; draw(); return; }
			const sheet = sheets[at];
			if (!picked) { picked = it; draw(); return; }
			if (picked.brick === it.brick) { picked = null; draw(); return; }
			const order = sheet.bricks.slice();
			const i = order.indexOf(picked.brick), j = order.indexOf(it.brick);
			if (i >= 0 && j >= 0) { order[i] = it.brick; order[j] = picked.brick; }
			S.arrange[sheet.id] = order;
			picked = null;
			repaint();
		};
		$('resetArrange').onclick = () => {
			const sheet = sheets[at];
			if (sheet) delete S.arrange[sheet.id];
			picked = null;
			repaint();
			toast('the frame back in order');
		};

		$('prevSheet').onclick = () => { at = Math.max(0, at - 1); draw(); };
		$('nextSheet').onclick = () => { at = Math.min(sheets.length - 1, at + 1); draw(); };
		$('markSheet').onclick = () => {
			const s = sheets[at]; if (!s) return;
			for (const it of s.items) S.done[it.key] = true;
			toast(`${s.items.length} faces registered`);
			repaint();
		};
		$('unmarkSheet').onclick = () => {
			const s = sheets[at]; if (!s) return;
			for (const it of s.items) delete S.done[it.key];
			repaint();
		};
		$('clearDone').onclick = () => { S.done = {}; repaint(); toast('the register is empty'); };

		// --- the bed
		$('bedW').oninput = e => { S.bed.bedW = Math.max(50, num(e.target.value, 410)); repaint(); };
		$('bedH').oninput = e => { S.bed.bedH = Math.max(50, num(e.target.value, 410)); repaint(); };
		for (const [k, unit] of [['margin', ' mm'], ['gap', ' mm']]) {
			$(k).oninput = e => {
				S.bed[k] = num(e.target.value, S.bed[k]);
				$(k + 'V').value = S.bed[k] + unit;
				repaint();
			};
		}
		for (const k of ['turn', 'oneSideAtATime', 'frameFirst']) {
			$(k).onchange = e => { S.bed[k] = e.target.checked; repaint(); };
		}

		// --- the burn
		const shown = {
			lines: v => v + ' /mm', feed: v => v + ' mm/min', rapid: v => v + ' mm/min',
			power: v => v + '%', overscan: v => v + ' mm',
		};
		for (const k of Object.keys(shown)) {
			$(k).oninput = e => {
				S.burn[k] = num(e.target.value, S.burn[k]);
				$(k + 'V').value = shown[k](S.burn[k]);
				foot(); save();
			};
		}
		for (const k of ['sMax', 'passes']) {
			$(k).oninput = e => { S.burn[k] = Math.max(1, num(e.target.value, S.burn[k])); foot(); save(); };
		}
		for (const k of ['bidirectional', 'airAssist', 'park']) {
			$(k).onchange = e => { S.burn[k] = e.target.checked; save(); };
		}
		$('laserMode').onchange = e => { S.burn.laserMode = e.target.value; foot(); save(); };

		const Panel = AE.Stapel.Panel;
		const BURN_PRESS = Panel.PRESS.filter(it => it.k !== 'grain' && it.k !== 'dust');
		const pressPanel = () => Panel.build('p_press', BURN_PRESS, 'press', S.press,
			() => { repaint(); }, Ink.DEFAULTS);
		pressPanel();
		$('pressOn').onchange = e => { S.press.on = e.target.checked; repaint(); };
		$('reseed').onclick = () => {
			S.press.seed = 1 + ((Math.random() * 99999) | 0);
			repaint(); toast('seed ' + S.press.seed);
		};
		$('resetPress').onclick = () => {
			const on = S.press.on;
			S.press = { on }; pressPanel(); repaint();
			toast('the press back to its own setting');
		};

		$('exportSheet').onclick = () => exportSheets('one');
		$('exportAll').onclick = () => exportSheets('all');

		window.addEventListener('resize', draw);
	}

	function sync() {
		$('bedW').value = S.bed.bedW;
		$('bedH').value = S.bed.bedH;
		$('margin').value = S.bed.margin; $('marginV').value = S.bed.margin + ' mm';
		$('gap').value = S.bed.gap; $('gapV').value = S.bed.gap + ' mm';
		for (const k of ['turn', 'oneSideAtATime', 'frameFirst']) $(k).checked = S.bed[k];
		$('hideDone').checked = S.hideDone;
		$('pressOn').checked = !!S.press.on;
		for (const [k, unit] of [['lines', ' /mm'], ['feed', ' mm/min'], ['rapid', ' mm/min'],
		['power', '%'], ['overscan', ' mm']]) {
			$(k).value = S.burn[k]; $(k + 'V').value = S.burn[k] + unit;
		}
		$('sMax').value = S.burn.sMax;
		$('passes').value = S.burn.passes;
		$('laserMode').value = S.burn.laserMode;
		for (const k of ['bidirectional', 'airAssist', 'park']) $(k).checked = !!S.burn[k];
	}

	/* ---------------------------------------------------------------- data */

	function rebuild() {
		list = Model.plates(S.year, {});
		data = new Map(list.map(p => [p.id, p]));
		S.places = S.places.filter(id => data.has(id));
	}

	async function boot() {
		if (!window.HANDEL) { document.body.innerHTML = '<p style="padding:40px">the volumes did not load.</p>'; return; }

		try {
			const jobs = [];
			for (const f of Plate.FACES) {
				for (const [w] of AE.Stapel.Panel.WEIGHTS) jobs.push(document.fonts.load(`${w} 24px ${f.css}`).catch(() => { }));
				jobs.push(document.fonts.load(`italic 400 12px ${f.css}`).catch(() => { }));
			}
			await Promise.all(jobs);
			await document.fonts.ready;
		} catch (e) { }

		try {
			const kept = JSON.parse(localStorage.getItem(KEY));
			if (kept) {
				Object.assign(S, kept);
				S.bed = Object.assign({ bedW: 410, bedH: 410, margin: 5, gap: 4, turn: true, oneSideAtATime: true, frameFirst: true }, kept.bed);
				S.burn = Object.assign({}, Gcode.DEFAULTS, { lines: 10, feed: 6000, power: 100, rapid: 6000, laserMode: 'M3' }, kept.burn);
				S.pick = kept.pick || {};
				S.done = kept.done || {};
				S.face = kept.face || {};
				S.press = Object.assign({ on: false }, kept.press);
				if (!Array.isArray(S.places)) S.places = [];
			}
		} catch (e) { }

		// the yard's own setting, so a face is cut as it was designed
		try {
			const yard = JSON.parse(localStorage.getItem('ae.stapel.v3'));
			// the yard's press comes over as it stands, but off until it is asked for
			if (yard && yard.press && !('bite' in S.press))
				S.press = Object.assign({}, yard.press, { on: !!S.press.on });
			if (yard) S.face = Object.assign({}, yard.face, yard.bed, {
				rows: yard.rows, sides: yard.sides, nameOn: yard.nameOn,
				bedOn: yard.bedOn, maxBricks: yard.maxBricks,
			});
		} catch (e) { }

		const years = Model.years();
		if (!years.includes(S.year)) S.year = years[0];
		rebuild();
		if (!list.length) { document.body.innerHTML = '<p style="padding:40px">that volume has no places.</p>'; return; }
		if (!S.places.length) S.places = [list[0].id];
		// a place standing here is a place whose un-burnt faces are wanted
		for (const id of S.places) {
			const p = data.get(id);
			if (!p) continue;
			for (const f of facesFor(p)) {
				const k = keyOf(p, f);
				if (!(k in S.pick) && !S.done[k]) S.pick[k] = true;
			}
		}

		wire(); sync(); picker(); repaint();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();

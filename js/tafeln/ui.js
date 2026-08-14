/* ui.js — the composing stone.
 *
 * Blocks are picked off the volume and dropped on the sheet; dragging moves
 * one to the nearest column and step, and the corner handle sets how many
 * columns wide it runs and how many goods it shows. Depth is a count of
 * lines rather than a height in pixels, because a block is always a whole
 * number of lines deep — and the goods that fall past the count are not
 * dropped but folded into one line, the way the volumes fold theirs.
 *
 * What is exported is the same render with the screen furniture switched
 * off, at whatever multiple is asked for.
 */
(function () {
	'use strict';

	const AE = window.AE;
	const { Model, Plate, Board } = AE.Tafeln;
	const $ = id => document.getElementById(id);
	const KEY = 'ae.tafeln.board.v1';

	let board = null;
	let data = new Map();        // place id -> plate
	let list = [];               // the volume's plates, biggest first
	let sel = null;              // selected place id
	let zoom = 0.5;
	let fitted = true;
	let boxes = [];
	let drag = null;

	const num = (v, fb) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fb);
	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

	function toast(msg) {
		const t = $('toast');
		t.textContent = msg;
		t.classList.add('show');
		clearTimeout(toast.t);
		toast.t = setTimeout(() => t.classList.remove('show'), 2200);
	}

	/* ---------------------------------------------------------------- state */

	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(board)); } catch (e) { /* full or blocked */ }
	}

	function load() {
		try {
			const s = JSON.parse(localStorage.getItem(KEY));
			if (s && s.sheet && Array.isArray(s.plates)) return s;
		} catch (e) { /* nothing kept */ }
		return null;
	}

	function fresh(year) {
		const b = Board.DEFAULTS();
		b.year = year;
		return b;
	}

	// the volume in hand, folded into blocks
	function rebuild() {
		list = Model.plates(board.year, { rawUnits: board.rawUnits });
		data = new Map(list.map(p => [p.id, p]));
		// a place that is not in this volume cannot stay on the sheet
		board.plates = board.plates.filter(p => data.has(p.id));
	}

	function seed() {
		// the twelve biggest places, laid out as the page lays them
		board.plates = list.slice(0, 12).map(p => ({
			id: p.id, gx: 0, gy: 0, gw: 1, maxRows: 12,
			kicker: true, total: true, foot: false,
		}));
		Board.autoflow(board, data);
	}

	/* --------------------------------------------------------------- canvas */

	function fit() {
		const wrap = $('canvasWrap');
		const pad = 36;
		const z = Math.min(
			(wrap.clientWidth - pad) / board.sheet.w,
			(wrap.clientHeight - pad) / board.sheet.h
		);
		zoom = Math.max(0.05, Math.min(2, z));
		$('zoom').value = Math.round(zoom * 100);
		$('zoomV').value = Math.round(zoom * 100) + '%';
	}

	function draw() {
		const cv = $('stage');
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const w = board.sheet.w * zoom, h = board.sheet.h * zoom;
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
		}
		cv.style.width = Math.round(w) + 'px';
		cv.style.height = Math.round(h) + 'px';
		const ctx = cv.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		boxes = Board.render(ctx, board, data, zoom, {
			chrome: true, selected: sel, guides: $('showGuides').checked,
		});
		foot();
	}

	function foot() {
		const g = Board.geom(board);
		const deep = Board.extent(board, data);
		const over = deep > board.sheet.h;
		const laid = board.plates.length;
		const goods = board.plates.reduce((s, p) => {
			const pl = data.get(p.id);
			return s + (pl ? Math.min(pl.rows.length, p.maxRows) : 0);
		}, 0);
		const sum = board.plates.reduce((s, p) => {
			const pl = data.get(p.id);
			return s + (pl && pl.total ? pl.total : 0);
		}, 0);
		$('stageFoot').innerHTML =
			`<span>sheet <b>${board.sheet.w} × ${board.sheet.h}</b></span>` +
			`<span>${g.cols} columns of <b>${Math.round(g.cell)}</b></span>` +
			`<span>laid <b>${laid}</b> blocks, <b>${goods}</b> lines</span>` +
			`<span>Werth <b>${Model.figure(sum)}</b> Ld'or</span>` +
			`<span class="${over ? 'bad' : ''}">runs to <b>${deep}</b>${over ? ' — past the foot' : ''}</span>`;
	}

	/* ---------------------------------------------------------- interaction */

	function atEvent(e) {
		const r = $('stage').getBoundingClientRect();
		return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
	}

	function onDown(e) {
		const { x, y } = atEvent(e);
		const box = Board.hit(boxes, x, y);
		if (!box) { sel = null; paint(); return; }

		sel = box.p.id;
		const resize = Board.onHandle(box, x, y);
		drag = {
			mode: resize ? 'size' : 'move',
			id: box.p.id,
			ox: x - box.x, oy: y - box.y,
			gw0: box.p.gw, rows0: box.p.maxRows,
			x0: x, y0: y,
		};
		// the one being handled is drawn last, so it comes to the front
		const i = board.plates.findIndex(p => p.id === box.p.id);
		board.plates.push(board.plates.splice(i, 1)[0]);
		$('stage').setPointerCapture(e.pointerId);
		paint();
	}

	function onMove(e) {
		const { x, y } = atEvent(e);

		if (!drag) {
			const box = Board.hit(boxes, x, y);
			const cv = $('stage');
			cv.className = !box ? '' : (Board.onHandle(box, x, y) ? 'resize' : 'grab');
			return;
		}

		const p = board.plates.find(q => q.id === drag.id);
		if (!p) return;
		const g = Board.geom(board);

		if (drag.mode === 'move') {
			$('stage').className = 'grabbing';
			const gx = Math.round((x - drag.ox - g.margin) / (g.cell + g.gutter));
			const gy = Math.round((y - drag.oy - g.top) / board.grid.row);
			p.gx = Math.max(0, Math.min(g.cols - p.gw, gx));
			p.gy = Math.max(0, gy);
		} else {
			const wantW = x - (Board.colX(g, p.gx));
			const gw = Math.round((wantW + g.gutter) / (g.cell + g.gutter));
			p.gw = Math.max(1, Math.min(g.cols - p.gx, gw));
			const drows = Math.round((y - drag.y0) / Plate.M.rowLead);
			const plate = data.get(p.id);
			p.maxRows = Math.max(1, Math.min(plate ? plate.rows.length : 99, drag.rows0 + drows));
		}
		paint();
	}

	function onUp(e) {
		if (drag) { drag = null; save(); }
		$('stage').className = '';
		try { $('stage').releasePointerCapture(e.pointerId); } catch (_) { }
		paint();
	}

	/* ----------------------------------------------------------------- side */

	function paint() { draw(); sideLaid(); sideSel(); }

	function sidePicker() {
		const q = $('placeSearch').value.trim().toLowerCase();
		const on = new Set(board.plates.map(p => p.id));
		const rows = list.filter(p => !q || p.title.toLowerCase().includes(q));
		$('picker').innerHTML = rows.map(p =>
			`<button data-add="${esc(p.id)}" class="${on.has(p.id) ? 'laid' : ''}">` +
			`<span>${esc(p.title)}</span>` +
			`<span class="n">${p.rows.length} · ${Model.figure(p.total)}</span></button>`
		).join('') || '<p class="hint">nothing under that name.</p>';
	}

	function sideLaid() {
		$('laidList').innerHTML = board.plates.map(p => {
			const pl = data.get(p.id);
			return `<div class="laid-row ${p.id === sel ? 'on' : ''}" data-pick="${esc(p.id)}">` +
				`<span class="nm">${esc(pl ? pl.title : p.id)}</span>` +
				`<span class="pos">c${p.gx + 1}·${p.gw}w·${p.maxRows}r</span>` +
				`<button class="x" data-drop="${esc(p.id)}" title="lift off">×</button></div>`;
		}).join('') || '<p class="hint">the sheet is bare — add a place.</p>';
		$('laidCount').textContent = board.plates.length + ' laid';
	}

	function sideSel() {
		const p = board.plates.find(q => q.id === sel);
		const pl = p && data.get(p.id);
		$('selBody').hidden = !p;
		$('selNone').hidden = !!p;
		if (!p) { $('selLabel').textContent = '—'; return; }
		$('selLabel').textContent = pl.title;
		$('selSpan').value = p.gw;
		$('selSpan').max = board.grid.cols;
		$('selRows').value = p.maxRows;
		$('selRows').max = pl.rows.length;
		$('selRowsV').value = `${Math.min(p.maxRows, pl.rows.length)} / ${pl.rows.length}`;
		$('selKicker').checked = p.kicker !== false;
		$('selTotal').checked = p.total !== false;
		$('selFoot').checked = !!p.foot;
		const shown = Plate.bodyRows(pl, p.maxRows);
		$('selNote').innerHTML =
			`Werth im Ganzen <b>${Model.figure(pl.total)}</b> Ld'or` +
			(pl.partial ? ' — some figures are dashes' : '') +
			(shown.folded ? `<br>${shown.folded.count} goods folded into one line, worth <b>${Model.figure(shown.folded.value)}</b>` : '') +
			(pl.pages.length ? `<br>read from S. ${pl.pages[0]}–${pl.pages[pl.pages.length - 1]}` : '');
	}

	/* --------------------------------------------------------------- export */

	async function exportPng() {
		const s = num($('exScale').value, 2);
		const trim = $('exTrim').checked;
		const b = JSON.parse(JSON.stringify(board));
		if (trim) b.sheet.h = Math.max(Board.geom(b).top + 40, Board.extent(b, data));

		const cv = document.createElement('canvas');
		cv.width = Math.round(b.sheet.w * s);
		cv.height = Math.round(b.sheet.h * s);
		const ctx = cv.getContext('2d');
		Board.render(ctx, b, data, s, { chrome: false });

		const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `bremen-${b.year}-tafeln-${cv.width}x${cv.height}.png`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
		toast(`${cv.width} × ${cv.height} png`);
	}

	function exportJson() {
		const blob = new Blob([JSON.stringify(board, null, '\t')], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `bremen-${board.year}-tafeln.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	}

	/* ------------------------------------------------------------------ ui */

	function syncControls() {
		$('yearSel').value = board.year;
		$('sheetW').value = board.sheet.w;
		$('sheetH').value = board.sheet.h;
		$('cols').value = board.grid.cols;
		$('gutter').value = board.grid.gutter;
		$('margin').value = board.grid.margin;
		$('rowStep').value = board.grid.row;
		$('showHead').checked = board.head.show;
		$('folio').value = board.head.folio;
		$('rawUnits').checked = !!board.rawUnits;
	}

	function wire() {
		// --- volume
		$('yearSel').innerHTML = Model.years().map(y => `<option>${y}</option>`).join('');
		$('yearSel').onchange = e => {
			board.year = e.target.value;
			rebuild();
			if (!board.plates.length) seed();
			sidePicker(); paint(); save();
		};

		$('rawUnits').onchange = e => {
			board.rawUnits = e.target.checked;
			rebuild(); sidePicker(); paint(); save();
		};

		// --- the sheet
		const sheetIn = () => {
			board.sheet.w = Math.max(200, num($('sheetW').value, 1680));
			board.sheet.h = Math.max(200, num($('sheetH').value, 2240));
			board.grid.cols = Math.max(1, Math.min(8, num($('cols').value, 3)));
			board.grid.gutter = Math.max(0, num($('gutter').value, 26));
			board.grid.margin = Math.max(0, num($('margin').value, 54));
			board.grid.row = Math.max(2, num($('rowStep').value, 12));
			for (const p of board.plates) {
				p.gw = Math.min(p.gw, board.grid.cols);
				p.gx = Math.min(p.gx, board.grid.cols - p.gw);
			}
			if (fitted) fit();
			paint(); save();
		};
		['sheetW', 'sheetH', 'cols', 'gutter', 'margin', 'rowStep'].forEach(id => $(id).oninput = sheetIn);

		$('showHead').onchange = e => { board.head.show = e.target.checked; paint(); save(); };
		$('folio').oninput = e => { board.head.folio = e.target.value; paint(); save(); };

		$('presetA').onclick = () => { $('sheetW').value = 1680; $('sheetH').value = 2240; sheetIn(); };
		$('presetB').onclick = () => { $('sheetW').value = 2480; $('sheetH').value = 3508; sheetIn(); };  // A4 @300
		$('presetC').onclick = () => { $('sheetW').value = 3508; $('sheetH').value = 2480; sheetIn(); };
		$('trimSheet').onclick = () => {
			$('sheetH').value = Math.max(Board.geom(board).top + 40, Board.extent(board, data));
			sheetIn(); toast('sheet trimmed to the last block');
		};

		// --- places
		$('placeSearch').oninput = sidePicker;
		$('picker').onclick = e => {
			const b = e.target.closest('[data-add]');
			if (!b) return;
			const id = b.dataset.add;
			const at = board.plates.findIndex(p => p.id === id);
			if (at >= 0) { board.plates.splice(at, 1); sel = sel === id ? null : sel; }
			else {
				const pl = data.get(id);
				board.plates.push({
					id, gx: 0, gy: 0, gw: 1,
					maxRows: Math.min(12, pl.rows.length),
					kicker: true, total: true, foot: false,
				});
				sel = id;
			}
			sidePicker(); paint(); save();
		};

		$('laidList').onclick = e => {
			const drop = e.target.closest('[data-drop]');
			if (drop) {
				const id = drop.dataset.drop;
				board.plates = board.plates.filter(p => p.id !== id);
				if (sel === id) sel = null;
				sidePicker(); paint(); save();
				return;
			}
			const pick = e.target.closest('[data-pick]');
			if (pick) { sel = pick.dataset.pick; paint(); }
		};

		$('addTop').onclick = () => {
			const n = num($('addN').value, 12);
			const on = new Set(board.plates.map(p => p.id));
			for (const pl of list.slice(0, n)) {
				if (on.has(pl.id)) continue;
				board.plates.push({
					id: pl.id, gx: 0, gy: 0, gw: 1,
					maxRows: Math.min(12, pl.rows.length),
					kicker: true, total: true, foot: false,
				});
			}
			Board.autoflow(board, data);
			sidePicker(); paint(); save();
		};
		$('clearAll').onclick = () => { board.plates = []; sel = null; sidePicker(); paint(); save(); };
		$('flow').onclick = () => { Board.autoflow(board, data); paint(); save(); toast('columns filled'); };

		// --- the selected block
		$('selSpan').oninput = e => {
			const p = board.plates.find(q => q.id === sel); if (!p) return;
			p.gw = Math.max(1, Math.min(board.grid.cols, num(e.target.value, 1)));
			p.gx = Math.min(p.gx, board.grid.cols - p.gw);
			paint(); save();
		};
		$('selRows').oninput = e => {
			const p = board.plates.find(q => q.id === sel); if (!p) return;
			p.maxRows = Math.max(1, num(e.target.value, 12));
			paint(); save();
		};
		['selKicker', 'selTotal', 'selFoot'].forEach(id => $(id).onchange = e => {
			const p = board.plates.find(q => q.id === sel); if (!p) return;
			p[id.replace('sel', '').toLowerCase()] = e.target.checked;
			paint(); save();
		});
		$('selAllRows').onclick = () => {
			const p = board.plates.find(q => q.id === sel); if (!p) return;
			p.maxRows = data.get(p.id).rows.length;
			paint(); save();
		};
		$('selDrop').onclick = () => {
			board.plates = board.plates.filter(p => p.id !== sel);
			sel = null; sidePicker(); paint(); save();
		};

		// --- the stone
		const cv = $('stage');
		cv.addEventListener('pointerdown', onDown);
		cv.addEventListener('pointermove', onMove);
		cv.addEventListener('pointerup', onUp);
		cv.addEventListener('pointercancel', onUp);

		$('zoom').oninput = e => {
			zoom = num(e.target.value, 50) / 100;
			fitted = false;
			$('zoomV').value = Math.round(zoom * 100) + '%';
			draw();
		};
		$('zoomFit').onclick = () => { fitted = true; fit(); draw(); };
		$('showGuides').onchange = draw;

		// --- what leaves
		$('exportPng').onclick = exportPng;
		$('exportJson').onclick = exportJson;
		$('importJson').onclick = () => $('jsonFile').click();
		$('jsonFile').onchange = async e => {
			const f = e.target.files[0]; if (!f) return;
			try {
				const s = JSON.parse(await f.text());
				if (!s.sheet || !Array.isArray(s.plates)) throw new Error('not a sheet');
				board = Object.assign(Board.DEFAULTS(), s);
				rebuild(); syncControls(); sidePicker();
				if (fitted) fit();
				paint(); save(); toast('sheet loaded');
			} catch (err) { toast('that file is not a sheet'); }
			e.target.value = '';
		};

		// arrow keys nudge the selected block by one step
		window.addEventListener('keydown', e => {
			if (!sel || /input|select|textarea/i.test(e.target.tagName)) return;
			const p = board.plates.find(q => q.id === sel); if (!p) return;
			const g = Board.geom(board);
			let hit = true;
			if (e.key === 'ArrowLeft') p.gx = Math.max(0, p.gx - 1);
			else if (e.key === 'ArrowRight') p.gx = Math.min(g.cols - p.gw, p.gx + 1);
			else if (e.key === 'ArrowUp') p.gy = Math.max(0, p.gy - 1);
			else if (e.key === 'ArrowDown') p.gy = p.gy + 1;
			else if (e.key === 'Backspace' || e.key === 'Delete') {
				board.plates = board.plates.filter(q => q.id !== sel); sel = null; sidePicker();
			} else hit = false;
			if (hit) { e.preventDefault(); paint(); save(); }
		});

		window.addEventListener('resize', () => { if (fitted) { fit(); draw(); } });
	}

	/* ----------------------------------------------------------------- boot */

	async function boot() {
		if (!window.HANDEL) { document.body.innerHTML = '<p style="padding:40px">the volumes did not load.</p>'; return; }

		// canvas will silently fall back to a system serif unless the faces are
		// actually resident, so wait for them before the first draw
		try {
			await Promise.all([
				document.fonts.load(`400 25px 'Ultra'`),
				document.fonts.load(`400 12px 'Libre Bodoni'`),
				document.fonts.load(`600 12px 'Libre Bodoni'`),
				document.fonts.load(`italic 400 12px 'Libre Bodoni'`),
			]);
			await document.fonts.ready;
		} catch (e) { /* draw with what there is */ }

		const years = Model.years();
		board = load() || fresh(years[years.length - 1]);
		if (!years.includes(board.year)) board.year = years[years.length - 1];
		rebuild();
		if (!board.plates.length) seed();

		wire();
		syncControls();
		sidePicker();
		fit();
		paint();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();

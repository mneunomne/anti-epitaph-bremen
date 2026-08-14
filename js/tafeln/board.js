/* board.js — the sheet the blocks are laid on.
 *
 * A grid of columns with a gutter between them, and a coarse vertical step,
 * so a block can be dropped anywhere but never lands off the measure. A
 * block is placed by column and step, is some whole number of columns wide,
 * and is as deep as the goods it shows — which is why depth is set by the
 * row budget rather than by dragging a height: the block is always a whole
 * number of lines tall, as a set block is.
 *
 * The same render draws the screen and the export. Screen furniture — the
 * grid, the selection, the handles — is drawn only when asked for, so what
 * leaves the page is the sheet and nothing else.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const T = (AE.Tafeln = AE.Tafeln || {});
	const { Plate } = T;

	const DEFAULTS = () => ({
		year: null,
		sheet: { w: 1680, h: 2240 },
		grid: { cols: 3, gutter: 26, margin: 54, row: 12 },
		rawUnits: false,
		head: { show: true, folio: '42' },
		plates: [],
	});

	function geom(b) {
		const { cols, gutter, margin } = b.grid;
		const cell = (b.sheet.w - margin * 2 - gutter * (cols - 1)) / cols;
		const headH = b.head.show ? 96 : 0;
		return { cell, gutter, margin, cols, headH, top: margin + headH };
	}

	const colX = (g, gx) => g.margin + gx * (g.cell + g.gutter);
	const spanW = (g, gw) => gw * g.cell + (gw - 1) * g.gutter;

	/* --------------------------------------------------------------- boxes */

	// every placed block, resolved to a rectangle on the sheet at scale 1
	function boxes(b, data) {
		const g = geom(b);
		const out = [];
		for (const p of b.plates) {
			const plate = data.get(p.id);
			if (!plate) continue;
			const w = spanW(g, p.gw);
			const L = Plate.layout(plate, {
				width: w,
				maxRows: p.maxRows,
				kicker: p.kicker !== false,
				total: p.total !== false,
				foot: !!p.foot,
			});
			out.push({ p, plate, L, x: colX(g, p.gx), y: g.top + p.gy * b.grid.row, w, h: L.h });
		}
		return out;
	}

	// topmost first — the last drawn is the one on top, so pick from the end
	function hit(bs, x, y) {
		for (let i = bs.length - 1; i >= 0; i--) {
			const b = bs[i];
			if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
		}
		return null;
	}

	const HANDLE = 15;
	function onHandle(box, x, y) {
		return x >= box.x + box.w - HANDLE && x <= box.x + box.w
			&& y >= box.y + box.h - HANDLE && y <= box.y + box.h;
	}

	/* -------------------------------------------------------------- render */

	function masthead(ctx, b, s) {
		const g = geom(b);
		const P = v => v * s;
		const w = b.sheet.w;
		ctx.fillStyle = '#000';
		ctx.textBaseline = 'alphabetic';

		ctx.font = `400 ${P(15)}px ${Plate.DISPLAY}`;
		ctx.textAlign = 'left';
		if (b.head.folio) ctx.fillText(b.head.folio, P(g.margin), P(g.margin + 18));

		ctx.textAlign = 'center';
		ctx.font = `400 ${P(30)}px ${Plate.DISPLAY}`;
		ctx.fillText('Bremens Handel und Schifffahrt', P(w / 2), P(g.margin + 26));
		ctx.font = `400 italic ${P(12.5)}px ${Plate.TEXT}`;
		ctx.fillText(`im Jahre ${b.year} · Einfuhr nach der Herkunft · Werth in Louisd'or`,
			P(w / 2), P(g.margin + 48));

		// the volumes' thick-then-thin rule under the running head
		ctx.fillRect(P(g.margin), P(g.margin + 62), P(w - g.margin * 2), P(2.4));
		ctx.fillRect(P(g.margin), P(g.margin + 67), P(w - g.margin * 2), P(0.9));
	}

	function footline(ctx, b, s) {
		const g = geom(b);
		const P = v => v * s;
		ctx.fillStyle = '#000';
		ctx.font = `400 italic ${P(10)}px ${Plate.TEXT}`;
		ctx.textAlign = 'left';
		ctx.fillText('Handelskammer zu Bremen', P(g.margin), P(b.sheet.h - g.margin + 14));
		ctx.textAlign = 'right';
		ctx.fillText(`Bremens Handel und Schifffahrt im Jahre ${b.year}`,
			P(b.sheet.w - g.margin), P(b.sheet.h - g.margin + 14));
	}

	// `s` is px-per-sheet-px. chrome adds the grid and the selection; leave it
	// off and this is exactly the image that gets exported.
	function render(ctx, b, data, s, opts) {
		const o = Object.assign({ chrome: false, selected: null, guides: true }, opts);
		const P = v => v * s;
		const g = geom(b);

		ctx.save();
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, P(b.sheet.w), P(b.sheet.h));

		if (o.chrome && o.guides) {
			ctx.strokeStyle = 'rgba(180,40,40,.22)';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			for (let c = 0; c < g.cols; c++) {
				const x = colX(g, c);
				ctx.strokeRect(P(x) + .5, P(g.top) + .5, P(g.cell), P(b.sheet.h - g.top - g.margin));
			}
			ctx.setLineDash([]);
		}

		if (b.head.show) masthead(ctx, b, s);

		const bs = boxes(b, data);
		for (const box of bs) Plate.draw(ctx, box.plate, P(box.x), P(box.y), box.L, s);

		if (b.head.show) footline(ctx, b, s);

		if (o.chrome) {
			for (const box of bs) {
				const on = o.selected === box.p.id;
				// a block hanging off the foot of the sheet is a real error, so
				// it is marked whether or not it happens to be selected
				const over = box.y + box.h > b.sheet.h - g.margin;
				if (!on && !over) continue;
				ctx.strokeStyle = on ? '#1668d8' : 'rgba(190,40,40,.85)';
				ctx.lineWidth = 2;
				ctx.setLineDash(over && !on ? [6, 4] : []);
				ctx.strokeRect(P(box.x) - 1.5, P(box.y) - 1.5, P(box.w) + 3, P(box.h) + 3);
				ctx.setLineDash([]);
				if (on) {
					ctx.fillStyle = '#1668d8';
					ctx.fillRect(P(box.x + box.w) - P(HANDLE), P(box.y + box.h) - P(HANDLE), P(HANDLE), P(HANDLE));
					ctx.fillStyle = '#fff';
					ctx.font = `600 ${Math.max(8, P(9))}px ui-sans-serif, system-ui, sans-serif`;
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillText('⇲', P(box.x + box.w - HANDLE / 2), P(box.y + box.h - HANDLE / 2));
					ctx.textBaseline = 'alphabetic';
				}
			}
		}
		ctx.restore();
		return bs;
	}

	/* ------------------------------------------------------------ arranging */

	// fill the columns the way the page does: down one, then the next, each
	// block taking the shortest column so the feet come out roughly level
	function autoflow(b, data) {
		const g = geom(b);
		const heads = new Array(g.cols).fill(0);
		const step = b.grid.row;
		for (const p of b.plates) {
			const plate = data.get(p.id);
			if (!plate) continue;
			p.gw = Math.min(p.gw, g.cols);
			// a wide block has to clear every column it covers
			let best = 0, bestY = Infinity;
			for (let c = 0; c + p.gw <= g.cols; c++) {
				const y = Math.max(...heads.slice(c, c + p.gw));
				if (y < bestY - 0.01) { bestY = y; best = c; }
			}
			const L = Plate.layout(plate, {
				width: spanW(g, p.gw), maxRows: p.maxRows,
				kicker: p.kicker !== false, total: p.total !== false, foot: !!p.foot,
			});
			p.gx = best;
			p.gy = Math.round(bestY / step);
			const bottom = p.gy * step + L.h + b.grid.gutter;
			for (let c = best; c < best + p.gw; c++) heads[c] = bottom;
		}
		return b;
	}

	// how deep the laid sheet actually runs, so the sheet can be trimmed to it
	function extent(b, data) {
		const g = geom(b);
		let bottom = g.top;
		for (const box of boxes(b, data)) bottom = Math.max(bottom, box.y + box.h);
		return Math.ceil(bottom + g.margin);
	}

	T.Board = { DEFAULTS, geom, boxes, hit, onHandle, render, autoflow, extent, colX, spanW, HANDLE };
})(window);

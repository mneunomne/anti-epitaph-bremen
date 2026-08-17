/* nest.js — the bed as a frame, and a cell holds a brick.
 *
 * The first version of this shelf-packed the faces, which fits the most on a
 * sheet and gives a different arrangement every time. That is the wrong thing
 * to want: these are bricks that have to be laid on a bed and squared to the
 * head, and an arrangement that moves from sheet to sheet has to be measured
 * again every sheet.
 *
 * So the bed is a grid, and the grid never moves. What the grid holds is not
 * a face but a brick — brick 1 in the first cell, brick 2 under it, down the
 * column and on to the next, in the order the stack stands. A sheet is then
 * one side of those bricks:
 *
 *     …                   …                       the same sixteen bricks,
 *     brick 2  side b     brick 10  side b        turned over in place, and
 *     brick 1  side b     brick 9   side b        the next sheet is side d
 *     ── the machine's corner ──
 *
 * which is what makes the run practical. Lay sixteen bricks out once, burn
 * side b, flip each one where it lies, burn side d. Nothing is measured twice
 * and nothing has to be identified: the cell is the brick.
 *
 * Two things the bricks insist on, and they are what decide the sheet count:
 *
 *   A brick has one face up at a time — so a sheet is one face of a brick and
 *   its opposite is the sheet after it.
 *
 *   And a face is only in focus at its own height. Lying on its underside a
 *   brick's top stands 45 mm off the bed; stood on a long side, 95; on an
 *   end, 196. So a sheet is all tops, or all long sides, or all ends, and the
 *   head is set once for the whole of it. Since the faces of one side are all
 *   the same size, the grid comes out square by itself.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const B = (AE.Brenner = AE.Brenner || {});

	// which faces belong to which side of the brick, and in what order they
	// are burnt — the second of a pair is the first one flipped over
	const SIDES = {
		a: { group: 'a', letters: ['a'], label: 'the tops' },
		b: { group: 'long', letters: ['b', 'd'], label: 'the long sides' },
		d: { group: 'long', letters: ['b', 'd'], label: 'the long sides' },
		c: { group: 'short', letters: ['c', 'e'], label: 'the ends' },
		e: { group: 'short', letters: ['c', 'e'], label: 'the ends' },
	};
	const ORDER = ['a', 'long', 'short'];

	// How many bricks the bed will take, and which way round to lay them. The
	// choice is made once for a side and then never varies, so the frame is
	// the frame.
	function grid(w, h, o) {
		const W = o.bedW - o.margin * 2;
		const H = o.bedH - o.margin * 2;
		const g = Math.max(0, o.gap);
		const fit = (cw, ch) => ({
			cols: Math.max(0, Math.floor((W + g) / (cw + g))),
			rows: Math.max(0, Math.floor((H + g) / (ch + g))),
		});
		const up = fit(w, h);
		const turned = o.turn ? fit(h, w) : { cols: 0, rows: 0 };
		const rot = turned.cols * turned.rows > up.cols * up.rows;
		const cell = rot ? { w: h, h: w } : { w, h };
		const { cols, rows } = rot ? turned : up;
		return {
			cols, rows, rot, cell, per: cols * rows,
			w: cols ? cols * cell.w + (cols - 1) * g : 0,
			h: rows ? rows * cell.h + (rows - 1) * g : 0,
		};
	}

	// The cells, in the order the bricks go into them: up the first column from
	// the machine's own corner, then up the next.
	//
	// It reads the wrong way round on paper — the sketch of a frame has brick 1
	// at the top — but the frame is not on paper. A sheet with one brick on it
	// should be one brick's worth of travel, and numbering from the far end
	// sends the head the length of the bed and back to burn a single face.
	// The corner nearest the origin is where the work starts.
	function cells(gr, o) {
		const g = Math.max(0, o.gap);
		const out = [];
		for (let c = 0; c < gr.cols; c++) {
			for (let r = 0; r < gr.rows; r++) {
				out.push({
					col: c, row: r, n: out.length,
					x: o.margin + c * (gr.cell.w + g),
					y: o.margin + r * (gr.cell.h + g),
				});
			}
		}
		return out;
	}

	// items: [{ w, h, brick, letter, tag, ... }] in millimetres, in the order
	// the bricks stand. `arrange` may give a batch's bricks in another order,
	// which is what a hand rearranging the bed writes back.
	function nest(items, o) {
		const opt = Object.assign({
			bedW: 410, bedH: 410, margin: 5, gap: 4, turn: true,
			oneSideAtATime: true, arrange: {},
		}, o || {});

		// by side of the brick — the faces of one side are the same size, so
		// one grid does for all of them
		const groups = new Map();
		for (const it of items) {
			const side = SIDES[it.letter] || SIDES.b;
			const k = opt.oneSideAtATime ? side.group : 'all';
			if (!groups.has(k)) groups.set(k, { side, list: [] });
			groups.get(k).list.push(it);
		}

		const sheets = [], tooBig = [];
		for (const key of ORDER) {
			const g = groups.get(key);
			if (!g) continue;
			const gr = grid(g.list[0].w, g.list[0].h, opt);
			if (!gr.per) { tooBig.push(...g.list); continue; }
			const cs = cells(gr, opt);

			// the bricks of this side, in the order they stand
			const bricks = [];
			const seen = new Set();
			for (const it of g.list) if (!seen.has(it.brick)) { seen.add(it.brick); bricks.push(it.brick); }

			// as many bricks as the frame holds, then the next frame-full
			for (let b = 0; b * gr.per < bricks.length; b++) {
				let batch = bricks.slice(b * gr.per, (b + 1) * gr.per);
				// a hand may have swapped two of them about
				const arranged = opt.arrange[`${key}/${b}`];
				if (arranged && arranged.length) {
					const want = arranged.filter(x => batch.includes(x));
					batch = want.concat(batch.filter(x => !want.includes(x)));
				}
				const cellOf = new Map(batch.map((brick, i) => [brick, cs[i]]));

				// one sheet a side: b then d, c then e — the second is the
				// first flipped over, in the very same cells
				for (const letter of g.side.letters) {
					const on = g.list.filter(it => it.letter === letter && cellOf.has(it.brick));
					if (!on.length) continue;
					const placed = on.map(it => {
						const c = cellOf.get(it.brick);
						return Object.assign({}, it, {
							x: c.x, y: c.y, col: c.col, row: c.row, cell: c.n,
							rot: gr.rot, w: gr.cell.w, h: gr.cell.h,
						});
					}).sort((a, b2) => a.cell - b2.cell);

					sheets.push({
						items: placed, grid: gr, cells: cs,
						group: key, letter, batch: b,
						id: `${key}/${b}`,
						label: `${g.side.label} — side ${letter.toUpperCase()}`,
						tall: on[0].tall || 0,
						bricks: batch,
						w: gr.w + opt.margin, h: gr.h + opt.margin,
					});
				}
			}
		}
		// tops first, then the long sides, then the ends — and within a side,
		// a frame-full at a time with its flip straight after it
		return { sheets, tooBig };
	}

	B.Nest = { nest, grid, cells, SIDES };
})(window);

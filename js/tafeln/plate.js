/* plate.js — one block of the table, set the way the volumes set it.
 *
 * The furniture is the point. A block in *Bremens Handel* is a thick rule
 * outside and a thin one just inside it; the place standing over the whole
 * width in fat Antiqua with a full stop after it; a short heavy rule under
 * the name, held clear of the sides; the column heads; then the goods, each
 * name run out to its figure on leader dots, the figures flush right on a
 * common decimal, and a rule and a sum to close.
 *
 * Everything here is written against a scale of 1 and multiplied on the way
 * out, so the same code draws the screen at 60% and the export at 4×. The
 * layout is computed once and both measuring and drawing read it, which is
 * the only way the two can be guaranteed to agree.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const T = (AE.Tafeln = AE.Tafeln || {});
	const { figure } = T.Model;

	const DISPLAY = "'Ultra', 'Bevan', Georgia, serif";
	const TEXT = "'Libre Bodoni', 'Libre Baskerville', Georgia, serif";

	// every measurement at scale 1, in px
	const M = {
		frameOuter: 2.6,      // the heavy rule
		frameGap: 3.2,      // the white between the two
		frameInner: 0.9,      // the hair inside it
		padX: 9,
		padTop: 9,
		padBottom: 8,

		kickerSize: 9.5,
		kickerGap: 5,
		titleSize: 25,
		titleGap: 8,
		underRule: 2.4,     // the heavy short rule under the name
		underInset: 0.14,    // as a fraction of the block width, each side
		underGap: 9,

		headSize: 9.4,
		headLead: 14,
		headRule: 1.6,

		rowSize: 11,
		rowLead: 15.4,
		colGap: 7,

		totalRule: 1.6,
		totalLead: 15.4,
		footSize: 8.6,
		footLead: 11,
	};

	const font = (weight, style, size, family) =>
		`${style} ${weight} ${size}px ${family}`;

	// a scratch context, so a plate can be measured before anything is drawn
	let scratch = null;
	function measureCtx() {
		if (!scratch) scratch = document.createElement('canvas').getContext('2d');
		return scratch;
	}

	/* ---------------------------------------------------------------- rows */

	// What actually goes in the block. Past the row budget the tail is folded
	// into one line — which is not an invention: the volumes do exactly this,
	// and call it "Uebrige Einfuhr".
	function bodyRows(plate, maxRows) {
		const rows = plate.rows;
		const cap = Math.max(1, maxRows | 0);
		if (rows.length <= cap) return { shown: rows, folded: null };

		const shown = rows.slice(0, cap - 1);
		const rest = rows.slice(cap - 1);
		const known = rest.filter(r => Number.isFinite(r.value));
		return {
			shown,
			folded: {
				article: 'Uebrige Waaren',
				count: rest.length,
				value: known.length ? known.reduce((s, r) => s + r.value, 0) : null,
			},
		};
	}

	/* -------------------------------------------------------------- layout */

	// One pass that fixes every x and y in the block. `w` is given — the board
	// decides how wide a block is — and the height falls out of the content.
	function layout(plate, opts) {
		const o = Object.assign({ width: 320, maxRows: 12, kicker: true, total: true, foot: false }, opts);
		const ctx = measureCtx();
		const w = o.width;

		const { shown, folded } = bodyRows(plate, o.maxRows);
		const inset = M.frameOuter + M.frameGap + M.frameInner;
		const cw = w - (inset + M.padX) * 2;             // content width
		const cx = inset + M.padX;

		// --- columns. The figures set the widths; the name takes the rest.
		ctx.font = font(400, 'normal', M.rowSize, TEXT);
		let valW = ctx.measureText('000,000').width;
		let qtyW = ctx.measureText('000,000').width;
		let unitW = 0;
		for (const r of shown) {
			valW = Math.max(valW, ctx.measureText(figure(r.value)).width);
			qtyW = Math.max(qtyW, ctx.measureText(figure(r.qty)).width);
			unitW = Math.max(unitW, ctx.measureText(r.unit || '').width);
		}
		if (folded) valW = Math.max(valW, ctx.measureText(figure(folded.value)).width);
		if (o.total) {
			ctx.font = font(600, 'normal', M.rowSize, TEXT);
			valW = Math.max(valW, ctx.measureText(figure(plate.total)).width);
		}
		ctx.font = font(400, 'normal', M.headSize, TEXT);
		valW = Math.max(valW, ctx.measureText('Werth').width);

		valW += M.colGap * 2;
		qtyW += M.colGap * 2;
		unitW = unitW ? unitW + M.colGap : 0;

		// the name column keeps at least a third of the block; past that the
		// figures give ground rather than let a name be clipped to nothing
		const minName = cw * 0.30;
		let nameW = cw - valW - qtyW - unitW;
		if (nameW < minName) {
			const over = minName - nameW;
			const pool = qtyW + unitW;
			qtyW -= over * (qtyW / pool);
			unitW -= over * (unitW / pool);
			nameW = minName;
		}

		const col = {
			name: { x: cx, w: nameW },
			qty: { x: cx + nameW, w: qtyW },
			unit: { x: cx + nameW + qtyW, w: unitW },
			val: { x: cx + nameW + qtyW + unitW, w: valW },
		};

		// --- vertical run
		let y = inset + M.padTop;
		const at = {};

		if (o.kicker) { at.kicker = y + M.kickerSize; y += M.kickerSize + M.kickerGap; }
		at.title = y + M.titleSize * 0.80;                 // fat face sits low
		y += M.titleSize + M.titleGap;
		at.underRule = y;
		y += M.underRule + M.underGap;

		at.head = y + M.headSize;
		y += M.headLead;
		at.headRule = y;
		y += M.headRule + 2.5;

		at.bodyTop = y;
		const bodyLines = shown.length + (folded ? 1 : 0);
		at.rows = [];
		for (let i = 0; i < bodyLines; i++) at.rows.push(y + M.rowLead * i + M.rowSize);
		y += M.rowLead * bodyLines + 2;
		at.bodyBottom = y;

		if (o.total) {
			at.totalRule = y;
			y += M.totalRule + 2.5;
			at.total = y + M.rowSize;
			y += M.totalLead;
		}
		if (o.foot) { at.foot = y + M.footSize + 2; y += M.footLead + 2; }

		y += M.padBottom + inset;

		return { w, h: y, col, at, shown, folded, inset, cx, cw, o };
	}

	/* --------------------------------------------------------------- paint */

	function rule(ctx, x, y, w, thick) {
		ctx.fillRect(x, y, w, thick);
	}

	// name ......... figure — the dots stop clear of both ends
	function leaders(ctx, text, x, y, w, size) {
		const tw = ctx.measureText(text).width;
		ctx.fillText(text, x, y);
		const from = x + tw + size * 0.42;
		const to = x + w - size * 0.30;
		if (to - from < size * 0.8) return;
		const step = size * 0.40;
		const r = Math.max(0.45, size * 0.045);
		ctx.beginPath();
		for (let dx = from; dx <= to; dx += step) ctx.arc(dx, y - size * 0.26, r, 0, Math.PI * 2), ctx.closePath();
		ctx.fill();
	}

	// clip a name that will not fit, rather than let it run into the figures
	function fit(ctx, text, w) {
		if (ctx.measureText(text).width <= w) return text;
		let s = text;
		while (s.length > 1 && ctx.measureText(s + '.').width > w) s = s.slice(0, -1);
		return s.replace(/[\s,.-]+$/, '') + '.';
	}

	// `s` scales the whole block; x/y are in scaled px, everything else is
	// computed at 1 and multiplied here, so nothing drifts between zooms.
	function draw(ctx, plate, x, y, L, s, opts) {
		const o = Object.assign({ ink: '#000', paper: '#fff' }, opts);
		const P = v => v * s;

		ctx.save();
		ctx.translate(x, y);
		ctx.fillStyle = o.paper;
		ctx.fillRect(0, 0, P(L.w), P(L.h));
		ctx.fillStyle = o.ink;
		ctx.strokeStyle = o.ink;
		ctx.textBaseline = 'alphabetic';

		// --- the double frame
		const fo = M.frameOuter, fi = M.frameInner, gap = M.frameGap;
		ctx.lineWidth = P(fo);
		ctx.strokeRect(P(fo / 2), P(fo / 2), P(L.w - fo), P(L.h - fo));
		ctx.lineWidth = Math.max(0.6, P(fi));
		const io = fo + gap;
		ctx.strokeRect(P(io), P(io), P(L.w - io * 2), P(L.h - io * 2));

		// --- the head
		ctx.textAlign = 'center';
		const mid = P(L.w / 2);
		if (L.at.kicker != null) {
			ctx.font = font(400, 'italic', P(M.kickerSize), TEXT);
			ctx.fillText('Einfuhr von', mid, P(L.at.kicker));
		}
		ctx.font = font(400, 'normal', P(M.titleSize), DISPLAY);
		let title = plate.title + '.';
		// the fat face is wide; squeeze a long name rather than break the block
		const avail = P(L.cw);
		const tw = ctx.measureText(title).width;
		if (tw > avail) {
			ctx.save();
			ctx.translate(mid, 0);
			ctx.scale(Math.max(0.55, avail / tw), 1);
			ctx.fillText(title, 0, P(L.at.title));
			ctx.restore();
		} else {
			ctx.fillText(title, mid, P(L.at.title));
		}

		const ui = L.w * M.underInset;
		rule(ctx, P(ui), P(L.at.underRule), P(L.w - ui * 2), P(M.underRule));

		// --- column heads
		ctx.font = font(400, 'normal', P(M.headSize), TEXT);
		ctx.textAlign = 'left';
		ctx.save();
		ctx.letterSpacing = P(M.headSize * 0.14) + 'px';   // ignored where unsupported
		ctx.fillText('Waare', P(L.col.name.x), P(L.at.head));
		ctx.restore();
		ctx.textAlign = 'center';
		ctx.fillText('Quantum', P(L.col.qty.x + (L.col.qty.w + L.col.unit.w) / 2), P(L.at.head));
		ctx.textAlign = 'center';
		ctx.fillText('Werth', P(L.col.val.x + L.col.val.w / 2), P(L.at.head));

		rule(ctx, P(L.cx), P(L.at.headRule), P(L.cw), P(M.headRule));

		// --- the vertical hairlines. In the volumes these run from under the
		// heavy rule beneath the name, so the column heads sit inside the
		// ruled columns rather than floating above them.
		const top = P(L.at.underRule + M.underRule);
		const bot = P(L.at.bodyBottom);
		ctx.fillStyle = o.ink;
		const hair = Math.max(0.6, P(0.8));
		for (const cx of [L.col.qty.x, L.col.val.x]) ctx.fillRect(P(cx), top, hair, bot - top);

		// --- the goods
		ctx.font = font(400, 'normal', P(M.rowSize), TEXT);
		let i = 0;
		for (const r of L.shown) {
			const by = P(L.at.rows[i++]);
			ctx.textAlign = 'left';
			ctx.font = font(500, 'normal', P(M.rowSize), TEXT);
			const nameBox = L.col.name.w - M.colGap;
			leaders(ctx, fit(ctx, r.article, P(nameBox) * 0.92), P(L.col.name.x + 2), by, P(nameBox), P(M.rowSize));

			ctx.font = font(400, 'normal', P(M.rowSize), TEXT);
			ctx.textAlign = 'right';
			ctx.fillText(figure(r.qty), P(L.col.qty.x + L.col.qty.w - M.colGap), by);
			if (L.col.unit.w) {
				ctx.textAlign = 'left';
				ctx.fillText(r.unit || '', P(L.col.unit.x + 1), by);
			}
			ctx.textAlign = 'right';
			ctx.fillText(figure(r.value), P(L.col.val.x + L.col.val.w - M.colGap), by);
		}

		if (L.folded) {
			const by = P(L.at.rows[i]);
			ctx.font = font(400, 'italic', P(M.rowSize), TEXT);
			ctx.textAlign = 'left';
			const label = `Uebrige Waaren (${L.folded.count})`;
			leaders(ctx, fit(ctx, label, P(L.col.name.w - M.colGap) * 0.92),
				P(L.col.name.x + 2), by, P(L.col.name.w - M.colGap), P(M.rowSize));
			ctx.textAlign = 'right';
			ctx.fillText(figure(L.folded.value), P(L.col.val.x + L.col.val.w - M.colGap), by);
		}

		// --- the sum
		if (L.at.totalRule != null) {
			rule(ctx, P(L.cx), P(L.at.totalRule), P(L.cw), P(M.totalRule));
			const by = P(L.at.total);
			ctx.font = font(400, 'italic', P(M.rowSize), TEXT);
			ctx.textAlign = 'left';
			ctx.fillText(plate.partial ? 'Werth, so weit beziffert' : 'Werth im Ganzen', P(L.col.name.x + 2), by);
			ctx.font = font(600, 'normal', P(M.rowSize), TEXT);
			ctx.textAlign = 'right';
			ctx.fillText(figure(plate.total), P(L.col.val.x + L.col.val.w - M.colGap), by);
		}

		if (L.at.foot != null) {
			ctx.font = font(400, 'italic', P(M.footSize), TEXT);
			ctx.textAlign = 'left';
			const pp = plate.pages.length
				? (plate.pages.length > 3
					? `S. ${plate.pages[0]}–${plate.pages[plate.pages.length - 1]}`
					: 'S. ' + plate.pages.join(', '))
				: '';
			ctx.fillText(`${plate.year} · ${pp}`, P(L.cx), P(L.at.foot));
		}

		ctx.restore();
	}

	T.Plate = { layout, draw, M, DISPLAY, TEXT, bodyRows };
})(window);

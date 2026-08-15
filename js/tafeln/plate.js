/* plate.js — one block of the table, set the way the volumes set it.
 *
 * The furniture is the point. A block in *Bremens Handel* is a thick rule
 * outside and a thin one just inside it; the place standing over the whole
 * width in fat Antiqua with a full stop after it; a short heavy rule under
 * the name, held clear of the sides; the column heads; then the goods, each
 * name run out to its figure on leader dots, the figures flush right on a
 * common decimal, and a rule and a sum to close.
 *
 * Every measurement and every face is a parameter, not a constant — the
 * defaults in DEFAULTS are one reading of the printed page, not the only
 * one. Everything is written against a scale of 1 and multiplied on the way
 * out, so the same code draws the screen at 60% and the export at 4×. The
 * layout is computed once and carries the metrics it was computed with, so
 * measuring and drawing can never disagree.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const T = (AE.Tafeln = AE.Tafeln || {});
	const { figure } = T.Model;

	// the faces on disk, plus what a mac has in the drawer already
	const FACES = [
		{ id: 'ultra', label: 'Ultra — fat face', css: "'Ultra'" },
		{ id: 'abril', label: 'Abril Fatface — fat face', css: "'Abril Fatface'" },
		{ id: 'rozha', label: 'Rozha One — fat face', css: "'Rozha One'" },
		{ id: 'bevan', label: 'Bevan — fat Egyptian', css: "'Bevan'" },
		{ id: 'bodoni-moda', label: 'Bodoni Moda — Didone', css: "'Bodoni Moda'" },
		{ id: 'libre-bodoni', label: 'Libre Bodoni — Didone', css: "'Libre Bodoni'" },
		{ id: 'playfair', label: 'Playfair Display', css: "'Playfair Display'" },
		{ id: 'baskerville', label: 'Libre Baskerville', css: "'Libre Baskerville'" },
		{ id: 'didot', label: 'Didot (system)', css: "'Didot'" },
		{ id: 'bodoni72', label: 'Bodoni 72 (system)', css: "'Bodoni 72'" },
		{ id: 'hoefler', label: 'Hoefler Text (system)', css: "'Hoefler Text'" },
		{ id: 'georgia', label: 'Georgia (system)', css: 'Georgia' },
		{ id: 'times', label: 'Times (system)', css: "'Times New Roman'" },
	];
	const faceCss = id => {
		const f = FACES.find(x => x.id === id);
		return (f ? f.css : "'Libre Bodoni'") + ', Georgia, serif';
	};

	// one reading of the printed page — every one of these is editable
	const DEFAULTS = {
		display: 'ultra',
		text: 'libre-bodoni',
		titleFit: 'squeeze',      // squeeze · shrink · wrap

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
		titleTrack: 0,
		underRule: 2.4,     // the heavy short rule under the name
		underInset: 14,       // per cent of the block width, each side
		underGap: 9,

		headSize: 9.4,
		headTrack: 14,       // per cent of the size, on "Waare" only
		headLead: 14,
		headRule: 1.6,
		colGap: 7,
		hair: 0.8,      // the vertical column rules

		rowSize: 11,
		rowLead: 15.4,
		rowWeight: 500,
		leaderGap: 40,       // per cent of the size, before the dots
		leaderStep: 40,       // per cent of the size, between them
		leaderSize: 4.5,     // per cent of the size

		// The Quantum and the Werth are one thing on the page — a column of
		// figures — and the volumes set them alike, so they are one face here
		// too, the measure travelling with the quantity it belongs to. Empty
		// means the text face, which is how the volumes have it.
		figFace: '',
		figSize: 11,
		figWeight: 400,

		totalRule: 1.6,
		totalGap: 2.5,
		totalLead: 15.4,
		totalWeight: 600,
		footSize: 8.6,
		footLead: 11,
	};

	const metrics = over => Object.assign({}, DEFAULTS, over || {});

	const font = (weight, style, size, family) => `${style} ${weight} ${size}px ${family}`;

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

	// a long place name either squeezes, shrinks or breaks in two
	function titleLines(ctx, text, avail, m, DISPLAY) {
		ctx.font = font(400, 'normal', m.titleSize, DISPLAY);
		const w = ctx.measureText(text).width;
		if (w <= avail) return { lines: [text], size: m.titleSize, squeeze: 1 };

		if (m.titleFit === 'shrink') {
			const size = Math.max(6, m.titleSize * (avail / w));
			return { lines: [text], size, squeeze: 1 };
		}
		if (m.titleFit === 'wrap') {
			const words = text.split(' ');
			if (words.length > 1) {
				// break at the space that leaves the two halves most even
				let best = 1, bestGap = Infinity;
				for (let i = 1; i < words.length; i++) {
					const a = ctx.measureText(words.slice(0, i).join(' ')).width;
					const b = ctx.measureText(words.slice(i).join(' ')).width;
					if (Math.abs(a - b) < bestGap) { bestGap = Math.abs(a - b); best = i; }
				}
				const lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
				const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
				return { lines, size: m.titleSize, squeeze: Math.min(1, avail / widest) };
			}
		}
		return { lines: [text], size: m.titleSize, squeeze: Math.max(0.4, avail / w) };
	}

	/* -------------------------------------------------------------- layout */

	// One pass that fixes every x and y in the block. `width` is given — the
	// height falls out of the content and the metrics.
	function layout(plate, opts) {
		const o = Object.assign({ width: 520, maxRows: 14, kicker: true, total: true, foot: false }, opts);
		const m = metrics(o.m);
		const DISPLAY = faceCss(m.display);
		const TEXT = faceCss(m.text);
		const FIG = m.figFace ? faceCss(m.figFace) : TEXT;
		const ctx = measureCtx();
		const w = o.width;

		const { shown, folded } = bodyRows(plate, o.maxRows);
		const inset = m.frameOuter + m.frameGap + m.frameInner;
		const cw = w - (inset + m.padX) * 2;             // content width
		const cx = inset + m.padX;

		// --- columns. The figures set the widths; the name takes the rest.
		ctx.font = font(m.figWeight, 'normal', m.figSize, FIG);
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
			ctx.font = font(m.totalWeight, 'normal', m.figSize, FIG);
			valW = Math.max(valW, ctx.measureText(figure(plate.total)).width);
		}
		ctx.font = font(400, 'normal', m.headSize, TEXT);
		valW = Math.max(valW, ctx.measureText('Werth').width);

		valW += m.colGap * 2;
		qtyW += m.colGap * 2;
		unitW = unitW ? unitW + m.colGap : 0;

		// the name column keeps at least a third of the block; past that the
		// figures give ground rather than let a name be clipped to nothing
		const minName = cw * 0.30;
		let nameW = cw - valW - qtyW - unitW;
		if (nameW < minName) {
			const over = minName - nameW;
			const pool = qtyW + unitW || 1;
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
		let y = inset + m.padTop;
		const at = {};

		if (o.kicker) { at.kicker = y + m.kickerSize; y += m.kickerSize + m.kickerGap; }

		const title = titleLines(ctx, plate.title + '.', cw, m, DISPLAY);
		at.title = [];
		for (let i = 0; i < title.lines.length; i++) {
			at.title.push(y + title.size * 0.80 + i * title.size * 1.02);
		}
		y += title.size * (1 + (title.lines.length - 1) * 1.02) + m.titleGap;

		at.underRule = y;
		y += m.underRule + m.underGap;

		at.head = y + m.headSize;
		y += m.headLead;
		at.headRule = y;
		y += m.headRule + 2.5;

		// a line sits on one baseline whichever of the two faces is the taller,
		// so raising the figures does not shave the tops off the names
		const lineSize = Math.max(m.rowSize, m.figSize);

		at.bodyTop = y;
		const bodyLines = shown.length + (folded ? 1 : 0);
		at.rows = [];
		for (let i = 0; i < bodyLines; i++) at.rows.push(y + m.rowLead * i + lineSize);
		y += m.rowLead * bodyLines + 2;
		at.bodyBottom = y;

		if (o.total) {
			at.totalRule = y;
			y += m.totalRule + m.totalGap;
			at.total = y + lineSize;
			y += m.totalLead;
		}
		if (o.foot) { at.foot = y + m.footSize + 2; y += m.footLead + 2; }

		y += m.padBottom + inset;

		return { w, h: y, col, at, shown, folded, inset, cx, cw, o, m, title, DISPLAY, TEXT, FIG };
	}

	/* --------------------------------------------------------------- paint */

	// name ......... figure — the dots stop clear of both ends
	function leaders(ctx, text, x, y, w, size, m, P) {
		const tw = ctx.measureText(text).width;
		ctx.fillText(text, x, y);
		const from = x + tw + P(size * m.leaderGap / 100);
		const to = x + w - P(size * 0.30);
		if (to - from < P(size * 0.8)) return;
		const step = P(size * m.leaderStep / 100);
		const r = Math.max(0.4, P(size * m.leaderSize / 100));
		if (step <= 0.2) return;
		ctx.beginPath();
		for (let dx = from; dx <= to; dx += step) { ctx.moveTo(dx + r, y - P(size * 0.26)); ctx.arc(dx, y - P(size * 0.26), r, 0, Math.PI * 2); }
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
		const m = L.m, DISPLAY = L.DISPLAY, TEXT = L.TEXT, FIG = L.FIG;
		const P = v => v * s;

		ctx.save();
		ctx.translate(x, y);
		if (o.paper) { ctx.fillStyle = o.paper; ctx.fillRect(0, 0, P(L.w), P(L.h)); }
		ctx.fillStyle = o.ink;
		ctx.strokeStyle = o.ink;
		ctx.textBaseline = 'alphabetic';

		// --- the double frame
		const fo = m.frameOuter, fi = m.frameInner, gap = m.frameGap;
		if (fo > 0) {
			ctx.lineWidth = P(fo);
			ctx.strokeRect(P(fo / 2), P(fo / 2), P(L.w - fo), P(L.h - fo));
		}
		if (fi > 0) {
			ctx.lineWidth = Math.max(0.5, P(fi));
			const io = fo + gap;
			ctx.strokeRect(P(io), P(io), P(L.w - io * 2), P(L.h - io * 2));
		}

		// --- the head
		ctx.textAlign = 'center';
		const mid = P(L.w / 2);
		if (L.at.kicker != null) {
			ctx.font = font(400, 'italic', P(m.kickerSize), TEXT);
			ctx.fillText('Einfuhr von', mid, P(L.at.kicker));
		}
		ctx.font = font(400, 'normal', P(L.title.size), DISPLAY);
		if (m.titleTrack) ctx.letterSpacing = P(L.title.size * m.titleTrack / 100) + 'px';
		L.title.lines.forEach((line, i) => {
			if (L.title.squeeze < 1) {
				ctx.save();
				ctx.translate(mid, 0);
				ctx.scale(L.title.squeeze, 1);
				ctx.fillText(line, 0, P(L.at.title[i]));
				ctx.restore();
			} else {
				ctx.fillText(line, mid, P(L.at.title[i]));
			}
		});
		ctx.letterSpacing = '0px';

		if (m.underRule > 0) {
			const ui = L.w * m.underInset / 100;
			ctx.fillRect(P(ui), P(L.at.underRule), P(L.w - ui * 2), P(m.underRule));
		}

		// --- column heads
		ctx.font = font(400, 'normal', P(m.headSize), TEXT);
		ctx.textAlign = 'left';
		if (m.headTrack) ctx.letterSpacing = P(m.headSize * m.headTrack / 100) + 'px';
		ctx.fillText('Waare', P(L.col.name.x), P(L.at.head));
		ctx.letterSpacing = '0px';
		ctx.textAlign = 'center';
		ctx.fillText('Quantum', P(L.col.qty.x + (L.col.qty.w + L.col.unit.w) / 2), P(L.at.head));
		ctx.fillText('Werth', P(L.col.val.x + L.col.val.w / 2), P(L.at.head));

		if (m.headRule > 0) ctx.fillRect(P(L.cx), P(L.at.headRule), P(L.cw), P(m.headRule));

		// --- the vertical hairlines. In the volumes these run from under the
		// heavy rule beneath the name, so the column heads sit inside the
		// ruled columns rather than floating above them.
		if (m.hair > 0) {
			const top = P(L.at.underRule + m.underRule);
			const bot = P(L.at.bodyBottom);
			const hair = Math.max(0.5, P(m.hair));
			for (const c of [L.col.qty.x, L.col.val.x]) ctx.fillRect(P(c), top, hair, bot - top);
		}

		// --- the goods
		let i = 0;
		for (const r of L.shown) {
			const by = P(L.at.rows[i++]);
			ctx.textAlign = 'left';
			ctx.font = font(m.rowWeight, 'normal', P(m.rowSize), TEXT);
			const nameBox = L.col.name.w - m.colGap;
			leaders(ctx, fit(ctx, r.article, P(nameBox) * 0.92), P(L.col.name.x + 2), by, P(nameBox), m.rowSize, m, P);

			// the Quantum, its measure and the Werth are all one face
			ctx.font = font(m.figWeight, 'normal', P(m.figSize), FIG);
			ctx.textAlign = 'right';
			ctx.fillText(figure(r.qty), P(L.col.qty.x + L.col.qty.w - m.colGap), by);
			if (L.col.unit.w) {
				ctx.textAlign = 'left';
				ctx.fillText(r.unit || '', P(L.col.unit.x + 1), by);
			}
			ctx.textAlign = 'right';
			ctx.fillText(figure(r.value), P(L.col.val.x + L.col.val.w - m.colGap), by);
		}

		if (L.folded) {
			const by = P(L.at.rows[i]);
			ctx.font = font(400, 'italic', P(m.rowSize), TEXT);
			ctx.textAlign = 'left';
			const label = `Uebrige Waaren (${L.folded.count})`;
			leaders(ctx, fit(ctx, label, P(L.col.name.w - m.colGap) * 0.92),
				P(L.col.name.x + 2), by, P(L.col.name.w - m.colGap), m.rowSize, m, P);
			ctx.font = font(m.figWeight, 'normal', P(m.figSize), FIG);
			ctx.textAlign = 'right';
			ctx.fillText(figure(L.folded.value), P(L.col.val.x + L.col.val.w - m.colGap), by);
		}

		// --- the sum
		if (L.at.totalRule != null) {
			if (m.totalRule > 0) ctx.fillRect(P(L.cx), P(L.at.totalRule), P(L.cw), P(m.totalRule));
			const by = P(L.at.total);
			ctx.font = font(400, 'italic', P(m.rowSize), TEXT);
			ctx.textAlign = 'left';
			ctx.fillText(T.Model.totalLabel(plate), P(L.col.name.x + 2), by);
			ctx.font = font(m.totalWeight, 'normal', P(m.figSize), FIG);
			ctx.textAlign = 'right';
			ctx.fillText(figure(plate.total), P(L.col.val.x + L.col.val.w - m.colGap), by);
		}

		if (L.at.foot != null) {
			ctx.font = font(400, 'italic', P(m.footSize), TEXT);
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

	T.Plate = { layout, draw, bodyRows, metrics, DEFAULTS, FACES, faceCss };
})(window);

/* faces.js — what is printed on a brick.
 *
 * A brick is 200 × 100 × 50. Laid as a stretcher it shows three faces to
 * anyone standing in front of it, and this page uses two of them plus the
 * bed of the topmost course:
 *
 *   the stretcher, 200 × 50 — the goods, name run out to its quantity
 *   the header,    100 × 50 — the value of those same goods, flush right
 *   the bed,       200 × 100 — the place, where it was read, and the sum
 *
 * Three goods to a brick, so the stack grows with what the place actually
 * sent: Brasilien 1851 at 25 goods stands nine courses high, Java at three
 * stands one. The rows on the header line up with the rows on the stretcher
 * because both are the same 50 deep and cut the same way.
 *
 * Everything here is written in millimetres and multiplied up to pixels on
 * the way out, so the texture can be made as fine as the machine will hold
 * without any of the measurements changing.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const T = (AE.Tafeln = AE.Tafeln || {});
	const S = (AE.Stapel = AE.Stapel || {});
	const { figure } = T.Model;

	// the brick, in millimetres
	const BRICK = { l: 200, d: 100, h: 50 };

	const DEFAULTS = {
		ppmm: 8,                 // texture resolution
		rows: 3,                 // goods to a brick
		clay: '#d98741',
		ink: '#12100e',
		display: 'ultra',
		text: 'libre-bodoni',
		padX: 7,
		padY: 3.5,
		nameCol: 0.60,           // share of the stretcher the name column takes
		titleSize: 21,           // the place on the bed, in mm
		nameSize: 23,            // the place on the end and the back, in mm
		press: null,             // ink.js settings, or null
	};

	const opt = o => Object.assign({}, DEFAULTS, o || {});
	const face = id => T.Plate.faceCss(id);

	function surface(wmm, hmm, o) {
		const c = document.createElement('canvas');
		c.width = Math.round(wmm * o.ppmm);
		c.height = Math.round(hmm * o.ppmm);
		const x = c.getContext('2d', { willReadFrequently: !!o.press });
		x.fillStyle = o.clay;
		x.fillRect(0, 0, c.width, c.height);
		x.fillStyle = o.ink;
		x.strokeStyle = o.ink;
		x.textBaseline = 'alphabetic';
		return { c, x, P: mm => mm * o.ppmm };
	}

	// run the press over a finished face, if it is wanted
	function pressed(c, o) {
		if (o.press && o.press.on && AE.Tafeln.Ink) AE.Tafeln.Ink.apply(c, o.press, o.ppmm / 4);
		return c;
	}

	function fit(x, text, w) {
		if (x.measureText(text).width <= w) return text;
		let s = text;
		while (s.length > 1 && x.measureText(s + '.').width > w) s = s.slice(0, -1);
		return s.replace(/[\s,.-]+$/, '') + '.';
	}

	function leaders(x, from, to, y, size) {
		if (to - from < size * 0.8) return;
		const step = size * 0.42, r = Math.max(0.5, size * 0.05);
		x.beginPath();
		for (let dx = from; dx <= to; dx += step) { x.moveTo(dx + r, y); x.arc(dx, y, r, 0, Math.PI * 2); }
		x.fill();
	}

	/* ------------------------------------------------- the stretcher, 200×50 */

	// the goods: name run out on leader dots to its quantity and measure
	function stretcher(rows, o) {
		o = opt(o);
		const { c, x, P } = surface(BRICK.l, BRICK.h, o);
		const rowH = (BRICK.h - o.padY * 2) / o.rows;
		const size = rowH * 0.50;
		const split = o.padX + (BRICK.l - o.padX * 2) * o.nameCol;

		// the rule between the name and its quantity, the depth of the brick
		x.fillRect(P(split), P(o.padY * 0.4), Math.max(1, P(0.5)), P(BRICK.h - o.padY * 0.8));

		for (let i = 0; i < o.rows; i++) {
			const r = rows[i];
			if (!r) continue;
			// the baseline sits a little under the middle of its row
			const y = P(o.padY + rowH * i + rowH * 0.5 + size * 0.36);

			x.font = `500 ${P(size)}px ${face(o.text)}`;
			x.textAlign = 'left';
			const nameW = P(split - o.padX) - P(3);
			const name = fit(x, r.article, nameW);
			x.fillText(name, P(o.padX), y);

			const qty = figure(r.qty);
			const unit = r.unit || '';
			x.font = `400 ${P(size)}px ${face(o.text)}`;
			x.textAlign = 'right';
			const unitW = unit ? x.measureText(unit).width + P(2.5) : 0;
			const qtyRight = P(BRICK.l - o.padX) - unitW;
			x.fillText(qty, qtyRight, y);
			if (unit) {
				x.textAlign = 'left';
				x.fillText(unit, qtyRight + P(2.5), y);
			}

			// the dots stop clear of the name and short of the rule — they
			// carry the eye across the name column, they do not cross into
			// the figures' column
			x.textAlign = 'left';
			x.font = `500 ${P(size)}px ${face(o.text)}`;
			const nw = x.measureText(name).width;
			leaders(x, P(o.padX) + nw + P(2.5), P(split) - P(2.5),
				y - P(size * 0.28), P(size));
		}
		return pressed(c, o);
	}

	/* --------------------------------------------------- the header, 100×50 */

	// the values of those same goods, on the same three lines
	function header(rows, o) {
		o = opt(o);
		const { c, x, P } = surface(BRICK.d, BRICK.h, o);
		const rowH = (BRICK.h - o.padY * 2) / o.rows;
		const size = rowH * 0.50;

		for (let i = 0; i < o.rows; i++) {
			const r = rows[i];
			if (!r) continue;
			const y = P(o.padY + rowH * i + rowH * 0.5 + size * 0.36);
			x.font = `400 ${P(size)}px ${face(o.text)}`;
			x.textAlign = 'right';
			x.fillText(figure(r.value), P(BRICK.d - o.padX), y);
		}
		return pressed(c, o);
	}

	/* ------------------------------------------------------ the bed, 200×100 */

	// "Waarenverzeichniss · 1851 · S. 141" — which printing, and which pages
	function sourceLine(plate) {
		const src = plate.source === 'verzeichniss' ? 'Waarenverzeichniss' : 'nach Artikeln';
		const pp = plate.pages && plate.pages.length
			? ` · S. ${plate.pages[0]}${plate.pages.length > 1 ? '–' + plate.pages[plate.pages.length - 1] : ''}`
			: '';
		return `${src} · ${plate.year}${pp}`;
	}

	// The place, which printing it was read off, and what it all came to.
	// `bedOn` decides how much of that the top course carries: everything, or
	// the reckoning without the place standing over it in fat face — worth
	// having, because in a yard seen from above the names are the loudest
	// thing on the field and sometimes the figures are the point.
	function bed(plate, o) {
		o = opt(o);
		const { c, x, P } = surface(BRICK.l, BRICK.d, o);
		const W = BRICK.l;
		x.textAlign = 'center';

		if (o.bedOn === 'sum') {
			x.font = `400 italic ${P(5.5)}px ${face(o.text)}`;
			x.fillText(sourceLine(plate), P(W / 2), P(34));
			x.fillRect(P(52), P(42), P(W - 104), P(1.4));
			x.font = `400 italic ${P(7)}px ${face(o.text)}`;
			x.fillText(T.Model.totalLabel(plate), P(W / 2), P(60));
			x.font = `600 ${P(15)}px ${face(o.text)}`;
			x.fillText(figure(plate.total), P(W / 2), P(80));
			return pressed(c, o);
		}

		x.font = `400 italic ${P(6)}px ${face(o.text)}`;
		x.fillText('Einfuhr von', P(W / 2), P(22));

		// the fat face is wide; a long name squeezes rather than overrun
		const title = plate.title + '.';
		const avail = P(W - 26);
		// the name sits on a baseline that follows its size, so growing it
		// pushes it down into its own space rather than into the kicker
		const base = 30 + o.titleSize * 0.72;
		x.font = `400 ${P(o.titleSize)}px ${face(o.display)}`;
		const tw = x.measureText(title).width;
		if (tw > avail) {
			x.save();
			x.translate(P(W / 2), 0);
			x.scale(avail / tw, 1);
			x.fillText(title, 0, P(base));
			x.restore();
		} else {
			x.fillText(title, P(W / 2), P(base));
		}

		x.fillRect(P(34), P(base + 8), P(W - 68), P(1.6));

		x.font = `400 italic ${P(5)}px ${face(o.text)}`;
		x.fillText(sourceLine(plate), P(W / 2), P(base + 21));

		x.font = `400 italic ${P(6)}px ${face(o.text)}`;
		x.textAlign = 'left';
		x.fillText(T.Model.totalLabel(plate), P(16), P(84));
		x.font = `600 ${P(8.5)}px ${face(o.text)}`;
		x.textAlign = 'right';
		x.fillText(figure(plate.total), P(W - 16), P(84));

		return pressed(c, o);
	}

	/* -------------------------------------------------- the name, either end */

	// The place, and nothing else, set as large as the face will take it. On
	// the far end it repeats down the whole stack the way a title repeats down
	// the spines of a run of volumes — which is the point of putting it there:
	// from the side a stack stops being a column of figures and becomes one
	// named thing. The same face serves the long side, where a long name has
	// room to stand at its proper width.
	function nameplate(plate, wmm, hmm, o) {
		o = opt(o);
		const { c, x, P } = surface(wmm, hmm, o);
		const pad = o.padX * 1.4;
		const size = Math.min(o.nameSize, hmm * 0.78);   // never taller than the face
		x.textAlign = 'center';
		x.textBaseline = 'alphabetic';
		x.font = `400 ${P(size)}px ${face(o.display)}`;

		const title = plate.title + '.';
		const avail = P(wmm - pad * 2);
		const tw = x.measureText(title).width;
		const y = P(hmm * 0.5 + size * 0.36);

		if (tw > avail) {
			x.save();
			x.translate(P(wmm / 2), 0);
			x.scale(Math.max(0.32, avail / tw), 1);
			x.fillText(title, 0, y);
			x.restore();
		} else {
			x.fillText(title, P(wmm / 2), y);
		}
		return pressed(c, o);
	}

	// a face with nothing on it — the back, the underside, the far end
	function blank(wmm, hmm, o) {
		o = opt(o);
		return pressed(surface(wmm, hmm, o).c, o);
	}

	/* ------------------------------------------------------------- the stack */

	// How the goods are dealt out to the courses. The first goods are at the
	// top, so the stack reads down the way the printed table does.
	//
	// A brick has two stretchers and two headers, not one of each, so it can
	// carry twice what it does — the next three goods on the back, their
	// values on the far end. That halves the stack for the same reading, at
	// the price of having to walk round it: no one standing still ever sees
	// more than half of what a place sent.
	function courses(plate, rowsPerBrick, sides) {
		const n = Math.max(1, rowsPerBrick | 0);
		const two = sides === 2;
		const per = two ? n * 2 : n;
		const out = [];
		for (let i = 0; i < plate.rows.length; i += per) {
			const load = plate.rows.slice(i, i + per);
			out.push({ front: load.slice(0, n), back: two ? load.slice(n) : [] });
		}
		return out.length ? out : [{ front: [], back: [] }];
	}

	S.Faces = { BRICK, DEFAULTS, stretcher, header, bed, nameplate, blank, courses, sourceLine };
})(window);

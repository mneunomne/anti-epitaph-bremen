/* faces.js — what is printed on a brick.
 *
 * A brick is 196 × 95 × 45. Laid as a stretcher it shows three faces to
 * anyone standing in front of it, and this page uses two of them plus the
 * bed of the topmost course:
 *
 *   the stretcher, 196 × 45 — the goods, name run out to its quantity
 *   the header,    95 × 45 — the value of those same goods, flush right
 *   the bed,       196 × 95 — the place, and where it was read
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

	// the brick, in millimetres — the block as it is actually cut
	const BRICK = { l: 196, d: 95, h: 45 };

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

		// The two sizes on a brick's working faces are given as a share of the
		// row they sit in rather than in millimetres, because the row is set by
		// how many goods are asked to a brick — at three to a brick a row is
		// 14 mm deep and at six it is 7, and a size in millimetres that suited
		// the one would spill out of the other.
		goodsSize: 50,           // per cent of the row's height
		goodsWeight: 500,
		figSize: 50,
		figWeight: 400,
		figFace: '',             // the face for the figures; empty is the text face
		// Where the Werth goes. On the header it is round a corner from its own
		// good — legible, but never at the same time as the good it belongs to.
		// On the stretcher the two stand together on the one face, at the cost
		// of the room it takes out of the name.
		figuresOn: 'header',     // header · stretcher

		// What the money is called. A column of bare figures says nothing about
		// what it counts, and on a brick there is no page-head to say it once
		// for the whole table — so it is said on the face or nowhere. The
		// volumes say it once at the head of a column and carry a ditto down,
		// which is `first`; `every` says it on every line, which is louder and
		// takes more of the face.
		currency: 'none',        // none · first · every
		mark: 'Ld’or',
		markDitto: '”',
		markSize: 62,            // per cent of the figure it follows
		markGap: 2,              // mm

		// The heads of the columns, set on the faces the columns are actually
		// on and set as a first line — Waare and Quantum over the stretcher,
		// the Werth over the header — with a rule under them, which is what a
		// printed table does. A head on the bed above named a column the eye
		// had to go round a corner to find; a head up the edge did not read as
		// a head at all. The line is taken out of the face, so a head costs a
		// little of every row rather than a whole row of goods.
		heads: true,
		// Whether this face is the top of its table. A face drawn on its own is
		// its own top; in a stack, only the first course is, and it is the
		// builder that says so.
		top: true,
		// A head is not a label on a table, it is the table's first line, so
		// it is set at the size of the lines under it. What tells it apart is
		// the weight and, if it is wanted, the face: the goods and the figures
		// carry the weight, the head does not.
		headSize: 100,           // per cent of the goods' own size
		headWeight: 400,
		headFace: '',            // empty is the text face
		// Italic by default, which is what the bed sets "Werth im Ganzen" and
		// "Einfuhr von" in: on these faces the italic is the voice the volumes
		// use for what is said *about* the figures rather than for a figure.
		headStyle: 'italic',     // normal · italic
		headTrack: 8,            // per cent of the size
		headRule: 0.6,           // mm, under the head
		headWaare: 'Waare',
		headQuantum: 'Quantum',
		headWerth: 'Werth',
		headerLeaders: true,     // dots across the header to its figure

		// The header is a face of its own and takes its own margin — it is
		// where the Werth stands flush right, and how far in from the arris
		// that is is the whole look of the column.
		headerPad: 7,            // mm, each side of the header face

		// The rules between the columns. The dots do the work of carrying the
		// eye across, and a rule in their way stops them short of the figure
		// they are running to, so by default there is none between the goods
		// and the Quantum.
		colRule: 0,              // mm, between the Waare and the Quantum
		valRule: 0.5,            // mm, before the Werth where it is on the stretcher

		// The bed, all in millimetres — it is a fixed 196 × 95 whatever a brick
		// is carrying, so here a size is a size. This is the setting worked out
		// on der Deckel, which is a workbench for this one face; every figure
		// below came off it.
		//
		// The bed is the only face that is not a column of figures, so it holds
		// what belongs to the whole stack and to nothing narrower: whose trade
		// it is, off which printing it was read, and what it came to. Each part
		// can be taken off on its own.
		//
		// Two things were tried on it and taken off again. The ships the
		// harbour table counted, because that is a different table on a
		// different footing and a count standing beside a Werth reads as part
		// of the same reckoning when it is not one. And the sum itself, which
		// belongs to the figures on the working faces and not over them: the
		// top says whose trade it is and where it was read, and the Werth is
		// where the Werth is. `shipsOf` is still here, because the page that
		// shows them alongside is showing, not printing.
		bedPadX: 12,
		bedPadTop: 8,
		bedPadBottom: 6,

		kicker: true,
		kickerSize: 6,           // "Einfuhr von"
		kickerGap: 3,

		titleSize: 21,           // the place
		titleGap: 3,
		underRule: 1.6,          // the heavy rule under the name
		underInset: 17,          // per cent of the face, each side
		underGap: 5,

		source: true,
		sourceSize: 5,           // which printing, which year, which pages
		sourceGap: 4,

		nameSize: 23,            // the place on the end and the back, in mm

		// The assembly mark. Cut and engraved, a yard is a heap of identical
		// rectangles of card, and nothing on a face says which brick it came
		// off or which way round it goes. So each printed side carries its
		// place, the brick's number counting down from the top, and the letter
		// of the face — br.1b — set small in the head margin where nothing
		// else stands. The bed is a, and is not marked: it is the only face
		// that is obviously itself.
		tags: true,
		tag: '',                 // the mark for this face, composed by the builder
		tagSize: 2.2,            // mm
		tagTop: 0.6,             // mm from the top edge

		press: null,             // ink.js settings, or null
	};

	// The initials of a place: the first letters of its words, or the first
	// two of a single word. Brasilien is br, Grossbritannien und Irland is gi,
	// Charleston S/C. is cs — short enough to sit in a margin, and the same
	// every time the yard is built.
	const SKIP = /^(und|van|von|de|di|del|la|le|the|of|and)$/i;
	const wordsOf = title => String(title || '')
		.split(/[^A-Za-zÄÖÜäöüßÉéÈè]+/).filter(w => w && !SKIP.test(w));

	function initials(title) {
		const words = wordsOf(title);
		if (!words.length) return 'xx';
		const s = words.length > 1
			? words.slice(0, 2).map(w => w[0]).join('')
			: words[0].slice(0, 2);
		return s.toLowerCase();
	}

	// Two letters will not always do: Hannover and Hamburg are both ha, and a
	// mark that names two places names neither. So the whole volume is given
	// its marks at once — a third letter where two collide, a fourth, a digit
	// at the last — and because the list is the volume's own and not whatever
	// is on screen, a filter cannot change what a brick is called.
	function uniqueInitials(plates) {
		const used = new Set(), map = {};
		for (const p of plates) {
			const w = wordsOf(p.title);
			const tries = w.length > 1
				? [w.slice(0, 2).map(x => x[0]).join(''), w.slice(0, 3).map(x => x[0]).join(''),
				w[0].slice(0, 2) + w[1][0], w[0].slice(0, 3), w[0].slice(0, 4)]
				: [w[0].slice(0, 2), w[0].slice(0, 3), w[0].slice(0, 4), w[0].slice(0, 5)];
			let pick = tries.map(t => (t || '').toLowerCase()).find(t => t && !used.has(t));
			if (!pick) {
				const base = (tries[0] || 'xx').toLowerCase();
				for (let i = 2; !pick; i++) if (!used.has(base + i)) pick = base + i;
			}
			used.add(pick);
			map[p.id] = pick;
		}
		return map;
	}

	// worked out once a volume and kept, so every page marks the same brick
	// the same way without having to be told to
	const NAMED = {};
	function namesFor(year) {
		if (!NAMED[year]) {
			try { NAMED[year] = uniqueInitials(T.Model.plates(year, {})); }
			catch (e) { NAMED[year] = {}; }
		}
		return NAMED[year];
	}

	// br.1b — the place, the brick counting down from the top, the face
	const tagFor = (plate, n, letter) =>
		`${namesFor(plate.year)[plate.id] || initials(plate.title)}.${n}${letter}`;

	// set in the margin over the head, where no face has anything else
	function stamp(x, o, P, wmm) {
		if (!o.tags || !o.tag || !(o.tagSize > 0)) return;
		x.save();
		x.font = `400 ${P(o.tagSize)}px ${face(o.text)}`;
		x.textAlign = 'center';
		x.textBaseline = 'top';
		x.fillStyle = o.ink;
		x.fillText(o.tag, P(wmm / 2), P(o.tagTop));
		x.restore();
	}

	const opt = o => Object.assign({}, DEFAULTS, o || {});
	const face = id => T.Plate.faceCss(id);
	// the figures keep their own face only if they were given one
	const figFace = o => face(o.figFace || o.text);
	const merged = o => o.figuresOn === 'stretcher';

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
	// the press takes the face's own two colours, so a brick comes off it clay
	// and inked rather than grey
	function pressed(c, o) {
		if (o.press && o.press.on && AE.Tafeln.Ink)
			AE.Tafeln.Ink.apply(c, Object.assign({}, o.press, {
				inkColour: o.ink, paperColour: o.clay,
			}), o.ppmm / 4);
		return c;
	}

	function fit(x, text, w) {
		if (x.measureText(text).width <= w) return text;
		let s = text;
		while (s.length > 1 && x.measureText(s + '.').width > w) s = s.slice(0, -1);
		return s.replace(/[\s,.-]+$/, '') + '.';
	}

	// what the money is called on this line — said outright, dittoed under the
	// line above, or not said. Each face says it for itself: a brick lifted off
	// the stack is still a brick whose figures are named.
	const markFor = (o, i) => o.currency === 'every' ? o.mark
		: o.currency === 'first' ? (i === 0 ? o.mark : o.markDitto)
			: '';

	// The mark stands in a column of its own, so that the figures go on lining
	// up under each other whether the line says "Ld'or" or carries a ditto.
	// Nothing is reserved when nothing is said.
	function markCol(x, o, P, size) {
		if (o.currency === 'none') return 0;
		x.font = `400 ${P(size * o.markSize / 100)}px ${face(o.text)}`;
		const w = Math.max(x.measureText(o.mark).width,
			o.currency === 'first' ? x.measureText(o.markDitto).width : 0);
		return w + P(o.markGap);
	}

	// The head line, and where the goods begin under it.
	//
	// A stack is one table, so it has one head: the top brick's, and no other.
	// That being so, the head cannot be paid for out of every row — a top brick
	// whose rows were shorter than the courses under it would not line up with
	// them. It takes a row instead. The face is divided into the same rows
	// whether or not it carries a head; where it does, the first of them is the
	// head and the brick carries one good fewer, which `courses` deals for.
	function headBand(o, hmm) {
		const shown = o.heads && o.top && o.rows > 1;
		const rowH = (hmm - o.padY * 2) / Math.max(1, o.rows);
		const size = rowH * (o.goodsSize / 100) * (o.headSize / 100);
		return {
			rowH, shown,
			rows: shown ? o.rows - 1 : o.rows,        // goods this face can hold
			top: o.padY + (shown ? rowH : 0),         // where the goods begin
			size,
			base: o.padY + rowH * 0.5 + size * 0.36,
		};
	}

	function headFont(x, o, P, size) {
		x.font = `${o.headStyle === 'italic' ? 'italic ' : ''}` +
			`${o.headWeight} ${P(size)}px ${face(o.headFace || o.text)}`;
		x.letterSpacing = o.headTrack ? P(size * o.headTrack / 100) + 'px' : '0px';
	}

	// A head over the middle of its column. Tracking is added after the last
	// letter as well as between them, so a tracked word measures wider than it
	// looks and centres a half-space to the left of where it should — hence
	// the nudge back. `from`/`to` are the column's real extent in pixels, not
	// the margins: a head belongs over the figures, not over the white the
	// dots cross to reach them.
	function headMid(x, o, P, size, text, from, to, y) {
		const track = o.headTrack ? P(size * o.headTrack / 100) : 0;
		x.textAlign = 'center';
		x.fillText(text, (from + to) / 2 + track / 2, y);
	}

	function leaders(x, from, to, y, size) {
		if (to - from < size * 0.8) return;
		const step = size * 0.42, r = Math.max(0.5, size * 0.05);
		x.beginPath();
		for (let dx = from; dx <= to; dx += step) { x.moveTo(dx + r, y); x.arc(dx, y, r, 0, Math.PI * 2); }
		x.fill();
	}

	/* ------------------------------------------------- the stretcher, 200×50 */

	// the goods: name run out on leader dots to its quantity and measure — and
	// to its value as well, where the two figures are asked for on one face
	function stretcher(rows, o) {
		o = opt(o);
		const { c, x, P } = surface(BRICK.l, BRICK.h, o);
		const H = headBand(o, BRICK.h);
		const rowH = H.rowH;
		const size = rowH * (o.goodsSize / 100);
		const fsize = rowH * (o.figSize / 100);
		const line = Math.max(size, fsize);       // what the baseline is set by
		const both = merged(o);
		const fig = `${o.figWeight} ${P(fsize)}px ${figFace(o)}`;

		// The Werth column, measured before anything is drawn. It starts at the
		// width of a seven-figure sum whatever this brick happens to carry, so
		// that the column falls in the same place on every brick of a stack —
		// a rule that wandered from course to course would be worse than a
		// column slightly too wide. A larger figure still widens it.
		let valW = 0, markW = 0;
		if (both) {
			markW = markCol(x, o, P, fsize);
			x.font = fig;
			valW = x.measureText('000,000').width;
			for (let i = 0; i < H.rows; i++) {
				const r = rows[i];
				if (r) valW = Math.max(valW, x.measureText(figure(r.value)).width);
			}
			valW += markW + P(5);
		}

		// how far the quantities and their measures actually reach — what the
		// Quantum head has to stand over
		x.font = fig;
		let qtyBlock = 0;
		for (let i = 0; i < H.rows; i++) {
			const r = rows[i];
			if (!r) continue;
			const u = r.unit || '';
			qtyBlock = Math.max(qtyBlock, x.measureText(figure(r.qty)).width
				+ (u ? P(2.5) + x.measureText(u).width : 0));
		}

		// the name column gives up what the values take, so the quantity keeps
		// the room it had — a name is clipped before a figure is
		const split = o.padX + (BRICK.l - o.padX * 2) * o.nameCol - valW / o.ppmm;

		// The rules between the columns. Where there is a head they start under
		// it, as the column rules do in the volumes — the head stands over the
		// columns, not inside them.
		const ruleTop = H.shown ? H.top : o.padY * 0.4;
		const rule = (at, w) => w > 0 && x.fillRect(P(at), P(ruleTop), Math.max(1, P(w)),
			P(BRICK.h - o.padY * 0.4 - ruleTop));
		rule(split, o.colRule);
		const valX = BRICK.l - o.padX - valW / o.ppmm;
		if (valW) rule(valX + 2.5, o.valRule);

		// the head line — Waare over the names, Quantum over the figures that
		// belong to them, and the Werth where the values have come round
		if (H.shown) {
			headFont(x, o, P, H.size);
			const hy = P(H.base);
			// the names are set from the left margin, so their head is too
			x.textAlign = 'left';
			x.fillText(o.headWaare, P(o.padX), hy);
			const qtyEnd = P(BRICK.l - o.padX) - valW;
			headMid(x, o, P, H.size, o.headQuantum,
				Math.max(P(split), qtyEnd - qtyBlock), qtyEnd, hy);
			if (valW) {
				headMid(x, o, P, H.size, o.headWerth,
					P(valX) + P(2.5), P(BRICK.l - o.padX), hy);
			}
			x.letterSpacing = '0px';
			if (o.headRule > 0)
				x.fillRect(P(o.padX), P(H.top - o.headRule), P(BRICK.l - o.padX * 2), P(o.headRule));
		}

		for (let i = 0; i < H.rows; i++) {
			const r = rows[i];
			if (!r) continue;
			// the baseline sits a little under the middle of its row
			const y = P(H.top + rowH * i + rowH * 0.5 + line * 0.36);

			x.font = `${o.goodsWeight} ${P(size)}px ${face(o.text)}`;
			x.textAlign = 'left';
			const nameW = P(split - o.padX) - P(3);
			const name = fit(x, r.article, nameW);
			x.fillText(name, P(o.padX), y);

			const qty = figure(r.qty);
			const unit = r.unit || '';
			x.font = fig;
			x.textAlign = 'right';
			const unitW = unit ? x.measureText(unit).width + P(2.5) : 0;
			const qtyRight = P(BRICK.l - o.padX) - unitW - valW;
			const qtyLeft = qtyRight - x.measureText(qty).width;
			x.fillText(qty, qtyRight, y);
			if (unit) {
				x.textAlign = 'left';
				x.fillText(unit, qtyRight + P(2.5), y);
			}
			if (valW) {
				x.font = fig;
				x.textAlign = 'right';
				x.fillText(figure(r.value), P(BRICK.l - o.padX) - markW, y);
				const mk = markFor(o, i);
				if (mk) {
					x.font = `400 ${P(fsize * o.markSize / 100)}px ${face(o.text)}`;
					x.textAlign = 'left';
					x.fillText(mk, P(BRICK.l - o.padX) - markW + P(o.markGap), y);
				}
			}

			// The dots run from the end of the name to the first figure of the
			// quantity — not to the column boundary, which is a line the eye
			// has no business stopping at. A quantity is right-aligned, so
			// where its first figure falls is a different place on every line,
			// and the dots are cut to each.
			x.textAlign = 'left';
			x.font = `${o.goodsWeight} ${P(size)}px ${face(o.text)}`;
			const nw = x.measureText(name).width;
			leaders(x, P(o.padX) + nw + P(2.5), qtyLeft - P(2.5),
				y - P(size * 0.28), P(size));
		}
		stamp(x, o, P, BRICK.l);
		return pressed(c, o);
	}

	/* --------------------------------------------------- the header, 100×50 */

	// the values of those same goods, on the same three lines. Where the values
	// have gone round to the stretcher this face has nothing left to carry.
	function header(rows, o) {
		o = opt(o);
		const { c, x, P } = surface(BRICK.d, BRICK.h, o);
		if (merged(o)) return pressed(c, o);
		const H = headBand(o, BRICK.h);
		const rowH = H.rowH;
		const size = rowH * (o.goodsSize / 100);
		const fsize = rowH * (o.figSize / 100);
		const line = Math.max(size, fsize);       // the same baseline the goods sit on
		const markW = markCol(x, o, P, fsize);
		const pad = Number.isFinite(o.headerPad) ? o.headerPad : o.padX;
		const left = P(pad);
		const right = P(BRICK.d - pad) - markW;

		// how far the figures and their mark reach, so the head can stand over
		// the column and not over the dots that run to it
		x.font = `${o.figWeight} ${P(fsize)}px ${figFace(o)}`;
		let valBlock = 0;
		for (let i = 0; i < H.rows; i++) {
			const r = rows[i];
			if (r) valBlock = Math.max(valBlock, x.measureText(figure(r.value)).width);
		}
		const colFrom = right - valBlock, colTo = P(BRICK.d - pad);

		// the head over that column, squeezed if the face is too narrow to
		// take the word at length
		if (H.shown) {
			headFont(x, o, P, H.size);
			const avail = P(BRICK.d - pad * 2);
			const w = x.measureText(o.headWerth).width;
			if (w > avail) {
				x.save();
				x.textAlign = 'center';
				x.translate((colFrom + colTo) / 2, 0);
				x.scale(avail / w, 1);
				x.fillText(o.headWerth, 0, P(H.base));
				x.restore();
			} else {
				headMid(x, o, P, H.size, o.headWerth, colFrom, colTo, P(H.base));
			}
			x.letterSpacing = '0px';
			if (o.headRule > 0)
				x.fillRect(P(pad), P(H.top - o.headRule), P(BRICK.d - pad * 2), P(o.headRule));
		}

		for (let i = 0; i < H.rows; i++) {
			const r = rows[i];
			if (!r) continue;
			const y = P(H.top + rowH * i + rowH * 0.5 + line * 0.36);
			x.font = `${o.figWeight} ${P(fsize)}px ${figFace(o)}`;
			const fg = figure(r.value);
			x.textAlign = 'right';
			x.fillText(fg, right, y);
			const mk = markFor(o, i);
			if (mk) {
				x.font = `400 ${P(fsize * o.markSize / 100)}px ${face(o.text)}`;
				x.textAlign = 'left';
				x.fillText(mk, right + P(o.markGap), y);
			}
			// dots from the head across to the figure, which stays flush right
			if (o.headerLeaders) {
				x.font = `${o.figWeight} ${P(fsize)}px ${figFace(o)}`;
				x.textAlign = 'left';
				leaders(x, left + P(1.5), right - x.measureText(fg).width - P(2.5),
					y - P(fsize * 0.28), P(fsize));
			}
		}
		stamp(x, o, P, BRICK.d);
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

	// The arrivals from that place, as the harbour table has them — a different
	// table from the goods, and a coarser one: it breaks out some places and
	// not others. A place it never reached has no line rather than a nought,
	// because the volumes count what came in and silence is not zero ships.
	function shipsOf(year, id) {
		const vol = (global.HANDEL || {})[year];
		if (!vol || !vol.ports) return null;
		return vol.ports.find(r => r.place === id && r.dir === 'angekommen') || null;
	}

	function shipsLine(s, what) {
		if (!s) return null;
		const n = v => (Number.isFinite(v) ? figure(v) : null);
		const bits = [];
		if (n(s.ships_total)) bits.push(`${n(s.ships_total)} Schiffe`);
		if (what === 'ships') return bits.join(' · ') || null;
		if (n(s.capacity)) bits.push(`${n(s.capacity)} Lasten`);
		if (n(s.crew)) bits.push(`${n(s.crew)} Mann`);
		if (what === 'full' && Number.isFinite(s.ships_empty) && s.ships_empty)
			bits.splice(1, 0, `${n(s.ships_laden)} beladen, ${n(s.ships_empty)} leer`);
		return bits.join(' · ') || null;
	}

	// Every baseline and rule on the bed, settled before anything is inked, so
	// that the page can say what the setting has left of the face before it is
	// drawn. `bedOn` at `source` takes the place and its kicker off and lets
	// the rest fall up the face — worth having, because in a yard seen from
	// above the names are the loudest thing on the field.
	function bedLayout(plate, o) {
		o = opt(o);
		const at = {};
		const full = o.bedOn !== 'sum' && o.bedOn !== 'source';
		let y = o.bedPadTop;

		if (o.kicker && full) { at.kicker = y + o.kickerSize * 0.80; y += o.kickerSize + o.kickerGap; }

		if (full) {
			at.title = y + o.titleSize * 0.72;
			y += o.titleSize * 0.92 + o.titleGap;
			if (o.underRule > 0) { at.underRule = y; y += o.underRule + o.underGap; }
		}

		if (o.source) { at.source = y + o.sourceSize * 0.80; y += o.sourceSize + o.sourceGap; }

		at.flowBottom = y;
		// what the flow has left of the face, or how far it has run off it
		at.slack = (BRICK.d - o.bedPadBottom) - y;
		return at;
	}

	function bed(plate, opts) {
		const o = opt(opts);
		const { c, x, P } = surface(BRICK.l, BRICK.d, o);
		const at = bedLayout(plate, o);
		const W = BRICK.l;
		const TEXT = face(o.text), DISPLAY = face(o.display), FIG = figFace(o);

		x.textAlign = 'center';

		if (at.kicker != null) {
			x.font = `400 italic ${P(o.kickerSize)}px ${TEXT}`;
			x.fillText('Einfuhr von', P(W / 2), P(at.kicker));
		}

		if (at.title != null) {
			// the fat face is wide; a long name squeezes rather than overrun
			const title = plate.title + '.';
			const avail = P(W - o.bedPadX * 2);
			x.font = `400 ${P(o.titleSize)}px ${DISPLAY}`;
			const tw = x.measureText(title).width;
			if (tw > avail) {
				x.save();
				x.translate(P(W / 2), 0);
				x.scale(avail / tw, 1);
				x.fillText(title, 0, P(at.title));
				x.restore();
			} else {
				x.fillText(title, P(W / 2), P(at.title));
			}
		}

		if (at.underRule != null) {
			const ui = W * o.underInset / 100;
			x.fillRect(P(ui), P(at.underRule), P(W - ui * 2), P(o.underRule));
		}

		if (at.source != null) {
			x.font = `400 italic ${P(o.sourceSize)}px ${TEXT}`;
			x.fillText(sourceLine(plate), P(W / 2), P(at.source));
		}

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
		stamp(x, o, P, wmm);
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
	//
	// A stack may also be given a ceiling. Newyork 1851 sent 78 goods and at
	// three to a brick stands twenty-six courses high, which is a stack no one
	// can read the top of and a yard nothing else can stand beside. Past the
	// ceiling the tail is folded into one line — which is not an invention:
	// the volumes do exactly this, and call it "Uebrige Einfuhr". The line
	// carries its own sum, so the stack still adds up to what the place sent;
	// the quantity is a dash, because pounds and pieces do not add together.
	function courses(plate, rowsPerBrick, sides, cap, heads) {
		const n = Math.max(1, rowsPerBrick | 0);
		const two = sides === 2;
		const per = two ? n * 2 : n;
		// The top brick gives a line to the head of the table, on each face it
		// prints — so it carries one good fewer, and the courses under it are
		// full and line up with each other. The flag is read off the defaults
		// when the builder has not been told otherwise, because a builder asks
		// this before opt() has filled anything in.
		const wanted = heads === undefined ? DEFAULTS.heads : heads;
		const head = !!wanted && n > 1;
		const firstN = head ? n - 1 : n;
		const firstPer = two ? firstN * 2 : firstN;

		let rows = plate.rows;
		const limit = cap > 0 ? cap : Infinity;
		const room = limit === Infinity ? Infinity : firstPer + (limit - 1) * per;
		if (rows.length > room) {
			const rest = rows.slice(room - 1);
			const known = rest.filter(r => Number.isFinite(r.value));
			rows = rows.slice(0, room - 1).concat([{
				article: `Uebrige Waaren (${rest.length})`,
				qty: null, unit: '', cat: 'folded', merged: 0,
				value: known.length ? known.reduce((s, r) => s + r.value, 0) : null,
			}]);
		}

		const out = [];
		for (let i = 0; i < rows.length || !out.length;) {
			const top = !out.length;
			const take = top ? firstPer : per;
			const cut = top ? firstN : n;
			const load = rows.slice(i, i + take);
			out.push({ front: load.slice(0, cut), back: two ? load.slice(cut) : [], head: top && head });
			i += take;
			if (out.length >= limit) break;
		}
		return out;
	}

	/* ------------------------------------------------------- the whole stack */

	// Every printed side of a stack, in the order it stands: course by course
	// from the top down, the bed with the course that carries it, and the two
	// name faces last, since they belong to no one course. Each carries its
	// size, the mark it will be engraved with, and a way to draw it.
	//
	// The lettering lives here and nowhere else. The yard, the exporter and
	// the engraver all read this list, so what a brick has on it cannot be one
	// thing on screen and another on the bed of a laser.
	function faceList(plate, o) {
		o = opt(o);
		const cs = courses(plate, o.rows, o.sides, o.maxBricks, o.heads);
		const two = o.sides === 2;
		const oneFace = merged(o);
		const nameOn = (two && !oneFace) ? 'none' : (o.nameOn || 'none');
		const out = [];

		const put = (id, tag, kind, w, h, course, letter, make) =>
			out.push({ id, tag, kind, w, h, course, letter, make });

		cs.forEach((load, i) => {
			const n = i + 1;
			const top = load.head ? {} : { top: false };
			const opts = (l, ov) => Object.assign({}, o, top, ov, { tag: tagFor(plate, n, l) });

			put(`c${n}b`, tagFor(plate, n, 'b'), 'stretcher', BRICK.l, BRICK.h, n, 'b',
				ov => stretcher(load.front, opts('b', ov)));
			if (!oneFace)
				put(`c${n}c`, tagFor(plate, n, 'c'), 'header', BRICK.d, BRICK.h, n, 'c',
					ov => header(load.front, opts('c', ov)));
			if (two && load.back.length) {
				put(`c${n}d`, tagFor(plate, n, 'd'), 'stretcher', BRICK.l, BRICK.h, n, 'd',
					ov => stretcher(load.back, opts('d', ov)));
				if (!oneFace)
					put(`c${n}e`, tagFor(plate, n, 'e'), 'header', BRICK.d, BRICK.h, n, 'e',
						ov => header(load.back, opts('e', ov)));
			}
			// the bed comes off the course that carries it, and only that one
			if (i === 0 && o.bedOn !== 'none')
				put(`c${n}a`, tagFor(plate, n, 'a'), 'bed', BRICK.l, BRICK.d, n, 'a',
					ov => bed(plate, Object.assign({}, o, ov)));
		});

		// the name is one drawing for every course, so it is marked by face
		// alone and comes off once however tall the stack is
		const nameOpts = (l, ov) => Object.assign({}, o, ov, { tag: tagFor(plate, '', l) });
		if (nameOn === 'end' || nameOn === 'both')
			put('name-e', tagFor(plate, '', 'e'), 'name', BRICK.d, BRICK.h, 0, 'e',
				ov => nameplate(plate, BRICK.d, BRICK.h, nameOpts('e', ov)));
		if (nameOn === 'back' || nameOn === 'both')
			put('name-d', tagFor(plate, '', 'd'), 'name', BRICK.l, BRICK.h, 0, 'd',
				ov => nameplate(plate, BRICK.l, BRICK.h, nameOpts('d', ov)));

		return out;
	}

	S.Faces = {
		BRICK, DEFAULTS, stretcher, header, bed, bedLayout, nameplate, blank, courses,
		sourceLine, shipsOf, shipsLine, tagFor, initials, namesFor, faceList,
	};
})(window);

// a bitmap, as a laser actually eats it.
//
// the head cannot address a pixel. it can only sweep a line at a fixed
// feedrate and be told, continuously, how hard to burn. so a raster job is
// one scanline per pixel row, and along each line a sequence of moves whose
// only interesting property is where the power changes:
//
//   G1X0.2S100   burn 0.2 mm
//   G1X0.1S0     coast 0.1 mm dark
//
// that is the whole format. everything below is about emitting as few of
// those as possible, in an order that wastes as little travel as possible,
// without the arithmetic drifting.
(function () {
	const AE = (window.AE = window.AE || {});

	// what the longer app expects on disk. the contents are the same either
	// way — .nc, .gcode and .gc are the same text under different names —
	// but the file picker filters on it, so it matters.
	const EXT = 'gc';

	const DEFAULTS = {
		feed: 6000,          // mm/min along a scanline
		rapid: 12000,        // mm/min for the jumps between them, estimate only
		power: 10,           // percent
		sMax: 1000,          // grbl $30 — what "full power" is called in S units
		laserMode: 'M3',     // M3 constant, M4 dynamic (power tracks velocity)
		passes: 1,
		bidirectional: true, // scan alternate rows backwards
		overscan: 0,         // mm of run-up outside the image, see below
		scanOffset: 0,       // mm, shifts reverse rows to fix bidirectional ghosting
		airAssist: true,     // M8 / M9
		originX: 0,          // where the bottom-left of the tile sits on the bed
		originY: 0,
		park: true,          // return to origin at the end
		precision: 3
	};

	// ---------- number formatting ----------
	// grbl parses decimals; every character still costs upload time over
	// serial, so trailing zeros go. "1" not "1.000", "-0" never.
	function fmt(v, prec) {
		let s = v.toFixed(prec);
		if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
		return s === '-0' ? '0' : s;
	}
	const q = (v, prec) => Number(v.toFixed(prec));

	// ---------- power ----------
	// gray 0 is ink, 255 is bare clay. bare clay must come out exactly S0:
	// anything else and the laser idles hot across the whole white margin.
	// there is deliberately no minimum-power floor: a tone whose share of the
	// power rounds below one S unit is under what the machine can address, so
	// it is dropped to 0 and its row is never travelled. the cutoff moves with
	// the power — at 10% only gray 254+ is free, at 100% only 255. so a scan
	// with a hazy off-white margin will still travel that margin in grayscale
	// mode. the cure is the levels, or dither, not a fudge here.
	function powerFn(o, binary) {
		const burn = Math.round(o.sMax * o.power / 100);
		if (binary) return v => (v < 128 ? burn : 0);
		return v => Math.round(burn * (255 - v) / 255);
	}

	// ---------- one row, run-length encoded ----------
	// trimmed to the ink: leading and trailing white is not travelled at all.
	// interior white stays, as an S0 run, because stopping and restarting the
	// move would change the velocity and therefore the burn on both sides.
	function rowRuns(gray, w, iy, power) {
		const base = iy * w;
		const s = new Int32Array(w);
		let c0 = -1, c1 = -1;
		for (let c = 0; c < w; c++) {
			const v = power(gray[base + c]);
			s[c] = v;
			if (v > 0) { if (c0 < 0) c0 = c; c1 = c; }
		}
		if (c0 < 0) return null;              // blank row: never visited

		const runs = [];
		let from = c0, cur = s[c0];
		for (let c = c0 + 1; c <= c1; c++) {
			if (s[c] !== cur) { runs.push({ s: cur, from, to: c }); from = c; cur = s[c]; }
		}
		runs.push({ s: cur, from, to: c1 + 1 });
		return { c0, c1, runs };
	}

	// ---------- the generator ----------
	// gray: one byte per pixel, row 0 at the top of the picture.
	// tileW/tileH: what that raster measures on the brick, in mm. the pitch is
	// derived from these and not from the dpi, so the burn lands at the true
	// size of the face even when the pixel count had to round.
	function raster(gray, w, h, tileW, tileH, opts) {
		const o = Object.assign({}, DEFAULTS, opts);
		const prec = o.precision;
		const pitchX = tileW / w, pitchY = tileH / h;
		const power = powerFn(o, !!o.binary);
		const x0 = o.originX, y0 = o.originY;

		const body = [];
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		let burnMM = 0, darkMM = 0, rapidMM = 0, moves = 0, lines = 0;
		let atX = null, atY = null;   // where the head is, for the rapid estimate

		// the machine is driven in G91 for the scanline, so every move is a
		// delta. rounding each delta on its own would let the error walk the
		// length of the row. instead: round the *target*, send the difference
		// against what the machine was actually told, and carry the remainder.
		// the error stays under half a unit of the last decimal, forever.
		let told = 0;
		function go(targetAbs, s) {
			const d = q(q(targetAbs, prec) - told, prec);
			if (d === 0) return;              // sub-micron run, absorbed by its neighbour
			body.push('G1X' + fmt(d, prec) + 'S' + s);
			told = q(told + d, prec);
			moves++;
			if (s > 0) burnMM += Math.abs(d); else darkMM += Math.abs(d);
		}

		for (let pass = 0; pass < o.passes; pass++) {
			if (o.passes > 1) body.push(`; pass ${pass + 1} of ${o.passes}`);
			let forward = true;

			for (let iy = h - 1; iy >= 0; iy--) {
				const row = rowRuns(gray, w, iy, power);
				if (!row) continue;           // nothing on this line, do not travel it

				// the raster is top-down, the bed is bottom-up. the beam sits on
				// the centre of a pixel row in Y, but sweeps pixel edge to pixel
				// edge in X — in Y the lines are discrete, in X the motion is not.
				const y = y0 + (h - 1 - iy + 0.5) * pitchY;
				const rx0 = forward ? x0 : x0 - o.scanOffset;
				const left = rx0 + row.c0 * pitchX;
				const right = rx0 + (row.c1 + 1) * pitchX;
				const startX = forward ? left - o.overscan : right + o.overscan;

				if (atX !== null) rapidMM += Math.hypot(startX - atX, y - atY);
				body.push('G90');
				body.push('G0X' + fmt(q(startX, prec), prec) + 'Y' + fmt(q(y, prec), prec));
				body.push('G91');
				told = q(startX, prec);

				// run-up: with M3 the power is constant regardless of speed, so
				// the head has to already be at feedrate when it meets the first
				// lit pixel — otherwise the leading edge of every row is cooked.
				// M4 scales power with velocity and does not need this.
				if (o.overscan > 0) go(forward ? left : right, 0);

				if (forward) for (const r of row.runs) go(rx0 + r.to * pitchX, r.s);
				else for (let i = row.runs.length - 1; i >= 0; i--) go(rx0 + row.runs[i].from * pitchX, row.runs[i].s);

				if (o.overscan > 0) go(forward ? right + o.overscan : left - o.overscan, 0);

				atX = told; atY = y; lines++;
				minX = Math.min(minX, startX, told); maxX = Math.max(maxX, startX, told);
				minY = Math.min(minY, y); maxY = Math.max(maxY, y);
				if (o.bidirectional) forward = !forward;
			}
		}

		// ignores acceleration, so it reads low on art with short runs — but
		// it is honest about the axis that dominates: how far the head travels
		const seconds = (burnMM + darkMM) / o.feed * 60 + rapidMM / o.rapid * 60;

		return {
			body, lines, moves, ink: lines > 0,
			bounds: lines ? { minX, minY, maxX, maxY } : null,
			burnMM, darkMM, rapidMM, seconds,
			pitchX, pitchY
		};
	}

	const clock = s => {
		const t = Math.round(s);
		return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
	};

	// ---------- comments ----------
	// grbl reads one line at a time into a fixed buffer, and on the serial
	// side of most builds that buffer is 128 bytes. a longer line is not
	// merely a long line: it overflows, the controller errors on it, and
	// since the header stands before the first move the job then does
	// nothing at all — no frame, no burn, no complaint that means anything.
	// no comment is worth that, so every one of them is folded to a width
	// that cannot overflow anything.
	//
	// and folded in ASCII. an em dash is three bytes and a multiplication
	// sign is two, so a header set in the desk's own typography runs half
	// again as long as it looks; on a controller that counts bytes rather
	// than characters that is the difference between a file that runs and a
	// file that does not. the prose belongs on the screen. what goes down
	// the wire is plain.
	const ASCII = {
		'—': '-', '–': '-', '×': 'x', '·': '-',
		'…': '...', '°': 'deg', ' ': ' ',
		'’': "'", '‘': "'", '“': '"', '”': '"'
	};
	// bremen is full of umlauts and the project names carry them, so the
	// accents are stripped rather than turned into question marks
	const plain = s => String(s)
		.replace(/ß/g, 'ss')
		.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\x20-\x7e]/g, c => (ASCII[c] != null ? ASCII[c] : '?'));

	const COMMENT_COLS = 70;
	function fold(line) {
		const body = plain(line).replace(/^;[ ]?/, '');
		const indent = (body.match(/^[ \t]*/) || [''])[0];
		const words = body.trim().split(/\s+/).filter(Boolean);
		if (!words.length) return [';'];
		const out = [];
		let cur = '';
		for (const w of words) {
			const next = cur ? cur + ' ' + w : indent + w;
			// a single word longer than the line is left whole: breaking a
			// coordinate or a label costs more than the long line saves
			if (cur && next.length + 2 > COMMENT_COLS) { out.push('; ' + cur); cur = indent + '  ' + w; }
			else cur = next;
		}
		if (cur) out.push('; ' + cur);
		return out;
	}

	// fold the comments in a list of lines and leave the moves alone
	function folded(lines) {
		const out = [];
		for (const l of lines) {
			if (l.charAt(0) === ';') { for (const f of fold(l)) out.push(f); }
			else out.push(l);
		}
		return out;
	}

	// ---------- the file ----------
	function wrap(r, o, meta) {
		const prec = o.precision;
		// the header states what the head will touch, so you can frame it
		// before you send it — which means the park move counts too, not
		// just the ink
		// Where the head goes when it is finished. It defaults to the tile's
		// own corner, but a tile that is one small face on a large bed would
		// then have the machine framing the whole way back to that corner —
		// the framing box is the box of every move in the file, park included.
		// So a caller may say where to park instead.
		const parkX = o.parkX != null ? o.parkX : o.originX;
		const parkY = o.parkY != null ? o.parkY : o.originY;

		// A rectangle the head is asked to walk before anything is lit. It
		// costs a few rapids and it is what the machine's "frame" traces, so
		// the work can be squared up against the material before the beam is
		// on — and it makes the framing box the work itself rather than
		// whatever the ink happened to reach.
		const fr = o.frame;

		let b = r.bounds;
		if (b) {
			const xs = [b.minX, b.maxX], ys = [b.minY, b.maxY];
			if (o.park) { xs.push(parkX); ys.push(parkY); }
			if (fr) { xs.push(fr.minX, fr.maxX); ys.push(fr.minY, fr.maxY); }
			b = {
				minX: Math.min(...xs), minY: Math.min(...ys),
				maxX: Math.max(...xs), maxY: Math.max(...ys)
			};
		}
		const head = [
			`; ${meta.title}`,
			'; anti-epigraph engraving desk — GRBL / Longer, absolute coords, mm',
			`; ${meta.subtitle}`,
			`; Image @ ${o.feed} mm/min, ${o.power}% power` + (o.passes > 1 ? ` × ${o.passes} passes` : ''),
			`; Line spacing ${fmt(r.pitchY, 4)} mm — ${fmt(1 / r.pitchY, 3)} lines/mm`,
			`; ${o.laserMode === 'M4' ? 'M4 dynamic' : 'M3 constant'} power, S0..${o.sMax}` +
			`, ${o.bidirectional ? 'bi-directional' : 'one way'}` +
			(o.overscan > 0 ? `, ${fmt(o.overscan, 2)} mm overscan` : ''),
			b ? `; Bounds: X${fmt(q(b.minX, prec), prec)} Y${fmt(q(b.minY, prec), prec)} to X${fmt(q(b.maxX, prec), prec)} Y${fmt(q(b.maxY, prec), prec)}`
				: '; Bounds: nothing to burn',
			`; ${r.lines} lines, ${r.moves} moves, ~${clock(r.seconds)} at speed`
		];
		for (const n of (o.notes || [])) head.push(n.charAt(0) === ';' ? n : '; ' + n);
		head.push('G00 G17 G40 G21 G54');
		if (fr) {
			const n = v => fmt(q(v, prec), prec);
			head.push('; frame — the head walks the work before the beam is on');
			head.push('G90');
			head.push(`G0X${n(fr.minX)}Y${n(fr.minY)}`);
			head.push(`G0X${n(fr.maxX)}Y${n(fr.minY)}`);
			head.push(`G0X${n(fr.maxX)}Y${n(fr.maxY)}`);
			head.push(`G0X${n(fr.minX)}Y${n(fr.maxY)}`);
			head.push(`G0X${n(fr.minX)}Y${n(fr.minY)}`);
		}
		if (o.airAssist) head.push('M8');
		head.push('; Layer C00');
		head.push(o.laserMode === 'M4' ? 'M4' : 'M3');
		head.push('S0');
		head.push('F' + o.feed);

		const tail = ['G90', 'M5'];
		if (o.airAssist) tail.push('M9');
		if (o.park) tail.push('G0X' + fmt(q(parkX, prec), prec) + 'Y' + fmt(q(parkY, prec), prec));
		tail.push('M2');

		// the body is moves, ASCII and short by construction; only what was
		// written as prose needs folding
		const top = folded(head), bottom = folded(tail);
		if (!r.ink) {
			return top.concat(folded(['; no ink on this face at these levels — nothing to burn']), bottom)
				.join('\n') + '\n';
		}
		return top.concat(r.body, bottom).join('\n') + '\n';
	}

	// ---------- a quarter turn ----------
	// a brick laid on its side on the bed wants its picture laid on its side
	// too, or it comes off the machine turned. done on the bytes rather than
	// through a canvas: at exactly ninety degrees this is a re-indexing and
	// not a resampling, so not one pixel of a dithered face is touched — put
	// the same raster through a canvas rotation and a smoothing pass would
	// turn hard black and white into grays the head has no way to burn.
	//
	// anticlockwise: the top edge of the picture comes to lie down the
	// left-hand side, and what was its right-hand edge points up the bed.
	function quarterTurn(gray, w, h) {
		const out = new Uint8ClampedArray(gray.length);
		// the result is h wide and w tall, and out(X, Y) = in(w - 1 - Y, X)
		for (let Y = 0; Y < w; Y++) {
			const u = w - 1 - Y;
			const row = Y * h;
			for (let X = 0; X < h; X++) out[row + X] = gray[X * w + u];
		}
		return { gray: out, w: h, h: w };
	}

	// pull the gray channel back out of a processed canvas. Imaging.process
	// writes r = g = b, so one channel is the whole story.
	function fromCanvas(c) {
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		const gray = new Uint8ClampedArray(c.width * c.height);
		for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = d[i];
		return { gray, w: c.width, h: c.height };
	}

	// one brick face, ready to send. dither and threshold are already black
	// and white, so their power is binary; grayscale modulates S per pixel,
	// which the run-length encoder can barely compress — expect a fat file.
	function tile(processedCanvas, tileMM, project, extra) {
		const o = Object.assign({}, DEFAULTS, project.gcode, extra, {
			binary: project.laser.mode !== 'grayscale'
		});
		const { gray, w, h } = fromCanvas(processedCanvas);
		const r = raster(gray, w, h, tileMM.w, tileMM.h, o);
		return { text: wrap(r, o, tileMM.meta), stats: r };
	}

	// ---------- several faces, one file ----------
	// a bed with more than one brick on it.
	//
	// the machine cannot reach a whole wall. it can reach about four hundred
	// millimetres square, so a wall is cut a few bricks at a time — and a few
	// bricks laid out together want to be one job, not three files sent one
	// after the other with the bed re-squared between them.
	//
	// each face is rastered on its own, at its own place on the bed, and the
	// bodies are strung together in the order given. that is deliberate: a
	// single raster spanning the whole bed would sweep every scanline across
	// the ground between the bricks, and although nothing would be lit there
	// the head would still travel it, at feedrate, for every line of the job.
	// done this way the head finishes one face and jumps to the next, and the
	// only rectangles it visits are the faces themselves.
	//
	// pieces: [{ canvas, w, h, x, y, label }] — w/h what the face measures in
	// mm, x/y the bottom-left of it relative to the file's origin.
	function sheet(pieces, meta, project, extra) {
		const o = Object.assign({}, DEFAULTS, project.gcode, extra, {
			binary: project.laser.mode !== 'grayscale'
		});
		const prec = o.precision;
		const body = [];
		const placed = [];
		let lines = 0, moves = 0, burnMM = 0, darkMM = 0, rapidMM = 0, seconds = 0;
		let bounds = null, pitchX = 0, pitchY = 0, prev = null;

		for (const p of pieces) {
			let { gray, w, h } = fromCanvas(p.canvas);
			// p.w and p.h are what the face measures *as it lies*, so a turned
			// face is handed over already swapped and the pitch comes out right
			if (p.turn) ({ gray, w, h } = quarterTurn(gray, w, h));
			const r = raster(gray, w, h, p.w, p.h, Object.assign({}, o, {
				originX: o.originX + p.x, originY: o.originY + p.y
			}));
			pitchX = r.pitchX; pitchY = r.pitchY;

			for (const line of fold(`; ${p.label} — bottom-left at X${fmt(q(o.originX + p.x, prec), prec)}` +
				` Y${fmt(q(o.originY + p.y, prec), prec)}, ${fmt(p.w, 2)} × ${fmt(p.h, 2)} mm` +
				(p.turn ? ', turned' : '') +
				(r.ink ? '' : ' — nothing to burn at these levels'))) body.push(line);
			for (const line of r.body) body.push(line);

			lines += r.lines; moves += r.moves;
			burnMM += r.burnMM; darkMM += r.darkMM; rapidMM += r.rapidMM;
			seconds += r.seconds;

			if (r.bounds) {
				// the jump from the face before this one. raster() does not say
				// where it left the head, so this is measured corner to corner:
				// honest about the order, a little short on the distance.
				if (prev) {
					const d = Math.hypot(r.bounds.minX - prev.minX, r.bounds.minY - prev.minY);
					rapidMM += d;
					seconds += d / o.rapid * 60;
				}
				bounds = bounds ? {
					minX: Math.min(bounds.minX, r.bounds.minX), minY: Math.min(bounds.minY, r.bounds.minY),
					maxX: Math.max(bounds.maxX, r.bounds.maxX), maxY: Math.max(bounds.maxY, r.bounds.maxY)
				} : Object.assign({}, r.bounds);
				prev = r.bounds;
			}
			placed.push({ label: p.label, x: p.x, y: p.y, w: p.w, h: p.h, stats: r });
		}

		const all = {
			body, lines, moves, ink: lines > 0, bounds,
			burnMM, darkMM, rapidMM, seconds, pitchX, pitchY
		};
		return { text: wrap(all, o, meta), stats: all, placed };
	}

	AE.Gcode = { EXT, DEFAULTS, raster, wrap, tile, sheet, fromCanvas, quarterTurn, fold, plain, fmt, clock };
})();

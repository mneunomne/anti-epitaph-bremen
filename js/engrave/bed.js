// the bed — a few bricks at a time, and the head kept to them.
//
// a wall is metres across. the machine is four hundred millimetres square.
// so the wall is never cut as a wall: it is cut a handful of bricks at a
// time, laid out together on the bed, squared once, and burnt in one go.
//
// this is that handful. you pick the bricks on the wall, this decides where
// each one lies on the bed, and gcode.js writes them into a single file
// whose coordinates never leave the rectangle those bricks occupy. the two
// things it has to be right about:
//
//   the head must not be asked to go anywhere the machine cannot reach —
//   so the layout is measured against the work area and the file is refused
//   if it does not fit, rather than found out at the limit switch;
//
//   and the head must not travel the bed between the bricks. each face is
//   rastered on its own (see Gcode.sheet), so what the beam crosses is the
//   faces and nothing else.
(function () {
	const AE = (window.AE = window.AE || {});
	const { Tiling, Imaging } = AE;

	const fmt = v => (Math.round(v * 10) / 10).toString();

	// the machine's own square, and how the bricks are set down inside it.
	// 410 × 410 is the Longer bed der Brenner packs to; margin is how far in
	// from the machine's corner the first face starts.
	const DEFAULTS = {
		ids: [],
		w: 410, h: 410,
		margin: 5,
		gap: 4,
		arrange: 'packed',
		turn: 'upright',
		frame: true
	};

	const ARRANGE = {
		packed: 'packed — rows from the machine’s corner',
		wall: 'as on the wall — the block kept square'
	};

	// which way round a brick lies on the bed. an NF stretcher is 240 × 71,
	// and a work area that is deeper than it is wide takes more of them stood
	// on end than laid flat — so the face is turned and its picture with it.
	//
	// the turn is anticlockwise, always: the top edge of the picture comes to
	// lie down the left-hand side of the bed, and what was its right-hand edge
	// points away from the machine's corner. the bed view draws it, so there
	// is no need to work it out — lay the brick the way the picture shows.
	const TURN = {
		upright: 'upright — as it stands on the wall',
		turned: 'turned — a quarter turn, on end',
		fit: 'whichever the bed takes more of'
	};

	// where each chosen brick lies, in bed millimetres measured from the
	// origin, with Y running up the way the machine counts it.
	//
	// what is placed is the *engraved area* — the face plus its bleed — since
	// that, and not the brick, is what the beam covers. a brick laid on the
	// jig is squared by its face; the bleed falls off the edge.
	function layout(project, plan, ids) {
		const b = Object.assign({}, DEFAULTS, project.bed);
		const byId = new Map(plan.list.map(t => [t.id, t]));
		const want = (ids || b.ids || []);
		const missing = want.filter(id => !byId.has(id));
		const gap = Math.max(0, b.gap), margin = Math.max(0, b.margin);
		const g = project.gcode || {};
		const originX = g.originX || 0, originY = g.originY || 0;

		// in the order they stand on the wall — the bottom course first, left
		// to right — and not in the order they were clicked. what goes on the
		// bed is a piece of one picture, so the pieces have to keep their
		// sequence or the bed is a shuffled deck of them.
		const tiles = want.map(id => byId.get(id)).filter(Boolean)
			.sort((a, c) => (a.row - c.row) || (a.col - c.col));

		const out = {
			arrange: b.arrange, bed: { w: b.w, h: b.h }, margin, gap, frame: !!b.frame,
			turn: false,
			origin: { x: originX, y: originY },
			slots: [], missing, cols: 0, rows: 0, per: 0,
			used: null, abs: null, fits: false, why: ''
		};

		// every tile of one wall carries the same face at the same bleed, so
		// one cell does for all of them — and it is measured off the wall
		// rather than off what is picked, so the panel can say how many the
		// bed holds before anything is on it
		const any = tiles[0] || plan.list[0];
		if (!any) {
			out.why = 'there is no wall to take bricks from';
			return out;
		}
		const face = { w: any.out.w, h: any.out.h };
		const room = { w: b.w - margin * 2, h: b.h - margin * 2 };

		// the turn is not applied to a brick. it is applied to the bed.
		//
		// turning each face where it lies would keep the arrangement and spin
		// the pictures inside it, which is the one thing that cannot be right:
		// these are fragments of a single picture, and a fragment turned on
		// its own no longer joins the one beside it. so the bed is laid out
		// upright, as though the machine were standing the other way round,
		// and then the whole of it — the places and the pictures together —
		// is turned a quarter turn anticlockwise. the composition survives
		// because nothing inside it moved relative to anything else.
		//
		// which means the room it is packed into is the bed seen the other way
		// round, and the count of what fits comes out of that.
		const into = t => (t ? { w: room.h, h: room.w } : room);
		const packs = r => ({
			cols: Math.max(0, Math.floor((r.w + gap) / (face.w + gap))),
			rows: Math.max(0, Math.floor((r.h + gap) / (face.h + gap)))
		});

		// the block, in wall millimetres — needed before the turn is decided,
		// since for a block the question is not how many fit but whether it
		// fits at all
		const box = tiles.length ? tiles.reduce((a, t) => ({
			minX: Math.min(a.minX, t.x - t.out.bleed),
			minY: Math.min(a.minY, t.y - t.out.bleed),
			maxX: Math.max(a.maxX, t.x - t.out.bleed + t.out.w),
			maxY: Math.max(a.maxY, t.y - t.out.bleed + t.out.h)
		}), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }) : null;
		const blockW = box ? box.maxX - box.minX : 0;
		const blockH = box ? box.maxY - box.minY : 0;
		const holds = (w, h) => w <= room.w && h <= room.h;
		const per = r => { const k = packs(r); return k.cols * k.rows; };

		let turned = b.turn === 'turned';
		if (b.turn === 'fit') {
			turned = b.arrange === 'wall'
				? !holds(blockW, blockH) && holds(blockH, blockW)
				: per(into(true)) > per(into(false));
		}
		const grid = packs(into(turned));
		out.turn = turned;
		// across and deep as the bed itself is read, which the turn swaps
		out.cols = turned ? grid.rows : grid.cols;
		out.rows = turned ? grid.cols : grid.rows;
		out.per = grid.cols * grid.rows;
		out.cell = turned ? { w: face.h, h: face.w } : face;

		if (!tiles.length) {
			out.why = 'no bricks on the bed';
			return out;
		}

		// ---------- upright, from a corner at 0, 0 ----------
		const up = [];
		if (b.arrange === 'wall') {
			// the block as it stands on the wall, moved bodily into the corner.
			// the wall counts down from its top edge and the bed counts up, so
			// the courses turn over: the top course of the block is the far
			// side of the bed, which is how you would lay it anyway.
			for (const t of tiles) {
				const bx = t.x - t.out.bleed, by = t.y - t.out.bleed;
				up.push({
					id: t.id, label: t.label, tile: t,
					x: bx - box.minX, y: box.maxY - (by + t.out.h),
					w: t.out.w, h: t.out.h
				});
			}
		} else {
			// packed: the corner cell first, along the near row, then the row
			// above it — filled in the wall's own order, so a block picked off
			// the wall comes back as that block whenever the cells allow it.
			const cols = Math.max(1, grid.cols);
			tiles.forEach((t, i) => {
				const col = i % cols, row = Math.floor(i / cols);
				up.push({
					id: t.id, label: t.label, tile: t,
					x: col * (face.w + gap), y: row * (face.h + gap),
					w: face.w, h: face.h, col, row
				});
			});
		}

		// ---------- and then the bed goes round, all of it at once ----------
		// anticlockwise about the layout's own corner: a rectangle at (x, y)
		// of (w, h) in a frame H deep comes to (H - y - h, x) and measures
		// (h, w). nothing moves relative to anything else.
		const deep = up.reduce((m, s) => Math.max(m, s.y + s.h), 0);
		for (const s of up) {
			out.slots.push(Object.assign({}, s, turned
				? { x: margin + (deep - (s.y + s.h)), y: margin + s.x, w: s.h, h: s.w, turn: true }
				: { x: margin + s.x, y: margin + s.y, turn: false }));
		}

		// burn from the machine's corner outwards: the near row first, left to
		// right. it is the shortest travel and it is the order a hand would
		// lay them in.
		out.slots.sort((a, c) => (a.y - c.y) || (a.x - c.x));
		out.slots.forEach((s, i) => { s.n = i + 1; });

		out.used = out.slots.reduce((a, s) => ({
			minX: Math.min(a.minX, s.x), minY: Math.min(a.minY, s.y),
			maxX: Math.max(a.maxX, s.x + s.w), maxY: Math.max(a.maxY, s.y + s.h)
		}), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
		out.used.w = out.used.maxX - out.used.minX;
		out.used.h = out.used.maxY - out.used.minY;

		// and where that lands on the machine. the origin is the work zero, so
		// this is the rectangle the faces occupy — it is what the head is sent
		// round as a frame, and what the bricks are laid to.
		out.abs = {
			minX: originX + out.used.minX, minY: originY + out.used.minY,
			maxX: originX + out.used.maxX, maxY: originY + out.used.maxY
		};

		// but it is not the whole of where the head goes. a run-up carries it
		// past the end of every row before the beam comes on — that is what an
		// overscan is — and the scan offset shifts the return rows further
		// still. neither burns anything, and both are outside the faces, so
		// checking the faces against the work area would pass a file that
		// drives the head into the rail. what gets checked is the reach.
		const runUp = Math.max(0, g.overscan || 0) + Math.abs(g.scanOffset || 0);
		out.overscan = runUp;
		out.reach = {
			minX: out.abs.minX - runUp, minY: out.abs.minY,
			maxX: out.abs.maxX + runUp, maxY: out.abs.maxY
		};

		if (!out.per) {
			out.why = `one face is ${fmt(out.cell.w)} × ${fmt(out.cell.h)} mm${turned ? ' turned' : ''} ` +
				`and the work area only ${fmt(b.w)} × ${fmt(b.h)} mm`;
		} else if (out.reach.minX < 0 || out.reach.minY < 0) {
			out.why = runUp
				? `the ${fmt(runUp)} mm run-up would take the head ${fmt(-out.reach.minX)} mm ` +
					'behind the machine’s corner'
				: 'the origin puts the work behind the machine’s corner';
		} else if (out.reach.maxX > b.w || out.reach.maxY > b.h) {
			const over = [];
			if (out.reach.maxX > b.w) over.push(`${fmt(out.reach.maxX - b.w)} mm past X${fmt(b.w)}`);
			if (out.reach.maxY > b.h) over.push(`${fmt(out.reach.maxY - b.h)} mm past Y${fmt(b.h)}`);
			out.why = over.join(' and ') +
				(runUp && out.abs.maxX <= b.w && out.abs.minX >= 0
					? ` — the faces fit, the ${fmt(runUp)} mm run-up does not`
					: '') +
				(b.arrange === 'packed' && out.slots.length > out.per
					? ` — the bed holds ${out.per}, you have ${out.slots.length}`
					: '');
		} else {
			out.fits = true;
			out.why = `the head keeps to X${fmt(out.reach.minX)}–${fmt(out.reach.maxX)} ` +
				`Y${fmt(out.reach.minY)}–${fmt(out.reach.maxY)}` +
				(runUp ? `, the ${fmt(runUp)} mm run-up counted` : '');
		}
		return out;
	}

	// the same picture the wall shows and the zip writes: crop at dpi, run the
	// levels, cut the word into it. one face is one face wherever it is burnt,
	// so a brick cut off the bed is the brick the wall was designed with.
	function face(project, img, plan, tile) {
		const dpi = project.laser.dpi;
		const pxW = Tiling.mmToPx(tile.out.w, dpi), pxH = Tiling.mmToPx(tile.out.h, dpi);
		return Imaging.stampWord(
			Imaging.process(Imaging.crop(img, tile.src, pxW, pxH), project.laser),
			tile, plan.wall, project.word);
	}

	// the whole bed as one file
	async function build(project, img, plan, ids, opts = {}) {
		const onProgress = opts.onProgress || (() => { });
		const lay = layout(project, plan, ids);
		if (!lay.slots.length) throw new Error('no bricks on the bed');
		if (!lay.fits) throw new Error(lay.why);

		const pieces = [];
		for (let i = 0; i < lay.slots.length; i++) {
			const s = lay.slots[i];
			onProgress(i, lay.slots.length, s.label);
			pieces.push({
				canvas: face(project, img, plan, s.tile),
				w: s.w, h: s.h, x: s.x, y: s.y, label: s.label, turn: !!s.turn
			});
			await new Promise(r => setTimeout(r, 0));   // let the browser breathe
		}
		onProgress(lay.slots.length, lay.slots.length, 'writing');

		const l = project.laser;
		const meta = {
			title: `${project.name} — ${lay.slots.length} brick${lay.slots.length === 1 ? '' : 's'}: ` +
				lay.slots.map(s => s.label).join(' '),
			subtitle: `${Tiling.FACES[project.face].label}, ${fmt(lay.cell.w)} x ${fmt(lay.cell.h)} mm each` +
				(lay.slots[0].tile.out.bleed ? ` incl. ${fmt(lay.slots[0].tile.out.bleed)} mm bleed` : '') +
				`, ${l.dpi} dpi ${l.mode}` +
				`, ${lay.arrange === 'wall' ? 'laid as on the wall' : 'packed from the corner'}` +
				(lay.turn ? ', the whole bed turned a quarter turn anticlockwise' : '') +
				`, ${fmt(lay.gap)} mm apart, ${fmt(lay.margin)} mm in from ` +
				`X${fmt(lay.origin.x)} Y${fmt(lay.origin.y)}. work ${fmt(lay.used.w)} x ${fmt(lay.used.h)} mm ` +
				`of a ${fmt(lay.bed.w)} x ${fmt(lay.bed.h)} mm bed`
		};

		// each face named with the corner it is laid to, so the bed can be set
		// out from the file and checked against it afterwards. these are
		// handed to the emitter rather than spliced into the finished text —
		// it is the one place that knows how wide a line the controller will
		// take, and every comment has to go through it.
		const notes = ['lay the bricks in these corners, face up, squared to the machine:'];
		if (lay.turn) {
			notes.push('the arrangement is the wall\'s own, set down on its side - every ' +
				'brick a quarter turn anticlockwise from how it stands, the top of its ' +
				'picture to the left, and the courses running left to right across the ' +
				'bed instead of up it');
		}
		for (const s of lay.slots) {
			notes.push(`   ${String(s.n).padStart(2, ' ')}. ${s.label} at ` +
				`X${fmt(lay.origin.x + s.x)} Y${fmt(lay.origin.y + s.y)}, ` +
				`${fmt(s.w)} x ${fmt(s.h)} mm${s.turn ? ' - turned' : ''}`);
		}

		// the head is asked to walk the work before the beam is on, and to
		// park in its corner rather than the bed's — so the rectangle the
		// machine frames is the bricks themselves
		const out = AE.Gcode.sheet(pieces, meta, project, {
			frame: lay.frame ? lay.abs : null,
			parkX: lay.abs.minX, parkY: lay.abs.minY,
			notes
		});
		out.lay = lay;
		return out;
	}

	AE.Bed = { DEFAULTS, ARRANGE, TURN, layout, build, face };
})();

// laying brick on pallets, and where the picture falls on it.
//
// every brick is the same size, so the field is a grid: so many across,
// so many courses, repeated on each pallet. a blank brick has no identity
// at all until it is engraved — what makes it A-03-07 is the fragment of
// picture burnt into it and the code written beside that. so the position
// is the thing that gets a name here, and the brick simply takes it.
//
// everything is millimetres, origin at the top-left corner of the whole
// field, y running down the way a plan view does.
(function () {
	const AE = (window.AE = window.AE || {});

	// EPAL 1. the top deck is five boards along the long axis — three at
	// 145 mm and two at 100 mm — with the rest of the width as gaps. it is
	// drawn because it matters where a brick lands: one bridging a 41 mm
	// gap on two corners will rock.
	const EPAL = { w: 1200, h: 800 };
	const DECK = [145, 100, 145, 100, 145];
	const KEYS = 'ABCDEFGH';

	const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

	// the pallets as rectangles in field coordinates
	function fieldGeom(pal) {
		const n = Math.max(1, pal.count | 0), g = pal.gap || 0;
		const pallets = [];
		for (let i = 0; i < n; i++) {
			pallets.push({
				key: KEYS[i] || String(i + 1), index: i,
				x: pal.arrange === 'column' ? 0 : i * (pal.w + g),
				y: pal.arrange === 'column' ? i * (pal.h + g) : 0,
				w: pal.w, h: pal.h
			});
		}
		return {
			w: pal.arrange === 'column' ? pal.w : n * pal.w + (n - 1) * g,
			h: pal.arrange === 'column' ? n * pal.h + (n - 1) * g : pal.h,
			pallets
		};
	}

	// the five top boards of one pallet, in field coordinates, running the
	// long way. proportional if the pallet is not a standard EPAL.
	function deckBoards(p) {
		const along = p.w >= p.h;                    // boards run the long axis
		const across = along ? p.h : p.w;
		const k = across / EPAL.h;
		const widths = DECK.map(w => w * k);
		const gap = (across - widths.reduce((a, c) => a + c, 0)) / (widths.length - 1);
		const out = [];
		let o = 0;
		for (const w of widths) {
			out.push(along
				? { x: p.x, y: p.y + o, w: p.w, h: w }
				: { x: p.x + o, y: p.y, w: w, h: p.h });
			o += w + gap;
		}
		return out;
	}

	// the top face is always the bed — length × width — because that is the
	// face being engraved. `orient` only decides whether the brick runs
	// along the course or across it.
	function faceOf(brick, orient) {
		return orient === 'across'
			? { w: brick.width, h: brick.length, rot: 90 }
			: { w: brick.length, h: brick.width, rot: 0 };
	}

	// ---------- the grid ----------
	// one pallet's worth of positions, and the step between them.
	//
	// a whole number of bricks never fills a pallet exactly, so there is
	// always slack, and it has to go somewhere. `align` says where:
	//
	//   justify  into the joints — the field reaches both edges and the
	//            joints come out wider than the one you asked for. the
	//            number you type only decides how many bricks fit.
	//   center   into the border — the joint is exactly what you typed and
	//            the slack is bare deck, split evenly around the field
	//   left     into the far edge — the joint is what you typed and all
	//            the slack ends up at one side
	//
	// `jointX` / `jointY` are what the joint actually comes out at, which
	// is the number worth putting on screen.
	function grid(cfg) {
		const pal = cfg.pallets, m = pal.margin || 0;
		const gx = cfg.lay.gapX, gy = cfg.lay.gapY;
		const f = faceOf(cfg.brick, cfg.lay.orient);
		const availW = pal.w - 2 * m, availH = pal.h - 2 * m;

		const cols = Math.max(0, Math.floor((availW + gx) / (f.w + gx)));
		const rows = Math.max(0, Math.floor((availH + gy) / (f.h + gy)));
		const slackX = availW - (cols * f.w + Math.max(0, cols - 1) * gx);
		const slackY = availH - (rows * f.h + Math.max(0, rows - 1) * gy);

		const step = (n, size, gap, slack) =>
			cfg.lay.align === 'justify' && n > 1 ? size + gap + slack / (n - 1) : size + gap;
		const off = (n, slack) =>
			cfg.lay.align === 'center' || (cfg.lay.align === 'justify' && n === 1) ? slack / 2 : 0;

		const stepX = step(cols, f.w, gx, slackX), stepY = step(rows, f.h, gy, slackY);
		const offX = m + off(cols, slackX), offY = m + off(rows, slackY);
		const laidW = cols ? (cols - 1) * stepX + f.w : 0;
		const laidH = rows ? (rows - 1) * stepY + f.h : 0;

		return {
			face: f, cols, rows, perPallet: cols * rows,
			stepX, stepY, offX, offY, slackX, slackY,
			jointX: cols > 1 ? stepX - f.w : 0,
			jointY: rows > 1 ? stepY - f.h : 0,
			laidW, laidH,
			// bare deck outside the bricks, near edge and far edge
			borderX: [offX, pal.w - offX - laidW],
			borderY: [offY, pal.h - offY - laidH]
		};
	}

	// a position's name is where it is: pallet, course, place along the
	// course. six characters, which is about what fits on a brick in paint
	// pen, and it tells whoever is laying the field where it goes without
	// a sheet to look it up in.
	const slotId = (key, row, pos) =>
		`${key}-${String(row).padStart(2, '0')}-${String(pos).padStart(2, '0')}`;

	// ---------- the lay ----------
	// how many bricks there are decides how much of the grid gets used.
	// `count` null means fill it; anything less is dealt out across the
	// pallets rather than piled onto the first one, because each pallet
	// carries its own picture and a bare third pallet is not a picture.
	function pack(cfg) {
		const geom = fieldGeom(cfg.pallets);
		const g = grid(cfg);
		const n = geom.pallets.length;
		const full = g.perPallet * n;
		const want = cfg.lay.count == null ? full : clamp(Math.round(cfg.lay.count), 0, full);
		const skip = new Set(cfg.skip || []);

		const share = [];
		if (cfg.lay.spread === false) {
			let left = want;
			for (let k = 0; k < n; k++) { share.push(Math.min(g.perPallet, left)); left -= share[k]; }
		} else {
			const base = Math.floor(want / n), extra = want % n;
			for (let k = 0; k < n; k++) share.push(Math.min(g.perPallet, base + (k < extra ? 1 : 0)));
		}

		const placed = [], holes = [];
		for (let k = 0; k < n; k++) {
			const p = geom.pallets[k];
			for (let i = 0; i < share[k]; i++) {
				const row = Math.floor(i / g.cols) + 1, pos = (i % g.cols) + 1;
				const slot = {
					id: slotId(p.key, row, pos),
					pallet: p.key, palletIndex: p.index, row, pos,
					x: p.x + g.offX + (pos - 1) * g.stepX,
					y: p.y + g.offY + (row - 1) * g.stepY,
					w: g.face.w, h: g.face.h, rot: g.face.rot
				};
				// a skipped position is a hole in the field on purpose:
				// it costs a brick and shows bare pallet
				if (skip.has(slot.id)) holes.push(slot); else placed.push(slot);
			}
		}

		return { geom, grid: g, placed, holes, dealt: want, full, rows: g.rows };
	}

	// ---------- where the picture falls ----------
	// each pallet carries one image by default, so the field reads as three
	// pictures side by side. `span` puts a single image across all of them
	// and lets the pallet gaps cut it.
	function regionFor(pl, geom, assign) {
		if (assign.mode === 'span') return { rect: { x: 0, y: 0, w: geom.w, h: geom.h }, image: assign.span | 0 };
		const p = geom.pallets[pl.palletIndex];
		return { rect: { x: p.x, y: p.y, w: p.w, h: p.h }, image: (assign.map || [])[pl.palletIndex] };
	}

	// which rectangle of the source the region covers. cover crops, contain
	// leaves the region uncovered at the edges, stretch distorts.
	function sourceWindow(rect, img, opt) {
		const aspect = rect.w / rect.h, imgAspect = img.width / img.height;
		let sw = img.width, sh = img.height;
		if (opt.fit === 'cover') {
			if (imgAspect > aspect) sw = img.height * aspect; else sh = img.width / aspect;
		} else if (opt.fit === 'contain') {
			if (imgAspect > aspect) sh = img.width / aspect; else sw = img.height * aspect;
		}
		const slackX = img.width - sw, slackY = img.height - sh;
		const zoom = opt.zoom || 1;
		return {
			x: slackX / 2 + (opt.offsetX || 0) * slackX / 2 + (sw - sw / zoom) / 2,
			y: slackY / 2 + (opt.offsetY || 0) * slackY / 2 + (sh - sh / zoom) / 2,
			w: sw / zoom, h: sh / zoom,
			stretch: aspect / (sw / sh)
		};
	}

	// give every placed brick its window into its image, in source pixels.
	// bleed widens the crop past the brick edge so a blank that lands a
	// millimetre off the mark still arrives covered.
	function crops(plan, cfg, images, assign) {
		const bleed = (cfg.laser && cfg.laser.bleed) || 0;
		const wins = new Map();

		for (const pl of plan.placed) {
			const reg = regionFor(pl, plan.geom, assign);
			const img = images[reg.image];
			pl.image = reg.image;
			pl.out = { w: pl.w + bleed * 2, h: pl.h + bleed * 2, bleed };
			if (!img) { pl.src = null; continue; }

			const key = reg.image + '@' + reg.rect.x + ',' + reg.rect.y;
			if (!wins.has(key)) wins.set(key, sourceWindow(reg.rect, img, img.opt || { fit: 'cover' }));
			const win = wins.get(key);
			pl.win = win;
			pl.region = reg.rect;

			const bx = pl.x - bleed - reg.rect.x, by = pl.y - bleed - reg.rect.y;
			pl.src = {
				x: win.x + (bx / reg.rect.w) * win.w,
				y: win.y + (by / reg.rect.h) * win.h,
				w: (pl.out.w / reg.rect.w) * win.w,
				h: (pl.out.h / reg.rect.h) * win.h
			};
		}
		return plan;
	}

	// ---------- how many bricks is enough ----------
	function capacity(cfg) {
		const geom = fieldGeom(cfg.pallets);
		const g = grid(cfg);
		return {
			cols: g.cols, rows: g.rows, perPallet: g.perPallet,
			full: g.perPallet * geom.pallets.length,
			faceArea: g.face.w * g.face.h,
			fieldArea: geom.w * geom.h,
			geom
		};
	}

	// coverage is measured against the pallet decks, not against the field
	// bounding box, so a gap between pallets does not read as bare pallet
	function coverage(res) {
		const deck = res.geom.pallets.reduce((a, p) => a + p.w * p.h, 0);
		const laid = res.placed.length * res.grid.face.w * res.grid.face.h;
		return {
			deck, laid,
			fraction: deck ? laid / deck : 0,
			// joints and margins mean the deck is never fully covered: a
			// field packed solid still shows a few per cent of pallet, so
			// that number, not 100, is what "full" looks like
			max: deck ? res.full * res.grid.face.w * res.grid.face.h / deck : 0
		};
	}

	// the other direction: how many bricks a given share of the deck wants
	function bricksFor(cfg, target) {
		const cap = capacity(cfg);
		const deck = cap.geom.pallets.reduce((a, p) => a + p.w * p.h, 0);
		const want = clamp(target == null ? 0.65 : target, 0.05, 1);
		const raw = Math.ceil(want * deck / cap.faceArea);
		return { need: Math.min(raw, cap.full), capped: raw > cap.full, capacity: cap, deck };
	}

	AE.Pack = {
		EPAL, DECK, KEYS, fieldGeom, deckBoards, faceOf, grid, pack, slotId,
		regionFor, sourceWindow, crops, capacity, coverage, bricksFor
	};
})();

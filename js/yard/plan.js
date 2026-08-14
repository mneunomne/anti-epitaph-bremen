// the plan: how many bricks, on which pallets, carrying which picture.
//
// there is no list of bricks anywhere in here, because a blank brick is
// interchangeable with every other blank brick. what the plan holds is a
// list of *positions* — A-03-07 and its neighbours — and the record of
// which of those have been through the machine. a brick becomes A-03-07
// at the moment it is engraved, and not before.
(function () {
	const AE = (window.AE = window.AE || {});
	const { Pack } = AE;

	const STATUSES = ['pending', 'queued', 'engraved', 'failed', 'skipped'];

	// the one brick. 200 × 95 × 50 unless the pile says otherwise.
	const BRICK = { length: 200, width: 95, height: 50 };

	function blank(name) {
		return {
			id: 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
			name: name || 'three pallets',
			created: new Date().toISOString(),
			updated: new Date().toISOString(),

			brick: Object.assign({}, BRICK),
			// no margin and no joint: 200 goes into 1200 six times exactly,
			// so the bricks butt against each other and against the pallet
			// edge, and the picture crosses the field unbroken
			pallets: { count: 3, w: Pack.EPAL.w, h: Pack.EPAL.h, arrange: 'row', gap: 0, margin: 0 },
			// count null fills the grid; a number lays that many and leaves
			// the rest of the grid unused. `center` so the joint typed is the
			// joint laid — see grid() for what the other two do with slack.
			lay: { gapX: 0, gapY: 0, orient: 'along', align: 'center', spread: true, count: null },

			// one slot per pallet. a slot is a source image plus how it is
			// fitted to the pallet it sits on.
			images: [slot(), slot(), slot()],
			assign: { mode: 'per-pallet', map: [0, 1, 2], span: 0 },

			laser: {
				dpi: 254, mode: 'grayscale', brightness: 0, contrast: 120, gamma: 1,
				invert: false, threshold: 128, bleed: 0,
				// for the noisy modes: how far the cut wanders, and the seed
				// that makes it repeatable
				noise: 100, seed: 1
			},
			gcode: {
				feed: 6000, power: 10, sMax: 1000, laserMode: 'M3', passes: 1,
				bidirectional: true, overscan: 0, scanOffset: 0, airAssist: true,
				originX: 0, originY: 0, park: true
			},
			sim: { polarity: 'darker' },
			mark: { burn: false, size: 6, corner: 'bl' },   // the code, burnt into the face

			skip: [],           // positions deliberately left bare
			record: {},         // id -> { status, date, operator, passes, notes }
			log: []
		};
	}

	const slot = () => ({ name: '', type: '', blob: null, fit: 'cover', offsetX: 0, offsetY: 0, zoom: 1 });

	function migrate(p) {
		const base = blank(p.name);
		p.brick = Object.assign({}, base.brick, p.brick);
		p.pallets = Object.assign({}, base.pallets, p.pallets);
		p.lay = Object.assign({}, base.lay, p.lay);
		p.assign = Object.assign({}, base.assign, p.assign);
		p.laser = Object.assign({}, base.laser, p.laser);
		p.gcode = Object.assign({}, base.gcode, p.gcode);
		p.sim = Object.assign({}, base.sim, p.sim);
		p.mark = Object.assign({}, base.mark, p.mark);
		p.images = (p.images || []).map(s => Object.assign(slot(), s));
		while (p.images.length < Math.max(3, p.pallets.count)) p.images.push(slot());
		p.skip = p.skip || [];
		p.record = p.record || {};
		p.log = p.log || [];
		return p;
	}

	const list = () => AE.dbPlans.all().then(all => all
		.map(p => ({ id: p.id, name: p.name, updated: p.updated }))
		.sort((a, b) => (b.updated || '').localeCompare(a.updated || '')));

	const load = id => AE.dbPlans.get(id).then(p => (p ? migrate(p) : null));
	const remove = id => AE.dbPlans.del(id);

	function save(p) {
		p.updated = new Date().toISOString();
		return AE.dbPlans.put(p);
	}

	function note(p, text) {
		p.log.unshift({ at: new Date().toISOString(), text });
		if (p.log.length > 400) p.log.length = 400;
	}

	// ---------- the record ----------
	function rec(p, id) {
		if (!p.record[id]) p.record[id] = { status: 'pending', date: '', operator: '', passes: '', notes: '' };
		return p.record[id];
	}

	function setStatus(p, id, status) {
		const r = rec(p, id);
		if (r.status === status) return r;
		r.status = status;
		// the date is the useful half of the record: when did this brick
		// actually go through the machine
		if (status === 'engraved' && !r.date) r.date = new Date().toISOString().slice(0, 16).replace('T', ' ');
		if (status === 'pending') r.date = '';
		note(p, `${id} → ${status}`);
		return r;
	}

	const statusOf = (p, id) => ((p.record[id] || {}).status || 'pending');

	function stats(p, res) {
		const out = { total: res.placed.length };
		for (const s of STATUSES) out[s] = 0;
		for (const pl of res.placed) out[statusOf(p, pl.id)]++;
		out.percent = out.total ? Math.round(out.engraved / out.total * 100) : 0;
		return out;
	}

	// positions outside the current field keep their record — shrink the
	// count, change your mind, grow it back, and the history is still there
	function prune(p, res) {
		const live = new Set(res.placed.map(t => t.id));
		let n = 0;
		for (const id of Object.keys(p.record)) {
			const r = p.record[id];
			if (!live.has(id) && r.status === 'pending' && !r.notes) { delete p.record[id]; n++; }
		}
		return n;
	}

	// build the field: positions → crops. one call, so nothing on screen
	// can disagree with what the exporter will cut.
	function build(p, images) {
		const cfg = { brick: p.brick, pallets: p.pallets, lay: p.lay, laser: p.laser, skip: p.skip };
		return Pack.crops(Pack.pack(cfg), cfg, images || [], p.assign);
	}

	// ---------- portability ----------
	async function toJSON(p) {
		const copy = JSON.parse(JSON.stringify({ ...p, images: [] }));
		copy.images = await Promise.all(p.images.map(async s => {
			if (!s.blob) return { ...s, blob: null };
			const dataUrl = await new Promise(res => {
				const fr = new FileReader();
				fr.onload = () => res(fr.result);
				fr.readAsDataURL(s.blob);
			});
			return { ...s, blob: null, dataUrl };
		}));
		copy.exported = new Date().toISOString();
		return JSON.stringify(copy, null, 2);
	}

	async function fromJSON(text) {
		const p = migrate(JSON.parse(text));
		p.id = blank().id;
		p.name = (p.name || 'imported') + ' (imported)';
		p.images = await Promise.all(p.images.map(async s => {
			if (!s.dataUrl) return Object.assign(slot(), s, { blob: null });
			const blob = await fetch(s.dataUrl).then(r => r.blob());
			return Object.assign(slot(), s, { blob, type: s.type || blob.type, dataUrl: undefined });
		}));
		return p;
	}

	AE.Plan = {
		STATUSES, BRICK, blank, slot, migrate, list, load, save, remove, note,
		rec, setStatus, statusOf, stats, prune, build, toJSON, fromJSON
	};
})();

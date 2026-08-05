// the project: one wall, its settings, and the record of what has been cut.
//
// this is the part that used to be a spreadsheet. it lives beside the
// settings that produced the files, so a row can never drift away from
// the artwork it describes.
(function () {
	const AE = (window.AE = window.AE || {});
	const { Tiling } = AE;

	const STATUSES = ['pending', 'queued', 'engraved', 'failed', 'skipped'];

	function blank(name) {
		const b = Tiling.PRESETS.nf;
		return {
			id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
			name: name || 'untitled wall',
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			preset: 'nf',
			brick: { length: b.length, width: b.width, height: b.height },
			face: 'stretcher',
			gap: { x: 10, y: 12 },
			grid: { cols: 8, rows: 10, fit: 'cover', offsetX: 0, offsetY: 0, originRow: 'bottom' },
			laser: {
				dpi: 254, mode: 'grayscale', brightness: 0, contrast: 120, gamma: 1,
				invert: false, threshold: 128, bleed: 0
			},
			// the machine itself. defaults are the longer / grbl profile:
			// 254 dpi is 0.1 mm, which is the 10 lines/mm the controller wants
			gcode: {
				feed: 6000, power: 10, sMax: 1000, laserMode: 'M3', passes: 1,
				bidirectional: true, overscan: 0, scanOffset: 0, airAssist: true,
				originX: 0, originY: 0, park: true
			},
			sim: { polarity: 'darker' },
			image: null,          // { name, type, blob }
			tiles: {},            // id -> { status, date, operator, passes, notes }
			log: []
		};
	}

	// a stored project may predate a field; fill the gaps rather than
	// letting an old record crash a new build
	function migrate(p) {
		const base = blank(p.name);
		p.brick = Object.assign({}, base.brick, p.brick);
		p.gap = Object.assign({}, base.gap, p.gap);
		p.grid = Object.assign({}, base.grid, p.grid);
		p.laser = Object.assign({}, base.laser, p.laser);
		p.gcode = Object.assign({}, base.gcode, p.gcode);
		p.sim = Object.assign({}, base.sim, p.sim);
		p.tiles = p.tiles || {};
		p.log = p.log || [];
		return p;
	}

	const list = () => AE.db.all().then(all => all
		.map(p => ({ id: p.id, name: p.name, updated: p.updated }))
		.sort((a, b) => (b.updated || '').localeCompare(a.updated || '')));

	const load = id => AE.db.get(id).then(p => (p ? migrate(p) : null));

	// indexeddb clones the record structurally, blob and all, so the source
	// image goes in as bytes instead of as a base64 string
	function save(p) {
		p.updated = new Date().toISOString();
		return AE.db.put(p);
	}

	const remove = id => AE.db.del(id);

	// ---------- the record ----------
	function rec(p, id) {
		if (!p.tiles[id]) p.tiles[id] = { status: 'pending', date: '', operator: '', passes: '', notes: '' };
		return p.tiles[id];
	}

	function setStatus(p, id, status, label) {
		const r = rec(p, id);
		if (r.status === status) return r;
		r.status = status;
		// the date is the useful half of the record: when did this brick
		// actually go through the machine
		if (status === 'engraved' && !r.date) r.date = new Date().toISOString().slice(0, 16).replace('T', ' ');
		if (status === 'pending') r.date = '';
		note(p, `${label || id} → ${status}`);
		return r;
	}

	function note(p, text) {
		p.log.unshift({ at: new Date().toISOString(), text });
		if (p.log.length > 400) p.log.length = 400;
	}

	function stats(p, plan) {
		const out = { total: plan.list.length };
		for (const s of STATUSES) out[s] = 0;
		for (const t of plan.list) out[(p.tiles[t.id] || {}).status || 'pending']++;
		out.done = out.engraved;
		out.percent = out.total ? Math.round(out.engraved / out.total * 100) : 0;
		return out;
	}

	// tiles outside the current grid keep their record — shrink the grid,
	// change your mind, grow it back, and the history is still there
	function prune(p, plan) {
		const live = new Set(plan.list.map(t => t.id));
		let n = 0;
		for (const id of Object.keys(p.tiles)) {
			if (!live.has(id) && (p.tiles[id].status || 'pending') === 'pending' && !p.tiles[id].notes) {
				delete p.tiles[id]; n++;
			}
		}
		return n;
	}

	// ---------- portability ----------
	// the whole project as one json file: settings, record, and the source
	// image inline, so a backup is a single thing you can email yourself
	async function toJSON(p) {
		const copy = JSON.parse(JSON.stringify({ ...p, image: null }));
		if (p.image && p.image.blob) {
			copy.image = {
				name: p.image.name, type: p.image.type,
				dataUrl: await new Promise(res => {
					const fr = new FileReader();
					fr.onload = () => res(fr.result);
					fr.readAsDataURL(p.image.blob);
				})
			};
		}
		copy.exported = new Date().toISOString();
		return JSON.stringify(copy, null, 2);
	}

	async function fromJSON(text) {
		const raw = JSON.parse(text);
		const p = migrate(raw);
		p.id = blank().id;                       // an import never overwrites
		p.name = (p.name || 'imported') + ' (imported)';
		if (p.image && p.image.dataUrl) {
			const blob = await fetch(p.image.dataUrl).then(r => r.blob());
			p.image = { name: p.image.name, type: p.image.type || blob.type, blob };
		} else {
			p.image = null;
		}
		return p;
	}

	AE.Project = { STATUSES, blank, migrate, list, load, save, remove, rec, setStatus, note, stats, prune, toJSON, fromJSON };
})();

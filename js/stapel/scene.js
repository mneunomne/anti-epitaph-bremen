/* scene.js — the yard, and the stacks standing in it.
 *
 * One brick a course, 196 long by 95 deep by 45 high, stacked square with
 * no bond offset — a pallet stack, not a wall. A stack is one good, and the
 * places that sent it run down the two faces that meet at the near arris:
 * the names down the small one, their quantities and values down the long
 * one, three to a course. So the height of a stack is the number of places
 * a good came from and nothing else.
 *
 * Any number of them can stand in the yard at once, set out on a field with
 * the gaps under control. Seen from straight above through the flat camera
 * that is a sheet of beds, one to a good, and the whole comparison is the
 * plan: how far each stack runs, and how many there are.
 *
 * Orbit is written out by hand rather than pulling a loose OrbitControls
 * file in after three.js, the way the piece does it.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const S = (AE.Stapel = AE.Stapel || {});
	const F = S.Faces;

	const MM = 0.01;                       // millimetres to scene units
	const B = F.BRICK;

	// EPAL 1, in millimetres — the same pallet the yard and the desk are built
	// round. 1200 × 800 × 144 over three bottom boards, nine blocks, three
	// stringers and five deck boards, which is what makes the 144.
	const PAL = {
		l: 1200, d: 800, h: 144,
		deck: 22, block: 78, board: 22,
	};

	let woodMat = null;
	const wood = () => (woodMat = woodMat ||
		new THREE.MeshStandardMaterial({ color: '#8a7355', roughness: 1 }));

	// one EPAL, its deck at y = PAL.h, centred on its own origin
	function pallet() {
		const g = new THREE.Group();
		const m = wood();
		const add = (w, h, d, x, y, z) => {
			const b = new THREE.Mesh(new THREE.BoxGeometry(w * MM, h * MM, d * MM), m);
			b.position.set(x * MM, y * MM, z * MM);
			g.add(b);
		};

		// three bottom boards, running the long way
		for (const z of [-350, 0, 350]) add(PAL.l, PAL.board, 100, 0, PAL.board / 2, z);

		// nine blocks, three by three
		const by = PAL.board + PAL.block / 2;
		for (const x of [-527.5, 0, 527.5])
			for (const z of [-327.5, 0, 327.5])
				add(145, PAL.block, z === 0 ? 100 : 145, x, by, z);

		// three stringers over the blocks, running the long way
		const sy = PAL.board + PAL.block + PAL.board / 2;
		for (const z of [-327.5, 0, 327.5]) add(PAL.l, PAL.board, 145, 0, sy, z);

		// five deck boards across, the wide ones at the edges and the middle
		const dy = PAL.h - PAL.deck / 2;
		for (const [x, w] of [[-577.5, 145], [-300, 100], [0, 145], [300, 100], [577.5, 145]])
			add(w, PAL.deck, PAL.d, x, dy, 0);

		return g;
	}

	let renderer, scene, persp, ortho, group, ground, wrap;
	let flat = false;                      // the plan camera
	let cam = { az: -0.62, el: 0.30, dist: 9.5, target: new THREE.Vector3(0, 0, 0) };
	let drag = null;
	let built = { stacks: 0, courses: 0, height: 0, field: { w: 0, d: 0 }, textures: 0, bytes: 0 };

	const camera = () => (flat ? ortho : persp);

	function init(canvas, wrapEl) {
		wrap = wrapEl;
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
		renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));

		scene = new THREE.Scene();
		scene.background = new THREE.Color('#1c1a18');

		persp = new THREE.PerspectiveCamera(38, 1, 0.05, 800);
		ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 800);

		scene.add(new THREE.AmbientLight('#e8ded2', 0.72));
		const sun = new THREE.DirectionalLight('#fff3e2', 0.85);
		sun.position.set(4, 9, 6);
		scene.add(sun);
		const fill = new THREE.DirectionalLight('#b9c4d0', 0.28);
		fill.position.set(-6, 3, -4);
		scene.add(fill);

		group = new THREE.Group();
		scene.add(group);

		ground = new THREE.Mesh(
			new THREE.PlaneGeometry(600, 600),
			new THREE.MeshStandardMaterial({ color: '#25221f', roughness: 1 })
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.001;
		scene.add(ground);

		orbit(canvas);
		resize();
		// The yard is a cell in a grid, and a grid settles after the fonts and
		// the panels are in — long after the window has finished resizing. A
		// window listener alone misses that, and the drawing buffer is left at
		// whatever size the cell happened to be at boot, stretched by the CSS
		// to whatever size it ended at. So the element itself is watched.
		global.addEventListener('resize', resize);
		if (global.ResizeObserver) new ResizeObserver(resize).observe(wrap);
		tick();
	}

	/* ---------------------------------------------------------------- orbit */

	function orbit(el) {
		el.addEventListener('pointerdown', e => {
			drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el };
			el.setPointerCapture(e.pointerId);
			el.style.cursor = 'grabbing';
		});
		el.addEventListener('pointermove', e => {
			if (!drag) return;
			cam.az = drag.az - (e.clientX - drag.x) * 0.006;
			cam.el = Math.max(-0.25, Math.min(1.55, drag.el + (e.clientY - drag.y) * 0.005));
		});
		const up = e => {
			drag = null;
			el.style.cursor = 'grab';
			try { el.releasePointerCapture(e.pointerId); } catch (_) { }
		};
		el.addEventListener('pointerup', up);
		el.addEventListener('pointercancel', up);
		el.addEventListener('wheel', e => {
			e.preventDefault();
			cam.dist = Math.max(0.8, Math.min(400, cam.dist * (1 + Math.sign(e.deltaY) * 0.09)));
		}, { passive: false });
		el.style.cursor = 'grab';
	}

	function resize() {
		if (!wrap) return;
		const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
		renderer.setSize(w, h, false);
		persp.aspect = w / h;
		persp.updateProjectionMatrix();
		frustum();
	}

	// the flat camera has no distance, only an extent — cam.dist stands for
	// how much of the yard is in view from side to side
	function frustum() {
		if (!wrap) return;
		const a = Math.max(0.001, wrap.clientWidth / Math.max(1, wrap.clientHeight));
		const hh = cam.dist / 2;
		ortho.top = hh; ortho.bottom = -hh;
		ortho.left = -hh * a; ortho.right = hh * a;
		ortho.updateProjectionMatrix();
	}

	function tick() {
		requestAnimationFrame(tick);
		const c = camera();
		const ce = Math.cos(cam.el), se = Math.sin(cam.el);
		const d = flat ? 60 : cam.dist;         // the flat camera only needs to be clear of the yard
		c.position.set(
			cam.target.x + d * ce * Math.sin(cam.az),
			cam.target.y + d * se,
			cam.target.z + d * ce * Math.cos(cam.az)
		);
		c.lookAt(cam.target);
		if (flat) frustum();
		renderer.render(scene, c);
	}

	/* --------------------------------------------------------------- build */

	let bytes = 0, count = 0;

	function tex(canvas) {
		const t = new THREE.CanvasTexture(canvas);
		t.anisotropy = renderer.capabilities.getMaxAnisotropy();
		t.needsUpdate = true;
		bytes += canvas.width * canvas.height * 4;
		count++;
		return t;
	}
	const mat = canvas => new THREE.MeshStandardMaterial({ map: tex(canvas), roughness: 0.9, metalness: 0 });

	// Four of a brick's six faces carry nothing, and every brick in the yard
	// has the same nothing on them. Made once and shared, that is the
	// difference between a yard that stands up and one that runs a machine
	// out of texture memory.
	let blanks = null;
	function blank(w, h, o) {
		const k = w + 'x' + h;
		if (!blanks[k]) blanks[k] = mat(F.blank(w, h, o));
		return blanks[k];
	}

	function clear() {
		const seen = new Set();
		group.traverse(o => {
			if (o.geometry) o.geometry.dispose();
			const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
			for (const m of ms) {
				if (!m || seen.has(m)) continue;
				seen.add(m);
				if (m.map) m.map.dispose();
				m.dispose();
			}
		});
		while (group.children.length) group.remove(group.children[0]);
		blanks = {};
		woodMat = null;              // disposed with the rest; made again on demand
		bytes = 0; count = 0;
	}

	// a stack of one good, its foot at y = 0, centred on its own origin
	function stack(plate, o) {
		const g = new THREE.Group();
		const rows = Math.max(1, o.rows | 0);
		const two = o.sides === 2;
		const cs = F.courses(plate, rows, o.sides, o.maxBricks, o.heads, o.fold);
		// the Werth column is measured over the whole stack, not over the three
		// figures a brick happens to carry, so the rule before it runs straight
		// down the courses instead of jogging at every joint
		if (o.valMax == null) o = Object.assign({}, o, { valMax: F.widest(cs) });
		const gap = o.gap || 0;
		const h = B.h + gap;
		const foot = o.pallet ? PAL.h : 0;      // the deck the first course sits on
		const geo = new THREE.BoxGeometry(B.l * MM, B.h * MM, B.d * MM);

		// the name is the same on every brick of a stack, so it is drawn once
		// and the one material hung on all of them — a stack of thirty courses
		// costs one nameplate, not thirty. Printing on both sides takes the
		// two faces the name would have gone on: they carry the next places
		// instead.
		const nameOn = two ? 'none' : (o.nameOn || 'none');
		const endName = (nameOn === 'end' || nameOn === 'both')
			? mat(F.nameplate(plate, B.d, B.h, Object.assign({}, o, { tag: F.tagFor(plate, '', 'e') }))) : null;
		const backName = (nameOn === 'back' || nameOn === 'both')
			? mat(F.nameplate(plate, B.l, B.h, Object.assign({}, o, { tag: F.tagFor(plate, '', 'd') }))) : null;

		for (let i = 0; i < cs.length; i++) {
			const load = cs[i];
			const top = i === 0;                       // the first goods sit highest
			const y = foot * MM + (cs.length - 1 - i) * h * MM + B.h * MM / 2;

			// BoxGeometry hands its materials out in the order
			// [ +X, -X, +Y, -Y, +Z, -Z ] — and of those, the pair a yard shows
			// at once is -X and +Z: the small face on the left of the near
			// arris, the long face on its right. So the names go on -X and the
			// figures on +Z, and a row reads across the edge in the direction
			// it is read in anyway. The other pair, +X and -Z, stands round
			// the back on exactly the same terms; with `sides` at two it
			// carries the next places rather than nothing, and the stack comes
			// out half as high for the same reading.
			const faces = o.everyFace !== false;
			const back = two && load.back.length;
			// a stack is one table and has one head — the top course carries it
			const base = load.head ? o : Object.assign({}, o, { top: false });
			// and every printed side carries its own mark: the brick counting
			// down from the top, and b c d e round the four sides from the long
			// face in view. The bed is a, and is obviously itself.
			const fo = l => Object.assign({}, base, { tag: F.tagFor(plate, i + 1, l) });
			const mats = [
				back && faces ? mat(F.land(load.back, fo('e'))) : (endName || blank(B.d, B.h, o)),
				faces ? mat(F.land(load.front, fo('c'))) : blank(B.d, B.h, o),
				top && o.bedOn !== 'none'
					? mat((o.bedOn === 'picture' && F.bedPicture(plate, o)) || F.bed(plate, o))
					: blank(B.l, B.d, o),
				blank(B.l, B.d, o),
				faces ? mat(F.figures(load.front, fo('b'))) : blank(B.l, B.h, o),
				back && faces ? mat(F.figures(load.back, fo('d'))) : (backName || blank(B.l, B.h, o)),
			];

			const brick = new THREE.Mesh(geo.clone(), mats);
			brick.position.set(0, y, 0);
			g.add(brick);

			if (o.outline !== false) {
				const line = new THREE.LineSegments(
					new THREE.EdgesGeometry(brick.geometry),
					new THREE.LineBasicMaterial({ color: o.outlineColour || '#33190f' })
				);
				line.position.copy(brick.position);
				g.add(line);
			}
		}
		g.userData.id = plate.id;          // so where a good stands can be read back
		g.userData.courses = cs.length;
		g.userData.height = foot + cs.length * B.h + (cs.length - 1) * gap;
		return g;
	}

	// A stack is one way of standing a block up and not the only one. Here the
	// height is the count of places a good came from; on das Feld every place
	// gets the same one or two bricks and carries only its largest goods, so
	// the field says how many places there were and nothing about how much
	// each sent. The yard, the ground, the camera and the layout are the same
	// either way, so the brick-builder is the single thing that swaps out.
	let builder = stack;
	const KIT = { MM, B, PAL, mat, blank };
	const setBuilder = fn => { builder = fn || stack; };

	// a small seeded generator, so the same scatter comes back every time
	function rng(seed) {
		let s = (seed >>> 0) || 1;
		return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
	}

	// The field: a fixed grid of standing-places, only some of which are used.
	//
	// The yard is the wall seen from above. The engraving desk lays a picture
	// across six bricks by eight courses, and this stands its stacks at those
	// same forty-eight points — so a top brick here carries exactly the square
	// of the picture that a brick in that position of the wall would carry.
	//
	// There are almost never forty-eight goods, and the ones left over are the
	// point rather than a shortfall: the empty places are dealt in among the
	// full ones off the field's own seed, so a stack stands clear with gaps
	// round it instead of walled in by its neighbours, and the picture on the
	// tops comes through as fragments of something whole. Which places are
	// empty is decided by the seed alone; which stack lands on which of the
	// full ones is decided back to front, so the tall ones are at the back.
	function build(plates, o) {
		clear();
		const L = Object.assign({ cols: 6, rows: 8, gapX: 120, gapZ: 120, stagger: 0, jitter: 0, turn: 0, seed: 7 }, o.layout);
		const cols = Math.max(1, Math.min(12, L.cols | 0));
		const n = plates.length;
		// the grid is as deep as it is asked to be, and deeper if there are
		// more goods standing than forty-eight places to put them
		const rowsOf = Math.max(1, Math.min(40, Math.max(L.rows | 0, Math.ceil(n / cols))));
		const cells = cols * rowsOf;
		const fw = B.l, fd = B.d;
		const cellW = fw + L.gapX;
		const cellD = fd + L.gapZ;
		const rand = rng(L.seed);

		// one brick to a course, so the courses laid across the whole yard are
		// the bricks that would have to be carried to it
		let maxH = 0, courses = 0, tallest = 0;

		// Which of the places are stood on. Every place is a candidate, the
		// whole grid is dealt off the seed, and the first n are taken — so the
		// empties fall anywhere, back row included, rather than collecting at
		// the front where filling in order would leave them.
		const deck = Array.from({ length: cells }, (_, i) => i);
		for (let i = deck.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[deck[i], deck[j]] = [deck[j], deck[i]];
		}
		// back to front, so the plates — which arrive tallest first — come
		// down on the far places before the near ones
		const used = deck.slice(0, Math.min(n, cells)).sort((a, b) => a - b);

		const at = cell => {
			const col = cell % cols, row = (cell / cols) | 0;
			const off = (row % 2) ? cellW * (L.stagger / 100) : 0;
			return {
				x: (col - (cols - 1) / 2) * cellW + off + (L.jitter ? (rand() * 2 - 1) * L.jitter : 0),
				z: (row - (rowsOf - 1) / 2) * cellD + (L.jitter ? (rand() * 2 - 1) * L.jitter : 0),
				turn: L.turn ? (rand() * 2 - 1) * L.turn * Math.PI / 180 : 0,
			};
		};
		const spots = used.map(at);

		// The picture is stretched over the whole grid, standing places and
		// empty ones alike — never over just what happens to be standing. A
		// square has to belong to the position, so that taking a stack away
		// leaves a hole in the picture instead of quietly resizing it onto
		// everything left.
		const spanX = (cols - 1) * cellW + fw;
		const spanZ = (rowsOf - 1) * cellD + fd;
		const gridMinX = -spanX / 2, gridMinZ = -spanZ / 2;
		const rectAt = spot => ({
			u0: (spot.x - fw / 2 - gridMinX) / spanX, u1: (spot.x + fw / 2 - gridMinX) / spanX,
			v0: (spot.z - fd / 2 - gridMinZ) / spanZ, v1: (spot.z + fd / 2 - gridMinZ) / spanZ,
		});

		let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
		for (let i = 0; i < spots.length; i++) {
			const { x, z, turn } = spots[i];
			const so = o.bedOn === 'picture' && o.picture
				? Object.assign({}, o, { bedRect: rectAt(spots[i]) })
				: o;
			const g = builder(plates[i], so, KIT);

			g.position.set(x * MM, 0, z * MM);
			if (turn) g.rotation.y = turn;

			group.add(g);
			maxH = Math.max(maxH, g.userData.height);
			courses += g.userData.courses;
			tallest = Math.max(tallest, g.userData.courses);
			minX = Math.min(minX, x - fw / 2); maxX = Math.max(maxX, x + fw / 2);
			minZ = Math.min(minZ, z - fd / 2); maxZ = Math.max(maxZ, z + fd / 2);
		}

		// One pallet under the whole yard, not one under each stack: a EPAL is
		// 1200 × 800 and a stack's footprint is 200 × 100, so a pallet each
		// would be a yard of mostly empty deck. Whether what is standing on it
		// actually fits is worth knowing, so it is measured rather than
		// assumed — the deck does not grow.
		const fits = n > 0
			&& (maxX - minX) <= PAL.l + 0.01
			&& (maxZ - minZ) <= PAL.d + 0.01;
		if (o.pallet) group.add(pallet());

		built = {
			stacks: n,
			onPallet: !!o.pallet,
			fits,
			bricks: courses,          // one to a course, across the whole yard
			tallest,                  // courses in the deepest stack
			courses, height: maxH,
			field: { w: n ? maxX - minX : 0, d: n ? maxZ - minZ : 0 },
			textures: count, bytes,
		};
		return built;
	}

	/* --------------------------------------------------------------- camera */

	// How much air to leave round the yard when standing back from it. A yard
	// of stacks is roughly as tall as it is wide and wants the room; a field
	// one brick high is nearly flat, and the same allowance leaves it a smudge
	// in the middle of the frame. So the page says which it is.
	let framePad = 1.55;
	const setFramePad = p => { framePad = p > 0 ? p : 1.55; };

	// stand back far enough to see the whole yard, and look at its middle
	function frame() {
		const hU = built.height * MM;
		cam.target.set(0, flat ? 0 : hU / 2, 0);
		const w = Math.max(built.field.w, B.l) * MM;
		const d = Math.max(built.field.d, B.d) * MM;
		if (flat) {
			// the plan wants the field, not the height
			const a = wrap ? Math.max(0.001, wrap.clientWidth / Math.max(1, wrap.clientHeight)) : 1;
			cam.dist = Math.max(d, w / a) * 1.12;
			frustum();
		} else {
			const span = Math.max(hU, w, d) * 1.05;
			cam.dist = span / (2 * Math.tan(persp.fov * Math.PI / 360)) * framePad;
		}
	}

	// The columns and gaps that put `n` stacks on one deck. A EPAL does not
	// grow, so either the field is cut to it or the stacks hang off it; this
	// works out the arrangement that fits with the most even gaps, and says so
	// if none of them fit at all.
	function fitToPallet(n) {
		if (n < 1) return null;
		let best = null;
		for (let cols = 1; cols <= Math.min(12, n); cols++) {
			const rows = Math.ceil(n / cols);
			const gx = cols > 1 ? (PAL.l - cols * B.l) / (cols - 1) : PAL.l - B.l;
			const gz = rows > 1 ? (PAL.d - rows * B.d) / (rows - 1) : PAL.d - B.d;
			if (gx < 0 || gz < 0) continue;
			// the most even gaps win, so the deck does not read as a queue
			const score = Math.min(gx, gz) - Math.abs(gx - gz) * 0.25;
			if (!best || score > best.score) {
				best = { cols, gapX: Math.floor(gx), gapZ: Math.floor(gz), score };
			}
		}
		return best;
	}

	// where each place ended up standing, in millimetres — the yard read back
	function placement() {
		return group.children
			.filter(c => c.userData && c.userData.id)
			.map(c => ({ id: c.userData.id, x: c.position.x / MM, z: c.position.z / MM }))
			.sort((a, b) => a.z - b.z || a.x - b.x);
	}

	function view(az, el, plan) {
		flat = !!plan;
		cam.az = az;
		cam.el = plan ? Math.PI / 2 - 0.0001 : el;
	}

	const isFlat = () => flat;
	function snapshot() { return renderer.domElement.toDataURL('image/png'); }

	S.Scene = {
		init, build, frame, view, snapshot, resize, isFlat, PAL, placement, fitToPallet,
		setBuilder, setFramePad,
		get built() { return built; }, MM, cam,
	};
})(window);

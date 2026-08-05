// ---------------------------------------------------------
// one pallet of brick, laid flat, pallet style: aligned, no bond offset
// the painting reads off the top face, broken where a scrap of the
// Bremen paperwork has landed on a brick and taken its place
// ---------------------------------------------------------

// brick grid, changed by the sliders
let COLS = 6, COURSES = 3;
let DISRUPT = 0.25;  // share of top bricks the papers take over
const BW = 2.6, BD = 1.3, BH = 0.78;   // one brick, roughly NF proportions
const GAP = 0.05;
let blockW, DEPTH, blockD, stackH;

// loaded images per source — local files sitting in images/
const sources = { front: null, right: null, left: null };
const FILES = {
	front: 'images/fire.png',  // fazenda painting
	right: 'images/Screenshot 2026-07-16 at 19.43.01.png',     // bremen import table
	left: 'images/Screenshot 2026-07-31 at 22.04.34.png'       // handwritten dispatch
};

// the pallet runs as many bricks deep as it takes for the top face to
// carry the painting undistorted; 4:3 stands in until it is loaded
function computeDims() {
	blockW = COLS * BW + (COLS - 1) * GAP;
	const aspect = sources.front ? sources.front.width / sources.front.height : 4 / 3;
	DEPTH = Math.max(1, Math.round((blockW / aspect + GAP) / (BD + GAP)));
	blockD = DEPTH * BD + (DEPTH - 1) * GAP;
	stackH = COURSES * BH + (COURSES - 1) * GAP;
}
computeDims();

// ---------- clay base per brick face ----------
function clayFace(w, h) {
	const c = document.createElement('canvas');
	c.width = w; c.height = h;
	const x = c.getContext('2d');
	const dr = Math.floor((Math.random() - 0.5) * 16);
	x.fillStyle = `rgb(${162 + dr}, ${96 + dr}, ${68 + dr})`;
	x.fillRect(0, 0, w, h);
	for (let i = 0; i < w * h / 60; i++) {
		x.fillStyle = Math.random() < 0.5 ? 'rgba(60,35,22,0.25)' : 'rgba(220,180,150,0.18)';
		x.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
	}
	return c;
}

// crop a window of the source image onto a clay face
// sx..sw in 0..1 relative coordinates of the source image
function inscribedFace(img, sx, sy, sw, sh, w, h, engraved) {
	const c = clayFace(w, h);
	const x = c.getContext('2d');
	if (engraved) {
		// grayscale + multiply = burn into the clay
		const tmp = document.createElement('canvas');
		tmp.width = w; tmp.height = h;
		const tx = tmp.getContext('2d');
		tx.filter = 'grayscale(1) contrast(1.25) brightness(1.05)';
		tx.drawImage(img, sx * img.width, sy * img.height, sw * img.width, sh * img.height, 0, 0, w, h);
		x.globalCompositeOperation = 'multiply';
		x.drawImage(tmp, 0, 0);
		x.globalCompositeOperation = 'source-over';
	} else {
		x.drawImage(img, sx * img.width, sy * img.height, sw * img.width, sh * img.height, 0, 0, w, h);
	}
	return c;
}

// ---------- scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8a8580');

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight('#d8cfc4', 0.75));
const sun = new THREE.DirectionalLight('#fff2e0', 0.9);
sun.position.set(8, 14, 10);
scene.add(sun);
const fill = new THREE.DirectionalLight('#b9c4d0', 0.3);
fill.position.set(-10, 4, -8);
scene.add(fill);

const block = new THREE.Group();
scene.add(block);

// blank clay faces come from a small pool. a unique texture per face
// runs to thousands of canvases, and the variation is subtle enough
// that a dozen reads the same
const clayPool = Array.from({ length: 16 }, () => {
	const m = new THREE.MeshStandardMaterial({
		map: new THREE.CanvasTexture(clayFace(128, 128)), roughness: 0.95
	});
	m.userData.pooled = true;
	return m;
});
const plainMat = () => clayPool[Math.floor(Math.random() * clayPool.length)];
const texMat = canvas => new THREE.MeshStandardMaterial({
	map: new THREE.CanvasTexture(canvas), roughness: 0.95
});

function disposeBrick(b) {
	b.geometry.dispose();
	b.material.forEach(m => {
		if (m.userData.pooled) return;   // shared, outlives the brick
		m.map && m.map.dispose();
		m.dispose();
	});
}

// ---------- loose fragments ----------
// a piece cut out of one of the images at random, belonging nowhere.
// faceW/faceH are the proportions of the brick face it will land on,
// so the crop is taken at that aspect instead of arriving stretched
function fragmentFace(keys, faceW, faceH, engraved) {
	const live = keys.filter(k => sources[k]);
	if (!live.length) return null;
	const img = sources[live[Math.floor(Math.random() * live.length)]];
	let sw = Math.min(1, (1 / COLS) * (0.6 + Math.random() * 1.2));
	let sh = sw * (img.width / img.height) * (faceH / faceW);
	if (sh > 1) { sw /= sh; sh = 1; }
	return inscribedFace(img,
		Math.random() * (1 - sw), Math.random() * (1 - sh),
		sw, sh, 256, 128, engraved);
}

// the papers, loose from their own sheets — these are what disrupt
const paperFragment = engraved => fragmentFace(['right', 'left'], BW, BD, engraved);

// what a brick shows once it is the top of the pallet: its own piece
// of the painting, unless a scrap of paper has taken the place
function topFace(brick, engraved) {
	if (!sources.front) return null;
	const scrap = Math.random() < DISRUPT ? paperFragment(engraved) : null;
	return scrap || inscribedFace(sources.front,
		brick.userData.col / COLS, brick.userData.dep / DEPTH,
		1 / COLS, 1 / DEPTH, 256, 128, engraved);
}

// give a brick the engraved top it has just been exposed to
function engraveTop(brick) {
	if (brick.userData.hasTop) return;
	const frag = topFace(brick, document.getElementById('engrave').checked);
	if (!frag) return;
	const old = brick.material[2];
	brick.material[2] = texMat(frag);
	if (!old.userData.pooled) { old.map && old.map.dispose(); old.dispose(); }
	brick.userData.hasTop = true;
}

// after a removal, whatever is now highest in that column surfaces
function refreshColumn(col, dep) {
	let top = null;
	for (const b of block.children) {
		const u = b.userData;
		if (u.col === col && u.dep === dep && (!top || u.row > top.userData.row)) top = b;
	}
	if (top) engraveTop(top);
}

// build (or rebuild) all bricks
function build() {
	computeDims();
	while (block.children.length) disposeBrick(block.children.pop());
	const engraved = document.getElementById('engrave').checked;

	for (let row = 0; row < COURSES; row++) {
		for (let col = 0; col < COLS; col++) {
			for (let dep = 0; dep < DEPTH; dep++) {
				const geo = new THREE.BoxGeometry(BW, BH, BD);
				// material order: +x -x +y -y +z -z
				const mats = [plainMat(), plainMat(), plainMat(), plainMat(), plainMat(), plainMat()];

				const brick = new THREE.Mesh(geo, mats);
				brick.userData = { col, row, dep, hasTop: false };
				brick.position.set(
					col * (BW + GAP) - blockW / 2 + BW / 2,
					row * (BH + GAP) + BH / 2,
					dep * (BD + GAP) - blockD / 2 + BD / 2
				);
				block.add(brick);

				// the flanks stay blank: this stack speaks upward only
				if (row === COURSES - 1) {
					const frag = topFace(brick, engraved);
					if (frag) { mats[2] = texMat(frag); brick.userData.hasTop = true; }
				}
			}
		}
	}
}

// pallet: simple planks under the block, rebuilt with it
const wood = new THREE.MeshStandardMaterial({ color: '#6b5a44', roughness: 1 });
const pallet = new THREE.Group();
scene.add(pallet);

function buildPallet() {
	while (pallet.children.length) pallet.children.pop().geometry.dispose();
	const planks = Math.max(4, Math.round(blockD / 1.6));
	for (let i = 0; i < planks; i++) {
		const plank = new THREE.Mesh(new THREE.BoxGeometry(blockW + 2, 0.3, 1.1), wood);
		plank.position.set(0, -0.35, -blockD / 2 - 0.4 + i * ((blockD + 0.8) / (planks - 1)));
		pallet.add(plank);
	}
	for (const px of [-blockW / 2 - 0.6, 0, blockW / 2 + 0.6]) {
		const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, blockD + 1), wood);
		foot.position.set(px, -0.85, 0);
		pallet.add(foot);
	}
}

function rebuildAll() {
	build();
	buildPallet();
}
rebuildAll();

// ground
const ground = new THREE.Mesh(
	new THREE.PlaneGeometry(200, 200),
	new THREE.MeshStandardMaterial({ color: '#7d7873', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.2;
scene.add(ground);

// ---------- image loading ----------
const status = document.getElementById('status');

function loadImage(path) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(path));
		img.src = encodeURI(path);
	});
}

// cache by path so two crops sharing a file only fetch once
const cache = new Map();
Promise.all(Object.entries(FILES).map(([key, path]) => {
	if (!cache.has(path)) cache.set(path, loadImage(path));
	return cache.get(path).then(img => { sources[key] = img; });
}))
	.then(() => {
		status.textContent = 'the painting, laid across the top course';
		rebuildAll();
		frameCamera();
	})
	.catch(err => {
		status.className = 'error';
		status.textContent = 'could not load ' + err.message + ' — serve this folder over http';
	});

document.getElementById('engrave').addEventListener('change', rebuildAll);

// sliders
function hookSlider(id, set) {
	document.getElementById(id).addEventListener('input', e => {
		set(parseInt(e.target.value));
		document.getElementById(id + 'V').textContent = e.target.value;
		rebuildAll();
		frameCamera();
	});
}
hookSlider('cols', v => COLS = v);
hookSlider('courses', v => COURSES = v);
hookSlider('disrupt', v => DISRUPT = v / 100);

// ---------- simple orbit ----------
// starts high and near overhead: the face that carries the picture is the top one
let theta = 0.5, phi = 0.72, radius = 34;
let dragging = false, px = 0, py = 0, moved = 0, zoomed = false;

function updateCamera() {
	camera.position.set(
		radius * Math.sin(phi) * Math.sin(theta),
		radius * Math.cos(phi) + stackH / 2,
		radius * Math.sin(phi) * Math.cos(theta)
	);
	camera.lookAt(0, stackH / 2, 0);
}

// fit the pallet in frame, unless the viewer has taken the zoom over.
// the tighter of the two window dimensions decides, so a narrow window
// pulls back instead of cropping the pallet
function frameCamera() {
	if (!zoomed) {
		const span = Math.max(blockW, blockD) * 1.1;   // a little air round it
		const reach = 2 * Math.tan(camera.fov * Math.PI / 360);
		radius = Math.min(110, Math.max(14, Math.max(span / reach, span / (reach * camera.aspect))));
	}
	updateCamera();
}
frameCamera();

addEventListener('pointerdown', e => {
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
	dragging = true; px = e.clientX; py = e.clientY; moved = 0;
});
addEventListener('pointerup', e => {
	// a press that barely travelled is a click, not a rotation
	if (dragging && moved < 5) pickBrick(e);
	dragging = false;
});
addEventListener('pointermove', e => {
	if (!dragging) return;
	moved += Math.abs(e.clientX - px) + Math.abs(e.clientY - py);
	theta -= (e.clientX - px) * 0.005;
	phi = Math.min(1.5, Math.max(0.06, phi - (e.clientY - py) * 0.005));
	px = e.clientX; py = e.clientY;
	updateCamera();
});

// click a brick to pull it out of the stack
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickBrick(e) {
	if (e.target !== renderer.domElement) return;
	ndc.x = (e.clientX / innerWidth) * 2 - 1;
	ndc.y = -(e.clientY / innerHeight) * 2 + 1;
	ray.setFromCamera(ndc, camera);
	const hit = ray.intersectObjects(block.children)[0];
	if (!hit) return;
	const brick = hit.object;
	block.remove(brick);
	disposeBrick(brick);
	// digging in brings the next fragment up
	refreshColumn(brick.userData.col, brick.userData.dep);
}
addEventListener('wheel', e => {
	radius = Math.min(110, Math.max(14, radius + e.deltaY * 0.02));
	zoomed = true;
	updateCamera();
});
addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
	frameCamera();
});

function loop() {
	requestAnimationFrame(loop);
	renderer.render(scene, camera);
}
loop();

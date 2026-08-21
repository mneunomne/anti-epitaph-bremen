/* handoff.js — der Stapel hands der Brenner a bag of labelled pictures.
 *
 * Everything the yard knows — which goods are standing, how the volume was
 * cut, which of eleven faces a brick was dealt, which square of the engraving
 * a bed carries — is settled here and then thrown away. What crosses over is
 * one image per face and a line saying which face of which brick it is.
 *
 * That is the whole contract. Der Brenner never learns what a Werth is. It
 * takes rectangles of known millimetre size, packs them onto a bed, and burns
 * them; it could be handed drawings of anything at all and would not know the
 * difference. Keeping it that way is the point: the reading of the volume
 * happens once, in one place, and the burner cannot silently disagree with it.
 *
 * What is handed over is the brick, not the burn.
 *
 * A brick is dark and the engraving is what makes it white — that is the whole
 * physical fact of the thing, and it is the one der Stapel knows. So a face
 * leaves here looking like the brick it will be: dark ground, white where the
 * head will have been. The tops go the same way; a bed of picture is a laser
 * raster where 0 is full power, which is the negative of what that top will
 * look like, so it is turned round on the way out with the rest.
 *
 * Der Brenner turns the whole set back at the door, because black fires and
 * that is its business, not the yard's. Which way a set is written is stated
 * in the manifest — `fires` — so an older bag of faces, written when the yard
 * did the flipping itself, still comes in the right way up.
 *
 * One caution, written into the manifest as well: the images are the artwork
 * now, so the resolution they leave at is the finest the burn can ever be.
 * Export at least as many pixels per millimetre as the machine scans lines.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const S = (AE.Stapel = AE.Stapel || {});

	const KIND = 'anti-epigraph/brenner-faces';
	const VERSION = 2;   // v2 hands the brick over as it looks; white is engraved

	// how far a brick has to stand off the bed to show this face, which is the
	// one thing about a face der Brenner needs that is not its own size
	function tallOf(w, h) {
		const B = S.Faces.BRICK;
		return (w === B.l && h === B.d) ? B.h : (w === B.l ? B.d : B.l);
	}

	const slug = t => String(t || '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');

	// Turn a canvas round. Anything transparent counts as untouched material
	// first — the crop of a picture leaves the overhang clear, and clear means
	// the head never went there — so it flattens onto white before inverting
	// and comes out as ground rather than as a hole in the brick.
	function negative(src) {
		const c = document.createElement('canvas');
		c.width = src.width; c.height = src.height;
		const x = c.getContext('2d');
		x.fillStyle = '#ffffff';
		x.fillRect(0, 0, c.width, c.height);
		x.drawImage(src, 0, 0);
		const px = x.getImageData(0, 0, c.width, c.height);
		const d = px.data;
		for (let i = 0; i < d.length; i += 4) {
			d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
			d[i + 3] = 255;
		}
		x.putImageData(px, 0, 0);
		return c;
	}

	/**
	 * build(plates, opts, extra, onProgress) -> Promise<{zip, manifest}>
	 *   plates   the goods standing, in the order they stand
	 *   opts     the face options the yard was drawn with
	 *   extra    { ppmm, year, seed, press, picture, bedRects, stands, only, now }
	 *            bedRects maps a face tag -> {u0,v0,u1,v1}
	 *            stands   where each stack stood, read back off the yard
	 *            only     the tags picked in the yard; everything, if absent
	 */
	async function build(plates, opts, extra, onProgress) {
		const e = extra || {};
		const ppmm = Math.max(2, e.ppmm || 12);
		const zip = new AE.Zip();
		const faces = [];
		// artwork, not simulation: the brick in two tones, no clay colour, and
		// the press left exactly as the yard had it, because a scanned edge is
		// part of the cut. White is where the engraving went, which is why the
		// ink is the white one here — on a brick the lettering is not laid on,
		// it is the brick with its skin taken off.
		const base = Object.assign({}, opts, {
			ppmm: ppmm, clay: '#000000', ink: '#ffffff',
			picture: e.picture || null, artwork: true,
		});

		let n = 0;
		const list = [];
		// A picked set is a set of marks, not of stacks: br.3b names one face of
		// one brick and nothing else, so the filter is made against the same
		// list the yard drew from and a mark that no longer stands falls out of
		// it quietly. That is the point of picking by mark — reshuffle the yard,
		// change the setting, and what was picked either still exists under that
		// name or was never really that face.
		const only = e.only && e.only.length ? new Set(e.only) : null;
		for (const p of plates)
			for (const f of S.Faces.faceList(p, base))
				if (!only || only.has(f.tag)) list.push([p, f]);

		for (const [p, f] of list) {
			if (onProgress) onProgress(n, list.length, f.tag);
			const ov = {};
			const rect = (e.bedRects || {})[f.tag];
			if (rect) ov.bedRect = rect;
			// A bed of picture comes off as the raster the machine would fire —
			// black is full power — and every other face here is the brick as
			// it looks. One of the two has to give, and it is this one, because
			// the whole bag has to read the same way round.
			//
			// The test has to be the same one faces.js makes, not a shorter one:
			// a square of picture asked for with no picture loaded quietly falls
			// back to the printed bed, which is already the right way round and
			// would be ruined by turning it again.
			const raster = !!rect && base.bedOn === 'picture'
				&& !!(base.picture && base.picture.img);
			const canvas = raster ? negative(f.make(ov)) : f.make(ov);
			const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
			const file = 'art/' + slug(f.tag) + '.png';
			await zip.addBlob(file, blob);
			faces.push({
				file: file,
				tag: f.tag,
				brick: p.id + '/' + (f.course || f.id),
				good: p.title,
				course: f.course,
				letter: f.letter,
				kind: f.kind,
				w_mm: f.w,
				h_mm: f.h,
				stands_mm: tallOf(f.w, f.h),
				px: [canvas.width, canvas.height],
				carries_picture: raster,
			});
			n++;
		}

		const manifest = {
			kind: KIND,
			version: VERSION,
			made: e.now || null,
			year: e.year || null,
			ppmm: ppmm,
			// Which tone the head fires on. These faces are the brick as it will
			// look, so it is the white one; der Brenner inverts the lot on the
			// way in. A set without this line is a v1 set and is already the
			// other way round.
			fires: 'white',
			// what this set is: the whole yard, or a handful of faces picked off
			// it by hand. der Brenner burns both the same way and does not care;
			// it is here so a folder found later says what it was.
			picked: !!only,
			// and where the stacks these came off were standing. Provenance, not
			// instruction: der Brenner lays its own bed, because a bed is a grid
			// squared to the head and a yard is not.
			stands: e.stands || null,
			note: 'these are the bricks as they will look: white is where the '
				+ 'engraving went and so white is what fires, which der Brenner '
				+ 'turns round as it takes them in. they are the artwork: they '
				+ 'cannot be burnt finer than the ppmm above.',
			brick_mm: [S.Faces.BRICK.l, S.Faces.BRICK.d, S.Faces.BRICK.h],
			faces: faces,
		};
		zip.add('manifest.json', new TextEncoder().encode(
			JSON.stringify(manifest, null, 1)));
		zip.add('README.txt', new TextEncoder().encode(
			'faces cut by der Stapel, for der Brenner.\n\n'
			+ 'one png per face of one brick, white on black -- these are the\n'
			+ 'bricks as they will look, and engraving a brick is what makes it\n'
			+ 'white. so white is where the head fires, and der Brenner turns\n'
			+ 'them round as it loads them. manifest.json says which face of\n'
			+ 'which brick each one is and how big it is in millimetres.\n\n'
			+ 'to burn them: open der Brenner and load this folder (or the zip)\n'
			+ 'with "take faces from a file". it will pack them onto the bed by\n'
			+ 'the sizes in the manifest. nothing else is needed -- der Brenner\n'
			+ 'does not read the volume and does not need the yard.\n\n'
			+ 'written at ' + ppmm + ' px/mm. the burn cannot be finer than that.\n'));
		return { zip, manifest };
	}

	/**
	 * read(files) -> Promise<items[]>
	 * takes a FileList: the zip, or the manifest and the pngs beside it loose,
	 * in any order.
	 *
	 * What comes back is always in the burner's own convention — black fires —
	 * whichever way round the set was written. This is the door, and turning
	 * the pictures round is what the door is for: der Stapel says what a brick
	 * looks like, der Brenner says what the head does, and neither has to hold
	 * the other's idea in mind while it works.
	 */
	async function read(files) {
		let all = Array.from(files || []);
		// The handoff is written as a zip, so it should be readable as one. A
		// folder of loose files still works — der Brenner took them that way
		// before this and there is no reason to stop it — but nobody should
		// have to unpack a thing by hand to hand it on.
		const zips = all.filter(f => /\.zip$/i.test(f.name));
		if (zips.length) {
			const loose = all.filter(f => !/\.zip$/i.test(f.name));
			const out = [];
			for (const z of zips) out.push(...await AE.Zip.read(z));
			all = loose.concat(out);
		}
		const mf = all.find(f => /manifest\.json$/i.test(f.name));
		if (!mf) throw new Error('no manifest.json among those files');
		const man = JSON.parse(await mf.text());
		if (!man || man.kind !== KIND) throw new Error('that manifest is not a Stapel face set');
		if (man.version > VERSION) throw new Error('that set was written by a newer Stapel');

		// match by basename, so it does not matter whether the folder came
		// across whole or the files were picked out of it by hand
		const byName = new Map();
		for (const f of all) byName.set(f.name.split('/').pop(), f);

		const items = [];
		const missing = [];
		for (const rec of man.faces || []) {
			const want = rec.file.split('/').pop();
			const file = byName.get(want);
			if (!file) { missing.push(want); continue; }
			const img = await new Promise((res, rej) => {
				const url = URL.createObjectURL(file);
				const im = new Image();
				im.onload = () => { URL.revokeObjectURL(url); res(im); };
				im.onerror = () => { URL.revokeObjectURL(url); rej(new Error(want)); };
				im.src = url;
			});
			// v2 hands over the brick as it looks: white is the engraving, so
			// white is what has to fire. Everything downstream — the bed, the
			// preview, the g-code — reads black as power, so the turn is made
			// once, here, and nothing after this has to know.
			items.push(Object.assign({}, rec, {
				img: man.fires === 'white' ? negative(img) : img,
			}));
		}
		return { manifest: man, items: items, missing: missing };
	}

	S.Handoff = { KIND, VERSION, build, read, tallOf };
})(window);

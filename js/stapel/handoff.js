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
 * Black fires. Every face is drawn black-on-white, and on a bed of picture the
 * raster is handed over as it stands — grey 0 is full power, 255 is the head
 * off. That is the same convention der Brenner and the engraving desk already
 * work in, so nothing needs converting at the other end.
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
	const VERSION = 1;

	// how far a brick has to stand off the bed to show this face, which is the
	// one thing about a face der Brenner needs that is not its own size
	function tallOf(w, h) {
		const B = S.Faces.BRICK;
		return (w === B.l && h === B.d) ? B.h : (w === B.l ? B.d : B.l);
	}

	const slug = t => String(t || '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');

	/**
	 * build(plates, opts, extra, onProgress) -> Promise<{zip, manifest}>
	 *   plates   the goods standing, in the order they stand
	 *   opts     the face options the yard was drawn with
	 *   extra    { ppmm, year, seed, press, picture, bedRects, now }
	 *            bedRects maps a face tag -> {u0,v0,u1,v1}
	 */
	async function build(plates, opts, extra, onProgress) {
		const e = extra || {};
		const ppmm = Math.max(2, e.ppmm || 12);
		const zip = new AE.Zip();
		const faces = [];
		// artwork, not simulation: black on white, no clay, and the press left
		// exactly as the yard had it, because a scanned edge is part of the cut
		const base = Object.assign({}, opts, {
			ppmm: ppmm, clay: '#ffffff', ink: '#000000',
			picture: e.picture || null, artwork: true,
		});

		let n = 0;
		const list = [];
		for (const p of plates) for (const f of S.Faces.faceList(p, base)) list.push([p, f]);

		for (const [p, f] of list) {
			if (onProgress) onProgress(n, list.length, f.tag);
			const ov = {};
			const rect = (e.bedRects || {})[f.tag];
			if (rect) ov.bedRect = rect;
			const canvas = f.make(ov);
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
				carries_picture: !!rect,
			});
			n++;
		}

		const manifest = {
			kind: KIND,
			version: VERSION,
			made: e.now || null,
			year: e.year || null,
			ppmm: ppmm,
			note: 'black fires, white is the head off. these images are the '
				+ 'artwork: they cannot be burnt finer than the ppmm above.',
			brick_mm: [S.Faces.BRICK.l, S.Faces.BRICK.d, S.Faces.BRICK.h],
			faces: faces,
		};
		zip.add('manifest.json', new TextEncoder().encode(
			JSON.stringify(manifest, null, 1)));
		zip.add('README.txt', new TextEncoder().encode(
			'faces cut by der Stapel, for der Brenner.\n\n'
			+ 'one png per face of one brick, black on white: black is where the\n'
			+ 'head fires. manifest.json says which face of which brick each one\n'
			+ 'is and how big it is in millimetres.\n\n'
			+ 'to burn them: open der Brenner and load this folder (or the zip)\n'
			+ 'with "take faces from a file". it will pack them onto the bed by\n'
			+ 'the sizes in the manifest. nothing else is needed -- der Brenner\n'
			+ 'does not read the volume and does not need the yard.\n\n'
			+ 'written at ' + ppmm + ' px/mm. the burn cannot be finer than that.\n'));
		return { zip, manifest };
	}

	/**
	 * read(files) -> Promise<items[]>
	 * takes a FileList: the manifest and the pngs beside it, in any order.
	 */
	async function read(files) {
		const all = Array.from(files || []);
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
			items.push(Object.assign({}, rec, { img: img }));
		}
		return { manifest: man, items: items, missing: missing };
	}

	S.Handoff = { KIND, VERSION, build, read, tallOf };
})(window);

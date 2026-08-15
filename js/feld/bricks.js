/* bricks.js — the same few bricks for every place.
 *
 * der Stapel lets a place stand as high as it had goods to send, so the yard
 * seen from above is a ranking whether or not one was wanted. Here the height
 * is taken away: every place gets the same number of bricks — one, unless
 * asked otherwise — and each brick carries only the largest goods that are
 * left after the filtering. What the field then says is how many places there
 * were, and what each of them chiefly sent, and nothing at all about how much.
 *
 * Nothing is printed on the bed. A brick with nothing on top is a brick meant
 * to be looked at from the side, and the place's name goes on one of those
 * sides rather than over the plan.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const S = (AE.Stapel = AE.Stapel || {});
	const D = (AE.Feld = AE.Feld || {});
	const F = S.Faces;

	// how many goods a place is standing on, given X bricks of Y goods
	const take = (plate, o) =>
		plate.rows.slice(0, Math.max(1, o.bricks | 0) * Math.max(1, o.rows | 0));

	/* BoxGeometry hands its materials out in the order
	 *   [ +X, -X, +Y, -Y, +Z, -Z ]
	 * which on a brick 200 wide, 50 high and 100 deep is
	 *   an end, the other end, the bed, the underside, one long side, the other.
	 *
	 * Which of those a standing figure can see is settled by where the camera
	 * is put, and the yard's corner view stands it round at azimuth -0.5: to
	 * the -X side of the field and the +Z side of it. So -X and +Z are the two
	 * faces in view, and +X and -Z are the two that have to be walked round
	 * for. The goods always run down +Z, the long side in view.
	 *
	 * The name goes on the end in view, and then the figures have to go round
	 * to the end that is not — which is the one arrangement where a place and
	 * what it chiefly sent are both legible without moving. Put the name
	 * anywhere else and the figures come back beside their goods, at the price
	 * of a field that names nothing until it is walked round.
	 */
	function pile(plate, o, K) {
		const g = new THREE.Group();
		const B = K.B, MM = K.MM;
		const per = Math.max(1, o.rows | 0);
		const n = Math.max(1, o.bricks | 0);
		const gap = o.gap || 0;
		const foot = o.pallet ? K.PAL.h : 0;
		const rows = take(plate, o);
		const geo = new THREE.BoxGeometry(B.l * MM, B.h * MM, B.d * MM);

		// the name is the same on every brick of a place, so it is drawn once
		// and the one material hung on all of them
		const side = o.nameOn || 'near';
		const nmEnd = side !== 'back'
			? K.mat(F.nameplate(plate, B.d, B.h, Object.assign({}, o, { tag: F.tagFor(plate, '', 'e') }))) : null;
		const nmBack = (side === 'back' || side === 'both')
			? K.mat(F.nameplate(plate, B.l, B.h, Object.assign({}, o, { tag: F.tagFor(plate, '', 'd') }))) : null;

		// With the values brought round onto the stretcher, the end that had to
		// be walked round for is empty and the whole reading — the place, its
		// goods, their quantities and their values — stands on the two faces in
		// view. It costs the name column what the values take.
		const oneFace = o.figuresOn === 'stretcher';

		for (let i = 0; i < n; i++) {
			// the first goods sit highest, so a pile reads down the way the
			// printed table does; and the first brick carries the head, which
			// costs it a line
			const heads = (o.heads === undefined ? F.DEFAULTS.heads : o.heads) && per > 1;
			const top = i === 0 && heads;
			const before = top ? 0 : (heads ? per - 1 : per) + (i - 1) * per;
			const load = top ? rows.slice(0, per - 1) : rows.slice(before, before + per);
			const base = top ? o : Object.assign({}, o, { top: false });
			const fo = l => Object.assign({}, base, { tag: F.tagFor(plate, i + 1, l) });
			const y = foot * MM + (n - 1 - i) * (B.h + gap) * MM + B.h * MM / 2;

			const figures = oneFace ? K.blank(B.d, B.h, o) : K.mat(F.header(load, fo('c')));
			const goods = K.mat(F.stretcher(load, fo('b')));
			const near = side === 'near';

			const mats = [
				near ? figures : (nmEnd || K.blank(B.d, B.h, o)),   // +X, walked round for
				near ? nmEnd : figures,                             // -X, in view
				K.blank(B.l, B.d, o),                               // the bed carries nothing
				K.blank(B.l, B.d, o),
				goods,                                              // +Z, in view
				nmBack || K.blank(B.l, B.h, o),                     // -Z, walked round for
			];

			const brick = new THREE.Mesh(geo.clone(), mats);
			brick.position.set(0, y, 0);
			g.add(brick);

			if (o.outline !== false) {
				const line = new THREE.LineSegments(
					new THREE.EdgesGeometry(brick.geometry),
					new THREE.LineBasicMaterial({ color: o.ink || '#12100e' })
				);
				line.position.copy(brick.position);
				g.add(line);
			}
		}

		g.userData.id = plate.id;
		g.userData.courses = n;
		g.userData.height = foot + n * B.h + (n - 1) * gap;
		return g;
	}

	D.Bricks = { pile, take };
})(window);

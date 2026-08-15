/* net.js — the brick opened out flat, the top in the middle.
 *
 * A brick has six faces and four of them carry something. Standing in a yard
 * only two are ever legible at once, which is the whole difficulty of the
 * thing: what a place sent and what it was worth are on faces at right angles
 * to each other. Cut the brick along its vertical edges and lay it down and
 * the difficulty goes away — a cross, the bed in the middle and the four
 * sides hinged off it, everything the brick knows on one sheet.
 *
 *              ┌──────────────┐
 *              │  the back    │   200 × 50, set upside down: it folds up
 *   ┌────┬─────┴──────────────┴─────┬────┐
 *   │ -X │        the bed           │ +X │   100 × 50 each, on their sides
 *   └────┴─────┬──────────────┬─────┴────┘
 *              │  the front   │   200 × 50 — the goods
 *              └──────────────┘
 *
 * Which face carries what is not decided here: it is read off the same rules
 * the yard builds by, so the sheet is what der Stapel would actually print.
 * The panels are laid down the way a net is laid down — each one folds up
 * about the edge it touches — so this is a cutting sheet as much as a view.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const D = (AE.Deckel = AE.Deckel || {});
	const F = () => AE.Stapel.Faces;

	const B = { l: 200, d: 100, h: 50 };
	const SHEET = { w: B.h + B.l + B.h, h: B.h + B.d + B.h };   // 300 × 200

	// where each panel lands on the sheet, and how far round it has been
	// turned to get there. A panel is drawn so that folding it up about the
	// edge it shares with the bed brings it the right way up.
	// `w`/`h` is the panel where it lies on the sheet; `fw`/`fh` is the face's
	// own way round, which is what a label on it has to be set in
	const PANELS = [
		{ id: 'back', x: B.h, y: 0, w: B.l, h: B.h, fw: B.l, fh: B.h, rot: 180, label: 'the back' },
		{ id: 'left', x: 0, y: B.h, w: B.h, h: B.d, fw: B.d, fh: B.h, rot: 90, label: 'the far end' },
		{ id: 'bed', x: B.h, y: B.h, w: B.l, h: B.d, fw: B.l, fh: B.d, rot: 0 },
		{ id: 'right', x: B.h + B.l, y: B.h, w: B.h, h: B.d, fw: B.d, fh: B.h, rot: -90, label: 'the header' },
		{ id: 'front', x: B.h, y: B.h + B.d, w: B.l, h: B.h, fw: B.l, fh: B.h, rot: 0, label: 'the stretcher' },
	];

	// a face canvas dropped into its place on the sheet, turned as the fold
	// asks. x/y/w/h are the panel as it lies on the sheet, in millimetres.
	function place(x, img, p, P) {
		if (!img) return;
		x.save();
		x.translate(P(p.x + p.w / 2), P(p.y + p.h / 2));
		if (p.rot) x.rotate(p.rot * Math.PI / 180);
		x.drawImage(img, -img.width / 2, -img.height / 2);
		x.restore();
	}

	/* ---------------------------------------------------------- the faces */

	// The same reading scene.js builds a course by, so the sheet is not a
	// second opinion about what goes where: the values are on the header
	// unless they have gone round to the stretcher, and the ends and the back
	// carry the next goods, or the name, or nothing, in that order.
	function faces(plate, load, o, top, n) {
		const Fa = F();
		// only the course that carries the head is set as the top of its table
		o = load.head ? o : Object.assign({}, o, { top: false });
		// each side marked as it will be marked in the yard
		const t = l => Object.assign({}, o, { tag: Fa.tagFor(plate, n, l) });
		const two = o.sides === 2;
		const oneFace = o.figuresOn === 'stretcher';
		const nameOn = (two && !oneFace) ? 'none' : (o.nameOn || 'none');
		const back = two && load.back.length;
		const blank = (w, h) => Fa.blank(w, h, o);

		return {
			bed: top && o.bedOn !== 'none' ? Fa.bed(plate, o) : blank(B.l, B.d),
			front: Fa.stretcher(load.front, t('b')),
			right: oneFace ? blank(B.d, B.h) : Fa.header(load.front, t('c')),
			back: back ? Fa.stretcher(load.back, t('d'))
				: (nameOn === 'back' || nameOn === 'both') ? Fa.nameplate(plate, B.l, B.h, t(''))
					: blank(B.l, B.h),
			left: back && !oneFace ? Fa.header(load.back, t('e'))
				: (nameOn === 'end' || nameOn === 'both') ? Fa.nameplate(plate, B.d, B.h, t(''))
					: blank(B.d, B.h),
		};
	}

	/* ----------------------------------------------------------- the sheet */

	function draw(plate, o, bedCanvas) {
		const P = mm => mm * o.ppmm;
		const c = document.createElement('canvas');
		c.width = Math.round(SHEET.w * o.ppmm);
		c.height = Math.round(SHEET.h * o.ppmm);
		const x = c.getContext('2d');

		// the sheet itself — the four corners are what is cut away
		x.fillStyle = o.sheet || o.clay;
		x.fillRect(0, 0, c.width, c.height);

		const cs = F().courses(plate, Math.max(1, o.rows | 0), o.sides, 0, o.heads);
		const at = Math.max(0, Math.min(cs.length - 1, o.course | 0));
		const load = cs[at];
		// the top comes from the sketch, not from faces.js — it is the face
		// this page is for, and the whole point is to see it in its brick, so
		// faces.js is never asked for a bed it would only have thrown away
		const f = faces(plate, load, o, at === 0 && !bedCanvas, at + 1);
		if (bedCanvas) f.bed = bedCanvas;

		for (const p of PANELS) place(x, f[p.id], p, P);

		// the folds, and the line the knife takes round the outside
		if (o.fold) {
			x.save();
			x.strokeStyle = o.ink;
			x.globalAlpha = 0.5;
			x.setLineDash([P(2.4), P(2)]);
			x.lineWidth = Math.max(1, P(0.35));
			x.beginPath();
			for (const [x1, y1, x2, y2] of [
				[B.h, B.h, B.h + B.l, B.h],                     // the back fold
				[B.h, B.h + B.d, B.h + B.l, B.h + B.d],         // the front fold
				[B.h, B.h, B.h, B.h + B.d],                     // the far end
				[B.h + B.l, B.h, B.h + B.l, B.h + B.d],         // the header
			]) { x.moveTo(P(x1), P(y1)); x.lineTo(P(x2), P(y2)); }
			x.stroke();
			x.restore();
		}

		if (o.cut) {
			x.save();
			x.strokeStyle = o.ink;
			x.lineWidth = Math.max(1, P(0.5));
			x.beginPath();
			// round the cross, corner by corner
			const pts = [
				[B.h, 0], [B.h + B.l, 0], [B.h + B.l, B.h], [SHEET.w, B.h],
				[SHEET.w, B.h + B.d], [B.h + B.l, B.h + B.d], [B.h + B.l, SHEET.h],
				[B.h, SHEET.h], [B.h, B.h + B.d], [0, B.h + B.d], [0, B.h], [B.h, B.h],
			];
			pts.forEach(([px, py], i) => i ? x.lineTo(P(px), P(py)) : x.moveTo(P(px), P(py)));
			x.closePath();
			x.stroke();
			x.restore();
		}

		// What each panel is, set on the panel itself and the way that panel
		// reads — a label in a corner of the sheet would sit between two of
		// them and name neither. It is faint, and it is the first thing off
		// when the sheet is going to be cut.
		if (o.panelNames) {
			x.save();
			x.fillStyle = o.ink;
			x.globalAlpha = 0.55;
			x.font = `400 italic ${P(3.6)}px ${AE.Tafeln.Plate.faceCss(o.text)}`;
			x.textAlign = 'left';
			for (const p of PANELS) {
				if (!p.label) continue;
				x.save();
				x.translate(P(p.x + p.w / 2), P(p.y + p.h / 2));
				if (p.rot) x.rotate(p.rot * Math.PI / 180);
				x.fillText(`${p.label} · ${p.fw} × ${p.fh}`,
					P(-p.fw / 2 + 2.5), P(p.fh / 2 - 2));
				x.restore();
			}
			x.restore();
		}

		return { canvas: c, courses: cs.length, course: at, load };
	}

	D.Net = { SHEET, B, PANELS, draw, faces };
})(window);

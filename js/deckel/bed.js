/* bed.js — der Deckel's hold on the top face.
 *
 * The design worked out on this page now lives in faces.js, where the yard
 * takes it: the bed is drawn by `Faces.bed` and measured by `Faces.bedLayout`,
 * off the same option names the panel sets. What is left here is the little
 * that the workbench needs and the yard does not — the face's own dimensions,
 * and a draw that hands back the layout as well as the canvas so the page can
 * say how much of the face the setting has used up.
 *
 * The page and the yard therefore cannot drift: there is one bed, and this is
 * a handle on it, not a copy of it.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const D = (AE.Deckel = AE.Deckel || {});
	const F = () => AE.Stapel.Faces;

	const BED = { l: 200, d: 100 };

	// the face and its measurements in one call, which is what a workbench
	// wants and a brick does not
	function draw(plate, o) {
		return { canvas: F().bed(plate, o), at: F().bedLayout(plate, o) };
	}

	D.Bed = {
		BED,
		get DEFAULTS() { return F().DEFAULTS; },
		draw,
		layout: (plate, o) => F().bedLayout(plate, o),
		shipsOf: (year, id) => F().shipsOf(year, id),
		shipsLine: (s, what) => F().shipsLine(s, what),
		sourceLine: plate => F().sourceLine(plate),
	};
})(window);

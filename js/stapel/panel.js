/* panel.js — the settings of a face, listed once for every page that sets it.
 *
 * der Stapel and das Feld print the same bricks out of the same faces.js, and
 * der Deckel sets one of those faces on its own. Written out as markup in each
 * page, the three drifted: a decision taken in faces.js — the head italic, the
 * Werth's head reading simply "Werth" — never reached the yard, because the
 * page carried its own copy of the default and quietly won.
 *
 * So the settings are a list, and the pages hold overrides on the defaults
 * rather than values of their own. What is not overridden is whatever faces.js
 * says today, which means a decision made there passes down by itself.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const S = (AE.Stapel = AE.Stapel || {});

	// the faces on disk are variable over 400–700, so the list stops where they do
	const WEIGHTS = [[400, 'regular'], [500, 'medium'], [600, 'semibold'], [700, 'bold']];

	/* ------------------------------------------- the two working faces */

	const FACE = [
		{ k: 'display', kind: 'face', label: 'the place — display face' },
		{ k: 'text', kind: 'face', label: 'the goods — text face' },
		{ k: 'figFace', kind: 'face', same: 'as the goods', label: 'the figures' },

		{ note: 'the goods and their figures — both a share of the row they sit in' },
		{ k: 'goodsSize', min: 20, max: 95, step: 1, unit: '%', label: 'the Waare names' },
		{ k: 'goodsWeight', kind: 'select', opts: WEIGHTS, label: 'the names’ weight' },
		{ k: 'figSize', min: 20, max: 95, step: 1, unit: '%', label: 'the Quantum and Werth figures' },
		{ k: 'figWeight', kind: 'select', opts: WEIGHTS, label: 'the figures’ weight' },
		{
			k: 'figuresOn', kind: 'select', label: 'the Werth', opts: [
				['header', 'on the header, round the corner'],
				['stretcher', 'beside its quantity, on the one face']],
		},

		{ note: 'the money' },
		{
			k: 'currency', kind: 'select', label: 'the money is', opts: [
				['none', 'not said'],
				['first', 'said once, dittoed under it'],
				['every', 'said on every line']],
		},
		{ k: 'mark', kind: 'text', label: 'and called' },
		{ k: 'markDitto', kind: 'text', label: 'the ditto under it' },
		{ k: 'markSize', min: 20, max: 120, step: 1, unit: '%', label: 'the money, of the figure' },
		{ k: 'markGap', min: 0, max: 10, step: 0.2, unit: ' mm', label: 'before the money' },

		{ note: 'the head line — the table’s first row. A stack is one table, so it stands on the top brick and takes a line of it; the courses under it are full.' },
		{ k: 'heads', kind: 'check', label: 'a head line over the columns' },
		{ k: 'headWaare', kind: 'text', label: 'over the names it reads' },
		{ k: 'headQuantum', kind: 'text', label: 'over the quantities' },
		{ k: 'headWerth', kind: 'text', label: 'over the values' },
		{ k: 'headFace', kind: 'face', same: 'as the goods', label: 'the head’s face' },
		{
			k: 'headStyle', kind: 'select', label: 'and its cut', opts: [
				['italic', 'italic, as “Werth im Ganzen”'], ['normal', 'upright']],
		},
		{ k: 'headWeight', kind: 'select', opts: WEIGHTS, label: 'the head’s weight' },
		{ k: 'headSize', min: 50, max: 170, step: 2, unit: '%', label: 'the head’s size' },
		{ k: 'headTrack', min: 0, max: 30, step: 0.5, unit: '%', label: 'the head’s tracking' },
		{ k: 'headRule', min: 0, max: 4, step: 0.1, unit: ' mm', label: 'the rule under it' },

		{ note: 'the assembly mark — the place, the brick counting down from the top, and the face: b the stretcher, c the header, d the back, e the far end. The bed is a and goes unmarked.' },
		{ k: 'tags', kind: 'check', label: 'mark every printed side' },
		{ k: 'tagSize', min: 0, max: 8, step: 0.1, unit: ' mm', label: 'the mark' },
		{ k: 'tagTop', min: 0, max: 8, step: 0.1, unit: ' mm', label: 'down from the top edge' },

		{ note: 'the margins, and the rules between the columns' },
		{ k: 'padX', min: 0, max: 30, step: 0.5, unit: ' mm', label: 'the stretcher’s margin' },
		{ k: 'padY', min: 0, max: 12, step: 0.5, unit: ' mm', label: 'over and under the rows' },
		{ k: 'headerPad', min: 0, max: 30, step: 0.5, unit: ' mm', label: 'the header’s margin' },
		{ k: 'nameCol', min: 0.2, max: 0.9, step: 0.01, label: 'where the Quantum begins' },
		{ k: 'headerLeaders', kind: 'check', label: 'dots across the header to its Werth' },
		{ k: 'colRule', min: 0, max: 3, step: 0.1, unit: ' mm', label: 'between the Waare and the Quantum' },
		{ k: 'valRule', min: 0, max: 3, step: 0.1, unit: ' mm', label: 'before the Werth, where it is beside it' },
	];

	/* ------------------------------------------------------------ the bed */

	const BED = [
		{ k: 'kicker', kind: 'check', label: '“Einfuhr von” over the name' },
		{ k: 'source', kind: 'check', label: 'the printing, the year, the pages' },

		{ note: 'the bed is a fixed 196 × 95, so here a size is a size' },
		{ k: 'titleSize', min: 6, max: 46, step: 0.5, unit: ' mm', label: 'the place' },
		{ k: 'kickerSize', min: 2, max: 18, step: 0.5, unit: ' mm', label: '“Einfuhr von”' },
		{ k: 'sourceSize', min: 2, max: 16, step: 0.5, unit: ' mm', label: 'the printing and pages' },

		{ note: 'the spacing down the face' },
		{ k: 'bedPadX', min: 0, max: 40, step: 0.5, unit: ' mm', label: 'in from the sides' },
		{ k: 'bedPadTop', min: 0, max: 30, step: 0.5, unit: ' mm', label: 'in from the back' },
		{ k: 'bedPadBottom', min: 0, max: 30, step: 0.5, unit: ' mm', label: 'in from the front' },
		{ k: 'kickerGap', min: 0, max: 20, step: 0.5, unit: ' mm', label: 'under “Einfuhr von”' },
		{ k: 'titleGap', min: 0, max: 20, step: 0.5, unit: ' mm', label: 'under the name' },
		{ k: 'underGap', min: 0, max: 20, step: 0.5, unit: ' mm', label: 'under the heavy rule' },
		{ k: 'sourceGap', min: 0, max: 20, step: 0.5, unit: ' mm', label: 'under the printing' },

		{ note: 'the rules' },
		{ k: 'underRule', min: 0, max: 8, step: 0.1, unit: ' mm', label: 'under the name' },
		{ k: 'underInset', min: 0, max: 45, step: 0.5, unit: '%', label: 'held clear each side' },
	];

	/* ------------------------------------------------------------ the press */

	// The press, as die Tafel and der Deckel set it — the same six settings and
	// the same figures, so that a face run through it on one page comes off the
	// same on another. The pages had a checkbox and no dials, and their own
	// quieter figures underneath it, which is why the yard never looked like
	// the sketch.
	const PRESS = [
		{ k: 'bite', min: 0, max: 4, step: 0.05, label: 'the edge wanders' },
		{ k: 'spread', min: -0.5, max: 0.5, step: 0.01, label: 'ink gains ↔ starves' },
		{ k: 'grain', min: 0, max: 0.4, step: 0.005, label: 'mottling' },
		{ k: 'coarse', min: 1, max: 14, step: 0.1, label: 'the paper texture' },
		{ k: 'dust', min: 0, max: 1, step: 0.02, label: 'specks in the white' },
		{ k: 'soft', min: 0.01, max: 0.4, step: 0.01, label: 'how hard the edge falls' },
	];

	/* ---------------------------------------------------------- the panel */

	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const num = (v, fb) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fb);

	function control(it, v, ns) {
		if (it.note) return `<p class="hint">${it.note}</p>`;
		const id = `${ns}_${it.k}`;
		const tag = `id="${id}" data-p="${ns}" data-k="${it.k}"`;
		if (it.kind === 'check')
			return `<label class="check"><input type="checkbox" ${tag}${v ? ' checked' : ''}> ${it.label}</label>`;
		if (it.kind === 'text')
			return `<label class="ctl">${it.label}<input type="text" ${tag} value="${esc(v)}"></label>`;
		if (it.kind === 'face') {
			const same = it.same ? `<option value=""${v ? '' : ' selected'}>${esc(it.same)}</option>` : '';
			return `<label class="ctl">${it.label}<select ${tag}>` + same +
				AE.Tafeln.Plate.FACES.map(f =>
					`<option value="${f.id}"${f.id === v ? ' selected' : ''}>${esc(f.label)}</option>`).join('') +
				`</select></label>`;
		}
		if (it.kind === 'select')
			return `<label class="ctl">${it.label}<select ${tag}>` + it.opts.map(([ov, ot]) =>
				`<option value="${ov}"${String(ov) === String(v) ? ' selected' : ''}>${esc(ot)}</option>`).join('') +
				`</select></label>`;
		return `<label class="ctl rng">${it.label}` +
			`<input type="range" ${tag} min="${it.min}" max="${it.max}" step="${it.step}" value="${v}">` +
			`<output id="${id}_v">${v}${it.unit || ''}</output></label>`;
	}

	// `bag` holds only what has been moved off the default, so the rest of the
	// setting follows faces.js wherever it goes next.
	function build(hostId, list, ns, bag, onChange, defaults) {
		const host = document.getElementById(hostId);
		if (!host) return;
		const D = defaults || S.Faces.DEFAULTS;
		const val = k => (k in bag ? bag[k] : D[k]);
		host.innerHTML = list.map(it => control(it, it.note ? null : val(it.k), ns)).join('');

		host.querySelectorAll('[data-p]').forEach(el => {
			const k = el.dataset.k;
			const it = list.find(i => i.k === k);
			const on = () => {
				bag[k] = el.type === 'checkbox' ? el.checked
					: el.type === 'text' ? el.value
						: el.tagName === 'SELECT' ? (/^-?\d+$/.test(el.value) ? +el.value : el.value)
							: num(el.value, D[k]);
				const out = document.getElementById(`${ns}_${k}_v`);
				if (out) out.value = bag[k] + (it.unit || '');
				onChange();
			};
			el.oninput = on;
			el.onchange = on;
		});
	}

	S.Panel = { FACE, BED, PRESS, WEIGHTS, build };
})(window);

/* ink.js — the press, after the type.
 *
 * A block drawn on a canvas is too clean to have come off a bed of metal in
 * 1860. What the scan actually shows is three separate faults: the edge of
 * every stroke wanders, because damp paper and worn type never meet the same
 * way twice; the ink gains or starves, fattening the fine serifs or breaking
 * the hairlines outright; and the whole thing sits in a field of grain and
 * stray specks.
 *
 * The same effect is usually written as an SVG filter — feTurbulence into
 * feDisplacementMap, then a hard feComponentTransfer on the alpha. That
 * filters what is *shown*, though, not what the canvas holds, so it would
 * vanish the moment the block was exported. This is the same three steps
 * done to the pixels, so what leaves the page is what was on screen.
 *
 * A block is black on white, but a brick is black on clay, and running one
 * through a press written for paper threw its colour away with the grey. So
 * the two colours the face was drawn in are given to it, the tone is worked
 * out between them, and it is laid back down between them.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const T = (AE.Tafeln = AE.Tafeln || {});

	const DEFAULTS = {
		on: false,
		bite: 0.9,    // how far a stroke edge wanders, px at scale 1
		spread: -0.06,  // under 0 the ink gains and fattens; over 0 it starves
		grain: 0.10,   // mottling in the threshold — broken strokes
		coarse: 3.2,    // the size of the paper texture, px at scale 1
		dust: 0.35,   // stray specks in the white
		soft: 0.10,   // how hard the edge comes down
		seed: 1847,
		// what the face was drawn in — the tone is read and laid back down
		// between these two, so a clay brick comes off the press still clay
		inkColour: '#000000',
		paperColour: '#ffffff',
	};

	// '#rgb' or '#rrggbb' to three numbers; anything else is taken for black
	function rgb(c) {
		const h = String(c || '').replace('#', '').trim();
		const t = h.length === 3 ? h.split('').map(d => d + d).join('') : h;
		const n = parseInt(t, 16);
		return t.length === 6 && Number.isFinite(n)
			? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
			: { r: 0, g: 0, b: 0 };
	}
	const lum = c => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;

	/* --------------------------------------------------------------- noise */

	// value noise on a lattice, smoothstep between. Two of these at different
	// cell sizes is enough turbulence for paper; a full fBm is not worth the
	// passes over a few million pixels.
	function lattice(n, seed) {
		const out = new Float32Array(n);
		let s = (seed >>> 0) || 1;
		for (let i = 0; i < n; i++) {
			s ^= s << 13; s >>>= 0;
			s ^= s >> 17;
			s ^= s << 5; s >>>= 0;
			out[i] = s / 2147483648 - 1;
		}
		return out;
	}

	function noise(w, h, cell, seed) {
		cell = Math.max(1, cell);
		const inv = 1 / cell;                       // hoisted: this runs w·h times
		const gw = Math.ceil(w * inv) + 2, gh = Math.ceil(h * inv) + 2;
		const lat = lattice(gw * gh, seed);
		const out = new Float32Array(w * h);
		// the x weights repeat on every row, so they are worth keeping
		const xi = new Int32Array(w), xs = new Float32Array(w);
		for (let x = 0; x < w; x++) {
			const gx = x * inv, x0 = gx | 0, fx = gx - x0;
			xi[x] = x0; xs[x] = fx * fx * (3 - 2 * fx);
		}
		for (let y = 0; y < h; y++) {
			const gy = y * inv, y0 = gy | 0, fy = gy - y0;
			const sy = fy * fy * (3 - 2 * fy);
			const r0 = y0 * gw, r1 = r0 + gw;
			const o = y * w;
			for (let x = 0; x < w; x++) {
				const x0 = xi[x], sx = xs[x];
				const a = lat[r0 + x0], b = lat[r0 + x0 + 1];
				const c = lat[r1 + x0], d = lat[r1 + x0 + 1];
				out[o + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
			}
		}
		return out;
	}

	// two octaves, the second at a third the cell and a third the weight
	function turbulence(w, h, cell, seed) {
		const a = noise(w, h, cell, seed);
		const b = noise(w, h, cell / 3, seed + 7919);
		for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.7 + b[i] * 0.3;
		return a;
	}

	// white noise per grain of paper, for the specks. A speck has to be a
	// speck — one grain across and rare — so it is hashed straight from the
	// coordinate rather than sampled off a smooth field, which would give
	// soft blobs the size of the turbulence cell instead.
	function hash01(x, y, seed) {
		let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
		h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
		return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
	}

	/* ---------------------------------------------------------------- pass */

	// `s` is the scale the block was drawn at, so the grain stays the same
	// size on the paper whether this is a screen preview or a 4× plate.
	function apply(canvas, opts, s) {
		const o = Object.assign({}, DEFAULTS, opts || {});
		if (!o.on) return canvas;
		const w = canvas.width, h = canvas.height;
		if (!w || !h) return canvas;
		s = s || 1;

		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		const img = ctx.getImageData(0, 0, w, h);
		const px = img.data;

		// The drawn face, 0..1 with 1 = paper — read as the distance between
		// the two colours it was drawn in rather than as a grey, so that the
		// threshold falls in the same place whatever the face is printed on.
		const INK = rgb(o.inkColour), PAPER = rgb(o.paperColour);
		const li = lum(INK), span = (lum(PAPER) - li) || 1;
		const src = new Float32Array(w * h);
		for (let i = 0, p = 0; i < src.length; i++, p += 4) {
			const v = ((0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) / 255 - li) / span;
			src[i] = v < 0 ? 0 : v > 1 ? 1 : v;
		}

		const cell = Math.max(1.2, o.coarse * s);
		const dx = turbulence(w, h, cell, o.seed);
		const dy = turbulence(w, h, cell, o.seed + 104729);
		const gr = turbulence(w, h, Math.max(1, cell / 2.2), o.seed + 15485863);
		const amp = o.bite * s;

		// --- ink gain. A 3×3 box on the displaced field is what fattens the
		// serifs when the threshold then comes down under a half.
		const bleed = o.spread !== 0;
		const mid = new Float32Array(w * h);

		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				// where this pixel reads from, after the paper has moved
				let sx = x + dx[i] * amp;
				let sy = y + dy[i] * amp;
				sx = sx < 0 ? 0 : sx > w - 1.001 ? w - 1.001 : sx;
				sy = sy < 0 ? 0 : sy > h - 1.001 ? h - 1.001 : sy;
				const x0 = sx | 0, y0 = sy | 0;
				const fx = sx - x0, fy = sy - y0;
				const r0 = y0 * w, r1 = r0 + w;
				const a = src[r0 + x0], b = src[r0 + x0 + 1];
				const c = src[r1 + x0], d = src[r1 + x0 + 1];
				mid[i] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
			}
		}

		// A box blur separates into a horizontal pass and a vertical one, which
		// turns (2r+1)² taps a pixel into 2(2r+1) — the difference between a
		// panel that answers a slider and one that does not.
		let field = mid;
		if (bleed) {
			const rad = Math.max(1, Math.round(0.6 * s));
			const tmp = new Float32Array(w * h);
			const blur = new Float32Array(w * h);
			for (let y = 0; y < h; y++) {
				const o = y * w;
				for (let x = 0; x < w; x++) {
					let sum = 0, n = 0;
					const from = x - rad < 0 ? 0 : x - rad;
					const to = x + rad >= w ? w - 1 : x + rad;
					for (let k = from; k <= to; k++) { sum += mid[o + k]; n++; }
					tmp[o + x] = sum / n;
				}
			}
			for (let x = 0; x < w; x++) {
				for (let y = 0; y < h; y++) {
					let sum = 0, n = 0;
					const from = y - rad < 0 ? 0 : y - rad;
					const to = y + rad >= h ? h - 1 : y + rad;
					for (let k = from; k <= to; k++) { sum += tmp[k * w + x]; n++; }
					blur[y * w + x] = sum / n;
				}
			}
			field = blur;
		}

		// --- the threshold, wandering with the grain, plus specks in the white
		const soft = Math.max(0.01, o.soft);
		const base = 0.5 + o.spread * 0.4;
		// a speck is one grain of paper across, so it stays the same size on
		// the sheet whether this is a preview or a 4× plate
		const gsz = Math.max(1, Math.round(s));
		// at full dust roughly one grain in two hundred takes a speck — past
		// that it stops reading as a printed sheet and starts reading as mould
		const rate = o.dust * 0.005;

		for (let y = 0, i = 0, p = 0; y < h; y++) {
			const gy = (y / gsz) | 0;
			for (let x = 0; x < w; x++, i++, p += 4) {
				const t = base + gr[i] * o.grain;
				const v = field[i];
				// smoothstep across the threshold — crisp, but not a hard cut
				let e = (v - (t - soft)) / (2 * soft);
				e = e < 0 ? 0 : e > 1 ? 1 : e;
				let out = e * e * (3 - 2 * e);

				// the solids of a worn plate are never quite solid
				if (out < 0.6 && o.grain > 0) {
					const m = gr[i] * o.grain * 1.4;
					if (m > 0) out = Math.min(1, out + m);
				}

				// dust: rare specks, and only on paper that is otherwise clean
				if (rate > 0 && out > 0.9) {
					const r = hash01((x / gsz) | 0, gy, o.seed);
					if (r < rate) out *= 0.25 + 0.55 * hash01((x / gsz) | 0, gy, o.seed + 1);
				}

				px[p] = INK.r + (PAPER.r - INK.r) * out;
				px[p + 1] = INK.g + (PAPER.g - INK.g) * out;
				px[p + 2] = INK.b + (PAPER.b - INK.b) * out;
				px[p + 3] = 255;
			}
		}

		ctx.putImageData(img, 0, 0);
		return canvas;
	}

	T.Ink = { apply, DEFAULTS };
})(window);

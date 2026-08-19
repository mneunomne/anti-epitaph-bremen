// turning a photograph into something a laser can burn.
//
// the chain is always the same: crop → levels → quantise. what changes is
// where it runs — at preview size for the screen, at dpi size for export.
(function () {
	const AE = (window.AE = window.AE || {});

	function canvas(w, h) {
		const c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w));
		c.height = Math.max(1, Math.round(h));
		return c;
	}

	// crop a rectangle of source pixels into a canvas of the given size.
	// the rectangle is allowed to fall outside the image — with bleed on,
	// or a contain fit, it will — and what falls outside is left transparent
	// rather than filled.
	//
	// this matters more than it looks. process() reads a transparent pixel as
	// blank material after the curve, so the padding is "do not fire" whether
	// invert is on or off. filling it white instead would be safe only one way
	// round: with the artwork inverted, white is the thing that burns, and the
	// margin would go through the machine at full power.
	function crop(img, src, w, h) {
		const c = canvas(w, h);
		const x = c.getContext('2d');
		x.imageSmoothingEnabled = true;
		x.imageSmoothingQuality = 'high';

		// clip the source rect to the image and shrink the destination to
		// match, so the crop keeps its scale instead of stretching to fill
		const sx = Math.max(0, src.x), sy = Math.max(0, src.y);
		const sx2 = Math.min(img.width, src.x + src.w), sy2 = Math.min(img.height, src.y + src.h);
		if (sx2 > sx && sy2 > sy) {
			const kx = c.width / src.w, ky = c.height / src.h;
			x.drawImage(img, sx, sy, sx2 - sx, sy2 - sy,
				(sx - src.x) * kx, (sy - src.y) * ky, (sx2 - sx) * kx, (sy2 - sy) * ky);
		}
		return c;
	}

	// the picture's own black and white points.
	//
	// a scan does not use the range it is given: an aged plate can sit
	// entirely between 18 and 188, and fed to the machine as-is not one
	// pixel of it ever reaches full power — the whole picture comes out as
	// a faint haze on the brick, because only a fraction of the available
	// bleach was ever asked for. so before anything else the range the
	// picture actually occupies is pulled out to the full one: inLo becomes
	// bare brick, inHi becomes a fully bleached mark, and everything the
	// plate has to say is spread across the whole distance between them.
	function inputRange(laser) {
		const lo = laser.inLo == null ? 0 : laser.inLo;
		const hi = laser.inHi == null ? 255 : laser.inHi;
		return lo < hi ? { lo, hi } : { lo: 0, hi: 255 };
	}

	// where those points sit for a given picture. the tails are trimmed so a
	// single dust speck or blown highlight cannot set the range for the
	// whole plate.
	function autoRange(source, trim) {
		const w = source.width, h = source.height;
		const c = canvas(Math.min(w, 600), Math.min(h, 600) * (Math.min(w, 600) / w) * (h / Math.min(h, 600)) || 1);
		c.width = Math.max(1, Math.min(w, 600));
		c.height = Math.max(1, Math.round(h * (c.width / w)));
		const x = c.getContext('2d');
		x.drawImage(source, 0, 0, c.width, c.height);
		const d = x.getImageData(0, 0, c.width, c.height).data;
		const hist = new Uint32Array(256);
		let n = 0;
		for (let i = 0; i < d.length; i += 4) {
			if (d[i + 3] < 8) continue;            // transparent is not picture
			hist[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
			n++;
		}
		if (!n) return { lo: 0, hi: 255, min: 0, max: 255 };
		let min = 0, max = 255;
		for (let v = 0; v < 256; v++) if (hist[v]) { min = v; break; }
		for (let v = 255; v >= 0; v--) if (hist[v]) { max = v; break; }
		const q = trim == null ? 0.005 : trim;
		const at = frac => {
			let acc = 0;
			for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * frac) return v; }
			return 255;
		};
		let lo = at(q), hi = at(1 - q);
		if (hi - lo < 8) { lo = 0; hi = 255; }     // a flat picture keeps the full range
		return { lo, hi, min, max };
	}

	// one lookup table for the range, brightness, contrast, gamma and
	// inversion. building it once and reading it per pixel keeps the inner
	// loop cheap
	function buildLUT(laser) {
		const bright = (laser.brightness || 0) / 100 * 255;
		const k = (laser.contrast == null ? 100 : laser.contrast) / 100;
		const gamma = laser.gamma || 1;
		const { lo, hi } = inputRange(laser);
		const span = hi - lo;
		const lut = new Uint8ClampedArray(256);
		for (let i = 0; i < 256; i++) {
			let v = Math.max(0, Math.min(255, (i - lo) / span * 255));
			v = v + bright;
			v = (v - 128) * k + 128;
			v = Math.max(0, Math.min(255, v));
			v = Math.pow(v / 255, 1 / gamma) * 255;
			lut[i] = laser.invert ? 255 - v : v;
		}
		return lut;
	}

	// a seeded generator, deliberately not Math.random.
	//
	// a noisy dither has to give the same bitmap twice: the file you look
	// at and the file you send a week later when the brick failed must be
	// the same file, or there is no way to check anything. xorshift32 is
	// cheap enough to call once per pixel.
	function noiseFn(seed) {
		let s = (seed || 1) >>> 0 || 1;
		return () => {
			s ^= s << 13; s >>>= 0;
			s ^= s >> 17;
			s ^= s << 5; s >>>= 0;
			return s / 4294967296;
		};
	}

	// grayscale, then optionally down to pure black and white.
	// floyd–steinberg is what most laser software would do anyway; doing it
	// here means what you see on screen is what the head will actually trace
	function process(srcCanvas, laser) {
		const w = srcCanvas.width, h = srcCanvas.height;
		const ctx = srcCanvas.getContext('2d');
		const data = ctx.getImageData(0, 0, w, h);
		const d = data.data;
		const lut = buildLUT(laser);

		// luminance through the curve
		const g = new Float32Array(w * h);
		for (let i = 0, p = 0; i < d.length; i += 4, p++) {
			const a = d[i + 3] / 255;
			const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
			// transparent pixels are blank material, not black
			g[p] = lut[Math.round(lum)] * a + 255 * (1 - a);
		}

		const mode = laser.mode || 'grayscale';
		const t = laser.threshold == null ? 128 : laser.threshold;
		// how far the cut wanders either side of the threshold, 0..255
		const spread = 255 * (laser.noise == null ? 100 : laser.noise) / 100;
		const rnd = noiseFn(laser.seed || 1);

		if (mode === 'threshold') {
			for (let p = 0; p < g.length; p++) g[p] = g[p] < t ? 0 : 255;
		} else if (mode === 'random') {
			// white noise: every pixel is decided on its own against a cut
			// that moves, so there is no pattern to find — only grain. the
			// average tone comes out right because the cut is uniform.
			for (let p = 0; p < g.length; p++) g[p] = g[p] < t + (rnd() - 0.5) * spread ? 0 : 255;
		} else if (mode === 'dither' || mode === 'scatter') {
			// scatter is the same error diffusion with the decision point
			// jittered. the error still gets carried forward, so the tone
			// stays honest — what breaks up is the regular weave that
			// floyd–steinberg leaves in flat areas.
			const jitter = mode === 'scatter' ? spread : 0;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const p = y * w + x;
					const old = g[p];
					const cut = jitter ? 128 + (rnd() - 0.5) * jitter : 128;
					const nv = old < cut ? 0 : 255;
					g[p] = nv;
					const err = old - nv;
					if (x + 1 < w) g[p + 1] += err * 7 / 16;
					if (y + 1 < h) {
						if (x > 0) g[p + w - 1] += err * 3 / 16;
						g[p + w] += err * 5 / 16;
						if (x + 1 < w) g[p + w + 1] += err * 1 / 16;
					}
				}
			}
		}

		const out = canvas(w, h);
		const outData = out.getContext('2d').createImageData(w, h);
		const o = outData.data;
		for (let p = 0, i = 0; p < g.length; p++, i += 4) {
			const v = g[p] < 0 ? 0 : g[p] > 255 ? 255 : g[p];
			o[i] = o[i + 1] = o[i + 2] = v;
			o[i + 3] = 255;
		}
		out.getContext('2d').putImageData(outData, 0, 0);
		return out;
	}

	// ---------- the word ----------
	// a word laid across the whole wall, in wall millimetres, and cut out of
	// the picture rather than drawn over it.
	//
	// the point is that the word is not ink. where a letter falls the head
	// simply does not fire, so the letters come back as the bare dark brick
	// the wall started as, standing inside the bleached picture — a negative
	// of it, holding its shape. that is why this is applied to the burn
	// raster and not to the preview: the machine has to know about it, or the
	// letters are only a picture of themselves.
	const WORD_FACE = 'Georgia, "Times New Roman", Times, serif';

	// the word measured against the wall once: how tall it has to be set for
	// its line to span the share of the wall asked for, and where its centre
	// falls. all in mm, so a tile can draw it without knowing the scale.
	function wordGeom(word, wall) {
		const text = String((word && word.text) || '').trim();
		if (!text || !wall || !wall.w) return null;
		const show = word.caps === false ? text : text.toUpperCase();
		const face = word.font || WORD_FACE;
		const m = canvas(8, 8).getContext('2d');
		m.font = `700 100px ${face}`;
		const at100 = m.measureText(show).width;
		if (!(at100 > 0)) return null;
		const size = wall.w * ((word.size == null ? 70 : word.size) / 100) / (at100 / 100);
		return {
			text: show, face, size,
			cx: wall.w * ((word.x == null ? 50 : word.x) / 100),
			cy: wall.h * ((word.y == null ? 50 : word.y) / 100),
		};
	}

	// stamp it into one tile's burn raster. the raster covers the tile plus
	// its bleed, so the wall origin of the pixel grid is the tile corner
	// pulled back by the bleed on both sides.
	//
	// lighten can only raise a pixel and darken can only lower one, so a
	// letter edge that is half covered comes out at half strength and the
	// rest of the picture is untouched — no need to read the raster back.
	function stampWord(burn, tile, wall, word) {
		const g = wordGeom(word, wall);
		if (!g || !(g.size > 0)) return burn;
		const x = burn.getContext('2d');
		const sx = burn.width / tile.out.w, sy = burn.height / tile.out.h;
		x.save();
		x.setTransform(sx, 0, 0, sy,
			-(tile.x - tile.out.bleed) * sx, -(tile.y - tile.out.bleed) * sy);
		x.font = `700 ${g.size}px ${g.face}`;
		x.textAlign = 'center';
		x.textBaseline = 'middle';
		// cut out: lift the letters to 255, which is the head staying off.
		// burnt: drop them to 0, and the letters are the only thing that fires.
		const cut = (word.mode || 'mask') !== 'burn';
		x.globalCompositeOperation = cut ? 'lighten' : 'darken';
		x.fillStyle = cut ? '#fff' : '#000';
		x.fillText(g.text, g.cx, g.cy);
		x.restore();
		return burn;
	}

	// ---------- the simulation ----------
	// fired clay, so the preview reads as brick and not as a photograph.
	//
	// the bricks we are actually cutting are dark: a burnt, flashed red with
	// near-black patches where the kiln caught them. a flat terracotta swatch
	// lies about how the engraving will read, so the body is built from a
	// base tone, a few soft flashing blotches, and pitting.
	const BODIES = {
		sooty: { label: 'sooty red — flashed, what we have', base: [94, 51, 33], blot: [26, 15, 11], lift: [150, 90, 60], blots: 10, streaks: 15, grain: 32, char: 0.78 },
		clinker: { label: 'clinker — near black', base: [56, 34, 26], blot: [14, 9, 7], lift: [104, 63, 42], blots: 12, streaks: 16, grain: 30, char: 0.82 },
		red: { label: 'red clay — clean and pale', base: [162, 96, 68], blot: [104, 62, 42], lift: [220, 180, 150], blots: 3, streaks: 4, grain: 90, char: 0.6 },
	};

	// the one rule this stock imposes: the laser cannot darken a brick.
	// whatever colour the body is, that is the darkest the face will ever
	// be — the black point — and firing the head only ever bleaches it
	// upward. so the burn is not mixed with the body and never composited
	// in a way that could come out below it: the body is laid down, and the
	// scar is added on top of it.
	//
	// SCAR is white, and it is laid over the body rather than put in place
	// of it. that distinction is the whole of it: an opaque cream mark is a
	// colour the brick does not have, and it reads as a sticker. a white
	// held well short of opaque is a veil — every mark on the wall is the
	// body's own colour with the light let into it, so the clay tints the
	// picture throughout and a fully fired area is still recognisably this
	// brick and not another one.
	//
	// white also keeps the invariant free: it is brighter than every tone
	// any body can produce, and blending toward a colour lighter in all
	// three channels can only raise a pixel, never drop it.
	const SCAR = [255, 251, 244];
	const SCAR_ALPHA = 0.72;

	// the body's own colour, for anything outside this file that has to
	// match it — the yard prints its brick sides in this
	const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
	const bodyColour = tone => hex((BODIES[tone] || BODIES.sooty).base);

	// and the tone a fully fired area comes to on that body. anything drawn
	// on one of these bricks — a table on a side, a name on a bed — is cut
	// by the same head as the picture, so it is this colour and never ink.
	const scarColour = tone => {
		const b = (BODIES[tone] || BODIES.sooty).base;
		return hex(SCAR.map((v, i) => SCAR_ALPHA * v + (1 - SCAR_ALPHA) * b[i]));
	};

	function clayTexture(w, h, seed, tone) {
		const c = canvas(w, h);
		const x = c.getContext('2d');
		const b = BODIES[tone] || BODIES.sooty;
		const dr = ((seed * 2654435761) % 18) - 9;
		x.fillStyle = `rgb(${b.base[0] + dr}, ${b.base[1] + dr}, ${b.base[2] + dr})`;
		x.fillRect(0, 0, c.width, c.height);

		// deterministic: the same tile should look the same twice
		let s = seed * 9301 + 49297;
		const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
		const rgba = (col, a) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;

		// flashing. the kiln does not colour a brick evenly — patches go
		// almost black, the odd area stays open and pale
		for (let i = 0; i < b.blots; i++) {
			const cx = rnd() * c.width, cy = rnd() * c.height;
			const r = (0.10 + rnd() * 0.34) * Math.max(c.width, c.height);
			const up = rnd() < 0.26;
			const col = up ? b.lift : b.blot;
			const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
			g.addColorStop(0, rgba(col, up ? 0.26 : b.char));
			g.addColorStop(0.55, rgba(col, up ? 0.13 : b.char * 0.48));
			g.addColorStop(1, rgba(col, 0));
			x.fillStyle = g;
			x.fillRect(0, 0, c.width, c.height);
		}

		// the drag marks the wire and the mould leave down the face
		for (let i = 0; i < b.streaks; i++) {
			const y = rnd() * c.height;
			const len = (0.2 + rnd() * 0.7) * c.width;
			x.fillStyle = rnd() < 0.7 ? rgba(b.blot, 0.16 + rnd() * 0.2) : 'rgba(226,196,168,0.10)';
			x.fillRect(rnd() * (c.width - len), y, len, 0.6 + rnd() * 1.6);
		}

		// pitting and grit
		for (let i = 0; i < c.width * c.height / b.grain; i++) {
			const r = rnd();
			x.fillStyle = r < 0.66 ? `rgba(24,13,9,${0.18 + r * 0.4})` : 'rgba(216,172,138,0.13)';
			x.fillRect(rnd() * c.width, rnd() * c.height, 1.3, 1.3);
		}
		return c;
	}

	// the scar as a transparent layer: warm ash where the laser fired,
	// nothing at all where it did not. keeping it in the alpha channel
	// rather than screening a white negative is what lets the body read
	// through the lettering the way it does on a real brick.
	function burnLayer(laserCanvas) {
		const w = laserCanvas.width, h = laserCanvas.height;
		const src = laserCanvas.getContext('2d').getImageData(0, 0, w, h).data;
		const c = canvas(w, h);
		const x = c.getContext('2d');
		const out = x.createImageData(w, h);
		const o = out.data;
		for (let i = 0; i < o.length; i += 4) {
			o[i] = SCAR[0]; o[i + 1] = SCAR[1]; o[i + 2] = SCAR[2];
			o[i + 3] = 255 - src[i];      // gray 0 fired hardest, 255 not at all
		}
		x.putImageData(out, 0, 0);
		return c;
	}

	// lay the burn onto the clay. which way the burn goes depends on the
	// material: soot darkens, cutting back into the body lightens.
	function claySimulate(laserCanvas, polarity, seed, tone) {
		const w = laserCanvas.width, h = laserCanvas.height;
		const c = clayTexture(w, h, seed || 1, tone);
		const x = c.getContext('2d');
		if (polarity === 'lighter') {
			// the scar goes on at the strength the head fired, and nothing
			// else touches the face. where it fired at half power the body
			// shows half through, where it did not fire at all the pixel is
			// the bare brick it started as — pitting, char and all.
			x.globalAlpha = SCAR_ALPHA;
			x.drawImage(burnLayer(laserCanvas), 0, 0);
		} else {
			// pale stock is the other way round: there the head chars
			x.globalCompositeOperation = 'multiply';
			x.drawImage(laserCanvas, 0, 0);
		}
		x.globalAlpha = 1;
		x.globalCompositeOperation = 'source-over';
		return c;
	}

	function toBlob(c, type) {
		return new Promise(resolve => c.toBlob(resolve, type || 'image/png'));
	}

	// a canvas the browser can hand back as an <img>-like source, capped so
	// a 6000px scan does not get processed at full size for every redraw
	function fitCanvas(img, maxPx) {
		const k = Math.min(1, maxPx / Math.max(img.width, img.height));
		const c = canvas(img.width * k, img.height * k);
		const x = c.getContext('2d');
		x.imageSmoothingQuality = 'high';
		x.drawImage(img, 0, 0, c.width, c.height);
		return c;
	}

	AE.Imaging = { canvas, crop, process, claySimulate, clayTexture, burnLayer, toBlob, fitCanvas, buildLUT, autoRange, noiseFn, wordGeom, stampWord, bodyColour, scarColour, BODIES, SCAR_ALPHA, WORD_FACE };
})();

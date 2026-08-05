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
	// or a contain fit, it will — and what falls outside stays paper white,
	// which the laser reads as "do not fire".
	function crop(img, src, w, h) {
		const c = canvas(w, h);
		const x = c.getContext('2d');
		x.fillStyle = '#fff';
		x.fillRect(0, 0, c.width, c.height);
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

	// one lookup table for brightness, contrast, gamma and inversion.
	// building it once and reading it per pixel keeps the inner loop cheap
	function buildLUT(laser) {
		const bright = (laser.brightness || 0) / 100 * 255;
		const k = (laser.contrast == null ? 100 : laser.contrast) / 100;
		const gamma = laser.gamma || 1;
		const lut = new Uint8ClampedArray(256);
		for (let i = 0; i < 256; i++) {
			let v = i + bright;
			v = (v - 128) * k + 128;
			v = Math.max(0, Math.min(255, v));
			v = Math.pow(v / 255, 1 / gamma) * 255;
			lut[i] = laser.invert ? 255 - v : v;
		}
		return lut;
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
		if (mode === 'threshold') {
			const t = laser.threshold == null ? 128 : laser.threshold;
			for (let p = 0; p < g.length; p++) g[p] = g[p] < t ? 0 : 255;
		} else if (mode === 'dither') {
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const p = y * w + x;
					const old = g[p];
					const nv = old < 128 ? 0 : 255;
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

	// ---------- the simulation ----------
	// fired clay, so the preview reads as brick and not as a photograph
	function clayTexture(w, h, seed) {
		const c = canvas(w, h);
		const x = c.getContext('2d');
		const dr = ((seed * 2654435761) % 16) - 8;
		x.fillStyle = `rgb(${162 + dr}, ${96 + dr}, ${68 + dr})`;
		x.fillRect(0, 0, c.width, c.height);
		// deterministic speckle: the same tile should look the same twice
		let s = seed * 9301 + 49297;
		const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
		for (let i = 0; i < c.width * c.height / 90; i++) {
			x.fillStyle = rnd() < 0.5 ? 'rgba(60,35,22,0.22)' : 'rgba(220,180,150,0.16)';
			x.fillRect(rnd() * c.width, rnd() * c.height, 1.4, 1.4);
		}
		return c;
	}

	// lay the burn onto the clay. which way the burn goes depends on the
	// material: soot darkens, cutting back into the body lightens.
	function claySimulate(laserCanvas, polarity, seed) {
		const w = laserCanvas.width, h = laserCanvas.height;
		const c = clayTexture(w, h, seed || 1);
		const x = c.getContext('2d');
		if (polarity === 'lighter') {
			// the burn removes the fired skin: dark ink becomes pale scar
			const inv = canvas(w, h);
			const ix = inv.getContext('2d');
			ix.filter = 'invert(1)';
			ix.drawImage(laserCanvas, 0, 0);
			ix.filter = 'none';
			x.globalAlpha = 0.85;
			x.globalCompositeOperation = 'screen';
			x.drawImage(inv, 0, 0);
		} else {
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

	AE.Imaging = { canvas, crop, process, claySimulate, clayTexture, toBlob, fitCanvas, buildLUT };
})();

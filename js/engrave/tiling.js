// where a picture meets a wall.
//
// everything here is in millimetres. the laser wants mm, the bricklayer
// wants mm, and the only place pixels appear is at the very end when a
// tile is rasterised at a chosen dpi.
(function () {
	const AE = (window.AE = window.AE || {});

	// a brick is a box; each face shows two of its three dimensions.
	// naming follows the trade: stretcher is the long side, header the
	// short end, bed the top and bottom.
	const FACES = {
		stretcher: { label: 'stretcher — long side', w: 'length', h: 'height' },
		header: { label: 'header — short end', w: 'width', h: 'height' },
		bed: { label: 'bed — top / bottom', w: 'length', h: 'width' }
	};

	// common german formats. bremen brick is NF unless it is old, in which
	// case it is whatever it is and you measure it yourself.
	const PRESETS = {
		nf: { label: 'NF — 240 × 115 × 71', length: 240, width: 115, height: 71 },
		df: { label: 'DF — 240 × 115 × 52', length: 240, width: 115, height: 52 },
		'2df': { label: '2DF — 240 × 115 × 113', length: 240, width: 115, height: 113 },
		rf: { label: 'RF — 240 × 115 × 61', length: 240, width: 115, height: 61 },
		klinker: { label: 'klinker — 220 × 105 × 52', length: 220, width: 105, height: 52 },
		custom: { label: 'custom', length: 240, width: 115, height: 71 }
	};

	const MM_PER_INCH = 25.4;
	const mmToPx = (mm, dpi) => Math.max(1, Math.round(mm / MM_PER_INCH * dpi));

	// the face of one brick, in mm
	function faceSize(brick, face) {
		const f = FACES[face] || FACES.stretcher;
		return { w: brick[f.w], h: brick[f.h] };
	}

	// R03C07 — row first, because a wall is read by course
	function tileId(row, col) {
		return 'R' + String(row + 1).padStart(2, '0') + 'C' + String(col + 1).padStart(2, '0');
	}

	// rows are numbered from the bottom by default: course 1 is the course
	// you lay first. flip it if you would rather read the picture top-down.
	function tileLabel(row, col, rows, originRow) {
		const r = originRow === 'top' ? rows - row : row + 1;
		return 'R' + String(r).padStart(2, '0') + 'C' + String(col + 1).padStart(2, '0');
	}

	// the whole wall, mortar included
	function wallSize(p) {
		const f = faceSize(p.brick, p.face);
		return {
			w: p.grid.cols * f.w + (p.grid.cols - 1) * p.gap.x,
			h: p.grid.rows * f.h + (p.grid.rows - 1) * p.gap.y,
			face: f
		};
	}

	// how many courses make the wall carry the picture undistorted, given
	// the number of bricks across. used by the "fit to image" button.
	function rowsForAspect(p, imageAspect) {
		const f = faceSize(p.brick, p.face);
		const wallW = p.grid.cols * f.w + (p.grid.cols - 1) * p.gap.x;
		const wantH = wallW / imageAspect;
		return Math.max(1, Math.round((wantH + p.gap.y) / (f.h + p.gap.y)));
	}

	// which rectangle of the source image the wall covers.
	// cover crops the overflow, contain leaves bands, stretch distorts.
	// offset slides the crop, -1..1, when cover has spare image to spend.
	function sourceWindow(p, img) {
		const wall = wallSize(p);
		const wallAspect = wall.w / wall.h;
		const imgAspect = img.width / img.height;
		let sw = img.width, sh = img.height;

		if (p.grid.fit === 'cover') {
			if (imgAspect > wallAspect) sw = img.height * wallAspect;
			else sh = img.width / wallAspect;
		} else if (p.grid.fit === 'contain') {
			if (imgAspect > wallAspect) sh = img.width / wallAspect;
			else sw = img.height * wallAspect;
		}
		// stretch: the full image, wall aspect ignored

		const slackX = img.width - sw, slackY = img.height - sh;
		return {
			x: slackX / 2 + (p.grid.offsetX || 0) * slackX / 2,
			y: slackY / 2 + (p.grid.offsetY || 0) * slackY / 2,
			w: sw, h: sh,
			// how far off square the result is; 1.00 means the picture is honest
			stretch: (wall.w / wall.h) / (sw / sh)
		};
	}

	// every tile, with its place on the wall in mm and its window into the
	// source in pixels. bleed widens the crop past the brick edge so a
	// misplaced blank still has something engraved on it.
	function tiles(p, img) {
		const wall = wallSize(p);
		const win = sourceWindow(p, img);
		const f = wall.face;
		const bleed = p.laser.bleed || 0;
		const out = [];

		for (let row = 0; row < p.grid.rows; row++) {
			for (let col = 0; col < p.grid.cols; col++) {
				// wall coordinates run from the top-left corner for drawing;
				// row 0 is the bottom course, so it sits lowest on the wall
				const xMM = col * (f.w + p.gap.x);
				const yMM = (p.grid.rows - 1 - row) * (f.h + p.gap.y);

				const bx = xMM - bleed, by = yMM - bleed;
				const bw = f.w + bleed * 2, bh = f.h + bleed * 2;

				out.push({
					row, col,
					id: tileId(row, col),
					label: tileLabel(row, col, p.grid.rows, p.grid.originRow),
					// position on the wall, mm, origin top-left
					x: xMM, y: yMM, w: f.w, h: f.h,
					// the crop, in source pixels, bleed included
					src: {
						x: win.x + (bx / wall.w) * win.w,
						y: win.y + (by / wall.h) * win.h,
						w: (bw / wall.w) * win.w,
						h: (bh / wall.h) * win.h
					},
					out: { w: bw, h: bh, bleed }
				});
			}
		}
		return { wall, win, list: out };
	}

	AE.Tiling = { FACES, PRESETS, MM_PER_INCH, mmToPx, faceSize, wallSize, rowsForAspect, sourceWindow, tiles, tileId, tileLabel };
})();

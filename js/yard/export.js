// what leaves the yard: one folder per run, one file per position.
//
// every file is the same size, because every brick is. what makes
// A-03-07.gc that position's is the fragment of picture on it — so the
// file is cut first and the brick becomes A-03-07 when it comes off the
// machine and the code goes on it. lose track of which is which and there
// is nothing in the object to recover it from.
(function () {
	const AE = (window.AE = window.AE || {});
	const { Pack, Imaging, Plan } = AE;

	const gcExt = () => (AE.Gcode && AE.Gcode.EXT) || 'gc';
	const MM_PER_INCH = 25.4;
	const mmToPx = (mm, dpi) => Math.max(1, Math.round(mm / MM_PER_INCH * dpi));

	const n = v => Number(v).toFixed(3).replace(/\.?0+$/, '');
	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const secs = s => {
		const t = Math.round(s);
		return `${Math.floor(t / 3600)}h ${String(Math.floor(t / 60) % 60).padStart(2, '0')}m`;
	};

	function base64(bytes) {
		let s = '';
		const CHUNK = 0x8000;
		for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
		return btoa(s);
	}

	// ---------- the code, burnt in ----------
	// optional, and off by default: a paint pen washes off, an engraved
	// code does not. it goes in a corner of the face, inside the bleed, at
	// full power — it is a label, not a tone.
	function stampCode(canvas, code, mark, out, dpi) {
		if (!mark || !mark.burn || !code) return canvas;
		const ctx = canvas.getContext('2d');
		const pad = mmToPx((mark.size || 6) * 0.35 + (out.bleed || 0), dpi);
		const px = mmToPx(mark.size || 6, dpi);
		ctx.font = `600 ${px}px ui-monospace, Menlo, monospace`;
		ctx.textBaseline = 'alphabetic';
		ctx.fillStyle = '#000';
		const w = ctx.measureText(code).width;
		const top = mark.corner === 'tl' || mark.corner === 'tr';
		const left = mark.corner === 'tl' || mark.corner === 'bl';
		const x = left ? pad : canvas.width - pad - w;
		const y = top ? pad + px : canvas.height - pad;
		// clear a bed for it, so the code reads whatever tone it lands on
		ctx.fillStyle = '#fff';
		ctx.fillRect(x - px * 0.2, y - px * 1.1, w + px * 0.4, px * 1.35);
		ctx.fillStyle = '#000';
		ctx.fillText(code, x, y);
		return canvas;
	}

	// ---------- one brick ----------
	function brickSvg(pl, pngBytes, plan) {
		const { w, h, bleed } = pl.out;
		const href = 'data:image/png;base64,' + base64(pngBytes);
		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${n(w)}mm" height="${n(h)}mm" viewBox="0 0 ${n(w)} ${n(h)}">
  <title>${esc(plan.name)} — ${esc(pl.id)}</title>
  <desc>bed face ${n(pl.w)} × ${n(pl.h)} mm${pl.rot ? ', laid across the course' : ''}${bleed ? `, ${n(bleed)} mm bleed` : ''} — pallet ${esc(pl.pallet)} course ${pl.row} position ${pl.pos}</desc>
  <g id="engrave">
    <image x="0" y="0" width="${n(w)}" height="${n(h)}"
           preserveAspectRatio="none" image-rendering="optimizeQuality"
           xlink:href="${href}"/>
  </g>
  <g id="outline" fill="none" stroke="#ff0000" stroke-width="0.1">
    <rect x="${n(bleed)}" y="${n(bleed)}" width="${n(pl.w)}" height="${n(pl.h)}"/>
  </g>
</svg>
`;
	}

	// ---------- the build sheet ----------
	const STATUS_FILL = {
		pending: '#ffffff', queued: '#ffe6b8', engraved: '#cfe6cf',
		failed: '#f2c8c0', skipped: '#e4e2de'
	};

	function palletSvg(p, placed, plan, title, holes) {
		const boards = Pack.deckBoards(p).map(b =>
			`    <rect x="${n(b.x - p.x)}" y="${n(b.y - p.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="#d8cbb4" stroke="#b9a888" stroke-width="0.6"/>`
		).join('\n');
		const bricks = placed.map(pl => {
			const st = Plan.statusOf(plan, pl.id);
			const fs = Math.min(pl.h * 0.34, pl.w * 0.2, 18);
			return `    <g>
      <rect x="${n(pl.x - p.x)}" y="${n(pl.y - p.y)}" width="${n(pl.w)}" height="${n(pl.h)}" fill="${STATUS_FILL[st] || '#fff'}" stroke="#333" stroke-width="0.5"/>
      <text x="${n(pl.x - p.x + pl.w / 2)}" y="${n(pl.y - p.y + pl.h / 2 + fs * 0.35)}" font-family="monospace" font-size="${n(fs)}" text-anchor="middle" fill="#333">${esc(pl.id)}</text>
    </g>`;
		}).join('\n');
		const bare = (holes || []).map(pl => `    <rect x="${n(pl.x - p.x)}" y="${n(pl.y - p.y)}" width="${n(pl.w)}" height="${n(pl.h)}" fill="none" stroke="#999" stroke-width="0.4" stroke-dasharray="6 4"/>`).join('\n');

		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(p.w)}mm" height="${n(p.h)}mm" viewBox="0 0 ${n(p.w)} ${n(p.h)}">
  <title>${esc(title)}</title>
  <rect width="${n(p.w)}" height="${n(p.h)}" fill="#c9bda6"/>
  <g id="deck">
${boards}
  </g>
  <g id="bricks">
${bricks}
  </g>
  <g id="left-bare">
${bare}
  </g>
</svg>
`;
	}

	function fieldSvg(res, plan) {
		const g = res.geom;
		const parts = g.pallets.map(p => {
			const mine = res.placed.filter(pl => pl.palletIndex === p.index);
			const boards = Pack.deckBoards(p).map(b =>
				`      <rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="#d8cbb4" stroke="#b9a888" stroke-width="0.6"/>`
			).join('\n');
			const bricks = mine.map(pl => {
				const st = Plan.statusOf(plan, pl.id);
				const fs = Math.min(pl.h * 0.34, pl.w * 0.2, 18);
				return `      <g>
        <rect x="${n(pl.x)}" y="${n(pl.y)}" width="${n(pl.w)}" height="${n(pl.h)}" fill="${STATUS_FILL[st] || '#fff'}" stroke="#333" stroke-width="0.5"/>
        <text x="${n(pl.x + pl.w / 2)}" y="${n(pl.y + pl.h / 2 + fs * 0.35)}" font-family="monospace" font-size="${n(fs)}" text-anchor="middle" fill="#333">${esc(pl.id)}</text>
      </g>`;
			}).join('\n') + '\n' + res.holes.filter(pl => pl.palletIndex === p.index).map(pl =>
				`      <rect x="${n(pl.x)}" y="${n(pl.y)}" width="${n(pl.w)}" height="${n(pl.h)}" fill="none" stroke="#999" stroke-width="0.4" stroke-dasharray="6 4"/>`).join('\n');
			return `    <g id="pallet-${esc(p.key)}">
      <rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="#c9bda6" stroke="#8c8271" stroke-width="1"/>
${boards}
${bricks}
      <text x="${n(p.x + 14)}" y="${n(p.y + 34)}" font-family="monospace" font-size="26" fill="#6b6152">${esc(p.key)}</text>
    </g>`;
		}).join('\n');

		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(g.w)}mm" height="${n(g.h)}mm" viewBox="0 0 ${n(g.w)} ${n(g.h)}">
  <title>${esc(plan.name)} — the field, ${res.placed.length} bricks</title>
  <rect width="${n(g.w)}" height="${n(g.h)}" fill="#efe9df"/>
  <g id="field">
${parts}
  </g>
</svg>
`;
	}

	// ---------- the record ----------
	const cell = v => {
		const s = String(v == null ? '' : v);
		return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
	};

	const MANIFEST_COLS = ['id', 'pallet', 'course', 'pos', 'x_mm', 'y_mm', 'image',
		'status', 'engraved_at', 'operator', 'passes', 'notes',
		'px_w', 'px_h', 'gc_lines', 'gc_moves', 'gc_seconds', 'gc_ink', 'png', 'svg', 'gcode'];

	function manifestCsv(rows) {
		return [MANIFEST_COLS.join(','), ...rows.map(r => MANIFEST_COLS.map(k => cell(r[k])).join(','))].join('\n') + '\n';
	}

	function readme(res, plan, rows, cov) {
		const l = plan.laser, g = plan.gcode, pal = plan.pallets, b = plan.brick;
		const cut = rows.reduce((a, r) => a + (Number(r.gc_seconds) || 0), 0);
		const blank = rows.filter(r => r.gc_ink === 'blank').length;
		const face = res.grid.face;
		const perPallet = res.geom.pallets
			.map(p => `${p.key}: ${res.placed.filter(pl => pl.palletIndex === p.index).length}`).join('   ');

		return `${plan.name}
${'='.repeat(plan.name.length)}

exported ${new Date().toLocaleString()}

the brick
  size          ${n(b.length)} × ${n(b.width)} × ${n(b.height)} mm, every one the same
  face engraved bed — the top — ${n(face.w)} × ${n(face.h)} mm as laid${res.grid.face.rot ? ', turned across the course' : ''}

the field
  pallets       ${pal.count} × ${n(pal.w)} × ${n(pal.h)} mm, ${pal.arrange === 'column' ? 'end to end' : 'side by side'}${pal.gap ? `, ${n(pal.gap)} mm apart` : ', touching'}
  field size    ${n(res.geom.w)} × ${n(res.geom.h)} mm  (${(res.geom.w / 1000).toFixed(2)} × ${(res.geom.h / 1000).toFixed(2)} m)
  grid          ${res.grid.cols} across × ${res.grid.rows} courses = ${res.grid.perPallet} a pallet, ${res.grid.perPallet * pal.count} full
  edge margin   ${n(pal.margin)} mm of bare deck all round
  joints        ${n(plan.lay.gapX)} mm along the course, ${n(plan.lay.gapY)} mm between courses${plan.lay.align === 'justify' ? ' — minimum, the slack is spread into them' : ''}
  bricks laid   ${res.placed.length} of ${res.full} the grid holds${perPallet ? `   (${perPallet})` : ''}
  coverage      ${(cov.fraction * 100).toFixed(1)}% of the deck area, ${(cov.max * 100).toFixed(0)}% being full
  left bare     ${res.holes.length}${res.holes.length ? ` — ${res.holes.slice(0, 12).map(h => h.id).join(' ')}${res.holes.length > 12 ? ' …' : ''}` : ''}

the picture
  ${plan.assign.mode === 'span'
				? `one image across all ${pal.count} pallets, cut by the gaps between them`
				: res.geom.pallets.map(p => {
					const s = plan.images[(plan.assign.map || [])[p.index]];
					return `pallet ${p.key}   ${s && s.name ? s.name : '— no image —'}`;
				}).join('\n  ')}
  fit           ${plan.images.map((s, i) => (s.name ? `${i + 1}:${s.fit}` : null)).filter(Boolean).join('  ') || '—'}

  the picture is sampled continuously across the field: what falls in a
  joint is simply lost. that is the point — but it means a brick laid in
  the wrong position shows the wrong fragment, and nothing on the brick
  itself will tell you. lay by the code.

laser
  resolution    ${l.dpi} dpi
  mode          ${l.mode}${l.mode === 'threshold' || l.mode === 'random' ? ` cutting at ${l.threshold}` : ''}${l.mode === 'random' || l.mode === 'scatter' ? `, grain ${l.noise}% from seed ${l.seed} — re-exporting with the same seed gives the same grain` : ''}
  levels        brightness ${l.brightness}, contrast ${l.contrast}%, gamma ${l.gamma}${l.invert ? ', inverted' : ''}
  bleed         ${n(l.bleed || 0)} mm past the brick edge
  code burnt    ${plan.mark.burn ? `yes — ${n(plan.mark.size)} mm, ${plan.mark.corner} corner of the face` : 'no — the code is the filename only'}

machine
  feed          ${g.feed} mm/min
  power         ${g.power}% of S${g.sMax}  (S${Math.round(g.sMax * g.power / 100)} where it burns)
  laser mode    ${g.laserMode === 'M4' ? 'M4 — dynamic, power tracks velocity' : 'M3 — constant power'}
  scanning      ${g.bidirectional ? 'bi-directional' : 'one way'}${g.overscan > 0 ? `, ${n(g.overscan)} mm overscan` : ', no overscan'}
  passes        ${g.passes}
  origin        X${n(g.originX)} Y${n(g.originY)} — the bottom-left of the engraved area,
                bleed included. the jig corner, not the brick corner.
  cutting time  ~${secs(cut)} for ${rows.length} bricks, ignoring acceleration${blank ? `\n  blank faces   ${blank} carry no ink and burn nothing` : ''}

files
  png/          the bitmap for each brick, named by its code
  svg/          the same bitmap at true mm size with a red outline on the
                brick edge. import this and do not resize it.
  gcode/        one .${gcExt()} per brick, absolute coordinates, ready to send
  layout.svg    the whole field at true size, every position named
  pallet-*.svg  the same, one pallet per sheet
  manifest.csv  one row per position

the names
  ${esc(rows[0] ? rows[0].id : 'A-01-01')} is pallet ${esc(rows[0] ? rows[0].pallet : 'A')}, course ${rows[0] ? rows[0].course : 1}, ${rows[0] ? rows[0].pos : 1} along that course.
  courses run from the top of layout.svg down, positions left to right.
  turn the sheet the way the pallets face before you start.

the blanks are interchangeable and the files are not
  every brick is ${n(face.w)} × ${n(face.h)} mm, so any file will fit any brick. what
  makes one of them ${esc(rows[0] ? rows[0].id : 'A-01-01')} is the fragment of picture burnt into it
  and the code written on it afterwards — take a blank, cut the file,
  write the name on it before it leaves the machine. an unmarked engraved
  brick cannot be identified by looking at it, and there is no list
  anywhere that can recover which one it was.

before you send a .${gcExt()}
  the file is in absolute machine coordinates from X${n(g.originX)} Y${n(g.originY)}. it does not
  home and it does not set an origin. home first, or set the work zero on
  the jig corner, every time. frame the bounds stated in the header before
  the first one.
`;
	}

	// ---------- the package ----------
	async function buildZip(plan, images, opts = {}) {
		const onProgress = opts.onProgress || (() => { });
		const res = Plan.build(plan, images);
		const cov = Pack.coverage(res);

		const wanted = opts.only && opts.only.length
			? res.placed.filter(p => opts.only.includes(p.id))
			: res.placed;

		const zip = new AE.Zip();
		const rows = [];
		const dpi = plan.laser.dpi;
		const safe = plan.name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'field';

		for (let i = 0; i < wanted.length; i++) {
			const pl = wanted[i];
			onProgress(i, wanted.length, pl.id);

			const pxW = mmToPx(pl.out.w, dpi), pxH = mmToPx(pl.out.h, dpi);
			let burned;
			if (pl.src && images[pl.image]) {
				const cropped = Imaging.crop(images[pl.image], pl.src, pxW, pxH);
				burned = Imaging.process(cropped, plan.laser);
			} else {
				// no image on this pallet: a blank face, which still gets a
				// file so the batch is complete and the machine does nothing
				burned = Imaging.canvas(pxW, pxH);
				const c = burned.getContext('2d');
				c.fillStyle = '#fff';
				c.fillRect(0, 0, pxW, pxH);
			}
			stampCode(burned, pl.id, plan.mark, pl.out, dpi);

			const blob = await Imaging.toBlob(burned, 'image/png');
			const bytes = new Uint8Array(await blob.arrayBuffer());

			zip.add(`${safe}/png/${pl.id}.png`, bytes);
			if (opts.svg !== false) zip.add(`${safe}/svg/${pl.id}.svg`, brickSvg(pl, bytes, plan));

			let gc = null;
			if (opts.gcode !== false && AE.Gcode) {
				gc = AE.Gcode.tile(burned, {
					w: pl.out.w, h: pl.out.h,
					meta: {
						title: `${plan.name} — ${pl.id}`,
						subtitle: `bed face ${n(pl.w)} × ${n(pl.h)} mm` +
							(pl.out.bleed ? ` incl. ${n(pl.out.bleed)} mm bleed` : '') +
							`, pallet ${pl.pallet} course ${pl.row} pos ${pl.pos}, ${dpi} dpi ${plan.laser.mode}`
					}
				}, plan);
				zip.add(`${safe}/gcode/${pl.id}.${gcExt()}`, gc.text);
			}

			const r = plan.record[pl.id] || {};
			rows.push({
				id: pl.id, pallet: pl.pallet, course: pl.row, pos: pl.pos,
				x_mm: n(pl.x), y_mm: n(pl.y),
				image: pl.image == null ? '' : pl.image + 1,
				status: r.status || 'pending', engraved_at: r.date || '',
				operator: r.operator || '', passes: r.passes || '', notes: r.notes || '',
				px_w: pxW, px_h: pxH,
				gc_lines: gc ? gc.stats.lines : '', gc_moves: gc ? gc.stats.moves : '',
				gc_seconds: gc ? Math.round(gc.stats.seconds) : '',
				gc_ink: gc ? (gc.stats.ink ? 'yes' : 'blank') : '',
				png: `png/${pl.id}.png`, svg: `svg/${pl.id}.svg`,
				gcode: gc ? `gcode/${pl.id}.${gcExt()}` : ''
			});

			await new Promise(r => setTimeout(r, 0));   // let the browser breathe
		}

		onProgress(wanted.length, wanted.length, 'packing');

		zip.add(`${safe}/layout.svg`, fieldSvg(res, plan));
		for (const p of res.geom.pallets) {
			const mine = res.placed.filter(pl => pl.palletIndex === p.index);
			const bare = res.holes.filter(pl => pl.palletIndex === p.index);
			zip.add(`${safe}/pallet-${p.key}.svg`,
				palletSvg(p, mine, plan, `${plan.name} — pallet ${p.key}, ${mine.length} bricks`, bare));
		}
		zip.add(`${safe}/manifest.csv`, manifestCsv(rows));
		zip.add(`${safe}/manifest.json`, JSON.stringify({
			name: plan.name, exported: new Date().toISOString(),
			brick: plan.brick, pallets: plan.pallets, lay: plan.lay, assign: plan.assign,
			laser: plan.laser, gcode: plan.gcode, mark: plan.mark,
			field: {
				w: res.geom.w, h: res.geom.h, coverage: cov.fraction,
				cols: res.grid.cols, rows: res.grid.rows,
				perPallet: res.grid.perPallet, full: res.full, laid: res.placed.length
			},
			images: plan.images.map(s => ({ name: s.name, fit: s.fit, offsetX: s.offsetX, offsetY: s.offsetY, zoom: s.zoom })),
			leftBare: res.holes.map(h => h.id),
			positions: rows
		}, null, 2));
		zip.add(`${safe}/README.txt`, readme(res, plan, rows, cov));
		if (opts.simulation) await zip.addBlob(`${safe}/simulation.png`, opts.simulation);

		return { blob: zip.blob(), filename: `${safe}-${new Date().toISOString().slice(0, 10)}.zip`, rows, res };
	}

	AE.YardExport = {
		buildZip, brickSvg, fieldSvg, palletSvg, manifestCsv, MANIFEST_COLS,
		stampCode, mmToPx, base64
	};
})();

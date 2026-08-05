// what leaves the desk: a zip you can drop straight into lightburn.
//
// each brick gets two files. the png is the bitmap the head traces; the
// svg is the same bitmap placed at true size in mm with a cut-line rect
// around the brick face, so the job arrives already scaled and squared.
(function () {
	const AE = (window.AE = window.AE || {});
	const { Tiling, Imaging } = AE;

	// gcode.js is optional — the zip still builds without it
	const gcExt = () => (AE.Gcode && AE.Gcode.EXT) || 'gc';

	const secs = s => {
		const t = Math.round(s);
		return `${Math.floor(t / 3600)}h ${String(Math.floor(t / 60) % 60).padStart(2, '0')}m`;
	};

	function base64(bytes) {
		let s = '';
		const CHUNK = 0x8000;   // btoa via apply blows the stack on big arrays
		for (let i = 0; i < bytes.length; i += CHUNK) {
			s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
		}
		return btoa(s);
	}

	const esc = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

	const n = v => Number(v).toFixed(3).replace(/\.?0+$/, '');

	// one brick face, true size, image on the engrave layer and the brick
	// outline on a red hairline layer that most cutters read as "cut" and
	// every editor reads as "this is where the edge is"
	function tileSvg(tile, pngBytes, project) {
		const { w, h, bleed } = tile.out;
		const href = 'data:image/png;base64,' + base64(pngBytes);
		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${n(w)}mm" height="${n(h)}mm" viewBox="0 0 ${n(w)} ${n(h)}">
  <title>${esc(project.name)} — ${esc(tile.label)}</title>
  <desc>${esc(Tiling.FACES[project.face].label)}, ${n(tile.w)} × ${n(tile.h)} mm face${bleed ? `, ${n(bleed)} mm bleed` : ''}</desc>
  <g id="engrave">
    <image x="0" y="0" width="${n(w)}" height="${n(h)}"
           preserveAspectRatio="none" image-rendering="optimizeQuality"
           xlink:href="${href}"/>
  </g>
  <g id="outline" fill="none" stroke="#ff0000" stroke-width="0.1">
    <rect x="${n(bleed)}" y="${n(bleed)}" width="${n(tile.w)}" height="${n(tile.h)}"/>
  </g>
</svg>
`;
	}

	const STATUS_FILL = {
		pending: '#ffffff', queued: '#ffe6b8', engraved: '#cfe6cf',
		failed: '#f2c8c0', skipped: '#e4e2de'
	};

	// a build sheet: the whole wall at true size, every brick labelled and
	// coloured by where it stands. print it, tape it up, tick it off.
	function layoutSvg(plan, project) {
		const { wall, list } = plan;
		const parts = list.map(t => {
			const st = (project.tiles[t.id] || {}).status || 'pending';
			return `    <g>
      <rect x="${n(t.x)}" y="${n(t.y)}" width="${n(t.w)}" height="${n(t.h)}" fill="${STATUS_FILL[st] || '#fff'}" stroke="#333" stroke-width="0.4"/>
      <text x="${n(t.x + t.w / 2)}" y="${n(t.y + t.h / 2 + t.h * 0.09)}" font-family="monospace" font-size="${n(Math.min(t.h * 0.3, t.w * 0.16))}" text-anchor="middle" fill="#333">${esc(t.label)}</text>
    </g>`;
		}).join('\n');

		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(wall.w)}mm" height="${n(wall.h)}mm" viewBox="0 0 ${n(wall.w)} ${n(wall.h)}">
  <title>${esc(project.name)} — layout, ${project.grid.cols} × ${project.grid.rows}</title>
  <rect width="${n(wall.w)}" height="${n(wall.h)}" fill="#b9b3ab"/>
  <g id="bricks">
${parts}
  </g>
</svg>
`;
	}

	const csvCell = v => {
		const s = String(v == null ? '' : v);
		return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
	};

	function manifestCsv(plan, project, rows) {
		const head = ['label', 'id', 'row', 'col', 'status', 'engraved_at', 'operator', 'passes', 'notes',
			'face', 'face_w_mm', 'face_h_mm', 'out_w_mm', 'out_h_mm', 'px_w', 'px_h', 'dpi',
			'gc_lines', 'gc_moves', 'gc_seconds', 'gc_ink', 'png', 'svg', 'gcode'];
		const body = rows.map(r => head.map(k => csvCell(r[k])).join(','));
		return [head.join(','), ...body].join('\n') + '\n';
	}

	function readme(plan, project, rows) {
		const f = plan.wall.face;
		const b = project.brick, l = project.laser, g = project.gcode || {};
		const done = rows.filter(r => r.status === 'engraved').length;
		const cut = rows.reduce((a, r) => a + (Number(r.gc_seconds) || 0), 0);
		const blank = rows.filter(r => r.gc_ink === 'blank').length;
		return `${project.name}
${'='.repeat(project.name.length)}

exported ${new Date().toLocaleString()}

wall
  grid          ${project.grid.cols} across × ${project.grid.rows} courses = ${plan.list.length} bricks
  wall size     ${n(plan.wall.w)} × ${n(plan.wall.h)} mm  (${(plan.wall.w / 1000).toFixed(2)} × ${(plan.wall.h / 1000).toFixed(2)} m)
  mortar joint  ${n(project.gap.x)} mm vertical / ${n(project.gap.y)} mm horizontal
  fit           ${project.grid.fit}${plan.win.stretch ? `, distortion ${plan.win.stretch.toFixed(3)}×` : ''}
  courses run   ${project.grid.originRow === 'top' ? 'R01 at the top' : 'R01 at the bottom (laid first)'}

brick
  format        ${b.length} × ${b.width} × ${b.height} mm
  face engraved ${Tiling.FACES[project.face].label} — ${n(f.w)} × ${n(f.h)} mm

laser
  resolution    ${l.dpi} dpi
  mode          ${l.mode}${l.mode === 'threshold' ? ` at ${l.threshold}` : ''}
  levels        brightness ${l.brightness}, contrast ${l.contrast}%, gamma ${l.gamma}${l.invert ? ', inverted' : ''}
  bleed         ${n(l.bleed || 0)} mm past the face edge
  tile raster   ${rows[0] ? rows[0].px_w + ' × ' + rows[0].px_h + ' px' : '—'}

machine
  feed          ${g.feed} mm/min
  power         ${g.power}% of S${g.sMax}  (S${Math.round(g.sMax * g.power / 100)} where it burns)
  laser mode    ${g.laserMode === 'M4' ? 'M4 — dynamic, power tracks velocity' : 'M3 — constant power'}
  scanning      ${g.bidirectional ? 'bi-directional' : 'one way'}${g.overscan > 0 ? `, ${n(g.overscan)} mm overscan` : ', no overscan'}
  line spacing  ${(25.4 / l.dpi).toFixed(4)} mm — ${(l.dpi / 25.4).toFixed(2)} lines/mm
  passes        ${g.passes}
  origin        X${n(g.originX)} Y${n(g.originY)} — the bottom-left of the engraved
                area, bleed included. this is the jig corner, not the brick.
  air assist    ${g.airAssist ? 'M8 on, M9 off' : 'not commanded'}
  cutting time  ~${secs(cut)} for ${rows.length} bricks, ignoring acceleration${blank ? `\n  blank faces   ${blank} carry no ink and burn nothing` : ''}

files
  png/          the bitmap for each brick, one file per face
  svg/          the same bitmap placed at true mm size, with a red
                outline rect marking the brick edge. import this if you
                want the job to arrive already scaled — do not resize it.
  gcode/        the same bitmap as moves, one .${gcExt()} per brick, ready to send
                straight to the controller. no import, no scaling step,
                nothing to get wrong — but also nothing to look at first.
                run one.
  layout.svg    the whole wall at true size, labelled, coloured by status
  simulation.png  what the finished wall should look like
  manifest.csv  one row per brick, for the record

  ${done} of ${rows.length} bricks were marked engraved at export time.

alignment
  the bleed is engraved past the brick edge on purpose. line the brick up
  on the jig by its face, not by the artwork, and let the overshoot fall
  off the edge.

before you send a .${gcExt()}
  the file is in absolute machine coordinates from X${n(g.originX)} Y${n(g.originY)}. it does not
  home and it does not set an origin, so whatever your controller thinks
  X0 Y0 is at the moment you press start is what it will use. home first,
  or set the work zero on the jig corner, every time.

  frame the bounds in the header before the first one. every file states
  the rectangle it will touch; if that rectangle is outside your work
  area the machine will find the limit switch instead of the brick.
`;
	}

	// build the whole package. tiles are rasterised one at a time and the
	// loop yields between them, so the page stays alive on a 200-brick wall
	async function buildZip(project, img, opts = {}) {
		const onProgress = opts.onProgress || (() => { });
		const plan = Tiling.tiles(project, img);
		const wanted = opts.only && opts.only.length
			? plan.list.filter(t => opts.only.includes(t.id))
			: plan.list;

		const zip = new AE.Zip();
		const rows = [];
		const dpi = project.laser.dpi;
		const safe = project.name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'wall';

		for (let i = 0; i < wanted.length; i++) {
			const t = wanted[i];
			onProgress(i, wanted.length, t.label);

			const pxW = Tiling.mmToPx(t.out.w, dpi), pxH = Tiling.mmToPx(t.out.h, dpi);
			const cropped = Imaging.crop(img, t.src, pxW, pxH);
			const burned = Imaging.process(cropped, project.laser);
			const blob = await Imaging.toBlob(burned, 'image/png');
			const bytes = new Uint8Array(await blob.arrayBuffer());

			zip.add(`${safe}/png/${t.label}.png`, bytes);
			if (opts.svg !== false) zip.add(`${safe}/svg/${t.label}.svg`, tileSvg(t, bytes, project));

			// the same bitmap again, this time as moves. the png is what you
			// look at; this is what the head actually does.
			let gc = null;
			if (opts.gcode !== false && AE.Gcode) {
				gc = AE.Gcode.tile(burned, {
					w: t.out.w, h: t.out.h,
					meta: {
						title: `${project.name} — ${t.label}`,
						subtitle: `${Tiling.FACES[project.face].label}, ${n(t.out.w)} × ${n(t.out.h)} mm` +
							(t.out.bleed ? ` incl. ${n(t.out.bleed)} mm bleed` : '') +
							`, ${dpi} dpi ${project.laser.mode}`
					}
				}, project);
				zip.add(`${safe}/gcode/${t.label}.${gcExt()}`, gc.text);
			}

			const rec = project.tiles[t.id] || {};
			rows.push({
				label: t.label, id: t.id, row: t.row + 1, col: t.col + 1,
				status: rec.status || 'pending', engraved_at: rec.date || '',
				operator: rec.operator || '', passes: rec.passes || '', notes: rec.notes || '',
				face: project.face, face_w_mm: n(t.w), face_h_mm: n(t.h),
				out_w_mm: n(t.out.w), out_h_mm: n(t.out.h),
				px_w: pxW, px_h: pxH, dpi,
				gc_lines: gc ? gc.stats.lines : '', gc_moves: gc ? gc.stats.moves : '',
				gc_seconds: gc ? Math.round(gc.stats.seconds) : '',
				gc_ink: gc ? (gc.stats.ink ? 'yes' : 'blank') : '',
				png: `png/${t.label}.png`, svg: `svg/${t.label}.svg`,
				gcode: gc ? `gcode/${t.label}.${gcExt()}` : ''
			});

			await new Promise(r => setTimeout(r, 0));   // let the browser breathe
		}

		onProgress(wanted.length, wanted.length, 'packing');

		zip.add(`${safe}/layout.svg`, layoutSvg(plan, project));
		zip.add(`${safe}/manifest.csv`, manifestCsv(plan, project, rows));
		zip.add(`${safe}/manifest.json`, JSON.stringify({
			name: project.name, exported: new Date().toISOString(),
			brick: project.brick, face: project.face, gap: project.gap,
			grid: project.grid, laser: project.laser,
			wall: { w: plan.wall.w, h: plan.wall.h, stretch: plan.win.stretch },
			tiles: rows
		}, null, 2));
		zip.add(`${safe}/README.txt`, readme(plan, project, rows));

		if (opts.simulation) await zip.addBlob(`${safe}/simulation.png`, opts.simulation);

		return { blob: zip.blob(), filename: `${safe}-${new Date().toISOString().slice(0, 10)}.zip`, rows };
	}

	AE.Exporter = { buildZip, tileSvg, layoutSvg, manifestCsv, base64 };
})();

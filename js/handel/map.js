/* map.js — the places the goods came from, and the way back to Bremen.
   Natural Earth projection, hand-rolled pan/zoom (no d3-zoom vendored),
   circle area ∝ value, great-circle routes drawn through the projection. */

(function (global) {
	'use strict';

	const D = global.HandelData;
	const SVG_NS = 'http://www.w3.org/2000/svg';
	const el = (n, a) => {
		const e = document.createElementNS(SVG_NS, n);
		for (const k in (a || {})) e.setAttribute(k, a[k]);
		return e;
	};

	function HandelMap(svg, opts) {
		this.svg = svg;
		this.on = opts || {};
		this.k = 1;
		this.tx = 0;
		this.ty = 0;
		this.rows = [];
		this.showRoutes = true;
		this.showLabels = true;

		this.projection = d3.geoNaturalEarth1();
		this.path = d3.geoPath(this.projection);
		this.land = topojson.feature(global.WORLD110M, global.WORLD110M.objects.land);
		this.graticule = d3.geoGraticule10();

		this.gRoot = el('g');
		this.gBase = el('g');
		this.gRoutes = el('g');
		this.gNodes = el('g');
		this.gLabels = el('g');
		this.gRoot.append(this.gBase, this.gRoutes, this.gNodes, this.gLabels);
		svg.append(this.gRoot);

		this._bindPointer();
		window.addEventListener('resize', () => this.resize());
	}

	HandelMap.prototype.resize = function () {
		const r = this.svg.getBoundingClientRect();
		this.w = r.width || 900;
		this.h = r.height || 560;
		// fit the sphere, then leave a little air
		this.projection.fitExtent([[6, 6], [this.w - 6, this.h - 6]], { type: 'Sphere' });
		this.base = {
			scale: this.projection.scale(),
			translate: this.projection.translate().slice(),
		};
		this._applyTransform();
		this.drawBase();
		this.draw(this.rows);
	};

	HandelMap.prototype._applyTransform = function () {
		this.projection
			.scale(this.base.scale * this.k)
			.translate([
				this.base.translate[0] * this.k + this.tx,
				this.base.translate[1] * this.k + this.ty,
			]);
	};

	HandelMap.prototype.zoomBy = function (f, cx, cy) {
		const k2 = Math.max(1, Math.min(14, this.k * f));
		if (k2 === this.k) return;
		cx = cx == null ? this.w / 2 : cx;
		cy = cy == null ? this.h / 2 : cy;
		// keep the point under the cursor put
		const s = k2 / this.k;
		this.tx = cx - s * (cx - this.tx);
		this.ty = cy - s * (cy - this.ty);
		this.k = k2;
		this.redraw();
	};

	HandelMap.prototype.reset = function () {
		this.k = 1; this.tx = 0; this.ty = 0;
		this.redraw();
	};

	HandelMap.prototype.redraw = function () {
		this._applyTransform();
		this.drawBase();
		this.draw(this.rows);
	};

	HandelMap.prototype._bindPointer = function () {
		const svg = this.svg;
		let drag = null;
		svg.addEventListener('pointerdown', e => {
			drag = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: false };
			svg.setPointerCapture(e.pointerId);
			svg.classList.add('dragging');
		});
		svg.addEventListener('pointermove', e => {
			if (!drag) return;
			const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
			if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
			this.tx = drag.tx + dx;
			this.ty = drag.ty + dy;
			this.redraw();
		});
		const end = e => {
			if (!drag) return;
			svg.classList.remove('dragging');
			try { svg.releasePointerCapture(e.pointerId); } catch (_) { }
			drag = null;
		};
		svg.addEventListener('pointerup', end);
		svg.addEventListener('pointercancel', end);
		svg.addEventListener('wheel', e => {
			e.preventDefault();
			const r = svg.getBoundingClientRect();
			this.zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top);
		}, { passive: false });
	};

	HandelMap.prototype.drawBase = function () {
		const g = this.gBase;
		g.textContent = '';
		g.append(el('path', { class: 'sphere', d: this.path({ type: 'Sphere' }) || '' }));
		g.append(el('path', { class: 'graticule', d: this.path(this.graticule) || '' }));
		g.append(el('path', { class: 'land', d: this.path(this.land) || '' }));
	};

	// area-true radius, floored so the smallest places stay clickable
	HandelMap.prototype._radius = function (v, max) {
		if (!v || v <= 0) return 0;
		const rMax = 30;
		return Math.max(3.2, rMax * Math.sqrt(v / max));
	};

	HandelMap.prototype.draw = function (rows) {
		this.rows = rows || [];
		if (!this.w) return;
		const home = D.home;
		const hp = this.projection([home.lon, home.lat]);
		const max = this.rows.reduce((m, r) => Math.max(m, r.value || 0), 0) || 1;
		const maxLog = Math.log10(max + 1);

		this.gRoutes.textContent = '';
		this.gNodes.textContent = '';
		this.gLabels.textContent = '';
		if (!hp) return;

		const placed = [];
		for (const row of this.rows) {
			const p = D.places.get(row.place);
			if (!p || p.lat == null) continue;
			const xy = this.projection([p.lon, p.lat]);
			if (!xy) continue;
			placed.push({ row: row, p: p, xy: xy, r: this._radius(row.value, max) });
		}
		placed.sort((a, b) => b.r - a.r);

		if (this.showRoutes) {
			for (const n of placed) {
				// a place that stands on Bremen itself (the fleet's own outfitting)
				// has no way to draw
				if (n.p.id === 'bremen'
					|| (n.p.lat === home.lat && n.p.lon === home.lon)) continue;
				const line = { type: 'LineString', coordinates: [[home.lon, home.lat], [n.p.lon, n.p.lat]] };
				const d = this.path(line);
				if (!d) continue;
				const w = 0.4 + 2.2 * (Math.log10((n.row.value || 0) + 1) / maxLog);
				this.gRoutes.append(el('path', {
					class: 'route', d: d,
					'stroke-width': w.toFixed(2),
					'stroke-opacity': (0.16 + 0.34 * (n.r / 30)).toFixed(3),
				}));
			}
		}

		for (const n of placed) {
			const g = el('g', { class: 'node', tabindex: '0', role: 'button' });
			g.append(el('circle', { class: 'disc', cx: n.xy[0], cy: n.xy[1], r: n.r }));
			g.append(el('circle', { class: 'rim', cx: n.xy[0], cy: n.xy[1], r: n.r }));
			g.append(el('circle', { class: 'hit', cx: n.xy[0], cy: n.xy[1], r: Math.max(n.r, 11) }));
			const title = el('title');
			title.textContent = n.p.de + ' — ' + D.fmt(n.row.value)
				+ (this.unit ? ' ' + this.unit : '');
			g.append(title);

			const enter = e => this.on.hover && this.on.hover(n.row, n.p, e);
			g.addEventListener('pointerenter', enter);
			g.addEventListener('pointermove', enter);
			g.addEventListener('focus', enter);
			g.addEventListener('pointerleave', () => this.on.leave && this.on.leave());
			g.addEventListener('blur', () => this.on.leave && this.on.leave());
			const fire = () => this.on.select && this.on.select(n.row, n.p);
			g.addEventListener('click', fire);
			g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
			this.gNodes.append(g);
		}

		// Direct labels for the places that carry the story — biggest first,
		// and only where the box does not sit on one already set. Europe is a
		// thicket at world scale, so most of it stays unlabelled until zoomed.
		if (this.showLabels) {
			// Bremen's own label claims its box before anything else
			const taken = [{ x: hp[0] + 8, y: hp[1] - 18, w: 62, h: 16 }];
			const fits = box => !taken.some(t =>
				box.x < t.x + t.w && box.x + box.w > t.x && box.y < t.y + t.h && box.y + box.h > t.y);
			const budget = this.k > 2 ? 34 : 16;
			let set = 0;
			for (const n of placed) {
				if (set >= budget) break;
				const w = n.p.de.length * 5.1 + 6, hgt = 12;
				const sides = [
					{ x: n.xy[0] + n.r + 4, y: n.xy[1] - hgt / 2, anchor: 'start' },
					{ x: n.xy[0] - n.r - 4 - w, y: n.xy[1] - hgt / 2, anchor: 'end' },
					{ x: n.xy[0] - w / 2, y: n.xy[1] - n.r - hgt - 1, anchor: 'middle' },
					{ x: n.xy[0] - w / 2, y: n.xy[1] + n.r + 1, anchor: 'middle' },
				];
				const spot = sides.find(s => fits({ x: s.x, y: s.y, w: w, h: hgt })
					&& s.x > 2 && s.x + w < this.w - 2 && s.y > 2 && s.y + hgt < this.h - 2);
				if (!spot) continue;
				taken.push({ x: spot.x, y: spot.y, w: w, h: hgt });
				const t = el('text', {
					class: 'label', 'text-anchor': spot.anchor,
					x: spot.anchor === 'end' ? spot.x + w : spot.anchor === 'middle' ? spot.x + w / 2 : spot.x,
					y: spot.y + hgt - 3,
				});
				t.textContent = n.p.de;
				this.gLabels.append(t);
				set++;
			}
		}

		this._drawKey(max);

		const hg = el('g', { class: 'home' });
		hg.append(el('circle', { cx: hp[0], cy: hp[1], r: 4.5 }));
		this.gNodes.append(hg);
		const ht = el('text', { class: 'homelabel', x: hp[0] + 8, y: hp[1] - 6 });
		ht.textContent = 'Bremen';
		this.gLabels.append(ht);
	};

	// the scale of the discs, drawn as nested circles in the bottom corner
	HandelMap.prototype._drawKey = function (max) {
		const steps = [max, max / 4, max / 25].filter(v => v > 1);
		const g = el('g', { class: 'key' });
		const rMax = this._radius(steps[0], max);
		const bx = 24, by = this.h - 16;
		for (const v of steps) {
			const r = this._radius(v, max);
			g.append(el('circle', {
				cx: bx + rMax, cy: by - r, r: r,
				fill: 'none', stroke: 'currentColor', 'stroke-opacity': .55, 'stroke-width': 1,
			}));
			const t = el('text', {
				class: 'label', x: bx + rMax + rMax + 5, y: by - 2 * r + 4, 'text-anchor': 'start',
			});
			t.textContent = D.fmtShort(v);
			g.append(t);
		}
		const cap = el('text', { class: 'label', x: bx, y: by + 12 });
		cap.textContent = this.unit || "Werth in Ld'or";
		g.append(cap);
		this.gLabels.append(g);
	};

	global.HandelMap = HandelMap;
})(window);

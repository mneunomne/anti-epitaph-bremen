/* views.js — the printed tables, re-set for a screen.
   Same furniture as the volumes: leader dots, a dash where the page has a
   dash, figures flush right. Colour only ever repeats what a label says. */

(function (global) {
	'use strict';

	const D = global.HandelData;

	function h(tag, attrs, kids) {
		const e = document.createElement(tag);
		for (const k in (attrs || {})) {
			if (k === 'class') e.className = attrs[k];
			else if (k === 'text') e.textContent = attrs[k];
			else if (k === 'html') e.innerHTML = attrs[k];
			else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
			else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
		}
		for (const kid of (kids || [])) if (kid) e.append(kid);
		return e;
	}

	// a name, then dots to the edge of the cell — as the volumes set it
	function leader(name, onClick) {
		const nm = onClick
			? h('button', { class: 'place-btn nm', text: name, onclick: onClick })
			: h('span', { class: 'nm', text: name });
		return h('span', { class: 'leader' }, [nm, h('span', { class: 'dots' })]);
	}

	function num(v, cls) {
		const t = h('td', { class: 'num' + (v == null ? ' nil' : '') + (cls ? ' ' + cls : '') });
		t.textContent = D.fmt(v);
		return t;
	}

	// stacked bar: 2px gaps between segments, per the mark spec
	function stackBar(row, max, active) {
		const bar = h('div', { class: 'bar' });
		D.catKeys.forEach((k, i) => {
			const v = row[k];
			if (!v || (active && !active.has(k))) return;
			const seg = h('span');
			seg.style.width = (100 * v / max).toFixed(2) + '%';
			seg.style.background = D.catColor(i);
			seg.title = D.cats[i].de + ': ' + D.fmt(v);
			bar.append(seg);
		});
		return bar;
	}

	/* ------------------------------------------------------------- legend */

	// doubles as the filter: a chip that is off drops its goods everywhere
	function renderLegend(host, active, onToggle, onAll) {
		host.textContent = '';
		host.append(h('span', { class: 'legend-cap', text: 'Gattungen' }));
		D.cats.forEach((c, i) => {
			const sw = h('span', { class: 'swatch' });
			sw.style.background = D.catColor(i);
			host.append(h('button', {
				'aria-pressed': String(active.has(c.key)),
				title: active.has(c.key) ? c.de + ' ausblenden' : c.de + ' einblenden',
				onclick: () => onToggle(c.key),
			}, [sw, h('span', { text: c.de })]));
		});
		if (active.size < D.catKeys.length) {
			host.append(h('button', {
				class: 'reset', 'aria-pressed': 'false', text: 'alle', title: 'alle Gattungen zeigen',
				onclick: () => onAll && onAll(),
			}));
		}
	}

	/* ------------------------------------------------------- länder-table */

	function renderPlaceTable(table, opts) {
		// the legend picks which goods count: dropped columns leave the table,
		// and the total becomes the sum of what is left rather than the printed
		// Gesammt — otherwise the figures would not add up in front of you
		const active = opts.cats && opts.cats.size < D.catKeys.length ? opts.cats : null;
		const keys = D.catKeys.filter(k => !active || active.has(k));
		const totalOf = r => active
			? keys.reduce((t, k) => r[k] == null ? t : t + r[k], 0) || null
			: r.total;

		const rows0 = D.ledger(opts.dir);
		const q = (opts.query || '').trim().toLowerCase();
		let rows = q ? rows0.filter(r => r.name.toLowerCase().includes(q)
			|| (r.region || '').toLowerCase().includes(q)) : rows0.slice();
		if (active) rows = rows.filter(r => totalOf(r));

		let sortKey = opts.sortKey || 'total';
		if (sortKey !== 'name' && sortKey !== 'total' && !keys.includes(sortKey)) sortKey = 'total';
		const dir = opts.sortDir === 'asc' ? 1 : -1;
		const val = (r, k) => k === 'total' ? (totalOf(r) || 0) : (r[k] || 0);
		rows.sort((a, b) => sortKey === 'name'
			? dir * a.name.localeCompare(b.name, 'de')
			: dir * (val(a, sortKey) - val(b, sortKey)));
		const max = rows.reduce((m, r) => Math.max(m, totalOf(r) || 0), 0) || 1;

		const cols = [{ key: 'name', label: opts.dir === 'imports' ? 'V o n' : 'N a c h' }]
			.concat(D.cats.filter(c => keys.includes(c.key)).map(c => ({ key: c.key, label: c.de })))
			.concat([
				{ key: 'total', label: active ? 'Summe der gewählten' : 'Gesammt' },
				{ key: 'bar', label: 'Antheil' },
			]);

		table.textContent = '';
		const hr = h('tr');
		for (const c of cols) {
			const th = h('th', { scope: 'col', text: c.label });
			if (c.key !== 'bar') {
				if (c.key === sortKey) th.setAttribute('aria-sort', opts.sortDir === 'asc' ? 'ascending' : 'descending');
				th.addEventListener('click', () => opts.onSort(c.key));
			} else th.style.cursor = 'default';
			hr.append(th);
		}
		table.append(h('thead', null, [hr]));

		const tb = h('tbody');
		for (const r of rows) {
			const tr = h('tr');
			const td0 = h('td');
			td0.append(leader(r.name, () => opts.onPlace(r.place)));
			tr.append(td0);
			for (const k of keys) tr.append(num(r[k]));
			tr.append(num(totalOf(r), 'tot'));
			const tdb = h('td');
			const wrap = h('div');
			wrap.style.width = (100 * (totalOf(r) || 0) / max).toFixed(2) + '%';
			wrap.style.minWidth = '2px';
			wrap.append(stackBar(r, totalOf(r) || 1, active));
			tdb.append(wrap);
			tdb.style.width = '160px';
			tr.append(tdb);
			tb.append(tr);
		}
		table.append(tb);

		const foot = h('tr');
		foot.append(h('td', { text: 'Summa (' + rows.length + ' Plätze)' }));
		for (const k of keys) foot.append(num(rows.reduce((t, r) => t + (r[k] || 0), 0)));
		foot.append(num(rows.reduce((t, r) => t + (totalOf(r) || 0), 0), 'tot'));
		foot.append(h('td'));
		table.append(h('tfoot', null, [foot]));
	}

	/* -------------------------------------------------------- waren-table */

	function renderArticleTable(table, opts) {
		let rows = D.articles(opts.dir);
		const q = (opts.query || '').trim().toLowerCase();
		if (q) rows = rows.filter(r => r.article.toLowerCase().includes(q));
		if (opts.place) rows = rows.filter(r => r.places.has(opts.place));
		const max = rows.reduce((m, r) => Math.max(m, r.value || 0), 0) || 1;

		table.textContent = '';
		const hr = h('tr');
		for (const label of ['W a a r e', 'Plätze', "Werth Ld'or", 'Antheil']) {
			hr.append(h('th', { scope: 'col', text: label }));
		}
		table.append(h('thead', null, [hr]));

		const tb = h('tbody');
		for (const r of rows) {
			const tr = h('tr');
			tr.dataset.article = r.article;
			const td0 = h('td');
			td0.append(leader(r.article, () => opts.onArticle(r.article)));
			tr.append(td0);
			tr.append(num(r.placeList.length));
			tr.append(num(r.value, 'tot'));
			const tdb = h('td');
			const bar = h('div', { class: 'bar' });
			const seg = h('span');
			seg.style.width = (100 * r.value / max).toFixed(2) + '%';
			seg.style.background = 'var(--sepia)';
			bar.append(seg);
			tdb.append(bar);
			tdb.style.width = '150px';
			tr.append(tdb);
			tr.addEventListener('click', () => opts.onArticle(r.article));
			tb.append(tr);
		}
		table.append(tb);
		if (!rows.length) {
			// an empty Ausfuhr is not a failed search: those pages of the volume
			// have simply not been read yet
			const none = !D.articles(opts.dir).length;
			table.append(h('tbody', null, [h('tr', null, [h('td', {
				colspan: 4, class: 'empty',
				text: none
					? 'Für die ' + (opts.dir === 'imports' ? 'Einfuhr' : 'Ausfuhr')
					+ ' liegt in diesem Bande noch keine Waarenseite vor.'
					: 'nichts gefunden',
			})])]));
		}
		return rows.length;
	}

	function renderArticleBreak(host, article, dir) {
		host.textContent = '';
		if (!article) { host.append(h('p', { class: 'note', text: 'Eine Waare wählen.' })); return; }
		const a = D.articles(dir).find(x => x.article === article);
		if (!a) { host.append(h('p', { class: 'note', text: 'Diese Waare steht nicht in dieser Richtung.' })); return; }
		const max = a.placeList[0] ? a.placeList[0].value : 1;
		host.append(h('p', { class: 'hero', html: D.fmt(a.value) + "<small>Louisd'or aus " + a.placeList.length + ' Plätzen</small>' }));
		for (const p of a.placeList.slice(0, 24)) {
			const bar = h('div', { class: 'bar' });
			const seg = h('span');
			seg.style.width = Math.max(1, 100 * p.value / max).toFixed(1) + '%';
			seg.style.background = 'var(--sepia)';
			bar.append(seg);
			const row = h('div', { class: 'stat' }, [
				h('span', { text: p.name }),
				h('b', { text: D.fmt(p.value) }),
			]);
			host.append(row, bar);
		}
	}

	/* --------------------------------------------------------- schifffahrt */

	// Seeschiffahrts-Verkehr: the ships, by the place they came from or went to
	const PORT_COLS = [
		['name', 'V o n', 'N a c h'],
		['ships_laden', 'Schiffe beladen'],
		['ships_empty', 'Schiffe leer'],
		['ships_total', 'Schiffe zusammen'],
		['capacity', 'Ladungsf\u00e4higkeit Last'],
		['crew', 'Bemannung'],
		['cargo_value', "Werth der Ladung Ld'or"],
	];

	function renderPortTable(table, opts) {
		const rows0 = D.ports(opts.dir);
		const q = (opts.query || '').trim().toLowerCase();
		let rows = q ? rows0.filter(r => r.name.toLowerCase().includes(q)
			|| (r.region || '').toLowerCase().includes(q)) : rows0.slice();
		const sortKey = opts.sortKey || 'ships_total';
		const dir = opts.sortDir === 'asc' ? 1 : -1;
		rows.sort((a, b) => sortKey === 'name'
			? dir * a.name.localeCompare(b.name, 'de')
			: dir * ((a[sortKey] || 0) - (b[sortKey] || 0)));
		const max = rows.reduce((m, r) => Math.max(m, r.ships_total || 0), 0) || 1;

		table.textContent = '';
		const hr = h('tr');
		for (const c of PORT_COLS) {
			const th = h('th', {
				scope: 'col',
				text: c[0] === 'name' ? (opts.dir === 'imports' ? c[1] : c[2]) : c[1],
			});
			if (c[0] === sortKey) th.setAttribute('aria-sort', opts.sortDir === 'asc' ? 'ascending' : 'descending');
			th.addEventListener('click', () => opts.onSort(c[0]));
			hr.append(th);
		}
		hr.append(h('th', { scope: 'col', text: 'Antheil', style: 'cursor:default' }));
		table.append(h('thead', null, [hr]));

		const tb = h('tbody');
		for (const r of rows) {
			const tr = h('tr');
			const td0 = h('td');
			td0.append(leader(r.name, () => opts.onPlace(r.place)));
			tr.append(td0);
			for (let i = 1; i < PORT_COLS.length; i++) {
				tr.append(num(r[PORT_COLS[i][0]], PORT_COLS[i][0] === 'ships_total' ? 'tot' : ''));
			}
			const tdb = h('td');
			const bar = h('div', { class: 'bar' });
			const seg = h('span');
			seg.style.width = Math.max(1, 100 * (r.ships_total || 0) / max).toFixed(2) + '%';
			seg.style.background = 'var(--ink)';
			bar.append(seg);
			tdb.append(bar);
			tdb.style.width = '140px';
			tr.append(tdb);
			tb.append(tr);
		}
		table.append(tb);

		if (!rows.length) {
			table.append(h('tbody', null, [h('tr', null, [h('td', {
				colspan: PORT_COLS.length + 1, class: 'empty',
				text: D.hasPorts()
					? 'F\u00fcr die ' + (opts.dir === 'imports' ? 'angekommenen' : 'abgegangenen')
					+ ' Schiffe liegt in diesem Bande noch keine Seite vor.'
					: 'Der Seeschiffahrts-Verkehr dieses Bandes ist noch nicht gelesen.',
			})])]));
			return 0;
		}

		const foot = h('tr');
		foot.append(h('td', { text: 'Summa (' + rows.length + ' Pl\u00e4tze)' }));
		for (let i = 1; i < PORT_COLS.length; i++) {
			foot.append(num(rows.reduce((t, r) => t + (r[PORT_COLS[i][0]] || 0), 0),
				PORT_COLS[i][0] === 'ships_total' ? 'tot' : ''));
		}
		foot.append(h('td'));
		table.append(h('tfoot', null, [foot]));
		return rows.length;
	}

	/* ------------------------------------------------------------- drawer */

	function renderDrawer(nodes, placeId, dir) {
		const p = D.places.get(placeId);
		// the drawer of one place reads past the Welttheil-cut: a sheet linked to
		// is opened whether or not the standing filter would show its Platz
		const led = D.ledger(dir, true).find(r => r.place === placeId);
		const arts = D.articlesOfPlace(placeId, dir);
		nodes.title.textContent = p ? p.de : placeId;
		nodes.sub.textContent = [(p && p.region) || '', dir === 'imports' ? 'Einfuhr 1851' : 'Ausfuhr 1851'].filter(Boolean).join(' · ');

		const body = nodes.body;
		body.textContent = '';

		if (led) {
			body.append(h('p', { class: 'hero', html: D.fmt(led.total) + "<small>Louisd'or</small>" }));
			const bar = stackBar(led, led.total || 1);
			bar.style.margin = '10px 0 12px';
			bar.style.height = '14px';
			body.append(bar);
			D.cats.forEach((c, i) => {
				if (led[c.key] == null) return;
				const sw = h('span', { class: 'swatch' });
				sw.style.background = D.catColor(i);
				sw.style.marginRight = '6px';
				body.append(h('div', { class: 'stat' }, [
					h('span', null, [sw, document.createTextNode(c.de)]),
					h('b', { text: D.fmt(led[c.key]) }),
				]));
			});
			body.append(h('p', { class: 'note', style: 'margin-top:6px', text: 'Gedruckt auf Seite ' + led.pages.join(', ') + '.' }));
		} else {
			body.append(h('p', { class: 'note', text: 'Für diesen Platz liegt keine Werthübersicht vor — nur das Waarenverzeichniss.' }));
		}

		const port = D.ports(dir, true).find(r => r.place === placeId);
		if (port) {
			body.append(h('h2', {
				style: 'margin:16px 0 4px',
				text: dir === 'imports' ? 'Angekommene Seeschiffe' : 'Abgegangene Seeschiffe',
			}));
			[['Schiffe zusammen', port.ships_total],
			['davon beladen', port.ships_laden],
			['davon leer', port.ships_empty],
			['Ladungsfähigkeit, Last', port.capacity],
			['Bemannung', port.crew],
			["Werth der Ladung, Ld'or", port.cargo_value]].forEach(pair => {
				if (pair[1] == null) return;
				body.append(h('div', { class: 'stat' }, [
					h('span', { text: pair[0] }), h('b', { text: D.fmt(pair[1]) }),
				]));
			});
			body.append(h('p', {
				class: 'note', style: 'margin-top:6px',
				text: 'Gedruckt auf Seite ' + port.pages.join(', ') + '.',
			}));
		}

		if (arts.length) {
			body.append(h('h2', {
				style: 'margin:16px 0 4px',
				text: dir === 'imports' ? 'Waarenverzeichniss der Einfuhr' : 'Waarenverzeichniss der Ausfuhr',
			}));
			const t = h('table', { class: 'ledger' });
			t.append(h('thead', null, [h('tr', null, [
				h('th', { text: 'W a a r e' }), h('th', { text: 'Menge' }), h('th', { text: "Werth Ld'or" }),
			])]));
			const tb = h('tbody');
			for (const a of arts) {
				const it = a.items[0] || {};
				const qty = [it.qty != null ? D.fmt(it.qty) : '', it.unit || ''].filter(Boolean).join(' ') || '—';
				tb.append(h('tr', null, [
					h('td', null, [leader(a.article)]),
					h('td', { class: 'num', text: qty }),
					num(a.value, 'tot'),
				]));
			}
			t.append(tb);
			body.append(h('div', { class: 'frame', style: 'margin-top:4px' }, [h('div', { class: 'inner' }, [t])]));
		}
	}

	global.HandelViews = {
		h, leader, num, stackBar, renderLegend, renderPlaceTable,
		renderArticleTable, renderArticleBreak, renderPortTable, renderDrawer,
	};
})(window);

/* app.js — tabs, state, and the wiring between them. */

(function (global) {
	'use strict';

	const D = global.HandelData;
	const V = global.HandelViews;
	const $ = s => document.querySelector(s);
	const $$ = s => Array.from(document.querySelectorAll(s));

	const state = {
		dir: 'imports',
		welt: 'alle',
		cats: new Set(D.catKeys),
		sortKey: 'total',
		sortDir: 'desc',
		query: '',
		articleQuery: '',
		articlePlace: '',
		article: null,
		mapArticle: '',
		measure: 'value',
		portSort: 'ships_total',
		portSortDir: 'desc',
		portQuery: '',
	};

	/* --------------------------------------------------------------- tabs */

	// the folio carries the page the shown table was read from, as a printed
	// sheet would carry its own number
	const FOLIO = {
		'tab-karte': () => state.measure !== 'value' ? firstPage('ships_by_port')
			: firstPage(state.dir === 'imports' ? 'imports_by_origin' : 'exports_by_dest'),
		'tab-laender': () => firstPage(state.dir === 'imports' ? 'imports_by_origin' : 'exports_by_dest'),
		'tab-waren': () => firstPage('country_detail'),
		'tab-schiffe': () => firstPage('ships_by_port'),
		'tab-quellen': () => '',
	};
	function firstPage(table) {
		const p = (D.source.pages || {})[table];
		return p && p.length ? String(p[0]) : '';
	}

	function showTab(id) {
		$$('nav.tabs button').forEach(b => {
			const on = b.id === id;
			b.setAttribute('aria-selected', String(on));
			$('#' + b.getAttribute('aria-controls')).classList.toggle('hidden', !on);
		});
		state.tab = id;
		$('#folio').textContent = (FOLIO[id] || (() => ''))();
		if (id === 'tab-karte' && map) map.resize();
		location.hash = id.replace('tab-', '');
	}
	$$('nav.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.id)));

	/* ------------------------------------------------------------ tooltip */

	const tip = $('#tip');
	function showTip(html, e) {
		tip.innerHTML = html;
		tip.classList.add('on');
		const pad = 14;
		const r = tip.getBoundingClientRect();
		let x = e.clientX + pad, y = e.clientY + pad;
		if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
		if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
		tip.style.left = Math.max(8, x) + 'px';
		tip.style.top = Math.max(8, y) + 'px';
	}
	const hideTip = () => tip.classList.remove('on');

	function tipFor(row, place) {
		if (row.port) {
			const p = row.port;
			const line = (label, v) => v == null ? ''
				: '<tr><td>' + label + '</td><td>' + D.fmt(v) + '</td></tr>';
			return '<h4>' + place.de + '</h4><table>'
				+ '<tr><td><b>Schiffe zusammen</b></td><td><b>' + D.fmt(p.ships_total) + '</b></td></tr>'
				+ line('davon beladen', p.ships_laden) + line('davon leer', p.ships_empty)
				+ line('Ladungsfähigkeit, Last', p.capacity) + line('Bemannung', p.crew)
				+ line("Werth der Ladung, Ld'or", p.cargo_value)
				+ '</table><div class="foot">' + (place.region || '')
				+ ' · S. ' + p.pages.join(', ') + '</div>';
		}
		if (row.article) {
			return '<h4>' + place.de + '</h4><table><tr><td>' + row.article
				+ '</td><td><b>' + D.fmt(row.value) + '</b></td></tr></table>'
				+ '<div class="foot">' + (place.region || '') + " · Werth in Louisd'or</div>";
		}
		const led = D.ledger(state.dir).find(r => r.place === place.id);
		let rows = '';
		if (led) {
			D.cats.forEach((c, i) => {
				if (led[c.key] == null) return;
				rows += '<tr><td><span class="key" style="background:' + D.catColor(i) + '"></span>'
					+ c.de + '</td><td>' + D.fmt(led[c.key]) + '</td></tr>';
			});
		}
		return '<h4>' + place.de + '</h4>'
			+ '<table><tr><td><b>' + (state.dir === 'imports' ? 'Einfuhr' : 'Ausfuhr') + '</b></td><td><b>'
			+ D.fmt(row.value) + "</b></td></tr>" + rows + '</table>'
			+ '<div class="foot">' + (place.region || '') + " · Werth in Louisd'or</div>";
	}

	/* ------------------------------------------------------------- drawer */

	const drawer = $('#drawer'), scrim = $('#scrim');

	// the open place travels in the address, so a sheet can be linked to
	function stamp(key, value) {
		const q = new URLSearchParams(location.search);
		if (value) q.set(key, value); else q.delete(key);
		const s = q.toString();
		history.replaceState(null, '', (s ? '?' + s : location.pathname) + location.hash);
	}

	function openDrawer(placeId, quiet) {
		V.renderDrawer({ title: $('#drawerTitle'), sub: $('#drawerSub'), body: $('#drawerBody') },
			placeId, state.dir);
		drawer.classList.add('on');
		drawer.setAttribute('aria-hidden', 'false');
		scrim.classList.add('on');
		stamp('platz', placeId);
		if (!quiet) $('#drawerClose').focus();
	}
	function closeDrawer() {
		drawer.classList.remove('on');
		drawer.setAttribute('aria-hidden', 'true');
		scrim.classList.remove('on');
		stamp('platz', null);
	}
	$('#drawerClose').addEventListener('click', closeDrawer);
	scrim.addEventListener('click', closeDrawer);
	addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

	/* ---------------------------------------------------------------- map */

	let map = null;
	function mapRows() {
		// the ships themselves, by the place they came from or went to
		if (state.measure !== 'value') {
			const key = state.measure === 'ships' ? 'ships_total' : 'capacity';
			return D.ports(state.dir)
				.filter(r => r[key] > 0)
				.map(r => ({ place: r.place, value: r[key], port: r }));
		}
		// one named good, if one is chosen — otherwise the ledger, cut to the
		// goods categories the legend leaves standing
		if (state.mapArticle) {
			return D.articlePlaces(state.mapArticle, state.dir)
				.filter(p => p.place && p.value > 0)
				.map(p => ({ place: p.place, value: p.value, article: state.mapArticle }));
		}
		return D.ledger(state.dir).map(r => ({
			place: r.place,
			value: D.catKeys.reduce((t, k) => state.cats.has(k) ? t + (r[k] || 0) : t, 0),
			row: r,
		})).filter(r => r.value > 0);
	}

	const UNIT = {
		value: ["Louisd'or", "Werth in Ld'or", 'Die Kreisfläche folgt dem Werth.'],
		ships: ['Schiffe', 'Schiffe', 'Die Kreisfläche folgt der Zahl der Schiffe.'],
		capacity: ['Last Ladungsfähigkeit', 'Last', 'Die Kreisfläche folgt der Ladungsfähigkeit.'],
	};

	function paintMap() {
		if (!map) return;
		const rows = mapRows();
		map.unit = UNIT[state.measure][1];
		map.draw(rows);
		const total = rows.reduce((t, r) => t + r.value, 0);
		const ships = state.measure !== 'value';
		const cut = ships ? '' : state.mapArticle ? ' · ' + state.mapArticle
			: state.cats.size < D.catKeys.length ? ' · gewählte Gattungen' : '';
		$('#asideCap').textContent = (ships
			? (state.dir === 'imports' ? 'Angekommene Seeschiffe' : 'Abgegangene Seeschiffe')
			: (state.dir === 'imports' ? 'Einfuhr' : 'Ausfuhr'))
			+ ' ' + D.year + WELT_CAP[state.welt] + cut;
		$('#mapNote').textContent = UNIT[state.measure][2]
			+ ' Ein Klick öffnet den Platz.';
		$('#asideTotal').innerHTML = D.fmt(total) + '<small>' + UNIT[state.measure][0] + ' aus ' + rows.length
			+ (rows.length === 1 ? ' Platz' : ' Plätzen') + '</small>';
		// the goods filters only bear on the value; the ships know nothing of them
		$('#mapLegend').classList.toggle('is-off', ships || !!state.mapArticle);
		$('#mapArticle').closest('.field').classList.toggle('is-off', ships);

		const top = $('#topList');
		top.textContent = '';
		const max = rows.length ? Math.max.apply(null, rows.map(r => r.value)) : 1;
		rows.slice().sort((a, b) => b.value - a.value).slice(0, 12).forEach(r => {
			const name = D.placeName(r.place);
			top.append(V.h('div', { class: 'stat' }, [
				V.h('button', { class: 'place-btn', text: name, onclick: () => openDrawer(r.place) }),
				V.h('b', { text: D.fmt(r.value) }),
			]));
			const bar = V.h('div', { class: 'bar' });
			const seg = V.h('span');
			seg.style.width = Math.max(1, 100 * r.value / max).toFixed(1) + '%';
			seg.style.background = 'var(--sepia)';
			bar.append(seg);
			top.append(bar);
		});
	}

	/* -------------------------------------------------------------- views */

	function paintPlaceTable() {
		V.renderPlaceTable($('#placeTable'), {
			dir: state.dir, query: state.query, cats: state.cats,
			sortKey: state.sortKey, sortDir: state.sortDir,
			onSort: key => {
				if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
				else { state.sortKey = key; state.sortDir = key === 'name' ? 'asc' : 'desc'; }
				paintPlaceTable();
			},
			onPlace: openDrawer,
		});
	}

	function paintArticles() {
		const n = V.renderArticleTable($('#articleTable'), {
			dir: state.dir, query: state.articleQuery, place: state.articlePlace,
			onArticle: a => { state.article = a; paintArticleAside(); },
		});
		$('#articleCount').textContent = n + ' Waaren '
			+ (state.dir === 'imports' ? 'eingeführt' : 'ausgeführt');
	}

	function paintArticleAside() {
		$('#articleName').textContent = state.article || '—';
		V.renderArticleBreak($('#articleBreak'), state.article, state.dir);
	}

	function paintPorts() {
		const n = V.renderPortTable($('#portTable'), {
			dir: state.dir, query: state.portQuery,
			sortKey: state.portSort, sortDir: state.portSortDir,
			onSort: key => {
				if (state.portSort === key) state.portSortDir = state.portSortDir === 'asc' ? 'desc' : 'asc';
				else { state.portSort = key; state.portSortDir = key === 'name' ? 'asc' : 'desc'; }
				paintPorts();
			},
			onPlace: openDrawer,
		});
		$('#portCount').textContent = n
			? n + ' Plätze, ' + D.fmt(D.ports(state.dir).reduce((t, r) => t + (r.ships_total || 0), 0)) + ' Schiffe'
			: '';
	}

	function paintQuellen() {
		const list = $('#pageList');
		list.textContent = '';
		const labels = {
			imports_by_origin: 'Einfuhr nach der Herkunft',
			exports_by_dest: 'Ausfuhr nach dem Bestimmungsort',
			country_detail: 'Waarenverzeichnisse der Länder',
			imports_by_article: 'Einfuhr nach Artikeln',
			ships_by_port: 'Seeschiffahrts-Verkehr nach Plätzen',
			ships_by_flag: 'Schifffahrt nach Flaggen',
		};
		const pages = D.source.pages || {};
		Object.keys(pages).sort().forEach(k => {
			list.append(V.h('div', { class: 'stat' }, [
				V.h('span', { text: labels[k] || k }),
				V.h('b', { text: 'S. ' + pages[k].join(', ') }),
			]));
		});
		// the printed row totals against the sum of their own six columns —
		// where the two part company, a digit was misread somewhere. This is a
		// probe of the reading, not of a chosen Welttheil, so it takes the
		// whole book whatever the filter stands at
		const led = D.ledger(state.dir, true);
		const printed = led.reduce((t, r) => t + (r.total || 0), 0);
		const parts = led.reduce((t, r) =>
			t + D.catKeys.reduce((s, k) => s + (r[k] || 0), 0), 0);
		const off = printed - parts;
		const check = $('#totalCheck');
		check.textContent = '';
		check.append(
			V.h('div', { class: 'stat' }, [V.h('span', { text: 'Gedrucktes Gesammt' }), V.h('b', { text: D.fmt(printed) })]),
			V.h('div', { class: 'stat' }, [V.h('span', { text: 'Summe der sechs Gattungen' }), V.h('b', { text: D.fmt(parts) })]),
			V.h('div', { class: 'stat' }, [V.h('span', { text: 'Unterschied' }), V.h('b', { text: (off > 0 ? '+' : '') + D.fmt(off) })]),
			V.h('p', {
				class: 'note', style: 'margin-top:6px',
				text: off === 0
					? 'Die Spalten gehen auf.'
					: 'Der Rest steckt in Zeilen, deren Gesammt im Original nicht der Summe seiner Spalten entspricht — entweder schon im Druck, oder beim Lesen des Faksimiles.',
			}));

		const counts = $('#counts');
		counts.textContent = '';
		[['Plätze', D.raw.places.length],
		['Zeilen Einfuhr', D.raw.imports.length],
		['Zeilen Ausfuhr', D.raw.exports.length],
		['Zeilen Waarenverzeichniss', D.raw.detail.length],
		['Zeilen Einfuhr n. Artikeln', D.raw.articles.length],
		['Zeilen Seeschifffahrt', (D.raw.ports || []).length]].forEach(p => {
			counts.append(V.h('div', { class: 'stat' }, [
				V.h('span', { text: p[0] }), V.h('b', { text: D.fmt(p[1]) }),
			]));
		});
	}

	/* ------------------------------------------------------------ controls */

	const DIR_BUTTONS = '#dirSwitch button, #dirSwitch2 button, #dirSwitch3 button, #dirSwitch4 button';
	const WELT_BUTTONS = '#weltSwitch button, #weltSwitch2 button, #weltSwitch3 button, #weltSwitch4 button';

	// the Welttheil-cut stands over every sheet at once: map, Länder, Waaren
	// and Schifffahrt all read the same divide, so the eye can follow one
	// half of the trade from tab to tab
	const WELT_CAP = { alle: '', uebersee: ' · Übersee', europa: ' · Europa' };

	function setWelt(w) {
		state.welt = w;
		$$(WELT_BUTTONS).forEach(b =>
			b.setAttribute('aria-pressed', String(b.dataset.welt === w)));
		D.setWelt(w);
		stamp('welt', w === 'alle' ? null : w);
		// a Waare or a Platz chosen on one side of the divide may not stand on
		// the other — the article controls fall back on their own
		fillArticleControls();
		paintMap();
		paintPlaceTable();
		paintArticles();
		paintArticleAside();
		paintPorts();
	}
	$$(WELT_BUTTONS).forEach(b =>
		b.addEventListener('click', () => setWelt(b.dataset.welt)));

	function setDir(dir) {
		state.dir = dir;
		$$(DIR_BUTTONS).forEach(b =>
			b.setAttribute('aria-pressed', String(b.dataset.dir === dir)));
		$('#placeSearch').placeholder = dir === 'imports' ? 'Hannover, Cuba, …' : 'Preussen, Newyork, …';
		if (state.tab) $('#folio').textContent = (FOLIO[state.tab] || (() => ''))();
		// the goods lists of the two directions are different printings: what
		// was picked on one side may not exist on the other
		fillArticleControls();
		paintMap();
		paintPlaceTable();
		paintArticles();
		paintArticleAside();
		paintPorts();
		paintQuellen();
		stamp('richtung', dir === 'imports' ? null : 'ausfuhr');
	}
	$$(DIR_BUTTONS).forEach(b =>
		b.addEventListener('click', () => setDir(b.dataset.dir)));

	// the article list and the place list both belong to one direction
	function fillArticleControls() {
		const known = D.articles(state.dir);
		const names = new Set(known.map(a => a.article));
		if (state.article && !names.has(state.article)) state.article = known.length ? known[0].article : null;
		if (state.mapArticle && !names.has(state.mapArticle)) setMapArticle('');

		const list = $('#articleList');
		list.textContent = '';
		known.forEach(a => list.append(V.h('option', { value: a.article })));

		const sel = $('#articlePlace');
		const keep = state.articlePlace;
		sel.textContent = '';
		sel.append(V.h('option', { value: '', text: '— alle Plätze —' }));
		D.placesWithArticles(state.dir).forEach(p => sel.append(V.h('option', { value: p.id, text: p.de })));
		state.articlePlace = [...sel.options].some(o => o.value === keep) ? keep : '';
		sel.value = state.articlePlace;
	}

	function setMapArticle(name) {
		state.mapArticle = name || '';
		$('#mapArticle').value = state.mapArticle;
		$('#mapArticleClear').classList.toggle('hidden', !state.mapArticle);
		stamp('waare', state.mapArticle || null);
	}

	$$('#measureSwitch button').forEach(b => b.addEventListener('click', () => {
		state.measure = b.dataset.measure;
		$$('#measureSwitch button').forEach(x =>
			x.setAttribute('aria-pressed', String(x.dataset.measure === state.measure)));
		stamp('mass', state.measure === 'value' ? null : state.measure);
		if (state.tab) $('#folio').textContent = (FOLIO[state.tab] || (() => ''))();
		paintMap();
	}));

	$('#portSearch').addEventListener('input', e => { state.portQuery = e.target.value; paintPorts(); });

	function afterCats() {
		stamp('gattung', state.cats.size < D.catKeys.length
			? D.catKeys.filter(k => state.cats.has(k)).join(',') : null);
		paintLegends();
		paintMap();
		paintPlaceTable();
	}
	function toggleCat(key) {
		if (state.cats.has(key)) {
			if (state.cats.size > 1) state.cats.delete(key);
		} else state.cats.add(key);
		afterCats();
	}
	function allCats() {
		state.cats = new Set(D.catKeys);
		afterCats();
	}
	function paintLegends() {
		V.renderLegend($('#mapLegend'), state.cats, toggleCat, allCats);
		V.renderLegend($('#tableLegend'), state.cats, toggleCat, allCats);
	}

	// a Waare on the map: an exact name from the list, otherwise the first
	// article the typing matches, otherwise nothing
	$('#mapArticle').addEventListener('input', e => {
		const typed = e.target.value.trim();
		if (!typed) { setMapArticle(''); paintMap(); return; }
		const list = D.articles(state.dir);
		const hit = list.find(a => a.article === typed)
			|| list.find(a => a.article.toLowerCase().startsWith(typed.toLowerCase()))
			|| list.find(a => a.article.toLowerCase().includes(typed.toLowerCase()));
		state.mapArticle = hit ? hit.article : '';
		$('#mapArticleClear').classList.toggle('hidden', !typed);
		stamp('waare', state.mapArticle || null);
		paintMap();
	});
	$('#mapArticleClear').addEventListener('click', () => { setMapArticle(''); paintMap(); });

	$('#placeSearch').addEventListener('input', e => { state.query = e.target.value; paintPlaceTable(); });
	$('#articleSearch').addEventListener('input', e => { state.articleQuery = e.target.value; paintArticles(); });
	$('#articlePlace').addEventListener('change', e => { state.articlePlace = e.target.value; paintArticles(); });
	$('#showRoutes').addEventListener('change', e => { map.showRoutes = e.target.checked; paintMap(); });
	$('#showLabels').addEventListener('change', e => { map.showLabels = e.target.checked; paintMap(); });
	$('#zoomIn').addEventListener('click', () => map.zoomBy(1.4));
	$('#zoomOut').addEventListener('click', () => map.zoomBy(1 / 1.4));
	$('#zoomReset').addEventListener('click', () => map.reset());

	/* --------------------------------------------------------------- boot */

	// swapping the volume redraws everything that was folded from it
	function paintAll() {
		$('#theYear').textContent = D.year;
		$('#footYear').textContent = D.year;
		$('#quellenYear').textContent = D.year;
		document.title = 'Bremens Handel und Schifffahrt ' + D.year;
		if (state.tab) $('#folio').textContent = (FOLIO[state.tab] || (() => ''))();

		fillArticleControls();

		paintLegends();
		paintPlaceTable();
		paintArticles();
		const first = D.articles(state.dir)[0];
		if (!state.article) state.article = first ? first.article : null;
		paintArticleAside();
		paintPorts();
		paintQuellen();
		paintMap();
	}

	function boot() {
		const ysel = $('#yearSel');
		D.years.forEach(y => ysel.append(V.h('option', { value: y, text: y })));
		// ?jahr=1852 opens straight into that volume, and the address keeps up
		const wanted = new URLSearchParams(location.search).get('jahr');
		if (wanted) D.setYear(wanted);
		ysel.value = D.year;
		ysel.addEventListener('change', e => {
			if (!D.setYear(e.target.value)) return;
			state.cats = new Set(D.catKeys);
			closeDrawer();
			paintAll();
			const q = new URLSearchParams(location.search);
			q.set('jahr', D.year);
			history.replaceState(null, '', '?' + q + location.hash);
		});

		map = new global.HandelMap($('#map'), {
			hover: (row, place, e) => showTip(tipFor(row, place), e),
			leave: hideTip,
			select: (row, place) => openDrawer(place.id),
		});
		map.resize();
		paintAll();

		const want = (location.hash || '').replace('#', '');
		showTab(want && document.getElementById('tab-' + want) ? 'tab-' + want : 'tab-karte');

		const q = new URLSearchParams(location.search);
		const welt = q.get('welt');
		if (welt === 'uebersee' || welt === 'europa') setWelt(welt);
		if (q.get('richtung') === 'ausfuhr') setDir('exports');
		const mass = q.get('mass');
		if (mass === 'ships' || mass === 'capacity') {
			state.measure = mass;
			$$('#measureSwitch button').forEach(x =>
				x.setAttribute('aria-pressed', String(x.dataset.measure === mass)));
			paintMap();
		}
		const waare = q.get('waare');
		if (waare && D.articles(state.dir).some(a => a.article === waare)) {
			setMapArticle(waare);
			paintMap();
		}
		const gattung = (q.get('gattung') || '').split(',').filter(k => D.catKeys.includes(k));
		if (gattung.length) {
			state.cats = new Set(gattung);
			paintLegends();
			paintMap();
			paintPlaceTable();
		}
		const platz = q.get('platz');
		if (platz && D.places.has(platz)) openDrawer(platz, true);
	}

	if (!D || !D.raw) {
		document.body.innerHTML = '<p style="padding:40px;font-family:Georgia,serif">'
			+ 'Kein Datensatz gefunden — erst <code>04_bundle_site.py</code> laufen lassen.</p>';
	} else boot();
})(window);

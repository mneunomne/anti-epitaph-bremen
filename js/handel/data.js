/* data.js — the dataset, folded into the shapes the views ask for.
   Everything downstream reads through here, so the raw bundle keeps the
   printed vocabulary (place ids, Ld'or values, null where the page has a dash). */

(function (global) {
	'use strict';

	const CAT_COLORS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6'];
	const BOOK = global.HANDEL || {};
	const YEARS = Object.keys(BOOK).sort();

	// the volume in hand; setYear swaps it and drops what was folded from it
	let YEAR = YEARS[0];
	let raw = BOOK[YEAR];
	let places = new Map();
	let cats = [], catKeys = [];
	let _articles = {}, _rows = {}, _ports = {};

	function setYear(y) {
		if (!BOOK[y]) return false;
		YEAR = y;
		raw = BOOK[y];
		places = new Map(raw.places.map(p => [p.id, p]));
		cats = raw.categories;
		catKeys = cats.map(c => c.key);
		_articles = {};
		_rows = {};
		_ports = {};
		const api = global.HandelData;
		if (api) {
			api.year = YEAR; api.raw = raw; api.places = places;
			api.cats = cats; api.catKeys = catKeys;
			api.source = raw.source; api.home = raw.home;
		}
		return true;
	}

	/* ---------------------------------------------------------- welttheil */

	// The volumes divide the trade by Welttheil, and the near trade drowns the
	// far one: Preussen and Hannover alone outweigh half the Indies. So every
	// table can be cut to one side of that divide. Europe here is the German
	// Confederation, the rest of Europe, and Helgoland — plus the European
	// Turkey, which the printed Levante group carries along with Egypt.
	const EUROPE_REGIONS = new Set(['Deutscher Bund', 'Europa', 'Nordsee']);
	const EUROPE_PLACES = new Set(['tuerkei']);

	// 'alle' — the whole book · 'uebersee' — everything but Europe · 'europa'
	let WELT = 'alle';

	function isEurope(id) {
		if (EUROPE_PLACES.has(id)) return true;
		const p = places.get(id);
		return !!p && EUROPE_REGIONS.has(p.region);
	}

	// the standing cut; `all` reads past it, for the drawer of a single place
	function inWelt(id) {
		if (WELT === 'alle') return true;
		return WELT === 'europa' ? isEurope(id) : !isEurope(id);
	}

	function setWelt(w) {
		if (w !== 'alle' && w !== 'uebersee' && w !== 'europa') return false;
		if (w === WELT) return false;
		WELT = w;
		_articles = {};
		_rows = {};
		_ports = {};
		const api = global.HandelData;
		if (api) api.welt = WELT;
		return true;
	}

	/* ------------------------------------------------------------ numbers */

	// the volumes group thousands with commas; keep that.
	function fmt(n) {
		if (n === null || n === undefined || n === '') return '—';
		return Math.round(n).toLocaleString('en-US');
	}

	function fmtShort(n) {
		if (!n) return '—';
		if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' Mill.';
		if (n >= 1e3) return Math.round(n / 1e3) + ' Tsd.';
		return String(Math.round(n));
	}

	/* ------------------------------------------------------------- places */

	function placeName(id, fallback) {
		const p = places.get(id);
		return p ? p.de : (fallback || id || 'ohne Ort');
	}

	/* ------------------------------------------- the ledger, per direction */

	// The volumes print the same trade twice: once as a grand total and once
	// split seewärts / landwärts. Only the total scope may be summed, or every
	// seaborne place counts twice.
	function ledger(dir, all) {
		const rows = raw[dir].filter(r => r.scope === 'total' && r.place
			&& (all || inWelt(r.place)));
		const by = new Map();
		for (const r of rows) {
			let acc = by.get(r.place);
			if (!acc) {
				acc = { place: r.place, name: placeName(r.place, r.raw), pages: new Set(), total: null };
				for (const k of catKeys) acc[k] = null;
				by.set(r.place, acc);
			}
			acc.pages.add(r.page);
			for (const k of catKeys) if (r[k] != null) acc[k] = (acc[k] || 0) + r[k];
			if (r.total != null) acc.total = (acc.total || 0) + r.total;
		}
		for (const acc of by.values()) {
			// a handful of rows print no total of their own — add the parts up
			if (acc.total == null) {
				const parts = catKeys.reduce((t, k) => acc[k] == null ? t : t + acc[k], 0);
				acc.total = parts || null;
			}
			acc.pages = [...acc.pages].sort((a, b) => a - b);
			acc.region = (places.get(acc.place) || {}).region || '—';
		}
		return [...by.values()].sort((a, b) => (b.total || 0) - (a.total || 0));
	}

	// the seaborne / overland subsets, where the volume prints them
	function scopes(dir) {
		const s = new Set(raw[dir].map(r => r.scope));
		return [...s];
	}

	function grandTotal(dir) {
		return ledger(dir).reduce((t, r) => t + (r.total || 0), 0);
	}

	function categoryTotals(dir) {
		const rows = ledger(dir);
		return catKeys.map(k => ({ key: k, value: rows.reduce((t, r) => t + (r[k] || 0), 0) }));
	}

	/* ------------------------------------------------------------- waaren */

	// Two printed tables cover the same goods: the per-country lists
	// (country_detail) and the by-article table (imports_by_article). Cuba's
	// sugar stands in both, under slightly different names — so adding them up
	// counts that sugar twice. The country list is the finer of the two, so it
	// wins wherever it exists; the article table only fills the places it does
	// not reach.
	// Einfuhr and Ausfuhr are separate printings and never mix — each goods page
	// was tagged from its own printed heading when the bundle was built.
	const side = dir => dir === 'exports' ? 'ausfuhr' : 'einfuhr';

	function articleRows(dir, all) {
		const s = side(dir) + (all ? '|all' : '');
		if (_rows[s]) return _rows[s];
		const d = side(dir);
		const detail = raw.detail.filter(r => r.dir === d);
		const covered = new Set(detail.map(r => r.place));
		_rows[s] = detail.concat(
			raw.articles.filter(r => r.dir === d && !covered.has(r.place)))
			// a row without a place cannot be laid on either side of the divide;
			// it belongs to the whole book only
			.filter(r => all || (r.place ? inWelt(r.place) : WELT === 'alle'));
		return _rows[s];
	}

	function articles(dir) {
		const s = side(dir);
		if (_articles[s]) return _articles[s];
		const by = new Map();
		for (const r of articleRows(dir)) {
			const name = r.article;
			let a = by.get(name);
			if (!a) { a = { article: name, value: 0, places: new Map(), n: 0 }; by.set(name, a); }
			a.value += r.value || 0;
			a.n++;
			const pid = r.place || ('?' + (r.raw || ''));
			const p = a.places.get(pid) || { place: r.place, name: placeName(r.place, r.raw), value: 0, items: [] };
			p.value += r.value || 0;
			p.items.push(r);
			a.places.set(pid, p);
		}
		const list = [...by.values()].sort((a, b) => b.value - a.value);
		for (const a of list) {
			a.placeList = [...a.places.values()].sort((x, y) => y.value - x.value);
		}
		_articles[s] = list;
		return list;
	}

	// one article, what each place sent of it
	function articlePlaces(article, dir) {
		const a = articles(dir).find(x => x.article === article);
		return a ? a.placeList : [];
	}

	// every article booked against one place, richest first
	function articlesOfPlace(placeId, dir) {
		const rows = articleRows(dir, true).filter(r => r.place === placeId);
		const by = new Map();
		for (const r of rows) {
			const a = by.get(r.article) || { article: r.article, value: 0, items: [] };
			a.value += r.value || 0;
			a.items.push(r);
			by.set(r.article, a);
		}
		return [...by.values()].sort((a, b) => b.value - a.value);
	}

	function placesWithArticles(dir) {
		const ids = new Set(articleRows(dir).map(r => r.place).filter(Boolean));
		return [...ids].map(id => places.get(id)).filter(Boolean)
			.sort((a, b) => a.de.localeCompare(b.de, 'de'));
	}

	/* -------------------------------------------------------- schifffahrt */

	// Seeschiffahrts-Verkehr: the ships themselves, by the place they came from
	// or went to. Arrived ships belong with the Einfuhr, departed with the
	// Ausfuhr, so this follows the same direction control as everything else.
	const PORT_KEYS = ['ships_laden', 'ships_empty', 'ships_total', 'capacity', 'crew', 'cargo_value'];

	// Only the summary sheet is counted. The volumes also print a "Specielle
	// Nachweisung über die einzelnen Häfen und Plätze" that breaks the same
	// ships down to the individual harbour, under country headings that carry
	// their own subtotals — adding it would count every ship twice over.
	function ports(dir, all) {
		const d = dir === 'exports' ? 'abgegangen' : 'angekommen';
		const s = d + (all ? '|all' : '');
		if (_ports[s]) return _ports[s];
		const by = new Map();
		for (const r of raw.ports || []) {
			if (r.dir !== d || !r.place || (r.sheet && r.sheet !== 'summary')) continue;
			if (!all && !inWelt(r.place)) continue;
			let acc = by.get(r.place);
			if (!acc) {
				acc = { place: r.place, name: placeName(r.place, r.raw), pages: new Set() };
				for (const k of PORT_KEYS) acc[k] = null;
				by.set(r.place, acc);
			}
			acc.pages.add(r.page);
			for (const k of PORT_KEYS) if (r[k] != null) acc[k] = (acc[k] || 0) + r[k];
		}
		for (const acc of by.values()) {
			if (acc.ships_total == null) {
				const parts = (acc.ships_laden || 0) + (acc.ships_empty || 0);
				acc.ships_total = parts || null;
			}
			acc.pages = [...acc.pages].sort((a, b) => a - b);
			acc.region = (places.get(acc.place) || {}).region || '—';
		}
		_ports[s] = [...by.values()].sort((a, b) => (b.ships_total || 0) - (a.ships_total || 0));
		return _ports[s];
	}

	function hasPorts() {
		return (raw.ports || []).some(r => !r.sheet || r.sheet === 'summary');
	}

	/* --------------------------------------------------------------- misc */

	function cssVar(name) {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	const catColor = i => cssVar(CAT_COLORS[i % CAT_COLORS.length]);

	global.HandelData = {
		years: YEARS, setYear, book: BOOK,
		welt: WELT, setWelt, isEurope, inWelt,
		year: YEAR, raw, cats, catKeys, places, source: raw && raw.source, home: raw && raw.home,
		fmt, fmtShort, placeName, ledger, scopes, grandTotal, categoryTotals,
		articles, articlePlaces, articlesOfPlace, placesWithArticles,
		ports, hasPorts, PORT_KEYS,
		catColor, cssVar,
	};
	if (raw) setYear(YEAR);
})(window);

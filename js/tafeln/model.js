/* model.js — the volume turned on its side.
 *
 * The printed tables are cut by article: one block for Havana, one for
 * Cuba, one for Maryland, and the places run down the block as rows. This
 * page cuts the other way — one block per place, the goods running down it
 * — which is the same body of figures read from the other end.
 *
 * Nothing is converted. Values stay in Louisd'or as printed, and every
 * figure in a block is that place's own figure — the block's sum is the sum
 * of what that place sent, never the article's total across all places.
 * Where the page has a dash there is a dash here too, not a nought.
 */
(function (global) {
	'use strict';

	const AE = (global.AE = global.AE || {});
	const T = (AE.Tafeln = AE.Tafeln || {});

	/* ------------------------------------------------------------ measures */

	// The scans put the abbreviation mark through OCR and it comes back as
	// whatever letterlike glyph was nearest — ℨ, ℤ, Ʃ, Ζ, Ż, ℬ, ℒ and a bare
	// quote all stand for the same thing. Each family below collapses to the
	// form the volumes actually print. Raw is one toggle away, because this
	// is a reading of the source, not a correction of it.
	const MEASURES = [
		// net pounds. The country lists say it outright, but the scan returns
		// the pound mark as %, Z or Ζ, and often drops it and keeps the "Nto."
		[/^(?:[℔%ZΖℤℨ]\s*)?n(?:et)?to\.?$/i, '℔ Nto.'],
		[/^ztr\.?\s*n(?:et)?to\.?$/i, 'Ztr. Nto.'],
		[/^(zollpfund|pfund|℔|%|[ℤℨƩΖZŻℬℒℭ℃])$/i, '℔'],
		[/^(zoll)?(c|z)entner\.?$|^ztr\.?$/i, 'Ztr.'],
		[/^ball(en|ot)$/i, 'Ballen'],
		[/^bund$/i, 'Bund'],
		[/^kistchen$/i, 'Kistchen'],
		[/^(stück|stueck|stck|st|stk)\.?$/i, 'Stück'],
		[/^kist(en|e)?\.?$|^kst\.?$/i, 'Kisten'],
		[/^tonn(en|\.)?$/i, 'Tonnen'],
		[/^(fäss(er)?|fass)\.?$/i, 'Fässer'],
		[/^(cubic|cubik|cb)fuss$/i, 'Cbfs.'],
		[/^quadratf(uß|uss)?\.?/i, 'Qfs.'],
		[/^scheffel$/i, 'Schffl.'],
		[/^flaschen?$|^fl\.?$/i, 'Flaschen'],
		[/^töpfe$/i, 'Töpfe'],
		[/^stein$/i, 'Stein'],
		[/^mille$/i, 'Mille'],
		[/^%$/, '%'],
		// compound measures — a hogshead reckoned in quarters and bottles, a
		// last in scheffel. The volumes carry all the parts; the tail is noise
		// once the block is one line per article, so only the head survives.
		[/^(oxh|oxhoft|oth|ohm|oz)\b/i, 'Oxh.'],
		[/^last\b/i, 'Last'],
		[/^colli\b/i, 'Colli'],
	];

	// The great colonial goods are all weighed net, and the volumes say so
	// once at the head of the block and then leave it — every row under it
	// carries a ditto. Read line by line the mark is lost and the measure
	// comes back as whatever the OCR guessed, which is why Taback arrives as
	// "Ztr." and raw sugar as a Greek zeta. These seven families are net
	// pounds wherever they appear.
	const NETTO = '℔ Nto.';
	const isNetto = name => {
		const k = String(name || '').toLowerCase().replace(/[_,:]/g, ' ').replace(/\s+/g, ' ').trim();
		if (/cigarr|fabricirt/.test(k)) return false;        // reckoned by the Mille, or by the piece
		if (/taback/.test(k)) return true;
		if (/zucker|muscovad|crystallisirt|melis|farin|candis/.test(k)) return true;
		if (/^havana( und cuba)?$/.test(k)) return true;     // the raw-sugar sub-headings
		if (/caffee|kaffee/.test(k)) return true;
		if (/^(sago|reis|cacao)\b/.test(k)) return true;
		if (/^baumwolle$/.test(k)) return true;              // not -waaren (Colli), not -garn
		return false;
	};

	function normalise(unit) {
		const raw = String(unit == null ? '' : unit).trim();
		if (!raw || raw === '—') return '';
		const hit = u => { for (const [re, out] of MEASURES) if (re.test(u)) return out; return null; };

		// a full point after a measure is typography, not part of it
		const bare = raw.replace(/\.$/, '');
		let out = hit(raw) || hit(bare);
		if (out) return out;

		// a compound — the volumes reckon a consignment in casks and boxes and
		// packages at once, and print all of them. One line per good has room
		// for one measure, so the head of the compound stands for the whole,
		// as it already does for Oxhoft/Viertel/Flasche and Last/Scheffel.
		// `raw measures` puts the whole thing back.
		const head = bare.split(/[\/,]/)[0].trim();
		if (head && head !== bare) {
			out = hit(head) || hit(head.replace(/\.$/, ''));
			if (out) return out;
		}
		return bare;
	}

	// A pre-pass in the order the pages were read. A ditto mark means "as the
	// line above", so it has to be resolved before the rows are regrouped by
	// place — after that the line above is a different place's line, and the
	// mark points at nothing. Dittos chain, so the carry is the resolved
	// value, not the raw one.
	function resolveUnits(articles) {
		const out = new Array(articles.length);
		let prev = null, prevArticle = null;
		for (let i = 0; i < articles.length; i++) {
			const a = articles[i];
			const raw = String(a.unit == null ? '' : a.unit).trim();
			let u;
			if (isNetto(a.article)) u = NETTO;
			else if ((raw === '"' || raw === '”' || raw === '„' || raw === '»') && a.article === prevArticle) u = prev;
			else u = normalise(raw);
			out[i] = u || '';
			prev = out[i];
			prevArticle = a.article;
		}
		return out;
	}

	/* ----------------------------------------------------------- categories */

	// The volumes divide trade into six classes and print a total for each,
	// place by place — but only as a total. No individual good is ever tagged
	// with its class: the Waarenverzeichniss just lists goods, in class order,
	// alphabetically within each class. So a good's class is not in the data
	// and has to be read off its name.
	//
	// That is what this does, and it is a reading, not a fact of the source.
	// It places about nine in ten goods; the rest fall to `unplaced`, which is
	// shown by default so that nothing quietly disappears from a block. The
	// printed per-class totals cannot be used to check it, because the
	// itemised goods do not sum to them — Hannover 1851 itemises barely half
	// of its own printed total.
	const CATEGORIES = [
		{ key: 'consumables', de: 'Verzehrungs-Gegenstände', short: 'Verzehrung' },
		{ key: 'raw_materials', de: 'Rohstoffe', short: 'Rohstoffe' },
		{ key: 'semi_finished', de: 'Halbfabrikate', short: 'Halbfabrikate' },
		{ key: 'manufactured', de: 'Manufactur-Waaren', short: 'Manufactur' },
		{ key: 'industrial_art', de: 'Industrie- und Kunsterzeugnisse', short: 'Industrie' },
		{ key: 'specie_metals', de: 'Contanten und edle Metalle', short: 'Contanten' },
		{ key: 'unplaced', de: 'nicht zugeordnet', short: 'nicht zugeordnet' },
	];

	// what the volumes themselves put first, so it is what is shown first
	const DEFAULT_CATS = ['consumables', 'raw_materials', 'unplaced'];

	// Order matters — the first rule that matches wins, so the narrow classes
	// stand before the broad ones. Written as lists of alternatives rather
	// than as one regex literal, because a literal cannot be broken over
	// lines and a wall of a thousand characters cannot be checked by eye.
	const CLASSES = [
		// a few rows name their own class outright
		['raw_materials', ['^(andere\\s+)?rohstoffe', '^rohprodukte']],
		['consumables', ['^verzehr']],
		['manufactured', ['manufactur']],

		['specie_metals', ['contanten', 'gold', 'silber', 'm[üu]nz', 'barren', 'species',
			'piaster', 'dublon']],

		['industrial_art', ['cigarr', 'maschin', 'instrument', 'uhren', 'b[üu]cher', 'musikal',
			'spielzeug', 'galanterie', 'kurzwaar', 'porzellan', 'steingut', 'fayence', 'm[öo]bel',
			'holzwaar', 'korbwaar', 'b[üu]rstenb', 'drechsler', 'papierwaar', 'schreibmat',
			'gem[äa]lde', 'kunst', 'equipag', 'fortepiani', 'orgel', 'optische', 'chirurg',
			'waffen', 'gewehr', 'spiegelglas', 'fensterglas', 'bouteillen', 'demijohn',
			'glaswaar', '\\bglas\\b', 'stahlwaaren', 'eisenwaaren', 'kupferwaaren',
			'metallwaaren', 'blechwaaren', 'lederwaaren', 'ger[äa]th', 'mobilien', 'lampen',
			'nadeln', 'kn[öo]pfe', 'k[äa]mme', 'seilerwaar', 'siebe', 'parf[üu]meri',
			'knicker', 'marrel', 'n[äa]gel']],

		['manufactured', ['(baumwollen|wollen|leinen|seiden|halbseiden|halbwollen)waar',
			'\\btuch\\b', 'tuche', 'kleidung', 'effecten', 'matten', 'h[üu]te', 'strumpf',
			'spitzen', 'teppich', 'posament', 'putzwaar', 'w[äa]sche', 'segeltuch', 'leinwand',
			'drell', 'barchent', 'flanell', 'shawls', 't[üu]cher', 'str[üu]mpfe', 'handschuh',
			'schuhe', 'stiefel', 'm[üu]tzen', 'corsett']],

		['semi_finished', ['garn', 'twist', 'zwirn', '\\bleder\\b', 'corduan', 'juchten',
			'\\bpapier\\b', 'pappe', 'eisen,?\\s*(stangen|blech|draht|geschmied|gewalzt)',
			'stabeisen', 'blech', 'draht', 'chemicalien', 'pr[äa]parirt', 'raffinirt',
			'farbewaar', 'bleiweiss', 'zinkweiss', 'mennig', 'st[äa]rke', 'oelkuchen',
			'talglichte', 'seife', 'lichte', '\\bstahl\\b', 'vitriol', 'weinstein', 'salmiak',
			'salzs[äa]ure', 'schwefels[äa]ure', 'gerberlohe']],

		['consumables', ['caffee', 'kaffee', 'zucker', 'muscovad', 'melis', 'farin', 'candis',
			'sirup', 'syrup', 'honig', 'taback', 'tabak', '\\breis\\b', 'sago', 'cacao',
			'\\bthee\\b', 'gew[üu]rz', 'pfeffer', 'nelken', 'muscat', 'canehl', 'piment',
			'ingber', 'cardemom', 'cumin', 'vanille', 'safran', 'cassia', '\\bwein\\b',
			'\\bbier\\b', 'spirituos', '\\brum\\b', 'arrac', 'branntwein', '\\bsprit\\b',
			'liqueur', 'genever', 'champagner', 'cognac', 'porter', '\\bale\\b', 'mineralwasser',
			'fr[üu]chte', 'rosinen', 'corinthen', 'feigen', 'mandeln', 'citron', 'apfelsin',
			'obst', 'getreide', 'weizen', 'roggen', 'gerste', 'hafer', 'mehl', 'brot',
			'zwieback', 'fische', 'heering', 'h[äa]ring', 'stockfisch', 'klippfisch', 'austern',
			'hummer', 'lebensmittel', 'butter', 'k[äa]se', 'fleisch', 'speck', 'schinken',
			'\\bsalz\\b', 'senf', 'essig', 'hopfen', 'amidam', 'schlachtvieh', 'zugvieh',
			'kartoffel', 'erbsen', 'bohnen', 'oliven', 'capern', 'anchovis', 'sardellen',
			'caviar', 'confect', 'chocolade', 'conserven', 'zwiebeln', 'gem[üu]se']],

		['raw_materials', ['baumwolle', '\\bwolle\\b', 'schaafwolle', 'seide,\\s*roh', 'flachs',
			'hanf', 'jute', 'h[äa]ute', 'felle', 'leder,\\s*roh', 'haare', 'h[öo]rner',
			'knochen', 'blut', 'borsten', 'federn', 'holz', 'f[äa]rbestoff', 'indigo',
			'cochenille', 'cutch', 'droguerien', 'drogues', 'apothekerwaar', 'gummi', 'harz',
			'pech', 'theer', 'terpentin', 'oele', '[öo]l\\b', 'thran', 'talg', 'wachs',
			'stearin', 'steinkohl', 'brennmaterial', 'torf', 'coaks', 'eisen', 'blei', 'kupfer',
			'zink', 'zinn', 'messing', 'metall', '\\berz\\b', 'baumaterial', 'steine',
			'schiefer', 'klinker', 'kalk', 'cement', 'mineralien', 'naturalien', 'guano',
			'd[üu]nger', 'salpeter', 'schwefel', 'soda', 'pottasche', 'alaun', 'bast',
			'tauwerk', 'schildpatt', 'elfenbein', 'perlmutter', 'federposen', 'saat', 'samen',
			'kleie', 'lumpen', 'hadern', 'dielen', 'wallfisch', 'barden', 'fischbein',
			'stuhlrohr', 'pelzwerk', 'kreide', 'schmirgel', 'bimstein', 'marmor', 'granit',
			'planken', 'balken', 'bretter', 'latten', 'sparren', 'eichen', 'tannen', 'fichten',
			'kiefern', 'buchen', 'birken', 'erlen']],
	];

	const COMPILED = CLASSES.map(([k, parts]) => [new RegExp(parts.join('|'), 'i'), k]);

	function category(article) {
		const n = String(article == null ? '' : article).replace(/_/g, ' ');
		for (const [re, k] of COMPILED) if (re.test(n)) return k;
		return 'unplaced';
	}

	/* -------------------------------------------------------------- figures */

	// The volumes group in threes with a comma, as the scans show.
	function figure(v) {
		if (v == null || !Number.isFinite(v)) return '—';
		return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	/* --------------------------------------------------------------- plates */

	const BOOK = () => global.HANDEL || {};

	function years() {
		return Object.keys(BOOK()).sort();
	}

	// what the volume calls each place, by its id — wanted wherever a place has
	// to be named outside a block it stands in, as a struck-out one is
	const placeNames = year => new Map(
		(((BOOK()[year] || {}).places) || []).map(p => [p.id, p.de]));

	// Two printed tables cover the same goods, and a block has to come off one
	// of them or the other — never both. The per-country lists (the
	// *Waarenverzeichniss der Einfuhr*) are much the finer of the two:
	// Brasilien 1851 runs to 25 goods there against 10 in the by-article
	// table, and its largest import of all — Caffee, 800,677 Ld'or — stands
	// only in the list. So a place the lists reach is taken from them entire,
	// and the by-article table fills only the places they never reached.
	// Adding the two would count Cuba's sugar twice, under two different
	// names. This is the same rule the map and the ledger read by.
	function sourceRows(vol) {
		const detail = vol.detail || [];
		const articles = vol.articles || [];
		// dittos point at the line above *in their own printing*, so each
		// table is resolved in its own order before either is regrouped
		const dUnits = resolveUnits(detail);
		const aUnits = resolveUnits(articles);

		const covered = new Set();
		for (const r of detail) if (r.dir === 'einfuhr' && r.place) covered.add(r.place);

		const out = [];
		for (let i = 0; i < detail.length; i++) {
			const r = detail[i];
			if (r.dir !== 'einfuhr' || !r.place) continue;
			out.push({ r, unit: dUnits[i], from: 'verzeichniss' });
		}
		for (let i = 0; i < articles.length; i++) {
			const r = articles[i];
			// the unattributed rows have no block, and a place the lists
			// already cover must not be filled out of here as well
			if (r.dir !== 'einfuhr' || !r.place || covered.has(r.place)) continue;
			out.push({ r, unit: aUnits[i], from: 'artikel' });
		}
		return out;
	}

	// One block per place: its goods, biggest value first, and the sum of
	// what could be summed. Where the extraction has read one good twice for
	// the same place — a line continued over a column break — the two are
	// added together, which leaves the place's sum exactly where it was.
	function plates(year, opts) {
		const vol = BOOK()[year];
		if (!vol) return [];
		const o = opts || {};
		const rawUnits = !!o.rawUnits;
		const names = new Map((vol.places || []).map(p => [p.id, p.de]));

		const byPlace = new Map();
		for (const { r: a, unit: resolved, from } of sourceRows(vol)) {
			let p = byPlace.get(a.place);
			if (!p) byPlace.set(a.place, (p = { id: a.place, raw: a.raw, from, rows: new Map(), pages: new Set() }));

			const unit = rawUnits ? String(a.unit == null ? '' : a.unit).trim() : resolved;
			const key = a.article + ' ' + unit;
			const seen = p.rows.get(key);
			if (seen) {
				seen.qty = seen.qty == null && a.qty == null ? null : (seen.qty || 0) + (a.qty || 0);
				seen.value = seen.value == null && a.value == null ? null : (seen.value || 0) + (a.value || 0);
				seen.merged++;
			} else {
				p.rows.set(key, { article: a.article, qty: a.qty, unit, value: a.value, cat: category(a.article), merged: 0 });
			}
			if (a.page != null) p.pages.add(a.page);
		}

		// which classes are wanted. Everything, unless asked otherwise.
		const want = o.cats && o.cats.length ? new Set(o.cats) : null;
		// goods struck out by name, everywhere they appear
		const skip = o.exclude && o.exclude.length ? new Set(o.exclude) : null;
		// and a floor under the Werth. The long tail is what makes a block
		// unwieldy — Newyork 1851 runs to 78 goods, but 57 of them are worth
		// under 5,000 Ld'or between them and come to 3% of what the place
		// sent. A floor is the cheapest way to cut a block down without
		// choosing which goods matter by hand. A good the page never valued
		// is not small, only unknown, so a dash is never cut by the floor.
		const floor = Number.isFinite(o.minValue) && o.minValue > 0 ? o.minValue : 0;

		const out = [];
		for (const p of byPlace.values()) {
			const all = [...p.rows.values()];
			// what each class holds, counted over everything the place sent —
			// so a panel can say what a filter is keeping back
			const tally = {};
			for (const r of all) tally[r.cat] = (tally[r.cat] || 0) + 1;

			const rows = all.filter(r =>
				(!want || want.has(r.cat)) &&
				(!skip || !skip.has(r.article)) &&
				(!floor || !Number.isFinite(r.value) || r.value >= floor));
			rows.sort((a, b) => (b.value || 0) - (a.value || 0) || a.article.localeCompare(b.article, 'de'));
			const known = rows.filter(r => Number.isFinite(r.value));
			const total = known.length ? known.reduce((s, r) => s + r.value, 0) : null;
			// what the place sent before any of this, so a panel can say what
			// a floor or a struck-out good actually costs
			const everything = all.filter(r => Number.isFinite(r.value));
			const full = everything.length ? everything.reduce((s, r) => s + r.value, 0) : null;

			out.push({
				id: p.id,
				title: names.get(p.id) || p.raw || p.id,
				rows,
				tally,
				all: all.length,
				full,
				share: full ? (total || 0) / full : 1,
				hidden: all.length - rows.length,
				filtered: all.length !== rows.length,
				// the sum of this place's goods, and nothing else
				total,
				partial: known.length !== rows.length,       // some figure is a dash
				pages: [...p.pages].sort((a, b) => a - b),
				source: p.from,                              // which printing it came off
				year,
			});
		}
		out.sort((a, b) => (b.total || 0) - (a.total || 0) || a.title.localeCompare(b.title, 'de'));
		return out;
	}

	/* ---------------------------------------------------------------- wares */

	// The volume turned once more. plates() asks what a place sent; this asks
	// who sent a good, and it is the same body of figures read from the third
	// end. A cell is one place, one good, one measure, and which block it is
	// filed under changes nothing about it — so the two cuts agree cell for
	// cell and on the grand sum, and the same rule picks the printing: a place
	// the country lists reach is taken from them entire, and the by-article
	// table fills only the places they never reached.
	//
	// The good's name carries the whole weight here, because it is what the
	// blocks are cut on: down one place's block a name only has to be itself,
	// but across the volume it has to be the same name everywhere it stands.
	// Underscores are an artefact of the extraction — "Taback_Havana" is a
	// sub-heading the by-article table sets on two lines — and go back to
	// spaces. Nothing else is touched, and in these five volumes that merges
	// no two names that were not already the one name.
	const wareName = s => String(s == null ? '' : s)
		.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

	// A good's class is the good's, not the place's, so every row of a block
	// carries the block's own class and a filter by class takes whole blocks.
	// That is why `cats` is not an option here as it is on plates(): there is
	// nothing in a block for it to cut. The page filters the list instead, and
	// can say how many goods each class holds while it does it.
	function wares(year, opts) {
		const vol = BOOK()[year];
		if (!vol) return [];
		const o = opts || {};
		const rawUnits = !!o.rawUnits;
		const names = new Map((vol.places || []).map(p => [p.id, p.de]));

		const byWare = new Map();
		for (const { r: a, unit: resolved, from } of sourceRows(vol)) {
			const title = wareName(a.article);
			if (!title) continue;
			let w = byWare.get(title);
			if (!w) byWare.set(title, (w = { title, rows: new Map(), pages: new Set(), from: new Set() }));

			const unit = rawUnits ? String(a.unit == null ? '' : a.unit).trim() : resolved;
			// the same cut as plates() makes, named the other way round: there
			// a good twice in a place's block was one good, here a place twice
			// in a good's block is one place
			const key = a.place + ' ' + unit;
			const seen = w.rows.get(key);
			if (seen) {
				seen.qty = seen.qty == null && a.qty == null ? null : (seen.qty || 0) + (a.qty || 0);
				seen.value = seen.value == null && a.value == null ? null : (seen.value || 0) + (a.value || 0);
				seen.merged++;
			} else {
				w.rows.set(key, {
					place: a.place,
					title: names.get(a.place) || a.raw || a.place,
					qty: a.qty, unit, value: a.value, merged: 0,
				});
			}
			w.from.add(from);
			if (a.page != null) w.pages.add(a.page);
		}

		// places struck out by hand, everywhere they appear, and a floor under
		// the Werth — the same two cuts the by-place blocks take, turned round.
		// A place the page never valued is not small, only unknown, so a dash
		// is never cut by the floor.
		const skip = o.exclude && o.exclude.length ? new Set(o.exclude) : null;
		const floor = Number.isFinite(o.minValue) && o.minValue > 0 ? o.minValue : 0;

		const out = [];
		for (const w of byWare.values()) {
			const all = [...w.rows.values()];
			const rows = all.filter(r =>
				(!skip || !skip.has(r.place)) &&
				(!floor || !Number.isFinite(r.value) || r.value >= floor));
			rows.sort((a, b) => (b.value || 0) - (a.value || 0) || a.title.localeCompare(b.title, 'de'));
			const known = rows.filter(r => Number.isFinite(r.value));
			const total = known.length ? known.reduce((s, r) => s + r.value, 0) : null;
			const everything = all.filter(r => Number.isFinite(r.value));
			const full = everything.length ? everything.reduce((s, r) => s + r.value, 0) : null;
			const from = [...w.from];

			out.push({
				axis: 'ware',                                // which way the volume was cut
				id: w.title,                                 // the name is the key
				title: w.title,
				cat: category(w.title),
				rows,
				all: all.length,
				full,
				share: full ? (total || 0) / full : 1,
				hidden: all.length - rows.length,
				filtered: all.length !== rows.length,
				// the sum of what came in under this one name, and nothing else
				total,
				partial: known.length !== rows.length,       // some figure is a dash
				pages: [...w.pages].sort((a, b) => a - b),
				// a good may stand in both printings, under different places
				source: from.length === 1 ? from[0] : 'gemischt',
				year,
			});
		}
		out.sort((a, b) => (b.total || 0) - (a.total || 0) || a.title.localeCompare(b.title, 'de'));
		return out;
	}

	// what the sum at the foot is honestly called. A filtered block does not
	// show what the place sent — it shows what it sent in the classes asked
	// for — and the line has to say so.
	const totalLabel = p =>
		p.filtered ? 'Werth der gewählten Waaren'
			: p.partial ? 'Werth, so weit beziffert'
				: 'Werth im Ganzen';

	T.Model = {
		years, plates, wares, placeNames, normalise, resolveUnits, isNetto, figure, NETTO,
		category, CATEGORIES, DEFAULT_CATS, totalLabel,
	};
})(window);

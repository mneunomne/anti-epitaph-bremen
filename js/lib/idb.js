// the desk's filing cabinet.
//
// projects live in indexeddb rather than localstorage because a source
// image is a megabyte or two and localstorage would refuse it (and would
// have to hold it base64'd, a third larger again). indexeddb takes the
// blob as it is.
//
// two stores. `projects` is the regular-wall desk. `plans` is the pallet
// layout: settings, three source images, and which positions have been
// through the machine.
(function () {
	const AE = (window.AE = window.AE || {});

	const NAME = 'anti-epigraph', VERSION = 2;
	const STORES = ['projects', 'plans'];
	let opening = null;

	function open() {
		if (opening) return opening;
		opening = new Promise((resolve, reject) => {
			const req = indexedDB.open(NAME, VERSION);
			// runs for a fresh database and for one made by the older
			// single-store version, so a v1 cabinet keeps its projects
			req.onupgradeneeded = () => {
				const db = req.result;
				for (const s of STORES) {
					if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return opening;
	}

	function run(store, mode, fn) {
		return open().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction(store, mode);
			const req = fn(tx.objectStore(store));
			tx.onerror = () => reject(tx.error);
			tx.oncomplete = () => resolve(req && req.result);
		}));
	}

	// several records in one transaction, for the odd bulk write
	function putAll(store, recs) {
		return run(store, 'readwrite', s => { recs.forEach(r => s.put(r)); });
	}

	const api = store => ({
		get: id => run(store, 'readonly', s => s.get(id)),
		all: () => run(store, 'readonly', s => s.getAll()),
		put: rec => run(store, 'readwrite', s => s.put(rec)),
		putAll: recs => putAll(store, recs),
		del: id => run(store, 'readwrite', s => s.delete(id)),
		clear: () => run(store, 'readwrite', s => s.clear())
	});

	AE.store = api;
	AE.db = api('projects');       // what the wall desk has always called it
	AE.dbPlans = api('plans');
})();

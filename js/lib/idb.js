// the desk's filing cabinet.
//
// projects live in indexeddb rather than localstorage because a source
// image is a megabyte or two and localstorage would refuse it (and would
// have to hold it base64'd, a third larger again). indexeddb takes the
// blob as it is.
(function () {
	const AE = (window.AE = window.AE || {});

	const NAME = 'anti-epigraph', VERSION = 1, STORE = 'projects';
	let opening = null;

	function open() {
		if (opening) return opening;
		opening = new Promise((resolve, reject) => {
			const req = indexedDB.open(NAME, VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return opening;
	}

	function run(mode, fn) {
		return open().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const req = fn(tx.objectStore(STORE));
			tx.onerror = () => reject(tx.error);
			tx.oncomplete = () => resolve(req && req.result);
		}));
	}

	AE.db = {
		get: id => run('readonly', s => s.get(id)),
		all: () => run('readonly', s => s.getAll()),
		put: rec => run('readwrite', s => s.put(rec)),
		del: id => run('readwrite', s => s.delete(id))
	};
})();

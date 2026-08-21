// minimal zip writer, store mode (no compression).
//
// the payload is almost entirely png and svg-wrapping-png, already
// deflated by the encoder, so compressing again buys nothing and would
// cost a dependency. this keeps the whole desk a folder of static files.
(function () {
	const AE = (window.AE = window.AE || {});

	const CRC_TABLE = (() => {
		const t = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
			t[i] = c >>> 0;
		}
		return t;
	})();

	function crc32(bytes) {
		let c = 0xFFFFFFFF;
		for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
		return (c ^ 0xFFFFFFFF) >>> 0;
	}

	// zip stores time in the 1980-epoch dos format, two packed 16-bit words
	function dosStamp(date) {
		const y = Math.max(1980, date.getFullYear());
		return {
			time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
			date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
		};
	}

	const encoder = new TextEncoder();

	class Zip {
		constructor() {
			this.entries = [];
			this.stamp = dosStamp(new Date());
		}

		// data may be a Uint8Array, ArrayBuffer or string
		add(name, data) {
			const bytes = typeof data === 'string' ? encoder.encode(data)
				: data instanceof Uint8Array ? data
					: new Uint8Array(data);
			this.entries.push({ name: encoder.encode(name), bytes, crc: crc32(bytes) });
			return this;
		}

		async addBlob(name, blob) {
			return this.add(name, await blob.arrayBuffer());
		}

		blob() {
			const LOCAL = 30, CENTRAL = 46, END = 22;
			let size = END;
			for (const e of this.entries) {
				size += LOCAL + e.name.length + e.bytes.length;   // local header + data
				size += CENTRAL + e.name.length;                  // central directory record
			}

			const out = new Uint8Array(size);
			const view = new DataView(out.buffer);
			let p = 0;
			const u16 = v => { view.setUint16(p, v, true); p += 2; };
			const u32 = v => { view.setUint32(p, v >>> 0, true); p += 4; };
			const raw = b => { out.set(b, p); p += b.length; };

			for (const e of this.entries) {
				e.offset = p;
				u32(0x04034b50);
				u16(20);                    // version needed
				u16(0x0800);                // utf-8 filenames
				u16(0);                     // stored
				u16(this.stamp.time); u16(this.stamp.date);
				u32(e.crc);
				u32(e.bytes.length); u32(e.bytes.length);
				u16(e.name.length); u16(0);
				raw(e.name);
				raw(e.bytes);
			}

			const dirStart = p;
			for (const e of this.entries) {
				u32(0x02014b50);
				u16(20); u16(20);
				u16(0x0800);
				u16(0);
				u16(this.stamp.time); u16(this.stamp.date);
				u32(e.crc);
				u32(e.bytes.length); u32(e.bytes.length);
				u16(e.name.length); u16(0); u16(0);   // name, extra, comment
				u16(0); u16(0);                       // disk, internal attrs
				u32(0);                               // external attrs
				u32(e.offset);
				raw(e.name);
			}

			// take the directory's length before the end record starts
			// writing — p is a moving cursor, not a mark
			const dirEnd = p;
			u32(0x06054b50);
			u16(0); u16(0);
			u16(this.entries.length); u16(this.entries.length);
			u32(dirEnd - dirStart); u32(dirStart);
			u16(0);

			return new Blob([out], { type: 'application/zip' });
		}
	}

	function download(blob, filename) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 4000);
	}


	/* ------------------------------------------------------------ reading */

	// A zip is written here and read back at the other end of the desk, so the
	// reader is the writer turned round and nothing more. It walks the central
	// directory rather than the local headers, because the directory is the
	// only part of a zip that is authoritative about what is in it.
	//
	// Stored entries are handed straight out. Deflated ones — anything that
	// came back through another tool on its way across — go through the
	// platform's own inflater, which every browser that can run the yard has.
	async function read(blob) {
		const buf = new Uint8Array(await blob.arrayBuffer());
		const view = new DataView(buf.buffer);

		// the end record sits at the tail, behind a comment of up to 64k
		let end = -1;
		const floor = Math.max(0, buf.length - 22 - 65535);
		for (let i = buf.length - 22; i >= floor; i--) {
			if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
		}
		if (end < 0) throw new Error('that file is not a zip');

		const count = view.getUint16(end + 10, true);
		let p = view.getUint32(end + 16, true);
		const decoder = new TextDecoder();
		const out = [];

		for (let i = 0; i < count; i++) {
			if (view.getUint32(p, true) !== 0x02014b50) throw new Error('the zip directory is damaged');
			const method = view.getUint16(p + 10, true);
			const packed = view.getUint32(p + 20, true);
			const nameLen = view.getUint16(p + 28, true);
			const extraLen = view.getUint16(p + 30, true);
			const commentLen = view.getUint16(p + 32, true);
			const at = view.getUint32(p + 42, true);
			const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
			p += 46 + nameLen + extraLen + commentLen;

			// the local header carries its own name and extra lengths, and they
			// are not always the directory's — the data starts after them
			const lName = view.getUint16(at + 26, true);
			const lExtra = view.getUint16(at + 28, true);
			const from = at + 30 + lName + lExtra;
			let bytes = buf.subarray(from, from + packed);

			if (method === 8) {
				if (!window.DecompressionStream) throw new Error('this browser cannot unzip a compressed entry');
				const s = new Blob([bytes]).stream()
					.pipeThrough(new window.DecompressionStream('deflate-raw'));
				bytes = new Uint8Array(await new Response(s).arrayBuffer());
			} else if (method !== 0) {
				throw new Error('unknown compression in ' + name);
			}
			if (name.endsWith('/')) continue;                 // a folder holds nothing
			out.push(new File([bytes], name.split('/').pop(), { type: guess(name) }));
		}
		return out;
	}

	const guess = name => /\.png$/i.test(name) ? 'image/png'
		: /\.json$/i.test(name) ? 'application/json'
			: /\.(txt|md)$/i.test(name) ? 'text/plain' : '';

	Zip.read = read;
	AE.Zip = Zip;
	AE.download = download;
})();

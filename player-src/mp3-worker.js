/**
 * MP3 encoder for saved takes, run off the main thread so the page stays
 * responsive. LAME compiled to WebAssembly (wasm-media-encoders, MIT; LAME
 * itself is LGPL - see THIRD-PARTY-LICENSES.txt).
 *
 * In:  { wasmUrl, sampleRate, bitrate, channels: [Float32Array, ...] }
 * Out: { progress: 0..1 } ... then { blob } or { error }
 */
import { createEncoder } from 'wasm-media-encoders';

self.onmessage = async (e) => {
	const { wasmUrl, sampleRate, bitrate, channels } = e.data || {};
	try {
		// Fetch the binary ourselves: compileStreaming needs an application/wasm
		// content type, which not every server sends.
		const res = await fetch(wasmUrl, { credentials: 'omit' });
		if (!res.ok) throw new Error('encoder download failed (' + res.status + ')');
		const wasm = await res.arrayBuffer();
		const enc = await createEncoder('audio/mpeg', wasm);
		enc.configure({ sampleRate, channels: channels.length, bitrate: bitrate || 160 });
		const total = channels[0].length;
		const step = sampleRate; // one second per call
		const parts = [];
		let last = 0;
		for (let i = 0; i < total; i += step) {
			const out = enc.encode(channels.map((c) => c.subarray(i, Math.min(total, i + step))));
			parts.push(out.slice()); // the encoder reuses its output buffer
			const p = Math.min(1, (i + step) / total);
			if (p - last >= 0.02) {
				last = p;
				self.postMessage({ progress: p });
			}
		}
		parts.push(enc.finalize().slice());
		self.postMessage({ blob: new Blob(parts, { type: 'audio/mpeg' }) });
	} catch (err) {
		self.postMessage({ error: String((err && err.message) || err) });
	}
};

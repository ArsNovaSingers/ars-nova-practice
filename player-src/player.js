/**
 * Ars Nova practice player — one practice track per player.
 *
 * Jonathan, 2026-09-17: each practice track gets its own player. The player
 * opens with that one track loaded; pressing Record plays it from the start
 * and records the singer onto a new take track underneath ("Take 1",
 * "Take 2"…). Transport is three icon buttons side by side — green Play,
 * red Record, black Stop. Mute / Solo / Volume / Pan sit on each track. A zoom
 * tool, the timing correction under the tracks, and "select a take, delete it,
 * try again".
 *
 * Built on @dawcore/components from waveform-playlist (MIT,
 * https://github.com/naomiaro/waveform-playlist). The per-track controls are
 * the library's own; the transport, zoom and take handling are ours.
 *
 * The browser records the MICROPHONE ONLY — never what the page is playing —
 * so with headphones the take is the voice alone. Nothing is uploaded in this
 * version: takes can be played back and downloaded as .wav.
 *
 * mountPlayer(host, opts) returns { destroy() }.
 *   opts.tracks     [{ title, src, part, pan: 'left'|'center'|'right', muted }]
 *                   (normally exactly one; more are allowed and play together)
 *   opts.recording  boolean — offer the Record button
 *   opts.strings    UI text (all optional; English defaults below)
 *   opts.onListen   function(seconds) — listened time, in pieces
 *   opts.onError    function(message, detail)
 */
import '@dawcore/components';
import { NativePlayoutAdapter } from '@dawcore/transport';

const PAN = { left: -1, center: 0, right: 1 };

const DEFAULT_STRINGS = {
	play: 'Play',
	pause: 'Pause',
	record: 'Record',
	stopRecord: 'Stop recording',
	stop: 'Stop and go back to the start',
	zoomIn: 'Zoom in',
	zoomOut: 'Zoom out',
	zoomFit: 'Fit the whole piece',
	loading: 'Loading the track…',
	ready: 'Ready',
	loadFailed: 'The track could not be loaded. Try again, or open it from Program Materials.',
	micAsk: 'Allow the microphone when your browser asks.',
	micDenied: 'The microphone could not be turned on. Check that this site is allowed to use it.',
	recording: 'Recording… sing along.',
	takeDone: 'Take %s saved in this page. Press Play to hear it with the music.',
	take: 'Take %s',
	track: 'Track %s',
	correction: 'Timing correction',
	correctionHelp: 'If your takes sound late against the music, move this to the right before recording again.',
	latency: 'measured delay %s ms',
	deleteTake: 'Delete the selected take',
	deleteHint: 'Click a take to select it, then delete it to try again.',
	download: 'Download the selected take (.wav)',
	headphones: 'Use WIRED headphones. Only your microphone is recorded, not the music. Bluetooth headphones add a delay.',
	notSaved: 'Takes stay in this page and are not uploaded. Download one to keep it.',
};

const ICONS = {
	play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
	pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
	record: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>',
	stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
	zoomIn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10zm-1 2h2v2h2v2h-2v2H9v-2H7V9h2z"/></svg>',
	zoomOut: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10zM7 9h6v2H7z"/></svg>',
	fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2v14H3zM19 5h2v14h-2zM7 11h10v2H7zm0 0l3-3v8zm10 0l-3-3v8z"/></svg>',
	trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
	download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9l3-3 1.4 1.4L12 15.8l-5.4-5.4L8 9l3 3zM4 18h16v2H4z"/></svg>',
};

let uid = 0;

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v === null || v === undefined || v === false) continue;
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else if (k === 'html') node.innerHTML = v;
		else node.setAttribute(k, v === true ? '' : String(v));
	}
	for (const c of [].concat(children)) {
		if (c) node.append(c);
	}
	return node;
}

function iconButton(kind, label, extra = '') {
	return el('button', {
		type: 'button',
		class: 'anpr-icon anpr-icon--' + kind + (extra ? ' ' + extra : ''),
		'aria-label': label,
		title: label,
		html: ICONS[kind],
	});
}

function fmt(sec) {
	if (!isFinite(sec) || sec < 0) sec = 0;
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return m + ':' + String(s).padStart(2, '0');
}

/** 16-bit PCM WAV from an AudioBuffer, skipping `skip` samples at the start. */
function toWav(buffer, skip = 0) {
	const ch = Math.min(2, buffer.numberOfChannels);
	const start = Math.min(skip, buffer.length);
	const len = buffer.length - start;
	const rate = buffer.sampleRate;
	const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
	const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
	w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE');
	w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true);
	data.setUint16(22, ch, true); data.setUint32(24, rate, true);
	data.setUint32(28, rate * ch * 2, true); data.setUint16(32, ch * 2, true);
	data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
	const chans = [];
	for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
	let o = 44;
	for (let i = start; i < buffer.length; i++) {
		for (let c = 0; c < ch; c++) {
			const v = Math.max(-1, Math.min(1, chans[c][i]));
			data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
			o += 2;
		}
	}
	return new Blob([data], { type: 'audio/wav' });
}

export function mountPlayer(host, opts = {}) {
	const S = Object.assign({}, DEFAULT_STRINGS, opts.strings || {});
	const tracks = Array.isArray(opts.tracks) ? opts.tracks : [];
	const onListen = typeof opts.onListen === 'function' ? opts.onListen : () => {};
	const onError = typeof opts.onError === 'function' ? opts.onError : () => {};
	const canRecord = !!opts.recording && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

	const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
	const adapter = new NativePlayoutAdapter(ctx);

	// ---------- transport row ----------
	const playBtn = iconButton('play', S.play);
	const recBtn = canRecord ? iconButton('record', S.record) : null;
	const stopBtn = iconButton('stop', S.stop);
	[playBtn, stopBtn].concat(recBtn ? [recBtn] : []).forEach((b) => { b.disabled = true; });
	const timeOut = el('span', { class: 'anpr-time', text: '0:00 / 0:00' });
	const status = el('span', { class: 'anpr-status', role: 'status', text: S.loading });

	const zoomOutBtn = iconButton('zoomOut', S.zoomOut, 'anpr-icon--small');
	const zoomInBtn = iconButton('zoomIn', S.zoomIn, 'anpr-icon--small');
	const fitBtn = iconButton('fit', S.zoomFit, 'anpr-icon--small');
	const zoomGroup = el('span', { class: 'anpr-zoom', role: 'group', 'aria-label': 'Zoom' }, [zoomOutBtn, zoomInBtn, fitBtn]);

	const transport = el('div', { class: 'anpr-transport', role: 'group', 'aria-label': 'Transport' },
		[playBtn].concat(recBtn ? [recBtn] : []).concat([stopBtn]));
	const bar = el('div', { class: 'anpr-player-bar' }, [transport, timeOut, status, zoomGroup]);

	// ---------- tracks ----------
	const editor = el('daw-editor', {
		id: 'anpr-daw-' + (++uid),
		class: 'anpr-daw',
		'samples-per-pixel': 8192,
		'wave-height': 100,
		timescale: true,
		mono: true,
		'eager-resume': true,
	});
	editor.adapter = adapter;

	const practiceIds = new Set();
	tracks.forEach((t, i) => {
		const pan = PAN[t.pan] !== undefined ? t.pan : 'center';
		const name = (tracks.length > 1 ? S.track.replace('%s', String(i + 1)) + ' · ' : '') + (t.title || '');
		const tEl = el('daw-track', { src: t.src, name, muted: !!t.muted });
		tEl.volume = 1;
		tEl.pan = PAN[pan];
		editor.append(tEl);
		practiceIds.add(tEl.trackId);
	});

	// ---------- under the tracks: timing, takes ----------
	let takeTools = null;
	let corr = null;
	let latencyOut = null;
	let deleteBtn = null;
	let dlLink = null;
	if (canRecord) {
		corr = el('input', { type: 'range', min: -300, max: 300, step: 10, value: 0, 'aria-describedby': '' });
		const corrOut = el('output', { text: '0 ms' });
		corr.addEventListener('input', () => { corrOut.textContent = corr.value + ' ms'; });
		latencyOut = el('span', { class: 'anpr-latency' });
		deleteBtn = iconButton('trash', S.deleteTake, 'anpr-icon--small');
		deleteBtn.disabled = true;
		dlLink = el('a', { class: 'anpr-icon anpr-icon--small anpr-icon--download', 'aria-label': S.download, title: S.download, html: ICONS.download, hidden: true });
		takeTools = el('div', { class: 'anpr-under' }, [
			el('label', { class: 'anpr-rec-corr' }, [el('span', { text: S.correction }), corr, corrOut, latencyOut]),
			el('p', { class: 'anpr-rec-help', text: S.correctionHelp }),
			el('div', { class: 'anpr-take-tools' }, [deleteBtn, dlLink, el('span', { class: 'anpr-rec-help', text: S.deleteHint })]),
			el('p', { class: 'anpr-rec-help', text: S.headphones + ' ' + S.notSaved }),
		]);
	}

	const wrap = el('div', { class: 'anpr-player' }, [bar, editor].concat(takeTools ? [takeTools] : []));
	host.replaceChildren(wrap);

	// Practice tracks must never be removable from the page; only our own
	// Delete button removes takes. The library's × is hidden and its event
	// swallowed before the editor sees it.
	wrap.addEventListener('daw-track-remove', (e) => { e.stopPropagation(); }, true);
	const HIDE_CSS = '.remove-btn{display:none !important}';
	function hideRemoveButtons() {
		const root = editor.shadowRoot;
		if (!root) return;
		root.querySelectorAll('daw-track-controls').forEach((c) => {
			if (c.shadowRoot && !c.shadowRoot.querySelector('style[data-anpr]')) {
				const st = document.createElement('style');
				st.setAttribute('data-anpr', '');
				st.textContent = HIDE_CSS;
				c.shadowRoot.append(st);
			}
		});
	}
	const hideTimer = setInterval(hideRemoveButtons, 400);

	// ---------- zoom ----------
	const MIN_SPP = 128;
	function fitSpp() {
		const d = editor.duration;
		const w = editor.getBoundingClientRect().width - 200;
		return d > 0 && w > 100 ? Math.max(MIN_SPP, Math.ceil((d * ctx.sampleRate) / w)) : 8192;
	}
	function setSpp(v) {
		const spp = Math.max(MIN_SPP, Math.min(fitSpp(), Math.round(v)));
		editor.setAttribute('samples-per-pixel', String(spp));
		zoomOutBtn.disabled = spp >= fitSpp();
		zoomInBtn.disabled = spp <= MIN_SPP;
	}
	const currentSpp = () => Number(editor.getAttribute('samples-per-pixel')) || fitSpp();
	zoomInBtn.addEventListener('click', () => setSpp(currentSpp() / 2));
	zoomOutBtn.addEventListener('click', () => setSpp(currentSpp() * 2));
	fitBtn.addEventListener('click', () => setSpp(fitSpp()));

	// ---------- listening time ----------
	let playingSince = 0;
	function flushListen() {
		if (playingSince) {
			const now = performance.now();
			const secs = (now - playingSince) / 1000;
			playingSince = now;
			if (secs > 0.25) onListen(secs);
		}
	}
	const tick = setInterval(() => { if (playingSince) flushListen(); }, 10000);

	function showPlaying(on) {
		playBtn.innerHTML = on ? ICONS.pause : ICONS.play;
		playBtn.setAttribute('aria-label', on ? S.pause : S.play);
		playBtn.title = on ? S.pause : S.play;
		playBtn.classList.toggle('is-on', on);
		if (on) {
			if (!playingSince) playingSince = performance.now();
		} else {
			flushListen();
			playingSince = 0;
		}
	}
	editor.addEventListener('daw-play', () => showPlaying(true));
	editor.addEventListener('daw-pause', () => showPlaying(false));
	editor.addEventListener('daw-stop', () => showPlaying(false));
	editor.addEventListener('daw-timeupdate', (e) => {
		const t = e.detail && typeof e.detail.time === 'number' ? e.detail.time : editor.currentTime;
		timeOut.textContent = fmt(t) + ' / ' + fmt(editor.duration);
	});
	const failed = (e) => {
		status.textContent = S.loadFailed;
		status.classList.add('is-error');
		onError(S.loadFailed, e && e.detail);
	};
	editor.addEventListener('daw-track-error', failed);
	editor.addEventListener('daw-error', (e) => onError('player error', e && e.detail));

	const resume = async () => { try { if (ctx.state !== 'running') await ctx.resume(); } catch (err) { /* ignore */ } };

	playBtn.addEventListener('click', async () => {
		await resume();
		if (editor.isRecording) return;
		if (editor.isPlaying) editor.pause();
		else editor.play();
	});
	stopBtn.addEventListener('click', () => {
		if (editor.isRecording) editor.stopRecording();
		if (editor.isPlaying) editor.stop();
		editor.seekTo(0);
		timeOut.textContent = fmt(0) + ' / ' + fmt(editor.duration);
	});

	// ---------- recording ----------
	let stream = null;
	let measured = 0;
	let takeCount = 0;
	const takes = new Map(); // trackId -> { el, buffer, offset, n }
	let selectedTake = null;
	let onKey = null;

	async function ensureMic() {
		if (stream) return true;
		status.textContent = S.micAsk;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } },
			});
		} catch (err) {
			status.textContent = S.micDenied;
			status.classList.add('is-error');
			onError(S.micDenied, err);
			return false;
		}
		editor.recordingStream = stream;
		const tr = stream.getAudioTracks()[0];
		const settings = tr && tr.getSettings ? tr.getSettings() : {};
		const input = typeof settings.latency === 'number' ? settings.latency : 0;
		measured = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + input;
		if (latencyOut) latencyOut.textContent = '(' + S.latency.replace('%s', String(Math.round(measured * 1000))) + ')';
		return true;
	}

	function selectTake(id) {
		selectedTake = id && takes.has(id) ? id : null;
		const t = selectedTake ? takes.get(selectedTake) : null;
		if (deleteBtn) deleteBtn.disabled = !t;
		if (dlLink) {
			if (t && t.url) {
				dlLink.href = t.url;
				dlLink.download = 'practice-take-' + t.n + '.wav';
				dlLink.hidden = false;
			} else {
				dlLink.hidden = true;
			}
		}
	}

	function deleteSelectedTake() {
		const t = selectedTake && takes.get(selectedTake);
		if (!t || editor.isRecording) return;
		if (editor.isPlaying) editor.stop();
		t.el.remove();
		if (t.url) URL.revokeObjectURL(t.url);
		takes.delete(selectedTake);
		selectTake(null);
		status.textContent = S.ready;
	}

	if (recBtn) {
		recBtn.addEventListener('click', async () => {
			if (editor.isRecording) {
				editor.stopRecording();
				return;
			}
			await resume();
			if (!(await ensureMic())) return;
			if (editor.isPlaying) editor.stop();
			takeCount += 1;
			const n = takeCount;
			const takeEl = el('daw-track', { name: S.take.replace('%s', String(n)) });
			editor.append(takeEl);
			takes.set(takeEl.trackId, { el: takeEl, buffer: null, offset: 0, url: '', n });
			await new Promise((r) => setTimeout(r, 60)); // let the editor register it
			editor.seekTo(0);
			const offset = Math.max(0, measured + Number(corr ? corr.value : 0) / 1000);
			await editor.startRecording(stream, {
				trackId: takeEl.trackId,
				overdub: true,
				latencyOffset: offset,
				clipName: S.take.replace('%s', String(n)),
			});
			if (editor.isRecording) {
				recBtn.classList.add('is-on');
				recBtn.setAttribute('aria-label', S.stopRecord);
				recBtn.title = S.stopRecord;
				playBtn.disabled = true;
				status.classList.remove('is-error');
				status.textContent = S.recording;
			}
		});

		editor.addEventListener('daw-recording-complete', (e) => {
			recBtn.classList.remove('is-on');
			recBtn.setAttribute('aria-label', S.record);
			recBtn.title = S.record;
			playBtn.disabled = false;
			const t = takes.get(e.detail.trackId);
			if (t) {
				t.buffer = e.detail.audioBuffer;
				t.offset = e.detail.offsetSamples || 0;
				t.url = URL.createObjectURL(toWav(t.buffer, t.offset));
				status.textContent = S.takeDone.replace('%s', String(t.n));
				selectTake(e.detail.trackId);
			}
			if (editor.isPlaying) editor.stop();
			editor.seekTo(0);
		});

		editor.addEventListener('daw-track-select', (e) => selectTake(e.detail && e.detail.trackId));
		deleteBtn.addEventListener('click', deleteSelectedTake);
		// Clicking a lane does not move keyboard focus, so listen on the page.
		// Only one player is open at a time, and only a selected TAKE is deleted.
		onKey = (e) => {
			if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTake && !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '') && !(e.target && e.target.isContentEditable)) {
				e.preventDefault();
				deleteSelectedTake();
			}
		};
		document.addEventListener('keydown', onKey);
	}

	// ---------- ready ----------
	let destroyed = false;
	Promise.resolve(editor.ready ? editor.ready() : null).then(() => {
		if (destroyed) return;
		let tries = 0;
		const waitDuration = () => {
			if (destroyed) return;
			if (editor.duration > 0) {
				[playBtn, stopBtn].concat(recBtn ? [recBtn] : []).forEach((b) => { b.disabled = false; });
				if (status.textContent === S.loading) status.textContent = S.ready;
				timeOut.textContent = fmt(editor.currentTime) + ' / ' + fmt(editor.duration);
				setSpp(fitSpp());
				hideRemoveButtons();
			} else if (tries++ < 100) {
				setTimeout(waitDuration, 100);
			} else if (!status.classList.contains('is-error')) {
				failed();
			}
		};
		waitDuration();
	}).catch(failed);

	return {
		destroy() {
			destroyed = true;
			try { if (editor.isRecording) editor.stopRecording(); } catch (err) { /* ignore */ }
			try { if (editor.isPlaying) editor.stop(); } catch (err) { /* ignore */ }
			flushListen();
			playingSince = 0;
			clearInterval(tick);
			clearInterval(hideTimer);
			if (onKey) document.removeEventListener('keydown', onKey);
			if (stream) stream.getTracks().forEach((t) => t.stop());
			takes.forEach((t) => { if (t.url) URL.revokeObjectURL(t.url); });
			host.replaceChildren();
			try { ctx.close(); } catch (err) { /* ignore */ }
		},
		editor,
	};
}

export default mountPlayer;

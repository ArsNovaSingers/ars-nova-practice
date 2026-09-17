/**
 * Ars Nova practice player.
 *
 * A small multitrack player for singers: every practice track attached to a
 * task plays in sync, and each one has its own Mute, Volume and Ear
 * (left / both / right) controls — the "backing track in both ears, my part in
 * my left ear" way of practising.
 *
 * Built on @dawcore/components from waveform-playlist (MIT,
 * https://github.com/naomiaro/waveform-playlist). The library draws the
 * waveforms and does the audio; the big, touch-friendly controls are ours,
 * because a singer on an iPad needs buttons, not a studio mixer.
 *
 * RECORDING (test feature). The browser records the MICROPHONE ONLY — never
 * what the page is playing — so with headphones on, the take is the singer's
 * voice alone. Each press of Record adds a new take track ("Take 1", "Take 2"…)
 * under the practice tracks, so the player always opens with just the music.
 * Takes stay in this browser tab (play back, download as .wav); nothing is
 * uploaded in this version.
 *
 * mountPlayer(host, opts) returns { destroy() }.
 *   opts.tracks     [{ title, src, part, pan: 'left'|'center'|'right', muted }]
 *   opts.recording  boolean — show the recording test panel
 *   opts.strings    UI text (all optional; English defaults below)
 *   opts.onListen   function(seconds) — called with listened time, in pieces
 *   opts.onError    function(message)
 */
import '@dawcore/components';
import { NativePlayoutAdapter } from '@dawcore/transport';

const PAN = { left: -1, center: 0, right: 1 };

const DEFAULT_STRINGS = {
	play: 'Play',
	pause: 'Pause',
	restart: 'Back to start',
	loading: 'Loading the tracks…',
	ready: 'Ready',
	loadFailed: 'A track could not be loaded. Try again, or open it from Program Materials.',
	mute: 'Mute',
	unmute: 'Unmute',
	volume: 'Volume',
	ear: 'Ear',
	left: 'Left',
	both: 'Both',
	right: 'Right',
	recTitle: 'Record a practice take (test)',
	recHelp: 'Use WIRED headphones. The page records only your microphone, not the music, so your take is your voice alone. Bluetooth headphones (AirPods) add a delay and switch to a low-quality microphone.',
	micOn: 'Turn on the microphone',
	micDenied: 'The microphone could not be turned on. Check that this site is allowed to use it.',
	micReady: 'Microphone on.',
	latency: 'Measured delay: %s ms',
	correction: 'Timing correction',
	correctionHelp: 'If your take sounds late against the music, move this right and record again.',
	record: 'Record',
	stopRecord: 'Stop recording',
	recording: 'Recording… sing along.',
	takeDone: 'Take saved in this page. Press Back to start, then Play, to hear it with the music.',
	take: 'Take %s',
	track: 'Track %s',
	trackFailed: 'This track could not be loaded.',
	takeOnly: 'Hear my take only',
	withMusic: 'Hear it with the music',
	download: 'Download my take (.wav)',
	yourTake: 'Your take',
	notSaved: 'Takes are not uploaded anywhere in this test. They disappear when you leave the page unless you download them.',
};

let uid = 0;

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v === null || v === undefined || v === false) continue;
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
		else node.setAttribute(k, v === true ? '' : String(v));
	}
	for (const c of [].concat(children)) {
		if (c) node.append(c);
	}
	return node;
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
	const editorId = 'anpr-daw-' + (++uid);

	const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
	const adapter = new NativePlayoutAdapter(ctx);

	// ---------- layout ----------
	const playBtn = el('button', { type: 'button', class: 'anpr-btn anpr-btn--primary anpr-play', disabled: true, text: S.play });
	const restartBtn = el('button', { type: 'button', class: 'anpr-btn anpr-restart', disabled: true, text: S.restart });
	const timeOut = el('span', { class: 'anpr-time', 'aria-live': 'off', text: '0:00 / 0:00' });
	const status = el('span', { class: 'anpr-status', role: 'status', text: S.loading });
	const bar = el('div', { class: 'anpr-player-bar' }, [playBtn, restartBtn, timeOut, status]);

	const editor = el('daw-editor', {
		id: editorId,
		class: 'anpr-daw',
		'samples-per-pixel': 8192,
		'wave-height': 44,
		timescale: true,
		mono: true,
		'eager-resume': true,
	});
	editor.adapter = adapter;

	const mixer = el('ul', { class: 'anpr-mixer' });
	const trackEls = [];
	const rowsByTrack = new Map();
	tracks.forEach((t, i) => {
		const pan = PAN[t.pan] !== undefined ? t.pan : 'center';
		const label = S.track.replace('%s', String(i + 1)) + ' · ' + (t.title || '');
		const tEl = el('daw-track', { src: t.src, name: label, muted: !!t.muted });
		tEl.volume = 1;
		tEl.pan = PAN[pan];
		editor.append(tEl);
		trackEls.push(tEl);
		const row = mixerRow(tEl, Object.assign({}, t, { title: label }), pan);
		rowsByTrack.set(tEl.trackId, row);
		mixer.append(row);
	});

	// Takes are added when the singer presses Record, never before.
	let takeEl = null;
	let takeCount = 0;

	const wrap = el('div', { class: 'anpr-player' }, [bar, editor, mixer]);
	let rec = null;
	if (opts.recording) {
		rec = recordingPanel();
		wrap.append(rec.node);
	}
	host.replaceChildren(wrap);

	function mixerRow(tEl, t, pan) {
		const name = el('span', { class: 'anpr-mix-name', text: t.title || '' });
		const part = t.part ? el('span', { class: 'anpr-mix-part', text: t.part }) : null;
		const muteBtn = el('button', {
			type: 'button',
			class: 'anpr-btn anpr-mute',
			'aria-pressed': t.muted ? 'true' : 'false',
			text: t.muted ? S.unmute : S.mute,
		});
		const showMute = (on) => {
			muteBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
			muteBtn.textContent = on ? S.unmute : S.mute;
		};
		muteBtn.addEventListener('click', () => {
			if (tEl.hasAttribute('muted')) tEl.removeAttribute('muted');
			else tEl.setAttribute('muted', '');
		});
		// The waveform header has its own M button; keep ours in step with it.
		new MutationObserver(() => showMute(tEl.hasAttribute('muted'))).observe(tEl, { attributes: true, attributeFilter: ['muted'] });
		const vol = el('input', { type: 'range', min: 0, max: 100, step: 1, value: 100, 'aria-label': S.volume + ': ' + (t.title || '') });
		vol.addEventListener('input', () => { tEl.volume = Number(vol.value) / 100; });
		const ears = el('span', { class: 'anpr-ears', role: 'group', 'aria-label': S.ear });
		for (const [key, label] of [['left', S.left], ['center', S.both], ['right', S.right]]) {
			const b = el('button', { type: 'button', class: 'anpr-btn anpr-ear', 'aria-pressed': key === pan ? 'true' : 'false', 'data-ear': key, text: label });
			b.addEventListener('click', () => {
				tEl.pan = PAN[key];
				ears.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
			});
			ears.append(b);
		}
		return el('li', { class: 'anpr-mix-row' }, [
			el('div', { class: 'anpr-mix-label' }, [name, part]),
			el('div', { class: 'anpr-mix-controls' }, [
				muteBtn,
				el('label', { class: 'anpr-vol' }, [el('span', { class: 'anpr-sr', text: S.volume }), vol]),
				ears,
			]),
		]);
	}

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

	function setPlaying(on) {
		playBtn.textContent = on ? S.pause : S.play;
		playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
		if (on) {
			if (!playingSince) playingSince = performance.now();
		} else {
			flushListen();
			playingSince = 0;
		}
	}

	editor.addEventListener('daw-play', () => setPlaying(true));
	editor.addEventListener('daw-pause', () => setPlaying(false));
	editor.addEventListener('daw-stop', () => setPlaying(false));
	editor.addEventListener('daw-timeupdate', (e) => {
		const t = e.detail && typeof e.detail.time === 'number' ? e.detail.time : editor.currentTime;
		timeOut.textContent = fmt(t) + ' / ' + fmt(editor.duration);
	});
	const failed = (e) => {
		status.textContent = S.loadFailed;
		const id = e && e.detail && e.detail.trackId;
		const row = id && rowsByTrack.get(id);
		if (row && !row.querySelector('.anpr-mix-error')) {
			row.classList.add('is-failed');
			row.querySelector('.anpr-mix-label').append(el('span', { class: 'anpr-mix-error', text: S.trackFailed }));
		}
		onError(S.loadFailed, e && e.detail);
	};
	editor.addEventListener('daw-track-error', failed);
	editor.addEventListener('daw-error', (e) => onError('player error', e && e.detail));

	playBtn.addEventListener('click', async () => {
		try { if (ctx.state !== 'running') await ctx.resume(); } catch (err) { /* ignore */ }
		if (editor.isPlaying) editor.pause();
		else editor.play();
	});
	restartBtn.addEventListener('click', () => {
		const was = editor.isPlaying;
		if (was) editor.stop();
		editor.seekTo(0);
		timeOut.textContent = fmt(0) + ' / ' + fmt(editor.duration);
		if (was) editor.play(0);
	});

	// The library's own track header has a "remove track" button. Singers must
	// not be able to delete a practice track from the page, so the request is
	// swallowed before it reaches the editor and the button is hidden.
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
	const hideTimer = setInterval(hideRemoveButtons, 500);

	// Fit the whole piece to the width available, so a singer never has to
	// scroll sideways to find the start or the end.
	function fitToWidth() {
		const d = editor.duration;
		const w = editor.getBoundingClientRect().width - 130;
		if (d > 0 && w > 100) {
			const spp = Math.max(256, Math.ceil((d * ctx.sampleRate) / w));
			editor.setAttribute('samples-per-pixel', String(spp));
			return true;
		}
		return false;
	}

	let destroyed = false;
	Promise.resolve(editor.ready ? editor.ready() : null).then(() => {
		if (destroyed) return;
		playBtn.disabled = false;
		restartBtn.disabled = false;
		if (status.textContent === S.loading) status.textContent = S.ready;
		if (rec) rec.enable();
		let tries = 0;
		const waitDuration = () => {
			if (destroyed) return;
			if (editor.duration > 0) {
				timeOut.textContent = fmt(editor.currentTime) + ' / ' + fmt(editor.duration);
				fitToWidth();
				hideRemoveButtons();
			} else if (tries++ < 50) {
				setTimeout(waitDuration, 100);
			}
		};
		waitDuration();
	}).catch(failed);

	// ---------- recording test ----------
	function recordingPanel() {
		let stream = null;
		let lastBuffer = null;
		let lastOffset = 0;
		let takeOnly = false;
		const micBtn = el('button', { type: 'button', class: 'anpr-btn', disabled: true, text: S.micOn });
		const recBtn = el('button', { type: 'button', class: 'anpr-btn anpr-btn--rec', disabled: true, text: S.record });
		const recStatus = el('p', { class: 'anpr-rec-status', role: 'status' });
		const latencyOut = el('span', { class: 'anpr-latency' });
		const corr = el('input', { type: 'range', min: -300, max: 300, step: 10, value: 0 });
		const corrOut = el('output', { text: '0 ms' });
		corr.addEventListener('input', () => { corrOut.textContent = corr.value + ' ms'; });
		const soloBtn = el('button', { type: 'button', class: 'anpr-btn', disabled: true, text: S.takeOnly });
		const dl = el('a', { class: 'anpr-btn', hidden: true, download: 'practice-take.wav', text: S.download });
		let measured = 0;

		micBtn.addEventListener('click', async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: false,
						noiseSuppression: false,
						autoGainControl: false,
						channelCount: { ideal: 1 },
					},
				});
				editor.recordingStream = stream;
				const trackSettings = stream.getAudioTracks()[0] && stream.getAudioTracks()[0].getSettings ? stream.getAudioTracks()[0].getSettings() : {};
				const input = typeof trackSettings.latency === 'number' ? trackSettings.latency : 0;
				measured = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + input;
				latencyOut.textContent = S.latency.replace('%s', String(Math.round(measured * 1000)));
				recStatus.textContent = S.micReady;
				micBtn.disabled = true;
				recBtn.disabled = false;
			} catch (err) {
				recStatus.textContent = S.micDenied;
				onError(S.micDenied, err);
			}
		});

		recBtn.addEventListener('click', async () => {
			if (!stream) return;
			if (editor.isRecording) {
				editor.stopRecording();
				return;
			}
			try { if (ctx.state !== 'running') await ctx.resume(); } catch (err) { /* ignore */ }
			// A fresh track for this take, added under the practice tracks.
			if (takeOnly && takeEl) takeEl.removeAttribute('soloed');
			takeCount += 1;
			takeEl = el('daw-track', { name: S.take.replace('%s', String(takeCount)) });
			editor.append(takeEl);
			await new Promise((r) => setTimeout(r, 60)); // let the editor register it
			const trackId = takeEl.trackId;
			const offset = Math.max(0, measured + Number(corr.value) / 1000);
			await editor.startRecording(stream, {
				trackId,
				overdub: true,
				latencyOffset: offset,
				clipName: S.take.replace('%s', String(takeCount)),
			});
			if (editor.isRecording) {
				recBtn.textContent = S.stopRecord;
				recBtn.classList.add('is-recording');
				recStatus.textContent = S.recording;
			}
		});

		editor.addEventListener('daw-recording-complete', (e) => {
			recBtn.textContent = S.record;
			recBtn.classList.remove('is-recording');
			recStatus.textContent = S.takeDone;
			lastBuffer = e.detail.audioBuffer;
			lastOffset = e.detail.offsetSamples || 0;
			if (dl.href) URL.revokeObjectURL(dl.href);
			dl.href = URL.createObjectURL(toWav(lastBuffer, lastOffset));
			dl.hidden = false;
			soloBtn.disabled = false;
			takeOnly = false;
			soloBtn.textContent = S.takeOnly;
			soloBtn.setAttribute('aria-pressed', 'false');
			dl.download = 'practice-take-' + takeCount + '.wav';
		});

		soloBtn.addEventListener('click', () => {
			if (!takeEl) return;
			takeOnly = !takeOnly;
			if (takeOnly) takeEl.setAttribute('soloed', '');
			else takeEl.removeAttribute('soloed');
			soloBtn.textContent = takeOnly ? S.withMusic : S.takeOnly;
			soloBtn.setAttribute('aria-pressed', takeOnly ? 'true' : 'false');
		});

		const node = el('section', { class: 'anpr-rec' }, [
			el('h5', { class: 'anpr-rec-title', text: S.recTitle }),
			el('p', { class: 'anpr-rec-help', text: S.recHelp }),
			el('div', { class: 'anpr-rec-row' }, [micBtn, latencyOut]),
			el('label', { class: 'anpr-rec-corr' }, [el('span', { text: S.correction }), corr, corrOut]),
			el('p', { class: 'anpr-rec-help', text: S.correctionHelp }),
			el('div', { class: 'anpr-rec-row' }, [recBtn, soloBtn, dl]),
			recStatus,
			el('p', { class: 'anpr-rec-help', text: S.notSaved }),
		]);
		return {
			node,
			enable() { micBtn.disabled = !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
			destroy() {
				if (stream) stream.getTracks().forEach((t) => t.stop());
				if (dl.href) URL.revokeObjectURL(dl.href);
			},
		};
	}

	return {
		destroy() {
			destroyed = true;
			try { if (editor.isRecording) editor.stopRecording(); } catch (err) { /* ignore */ }
			try { if (editor.isPlaying) editor.stop(); } catch (err) { /* ignore */ }
			flushListen();
			playingSince = 0;
			clearInterval(tick);
			clearInterval(hideTimer);
			if (rec) rec.destroy();
			host.replaceChildren();
			try { ctx.close(); } catch (err) { /* ignore */ }
		},
		editor,
	};
}

export default mountPlayer;

/**
 * Ars Nova practice player — a two-track recorder for one practice track.
 *
 * Jonathan, 2026-09-17 (with Adobe Audition as the model):
 *   - two tracks per practice block, stacked: Track 1 is the practice
 *     material, Track 2 is the singer's take;
 *   - each track has a header like a pro multitrack: name, M / S / R buttons
 *     and rotary dials for volume and pan (Track 1 has no R: it is never
 *     recorded over);
 *   - R arms Track 2; recording again replaces the take;
 *   - transport and zoom sit at the bottom: black Stop, green Play, red
 *     Record as icons, time on the left, zoom on the right;
 *   - timing correction, delete and download sit under the player; clicking
 *     the take and pressing Delete clears it to try again.
 *
 * Built on @dawcore/components from waveform-playlist (MIT,
 * https://github.com/naomiaro/waveform-playlist). The library draws the
 * waveforms, the ruler and plays/records the audio; the track headers are
 * ours (the library's <daw-track-controls> render() is replaced for players
 * made here), as are the transport, zoom and take handling.
 *
 * The take is always recorded in mono.
 *
 * The browser records the MICROPHONE ONLY — never what the page is playing —
 * so with headphones the take is the voice alone. Nothing is uploaded in this
 * version: the take can be played back and downloaded as .wav.
 *
 * Saved takes (0.4.0, Jonathan 2026-09-17): "New take" and "Save take" sit to
 * the right of Record. Save take levels the voice (peak -1 dBFS), mixes it with
 * the practice track as the dials are set (volume, pan, mute, solo, and the
 * timing correction already applied to the take), encodes the stereo mixdown
 * (MP3 in a worker, or WAV) and uploads it straight to the private takes bucket.
 * The takes box lists up to opts.takes.limit takes per piece with a small
 * player and rename / play / download / delete buttons.
 *
 * mountPlayer(host, opts) returns { destroy(), editor }.
 *   opts.tracks     [{ title, src, part, pan: 'left'|'center'|'right', muted }]
 *                   (the first one is used)
 *   opts.recording  boolean — offer Track 2 and the Record button
 *   opts.strings    UI text (all optional; English defaults below)
 *   opts.onListen   function(seconds) — listened time, in pieces
 *   opts.onError    function(message, detail)
 *   opts.takes      optional { canSave, limit, format, pieceLabel, list: [take],
 *                   api: { start(o), finish(id), rename(id, name), url(id, dl), remove(id) },
 *                   onChange(list) }
 */
import '@dawcore/components';
import { html } from 'lit';
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
	takeDone: 'Your take is on Track 2. Press Play to hear it with the music.',
	takeCleared: 'Take cleared. Press Record to try again.',
	myTake: 'My take',
	mute: 'Mute',
	solo: 'Solo',
	arm: 'Arm for recording',
	armFirst: 'Press R on Track 2 to arm it, then Record.',
	volume: 'Volume',
	pan: 'Pan',
	correction: 'Timing correction',
	correctionHelp: 'If your take sounds late against the music, move this to the right before recording again.',
	latency: 'measured delay %s ms',
	deleteTake: 'Clear my take',
	deleteHint: 'To try again, click your take and press Delete, or use the bin. Recording again also replaces it.',
	download: 'Download this unsaved take (.wav)',
	headphones: 'Use WIRED headphones. Only your microphone is recorded, not the music. Bluetooth headphones add a delay.',
	notSaved: 'Your take stays in this page until you press Save take.',
	newTake: 'New take',
	newTakeHelp: 'Clear Track 2 and start a new take',
	newTakeConfirm: 'This take is not saved. Press New take again to discard it.',
	newTakeReady: 'Ready for a new take. Press Record.',
	saveTake: 'Save take',
	saveTakeHelp: 'Mix your take with the music and save it',
	saved: 'Saved',
	savedAs: 'Saved as "%s".',
	nothingToSave: 'Record a take first, then press Save take.',
	mixing: 'Mixing your take with the music…',
	converting: 'Converting…',
	uploading: 'Uploading…',
	saveFailed: 'The take could not be saved: %s',
	limitReached: 'You have %s saved takes for this piece. Delete one to save another.',
	allMuted: 'Both tracks are muted, so there is nothing to save. Unmute one first.',
	takeSilent: 'Your take is silent. Check the microphone and record again.',
	tooBig: 'This take is too long to save.',
	takesTitle: 'My saved takes',
	takesCount: '%1$s of %2$s',
	takesEmpty: 'No saved takes yet. Record, then press Save take.',
	playTake: 'Play %s',
	pauseTake: 'Pause %s',
	renameTake: 'Rename %s',
	downloadTake: 'Download %s',
	deleteSaved: 'Delete %s',
	deleteConfirm: 'Press again to delete %s',
	deleted: 'Take deleted.',
	renamed: 'Renamed.',
	takeName: 'Take name',
	takePlayer: 'Saved take player',
	takeLoadFailed: 'That take could not be played: %s',
	noTakeSelected: 'Choose a take to play',
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
	newTake: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
	saveTake: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v13a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm1 2v5h10V5zm6 8a3 3 0 100 6 3 3 0 000-6z"/></svg>',
	pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8zm13.7-7.5a1 1 0 000-1.4l-1.9-1.9a1 1 0 00-1.4 0l-1.5 1.5 2.8 2.8z"/></svg>',
};

const fill = (str, ...vals) => {
	let i = 0;
	return String(str)
		.replace(/%(\d)\$s/g, (m, n) => String(vals[Number(n) - 1] ?? ''))
		.replace(/%s/g, () => String(vals[i++] ?? ''));
};

// ---------------------------------------------------------------------------
// <anpr-knob>: a rotary dial. Drag up/down (Shift = fine), arrow keys,
// Home/End, double-click to reset. Fires "knob-input" with detail = value.
// ---------------------------------------------------------------------------
const KNOB_CSS = `
:host{display:inline-flex;flex-direction:column;align-items:center;gap:1px;width:40px;outline:none;touch-action:none;user-select:none;-webkit-user-select:none;cursor:ns-resize}
svg{width:30px;height:30px;display:block}
.trk{fill:none;stroke:#3a4660;stroke-width:3.2;stroke-linecap:round}
.val{fill:none;stroke:var(--anpr-knob-color,#8fd0ff);stroke-width:3.2;stroke-linecap:round}
.cap{fill:#2d3850;stroke:#53607c;stroke-width:1}
.ptr{stroke:#fff;stroke-width:2;stroke-linecap:round}
.num{font:600 10px/1.1 system-ui,sans-serif;color:#dfe7f5;font-variant-numeric:tabular-nums;white-space:nowrap}
.lbl{font:9px/1 system-ui,sans-serif;color:#8d9ab3;text-transform:uppercase;letter-spacing:.4px}
:host(:focus-visible) svg{outline:2px solid #ffb74d;outline-offset:1px;border-radius:50%}
`;
const A0 = -135;
const A1 = 135;
function polar(a, r) {
	const rad = ((a - 90) * Math.PI) / 180;
	return [15 + r * Math.cos(rad), 15 + r * Math.sin(rad)];
}
function arc(from, to, r) {
	if (Math.abs(to - from) < 0.5) return '';
	const [x0, y0] = polar(Math.min(from, to), r);
	const [x1, y1] = polar(Math.max(from, to), r);
	const large = Math.abs(to - from) > 180 ? 1 : 0;
	return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
class AnprKnob extends HTMLElement {
	constructor() {
		super();
		this.min = 0;
		this.max = 1;
		this.step = 0.01;
		this.defaultValue = 0;
		this.bipolar = false;
		this.label = '';
		this.short = '';
		this.format = (v) => String(v);
		this._value = 0;
		const root = this.attachShadow({ mode: 'open' });
		root.innerHTML = `<style>${KNOB_CSS}</style><svg viewBox="0 0 30 30" aria-hidden="true"><path class="trk"/><path class="val"/><circle class="cap" cx="15" cy="15" r="8.5"/><line class="ptr" x1="15" y1="15" x2="15" y2="8.5"/></svg><span class="num"></span><span class="lbl"></span>`;
		this._trk = root.querySelector('.trk');
		this._val = root.querySelector('.val');
		this._ptr = root.querySelector('.ptr');
		this._num = root.querySelector('.num');
		this._lbl = root.querySelector('.lbl');
		this._drag = null;
		this.addEventListener('pointerdown', (e) => this._down(e));
		this.addEventListener('pointermove', (e) => this._move(e));
		this.addEventListener('pointerup', (e) => this._up(e));
		this.addEventListener('pointercancel', (e) => this._up(e));
		this.addEventListener('dblclick', () => this._set(this.defaultValue));
		this.addEventListener('keydown', (e) => this._key(e));
	}
	connectedCallback() {
		this.setAttribute('role', 'slider');
		if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
		this._draw();
	}
	get value() { return this._value; }
	set value(v) {
		const n = Number(v);
		if (!Number.isFinite(n) || this._drag) return; // never fight the hand
		this._value = Math.max(this.min, Math.min(this.max, n));
		this._draw();
	}
	_angle(v) { return A0 + ((v - this.min) / (this.max - this.min)) * (A1 - A0); }
	_draw() {
		const a = this._angle(this._value);
		const start = this.bipolar ? this._angle((this.min + this.max) / 2) : A0;
		this._trk.setAttribute('d', arc(A0, A1, 12.5));
		this._val.setAttribute('d', arc(start, a, 12.5));
		this._ptr.setAttribute('transform', `rotate(${a} 15 15)`);
		const text = this.format(this._value);
		this._num.textContent = text;
		this._lbl.textContent = this.short;
		this.setAttribute('aria-label', this.label);
		this.setAttribute('aria-valuemin', String(this.min));
		this.setAttribute('aria-valuemax', String(this.max));
		this.setAttribute('aria-valuenow', String(Math.round(this._value * 100) / 100));
		this.setAttribute('aria-valuetext', text);
		this.title = this.label + ': ' + text;
	}
	_set(v, fromDrag = false) {
		const q = Math.round(v / this.step) * this.step;
		const n = Math.max(this.min, Math.min(this.max, Math.round(q * 1000) / 1000));
		if (n === this._value) return;
		this._value = n;
		this._draw();
		this.dispatchEvent(new CustomEvent('knob-input', { detail: n, bubbles: true }));
		if (!fromDrag) this.dispatchEvent(new CustomEvent('knob-change', { detail: n, bubbles: true }));
	}
	_down(e) {
		if (e.button !== undefined && e.button !== 0) return;
		e.preventDefault();
		this.focus({ preventScroll: true });
		this.setPointerCapture(e.pointerId);
		this._drag = { y: e.clientY, v: this._value, id: e.pointerId };
	}
	_move(e) {
		if (!this._drag || e.pointerId !== this._drag.id) return;
		const range = this.max - this.min;
		const px = e.shiftKey ? 600 : 150;
		const d = this._drag;
		this._drag = null; // let _set write
		this._set(d.v + ((d.y - e.clientY) / px) * range, true);
		this._drag = d;
	}
	_up(e) {
		if (!this._drag || e.pointerId !== this._drag.id) return;
		this._drag = null;
		try { this.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
	}
	_key(e) {
		const big = (this.max - this.min) / 10;
		const map = {
			ArrowUp: this._value + this.step, ArrowRight: this._value + this.step,
			ArrowDown: this._value - this.step, ArrowLeft: this._value - this.step,
			PageUp: this._value + big, PageDown: this._value - big,
			Home: this.min, End: this.max,
		};
		if (e.key in map) {
			e.preventDefault();
			e.stopPropagation();
			this._set(map[e.key]);
		}
	}
}
if (!customElements.get('anpr-knob')) customElements.define('anpr-knob', AnprKnob);

// ---------------------------------------------------------------------------
// Track headers. The library's <daw-track-controls> renders name, M, S,
// a remove × and two sliders. For editors made here (editor.anpr set) it
// renders our Audition-style header instead; the element, its height and
// its events ("daw-track-control") stay the library's.
// ---------------------------------------------------------------------------
const HEADER_CSS = `
:host{padding:6px 8px 5px !important;background:var(--daw-controls-background,#1d2433) !important;border-bottom:1px solid #0e121b !important;border-right:1px solid #0e121b}
.ah{display:flex;align-items:center;gap:6px;margin-bottom:4px;min-width:0}
.an{flex:0 0 auto;font:700 10px/16px system-ui,sans-serif;color:#1d2433;background:#8d9ab3;border-radius:3px;padding:0 5px}
.an.take{background:#ff8a80}
.at{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 12px/16px system-ui,sans-serif;color:#e8eef9}
.ar{display:flex;align-items:flex-start;gap:6px}
.ab{display:flex;gap:3px;padding-top:4px}
.b{width:24px;height:22px;padding:0;border-radius:3px;border:1px solid #4a5670;background:#2a3348;color:#c9d3e6;font:700 11px/1 system-ui,sans-serif;cursor:pointer}
.b:hover{background:#34405a}
.b:focus-visible{outline:2px solid #ffb74d;outline-offset:1px}
.b.m.on{background:#f0a030;border-color:#f0a030;color:#1b1b1b}
.b.s.on{background:#f3d34a;border-color:#f3d34a;color:#1b1b1b}
.b.r.on{background:#e03131;border-color:#e03131;color:#fff}
.b.r.on.live{animation:anprblink 1s steps(2,start) infinite}
@keyframes anprblink{to{background:#7a1b1b}}
.gap{width:24px}
.ak{display:flex;gap:2px;margin-left:auto}
.am{height:4px;margin-top:4px;border-radius:2px;background:#11161f;overflow:hidden}
.am i{display:block;height:100%;width:0;background:linear-gradient(90deg,#2fbf71 0,#2fbf71 65%,#f3d34a 80%,#e03131 100%);background-size:var(--w,180px) 100%;transition:none}
.vk{--anpr-knob-color:#8fd0ff}.pk{--anpr-knob-color:#ffb74d}
@media (max-width:600px){:host{padding:5px 6px 4px !important}.b{width:22px}.gap{width:22px}anpr-knob{width:34px}.ab{gap:2px}.ar{gap:4px}.at{font-size:11px}}
@media (prefers-reduced-motion:reduce){.b.r.on.live{animation:none}}
`;
function installHeaderRenderer() {
	const Controls = customElements.get('daw-track-controls');
	if (!Controls || Controls.prototype.__anprPatched) return;
	Controls.prototype.__anprPatched = true;
	const original = Controls.prototype.render;
	Controls.prototype.render = function anprRender() {
		const root = this.getRootNode && this.getRootNode();
		const api = root && root.host && root.host.anpr;
		if (!api) return original.call(this);
		if (this.shadowRoot && !this.shadowRoot.querySelector('style[data-anpr]')) {
			const st = document.createElement('style');
			st.setAttribute('data-anpr', '');
			st.textContent = HEADER_CSS;
			this.shadowRoot.append(st);
		}
		return api.header(this);
	};
}

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

const fmtVol = (v) => Math.round(v * 100) + '%';
const fmtPan = (v) => (Math.abs(v) < 0.005 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100));

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
	installHeaderRenderer();
	const S = Object.assign({}, DEFAULT_STRINGS, opts.strings || {});
	const practice = (Array.isArray(opts.tracks) ? opts.tracks : [])[0] || {};
	const onListen = typeof opts.onListen === 'function' ? opts.onListen : () => {};
	const onError = typeof opts.onError === 'function' ? opts.onError : () => {};
	const canRecord = !!opts.recording && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
	const T = opts.takes && opts.takes.api ? opts.takes : null;
	const takeList = T ? (Array.isArray(T.list) ? T.list : (T.list = [])) : [];
	const takeLimit = T ? Math.max(1, Number(T.limit) || 5) : 5;
	const canSave = !!(T && T.canSave && canRecord);

	const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
	const adapter = new NativePlayoutAdapter(ctx);

	// ---------- tracks ----------
	const editor = el('daw-editor', {
		id: 'anpr-daw-' + (++uid),
		class: 'anpr-daw',
		'samples-per-pixel': 8192,
		'wave-height': 96,
		timescale: true,
		mono: true,
		'eager-resume': true,
	});
	editor.adapter = adapter;

	const pan0 = PAN[practice.pan] !== undefined ? PAN[practice.pan] : 0;
	const practiceEl = el('daw-track', { src: practice.src, name: practice.title || '', muted: !!practice.muted });
	practiceEl.volume = 1;
	practiceEl.pan = pan0;
	editor.append(practiceEl);

	// Track 2: the take lane. One take at a time; recording again replaces it.
	const take = { el: null, id: null, hasClip: false, buffer: null, offset: 0, url: '', armed: true, volume: 1, pan: 0, muted: false, soloed: false, selected: false, savedId: null };
	function makeTakeLane() {
		const t = el('daw-track', { name: S.myTake, muted: take.muted, soloed: take.soloed });
		t.volume = take.volume;
		t.pan = take.pan;
		editor.append(t);
		take.el = t;
		take.id = t.trackId;
		take.hasClip = false;
		take.buffer = null;
		take.offset = 0;
		if (take.url) URL.revokeObjectURL(take.url);
		take.url = '';
		take.selected = false;
		take.savedId = null;
	}
	if (canRecord) makeTakeLane();

	const refreshHeaders = () => {
		const root = editor.shadowRoot;
		if (root) root.querySelectorAll('daw-track-controls').forEach((c) => c.requestUpdate());
	};

	// ---------- bottom bar: time · transport · zoom ----------
	const playBtn = iconButton('play', S.play);
	const recBtn = canRecord ? iconButton('record', S.record) : null;
	const stopBtn = iconButton('stop', S.stop);
	const pill = (kind, text, help) => el('button', { type: 'button', class: 'anpr-pill anpr-pill--' + kind, title: help, 'aria-label': help, html: ICONS[kind] + '<span>' + text.replace(/[<&]/g, '') + '</span>' });
	const newBtn = canRecord ? pill('newTake', S.newTake, S.newTakeHelp) : null;
	const saveBtn = canSave ? pill('saveTake', S.saveTake, S.saveTakeHelp) : null;
	const transportButtons = [stopBtn, playBtn].concat(recBtn ? [recBtn] : []);
	transportButtons.forEach((b) => { b.disabled = true; });
	if (saveBtn) saveBtn.disabled = true;
	const timeOut = el('span', { class: 'anpr-time', text: '0:00 / 0:00' });
	const status = el('p', { class: 'anpr-status', role: 'status', text: S.loading });

	const zoomOutBtn = iconButton('zoomOut', S.zoomOut, 'anpr-icon--small');
	const zoomInBtn = iconButton('zoomIn', S.zoomIn, 'anpr-icon--small');
	const fitBtn = iconButton('fit', S.zoomFit, 'anpr-icon--small');
	const zoomGroup = el('span', { class: 'anpr-zoom', role: 'group', 'aria-label': 'Zoom' }, [zoomOutBtn, zoomInBtn, fitBtn]);
	const transport = el('div', { class: 'anpr-transport', role: 'group', 'aria-label': 'Transport' }, transportButtons);
	const takeButtons = el('span', { class: 'anpr-take-buttons', role: 'group', 'aria-label': S.takesTitle }, [newBtn, saveBtn]);
	const bar = el('div', { class: 'anpr-player-bar' + (canRecord ? ' has-takes' : '') }, [timeOut, transport, canRecord ? takeButtons : null, zoomGroup]);

	// ---------- under the player: timing, take tools ----------
	let under = null;
	let corr = null;
	let latencyOut = null;
	let deleteBtn = null;
	let dlLink = null;
	if (canRecord) {
		corr = el('input', { type: 'range', min: -300, max: 300, step: 10, value: 0 });
		const corrOut = el('output', { text: '0 ms' });
		corr.addEventListener('input', () => { corrOut.textContent = corr.value + ' ms'; });
		latencyOut = el('span', { class: 'anpr-latency' });
		deleteBtn = iconButton('trash', S.deleteTake, 'anpr-icon--small');
		deleteBtn.disabled = true;
		dlLink = el('a', { class: 'anpr-icon anpr-icon--small anpr-icon--download', 'aria-label': S.download, title: S.download, html: ICONS.download, hidden: true });
		under = el('div', { class: 'anpr-under' }, [
			el('label', { class: 'anpr-rec-corr' }, [el('span', { text: S.correction }), corr, corrOut, latencyOut]),
			el('p', { class: 'anpr-rec-help', text: S.correctionHelp }),
			el('div', { class: 'anpr-take-tools' }, [deleteBtn, dlLink, el('span', { class: 'anpr-rec-help', text: S.deleteHint })]),
			el('p', { class: 'anpr-rec-help', text: S.headphones + ' ' + S.notSaved }),
		]);
	}

	const takesBox = T && (canSave || takeList.length) ? buildTakesBox() : null;
	const lower = takesBox
		? el('div', { class: 'anpr-lower' }, [el('div', { class: 'anpr-lower-main' }, [under]), takesBox.root])
		: under;
	const wrap = el('div', { class: 'anpr-player' }, [editor, bar, status].concat(lower ? [lower] : []));
	host.replaceChildren(wrap);

	// Tracks are never removed by the library UI (our headers have no ×).
	wrap.addEventListener('daw-track-remove', (e) => { e.stopPropagation(); }, true);

	// Remember the take's mixer settings so a replaced take keeps them.
	editor.addEventListener('daw-track-control', (e) => {
		const d = e.detail || {};
		if (d.trackId && d.trackId === take.id && d.prop in take) take[d.prop] = d.value;
	});

	// ---------- recording state (declared before the header renderer) ----------
	let stream = null;
	let measured = 0;
	let meter = null; // { analyser, data, raf }
	let recording = false;

	function setArmed(on) {
		take.armed = !!on;
		if (take.armed && stream) startMeter();
		if (!take.armed) stopMeter();
		refreshHeaders();
		if (take.armed && status.textContent === S.armFirst) status.textContent = S.ready;
	}

	// ---------- header renderer ----------
	editor.anpr = {
		header(c) {
			const isTake = canRecord && c.trackId === take.id;
			const n = isTake ? 2 : 1;
			const control = (prop, value) => c._dispatchControl(prop, value);
			return html`
				<div class="ah">
					<span class="an ${isTake ? 'take' : ''}">${n}</span>
					<span class="at" title=${c.trackName}>${c.trackName}</span>
				</div>
				<div class="ar">
					<div class="ab">
						<button class="b m ${c.muted ? 'on' : ''}" aria-pressed=${c.muted ? 'true' : 'false'}
							title=${S.mute} aria-label=${S.mute + ' · ' + c.trackName}
							@click=${() => control('muted', !c.muted)}>M</button>
						<button class="b s ${c.soloed ? 'on' : ''}" aria-pressed=${c.soloed ? 'true' : 'false'}
							title=${S.solo} aria-label=${S.solo + ' · ' + c.trackName}
							@click=${() => control('soloed', !c.soloed)}>S</button>
						${isTake
							? html`<button class="b r ${take.armed ? 'on' : ''} ${recording ? 'live' : ''}"
								aria-pressed=${take.armed ? 'true' : 'false'} ?disabled=${recording}
								title=${S.arm} aria-label=${S.arm + ' · ' + c.trackName}
								@click=${() => setArmed(!take.armed)}>R</button>`
							: html`<span class="gap"></span>`}
					</div>
					<div class="ak">
						<anpr-knob class="vk" .min=${0} .max=${1} .step=${0.01} .defaultValue=${1}
							.label=${S.volume + ' · ' + c.trackName} .short=${'Vol'} .format=${fmtVol}
							.value=${c.volume}
							@knob-input=${(e) => control('volume', e.detail)}></anpr-knob>
						<anpr-knob class="pk" .min=${-1} .max=${1} .step=${0.02} .defaultValue=${0} .bipolar=${true}
							.label=${S.pan + ' · ' + c.trackName} .short=${'Pan'} .format=${fmtPan}
							.value=${c.pan}
							@knob-input=${(e) => control('pan', e.detail)}></anpr-knob>
					</div>
				</div>
				${isTake ? html`<div class="am" aria-hidden="true"><i></i></div>` : ''}
			`;
		},
	};

	// ---------- zoom ----------
	const MIN_SPP = 128;
	const controlsWidth = () => {
		const v = parseFloat(getComputedStyle(editor).getPropertyValue('--daw-controls-width'));
		return Number.isFinite(v) ? v : 200;
	};
	function fitSpp() {
		const d = editor.duration;
		const w = editor.getBoundingClientRect().width - controlsWidth() - 16;
		return d > 0 && w > 100 ? Math.max(MIN_SPP, Math.ceil((d * ctx.sampleRate) / w)) : 8192;
	}
	function setSpp(v) {
		const spp = Math.max(MIN_SPP, Math.min(fitSpp(), Math.round(v)));
		editor.setAttribute('samples-per-pixel', String(spp));
		zoomOutBtn.disabled = spp >= fitSpp();
		zoomInBtn.disabled = spp <= MIN_SPP;
	}
	const currentSpp = () => Number(editor.getAttribute('samples-per-pixel')) || fitSpp();
	// Until the singer zooms, the whole piece always fits: re-fit when the
	// player first becomes visible (it can open inside a hidden tab) or resizes.
	let autoFit = true;
	zoomInBtn.addEventListener('click', () => { autoFit = false; setSpp(currentSpp() / 2); });
	zoomOutBtn.addEventListener('click', () => { autoFit = false; setSpp(currentSpp() * 2); });
	fitBtn.addEventListener('click', () => { autoFit = true; setSpp(fitSpp()); });
	let lastWidth = 0;
	const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
		const w = Math.round(editor.getBoundingClientRect().width);
		if (w !== lastWidth && w > 0 && editor.duration > 0) {
			lastWidth = w;
			if (autoFit) setSpp(fitSpp());
		}
	}) : null;
	if (ro) ro.observe(editor);

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
	const showTime = (t) => { timeOut.textContent = fmt(t) + ' / ' + fmt(editor.duration); };
	editor.addEventListener('daw-play', () => showPlaying(true));
	editor.addEventListener('daw-pause', () => showPlaying(false));
	editor.addEventListener('daw-stop', () => showPlaying(false));
	editor.addEventListener('daw-timeupdate', (e) => {
		showTime(e.detail && typeof e.detail.time === 'number' ? e.detail.time : editor.currentTime);
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
		showTime(0);
	});

	// ---------- recording ----------
	function startMeter() {
		if (meter || !stream) return;
		const src = ctx.createMediaStreamSource(stream);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		src.connect(analyser); // analysis only — never to the speakers
		const data = new Float32Array(analyser.fftSize);
		meter = { src, analyser, data, raf: 0, level: 0 };
		const draw = () => {
			if (!meter) return;
			analyser.getFloatTimeDomainData(data);
			let peak = 0;
			for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
			const db = peak > 0 ? 20 * Math.log10(peak) : -60;
			const now = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
			const pct = Math.max(now, meter.level - 1.5); // fall back gently
			meter.level = pct;
			const root = editor.shadowRoot;
			const ctl = root && [...root.querySelectorAll('daw-track-controls')].find((c) => c.trackId === take.id);
			const bar = ctl && ctl.shadowRoot && ctl.shadowRoot.querySelector('.am i');
			if (bar) {
				bar.style.width = pct.toFixed(1) + '%';
				bar.parentNode.style.setProperty('--w', bar.parentNode.clientWidth + 'px');
			}
			meter.raf = requestAnimationFrame(draw);
		};
		meter.raf = requestAnimationFrame(draw);
	}
	function stopMeter() {
		if (!meter) return;
		cancelAnimationFrame(meter.raf);
		try { meter.src.disconnect(); } catch (err) { /* ignore */ }
		meter = null;
		const root = editor.shadowRoot;
		if (root) root.querySelectorAll('daw-track-controls').forEach((c) => {
			const b = c.shadowRoot && c.shadowRoot.querySelector('.am i');
			if (b) b.style.width = '0';
		});
	}

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
		const tr = stream.getAudioTracks()[0];
		const settings = tr && tr.getSettings ? tr.getSettings() : {};
		// Always record a MONO take (Jonathan, 2026-09-17: a stereo take drew
		// twice as tall as the music). Many mics report two channels even when
		// asked for one; the recorder sizes itself from getSettings().channelCount,
		// so report 1 and the recording node mixes left + right down to one.
		if (tr && tr.getSettings) {
			const real = tr.getSettings.bind(tr);
			tr.getSettings = () => Object.assign({}, real(), { channelCount: 1 });
		}
		editor.recordingStream = stream;
		const input = typeof settings.latency === 'number' ? settings.latency : 0;
		measured = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + input;
		if (latencyOut) latencyOut.textContent = '(' + S.latency.replace('%s', String(Math.round(measured * 1000))) + ')';
		if (take.armed) startMeter();
		return true;
	}

	function showTakeTools() {
		if (deleteBtn) deleteBtn.disabled = !take.hasClip || recording;
		if (dlLink) {
			if (take.hasClip && take.url) {
				dlLink.href = take.url;
				dlLink.download = 'practice-take.wav';
				dlLink.hidden = false;
			} else {
				dlLink.hidden = true;
				dlLink.removeAttribute('href');
			}
		}
	}

	/** Swap Track 2 for a fresh empty lane (same mixer settings, still armed). */
	async function replaceTakeLane() {
		if (editor.isPlaying) editor.stop();
		const old = take.el;
		if (old) old.remove();
		makeTakeLane();
		await new Promise((r) => setTimeout(r, 60)); // let the editor register it
		refreshHeaders();
	}

	async function clearTake() {
		if (!take.hasClip || recording || busy) return;
		await replaceTakeLane();
		showTakeTools();
		editor.seekTo(0);
		showTime(0);
		status.classList.remove('is-error');
		status.textContent = S.takeCleared;
		refreshSave();
	}

	let onKey = null;
	if (recBtn) {
		recBtn.addEventListener('click', async () => {
			if (editor.isRecording) {
				editor.stopRecording();
				return;
			}
			if (!take.armed) {
				status.textContent = S.armFirst;
				return;
			}
			await resume();
			if (!(await ensureMic())) return;
			if (editor.isPlaying) editor.stop();
			if (take.hasClip) await replaceTakeLane();
			editor.seekTo(0);
			const offset = Math.max(0, measured + Number(corr ? corr.value : 0) / 1000);
			await editor.startRecording(stream, {
				trackId: take.id,
				overdub: true,
				latencyOffset: offset,
				clipName: S.myTake,
				channelCount: 1,
			});
			if (editor.isRecording) {
				recording = true;
				recBtn.classList.add('is-on');
				recBtn.setAttribute('aria-label', S.stopRecord);
				recBtn.title = S.stopRecord;
				playBtn.disabled = true;
				status.classList.remove('is-error');
				status.textContent = S.recording;
				showTakeTools();
				refreshSave();
				refreshHeaders();
			}
		});

		editor.addEventListener('daw-recording-complete', (e) => {
			recording = false;
			recBtn.classList.remove('is-on');
			recBtn.setAttribute('aria-label', S.record);
			recBtn.title = S.record;
			playBtn.disabled = false;
			if (e.detail && e.detail.trackId === take.id) {
				take.hasClip = true;
				take.buffer = e.detail.audioBuffer;
				take.offset = e.detail.offsetSamples || 0;
				take.url = URL.createObjectURL(toWav(take.buffer, take.offset));
				status.textContent = S.takeDone;
			}
			if (editor.isPlaying) editor.stop();
			editor.seekTo(0);
			showTime(0);
			showTakeTools();
			refreshSave();
			refreshHeaders();
		});
		editor.addEventListener('daw-recording-error', () => {
			recording = false;
			refreshSave();
			recBtn.classList.remove('is-on');
			playBtn.disabled = false;
			refreshHeaders();
		});

		editor.addEventListener('daw-track-select', (e) => {
			take.selected = !!(e.detail && e.detail.trackId && e.detail.trackId === take.id);
		});
		deleteBtn.addEventListener('click', clearTake);
		// Clicking a lane does not move keyboard focus, so listen on the page.
		// Only one player is open at a time, and only the take is cleared.
		onKey = (e) => {
			if ((e.key === 'Delete' || e.key === 'Backspace') && take.selected && take.hasClip && !busy
				&& !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')
				&& !(e.target && (e.target.isContentEditable || e.target.getAttribute && e.target.getAttribute('role') === 'slider'))) {
				e.preventDefault();
				clearTake();
			}
		};
		document.addEventListener('keydown', onKey);
	}

	// ---------- saved takes (0.4.0) ----------
	let busy = false;

	function refreshSave() {
		if (newBtn) newBtn.disabled = recording || busy;
		if (!saveBtn) return;
		const saved = !!take.savedId;
		saveBtn.disabled = recording || busy || !take.hasClip || saved;
		saveBtn.classList.toggle('is-saved', saved);
		const label = saveBtn.querySelector('span');
		if (label) label.textContent = saved ? S.saved : S.saveTake;
	}

	function buildTakesBox() {
		const countOut = el('span', { class: 'anpr-takes-count' });
		const pieceOut = el('p', { class: 'anpr-takes-piece', text: T.pieceLabel || '' });
		const audio = new Audio();
		audio.preload = 'none';
		const tpBtn = el('button', { type: 'button', class: 'anpr-icon anpr-icon--small anpr-icon--tplay', html: ICONS.play, 'aria-label': S.noTakeSelected, title: S.noTakeSelected, disabled: true });
		const tpName = el('span', { class: 'anpr-tp-name', text: S.noTakeSelected });
		const tpSeek = el('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0, class: 'anpr-tp-seek', 'aria-label': S.takePlayer, disabled: true });
		const tpTime = el('span', { class: 'anpr-tp-time', text: '0:00 / 0:00' });
		const tp = el('div', { class: 'anpr-tp', role: 'group', 'aria-label': S.takePlayer }, [tpBtn, el('div', { class: 'anpr-tp-mid' }, [tpName, tpSeek]), tpTime]);
		const list = el('ol', { class: 'anpr-takes-list' });
		const empty = el('p', { class: 'anpr-takes-empty', text: S.takesEmpty });
		const prog = el('progress', { max: 100, value: 0 });
		const progText = el('span');
		const progress = el('div', { class: 'anpr-save-progress', hidden: true }, [progText, prog]);
		const root = el('section', { class: 'anpr-takes', 'aria-label': S.takesTitle }, [
			el('header', { class: 'anpr-takes-head' }, [el('h4', { text: S.takesTitle }), countOut]),
			pieceOut, progress, tp, list, empty,
		]);
		let current = null; // take id loaded in the mini player
		let loading = false;
		const armed = new Map(); // delete confirmations

		function pauseEditor() {
			try { if (editor.isPlaying) editor.pause(); } catch (err) { /* ignore */ }
		}
		function stopAudio() {
			audio.pause();
		}
		function showTp() {
			const playing = !audio.paused && !audio.ended;
			const t = takeList.find((x) => x.id === current);
			tpBtn.disabled = !t || loading;
			tpBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
			const lbl = t ? fill(playing ? S.pauseTake : S.playTake, t.name) : S.noTakeSelected;
			tpBtn.setAttribute('aria-label', lbl);
			tpBtn.title = lbl;
			tpName.textContent = t ? t.name : S.noTakeSelected;
			tpSeek.disabled = !t || !isFinite(audio.duration);
			if (!t) {
				tpTime.textContent = '0:00 / 0:00';
				tpSeek.value = '0';
			} else {
				const d = isFinite(audio.duration) ? audio.duration : t.seconds;
				tpTime.textContent = fmt(audio.currentTime || 0) + ' / ' + fmt(d);
				if (d > 0 && document.activeElement !== tpSeek) tpSeek.value = String(Math.round((audio.currentTime / d) * 1000));
			}
			list.querySelectorAll('[data-take]').forEach((li) => {
				const on = li.getAttribute('data-take') === current;
				li.classList.toggle('is-current', on);
				const b = li.querySelector('.anpr-tk-play');
				if (b) {
					const tk = takeList.find((x) => x.id === li.getAttribute('data-take'));
					const pl = on && playing;
					b.innerHTML = pl ? ICONS.pause : ICONS.play;
					const l = fill(pl ? S.pauseTake : S.playTake, tk ? tk.name : '');
					b.setAttribute('aria-label', l);
					b.title = l;
				}
			});
		}
		['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange'].forEach((ev) => audio.addEventListener(ev, showTp));
		audio.addEventListener('play', pauseEditor);
		audio.addEventListener('error', () => {
			if (!current || !audio.src) return;
			status.textContent = fill(S.takeLoadFailed, (audio.error && audio.error.message) || 'error');
		});
		editor.addEventListener('daw-play', stopAudio);
		tpSeek.addEventListener('input', () => {
			if (isFinite(audio.duration)) audio.currentTime = (Number(tpSeek.value) / 1000) * audio.duration;
		});

		async function play(id) {
			if (current === id && audio.src) {
				if (audio.paused) {
					try { await audio.play(); } catch (err) { /* ignore */ }
				} else {
					audio.pause();
				}
				return;
			}
			current = id;
			loading = true;
			audio.pause();
			showTp();
			try {
				const r = await T.api.url(id, false);
				if (current !== id) return;
				audio.src = r.url;
				await audio.play();
			} catch (err) {
				status.textContent = fill(S.takeLoadFailed, err.message || err);
			} finally {
				loading = false;
				showTp();
			}
		}
		tpBtn.addEventListener('click', () => { if (current) play(current); });

		async function download(id) {
			try {
				const r = await T.api.url(id, true);
				const a = el('a', { href: r.url, rel: 'noopener', style: 'display:none' });
				document.body.append(a);
				a.click();
				a.remove();
			} catch (err) {
				status.textContent = fill(S.takeLoadFailed, err.message || err);
			}
		}

		function rename(li, t) {
			const nameEl = li.querySelector('.anpr-tk-name');
			const input = el('input', { type: 'text', class: 'anpr-tk-input', maxlength: 60, value: t.name, 'aria-label': S.takeName });
			nameEl.replaceWith(input);
			input.focus();
			input.select();
			let done = false;
			const finish = async (save) => {
				if (done) return;
				done = true;
				const v = input.value.trim();
				if (save && v && v !== t.name) {
					input.disabled = true;
					try {
						const r = await T.api.rename(t.id, v);
						Object.assign(t, r.take);
						status.textContent = S.renamed;
						changed();
					} catch (err) {
						status.textContent = fill(S.saveFailed, err.message || err);
					}
				}
				render();
			};
			input.addEventListener('keydown', (e) => {
				e.stopPropagation(); // never reach the take-lane Delete handler
				if (e.key === 'Enter') { e.preventDefault(); finish(true); }
				if (e.key === 'Escape') { e.preventDefault(); finish(false); }
			});
			input.addEventListener('blur', () => finish(true));
		}

		async function remove(li, t, btn) {
			if (!armed.has(t.id)) {
				btn.classList.add('is-confirm');
				const l = fill(S.deleteConfirm, t.name);
				btn.setAttribute('aria-label', l);
				btn.title = l;
				status.textContent = l;
				armed.set(t.id, setTimeout(() => { armed.delete(t.id); render(); }, 4000));
				return;
			}
			clearTimeout(armed.get(t.id));
			armed.delete(t.id);
			btn.disabled = true;
			try {
				await T.api.remove(t.id);
				if (current === t.id) {
					audio.pause();
					audio.removeAttribute('src');
					current = null;
				}
				const i = takeList.findIndex((x) => x.id === t.id);
				if (i >= 0) takeList.splice(i, 1);
				if (take.savedId === t.id) take.savedId = null;
				status.textContent = S.deleted;
				changed();
			} catch (err) {
				status.textContent = fill(S.saveFailed, err.message || err);
			}
			render();
			refreshSave();
		}

		function small(kind, label, cls) {
			return el('button', { type: 'button', class: 'anpr-tk-btn ' + cls, html: ICONS[kind], 'aria-label': label, title: label });
		}

		function render() {
			countOut.textContent = fill(S.takesCount, takeList.length, takeLimit);
			root.classList.toggle('is-full', takeList.length >= takeLimit);
			empty.hidden = takeList.length > 0;
			list.replaceChildren(...takeList.map((t, i) => {
				const li = el('li', { class: 'anpr-tk', 'data-take': t.id });
				const meta = [t.created, t.seconds ? fmt(t.seconds) : '', t.track].filter(Boolean).join(' · ');
				const pb = small('play', fill(S.playTake, t.name), 'anpr-tk-play');
				const rb = small('pencil', fill(S.renameTake, t.name), 'anpr-tk-rename');
				const db = small('download', fill(S.downloadTake, t.name), 'anpr-tk-dl');
				const xb = small('trash', fill(armed.has(t.id) ? S.deleteConfirm : S.deleteSaved, t.name), 'anpr-tk-del' + (armed.has(t.id) ? ' is-confirm' : ''));
				pb.addEventListener('click', () => play(t.id));
				rb.addEventListener('click', () => rename(li, t));
				db.addEventListener('click', () => download(t.id));
				xb.addEventListener('click', () => remove(li, t, xb));
				li.append(
					el('span', { class: 'anpr-tk-num', text: String(i + 1) }),
					el('div', { class: 'anpr-tk-text' }, [el('span', { class: 'anpr-tk-name', text: t.name }), el('span', { class: 'anpr-tk-meta', text: meta })]),
					el('span', { class: 'anpr-tk-actions' }, [pb, rb, db, xb]),
				);
				return li;
			}));
			showTp();
		}

		function changed() {
			if (typeof T.onChange === 'function') T.onChange(takeList);
		}

		function setProgress(label, frac) {
			if (label === null) {
				progress.hidden = true;
				return;
			}
			progress.hidden = false;
			progText.textContent = label;
			if (frac === undefined || frac === null) prog.removeAttribute('value');
			else prog.value = Math.round(frac * 100);
		}

		render();
		return {
			root, render, stopAudio, setProgress, changed,
			destroy() { audio.pause(); audio.removeAttribute('src'); armed.forEach((t) => clearTimeout(t)); },
		};
	}

	/** The clips the editor is playing on a track (decoded audio + placement). */
	function clipsOf(trackId) {
		const eng = editor._engineTracks;
		const t = eng && typeof eng.get === 'function' ? eng.get(trackId) : null;
		return t && Array.isArray(t.clips) ? t.clips.filter((c) => c && c.audioBuffer) : [];
	}

	function mixState(trackId, fallback) {
		const d = editor._tracks && typeof editor._tracks.get === 'function' ? editor._tracks.get(trackId) : null;
		const src = d || fallback || {};
		return {
			volume: typeof src.volume === 'number' ? src.volume : 1,
			pan: typeof src.pan === 'number' ? src.pan : 0,
			muted: !!src.muted,
			soloed: !!src.soloed,
		};
	}

	let practiceDecoded = null;
	async function practiceClips() {
		const clips = clipsOf(practiceEl.trackId);
		if (clips.length) return clips;
		// Fallback if the library ever stops exposing its clips: decode again.
		if (!practiceDecoded) {
			practiceDecoded = fetch(practice.src, { credentials: 'same-origin' })
				.then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
				.then((b) => ctx.decodeAudioData(b));
		}
		const buf = await practiceDecoded;
		return [{ audioBuffer: buf, startSample: 0, offsetSamples: 0, durationSamples: buf.length, sampleRate: buf.sampleRate, gain: 1 }];
	}

	/** Level the voice, mix it with the practice track as the dials are set. */
	async function renderMix(ceiling = 0.98) {
		const sr = ctx.sampleRate;
		const tClips = clipsOf(take.id);
		if (!tClips.length && take.buffer) {
			tClips.push({ audioBuffer: take.buffer, startSample: 0, offsetSamples: take.offset, durationSamples: take.buffer.length - take.offset, sampleRate: take.buffer.sampleRate, gain: 1 });
		}
		if (!tClips.length) throw new Error(S.nothingToSave);
		const pClips = await practiceClips();

		const sP = mixState(practiceEl.trackId, { volume: 1, pan: pan0, muted: !!practice.muted });
		const sT = mixState(take.id, take);
		const anySolo = sP.soloed || sT.soloed;
		const audible = (st) => (anySolo ? st.soloed : !st.muted);
		if (!audible(sP) && !audible(sT)) throw new Error(S.allMuted);

		let endSec = 0;
		let peak = 0;
		for (const c of tClips) {
			const rate = c.sampleRate || c.audioBuffer.sampleRate;
			endSec = Math.max(endSec, (c.startSample + c.durationSamples) / rate);
			const from = c.offsetSamples || 0;
			const to = Math.min(c.audioBuffer.length, from + c.durationSamples);
			for (let ch = 0; ch < c.audioBuffer.numberOfChannels; ch++) {
				const d = c.audioBuffer.getChannelData(ch);
				for (let i = from; i < to; i++) {
					const v = d[i] < 0 ? -d[i] : d[i];
					if (v > peak) peak = v;
				}
			}
		}
		if (peak < 0.0005) throw new Error(S.takeSilent);
		const voiceGain = Math.min(0.891 / peak, 31.6); // peak -1 dBFS, at most +30 dB

		const length = Math.max(1, Math.ceil(endSec * sr));
		const off = new OfflineAudioContext(2, length, sr);
		const place = (clips, st, extra) => {
			const g = off.createGain();
			g.gain.value = st.volume * extra;
			const p = off.createStereoPanner();
			p.pan.value = Math.max(-1, Math.min(1, st.pan));
			g.connect(p);
			p.connect(off.destination);
			for (const c of clips) {
				const rate = c.audioBuffer.sampleRate;
				const src = off.createBufferSource();
				src.buffer = c.audioBuffer;
				const cg = off.createGain();
				cg.gain.value = typeof c.gain === 'number' ? c.gain : 1;
				// Up-mix a mono take to two equal channels BEFORE the panner: a
				// mono input panned centre is split at -3 dB, a stereo one is not.
				cg.channelCount = 2;
				cg.channelCountMode = 'explicit';
				cg.channelInterpretation = 'speakers';
				src.connect(cg);
				cg.connect(g);
				const when = c.startSample / (c.sampleRate || rate);
				if (when >= endSec) continue;
				src.start(when, (c.offsetSamples || 0) / rate, c.durationSamples / rate);
			}
		};
		if (audible(sP)) place(pClips, sP, 1);
		if (audible(sT)) place(tClips, sT, voiceGain);
		const out = await off.startRendering();

		// Never clip the mix.
		let mp = 0;
		for (let ch = 0; ch < out.numberOfChannels; ch++) {
			const d = out.getChannelData(ch);
			for (let i = 0; i < d.length; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > mp) mp = v; }
		}
		if (mp > ceiling) {
			const k = ceiling / mp;
			for (let ch = 0; ch < out.numberOfChannels; ch++) {
				const d = out.getChannelData(ch);
				for (let i = 0; i < d.length; i++) d[i] *= k;
			}
		}
		return out;
	}

	const assetUrl = (name) => new URL('./' + name, import.meta.url).href;
	let workerCode = null;
	async function encodeMp3(buffer, onProgress) {
		if (!workerCode) {
			workerCode = fetch(assetUrl('mp3-worker.js?ver=' + (import.meta.url.split('ver=')[1] || '')))
				.then((r) => { if (!r.ok) throw new Error('encoder HTTP ' + r.status); return r.text(); })
				.then((txt) => URL.createObjectURL(new Blob([txt], { type: 'text/javascript' })));
		}
		const url = await workerCode;
		return new Promise((resolve, reject) => {
			const w = new Worker(url);
			const channels = [];
			for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch).slice());
			w.onmessage = (e) => {
				const d = e.data || {};
				if (typeof d.progress === 'number') onProgress(d.progress);
				if (d.blob) { w.terminate(); resolve(d.blob); }
				if (d.error) { w.terminate(); reject(new Error(d.error)); }
			};
			w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'encoder failed')); };
			w.postMessage({ wasmUrl: assetUrl('mp3.wasm'), sampleRate: buffer.sampleRate, bitrate: 160, channels }, channels.map((c) => c.buffer));
		});
	}

	function putFile(upload, blob, onProgress) {
		return new Promise((resolve, reject) => {
			const x = new XMLHttpRequest();
			x.open('PUT', upload.url, true);
			Object.entries(upload.headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
			x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
			x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('upload HTTP ' + x.status)));
			x.onerror = () => reject(new Error('upload failed'));
			x.send(blob);
		});
	}

	async function saveTake() {
		if (!canSave || busy || recording) return;
		if (!take.hasClip) { status.textContent = S.nothingToSave; return; }
		if (take.savedId) return;
		if (takeList.length >= takeLimit) { status.textContent = fill(S.limitReached, takeLimit); return; }
		busy = true;
		refreshSave();
		try { if (editor.isPlaying) editor.stop(); } catch (err) { /* ignore */ }
		takesBox.stopAudio();
		status.classList.remove('is-error');
		const show = (label, f) => { status.textContent = label; takesBox.setProgress(label, f); };
		try {
			show(S.mixing, null);
			const isWav = (T.format || 'mp3') === 'wav';
			// MP3 decoding overshoots sharp peaks, so leave it more headroom.
			const mix = await renderMix(isWav ? 0.98 : 0.89);
			let blob;
			if (isWav) {
				blob = toWav(mix);
			} else {
				show(S.converting, 0);
				blob = await encodeMp3(mix, (f) => show(S.converting + ' ' + Math.round(f * 100) + '%', f));
			}
			const started = await T.api.start({ seconds: Math.round(mix.duration) });
			if (started.upload.max_bytes && blob.size > started.upload.max_bytes) throw new Error(S.tooBig);
			show(S.uploading, 0);
			await putFile(started.upload, blob, (f) => show(S.uploading + ' ' + Math.round(f * 100) + '%', f));
			const fin = await T.api.finish(started.take);
			takeList.push(fin.take);
			take.savedId = fin.take.id;
			takesBox.render();
			takesBox.changed();
			status.textContent = fill(S.savedAs, fin.take.name);
		} catch (err) {
			status.classList.add('is-error');
			status.textContent = fill(S.saveFailed, (err && err.message) || err);
			onError('save take', err);
		} finally {
			busy = false;
			takesBox.setProgress(null);
			refreshSave();
		}
	}

	let discardArmed = 0;
	async function newTake() {
		if (recording || busy) return;
		if (take.hasClip && !take.savedId && !discardArmed) {
			status.textContent = S.newTakeConfirm;
			discardArmed = setTimeout(() => { discardArmed = 0; }, 5000);
			return;
		}
		clearTimeout(discardArmed);
		discardArmed = 0;
		await replaceTakeLane();
		showTakeTools();
		editor.seekTo(0);
		showTime(0);
		status.classList.remove('is-error');
		status.textContent = S.newTakeReady;
		refreshSave();
	}
	if (newBtn) newBtn.addEventListener('click', newTake);
	if (saveBtn) saveBtn.addEventListener('click', saveTake);

	// ---------- ready ----------
	let destroyed = false;
	Promise.resolve(editor.ready ? editor.ready() : null).then(() => {
		if (destroyed) return;
		let tries = 0;
		const waitDuration = () => {
			if (destroyed) return;
			if (editor.duration > 0) {
				transportButtons.forEach((b) => { b.disabled = false; });
				refreshSave();
				if (status.textContent === S.loading) status.textContent = S.ready;
				showTime(editor.currentTime);
				setSpp(fitSpp());
				refreshHeaders();
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
			stopMeter();
			if (takesBox) takesBox.destroy();
			clearTimeout(discardArmed);
			if (ro) ro.disconnect();
			if (onKey) document.removeEventListener('keydown', onKey);
			if (stream) stream.getTracks().forEach((t) => t.stop());
			if (take.url) URL.revokeObjectURL(take.url);
			host.replaceChildren();
			try { ctx.close(); } catch (err) { /* ignore */ }
		},
		editor,
		take,
	};
}

export default mountPlayer;

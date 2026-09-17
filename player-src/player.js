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
 * mountPlayer(host, opts) returns { destroy(), editor }.
 *   opts.tracks     [{ title, src, part, pan: 'left'|'center'|'right', muted }]
 *                   (the first one is used)
 *   opts.recording  boolean — offer Track 2 and the Record button
 *   opts.strings    UI text (all optional; English defaults below)
 *   opts.onListen   function(seconds) — listened time, in pieces
 *   opts.onError    function(message, detail)
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
	download: 'Download my take (.wav)',
	headphones: 'Use WIRED headphones. Only your microphone is recorded, not the music. Bluetooth headphones add a delay.',
	notSaved: 'Your take stays in this page and is not uploaded. Download it to keep it.',
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
	const take = { el: null, id: null, hasClip: false, buffer: null, offset: 0, url: '', armed: true, volume: 1, pan: 0, muted: false, soloed: false, selected: false };
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
	const transportButtons = [stopBtn, playBtn].concat(recBtn ? [recBtn] : []);
	transportButtons.forEach((b) => { b.disabled = true; });
	const timeOut = el('span', { class: 'anpr-time', text: '0:00 / 0:00' });
	const status = el('p', { class: 'anpr-status', role: 'status', text: S.loading });

	const zoomOutBtn = iconButton('zoomOut', S.zoomOut, 'anpr-icon--small');
	const zoomInBtn = iconButton('zoomIn', S.zoomIn, 'anpr-icon--small');
	const fitBtn = iconButton('fit', S.zoomFit, 'anpr-icon--small');
	const zoomGroup = el('span', { class: 'anpr-zoom', role: 'group', 'aria-label': 'Zoom' }, [zoomOutBtn, zoomInBtn, fitBtn]);
	const transport = el('div', { class: 'anpr-transport', role: 'group', 'aria-label': 'Transport' }, transportButtons);
	const bar = el('div', { class: 'anpr-player-bar' }, [timeOut, transport, zoomGroup]);

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

	const wrap = el('div', { class: 'anpr-player' }, [editor, bar, status].concat(under ? [under] : []));
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
		if (!take.hasClip || recording) return;
		await replaceTakeLane();
		showTakeTools();
		editor.seekTo(0);
		showTime(0);
		status.classList.remove('is-error');
		status.textContent = S.takeCleared;
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
			refreshHeaders();
		});
		editor.addEventListener('daw-recording-error', () => {
			recording = false;
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
			if ((e.key === 'Delete' || e.key === 'Backspace') && take.selected && take.hasClip
				&& !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')
				&& !(e.target && (e.target.isContentEditable || e.target.getAttribute && e.target.getAttribute('role') === 'slider'))) {
				e.preventDefault();
				clearTake();
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
				transportButtons.forEach((b) => { b.disabled = false; });
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

// Nostalgia Desktop: a 1996 to 2005 desktop with peer-to-peer chat (Trystero over public relays, no server or accounts).
import {joinRoom, selfId} from 'https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm';
import {mountArcade} from './arcade.js?v=78';
import {mountMail} from './mail.js?v=78';
import {mountCatalog} from './catalog.js?v=83';
import {SAVERS} from './savers.js?v=78';
import {YEARS, topSongs, guide, about, searchVideos, youtubeSearchUrl, onThisDay, catalogsFor, catalogPage, catalogThumbs, SCANS_SITE} from './data.js?v=82';

const APP = 'y2k-time-machine-v1';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const desk = $('#desk');
const coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;

/* ---------- small helpers ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('dd-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dd-' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const cleanML = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, n);
const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const ytId = (s) => { const m = String(s || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || String(s || '').trim().match(/^([\w-]{11})$/); return m ? m[1] : ''; };
const PALETTE = ['#ff2d95', '#00b8d9', '#7a2cff', '#ff7a00', '#2fbf4a'];

/* ---------- state ---------- */
let me = '';
let away = '';
let signedIn = false;
let soundOn = true;
let zTop = 20;
let lobby = null;
let netOk = false;
let viewId = 'me';
const A = {};
const peers = new Map();   // peerId -> {name, away, prof}
const blocked = new Set();
const seen = new Map();    // peerId -> recent message timestamps (rate limit)
const chats = {};          // key -> window
const rooms = {};          // key -> room state
let profile = Object.assign({mood: 'bored', about: 'hi. this is my page. comment back!!', song: '', color: '#ff2d95'}, store.get('profile', {}));

function tooFast(id) {
  const now = Date.now(), a = (seen.get(id) || []).filter((t) => now - t < 4000);
  a.push(now); seen.set(id, a);
  return a.length > 6;
}

/* ---------- sound: synthesized defaults, optional user files ---------- */
let ac = null;
const customUrls = {};
function ctx() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f, t0, d, type, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || .07, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
  o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + .02);
}
const rnd2 = () => Math.random();
let dialG = null, dialStop = () => {};
function glide(f0, f1, t0, d, type, vol) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + d);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || .06, t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + d + .05);
  o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + .08);
}
function sfx(n) {
  if (!soundOn) return;
  const cu = customUrls[n] || (n === 'im' ? customUrls.msg : n === 'imsend' ? customUrls.send : null);
  if (cu) { const a = new Audio(cu); a.volume = .85; a.play().catch(() => {}); return; }
  const c = ctx(); if (!c) return; const t = c.currentTime;
  if (n === 'door') { tone(330, t, .18, 'triangle'); tone(494, t + .12, .28, 'triangle'); tone(659, t + .26, .4, 'sine', .05); }
  else if (n === 'chime') { [349.2, 440, 523.3, 698.5, 880, 1046.5].forEach((f, i) => tone(f, t + i * .04, 2.8, 'sine', .09)); tone(174.6, t, 2.4, 'triangle', .08);
  }
  else if (n === 'static') {
    const len = Math.floor(c.sampleRate * .9), buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), gn = c.createGain(); src.buffer = buf; gn.gain.setValueAtTime(.07, t); gn.gain.linearRampToValueAtTime(0, t + .9); src.connect(gn); gn.connect(c.destination); src.start(t); }
  else if (n === 'msg') { tone(1175, t, .09, 'sine', .08); tone(880, t + .08, .14, 'sine', .06); }
  else if (n === 'im' || n === 'imsend') {
    // a rounded two-note "bloop" with a little pitch slide and a soft echo; incoming rises, outgoing falls
    const up = n === 'im', seq = up ? [[587, 784, 0], [784, 1047, .11]] : [[784, 587, 0]];
    seq.forEach(([f0, f1, dt]) => [0, .09].forEach((echo, k) => {
      const o = c.createOscillator(), g = c.createGain(), s0 = t + dt + echo, v = (up ? .14 : .1) * (k ? .3 : 1);
      o.type = 'sine'; o.frequency.setValueAtTime(f0, s0); o.frequency.exponentialRampToValueAtTime(f1, s0 + .09);
      g.gain.setValueAtTime(0.0001, s0); g.gain.exponentialRampToValueAtTime(v, s0 + .015); g.gain.exponentialRampToValueAtTime(0.0001, s0 + .26);
      o.connect(g); g.connect(c.destination); o.start(s0); o.stop(s0 + .3);
    }));
  }
  else if (n === 'shutdown') { [880, 698.5, 523.3, 440, 349.2, 261.6].forEach((f, i) => tone(f, t + i * .13, 1.8, 'sine', .08)); tone(130.8, t + .4, 2.2, 'triangle', .07); }
  else if (n === 'mail') { [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * .11, .5, 'triangle', .06)); tone(392, t, .7, 'sine', .05); }
  else if (n === 'dialup') {
    const g = c.createGain(); g.gain.value = 1; g.connect(c.destination); dialG = g;
    const o = (f, t0, d, type, v) => { const os = c.createOscillator(), gg = c.createGain(); os.type = type; os.frequency.value = f; gg.gain.setValueAtTime(0, t0); gg.gain.linearRampToValueAtTime(v, t0 + .01); gg.gain.setValueAtTime(v, t0 + d - .01); gg.gain.linearRampToValueAtTime(0, t0 + d); os.connect(gg); gg.connect(g); os.start(t0); os.stop(t0 + d + .02); return os; };
    o(350, t + .2, .8, 'sine', .03); o(440, t + .2, .8, 'sine', .03);   // dial tone
    const DT = {1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336]};
    '5550142'.split('').forEach((d, i) => { o(DT[d][0], t + 1.2 + i * .15, .1, 'sine', .035); o(DT[d][1], t + 1.2 + i * .15, .1, 'sine', .035); });
    o(440, t + 2.6, .5, 'sine', .02); o(480, t + 2.6, .5, 'sine', .02);   // ringing
    o(2100, t + 3.4, .55, 'sine', .035); o(1300, t + 4.1, .35, 'sine', .03);
    const hs = c.createOscillator(), hg = c.createGain(); hs.type = 'square'; hg.gain.value = .02; hs.connect(hg); hg.connect(g);
    for (let k = 0; k < 70; k++) hs.frequency.setValueAtTime(k < 25 ? 1200 + (k % 4) * 600 : 300 + Math.random() * 2300, t + 4.6 + k * .04);
    hs.start(t + 4.6); hs.stop(t + 7.4);
    dialStop = () => { try { g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(0, c.currentTime, .04); } catch (e) { /* already gone */ } };
  }
  else if (n === 'clear') { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * .05, .14, 'square', .03)); }
  else if (n === 'thud') { tone(110, t, .08, 'square', .04); }
  else if (n === 'munch') { [0, .1, .2].forEach((d) => tone(220 + rnd2() * 40, t + d, .06, 'square', .05)); }
  else if (n === 'peep') { tone(1320, t, .06, 'square', .035); tone(1760, t + .08, .08, 'square', .035); }
  else if (n === 'sleepy') { glide(520, 300, t, .4, 'sine', .05); }
  else if (n === 'hatch') { [0, .12, .24, .42].forEach((d, i) => glide(900 + i * 220, 1300 + i * 220, t + d, .1, 'square', .04)); }
  else if (n === 'bark') { [0, .17].forEach((d) => { glide(520, 260, t + d, .11, 'sawtooth', .06); glide(1040, 520, t + d, .06, 'square', .02); }); }
  else if (n === 'meow') { glide(620, 1050, t, .14, 'triangle', .07); glide(1050, 560, t + .14, .3, 'triangle', .07); }
  else if (n === 'blip') { tone(988, t, .05, 'square', .035); }
  else if (n === 'bonk') { tone(196, t, .18, 'square', .045); tone(147, t + .12, .25, 'square', .045); }
  else if (n === 'send') { tone(660, t, .08, 'sine', .05); }
  else if (n === 'modem') {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; g.gain.value = .018; o.connect(g); g.connect(c.destination);
    for (let k = 0; k < 36; k++) o.frequency.setValueAtTime(300 + Math.random() * 2100, t + k * .04);
    o.start(t); o.stop(t + 1.45);
  }
}
$('#snd').addEventListener('click', function () {
  soundOn = !soundOn; this.classList.toggle('muted', !soundOn); this.setAttribute('aria-pressed', String(soundOn));
  if (soundOn) { ctx(); sfx('send'); }
});

// custom sound files live in IndexedDB, never leave the browser
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('dd-sounds', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbDo(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('s', mode), rq = fn(t.objectStore('s')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); }
const SLOTS = [['door', 'Buddy signs on / you sign on'], ['msg', 'Incoming message'], ['send', 'Message sent']];
async function loadCustom() {
  for (const [k] of SLOTS) {
    try { const b = await idbDo('readonly', (s) => s.get(k)); if (b) customUrls[k] = URL.createObjectURL(b); } catch (e) { /* ignore */ }
  }
  renderSlots();
}
function renderSlots() {
  const box = $('#slots'); box.innerHTML = '';
  SLOTS.forEach(([k, label]) => {
    const d = document.createElement('div'); d.className = 'slot';
    const nm = document.createElement('div'); nm.innerHTML = '<span class="nm"></span><br><small></small>';
    $('.nm', nm).textContent = label; $('small', nm).textContent = customUrls[k] ? 'Using your file' : 'Using the default beep';
    const btns = document.createElement('div');
    const test = document.createElement('button'); test.className = 'btn-aqua sm'; test.type = 'button'; test.textContent = 'Test'; test.onclick = () => { const was = soundOn; soundOn = true; sfx(k); soundOn = was; };
    btns.appendChild(test);
    if (customUrls[k]) {
      const rs = document.createElement('button'); rs.className = 'linkbtn'; rs.type = 'button'; rs.textContent = ' Reset';
      rs.onclick = async () => { try { await idbDo('readwrite', (s) => s.delete(k)); } catch (e) { /* ignore */ } URL.revokeObjectURL(customUrls[k]); delete customUrls[k]; renderSlots(); };
      btns.appendChild(rs);
    }
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'audio/*'; f.setAttribute('aria-label', 'Choose a sound for ' + label);
    f.onchange = async () => {
      const file = f.files && f.files[0]; if (!file) return;
      if (!/^audio\//.test(file.type) || file.size > 3 * 1024 * 1024) { nm.querySelector('small').textContent = 'Pick an audio file under 3 MB'; return; }
      try { await idbDo('readwrite', (s) => s.put(file, k)); } catch (e) { nm.querySelector('small').textContent = 'Could not save in this browser'; return; }
      if (customUrls[k]) URL.revokeObjectURL(customUrls[k]);
      customUrls[k] = URL.createObjectURL(file); renderSlots();
    };
    d.append(nm, btns, f); box.appendChild(d);
  });
}

/* ---------- window manager ---------- */
function focusWin(w) { $$('.win').forEach((x) => x.classList.remove('active')); w.classList.add('active'); w.style.zIndex = ++zTop; $('#appname').textContent = w.dataset.app || 'Finder'; renderMenubar(); }
function clampWin(w) {
  if (innerWidth <= 700) return;
  const dw = desk.clientWidth, dh = desk.clientHeight, l = parseFloat(w.style.left) || 0, t = parseFloat(w.style.top) || 0;
  w.style.left = Math.max(0, Math.min(l, dw - Math.min(w.offsetWidth || 200, dw))) + 'px';
  w.style.top = Math.max(24, Math.min(t, dh - (w.offsetHeight || 100) - 84)) + 'px';
}
function openWin(w) { if (typeof w === 'string') w = $('#' + w); w.hidden = false; w._mini = false; w.classList.remove('min'); clampWin(w); focusWin(w); syncDock(); }
function closeWin(w) {
  w._mini = false;
  if (w._zoom) { Object.assign(w.style, w._zoom); w._zoom = null; w.classList.remove('zoomed'); }
  if (w._onClose) { w._onClose(); w.remove(); } else w.hidden = true;
  // closing a player stops it; minimizing or hiding does not
  if (w.id === 'w-web') { webLoaded = false; $('#web-frame').src = 'about:blank'; $('#web-wait').hidden = true; }
  if (w.id === 'w-utunes') tubeIt.stop();
  if (w.id === 'w-qt') tubeQt.stop();
  if (w.id === 'w-tv') tvPower(false);
  if (w.id === 'w-arcade') arcade.stop();
  if (w.id === 'w-web' && !$('#web-dial').hidden) { $('#web-dial').click(); dialed = false; }
  syncDock();
  const v = $$('.win').filter((x) => !x.hidden).sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0));
  if (v.length) focusWin(v[0]); else { $('#appname').textContent = 'Finder'; renderMenubar(); }
}
function mkWin(o) {
  const w = document.createElement('section'); const n = $$('.win.dyn').length;
  w.className = 'win dyn ' + (o.cls || ''); w.dataset.app = o.app;
  w.style.left = (60 + n * 28) + 'px'; w.style.top = (70 + n * 28) + 'px'; w.style.width = (o.w || 360) + 'px';
  w.innerHTML = '<div class="bar"><div class="lights"><button class="l close" aria-label="Close"></button><button class="l min" aria-label="Minimize"></button><button class="l zoom" aria-label="Zoom"></button></div><div class="title"></div></div>' + o.html;
  $('.title', w).textContent = o.title;
  desk.insertBefore(w, $('#dock'));
  return w;
}
// the green button fills the desktop (menu bar and dock stay clear) and goes back on the second click
function fitZoom(w) {
  const dr = desk.getBoundingClientRect(), kr = $('#dock').getBoundingClientRect(), floor = kr.height ? kr.top - dr.top : desk.clientHeight - 96;
  Object.assign(w.style, {left: '0px', top: '24px', width: desk.clientWidth + 'px', height: Math.max(200, floor - 24) + 'px'});
}
function toggleZoom(w) {
  if (innerWidth <= 700 || !w.hasAttribute('data-zoom')) return;
  if (w._zoom) { Object.assign(w.style, w._zoom); w._zoom = null; w.classList.remove('zoomed'); }
  else { w._zoom = {left: w.style.left, top: w.style.top, width: w.style.width, height: w.style.height}; fitZoom(w); w.classList.add('zoomed'); }
  focusWin(w);
}
desk.addEventListener('click', (e) => {
  const b = e.target.closest('.l'); if (!b) return; const w = b.closest('.win');
  if (b.classList.contains('close')) closeWin(w);
  else if (b.classList.contains('zoom')) toggleZoom(w);
  else if (b.classList.contains('min')) { w.classList.add('min'); setTimeout(() => { w.hidden = true; w._mini = true; w.classList.remove('min'); syncDock(); }, 230); }
});
desk.addEventListener('pointerdown', (e) => {
  const w = e.target.closest('.win'); if (w && !w.classList.contains('active') && !w.hidden) focusWin(w);
  const bar = e.target.closest('.bar'); if (!bar || e.target.closest('.lights') || innerWidth <= 700) return;
  const el = bar.closest('.win'); if (!el || el._zoom) return;
  const r = el.getBoundingClientRect(), dr = desk.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
  try { bar.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
  const mv = (ev) => { el.style.left = Math.max(-r.width + 90, Math.min(ev.clientX - dx - dr.left, dr.width - 90)) + 'px'; el.style.top = Math.max(24, Math.min(ev.clientY - dy - dr.top, dr.height - 60)) + 'px'; };
  const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
  bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
});

/* ---------- dock, menu bar ---------- */
const icons = {
  mail: '<svg viewBox="0 0 64 64"><defs><linearGradient id="gm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd6e2"/></linearGradient><linearGradient id="gm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb5ff"/><stop offset="1" stop-color="#1c64d8"/></linearGradient></defs><rect x="6" y="14" width="52" height="38" rx="5" fill="url(#gm1)" stroke="#6b7486"/><path d="M7 16 L32 36 L57 16" fill="none" stroke="#6b7486" stroke-width="1.6"/><path d="M7 51 L25 32 M57 51 L39 32" stroke="#9aa3b4" stroke-width="1.2"/><circle cx="48" cy="44" r="9" fill="url(#gm2)" stroke="#0f3c8a"/><path d="M44 44l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.2"/></svg>',
  arcade: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g9" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b5565"/><stop offset="1" stop-color="#1a1f29"/></linearGradient><radialGradient id="g9b" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffb3a8"/><stop offset=".4" stop-color="#e2321f"/><stop offset="1" stop-color="#7a0d03"/></radialGradient><linearGradient id="g9c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ecf1"/><stop offset="1" stop-color="#9aa1ad"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="13" fill="url(#g9)" stroke="#0c0f14"/><rect x="9" y="40" width="46" height="16" rx="6" fill="url(#g9c)" stroke="#5a606c"/><circle cx="17" cy="48" r="3.5" fill="#ffd21a" stroke="#8a6a00" stroke-width=".8"/><circle cx="47" cy="48" r="3.5" fill="#3a8ee8" stroke="#124a8a" stroke-width=".8"/><rect x="29" y="22" width="6" height="20" fill="url(#g9c)" stroke="#5a606c" stroke-width=".8"/><circle cx="32" cy="17" r="11" fill="url(#g9b)" stroke="#5a0a02" stroke-width=".8"/><ellipse cx="28.5" cy="12" rx="5" ry="3" fill="#fff" opacity=".55"/></svg>',
  buddy: '<svg viewBox="0 0 64 64"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M37 21 31 38 M36 24 45 30 52 23 M36 24 27 28 19 35 M31 38 42 42 43 55 M31 38 23 48 11 51" stroke="#1a1a1a" stroke-width="10"/><circle cx="42" cy="11" r="8" fill="#1a1a1a" stroke="none"/><path d="M37 21 31 38 M36 24 45 30 52 23 M36 24 27 28 19 35 M31 38 42 42 43 55 M31 38 23 48 11 51" stroke="#ffd21a" stroke-width="6"/><circle cx="42" cy="11" r="6" fill="#ffd21a" stroke="none"/></g></svg>',
  rooms: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g6" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a46bff"/><stop offset="1" stop-color="#4b1d8f"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g6)" stroke="#2a0a5a"/><rect x="11" y="14" width="30" height="22" rx="7" fill="#ffd43b" stroke="#8a6a00"/><rect x="25" y="28" width="28" height="20" rx="7" fill="#fff" stroke="#c9b6f5"/><ellipse cx="32" cy="12" rx="24" ry="9" fill="#fff" opacity=".28"/></svg>',
  tunes: '<svg viewBox="0 0 64 64"><defs><radialGradient id="g2" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#d9f0ff"/><stop offset=".5" stop-color="#3d95f0"/><stop offset="1" stop-color="#0c47a6"/></radialGradient></defs><circle cx="32" cy="32" r="29" fill="url(#g2)" stroke="#0b3a85"/><path d="M26 18v22a6 6 0 1 0 3 5V26l14-3v12a6 6 0 1 0 3 5V15z" fill="#fff"/><ellipse cx="32" cy="15" rx="22" ry="10" fill="#fff" opacity=".3"/></svg>',
  cat: '<svg viewBox="0 0 64 64"><defs><linearGradient id="gc1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a4d"/><stop offset="1" stop-color="#b3261a"/></linearGradient></defs><rect x="9" y="5" width="46" height="54" rx="5" fill="url(#gc1)" stroke="#6e130b" stroke-width="1.5"/><rect x="15" y="12" width="34" height="14" rx="2" fill="#fff6dc"/><path d="M19 19h26" stroke="#b3261a" stroke-width="3" stroke-linecap="round"/><rect x="17" y="31" width="14" height="14" rx="2" fill="#ffe7a8"/><rect x="34" y="31" width="14" height="14" rx="2" fill="#bfe3ff"/><rect x="17" y="48" width="31" height="4" rx="2" fill="#fff6dc" opacity=".8"/><g fill="#d9d9d9" stroke="#555" stroke-width="1"><circle cx="9" cy="14" r="2.6"/><circle cx="9" cy="24" r="2.6"/><circle cx="9" cy="34" r="2.6"/><circle cx="9" cy="44" r="2.6"/><circle cx="9" cy="54" r="2.6"/></g></svg>',
  tv: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g11" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7b7f88"/><stop offset="1" stop-color="#34373d"/></linearGradient><linearGradient id="g12" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6f3ff"/><stop offset="1" stop-color="#4aa6d8"/></linearGradient></defs><path d="M24 14L16 4M40 14L48 4" stroke="#555" stroke-width="2.5" stroke-linecap="round"/><rect x="4" y="14" width="56" height="42" rx="9" fill="url(#g11)" stroke="#1d1f23" stroke-width="2"/><rect x="9" y="19" width="34" height="32" rx="7" fill="url(#g12)" stroke="#111" stroke-width="1.5"/><circle cx="52" cy="26" r="3.4" fill="#cfd2d8" stroke="#222"/><circle cx="52" cy="38" r="3.4" fill="#cfd2d8" stroke="#222"/><path d="M48 46h8" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>',
  qt: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g8" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c6a80"/><stop offset="1" stop-color="#1d2433"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g8)" stroke="#0b0f18"/><circle cx="32" cy="32" r="17" fill="#3d95f0" stroke="#d9f0ff" stroke-width="2"/><path d="M27 23l16 9-16 9z" fill="#fff"/><ellipse cx="32" cy="14" rx="24" ry="9" fill="#fff" opacity=".25"/></svg>',
  guide: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g9" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#e07b00"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g9)" stroke="#8a4a00"/><rect x="13" y="26" width="38" height="24" rx="3" fill="#222"/><path d="M13 26l5-11 7 2-5 9zM27 19l7 2-5 8-7-2zM41 22l7 2-5 5-7-2z" fill="#fff" stroke="#222" stroke-width="1"/><ellipse cx="32" cy="12" rx="24" ry="8" fill="#fff" opacity=".3"/></svg>',
  web: '<svg viewBox="0 0 64 64"><defs><radialGradient id="g10" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#c9f0ff"/><stop offset=".55" stop-color="#2f9be8"/><stop offset="1" stop-color="#0b4a9e"/></radialGradient></defs><circle cx="32" cy="32" r="28" fill="url(#g10)" stroke="#0a3a80" stroke-width="2"/><path d="M5 32h54M32 4c-11 9-11 47 0 56M32 4c11 9 11 47 0 56M10 17h44M10 47h44" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6"/><path d="M42 18L28 28l-5 15 15-9z" fill="#ff5a3c" stroke="#fff" stroke-width="1.5"/></svg>',
  sounds: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g7" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0f4"/><stop offset="1" stop-color="#9aa0aa"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g7)" stroke="#555"/><path d="M14 26h10l12-9v30l-12-9H14z" fill="#222"/><path d="M42 24a11 11 0 0 1 0 16M47 19a18 18 0 0 1 0 26" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round"/></svg>',
  about: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#a9adb4"/></linearGradient></defs><rect x="5" y="16" width="54" height="34" rx="6" fill="url(#g4)" stroke="#555"/><rect x="11" y="38" width="30" height="4" rx="2" fill="#777"/><circle cx="50" cy="40" r="3" fill="#3ddc57" stroke="#1d7a2e"/></svg>'
};
const dockItems = [
  {k: 'web', label: 'Old Web', wins: ['w-web'], open: () => { webFirst(); return 'w-web'; }},
  {k: 'mail', label: 'Mail', wins: ['w-mail'], open: () => 'w-mail'},
  {k: 'buddy', label: 'NIM', wins: ['w-sign', 'w-buddy', 'w-rooms', 'w-myplace'], open: () => (signedIn ? 'w-buddy' : 'w-sign')},
  {k: 'tunes', label: 'uTunes', wins: ['w-utunes'], open: () => 'w-utunes'},
  {k: 'guide', label: 'Movie Guide', wins: ['w-guide'], open: () => 'w-guide'},
  {k: 'cat', label: 'Catalog', wins: ['w-cat'], open: () => { cat.ensure(); return 'w-cat'; }},
  {k: 'tv', label: 'TV', wins: ['w-tv'], open: () => 'w-tv'},
  {k: 'qt', label: 'QuickShow', wins: ['w-qt'], open: () => 'w-qt'},
  {k: 'arcade', label: 'Arcade', wins: ['w-arcade'], open: () => { arcade.ensure(); return 'w-arcade'; }},
  {k: 'sounds', label: 'Sounds', wins: ['w-sounds'], open: () => 'w-sounds'}
];
// the visitor's own dock order is remembered
{ const saved = store.get('dockorder', null); if (Array.isArray(saved)) {
  // an app added since the order was saved goes right after the app that precedes it by default
  dockItems.forEach((x, i) => { if (saved.indexOf(x.k) >= 0) return; let at = 0; for (let j = i - 1; j >= 0; j--) { const q = saved.indexOf(dockItems[j].k); if (q >= 0) { at = q + 1; break; } } saved.splice(at, 0, x.k); }); const ix = (x) => { const i = saved.indexOf(x.k); return i < 0 ? 99 : i; }; dockItems.sort((a, b) => ix(a) - ix(b)); } }
const dock = $('#dock'), dels = [];
dockItems.forEach((it) => {
  const b = document.createElement('button'); b.className = 'di'; b.dataset.label = it.label; b.setAttribute('aria-label', it.label); b.innerHTML = icons[it.k]; it.el = b;
  b.addEventListener('click', () => {
    b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce'); setTimeout(() => b.classList.remove('bounce'), 950);
    const vis = it.wins.map((id) => $('#' + id)).filter((w) => !w.hidden);
    if (vis.length) focusWin(vis[0]); else openWin(it.open());
  });
  b._ctx = () => {
    const ws = it.wins.map((id) => $('#' + id)), live = ws.filter((w) => !w.hidden || w._mini);
    const at = dockItems.indexOf(it);
    return [{t: it.label, dis: true}, {sep: 1}, {t: live.length ? 'Show' : 'Open', fn: () => openWin(live.length ? live[0] : it.open())}, {t: 'Quit', dis: !live.length, fn: () => live.forEach((w) => closeWin(w))}, {sep: 1},
      {t: 'Move Left', dis: at <= 0, fn: () => moveDock(it, at - 1)}, {t: 'Move Right', dis: at >= dockItems.length - 1, fn: () => moveDock(it, at + 1)}];
  };
  dock.appendChild(b); dels.push(b);
});
function moveDock(it, to) {
  const cur = dockItems.indexOf(it); if (cur < 0 || to < 0 || to >= dockItems.length) return;
  dockItems.splice(cur, 1); dockItems.splice(to, 0, it); dockItems.forEach((x) => dock.appendChild(x.el));
  dels.length = 0; dockItems.forEach((x) => dels.push(x.el)); store.set('dockorder', dockItems.map((x) => x.k));
}
// drag an icon sideways to rearrange the dock; a plain click still opens the app
let dockDragged = false;
dockItems.forEach((it) => {
  it.el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; const sx = e.clientX; let drag = false;
    const mv = (ev) => {
      if (!drag && Math.abs(ev.clientX - sx) > 8) { drag = true; it.el.classList.add('dragging'); }
      if (!drag) return;
      let to = 0; dockItems.forEach((x) => { if (x === it) return; const r = x.el.getBoundingClientRect(); if (ev.clientX > r.left + r.width / 2) to++; });
      if (to !== dockItems.indexOf(it)) moveDock(it, to);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (drag) { it.el.classList.remove('dragging'); dockDragged = true; setTimeout(() => { dockDragged = false; }, 60); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
});
dock.addEventListener('click', (e) => { if (dockDragged) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
// an app is running if a window is open or minimized; it shows as minimized when every window it has is tucked away
function syncDock() {
  dockItems.forEach((it) => {
    const ws = it.wins.map((id) => $('#' + id)), vis = ws.some((w) => !w.hidden), mini = !vis && ws.some((w) => w._mini);
    it.el.classList.toggle('run', vis || mini); it.el.classList.toggle('mini', mini);
    it.el.dataset.label = it.label + (mini ? ' (minimized)' : '');
  });
}
dock.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || innerWidth <= 700) return;
  dels.forEach((b) => { const r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)), k = Math.max(0, 1 - d / 120); b.style.setProperty('--s', (1 + .7 * k * k).toFixed(3)); });
});
dock.addEventListener('pointerleave', () => dels.forEach((b) => b.style.setProperty('--s', 1)));
function pingDock(k) { const it = dockItems.filter((x) => x.k === k)[0]; if (!it) return; it.el.classList.remove('ping'); void it.el.offsetWidth; it.el.classList.add('ping'); setTimeout(() => it.el.classList.remove('ping'), 2800); }

const pad2 = (n) => ('0' + n).slice(-2);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOWS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// the date on this computer: always somewhere from 1996 to 2005, set in Date & Time
// default: today's month and day, in 2005 (Feb 29 becomes Feb 28); a date picked in Date & Time lasts until the page is reloaded
const now0 = new Date(), era = Object.assign({y: 2005, m: now0.getMonth() + 1, d: Math.min(now0.getDate(), new Date(2005, now0.getMonth() + 1, 0).getDate())});
if (YEARS.indexOf(era.y) < 0 || !(era.m >= 1 && era.m <= 12) || !(era.d >= 1 && era.d <= 31)) Object.assign(era, {y: 2005, m: 6, d: 11});
const eraDow = () => new Date(era.y, era.m - 1, era.d).getDay();
function tick() { const d = new Date(), h = d.getHours() % 12 || 12, m = ('0' + d.getMinutes()).slice(-2); $('#clock').textContent = DOWS[eraDow()].slice(0, 3) + ' ' + MONTHS[era.m - 1].slice(0, 3) + ' ' + era.d + ', ' + era.y + '  ' + h + ':' + m + ' ' + (d.getHours() < 12 ? 'AM' : 'PM'); }
// until the visitor picks a date, the era date follows the real calendar, so it rolls over at midnight
let eraAuto = true;
function eraFollow() {
  if (!eraAuto) return; const n = new Date(), m = n.getMonth() + 1, d = Math.min(n.getDate(), new Date(2005, m, 0).getDate());
  if (m !== era.m || d !== era.d) setEra({m, d}, true);
}
tick(); setInterval(() => { eraFollow(); tick(); }, 15000);
function setWall(n) { desk.dataset.wall = n; $$('.swatches button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wall === n))); store.set('wall', n); }
$$('.swatches button').forEach((b) => b.addEventListener('click', () => setWall(b.dataset.wall)));
{ const sw = store.get('wall', null); if (sw) setWall(sw); }
function iconAct(el, fn) {
  el.addEventListener('click', () => { $$('.dicon').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); if (coarse) fn(); });
  el.addEventListener('dblclick', fn); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') fn(); });
}
iconAct($('#ic-cd'), () => openWin('w-utunes'));
iconAct($('#ic-hd'), () => openAbout('Nostalgia Desktop'));
$('#ic-cd')._ctx = () => [{t: 'Open', fn: () => openWin('w-utunes')}];
$('#ic-hd')._ctx = () => [{t: 'Open', fn: () => openAbout('Nostalgia Desktop')}];

/* ---------- chat windows (shared by bots and people) ---------- */
const copyPlain = (t) => { try { navigator.clipboard.writeText(t).catch(() => {}); } catch (x) { /* ignore */ } };
// @name in a message becomes a highlighted tag; returns true if it names you
function tagText(p, text) {
  let hit = false, last = 0;
  text.replace(/@[^\s@:,;!?]{2,16}/g, (m, i) => {
    p.appendChild(document.createTextNode(text.slice(last, i)));
    const t = document.createElement('span'); t.className = 'tag'; t.textContent = m;
    if (me && m.slice(1).toLowerCase() === me.toLowerCase()) { t.classList.add('me'); hit = true; }
    p.appendChild(t); last = i + m.length; return m;
  });
  p.appendChild(document.createTextNode(text.slice(last))); return hit;
}
function tagInto(input, name) { const v = input.value; input.value = v + (v && !/\s$/.test(v) ? ' ' : '') + '@' + name + ' '; input.focus(); }
function personItems(name, id, mine, reply) {
  const bot = BOTS.filter((b) => b.n === name)[0], human = !!id && peers.has(id), it2 = [];
  if (!mine) {
    it2.push({t: 'Send Instant Message', dis: !(human || bot), fn: () => (human ? openPeerChat(id) : openBotChat(bot))});
    if (reply) it2.push({t: 'Reply in Room', fn: reply});
    it2.push({t: 'View Profile', dis: !(human || BOT_PROFILES[name]), fn: () => { showProfile(human ? id : 'bot:' + name); openWin('w-myplace'); }}, {sep: 1});
  }
  it2.push({t: 'Copy Screen Name', fn: () => copyPlain(name)});
  if (!mine && human) it2.push({sep: 1}, {t: 'Block ' + name, fn: () => { blocked.add(id); renderBuddies(); }});
  return it2;
}
function addMsg(w, who, text, mine) {
  const log = $('.im-log', w), p = document.createElement('div'), s = document.createElement('b');
  s.className = mine ? 'me' : 'them'; s.textContent = who + ': '; s._ctx = () => personItems(who, w._o && w._o.id, mine); const t = document.createElement('span'); t.className = 'ts'; t.textContent = '(' + new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', second: '2-digit'}) + ') '; p.append(s, t, document.createTextNode(text)); log.appendChild(p); log.scrollTop = log.scrollHeight;
}
function addSys(log, text) { const p = document.createElement('div'); p.className = 'sys'; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; }

const BOTS = [
  {n: 'jenny_luvs_blink', says: ['omg heyyy!! did u see the new video on tv??', 'lol i know right. i burned u a cd btw', 'k ttyl, my mom needs the phone line', 'wait r u going to amys party saturday??', '<3 k brb']},
  {n: 'softballchick22', says: ['hey! practice ran so late ugh', 'lol ya coach is insane', 'did u do the algebra worksheet??', 'k im gonna go i have a ton of hw', 'night!! :)']},
  {n: 'mikeyD_1987', away: 'at the skatepark, back l8r'}
];
// the regulars have profile pages too, written to feel like 2004; the page says they are bots
const BOT_PROFILES = {
  'jenny_luvs_blink': {mood: 'bored', color: '#ff2d95', about: '~*~ jenny ~*~ 14 / f / ohio. blink-182 is my LIFE. go sk8 or go home. add me!! currently listening: All The Small Things. xoxo <3'},
  'softballchick22': {mood: 'tired', color: '#2fbf4a', about: 'softball #22. 16 / f. practice every day til 6 so dont call lol. fav shows: Gilmore Girls, One Tree Hill. tell me if u did the algebra hw'},
  'mikeyD_1987': {mood: 'gone skating', color: '#ff7a00', about: 'skate or die. 17 / m. grind rails not feelings. cant talk, the phone line is busy. listening to: Sum 41 - In Too Deep. dont ask me to help w/ ur hw'},
  'cherry_bomb89': {mood: 'hyper', color: '#ff2d95', about: 'cherry bomb 89!! 15 / f. luv mall trips, glitter gel pens and mix cds. burn me a cd?? top song rite now: Hollaback Girl. BFF = ashley 4eva'},
  'xXpunkrockXx': {mood: 'angry', color: '#7a2cff', about: 'punk rock 4 life. 16 / m. green day, good charlotte, my chemical romance. if u dont like pop punk dont msg me. my parents just dont understand'},
  'soccerstar14': {mood: 'pumped', color: '#00b8d9', about: '#14 striker. 15 / m. state finals in may. halo 2 is the best game ever made. no h8rs. add me on xbox live when i get it'}
};
function openChat(key, o) {
  if (chats[key] && document.body.contains(chats[key])) { openWin(chats[key]); $('textarea', chats[key]).focus(); return chats[key]; }
  const w = mkWin({title: o.title, app: 'NIM', cls: 'im', w: 360, html: '<div class="im-log" aria-live="polite"></div><div class="im-tools"><span class="st"></span><span class="tl"></span></div><form class="im-form"><textarea rows="3" maxlength="300" aria-label="Message"></textarea><button class="btn-aqua" type="submit">Send</button></form>'});
  chats[key] = w; w._o = o; $('.im-log', w)._ctx = () => [{t: 'Clear Chat Window', fn: () => { $('.im-log', w).innerHTML = ''; }}];
  const ta = $('textarea', w), form = $('form', w);
  if (o.human) {
    const pv = document.createElement('button'); pv.className = 'linkbtn'; pv.type = 'button'; pv.textContent = 'View profile'; pv.onclick = () => { showProfile(o.id); openWin('w-myplace'); };
    const bl = document.createElement('button'); bl.className = 'linkbtn'; bl.type = 'button'; bl.textContent = ' Block'; bl.onclick = () => { blocked.add(o.id); addSys($('.im-log', w), o.name() + ' is blocked.'); ta.disabled = true; renderBuddies(); };
    $('.tl', w).append(pv, bl);
  } else $('.st', w).textContent = o.n + ' is a bot';
  form.addEventListener('submit', (e) => {
    e.preventDefault(); const t = clean(ta.value, 300); if (!t) return;
    if (Date.now() - (w._last || 0) < 600) return; w._last = Date.now();
    ta.value = ''; addMsg(w, me, t, true); sfx('imsend'); o.send(t, w);
  });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', {cancelable: true})); } });
  clampWin(w); openWin(w); ta.focus();
  return w;
}
function openBotChat(b) {
  return openChat('bot:' + b.n, {title: b.n + ' - Instant Message', n: b.n, send(text, w) {
    if (b.away) { if (!b.warned) { b.warned = true; setTimeout(() => { addSys($('.im-log', w), 'Auto response from ' + b.n + ': ' + b.away); sfx('im'); }, 600); } return; }
    b.idx = b.idx || 0; let line;
    if (/a\/?s\/?l/i.test(text)) line = '16/f/ohio lol u?';
    else if (/\bbrb\b/i.test(text)) line = 'k';
    else { line = b.says[b.idx % b.says.length]; b.idx++; }
    setTimeout(() => { $('.st', w).textContent = b.n + ' is typing...'; setTimeout(() => { $('.st', w).textContent = b.n + ' is a bot'; addMsg(w, b.n, line, false); sfx('im'); }, 900 + Math.random() * 900); }, 500 + Math.random() * 600);
  }});
}
// two people can share a name (there is no server to forbid it): the one with the lower connection id keeps the plain name, the rest get (2), (3)
const normName = (n) => String(n).toLowerCase().replace(/[._~*-]/g, '');
function shownName(id, name, all) {
  const k = normName(name), same = all.filter((e) => normName(e[1]) === k).map((e) => e[0]).sort(), r = same.indexOf(id);
  return r > 0 ? name + ' (' + (r + 1) + ')' : name;
}
const lobbyAll = () => Array.from(peers.entries()).map(([i, p]) => [i, p.name]).concat(me ? [[selfId, me]] : []);
function peerName(id) { const p = peers.get(id); return p ? shownName(id, p.name, lobbyAll()) : 'someone'; }
function openPeerChat(id, name) {
  if (blocked.has(id)) return null;
  if (name && !peers.has(id)) peers.set(id, {name: clean(name, 16) || 'someone', away: ''});
  return openChat('peer:' + id, {title: peerName(id) + ' - Instant Message', human: true, id, name: () => peerName(id), send(text) { if (A.dm) A.dm.send({t: text}, {target: id}); }});
}

/* ---------- lobby: presence and direct messages ---------- */
function updateStatus() {
  const n = peers.size;
  $('#mystatus').textContent = away ? 'Away: ' + away : (netOk ? 'Online - ' + n + (n === 1 ? ' other here' : ' others here') : 'Could not reach relays');
}
function sendPres(target) { if (!A.pres) return; const d = {n: me, a: away}; if (target) A.pres.send(d, {target}); else A.pres.send(d); }
let presTimer = 0;
// quiet: listen first without announcing, so a name that is already taken can be refused
function connectLobby(quiet) {
  try {
    lobby = joinRoom({appId: APP}, 'lobby'); netOk = true;
  } catch (e) { netOk = false; updateStatus(); renderBuddies(); return; }
  A.pres = lobby.makeAction('pres'); A.dm = lobby.makeAction('dm'); A.prof = lobby.makeAction('prof');
  A.pres.onMessage = (d, {peerId}) => {
    if (!d || typeof d !== 'object') return;
    const known = peers.has(peerId); const p = peers.get(peerId) || {};
    p.name = clean(d.n, 16) || 'someone'; p.away = clean(d.a, 60); peers.set(peerId, p);
    if (!known && !blocked.has(peerId) && signedIn) sfx('door');
    updateStatus(); renderBuddies();
  };
  A.dm.onMessage = (d, {peerId}) => {
    if (blocked.has(peerId) || !d || typeof d.t !== 'string' || tooFast(peerId)) return;
    const text = clean(d.t, 300); if (!text) return;
    const w = openPeerChat(peerId); if (!w) return;
    if (d.auto) addSys($('.im-log', w), 'Auto response from ' + peerName(peerId) + ': ' + text); else addMsg(w, peerName(peerId), text, false);
    sfx('im'); if (!w.classList.contains('active')) pingDock('buddy');
    if (away && !d.auto && !w._autoSent) { w._autoSent = true; A.dm.send({t: away, auto: 1}, {target: peerId}); }
  };
  A.prof.onMessage = (d, {peerId}) => {
    if (blocked.has(peerId) || !d) return;
    if (d.ask) { A.prof.send({p: {mood: profile.mood, about: profile.about, song: ytId(profile.song), color: profile.color}}, {target: peerId}); return; }
    if (d.p && peers.has(peerId)) { peers.get(peerId).prof = {mood: clean(d.p.mood, 24), about: cleanML(d.p.about, 280), song: ytId(d.p.song), color: PALETTE.indexOf(d.p.color) >= 0 ? d.p.color : PALETTE[0]}; if (viewId === peerId) showProfile(peerId); }
  };
  lobby.onPeerJoin = (id) => { if (signedIn) sendPres(id); };
  lobby.onPeerLeave = (id) => { peers.delete(id); updateStatus(); renderBuddies(); if (viewId === id) showProfile('me'); };
  clearInterval(presTimer); presTimer = setInterval(() => { if (signedIn) sendPres(); }, 25000);
  if (!quiet) sendPres();
  updateStatus();
}

function renderBuddies() {
  const box = $('#groups'), open = {}; $$('details', box).forEach((d) => { open[d.dataset.g] = d.open; }); box.innerHTML = '';
  function group(title, rows, emptyText) {
    const d = document.createElement('details'); d.dataset.g = title; d.open = open[title] !== false;
    const s = document.createElement('summary'); s.textContent = title + ' (' + rows.length + ')'; d.appendChild(s);
    const ul = document.createElement('ul');
    if (!rows.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = emptyText; d.appendChild(e); }
    rows.forEach((r) => { const li = document.createElement('li'), bt = document.createElement('button'); bt.className = 'brow' + (r.away ? ' away' : ''); bt._ctx = r.ctx; bt.textContent = r.name; if (r.away) { const sm = document.createElement('small'); sm.textContent = '(' + r.away + ')'; bt.appendChild(sm); } bt.onclick = r.go; li.appendChild(bt); ul.appendChild(li); });
    d.appendChild(ul); box.appendChild(d);
  }
  const people = Array.from(peers.entries()).filter(([id]) => !blocked.has(id)).map(([id, p]) => ({name: peerName(id), away: p.away, go: () => openPeerChat(id), ctx: () => personItems(peerName(id), id, false)}));
  group('Buddies', people, 'Nobody yet. Open a second tab!');
  group('Regulars (bots)', BOTS.map((b) => ({name: b.n, away: b.away, go: () => openBotChat(b), ctx: () => personItems(b.n, null, false)})), '');
}
$('#bl-prof').addEventListener('click', () => { showProfile('me'); openWin('w-myplace'); });
$('#bl-rooms').addEventListener('click', () => openWin('w-rooms'));
$('#bl-off').addEventListener('click', () => signOut());
$('#awayform').addEventListener('submit', (e) => {
  e.preventDefault(); const inp = $('#awaymsg'), btn = $('#awaybtn');
  if (away) { away = ''; btn.textContent = 'Away'; inp.disabled = false; inp.value = ''; }
  else { away = clean(inp.value, 60) || 'brb'; btn.textContent = "I'm Back"; inp.disabled = true; }
  $$('.im').forEach((w) => { w._autoSent = false; }); sendPres(); updateStatus();
});

/* ---------- sign on ---------- */
$('#sn').value = store.get('name', '');
const steps = ['Dialing...', 'Connecting...', 'Verifying password...', 'Welcome!'];
$('#signform').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#sn').value.trim(), st = $('#stat'); st.classList.remove('err');
  if (!/^[A-Za-z0-9_.~*-]{3,16}$/.test(name)) { st.textContent = 'Use 3 to 16 letters, numbers or _ . ~ * -'; st.classList.add('err'); return; }
  const btn = $('#signbtn'); if (btn.disabled) return;
  me = name; store.set('name', me); btn.disabled = true; ctx(); sfx('modem'); connectLobby(true); const t0 = Date.now();
  const pr = $('#prog'); pr.hidden = false; const bar = $('i', pr); let i = 0;
  const step = () => { st.textContent = steps[i]; bar.style.width = ((i + 1) * 25) + '%'; i++; if (i < steps.length) setTimeout(step, 430); else checkName(t0); };
  setTimeout(step, 60);
});
// give the other people online a moment to say who they are before taking the name
function checkName(t0) {
  const st = $('#stat'); st.textContent = 'Checking the screen name...';
  setTimeout(() => {
    if (!Array.from(peers.values()).some((p) => normName(p.name) === normName(me))) { done(); return; }
    clearInterval(presTimer); try { if (lobby) lobby.leave(); } catch (e) { /* already gone */ }
    lobby = null; netOk = false; Object.keys(A).forEach((k) => delete A[k]); peers.clear();
    const taken = me; me = ''; $('#signbtn').disabled = false; $('#prog').hidden = true; $('#prog i').style.width = '0';
    st.textContent = 'The screen name "' + taken + '" is in use right now. Try another.'; st.classList.add('err');
  }, Math.max(0, 3200 - (Date.now() - t0)));
}
function done() {
  signedIn = true; $('#myname').textContent = me; $('#w-sign').hidden = true; $('#signbtn').disabled = false; $('#prog').hidden = true; $('#prog i').style.width = '0'; $('#stat').textContent = 'Ready.';
  sendPres(); updateStatus(); renderBuddies(); showProfile('me'); openWin('w-buddy'); sfx('door');
  if (!peers.size) setTimeout(() => { const b = BOTS[0]; if (chats['bot:' + b.n] && document.body.contains(chats['bot:' + b.n])) return; const w = openBotChat(b); addMsg(w, b.n, b.says[0], false); b.idx = 1; sfx('im'); }, 3500);
}

/* ---------- chat rooms ---------- */
const ROOMS = [['Teen Chat', 'teen'], ['Music Lounge', 'music'], ['Gamers', 'gamers'], ['Homework Help', 'hw'], ['Sports Zone', 'sports'], ['Random', 'random']];
const ROOM_BOTS = ['cherry_bomb89', 'xXpunkrockXx', 'soccerstar14'];
const ROOM_LINES = ['anyone here from ohio?', 'lol', 'this room is dead', 'what r u all listening to', 'a/s/l?', 'brb dinner', 'just got home from practice', 'anyone wanna trade away msgs', 'hi', 'omg same'];
ROOMS.forEach(([name, slug]) => {
  const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.textContent = '#' + name;
  b.onclick = () => { if (!signedIn) { openWin('w-sign'); return; } openRoom(name, slug); };
  li.appendChild(b); $('#roomlist').appendChild(li);
});
function openRoom(name, slug) {
  const key = 'room:' + slug; if (rooms[key]) { openWin(rooms[key].w); return; }
  const w = mkWin({title: '#' + name + ' - Chat Room', app: 'NIM', cls: 'rmw', w: 520, html: '<div class="rm-wrap"><div class="rm-log"></div><div class="rm-users"></div></div><form class="im-form"><input type="text" maxlength="300" aria-label="Message" autocomplete="off"><button class="btn-aqua" type="submit">Send</button></form>'});
  const R = {w, users: new Map(), timer: null, chan: null, send: null}; rooms[key] = R;
  const log = $('.rm-log', w); log._ctx = () => [{t: 'Clear Chat Window', fn: () => { log.innerHTML = ''; }}]; const usersEl = $('.rm-users', w), input = $('input', w);
  const say = (who, text, mine, id) => {
    const p = document.createElement('div'), s = document.createElement('b'), reply = () => tagInto(input, who.replace(/ \(\d+\)$/, ''));
    s.className = 'sn'; s.style.color = mine ? '#d1121d' : 'hsl(' + hue(who) + ' 60% 35%)'; s.textContent = who + ': ';
    if (!mine) { s.title = 'Click to reply to ' + who; s.onclick = reply; }
    s._ctx = () => personItems(who, id, mine, reply);
    p.appendChild(s); if (tagText(p, text) && !mine) p.classList.add('mention'); log.appendChild(p); log.scrollTop = log.scrollHeight; };
  const roomName = (id, n) => shownName(id, n, Array.from(R.users.entries()).concat([[selfId, me]]));
  const renderUsers = () => {
    usersEl.innerHTML = '';
    const h = document.createElement('h4'); h.textContent = 'In the room'; usersEl.appendChild(h);
    const add = (n, cls, go, cx) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls || ''; b.textContent = n; if (go) b.onclick = go; if (cx) b._ctx = cx; usersEl.appendChild(b); };
    add(me + ' (you)', '', null, () => personItems(me, null, true));
    if (R.users.size) R.users.forEach((n, id) => { if (blocked.has(id)) return; const dn = roomName(id, n); add(dn, '', () => openPeerChat(id, n), () => personItems(dn, id, false, () => tagInto(input, n))); });
    else ROOM_BOTS.forEach((n) => add(n + ' (bot)', 'bot', null, () => personItems(n, null, false, () => tagInto(input, n))));
  };
  addSys(log, 'Welcome to #' + name + '. Connecting...');
  try {
    R.chan = joinRoom({appId: APP}, 'room-' + slug);
    const rp = R.chan.makeAction('rp'), rm = R.chan.makeAction('rm'); R.send = rm;
    rp.onMessage = (d, {peerId}) => {
      if (!d || blocked.has(peerId)) return; const n = clean(d.n, 16) || 'someone'; const isNew = !R.users.has(peerId); R.users.set(peerId, n);
      if (isNew) { addSys(log, n + ' has entered the room.'); sfx('door'); } renderUsers();
    };
    rm.onMessage = (d, {peerId}) => {
      if (blocked.has(peerId) || !d || typeof d.t !== 'string' || tooFast(peerId)) return;
      const t = clean(d.t, 300); if (t) { say(roomName(peerId, R.users.get(peerId) || 'someone'), t, false, peerId); sfx('msg'); }
    };
    R.chan.onPeerJoin = (id) => rp.send({n: me}, {target: id});
    R.chan.onPeerLeave = (id) => { const n = R.users.get(id); R.users.delete(id); if (n) addSys(log, n + ' has left the room.'); renderUsers(); };
    addSys(log, 'Connected. If nobody else shows up, the regulars are bots.');
  } catch (e) { addSys(log, 'Could not reach the matchmaking relays. Only the bots are here.'); }
  const botTick = () => {
    if (!R.users.size) say(ROOM_BOTS[Math.floor(Math.random() * ROOM_BOTS.length)], ROOM_LINES[Math.floor(Math.random() * ROOM_LINES.length)], false);
    R.timer = setTimeout(botTick, 7000 + Math.random() * 11000);
  };
  R.timer = setTimeout(botTick, 2500);
  $('form', w).addEventListener('submit', (e) => {
    e.preventDefault(); const t = clean(input.value, 300); if (!t || Date.now() - (R.last || 0) < 600) return; R.last = Date.now();
    input.value = ''; say(me, t, true); sfx('send'); if (R.send) R.send.send({t});
  });
  w._onClose = () => { clearTimeout(R.timer); try { R.chan && R.chan.leave(); } catch (e) { /* ignore */ } delete rooms[key]; };
  renderUsers(); clampWin(w); openWin(w); input.focus();
}

/* ---------- profile ---------- */
function showProfile(id) {
  viewId = id; const self = id === 'me', isBot = String(id).indexOf('bot:') === 0, botName = isBot ? id.slice(4) : '';
  const p = self ? profile : isBot ? BOT_PROFILES[botName] : (peers.get(id) || {}).prof;
  const name = self ? (me || 'you') : isBot ? botName : peerName(id), win = $('#w-myplace');
  $('#p-wtitle').textContent = name + "'s Profile";
  $('#p-name').textContent = '~*~ ' + name + ' ~*~'; $('#p-av').textContent = (name.charAt(0) || '?').toUpperCase();
  $('.prof', win).style.setProperty('--pc', (p && p.color) || PALETTE[0]);
  $('#editform').hidden = !self; $('#p-im').hidden = self || (isBot && !BOTS.some((b) => b.n === botName));
  $('#p-on').hidden = isBot ? !!(BOTS.filter((b) => b.n === botName)[0] || {}).away : !(self ? signedIn : peers.has(id));
  if (p) { $('#p-mood').textContent = p.mood || '-'; $('#p-about').textContent = self ? '' : p.about; }
  else { $('#p-mood').textContent = '...'; $('#p-about').textContent = 'Loading profile...'; if (A.prof && !isBot) A.prof.send({ask: 1}, {target: id}); }
  const sid = p && ytId(p.song); const sb = $('#p-song'); sb.hidden = !sid; sb.onclick = () => { if (sid) playProfileSong(sid); };
  $('#t8h').textContent = self ? 'Who is online' : isBot ? 'Other regulars' : 'Message them';
  const t8 = $('#top8'); t8.innerHTML = '';
  const list = isBot ? Object.keys(BOT_PROFILES).filter((n) => n !== botName).map((n) => ['bot:' + n, {name: n}]) : Array.from(peers.entries()).filter(([pid]) => !blocked.has(pid) && pid !== id).slice(0, 8);
  if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Nobody else is online yet. Open this site in a second tab to see how it works.'; t8.appendChild(e); }
  list.forEach(([pid, pp]) => { const b = document.createElement('button'), i = document.createElement('i'); b._ctx = () => personItems(pp.name, pid.indexOf('bot:') === 0 ? null : pid, false); b.type = 'button'; i.textContent = pp.name.charAt(0).toUpperCase(); i.style.background = 'hsl(' + hue(pp.name) + ' 65% 45%)'; b.append(i, document.createTextNode(pp.name)); b.onclick = () => { showProfile(pid); }; t8.appendChild(b); });
  $('#p-im').onclick = () => { if (isBot) openBotChat(BOTS.filter((b) => b.n === botName)[0]); else openPeerChat(id); };
  $('#p-foot').textContent = self ? 'This is how other people see your page. Edit the fields and save.' : isBot ? 'This account is a bot, not a real person. Its page is built into the site.' : 'Profiles come straight from their browser.';
  if (self) { $('#e-mood').value = profile.mood; $('#e-about').value = profile.about; $('#e-song').value = profile.song; $('#e-color').value = profile.color; $('#p-about').textContent = ''; }
}
$('#editform').addEventListener('submit', (e) => {
  e.preventDefault();
  profile = {mood: clean($('#e-mood').value, 24), about: cleanML($('#e-about').value, 280), song: clean($('#e-song').value, 120), color: PALETTE.indexOf($('#e-color').value) >= 0 ? $('#e-color').value : PALETTE[0]};
  store.set('profile', profile); showProfile('me'); $('#p-foot').textContent = 'Saved.';
});

/* ---------- media: uTunes (music), Movie Guide (browse and pick), QuickShow (watch) ---------- */
let ytApi = null;
function loadYT() {
  if (ytApi) return ytApi;
  ytApi = new Promise((res) => { if (window.YT && window.YT.Player) return res(); const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; window.onYouTubeIframeAPIReady = res; s.onerror = () => { ytApi = null; res(); }; document.head.appendChild(s); });
  return ytApi;
}
class Tube {
  constructor(host, box, o) { this.host = host; this.box = box; this.o = o; this.p = null; this.ids = []; this.k = 0; this.playing = false; }
  async play(ids) {
    this.ids = ids; this.k = 0; await loadYT(); if (!window.YT || !window.YT.Player) return false;
    this.box.classList.add('live');
    if (!this.p) this.make(ids[0], 'https://www.youtube-nocookie.com'); else this.p.loadVideoById(ids[0]); this.guard();
    return true;
  }
  // a blocked frame (content blocker, strict privacy mode) never reports an error, so wait for onReady and retry on the other host
  make(id, host) {
    const d = document.createElement('div'); this.host.innerHTML = ''; this.host.appendChild(d); this.ready = false; this.host_ = host;
    clearTimeout(this.wd); this.wd = setTimeout(() => {
      if (this.ready) return;
      try { this.p.destroy(); } catch (e) { /* already gone */ } this.p = null;
      if (host.indexOf('nocookie') > 0) this.make(this.ids[this.k], 'https://www.youtube.com');
      else { this.box.classList.remove('live'); this.o.fail('blocked', this.ids[this.k]); }
    }, 7000);
    this.p = new YT.Player(d, {width: '100%', height: '100%', videoId: id, host, playerVars: Object.assign({playsinline: 1, rel: 0, autoplay: 1}, /^https?:/.test(location.origin) ? {origin: location.origin} : {}), events: {
      onReady: (e) => { this.ready = true; clearTimeout(this.wd); e.target.playVideo(); this.guard(); },
      onStateChange: (e) => { this.playing = e.data === 1; if (e.data === 1) clearTimeout(this.sk); this.o.state(e.data); },
      onError: (e) => { this.ready = true; clearTimeout(this.wd); this.next(e.data); }
    }});
  }
  next(code) { this.k++; if (this.k < this.ids.length) this.p.loadVideoById(this.ids[this.k]); else this.o.fail(code, this.ids[this.ids.length - 1]); this.guard(); }
  // a video that never starts (an upcoming premiere, say) is skipped like an error
  guard() { clearTimeout(this.sk); if (!this.o.skipStuck) return; this.sk = setTimeout(() => { if (!this.playing) this.next('stuck'); }, 12000); }
  toggle() { if (!this.p) return false; try { if (this.playing) this.p.pauseVideo(); else this.p.playVideo(); } catch (e) { return false; } return true; }
  stop() { try { if (this.p) this.p.stopVideo(); } catch (e) { /* player not ready */ } this.playing = false; clearTimeout(this.wd); clearTimeout(this.sk); }
  pause() { try { if (this.p && this.playing) this.p.pauseVideo(); } catch (e) { /* player not ready */ } }
  time() { try { return this.p.getCurrentTime() || 0; } catch (e) { return 0; } }
  length() { try { return this.p.getDuration() || 0; } catch (e) { return 0; } }
  seek(t) { try { this.p.seekTo(t, true); } catch (e) { /* ignore */ } }
  volume(v) { try { this.p.setVolume(v); } catch (e) { /* ignore */ } }
}
function note(el, text, url) {
  el.textContent = text;
  if (url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' Open on YouTube'; el.appendChild(a); }
}
const ERRS = {2: 'YouTube says that video link is invalid.', 5: 'Your browser had trouble with the video player.', 100: 'That video was removed or is private.', 101: "The owner doesn't allow that video on other sites.", 150: "The owner doesn't allow that video on other sites.", 153: "YouTube couldn't verify this page (no referrer)."};
const errText = (c) => c === 'blocked' ? "The video frame didn't load or crashed (a blocker, or the browser's video decoder)." : (ERRS[c] || 'YouTube error ' + c + '.') + ' (code ' + c + ')';
const watchUrl = (id) => (id ? 'https://www.youtube.com/watch?v=' + id : '');
const setIco = (el, on) => { el.innerHTML = on ? '<path d="M3 1h4v14H3zM9 1h4v14H9z"/>' : '<path d="M3 1l11 7-11 7z"/>'; };
const mmss = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
const copyText = (t, el) => { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { el.textContent = 'Copied to the clipboard.'; }, () => { el.textContent = "Couldn't copy. Select the list and copy it yourself."; }); };

/* uTunes */
const it = {src: era.y, rows: [], cur: -1, tok: 0, fails: 0, shuffle: false, mine: store.get('mine', [])};
const tubeIt = new Tube($('#yt-it'), $('#box-it'), {
  state(s) { setIco($('#t-ico'), s === 1); if (s === 0) itNext(1); if (s === 1) it.fails = 0; },
  fail(code, id) { note($('#t-artist'), errText(code), watchUrl(id)); }
});
function drawIt() {
  const src = $('#it-src'); src.innerHTML = '';
  const h = document.createElement('div'); h.className = 'h'; h.textContent = 'BILLBOARD YEAR-END'; src.appendChild(h);
  YEARS.forEach((y) => { const b = document.createElement('button'); b.type = 'button'; b.className = it.src === y ? 'on' : ''; b.textContent = 'Top 100 of ' + y; b.onclick = () => itYear(y); src.appendChild(b); });
  const h2 = document.createElement('div'); h2.className = 'h'; h2.textContent = 'PLAYLISTS'; src.appendChild(h2);
  const m = document.createElement('button'); m.type = 'button'; m.className = it.src === 'mine' ? 'on' : ''; m.textContent = 'My Playlist (' + it.mine.length + ')'; m.onclick = itMine; src.appendChild(m);
  const h3 = document.createElement('div'); h3.className = 'h'; h3.textContent = 'TIME MACHINE'; src.appendChild(h3);
  const rb = document.createElement('button'); rb.type = 'button'; rb.textContent = 'Random year pick'; rb.onclick = itRandom; src.appendChild(rb);
  if (it.src === 'search') { const b = document.createElement('button'); b.type = 'button'; b.className = 'on'; b.textContent = 'Search results'; src.appendChild(b); }
  const tb = $('#tracks'); tb.innerHTML = '';
  it.rows.forEach((r, i) => {
    const tr = document.createElement('tr'); if (i === it.cur) tr.className = 'cur';
    [r.n || i + 1, r.title, r.artist, r.year || ''].forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    tr.onclick = () => itPlay(i);
    tr._ctx = () => {
      const has = it.mine.some((m) => m.title === r.title && m.artist === r.artist);
      return [{t: 'Play', fn: () => itPlay(i)}, {t: has ? 'Already in My Playlist' : 'Add to My Playlist', dis: has, fn: () => { it.mine.push({title: r.title, artist: r.artist, year: r.year, ids: r.ids}); store.set('mine', it.mine); drawIt(); $('#it-stat').textContent = 'Added to My Playlist.'; }}, {sep: 1},
        {t: 'Search on YouTube', fn: () => window.open(youtubeSearchUrl(r.title + ' ' + r.artist), '_blank', 'noopener')}, {t: 'Copy Song Name', fn: () => copyPlain(r.title + ' - ' + r.artist)}];
    };
    tb.appendChild(tr);
  });
  $('#it-rem').hidden = $('#it-copy').hidden = $('#it-yt').hidden = $('#it-burn').hidden = $('#it-exp').hidden = it.src !== 'mine';
}
async function itYear(y) {
  const tok = ++it.tok; it.src = y; it.rows = []; it.cur = -1; drawIt(); $('#it-stat').textContent = 'Loading the ' + y + ' chart...';
  try { const r = (await topSongs(y)).map((x) => Object.assign({year: y}, x)); if (tok !== it.tok) return; it.rows = r; $('#it-stat').textContent = r.length + ' songs. Click one to play.'; }
  catch (e) { if (tok !== it.tok) return; $('#it-stat').textContent = "Couldn't load that chart. Click the year again."; }
  drawIt();
}
function itMine() { it.tok++; it.src = 'mine'; it.rows = it.mine.slice(); it.cur = -1; drawIt(); $('#it-stat').textContent = it.mine.length ? it.mine.length + ' songs in your playlist.' : 'Play a song, then click + to add it here.'; }
async function itPlay(i) {
  const r = it.rows[i]; if (!r) return; it.cur = i; drawIt();
  $('#t-title').textContent = r.title; $('#t-artist').textContent = 'Finding the video...';
  tubeQt.pause();
  let ids = r.ids;
  try { if (!ids) ids = (await searchVideos(r.title + ' ' + r.artist + ' official video', {max: 480})).map((x) => x.id); }
  catch (e) { note($('#t-artist'), "Couldn't reach the video search.", youtubeSearchUrl(r.title + ' ' + r.artist)); return; }
  r.ids = ids;
  if (it.cur !== i || $('#w-utunes').hidden) return;
  $('#t-artist').textContent = r.artist;
  if (!(await tubeIt.play(ids))) note($('#t-artist'), "Couldn't load YouTube.", youtubeSearchUrl(r.title + ' ' + r.artist));
}
function itNext(d) {
  const n = it.rows.length; if (!n) return;
  if (it.shuffle && n > 1) { let j; do { j = Math.floor(Math.random() * n); } while (j === it.cur); itPlay(j); }
  else itPlay((it.cur + d + n) % n);
}
function itShuffle(on) { it.shuffle = on === undefined ? !it.shuffle : on; $('#it-shuf').setAttribute('aria-pressed', String(it.shuffle)); }
function itVideo(on) { const box = $('#box-it'); const show = on === undefined ? box.classList.contains('off') : on; box.classList.toggle('off', !show); $('#it-vid').setAttribute('aria-pressed', String(show)); }
// search filters the charts that are loaded in: every Billboard year-end list from 1996 to 2005
let allCharts = null;
async function loadAllCharts() {
  if (!allCharts) allCharts = Promise.all(YEARS.map((y) => topSongs(y).then((r) => r.map((x) => Object.assign({year: y}, x)), () => []))).then((l) => [].concat(...l));
  return allCharts;
}
let itDebounce = null;
async function itSearch() {
  const q = $('#it-q').value.trim().toLowerCase();
  if (!q) { if (it.src === 'search') itYear(era.y); return; }
  const tok = ++it.tok; it.src = 'search'; it.rows = []; it.cur = -1; drawIt(); $('#it-stat').textContent = 'Searching the charts...';
  const words = q.split(/\s+/);
  const all = await loadAllCharts(); if (tok !== it.tok) return;
  it.rows = all.filter((r) => { const hay = (r.title + ' ' + r.artist).toLowerCase(); return words.every((w) => hay.indexOf(w) >= 0); }).sort((a, b) => b.year - a.year || a.n - b.n).slice(0, 200);
  $('#it-stat').textContent = it.rows.length ? it.rows.length + ' songs match.' : 'No songs match in the 1996 to 2005 charts.'; drawIt();
}
$('#itform').addEventListener('submit', (e) => { e.preventDefault(); itSearch(); });
$('#it-q').addEventListener('input', () => { clearTimeout(itDebounce); itDebounce = setTimeout(itSearch, 250); });
$('#t-play').addEventListener('click', () => { if (!tubeIt.toggle() && it.rows.length) itPlay(Math.max(it.cur, 0)); });
$('#t-next').addEventListener('click', () => itNext(1));
$('#t-prev').addEventListener('click', () => itNext(-1));
$('#it-shuf').addEventListener('click', () => itShuffle());
$('#it-vid').addEventListener('click', () => itVideo());
$('#it-add').addEventListener('click', () => {
  const r = it.rows[it.cur]; if (!r) { $('#it-stat').textContent = 'Play a song first, then click +.'; return; }
  if (it.mine.some((m) => m.title === r.title && m.artist === r.artist)) { $('#it-stat').textContent = 'Already in My Playlist.'; return; }
  it.mine.push({title: r.title, artist: r.artist, year: r.year, ids: r.ids}); store.set('mine', it.mine); drawIt(); $('#it-stat').textContent = 'Added to My Playlist.';
});
$('#it-rem').addEventListener('click', () => { if (it.cur < 0) { $('#it-stat').textContent = 'Click a song, then remove it.'; return; } it.mine.splice(it.cur, 1); store.set('mine', it.mine); itMine(); });
$('#it-copy').addEventListener('click', () => copyText(it.mine.map((m) => m.title + ' - ' + m.artist).join('\n'), $('#it-stat')));
async function itRandom() {
  const y = YEARS[Math.floor(Math.random() * YEARS.length)]; await itYear(y);
  if (it.src === y && it.rows.length) { itPlay(Math.floor(Math.random() * it.rows.length)); $('#it-stat').textContent = 'The time machine landed in ' + y + '.'; }
}
$('#it-yt').addEventListener('click', () => {
  const ids = it.mine.map((m) => m.ids && m.ids[0]).filter(Boolean).slice(0, 50);
  if (!ids.length) { $('#it-stat').textContent = 'Play a song first so its video is known, then add it with +.'; return; }
  window.open('https://www.youtube.com/watch_videos?video_ids=' + ids.join(','), '_blank', 'noopener');
  $('#it-stat').textContent = ids.length + ' videos sent to a YouTube queue.';
});
// "burn" My Playlist to a mix CD: just for the feeling, then the list is copied for you
let burnT = null;
function closeBurn() { clearTimeout(burnT); $('#burn').hidden = true; }
function burnCD() {
  const ov = $('#burn'), list = it.mine;
  if (!list.length) { $('#it-stat').textContent = 'Add some songs to My Playlist first.'; return; }
  ov.hidden = false; ov.innerHTML = '';
  const cd = document.createElement('div'); cd.className = 'cdd spin';
  const t = document.createElement('div'); t.textContent = 'Burning "My Mix"';
  const pb = document.createElement('div'); pb.className = 'pb'; const fill = document.createElement('i'); pb.appendChild(fill);
  const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = 'Inserting a blank CD-R...';
  const row = document.createElement('div'); const done = document.createElement('button'); done.type = 'button'; done.className = 'btn-aqua sm'; done.textContent = 'Cancel'; done.onclick = closeBurn; row.appendChild(done);
  ov.append(cd, t, pb, lbl, row);
  let i = 0; const total = list.length, step = Math.max(350, Math.min(900, 9000 / total));
  const tick = () => {
    if (i >= total) {
      cd.classList.remove('spin'); lbl.textContent = 'Done! ' + total + ' tracks on one CD-R. Write the tracklist on it with a Sharpie.'; fill.style.width = '100%'; sfx('door'); done.textContent = 'Close';
      const cp = document.createElement('button'); cp.type = 'button'; cp.className = 'btn-aqua sm'; cp.textContent = 'Copy tracklist'; cp.onclick = () => copyText(list.map((m, k) => (k + 1) + '. ' + m.title + ' - ' + m.artist).join('\n'), lbl); row.prepend(cp); return;
    }
    lbl.textContent = 'Writing track ' + (i + 1) + ' of ' + total + ': ' + list[i].title; fill.style.width = ((i + 1) / total * 100) + '%'; i++; burnT = setTimeout(tick, step);
  };
  burnT = setTimeout(tick, 700);
}
$('#it-burn').addEventListener('click', burnCD);
// export My Playlist as a CSV or plain list; the converter sites can then move it into Spotify or Apple Music
function exportList() {
  const ov = $('#burn'), list = it.mine; if (!list.length) { $('#it-stat').textContent = 'Add some songs to My Playlist first.'; return; }
  const mkb = (txt, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-aqua sm'; b.textContent = txt; b.onclick = fn; return b; };
  const mkp = (txt) => { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = txt; return d; };
  const lnk = (txt, href) => { const a = document.createElement('a'); a.textContent = txt; a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };
  ov.hidden = false; ov.innerHTML = '';
  const t = document.createElement('div'); t.textContent = 'Take "My Mix" with you'; t.style.fontWeight = '700';
  const status = mkp(list.length + ' songs ready.'), row = document.createElement('div'); row.className = 'exp-row';
  const csv = () => 'Title,Artist,Year\n' + list.map((m) => [m.title, m.artist, m.year || ''].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n') + '\n';
  row.append(
    mkb('Download CSV', () => { const u = URL.createObjectURL(new Blob([csv()], {type: 'text/csv'})), a = document.createElement('a'); a.href = u; a.download = 'my-mix.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); status.textContent = 'Saved my-mix.csv to your downloads.'; }),
    mkb('Copy as text', () => copyText(list.map((m) => m.artist + ' - ' + m.title).join('\n'), status)));
  const how = mkp('Then upload the file (or paste the text) on a playlist converter, pick Spotify or Apple Music as the destination, and sign in there. It matches each song and builds the playlist for you. Matching is not perfect, so check the result.');
  const sites = document.createElement('div'); sites.className = 'exp-sites'; sites.append(lnk('TuneMyMusic', 'https://www.tunemymusic.com/'), document.createTextNode('  \u2022  '), lnk('Soundiiz', 'https://soundiiz.com/'));
  const row2 = document.createElement('div'); row2.appendChild(mkb('Close', closeBurn));
  ov.append(t, status, row, how, sites, mkp('These are independent sites, not part of this one. This page never sees your Spotify or Apple login.'), row2);
}
$('#it-exp').addEventListener('click', exportList);
function playProfileSong(id) { openWin('w-utunes'); it.tok++; it.src = 'search'; it.rows = [{title: 'Profile song', artist: 'YouTube', ids: [id]}]; it.cur = -1; drawIt(); itPlay(0); }

/* QuickShow: a video window with a controller bar, like the original. Browsing lives in the Movie Guide. */
const tubeQt = new Tube($('#yt-qt'), $('#box-qt'), {
  state(s) { setIco($('#qt-ico'), s === 1); },
  fail(code, id) { note($('#qt-stat'), errText(code), watchUrl(id)); }
});
const plain = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '');
// titles of people talking about a show instead of the show itself
const NOT_SHOW = /react|review|recap|explain|analy|ranking|ranked|top \d+|top ten|theor|discuss|podcast|talk|interview|behind the scenes|breakdown|easter egg|things you|facts|reddit|tier list|worst|best of|every |meme|parody|spoof|tribute|\bmy \b|\bwhy\b|\bhow\b|what if|history of|documentary|retrospective|reunion|trailer|blooper|gag reel|fan.?made|audio only|rewatch|watching|watch party|livestream|live stream|commentary|opinion|\b20(0[6-9]|[1-9]\d)\b|season \d+ (rank|review)|did you know|mention|references?\b|you missed|vs\.? |kid reacts|first time/i;
// only English-language, US-style results: no accented or non-Latin titles, no common French, Spanish or German news words
const NOT_EN = /[\u00C0-\u024F\u0370-\u1FFF\u3000-\uFFFF]|journal|t[ée]l[ée]|actualit|infos?\b|\b(le|les|des|du|une|aux|el|los|las|der|die|das)\b|noticias|nachrichten|tagesschau|telegiornale|bbc arabic|en vivo|en directo|fran[cç]ais|espa[nñ]ol|deutsch|\b(itv|itn|bbc|sky news|perth|sydney|melbourne|brisbane|adelaide|seven nightly|seven news|nine news|ten news|cbc|ctv|tvnz|rte|zdf|tf1|rai|toronto|london|australia|uk|canada)\b/i;
const bad = (t) => NOT_SHOW.test(t) || NOT_EN.test(t);
const isEpisode = /full episode|episode \d|\bs\d+ ?e\d+|season \d+ episode|complete episode/i;
// prefer a real episode or scene (so the TV can drop in mid-show), and fall back to the opening theme
async function surfPick(x) {
  const name = plain(x.title), ok = (v) => plain(v.title).indexOf(name) >= 0 && !bad(v.title);
  for (const [q, min, need] of [[x.title + ' full episode', 480, true], [x.title + ' scene', 100, false]]) {
    try {
      const r = (await searchVideos(q, {max: 2400})).filter((v) => v.dur >= min && ok(v) && (!need || isEpisode.test(v.title)));
      if (r.length) { r.sort(() => Math.random() - .5); return {ids: r.map((v) => v.id), long: true}; }
    } catch (e) { /* try the next kind of clip */ }
  }
  const th = (await searchVideos(x.title + ' tv show opening theme', {max: 360})).filter(ok);
  return {ids: th.map((v) => v.id), long: false};
}
// era channels: news, commercials and cartoons from the year on the Date & Time clock
const SPECIALS = {
  news: {name: 'News', qs: (y) => ['NBC Nightly News ' + y, 'ABC World News Tonight ' + y, 'CBS Evening News ' + y, 'CNN ' + y + ' news'], need: /news/i, min: 240, skip: /9\/11|sept(ember|\.)? ?11|attack|terror|crash|shooting|massacre|funeral|disaster|war\b|bomb|explosion|retro tech/i},
  ads: {name: 'Commercial Break', qs: (y) => [y + ' tv commercials', y + ' commercials compilation', 'commercials from ' + y], need: /commercial|\bads?\b/i, min: 90},
  toons: {name: 'Saturday Morning Cartoons', qs: (y) => ['saturday morning cartoons ' + y, y + ' cartoons full episode'], need: /cartoon|saturday morning/i, min: 240}
};
// news follows the exact date on the clock when a broadcast from that day can be found, then the month, then the year
async function newsPick() {
  const sp = SPECIALS.news, {y, m, d} = era, mon = MONTHS[m - 1], sh = mon.slice(0, 3), nm = (t) => t.toLowerCase().replace(/[,.]/g, '').replace(/\s+/g, ' ');
  const day = [mon + ' ' + d + ' ' + y, sh + ' ' + d + ' ' + y, d + ' ' + mon + ' ' + y, m + '/' + d + '/' + y, pad2(m) + '/' + pad2(d) + '/' + y, m + '-' + d + '-' + y, y + '-' + pad2(m) + '-' + pad2(d), pad2(m) + '/' + pad2(d) + '/' + String(y).slice(2)].map((x) => x.toLowerCase());
  const tiers = [
    {label: mon + ' ' + d + ', ' + y, qs: [mon + ' ' + d + ', ' + y + ' news', 'nbc abc cbs news ' + mon + ' ' + d + ' ' + y, 'evening news ' + m + '/' + d + '/' + y], test: (t) => day.some((k) => nm(t).indexOf(k) >= 0), long: false},
    {label: mon + ' ' + y, qs: ['us news ' + mon + ' ' + y, 'nightly news ' + mon + ' ' + y], test: (t) => nm(t).indexOf((mon + ' ' + y).toLowerCase()) >= 0 || nm(t).indexOf((sh + ' ' + y).toLowerCase()) >= 0, long: true},
    {label: String(y), qs: sp.qs(y), test: (t) => t.indexOf(String(y)) >= 0, long: true}];
  for (const tr of tiers) {
    for (const q of tr.qs) {
      try {
        const r = (await searchVideos(q, {max: 2400})).filter((v) => v.dur >= 120 && /news|broadcast|report/i.test(v.title) && !sp.skip.test(v.title) && !bad(v.title) && tr.test(v.title));
        if (r.length) { r.sort(() => Math.random() - .5); return {ids: r.map((v) => v.id), long: tr.long, label: sp.name + ' ' + tr.label}; }
      } catch (e) { /* next search */ }
    }
  }
  return {ids: [], long: false, label: sp.name + ' ' + y};
}
async function specialPick(kind) {
  if (kind === 'news') return newsPick();
  const sp = SPECIALS[kind], y = era.y;
  for (const q of sp.qs(y)) {
    try {
      const r = (await searchVideos(q, {max: 2400})).filter((v) => v.dur >= sp.min && v.title.indexOf(String(y)) >= 0 && sp.need.test(v.title) && !(sp.skip && sp.skip.test(v.title)) && !bad(v.title));
      if (r.length) { r.sort(() => Math.random() - .5); return {ids: r.map((v) => v.id), long: true, label: sp.name + ' ' + y}; }
    } catch (e) { /* next search */ }
  }
  return {ids: [], long: false, label: sp.name + ' ' + y};
}
let qtDrag = false;
setInterval(() => {
  if (!tubeQt.p || !tubeQt.playing || qtDrag) return;
  const d = tubeQt.length(), t = tubeQt.time(); if (d > 0) { $('#qt-seek').value = Math.round(t / d * 1000); $('#qt-time').textContent = mmss(t) + ' / ' + mmss(d); }
}, 500);
$('#qt-seek').addEventListener('input', (e) => { qtDrag = true; const d = tubeQt.length(); if (d) tubeQt.seek(d * e.target.value / 1000); });
$('#qt-seek').addEventListener('change', () => { qtDrag = false; });
$('#qt-vol').addEventListener('input', (e) => tubeQt.volume(+e.target.value));
$('#qt-play').addEventListener('click', () => tubeQt.toggle());
async function qtOpen(o) {
  openWin('w-qt'); $('#qt-wtitle').textContent = o.title; $('#qt-stat').textContent = 'Finding the video...'; $('#qt-seek').value = 0; $('#qt-time').textContent = '0:00'; tubeIt.pause();
  try { o.ids = o.ids || (await searchVideos(o.query, {max: o.max, year: o.year})).map((x) => x.id); }
  catch (e) { note($('#qt-stat'), "Couldn't reach the video search.", youtubeSearchUrl(o.query)); return; }
  if ($('#w-qt').hidden) return;
  $('#qt-stat').textContent = o.title;
  if (!(await tubeQt.play(o.ids))) note($('#qt-stat'), "Couldn't load YouTube.", youtubeSearchUrl(o.query));
}

/* TV: an old set in the dock. Channels 1 to 69 are TV shows from 1996 to 2005; the lineup stays the same on every visit. */
const tv = {on: false, ch: Math.min(69, Math.max(1, store.get('tvch', 1) | 0)), rows: null, tok: 0, fails: 0, fresh: false, vol: 100, ad: false};
const tubeTv = new Tube($('#yt-tv'), $('#box-tv'), {
  skipStuck: true,
  state(s) {
    if (s === 1) { tv.fails = 0; $('#tv-in').classList.remove('nosig'); tvStatic(false); tvShield(); tvOsd('CH ' + pad2(tv.ch), 3000); const n = $('#tv-name'); n.hidden = false; setTimeout(() => { n.hidden = true; }, 3000); }
    // like flipping channels: land somewhere in the middle of the show, not at the start
    if (s === 1 && tv.fresh) { tv.fresh = false; setTimeout(() => { const d = tubeTv.length(); if (d > 240) tubeTv.seek(d * (.12 + Math.random() * .6)); }, 600); }
    if (s === 0 && tv.on && tvSpecial() === 'news') tvTune(tv.ch);
    else if (s === 0 && tv.on) { if (tv.ad || Math.random() < .5) { tv.ad = false; tvTune(nextCh(1)); } else tvBreak(); }
  },
  fail(code, id) { tvNoSignal(); note($('#tv-stat'), code === 'stuck' ? 'Nothing is playing on this channel right now.' : errText(code), watchUrl(id)); if (tv.on && tvSpecial() !== 'news' && ++tv.fails < 3) setTimeout(() => { if (tv.on) tvTune(nextCh(1)); }, 2500); }
});
const tvSpecial = () => !tv.ad && tv.rows && tv.rows[tv.ch - 1] && tv.rows[tv.ch - 1].special;
const nextCh = (d) => ((tv.ch - 1 + d + 69) % 69) + 1;
let staticT = 0, staticOff = 0, statSince = 0, osdT = 0;
const statCv = $('#tv-static'), statCx = statCv.getContext('2d');
function drawStatic() {
  const W = statCv.width, H = statCv.height, im = statCx.createImageData(W, H), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  statCx.putImageData(im, 0, 0);
  const y = (Date.now() / 5) % (H + 30) - 15; statCx.fillStyle = 'rgba(0,0,0,.35)'; statCx.fillRect(0, y, W, 12);
}
// TV snow between channels; once shown it stays for at least 0.9s so you can see it
function tvStatic(on) {
  clearTimeout(staticOff);
  if (on) {
    if (statCv.hidden) { statSince = Date.now(); statCv.hidden = false; drawStatic(); staticT = setInterval(drawStatic, 70); }
    staticOff = setTimeout(() => tvStatic(false), 40000); return;
  }
  if (statCv.hidden) return;
  staticOff = setTimeout(() => { clearInterval(staticT); statCv.hidden = true; }, Math.max(0, 900 - (Date.now() - statSince)));
}
// the YouTube frame is cross-origin, so we can't tap it. A shield over it makes the frame see the pointer leave, and YouTube hides its UI
let shieldT = 0;
function tvShield() { const h = $('#tv-shield'); h.hidden = false; clearTimeout(shieldT); shieldT = setTimeout(() => { h.hidden = true; }, 3500); }
// nothing to show: plain static instead of the last frame
function tvNoSignal() { tubeTv.stop(); $('#tv-in').classList.add('nosig'); tvStatic(true); clearTimeout(staticOff); }
function tvOsd(text, ms) { const o = $('#tv-osd'); o.textContent = text; o.hidden = false; clearTimeout(osdT); osdT = setTimeout(() => { o.hidden = true; }, ms); }
function seeded(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
async function tvLineup() {
  if (tv.rows) return tv.rows;
  if (!g.data.tv) g.data.tv = await guide('tv');
  let seed = store.get('tvseed', 0); if (!seed) { seed = 1 + Math.floor(Math.random() * 1e9); store.set('tvseed', seed); }
  const rnd = seeded(seed), a = g.data.tv.slice(0, 150);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  tv.rows = a.slice(0, 69);
  [[0, 'news'], [6, 'ads'], [10, 'toons']].forEach(([i, k]) => { tv.rows[i] = {title: SPECIALS[k].name, special: k}; });
  return tv.rows;
}
async function tvTune(ch) {
  if (!tv.on) return;
  const tok = ++tv.tok; tv.ch = ch; store.set('tvch', ch); $('#tv-chnum').textContent = pad2(ch); $('#tv-name').hidden = true; $('#tv-osd').hidden = true;
  tvStatic(true); sfx('static'); tubeTv.pause(); $('#tv-stat').textContent = 'Changing channel...';
  let rows; try { rows = await tvLineup(); } catch (e) { tvNoSignal(); $('#tv-stat').textContent = "Couldn't load the TV lineup. Check your connection."; return; }
  const x = rows[ch - 1]; if (!x) return;
  tv.ad = false; let pick; try { pick = x.special ? await specialPick(x.special) : await surfPick(x); } catch (e) { if (tok === tv.tok) { tvNoSignal(); note($('#tv-stat'), "Couldn't reach the video search.", youtubeSearchUrl(x.title)); } return; }
  if (tok !== tv.tok || !tv.on) return;
  if (!pick.ids.length) { tvNoSignal(); note($('#tv-stat'), 'Nothing is on this channel right now.', youtubeSearchUrl(x.title + (x.special ? ' ' + era.y : ''))); return; }
  const label = pick.label || x.title; tv.fresh = pick.long; $('#tv-name').textContent = label; $('#tv-stat').textContent = 'CH ' + pad2(ch) + '  ' + label + (x.nets && x.nets[0] ? '  (' + x.nets[0] + ')' : '');
  if (!(await tubeTv.play(pick.ids))) { tvNoSignal(); note($('#tv-stat'), "Couldn't load YouTube.", youtubeSearchUrl(x.title)); return; }
  setTimeout(() => { if (tok === tv.tok && !$('#tv-in').classList.contains('nosig')) tvStatic(false); }, 3500);
}
// a show ended: commercials from the era, then the next channel
async function tvBreak() {
  const tok = ++tv.tok; tvStatic(true); $('#tv-name').hidden = true; $('#tv-stat').textContent = 'Commercial break...';
  let pick; try { pick = await specialPick('ads'); } catch (e) { pick = {ids: []}; }
  if (tok !== tv.tok || !tv.on) return;
  if (!pick.ids.length) { tvTune(nextCh(1)); return; }
  tv.ad = true; tv.fresh = pick.long; $('#tv-stat').textContent = 'CH ' + pad2(tv.ch) + '  ' + pick.label;
  if (!(await tubeTv.play(pick.ids))) { tv.ad = false; tvTune(nextCh(1)); return; }
  setTimeout(() => { if (tok === tv.tok) tvStatic(false); }, 3500);
}
function tvPower(on) {
  if (on === undefined) on = !tv.on;
  if (on === tv.on) return; tv.on = on; tv.ad = false; tv.tok++;
  const inn = $('#tv-in'); $('#tv-pow').classList.toggle('on', on);
  if (on) { inn.hidden = false; inn.classList.remove('going'); inn.classList.add('warm'); sfx('static'); $('#tv-stat').textContent = 'Warming up...'; tvStatic(true); setTimeout(() => tvTune(tv.ch), 600); }
  else {
    tubeTv.stop(); tvStatic(false); $('#tv-shield').hidden = true; $('#tv-osd').hidden = true; $('#tv-name').hidden = true; inn.classList.remove('warm'); inn.classList.add('going');
    setTimeout(() => { if (!tv.on) { inn.hidden = true; statCv.hidden = true; clearInterval(staticT); } }, 450);
    $('#tv-chnum').textContent = '--'; $('#tv-stat').textContent = 'Press the power button.';
  }
}
function tvVolume(d) { tv.vol = Math.max(0, Math.min(100, tv.vol + d)); tubeTv.volume(tv.vol); if (tv.on) tvOsd('VOL ' + '|'.repeat(Math.round(tv.vol / 10)), 2000); }
function openTv(powerOn) { openWin('w-tv'); if (powerOn) tvPower(true); }
$('#tv-pow').addEventListener('click', () => tvPower());
$('#tv-chup').addEventListener('click', () => tv.on && tvTune(nextCh(1)));
$('#tv-chdn').addEventListener('click', () => tv.on && tvTune(nextCh(-1)));
$('#tv-vup').addEventListener('click', () => tvVolume(10));
$('#tv-vdn').addEventListener('click', () => tvVolume(-10));
addEventListener('keydown', (e) => { if (!tv.on || $('#w-tv').hidden || !$('#w-tv').classList.contains('active') || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) return; if (e.key === 'ArrowUp') { e.preventDefault(); tvTune(nextCh(1)); } else if (e.key === 'ArrowDown') { e.preventDefault(); tvTune(nextCh(-1)); } });

// the announcement is read aloud by the browser's own voice (no recording is used); it needs a browser with speech support
let mailVoices = [];
if (window.speechSynthesis) { const lv = () => { mailVoices = speechSynthesis.getVoices(); }; lv(); speechSynthesis.addEventListener('voiceschanged', lv); }
// the best man's voice this browser has: US English first, any English next; names are the ones the common systems ship
const MALE = /\b(alex|fred|tom|aaron|albert|bruce|ralph|junior|evan|nathan|david|mark|guy|ryan|eric|christopher|roger|daniel|arthur|oliver|james|george|lee|gordon|rishi|male)\b/i;
function maleVoice() {
  const en = mailVoices.filter((v) => /^en[-_]/i.test(v.lang)), us = en.filter((v) => /^en[-_]US/i.test(v.lang));
  return us.filter((v) => MALE.test(v.name))[0] || en.filter((v) => MALE.test(v.name))[0] || null;
}
let lastSaid = 0;
// some browsers keep a queued voice going after the tab is hidden or closed, so stop it as soon as the page goes away
const hush = () => { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* no speech available */ } };
window.addEventListener('pagehide', hush); window.addEventListener('beforeunload', hush);
document.addEventListener('visibilitychange', () => { if (document.hidden) hush(); });
function sayMail() {
  try {
    // never speak from a background tab, and never more than once a minute
    if (!soundOn || !window.speechSynthesis || document.hidden || Date.now() - lastSaid < 60000) return;
    lastSaid = Date.now();
    const u = new SpeechSynthesisUtterance("You've got mail!"); u.lang = 'en-US'; u.rate = .9; u.volume = 1;
    const v = maleVoice(); if (v) { u.voice = v; u.pitch = .85; } else u.pitch = .3;   // no known man's voice here: drop the pitch of the default one
    speechSynthesis.cancel(); setTimeout(() => { if (!document.hidden) speechSynthesis.speak(u); }, 650);
  } catch (e) { /* no speech available */ }
}
const mailSetBadge = (n) => { const it2 = dockItems.filter((x) => x.k === 'mail')[0]; if (!it2) return; let b = $('.badge', it2.el); if (!b) { b = document.createElement('span'); b.className = 'badge'; it2.el.appendChild(b); } b.textContent = n; b.hidden = !n; };
function mailPop(m) {
  sfx('mail'); sayMail(); pingDock('mail'); let p = $('#mailpop'); if (!p) { p = document.createElement('button'); p.id = 'mailpop'; p.type = 'button'; document.body.appendChild(p); }
  p.innerHTML = ''; const ic = document.createElement('span'); ic.innerHTML = icons.mail; const tx = document.createElement('span'); const b = document.createElement('b'); b.textContent = "You've got mail!"; tx.append(b, document.createElement('br'), document.createTextNode('New mail from ' + m.from));
  p.append(ic, tx); p.hidden = false; p.classList.remove('in'); void p.offsetWidth; p.classList.add('in'); p.onclick = () => { p.hidden = true; openWin('w-mail'); };
  clearTimeout(p._t); p._t = setTimeout(() => { p.hidden = true; }, 7000);
}
const mail = mountMail({$, store, sfx, MONTHS, DOWS, getEra: () => era, getDigest: (e) => onThisDay(e.y, e.m, e.d), setBadge: mailSetBadge, onNew: mailPop, ready: () => boot.hidden || /noboot/.test(location.search + location.hash)});
const cat = mountCatalog({$, store, getEra: () => era, data: {catalogsFor, catalogPage, catalogThumbs, SCANS_SITE}});
const arcade = mountArcade({$, $$, store, sfx, active: () => { const w = $('#w-arcade'); return !w.hidden && w.classList.contains('active'); }});

/* Movie Guide: filter movies and shows from 1996 to 2005, pick one, keep a watchlist */
const g = {kind: 'film', data: {film: null, tv: null}, year: 'all', genre: 'all', net: 'all', sort: 'fame', q: '', pick: null, tok: 0, watch: store.get('watch', [])};
const hueOf = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const imdbUrl = (x) => (x.imdb ? 'https://www.imdb.com/title/' + x.imdb + '/' : 'https://www.imdb.com/find/?q=' + encodeURIComponent(x.title));
const inWatch = (kind, title) => g.watch.some((w) => w.kind === kind && w.title === title);
function guideRows() {
  const y = g.year === 'all' ? 0 : +g.year;
  const r = (g.data[g.kind] || []).filter((x) => {
    if (y && (g.kind === 'film' ? x.y !== y : !(x.y0 <= y && y <= x.y1))) return false;
    if (g.genre !== 'all' && x.genres.indexOf(g.genre) < 0) return false;
    if (g.net !== 'all' && (x.nets || []).indexOf(g.net) < 0) return false;
    if (g.q && x.title.toLowerCase().indexOf(g.q) < 0) return false;
    return true;
  });
  if (g.sort === 'az') r.sort((a, b) => a.title.localeCompare(b.title));
  else if (g.sort === 'new') r.sort((a, b) => (g.kind === 'film' ? b.y - a.y : b.y0 - a.y0));
  return r;
}
function fillSelect(sel, opts, keep) {
  sel.innerHTML = '';
  opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
  sel.value = keep;
}
function buildFilters() {
  const rows = g.data[g.kind] || [];
  fillSelect($('#g-year'), [['all', 'All years']].concat(YEARS.map((y) => [String(y), String(y)])), g.year);
  const gc = {}; rows.forEach((x) => x.genres.forEach((n) => { gc[n] = (gc[n] || 0) + 1; }));
  fillSelect($('#g-genre'), [['all', 'All genres']].concat(Object.keys(gc).filter((n) => gc[n] >= 3).sort((a, b) => gc[b] - gc[a]).map((n) => [n, n + ' (' + gc[n] + ')'])), g.genre);
  const nc = {}; rows.forEach((x) => (x.nets || []).forEach((n) => { nc[n] = (nc[n] || 0) + 1; }));
  fillSelect($('#g-net'), [['all', 'All networks']].concat(Object.keys(nc).filter((n) => nc[n] >= 2).sort((a, b) => nc[b] - nc[a]).map((n) => [n, n + ' (' + nc[n] + ')'])), g.net);
  $('#g-netw').hidden = g.kind !== 'tv';
}
const metaBits = (x, kind) => (kind === 'film' ? [x.y, x.rt ? x.rt + ' min' : '', (x.genres || []).slice(0, 3).join(', ')] : [x.y0 + '-' + (x.y1 > 2030 ? 'now' : x.y1), (x.nets || []).join(', '), (x.genres || []).slice(0, 2).join(', ')]).filter(Boolean).join(' · ');
const itemOf = (w) => (w.kind === 'film' ? {title: w.title, y: w.y, rt: 0, genres: [], imdb: w.imdb} : {title: w.title, y0: w.y, y1: w.y, genres: [], nets: [], imdb: w.imdb});
const justWatch = (x) => 'https://www.justwatch.com/us/search?q=' + encodeURIComponent(x.title);
function poster(x, big) {
  const d = document.createElement('div'); d.className = 'poster' + (big ? ' big' : ''); const h = hueOf(x.title);
  d.style.background = 'linear-gradient(160deg,hsl(' + h + ' 60% 38%),hsl(' + ((h + 50) % 360) + ' 55% 16%))';
  const t = document.createElement('b'); t.textContent = x.title; const y = document.createElement('i'); y.textContent = x.y || x.y0; d.append(t, y); return d;
}
const POSTER_OK = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;
function applyPoster(p, a) {
  if (!a || !a.img || !POSTER_OK.test(a.img)) return;
  p.style.background = 'url("' + a.img + '") center/' + (/\.svg/i.test(a.img) ? 'contain no-repeat #fff' : 'cover'); p.classList.add('has');
}
// real posters load as cards scroll into view, three lookups at a time
const posterQ = []; let posterBusy = 0;
function pumpPosters() { while (posterBusy < 3 && posterQ.length) { posterBusy++; posterQ.shift()().then(() => { posterBusy--; pumpPosters(); }); } }
const posterIO = window.IntersectionObserver ? new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return; posterIO.unobserve(e.target); const el = e.target, x = el._x, kind = el._kind;
  posterQ.push(() => about(x.title, x.y || x.y0, kind).then((a) => applyPoster(el, a), () => {})); pumpPosters();
}), {root: $('#g-list')}) : null;
function playItem(x, kind) { qtOpen({title: x.title + (kind === 'film' ? ' (' + x.y + ')' : ''), query: kind === 'film' ? x.title + ' ' + x.y + ' official trailer' : x.title + ' tv show opening theme', max: kind === 'film' ? 420 : 360, year: kind === 'film' ? x.y : 0}); }
function toggleWatch(x, kind) {
  if (inWatch(kind, x.title)) g.watch = g.watch.filter((w) => !(w.kind === kind && w.title === x.title)); else g.watch.push({kind, title: x.title, y: x.y || x.y0, imdb: x.imdb});
  store.set('watch', g.watch); $('#g-wcount').textContent = g.watch.length; return inWatch(kind, x.title);
}
function btn(text, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.onclick = fn; return b; }
function link(text, href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a; }
// a ticket stub: poster, plot from Wikipedia, and everything you need to take the pick to the TV
function ticketEl(x, kind, compact) {
  const t = document.createElement('div'); t.className = 'ticket';
  const p = poster(x, !compact), body = document.createElement('div'); body.style.cssText = 'min-width:0;flex:1';
  const h = document.createElement('h3'); h.textContent = x.title;
  const m = document.createElement('div'); m.className = 'tm'; m.textContent = metaBits(x, kind);
  const pp = document.createElement('div'); pp.className = 'tp'; pp.textContent = 'Reading the back of the box...'; if (compact) pp.style.maxHeight = '56px';
  about(x.title, x.y || x.y0, kind).then((a) => { pp.textContent = a.text || 'No description found for this one.'; applyPoster(p, a); }, () => { pp.textContent = 'No description found for this one.'; });
  const act = document.createElement('div'); act.className = 'tact';
  const wl = btn('', 'linkbtn', () => { toggleWatch(x, kind); sync(); if (g.kind === 'watch') renderGuide(); });
  const sync = () => { wl.textContent = inWatch(kind, x.title) ? 'On watchlist (remove)' : '+ Watchlist'; };
  const share = btn('Copy title + IMDb link', 'linkbtn', () => copyText(x.title + (x.y || x.y0 ? ' (' + (x.y || x.y0) + ')' : '') + ' - ' + imdbUrl(x), share));
  sync(); act.append(btn(kind === 'film' ? 'Play trailer' : 'Play intro', 'btn-aqua sm', () => playItem(x, kind)), link('IMDb', imdbUrl(x)), link('Where to watch', justWatch(x)), wl, share);
  body.append(h, m, pp, act); t.append(p, body); return t;
}
function closeOv() { $('#g-ov').hidden = true; }
function openTicket(x, kind) {
  const ov = $('#g-ov'); ov.innerHTML = ''; const t = ticketEl(x, kind, false);
  t.appendChild(btn('×', 'tclose', closeOv)); t.lastChild.setAttribute('aria-label', 'Close'); ov.appendChild(t); ov.hidden = false;
}
async function movieNight() {
  const ov = $('#g-ov'); ov.hidden = false; ov.innerHTML = ''; const box = document.createElement('div'); box.className = 'nightbox'; ov.appendChild(box);
  box.textContent = 'Picking a double feature...'; box.style.color = '#fff';
  if (!g.data.film) { try { g.data.film = await guide('film'); } catch (e) { box.textContent = "Couldn't load the movie list. Check your connection and try again."; return; } buildFilters(); }
  const y = g.kind === 'film' && g.year !== 'all' ? +g.year : 0, ge = g.kind === 'film' ? g.genre : 'all', all = g.data.film;
  let pool = all.filter((x) => (!y || x.y === y) && (ge === 'all' || x.genres.indexOf(ge) >= 0)); if (pool.length < 2) pool = all;
  const pick = (a) => a[Math.floor(Math.random() * Math.min(a.length, 80))];
  const first = pick(pool), rest = pool.filter((x) => x !== first), same = rest.filter((x) => x.genres.some((n) => first.genres.indexOf(n) >= 0)), second = pick(same.length ? same : rest);
  const pair = [first, second]; box.innerHTML = ''; box.style.color = '';
  const h = document.createElement('h2'); h.textContent = "Tonight's double feature"; box.appendChild(h);
  pair.forEach((x) => box.appendChild(ticketEl(x, 'film', true)));
  const mins = pair.reduce((n, x) => n + (x.rt || 0), 0), bar = document.createElement('div'), row = document.createElement('div'); bar.className = 'nbar'; row.className = 'nbtns';
  const total = document.createElement('div'); total.textContent = mins ? 'Total running time: ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm. Get snacks.' : 'Get snacks.';
  const plan = 'Movie night: ' + pair.map((x) => x.title + ' (' + x.y + ')').join(' + ');
  row.append(btn('Another pair', 'btn-aqua sm', movieNight), btn('Add both to watchlist', 'btn-aqua sm', () => { pair.forEach((x) => { if (!inWatch('film', x.title)) toggleWatch(x, 'film'); }); renderGuide(); }), btn('Copy plan', 'btn-aqua sm', function () { copyText(plan, this); }), btn('Close', 'btn-aqua sm', closeOv));
  bar.append(total, row); box.appendChild(bar);
}
function card(x, kind, isPick) {
  const li = document.createElement('li'); li.className = 'gcard' + (isPick ? ' pick' : '');
  const info = document.createElement('div'); info.className = 'ginfo';
  const h = document.createElement('h4'); h.textContent = (isPick ? "Tonight's pick: " : '') + x.title; info.appendChild(h);
  const m = document.createElement('div'); m.className = 'gmeta'; m.textContent = metaBits(x, kind); info.appendChild(m);
  const act = document.createElement('div'); act.className = 'gact';
  const im = link('IMDb', imdbUrl(x));
  const wl = btn('', 'linkbtn', () => { toggleWatch(x, kind); if (g.kind === 'watch') renderGuide(); else sync(); });
  const sync = () => { wl.textContent = inWatch(kind, x.title) ? 'On watchlist (remove)' : '+ Watchlist'; };
  sync(); act.append(btn(kind === 'film' ? 'Play trailer' : 'Play intro', 'btn-aqua sm', () => playItem(x, kind)), btn('Details', 'linkbtn', () => openTicket(x, kind)), im, wl); info.appendChild(act);
  const pe = poster(x, false); pe._x = x; pe._kind = kind; if (posterIO) posterIO.observe(pe);
  li.append(pe, info);
  li._ctx = () => [
    {t: kind === 'film' ? 'Play Trailer' : 'Play Intro', fn: () => playItem(x, kind)}, {t: 'Details', fn: () => openTicket(x, kind)}, {sep: 1},
    {t: inWatch(kind, x.title) ? 'Remove from Watchlist' : 'Add to Watchlist', fn: () => { toggleWatch(x, kind); if (g.kind === 'watch') renderGuide(); else sync(); }}, {sep: 1},
    {t: 'Open on IMDb', fn: () => window.open(imdbUrl(x), '_blank', 'noopener')}, {t: 'Where to Watch', fn: () => window.open(justWatch(x), '_blank', 'noopener')}, {t: 'Copy Title', fn: () => copyPlain(x.title + (x.y || x.y0 ? ' (' + (x.y || x.y0) + ')' : ''))}];
  li.addEventListener('click', (e) => { if (!e.target.closest('button,a')) openTicket(x, kind); });
  return li;
}
function renderGuide() {
  const ul = $('#g-list'); ul.innerHTML = ''; const cnt = $('#g-count');
  $$('#g-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.kind === g.kind));
  $('#g-filters').hidden = g.kind === 'watch'; $('#g-copy').hidden = g.kind !== 'watch'; $('#g-surprise').hidden = $('#g-night').hidden = g.kind === 'watch';
  if (g.kind === 'watch') {
    cnt.textContent = g.watch.length ? g.watch.length + ' saved. Play them on your TV or wherever you like.' : 'Nothing saved yet. Use + Watchlist on any movie or show.';
    g.watch.forEach((w) => ul.appendChild(card(itemOf(w), w.kind, false)));
    return;
  }
  if (!g.data[g.kind]) return;
  const rows = guideRows(), total = g.data[g.kind].length;
  cnt.textContent = rows.length + ' of ' + total + (g.kind === 'film' ? ' movies' : ' shows') + (g.sort === 'fame' ? ', most famous first' : '');
  const upto = Math.max(120, rows.indexOf(g.pick) + 1);
  rows.slice(0, upto).forEach((x) => ul.appendChild(card(x, g.kind, x === g.pick)));
  if (!rows.length) { const li = document.createElement('li'); li.className = 'gempty'; li.textContent = 'Nothing matches those filters. Loosen one and try again.'; ul.appendChild(li); }
}
async function loadGuide() {
  renderGuide(); if (g.kind === 'watch' || g.data[g.kind]) { buildFilters(); return; }
  const tok = ++g.tok, kind = g.kind, cnt = $('#g-count'); cnt.textContent = 'Loading ' + (kind === 'film' ? 'movies' : 'shows') + ' from 1996 to 2005...';
  try { const r = await guide(kind); g.data[kind] = r; } catch (e) { if (tok === g.tok) cnt.textContent = "Couldn't load the list. Check your connection and click the tab again."; return; }
  if (tok === g.tok && g.kind === kind) { buildFilters(); renderGuide(); }
}
$$('#g-tabs button').forEach((b) => { b.onclick = () => { g.kind = b.dataset.kind; g.genre = 'all'; g.net = 'all'; g.pick = null; loadGuide(); }; });
$('#g-year').addEventListener('change', (e) => { g.year = e.target.value; g.pick = null; renderGuide(); });
$('#g-genre').addEventListener('change', (e) => { g.genre = e.target.value; g.pick = null; renderGuide(); });
$('#g-net').addEventListener('change', (e) => { g.net = e.target.value; g.pick = null; renderGuide(); });
$('#g-sort').addEventListener('change', (e) => { g.sort = e.target.value; g.pick = null; renderGuide(); });
$('#g-q').addEventListener('input', (e) => { g.q = e.target.value.trim().toLowerCase(); g.pick = null; renderGuide(); });
$('#g-surprise').addEventListener('click', () => { const r = guideRows(); if (!r.length) return; g.pick = r[Math.floor(Math.random() * r.length)]; renderGuide(); const el = $('#g-list .pick'); if (el) el.scrollIntoView({block: 'center', behavior: 'smooth'}); });
$('#g-night').addEventListener('click', movieNight);
$('#g-copy').addEventListener('click', () => copyText(g.watch.map((w) => w.title + (w.y ? ' (' + w.y + ')' : '')).join('\n'), $('#g-count')));
$('#g-wcount').textContent = g.watch.length;
itYear(it.src); loadGuide();

/* ---------- Date & Time: one date drives the charts, the guide and the old web ---------- */
const dim = (y, m) => new Date(y, m, 0).getDate();
let aroundTok = 0;
function openDate() { openWin('w-date'); fillDateWin(); }
function fillDateWin() {
  fillSelect($('#dt-m'), MONTHS.map((n, i) => [String(i + 1), n]), String(era.m));
  fillSelect($('#dt-y'), YEARS.map((y) => [String(y), String(y)]), String(era.y));
  const days = []; for (let i = 1; i <= dim(era.y, era.m); i++) days.push([String(i), String(i)]);
  fillSelect($('#dt-d'), days, String(era.d));
  $('#dt-big').textContent = DOWS[eraDow()] + ', ' + MONTHS[era.m - 1] + ' ' + era.d + ', ' + era.y;
  fillAround();
}
async function fillAround() {
  const tok = ++aroundTok, box = $('#dt-around'); box.textContent = 'Looking up ' + era.y + '...';
  let songs, films, shows;
  try { [songs, films, shows] = await Promise.all([topSongs(era.y), guide('film'), guide('tv')]); } catch (e) { if (tok === aroundTok) box.textContent = "Couldn't look up what was big that year. Check your connection."; return; }
  if (tok !== aroundTok) return;
  box.innerHTML = '';
  const sec = (title, rows) => {
    const h = document.createElement('h4'); h.textContent = title; const ul = document.createElement('ul');
    rows.forEach(([text, label, fn]) => { const li = document.createElement('li'), sp = document.createElement('span'); sp.textContent = text; li.append(sp, btn(label, 'btn-aqua sm', fn)); ul.appendChild(li); });
    box.append(h, ul);
  };
  const y = era.y;
  if (songs[0]) sec('The #1 song of ' + y, [['#1  ' + songs[0].title + ' - ' + songs[0].artist, 'Play', async () => { openWin('w-utunes'); await itYear(y); itPlay(0); }]]);
  sec('Famous movies of ' + y, films.filter((x) => x.y === y).slice(0, 5).map((x) => [x.title + (x.rt ? ' (' + x.rt + ' min)' : ''), 'Trailer', () => playItem(x, 'film')]));
  sec('Famous shows on TV in ' + y, shows.filter((x) => x.y0 <= y && y <= x.y1).slice(0, 5).map((x) => [x.title + (x.nets && x.nets[0] ? ' (' + x.nets[0] + ')' : ''), 'Intro', () => playItem(x, 'tv')]));
}
function setEra(p, auto) {
  if (!auto) eraAuto = false;
  Object.assign(era, p); era.d = Math.min(era.d, dim(era.y, era.m)); tick();
  if (!$('#w-date').hidden) fillDateWin();
  if (typeof it.src === 'number' && it.src !== era.y) itYear(era.y);
  g.year = String(era.y); g.pick = null; if (g.kind !== 'watch' && g.data[g.kind]) buildFilters(); renderGuide();
  cat.eraChanged();
  syncWeb(); if (webHomeOn) webHome(true); else if (webLoaded) webGo(webUrl, true);
}
$('#dt-m').addEventListener('change', (e) => setEra({m: +e.target.value}));
$('#dt-d').addEventListener('change', (e) => setEra({d: +e.target.value}));
$('#dt-y').addEventListener('change', (e) => setEra({y: +e.target.value}));
$('#clock').addEventListener('click', openDate);
$('#clock').addEventListener('keydown', (e) => { if (e.key === 'Enter') openDate(); });

/* Old Web: Internet Archive snapshots of real sites as they were on the chosen date */
const SITES = [['Yahoo!', 'yahoo.com', 1996], ['Google', 'google.com', 1998], ['Amazon', 'amazon.com', 1996], ['eBay', 'ebay.com', 1997], ['CNN', 'cnn.com', 1996], ['Apple', 'apple.com', 1996], ['Microsoft', 'microsoft.com', 1996], ['AOL', 'aol.com', 1996], ['MTV', 'mtv.com', 1996], ['Nickelodeon', 'nick.com', 1996], ['Cartoon Network', 'cartoonnetwork.com', 1996], ['IGN', 'ign.com', 1998], ['Space Jam', 'spacejam.com', 1996], ['NASA', 'nasa.gov', 1996], ['Neopets', 'neopets.com', 1999], ['Napster', 'napster.com', 1999], ['MySpace', 'myspace.com', 2003], ['TheFacebook', 'thefacebook.com', 2004], ['Hamster Dance', 'hamsterdance.com', 1998], ['Homestar Runner', 'homestarrunner.com', 2000], ['Newgrounds', 'newgrounds.com', 1999], ['Ask Jeeves', 'ask.com', 1997], ['AltaVista', 'altavista.com', 1996], ['GeoCities', 'geocities.com', 1996], ['Angelfire', 'angelfire.com', 1997], ['Weebl', 'weebls-stuff.com', 2002]];
let webUrl = '', webLoaded = false, webT = 0, webSince = 0;
const waybackTs = () => era.y + pad2(era.m) + pad2(era.d) + '000000';
function syncWeb() {
  $('#web-date').textContent = MONTHS[era.m - 1] + ' ' + era.d + ', ' + era.y;
  const bm = $('#web-bm'); bm.innerHTML = '';
  SITES.forEach(([n, u, from]) => { const b = btn(n, '', () => webGo(u)); b.disabled = era.y < from; b.title = era.y < from ? n + ' did not exist yet in ' + era.y : u; bm.appendChild(b); });
}
function webWaitHide() { clearTimeout(webT); const left = Math.max(0, 1700 - (Date.now() - webSince)); webT = setTimeout(() => { $('#web-wait').hidden = true; }, left); }
// our own history, since a page from another site cannot be asked what came before it
const wh = {list: [], i: -1};
function webPush(e) { wh.list = wh.list.slice(0, wh.i + 1); if (!wh.list.length || wh.list[wh.i].url !== e.url) { wh.list.push(e); wh.i = wh.list.length - 1; } webNavBtns(); }
function webNavBtns() { $('#web-back').disabled = wh.i <= 0; $('#web-fwd').disabled = wh.i >= wh.list.length - 1; }
function webStep(n) {
  const j = wh.i + n; if (j < 0 || j >= wh.list.length) return; wh.i = j; webNavBtns();
  const e = wh.list[j]; if (e.url) webGo(e.url, true); else webHome(true);
}
function webGo(raw, keep) {
  let u = String(raw || '').trim(); if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  let host = '';
  try { const p = new URL(u); if (!/^https?:$/.test(p.protocol) || p.hostname.indexOf('.') < 0) throw new Error('bad'); u = p.href; host = p.hostname; } catch (e) { $('#web-stat').textContent = "That doesn't look like a web address."; return; }
  webHomeOn = false; homeTok++; $('#web-today').hidden = true; webUrl = u; webLoaded = true; if (!keep) webPush({url: u}); $('#web-url').value = u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  $('#web-wait').hidden = false; $('#web-wait .pb i').style.animation = 'none'; void $('#web-wait').offsetWidth; $('#web-wait .pb i').style.animation = '';
  webSince = Date.now(); sfx('modem'); clearTimeout(webT); webT = setTimeout(() => { $('#web-wait').hidden = true; }, 30000);
  $('#web-frame').src = 'https://web.archive.org/web/' + waybackTs() + 'if_/' + u;
  $('#web-stat').textContent = 'Connecting to ' + host + ' as it was around ' + MONTHS[era.m - 1] + ' ' + era.y + '...';
}
// the start page: what happened on the date on the clock
let webHomeOn = false, homeTok = 0;
function webHome(keep) {
  if (!keep) webPush({url: ''});
  webHomeOn = true; webLoaded = false; const tok = ++homeTok, box = $('#web-today'), {y, m, d} = era;
  $('#web-wait').hidden = true; clearTimeout(webT); $('#web-frame').removeAttribute('src'); box.hidden = false; $('#web-url').value = 'y2k://today';
  box.innerHTML = ''; const ld = document.createElement('div'); ld.className = 'wh-load'; ld.textContent = 'Looking up ' + MONTHS[m - 1] + ' ' + d + ', ' + y + '...'; box.appendChild(ld);
  $('#web-stat').textContent = 'Today, as it was on ' + MONTHS[m - 1] + ' ' + d + ', ' + y + '.';
  onThisDay(y, m, d).then((r) => { if (tok === homeTok && webHomeOn) drawToday(box, r); }, () => { if (tok === homeTok) ld.textContent = "Couldn't reach the archives. Click Home to try again."; });
}
// small picture badges so a section can be told apart at a glance
const WH_DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
  + '<radialGradient id="wBlue" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d8f0ff"/><stop offset=".45" stop-color="#4aa8f5"/><stop offset="1" stop-color="#0b4fb8"/></radialGradient>'
  + '<radialGradient id="wRed" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffd8d0"/><stop offset=".45" stop-color="#f0483a"/><stop offset="1" stop-color="#8a0f08"/></radialGradient>'
  + '<linearGradient id="wGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>'
  + '<linearGradient id="wMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdfdfd"/><stop offset="1" stop-color="#aeb4be"/></linearGradient>'
  + '<linearGradient id="wDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a6f78"/><stop offset="1" stop-color="#15171b"/></linearGradient>'
  + '<linearGradient id="wScreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9f8ff"/><stop offset="1" stop-color="#2f9ec4"/></linearGradient>'
  + '<linearGradient id="wPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ddd8c8"/></linearGradient>'
  + '<linearGradient id="wWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ac70"/><stop offset="1" stop-color="#7a4a1c"/></linearGradient>'
  + '</defs></svg>';
// little glossy objects, not flat symbols
const WH_IC = {
  news: '<path d="M4 3h13l3 3v15H4z" fill="url(#wPaper)" stroke="#7a7668" stroke-width=".8"/><path d="M17 3v3h3z" fill="#cfc9b4" stroke="#7a7668" stroke-width=".6"/><rect x="6" y="6" width="9" height="3" fill="#222"/><path d="M6 11h12M6 13.5h12M6 16h7" stroke="#888" stroke-width="1"/><rect x="14" y="15" width="4" height="4" fill="#b9b39d"/>',
  music: '<circle cx="12" cy="12" r="10" fill="url(#wBlue)" stroke="#0a3a8a" stroke-width=".8"/><path d="M10 16V9l5-1v6" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="8.8" cy="16" r="1.7" fill="#fff"/><circle cx="13.8" cy="14.3" r="1.7" fill="#fff"/><ellipse cx="12" cy="6.5" rx="7" ry="4" fill="url(#wGloss)"/>',
  film: '<rect x="3" y="11" width="18" height="10" rx="1.5" fill="url(#wDark)" stroke="#000" stroke-width=".7"/><path d="M3 9.5 20.5 5.5 21 9 3.5 13z" fill="#222" stroke="#000" stroke-width=".6"/><path d="M6 8.6l2.2-.5-1.6 3.2-2.2.5zM11 7.5l2.2-.5-1.6 3.2-2.2.5zM16 6.4l2.2-.5-1.6 3.2-2.2.5z" fill="#fff"/><path d="M6 16h12M6 18.5h8" stroke="#ddd" stroke-width="1"/><rect x="3.5" y="11.5" width="17" height="4" rx="1" fill="url(#wGloss)" opacity=".5"/>',
  tv: '<path d="M8 3l3 3M16 3l-3 3" stroke="#444" stroke-width="1" fill="none" stroke-linecap="round"/><rect x="2.5" y="6" width="19" height="14" rx="3" fill="url(#wMetal)" stroke="#6a6f78" stroke-width=".8"/><rect x="4.5" y="8" width="11.5" height="10" rx="2" fill="url(#wScreen)" stroke="#2a4a5a" stroke-width=".7"/><path d="M5.5 9.2h7l-5 4z" fill="url(#wGloss)" opacity=".7"/><circle cx="19" cy="10.5" r="1.1" fill="#8a8f98"/><circle cx="19" cy="14" r="1.1" fill="#8a8f98"/>',
  air: '<circle cx="12" cy="12" r="10" fill="url(#wRed)" stroke="#6a0c06" stroke-width=".8"/><circle cx="12" cy="13" r="1.5" fill="#fff"/><path d="M8.5 9.5a5 5 0 0 0 0 7M15.5 9.5a5 5 0 0 1 0 7" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/><ellipse cx="12" cy="6.5" rx="7" ry="4" fill="url(#wGloss)"/>',
  photo: '<rect x="2.5" y="7" width="19" height="13" rx="2.5" fill="url(#wMetal)" stroke="#5a5f68" stroke-width=".8"/><path d="M8 7l1.4-2.4h5.2L16 7z" fill="url(#wDark)"/><circle cx="12" cy="13.5" r="5" fill="url(#wDark)" stroke="#000" stroke-width=".6"/><circle cx="12" cy="13.5" r="3.4" fill="url(#wBlue)"/><ellipse cx="10.8" cy="12" rx="1.4" ry=".9" fill="#fff" opacity=".85"/><rect x="4.5" y="9" width="2.4" height="1.6" rx=".5" fill="#ffe46b"/>',
  hist: '<rect x="5" y="2.5" width="14" height="3" rx="1" fill="url(#wWood)" stroke="#4a2c0f" stroke-width=".6"/><rect x="5" y="18.5" width="14" height="3" rx="1" fill="url(#wWood)" stroke="#4a2c0f" stroke-width=".6"/><path d="M7 5.5h10c0 4-3.5 5-3.5 6.5s3.5 2.5 3.5 6.5H7c0-4 3.5-5 3.5-6.5S7 9.5 7 5.5z" fill="#dff1ff" fill-opacity=".75" stroke="#5b7f99" stroke-width=".7"/><path d="M8.5 17.5c0-2 3.5-3 3.5-3s3.5 1 3.5 3z" fill="#e6b422"/><path d="M8.6 6.5h6.8c-.3 2-2 3-3.4 3s-3.1-1-3.4-3z" fill="#e6b422"/>',
  web: '<circle cx="12" cy="12" r="10" fill="url(#wBlue)" stroke="#0a3a8a" stroke-width=".8"/><path d="M7 7c2-1 4 0 4 2s-2 2-1 4-3 1-4-1-1-4 1-5zM14 11c2-1 5 0 4 3s-2 4-3 4-2-2-1-4z" fill="#46b34a" opacity=".9"/><ellipse cx="12" cy="6.5" rx="7" ry="3.8" fill="url(#wGloss)"/>'
};
const whIcon = (k, big) => { const e = document.createElement('span'); e.className = 'wh-ic' + (big ? ' big' : ''); e.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + WH_IC[k] + '</svg>'; return e; };
// wire headlines are long: keep the first sentence, bold the topic, move the source to the end
function newsLine(t) {
  const src = (t.match(/(\s*\([^()]{2,24}\))+\s*$/) || [''])[0].trim(); t = t.slice(0, t.length - src.length).trim();
  const m = t.match(/^([^:]{3,38}):\s+(.*)$/), topic = m ? m[1] : '', body = m ? m[2] : t;
  let one = body; const dot = body.search(/[.!?]\s+[A-Z]/); if (dot > 40) one = body.slice(0, dot + 1); if (one.length > 150) one = one.slice(0, 147).replace(/\s+\S*$/, '') + '...';
  return {topic, text: one, src: src.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')[0]};
}
function drawToday(box, r) {
  box.innerHTML = '';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const cols = {a: el('div', 'wh-col'), b: el('div', 'wh-col wh-main'), c: el('div', 'wh-col')}, tiles = [];
  const tile = (col, ic, label, title, ...kids) => { const x = el('section', 'wh-tile'), hd = el('h3'); hd.append(whIcon(ic), document.createTextNode(title)); x.appendChild(hd); const body = el('div', 'wh-body'); kids.forEach((k) => k && body.appendChild(k)); x.appendChild(body); cols[col].appendChild(x); tiles.push([ic, label, x]); return x; };
  // a row led by a picture instead of a heading
  const row = (ic, ...kids) => { const x = el('div', 'wh-row'); x.appendChild(whIcon(ic, true)); const t = el('div', 'wh-rt'); kids.forEach((k) => t.appendChild(k)); x.appendChild(t); return x; };
  const lines = (a, pre) => { const u = el('ul'); a.forEach((f) => { const li = el('li', '', f.title); if (f.date) li.appendChild(el('small', '', pre + f.date)); u.appendChild(li); }); return u; };
  const ent = [];
  if (r.song) { const p = el('div'); p.append(el('b', '', '\u201c' + r.song.title + '\u201d'), el('br'), document.createTextNode(r.song.artist + ' ')); p.appendChild(btn('[find it]', 'linkbtn', () => { openWin('w-utunes'); $('#it-q').value = r.song.title; itSearch(); })); ent.push(row('music', el('small', 'wh-cap', '#1 song'), p)); }
  if (r.film) ent.push(row('film', el('small', 'wh-cap', '#1 at the box office'), el('b', '', r.film.title)));
  if (r.releases && r.releases.length) ent.push(row('film', el('small', 'wh-cap', 'New in theaters'), lines(r.releases.slice(0, 5), '')));
  if (r.premieres && r.premieres.length) ent.push(row('tv', el('small', 'wh-cap', 'New on TV'), lines(r.premieres.slice(0, 5), '')));
  if (r.onair && r.onair.length) ent.push(row('air', el('small', 'wh-cap', 'On the air'), lines(r.onair.slice(0, 6).map((t) => ({title: t})), '')));
  if (ent.length) tile('a', 'music', 'Fun', 'Entertainment', ...ent);
  if (r.headlines.length) {
    const u = el('ul', 'wh-news');
    r.headlines.slice(0, 5).forEach((h) => { const n = newsLine(h), li = el('li'); if (n.topic) li.appendChild(el('b', '', n.topic + ': ')); li.appendChild(document.createTextNode(n.text)); if (n.src) li.appendChild(el('small', '', ' ' + n.src)); u.appendChild(li); });
    tile('b', 'news', 'News', 'Headlines', u);
  }
  const past = r.events.slice(0, 4).map((t) => ({title: t})).concat(r.deaths.slice(0, 2).map((t) => ({title: 'In memoriam: ' + t})));
  if (past.length) tile('b', 'hist', 'History', 'On This Day', lines(past, ''));
  if (r.photo) { const a = el('a'); a.href = r.photo.page; a.target = '_blank'; a.rel = 'noopener'; const im = el('img'); im.src = r.photo.url; im.alt = r.photo.caption; a.appendChild(im); tile('c', 'photo', 'Photo', 'Picture of the Day', a, el('small', 'wh-cap', r.photo.caption)); }
  if (!tiles.length) tile('b', 'news', '', 'Not Much Here', el('p', '', 'The archives have little for this exact day. Try another date, or visit a site below.'));
  const top = el('div', 'wh-top'); top.append(el('span', 'wh-brand', 'Nostalgia Desktop'), el('span', 'wh-date', DOWS[eraDow()] + ', ' + MONTHS[era.m - 1] + ' ' + era.d + ', ' + era.y));
  const nav = el('div', 'wh-nav'); tiles.forEach(([ic, label, x]) => { if (!label) return; const b = btn('', '', () => x.scrollIntoView({behavior: 'smooth', block: 'start'})); b.title = label; b.setAttribute('aria-label', label); b.appendChild(whIcon(ic)); b.appendChild(document.createTextNode(label)); nav.appendChild(b); });
  const sites = el('div', 'wh-sites'); sites.appendChild(whIcon('web')); SITES.forEach(([n, u, from]) => { if (era.y >= from) sites.appendChild(btn(n, 'linkbtn', () => webGo(u))); });
  const grid = el('div', 'wh-grid'); grid.append(cols.a, cols.b, cols.c);
  box.insertAdjacentHTML('afterbegin', WH_DEFS);
  box.append(top, nav, grid, sites, el('div', 'wh-foot', 'From Wikipedia and Wikimedia Commons. Not every day has every section.'));
}
// the first time Old Web opens each visit it "dials in", like going online did; click to skip
let dialed = false, dialT = [];
function dialUp(done) {
  const box = $('#web-dial'); dialed = true; box.hidden = false; box.innerHTML = '';
  const t = document.createElement('b'); t.textContent = 'Connect to the Internet'; const bar = document.createElement('div'); bar.className = 'pb'; const fill = document.createElement('i'); bar.appendChild(fill);
  const log = document.createElement('div'); log.className = 'dl-log'; const sk = document.createElement('small'); sk.textContent = 'Click anywhere to skip';
  box.append(t, bar, log, sk);
  const kbps = era.y <= 1997 ? '33,600' : '53,333';
  const steps = [[200, 'Initializing modem...', 8], [1200, 'Dialing 555-0142...', 25], [3300, 'Waiting for answer...', 45], [4700, 'Negotiating connection...', 70], [7300, 'Verifying user name and password...', 90], [8800, 'Connected at ' + kbps + ' bps', 100]];
  let ended = false;
  const finish = () => { if (ended) return; ended = true; dialT.forEach(clearTimeout); dialT = []; dialStop(); box.hidden = true; done(); };
  steps.forEach(([ms, txt, pct], i) => dialT.push(setTimeout(() => { const l = document.createElement('div'); l.textContent = txt; log.appendChild(l); fill.style.width = pct + '%'; if (i === steps.length - 1) sfx('door'); }, ms)));
  dialT.push(setTimeout(finish, 9800));
  box.onclick = finish; sfx('dialup');
}
function webFirst() { if (!dialed) { dialUp(() => { if (!webLoaded && !webHomeOn) webHome(); }); return; } if (!webLoaded && !webHomeOn) webHome(); }
$('#web-frame').addEventListener('load', () => { if (!webLoaded) return; webWaitHide(); $('#web-stat').textContent = 'Done. Pages come from the Internet Archive, so some images and links may be missing.'; });
$('#web-form').addEventListener('submit', (e) => { e.preventDefault(); webGo($('#web-url').value); });
$('#web-home').addEventListener('click', () => webHome());
$('#web-back').addEventListener('click', () => webStep(-1));
$('#web-fwd').addEventListener('click', () => webStep(1));
$('#web-reload').addEventListener('click', () => { if (webHomeOn) webHome(true); else if (webLoaded) webGo(webUrl, true); });
$('#web-date').addEventListener('click', openDate);
syncWeb();

/* ---------- menu bar (menus change with the active app), About windows, Spotlight, log out, shut down ---------- */
const WALLS = [['blue', 'Blue'], ['graphite', 'Graphite'], ['grape', 'Grape'], ['tangerine', 'Tangerine'], ['lime', 'Lime']];
const APPS = [
  ['NIM', () => openWin(signedIn ? 'w-buddy' : 'w-sign')],
  ['Join a Chat Room', () => openWin(signedIn ? 'w-rooms' : 'w-sign')],
  ['uTunes', () => openWin('w-utunes')],
  ['QuickShow', () => openWin('w-qt')],
  ['Movie Guide', () => openWin('w-guide')],
  ['Mail', () => openWin('w-mail')],
  ['Catalog', () => { cat.ensure(); openWin('w-cat'); }],
  ['Arcade', () => { arcade.ensure(); openWin('w-arcade'); }],
  ['Sounds', () => openWin('w-sounds')],
  ['Old Web', () => { openWin('w-web'); webFirst(); }],
  ['Date & Time', openDate],
  ['Movie Night', () => { openWin('w-guide'); movieNight(); }],
  ['TV', () => openTv(false)]
];
const activeWin = () => $$('.win').filter((w) => !w.hidden && w.classList.contains('active'))[0];
const appWins = (name) => $$('.win').filter((w) => w.dataset.app === name && (!w.hidden || w._mini));

// the how-to text for each app, opened from its Help menu
const HELPS = {
  'Nostalgia Desktop': ['Nostalgia Desktop', [
    'A desktop from 1996 to 2005, with the real music, movies, TV shows and websites of the time. It starts on today\'s month and day in 2005. Click the clock to travel to any other date.',
    'Apps in the dock: Old Web (a browser), NIM (buddy list, chat rooms and profiles), uTunes (music charts), Movie Guide (what to watch), TV (an old TV with channels), QuickShow (video player), Arcade (small games), Mail and Sounds. The Read Me drive on the right is this window.',
    'Handy things: the screen saver (System menu) has four looks, Old Web dials in the first time you open it, right-click almost anything for a menu, drag dock icons to reorder them, press the green button to maximize a window, and use Enter Full Screen in the System menu to hide the browser around it.']],
  'uTunes': ['uTunes', [
    'Music only. It opens on the Billboard Year-End Hot 100 for the year on your clock, and you can open any year from 1996 to 2005. Type in the search box to filter all of the charts at once.',
    'Click a song to play its music video. Use the shuffle button, the + button to build My Playlist, and the video button to hide the picture and keep the music. Random year pick drops you into a random year. Right-click a song to play it, add it, search it on YouTube or copy its name.',
    'In My Playlist, Burn CD makes a mix CD for the feeling and copies the tracklist, Open in YouTube sends the songs to a YouTube queue, and Export saves the list as a CSV. Upload that to a converter site such as TuneMyMusic or Soundiiz to build the same playlist in Spotify or Apple Music.',
    'Charts come from Wikipedia. Videos play through YouTube, so a few may be blocked by their owners.']],
  'QuickShow': ['QuickShow', [
    'A small player for trailers and TV openings. It has no list of its own: pick something in the Movie Guide and it opens here.',
    'For flipping through TV shows, open the TV app. If a video will not play, the status line under the controls shows why and links to it on YouTube.']],
  'Movie Guide': ['Movie Guide', [
    'A place to decide what to watch. Movies and TV shows from 1996 to 2005, most famous first, from Wikidata. It opens filtered to the year on your clock.',
    'Filter by year, genre and (for TV) network. Surprise me highlights a random pick from whatever you filtered, and Movie Night chooses a double feature with the total running time. Right-click a title for quick actions.',
    'Click any title for its ticket: plot, poster, IMDb and where to watch. Save titles to the Watchlist and copy the list to take it to your TV. Play trailer and Play intro open the video in QuickShow. The guide does not stream movies or episodes.']],
  'NIM': ['NIM', [
    'NIM is short for Nostalgia IM. Instant messages, a buddy list, public chat rooms and member profiles in one program, like the original. Sign on once, then click a buddy to message them, or press the chat button to join a room.',
    'There is no server: visitors connect straight to each other through WebRTC, found by public relays. The regulars on the list are bots, and they are labeled. They have profiles too. Away messages send an automatic reply.',
    'Screen names are checked at sign-on and refused if someone online already has one. If two people still end up with the same name, the second shows as name (2). In a room, click a name to tag it with @name. A tag that names you is highlighted.',
    'Press the person button to edit your profile: mood, about text, color and a profile song. Others see it when they choose View Profile on your name, and it exists only while you are online. Anyone can join and nothing is moderated. Do not share personal details, and use Block in any chat.']],
  'TV': ['TV', [
    'An old TV in your dock. Press the power button, then flip channels with the up and down buttons, or the arrow keys while the TV is selected. Volume has its own buttons.',
    'Most of channels 1 to 69 are TV shows from 1996 to 2005, in a lineup that stays the same on every visit. There is also a news channel, a commercials channel and Saturday morning cartoons. The news looks for a broadcast from the exact date on your clock, then that month, then that year.',
    'The TV finds a full episode or a scene on YouTube and drops you into the middle of it. When a show ends you may get a commercial break before the next channel. Videos about a show, like reactions and reviews, are filtered out, but titles are all it can go by, so a few may slip through.']],
  'Old Web': ['Old Web', [
    'A browser for the old web. It opens on an On This Day page for the date on your clock: headlines, the number one song and movie, new releases, what was on TV and a picture of the day, from Wikipedia and Wikimedia Commons. Home brings you back to it.',
    'Pick a bookmark or type an address to see a real website as the Internet Archive saved it near that date. Back and Forward work for pages you open from the toolbar, and the date button changes the day.',
    'Pages from long ago load slowly and are often missing pictures or links. A site that did not exist yet in the chosen year has a dimmed bookmark. Pages and their scripts belong to the Archive and the original sites. Nothing here is saved by this site.']],
  'Date & Time': ['Date & Time', [
    'Click the clock in the menu bar to set the date, anywhere from 1996 to 2005. The site starts on today\'s month and day in 2005 every time you load it, and a date you pick lasts until you reload.',
    'The charts open on that year, the Movie Guide filters to it, Old Web shows that day and websites as they were then, and the TV news looks for that day. The panel lists the number one song, the famous movies and the shows on TV that year.']],
  'Mail': ['Mail', [
    'A small inbox. New mail arrives every 8 to 12 minutes while you use the computer (Settings lets you make it more or less often, or only when you press Get Mail). A chime plays, a voice announces "You\'ve got mail!" (read by your browser\'s own voice, so it sounds different on each computer), a mailbox pops up, and a red number on the dock icon shows how many are unread. Press Get Mail to check right away.',
    'The Postmaster sends a Daily Digest for the date on your clock: the number one song and movie, headlines and history, from the same sources as Old Web. The rest are chain letters, forwards and notes from the regulars on NIM. All of it is written for this site, and nothing is sent anywhere.',
    'Right-click a message to mark it unread or delete it. Your inbox is saved in this browser only.']],
  'Catalog': ['Catalog', [
    'Scans of the real printed mail-order catalogs, the thick JCPenney and Sears books that came in the mail before online shopping. It opens the one that fits the date on your clock: the Christmas book in November and December, the Fall and Winter book from August, and the Spring and Summer book the rest of the year, whichever of those exists for that year. Library shows every catalog from that year.',
    'Turn pages by clicking the left or right side of the book, dragging across it, using the arrow buttons or the left and right arrow keys. The Pages sidebar jumps anywhere, and typing a number in the box goes to that page. The + and - buttons (or the + and - keys, double-clicking a page, or Ctrl or Cmd with the scroll wheel or a pinch) zoom in and out, and you drag to look around. The button next to the zoom buttons (or the F key) shows just the book in true full screen, with no windows or menus, and Esc leaves it. The green button makes the window bigger. Your place in each catalog is remembered in this browser.',
    'Pages load from christmas.musetechnical.com, which keeps the scans online for anyone to look at, so a page can take a few seconds to arrive and the catalogs need an internet connection. Prices, phone numbers and offers are from the original books and nothing here can be ordered.']],
  'Arcade': ['Arcade', [
    'Four small games, all made for this site. Snake is a green phone screen: use the arrow keys, WASD or the pad, and Space pauses. Minefield is the classic: click to open a square, right-click to flag it (the Flag button does it for touch screens).',
    'Blockfall is falling blocks: left and right move, Up or Z turns the piece left, X turns it right, Space drops it, P pauses, and full rows clear. Pixel Pet is a keychain dog or cat that hatches after a minute, grows, and gets hungry and bored while you are away, so come back and feed it. It never dies and it makes noise when it needs you.',
    'Best scores and your pet are saved in this browser only.']],
  'Sounds': ['Sounds', [
    'The default beeps are made in your browser. Choose your own audio files for each event and they stay in this browser only. A file chosen for the message or send sound is also used for instant messages.',
    'The links under Hear the originals open YouTube in a new tab.']]
};
const ABOUTS = {
  'Nostalgia Desktop': ['Nostalgia Desktop', [
    'Model 96-05',
    '## What it is',
    'A computer from 1996 to 2005 that runs in your browser. Set the date and it fills with the real music, movies, TV shows and websites of that time.',
    '## Why it exists',
    'For anyone who misses the early internet. It is a time capsule to look around in, a place to find something to watch or listen to, and a way to chat with other people who remember.',
    '## Who made it',
    'Built by Claude, an AI made by Anthropic, and directed by Hert Niks. The code is open source: https://github.com/hertn/nostalgia-desktop',
    'A fan tribute, not connected to any company or service. Content is looked up live from Wikipedia, Wikidata, Wikimedia Commons, YouTube and the Internet Archive.']],
  'uTunes': ['uTunes', ['Music from the Billboard year-end charts, 1996 to 2005.', 'Part of Nostalgia Desktop.']],
  'QuickShow': ['QuickShow', ['A small video player for trailers and TV openings.', 'Part of Nostalgia Desktop.']],
  'Movie Guide': ['Movie Guide', ['Movies and TV shows from 1996 to 2005.', 'Part of Nostalgia Desktop.']],
  'NIM': ['NIM', ['Nostalgia IM. Instant messages, chat rooms and profiles.', 'Part of Nostalgia Desktop.']],
  'TV': ['TV', ['An old TV with channels from the era.', 'Part of Nostalgia Desktop.']],
  'Mail': ['Mail', ['A small inbox with chain letters and a daily digest.', 'Part of Nostalgia Desktop.']],
  'Catalog': ['Catalog', ['Scans of the printed JCPenney and Sears catalogs of the year.', 'Part of Nostalgia Desktop.']],
  'Arcade': ['Arcade', ['Four small games made for this site.', 'Part of Nostalgia Desktop.']],
  'Old Web': ['Old Web', ['The web as it looked, from the Internet Archive.', 'Part of Nostalgia Desktop.']],
  'Date & Time': ['Date & Time', ['Set the clock anywhere from 1996 to 2005.', 'Part of Nostalgia Desktop.']],
  'Sounds': ['Sounds', ['Choose the sounds the computer makes.', 'Part of Nostalgia Desktop.']]
};
function fillAbout(app, help) {
  const a = (help ? HELPS : ABOUTS)[app] || ABOUTS['Nostalgia Desktop'], body = $('#about-body'); body.innerHTML = '';
  const h = document.createElement('h2'); h.textContent = a[0]; body.appendChild(h);
  a[1].forEach((t) => {
    if (t.indexOf('## ') === 0) { const h3 = document.createElement('h3'); h3.textContent = t.slice(3); body.appendChild(h3); return; }
    const p = document.createElement('p');
    // web addresses in the text become links
    t.split(/(https:\/\/[^\s]+[^\s.,)])/).forEach((bit) => { if (/^https:\/\//.test(bit)) { const l = document.createElement('a'); l.href = bit; l.textContent = bit.replace(/^https:\/\//, ''); l.target = '_blank'; l.rel = 'noopener'; p.appendChild(l); } else p.appendChild(document.createTextNode(bit)); });
    body.appendChild(p);
  });
  $('#about-title').textContent = help ? a[0] + ' Help' : 'About ' + a[0];
}
function openAbout(app, help) { const key = ABOUTS[app] ? app : 'Nostalgia Desktop'; fillAbout(key, help); const w = $('#w-about'); w.dataset.app = key === 'Nostalgia Desktop' ? 'Finder' : key; openWin(w); }

function signOut() {
  if (!signedIn) return;
  Object.values(rooms).forEach((R) => closeWin(R.w));
  try { if (lobby) lobby.leave(); } catch (e) { /* already left */ }
  clearInterval(presTimer); lobby = null; netOk = false; Object.keys(A).forEach((k) => delete A[k]); peers.clear();
  $$('.im').forEach((w) => w.remove()); Object.keys(chats).forEach((k) => delete chats[k]);
  signedIn = false; $('#w-buddy').hidden = true; $('#w-rooms').hidden = true; openWin('w-sign');
}
// shutting down: windows fold away, the dock drops, the screen says so, then collapses to a dot like a tube TV
let shutting = false;
function shutDown() {
  if (shutting) return; shutting = true; stopSaver(); arcade.stop(); tubeIt.pause(); tubeQt.pause(); tvPower(false); closeMenu(); sfx('shutdown');
  const wins = $$('.win').filter((w) => !w.hidden); wins.forEach((w, i) => { w.style.animationDelay = (i * 90) + 'ms'; }); document.body.classList.add('shutting');
  const shut = $('#shut'), inner = $('.shutin', shut), t0 = 700 + wins.length * 90;
  setTimeout(() => { inner.classList.remove('going'); shut.hidden = false; }, t0);
  setTimeout(() => inner.classList.add('going'), t0 + 1800);
  setTimeout(() => { shut.hidden = true; document.body.classList.remove('shutting'); wins.forEach((w) => { w.style.animationDelay = ''; }); shutting = false; showPower(); }, t0 + 2450);
}

// browser full screen, like F11: no tabs or address bar
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsOk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function toggleFullscreen() {
  try {
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const e = document.documentElement; (e.requestFullscreen || e.webkitRequestFullscreen).call(e); }
  } catch (x) { /* the browser did not allow it */ }
}
function sysItems() {
  const cur = desk.dataset.wall;
  const it2 = [{t: 'About Nostalgia Desktop', fn: () => openAbout('Nostalgia Desktop')}, {t: 'Date & Time...', fn: openDate}, {sep: 1}, {t: 'Desktop Color', dis: true}];
  WALLS.forEach(([k, n]) => it2.push({t: (cur === k ? '✓ ' : ' ') + n, fn: () => setWall(k)}));
  it2.push({sep: 1}, {t: 'Screen Saver', dis: true});
  [['random', 'Random']].concat(saverKeys.map((k) => [k, SAVERS[k].name])).forEach(([k, n]) => it2.push({t: (saverPick === k ? '✓ ' : ' ') + n, fn: () => { saverPick = k; store.set('saver', k); }}));
  it2.push({t: 'Start Screen Saver Now', fn: () => setTimeout(() => startSaver(saverPick === 'random' ? undefined : saverPick), 300)}, {sep: 1}, {t: fsEl() ? 'Exit Full Screen' : 'Enter Full Screen', dis: !fsOk(), fn: toggleFullscreen}, {t: soundOn ? 'Mute Sound' : 'Turn Sound On', fn: () => $('#snd').click()}, {sep: 1});
  if (signedIn) it2.push({t: 'Log Out ' + me + '...', fn: signOut});
  it2.push({t: 'Restart...', fn: () => location.reload()}, {t: 'Shut Down...', fn: shutDown});
  return it2;
}
function appItems() {
  const app = $('#appname').textContent, has = app !== 'Finder';
  return [{t: 'About ' + (has ? app : 'Nostalgia Desktop'), fn: () => openAbout(has ? app : 'Nostalgia Desktop')}, {sep: 1}, {t: 'Hide ' + app, dis: !has, fn: () => appWins(app).forEach((w) => { w.hidden = true; w._mini = true; syncDock(); })}, {t: 'Quit ' + app, dis: !has, fn: () => appWins(app).forEach((w) => closeWin(w))}];
}
function editItems() {
  const el = document.activeElement, field = el && /^(INPUT|TEXTAREA)$/.test(el.tagName);
  return [{t: 'Undo', dis: true}, {sep: 1}, {t: 'Cut', key: '⌘X', dis: !field, fn: () => { el.focus(); document.execCommand('cut'); }}, {t: 'Copy', key: '⌘C', fn: () => document.execCommand('copy')}, {t: 'Paste', dis: true}, {sep: 1}, {t: 'Select All', key: '⌘A', dis: !field, fn: () => { el.focus(); el.select(); }}];
}
function windowItems() {
  const act = activeWin(), wins = $$('.win').filter((w) => !w.hidden);
  const it2 = [{t: 'Minimize', key: '⌘M', dis: !act, fn: () => act && $('.l.min', act).click()}, {t: 'Zoom', dis: !act || !act.hasAttribute('data-zoom'), fn: () => act && $('.l.zoom', act).click()}, {t: 'Bring All to Front', fn: () => wins.forEach((w) => { w.style.zIndex = ++zTop; })}, {t: fsEl() ? 'Exit Full Screen' : 'Enter Full Screen', dis: !fsOk(), fn: toggleFullscreen}, {sep: 1}];
  if (!wins.length) it2.push({t: 'No open windows', dis: true});
  wins.forEach((w) => it2.push({t: (w === act ? '✓ ' : ' ') + $('.title', w).textContent, fn: () => focusWin(w)}));
  return it2;
}
function menusFor(app) {
  const act = activeWin();
  const close = {t: 'Close Window', key: '⌘W', dis: !act, fn: () => act && closeWin(act)};
  const edit = ['Edit', editItems], win = ['Window', windowItems];
  const aboutKey = app === 'Finder' ? 'Nostalgia Desktop' : app;
  const help = ['Help', () => [{t: aboutKey + ' Help', fn: () => openAbout(aboutKey, true)}, {t: 'Search...', fn: openSpot}]];
  if (app === 'uTunes') return [
    ['File', () => [{t: 'Add to My Playlist', fn: () => $('#it-add').click()}, {t: 'Copy My Playlist', dis: !it.mine.length, fn: () => $('#it-copy').click()}, {sep: 1}, close]], edit,
    ['Controls', () => [{t: tubeIt.playing ? 'Pause' : 'Play', fn: () => $('#t-play').click()}, {t: 'Next Song', fn: () => itNext(1)}, {t: 'Previous Song', fn: () => itNext(-1)}, {sep: 1}, {t: (it.shuffle ? '✓ ' : ' ') + 'Shuffle', fn: () => itShuffle()}]],
    ['View', () => [{t: ($('#box-it').classList.contains('off') ? 'Show' : 'Hide') + ' Music Video', fn: () => itVideo()}]], win, help];
  if (app === 'QuickShow') return [
    ['File', () => [{t: 'Open Movie Guide...', fn: () => openWin('w-guide')}, {sep: 1}, close]], edit,
    ['Movie', () => [{t: tubeQt.playing ? 'Pause' : 'Play', fn: () => tubeQt.toggle()}, {t: 'Go to Beginning', fn: () => tubeQt.seek(0)}]], win, help];
  if (app === 'Movie Guide') return [
    ['File', () => [close]], edit,
    ['View', () => [['film', 'Movies'], ['tv', 'TV Shows'], ['watch', 'Watchlist']].map(([k, n]) => ({t: (g.kind === k ? '✓ ' : ' ') + n, fn: () => $('#g-tabs [data-kind=' + k + ']').click()}))],
    ['Guide', () => [{t: 'Movie Night', fn: movieNight}, {t: 'Surprise Me', dis: g.kind === 'watch', fn: () => $('#g-surprise').click()}, {t: 'Copy Watchlist', dis: !g.watch.length, fn: () => { g.kind = 'watch'; loadGuide(); $('#g-copy').click(); }}]], win, help];
  if (app === 'NIM') return [
    ['File', () => [{t: 'Edit My Profile...', dis: !signedIn, fn: () => { showProfile('me'); openWin('w-myplace'); }}, {t: 'Set Away Message...', dis: !signedIn, fn: () => { openWin('w-buddy'); $('#awaymsg').focus(); }}, {t: 'Sign Off ' + (me || ''), dis: !signedIn, fn: signOut}, {sep: 1}, close]], edit,
    ['People', () => [{t: 'Buddy List', dis: !signedIn, fn: () => openWin('w-buddy')}, {t: 'My Profile', dis: !signedIn, fn: () => { showProfile('me'); openWin('w-myplace'); }}, {t: 'Join a Chat Room...', dis: !signedIn, fn: () => openWin('w-rooms')}, {sep: 1}].concat(ROOMS.map(([n, sl]) => ({t: '#' + n, dis: !signedIn, fn: () => openRoom(n, sl)})))], win, help];
  if (app === 'TV') return [
    ['File', () => [close]], edit,
    ['Channel', () => [{t: tv.on ? 'Turn Off' : 'Turn On', fn: () => tvPower()}, {sep: 1}, {t: 'Channel Up', key: '\u2191', dis: !tv.on, fn: () => tvTune(nextCh(1))}, {t: 'Channel Down', key: '\u2193', dis: !tv.on, fn: () => tvTune(nextCh(-1))}, {sep: 1}, {t: 'Volume Up', dis: !tv.on, fn: () => tvVolume(10)}, {t: 'Volume Down', dis: !tv.on, fn: () => tvVolume(-10)}]], win, help];
  if (app === 'Old Web') return [
    ['File', () => [{t: 'Home Page', fn: () => webGo('yahoo.com')}, {t: 'Reload', dis: !webLoaded, fn: () => webGo(webUrl)}, {sep: 1}, close]], edit,
    ['Bookmarks', () => SITES.map(([n, u, from]) => ({t: n, dis: era.y < from, fn: () => webGo(u)}))], win, help];
  if (app === 'Date & Time') return [['File', () => [close]], edit, win, help];
  if (app === 'Mail') return [['File', () => [{t: 'Get Mail', fn: () => mail.check(false)}, {sep: 1}, close]], edit, win, help];
  if (app === 'Catalog') return [
    ['File', () => [{t: 'Library...', fn: () => cat.library()}, {sep: 1}, close]], edit,
    ['Go', () => [{t: 'Next Page', key: '\u2192', fn: () => cat.turn(1)}, {t: 'Previous Page', key: '\u2190', fn: () => cat.turn(-1)}, {sep: 1}, {t: 'First Page', fn: () => cat.first()}, {t: 'Last Page', fn: () => cat.last()}, {sep: 1}, {t: 'Full Screen', key: 'F', fn: () => cat.fullscreen()}, {sep: 1}, {t: 'Zoom In', key: '+', fn: () => cat.zoomIn()}, {t: 'Zoom Out', key: '-', fn: () => cat.zoomOut()}, {t: 'Fit on Screen', key: '0', fn: () => cat.zoomFit()}, {sep: 1}, {t: 'Show or Hide Pages Sidebar', fn: () => cat.toggleSide()}]], win, help];
  if (app === 'Arcade') return [
    ['File', () => [{t: 'New Game', fn: () => arcade.restart()}, {sep: 1}, close]], edit,
    ['Game', () => [['snake', 'Snake'], ['mines', 'Minefield'], ['blocks', 'Blockfall'], ['pet', 'Pixel Pet']].map(([k, n]) => ({t: (arcade.current() === k ? '✓ ' : ' ') + n, fn: () => arcade.show(k)}))], win, help];
  if (app === 'Sounds') return [['File', () => [close]], edit, win, help];
  return [['File', () => [{t: 'Close Window', key: '⌘W', dis: !act, fn: () => act && closeWin(act)}, {t: 'Minimize Window', key: '⌘M', dis: !act, fn: () => act && $('.l.min', act).click()}]], edit, ['Go', () => APPS.map(([n, fn]) => ({t: n, fn}))], win, help];
}

const menuEl = $('#menu'), menusEl = $('#menus'); let openBtn = null;
function closeMenu() { menuEl.hidden = true; if (openBtn) openBtn.classList.remove('open'); openBtn = null; }
function buildItems(el, items, done) {
  el.innerHTML = '';
  items.forEach((i) => {
    if (i.sep) { const s = document.createElement('div'); s.className = 'msep'; el.appendChild(s); return; }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mitem'; b.setAttribute('role', 'menuitem'); b.disabled = !!i.dis;
    const l = document.createElement('span'); l.textContent = i.t; b.appendChild(l);
    if (i.key) { const k = document.createElement('span'); k.className = 'mkey'; k.textContent = i.key; b.appendChild(k); }
    b.onclick = () => { done(); if (i.fn) i.fn(); }; el.appendChild(b);
  });
}
function showMenu(btn) {
  buildItems(menuEl, btn._items(), closeMenu);
  const r = btn.getBoundingClientRect(), dr = desk.getBoundingClientRect();
  menuEl.hidden = false; menuEl.style.left = Math.max(0, Math.min(r.left - dr.left, dr.width - menuEl.offsetWidth - 4)) + 'px';
  if (openBtn) openBtn.classList.remove('open'); btn.classList.add('open'); openBtn = btn;
}
function wireMenuButton(b) {
  b.addEventListener('click', () => { if (openBtn === b) closeMenu(); else showMenu(b); });
  b.addEventListener('pointerenter', () => { if (openBtn && openBtn !== b) showMenu(b); });
}
let menuApp = null;
function renderMenubar() {
  const app = $('#appname').textContent; if (menuApp === app) return; menuApp = app; closeMenu(); menusEl.innerHTML = '';
  menusFor(app).forEach(([label, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mi'; b.textContent = label; b._items = fn; wireMenuButton(b); menusEl.appendChild(b); });
}
$('#sysmenu')._items = sysItems; $('#appname')._items = appItems; wireMenuButton($('#sysmenu')); wireMenuButton($('#appname'));
document.addEventListener('pointerdown', (e) => { if (openBtn && !e.target.closest('#menu') && !e.target.closest('#menubar .mi')) closeMenu(); });
$('#sysmenu').classList.add('orb');
fillAbout('Nostalgia Desktop'); renderMenubar();

/* right-click: an element offers its own menu through a _ctx function; windows, fields and the desktop have defaults */
const ctxEl = document.createElement('div'); ctxEl.id = 'ctx'; ctxEl.hidden = true; ctxEl.setAttribute('role', 'menu'); desk.appendChild(ctxEl);
const closeCtx = () => { ctxEl.hidden = true; };
$('#groups')._ctx = () => [{t: 'Join a Chat Room...', fn: () => openWin('w-rooms')}, {t: 'Set Away Message...', fn: () => { $('#awaymsg').focus(); }}, {sep: 1}, {t: 'Sign Off', fn: signOut}];
$('#clock')._ctx = () => [{t: 'Date & Time...', fn: openDate}];
$('.tvset')._ctx = () => [{t: tv.on ? 'Turn Off' : 'Turn On', fn: () => $('#tv-pow').click()}, {sep: 1}, {t: 'Channel Up', dis: !tv.on, fn: () => $('#tv-chup').click()}, {t: 'Channel Down', dis: !tv.on, fn: () => $('#tv-chdn').click()}, {sep: 1}, {t: 'Volume Up', fn: () => $('#tv-vup').click()}, {t: 'Volume Down', fn: () => $('#tv-vdn').click()}];
function winItems(w) { return [{t: 'Minimize', fn: () => $('.l.min', w).click()}, {t: 'Zoom', dis: !w.hasAttribute('data-zoom'), fn: () => $('.l.zoom', w).click()}, {sep: 1}, {t: 'Close Window', fn: () => closeWin(w)}]; }
function deskItems() {
  const cur = desk.dataset.wall, it2 = [{t: 'Desktop Color', dis: true}];
  WALLS.forEach(([k, n]) => it2.push({t: (cur === k ? '✓ ' : ' ') + n, fn: () => setWall(k)}));
  return it2.concat([{sep: 1}, {t: 'Date & Time...', fn: openDate}, {t: fsEl() ? 'Exit Full Screen' : 'Enter Full Screen', dis: !fsOk(), fn: toggleFullscreen}, {t: soundOn ? 'Mute Sound' : 'Turn Sound On', fn: () => $('#snd').click()}, {sep: 1}, {t: 'About Nostalgia Desktop', fn: () => openAbout('Nostalgia Desktop')}]);
}
function fieldItems(f) {
  let a = 0, b = 0; try { a = f.selectionStart; b = f.selectionEnd; } catch (x) { /* some types have no selection */ }
  const sel = b > a && f.type !== 'password' ? f.value.slice(a, b) : '', ro = f.readOnly || f.disabled;
  return [{t: 'Cut', dis: !sel || ro, fn: () => { copyPlain(sel); f.setRangeText('', a, b, 'end'); f.dispatchEvent(new Event('input', {bubbles: true})); }},
    {t: 'Copy', dis: !sel, fn: () => copyPlain(sel)},
    {t: 'Paste', dis: ro || !navigator.clipboard || !navigator.clipboard.readText, fn: () => navigator.clipboard.readText().then((t) => { f.focus(); f.setRangeText(clean(t, 300), a, b, 'end'); f.dispatchEvent(new Event('input', {bubbles: true})); }).catch(() => {})},
    {sep: 1}, {t: 'Select All', fn: () => { f.focus(); f.select(); }}];
}
document.addEventListener('contextmenu', (e) => {
  const t = e.target; if (!(t instanceof Element)) return;
  e.preventDefault(); closeMenu(); closeCtx();
  if (t.closest('#boot,#saver,#spotlight')) return;
  const field = t.closest('input,textarea'), sel = String(getSelection() || '').trim(); let items = null;
  if (field) items = fieldItems(field);
  else {
    for (let n = t; n && n !== document.body; n = n.parentElement) if (n._ctx) { items = n._ctx(e); break; }
    if (!items) {
      const bar = t.closest('.win .bar');
      if (bar) items = winItems(bar.parentElement);
      else if (!t.closest('.win,#dock,#menubar,#menu')) items = deskItems();
    }
    if (sel) items = [{t: 'Copy', fn: () => copyPlain(sel)}].concat(items && items.length ? [{sep: 1}].concat(items) : []);
  }
  if (!items || !items.length) return;
  buildItems(ctxEl, items, closeCtx);
  const dr = desk.getBoundingClientRect(); ctxEl.hidden = false;
  const x = e.clientX - dr.left, y = e.clientY - dr.top, w = ctxEl.offsetWidth, hh = ctxEl.offsetHeight;
  ctxEl.style.left = Math.max(2, Math.min(x, dr.width - w - 4)) + 'px'; ctxEl.style.top = Math.max(24, y + hh > dr.height - 4 ? y - hh : y) + 'px';
});
document.addEventListener('pointerdown', (e) => { if (!ctxEl.hidden && !e.target.closest('#ctx')) closeCtx(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });
addEventListener('resize', closeCtx); addEventListener('blur', closeCtx);

/* Spotlight */
const spot = $('#spotlight'), spq = $('#sp-q'), spr = $('#sp-res');
function spotRender() {
  const q = spq.value.trim().toLowerCase(), raw = spq.value.trim(); spr.innerHTML = ''; const res = [];
  APPS.concat([['Read Me', () => openAbout('Nostalgia Desktop')]]).forEach(([n, fn]) => { if (!q || n.toLowerCase().indexOf(q) >= 0) res.push({t: n, s: 'Application', fn}); });
  if (q) {
    res.push({t: 'Search the charts for "' + raw + '"', s: 'uTunes', fn: () => { openWin('w-utunes'); $('#it-q').value = raw; itSearch(); }});
    res.push({t: 'Filter the Movie Guide for "' + raw + '"', s: 'Movie Guide', fn: () => { openWin('w-guide'); $('#g-q').value = raw; g.q = q; g.pick = null; renderGuide(); }});
  }
  res.forEach((r, i) => { const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; if (i === 0) b.className = 'first'; b.innerHTML = '<span></span><small></small>'; b.firstChild.textContent = r.t; b.lastChild.textContent = r.s; b.onclick = () => { closeSpot(); r.fn(); }; li.appendChild(b); spr.appendChild(li); });
  spot._first = res[0];
}
function openSpot() { closeMenu(); spot.hidden = false; spq.value = ''; spotRender(); spq.focus(); }
function closeSpot() { spot.hidden = true; }
$('#spot').addEventListener('click', () => { if (spot.hidden) openSpot(); else closeSpot(); });
spq.addEventListener('input', spotRender);
spq.addEventListener('keydown', (e) => { if (e.key === 'Enter' && spot._first) { const f = spot._first; closeSpot(); f.fn(); } });
spot.addEventListener('pointerdown', (e) => { if (e.target === spot) closeSpot(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeSpot(); closeOv(); closeBurn(); } });

/* ---------- power-on screen: click to start (this also unlocks sound), then a short startup ---------- */
const boot = $('#boot'); let booted = false;
function showPower() {
  booted = false; boot.classList.remove('out'); boot.hidden = false; $('#boot-power').hidden = false; $('#boot-run').hidden = true; $('#boot-fill').style.width = '0'; $$('#boot-years span').forEach((y) => y.classList.remove('on')); $('#boot-power').focus();
}
function startBoot() {
  if (/noboot/.test(location.search + location.hash)) return;
  const msgs = ['Starting up...', 'Checking memory: 64 MB OK', 'Winding the clock back...', 'Dialing in the charts...', 'Finding your movies...', 'Tuning the TV...', 'Welcome.'];
  const finish = () => { if (booted) return; booted = true; boot.classList.add('out'); document.body.classList.add('bootin'); setTimeout(() => document.body.classList.remove('bootin'), 1600); setTimeout(() => { if (booted) boot.hidden = true; }, 700); };
  $('#boot-power').onclick = () => {
    ctx(); $('#boot-power').hidden = true; let i = 0;
    const step = () => { if (booted || $('#boot-run').hidden) return; $('#boot-msg').textContent = msgs[i]; $('#boot-fill').style.width = ((i + 1) / msgs.length * 100) + '%'; $$('#boot-years span').forEach((y, k) => y.classList.toggle('on', k < Math.round((i + 1) / msgs.length * 10))); if (++i < msgs.length) setTimeout(step, 620); else { sfx('chime'); setTimeout(finish, 1400); } };
    // a black moment, then the gray startup screen; the chime rings when the bar is full
    setTimeout(() => { if (booted || boot.hidden) return; $('#boot-run').hidden = false; step(); }, 600);
  };
  $('#boot-run').onclick = finish;
  showPower();
}

/* ---------- screensaver: floating bubbles after two idle minutes (never while a video plays) ---------- */
const saver = $('#saver'); let idleT = 0, raf = 0, savedAt = 0;
function stopSaver() { saver.hidden = true; cancelAnimationFrame(raf); }
const saverKeys = Object.keys(SAVERS); let saverPick = store.get('saver', 'random'); if (saverPick !== 'random' && !SAVERS[saverPick]) saverPick = 'random';
function startSaver(which) {
  if (tubeIt.playing || tubeQt.playing || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || !boot.hidden) { resetIdle(); return; }
  const r = desk.getBoundingClientRect(); saver.width = Math.round(r.width); saver.height = Math.round(r.height); saver.hidden = false; savedAt = Date.now();
  const k = SAVERS[which] ? which : saverPick === 'random' ? saverKeys[Math.floor(Math.random() * saverKeys.length)] : saverPick;
  const frame = SAVERS[k].make(saver.getContext('2d'), saver.width, saver.height);
  const draw = () => { frame(); raf = requestAnimationFrame(draw); };
  draw();
}
function resetIdle() { clearTimeout(idleT); idleT = setTimeout(() => startSaver(), 120000); }
['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach((e) => addEventListener(e, () => { if (!saver.hidden && Date.now() - savedAt > 500) stopSaver(); resetIdle(); }, {passive: true}));
if (/saver/.test(location.search)) setTimeout(() => startSaver((location.search.match(/saver=(\w+)/) || [])[1]), 2500);

/* ---------- init ---------- */
loadCustom();
syncDock(); renderBuddies();
$$('.win').forEach((w) => { if (!w.hidden) clampWin(w); });
if (location.hash === '#qt') openWin('w-qt');
if (location.hash === '#guide') openWin('w-guide');
resetIdle(); startBoot();
addEventListener('resize', () => $$('.win').forEach((w) => { if (w._zoom) fitZoom(w); else clampWin(w); }));

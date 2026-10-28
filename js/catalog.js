// Catalog: the real printed mail-order books of the year on the clock (JCPenney and Sears), as page scans you flip through
// like a PDF or a book. The scans come from christmas.musetechnical.com (see data.js); nothing is stored here but your place.
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const FLIP = 620;

export function mountCatalog(env) {
  const {$, store, getEra, data} = env;
  const {catalogsFor, catalogPage, catalogThumbs, SCANS_SITE} = data;
  const stage = $('#bk-stage'), book = $('#bk-book'), side = $('#bk-side'), where = $('#bk-where'), stat = $('#ct-stat'), title = $('#bk-title'), lib = $('#bk-lib'), pgIn = $('#bk-go');
  const st = {year: 0, list: [], cur: null, spread: 0, flipping: false, z: 1, manual: false, loaded: false, tok: 0, sideOn: true};
  const pos = store.get('catpos', {}); const savePos = () => { if (st.cur) { pos[st.cur.title] = st.spread; store.set('catpos', pos); } };

  // ---- loading. The scan server drops connections when more than two requests run at once, so everything
  // goes through one small line (visible pages first, then previews, then pages ahead), and what arrives is
  // kept in this browser (Cache Storage) so a page is only ever fetched once.
  const full = new Map(), thumbs = new Map(), pending = new Map(), line = []; let active = 0, seq = 0;
  const key = (t, n) => t + '#' + n;
  const blobUrl = async (dataUrl) => URL.createObjectURL(await (await fetch(dataUrl)).blob());
  const ckey = (k, kind) => new Request(location.origin + '/__catalog/' + kind + '/' + encodeURIComponent(k));
  async function cacheGet(k, kind) { try { const c = await caches.open('nd-catalog-1'), r = await c.match(ckey(k, kind)); return r ? URL.createObjectURL(await r.blob()) : null; } catch (e) { return null; } }
  async function cachePut(k, kind, dataUrl) { try { const c = await caches.open('nd-catalog-1'); await c.put(ckey(k, kind), new Response(await (await fetch(dataUrl)).blob(), {headers: {'Content-Type': 'image/jpeg'}})); } catch (e) { /* no storage: it just reloads next time */ } }
  function remember(map, k, v, max) { map.set(k, v); if (map.size > max) { const o = map.keys().next().value; try { URL.revokeObjectURL(map.get(o)); } catch (e) { /* gone */ } map.delete(o); } }
  // prio 0: a page you are looking at, 1: previews you can see, 2: pages ahead and behind
  function enqueue(id, prio, run, stale) {
    const hit = pending.get(id);
    if (hit) { if (prio < hit.job.prio) { hit.job.prio = prio; line.sort((a, b) => a.prio - b.prio || a.n - b.n); } return hit.p; }
    const job = {prio, n: seq++, tries: 0, run, stale}, p = new Promise((res) => { job.res = res; });
    pending.set(id, {job, p}); line.push(job); line.sort((a, b) => a.prio - b.prio || a.n - b.n); pump(id); return p;
  }
  function pump() {
    while (active < 2 && line.length) {
      const job = line.shift(), id = [...pending].find(([, v]) => v.job === job)[0];
      if (job.stale && job.stale()) { pending.delete(id); job.res(null); continue; }
      active++;
      job.run().then((v) => { pending.delete(id); job.res(v); }, () => {
        if (++job.tries <= 3) { setTimeout(() => { line.push(job); line.sort((a, b) => a.prio - b.prio || a.n - b.n); pump(); }, 1200 * job.tries); } else { pending.delete(id); job.res(null); }
      }).finally(() => { active--; pump(); });
    }
  }
  // the full scan of a page, as an image URL (or null)
  function getPage(t, n, prio) {
    const k = key(t, n); if (full.has(k)) return Promise.resolve(full.get(k));
    return enqueue('p:' + k, prio, async () => {
      let u = await cacheGet(k, 'page');
      if (!u) { const d = await catalogPage(t, n); u = await blobUrl(d); cachePut(k, 'page', d); }
      remember(full, k, u, 40); return u;
    }, () => prio > 0 && (!st.cur || st.cur.title !== t));
  }
  // just the cover preview of a catalog, for the library
  function getCover(t) {
    const k = key(t, 1); if (thumbs.has(k)) return Promise.resolve(thumbs.get(k));
    return enqueue('c:' + t, 0, async () => {
      let u = await cacheGet(k, 'thumb');
      if (!u) { const o = await catalogThumbs(t, 1, 2); if (o[1]) { u = await blobUrl(o[1]); cachePut(k, 'thumb', o[1]); } }
      if (u) remember(thumbs, k, u, 1200); return u;
    }, () => false);
  }
  // previews come 40 at a time; the batch with page n in it
  function getThumbs(t, n, prio) {
    const start = Math.max(1, Math.floor((n - 1) / 40) * 40 + 1), bk = t + ':' + start, k = key(t, n);
    if (thumbs.has(k)) return Promise.resolve(thumbs.get(k));
    return enqueue('t:' + bk, prio, async () => {
      const last = Math.min(start + 39, st.cur && st.cur.title === t ? total() : start + 39); let missing = 0;
      for (let i = start; i <= last; i++) { const kk = key(t, i); if (!thumbs.has(kk)) { const u = await cacheGet(kk, 'thumb'); if (u) remember(thumbs, kk, u, 1200); else missing++; } }
      if (missing) { const o = await catalogThumbs(t, start, 40); for (const nn of Object.keys(o)) { const kk = key(t, +nn); if (!thumbs.has(kk)) { remember(thumbs, kk, await blobUrl(o[nn]), 1200); cachePut(kk, 'thumb', o[nn]); } } }
      return null;
    }, () => prio > 0 && (!st.cur || st.cur.title !== t)).then(() => thumbs.get(k) || null);
  }

  // ---- the book
  const total = () => (st.cur ? st.cur.pages : 0);
  const spreadOf = (p) => (p <= 1 ? 0 : Math.floor(p / 2));
  const lastSpread = () => Math.floor(total() / 2);
  const pagesOf = (s) => (s === 0 ? [0, 1] : [2 * s, 2 * s + 1 <= total() ? 2 * s + 1 : 0]);
  function pageEl(n, extra) {
    const e = el('div', 'bk-pg' + (extra ? ' ' + extra : '')); if (!n || !st.cur) { e.classList.add('bk-none'); return e; }
    const t = st.cur.title, tok = st.tok, k = key(t, n);
    const under = el('img', 'bk-under'), top = el('img', 'bk-top'); under.alt = top.alt = ''; top.draggable = under.draggable = false;
    getThumbs(t, n, 1).then((u) => { if (u && tok === st.tok && !top.classList.contains('on')) under.src = u; });
    getPage(t, n, 0).then((u) => { if (u && tok === st.tok) { top.onload = () => top.classList.add('on'); top.src = u; } else if (!u && tok === st.tok) e.classList.add('bk-fail'); });
    e.append(under, top); return e;
  }
  function draw() {
    book.innerHTML = ''; if (!st.cur) return;
    const [a, b] = pagesOf(st.spread);
    book.classList.toggle('single', !a || !b);
    book.append(pageEl(a, 'bk-lf'), el('div', 'bk-gutter'), pageEl(b, 'bk-rt'));
    book.classList.toggle('shift-l', !a); book.classList.toggle('shift-r', !b);
    label();
    $('#bk-prev').disabled = st.spread <= 0; $('#bk-next').disabled = st.spread >= lastSpread();
    markSide(); savePos(); prefetch();
  }
  function label() {
    const [a, b] = pagesOf(st.spread), lo = a || b, hi = b || a;
    where.textContent = (lo === hi ? 'Page ' + lo : 'Pages ' + lo + ' and ' + hi) + ' of ' + total() + (st.z > 1 ? '  \u00b7  ' + Math.round(st.z * 100) + '%' : '');
    pgIn.value = ''; pgIn.placeholder = String(lo);
    if (typeof fsEl === 'function' && fsEl() === stage) flash(where.textContent, 1200);
  }
  function prefetch() {
    const t = st.cur.title;
    [st.spread + 1, st.spread - 1, st.spread + 2, st.spread + 3].forEach((sp) => { if (sp < 0 || sp > lastSpread()) return; pagesOf(sp).forEach((n) => { if (n) getPage(t, n, 2); }); });
  }
  // flip one spread forward or back like a page; anything further just changes
  function go(s) {
    s = Math.max(0, Math.min(s, lastSpread())); if (!st.cur || s === st.spread || st.flipping) return;
    if (Math.abs(s - st.spread) !== 1) { st.spread = s; draw(); return; }
    const fwd = s > st.spread, [oa, ob] = pagesOf(st.spread), [na, nb] = pagesOf(s);
    st.flipping = true; st.spread = s; savePos();
    // under the leaf: the page that stays, and the page that will be revealed
    book.innerHTML = ''; book.classList.remove('shift-l', 'shift-r');
    const stay = fwd ? pageEl(oa, 'bk-lf') : pageEl(ob, 'bk-rt'), reveal = fwd ? pageEl(nb, 'bk-rt') : pageEl(na, 'bk-lf');
    book.append(fwd ? stay : reveal, el('div', 'bk-gutter'), fwd ? reveal : stay);
    book.classList.toggle('single', false);
    const leaf = el('div', 'bk-leaf ' + (fwd ? 'fwd' : 'back')), f1 = fwd ? pageEl(ob, 'bk-rt') : pageEl(oa, 'bk-lf'), f2 = fwd ? pageEl(na, 'bk-lf') : pageEl(nb, 'bk-rt');
    f1.classList.add('bk-face'); f2.classList.add('bk-face', 'bk-bk'); leaf.append(f1, f2); book.appendChild(leaf);
    void leaf.offsetWidth; leaf.classList.add('turning');
    setTimeout(() => { st.flipping = false; if (st.spread === s) draw(); }, FLIP);
  }
  const turn = (d) => go(st.spread + d);

  // ---- sidebar of page previews (like Preview or Books): filled in as you scroll
  let io = null;
  function buildSide() {
    side.innerHTML = ''; if (io) io.disconnect(); if (!st.cur) return;
    const t = st.cur.title, tok = st.tok;
    io = new IntersectionObserver((es) => es.forEach((en) => {
      if (!en.isIntersecting) return; const n = +en.target.dataset.n; io.unobserve(en.target);
      getThumbs(t, n, 1).then((u) => { if (u && tok === st.tok) en.target.firstChild.src = u; });
    }), {root: side, rootMargin: '200px'});
    for (let n = 1; n <= total(); n++) {
      const b = el('button', 'bk-th'); b.type = 'button'; b.dataset.n = String(n); b.title = 'Page ' + n;
      const im = el('img'); im.alt = ''; im.draggable = false; b.append(im, el('span', null, String(n)));
      b.onclick = () => go(spreadOf(n)); side.appendChild(b); io.observe(b);
    }
    markSide();
  }
  function markSide() {
    const [a, b] = pagesOf(st.spread); let first = null;
    side.querySelectorAll('.bk-th').forEach((x) => { const n = +x.dataset.n, on = n === a || n === b; x.classList.toggle('on', on); if (on && !first) first = x; });
    if (first && st.sideOn) { const r = first.offsetTop - side.clientHeight / 2 + 60; if (Math.abs(side.scrollTop - r) > side.clientHeight / 2) side.scrollTop = Math.max(0, r); }
  }

  // ---- which book: the one that fits the date on the clock, or any other from that year
  function pick() {
    const m = getEra().m, want2 = m >= 11 ? ['Sears Christmas', 'JCPenney Christmas'] : m >= 8 ? ['JCPenney Fall Winter', 'Sears Christmas', 'JCPenney Christmas'] : ['JCPenney Spring Summer', 'JCPenney Fall Winter', 'Sears Christmas'];
    for (const w of want2) { const f = st.list.find((c) => (c.brand + ' ' + c.season).indexOf(w) === 0); if (f) return f; }
    return st.list[0] || null;
  }
  function open(c) {
    if (!c) { stat.textContent = 'No catalog from this year.'; return; }
    st.tok++; zoom(1); st.cur = {title: c.title, pages: c.pages}; st.spread = Math.min(pos[c.title] || 0, Math.floor(c.pages / 2));
    title.textContent = c.title; lib.hidden = true; buildSide(); draw(); stat.innerHTML = ''; credit();
  }
  function credit() { stat.textContent = 'Scans courtesy of '; const a = el('a', null, 'christmas.musetechnical.com'); a.href = SCANS_SITE; a.target = '_blank'; a.rel = 'noopener'; stat.appendChild(a); }
  function drawLib() {
    lib.innerHTML = ''; lib.appendChild(el('div', 'bk-lt', 'Catalogs from ' + st.year));
    const g = el('div', 'bk-lg');
    st.list.forEach((c) => {
      const b = el('button', 'bk-lb' + (st.cur && st.cur.title === c.title ? ' on' : '')); b.type = 'button';
      const im = el('div', 'bk-cv'); const img = el('img'); img.alt = ''; im.appendChild(img);
      getCover(c.title).then((u) => { if (u) img.src = u; });
      b.append(im, el('div', 'bk-ln', c.brand + ' ' + c.season), el('div', 'bk-lp', c.pages + ' pages')); b.onclick = () => { st.manual = true; open(c); };
      g.appendChild(b);
    });
    lib.appendChild(g);
    const x = el('button', 'btn-aqua sm', 'Close'); x.type = 'button'; x.onclick = () => { lib.hidden = true; }; lib.appendChild(x);
  }
  async function load() {
    const y = getEra().y, tok = ++st.tok; st.year = y; st.loaded = true; stat.textContent = 'Opening the catalog...'; st.cur = null; book.innerHTML = ''; side.innerHTML = '';
    try { st.list = await catalogsFor(y); } catch (e) {
      if (tok !== st.tok) return; stat.textContent = ''; book.innerHTML = '';
      const m = el('div', 'bk-msg', 'The catalogs did not arrive. Check your connection. '), b = el('button', 'btn-aqua sm', 'Try again'); b.type = 'button'; b.onclick = load; m.appendChild(b); book.appendChild(m); return;
    }
    if (tok !== st.tok) return; open(pick());
  }

  // ---- zoom: the book grows inside the stage and you drag to look around
  const ZOOMS = [1, 1.5, 2, 3];
  function zoom(to, fx, fy) {
    const z = Math.max(1, Math.min(3, to)); if (z === st.z) return;
    const rx = (stage.scrollLeft + stage.clientWidth * (fx == null ? .5 : fx)) / (stage.scrollWidth || 1), ry = (stage.scrollTop + stage.clientHeight * (fy == null ? .5 : fy)) / (stage.scrollHeight || 1);
    st.z = z; book.style.setProperty('--z', String(z)); stage.classList.toggle('zoomed', z > 1);
    stage.scrollLeft = rx * stage.scrollWidth - stage.clientWidth * (fx == null ? .5 : fx); stage.scrollTop = ry * stage.scrollHeight - stage.clientHeight * (fy == null ? .5 : fy);
    $('#bk-zout').disabled = z <= 1; $('#bk-zin').disabled = z >= 3; if (st.cur) label();
  }
  const step = (d, fx, fy) => { const i = ZOOMS.findIndex((x) => x >= st.z - .01); zoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 0 : i) + d))], fx, fy); };
  $('#bk-zin').onclick = () => step(1); $('#bk-zout').onclick = () => step(-1);
  let pinch = 0, pinchAt = 0;   // a trackpad pinch is a stream of small events: add them up and step once per ~half a pinch, then pause
  stage.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault();
    const now = Date.now(); if (now - pinchAt < 250) return;
    pinch += e.deltaY; if (Math.abs(pinch) < 60) return;
    const r = stage.getBoundingClientRect(); step(pinch < 0 ? 1 : -1, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); pinch = 0; pinchAt = now;
  }, {passive: false});
  book.addEventListener('dblclick', (e) => { const r = stage.getBoundingClientRect(); if (st.z > 1) zoom(1); else zoom(2, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });

  // ---- true full screen: just the book on black, no windows or menus; Esc leaves it
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFs = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
  function fullscreen() {
    if (!canFs) return;
    if (fsEl() === stage) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    try { const r = (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage); if (r && r.catch) r.catch(() => {}); } catch (e) { /* the browser said no */ }
  }
  const hint = el('div', 'bk-hint'); hint.hidden = true; stage.appendChild(hint); let hintT = 0;
  const flash = (txt, ms) => { hint.textContent = txt; hint.hidden = false; hint.classList.remove('out'); clearTimeout(hintT); hintT = setTimeout(() => { hint.classList.add('out'); }, ms); };
  const fsChanged = () => { const on = fsEl() === stage; stage.classList.toggle('full', on); if (on) flash('Click the sides or use the arrow keys to turn pages. Press Esc to leave full screen.', 3500); else hint.hidden = true; };
  document.addEventListener('fullscreenchange', fsChanged); document.addEventListener('webkitfullscreenchange', fsChanged);
  $('#bk-fs').onclick = fullscreen; if (!canFs) $('#bk-fs').hidden = true;

  // ---- controls
  $('#bk-prev').onclick = () => turn(-1); $('#bk-next').onclick = () => turn(1);
  $('#bk-lib-btn').onclick = () => { if (!st.loaded) return; drawLib(); lib.hidden = !lib.hidden; };
  $('#bk-side-btn').onclick = () => { st.sideOn = !st.sideOn; $('#w-cat').classList.toggle('noside', !st.sideOn); markSide(); };
  pgIn.onkeydown = (e) => { if (e.key !== 'Enter') return; const n = parseInt(pgIn.value, 10); if (n >= 1 && n <= total()) go(spreadOf(n)); pgIn.blur(); };
  // click the left or right side of the book to turn, or drag across it; zoomed in, dragging moves the view instead
  let drag = null;
  book.addEventListener('pointerdown', (e) => { if (e.target.closest('button,a') || e.button) return; drag = {x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false}; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || st.z <= 1) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; stage.scrollLeft = drag.sl - dx; stage.scrollTop = drag.st - dy;
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return; const d = drag, dx = e.clientX - d.x; drag = null;
    if (st.z > 1 || !book.contains(e.target)) return;
    const rect = book.getBoundingClientRect();
    if (Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1);
    else if (e.clientX < rect.left + rect.width * 0.3) turn(-1); else if (e.clientX > rect.left + rect.width * 0.7) turn(1);
  });
  window.addEventListener('pointercancel', () => { drag = null; });
  document.addEventListener('keydown', (e) => {
    const w = $('#w-cat'); if (!w || w.hidden || !w.classList.contains('active') || !st.cur || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { turn(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { turn(-1); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { step(1); e.preventDefault(); } else if (e.key === '-') { step(-1); e.preventDefault(); } else if (e.key === '0') { zoom(1); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') { fullscreen(); e.preventDefault(); }
    else if (e.key === 'Home') { go(0); e.preventDefault(); } else if (e.key === 'End') { go(lastSpread()); e.preventDefault(); }
  });
  return {
    ensure() { if (!st.loaded) load(); },
    eraChanged() { if (!st.loaded) return; if (getEra().y !== st.year) { st.manual = false; load(); } else if (!st.manual) { const c = pick(); if (c && (!st.cur || st.cur.title !== c.title)) open(c); } },
    turn, fullscreen, zoomIn: () => step(1), zoomOut: () => step(-1), zoomFit: () => zoom(1), first: () => go(0), last: () => go(lastSpread()), library: () => { if (st.loaded) { drawLib(); lib.hidden = false; } },
    toggleSide: () => $('#bk-side-btn').click(), page: () => st.cur && pagesOf(st.spread)[0]
  };
}

// Arcade: four small original games in one window (Snake, Minefield, Blockfall, Pixel Pet). Nothing here is copied from any real game.
// Each game is a function that draws into the stage and returns {stop, restart}.

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const rnd = (n) => Math.floor(Math.random() * n);

export function mountArcade(env) {
  const {$, $$, store, sfx, active} = env;
  const stage = $('#arc-stage'), stat = $('#arc-stat');
  let cur = null, curKey = '', running = false;
  const say = (t) => { stat.textContent = t; };
  const games = {snake, mines, blocks, pet};
  function show(k) {
    if (cur && cur.stop) cur.stop();
    curKey = k; running = true; stage.innerHTML = ''; say('');
    $$('#arc-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.g === k));
    store.set('arcade', k); cur = games[k]({stage, say, store, sfx, active});
  }
  $$('#arc-tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.g)));
  return {
    show,
    // opening the window starts the last game again
    ensure() { if (!running) { const k = curKey || store.get('arcade', 'snake'); show(games[k] ? k : 'snake'); } },
    stop() { if (cur && cur.stop) cur.stop(); cur = null; running = false; },
    restart() { if (cur && cur.restart) cur.restart(); },
    current: () => curKey
  };
}

/* ---------- Snake: a green phone screen, arrow keys or the pad ---------- */
function snake({stage, say, store, sfx, active}) {
  const W = 20, H = 15, C = 14;
  const phone = el('div', 'ph'), top = el('div', 'ph-top'), sc = el('span'), hiEl = el('span');
  const scr = el('div', 'ph-screen'), cv = el('canvas'); cv.width = W * C; cv.height = H * C; scr.appendChild(cv); top.append(sc, hiEl);
  const pad = el('div', 'ph-pad');
  [['▲', 0, -1, 'u'], ['◀', -1, 0, 'l'], ['▶', 1, 0, 'r'], ['▼', 0, 1, 'd']].forEach(([lab, dx, dy, c]) => { const b = el('button', 'ph-' + c, lab); b.type = 'button'; b.setAttribute('aria-label', 'Turn ' + c); b.onclick = () => turn(dx, dy); pad.appendChild(b); });
  phone.append(el('div', 'ph-brand', 'NOKLA'), top, scr, pad); stage.appendChild(phone);
  const cx = cv.getContext('2d'); let hi = store.get('snake-hi', 0);
  let body, dir, nd, food, score, alive, started, timer, paused = false;
  function placeFood() { do { food = [rnd(W), rnd(H)]; } while (body.some((s) => s[0] === food[0] && s[1] === food[1])); }
  function reset() {
    clearTimeout(timer); body = [[10, 7], [9, 7], [8, 7]]; dir = nd = [1, 0]; score = 0; alive = true; started = false; paused = false; placeFood(); draw();
    say('Press an arrow key to start. Space pauses.');
  }
  function turn(dx, dy) {
    if (!alive) { reset(); return; }
    if (dx === -dir[0] && dy === -dir[1]) return; nd = [dx, dy];
    if (!started) { started = true; loop(); }
  }
  function loop() { timer = setTimeout(tick, Math.max(55, 150 - score * 4)); }
  function tick() {
    if (!alive) return;
    if (paused || !active()) { loop(); return; }
    dir = nd; const h = [body[0][0] + dir[0], body[0][1] + dir[1]];
    if (h[0] < 0 || h[1] < 0 || h[0] >= W || h[1] >= H || body.some((s) => s[0] === h[0] && s[1] === h[1])) {
      alive = false; sfx('bonk'); if (score > hi) { hi = score; store.set('snake-hi', hi); }
      say('Game over. Score ' + score + '. Press a key to play again.'); draw(); return;
    }
    body.unshift(h);
    if (h[0] === food[0] && h[1] === food[1]) { score++; sfx('blip'); placeFood(); } else body.pop();
    draw(); loop();
  }
  function draw() {
    cx.fillStyle = '#a3b82a'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#18240a';
    body.forEach((s, i) => { cx.fillRect(s[0] * C + 1, s[1] * C + 1, C - 2, C - 2); if (i === 0) { cx.fillStyle = '#a3b82a'; cx.fillRect(s[0] * C + 4, s[1] * C + 4, 2, 2); cx.fillRect(s[0] * C + 8, s[1] * C + 4, 2, 2); cx.fillStyle = '#18240a'; } });
    cx.fillRect(food[0] * C + 3, food[1] * C + 3, C - 6, C - 6);
    sc.textContent = 'SCORE ' + score; hiEl.textContent = 'BEST ' + hi;
  }
  const key = (e) => {
    if (!active() || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) return;
    const m = {ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0]}[e.key];
    if (m) { e.preventDefault(); turn(m[0], m[1]); } else if (e.key === ' ') { e.preventDefault(); if (started && alive) { paused = !paused; say(paused ? 'Paused.' : ''); } }
  };
  document.addEventListener('keydown', key); reset();
  return {stop() { clearTimeout(timer); alive = false; document.removeEventListener('keydown', key); }, restart: reset};
}

/* ---------- Minesweeper: left click opens, right click flags ---------- */
function mines({stage, say, store, sfx}) {
  const LEVELS = {Beginner: [9, 9, 10], Intermediate: [16, 16, 40]};
  let lv = store.get('mines-lv', 'Beginner'); if (!LEVELS[lv]) lv = 'Beginner';
  const bar = el('div', 'ms-bar'), cnt = el('span', 'ms-led'), face = el('button', 'ms-face', ':)'), tim = el('span', 'ms-led'), sel = el('select');
  face.type = 'button'; face.setAttribute('aria-label', 'New game');
  Object.keys(LEVELS).forEach((k) => { const o = el('option', '', k); o.value = k; sel.appendChild(o); }); sel.value = lv; sel.setAttribute('aria-label', 'Level');
  const flagMode = el('button', 'ms-flag', 'Flag'); flagMode.type = 'button'; flagMode.title = 'Turn on to flag with a click (for touch screens)';
  bar.append(cnt, face, tim); const ctl = el('div', 'ms-ctl'); ctl.append(sel, flagMode);
  const grid = el('div', 'ms-grid'); stage.append(ctl, bar, grid);
  let R, Cc, M, cells, over, left, t0, tmr, flagging = false;
  const led = (n) => String(Math.max(-99, Math.min(999, n))).padStart(3, '0');
  function nb(r, c, f) { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if ((dr || dc) && r + dr >= 0 && c + dc >= 0 && r + dr < R && c + dc < Cc) f(r + dr, c + dc); } }
  function reset() {
    clearInterval(tmr); [R, Cc, M] = LEVELS[lv]; over = false; t0 = 0; left = M; face.textContent = ':)';
    cells = Array.from({length: R}, () => Array.from({length: Cc}, () => ({m: false, o: false, f: false, n: 0})));
    grid.style.setProperty('--cols', Cc); grid.innerHTML = ''; tim.textContent = '000'; cnt.textContent = led(left);
    for (let r = 0; r < R; r++) for (let c = 0; c < Cc; c++) {
      const b = el('button', 'ms-c'); b.type = 'button'; b.dataset.r = r; b.dataset.c = c; b.setAttribute('aria-label', 'Square');
      b.onclick = () => (flagging ? flag(r, c) : open(r, c)); b.oncontextmenu = (e) => { e.preventDefault(); flag(r, c); }; grid.appendChild(b);
    }
    say('Open every square without a mine.');
  }
  const btn = (r, c) => grid.children[r * Cc + c];
  function plant(r0, c0) {
    let n = 0; while (n < M) { const r = rnd(R), c = rnd(Cc); if (cells[r][c].m || (Math.abs(r - r0) < 2 && Math.abs(c - c0) < 2)) continue; cells[r][c].m = true; n++; }
    for (let r = 0; r < R; r++) for (let c = 0; c < Cc; c++) { let k = 0; nb(r, c, (a, b) => { if (cells[a][b].m) k++; }); cells[r][c].n = k; }
    t0 = Date.now(); tmr = setInterval(() => { tim.textContent = led(Math.floor((Date.now() - t0) / 1000)); }, 500);
  }
  function paint(r, c) {
    const x = cells[r][c], b = btn(r, c); b.className = 'ms-c' + (x.o ? ' open' : '') + (x.o && x.n ? ' n' + x.n : ''); b.textContent = x.f && !x.o ? '⚑' : (x.o && x.n && !x.m ? x.n : '');
    if (x.o && x.m) { b.classList.add('mine'); b.textContent = '✱'; }
  }
  function open(r, c) {
    if (over) return; const x = cells[r][c]; if (x.o || x.f) return;
    if (!t0) plant(r, c);
    if (x.m) { lose(r, c); return; }
    const q = [[r, c]]; while (q.length) { const [a, b] = q.pop(), y = cells[a][b]; if (y.o || y.f) continue; y.o = true; paint(a, b); if (!y.n) nb(a, b, (p, s) => { if (!cells[p][s].o) q.push([p, s]); }); }
    sfx('blip');
    if (cells.flat().every((z) => z.o || z.m)) win();
  }
  function flag(r, c) { if (over) return; const x = cells[r][c]; if (x.o) return; x.f = !x.f; left += x.f ? -1 : 1; cnt.textContent = led(left); paint(r, c); }
  function lose(r, c) {
    over = true; clearInterval(tmr); face.textContent = 'X('; sfx('bonk');
    cells.forEach((row, a) => row.forEach((z, b) => { if (z.m) { z.o = true; paint(a, b); } })); btn(r, c).classList.add('boom'); say('Boom. Click the face to try again.');
  }
  function win() {
    over = true; clearInterval(tmr); face.textContent = 'B)'; sfx('chime'); const sec = Math.floor((Date.now() - t0) / 1000), k = 'mines-best-' + lv, best = store.get(k, 0);
    if (!best || sec < best) { store.set(k, sec); say('Cleared in ' + sec + 's. A new best!'); } else say('Cleared in ' + sec + 's. Best is ' + best + 's.');
  }
  face.onclick = reset; sel.onchange = () => { lv = sel.value; store.set('mines-lv', lv); reset(); };
  flagMode.onclick = () => { flagging = !flagging; flagMode.classList.toggle('on', flagging); };
  reset();
  return {stop() { clearInterval(tmr); }, restart: reset};
}

/* ---------- Blockfall: falling blocks. Arrows move and rotate, Space drops, P pauses ---------- */
function blocks({stage, say, store, sfx, active}) {
  const W = 10, H = 20, C = 18;
  const SH = {I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], O: [[1,1],[1,1]], T: [[0,1,0],[1,1,1],[0,0,0]], S: [[0,1,1],[1,1,0],[0,0,0]], Z: [[1,1,0],[0,1,1],[0,0,0]], J: [[1,0,0],[1,1,1],[0,0,0]], L: [[0,0,1],[1,1,1],[0,0,0]]};
  const KEYS = Object.keys(SH), COL = {I: '#19c3e6', O: '#f2c200', T: '#a040e0', S: '#30c040', Z: '#e03030', J: '#2c5ce6', L: '#f08a10'};
  const row = el('div', 'bf'), cv = el('canvas', 'bf-main'), side = el('div', 'bf-side');
  cv.width = W * C; cv.height = H * C; const nx = el('canvas', 'bf-next'); nx.width = nx.height = 4 * 14;
  const sc = el('div', 'bf-stat'), hiEl = el('div', 'bf-stat'), lvEl = el('div', 'bf-stat'), pad = el('div', 'bf-pad');
  [['\u25C0', 'Left', () => move(-1)], ['\u25B6', 'Right', () => move(1)], ['\u27F2', 'Rotate left', () => rotate(false)], ['\u27F3', 'Rotate right', () => rotate(true)], ['\u25BC', 'Down', () => soft()], ['Drop', 'Drop', () => hard()]].forEach(([l, n, f]) => { const bt = el('button', '', l); bt.type = 'button'; bt.setAttribute('aria-label', n); bt.onclick = () => go(f); pad.appendChild(bt); });
  side.append(el('div', 'bf-h', 'NEXT'), nx, sc, lvEl, hiEl, pad); row.append(cv, side); stage.appendChild(row);
  const cx = cv.getContext('2d'), nc = nx.getContext('2d'); let hi = store.get('blocks-hi', 0);
  let board, cur, nextK, bag, score, lines, level, alive, started, paused, timer;
  const rotCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse()), rotCCW = (m) => m[0].map((_, i) => m.map((r) => r[m[0].length - 1 - i]));
  function draw1(c2, x, y, col, s) {
    c2.fillStyle = col; c2.fillRect(x, y, s, s); c2.fillStyle = 'rgba(255,255,255,.45)'; c2.fillRect(x, y, s, 3); c2.fillRect(x, y, 3, s);
    c2.fillStyle = 'rgba(0,0,0,.35)'; c2.fillRect(x, y + s - 3, s, 3); c2.fillRect(x + s - 3, y, 3, s);
  }
  function take() { if (!bag.length) { bag = KEYS.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = rnd(i + 1); [bag[i], bag[j]] = [bag[j], bag[i]]; } } return bag.pop(); }
  function hit(m, x, y) { for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c]) { const X = x + c, Y = y + r; if (X < 0 || X >= W || Y >= H || (Y >= 0 && board[Y][X])) return true; } return false; }
  function spawn() {
    const k = nextK; nextK = take(); const m = SH[k].map((r) => r.slice()); cur = {k, m, x: Math.floor((W - m.length) / 2), y: k === 'I' ? -1 : 0};
    if (hit(cur.m, cur.x, cur.y)) { alive = false; clearTimeout(timer); sfx('bonk'); if (score > hi) { hi = score; store.set('blocks-hi', hi); say('Game over. Score ' + score + '. A new best! Press a key to play again.'); } else say('Game over. Score ' + score + '. Press a key to play again.'); }
  }
  function reset() {
    clearTimeout(timer); board = Array.from({length: H}, () => Array(W).fill(0)); bag = []; nextK = take(); score = 0; lines = 0; level = 1; alive = true; started = false; paused = false; spawn(); draw();
    say('Left/Right move, Up or Z turn left, X turns right, Space drops, P pauses. Press any key to start.');
  }
  function go(f) { if (!alive) { reset(); return; } if (!started) { started = true; say(''); loop(); } if (!paused) f(); draw(); }
  function loop() { clearTimeout(timer); timer = setTimeout(tick, Math.max(90, 750 - (level - 1) * 65)); }
  function tick() { if (!alive) return; if (!paused && active() && !hit(cur.m, cur.x, cur.y + 1)) cur.y++; else if (!paused && active()) lock(); draw(); loop(); }
  function move(d) { if (!hit(cur.m, cur.x + d, cur.y)) cur.x += d; }
  function rotate(cw) { const m = (cw ? rotCW : rotCCW)(cur.m); for (const k of [0, -1, 1, -2, 2]) if (!hit(m, cur.x + k, cur.y)) { cur.m = m; cur.x += k; sfx('blip'); return; } }
  function soft() { if (!hit(cur.m, cur.x, cur.y + 1)) { cur.y++; score++; } else lock(); }
  function hard() { let n = 0; while (!hit(cur.m, cur.x, cur.y + 1)) { cur.y++; n++; } score += n * 2; lock(); }
  function lock() {
    cur.m.forEach((r, ry) => r.forEach((v, rx) => { if (v && cur.y + ry >= 0) board[cur.y + ry][cur.x + rx] = cur.k; }));
    let n = 0; for (let r = H - 1; r >= 0; r--) if (board[r].every((v) => v)) { board.splice(r, 1); board.unshift(Array(W).fill(0)); n++; r++; }
    if (n) { score += [0, 100, 300, 500, 800][n] * level; lines += n; level = 1 + Math.floor(lines / 10); sfx(n >= 4 ? 'chime' : 'clear'); } else sfx('thud');
    spawn(); head();
  }
  function head() { sc.textContent = 'SCORE ' + score; lvEl.textContent = 'LEVEL ' + level + '  LINES ' + lines; hiEl.textContent = 'BEST ' + Math.max(hi, score); }
  function draw() {
    cx.fillStyle = '#10192b'; cx.fillRect(0, 0, cv.width, cv.height); cx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let i = 1; i < W; i++) { cx.beginPath(); cx.moveTo(i * C + .5, 0); cx.lineTo(i * C + .5, cv.height); cx.stroke(); }
    for (let i = 1; i < H; i++) { cx.beginPath(); cx.moveTo(0, i * C + .5); cx.lineTo(cv.width, i * C + .5); cx.stroke(); }
    board.forEach((r, y) => r.forEach((v, x) => { if (v) draw1(cx, x * C, y * C, COL[v], C); }));
    if (alive && cur) {
      let gy = cur.y; while (!hit(cur.m, cur.x, gy + 1)) gy++;
      cur.m.forEach((r, ry) => r.forEach((v, rx) => { if (v) { cx.strokeStyle = COL[cur.k]; cx.globalAlpha = .5; cx.strokeRect((cur.x + rx) * C + 1.5, (gy + ry) * C + 1.5, C - 3, C - 3); cx.globalAlpha = 1; } }));
      cur.m.forEach((r, ry) => r.forEach((v, rx) => { if (v && cur.y + ry >= 0) draw1(cx, (cur.x + rx) * C, (cur.y + ry) * C, COL[cur.k], C); }));
    }
    nc.fillStyle = '#10192b'; nc.fillRect(0, 0, 56, 56); const m = SH[nextK], o = (4 - m.length) * 7;
    m.forEach((r, ry) => r.forEach((v, rx) => { if (v) draw1(nc, o + rx * 14, o + ry * 14 + (nextK === 'I' ? -7 : 0), COL[nextK], 14); }));
    head();
  }
  const key = (e) => {
    if (!active() || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) return;
    const m = {ArrowLeft: () => move(-1), a: () => move(-1), ArrowRight: () => move(1), d: () => move(1), ArrowUp: () => rotate(false), w: () => rotate(false), z: () => rotate(false), x: () => rotate(true), ArrowDown: soft, s: soft, ' ': hard}[e.key];
    if (m) { e.preventDefault(); go(m); } else if (e.key === 'p' || e.key === 'P') { if (started && alive) { paused = !paused; say(paused ? 'Paused. Press P to continue.' : ''); } }
  };
  document.addEventListener('keydown', key); reset();
  return {stop() { clearTimeout(timer); alive = false; document.removeEventListener('keydown', key); }, restart: reset};
}

/* ---------- Pixel Pet: a keychain dog or cat that keeps living while the page is closed ---------- */
function pet({stage, say, store, sfx, active}) {
  const NAMES = {dog: ['Biscuit', 'Rex', 'Scout', 'Waffles', 'Buddy', 'Pepper'], cat: ['Mochi', 'Whiskers', 'Bean', 'Luna', 'Ziggy', 'Pudge']};
  let p = store.get('pet', null); const MIN = 6e4;
  const dev = el('div', 'pt'), scr = el('div', 'pt-screen'), cv = el('canvas'); cv.width = 48; cv.height = 40; scr.appendChild(cv);
  const hearts = el('div', 'pt-hearts'), btns = el('div', 'pt-btns'); const hungry = el('span'), joy = el('span'), mess = el('span'); hearts.append(hungry, joy, mess);
  const mk = (t, f) => { const b = el('button', 'pt-b', t); b.type = 'button'; b.onclick = f; btns.appendChild(b); return b; };
  mk('Feed', () => act('feed')); mk('Play', () => act('play')); mk('Clean', () => act('clean')); const lite = mk('Light', () => act('light'));
  const nameEl = el('div', 'pt-name'), egg = el('button', 'pt-new', 'New egg'); egg.type = 'button';
  dev.append(el('div', 'pt-brand', 'PIXEL PET'), scr, hearts, btns, nameEl, egg); stage.appendChild(dev);
  const cx = cv.getContext('2d');
  function born() { const kind = rnd(2) ? 'dog' : 'cat'; p = {born: Date.now(), last: Date.now(), hunger: 4, joy: 4, poops: 0, sleeping: false, kind, name: NAMES[kind][rnd(6)]}; store.set('pet', p); }
  if (!p) born(); if (!p.kind) { p.kind = rnd(2) ? 'dog' : 'cat'; p.name = NAMES[p.kind][rnd(6)]; }
  const age = () => (Date.now() - p.born) / MIN;
  const stageOf = () => { const a = age(); return a < 1 ? 'egg' : a < 10 ? 'baby' : a < 45 ? 'child' : 'adult'; };
  const call = () => sfx(p.kind === 'dog' ? 'bark' : 'meow');
  // time passes while you are away: hearts drain slowly, and sleeping slows it down
  function catchUp() {
    const el2 = (Date.now() - p.last) / MIN, rate = p.sleeping ? .3 : 1; p.last = Date.now();
    if (stageOf() === 'egg') return;
    const d = el2 * rate; p.hunger = Math.max(0, p.hunger - d / 8); p.joy = Math.max(0, p.joy - d / 10); p.poops = Math.min(3, p.poops + d / 15);
  }
  function save() { store.set('pet', p); }
  let fr = 0, msg = '', msgT = 0, nag = 0, A = null, at = 0;
  const mood = () => { const h = Math.round(p.hunger), j = Math.round(p.joy), m = Math.floor(p.poops); if (p.sleeping) return 'sleep'; if (h <= 1) return 'hungry'; if (m >= 2) return 'dirty'; if (j <= 1) return 'sad'; return 'happy'; };

  // actions play a short animation; sounds are tied to its frames
  function startAnim(t, n, x) { A = Object.assign({t, f: 0, n}, x || {}); clearInterval(at); at = setInterval(step, 140); draw(); }
  function step() {
    A.f++;
    if (A.t === 'feed' && A.f >= 6 && A.f <= 11 && A.f % 2 === 0) sfx('munch');
    if (A.t === 'feed' && A.f === 14) sfx('peep');
    if (A.t === 'play' && A.f === 6) call();
    if (A.t === 'hatch' && A.f === 10) sfx('hatch');
    if (A.f >= A.n) { clearInterval(at); A = null; draw(); say(status()); return; }
    draw();
  }
  function act(a) {
    if (A) return; catchUp(); const sg = stageOf();
    if (sg === 'egg') { flash('It is still an egg.'); sfx('blip'); startAnim('wobble', 6); return; }
    if (a === 'light') { p.sleeping = !p.sleeping; flash(p.sleeping ? 'Lights out. Zzz...' : 'Good morning!'); sfx(p.sleeping ? 'sleepy' : 'peep'); startAnim('lights', 7, {to: p.sleeping}); }
    else if (p.sleeping) { flash(p.name + ' is asleep. Turn the light on.'); sfx('blip'); startAnim('nope', 6); }
    else if (a === 'feed') {
      if (p.hunger >= 3.6) { flash('Not hungry.'); sfx('bonk'); startAnim('nope', 6); }
      else { p.hunger = Math.min(4, p.hunger + 1.2); p.poops = Math.min(3, p.poops + .35); flash('Yum!'); startAnim('feed', 18); }
    }
    else if (a === 'play') { p.joy = Math.min(4, p.joy + 1.2); p.hunger = Math.max(0, p.hunger - .2); flash(p.name + ' had fun!'); startAnim('play', 16); }
    else if (a === 'clean') { if (p.poops < 1) { flash('Nothing to clean.'); sfx('bonk'); startAnim('nope', 6); } else { const n0 = Math.floor(p.poops); p.poops = 0; flash('All clean.'); sfx('clear'); startAnim('clean', 10, {n0}); } }
    save(); draw();
  }
  function flash(t) { msg = t; say(t); clearTimeout(msgT); msgT = setTimeout(() => { msg = ''; say(status()); }, 2500); }
  function status() {
    const sg = stageOf(); if (sg === 'egg') return 'An egg. It will hatch in a minute.'; const m = mood();
    return {sleep: p.name + ' is sleeping.', hungry: p.name + ' is hungry!', dirty: p.name + ' needs cleaning!', sad: p.name + ' is bored.', happy: p.name + ' is happy.'}[m];
  }

  const ink = '#1d2b0e', bg = '#b7c97a';
  const R = (x, y, w, h, c) => { cx.fillStyle = c || ink; cx.fillRect(Math.round(x), Math.round(y), w, h); };
  function ell(x, y, rx, ry, c) { cx.fillStyle = c || ink; cx.beginPath(); cx.ellipse(x, y, rx, ry, 0, 0, 7); cx.fill(); }
  function tri(a, b, c, d, e, f) { cx.fillStyle = ink; cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.lineTo(e, f); cx.fill(); }
  const heart = (x, y) => { R(x, y, 2, 2); R(x + 3, y, 2, 2); R(x, y + 1, 5, 2); R(x + 1, y + 3, 3, 1); R(x + 2, y + 4, 1, 1); };
  function critter(sg, m, bob, jump, o) {
    const s = sg === 'baby' ? .72 : sg === 'child' ? .88 : 1, y0 = 20 + bob + jump, hr = 9 * s, wag = Math.sin(fr * 1.6) > 0 ? 1 : -1;
    const by = y0 + 11 * s, hy = y0 - 2 * s, happy = m === 'happy' || o.open != null;
    if (p.kind === 'dog') { R(24 + 10 * s, by - 6 * s - (happy ? wag * 2 : 0), 3, 7 * s); R(24 + 10 * s, by - 7 * s - (happy ? wag * 2 : 0), 5, 2); }
    else { R(24 + 10 * s, by - 2, 4, 3); R(24 + 13 * s, by - 8 * s, 3, 8 * s); }
    ell(24, by, 9 * s, 7 * s);
    R(24 - 6 * s, by + 5 * s, 4, 3); R(24 + 3 * s, by + 5 * s, 4, 3);
    if (p.kind === 'cat') { tri(24 - hr, hy - 2, 24 - hr + 1, hy - hr - 5, 24 - 2, hy - hr + 1); tri(24 + hr, hy - 2, 24 + hr - 1, hy - hr - 5, 24 + 2, hy - hr + 1); }
    else { ell(24 - hr - 2, hy + 4, 3, 7 * s + 1); ell(24 + hr + 2, hy + 4, 3, 7 * s + 1); }
    ell(24, hy, hr + 1.2, hr * .9 + 1.2, bg); ell(24, hy, hr, hr * .9);
    if (m === 'sleep') { R(19, hy, 4, 1, bg); R(26, hy, 4, 1, bg); cx.fillStyle = ink; cx.font = '8px monospace'; cx.fillText('z', 36, 9 + bob); cx.fillText('z', 40, 5 + bob); }
    else {
      if (o.blink) { R(19, hy - 2, 3, 1, bg); R(27, hy - 2, 3, 1, bg); } else { R(19, hy - 3, 3, 3, bg); R(27, hy - 3, 3, 3, bg); }
      if (p.kind === 'cat') { R(24, hy + 1, 1, 1, bg); R(22, hy + 2, 2, 1, bg); R(25, hy + 2, 2, 1, bg); R(14, hy, 4, 1, bg); R(31, hy, 4, 1, bg); }
      else { R(23, hy, 3, 2, bg); R(24, hy + 2, 1, 1, bg); }
      if (o.open === true) R(22, hy + 4, 5, 3, bg);
      else if (o.open === false) R(22, hy + 5, 5, 1, bg);
      else if (m === 'happy') { if (p.kind === 'dog') R(23, hy + 4, 3, 3, bg); else { R(21, hy + 4, 2, 1, bg); R(26, hy + 4, 2, 1, bg); } }
      else if (m === 'hungry' || m === 'sad') R(21, hy + 5, 7, 1, bg);
    }
    if (m === 'hungry') { cx.fillStyle = ink; cx.font = '9px monospace'; cx.fillText('!', 37, 12); }
    return hy;
  }
  function food(x, y, k) {
    const w = Math.max(2, Math.round(7 * k));
    if (p.kind === 'dog') { R(x, y + 1, w, 2); R(x - 1, y, 2, 4); R(x + w - 1, y, 2, 4); } else { ell(x + w / 2, y + 2, w / 2 + 1, 2); tri(x + w, y + 2, x + w + 3, y, x + w + 3, y + 4); }
  }
  function draw() {
    cx.font = '8px monospace'; cx.fillStyle = bg; cx.fillRect(0, 0, 48, 40);
    const sg = stageOf(), f = A ? A.f : 0, t = A ? A.t : '', bob = Math.sin(fr / 2) > 0 ? 1 : 0, m = mood();
    const egg2 = sg === 'egg' || (t === 'hatch' && f < 10);
    let dx = 0, jump = 0, open;
    if (t === 'nope' || t === 'wobble' || (t === 'hatch' && f < 10)) dx = f % 2 ? 2 : -2;
    else if (t === 'play') { const bx = 4 + f * 2.7; dx = Math.round((bx - 24) / 8); if (f >= 5 && f <= 7) jump = f === 6 ? -6 : -3; }
    else if (t === 'feed') { if (f >= 6 && f <= 13) open = f % 2 === 0; if (f >= 14) jump = f % 2 ? -3 : 0; }
    else if (t === 'hatch') jump = f % 2 ? -3 : 0;
    else if (m !== 'sleep' && !A) dx = Math.round(Math.sin(fr / 5) * 3);
    let hy = 18;
    if (egg2) {
      ell(24 + dx, 22 + bob, 9, 11); R(19 + dx, 18 + bob, 3, 2, bg); R(26 + dx, 24 + bob, 3, 2, bg); R(22 + dx, 29 + bob, 4, 2, bg);
      if (t === 'hatch' && f >= 5) { [[22, 14], [24, 17], [22, 20], [25, 23]].forEach(([x, y]) => R(x + dx, y, 3, 1, bg)); }
    } else {
      cx.save(); cx.translate(dx, 0); hy = critter(sg, m, bob, jump, {open, blink: fr % 11 === 0 && !A}); cx.restore();
      if (t === 'hatch' && f >= 10 && f < 14) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => R(24 + sx * (f - 8) * 3, 22 + sy * (f - 8) * 2, 3, 3));
    }
    // action props
    if (t === 'feed' && f < 12) { const k = f < 6 ? 1 : 1 - (f - 6) / 7; food(f < 6 ? 40 - f * 2.6 : 28, f < 6 ? 2 + f * 3.4 : 22 + (f - 6) / 2, k); }
    if (t === 'play' && f < 14) { const bx = 4 + f * 2.7, by = 30 - 20 * Math.sin(Math.min(1, f / 13) * Math.PI) * Math.abs(Math.cos(f / 2)) - 2; ell(bx, by, 3, 3); R(bx - 1, by - 1, 1, 1, bg); }
    if ((t === 'feed' && f >= 14) || (t === 'play' && f >= 11)) { heart(32, 9 - (f % 3)); if (f % 2) heart(8, 12); }
    const wipe = t === 'clean' ? f * 6 : -1, n = t === 'clean' ? A.n0 : Math.floor(p.poops);
    for (let i = 0; i < n; i++) { const px = 3 + i * 7; if (px + 5 >= wipe) { R(px, 35, 5, 3); R(px + 1, 33, 3, 2); R(px + 2, 31, 1, 2); } }
    if (t === 'clean') { for (let k = 0; k < 4; k++) { const sx = wipe - k * 4, sy = 30 + ((k * 7 + f * 3) % 9); if (sx >= 0 && sx < 48) { R(sx, sy, 1, 3); R(sx - 1, sy + 1, 3, 1); } } R(wipe, 28, 2, 12); }
    // night: a dither falls over the screen, with a moon
    const night = t === 'lights' ? (A.to ? f / 7 : 1 - f / 7) : (p.sleeping ? 1 : 0);
    if (night > 0) { for (let y = 0; y < 40 * night; y += 2) for (let x = (y / 2) % 2; x < 48; x += 2) R(x, y, 1, 1); if (night >= 1) { ell(8, 8, 4, 4); ell(10, 7, 3.4, 3.4, bg); } }
    const hh = (n2) => '\u2665'.repeat(Math.round(n2)) + '\u2661'.repeat(4 - Math.round(n2));
    hungry.textContent = 'Food ' + hh(p.hunger); joy.textContent = 'Fun ' + hh(p.joy); mess.textContent = 'Mess ' + '\u2022'.repeat(Math.floor(p.poops));
    lite.classList.toggle('on', p.sleeping); nameEl.textContent = sg === 'egg' ? 'Egg' : p.name + ' the ' + p.kind + ' (' + sg + ', ' + Math.floor(age()) + ' min old)';
  }
  let wasEgg = stageOf() === 'egg';
  const timer = setInterval(() => {
    fr++; catchUp();
    if (wasEgg && stageOf() !== 'egg') { wasEgg = false; flash('It hatched! Say hi to ' + p.name + ', a ' + p.kind + '.'); startAnim('hatch', 16); }
    // calls out now and then when it needs something
    const m = mood(); if (stageOf() !== 'egg' && (m === 'hungry' || m === 'dirty' || m === 'sad') && ++nag >= 12 && active()) { nag = 0; call(); }
    save(); if (!A) draw(); if (!msg) say(status());
  }, 700);
  let armed = false, armT = 0;
  egg.onclick = () => { if (!armed) { armed = true; egg.textContent = 'Sure?'; armT = setTimeout(() => { armed = false; egg.textContent = 'New egg'; }, 3000); return; } clearTimeout(armT); armed = false; egg.textContent = 'New egg'; born(); wasEgg = true; flash('A new egg!'); draw(); };
  catchUp(); draw(); say(status());
  return {stop() { clearInterval(timer); clearInterval(at); A = null; save(); }, restart() { born(); wasEgg = true; draw(); }};
}

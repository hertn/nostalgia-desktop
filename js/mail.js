// Mail: a small inbox. Messages arrive now and then with a "mail call" chime; Get Mail fetches one right away.
// Everything here is written for this site; senders are screen names, not real addresses.
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

const POOL = [
  {id: 'welcome', from: 'Postmaster', subj: 'Welcome to Mail', body: 'Hello!\n\nThis is your inbox. New mail arrives every few minutes while you use the computer, and a little mailbox will pop up when it does. You can also press Get Mail to check right now.\n\nOnce in a while the Postmaster sends a Daily Digest of what happened on the date on your clock.\n\nHappy surfing,\nThe Postmaster'},
  {id: 'chain', from: 'kristen_b87', subj: 'FWD: FWD: FWD: READ THIS!!!', body: 'IF YOU DO NOT SEND THIS TO 10 PEOPLE IN THE NEXT 5 MINUTES you will have bad luck for 7 years!!!\n\nA girl in Ohio ignored this and the next day her hamster learned to speak French and her locker would not open. A boy in Texas sent it to 12 people and found $20 in his jeans.\n\nDo not break the chain!!! Send to 10 people NOW.\n\n(sorry if u already got this)'},
  {id: 'hamster', from: 'mikeyD_1987', subj: 'FW: this is the best site EVER', body: 'dude go to the hamster dance site. turn ur speakers up. u cant stop watching it. i have had it on for an hour.\n\nthe song is on a loop and its sped up chipmunks. its amazing.\n\n- mikey', y: [1998, 2005]},
  {id: 'free', from: 'totally_legit_bob', subj: 'FREE screensaver!!! (NOT a virus)', body: 'Hi friend!\n\nOpen the attachment "kittens.scr.exe" for a FREE screensaver of cute kittens! It is 100% safe!!! My computer works fine now (the blue screen is normal).\n\nDo not open attachments from people you do not know. Even if they promise kittens.\n\n(This message is a joke. There is no attachment.)'},
  {id: 'hw', from: 'softballchick22', subj: 're: algebra hw??', body: 'ok did u get #14?? i got x = 7 but mrs kowalski said it was wrong last time when i got the same thing lol\n\nmessage me on the messenger tonite, i have practice til 6 and then i have to eat dinner and then my mom wants the phone line for like an hour\n\n- sam'},
  {id: 'pic', from: 'jenny_luvs_blink', subj: 'check out my new pic!!!', body: 'omg i finally got the pic from the camera!!! attached: me_and_ashley_FINAL2.jpg (2.1 MB, will take like 40 minutes to download lol)\n\nu have to tell me what u think of my hair. i did it myself with the blue streak.\n\nxoxo jenny <3'},
  {id: 'cd', from: 'cherry_bomb89', subj: 'did u get the cd i burned??', body: 'i burned u a mix cd!!! it is in ur locker. i wrote the tracklist on it with a sharpie so dont smudge it.\n\ntrack 7 is the best one. u have to listen on the car ride. the bass is soooo good.\n\nBFF 4eva,\ncherry'},
  {id: 'party', from: 'soccerstar14', subj: 'party fri!!!', body: 'my parents are out of town fri. bring chips and ur xbox controllers (if u have one). we are playing halo til 2am.\n\ndont tell xXpunkrockXx lol he will bring his guitar again\n\n- 14'},
  {id: 'mom', from: 'Mom', subj: 'GET OFF THE COMPUTER', body: 'I need to call Aunt Linda and you have been on the internet for 3 hours. The phone line is busy again.\n\nCome down for dinner. And log off. And did you take out the trash?\n\nLove, Mom'},
  {id: 'ecard', from: 'secret_admirer', subj: 'someone sent you an e-card', body: 'Somebody thinks you are great and sent you an animated e-card!\n\n[ a heart that bounces slowly, with a MIDI song that will not stop ]\n\nClick to see who it is. (It is your friend Dave. It was always Dave.)'},
  {id: 'discs', from: 'Online Offers', subj: '1000 FREE HOURS!!! (mail-in CD)', body: 'Congratulations! You have been selected to receive our new CD-ROM with 1000 free hours of internet!\n\nYou already have 14 of these in the mail. Use them as coasters. Or frisbees. Or hang them in the garden to scare birds.\n\nSincerely,\nThe Online Offers Team'},
  {id: 'y2kbug', from: 'Dad', subj: 'Y2K: are we ready?', body: 'I read the paper and everybody says computers might stop working at midnight on New Year\'s Eve.\n\nI bought extra batteries, canned beans and a flashlight. Your mother thinks I am being silly. Do you think the VCR will work?\n\nDad', y: [1998, 1999]},
  {id: 'ny2000', from: 'Postmaster', subj: 'Happy New Year 2000!', body: 'The lights are still on. The VCR still blinks 12:00. The world did not end!\n\nWe made it. Happy New Year!', y: [2000, 2000]}
];

export function mountMail(env) {
  const {$, store, sfx, getEra, getDigest, setBadge, onNew, MONTHS, DOWS} = env;
  let box = store.get('mail', null); if (!box || !Array.isArray(box.msgs)) box = {msgs: [], seen: [], dig: []};
  let sel = null, nextId = box.msgs.reduce((m, x) => Math.max(m, x.n || 0), 0) + 1;
  const list = $('#ml-list'), view = $('#ml-view'), stat = $('#ml-stat');
  const save = () => store.set('mail', {msgs: box.msgs.slice(0, 60), seen: box.seen, dig: box.dig.slice(-30)});
  const dateStr = () => { const e = getEra(); return MONTHS[e.m - 1].slice(0, 3) + ' ' + e.d + ', ' + e.y; };
  const unread = () => box.msgs.filter((m) => !m.read).length;
  function sync() { setBadge(unread()); }
  function add(m) { box.msgs.unshift({n: nextId++, from: m.from, subj: m.subj, body: m.body, date: dateStr(), read: false}); save(); draw(); sync(); }
  function draw() {
    list.innerHTML = '';
    if (!box.msgs.length) list.appendChild(el('div', 'ml-empty', 'No mail. Press Get Mail to check.'));
    box.msgs.forEach((m) => {
      const r = el('button', 'ml-row' + (m.read ? '' : ' unread') + (sel === m.n ? ' sel' : '')); r.type = 'button';
      r.append(el('i', 'ml-dot'), el('b', 'ml-from', m.from), el('span', 'ml-subj', m.subj), el('small', 'ml-date', m.date));
      r.onclick = () => open(m.n);
      r._ctx = () => [{t: 'Open', fn: () => open(m.n)}, {t: m.read ? 'Mark as Unread' : 'Mark as Read', fn: () => { m.read = !m.read; save(); draw(); sync(); }}, {sep: 1}, {t: 'Delete', fn: () => del(m.n)}];
      list.appendChild(r);
    });
    stat.textContent = box.msgs.length + ' messages, ' + unread() + ' unread';
  }
  function open(n) {
    sel = n; const m = box.msgs.filter((x) => x.n === n)[0]; view.innerHTML = '';
    if (!m) { view.appendChild(el('div', 'ml-empty', 'Select a message to read it.')); draw(); return; }
    if (!m.read) { m.read = true; save(); sync(); }
    const h = el('div', 'ml-head'); [['From', m.from], ['Subject', m.subj], ['Date', m.date]].forEach(([k, v]) => { const r = el('div'); r.append(el('b', '', k + ': '), document.createTextNode(v)); h.appendChild(r); });
    view.append(h, el('div', 'ml-body', m.body)); draw();
  }
  function del(n) { box.msgs = box.msgs.filter((x) => x.n !== n); if (sel === n) { sel = null; open(null); } save(); draw(); sync(); }
  function pick() {
    const y = getEra().y, ok = POOL.filter((p) => box.seen.indexOf(p.id) < 0 && (!p.y || (y >= p.y[0] && y <= p.y[1])));
    if (!ok.length) return null; const p = ok[p0(ok)]; box.seen.push(p.id); return p;
  }
  const p0 = (a) => (a[0].id === 'welcome' ? 0 : Math.floor(Math.random() * a.length));
  async function digest() {
    const e = getEra(), key = e.y + '-' + e.m + '-' + e.d; if (box.dig.indexOf(key) >= 0) return null;
    let r = null; try { r = await getDigest(e); } catch (x) { r = null; }
    if (!r || !(r.headlines.length || r.song || r.film)) return null;
    box.dig.push(key); const dow = DOWS[new Date(e.y, e.m - 1, e.d).getDay()];
    const lines = ['On ' + dow + ', ' + MONTHS[e.m - 1] + ' ' + e.d + ', ' + e.y + ':', ''];
    if (r.song) lines.push('#1 song: "' + r.song.title + '" by ' + r.song.artist);
    if (r.film) lines.push('#1 at the box office: ' + r.film.title);
    if (r.headlines.length) { lines.push('', 'In the news:'); r.headlines.slice(0, 4).forEach((h) => lines.push('  * ' + String(h.title || h.text || h).replace(/\s+/g, ' ').slice(0, 200))); }
    if (r.events.length) { lines.push('', 'On this day in history:'); r.events.slice(0, 2).forEach((h) => lines.push('  * ' + String(h.title || h).slice(0, 200))); }
    lines.push('', 'Open Old Web and press Home for the full page with pictures.');
    return {from: 'Daily Digest', subj: 'Your Daily Digest for ' + MONTHS[e.m - 1].slice(0, 3) + ' ' + e.d + ', ' + e.y, body: lines.join('\n')};
  }
  let busy = false;
  // returns true if something new arrived
  async function check(quiet) {
    if (busy) return false; busy = true; let got = null;
    try { got = pick(); if (!got || (got.id !== 'welcome' && Math.random() < .35)) { const d = await digest(); if (d) { if (got) box.seen = box.seen.filter((x) => x !== got.id); got = d; } } } finally { busy = false; }
    if (!got) { if (!quiet) stat.textContent = 'No new mail right now.'; return false; }
    add(got); onNew(got); return true;
  }
  $('#ml-get').onclick = async () => { stat.textContent = 'Checking for mail...'; if (!(await check(false))) setTimeout(draw, 1800); };
  $('#ml-del').onclick = () => { if (sel != null) del(sel); };
  draw(); sync(); open(null);
  // arrivals: the Postmaster's welcome soon after the first start-up, then at the pace chosen in Settings (8 to 12 minutes by default)
  const FREQ = {often: [120, 240], normal: [480, 720], rarely: [1200, 1800], never: null};
  let freq = store.get('mailfreq', 'normal'); if (!(freq in FREQ)) freq = 'normal';
  const sel2 = $('#ml-freq'), setp = $('#ml-setp'); sel2.value = freq;
  let timer = 0;
  const delay = () => { const r = FREQ[freq]; return r ? (r[0] + Math.random() * (r[1] - r[0])) * 1000 : 0; };
  function schedule(ms) {
    clearTimeout(timer); if (ms == null) ms = delay(); if (!ms) return;
    timer = setTimeout(async () => {
      if (!env.ready() || document.hidden) { schedule(4000); return; }
      if (unread() < 8) await check(true);
      schedule();
    }, ms);
  }
  sel2.onchange = () => { freq = sel2.value; store.set('mailfreq', freq); schedule(); };
  $('#ml-set').onclick = () => { setp.hidden = !setp.hidden; };
  schedule(box.seen.indexOf('welcome') < 0 ? 14000 : null);
  return {check, unread, open: () => {}};
}

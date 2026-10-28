// TV Guide: the printed TV listings, as a book for the page-flipping viewer (see catalog.js).
// Two kinds of book: the real weekly TV Guide issues scanned on the Internet Archive (only a few from 1996 to 2005 exist),
// and a week of listings recreated as printed pages from Wikipedia's network schedules, so every date has something.
import {lineupAt} from './tvsched.js?v=1';

const NETS = [['ABC', 'ABC', 7], ['CBS', 'CBS', 2], ['NBC', 'NBC', 4], ['Fox', 'FOX', 5], ['UPN', 'UPN', 9], ['The WB', 'WB', 11]];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const IA = 'https://archive.org/';
// [archive.org id, first day (a Saturday), pages, edition, cover story]
const ISSUES = [
  ['1997-03-29-to-04-tv-guide-n-ind-god-and-television-red', '1997-03-29', 112, 'Northern Indiana', 'God and Television'],
  ['1997-09-13-to-19-tv-guide-n-ind-fall-preview-red', '1997-09-13', 173, 'Northern Indiana', 'Fall Preview'],
  ['1998-01-03-to-09-tv-guide-n-ind-the-simpsons-red', '1998-01-03', 98, 'Northern Indiana', 'The Simpsons'],
  ['1998-08-15-to-21-tv-guide-n-ind-diana-red', '1998-08-15', 95, 'Northern Indiana', 'Diana'],
  ['1998-09-26-to-02-tv-guide-n-ind-girl-power-red', '1998-09-26', 121, 'Northern Indiana', 'Girl Power'],
  ['1999-05-01-to-07-tv-guide-cincinnati-kentucky-derby-special-red', '1999-05-01', 133, 'Cincinnati', 'Kentucky Derby Special'],
  ['1999-08-21-to-27-tv-guide-cincinnati-cher-red', '1999-08-21', 115, 'Cincinnati', 'Cher'],
  ['2000-08-26-to-01-tv-guide-twc-manhattan-nsync-red', '2000-08-26', 151, 'Manhattan cable', 'NSYNC'],
  ['tvguidev48n43248220001021jodyanimator', '2000-10-21', 288, 'Northern California', ''],
  ['2001-08-18-to-24-tv-guide-ill-wis-kelly-ripa-in-bloom-red', '2001-08-18', 120, 'Illinois and Wisconsin', 'Kelly Ripa'],
  ['2002-08-17-to-23-tv-guide-chicago-elvis-forever-red', '2002-08-17', 117, 'Chicago', 'Elvis Forever']
].map(([id, date, pages, edition, cover]) => {
  const [y, m, d] = date.split('-').map(Number), a = new Date(y, m - 1, d), z = new Date(y, m - 1, d + 6);
  return {id, start: a, pages, direct: true, title: 'TV Guide, ' + range(a, z), label: range(a, z), sub: edition + (cover ? ' · ' + cover : '') + ' · ' + pages + ' pages'};
});
function range(a, z) { return a.getMonth() === z.getMonth() ? MON[a.getMonth()] + ' ' + a.getDate() + '-' + z.getDate() + ', ' + z.getFullYear() : MON[a.getMonth()] + ' ' + a.getDate() + ' - ' + MON[z.getMonth()] + ' ' + z.getDate() + ', ' + z.getFullYear(); }

const START = 360, PART = 360, ROWS = 12;   // the day runs 6 am to 6 am, four pages of six hours each
const W = 750, H = 1000, TOP = 176, ROWH = 64, TIMEW = 64, GAP = 14, COLW = (W - GAP * 2 - TIMEW) / 6;
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const measure = (() => { let c = null; return (txt, px, bold) => { c = c || document.createElement('canvas').getContext('2d'); c.font = (bold ? 'bold ' : '') + px + 'px Helvetica, Arial, sans-serif'; return c.measureText(txt).width; }; })();
function wrap(text, width, px, bold, maxLines) {
  const words = text.split(' '), lines = []; let cur = '';
  for (let w of words) {
    while (measure(w, px, bold) > width) { let k = w.length - 1; while (k > 1 && measure(w.slice(0, k) + '-', px, bold) > width) k--; if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, k) + '-'); w = w.slice(k); }
    const t = cur ? cur + ' ' + w : w; if (measure(t, px, bold) <= width) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const l = lines.slice(0, maxLines); let last = l[maxLines - 1]; while (last.length > 1 && measure(last + '…', px, bold) > width) last = last.slice(0, -1); l[maxLines - 1] = last + '…'; return l; }
  return lines;
}
const clock = (m) => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), x = m % 60; return ((h % 12) || 12) + (x ? ':' + String(x).padStart(2, '0') : ' ' + (h < 12 ? 'AM' : 'PM')); };
const dataUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const svgOpen = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">';

// one network's programs for one date, with the gaps filled in as local programming
function dayList(sched, net, date) {
  const month = date.getMonth() + 1, day = date.getDate(), dow = date.getDay();
  const get = (part, key) => { const t = sched[part] && key && sched[part][key]; return t && t[net] ? lineupAt(t[net], month, day) : []; };
  const all = [].concat(get('day', dow === 0 ? 'Sunday' : dow === 6 ? 'Saturday' : 'weekday'), get('prime', DAYS[dow]), get('late', dow === 6 ? 'Saturday' : 'weekday')).sort((a, b) => a.s - b.s);
  const END = START + 1440, out = []; let t = START;
  const put = (s, e, title) => { const local = /^local/i.test(title), last = out[out.length - 1]; if (local && last && last.local && last.e === s) { last.e = e; return; } out.push({s, e, t: local ? 'Local programming' : title, local}); };
  all.forEach((x) => { const s = Math.max(x.s, t), e = Math.min(x.e, END); if (e <= s || s >= END) return; if (s > t) put(t, s, 'Local programming'); put(s, e, x.t); t = e; });
  if (t < END) put(t, END, 'Local programming');
  return out;
}

function coverSvg(week) {
  const tv = '<g transform="translate(205 330)"><path d="M120 6 70 -60 M180 6 230 -60" stroke="#111" stroke-width="6" stroke-linecap="round"/><rect x="0" y="0" width="340" height="270" rx="34" fill="#c9733a" stroke="#111" stroke-width="7"/><rect x="26" y="26" width="228" height="218" rx="26" fill="#1f2a30" stroke="#111" stroke-width="5"/>'
    + ['#d4161c', '#ffe45e', '#3aa6e8', '#58b85a', '#b24dd6', '#fff'].map((c, i) => '<rect x="' + (44 + i * 32) + '" y="52" width="30" height="140" fill="' + c + '"/>').join('')
    + '<rect x="44" y="200" width="192" height="28" fill="#111"/><circle cx="296" cy="70" r="22" fill="#e8d9a8" stroke="#111" stroke-width="4"/><circle cx="296" cy="140" r="22" fill="#e8d9a8" stroke="#111" stroke-width="4"/><path d="M276 205h40M276 222h40M276 239h40" stroke="#111" stroke-width="4"/></g>';
  return svgOpen + '<rect width="750" height="1000" fill="#d4161c"/><rect x="26" y="26" width="698" height="948" fill="none" stroke="#ffe45e" stroke-width="5"/>'
    + '<text x="375" y="172" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-style="italic" font-weight="800" font-size="132" fill="#ffe45e" letter-spacing="-4">TV</text>'
    + '<text x="375" y="252" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-style="italic" font-weight="800" font-size="86" fill="#fff" letter-spacing="-2">GUIDE</text>'
    + tv + '<rect x="120" y="690" width="510" height="84" fill="#111"/><text x="375" y="735" text-anchor="middle" font-weight="800" font-size="30" fill="#fff" letter-spacing="2">THIS WEEK ON TV</text><text x="375" y="764" text-anchor="middle" font-weight="700" font-size="22" fill="#ffe45e">' + esc(range(week.days[0], week.days[6]).toUpperCase()) + '</text>'
    + '<text x="375" y="850" text-anchor="middle" font-weight="800" font-size="30" fill="#fff" letter-spacing="3">ABC · CBS · NBC · FOX · UPN · THE WB</text>'
    + '<text x="375" y="905" text-anchor="middle" font-style="italic" font-size="22" fill="#fff" font-family="Georgia, serif">Every show, every night. Eastern and Pacific time.</text></svg>';
}

function daySvg(week, d, k, pageNo) {
  const date = week.days[d], a = START + k * PART, b = a + PART, nets = week.lists[d];
  const x0 = GAP + TIMEW, parts = ['6 AM to noon', 'Noon to 6 PM', '6 PM to midnight', 'Midnight to 6 AM'];
  let s = svgOpen + '<rect width="750" height="1000" fill="#fbf7ea"/>';
  s += '<rect width="750" height="98" fill="#111"/><text x="' + GAP + '" y="70" font-family="Georgia, Times New Roman, serif" font-style="italic" font-weight="800" font-size="56" fill="#fff">' + DAYS[date.getDay()].toUpperCase() + '</text>';
  s += '<text x="736" y="48" text-anchor="end" font-weight="800" font-size="22" fill="#ffe45e">' + esc(MON[date.getMonth()].toUpperCase() + ' ' + date.getDate()) + '</text><text x="736" y="76" text-anchor="end" font-size="15" fill="#ddd">' + esc(date.getFullYear() + '') + '</text>';
  s += '<rect y="98" width="750" height="34" fill="#ffe45e"/><text x="' + GAP + '" y="122" font-weight="800" font-size="17" fill="#111">' + esc(parts[k].toUpperCase()) + '</text><text x="736" y="122" text-anchor="end" font-style="italic" font-size="14" fill="#333">Eastern and Pacific time</text>';
  s += '<rect y="132" width="750" height="40" fill="#d4161c"/><text x="' + (GAP + 4) + '" y="158" font-size="13" font-weight="700" fill="#fff">TIME</text>';
  NETS.forEach((n, i) => { const cx = x0 + i * COLW + COLW / 2; s += '<circle cx="' + (cx - 30) + '" cy="152" r="12" fill="none" stroke="#ffe45e" stroke-width="2"/><text x="' + (cx - 30) + '" y="157" text-anchor="middle" font-size="13" font-weight="800" fill="#ffe45e">' + n[2] + '</text><text x="' + (cx + 12) + '" y="158" text-anchor="middle" font-size="18" font-weight="800" fill="#fff">' + n[1] + '</text>'; });
  for (let r = 0; r < ROWS; r++) {
    const m = a + r * 30, y = TOP + r * ROWH, prime = m >= 1200 && m < 1380;
    s += '<rect x="0" y="' + y + '" width="' + (GAP + TIMEW) + '" height="' + ROWH + '" fill="' + (prime ? '#ffe45e' : '#efe8cf') + '"/>';
    s += '<text x="' + (GAP + TIMEW - 6) + '" y="' + (y + 22) + '" text-anchor="end" font-size="' + (m % 60 ? 14 : 17) + '" font-weight="' + (m % 60 ? 500 : 800) + '" fill="#111">' + clock(m) + '</text>';
    s += '<line x1="0" x2="750" y1="' + y + '" y2="' + y + '" stroke="' + (m % 60 ? '#cfc7aa' : '#111') + '" stroke-width="' + (m % 60 ? 1 : 1.6) + '"/>';
  }
  NETS.forEach((n, i) => {
    const x = x0 + i * COLW;
    (nets[n[0]] || []).forEach((p) => {
      const ps = Math.max(p.s, a), pe = Math.min(p.e, b); if (pe <= ps) return;
      const y = TOP + (ps - a) / 30 * ROWH, h = (pe - ps) / 30 * ROWH, prime = ps >= 1200 && ps < 1380;
      s += '<rect x="' + x + '" y="' + y + '" width="' + COLW + '" height="' + h + '" fill="' + (p.local ? '#ece6d2' : prime ? '#fff' : '#fffdf4') + '" stroke="#111" stroke-width="1.2"/>';
      if (p.local) { s += wrap('Local programming', COLW - 14, 13, false, 2).map((l, j) => '<text x="' + (x + 7) + '" y="' + (y + 19 + j * 15) + '" font-size="13" font-style="italic" fill="#8a8470">' + l + '</text>').join(''); return; }
      let px = 15; while (px > 11 && p.t.split(' ').some((w) => measure(w, px, true) > COLW - 14)) px--;   // a long word shrinks the type a little rather than breaking
      const lines = wrap(p.t, COLW - 14, px, true, Math.max(1, Math.floor((h - 8) / 17)));
      s += lines.map((l, j) => '<text x="' + (x + 7) + '" y="' + (y + 20 + j * 17) + '" font-size="' + px + '" font-weight="700" fill="#111">' + esc(l) + '</text>').join('');
      if (p.s >= a && h >= ROWH * 2 && lines.length * 17 + 36 < h) s += '<text x="' + (x + 7) + '" y="' + (y + h - 9) + '" font-size="12" fill="#666">' + clock(p.s) + ' to ' + clock(p.e) + '</text>';
    });
  });
  s += '<line x1="' + (GAP + TIMEW) + '" x2="' + (GAP + TIMEW) + '" y1="' + TOP + '" y2="' + (TOP + ROWS * ROWH) + '" stroke="#111" stroke-width="2"/>';
  s += '<line x1="0" x2="750" y1="' + (TOP + ROWS * ROWH) + '" y2="' + (TOP + ROWS * ROWH) + '" stroke="#111" stroke-width="3"/>';
  s += '<text x="' + (pageNo % 2 ? 736 : GAP) + '" y="982" text-anchor="' + (pageNo % 2 ? 'end' : 'start') + '" font-size="13" fill="#555"><tspan font-weight="800" fill="#d4161c">TV GUIDE</tspan>  ' + esc(range(week.days[0], week.days[6])) + '   ·   ' + pageNo + '</text></svg>';
  return s;
}

export function guideSource({getEra, data}) {
  const scheds = new Map(); let week = null;
  const schedFor = async (date) => { const m = date.getMonth() + 1, sy = m >= 9 ? date.getFullYear() : date.getFullYear() - 1; if (!scheds.has(sy)) scheds.set(sy, await data.tvSchedule(date.getFullYear(), m)); return scheds.get(sy); };
  const svgs = new Map();
  const weekSvg = (n) => { if (!svgs.has(n)) svgs.set(n, n === 1 ? coverSvg(week) : daySvg(week, Math.floor((n - 2) / 4), (n - 2) % 4, n)); return svgs.get(n); };
  async function buildWeek(era) {
    const d = new Date(era.y, era.m - 1, era.d), sat = new Date(era.y, era.m - 1, era.d - ((d.getDay() + 1) % 7));   // TV Guide weeks run Saturday to Friday
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + i));
    const lists = []; for (const day of days) { const sc = await schedFor(day); const o = {}; NETS.forEach((n) => { o[n[0]] = dayList(sc, n[0], day); }); lists.push(o); }
    return {days, lists, title: 'TV Guide, ' + range(days[0], days[6]) + ' (recreated)', pages: 1 + 7 * 4, local: true, label: 'This week, recreated', sub: 'Listings page by page · 29 pages'};
  }
  const eraDate = (e) => new Date(e.y, e.m - 1, e.d);
  return {
    list: async (era) => {
      week = null; try { week = await buildWeek(era); } catch (e) { /* the real issues still work without the schedule */ }
      svgs.clear(); return (week ? [week] : []).concat(ISSUES);
    },
    key: (era) => era.y + '-' + era.m + '-' + era.d,
    pick: (list, era) => {
      const t = eraDate(era).getTime(), DAY = 864e5, real = ISSUES.find((i) => t >= i.start.getTime() && t < i.start.getTime() + 7 * DAY);
      if (real) return real; if (week) return list[0];
      return ISSUES.slice().sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0];
    },
    libTitle: () => 'This week, and the real printed issues that survive',
    page: async (title, n) => { const b = title === (week && week.title) ? week : null; if (b) return dataUrl(weekSvg(n)); const i = ISSUES.find((x) => x.title === title); return IA + 'download/' + i.id + '/page/n' + (n - 1) + '_w800.jpg'; },
    thumbs: async (title, start, count) => {
      const out = {}, b = week && title === week.title, i = b ? null : ISSUES.find((x) => x.title === title), last = Math.min(start + count - 1, b ? week.pages : i.pages);
      for (let n = start; n <= last; n++) out[n] = b ? dataUrl(weekSvg(n)) : IA + 'download/' + i.id + '/page/n' + (n - 1) + '_w120.jpg';
      return out;
    },
    credit: (book) => {
      if (book.local) { const d = book.days[0], sy = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return {pre: 'Listings from ', text: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/' + sy + '%E2%80%93' + String(sy + 1).slice(-2) + '_United_States_network_television_schedule'}; }
      return {pre: 'Scan of a real printed issue, courtesy of the ', text: 'Internet Archive', url: IA + 'details/' + book.id};
    },
    words: {open: 'Opening the listings...', none: 'No listings for this date.', fail: 'The listings did not arrive. Check your connection. '}
  };
}

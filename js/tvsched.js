// Reads the Wikipedia "United States network television schedule" tables (primetime, daytime, late night) into plain data.
// Nothing here touches the network or the page: it takes an already parsed document, so it can be tested anywhere.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const clean = (t) => t.replace(/ /g, ' ').replace(/\[[^\]]*\]/g, '').replace(/\((?:R|Tied[^)]*|\d+\/[\d.]+[^)]*)\)/g, '').replace(/\s*[†‡*]+\s*$/, '').replace(/\s+/g, ' ').trim();

// "8:00 p.m." "noon" "12:30 AM" "1:30/1:35 AM" -> minutes after midnight (first time if two are given)
function minutes(label) {
  const t = label.replace(/ /g, ' ').toLowerCase();
  if (/noon/.test(t)) return 720;
  if (/midnight/.test(t)) return 0;
  const m = t.match(/(\d{1,2}):?(\d{2})?[^ap]*([ap])\.?m/); if (!m) return NaN;
  let h = +m[1] % 12; if (m[3] === 'p') h += 12; return h * 60 + (+m[2] || 0);
}

// a table with rowspans and colspans -> a plain matrix of cell texts, plus each cell's own width
function expand(table) {
  const grid = [], rows = Array.from(table.querySelectorAll('tr'));
  rows.forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    Array.from(tr.children).forEach((cell) => {
      if (!/^t[hd]$/i.test(cell.tagName)) return;
      while (grid[r][c]) c++;
      const rs = Math.max(1, parseInt(cell.getAttribute('rowspan'), 10) || 1), cs = Math.max(1, parseInt(cell.getAttribute('colspan'), 10) || 1);
      const text = clean(Array.from(cell.querySelectorAll('br')).length ? Array.from(cell.childNodes).map((n) => (n.nodeName === 'BR' ? ' ' : n.textContent)).join('') : cell.textContent);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { (grid[r + i] = grid[r + i] || [])[c + j] = {text, first: i === 0 && j === 0, lead: j === 0, cs}; }
      c += cs;
    });
  });
  return grid;
}

// one day's table -> {ABC: [{label: 'Fall', list: [{s, e, t}]}, ...], ...}; the label is '' for a network that keeps one lineup all year
function readTable(table) {
  const g = expand(table), head = g[0] || [], times = [];
  head.forEach((cell, i) => { if (cell && cell.first && i >= 2) times[i] = minutes(cell.text); });
  const out = {};
  for (let r = 1; r < g.length; r++) {
    const row = g[r]; if (!row || !row[0]) continue;
    const net = row[0].text.replace(/[†‡*]/g, '').replace(/\s*\(.*$/, '').trim(), season = row[0].cs === 1 && row[1] && row[1].text ? row[1].text : '';   // a network with one row has a two-wide name cell and no season
    const list = [];
    for (let c = 2; c < row.length; c++) {
      const cell = row[c]; if (!cell || !cell.lead) continue;     // a cell is read once, from its first column
      const span = cell.cs; let s0 = times[c]; if (!isFinite(s0)) continue;
      let e = times[c + span]; if (!isFinite(e)) e = s0 + 30 * span;
      // times after midnight keep climbing so a late night row stays in order
      if (list.length && s0 < list[list.length - 1].s) s0 += 1440; if (e <= s0) e += 1440;
      list.push({s: s0, e, t: cell.text});
    }
    (out[net] = out[net] || []).push({label: season, list});
  }
  return out;
}

function tablesByHeading(doc) {
  const found = {}; let name = null;
  Array.from(doc.querySelectorAll('h2, h3, table.wikitable, table')).forEach((n) => {
    if (/^h[23]$/i.test(n.tagName)) { name = clean(n.textContent).replace(/\s*edit\s*$/i, ''); return; }
    if (name && !found[name] && /network/i.test(n.textContent.slice(0, 200))) found[name] = n;
  });
  return found;
}

// doc -> {Sunday: {...}, Monday: {...}} for a primetime page; the daytime and late night pages use 'weekday' for Monday to Friday
export function readSchedule(doc, kind) {
  const tabs = tablesByHeading(doc), out = {};
  Object.keys(tabs).forEach((h) => {
    const day = DAYS.find((d) => h === d || (h.indexOf(d) === 0 && h.length < d.length + 3));
    const key = day || (/Monday/.test(h) && /Friday/.test(h) ? 'weekday' : null);
    if (key && !out[key]) { const t = readTable(tabs[h]); if (Object.keys(t).length) out[key] = t; }
  });
  return out;
}

export const DAY_NAMES = DAYS;

// where a row label falls in the school year, counted in months from the first of September (Sep 0 ... Aug 11)
const MONTHS = ['sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug'];
const SEASON_AT = {fall: 0, winter: 4, spring: 7, summer: 9};
export function labelAt(label) {
  const t = label.toLowerCase().replace(/\(.*\)/, '').trim(); if (!t) return NaN;
  const m = MONTHS.findIndex((x) => t.indexOf(x) >= 0), kind = Object.keys(SEASON_AT).find((k) => t.indexOf(k) >= 0);
  if (m >= 0) return /mid/.test(t) ? m + .5 : /late/.test(t) ? m + .8 : m;
  if (kind) { const b = SEASON_AT[kind], len = kind === 'fall' ? 3.5 : kind === 'winter' ? 3 : kind === 'spring' ? 2 : 3; return /early/.test(t) ? b : /mid/.test(t) ? b + len * .4 : /late/.test(t) ? b + len * .75 : b; }
  return NaN;
}
// a network's rows -> the lineup running at this month and day
export function lineupAt(rows, month, day) {
  if (!rows || !rows.length) return [];
  const now = (((month - 9) % 12) + 12) % 12 + ((day || 1) - 1) / 31;
  let best = null, bestAt = -1;
  rows.forEach((r) => { const at = labelAt(r.label); if (isFinite(at) && at <= now && at >= bestAt) { best = r; bestAt = at; } });
  if (!best) { const known = rows.filter((r) => isFinite(labelAt(r.label))); best = known.length ? known.reduce((a, b) => (labelAt(b.label) > labelAt(a.label) ? b : a)) : rows[0]; }
  return best.list;
}

// Live lookups, no keys or accounts. Everything is limited to 1996-2005:
//  - songs by year: Wikipedia's Billboard Year-End Hot 100 tables
//  - films and TV by year: Wikidata (ranked by how many Wikipedias cover them)
//  - finding a playable video: public Piped search instances, with fallbacks
import {readSchedule} from './tvsched.js?v=1';
const DAY = 864e5;
export const YEARS = [1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005];
export const FIRST = 1996, LAST = 2005;

const cache = {
  get(k, maxAge) { try { const o = JSON.parse(localStorage.getItem('ddc-' + k)); if (o && Date.now() - o.t < maxAge) return o.v; } catch (e) { /* no cache */ } return null; },
  set(k, v) { try { localStorage.setItem('ddc-' + k, JSON.stringify({t: Date.now(), v})); } catch (e) { /* storage full or unavailable */ } }
};

async function getJSON(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 15000);
  try { const r = await fetch(url, {signal: c.signal}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

function plain(s) {
  return String(s)
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<ref[^>]*>.*?<\/ref>|<ref[^>]*\/>/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/^["“”\s]+|["“”\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

export async function topSongs(year) {
  const key = 'songs' + year, hit = cache.get(key, 30 * DAY); if (hit) return hit;
  const url = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&origin=*&page=' + encodeURIComponent('Billboard Year-End Hot 100 singles of ' + year);
  const text = (await getJSON(url)).parse.wikitext, rows = [];
  const re = /^\|\s*(\d{1,3})\s*\|\|\s*(.+?)\s*\|\|\s*(.+)$/gm; let m;
  while ((m = re.exec(text))) {
    const title = plain(m[2]).split(/"\s*\/\s*"/)[0].trim(), artist = plain(m[3].split('||')[0]);
    if (title && artist) rows.push({n: +m[1], title, artist});
  }
  if (!rows.length) throw new Error('No chart rows');
  cache.set(key, rows); return rows;
}

async function sparql(q) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
  return (await getJSON(url, 45000)).results.bindings;
}

const tidy = (s) => { s = s.replace(/ (films?|television series|television program|series|program)$/i, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
const NETS = {'American Broadcasting Company': 'ABC', 'Fox Broadcasting Company': 'Fox', 'National Broadcasting Company': 'NBC', 'Columbia Broadcasting System': 'CBS', 'Warner Bros. Television Network': 'The WB'};
const list = (v, f) => Array.from(new Set(String(v || '').split('|').filter(Boolean).map(f))).sort();

// kind: 'film' or 'tv'. One query each for the whole 2000-2006 window; filtering happens in the page.
export async function guide(kind) {
  const key = 'guide3-' + kind, hit = cache.get(key, 30 * DAY); if (hit) return hit;
  const GEN = 'OPTIONAL{?i wdt:P136 ?gg. ?gg rdfs:label ?gl. FILTER(LANG(?gl)="en")} OPTIONAL{?i wdt:P345 ?imdb.}';
  let rows;
  if (kind === 'film') {
    const b = await sparql('SELECT ?l (MAX(?sl) AS ?s) (MIN(YEAR(?d)) AS ?y) (MAX(?dur) AS ?rt) (SAMPLE(?imdb) AS ?id) (GROUP_CONCAT(DISTINCT ?gl;SEPARATOR="|") AS ?g) WHERE { ?i wdt:P31 wd:Q11424; wdt:P495 wd:Q30; wdt:P577 ?d; wikibase:sitelinks ?sl. FILTER(YEAR(?d)>=1996 && YEAR(?d)<=2005) ?i rdfs:label ?l. FILTER(LANG(?l)="en") OPTIONAL{?i wdt:P2047 ?dur.} ' + GEN + ' } GROUP BY ?l ORDER BY DESC(?s) LIMIT 260');
    rows = b.map((x) => ({title: x.l.value, y: +x.y.value, rt: x.rt ? Math.round(+x.rt.value) : 0, imdb: x.id ? x.id.value : '', genres: list(x.g && x.g.value, tidy)}));
  } else {
    const b = await sparql('SELECT ?l (MAX(?sl) AS ?s) (MIN(YEAR(?st)) AS ?y0) (MAX(YEAR(?en)) AS ?y1) (SAMPLE(?imdb) AS ?id) (GROUP_CONCAT(DISTINCT ?gl;SEPARATOR="|") AS ?g) (GROUP_CONCAT(DISTINCT ?nl;SEPARATOR="|") AS ?n) WHERE { ?i wdt:P31 wd:Q5398426; wdt:P495 wd:Q30; wdt:P580 ?st; wdt:P582 ?en; wikibase:sitelinks ?sl. FILTER(YEAR(?st)<=2005 && YEAR(?en)>=1996 && YEAR(?st)>=1984) FILTER NOT EXISTS{?i wdt:P580 ?st2. FILTER(YEAR(?st2)>2005)} ?i rdfs:label ?l. FILTER(LANG(?l)="en") ' + GEN + ' OPTIONAL{?i wdt:P449 ?net. ?net rdfs:label ?nl. FILTER(LANG(?nl)="en")} } GROUP BY ?l ORDER BY DESC(?s) LIMIT 200');
    rows = b.map((x) => ({title: x.l.value, y0: +x.y0.value, y1: +x.y1.value, imdb: x.id ? x.id.value : '', genres: list(x.g && x.g.value, tidy), nets: list(x.n && x.n.value, (n) => NETS[n] || n)}));
  }
  cache.set(key, rows); return rows;
}

const PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de'];
const BAD = /lyric|cover|reaction|remix|karaoke|tutorial|sped up|slowed|8d|nightcore|instrumental|parody|review|explained|behind the|interview|tribute/i;

// returns video items [{id,title,by,dur}] best first
export async function searchVideos(q, o) {
  o = o || {};
  const key = 'q2:' + q + ':' + (o.max || 0), hit = cache.get(key, 7 * DAY); if (hit) return hit;
  let lastErr = null;
  for (const base of PIPED) {
    try {
      const d = await getJSON(base + '/search?filter=videos&q=' + encodeURIComponent(q), 9000);
      const items = (d.items || []).filter((x) => x.type === 'stream' && x.duration > 20 && !(x.uploaded > Date.now() + 36e5) && (!o.max || x.duration <= o.max) && /v=([\w-]{11})/.test(x.url || ''))
        .map((x) => ({id: x.url.match(/v=([\w-]{11})/)[1], title: x.title || '', by: x.uploaderName || '', dur: x.duration, verified: !!x.uploaderVerified}));
      if (!items.length) continue;
      const yr = (x) => { const m = x.title.match(/\b(19|20)\d\d\b/); return m ? +m[0] : 0; };
      const score = (x) => (/official/i.test(x.title) ? 3 : 0) + (x.verified ? 2 : 0) + (/vevo/i.test(x.by) ? 2 : 0) - (o.strict !== false && BAD.test(x.title) ? 4 : 0)
        + (o.year && yr(x) ? (yr(x) === o.year ? 3 : -6) : 0) - (o.year && /musical|reboot|remake|\b202\d\b/i.test(x.title) ? 4 : 0);
      items.sort((a, b) => score(b) - score(a));
      let out = items.slice(0, 8);
      const ok = await Promise.all(out.map((x) => embeddable(x.id)));
      const good = out.filter((x, i) => ok[i]); if (good.length) out = good;
      out = out.slice(0, 6); cache.set(key, out); return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No search service answered');
}

// YouTube answers oEmbed with 401 when the owner blocks embedding; network trouble counts as "maybe fine"
async function embeddable(id) {
  const k = 'emb:' + id, hit = cache.get(k, 14 * DAY); if (hit !== null) return hit === 1;
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 5000);
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), {signal: c.signal}); clearTimeout(t);
    if (r.ok) { cache.set(k, 1); return true; }
    if (r.status === 401 || r.status === 403 || r.status === 404) { cache.set(k, 0); return false; }
  } catch (e) { /* offline or blocked: don't judge */ }
  return true;
}

// The infobox image of a Wikipedia article is the poster (films) or title card (shows); file URLs come from the imageinfo API.
const WP = 'https://en.wikipedia.org/w/api.php?format=json&origin=*&';
async function infoboxImage(page) {
  const w = await getJSON(WP + 'action=parse&prop=wikitext&section=0&redirects=1&page=' + encodeURIComponent(page), 10000);
  const t = (w.parse && w.parse.wikitext && w.parse.wikitext['*']) || '';
  const m = t.match(/\|\s*image\s*=\s*(?:\[\[)?(?:File:|Image:)?([^\n|\]]+)/i); if (!m) return '';
  const f = m[1].trim(); if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(f)) return '';
  const i = await getJSON(WP + 'action=query&prop=imageinfo&iiprop=url&iiurlwidth=260&titles=' + encodeURIComponent('File:' + f), 10000);
  const p = i.query && Object.values(i.query.pages)[0];
  return (p && p.imageinfo && p.imageinfo[0].thumburl) || '';
}

// Poster and short plot from Wikipedia (no key). One lookup per title, cached for a long time.
export async function about(title, year, kind) {
  const key = 'about2-' + kind + '-' + title + '-' + year, hit = cache.get(key, 90 * DAY); if (hit) return hit;
  const q = kind === 'film' ? title + ' ' + year + ' film' : title + ' ' + year + ' television series';
  const j = await getJSON(WP + 'action=query&generator=search&gsrlimit=1&gsrnamespace=0&gsrsearch=' + encodeURIComponent(q) + '&prop=extracts&exintro=1&explaintext=1&exsentences=3', 10000);
  const pg = j && j.query && j.query.pages && Object.values(j.query.pages)[0];
  const out = {img: '', text: '', page: ''};
  if (pg) {
    out.page = pg.title; out.text = (pg.extract || '').replace(/\s*\([^()]*\)/g, '').replace(/\s+/g, ' ').trim();
    try { out.img = await infoboxImage(pg.title); } catch (e) { /* the plot alone is still useful */ }
  }
  cache.set(key, out); return out;
}

export const youtubeSearchUrl = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);


// "On this day": everything Wikipedia and Commons know about one date, each part optional
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const wpHtml = async (page) => new DOMParser().parseFromString((await getJSON(WP + 'action=parse&prop=text&formatversion=2&page=' + encodeURIComponent(page))).parse.text, 'text/html');
const cell = (c) => (c ? c.textContent.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim() : '');
export async function onThisDay(y, m, d) {
  const key = 'otd5-' + y + '-' + m + '-' + d, hit = cache.get(key, 30 * DAY); if (hit) return hit;
  const out = {headlines: [], events: [], deaths: [], song: null, film: null, photo: null, releases: [], premieres: [], onair: []}, mon = MON[m - 1], target = new Date(y, m - 1, d);
  const iso = (dt) => dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2) + 'T00:00:00Z';
  const at = (n) => iso(new Date(y, m - 1, d + n)), short = (v) => MON[+v.slice(5, 7) - 1].slice(0, 3) + ' ' + +v.slice(8, 10);
  const LBL = '?i rdfs:label ?l. FILTER(LANG(?l)="en")';
  await Promise.all([
    (async () => { // American films released within a few days of the date
      const b = await sparql('SELECT ?l (MAX(?sl) AS ?s) (MIN(?d) AS ?dt) WHERE { ?i wdt:P31 wd:Q11424; wdt:P495 wd:Q30; wdt:P577 ?d; wikibase:sitelinks ?sl. FILTER(?d >= "' + at(-3) + '"^^xsd:dateTime && ?d < "' + at(4) + '"^^xsd:dateTime) ' + LBL + ' } GROUP BY ?l ORDER BY DESC(?s) LIMIT 8');
      out.releases = b.map((x) => ({title: x.l.value, date: short(x.dt.value)}));
    })().catch(() => {}),
    (async () => { // American series that premiered in the two weeks around the date
      const b = await sparql('SELECT ?l (MAX(?sl) AS ?s) (MIN(?st) AS ?dt) WHERE { ?i wdt:P31 wd:Q5398426; wdt:P495 wd:Q30; wdt:P580 ?st; wikibase:sitelinks ?sl. FILTER NOT EXISTS{?i wdt:P580 ?st2. FILTER(YEAR(?st2)>2005)} FILTER(?st >= "' + at(-7) + '"^^xsd:dateTime && ?st < "' + at(8) + '"^^xsd:dateTime) ' + LBL + ' } GROUP BY ?l ORDER BY DESC(?s) LIMIT 8');
      out.premieres = b.map((x) => ({title: x.l.value, date: short(x.dt.value)}));
    })().catch(() => {}),
    (async () => { // the most famous American series that were on the air that day
      const b = await sparql('SELECT ?l (MAX(?sl) AS ?s) WHERE { ?i wdt:P31 wd:Q5398426; wdt:P495 wd:Q30; wdt:P580 ?st; wdt:P582 ?en; wikibase:sitelinks ?sl. FILTER NOT EXISTS{?i wdt:P580 ?st2. FILTER(YEAR(?st2)>2005)} FILTER(?st <= "' + at(0) + '"^^xsd:dateTime && ?en >= "' + at(0) + '"^^xsd:dateTime) ' + LBL + ' } GROUP BY ?l ORDER BY DESC(?s) LIMIT 10');
      out.onair = b.map((x) => x.l.value);
    })().catch(() => {}),
    (async () => { // news headlines from the Wikipedia current events archive
      const doc = await wpHtml('Portal:Current events/' + y + ' ' + mon + ' ' + d);
      out.headlines = Array.from(doc.querySelectorAll('li')).map((li) => { const k = li.cloneNode(true); k.querySelectorAll('ul,sup,.reference').forEach((x) => x.remove()); return k.textContent.replace(/\s+/g, ' ').trim(); })
        .filter((t) => t.length > 35 && !/^\d+ people are killed/.test(t)).slice(0, 8);
    })().catch(() => {}),
    (async () => { // that date's page lists events, births and deaths from every year; keep this year's
      const t = (await getJSON(WP + 'action=parse&prop=wikitext&formatversion=2&page=' + mon + '_' + d)).parse.wikitext; let sec = '';
      t.split('\n').forEach((l) => {
        const hd = l.match(/^==\s*([^=]+?)\s*==\s*$/); if (hd) { sec = hd[1]; return; }
        const mm = l.match(/^\*+\s*(?:\'\'\')?\[\[(\d{4})(?:\|[^\]]*)?\]\](?:\'\'\')?\s*(?:&nbsp;)?\s*(?:&[nm]dash;|[\u2013\u2014-])\s*(.+)$/);
        if (!mm || +mm[1] !== y) return; const txt = plain(mm[2]).replace(/\s*\(born \d{4}\)/, '');
        if (sec === 'Events' && txt) out.events.push(txt); else if (sec === 'Deaths' && txt) out.deaths.push(txt);
      });
    })().catch(() => {}),
    (async () => { // the number one single that week: rows of the year's list, song cells only on the first week
      const doc = await wpHtml('List of Billboard Hot 100 number ones of ' + y); let cur = null;
      doc.querySelectorAll('table.wikitable tr').forEach((tr) => {
        const c = Array.from(tr.children), q = c.findIndex((x) => /^["\u201c]/.test(cell(x))); if (q >= 0) cur = {title: cell(c[q]).replace(/["\u201c\u201d\u2020]/g, '').trim(), artist: cell(c[q + 1])};
        const i = c.findIndex((x) => /^[A-Z][a-z]+ \d{1,2}$/.test(cell(x)));
        if (i >= 0 && cur && new Date(y + ' ' + cell(c[i])) <= target) out._s = cur;
      });
      if (out._s) { out.song = out._s; delete out._s; }
    })().catch(() => {}),
    (async () => { // the film on top of the weekend box office
      const doc = await wpHtml('List of ' + y + ' box office number-one films in the United States'); let film = '';
      for (const tr of doc.querySelectorAll('table.wikitable tr')) {
        // a film that stays on top has its title only in the first week's row, so remember the last one seen
        const c = Array.from(tr.children), i = c.findIndex((x) => /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(cell(x)));
        if (i < 0) continue;
        const after = c.slice(i + 1).map(cell), t = after.findIndex((x) => x && !/^[$\u2020\d]/.test(x) && x.length > 1), g = after.find((x) => /^\$/.test(x));
        if (t >= 0) film = after[t].replace(/[\u2020*]/g, '').trim();
        if (new Date(cell(c[i])) >= target && film) { out.film = {title: film, gross: g || ''}; break; }
      }
    })().catch(() => {}),
    (async () => { // Wikimedia Commons picture of the day
      const pad = (n) => ('0' + n).slice(-2);
      const w = (await getJSON('https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=parse&prop=wikitext&formatversion=2&page=Template:Potd/' + y + '-' + pad(m) + '-' + pad(d))).parse.wikitext;
      const f = w.match(/Potd filename\|([^|}]+)/); if (!f) return; const name = f[1].trim();
      const j = await getJSON('https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query&prop=imageinfo&iiprop=url&iiurlwidth=360&titles=' + encodeURIComponent('File:' + name));
      const pg = Object.values(j.query.pages)[0], ii = pg && pg.imageinfo && pg.imageinfo[0];
      if (ii) out.photo = {url: ii.thumburl || ii.url, page: ii.descriptionurl, caption: name.replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')};
    })().catch(() => {})
  ]);
  if (out.headlines.length || out.releases.length || out.onair.length || out.events.length || out.song || out.film || out.photo) cache.set(key, out);
  return out;
}

// Catalog: scans of the printed mail-order books (JCPenney and Sears) from christmas.musetechnical.com, which
// serves them through an open JSON API. A page is one 750x1000 JPEG sent as base64; thumbnails are tiny.
const SCANS = 'https://christmas.musetechnical.com/202510/Catalogs.Api/api/';
export const SCANS_SITE = 'https://christmas.musetechnical.com/';
const SEASONS = ['Spring Summer', 'Fall Winter', 'Christmas'];
// the books of one year, as [{title, pages}]; Canadian editions are left out
export async function catalogsFor(year) {
  const key = 'scans-list1', hit = cache.get(key, 7 * DAY);
  const all = hit || await getJSON(SCANS + 'Catalogs?strCatalogFilter=empty', 30000);
  if (!hit) cache.set(key, all.map((c) => [c.catalogName, c.catalogPageCount]));
  return all.map((c) => (Array.isArray(c) ? c : [c.catalogName, c.catalogPageCount]))
    .filter(([n]) => n.indexOf(year + '-') === 0 && !/Canada/.test(n))
    .map(([n, pages]) => { const title = n.replace(/-/g, ' '); return {title, pages, brand: /Sears/.test(title) ? 'Sears' : 'JCPenney', season: SEASONS.find((s) => title.indexOf(s) >= 0) || ''}; })
    .sort((a, b) => SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season) || a.brand.localeCompare(b.brand));   // through the year; JCPenney before Sears
}
export async function catalogPage(title, n) {
  const j = await getJSON(SCANS + 'CatalogPageByCatalogNameAndCatalogPageNumber?strCatalogName=' + encodeURIComponent(title) + '&strCatalogPageNumber=' + n, 40000);
  if (!j || !j.pageImageData) throw new Error('No page');
  return 'data:image/jpeg;base64,' + j.pageImageData;
}
// small previews of pages start .. start+count-1, as {page number: data URL}
export async function catalogThumbs(title, start, count) {
  const j = await getJSON(SCANS + 'CatalogPages?strCatalogName=' + encodeURIComponent(title) + '&strPageStart=' + start + '&strPagesToGet=' + count, 40000);
  const out = {}; (j || []).forEach((p) => { const n = parseInt(p.pageImageName, 10); if (n && p.pageThumbnailImage) out[n] = 'data:image/jpeg;base64,' + p.pageThumbnailImage; });
  return out;
}

// ---- TV schedules: Wikipedia's network lineup tables for one school year (September to August), all six broadcast networks
async function wikiPage(title) {
  const url = 'https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&origin=*&page=' + encodeURIComponent(title);
  for (let i = 0; i < 2; i++) { try { const j = await getJSON(url, 30000); if (j.parse) return new DOMParser().parseFromString(j.parse.text, 'text/html'); } catch (e) { /* try once more */ } await new Promise((r) => setTimeout(r, 1500)); }
  return null;
}
export async function tvSchedule(year, month) {
  const sy = month >= 9 ? year : year - 1, key = 'tvs1:' + sy, hit = cache.get(key, 90 * DAY); if (hit) return hit;
  const yy = sy + '\u2013' + (sy + 1 === 2000 ? '2000' : String(sy + 1).slice(-2)), base = yy + ' United States network television schedule';
  const out = {};
  for (const [k, suf] of [['prime', ''], ['day', ' (daytime)'], ['late', ' (late night)']]) {
    const doc = await wikiPage(base + suf); out[k] = doc ? readSchedule(doc, k) : {};
  }
  if (!Object.keys(out.prime).length) throw new Error('No schedule');
  cache.set(key, out); return out;
}

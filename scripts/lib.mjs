import { TEAMS } from './teams.mjs';

// ---------- Feed parsing (RSS 2.0 and Atom, no dependencies) ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(s) {
  return decodeEntities(
    decodeEntities(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

function attr(block, tagName, attrName, where = '') {
  const re = new RegExp(`<${tagName}\\b[^>]*${where}[^>]*>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  const a = m[0].match(new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return a ? decodeEntities(a[1]) : '';
}

function cleanLink(url) {
  try {
    const u = new URL(url.trim());
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ex_cid|xid|cid$|src$|partner)/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return url.trim();
  }
}

function toDate(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function parseFeed(xml, sourceName) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let title = stripHtml(tag(b, 'title'));
    let link = stripHtml(tag(b, 'link')) || attr(b, 'link', 'href', 'rel=["\']alternate') || attr(b, 'link', 'href');
    if (!title || !link) continue;
    const summaryRaw = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content');
    const published = toDate(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const image =
      attr(b, 'media:content', 'url') ||
      attr(b, 'media:thumbnail', 'url') ||
      attr(b, 'enclosure', 'url', 'type=["\']image') ||
      (decodeEntities(summaryRaw).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] ||
      '';

    let source = sourceName;
    // Google News titles look like "Headline - Outlet"; credit the real outlet.
    if (sourceName === 'Google News') {
      const outlet = stripHtml(tag(b, 'source'));
      if (outlet) {
        source = outlet;
        title = title.replace(new RegExp(`\\s+-\\s+${outlet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
      }
    }

    let summary = stripHtml(summaryRaw);
    if (sourceName === 'Google News' || summary.startsWith(title)) summary = '';
    if (summary.length > 400) summary = summary.slice(0, 397).replace(/\s+\S*$/, '') + '…';

    items.push({ title, link: cleanLink(link), source, summary, published, image: image && /^https?:/.test(image) ? image : '' });
  }
  return items;
}

// ---------- Understanding a headline ----------

export function detectTeams(text) {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')} `;
  return TEAMS.filter((team) => team.words.some((w) => t.includes(` ${w} `))).map((team) => team.abbr);
}

const CATEGORIES = [
  ['Trades & Signings', /\b(trade[sd]?|trading|sign(s|ed|ing)?|contract|extension|re-?sign|agree[sds]?|deal|waive[sd]?|release[sd]?|cut[s]?|claim(s|ed)?|free agen\w*|acquire[sd]?|restructure[sd]?|franchise tag|holdout)\b/i],
  ['Injuries', /\b(injur\w*|torn|tear|acl|mcl|achilles|concussion|hamstring|ankle|knee|sprain\w*|fracture\w*|surgery|ir\b|injured reserve|out for (the )?season|questionable|doubtful|ruled out|carted|mri|day-to-day|week-to-week)\b/i],
  ['Coaching & Front Office', /\b(fire[sd]|hire[sd]?|hiring|head coach|coordinator|general manager|\bgm\b|interview(s|ed)?|resign(s|ed)?|step(s|ped)? down|promot(e|ed|es))\b/i],
  ['Discipline & Legal', /\b(suspend\w*|suspension|arrest\w*|charged|lawsuit|fine[sd]?|appeal|investigation|police|court)\b/i],
  ['Draft', /\b(draft|mock|prospect|combine|pick|rookie)\b/i],
  ['Games', /\b(beat[s]?|defeat\w*|win[s]?|won|loss|lose[s]?|rout\w*|comeback|overtime|takeaways|score|recap|playoff\w*|super bowl)\b/i],
];

export function categorize(text) {
  for (const [name, re] of CATEGORIES) if (re.test(text)) return name;
  return 'Around the League';
}

const BREAKING_STRONG = /\b(breaking|just in|developing)\b/i;
// Words that mean something actually happened (a move, an injury, a firing...).
const NEWS_EVENT =
  /\b(trade[sd]?|trading|agree[sd]? to|signs?|signed|re-signs?|releas(e|es|ed)|waive[sd]?|cuts?|fire[sd]?|hires?|hired|torn|tears|out for (the )?season|suspend\w*|arrest\w*|retir(e|es|ed|ing)|ruled out|carted off|placed on|injured reserve|extension|holdout|dies|died|passed away)\b/i;
// Words insiders use when they break news.
const INSIDER = /\b(sources?( say| tell)?|per sources?|source says|reportedly|expected to|will miss|informed|told)\b/i;
// Analysis and opinion pieces are not breaking news even if they mention trades or injuries.
const NOT_NEWS =
  /\b(rank\w*|mock|preview|predictions?|takeaways|grades?|power rankings|fantasy|odds|best bets|picks|film|podcast|mailbag|what we learned|winners and losers|overreactions?|quiz|debate|could|should|might|candidates|targets|ideas)\b/i;

export function breakingScore(title, summary = '') {
  let score = 0;
  if (BREAKING_STRONG.test(title)) score += 3;
  if (NEWS_EVENT.test(title)) score += 3;
  else if (NEWS_EVENT.test(summary)) score += 1;
  if (INSIDER.test(title)) score += 1;
  if (NOT_NEWS.test(title)) score -= 3;
  return Math.max(score, 0);
}

// ---------- Grouping the same story from different sites ----------

const STOP = new Set(
  'a an the and or but of to in on at for with from by as is are was were be been being it its this that these those he she they his her their him them who what when where why how will would could should can may might has have had do does did not no yes after before over into out up down about than then new nfl report reports reported per sources source says say week season game games team teams player players first last year years just more most amid vs'.split(' '),
);

export function tokens(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/['’]s\b/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function similarity(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return { shared, jaccard: union ? shared / union : 0 };
}

export function sameStory(a, b) {
  const { shared, jaccard } = similarity(a, b);
  return shared >= 2 && (jaccard >= 0.3 || shared >= 4);
}

// Groups items (newest first) into stories. A story is several articles about the same news.
export function clusterItems(items) {
  const clusters = [];
  const sorted = [...items].sort((x, y) => x.firstSeen - y.firstSeen);
  for (const item of sorted) {
    const tk = tokens(item.title);
    let home = null;
    for (const c of clusters) {
      if (Math.abs(item.time - c.lastTime) > 36 * 3600e3) continue;
      if (c.tokenSets.some((s) => sameStory(tk, s))) {
        home = c;
        break;
      }
    }
    if (!home) {
      home = { id: item.id, items: [], tokenSets: [], firstSeen: item.firstSeen, lastTime: item.time };
      clusters.push(home);
    }
    home.items.push(item);
    home.tokenSets.push(tk);
    home.lastTime = Math.max(home.lastTime, item.time);
  }

  return clusters
    .map((c) => {
      const byTime = [...c.items].sort((x, y) => y.time - x.time);
      const lead = [...c.items].sort((x, y) => y.score - x.score || x.firstSeen - y.firstSeen)[0];
      const sources = [...new Set(c.items.map((i) => i.source))];
      const text = c.items.map((i) => i.title).join(' ');
      const score = Math.max(...c.items.map((i) => i.score)) + Math.min(sources.length - 1, 3);
      return {
        id: c.id,
        headline: lead.title.replace(/^(breaking( news)?|just in|developing)\s*[:\-–—|]\s*/i, ''),
        summary: (c.items.find((i) => i.summary) || {}).summary || '',
        image: (c.items.find((i) => i.image) || {}).image || '',
        category: categorize(text),
        teams: [...new Set(c.items.flatMap((i) => i.teams))],
        sources,
        firstSeen: c.firstSeen,
        updated: c.lastTime,
        breaking: score >= 3,
        score,
        itemIds: byTime.map((i) => i.id),
      };
    })
    .sort((x, y) => y.updated - x.updated);
}

// ---------- Merging a fresh crawl into what we already had ----------

export function itemId(link) {
  let h = 5381;
  for (let i = 0; i < link.length; i++) h = ((h << 5) + h + link.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function mergeItems(previous, fresh, now, { keepHours = 72, maxItems = 600 } = {}) {
  const byId = new Map(previous.map((i) => [i.id, i]));
  const byTitle = new Map(previous.map((i) => [i.title.toLowerCase(), i]));
  const added = [];
  for (const f of fresh) {
    const id = itemId(f.link);
    if (byId.has(id) || byTitle.has(f.title.toLowerCase())) continue;
    // Feeds sometimes have missing or future dates; never trust a date later than now.
    const time = f.published && f.published <= now ? f.published : now;
    const item = { id, ...f, time, firstSeen: now, teams: detectTeams(`${f.title} ${f.summary}`), score: breakingScore(f.title, f.summary) };
    delete item.published;
    byId.set(id, item);
    byTitle.set(f.title.toLowerCase(), item);
    added.push(item);
  }
  const cutoff = now - keepHours * 3600e3;
  const items = [...byId.values()]
    .filter((i) => i.time >= cutoff)
    .sort((a, b) => b.time - a.time)
    .slice(0, maxItems);
  return { items, added };
}

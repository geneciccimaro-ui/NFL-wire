// Crawls every news feed plus the Eagles' schedule and live scores, merges it all
// into docs/news.json, and sends push alerts to the iPhone (via ntfy).
//
// Environment variables (all optional):
//   NTFY_TOPIC    secret topic name the iPhone's ntfy app is subscribed to
//   NTFY_SERVER   defaults to https://ntfy.sh
//   ALERT_LEAGUE  alerts for news about other teams: "major" (default), "all" or "none"
//   GAME_ALERTS   "on" (default) or "off": kickoff, every score, halftime, final
//   RUN_SECONDS   keep re-checking for this long (the GitHub job uses ~270)
//   POLL_SECONDS  time between checks while running (default 60)
//   PREVIOUS_URL  the live site's news.json, used to remember the last run
//   DRY_RUN=1     print alerts instead of sending them
import { readFile, writeFile } from 'node:fs/promises';
import { SOURCES, FOCUS } from './sources.mjs';
import { parseFeed, mergeItems, clusterItems, isAnalysis } from './lib.mjs';
import { fetchRosterNames, fetchTeamGames, gameAlerts } from './espn.mjs';

const OUT = new URL('../docs/news.json', import.meta.url);
const MAX_ALERTS_PER_CHECK = 5;
const ALERT_WINDOW_MS = 3 * 3600e3; // don't alert on stories older than this
const FOCUS_CATEGORIES = new Set(['Trades & Signings', 'Injuries', 'Coaching & Front Office', 'Discipline & Legal']);
const env = process.env;

async function fetchSource(src) {
  const res = await fetch(src.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NFLNewsTracker/1.0; personal use)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text(), src.name);
  if (!items.length) throw new Error('no articles found in feed');
  return src.team ? items.map((i) => ({ ...i, team: src.team })) : items;
}

// The last published news.json is the memory between runs (what's been seen and alerted).
async function loadPrevious() {
  if (env.PREVIOUS_URL) {
    try {
      const res = await fetch(`${env.PREVIOUS_URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.json();
      console.warn(`previous news.json: HTTP ${res.status}`);
    } catch (e) {
      console.warn('previous news.json:', e.message);
    }
  }
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

// How loudly to alert for a story (0 = no alert).
function storyAlertLevel(story, items) {
  const league = env.ALERT_LEAGUE || 'major';
  if (story.teams.includes(FOCUS.abbr)) {
    // Hyper-aware for the Eagles: any real news, not just "breaking" news.
    if (story.breaking) return 5;
    if (items.every((i) => isAnalysis(i.title))) return 0;
    if (story.score >= 1 || FOCUS_CATEGORIES.has(story.category) || story.sources.length >= 2) return 4;
    return 0;
  }
  if (league === 'none') return 0;
  if (league === 'all') return story.breaking ? 3 : 0;
  return story.breaking && (story.score >= 5 || story.sources.length >= 3) ? 3 : 0;
}

async function send({ title, message, click, priority }) {
  if (env.DRY_RUN || !env.NTFY_TOPIC) {
    console.log(`[alert p${priority}]`, title, '|', message);
    return;
  }
  const body = { topic: env.NTFY_TOPIC, title, message, priority, tags: ['football'] };
  if (click) body.click = click;
  const res = await fetch(env.NTFY_SERVER || 'https://ntfy.sh', { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!res.ok) console.warn(`ntfy failed: HTTP ${res.status}`);
}

async function check(prev, roster) {
  const now = Date.now();
  const [feedResults, gamesResult] = await Promise.all([
    Promise.allSettled(SOURCES.map(fetchSource)),
    fetchTeamGames(FOCUS, prev?.focus).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })),
  ]);

  const fresh = [];
  const sources = SOURCES.map((src, i) => {
    const r = feedResults[i];
    if (r.status === 'fulfilled') {
      fresh.push(...r.value);
      return { name: src.name, ok: true, count: r.value.length };
    }
    return { name: src.name, ok: false, error: String(r.reason?.message || r.reason) };
  });
  if (!gamesResult.ok) console.warn('ESPN schedule:', gamesResult.e.message);
  const focus = gamesResult.ok ? gamesResult.v : prev?.focus || { team: FOCUS.abbr, name: FOCUS.name, record: '', standing: '', games: [] };
  sources.push(gamesResult.ok ? { name: 'ESPN scores & schedule', ok: true, count: focus.games.length } : { name: 'ESPN scores & schedule', ok: false, error: gamesResult.e.message });

  const extraWords = { [FOCUS.abbr]: [...FOCUS.extraWords, ...roster] };
  const { items, added } = mergeItems(prev?.items || [], fresh, now, { extraWords });
  const stories = clusterItems(items);
  const byId = new Map(items.map((i) => [i.id, i]));

  const alerted = new Set(prev?.alerted || []);
  const gameAlerted = new Set(prev?.gameAlerted || []);
  const firstRun = !prev?.items?.length;
  const outgoing = [];

  // Game alerts: pregame, kickoff, every score, halftime, final.
  if ((env.GAME_ALERTS || 'on') !== 'off') {
    for (const a of gameAlerts(focus.games, gameAlerted, FOCUS, now)) {
      gameAlerted.add(a.key);
      if (!firstRun) outgoing.push(a);
    }
  }

  // News alerts, Eagles first.
  const addedIds = new Set(added.map((i) => i.id));
  const news = [];
  for (const s of stories) {
    if (alerted.has(s.id)) continue;
    if (firstRun || now - s.updated >= ALERT_WINDOW_MS) {
      alerted.add(s.id); // first run or too old: never alert on it
      continue;
    }
    if (!s.itemIds.some((id) => addedIds.has(id))) continue;
    const storyItems = s.itemIds.map((id) => byId.get(id)).filter(Boolean);
    const level = storyAlertLevel(s, storyItems);
    if (level) news.push({ s, level, lead: storyItems[0] });
  }
  news.sort((a, b) => b.level - a.level || b.s.score - a.s.score);
  for (const { s, level, lead } of news.slice(0, MAX_ALERTS_PER_CHECK)) {
    alerted.add(s.id);
    const tag = s.teams.includes(FOCUS.abbr) ? `🦅 ${s.breaking ? 'BREAKING' : FOCUS.short}` : `🏈 ${s.teams.join(' / ') || 'NFL'}`;
    outgoing.push({
      title: `${tag} · ${s.category}`,
      message: `${s.headline}\n— ${s.sources.slice(0, 3).join(', ')}`,
      click: lead?.link,
      priority: level,
    });
  }

  for (const a of outgoing) {
    try {
      await send(a);
    } catch (e) {
      console.warn('alert failed:', e.message);
    }
  }

  const liveIds = new Set(stories.map((s) => s.id));
  const gameIds = new Set(focus.games.map((g) => g.id));
  const out = {
    updated: now,
    sources,
    focus,
    stories,
    items,
    alerted: [...alerted].filter((id) => liveIds.has(id)),
    gameAlerted: [...gameAlerted].filter((k) => gameIds.has(k.split(':')[0])),
  };
  await writeFile(OUT, JSON.stringify(out));
  const down = sources.filter((s) => !s.ok).map((s) => s.name);
  console.log(`${new Date(now).toISOString()} ${fresh.length} fetched, ${added.length} new, ${stories.length} stories, ${outgoing.length} alerts${down.length ? `; down: ${down.join(', ')}` : ''}`);
  return out;
}

async function main() {
  let prev = await loadPrevious();
  const roster = await fetchRosterNames(FOCUS.espnId).catch((e) => {
    console.warn('roster:', e.message);
    return [];
  });
  console.log(`${roster.length} ${FOCUS.short} players on the roster`);

  const stopAt = Date.now() + Number(env.RUN_SECONDS || 0) * 1000;
  const pollMs = Number(env.POLL_SECONDS || 60) * 1000;
  for (;;) {
    const started = Date.now();
    prev = await check(prev, roster);
    const next = started + pollMs;
    if (next >= stopAt) break;
    await new Promise((r) => setTimeout(r, next - Date.now()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

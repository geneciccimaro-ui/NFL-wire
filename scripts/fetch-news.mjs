// Crawls every NFL news feed, merges the results into docs/news.json,
// and sends a push alert to the iPhone (via ntfy) for new breaking stories.
//
// Environment variables (all optional):
//   NTFY_TOPIC   secret topic name the iPhone's ntfy app is subscribed to
//   NTFY_SERVER  defaults to https://ntfy.sh
//   ALERT_TEAMS  e.g. "NYG,KC". When set, only those teams' breaking news
//                plus league-wide major news gets a push alert.
//   PREVIOUS_URL the live site's news.json, used to remember the last run
//   DRY_RUN=1    print alerts instead of sending them
import { readFile, writeFile } from 'node:fs/promises';
import { SOURCES } from './sources.mjs';
import { parseFeed, mergeItems, clusterItems } from './lib.mjs';

const OUT = new URL('../docs/news.json', import.meta.url);
const MAX_ALERTS_PER_RUN = 4;
const ALERT_WINDOW_MS = 3 * 3600e3; // don't alert on stories older than this

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
  return items;
}

// The last published news.json is the memory between runs (what's been seen and alerted).
async function loadPrevious() {
  if (process.env.PREVIOUS_URL) {
    try {
      const res = await fetch(`${process.env.PREVIOUS_URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
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

function wantsAlert(story, teams) {
  if (!teams.length) return true;
  return story.score >= 5 || story.teams.some((t) => teams.includes(t));
}

async function sendAlert(story, items) {
  const lead = items.find((i) => i.id === story.itemIds[0]) || items[0];
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  const body = {
    topic: process.env.NTFY_TOPIC,
    title: `🏈 ${story.teams.length ? story.teams.join(' / ') + ' · ' : ''}${story.category}`,
    message: `${story.headline}\n— ${story.sources.slice(0, 3).join(', ')}`,
    click: lead.link,
    priority: story.score >= 5 ? 5 : 4,
    tags: ['rotating_light'],
  };
  if (process.env.DRY_RUN || !body.topic) {
    console.log('[alert]', body.title, '|', story.headline);
    return;
  }
  const res = await fetch(server, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!res.ok) console.warn(`ntfy failed: HTTP ${res.status}`);
}

async function main() {
  const now = Date.now();
  const prev = await loadPrevious();

  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const fresh = [];
  const sources = SOURCES.map((src, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      fresh.push(...r.value);
      return { name: src.name, ok: true, count: r.value.length };
    }
    console.warn(`${src.name}: ${r.reason?.message || r.reason}`);
    return { name: src.name, ok: false, error: String(r.reason?.message || r.reason) };
  });

  const { items, added } = mergeItems(prev?.items || [], fresh, now);
  const stories = clusterItems(items);
  console.log(`${fresh.length} fetched, ${added.length} new, ${items.length} kept, ${stories.length} stories`);

  // Push alerts. Skip on the very first run so he doesn't get flooded.
  const alerted = new Set(prev?.alerted || []);
  if (prev?.items?.length) {
    const addedIds = new Set(added.map((i) => i.id));
    const teams = (process.env.ALERT_TEAMS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const candidates = stories
      .filter((s) => s.breaking && !alerted.has(s.id) && now - s.updated < ALERT_WINDOW_MS)
      .filter((s) => s.itemIds.some((id) => addedIds.has(id)))
      .filter((s) => wantsAlert(s, teams))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ALERTS_PER_RUN);
    for (const s of candidates) {
      try {
        await sendAlert(s, items.filter((i) => s.itemIds.includes(i.id)));
      } catch (e) {
        console.warn('alert failed:', e.message);
      }
      alerted.add(s.id);
    }
  } else {
    for (const s of stories) alerted.add(s.id);
  }

  // Also mark stories we chose not to alert on, so they don't alert later when another site picks them up.
  for (const s of stories) if (s.breaking && now - s.updated >= ALERT_WINDOW_MS) alerted.add(s.id);

  const liveIds = new Set(stories.map((s) => s.id));
  const out = {
    updated: now,
    sources,
    stories,
    items,
    alerted: [...alerted].filter((id) => liveIds.has(id)),
  };
  await writeFile(OUT, JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

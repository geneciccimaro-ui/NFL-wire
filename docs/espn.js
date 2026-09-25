// Turns ESPN's public scoreboard/schedule JSON into simple game objects.
// Shared by the crawler (Node) and the app (browser), so it has no dependencies.

export const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const num = (s) => {
  const v = s && typeof s === 'object' ? s.displayValue ?? s.value : s;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

export function parseGame(event, abbr) {
  const comp = event?.competitions?.[0];
  if (!comp?.competitors) return null;
  const us = comp.competitors.find((c) => c.team?.abbreviation === abbr);
  const them = comp.competitors.find((c) => c !== us);
  if (!us || !them) return null;
  const status = comp.status || event.status || {};
  const type = status.type || {};
  const state = type.state || 'pre'; // pre | in | post
  const b = comp.broadcasts?.[0];
  const sit = comp.situation || {};
  const g = {
    id: String(event.id),
    date: Date.parse(event.date || comp.date) || null,
    week: event.week?.text || (event.week?.number ? `Week ${event.week.number}` : ''),
    postseason: event.seasonType?.type === 3 || /post/i.test(event.seasonType?.name || ''),
    home: us.homeAway === 'home',
    opp: {
      abbr: them.team?.abbreviation || '',
      name: them.team?.shortDisplayName || them.team?.name || them.team?.displayName || '',
      full: them.team?.displayName || '',
      logo: them.team?.logo || them.team?.logos?.[0]?.href || '',
    },
    state,
    detail: type.shortDetail || type.detail || '',
    us: state === 'pre' ? null : num(us.score),
    them: state === 'pre' ? null : num(them.score),
    result: null,
    tv: b?.media?.shortName || b?.names?.[0] || '',
    venue: comp.venue?.fullName || '',
    lastPlay: sit.lastPlay?.text || '',
    downDistance: sit.downDistanceText || '',
    ourBall: sit.possession ? String(sit.possession) === String(us.team?.id ?? us.id) : null,
    redZone: !!sit.isRedZone,
  };
  if (state === 'post' && g.us !== null && g.them !== null) g.result = g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'T';
  return g;
}

export function parseSchedule(json, abbr) {
  const games = (json?.events || []).map((e) => parseGame(e, abbr)).filter(Boolean);
  return {
    record: json?.team?.recordSummary || '',
    standing: json?.team?.standingSummary || '',
    games,
  };
}

// The team's game on the current scoreboard, if any.
export function gameFromScoreboard(json, abbr) {
  for (const e of json?.events || []) {
    const g = parseGame(e, abbr);
    if (g) return g;
  }
  return null;
}

// Puts a fresher copy of a game (e.g. from the live scoreboard) into the schedule.
export function mergeGame(games, g) {
  if (!g) return games;
  const i = games.findIndex((x) => x.id === g.id);
  if (i === -1) return [...games, g].sort((a, b) => (a.date || 0) - (b.date || 0));
  const copy = [...games];
  copy[i] = { ...copy[i], ...g, week: g.week || copy[i].week, tv: g.tv || copy[i].tv };
  return copy;
}

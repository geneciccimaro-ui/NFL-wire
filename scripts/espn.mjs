// Schedule, live scores and roster for the focus team, from ESPN's public JSON API.
import { ESPN, parseSchedule, gameFromScoreboard, mergeGame } from '../docs/espn.js';

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLNewsTracker/1.0)' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Full names of everyone on the roster, e.g. ["jalen hurts", "a j brown", ...].
export async function fetchRosterNames(teamId) {
  const json = await getJSON(`${ESPN}/teams/${teamId}/roster`);
  const names = [];
  for (const group of json.athletes || []) {
    for (const p of group.items || [group]) if (p.fullName) names.push(p.fullName);
  }
  // Skip very short names that would match unrelated text.
  return names.filter((n) => n.replace(/\W/g, '').length >= 7);
}

export async function fetchTeamGames(focus, previous) {
  const [regular, post, board] = await Promise.allSettled([
    getJSON(`${ESPN}/teams/${focus.espnId}/schedule?seasontype=2`),
    getJSON(`${ESPN}/teams/${focus.espnId}/schedule?seasontype=3`),
    getJSON(`${ESPN}/scoreboard`),
  ]);
  if (regular.status === 'rejected' && board.status === 'rejected') throw regular.reason;

  const reg = regular.status === 'fulfilled' ? parseSchedule(regular.value, focus.abbr) : { games: [] };
  const pst = post.status === 'fulfilled' ? parseSchedule(post.value, focus.abbr) : { games: [] };
  let games = [...reg.games, ...pst.games.map((g) => ({ ...g, postseason: true }))];
  // If ESPN had a hiccup, keep the games we already knew about.
  if (!games.length && previous?.games) games = previous.games;
  // The scoreboard has the freshest live score, down & distance and last play.
  if (board.status === 'fulfilled') games = mergeGame(games, gameFromScoreboard(board.value, focus.abbr));
  games.sort((a, b) => (a.date || 0) - (b.date || 0));

  return {
    team: focus.abbr,
    name: focus.name,
    record: reg.record || previous?.record || '',
    standing: reg.standing || previous?.standing || '',
    games,
  };
}

const LEAD = 60 * 60e3; // pregame reminder this long before kickoff

// Works out which game alerts are due. Each alert has a key so it's only ever sent once.
export function gameAlerts(games, sentKeys, focus, now) {
  const alerts = [];
  const us = focus.short;
  for (const g of games) {
    const opp = g.opp.name || g.opp.abbr;
    const vs = g.home ? `vs ${opp}` : `at ${opp}`;
    const score = () => (g.us >= g.them ? `${us} ${g.us}, ${opp} ${g.them}` : `${opp} ${g.them}, ${us} ${g.us}`);
    const add = (key, title, message, priority = 4) => {
      if (!sentKeys.has(key)) alerts.push({ key, title, message, priority });
    };

    if (g.state === 'pre' && g.date && g.date - now <= LEAD && g.date > now - 10 * 60e3) {
      const time = new Date(g.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: focus.timeZone });
      add(`${g.id}:pregame`, `🦅 Game day: ${us} ${vs}`, `Kickoff at ${time} ET${g.tv ? ` on ${g.tv}` : ''}.`, 4);
    }

    if (g.state === 'in') {
      add(`${g.id}:kickoff`, `🏈 Kickoff! ${us} ${vs}`, g.tv ? `Watch on ${g.tv}.` : g.detail, 4);
      if (g.us !== null && (g.us > 0 || g.them > 0)) {
        const key = `${g.id}:score:${g.us}-${g.them}`;
        if (!sentKeys.has(key)) {
          const prev = [...sentKeys].filter((k) => k.startsWith(`${g.id}:score:`)).map((k) => k.split(':')[2].split('-').map(Number)).pop() || [0, 0];
          const ours = g.us - prev[0];
          const theirs = g.them - prev[1];
          let title = `🏈 ${score()}`;
          if (ours >= 6) title = `🦅 ${us.toUpperCase()} TOUCHDOWN! ${score()}`;
          else if (ours === 3) title = `🦅 ${us} field goal. ${score()}`;
          else if (ours === 2) title = `🦅 ${us} safety! ${score()}`;
          else if (theirs >= 6) title = `😬 ${opp} touchdown. ${score()}`;
          else if (theirs > 0) title = `${opp} score. ${score()}`;
          add(key, title, [g.detail, g.lastPlay].filter(Boolean).join(' · '), ours > 0 ? 5 : 4);
        }
      }
      if (/half/i.test(g.detail)) add(`${g.id}:half`, `⏸️ Halftime: ${score()}`, vs, 3);
    }

    if (g.state === 'post' && g.result && g.date > now - 12 * 3600e3) {
      const verb = g.result === 'W' ? 'WIN' : g.result === 'L' ? 'lose' : 'tie';
      const title = g.result === 'W' ? `🦅 FINAL: ${us.toUpperCase()} WIN! ${score()}` : `FINAL: ${us} ${verb}. ${score()}`;
      add(`${g.id}:final`, title, g.result === 'W' ? `${vs} · Fly ${us} Fly! 🦅` : vs, 5);
    }
  }
  return alerts;
}

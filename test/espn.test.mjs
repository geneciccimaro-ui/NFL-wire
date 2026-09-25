import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSchedule, gameFromScoreboard, mergeGame } from '../docs/espn.js';
import { gameAlerts } from '../scripts/espn.mjs';
import { FOCUS } from '../scripts/sources.mjs';
import { detectTeams } from '../scripts/lib.mjs';

const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

test('parses the schedule, record and results', () => {
  const s = parseSchedule(fx('espn-schedule.json'), 'PHI');
  assert.equal(s.record, '3-0');
  assert.equal(s.standing, '1st in NFC East');
  assert.equal(s.games.length, 2);
  const [w1, w3] = s.games;
  assert.deepEqual([w1.home, w1.opp.name, w1.us, w1.them, w1.result, w1.tv, w1.week], [true, 'Cowboys', 27, 20, 'W', 'FOX', 'Week 1']);
  assert.deepEqual([w3.home, w3.opp.abbr, w3.state, w3.us, w3.result], [false, 'NYG', 'pre', null, null]);
});

test('finds the live Eagles game on the scoreboard and merges it', () => {
  const live = gameFromScoreboard(fx('espn-scoreboard.json'), 'PHI');
  assert.deepEqual([live.id, live.state, live.us, live.them, live.ourBall, live.redZone], ['402', 'in', 14, 3, true, true]);
  assert.equal(live.lastPlay, 'Saquon Barkley 12 yd run');
  const games = mergeGame(parseSchedule(fx('espn-schedule.json'), 'PHI').games, live);
  assert.equal(games.length, 2);
  assert.equal(games[1].us, 14);
  assert.equal(games[1].week, 'Week 3');
});

test('game alerts fire once per event with the right wording', () => {
  const sent = new Set();
  const base = { id: '402', date: Date.parse('2026-09-27T20:25Z'), home: false, opp: { name: 'Giants', abbr: 'NYG' }, tv: 'CBS', lastPlay: '', detail: '' };
  const run = (g, now) => {
    const a = gameAlerts([{ ...base, ...g }], sent, FOCUS, now);
    a.forEach((x) => sent.add(x.key));
    return a.map((x) => x.title);
  };
  const t0 = base.date;
  assert.deepEqual(run({ state: 'pre', us: null, them: null }, t0 - 3 * 3600e3), []);
  assert.match(run({ state: 'pre', us: null, them: null }, t0 - 30 * 60e3)[0], /Game day: Eagles at Giants/);
  assert.deepEqual(run({ state: 'pre', us: null, them: null }, t0 - 20 * 60e3), []);
  assert.match(run({ state: 'in', us: 0, them: 0 }, t0 + 60e3)[0], /Kickoff/);
  assert.match(run({ state: 'in', us: 7, them: 0 }, t0 + 600e3)[0], /EAGLES TOUCHDOWN! Eagles 7, Giants 0/);
  assert.deepEqual(run({ state: 'in', us: 7, them: 0 }, t0 + 660e3), []);
  assert.match(run({ state: 'in', us: 7, them: 3 }, t0 + 900e3)[0], /Giants score\. Eagles 7, Giants 3/);
  assert.match(run({ state: 'in', us: 10, them: 3, detail: 'Halftime' }, t0 + 5400e3).join('|'), /field goal.*\|.*Halftime/);
  assert.match(run({ state: 'post', us: 24, them: 3, result: 'W' }, t0 + 12000e3)[0], /FINAL: EAGLES WIN! Eagles 24, Giants 3/);
  assert.deepEqual(run({ state: 'post', us: 24, them: 3, result: 'W' }, t0 + 12600e3), []);
});

test('tags Eagles news by player name even without the team name', () => {
  const extra = { PHI: [...FOCUS.extraWords, 'Jalen Hurts', 'A.J. Brown'] };
  assert.deepEqual(detectTeams('Jalen Hurts limited at practice', extra), ['PHI']);
  assert.deepEqual(detectTeams('AJ Brown fined for sideline outburst', extra), ['PHI']);
  assert.deepEqual(detectTeams('Hurts feelings in Dallas locker room', extra), ['DAL']);
  assert.deepEqual(detectTeams('A.J. Brown fined for sideline outburst', extra), ['PHI']);
  assert.deepEqual(detectTeams('Nick Sirianni on the bye week', extra), ['PHI']);
});

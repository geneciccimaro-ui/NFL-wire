import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed, mergeItems, clusterItems, detectTeams, categorize, breakingScore } from '../scripts/lib.mjs';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('parses RSS with CDATA, entities, images and tracking params', () => {
  const items = parseFeed(fx('rss.xml'), 'Test');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'BREAKING: Cowboys trade star WR to Bengals, per sources');
  assert.equal(items[0].link, 'https://example.com/cowboys-trade?id=7');
  assert.equal(items[0].image, 'https://example.com/a.jpg');
  assert.match(items[0].summary, /agreed to trade/);
  assert.equal(items[1].title, 'Chiefs beat Raiders 31–17 & stay unbeaten');
  assert.equal(items[1].image, 'https://example.com/b.jpg');
  assert.equal(items[1].published, Date.parse('2026-09-24T17:00:00Z'));
});

test('parses Atom', () => {
  const [item] = parseFeed(fx('atom.xml'), 'Atom');
  assert.equal(item.link, 'https://atom.example.com/cowboys-bengals-trade');
  assert.equal(item.summary, 'Dallas sends its star receiver to Cincinnati.');
});

test('credits the real outlet for Google News items', () => {
  const [item] = parseFeed(fx('google.xml'), 'Google News');
  assert.equal(item.source, 'The Athletic');
  assert.equal(item.title, 'Eagles QB out for season with torn ACL');
});

test('detects teams, categories and breaking news', () => {
  assert.deepEqual(detectTeams('Cowboys trade WR to Bengals'), ['CIN', 'DAL']);
  assert.deepEqual(detectTeams('Jets and Giants'), ['NYG', 'NYJ']);
  assert.equal(categorize('Eagles QB out for season with torn ACL'), 'Injuries');
  assert.equal(categorize('Cowboys trade WR to Bengals'), 'Trades & Signings');
  assert.ok(breakingScore('BREAKING: Cowboys trade star WR') >= 5);
  assert.equal(breakingScore('Ranking every uniform in the league'), 0);
});

test('merges without duplicates and groups the same story across sites', () => {
  const now = Date.parse('2026-09-24T20:00:00Z');
  const fresh = [...parseFeed(fx('rss.xml'), 'Test'), ...parseFeed(fx('atom.xml'), 'Atom'), ...parseFeed(fx('google.xml'), 'Google News')];
  const first = mergeItems([], fresh, now);
  assert.equal(first.added.length, 4);
  const second = mergeItems(first.items, fresh, now + 60000);
  assert.equal(second.added.length, 0);
  assert.equal(second.items.length, 4);

  const stories = clusterItems(second.items);
  assert.equal(stories.length, 3);
  const trade = stories.find((s) => s.category === 'Trades & Signings');
  assert.deepEqual(trade.sources.sort(), ['Atom', 'Test']);
  assert.ok(trade.breaking);
  assert.equal(trade.itemIds.length, 2);
  const game = stories.find((s) => s.category === 'Games');
  assert.equal(game.breaking, false);
});

test('drops items older than the retention window', () => {
  const now = Date.parse('2026-09-30T20:00:00Z');
  const { items } = mergeItems([], parseFeed(fx('rss.xml'), 'Test'), now);
  assert.equal(items.length, 0);
});

test('does not re-add articles that are already too old to keep', () => {
  const now = Date.parse('2026-09-30T20:00:00Z');
  const fresh = parseFeed(fx('rss.xml'), 'Test');
  const first = mergeItems([], fresh, now);
  const second = mergeItems(first.items, fresh, now + 60000);
  assert.equal(first.added.length, 0);
  assert.equal(second.added.length, 0);
});

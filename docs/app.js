import { ESPN, gameFromScoreboard, mergeGame } from './espn.js';

const FOCUS = { abbr: 'PHI', short: 'Eagles', name: 'Philadelphia Eagles' };
const SECTION_ORDER = ['Trades & Signings', 'Injuries', 'Coaching & Front Office', 'Discipline & Legal', 'Games', 'Draft', 'Around the League'];
const NEWS_REFRESH_MS = 60e3;
const LIVE_REFRESH_MS = 20e3; // during games, check the score this often

const $ = (sel) => document.querySelector(sel);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const state = {
  data: null,
  leagueFilter: 'all',
  eaglesFilter: 'all',
  sub: store.get('eaglesSub', 'news'),
  seenBefore: store.get('lastSeen', 0), // stories newer than this get a "new" dot
  open: new Set(),
  liveGame: null, // fresher score straight from ESPN, when the browser can reach it
  espnBlocked: false,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isFocus = (s) => s.teams.includes(FOCUS.abbr);

function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function itemsFor(story) {
  return story.itemIds.map((id) => state.data.itemsById.get(id)).filter(Boolean);
}

// ---------- Story cards (used by both feeds) ----------

function storyHTML(s) {
  const items = itemsFor(s);
  const cls = ['story', s.breaking && 'breaking', isFocus(s) && 'fav', s.firstSeen > state.seenBefore && 'unseen', state.open.has(s.id) && 'open']
    .filter(Boolean).join(' ');
  const src = s.sources.length > 1 ? `${esc(s.sources[0])} +${s.sources.length - 1} more` : esc(s.sources[0]);
  return `<li class="${cls}" data-id="${esc(s.id)}">
    <div class="meta">
      ${s.breaking ? '<span class="badge red">BREAKING</span>' : ''}
      ${s.teams.slice(0, 3).map((t) => `<span class="badge team">${esc(t)}</span>`).join('')}
      <span>${esc(s.category)} · ${ago(s.updated)} · ${src}</span>
    </div>
    <div class="headline">${esc(s.headline)}</div>
    ${s.summary ? `<div class="summary">${esc(s.summary)}</div>` : ''}
    <div class="links">${items
      .map((i) => `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.source)}: ${esc(i.title)} <small>${ago(i.time)}</small></a>`)
      .join('')}</div>
  </li>`;
}

const CHIPS = [
  ['all', 'All'],
  ['breaking', '🚨 Breaking'],
  ['cat:Injuries', 'Injuries'],
  ['cat:Trades & Signings', 'Moves'],
  ['cat:Coaching & Front Office', 'Coaches & GMs'],
  ['cat:Games', 'Games'],
];

function applyFilter(stories, f) {
  return stories.filter((s) => {
    if (f === 'breaking') return s.breaking;
    if (f.startsWith('cat:')) return s.category === f.slice(4);
    return true;
  });
}

function renderList(chipsEl, listEl, stories, filter, emptyText) {
  chipsEl.innerHTML = CHIPS.map(([k, label]) => `<button class="chip ${filter === k ? 'on' : ''}" data-filter="${esc(k)}">${esc(label)}</button>`).join('');
  const list = applyFilter(stories, filter).slice(0, 150);
  listEl.innerHTML = list.length ? list.map(storyHTML).join('') : `<li class="empty">${esc(emptyText)}</li>`;
}

// ---------- Eagles tab ----------

function games() {
  const g = state.data.focus?.games || [];
  return state.liveGame ? mergeGame(g, state.liveGame) : g;
}

function pickGames(list = games()) {
  const now = Date.now();
  return {
    live: list.find((g) => g.state === 'in'),
    next: list.find((g) => g.state === 'pre' && (g.date || 0) > now - 4 * 3600e3),
    last: [...list].reverse().find((g) => g.state === 'post'),
  };
}

const oppLabel = (g) => `${g.home ? 'vs' : '@'} ${g.opp.name || g.opp.abbr}`;
const scoreText = (g) => `${g.us}-${g.them}`;

function countdown(t) {
  const s = Math.max(0, Math.floor((t - Date.now()) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

function liveCard(g) {
  const eagles = { nm: FOCUS.short, pts: g.us, ball: g.ourBall === true };
  const opp = { nm: g.opp.name || g.opp.abbr, pts: g.them, ball: g.ourBall === false };
  const [left, right] = g.home ? [opp, eagles] : [eagles, opp];
  const side = (t, o) => `<div class="side ${t.pts > o.pts ? 'lead' : t.pts < o.pts ? 'trail' : ''}">
      <div class="nm">${esc(t.nm)} ${t.ball ? '<span class="ball">🏈</span>' : ''}</div><div class="pts">${t.pts ?? 0}</div></div>`;
  return `<div class="game">
    <div class="label"><span class="live">● LIVE</span><span>${esc(g.week)}${g.tv ? ` · ${esc(g.tv)}` : ''}</span></div>
    <div class="score">${side(left, right)}<div class="mid">${esc(g.detail)}</div>${side(right, left)}</div>
    ${g.downDistance ? `<div class="sit">${g.redZone ? '<span class="rz">RED ZONE</span> · ' : ''}${esc(g.downDistance)}</div>` : ''}
    ${g.lastPlay ? `<div class="play">Last play: ${esc(g.lastPlay)}</div>` : ''}
  </div>`;
}

function lastLine(g) {
  return g ? `<div class="last">Last game: <span class="result ${g.result}">${g.result} ${scoreText(g)}</span> ${esc(oppLabel(g))}</div>` : '';
}

function renderGameCard() {
  const { live, next, last } = pickGames();
  let html = '';
  if (live) html = liveCard(live);
  else if (next)
    html = `<div class="game">
      <div class="label"><span>Next game</span><span>${esc(next.week)}</span></div>
      <div class="next">${esc(oppLabel(next))}</div>
      <div class="when">${fmtDay(next.date)} · ${fmtTime(next.date)}${next.tv ? ` · ${esc(next.tv)}` : ''}</div>
      <div class="countdown" data-kickoff="${next.date}">Kickoff in ${countdown(next.date)}</div>
      ${lastLine(last)}
    </div>`;
  else if (last)
    html = `<div class="game"><div class="label"><span>Final</span><span>${esc(last.week)}</span></div>
      <div class="next"><span class="result ${last.result}">${last.result} ${scoreText(last)}</span> ${esc(oppLabel(last))}</div></div>`;
  $('#game-card').innerHTML = html;
}

function renderTeamHead() {
  const f = state.data.focus || {};
  $('#team-head').innerHTML = `<h1>🦅 ${esc(FOCUS.name)}</h1>
    ${f.record ? `<div class="rec"><b>${esc(f.record)}</b>${esc(f.standing || '')}</div>` : ''}`;
}

function renderSchedule() {
  const { live, next } = pickGames();
  const rows = games().map((g) => {
    const now = g === live || g === next;
    let res;
    if (g.state === 'post' && g.result) res = `<span class="result ${g.result}">${g.result} ${scoreText(g)}</span>`;
    else if (g.state === 'in') res = `<span class="result W">${scoreText(g)}</span><small>${esc(g.detail)}</small>`;
    else res = `${g.date ? fmtTime(g.date) : 'TBD'}<small>${esc(g.tv || '')}</small>`;
    return `<li class="${now ? 'now' : ''}">
      <span class="wk">${esc(g.postseason ? 'Playoffs' : g.week.replace('Week ', 'Wk '))}</span>
      <span class="opp">${esc(oppLabel(g))}<small>${g.date ? fmtDay(g.date) : 'Date TBD'}</small></span>
      <span class="res">${res}</span>
    </li>`;
  });
  $('#schedule').innerHTML = rows.length ? rows.join('') : '<li class="empty">Schedule not loaded yet.</li>';
}

function renderEagles() {
  renderTeamHead();
  renderGameCard();
  document.querySelectorAll('#eagles-seg button').forEach((b) => b.classList.toggle('on', b.dataset.sub === state.sub));
  $('#eagles-news').hidden = state.sub !== 'news';
  $('#eagles-schedule').hidden = state.sub !== 'schedule';
  renderList($('#eagles-chips'), $('#eagles-feed'), state.data.stories.filter(isFocus), state.eaglesFilter, 'No Eagles news in this category right now.');
  renderSchedule();
}

// ---------- Briefing tab: everything written up as one article, Eagles first ----------

function renderBrief() {
  const now = Date.now();
  let recent = state.data.stories.filter((s) => now - s.updated < 24 * 3600e3);
  if (recent.length < 5) recent = state.data.stories.slice(0, 40);
  if (!recent.length) {
    $('#brief').innerHTML = '<p class="empty">No news yet. Check back soon.</p>';
    return;
  }
  const weight = (s) => s.score + s.sources.length + (isFocus(s) ? 4 : 0);
  const lead = [...recent].sort((a, b) => weight(b) - weight(a) || b.updated - a.updated)[0];
  const used = new Set([lead.id]);

  const cite = (s) => `<span class="cite">— ${itemsFor(s).slice(0, 4).map((i) => `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.source)}</a>`).join(', ')}</span>`;
  const para = (s) => {
    used.add(s.id);
    const body = s.summary && s.summary !== s.headline ? ` ${esc(s.summary)}` : '';
    return `<p>${s.breaking ? '🚨 ' : ''}<b>${esc(s.headline)}.</b>${body} ${cite(s)}</p>`;
  };

  const { live, next, last } = pickGames();
  const gameBits = [];
  if (live) gameBits.push(`<b>Live now:</b> ${FOCUS.short} ${live.us}, ${esc(live.opp.name)} ${live.them} (${esc(live.detail)}).`);
  if (last && !live) gameBits.push(`<b>Last game:</b> ${last.result === 'W' ? 'Beat' : last.result === 'L' ? 'Lost to' : 'Tied'} the ${esc(last.opp.name)} ${scoreText(last)}.`);
  if (next && !live) gameBits.push(`<b>Next up:</b> ${esc(oppLabel(next))}, ${fmtDay(next.date)} at ${fmtTime(next.date)}${next.tv ? ` on ${esc(next.tv)}` : ''}.`);
  const f = state.data.focus || {};
  if (f.record) gameBits.push(`<b>Record:</b> ${esc(f.record)}${f.standing ? `, ${esc(f.standing)}` : ''}.`);

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  let html = `<div class="dateline">Eagles Wire · ${esc(date)} · Updated ${esc(fmtTime(state.data.updated))}</div>
    <h1>${esc(lead.headline)}</h1>
    ${lead.summary ? `<p class="dek">${esc(lead.summary)}</p>` : ''}
    ${lead.image ? `<img class="lead" src="${esc(lead.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
    <p class="cite">Reported by ${itemsFor(lead).map((i) => `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.source)}</a>`).join(', ')}</p>`;

  if (gameBits.length) html += `<h2>🦅 Eagles report</h2><p>${gameBits.join(' ')}</p>`;
  const eagles = recent.filter((s) => !used.has(s.id) && isFocus(s)).slice(0, 10);
  if (eagles.length) html += `<h2>🦅 Eagles news</h2>${eagles.map(para).join('')}`;

  const league = recent.filter((s) => !used.has(s.id));
  const breaking = league.filter((s) => s.breaking).slice(0, 5);
  if (breaking.length) html += `<h2>Breaking around the league</h2>${breaking.map(para).join('')}`;
  for (const cat of SECTION_ORDER) {
    const inCat = league.filter((s) => !used.has(s.id) && s.category === cat).slice(0, 5);
    if (inCat.length) html += `<h2>${esc(cat)}</h2>${inCat.map(para).join('')}`;
  }
  $('#brief').innerHTML = html;
}

// ---------- Settings tab ----------

function renderSources() {
  $('#sources').innerHTML = state.data.sources
    .map((s) => `<li><span>${esc(s.name)}</span>${s.ok ? `<span class="ok">✓ ${s.count}</span>` : `<span class="bad" title="${esc(s.error)}">✗ down</span>`}</li>`)
    .join('');
}

// ---------- Loading & wiring ----------

function render() {
  if (!state.data) return;
  renderEagles();
  renderList($('#league-chips'), $('#feed'), state.data.stories, state.leagueFilter, 'Nothing here right now.');
  renderBrief();
  renderSources();

  const freshEagles = state.data.stories.filter((s) => isFocus(s) && s.firstSeen > state.seenBefore).length;
  const { live } = pickGames();
  document.title = live ? `${live.us}-${live.them} · Eagles Wire` : freshEagles ? `(${freshEagles}) Eagles Wire` : 'Eagles Wire';

  const status = $('#status');
  if (!state.data.updated) {
    status.textContent = 'Waiting for the first news check…';
    return;
  }
  const age = Date.now() - state.data.updated;
  status.textContent = `Checked all sites ${ago(state.data.updated)}`;
  status.classList.toggle('warn', age > 30 * 60e3);
  if (age > 30 * 60e3) status.textContent += '. The news checker may be paused.';
}

async function loadNews() {
  const btn = $('#refresh');
  btn.classList.add('spin');
  try {
    const res = await fetch(`news.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    data.itemsById = new Map(data.items.map((i) => [i.id, i]));
    data.focus ||= { games: [] };
    state.data = data;
    render();
  } catch {
    $('#status').textContent = navigator.onLine ? "Couldn't load news. Tap ↻ to try again." : "You're offline.";
    $('#status').classList.add('warn');
  } finally {
    btn.classList.remove('spin');
  }
}

// During games, get the score straight from ESPN for faster updates.
async function loadLiveScore() {
  if (state.espnBlocked || !state.data) return;
  const { live, next } = pickGames(state.data.focus.games);
  const soon = next && next.date - Date.now() < 30 * 60e3;
  if (!live && !soon && !state.liveGame) return;
  try {
    const res = await fetch(`${ESPN}/scoreboard?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    state.liveGame = gameFromScoreboard(await res.json(), FOCUS.abbr);
    render();
  } catch {
    state.espnBlocked = true; // fall back to the news checker's scores
  }
}

function tickCountdown() {
  const el = document.querySelector('[data-kickoff]');
  if (el) el.textContent = `Kickoff in ${countdown(Number(el.dataset.kickoff))}`;
}

function init() {
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${b.dataset.view}`));
    window.scrollTo(0, 0);
  });

  $('#eagles-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]');
    if (!b) return;
    state.sub = b.dataset.sub;
    store.set('eaglesSub', state.sub);
    render();
  });

  $('#eagles-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-filter]');
    if (c) { state.eaglesFilter = c.dataset.filter; render(); }
  });
  $('#league-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-filter]');
    if (c) { state.leagueFilter = c.dataset.filter; render(); }
  });

  const toggleStory = (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('.story');
    if (!li) return;
    const id = li.dataset.id;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    li.classList.toggle('open');
  };
  $('#feed').addEventListener('click', toggleStory);
  $('#eagles-feed').addEventListener('click', toggleStory);

  $('#refresh').addEventListener('click', () => loadNews().then(loadLiveScore));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      state.seenBefore = store.get('lastSeen', 0);
      loadNews().then(loadLiveScore);
    } else {
      store.set('lastSeen', Date.now());
    }
  });
  window.addEventListener('pagehide', () => store.set('lastSeen', Date.now()));

  loadNews().then(loadLiveScore);
  setInterval(() => document.visibilityState === 'visible' && loadNews(), NEWS_REFRESH_MS);
  setInterval(() => document.visibilityState === 'visible' && loadLiveScore(), LIVE_REFRESH_MS);
  setInterval(tickCountdown, 1000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();

'use strict';

const TEAMS = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers',
  SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
};
const SECTION_ORDER = ['Trades & Signings', 'Injuries', 'Coaching & Front Office', 'Discipline & Legal', 'Games', 'Draft', 'Around the League'];
const REFRESH_MS = 60 * 1000;

const $ = (sel) => document.querySelector(sel);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const state = {
  data: null,
  filter: 'all',
  fav: store.get('favTeam', ''),
  seenBefore: store.get('lastSeen', 0), // stories newer than this get a "new" dot
  open: new Set(),
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function itemsFor(story) {
  const byId = state.data.itemsById;
  return story.itemIds.map((id) => byId.get(id)).filter(Boolean);
}

// ---------- Latest tab ----------

function chipList() {
  const chips = [['all', 'All'], ['breaking', '🚨 Breaking']];
  if (state.fav) chips.push([`team:${state.fav}`, `⭐ ${TEAMS[state.fav].split(' ').pop()}`]);
  chips.push(['cat:Trades & Signings', 'Trades & Signings'], ['cat:Injuries', 'Injuries'], ['cat:Coaching & Front Office', 'Coaches & GMs'], ['cat:Games', 'Games']);
  return chips;
}

function renderChips() {
  $('#team-chips').innerHTML = chipList()
    .map(([key, label]) => `<button class="chip ${state.filter === key ? 'on' : ''}" data-filter="${esc(key)}">${esc(label)}</button>`)
    .join('');
}

function filtered() {
  const f = state.filter;
  return state.data.stories.filter((s) => {
    if (f === 'breaking') return s.breaking;
    if (f.startsWith('team:')) return s.teams.includes(f.slice(5));
    if (f.startsWith('cat:')) return s.category === f.slice(4);
    return true;
  });
}

function storyHTML(s) {
  const items = itemsFor(s);
  const cls = ['story', s.breaking && 'breaking', state.fav && s.teams.includes(state.fav) && 'fav', s.firstSeen > state.seenBefore && 'unseen', state.open.has(s.id) && 'open']
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
      .map((i) => `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.source)} — ${esc(i.title)} <small>${ago(i.time)}</small></a>`)
      .join('')}</div>
  </li>`;
}

function renderFeed() {
  const list = filtered().slice(0, 150);
  $('#feed').innerHTML = list.length ? list.map(storyHTML).join('') : '<li class="empty">Nothing here right now.</li>';
}

// ---------- Briefing tab: everything written up as one article ----------

function renderBrief() {
  const now = Date.now();
  let recent = state.data.stories.filter((s) => now - s.updated < 24 * 3600e3);
  if (recent.length < 5) recent = state.data.stories.slice(0, 40);
  if (!recent.length) {
    $('#brief').innerHTML = '<p class="empty">No news yet. Check back soon.</p>';
    return;
  }
  const weight = (s) => s.score + s.sources.length + (state.fav && s.teams.includes(state.fav) ? 3 : 0);
  const lead = [...recent].sort((a, b) => weight(b) - weight(a) || b.updated - a.updated)[0];
  const rest = recent.filter((s) => s !== lead);
  const used = new Set([lead.id]);

  const cite = (s) => {
    const links = itemsFor(s).slice(0, 4).map((i) => `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.source)}</a>`);
    return `<span class="cite">— ${links.join(', ')}</span>`;
  };
  const para = (s) => {
    used.add(s.id);
    const body = s.summary && s.summary !== s.headline ? ` ${esc(s.summary)}` : '';
    return `<p>${s.breaking ? '🚨 ' : ''}<b>${esc(s.headline)}.</b>${body} ${cite(s)}</p>`;
  };

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const time = new Date(state.data.updated).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  let html = `<div class="dateline">NFL Wire · ${esc(date)} · Updated ${esc(time)}</div>
    <h1>${esc(lead.headline)}</h1>
    ${lead.summary ? `<p class="dek">${esc(lead.summary)}</p>` : ''}
    ${lead.image ? `<img class="lead" src="${esc(lead.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
    <p class="cite">Reported by ${itemsFor(lead).map((i) => `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.source)}</a>`).join(', ')}</p>`;

  const breaking = rest.filter((s) => s.breaking).slice(0, 5);
  if (breaking.length) html += `<h2>Breaking right now</h2>${breaking.map(para).join('')}`;

  if (state.fav) {
    const mine = rest.filter((s) => !used.has(s.id) && s.teams.includes(state.fav)).slice(0, 6);
    if (mine.length) html += `<h2>${esc(TEAMS[state.fav])}</h2>${mine.map(para).join('')}`;
  }

  for (const cat of SECTION_ORDER) {
    const inCat = rest.filter((s) => !used.has(s.id) && s.category === cat).slice(0, 6);
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

function setupSettings() {
  const sel = $('#fav-team');
  sel.innerHTML += Object.entries(TEAMS).sort((a, b) => a[1].localeCompare(b[1]))
    .map(([abbr, name]) => `<option value="${abbr}">${esc(name)}</option>`).join('');
  sel.value = state.fav;
  sel.addEventListener('change', () => {
    state.fav = sel.value;
    store.set('favTeam', state.fav);
    if (state.filter.startsWith('team:')) state.filter = 'all';
    render();
  });
}

// ---------- Loading & wiring ----------

function render() {
  if (!state.data) return;
  renderChips();
  renderFeed();
  renderBrief();
  renderSources();
  const fresh = state.data.stories.filter((s) => s.firstSeen > state.seenBefore).length;
  document.title = fresh ? `(${fresh}) NFL Wire` : 'NFL Wire';
  const status = $('#status');
  if (!state.data.updated) {
    status.textContent = 'Waiting for the first news crawl…';
    return;
  }
  const age = Date.now() - state.data.updated;
  status.textContent = `Checked all sites ${ago(state.data.updated)}`;
  status.classList.toggle('warn', age > 30 * 60e3);
  if (age > 30 * 60e3) status.textContent += ' — the news crawler may be paused';
}

async function load() {
  const btn = $('#refresh');
  btn.classList.add('spin');
  try {
    const res = await fetch(`news.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    data.itemsById = new Map(data.items.map((i) => [i.id, i]));
    state.data = data;
    render();
  } catch (e) {
    $('#status').textContent = navigator.onLine ? "Couldn't load news. Tap ↻ to try again." : "You're offline.";
    $('#status').classList.add('warn');
  } finally {
    btn.classList.remove('spin');
  }
}

function markSeen() {
  store.set('lastSeen', Date.now());
}

function init() {
  setupSettings();

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${b.dataset.view}`));
    window.scrollTo(0, 0);
  });

  $('#team-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-filter]');
    if (!c) return;
    state.filter = c.dataset.filter;
    render();
  });

  $('#feed').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('.story');
    if (!li) return;
    const id = li.dataset.id;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    li.classList.toggle('open');
  });

  $('#refresh').addEventListener('click', load);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      state.seenBefore = store.get('lastSeen', 0);
      load();
    } else {
      markSeen();
    }
  });
  window.addEventListener('pagehide', markSeen);

  load();
  setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();

# 🦅 Eagles Wire

A breaking-news tracker for an iPhone, built around the **Philadelphia Eagles** and also covering the rest of the NFL.

About once a minute it checks Eagles-only and league-wide NFL news sources (including ESPN, NFL.com, SI and the Philly papers through Google News), plus ESPN's live scores and schedule. Then it:

- **Buzzes his phone for every real Eagles story**, not just the huge ones: signings, cuts, injuries, practice reports, coaching news. It recognizes Eagles stories even when the headline only names a player ("Jalen Hurts limited at practice"), because it loads the current roster automatically.
- **Covers game day:** a reminder 1 hour before kickoff, then kickoff, **every score** ("🦅 EAGLES TOUCHDOWN! Eagles 14, Giants 3"), halftime and the final.
- **Sends only the biggest news from around the league** (a Cowboys blockbuster trade, a star's season-ending injury) so the Eagles alerts don't get drowned out.
- **Has an app with four tabs:**
  - **🦅 Eagles:** record and division standing, a live scoreboard during games (score, quarter and clock, who has the ball, down and distance, red zone, last play), a kickoff countdown between games, Eagles-only news with filters (Breaking, Injuries, Moves, Coaches), and the full **schedule** with results.
  - **🏈 League:** all NFL news, newest first. When several sites cover the same story, they're combined into one card.
  - **📰 Briefing:** everything written up as one news article, Eagles first: the game report, then Eagles news, then the rest of the league.
  - **⚙️ Settings:** how to turn on alerts, plus which news sites are working right now.

Opinion and analysis pieces (power rankings, mock drafts, previews, "5 things to watch", fantasy, odds) show up in the app but never buzz his phone.

It's free to run: GitHub runs the checker and hosts the app, and the free **ntfy** app delivers the alerts.

```
GitHub Actions (checks about once a minute)   iPhone
┌───────────────────────────────────┐         ┌──────────────────────────────┐
│ scripts/fetch-news.mjs            │  push   │ ntfy app  → 🔔 alerts         │
│  • Eagles + NFL news sources      ├────────▶│                              │
│  • ESPN schedule, live score,     │         │ Eagles Wire (home screen app)│
│    roster                         │  web    │  🦅 Eagles  🏈 League         │
│  • merge duplicate stories        ├────────▶│  📰 Briefing  ⚙️ Settings     │
│  • decide what's worth an alert   │         │                              │
└───────────────────────────────────┘         └──────────────────────────────┘
```

---

## One-time setup (about 10 minutes, done by a parent on a computer)

### 1. Make the repository public
GitHub gives public repositories free web hosting and unlimited automation minutes. A private repository would use up the free monthly minutes within a few days, because the checker runs almost nonstop. The repository holds only code, nothing personal.

**Settings → General → scroll to "Danger Zone" → Change visibility → Public.**

### 2. Turn on the website
**Settings → Pages → Build and deployment → Source: "GitHub Actions".**

### 3. Choose a secret alert channel name
Make up a hard-to-guess name, such as `eagles-wire-jk-83kd92hs`. Anyone who knows the name can read the alerts, so don't use something obvious.

**Settings → Secrets and variables → Actions → New repository secret**
- Name: `NTFY_TOPIC`
- Secret: the name you chose

### 4. Start it
**Actions tab → "Check Eagles & NFL news" → Run workflow.** After that it runs on its own.

The app's address will be `https://<your-github-username>.github.io/jack/`. It's also listed under Settings → Pages.

### Optional settings
Add these under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Values | What it does |
|---|---|---|
| `ALERT_LEAGUE` | `major` (default), `all`, `none` | Alerts for news about other teams |
| `GAME_ALERTS` | `on` (default), `off` | Kickoff, score, halftime and final alerts |
| `POLL_SECONDS` | `60` (default) | How often each job checks everything |

---

## On your son's iPhone

1. **Install the app:** open the address above in **Safari**, tap **Share** (the square with an arrow), then **Add to Home Screen**. It opens full screen like a normal app.
2. **Turn on alerts:** install [**ntfy**](https://apps.apple.com/app/ntfy/id1625396347) from the App Store. Tap **+**, type the channel name from step 3, and allow notifications. Tapping an alert opens the article.

---

## Good to know

- **How fast is it?**
  - **News:** it checks about once a minute, so an alert usually arrives 1 to 3 minutes after a story goes up on the first site to cover it. GitHub occasionally starts jobs late when it's busy, which can add a few minutes.
  - **Scores:** score alerts arrive within about a minute of ESPN updating.
  - **The app while open:** if his phone can reach ESPN directly, the Eagles tab refreshes the score every 20 seconds during games. Otherwise it updates every few minutes.
- **What gets an alert?**
  - **Eagles:** anything that's real news: moves, injuries, coaching, discipline, anything labeled breaking, or a story that several sites are reporting.
  - **Other teams:** only major breaking news.
  - **Limit:** at most 5 alerts per check. Eagles alerts always go first.
  - The rules are in `scripts/fetch-news.mjs` (`storyAlertLevel`) and `scripts/lib.mjs`.
- **Adding or removing a news site:** edit `scripts/sources.mjs`. Put `team: 'PHI'` on sites that only cover the Eagles. The app's Settings screen shows which sites are working (✓) and which are down (✗). A broken site is skipped and never stops the others.
- **Switching to a different team:** change `FOCUS` in `scripts/sources.mjs` and `FOCUS` at the top of `docs/app.js`.
- **If it stops updating:** the app shows "the news checker may be paused." GitHub pauses scheduled jobs after 60 days without repository activity and sends an email about it. Click the link in that email, or go to Actions → Check Eagles & NFL news → Enable workflow.

## For developers

```sh
npm test                                          # run the tests
DRY_RUN=1 node scripts/fetch-news.mjs             # check once for real, print alerts instead of sending them
DRY_RUN=1 RUN_SECONDS=300 node scripts/fetch-news.mjs  # keep checking every minute for 5 minutes
npx http-server docs                              # view the app at http://localhost:8080
```

No dependencies: Node 22 and plain HTML/CSS/JS. Scores and schedules come from ESPN's public JSON API (`docs/espn.js` reads it, and the same code runs in both the checker and the app).

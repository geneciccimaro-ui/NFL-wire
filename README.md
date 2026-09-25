# 🏈 NFL Wire

Breaking NFL news for an iPhone. Every 5 minutes it checks ESPN, NFL.com, ProFootballTalk, Pro Football Rumors, CBS Sports, Yahoo, SI, Bleacher Report, The Ringer, and Google News. It then:

- **Sends a push alert** to the iPhone when a real breaking story appears (trades, signings, cuts, big injuries, firings, suspensions).
- **Shows one feed, newest first.** When several sites cover the same story, they're combined into one card. Tap the card to see every site's article.
- **Writes a Briefing,** a single page that reads like a news article: the top story, what's breaking right now, your team, then trades, injuries, coaching, games, and the draft.

It's free to run: GitHub runs the crawler and hosts the app, and the free **ntfy** app delivers the alerts.

```
GitHub Actions (every 5 min)            iPhone
┌────────────────────────────┐         ┌──────────────────────────────┐
│ scripts/fetch-news.mjs     │  push   │ ntfy app  → 🔔 alert          │
│  • read ~10 news feeds     ├────────▶│                              │
│  • merge duplicate stories │         │ NFL Wire (home screen app)   │
│  • flag breaking news      │  web    │  • Latest  • Briefing        │
│  • publish news.json       ├────────▶│  • Settings (favorite team)  │
└────────────────────────────┘         └──────────────────────────────┘
```

---

## One-time setup (about 10 minutes, done by a parent on a computer)

### 1. Make the repository public
GitHub gives public repositories free web hosting and unlimited automation minutes. A private repository would use up the free monthly minutes within a few days, because this runs every 5 minutes. The repository holds only code, nothing personal.

**Settings → General → scroll to "Danger Zone" → Change visibility → Public.**

### 2. Turn on the website
**Settings → Pages → Build and deployment → Source: "GitHub Actions".**

### 3. Choose a secret alert channel name
Make up a hard-to-guess name, such as `nfl-wire-jk-83kd92hs`. Anyone who knows the name can read the alerts, so don't use something obvious.

**Settings → Secrets and variables → Actions → New repository secret**
- Name: `NTFY_TOPIC`
- Secret: the name you chose

*(Optional)* To get push alerts only for certain teams, open the **Variables** tab and add `ALERT_TEAMS` with team abbreviations, for example `NYG,KC`. Huge league-wide news still comes through either way. Leave this out to get every breaking story.

### 4. Start it
**Actions tab → "Crawl NFL news" → Run workflow.** After about a minute, it runs by itself every 5 minutes.

The app's address will be `https://<your-github-username>.github.io/jack/`. It's also listed under Settings → Pages.

---

## On your son's iPhone

1. **Install the app:** open the address above in **Safari**, tap **Share** (the square with an arrow), then **Add to Home Screen**. It opens full screen like a normal app.
2. **Turn on alerts:** install [**ntfy**](https://apps.apple.com/app/ntfy/id1625396347) from the App Store. Tap **+**, type the channel name from step 3, and allow notifications. Tapping an alert opens the article.
3. **Pick his team:** in NFL Wire, go to **Settings → My team**. His team's stories get a gold outline, their own filter button, and their own section in the Briefing.

---

## Good to know

- **How fast is it?** GitHub runs the check every 5 minutes, but it's sometimes a few minutes late when GitHub is busy. Most alerts arrive within 5 to 15 minutes of a story going up on the first site that covers it. For truly instant alerts (under a minute), the same script could later run on a paid always-on server.
- **What counts as "breaking"?** Headlines about something that actually happened (traded, signed, released, fired, torn ACL, out for season, suspended...) or labeled "BREAKING". The score goes up when an insider says "per sources" and when several sites report the same story. Rankings, mock drafts, previews, fantasy, and odds articles never trigger alerts. The rules are in `scripts/lib.mjs`.
- **Too many or too few alerts?** At most 4 alerts go out per run. Use `ALERT_TEAMS` to narrow them to certain teams, or edit the word lists in `scripts/lib.mjs`.
- **Adding or removing a news site:** edit `scripts/sources.mjs`. The app's Settings screen shows which sites are working (✓) and which are down (✗). A broken site is skipped and never stops the others.
- **If it stops updating:** the app shows "the news crawler may be paused." GitHub pauses scheduled jobs after 60 days without repository activity and sends an email about it. Click the link in that email, or go to Actions → Crawl NFL news → Enable workflow.

## For developers

```sh
node --test test/*.test.mjs          # run the tests
DRY_RUN=1 node scripts/fetch-news.mjs  # crawl for real, print alerts instead of sending them
npx http-server docs                   # view the app at http://localhost:8080
```

No dependencies: Node 22 and plain HTML/CSS/JS.

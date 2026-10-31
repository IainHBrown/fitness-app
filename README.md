# Fitness

A personal health & fitness tracker that runs as an installable web app (PWA) on iPhone.
Single user, no login, no paid services. All data stays on the phone (IndexedDB).

## Build stages

| Stage | What | Status |
|---|---|---|
| 1 | Today tab: sleep, body weight, water, food, supplements, daily reset; Food tab; core Settings | ✅ Done |
| 2 | Workouts: lifting plan, logging, progressive overload engine, running, workout streak | ✅ Done |
| 3 | Progress tab charts, per-exercise strength chart | ✅ Done |
| 4 | Export/import backup, food list in Settings, polish | ✅ Done |
| 5 | Smart lock-screen notifications (Cloudflare Worker) | ✅ Built (needs Cloudflare setup) |

## Run it locally (on your Mac)

No build step, no installs. From this folder:

```bash
python3 tools/serve.py
```

Then open http://localhost:8123. The dev server turns off caching so edits show on reload.

Use Safari or Chrome's responsive/mobile view to get a phone-sized window.

> Service workers (offline mode) only run on `localhost` or HTTPS. To test offline mode and
> home-screen install on the iPhone itself, deploy to GitHub Pages (below).

## Deploy to GitHub Pages (free)

1. Create a new repository on GitHub, e.g. `fitness-app` (public, so Pages is free).
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Fitness app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/fitness-app.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   choose **main** and **/ (root)**, then **Save**.
4. After a minute the app is live at `https://YOUR-USERNAME.github.io/fitness-app/`.

All paths in the app are relative, so it works from that sub-folder without changes.

### Pushing updates

Commit and push as usual. The app serves its cached copy instantly and fetches the new
version in the background. When you bump `VERSION` in `sw.js` (e.g. `'v4'` → `'v5'`), the app
shows an **App updated · Reload** prompt the next time it's open. Without a bump, changes still
arrive, just one launch later.

## Install on your iPhone

1. Open the GitHub Pages URL in **Safari** (it must be Safari).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch it from the home-screen icon. It opens full screen like a native app and works offline.

**About your data:** it lives only on your phone, inside the installed app.
Removing the app from the home screen deletes its data, so back up before reinstalling or
switching phones.

## Backup & restore

Settings → **Backup**:

- **Export backup** opens the iPhone share sheet. Choose **Save to Files** (iCloud Drive is a good spot).
  The file is `fitness-backup-YYYY-MM-DD.json` and holds everything: settings, plan, every day,
  workout and run.
- **Import backup** picks a backup file, shows what's in it, and after you confirm, **replaces**
  all data on the phone with it.
- Settings shows when you last backed up, and a reminder if it's been more than two weeks.
- **Delete all data** (Danger zone) resets the app to defaults after a confirmation.

## How things work

- **Daily reset:** every date has its own record keyed by local date (`YYYY-MM-DD`).
  At midnight the app just starts showing a new, empty day; past days stay in history.
- **Goals are snapshotted per day:** changing a goal in Settings applies from today on.
  Past days keep the targets they were logged against, so history and streaks don't shift.
- **Supplements:** each day stores the list as it was that day. Adding or removing a
  supplement only affects today onward.
- **Streaks** (water, workouts, supplements) are recomputed from history every time:
  hit → +1, one miss → "⚠ Streak at risk", hit next day → saved, two misses in a row → reset.
  Days that aren't eligible (e.g. rest days for workouts) are skipped.

## Lifting & the overload engine

- **Plan:** push / pull / legs on Tue / Thu / Sat by default. Edit it on the Workouts tab:
  rename days, pick weekdays, add / remove / reorder / swap exercises, set sets and reps.
- **Moving a session:** tap a day in the week strip → *Move to another day* (this week only).
  Starting a workout on an unscheduled day also counts it as moved, so the streak stays fair.
- **Targets** come only from your own logged sets (`js/logic/overload.js`):
  - first time → no target, you pick a comfortable weight
  - fixed reps (e.g. 4×5): hit every rep → +5 lb upper / +10 lb lower; miss → same target
  - rep range (e.g. 3×8–10): add a rep each session until all sets hit the top, then add weight
  - miss the same weight 2 sessions in a row → deload 10% and build back up
  - weights round to 5 lb; every target shows a one-line reason
- **History is never deleted.** Exercises live in a library; the plan just points at them.
  Swap or remove an exercise and bring it back later: it continues where it left off.
- Dumbbell weights are per dumbbell. Only checked-off sets count toward progression.

## Progress tab

Pick 7 days / 30 days / All time at the top; every card follows it.

- **Body weight:** 7-day moving average, weigh-ins, goal line, average change per week
  (least-squares slope of the moving average).
- **Sleep:** average for the range plus 7-day / 30-day / all-time averages.
- **Water:** goal hit rate (finished days only; today counts once you've hit it).
- **Food:** average calories vs. target and protein, using only days with food logged.
- **Strength:** estimated 1RM per exercise with change over the range. Tap for its chart.
- **Running:** weekly distance (8 weeks), pace trend, longest run.

Charts are plain SVG (`js/ui/chart.js`), so there's no chart library. Tap or drag across a chart to read values.

## Notifications (Cloudflare Worker)

Lock-screen reminders at your check times (default 6:00 PM, 9:00 PM, 10:30 PM), sent only
if something is behind, e.g. **💧 750 ml water left · 21-day streak at stake**.

How it works: the app sends a small summary (water, supplements, today's workout, streaks,
your preferences; never food, weight or sleep) to your own free Cloudflare Worker whenever it
changes. The Worker wakes every 15 minutes and, at a check time, sends a Web Push if needed.
Code: `worker/fitness-push.js`. Its encryption is checked against the RFC 8291 test vector.

### One-time setup

1. **Cloudflare account:** sign up free at dash.cloudflare.com.
2. **Create the Worker:** *Workers & Pages → Create → Create Worker*, name it `fitness-push`,
   **Deploy**. Then **Edit code**, delete everything, paste all of `worker/fitness-push.js`, **Deploy**.
3. **Create storage:** *Storage & Databases → KV → Create* a namespace named `fitness-push`.
4. **Connect storage:** Worker → *Settings → Bindings → Add → KV namespace*.
   Variable name **`PUSH_KV`**, namespace `fitness-push`. Save.
5. **Secret key:** in the app, *Settings → Notifications → Secret key → Generate key* (it's copied).
   In Cloudflare: Worker → *Settings → Variables and Secrets → Add*, type **Secret**,
   name **`APP_SECRET`**, paste the key. Save/Deploy.
6. **Schedule:** Worker → *Settings → Triggers → Cron Triggers → Add*: `*/15 * * * *`.
7. **Check it:** open the Worker URL (`https://fitness-push.<you>.workers.dev`) in a browser.
   You should see `"kvBound": true, "secretSet": true`.
8. **In the app (opened from the Home Screen):** *Settings → Notifications*:
   paste the Worker URL into **Server URL**, turn on **Lock-screen reminders**, tap **Allow**,
   then **Send test notification**.

Everything fits Cloudflare's free plan (KV: 1,000 writes/day; the app syncs only when
something changes). The secret key is included in backups.

## Project layout

```
index.html              App shell (iOS meta tags, safe areas)
manifest.webmanifest    PWA manifest (name, icons, standalone display)
sw.js                   Service worker: offline cache (push handlers go here later)
css/theme.css           Colour tokens: deep navy, muted blue, off-white
css/app.css             Components and layout
js/app.js               Startup, tab registration, midnight rollover
js/db.js                IndexedDB wrapper
js/dates.js             Local-date helpers
js/store/defaults.js    Default settings (every value editable in Settings)
js/store/state.js       In-memory state + persistence, per-day goal snapshots
js/store/backup.js      Export / import / erase
js/logic/               schedule, streaks, food, overload, history, training, runs (no UI)
js/ui/                  One file per tab, plus shared dom/sheet/components/router
js/notify/              Push subscription + summary sync
worker/fitness-push.js  Cloudflare Worker (paste into the Cloudflare dashboard)
icons/                  App icons (regenerate: python3 tools/make_icons.py)
tools/                  Dev server and icon generator (not used by the app)
```

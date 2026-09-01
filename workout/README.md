# Training Split

A single-page, offline-first workout tracker. Two programmes - **Sushi** and
**Wasabi** - switched from the round programme button in the top bar.

Bottom nav: **Workout** · **Weight** (daily log + trend chart) · **Start/Pause**
(centre) · **Streak** (consecutive-days counter + heatmap calendar).

## Files

```
training-split/
  index.html      the whole app (HTML + CSS + JS, no build step)
  manifest.json   PWA metadata
  sw.js           service worker (offline cache)
  assets/
    mascot.png            optional - 1:1 headshot on #fcf4e9, shown as the header avatar
    icon-192.png          PWA icon (192×192)
    icon-512.png          PWA icon (512×512, also used as the maskable icon)
    apple-touch-icon.png  iOS home-screen icon (180×180)
    ex/                    exercise images (see assets/README.md)
```

Everything except `index.html`, `manifest.json` and `sw.js` is optional. Missing
images degrade gracefully (mascot hidden, exercise falls back to the muscle map).

## Deploying

Upload the whole `training-split/` folder to any static host (Netlify, GitHub
Pages, S3, a plain nginx dir). Open `index.html`. That's it.

- The service worker only registers over `http(s)`, so opening the file directly
  (`file://`) still works - you just don't get offline caching or install.
- After you change any file, bump `CACHE` in `sw.js` (e.g. `ts-shell-v2`) so
  clients pick up the new version.

## Where the data lives

All progress (logged sets, workout history with date/timestamp/% complete,
settings) is stored in the browser's `localStorage`, on the
device, scoped to the site's origin. No account, no server, no auth.

- It is **per-browser, per-device**. Nothing syncs between phone and laptop, and
  a different browser or a private window starts empty.
- It survives reloads, restarts and reboots. It can be cleared by "clear
  browsing data", private mode, or (on iOS Safari) 7 days of no use unless the
  app is added to the home screen.
- Use **Settings → Export backup** to save a JSON file, and **Import backup** to
  restore it - that is the way to move data between devices.

## Reading the data from another page

Any page on the same origin can read the store synchronously:

```js
const store = JSON.parse(localStorage.getItem("ts-v2") || "{}");
```

Shape (`store.v === 3`):

```
theme     "light" | "dark"
program   "ps" | "gb"          (shown as "Sushi" / "Wasabi")
deload    boolean
variants  { "<prog>:<dayIdx>:<exSlug>": variantIndex }
today     { date: "YYYY-MM-DD", sessions: { "<prog>:<dayIdx>": session } }
history   [ entry, ... ]        newest first, capped at 80
metrics   [ { date, weight }, ... ]   daily weight log (Weight screen)
```

Each `history` entry - one saved workout:

```
date       "YYYY-MM-DD"   (local date)
ts         number         (epoch ms, i.e. the timestamp it was finished)
program    "ps" | "gb"
title      e.g. "Push 1"
dur        number         (session length in ms; 0 if unknown)
pct        number         (0-100, % of sets completed)
setsDone   number
setsTotal  number
lines      [ { n: exerciseName, done, total, cardio? }, ... ]
```

A report page should only **read** - the store is one JSON blob under one key, so
writing from two pages races. `addEventListener("storage", ...)` fires in other
open tabs when the tracker saves, for live refresh.

## Adding your own exercise images

See `assets/README.md`.

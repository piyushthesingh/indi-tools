# Training Split

An offline-first workout tracker (PWA). No account and no server: everything
stays on the phone. It works like Strong or Hevy, but opens straight onto an
opinionated programme with a coaching cue for every exercise.

## What it does

**Today**
- Set rows with *last time*, *kg*, *reps* and ✓. Values are pre-filled, so an
  unchanged set is still one tap: last time's reps (from the same day of the
  split when possible), or the top of the range for an exercise never logged
  (8-12 → 12).
- A progression coach, judged from the last time the exercise was done:
  - under 7 days ago, it shows those numbers to repeat;
  - 7 or more days, if every working set went past 10 reps, add weight and
    keep the reps. Dumbbells +2.5 kg. Barbells and plate-loaded machines
    +2.5 kg when 1.25 kg plates are in your plate list, otherwise +5 kg. Cable
    and machine stacks +2.5 kg;
  - otherwise, one more rep on each set at 10 or under.
  The 10 is a setting (You → Add weight after).
- Warm-up, Stretching and Cooldown sections come first when adding exercises.
  Each suggests a package for the body areas the day trains, read from its
  name and focus ("Pull" → back, "Legs" → legs) or from its muscles. Stretch
  doses follow ACSM guidance: holds of about 30 s, repeated to about 60 s per
  stretch.
- Sections show as their own groups, with the main exercises grouped under
  "Workout". Warm-up, stretching and cooldown start collapsed, carry no rest
  timer, and their sets are counted apart from the workout's own, so they
  don't dilute its progress, PRs or sets per muscle. Any exercise can be moved
  between sections in the exercise editor.
- Adding an exercise the day already has asks first, then lets you add it
  anyway.
- Adding anything asks whether it is just for today or part of every Pull 1,
  so a warm-up can go straight into the programme. Today-only exercises also
  show in the day editor, marked as such, with a Keep button. Each section
  header on Today has a menu to add to it, keep it, edit it or drop it for
  today.
- A live PR badge appears when a set beats your best estimated 1RM, heaviest
  weight, most reps, longest hold or farthest distance.
- The rest timer starts on ✓. Each exercise has its own rest time, set
  automatically from the rep range and adjustable. The timer is saved, so a
  reload or iOS closing the app doesn't lose it.
- Set types: warm-up, working, drop and failure. Optional reps-in-reserve
  column.
- Supersets, warm-up set generator and plate calculator.
- Mid-session editing: swap an exercise for today only or permanently, add
  or remove sets, skip, reorder, add exercises, keep notes.
- The finish summary shows duration, sets, volume against last time, PRs and
  what to try next time. It can also produce a share image.

**History**: streak (up to 2 rest days a week keeps it alive), a calendar,
every workout with its sets, and delete.

**Progress**
- Bodyweight with a 7-day average, weekly change and waist.
- Sets per muscle each week against the plan.
- Records and charts for every exercise.
- Progress photos, stored in IndexedDB on this device only.

**You**
- Programmes: create, copy, reset to the original, share as a link.
- Split editor: add, remove, reorder and rename days, and edit exercises from
  the 236-exercise library.
- Settings, theme (system, light or dark), JSON backup and restore, CSV export
  (Strong's columns), import from Strong or Hevy CSV.

Exercise search tolerates typos and sound-alike spellings ("romanion dedlift",
"skul crusher"). It also matches words in the middle of a name ("pulldown"),
joined-up words ("legpress") and abbreviations ("rdl", "ohp", "db row"). An
exact name always ranks first.

## Files

```
workout/
  index.html          markup shell; loads css/ and js/ (classic scripts, no bundler)
  manifest.json       PWA metadata
  sw.js               service worker; the BUILD block is written by tools/build.py
  css/app.css         all styles (light + dark tokens at the top)
  js/
    catalog.js        GENERATED from the spreadsheet - exercise library
    images.js         GENERATED - catalogue id -> image name
    templates.js      built-in Sushi and Wasabi programmes
    core.js           helpers, store (v4), migration, programme/session model
    search.js         fuzzy exercise search
    stats.js          PRs, suggestions, muscle volume, streak
    ui.js             icons, toast, sheets, controls, charts
    timer.js          rest timer + wake lock
    today.js          Today screen
    editor.js         library picker, programme/day/exercise editors
    history.js        History screen
    progress.js       Progress screen, exercise detail, photos
    share.js          share image, programme links
    you.js            settings, backup, CSV
    app.js            boot, tabs, theme, update prompt
  assets/
    Exercises/*.png         source exercise art (see assets/README.md)
    Exercises/web/*.jpg     GENERATED - 720 px, used on the exercise sheet
    Exercises/thumb/*.jpg   GENERATED - 320 px, used in lists
    mascot-web.jpg          GENERATED from mascot.png
  tools/
    build.py                  the build step (Python 3 standard library + macOS sips)
    exercise-catalogue.xlsx   exercise library source
    image-map.json            images whose file names don't match a catalogue name
    missing-images.csv        GENERATED - exercises with no image yet, and the file name to give each
```

## Build step

Run this after changing the spreadsheet, adding images, or editing any file:

```bash
python3 tools/build.py
```

It regenerates `js/catalog.js`, re-encodes new or changed PNGs, links images
to exercises and rewrites the file list and build ID inside `sw.js`. A new
build ID is how installed copies learn there is an update. They show a "new
version is ready" toast with a Reload button.

Pass a different spreadsheet with `python3 tools/build.py path/to/file.xlsx`.
Catalogue IDs must stay stable, because saved workouts refer to exercises by ID.

## Deploying

1. `python3 tools/build.py`
2. Upload the folder.

`tools/` and the source PNGs in `assets/Exercises/` (over 300 MB) are not
requested by the app. A PNG is used only if its JPEG is missing, so you can
leave them out of the upload.

Opening `index.html` from disk (`file://`) works too, just without offline
caching or install.

## Where the data lives

Everything is in `localStorage` under the key `ts-v2`, on this device and this
browser. Progress photos are in IndexedDB (`training-split-photos`) and are
**not** included in backups.

- **You → Back up** saves a JSON file; **Restore a backup** loads one. That's
  how to move between devices.
- **Protected storage** asks the browser not to evict the data.
- The app nudges for a backup every 10 workouts.
- On iPhone, add the app to the Home Screen. Safari clears storage for
  websites that go unused for 7 days, but not for Home Screen apps.

Older data is migrated on load. That covers v2 and v3 stores, as well as
backups from the previous version. Old sets had no weights, so migrated
workouts keep their set counts only.

### Store shape (`v: 4`)

```
theme        "system" | "light" | "dark"
program      id of the active programme
programOrder [id, ...]
programs     { id: { id, name, emoji, template?, days: [day], notes: [[title, body]] } }
  day        { id, name, title, focus, items: [item] }
  item       { uid, opts: [{ ex, n?, img? }], pick, sets, reps, rest?, tag?, cue?, p?, s?, type?, ss? }
deload       boolean
lastDay      { programId: dayId }
today        { date, sessions: { "programId:dayId": session } }
  session    { startedAt, lastAt, pausedAt, pausedMs, entries: { itemUid: entry }, extra: [item], removed: [uid], order }
  entry      { sets: [{ t, a, b, rir?, done, pr? }], note, swap, n, skipped? }
history      [workout] newest first, uncapped
  workout    { id, date, ts, program, programName, dayId, title, dur, pct, setsDone, setsTotal, volume, prs, lines }
  line       { ex, n, type, p, s, done, total, sets: [{ t, a, b, rir?, pr? }], note?, skipped? }
metrics      [{ date, weight, waist }]
custom       [exercise]      exercises you created or imported
exNote       { exerciseId: text }
timer        { endAt, dur, label, pausedLeft, rang } | null
settings     { bar, plates, daySelect, rir, sound }
backup       { lastAt, countAtLast }
```

A set stores two numbers, `a` and `b`. Their meaning depends on the exercise's
logging type:

| type   | a                  | b       |
|--------|--------------------|---------|
| wr     | kg                 | reps    |
| bw     | added kg           | reps    |
| assist | kg of assistance   | reps    |
| time   | added kg           | seconds |
| dist   | added kg           | metres  |
| cardio | km                 | minutes |

Set type `t` is `work`, `warmup`, `drop` or `fail`.

A page that reads the store should only read it. It's one JSON value, so two
writers would race. `addEventListener("storage", ...)` fires when the tracker
saves.

## Version control

The folder is a git repository. `main` started from the local copy as it was
before the rebuild. `live-snapshot` holds what was deployed at indi.tools on
15 Sep 2026. The two had drifted: the live copy had the weekday day-picker and
the import fix, the local copy had the Start/Pause button. The rebuild keeps
all three.

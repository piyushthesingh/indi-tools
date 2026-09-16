/* ===============================================================
   You: programmes, settings, backup, CSV export and import.
=============================================================== */

function renderYou() {
  const root = $("viewYou");
  root.innerHTML = "";
  root.appendChild(h("header.page-head", {}, h("h1", {}, "You")));

  if (updateWorker) {
    root.appendChild(h("div.banner.info", {}, icon("download"),
      h("div", {}, h("b", {}, "A new version is ready"), h("span", {}, "Reload to update. Your data stays.")),
      h("button.btn.sm.primary", { type: "button", onclick: applyUpdate }, "Reload")));
  }
  const since = store.history.length - (store.backup.countAtLast || 0);
  if (store.history.length && since >= 10) {
    root.appendChild(h("div.banner", {}, icon("shield"),
      h("div", {}, h("b", {}, "Back up your training"), h("span", {}, since + " workouts since your last backup. Your data lives only on this device.")),
      h("button.btn.sm.primary", { type: "button", onclick: exportBackup }, "Back up")));
  }

  const progs = h("section.panel-card", {},
    h("div.card-title-row", {}, h("h2.card-title", {}, "Programmes"),
      h("button.btn.sm", { type: "button", onclick: openNewProgram }, icon("plus", "sm"), "New")));
  store.programOrder.forEach((id) => {
    const p = store.programs[id];
    const cur = id === store.program;
    const nEx = p.days.reduce((n, d) => n + d.items.length, 0);
    progs.appendChild(h("div", { class: "prog-row" + (cur ? " current" : "") },
      h("button.prog-row-main", { type: "button", "aria-pressed": String(cur), onclick: () => { if (!cur) { switchProgram(id); toast("Now using " + p.name); } } },
        h("span.prog-emoji", { "aria-hidden": "true" }, p.emoji || "🏋️"),
        h("span.prog-row-text", {}, h("b", {}, p.name), h("small", {}, p.days.length + (p.days.length === 1 ? " day · " : " days · ") + nEx + " exercises" + (cur ? " · in use" : "")))),
      h("button.icon-btn.sm", { type: "button", "aria-label": "Edit " + p.name, onclick: () => openProgramEditor(id) }, icon("edit"))));
  });
  if (activeProg().notes.length) progs.appendChild(h("button.link-btn", { type: "button", onclick: () => openGuide(activeProg()) }, icon("book", "sm"), activeProg().name + " guide"));

  const training = h("section.panel-card", {}, h("h2.card-title", {}, "Training"),
    setting("Deload week", "Halves the working sets on every exercise. Same weights.",
      switchBtn(store.deload, (v) => { store.deload = v; saveNow(); }, "Deload week")),
    setting("Opening day", "Which day Today shows first each morning. Auto uses the weekday for 6+ day splits, otherwise the next day in order.",
      segControl([["auto", "Auto"], ["weekday", "Weekday"], ["rotation", "Next up"]], store.settings.daySelect, (v) => { store.settings.daySelect = v; saveNow(); }, "Opening day")),
    setting("Add weight after", "When every set last week went past this many reps, the next session suggests more weight. Otherwise it suggests one more rep.",
      h("div.inline", {}, numInput(repsLimit(), 10, "reps", (v) => { store.settings.repsUp = v && v >= 1 ? Math.round(v) : 10; saveNow(); }, "Reps before adding weight"), h("span.unit", {}, "reps"))),
    setting("Reps in reserve", "Adds an RIR column: how many more reps you could have done.",
      switchBtn(store.settings.rir, (v) => { store.settings.rir = v; saveNow(); }, "Log reps in reserve")),
    setting("Rest timer sound", "Double beep when rest is over. Android also vibrates.",
      switchBtn(store.settings.sound, (v) => { store.settings.sound = v; saveNow(); if (v) beep(); }, "Rest timer sound")),
    setting("Barbell", "For warm-up sets and the plate calculator.",
      h("div.inline", {}, numInput(store.settings.bar, 20, "kg", (v) => { store.settings.bar = v == null ? 20 : v; saveNow(); }, "Barbell weight in kg"), h("span.unit", {}, "kg"))),
    setting("Plates you have", "Kilograms per plate, separated by commas.", platesInput()),
    setting("Keep screen awake", "wakeLock" in navigator ? "On automatically while a workout or rest timer runs." : "This browser doesn't support it.", null));

  const look = h("section.panel-card", {}, h("h2.card-title", {}, "Appearance"),
    setting("Theme", null, segControl([["system", "System"], ["light", "Light"], ["dark", "Dark"]], store.theme, (v) => { store.theme = v; saveNow(); applyTheme(); }, "Theme")));

  const persistText = h("small", {}, "Checking…");
  const persistRow = h("button.menu-item", { type: "button", onclick: () => requestPersistence().then(() => renderYou()) },
    icon("shield"), h("span.menu-label", {}, "Protected storage", persistText));
  const data = h("section.panel-card", {}, h("h2.card-title", {}, "Your data"),
    h("p.hint", {}, "Stored on this device only. No account, nothing uploaded."),
    h("div.menu-list", {},
      menuRow("download", "Back up", (store.backup.lastAt ? "Last backup " + dLabel(isoOf(new Date(store.backup.lastAt))) : "Never backed up") + " · saves a JSON file", exportBackup),
      menuRow("upload", "Restore a backup", "Replaces everything on this device", importBackup),
      menuRow("download", "Export CSV", "Every set, in the same columns Strong uses", exportCSV),
      menuRow("upload", "Import from Strong or Hevy", "Adds their CSV export to your history", importCSV),
      persistRow,
      menuRow("trash", "Clear today's session", "Only the day selected on Today", clearToday),
      menuRow("trash", "Erase all data", "History, programmes, settings and photos", eraseAll, true)));
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((ok) => {
      persistText.textContent = ok ? "On. The browser won't clear your data to free space." : "Off. Tap to ask the browser to keep your data.";
      persistRow.disabled = ok;
    }).catch(() => { persistText.textContent = "Unknown on this browser."; });
  } else {
    persistText.textContent = "Not available here. Add the app to your Home Screen and back up often.";
    persistRow.disabled = true;
  }

  const about = h("section.panel-card", {}, h("h2.card-title", {}, "About"),
    h("p.hint", {}, "Training Split · " + allExercises().length + " exercises in the library, " + Object.keys(EX_IMAGES).length + " illustrated · " + store.history.length + " workouts saved."),
    h("p.hint", {}, "On iPhone, add it to your Home Screen from Safari's share menu. Safari can clear data for websites you haven't opened in a week, but not for Home Screen apps."));

  root.append(progs, training, look, data, about);
}

function setting(label, hint, control) {
  return h("div.setting", {}, h("div.setting-main", {}, h("b", {}, label), hint ? h("small", {}, hint) : null), control);
}

function platesInput() {
  const i = h("input.text-in.plates-in", { type: "text", inputmode: "decimal", value: store.settings.plates.map(fmtNum).join(", "), "aria-label": "Plates in kg" });
  i.addEventListener("change", () => {
    const list = i.value.split(/[,;\s]+/).map(parseNum).filter((x) => x > 0);
    if (list.length) { store.settings.plates = Array.from(new Set(list)).sort((a, b) => b - a); saveNow(); }
    i.value = store.settings.plates.map(fmtNum).join(", ");
  });
  return i;
}

/* ---------- files ---------- */

function downloadBlob(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function pickFile(accept, cb) {
  const input = h("input", { type: "file", accept, hidden: true });
  input.addEventListener("change", () => {
    const f = input.files && input.files[0];
    input.remove();
    if (f) cb(f);
  });
  document.body.appendChild(input);
  input.click();
}

function readText(file) {
  return file.text ? file.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}

function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
  return navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => false);
}

/* ---------- backup ---------- */

function exportBackup() {
  downloadBlob(new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }), "training-split-backup-" + todayISO() + ".json");
  store.backup = { lastAt: Date.now(), countAtLast: store.history.length };
  saveNow();
  updateNav();
  toast("Backup saved. Keep a copy somewhere other than this phone.");
  if (view.tab === "you") renderYou();
}

function importBackup() {
  pickFile("application/json,.json", (file) => readText(file).then((txt) => {
    let o = null;
    try { o = upgradeStore(JSON.parse(txt)); } catch (e) { o = null; }
    if (!o) { toast("That file isn't a Training Split backup."); return; }
    if (!confirm("Replace everything on this device with this backup? It has " + o.history.length + " workouts and " + o.programOrder.length + " programmes.")) return;
    try { localStorage.setItem(SKEY, JSON.stringify(o)); } catch (e) { toast("Not enough storage to restore this backup."); return; }
    blockSaves();
    location.reload();
  }));
}

function clearToday() {
  const day = curDay();
  const k = day && sessKey(store.program, day.id);
  if (!k || !store.today.sessions[k]) { toast("Nothing logged for " + (day ? day.name : "today")); return; }
  if (!confirm("Clear today's sets for " + day.name + "? History isn't affected.")) return;
  delete store.today.sessions[k];
  if (store.timer) stopRest();
  saveNow();
  toast("Today's session cleared");
  renderCurrent();
}

function eraseAll() {
  if (!confirm("Erase ALL data on this device: history, programmes, settings and photos? This can't be undone.")) return;
  blockSaves();
  try { localStorage.removeItem(SKEY); } catch (e) {}
  try { indexedDB.deleteDatabase("training-split-photos"); } catch (e) {}
  location.reload();
}

/* ---------- CSV ---------- */

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCSV() {
  if (!store.history.length) { toast("No workouts to export yet"); return; }
  const rows = [["Date", "Workout Name", "Duration", "Exercise Name", "Set Order", "Weight", "Reps", "Distance", "Seconds", "Notes", "Workout Notes", "RPE", "Programme"]];
  store.history.slice().reverse().forEach((x) => {
    const d = new Date(x.ts || parseISO(x.date));
    const when = x.date + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":00";
    const dur = x.dur ? Math.round(x.dur / 60000) + "m" : "";
    x.lines.forEach((l) => {
      let n = 0;
      l.sets.forEach((s) => {
        const order = s.t === "warmup" ? "W" : s.t === "drop" ? "D" : s.t === "fail" ? "F" : String(++n);
        let weight = "", reps = "", dist = "", secs = "";
        if (l.type === "wr" || l.type === "bw") { weight = s.a; reps = s.b; }
        else if (l.type === "assist") { weight = s.a != null ? -s.a : ""; reps = s.b; }
        else if (l.type === "time") { weight = s.a; secs = s.b; }
        else if (l.type === "dist") { weight = s.a; dist = s.b != null ? s.b / 1000 : ""; }
        else if (l.type === "cardio") { dist = s.a; secs = s.b != null ? Math.round(s.b * 60) : ""; }
        rows.push([when, x.title, dur, l.n, order, weight, reps, dist, secs, l.note || "", "", s.rir != null ? 10 - s.rir : "", x.programName || ""]);
      });
    });
  });
  downloadBlob(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" }), "training-split-" + todayISO() + ".csv");
  toast("CSV exported");
}

function parseCSV(text) {
  const nl = text.indexOf("\n");
  const first = nl === -1 ? text : text.slice(0, nl);
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function parseDateLoose(s) {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)).getTime();
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})/);
  if (m && MONTHS.indexOf(m[2].toLowerCase()) !== -1) return new Date(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1], +m[4], +m[5]).getTime();
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}
function parseDurText(s) {
  if (!s) return 0;
  const hh = s.match(/(\d+)\s*h/), mm = s.match(/(\d+)\s*m/), ss = s.match(/(\d+)\s*s/);
  if (hh || mm || ss) return ((hh ? +hh[1] * 60 : 0) + (mm ? +mm[1] : 0) + (ss ? +ss[1] / 60 : 0)) * 60000;
  const n = parseFloat(s);
  return isFinite(n) ? n * 60000 : 0;
}

function importCSV() {
  pickFile(".csv,text/csv", (file) => readText(file).then((txt) => {
    const rows = parseCSV(String(txt).replace(/^﻿/, ""));
    if (rows.length < 2) { toast("That CSV has no rows."); return; }
    const head = rows[0].map((x) => x.trim().toLowerCase());
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i !== -1) return i; } return -1; };
    const hevy = col("exercise_title") !== -1;
    const C = hevy
      ? { title: col("title"), start: col("start_time"), end: col("end_time"), ex: col("exercise_title"), type: col("set_type"), kg: col("weight_kg"), lbs: col("weight_lbs"), reps: col("reps"), km: col("distance_km"), mi: col("distance_miles"), sec: col("duration_seconds"), rpe: col("rpe"), note: col("exercise_notes"), unit: -1, dunit: -1, dur: -1 }
      : { title: col("workout name"), start: col("date"), end: -1, ex: col("exercise name"), type: col("set order"), kg: col("weight"), lbs: -1, reps: col("reps"), km: col("distance"), mi: -1, sec: col("seconds"), rpe: col("rpe"), note: col("notes"), unit: col("weight unit"), dunit: col("distance unit"), dur: col("duration") };
    if (C.ex === -1 || C.start === -1) { toast("Couldn't read this CSV. Export it from Strong or Hevy and try again."); return; }

    const workouts = new Map();
    rows.slice(1).forEach((r) => {
      const get = (i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
      const ts = parseDateLoose(get(C.start));
      const exName = get(C.ex);
      if (!ts || !exName) return;
      const orderRaw = get(C.type).toLowerCase();
      if (/rest/.test(orderRaw)) return;
      const title = get(C.title) || "Workout";
      const key = ts + "|" + title;
      let w = workouts.get(key);
      if (!w) {
        const end = C.end >= 0 ? parseDateLoose(get(C.end)) : null;
        w = { ts, title, dur: end ? end - ts : parseDurText(get(C.dur)), lines: new Map() };
        workouts.set(key, w);
      }
      let line = w.lines.get(exName);
      if (!line) { line = { name: exName, sets: [], note: get(C.note) }; w.lines.set(exName, line); }
      let kg = parseNum(get(C.kg));
      if (kg == null && C.lbs >= 0) { const lb = parseNum(get(C.lbs)); if (lb != null) kg = lb * 0.453592; }
      else if (kg != null && C.unit >= 0 && /lb/i.test(get(C.unit))) kg *= 0.453592;
      let km = parseNum(get(C.km));
      if (km == null && C.mi >= 0) { const mi = parseNum(get(C.mi)); if (mi != null) km = mi * 1.60934; }
      else if (km != null && C.dunit >= 0 && /mi/i.test(get(C.dunit))) km *= 1.60934;
      const rpe = parseNum(get(C.rpe));
      line.sets.push({
        t: /^w|warm/.test(orderRaw) ? "warmup" : /^d|drop/.test(orderRaw) ? "drop" : /^f|fail/.test(orderRaw) ? "fail" : "work",
        kg: kg != null ? Math.round(kg * 100) / 100 : null, reps: parseNum(get(C.reps)),
        km: km != null ? Math.round(km * 1000) / 1000 : null, sec: parseNum(get(C.sec)),
        rir: rpe != null ? clamp(Math.round(10 - rpe), 0, 4) : null
      });
    });
    if (!workouts.size) { toast("No workouts found in that CSV."); return; }

    /* match each exercise name once, only against exercises logged the same way (reps vs time/distance) */
    const profile = new Map();
    workouts.forEach((w) => w.lines.forEach((l) => {
      const pr = profile.get(l.name) || { reps: false, other: false };
      l.sets.forEach((s) => { if (s.reps) pr.reps = true; else if (s.sec || s.km) pr.other = true; });
      profile.set(l.name, pr);
    }));
    const names = new Map();
    profile.forEach((pr, name) => {
      const types = pr.reps ? ["wr", "bw", "assist"] : pr.other ? ["cardio", "time", "dist"] : null;
      names.set(name, bestExerciseMatch(name, types ? { types } : null));
    });
    const matched = Array.from(names.values()).filter(Boolean).length;
    const unmatched = Array.from(names.keys()).filter((n) => !names.get(n));
    const list = Array.from(workouts.values()).sort((a, b) => a.ts - b.ts);
    const dupes = list.filter((w) => store.history.some((x) => Math.abs((x.ts || 0) - w.ts) < 120000 && x.title === w.title)).length;

    openSheet({
      title: "Import from " + (hevy ? "Hevy" : "Strong"),
      body: (b, api) => {
        b.append(
          h("div.stat-grid", {}, stat(String(list.length - dupes), "new workouts"), stat(String(names.size), "exercises")),
          h("p.hint", {}, fmtDate(isoOf(new Date(list[0].ts)), { day: "numeric", month: "short", year: "numeric" }) + " to " + fmtDate(isoOf(new Date(list[list.length - 1].ts)), { day: "numeric", month: "short", year: "numeric" }) + (dupes ? " · " + dupes + " already imported, skipped" : "")),
          h("p.hint", {}, matched + " exercises matched the library." + (unmatched.length ? " " + unmatched.length + " will be added as your own: " + unmatched.slice(0, 6).join(", ") + (unmatched.length > 6 ? "…" : "") : "")),
          h("div.sheet-actions", {},
            h("button.btn", { type: "button", onclick: () => api.close() }, "Cancel"),
            h("button.btn.primary", { type: "button", onclick: () => { const n = applyImport(list, names, hevy); api.close(() => { renderCurrent(); toast(n + " workouts imported"); }); } }, "Import")));
      }
    });
  }));
}

function applyImport(list, names, hevy) {
  const idFor = new Map();
  names.forEach((info, name) => {
    if (info) { idFor.set(name, info.id); return; }
    const id = "c:" + uid();
    store.custom.push({ id, n: name.replace(/\s+/g, " ").trim(), cat: "Imported", target: "", fam: "", equip: "", tier: 3, type: "wr", p: [], s: [], custom: true });
    idFor.set(name, id);
  });
  const added = [];
  list.forEach((w) => {
    if (store.history.some((x) => Math.abs((x.ts || 0) - w.ts) < 120000 && x.title === w.title)) return;
    let setsDone = 0, volume = 0;
    const lines = [];
    w.lines.forEach((l) => {
      const exId = idFor.get(l.name);
      const info = exInfo(exId);
      const has = (k) => l.sets.some((s) => s[k] != null && s[k] !== 0);
      let type = info.type;
      if (!has("reps") && has("sec") && has("km")) type = "cardio";
      else if (!has("reps") && has("sec")) type = "time";
      else if (!has("reps") && has("km")) type = type === "cardio" ? "cardio" : "dist";
      else if (has("reps") && (type === "time" || type === "cardio" || type === "dist")) type = has("kg") ? "wr" : "bw";
      /* an exercise created by this import logs the way its own rows do */
      if (info.custom && info.cat === "Imported" && info.type !== type) info.type = type;
      const sets = l.sets.map((s) => {
        let a = null, bb = null;
        if (type === "cardio") { a = s.km; bb = s.sec != null ? r1(s.sec / 60) : null; }
        else if (type === "time") { a = s.kg || null; bb = s.sec; }
        else if (type === "dist") { a = s.kg || null; bb = s.km != null ? Math.round(s.km * 1000) : null; }
        else if (type === "assist") { a = s.kg != null ? Math.abs(s.kg) : null; bb = s.reps; }
        else { a = s.kg != null && s.kg !== 0 ? Math.abs(s.kg) : (type === "wr" ? s.kg : null); bb = s.reps; }
        const o = { t: s.t, a, b: bb };
        if (s.rir != null) o.rir = s.rir;
        return o;
      });
      const work = sets.filter((s) => s.t !== "warmup");
      setsDone += work.length;
      if (type === "wr") work.forEach((s) => { if (s.a && s.b) volume += s.a * s.b; });
      const line = { ex: exId, n: info.n || l.name, type, p: info.p, s: info.s, done: work.length, total: work.length, sets };
      if (l.note) line.note = l.note;
      lines.push(line);
    });
    const entry = {
      id: uid(), date: isoOf(new Date(w.ts)), ts: w.ts, program: "import", programName: hevy ? "Hevy import" : "Strong import",
      dayId: null, title: w.title, dur: w.dur || 0, pct: 100, setsDone, setsTotal: setsDone, volume: Math.round(volume), lines, imported: true
    };
    store.history.push(entry);
    added.push(entry);
  });
  store.history.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  invalidateStats();
  added.sort((a, b) => a.ts - b.ts).forEach((e) => markPRs(e));
  invalidateStats();
  saveNow();
  return added.length;
}

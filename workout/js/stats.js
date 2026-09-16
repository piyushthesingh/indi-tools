/* ===============================================================
   Stats derived from history: per-exercise sessions and bests,
   live PR detection, progression suggestions, weekly muscle sets,
   streak. Nothing here is stored; it is rebuilt when history changes.
=============================================================== */

let statsCache = null;
function invalidateStats() { statsCache = null; }

/* stretches, foam rolling and mobility drills: no PRs, no progression, not muscle volume */
const isMobility = (info) => !!info && typeof info.cat === "string" && info.cat.indexOf("Mobility") === 0;

/* Epley. One rep is the weight itself; past 15 reps the estimate stops meaning much */
function e1rm(a, b) {
  if (!(a > 0) || !(b > 0) || b > 15) return 0;
  return b === 1 ? a : a * (1 + b / 30);
}

function setScores(s, type) {
  const a = +s.a || 0, b = +s.b || 0;
  switch (type) {
    case "wr":     return { e1rm: e1rm(a, b), heavy: b > 0 ? a : 0, vol: a * b };
    case "bw":     return { reps: b, heavy: b > 0 ? a : 0 };
    case "assist": return { reps: b };
    case "time":   return { sec: b, heavy: b > 0 ? a : 0 };
    case "dist":   return { m: b, heavy: b > 0 ? a : 0 };
    case "cardio": return { km: a, min: b };
  }
  return {};
}
const PR_KEYS = { wr: ["e1rm", "heavy"], bw: ["reps", "heavy"], assist: ["reps"], time: ["sec", "heavy"], dist: ["m", "heavy"], cardio: ["km"] };
const PR_LABEL = { e1rm: "Est. 1RM", heavy: "Heaviest", vol: "Best set volume", reps: "Most reps", sec: "Longest hold", m: "Farthest", km: "Farthest", min: "Longest" };
function prValueText(key, v) {
  if (key === "e1rm" || key === "heavy") return fmtNum(r1(v)) + " kg";
  if (key === "vol") return fmtNum(Math.round(v)) + " kg";
  if (key === "reps") return fmtNum(v) + " reps";
  if (key === "sec") return fmtNum(v) + " s";
  if (key === "m") return fmtNum(v) + " m";
  if (key === "km") return fmtNum(v) + " km";
  if (key === "min") return fmtNum(v) + " min";
  return fmtNum(v);
}

function stats() {
  if (statsCache) return statsCache;
  const byEx = new Map();
  for (let i = store.history.length - 1; i >= 0; i--) {        /* oldest first */
    const hh = store.history[i];
    (hh.lines || []).forEach((l) => {
      if (l.ex == null || !l.sets || !l.sets.length) return;
      let rec = byEx.get(l.ex);
      if (!rec) { rec = { ex: l.ex, type: l.type, n: l.n, sessions: [], best: {}, bestAt: {} }; byEx.set(l.ex, rec); }
      rec.type = l.type || rec.type;
      rec.n = l.n || rec.n;
      rec.sessions.unshift({ ts: hh.ts, date: hh.date, hid: hh.id, dayId: hh.dayId || null, n: l.n, type: l.type, sets: l.sets, note: l.note });
      l.sets.forEach((s) => {
        if (s.t === "warmup") return;
        const sc = setScores(s, l.type);
        Object.keys(sc).forEach((k) => {
          if (sc[k] > (rec.best[k] || 0)) { rec.best[k] = sc[k]; rec.bestAt[k] = { ts: hh.ts, date: hh.date, set: s }; }
        });
      });
    });
  }
  statsCache = { byEx };
  return statsCache;
}
const exRecord = (exId) => stats().byEx.get(exId) || null;

/* bests from history strictly before `beforeTs` (for marking PRs on a saved entry) */
function bestsBefore(exId, type, beforeTs) {
  const rec = exRecord(exId);
  const best = {};
  if (!rec) return { best, sessions: 0 };
  let sessions = 0;
  rec.sessions.forEach((ses) => {
    if (ses.ts >= beforeTs) return;
    sessions++;
    ses.sets.forEach((s) => {
      if (s.t === "warmup") return;
      const sc = setScores(s, type);
      Object.keys(sc).forEach((k) => { if (sc[k] > (best[k] || 0)) best[k] = sc[k]; });
    });
  });
  return { best, sessions };
}

/* PR keys this set beats. Needs at least one earlier session, so a first
   try at an exercise does not light up every set. */
function livePRs(exId, type, set, otherSets) {
  if (set.t === "warmup" || !set.done || isMobility(exInfo(exId))) return [];
  const rec = exRecord(exId);
  if (!rec || !rec.sessions.length) return [];
  const sc = setScores(set, type);
  const out = [];
  (PR_KEYS[type] || []).forEach((k) => {
    if (!(sc[k] > 0) || !(sc[k] > (rec.best[k] || 0))) return;
    const beaten = (otherSets || []).some((o) => o !== set && o.done && o.t !== "warmup" && (setScores(o, type)[k] || 0) >= sc[k]);
    if (!beaten) out.push(k);
  });
  return out;
}

/* mark s.pr on a history entry's sets and list them on entry.prs */
function markPRs(entry) {
  entry.prs = [];
  entry.lines.forEach((l) => {
    if (l.ex == null || !l.sets.length || l.section || isMobility(exInfo(l.ex))) return;
    const prior = bestsBefore(l.ex, l.type, entry.ts);
    if (!prior.sessions) return;
    (PR_KEYS[l.type] || []).forEach((k) => {
      let top = null, topV = prior.best[k] || 0;
      l.sets.forEach((s) => {
        if (s.t === "warmup") return;
        const v = setScores(s, l.type)[k] || 0;
        if (v > topV) { topV = v; top = s; }
      });
      if (top) {
        top.pr = (top.pr || []).concat(k);
        entry.prs.push({ ex: l.ex, n: l.n, key: k, value: topV, prev: prior.best[k] || 0, set: { a: top.a, b: top.b }, type: l.type });
      }
    });
  });
}

/* ---------- progression ---------- */

const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const repsLimit = () => store.settings.repsUp || 10;

/* the session to compare against: the last time on this programme day, else the last time anywhere */
function lastSessionFor(exId, dayId) {
  const rec = exRecord(exId);
  if (!rec || !rec.sessions.length) return null;
  return (dayId && rec.sessions.find((s) => s.dayId === dayId)) || rec.sessions[0];
}

/* weight step: dumbbells 2.5 kg; barbells and plate-loaded machines 2.5 kg
   when 1.25 kg plates are in You → Plates you have, otherwise 5 kg;
   cable and machine stacks 2.5 kg */
function loadIncrement(info) {
  const e = ((info.equip || "") + " " + info.n).toLowerCase();
  if (/dumbbell|kettlebell/.test(e)) return 2.5;
  if (/barbell|smith|trap bar|t-bar|landmine|ez-bar|rack|plate|leg press|hack squat|sled|belt squat|pendulum/.test(e)) {
    const smallest = Math.min.apply(null, store.settings.plates && store.settings.plates.length ? store.settings.plates : [2.5]);
    return smallest <= 1.25 ? 2.5 : 5;
  }
  return 2.5;
}

/* What to do with an exercise today, judged from the last time it was logged.
   - Less than 7 days ago: repeat it.
   - 7 or more days: if every working set went past the rep limit (10 by
     default), add weight and keep the reps; otherwise add one rep to each set
     that was at or under the limit.
   Pass `lastSets` to judge a specific set list as if a week had passed
   (the finish sheet's "Next time"). */
function suggestion(item, si, lastSets, dayId) {
  if (item.section || isMobility(si.info)) return null;
  if (si.type !== "wr" && si.type !== "bw" && si.type !== "assist") return null;
  let sets = lastSets, days = 7;
  if (!sets) {
    const ses = lastSessionFor(si.info.id, dayId !== undefined ? dayId : view.dayId);
    if (!ses) return null;
    sets = ses.sets;
    days = daysBetween(ses.date, todayISO());
  }
  const work = sets.filter((s) => s.t === "work" && s.b != null);
  if (!work.length) return null;
  const limit = repsLimit();
  const topA = Math.max.apply(null, work.map((s) => +s.a || 0));
  const reps = work.map((s) => fmtNum(s.b)).join(", ");
  const load = si.type === "wr" ? (topA ? " at " + fmtNum(topA) + " kg" : "")
    : si.type === "bw" ? (topA ? " with +" + fmtNum(topA) + " kg" : "")
    : (topA ? " with " + fmtNum(topA) + " kg of help" : "");

  if (days < 7) {
    const ago = days <= 0 ? "earlier today" : days === 1 ? "yesterday" : days + " days ago";
    return { kind: "same", text: "Last time (" + ago + "): " + reps + " reps" + load + ". Match it today." };
  }

  if (work.every((s) => s.b > limit)) {
    if (si.type === "wr") {
      if (!topA) return { kind: "up", a: null, short: "add weight", text: "Every set went past " + limit + " reps last week. Add weight this week." };
      const inc = loadIncrement(si.info);
      const next = Math.round((topA + inc) * 100) / 100;
      return { kind: "up", a: next, short: "try " + fmtNum(next) + " kg",
               text: "Last week: " + reps + " reps" + load + ". Every set went past " + limit + ", so add " + fmtNum(inc) + " kg: " + fmtNum(next) + " kg for the same reps." };
    }
    if (si.type === "bw") {
      const next = (topA || 0) + 2.5;
      return { kind: "up", a: next, short: "try +" + fmtNum(next) + " kg",
               text: "Last week: " + reps + " reps" + load + ". Every set went past " + limit + ", so add weight: +" + fmtNum(next) + " kg for the same reps." };
    }
    if (topA) {
      const next = Math.max(0, Math.round((topA - loadIncrement(si.info)) * 100) / 100);
      return { kind: "up", a: next, short: "try " + fmtNum(next) + " kg help",
               text: "Last week: " + reps + " reps" + load + ". Every set went past " + limit + ", so take some help away: " + fmtNum(next) + " kg." };
    }
    return null;
  }

  const plan = work.map((s) => (s.b <= limit ? s.b + 1 : s.b));
  const all = work.every((s) => s.b <= limit);
  return { kind: "reps", a: topA || null, addRep: true, short: (topA ? fmtNum(topA) + " kg, " : "") + "+1 rep",
           text: "Last week: " + reps + " reps" + load + ". Same weight, one more rep " + (all ? "on each set" : "on the sets at " + limit + " or under") + ": " + plan.map(fmtNum).join(", ") + "." };
}

/* Numbers pre-filled in a set row. Last time's reps are kept; an exercise
   never logged starts at the top of its range (8-12 → 12). The suggestion
   sets the weight, or adds the extra rep. */
function prefillFor(item, si, e, idx, dayId) {
  const set = e.sets[idx];
  const warm = set.t === "warmup";
  const ses = lastSessionFor(si.info.id, dayId !== undefined ? dayId : view.dayId);
  let prev = null;
  if (ses) {
    const pool = ses.sets.filter((s) => (s.t === "warmup") === warm);
    const k = e.sets.slice(0, idx).filter((s) => (s.t === "warmup") === warm).length;
    prev = pool[k] || (warm ? null : pool[pool.length - 1]) || null;
  }
  let a = prev ? prev.a : null;
  let b = prev ? prev.b : null;
  if (!warm) {
    const t = parseTarget(item.reps);
    if (b == null && t.max != null) b = t.max;
    const sug = suggestion(item, si, null, dayId);
    if (sug && sug.a != null) a = sug.a;
    if (sug && sug.addRep && prev && prev.b != null && prev.b <= repsLimit()) b = prev.b + 1;
    for (let j = idx - 1; j >= 0; j--) {
      const s = e.sets[j];
      if (s.t !== "warmup" && s.done && s.a != null) { a = s.a; break; }
    }
  }
  return { a, b, prev };
}

/* ---------- weekly muscle volume ---------- */

function weekMuscleSets(weekStart) {
  const end = addDays(weekStart, 7);
  const done = {}, assist = {};
  const add = (p, s, n) => {
    (p || []).forEach((m) => { done[m] = (done[m] || 0) + n; });
    (s || []).forEach((m) => { assist[m] = (assist[m] || 0) + n; });
  };
  store.history.forEach((hh) => {
    if (hh.date < weekStart || hh.date >= end) return;
    hh.lines.forEach((l) => {
      const info = l.ex != null ? exInfo(l.ex) : null;
      if (l.type === "cardio" || l.section || isMobility(info)) return;
      const n = l.sets.length ? l.sets.filter((s) => s.t !== "warmup").length : (l.done || 0);
      add(l.p || (info && info.p), l.s || (info && info.s), n);
    });
  });
  if (store.today.date >= weekStart && store.today.date < end) {
    Object.keys(store.today.sessions).forEach((k) => {
      const sess = store.today.sessions[k];
      const i = k.indexOf(":");
      const p = store.programs[k.slice(0, i)];
      const day = p && p.days.find((d) => d.id === k.slice(i + 1));
      if (!day) return;
      sessionItems(day, sess).forEach((it) => {
        const e = sess.entries[it.uid];
        if (!e) return;
        const si = slotInfo(it, e);
        if (si.type === "cardio" || it.section || isMobility(si.info)) return;
        add(si.p, si.s, e.sets.filter((s) => s.done && s.t !== "warmup").length);
      });
    });
  }
  return { done, assist };
}

function plannedMuscleSets(prog) {
  const out = {};
  prog.days.forEach((d) => d.items.forEach((it) => {
    const si = slotInfo(it, null);
    if (si.type === "cardio" || it.section || isMobility(si.info)) return;
    (si.p || []).forEach((m) => { out[m] = (out[m] || 0) + plannedSets(it); });
  }));
  return out;
}

/* ---------- streak (up to 2 rest days in any 7 keeps it alive) ---------- */

function workoutDates() {
  const s = new Set(store.history.filter((x) => (x.setsDone || 0) > 0).map((x) => x.date));
  if (store.today.date === todayISO() && Object.values(store.today.sessions).some(anyLogged)) s.add(todayISO());
  return s;
}
function computeStreak() {
  const wk = workoutDates();
  const today = todayISO();
  let first = today;
  wk.forEach((d) => { if (d < first) first = d; });
  let streak = 0, best = 0;
  const byDate = {};
  for (let iso = addDays(first, -1); iso <= today; iso = addDays(iso, 1)) {
    if (wk.has(iso)) streak += 1;
    else {
      let rest = 0;
      for (let k = 0; k < 7; k++) if (!wk.has(addDays(iso, -k))) rest += 1;
      streak = rest <= 2 && streak > 0 ? streak + 1 : 0;
    }
    byDate[iso] = streak;
    if (streak > best) best = streak;
  }
  return { current: streak, best, byDate, wk };
}

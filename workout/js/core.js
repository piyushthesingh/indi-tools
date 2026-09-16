/* ===============================================================
   Core: helpers, catalogue, store (v4) and the programme / session
   model. Classic scripts (no modules), so the app still opens from
   file:// as well as over http(s). Load order is in index.html.
=============================================================== */

const $  = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const slug  = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cap   = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const esc   = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1    = (x) => Math.round(x * 10) / 10;
const avg   = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* number for display: 62.5, 60, 1.25 */
function fmtNum(x) {
  if (x == null || x === "" || !isFinite(x)) return "";
  return String(Math.round(x * 100) / 100);
}
/* parse a typed number, accepting a comma decimal */
function parseNum(v) {
  const s = String(v == null ? "" : v).trim().replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/* h("div.card", { onclick }, child, "text") - small DOM builder */
const H_PROPS = new Set(["value", "checked", "disabled", "hidden", "selected", "multiple", "indeterminate"]);
function h(tag, attrs, ...kids) {
  const m = /^([a-z0-9]*)((?:\.[\w-]+)*)$/i.exec(tag);
  const node = document.createElement(m[1] || "div");
  if (m[2]) node.className = m[2].slice(1).replace(/\./g, " ");
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k === "class") node.className = (node.className ? node.className + " " : "") + v;
      else if (k === "style") node.style.cssText = v;
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (H_PROPS.has(k)) node[k] = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
  }
  appendKids(node, kids);
  return node;
}
function appendKids(node, kids) {
  kids.forEach((c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) appendKids(node, c);
    else node.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  });
}

/* ---------- dates ---------- */

const isoOf = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const todayISO = () => isoOf(new Date());
const parseISO = (s) => { const p = String(s).split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
function weekStartISO(iso) {                        /* Monday */
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
}
function fmtDate(iso, opts) {
  const d = parseISO(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, opts || { weekday: "short", day: "numeric", month: "short" });
}
function dLabel(iso) {
  const t = todayISO();
  if (iso === t) return "Today";
  if (iso === addDays(t, -1)) return "Yesterday";
  return fmtDate(iso);
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
/* 52:10 or 1:02:10 */
function fmtDur(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
  return (hh ? hh + ":" + String(mm).padStart(2, "0") : mm) + ":" + String(ss).padStart(2, "0");
}
function fmtMins(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min";
}
function fmtClock(sec) {
  const a = Math.abs(sec);
  return (sec < 0 ? "+" : "") + Math.floor(a / 60) + ":" + String(a % 60).padStart(2, "0");
}

/* ---------- muscles ---------- */

const NAMES = {
  traps: "Traps", delts: "Front and side delts", "delts-rear": "Rear delts",
  chest: "Chest", biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  abs: "Abs", obliques: "Obliques", lats: "Lats", midback: "Mid back",
  erectors: "Lower back", glutes: "Glutes", hamstrings: "Hamstrings",
  quads: "Quads", adductors: "Adductors", abductors: "Abductors",
  calves: "Calves", tibialis: "Shins", rotator: "Rotator cuff", hipflex: "Hip flexors"
};
const SHORT_NAMES = Object.assign({}, NAMES, { delts: "Delts", "delts-rear": "Rear delts", rotator: "Rot. cuff", midback: "Mid back", erectors: "Low back" });

/* ---------- catalogue ---------- */

const CATALOG = new Map();
CATALOG_ROWS.forEach((r) => CATALOG.set(r[0], {
  id: r[0], n: r[1], cat: r[2], target: r[3], fam: r[4], equip: r[5], tier: r[6], type: r[7], p: r[8], s: r[9], aliases: r[10] || []
}));
const CATEGORIES = Array.from(new Set(CATALOG_ROWS.map((r) => r[2])));

function exInfo(id) {
  const c = CATALOG.get(id);
  if (c) return c;
  const custom = store && store.custom && store.custom.find((x) => x.id === id);
  if (custom) return custom;
  return { id, n: "Unknown exercise", cat: "", target: "", fam: "", equip: "", tier: 3, type: "wr", p: [], s: [], unknown: true };
}
function allExercises() { return Array.from(CATALOG.values()).concat(store.custom || []); }

/* image name (no extension) for an item option / catalogue entry.
   The catalogue's own image wins; an item's `img` is only a fallback. */
const IMG_ROOT = "assets/Exercises/";
function imageFor(opt, info) {
  const mapped = EX_IMAGES[String(info.id)];
  if (mapped) return mapped;
  if (opt && opt.img && IMAGE_FILES.indexOf(opt.img) !== -1) return opt.img;
  return null;
}
/* an <img> that tries the optimised JPEG, then the source PNG, then gives up */
function exImg(name, size, cls, alt) {
  if (!name) return null;
  const im = h("img", { class: cls, alt: alt || "", loading: "lazy", decoding: "async" });
  im.src = IMG_ROOT + (size === "thumb" ? "thumb/" : "web/") + name + ".jpg";
  im.addEventListener("error", () => {
    if (!im.dataset.fb) { im.dataset.fb = "1"; im.src = IMG_ROOT + name + ".png"; }
    else im.replaceWith(h("span", { class: cls + " ph", "aria-hidden": "true" }));
  });
  return im;
}
/* placeholder tile with muscle initials, for exercises still waiting on art */
function thumbFor(name, info, cls) {
  const img = exImg(name, "thumb", cls, "");
  if (img) return img;
  const m = (info.p && info.p[0]) ? (SHORT_NAMES[info.p[0]] || "") : (info.cat || "");
  return h("span", { class: cls + " ph", "aria-hidden": "true" }, m.split(/\s+/)[0].slice(0, 5).toUpperCase());
}

/* ---------- logging types ----------
   Every set stores two numbers: a (load) and b (amount).            */
const TYPES = {
  wr:     { a: "kg",  b: "reps", label: "Weight × reps" },
  bw:     { a: "+kg", b: "reps", label: "Bodyweight reps" },
  assist: { a: "−kg", b: "reps", label: "Assisted reps" },
  time:   { a: "+kg", b: "sec",  label: "Time" },
  dist:   { a: "+kg", b: "m",    label: "Distance" },
  cardio: { a: "km",  b: "min",  label: "Cardio" }
};
const DEFAULT_REPS = { wr: "8-12", bw: "8-12", assist: "6-10", time: "30-45 sec", dist: "20-30 m", cardio: "10-20 min" };

/* "8-12", "15-20 per side", "30-45 sec", "10 min", "near failure" */
function parseTarget(reps) {
  const s = String(reps || "").toLowerCase();
  let min = null, max = null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (m) { min = +m[1]; max = +m[2]; }
  else { const one = s.match(/(\d+(?:\.\d+)?)/); if (one) min = max = +one[1]; }
  return { min, max, perSide: /per (side|leg|arm)/.test(s) };
}

/* one set as short text: "62.5 × 10", "BW × 12", "45 s", "12 min · 1.4 km" */
function setText(s, type) {
  const a = s.a, b = s.b;
  switch (type) {
    case "bw": return (a ? "+" + fmtNum(a) + " kg" : "BW") + (b != null ? " × " + fmtNum(b) : "");
    case "assist": return (a ? "−" + fmtNum(a) + " kg" : "BW") + (b != null ? " × " + fmtNum(b) : "");
    case "time": return (b != null ? fmtNum(b) + " s" : "") + (a ? " +" + fmtNum(a) + " kg" : "");
    case "dist": return (b != null ? fmtNum(b) + " m" : "") + (a ? " +" + fmtNum(a) + " kg" : "");
    case "cardio": return (b != null ? fmtNum(b) + " min" : "") + (a ? " · " + fmtNum(a) + " km" : "");
    default: return (a != null ? fmtNum(a) : "-") + (b != null ? " × " + fmtNum(b) : "");
  }
}
/* "62.5 kg × 10, 10, 9" for a list of done sets of the same load */
function setsSummary(sets, type) {
  const work = sets.filter((s) => s.t !== "warmup");
  if (!work.length) return "";
  if (!work.some((s) => s.a != null || s.b != null)) return work.length + (work.length === 1 ? " set" : " sets");
  if (type === "wr" && work.every((s) => s.a === work[0].a) && work[0].a != null) {
    return fmtNum(work[0].a) + " kg × " + work.map((s) => s.b == null ? "-" : fmtNum(s.b)).join(", ");
  }
  return work.map((s) => setText(s, type)).join(", ");
}

/* ===============================================================
   Store
=============================================================== */

const SKEY = "ts-v2";                 /* key kept from v2 so other pages still find it */
let store = null;

function freshStore() {
  const s = {
    v: 4, theme: "system", program: TEMPLATES[0].id, programOrder: [], programs: {},
    deload: false, lastDay: {}, lastOpen: null,
    today: { date: todayISO(), sessions: {} },
    history: [], metrics: [], custom: [], exNote: {}, timer: null,
    settings: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], daySelect: "auto", rir: false, sound: true, repsUp: 10 },
    backup: { lastAt: null, countAtLast: 0 }
  };
  TEMPLATES.forEach((t) => { s.programs[t.id] = programFromTemplate(t); s.programOrder.push(t.id); });
  return s;
}

function programFromTemplate(t, newId) {
  const p = clone(t);
  p.id = newId || t.id;
  p.template = t.id;
  p.days.forEach((d) => { d.items = d.items.map((it, i) => normItem(it, d.id + "-" + i)); });
  return p;
}

/* internal item shape: { uid, opts: [{ex, n, img}], pick, sets, reps, rest?, tag?, cue?, p?, s?, type?, ss? } */
function normItem(it, fallbackUid) {
  const o = Object.assign({}, it);
  if (!Array.isArray(o.opts) || !o.opts.length) o.opts = [{ ex: o.ex, n: o.n, img: o.img }];
  delete o.ex; delete o.n; delete o.img;
  o.opts = o.opts.map((x) => ({ ex: x.ex, n: x.n || null, img: x.img || null }));
  o.uid = o.uid || fallbackUid || uid();
  o.pick = clamp(o.pick | 0, 0, o.opts.length - 1);
  o.sets = Math.max(1, parseInt(o.sets, 10) || 3);
  o.reps = o.reps == null ? "" : String(o.reps);
  return o;
}

function newItem(exId, extra) {
  const info = exInfo(exId);
  return normItem(Object.assign({
    opts: [{ ex: exId }],
    sets: info.type === "cardio" ? 1 : 3,
    reps: DEFAULT_REPS[info.type] || "8-12"
  }, extra || {}));
}

/* v2 had per-set weight/reps; v3 turned sets into booleans */
function migrateV2(o) {
  delete o.last;
  const sess = (o.today && o.today.sessions) || {};
  Object.keys(sess).forEach((k) => {
    const entries = sess[k] && sess[k].entries;
    if (!entries) return;
    Object.keys(entries).forEach((ei) => {
      const e = entries[ei];
      if (Array.isArray(e.sets)) e.sets = e.sets.map((x) => (x && typeof x === "object") ? !!x.done : !!x);
    });
  });
  (o.history || []).forEach((h) => {
    if (h.pct == null) h.pct = h.setsTotal ? Math.round(h.setsDone / h.setsTotal * 100) : 0;
    delete h.volume;
    if (Array.isArray(h.lines)) {
      h.lines = h.lines.map((l) => ({ n: l.n, done: (l.sets ? l.sets.length : l.done) || 0, total: l.total || (l.sets ? l.sets.length : 0) }));
    }
  });
  o.v = 3;
}

/* v3: programmes lived in code, sessions keyed by day index, sets were booleans */
function migrateV3(o) {
  const programs = {}, order = [];
  TEMPLATES.forEach((t) => { programs[t.id] = programFromTemplate(t); order.push(t.id); });

  Object.keys(o.variants || {}).forEach((k) => {
    const parts = k.split(":");
    const day = programs[parts[0]] && programs[parts[0]].days[+parts[1]];
    if (!day) return;
    const it = day.items.find((x) => x.opts.length > 1 && parts[2].indexOf(slug(x.opts[0].n) + "-or") === 0);
    if (it) it.pick = clamp(o.variants[k] | 0, 0, it.opts.length - 1);
  });

  const dayAt = (pg, di) => (programs[pg] && programs[pg].days[+di]) || null;

  const sessions = {};
  Object.keys((o.today && o.today.sessions) || {}).forEach((k) => {
    const sess = o.today.sessions[k];
    const parts = k.split(":");
    const day = dayAt(parts[0], parts[1]);
    if (!day || !sess) return;
    const entries = {};
    Object.keys(sess.entries || {}).forEach((i) => {
      const it = day.items[+i], e = sess.entries[i];
      if (!it || !e) return;
      const sets = it.type === "cardio"
        ? [{ t: "work", a: null, b: null, done: !!e.cardio }]
        : (e.sets || []).map((d) => ({ t: "work", a: null, b: null, done: !!d }));
      entries[it.uid] = { sets, note: "", swap: null, n: null };
    });
    sessions[parts[0] + ":" + day.id] = {
      startedAt: sess.startedAt || null, lastAt: sess.lastAt || null,
      pausedAt: sess.pausedAt || null, pausedMs: sess.pausedMs || 0,
      entries, extra: [], removed: [], order: null
    };
  });
  o.today = { date: (o.today && o.today.date) || todayISO(), sessions };

  (o.history || []).forEach((hh) => {
    const p = programs[hh.program];
    const day = p && p.days.find((d) => d.title === hh.title || d.name === hh.title);
    hh.id = hh.id || uid();
    hh.dayId = day ? day.id : null;
    hh.programName = p ? p.name : hh.program;
    hh.legacy = true;
    hh.lines = (hh.lines || []).map((l) => {
      const ex = guessExId(l.n, day);
      const info = ex != null ? exInfo(ex) : null;
      return { ex, n: l.n, type: l.cardio ? "cardio" : (info ? info.type : "wr"), done: l.done || 0, total: l.total || 0,
               p: info ? info.p : [], s: info ? info.s : [], sets: [] };
    });
  });

  const lastDay = {};
  Object.keys(o.lastDay || {}).forEach((pg) => { const d = dayAt(pg, o.lastDay[pg]); if (d) lastDay[pg] = d.id; });

  o.programs = programs;
  o.programOrder = order;
  o.lastDay = lastDay;
  if (!programs[o.program]) o.program = order[0];
  if (o.theme !== "dark") o.theme = "system";
  delete o.variants;
  o.v = 4;
}

function guessExId(name, day) {
  const want = String(name || "").toLowerCase();
  const pools = [];
  if (day) pools.push(day.items.reduce((a, it) => a.concat(it.opts), []));
  TEMPLATES.forEach((t) => t.days.forEach((d) => pools.push(d.items.reduce((a, it) => a.concat(it.opts || [it]), []))));
  for (const pool of pools) {
    const hit = pool.find((x) => x.n && x.n.toLowerCase() === want);
    if (hit) return hit.ex;
  }
  const best = bestExerciseMatch(name);
  return best ? best.id : null;
}

/* bring any stored shape up to v4 and fill defaults; null if unusable */
function upgradeStore(o) {
  if (!o || typeof o !== "object") return null;
  if (o.v === 2) migrateV2(o);
  if (o.v === 3) migrateV3(o);
  if (o.v !== 4) return null;
  const f = freshStore();
  Object.keys(f).forEach((k) => { if (o[k] == null) o[k] = f[k]; });
  /* a half-written store should lose one field, not everything */
  ["programOrder", "history", "metrics", "custom"].forEach((k) => { if (!Array.isArray(o[k])) o[k] = f[k]; });
  ["programs", "lastDay", "exNote", "settings", "backup", "today"].forEach((k) => { if (!o[k] || typeof o[k] !== "object") o[k] = f[k]; });
  o.settings = Object.assign(f.settings, o.settings);
  o.backup = Object.assign(f.backup, o.backup);
  o.programOrder = o.programOrder.filter((id) => o.programs[id]);
  Object.keys(o.programs).forEach((id) => {
    if (o.programOrder.indexOf(id) === -1) o.programOrder.push(id);
    const p = o.programs[id];
    p.id = id;
    p.days = (p.days || []).map((d) => Object.assign({ id: uid(), name: "Day", title: "", focus: "" }, d));
    p.days.forEach((d) => { d.items = (d.items || []).map((it) => normItem(it)); });
    p.notes = p.notes || [];
  });
  if (!o.programOrder.length) { const fp = freshStore(); o.programs = fp.programs; o.programOrder = fp.programOrder; }
  if (!o.programs[o.program]) o.program = o.programOrder[0];
  o.today = o.today && o.today.date ? o.today : { date: todayISO(), sessions: {} };
  o.today.sessions = o.today.sessions || {};
  Object.values(o.today.sessions).forEach((s) => {
    s.entries = s.entries || {}; s.extra = (s.extra || []).map((it) => normItem(it)); s.removed = s.removed || [];
  });
  o.history.forEach((hh) => { hh.id = hh.id || uid(); hh.lines = hh.lines || []; });
  o.history.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return o;
}

function loadStore() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(SKEY)); } catch (e) {}
  let s = null;
  try { s = upgradeStore(o); } catch (e) { console.error("Could not read saved data", e); }
  if (s) return s;
  s = freshStore();
  try {
    if (localStorage.getItem("training-split-theme") === "dark") s.theme = "dark";
    const op = localStorage.getItem("training-split-program");
    if (s.programs[op]) s.program = op;
  } catch (e) {}
  return s;
}

let saveTimer = null;
let savesBlocked = false;
function save()    { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 150); }
function saveNow() {
  clearTimeout(saveTimer);
  if (savesBlocked) return;
  try { localStorage.setItem(SKEY, JSON.stringify(store)); }
  catch (e) { if (typeof toast === "function") toast("Could not save: storage is full. Export a backup and free space."); }
}
/* before replacing or erasing the stored data and reloading: stop the
   unload handlers from writing the old in-memory copy back */
function blockSaves() {
  savesBlocked = true;
  clearTimeout(saveTimer);
}

/* ===============================================================
   Programme and session model
=============================================================== */

const view = { tab: "today", dayId: null };

const activeProg = () => store.programs[store.program];
function curDay() {
  const p = activeProg();
  return (p && (p.days.find((d) => d.id === view.dayId) || p.days[0])) || null;
}
const sessKey = (pid, dayId) => pid + ":" + dayId;

function newSession() {
  return { startedAt: null, lastAt: null, pausedAt: null, pausedMs: 0, entries: {}, extra: [], removed: [], order: null };
}
function getSession(pid, dayId, create) {
  const k = sessKey(pid, dayId);
  let s = store.today.sessions[k];
  if (!s && create) { s = newSession(); store.today.sessions[k] = s; }
  return s || null;
}
function curSession(create) {
  const d = curDay();
  return d ? getSession(store.program, d.id, create) : null;
}
function touch(sess) {
  sess.startedAt = sess.startedAt || Date.now();
  if (sess.pausedAt) { sess.pausedMs = (sess.pausedMs || 0) + (Date.now() - sess.pausedAt); sess.pausedAt = null; }
  sess.lastAt = Date.now();
}
function elapsedAt(sess, at) {
  if (!sess || !sess.startedAt) return 0;
  const end = sess.pausedAt || at || Date.now();
  return Math.max(0, end - sess.startedAt - (sess.pausedMs || 0));
}
function sessionState(sess) {
  if (!sess || !sess.startedAt) return "idle";
  return sess.pausedAt ? "paused" : "running";
}

/* the day's items as today will run them: programme items, plus extras, minus
   removed, in session order, always grouped warm-up, workout, stretching, cooldown */
function sessionItems(day, sess) {
  let items = day.items.slice();
  if (sess) {
    items = items.concat(sess.extra || []);
    if (sess.removed && sess.removed.length) items = items.filter((it) => sess.removed.indexOf(it.uid) === -1);
    if (sess.order) {
      const pos = new Map(sess.order.map((u, i) => [u, i]));
      const base = new Map(items.map((it, i) => [it.uid, i]));
      items.sort((a, b) => (pos.has(a.uid) ? pos.get(a.uid) : 1000 + base.get(a.uid)) - (pos.has(b.uid) ? pos.get(b.uid) : 1000 + base.get(b.uid)));
    }
  }
  /* a warm-up added to today alone would otherwise sit after the programme's exercises */
  items.sort((a, b) => sectionRank(a) - sectionRank(b));
  return items;
}

/* resolve what an item means right now: chosen alternative or today's swap */
function slotInfo(item, entry) {
  const swapped = !!(entry && entry.swap);
  const opt = swapped ? entry.swap : (item.opts[item.pick || 0] || item.opts[0]);
  const info = exInfo(opt.ex);
  return {
    opt, info, swapped,
    type: swapped ? info.type : (item.type || info.type),
    name: opt.n || info.n,
    img: imageFor(swapped ? null : opt, info),
    p: (!swapped && item.p) ? item.p : info.p,
    s: (!swapped && item.s) ? item.s : info.s
  };
}

function plannedSets(item) {
  const b = item.sets || 1;
  if (item.section) return b;              /* deload halves the workout, not the warm-up or stretches */
  return store.deload ? Math.max(1, Math.round(b / 2)) : b;
}
const newSet = (t) => ({ t: t || "work", a: null, b: null, rir: null, done: false });

function ensureEntry(sess, item) {
  let e = sess.entries[item.uid];
  if (!e) { e = { sets: [], note: "", swap: null, n: null }; sess.entries[item.uid] = e; }
  const n = e.n != null ? e.n : plannedSets(item);
  let work = e.sets.filter((s) => s.t !== "warmup").length;
  while (work < n) { e.sets.push(newSet()); work++; }
  if (e.n == null) {
    while (work > n) {
      const last = e.sets[e.sets.length - 1];
      if (!last || last.done || last.a != null || last.b != null || last.t === "warmup") break;
      e.sets.pop(); work--;
    }
  }
  return e;
}
function entryProgress(item, e) {
  if (e && e.skipped) return { done: 0, total: 0 };
  const work = e ? e.sets.filter((s) => s.t !== "warmup") : null;
  const total = work ? Math.max(work.length, 0) : plannedSets(item);
  const done = work ? work.filter((s) => s.done).length : 0;
  return { done: Math.min(done, total), total };
}
function entryDone(item, e) {
  if (e && e.skipped) return true;
  const p = entryProgress(item, e);
  return p.total > 0 && p.done >= p.total;
}
/* the workout's own progress; warm-up and stretching sets are counted separately */
function dayProgress(day, sess) {
  let done = 0, total = 0, extra = 0, extraTotal = 0;
  sessionItems(day, sess).forEach((it) => {
    const p = entryProgress(it, sess && sess.entries[it.uid]);
    if (it.section) { extra += p.done; extraTotal += p.total; return; }
    done += p.done; total += p.total;
  });
  return { done, total, extra, extraTotal, pct: total ? Math.round(done / total * 100) : 0 };
}
function anyLogged(sess) {
  return !!sess && Object.keys(sess.entries || {}).some((k) => {
    const e = sess.entries[k];
    return e && e.sets && e.sets.some((s) => s.done);
  });
}

/* rest after a set: item setting, else from the rep range */
function restFor(item, si) {
  if (item.rest != null) return item.rest;
  if (si.type === "cardio") return 0;
  if (si.type === "time" || si.type === "dist") return 60;
  const t = parseTarget(item.reps);
  const top = t.max || 10;
  return top <= 8 ? 150 : top <= 12 ? 90 : 60;
}

function supersetLabel(items, item) {
  if (!item.ss) return null;
  const groups = [];
  items.forEach((it) => { if (it.ss && groups.indexOf(it.ss) === -1) groups.push(it.ss); });
  return "Superset " + String.fromCharCode(65 + groups.indexOf(item.ss));
}

/* ---------- history commit ---------- */

function summarize(day, sess) {
  let setsDone = 0, setsTotal = 0, volume = 0, extraSets = 0;
  const lines = [];
  sessionItems(day, sess).forEach((it) => {
    const e = sess.entries[it.uid];
    const si = slotInfo(it, e);
    const base = { ex: si.info.id, n: si.name, type: si.type, p: si.p, s: si.s };
    if (it.section) base.section = it.section;
    if (e && e.skipped) { lines.push(Object.assign(base, { done: 0, total: 0, skipped: true, sets: [] })); return; }
    const pr = entryProgress(it, e);
    if (it.section) extraSets += pr.done;
    else { setsDone += pr.done; setsTotal += pr.total; }
    const sets = e ? e.sets.filter((s) => s.done).map((s) => {
      const o = { t: s.t, a: s.a, b: s.b };
      if (s.rir != null) o.rir = s.rir;
      return o;
    }) : [];
    if (si.type === "wr" && !it.section) sets.forEach((s) => { if (s.t !== "warmup" && s.a && s.b) volume += s.a * s.b; });
    const line = Object.assign(base, { done: pr.done, total: pr.total, sets });
    if (e && e.note) line.note = e.note;
    lines.push(line);
  });
  return { setsDone, setsTotal, extraSets, pct: setsTotal ? Math.round(setsDone / setsTotal * 100) : 0, volume: Math.round(volume), lines };
}

function commitSession(pid, dayId, sess, endTs, dateISO) {
  const p = store.programs[pid];
  const day = p && p.days.find((d) => d.id === dayId);
  if (!day) return null;
  const s = summarize(day, sess);
  const entry = {
    id: uid(), date: dateISO || todayISO(), ts: endTs, program: pid, programName: p.name,
    dayId, title: day.title || day.name, dur: elapsedAt(sess, endTs),
    pct: s.pct, setsDone: s.setsDone, setsTotal: s.setsTotal, volume: s.volume, lines: s.lines
  };
  markPRs(entry);
  store.history.push(entry);
  store.history.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  invalidateStats();
  return entry;
}

/* roll an unfinished session from a previous day into history */
function rolloverIfNeeded() {
  if (store.today.date === todayISO()) return false;
  Object.keys(store.today.sessions).forEach((k) => {
    const sess = store.today.sessions[k];
    if (!sess || !anyLogged(sess)) return;
    const i = k.indexOf(":");
    commitSession(k.slice(0, i), k.slice(i + 1), sess, sess.lastAt || sess.startedAt || Date.now(), store.today.date);
  });
  store.today = { date: todayISO(), sessions: {} };
  store.timer = null;
  saveNow();
  return true;
}

/* which day to land on when the app opens */
function suggestedDay(p) {
  if (!p.days.length) return null;
  const mode = store.settings.daySelect;
  const byWeekday = mode === "weekday" || (mode === "auto" && p.days.length >= 6);
  if (byWeekday) {
    const g = new Date().getDay();                 /* 0 = Sunday */
    const idx = g === 0 ? (p.days.length >= 7 ? 6 : 0) : g - 1;
    return p.days[Math.min(idx, p.days.length - 1)].id;
  }
  const last = store.history.find((x) => x.program === p.id && x.dayId && x.setsDone > 0);
  if (!last) return p.days[0].id;
  const i = p.days.findIndex((d) => d.id === last.dayId);
  return p.days[(i + 1) % p.days.length].id;
}
function chooseDay() {
  const p = activeProg();
  if (!p || !p.days.length) { view.dayId = null; return; }
  const firstToday = store.lastOpen !== todayISO();
  store.lastOpen = todayISO();
  const live = Object.keys(store.today.sessions).find((k) => k.indexOf(p.id + ":") === 0 && anyLogged(store.today.sessions[k]));
  if (live) view.dayId = live.slice(p.id.length + 1);
  else if (firstToday) view.dayId = suggestedDay(p);
  else view.dayId = store.lastDay[p.id];
  if (!p.days.some((d) => d.id === view.dayId)) view.dayId = p.days[0].id;
  store.lastDay[p.id] = view.dayId;
}

/* ---------- bodyweight ---------- */

function metricByDate(iso) { return store.metrics.find((m) => m.date === iso) || null; }
function getMetric(iso, key) { const e = metricByDate(iso); return e && e[key] != null ? e[key] : null; }
const getW = (iso) => getMetric(iso, "weight");
function setMetric(iso, key, val) {
  let e = metricByDate(iso);
  if (!e) {
    if (val == null) return;
    e = { date: iso, weight: null, waist: null };
    store.metrics.push(e);
  }
  e[key] = val;
  if (e.weight == null && e.waist == null) store.metrics = store.metrics.filter((m) => m !== e);
  store.metrics.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  saveNow();
}
/* mean of the logged weights in the 7 days ending on iso */
function avg7(iso) {
  const v = [];
  for (let k = 0; k < 7; k++) { const w = getW(addDays(iso, -k)); if (w != null) v.push(w); }
  return v.length ? avg(v) : null;
}
function latestMetric(key) {
  for (let i = store.metrics.length - 1; i >= 0; i--) if (store.metrics[i][key] != null) return store.metrics[i];
  return null;
}

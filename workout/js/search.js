/* ===============================================================
   Exercise search.

   Ranked so the name you meant wins:
     exact name  >  name starts with the query  >  every word starts a
     word in the name (so "curl" or "pulldown" find middle words)  >
     text anywhere  >  typos and sound-alike spellings ("romanion
     dedlift", "tricep pushdwn", "skul crusher")  >  category, muscle
     or equipment ("chest", "cable").
   Ties go to more common exercises, ones with images, and ones you
   have logged before.
=============================================================== */

const SEARCH_SYNONYMS = {
  db: ["dumbbell"], dbs: ["dumbbell"], bb: ["barbell"], kb: ["kettlebell"],
  ohp: ["overhead", "press"], rdl: ["romanian", "deadlift"], sldl: ["stiff", "legged", "deadlift"],
  bss: ["bulgarian", "split", "squat"], ghr: ["glute", "ham", "raise"], hspu: ["handstand", "push", "up"],
  tri: ["tricep"], bi: ["bicep"], bis: ["bicep"], tris: ["tricep"], abs: ["ab"],
  hammy: ["hamstring"], hams: ["hamstring"], quad: ["quadricep"], quads: ["quadricep"],
  pushup: ["push", "up"], pullup: ["pull", "up"], chinup: ["chin", "up"], situp: ["sit", "up"],
  pulldown: ["pulldown"], pecs: ["pec"], delt: ["delt"], lats: ["lat"], traps: ["trap"],
  treadmil: ["treadmill"], bike: ["bike"], cycle: ["cycle"], erg: ["ergometer"], rower: ["rowing"],
  stepper: ["stair"], crosstrainer: ["cross", "trainer"], flye: ["fly"], flys: ["fly"], flyes: ["fly"]
};

const SEARCH_STOP = new Set(["the", "a", "an", "with", "and", "of", "on", "to"]);

function stemWord(w) {
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/^(cal|hal)ves$/.test(w)) return w.slice(0, -3) + "f";
  if (/(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (/[^s]s$/.test(w) && !/(us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function searchTokens(s) {
  return String(s || "").toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().split(/\s+/).filter(Boolean).map(stemWord);
}

/* rough pronunciation key: similar-sounding spellings collapse to the same string */
function soundKey(w) {
  let s = w.replace(/ph/g, "f").replace(/ck/g, "k").replace(/qu/g, "kw").replace(/q/g, "k")
    .replace(/x/g, "ks").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/z/g, "s")
    .replace(/wh/g, "w").replace(/^kn/, "n").replace(/gh/g, "").replace(/dg/g, "j").replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
  return s.charAt(0) + s.slice(1).replace(/[aeiouhw]/g, "");
}

/* Damerau-Levenshtein, stops early once the distance passes max */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = [], prev = [], cur = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) { prev2[j] = prev[j]; prev[j] = cur[j]; }
  }
  return prev[b.length];
}
const typoAllowance = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 8 ? 2 : 3);

const EQUIP_WORDS = new Set(["dumbbell", "barbell", "cable", "machine", "kettlebell", "smith", "band", "ez", "landmine", "trap"]);

const searchIndexCache = new Map();
function searchEntry(info) {
  const key = info.id + "|" + info.n;
  let e = searchIndexCache.get(key);
  if (e) return e;
  const tokens = searchTokens(info.n);
  const muscleWords = (info.p || []).concat(info.s || []).map((m) => NAMES[m] || m).join(" ");
  const meta = searchTokens([info.cat, info.target, info.equip, info.fam, muscleWords].join(" "));
  e = {
    tokens,
    joined: tokens.join(" "),
    compact: tokens.join(""),
    sounds: tokens.map(soundKey),
    meta: Array.from(new Set(meta)),
    primary: Array.from(new Set(searchTokens([info.cat, (info.p || []).map((m) => NAMES[m] || m).join(" ")].join(" ")))),
    equip: tokens.filter((t) => EQUIP_WORDS.has(t)),
    aliases: (info.aliases || []).map((a) => { const t = searchTokens(a); return { j: t.join(" "), c: t.join("") }; })
  };
  searchIndexCache.set(key, e);
  return e;
}

function expandQuery(q) {
  const raw = searchTokens(q).filter((t) => !SEARCH_STOP.has(t));
  const out = [];
  raw.forEach((t) => { (SEARCH_SYNONYMS[t] || [t]).forEach((x) => out.push(stemWord(x))); });
  return out;
}

/* how well one query word matches a list of words:
   1 whole word, ~0.9 prefix either way, 0.8 inside a word, lower for typos and sound-alikes */
function wordMatch(qt, words, sounds) {
  let best = 0, at = -1;
  const allow = typoAllowance(qt.length);
  const qs = soundKey(qt);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let sc = 0;
    if (w === qt) sc = 1;
    else if (w.indexOf(qt) === 0) sc = 0.96;
    else if (w.length >= 3 && qt.length - w.length <= 4 && qt.indexOf(w) === 0) sc = 0.9;
    else if (qt.length >= 4 && w.indexOf(qt) > 0) sc = 0.8;
    else if (allow) {
      const d = Math.min(editDistance(qt, w, allow), qt.length < w.length ? editDistance(qt, w.slice(0, qt.length), allow) + 0.5 : 99);
      if (d <= allow) sc = 0.78 - 0.1 * d;
    }
    if (sc < 0.6 && sounds && qt.length >= 3 && qs.length >= 2 && (sounds[i] === qs || (sounds[i].indexOf(qs) === 0 && qs.length >= 3))) sc = Math.max(sc, 0.62);
    if (sc > best) { best = sc; at = i; }
    if (best === 1) break;
  }
  return { score: best, at };
}

function scoreExercise(info, q, qTokens, extras) {
  if (!qTokens.length) return 0;
  const e = searchEntry(info);
  const qJoined = qTokens.join(" ");
  const qCompact = qTokens.join("");
  /* how much of the name the query accounts for: "plank" fits "Forearm plank" better than "Plank shoulder tap" */
  const coverage = Math.min(1, qCompact.length / Math.max(1, e.compact.length));
  const n = qTokens.length;
  let score = 0;

  if (e.joined === qJoined || e.compact === qCompact) score = 1000;
  else if (e.aliases.some((a) => a.j === qJoined || a.c === qCompact)) score = 990;
  else {
    let whole = 0, near = 0, miss = 0, sum = 0, firstAt = 99, lastAt = -1, inOrder = true;
    for (const qt of qTokens) {
      const m = wordMatch(qt, e.tokens, e.sounds);
      if (m.score >= 1) whole++;
      else if (m.score >= 0.85) near++;
      if (m.score > 0) {
        sum += m.score;
        if (m.at < firstAt) firstAt = m.at;
        if (m.at < lastAt) inOrder = false;
        lastAt = m.at;
      } else miss++;
    }
    const bonus = (firstAt === 0 ? 12 : 0) + (inOrder ? 4 : 0);
    if (!miss && whole === n) score = 850 + 80 * coverage + bonus;
    else if (!miss && whole + near === n) score = 780 + 80 * coverage + bonus;
    else if (qCompact.length >= 4 && e.compact.indexOf(qCompact) !== -1) score = 760 + 80 * coverage;
    else if (miss === 1 && n >= 3 && whole + near === n - 1) score = 690 + 60 * coverage;
    else if (!miss) score = 420 + 260 * (sum / n) + (inOrder ? 4 : 0);
    else if (qCompact.length >= 5) {
      /* whole-query typo against the joined-up name, e.g. "latpuldown" */
      const allow = typoAllowance(qCompact.length);
      const d = editDistance(qCompact, e.compact.slice(0, qCompact.length + 1), allow + 1);
      if (d <= allow) score = 560 - 40 * d;
    }
    /* category and muscle words: "chest" lists chest exercises even without the word in the name */
    const inPrimary = qTokens.every((qt) => e.primary.some((w) => w === qt || (qt.length >= 4 && w.indexOf(qt) === 0)));
    if (inPrimary) score = Math.max(score, 700);
    else if (!score && qTokens.every((qt) => e.meta.some((w) => w === qt || (qt.length >= 4 && w.indexOf(qt) === 0)))) score = 300;
  }
  if (!score) return 0;
  /* asked for dumbbell, name says barbell. Imports pass the bracketed
     equipment from "Bench Press (Dumbbell)" as a hint instead. */
  const hint = (extras && extras.equipHint) || [];
  const qEquip = qTokens.concat(hint).filter((t) => EQUIP_WORDS.has(t));
  if (qEquip.length && e.equip.length && !qEquip.some((t) => e.equip.indexOf(t) !== -1)) score -= hint.length ? 150 : 60;
  if (hint.length && hint.some((t) => e.meta.indexOf(t) !== -1 || e.tokens.indexOf(t) !== -1)) score += 40;
  score += info.tier === 1 ? 30 : info.tier === 2 ? 15 : 0;
  if (EX_IMAGES[String(info.id)]) score += 4;
  if (extras && extras.used && extras.used.has(info.id)) score += 10;
  return score;
}

function usedExerciseIds() {
  const s = new Set();
  if (!store) return s;
  store.history.forEach((hh) => (hh.lines || []).forEach((l) => { if (l.ex != null) s.add(l.ex); }));
  return s;
}

/* search the catalogue plus custom exercises.
   opts: { limit, cat, pool } -> [{ info, score }] */
function searchExercises(q, opts) {
  opts = opts || {};
  const pool = (opts.pool || allExercises()).filter((x) => !opts.cat || x.cat === opts.cat);
  const qTokens = expandQuery(q);
  const used = usedExerciseIds();
  if (!qTokens.length) {
    return pool.map((info) => ({ info, score: (used.has(info.id) ? 30 : 0) + (4 - info.tier) * 5 }))
      .sort((a, b) => b.score - a.score || a.info.n.localeCompare(b.info.n))
      .slice(0, opts.limit || pool.length);
  }
  const out = [];
  pool.forEach((info) => {
    const sc = scoreExercise(info, q, qTokens, { used });
    if (sc > 0) out.push({ info, score: sc });
  });
  out.sort((a, b) => b.score - a.score || a.info.n.length - b.info.n.length);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/* best confident match for an imported name like "Bench Press (Barbell)" */
/* opts.types limits the pool, e.g. ["cardio", "time"] when the imported sets have no reps */
function bestExerciseMatch(name, opts) {
  if (!name) return null;
  let q = String(name).trim();
  let hint = [];
  const paren = q.match(/^(.*)\(([^)]+)\)\s*$/);
  if (paren) {
    q = paren[1].trim();
    hint = searchTokens(paren[2]);
    /* "Incline Bench Press (Dumbbell)" is an incline dumbbell press */
    if (hint.some((t) => t === "dumbbell" || t === "machine" || t === "smith" || t === "cable" || t === "kettlebell")) q = q.replace(/\bbench\b/i, " ");
  }
  let pool = typeof store !== "undefined" && store ? allExercises() : Array.from(CATALOG.values());
  if (opts && opts.types) pool = pool.filter((x) => opts.types.indexOf(x.type) !== -1);
  /* try the name alone and with its equipment in front: "Deadlift" and "Barbell Deadlift" */
  const variants = [q];
  if (hint.length) variants.push(hint.join(" ") + " " + q);
  let best = null, bestScore = 0;
  variants.forEach((v) => {
    const qTokens = expandQuery(v);
    if (!qTokens.length) return;
    pool.forEach((info) => {
      const sc = scoreExercise(info, v, qTokens, { equipHint: hint });
      if (sc > bestScore) { best = info; bestScore = sc; }
    });
  });
  return bestScore >= 720 ? best : null;
}

/* wrap the words of `name` that the query matched in <mark> */
function highlightName(name, q) {
  const qTokens = expandQuery(q);
  if (!qTokens.length) return esc(name);
  return String(name).split(/(\s+|[\/(),-])/).map((part) => {
    const t = stemWord(part.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (!t) return esc(part);
    const hit = qTokens.some((qt) => t.indexOf(qt) === 0 || (qt.length >= 4 && editDistance(qt, t.slice(0, qt.length), typoAllowance(qt.length)) <= typoAllowance(qt.length)));
    return hit ? "<mark>" + esc(part) + "</mark>" : esc(part);
  }).join("");
}

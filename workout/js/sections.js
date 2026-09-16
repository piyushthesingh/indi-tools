/* ===============================================================
   Sections: warm-up, stretching and cooldown packages.

   Picking a section suggests exercises for the body areas the day
   trains, read from its name and focus ("Pull 1" → back, "Legs" →
   legs), or from its exercises' muscles when the name says nothing.

   Doses follow common guidance:
   - warm-up: 5 min easy cardio, then dynamic moves for the day's muscles
   - stretching: static holds of about 30 s, 2 rounds each (ACSM suggests
     10-30 s holds, repeated to about 60 s per stretch)
   - cooldown: 5 min easy cardio, longer holds of 45-60 s, then slow breathing
   Package rows: [catalogue id, sets, reps/time]
=============================================================== */

const SECTIONS = [
  { id: "warmup", name: "Warm-up", icon: "flame", where: "start",
    hint: "5 minutes of easy cardio, then dynamic moves for today's muscles. Goes at the start." },
  { id: "stretch", name: "Stretching", icon: "stretch", where: "end",
    hint: "Static holds for the muscles you trained, about 30 seconds, 2 rounds each. Goes at the end." },
  { id: "cooldown", name: "Cooldown", icon: "cool", where: "end",
    hint: "Easy cardio, a few long holds and slow breathing to bring your heart rate down. Goes at the end." }
];
/* the exercises with no section are the workout itself */
const sectionName = (id) => { if (!id) return "Workout"; const s = SECTIONS.find((x) => x.id === id); return s ? s.name : ""; };
const sectionIcon = (id) => { if (!id) return "today"; const s = SECTIONS.find((x) => x.id === id); return s ? s.icon : "stretch"; };
const sectionRank = (it) => (it.section === "warmup" ? 0 : !it.section ? 1 : it.section === "stretch" ? 2 : 3);
/* keep a list in warm-up, workout, stretching, cooldown order */
function placeBySection(items, it) {
  const i = items.indexOf(it);
  if (i === -1) return;
  items.splice(i, 1);
  const r = sectionRank(it);
  let at = items.length;
  for (let k = 0; k < items.length; k++) { if (sectionRank(items[k]) > r) { at = k; break; } }
  items.splice(at, 0, it);
}

const REGIONS = [["back", "Back"], ["chest", "Chest"], ["shoulders", "Shoulders"], ["arms", "Arms"], ["legs", "Legs"], ["hips", "Hips & glutes"], ["core", "Core"], ["full", "Full body"]];

/* words in a day's name or focus that point at a body area */
const REGION_WORDS = {
  back: ["back", "pull", "pulls", "pulling", "lat", "lats", "row", "rows", "rowing", "rhomboid", "rhomboids", "trap", "traps", "deadlift", "deadlifts", "width", "thickness", "posterior-chain"],
  chest: ["chest", "push", "pushing", "pec", "pecs", "bench"],
  shoulders: ["shoulder", "shoulders", "delt", "delts", "deltoid", "deltoids", "overhead", "ohp"],
  arms: ["arm", "arms", "bicep", "biceps", "tricep", "triceps", "forearm", "forearms", "grip", "curl", "curls", "gun", "guns"],
  legs: ["leg", "legs", "quad", "quads", "quadricep", "quadriceps", "squat", "squats", "calf", "calves", "knee", "shin", "shins"],
  hips: ["glute", "glutes", "hip", "hips", "hamstring", "hamstrings", "ham", "hams", "posterior", "adductor", "adductors", "abductor", "abductors", "booty"],
  core: ["core", "ab", "abs", "abdominal", "abdominals", "oblique", "obliques", "trunk"],
  full: ["full", "total", "whole"]
};
const REGION_EXPAND = { upper: ["back", "chest", "shoulders"], lower: ["legs", "hips"], push: ["chest", "shoulders"] };
/* "upper" and "lower" name a body half only in the day's name or before "body";
   in a focus line like "chest light and lower" they don't */
const HALF_WORDS = ["upper", "lower"];
const MUSCLE_REGION = {
  lats: "back", midback: "back", traps: "back", erectors: "back", "delts-rear": "shoulders",
  chest: "chest", delts: "shoulders", rotator: "shoulders", biceps: "arms", triceps: "arms", forearms: "arms",
  quads: "legs", calves: "legs", tibialis: "legs", glutes: "hips", hamstrings: "hips", adductors: "hips",
  abductors: "hips", hipflex: "hips", abs: "core", obliques: "core"
};

const PACKAGES = {
  warmup: {
    primary: 3, cap: 5,
    start: (regions) => regions.every((r) => r === "legs" || r === "hips") ? [[211, 1, "5 min"]] : [[214, 1, "5 min"]],
    regions: {
      back: [[233, 1, "10 per direction"], [234, 1, "10 reps"], [124, 1, "15 reps"], [1026, 1, "8 reps"], [229, 1, "8 reps"]],
      chest: [[233, 1, "10 per direction"], [234, 1, "10 reps"], [124, 1, "15 reps"], [230, 1, "6 per side"], [80, 1, "10 reps"]],
      shoulders: [[233, 1, "10 per direction"], [234, 1, "10 reps"], [124, 1, "15 reps"], [230, 1, "6 per side"], [1026, 1, "8 reps"]],
      arms: [[233, 1, "10 per direction"], [124, 1, "15 reps"], [234, 1, "10 reps"]],
      legs: [[232, 1, "10 per leg"], [1027, 1, "10 per direction"], [231, 1, "5 per side"], [8, 1, "10 reps"], [37, 1, "12 reps"]],
      hips: [[232, 1, "10 per leg"], [1027, 1, "10 per direction"], [231, 1, "5 per side"], [37, 1, "12 reps"], [55, 1, "10 steps per side"]],
      core: [[229, 1, "8 reps"], [163, 1, "8 per side"], [164, 1, "8 per side"], [1025, 1, "5 reps"]],
      full: [[1025, 1, "5 reps"], [231, 1, "5 per side"], [232, 1, "10 per leg"], [233, 1, "10 per direction"], [8, 1, "10 reps"]]
    }
  },
  stretch: {
    primary: 4, cap: 6,
    regions: {
      back: [[1003, 2, "30 sec"], [228, 2, "30 sec"], [1006, 2, "30 sec per side"], [1005, 2, "30 sec per side"], [1004, 2, "30 sec"], [1010, 2, "30 sec per side"]],
      chest: [[1007, 2, "30 sec"], [1008, 2, "30 sec per side"], [1009, 2, "30 sec per side"], [1013, 2, "30 sec per side"], [230, 2, "6 per side"], [1014, 2, "30 sec per side"]],
      shoulders: [[1008, 2, "30 sec per side"], [1013, 2, "30 sec per side"], [1007, 2, "30 sec"], [1014, 2, "30 sec per side"], [1006, 2, "30 sec per side"], [1009, 2, "30 sec per side"]],
      arms: [[1010, 2, "30 sec per side"], [1009, 2, "30 sec per side"], [1011, 2, "30 sec"], [1012, 2, "30 sec"], [1008, 2, "30 sec per side"]],
      legs: [[225, 2, "30 sec per side"], [224, 2, "30 sec per side"], [226, 2, "30 sec per side"], [1015, 2, "30 sec per side"], [227, 2, "30 sec"], [1017, 2, "30 sec"]],
      hips: [[1018, 2, "30 sec per side"], [1019, 2, "30 sec per side"], [223, 2, "30 sec per side"], [1020, 2, "30 sec per side"], [1016, 2, "30 sec"], [1021, 2, "30 sec"]],
      core: [[1022, 2, "30 sec"], [1023, 2, "30 sec per side"], [228, 2, "30 sec"], [1004, 2, "30 sec"], [1005, 2, "30 sec per side"]],
      full: [[228, 2, "30 sec"], [223, 2, "30 sec per side"], [224, 2, "30 sec per side"], [1007, 2, "30 sec"], [1008, 2, "30 sec per side"], [1018, 2, "30 sec per side"]]
    }
  },
  cooldown: {
    primary: 3, cap: 5,
    start: () => [[206, 1, "5 min"]],
    end: [[1024, 1, "2 min"]],
    regions: {
      back: [[222, 1, "60 sec per side"], [1003, 1, "60 sec"], [228, 1, "60 sec"], [1005, 1, "60 sec per side"]],
      chest: [[1028, 1, "60 sec"], [1007, 1, "60 sec"], [1008, 1, "45 sec per side"], [1009, 1, "45 sec per side"]],
      shoulders: [[1028, 1, "60 sec"], [1008, 1, "45 sec per side"], [1007, 1, "60 sec"], [1013, 1, "45 sec per side"]],
      arms: [[1010, 1, "45 sec per side"], [1009, 1, "45 sec per side"], [1011, 1, "45 sec"]],
      legs: [[220, 1, "60 sec per side"], [219, 1, "60 sec per side"], [225, 1, "45 sec per side"], [224, 1, "45 sec per side"], [226, 1, "45 sec per side"]],
      hips: [[221, 1, "60 sec per side"], [1029, 1, "60 sec per side"], [1018, 1, "60 sec per side"], [223, 1, "45 sec per side"]],
      core: [[1022, 1, "45 sec"], [228, 1, "60 sec"], [1005, 1, "45 sec per side"]],
      full: [[228, 1, "60 sec"], [223, 1, "45 sec per side"], [1018, 1, "45 sec per side"], [1007, 1, "45 sec"]]
    }
  }
};

/* body areas a day trains, in the order its name and focus mention them */
function detectRegions(day) {
  const split = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const nameWords = split(day.name);
  const words = split([day.name, day.title, day.focus].filter(Boolean).join(" "));
  const regions = [], matched = [];
  const add = (r, w) => {
    if (regions.indexOf(r) === -1) regions.push(r);
    if (matched.indexOf(w) === -1) matched.push(w);
  };
  words.forEach((w, i) => {
    if (HALF_WORDS.indexOf(w) !== -1 && nameWords.indexOf(w) === -1 && words[i + 1] !== "body") return;
    if (REGION_EXPAND[w]) { REGION_EXPAND[w].forEach((r) => add(r, w)); return; }
    Object.keys(REGION_WORDS).forEach((r) => { if (REGION_WORDS[r].indexOf(w) !== -1) add(r, w); });
  });
  if (regions.length) {
    return { regions, reason: "Suggested for “" + (day.title || day.name) + "” because it mentions " + matched.slice(0, 3).map((w) => "“" + w + "”").join(", ") + "." };
  }
  const counts = {};
  day.items.forEach((it) => {
    const si = slotInfo(it, null);
    if (it.section || isMobility(si.info)) return;
    (si.p || []).forEach((m) => { const r = MUSCLE_REGION[m]; if (r) counts[r] = (counts[r] || 0) + plannedSets(it); });
  });
  const byCount = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
  if (byCount.length) return { regions: byCount, reason: "Suggested from the muscles this day trains most." };
  return { regions: ["full"], reason: "A general package, since this day has no exercises yet." };
}

/* the package for a section and body areas: the first area leads, the rest fill in turn */
function packageFor(sectionId, regions) {
  const P = PACKAGES[sectionId];
  const rs = regions.length ? regions : ["full"];
  const out = [], seen = new Set();
  const push = (row) => {
    if (seen.has(row[0]) || !CATALOG.has(row[0])) return false;
    seen.add(row[0]);
    out.push({ ex: row[0], sets: row[1], reps: row[2] });
    return true;
  };
  (P.start ? P.start(rs) : []).forEach(push);
  const lists = rs.map((r) => (P.regions[r] || []).slice());
  let middle = 0;
  const first = lists[0];
  while (first.length && middle < Math.min(P.primary, P.cap)) { if (push(first.shift())) middle++; }
  let moved = true;
  while (middle < P.cap && moved) {
    moved = false;
    lists.forEach((l) => {
      while (l.length && middle < P.cap) {
        if (push(l.shift())) { middle++; moved = true; break; }
      }
    });
  }
  (P.end || []).forEach(push);
  return out;
}

#!/usr/bin/env python3
"""
Build step for Training Split. Standard library only (plus macOS `sips`).

    python3 tools/build.py                 # uses tools/exercise-catalogue.xlsx
    python3 tools/build.py path/to/new.xlsx

What it does, in order:

1. Reads the exercise catalogue spreadsheet (sheet "Master Catalogue",
   header row starting with "ID") and writes js/catalog.js.
2. Optimises every PNG in assets/Exercises/ into
      assets/Exercises/web/<name>.jpg    ~720 px, for the exercise sheet
      assets/Exercises/thumb/<name>.jpg  ~320 px, for list thumbnails
   <name> is the file name lower-cased with spaces trimmed. Only PNGs newer
   than their JPEGs are re-encoded; JPEGs whose PNG is gone are deleted.
3. Links images to catalogue exercises and writes js/images.js.
   A PNG is linked automatically when its file name is the slug of a
   catalogue name, with or without a leading "NN-" number, e.g.
      front-squat.png  or  212-front-squat.png  ->  "Front squat"
   Names with a slash or "or" match either side: "pec-deck.png" -> "Pec deck / machine fly".
   Anything that does not follow the rule goes in tools/image-map.json.
4. Writes sw-manifest.js: the offline pre-cache list and a build id that
   changes whenever an app file or image changes, so installed apps see
   the "new version" prompt.

Run it after changing the spreadsheet, adding images, or editing any
app file, then deploy the folder.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_REL = "assets/Exercises"
EX_DIR = os.path.join(ROOT, *IMG_REL.split("/"))
WEB_DIR = os.path.join(EX_DIR, "web")
THUMB_DIR = os.path.join(EX_DIR, "thumb")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

# Exercises the app needs that the spreadsheet does not list. Same columns.
EXTRAS = [
    [1001, "Back", "Pull-up negative", "Lats, upper back, biceps", "Eccentric vertical pull", "Pull-up bar", "Tier 2"],
    [1002, "Back", "Bent-over dumbbell row", "Lats, upper back", "Horizontal pull", "Dumbbells", "Tier 1"],
    # stretching, cooldown and warm-up moves used by the section packages (js/sections.js)
    [1003, "Mobility / recovery", "Kneeling lat stretch", "Lats, upper back", "Static stretch", "Bench or floor", "Tier 2"],
    [1004, "Mobility / recovery", "Knees-to-chest stretch", "Lower back, glutes", "Static stretch", "Bodyweight", "Tier 2"],
    [1005, "Mobility / recovery", "Lying spinal twist", "Lower back, obliques, glutes", "Static stretch", "Bodyweight", "Tier 2"],
    [1006, "Mobility / recovery", "Thread the needle", "Upper back, rear delts, thoracic spine", "Mobility / stretch", "Bodyweight", "Tier 2"],
    [1007, "Mobility / recovery", "Doorway chest stretch", "Chest, front delts", "Static stretch", "Doorway or rack", "Tier 1"],
    [1008, "Mobility / recovery", "Cross-body shoulder stretch", "Rear delts, upper back", "Static stretch", "Bodyweight", "Tier 1"],
    [1009, "Mobility / recovery", "Overhead triceps stretch", "Triceps, lats", "Static stretch", "Bodyweight", "Tier 1"],
    [1010, "Mobility / recovery", "Biceps wall stretch", "Biceps, chest, front delts", "Static stretch", "Wall", "Tier 2"],
    [1011, "Mobility / recovery", "Wrist flexor stretch", "Forearm flexors", "Static stretch", "Bodyweight", "Tier 2"],
    [1012, "Mobility / recovery", "Wrist extensor stretch", "Forearm extensors", "Static stretch", "Bodyweight", "Tier 2"],
    [1013, "Mobility / recovery", "Sleeper stretch", "Rotator cuff, rear delts", "Static stretch", "Bodyweight", "Tier 3"],
    [1014, "Mobility / recovery", "Neck side stretch", "Upper trapezius", "Static stretch", "Bodyweight", "Tier 2"],
    [1015, "Mobility / recovery", "Couch stretch", "Quadriceps, hip flexors", "Static stretch", "Wall or bench, pad", "Tier 2"],
    [1016, "Mobility / recovery", "Seated forward fold", "Hamstrings, lower back", "Static stretch", "Bodyweight", "Tier 2"],
    [1017, "Mobility / recovery", "Kneeling shin stretch", "Tibialis anterior", "Static stretch", "Bodyweight", "Tier 3"],
    [1018, "Mobility / recovery", "Figure-four stretch", "Glutes, hip rotators", "Static stretch", "Bodyweight", "Tier 1"],
    [1019, "Mobility / recovery", "Pigeon pose", "Glutes, hip rotators, hip flexors", "Static stretch", "Bodyweight", "Tier 2"],
    [1020, "Mobility / recovery", "90/90 hip stretch", "Glutes, hip rotators, adductors", "Mobility / stretch", "Bodyweight", "Tier 2"],
    [1021, "Mobility / recovery", "Frog stretch", "Adductors", "Static stretch", "Bodyweight, pad", "Tier 3"],
    [1022, "Mobility / recovery", "Cobra stretch", "Abs, hip flexors", "Static stretch", "Bodyweight", "Tier 2"],
    [1023, "Mobility / recovery", "Standing side bend stretch", "Obliques, lats", "Static stretch", "Bodyweight", "Tier 2"],
    [1024, "Mobility / recovery", "Deep breathing", "Recovery, diaphragm", "Breathing", "Bodyweight", "Tier 2"],
    [1025, "Mobility / recovery", "Inchworm", "Hamstrings, shoulders, core", "Dynamic mobility", "Bodyweight", "Tier 2"],
    [1026, "Back", "Scapular pull-up", "Lower traps, lats", "Scapular depression", "Pull-up bar", "Tier 2"],
    [1027, "Mobility / recovery", "Hip circles", "Hips, glutes", "Dynamic mobility", "Bodyweight", "Tier 2"],
    [1028, "Mobility / recovery", "Foam roll upper back", "Upper back, thoracic spine", "Self-myofascial release", "Foam roller", "Tier 2"],
    [1029, "Mobility / recovery", "Foam roll hamstrings", "Hamstrings", "Self-myofascial release", "Foam roller", "Tier 2"],
]

# logging type where the rules below guess wrong: drills done for reps, not held
TYPE_OVERRIDES = {55: "bw", 124: "bw", 229: "bw", 230: "bw", 231: "bw", 232: "bw", 233: "bw", 234: "bw", 1025: "bw", 1027: "bw"}

# Everyday names people search for or other apps export, mapped to the
# catalogue entry they almost always mean. An alias ranks like an exact name.
ALIASES = {
    1: ["squat", "back squat", "barbell squat"],
    4: ["hack squat"],
    7: ["rear foot elevated split squat"],
    18: ["walking lunge", "walking lunges", "dumbbell lunge"],
    26: ["deadlift", "barbell deadlift"],
    28: ["dumbbell rdl"],
    29: ["romanian deadlift", "rdl", "barbell rdl"],
    35: ["hip thrust"],
    37: ["glute bridge"],
    43: ["leg curl", "hamstring curl", "seated hamstring curl"],
    44: ["lying hamstring curl"],
    51: ["abductor machine", "hip abductor"],
    52: ["adductor machine", "hip adductor"],
    56: ["calf raise"],
    61: ["heel walks", "tibialis raise"],
    62: ["bench press", "flat bench press", "bench"],
    63: ["dumbbell bench press", "dumbbell press", "dumbbell chest press"],
    64: ["incline dumbbell bench press"],
    65: ["incline bench press"],
    68: ["chest press", "seated chest press"],
    74: ["butterfly", "machine fly", "pec fly"],
    75: ["cable fly", "cable crossover"],
    79: ["push ups", "press up"],
    84: ["dips", "dip", "parallel bar dip", "triceps dip"],
    87: ["pull ups"],
    89: ["chin ups"],
    90: ["pulldown", "wide grip lat pulldown", "wide grip pulldown"],
    94: ["straight arm pulldown", "straight arm lat pulldown"],
    95: ["seated row", "cable row", "low row"],
    96: ["barbell row", "bent over row"],
    98: ["dumbbell row", "one arm dumbbell row"],
    101: ["machine row", "row machine"],
    108: ["shrugs", "dumbbell shrug", "barbell shrug"],
    109: ["overhead press", "military press", "barbell shoulder press"],
    110: ["dumbbell shoulder press", "shoulder press"],
    115: ["lateral raise", "side raise", "side lateral raise"],
    121: ["reverse fly", "rear delt raise"],
    126: ["external rotation"],
    129: ["bicep curl", "biceps curl", "dumbbell curl"],
    130: ["barbell curl", "ez bar curl"],
    141: ["triceps pushdown", "tricep pushdown", "pushdown"],
    142: ["rope pushdown", "tricep rope pushdown"],
    143: ["overhead dumbbell extension"],
    144: ["overhead triceps extension", "overhead tricep extension"],
    145: ["skullcrusher", "skull crusher"],
    152: ["plank"],
    155: ["floor crunch"],
    167: ["leg raise"],
    181: ["farmers walk", "farmer walk"],
    206: ["walking", "walk"],
    207: ["running", "run", "jogging"],
    208: ["incline walk", "incline treadmill"],
    209: ["stairs", "stairmaster", "stair master"],
    210: ["elliptical trainer"],
    211: ["cycling", "stationary bike", "exercise bike", "bike"],
    213: ["spin bike", "spinning"],
    214: ["rowing", "rowing machine", "rower"],
    1001: ["negatives", "pull up negatives"],
    225: ["quad stretch"],
    1003: ["lat stretch"],
    1004: ["lower back stretch"],
    1007: ["chest stretch", "pec stretch"],
    1008: ["shoulder stretch", "cross body stretch"],
    1009: ["tricep stretch", "triceps stretch"],
    1010: ["bicep stretch", "biceps stretch"],
    1016: ["forward fold", "toe touch"],
    1018: ["figure 4 stretch", "piriformis stretch", "glute stretch"],
    1019: ["pigeon stretch"],
    1022: ["cobra", "ab stretch"],
    1024: ["breathing", "box breathing"],
}

# Free-text "Primary target" words -> the app's muscle keys. Order matters:
# more specific phrases first.
MUSCLE_RULES = [
    (r"glute medius|hip abductors|abductors", "abductors"),
    (r"hip adductors|adductors", "adductors"),
    (r"hip rotators", "glutes"),
    (r"rear delts", "delts-rear"),
    (r"rotator cuff", "rotator"),
    (r"quadriceps|quads|legs", "quads"),
    (r"glutes?", "glutes"),
    (r"hamstrings", "hamstrings"),
    (r"gastrocnemius|soleus|calves", "calves"),
    (r"tibialis", "tibialis"),
    (r"chest", "chest"),
    (r"triceps", "triceps"),
    (r"delts|shoulders", "delts"),
    (r"latissimus|lats", "lats"),
    (r"upper back|rhomboids|mid traps|thoracic", "midback"),
    (r"trapezius|traps", "traps"),
    (r"brachioradialis|forearm|grip", "forearms"),
    (r"brachialis|biceps", "biceps"),
    (r"obliques", "obliques"),
    (r"rectus abdominis|abs|core|spinal stabilizers", "abs"),
    (r"posterior chain", "hamstrings"),
    (r"erector|lower back|back|spine", "erectors"),
    (r"hip flexors", "hipflex"),
]

TIME_NAMES = r"plank|wall sit|dead hang|hold|hollow|stretch|pose|foam roll|jump rope|jumping jack|battle-rope|mountain climber|cat.cow|open book|arm circles|leg swings"
DIST_NAMES = r"carry|sled|bear crawl"
BW_EQUIP = r"^(bodyweight|pull-up bar|dip bars|captain's chair|bench, bodyweight|wall|bench$|bench or bar|bar or suspension|box or bench$)"


def tidy(s):
    """No em or en dashes in anything the app shows."""
    return s.replace(" — ", " · ").replace("—", "-").replace("–", "-").strip()


def slug(s):
    s = s.strip().lower().replace("'", "").replace("’", "")
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s))


def image_name(filename):
    """ ' Weighted-Plank.png' -> 'weighted-plank' """
    return slug(filename[:-4])


def read_xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheet = wb.find("m:sheets", NS)[0]
    target = rels[sheet.get("{%s}id" % NS["r"])].lstrip("/")
    if not target.startswith("xl/"):
        target = "xl/" + target
    rows = []
    for row in ET.fromstring(z.read(target)).iter("{%s}row" % NS["m"]):
        vals = {}
        for c in row.findall("m:c", NS):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find("m:v", NS)
            t = c.get("t")
            if t == "s" and v is not None:
                vals[col] = shared[int(v.text)]
            elif t == "inlineStr":
                vals[col] = "".join(e.text or "" for e in c.iter("{%s}t" % NS["m"]))
            else:
                vals[col] = v.text if v is not None else ""
        rows.append(vals)
    out, started = [], False
    for r in rows:
        if not started:
            started = (r.get("A") or "").strip() == "ID"
            continue
        if not (r.get("A") or "").strip() or not (r.get("C") or "").strip():
            continue
        out.append([int(float(r["A"])), tidy(r.get("B", "")), tidy(r["C"]), tidy(r.get("D", "")),
                    tidy(r.get("E", "")), tidy(r.get("F", "")), tidy(r.get("G", ""))])
    return out


def muscles(text):
    keys = []
    for part in [p.strip().lower() for p in text.split(",") if p.strip()]:
        for rx, key in MUSCLE_RULES:
            if re.search(rx, part):
                if key not in keys:
                    keys.append(key)
                break
    return keys[:1], keys[1:]


def ex_type(ident, cat, name, family, equip):
    n, f, e = name.lower(), family.lower(), equip.lower()
    if ident in TYPE_OVERRIDES:
        return TYPE_OVERRIDES[ident]
    if ident in (88, 147):
        return "assist"
    if cat == "Cardio":
        return "cardio"
    if re.search(DIST_NAMES, n):
        return "dist"
    if cat.startswith("Mobility") or "isometric" in f or re.search(TIME_NAMES, n):
        return "time"
    if re.search(BW_EQUIP, e):
        return "bw"
    return "wr"


def build_catalog(xlsx):
    rows = read_xlsx(xlsx) + EXTRAS
    seen = set()
    out = []
    for ident, cat, name, target, family, equip, tier in rows:
        if ident in seen:
            sys.exit("Duplicate catalogue ID %s (%s)" % (ident, name))
        seen.add(ident)
        p, s = muscles(target)
        t = int(re.sub(r"\D", "", tier) or 3)
        row = [ident, name, cat, target, family, equip, t, ex_type(ident, cat, name, family, equip), p, s]
        if ident in ALIASES:
            row.append(ALIASES[ident])
        out.append(row)
    body = ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in out)
    js = ("/* Generated by tools/build.py from the exercise catalogue spreadsheet. Do not edit by hand.\n"
          "   Row: [id, name, category, primary target, movement family, equipment, tier, type, primary muscles, assisting muscles, aliases?]\n"
          "   type: wr = weight x reps, bw = bodyweight reps (+kg), assist = assisted (kg of help),\n"
          "         time = seconds, dist = metres, cardio = minutes (+km) */\n"
          "const CATALOG_ROWS = [\n" + body + "\n];\n")
    write_if_changed(os.path.join(ROOT, "js", "catalog.js"), js)
    return out


def sips(src, dst, size, quality):
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality), "-Z", str(size), src, "--out", dst],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def optimise_images():
    os.makedirs(WEB_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)
    pngs = sorted(f for f in os.listdir(EX_DIR) if f.lower().endswith(".png"))
    sources = {}
    for f in pngs:
        name = image_name(f)
        if name in sources:
            print("warning: %r and %r both become %s.jpg; using the first" % (sources[name], f, name))
            continue
        sources[name] = f
    jobs = []
    for name, f in sources.items():
        src = os.path.join(EX_DIR, f)
        for d, size, q in ((WEB_DIR, 720, 78), (THUMB_DIR, 320, 72)):
            dst = os.path.join(d, name + ".jpg")
            if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
                jobs.append((src, dst, size, q))
    if jobs:
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda j: sips(*j), jobs))
    removed = 0
    for d in (WEB_DIR, THUMB_DIR):
        for f in os.listdir(d):
            if f.endswith(".jpg") and f[:-4] not in sources:
                os.remove(os.path.join(d, f))
                removed += 1
    print("images: %d source PNGs, %d files re-encoded, %d stale removed" % (len(sources), len(jobs), removed))
    mascot_src = os.path.join(ROOT, "assets", "mascot.png")
    mascot_dst = os.path.join(ROOT, "assets", "mascot-web.jpg")
    if os.path.exists(mascot_src) and (not os.path.exists(mascot_dst) or os.path.getmtime(mascot_dst) < os.path.getmtime(mascot_src)):
        sips(mascot_src, mascot_dst, 400, 80)
    return sorted(sources)


def link_images(catalog, stems):
    manual_path = os.path.join(ROOT, "tools", "image-map.json")
    manual = {}
    if os.path.exists(manual_path):
        manual = {int(k): v for k, v in json.load(open(manual_path)).items() if not k.startswith("_")}
    by_slug = {}
    for row in catalog:
        by_slug.setdefault(slug(row[1]), row[0])
    for row in catalog:
        for part in re.split(r"\s*/\s*|\s+or\s+", row[1]):
            by_slug.setdefault(slug(part), row[0])
    linked = {}
    unmatched = []
    for stem in stems:
        ident = by_slug.get(stem)
        if ident is None:
            ident = by_slug.get(re.sub(r"^\d+-", "", stem))
        if ident is not None and ident not in manual:
            linked.setdefault(ident, stem)
        elif ident is None and stem not in manual.values():
            unmatched.append(stem)
    for ident, stem in manual.items():
        if stem in stems:
            linked[ident] = stem
        else:
            print("warning: image-map.json points %s at missing %s.png" % (ident, stem))
    names = {r[0]: r[1] for r in catalog}
    csv_rows = [["id", "exercise", "category", "primary target", "file name to use"]]
    for r in catalog:
        if r[0] not in linked:
            csv_rows.append([str(r[0]), r[1], r[2], r[3], slug(r[1]) + ".png"])
    with open(os.path.join(ROOT, "tools", "missing-images.csv"), "w", encoding="utf-8") as fh:
        for row in csv_rows:
            fh.write(",".join('"%s"' % c.replace('"', '""') if ("," in c or '"' in c) else c for c in row) + "\n")
    js = ("/* Generated by tools/build.py. Catalogue id -> image name in " + IMG_REL + "/web|thumb/<name>.jpg */\n"
          "const EX_IMAGES = " + json.dumps({str(k): linked[k] for k in sorted(linked)}, indent=0) + ";\n"
          "const IMAGE_FILES = " + json.dumps(stems) + ";\n")
    write_if_changed(os.path.join(ROOT, "js", "images.js"), js)
    print("images linked to catalogue: %d of %d exercises" % (len(linked), len(catalog)))
    missing = [names[i] for i in names if i not in linked]
    print("exercises still without an image (%d): %s" % (len(missing), ", ".join(missing)))
    used = set(linked.values())
    if unmatched or [s for s in stems if s not in used]:
        print("images not linked to any exercise: %s" % ", ".join(s for s in stems if s not in used))
    return linked


APP_FILES = ["index.html", "manifest.json", "css/app.css"]


def write_manifest(stems):
    """Rewrite the BUILD block in sw.js. Browsers only byte-compare sw.js
    itself when checking for updates, so the file list lives inside it."""
    js_files = sorted("js/" + f for f in os.listdir(os.path.join(ROOT, "js")) if f.endswith(".js"))
    shell = APP_FILES + js_files + ["assets/icon-192.png", "assets/icon-512.png", "assets/apple-touch-icon.png", "assets/mascot-web.jpg"]
    images = {}
    for s in stems:
        for sub in ("web", "thumb"):
            rel = "%s/%s/%s.jpg" % (IMG_REL, sub, s)
            p = os.path.join(ROOT, rel)
            if os.path.exists(p):
                images[rel] = hashlib.sha1(open(p, "rb").read()).hexdigest()[:8]
    sw_path = os.path.join(ROOT, "sw.js")
    sw = open(sw_path, encoding="utf-8").read()
    start, end = "/* BUILD:START */", "/* BUILD:END */"
    if start not in sw or end not in sw:
        sys.exit("sw.js is missing the BUILD:START / BUILD:END markers")
    head, rest = sw.split(start, 1)
    tail = rest.split(end, 1)[1]
    h = hashlib.sha1()
    for rel in shell:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            h.update(rel.encode())
            h.update(open(p, "rb").read())
    h.update(json.dumps(images, sort_keys=True).encode())
    h.update((head + tail).encode())
    build = h.hexdigest()[:10]
    block = (start + "\nconst BUILD_ID = %s;\nconst SHELL_FILES = %s;\nconst IMAGE_FILES = %s;\n" + end) % (
        json.dumps(build), json.dumps(["./"] + shell, indent=1), json.dumps(images, indent=1, sort_keys=True))
    write_if_changed(sw_path, head + block + tail)
    stale = os.path.join(ROOT, "sw-manifest.js")
    if os.path.exists(stale):
        os.remove(stale)
    print("build id:", build)


def write_if_changed(path, text):
    if os.path.exists(path) and open(path, encoding="utf-8").read() == text:
        return
    open(path, "w", encoding="utf-8").write(text)


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tools", "exercise-catalogue.xlsx")
    catalog = build_catalog(xlsx)
    print("catalogue: %d exercises" % len(catalog))
    stems = optimise_images()
    link_images(catalog, stems)
    write_manifest(stems)


if __name__ == "__main__":
    main()

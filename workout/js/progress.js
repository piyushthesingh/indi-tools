/* ===============================================================
   Progress: bodyweight, sets per muscle, exercise records, photos.
=============================================================== */

let muscleWeek = null;
let exFilter = "";
let exShowAll = false;

function renderProgress() {
  const root = $("viewProgress");
  root.innerHTML = "";
  root.appendChild(h("header.page-head", {}, h("h1", {}, "Progress")));
  root.append(bodyweightCard(), muscleCard(), exercisesCard(), photosCard());
}

/* ---------- bodyweight ---------- */

function bodyweightCard() {
  const t = todayISO();
  const a7 = avg7(t);
  const prevA = avg7(addDays(t, -7));
  const rate = a7 != null && prevA != null ? a7 - prevA : null;
  const todayW = getW(t);
  const latest = latestMetric("weight");
  const card = h("section.panel-card", {},
    h("div.card-title-row", {},
      h("h2.card-title", {}, "Bodyweight"),
      h("button.link-btn", { type: "button", onclick: openWeightScreen }, "Log and history", icon("chevronR", "sm"))));

  if (a7 != null) {
    card.appendChild(h("div.big-row", {},
      h("b.big.num", {}, fmtNum(r1(a7))),
      h("span", {}, "kg · 7-day average"),
      rate != null && Math.abs(rate) >= 0.05 ? h("span", { class: "delta " + (rate < 0 ? "down" : "up") }, (rate > 0 ? "+" : "−") + fmtNum(Math.abs(r1(rate))) + " kg this week") : null));
  } else {
    card.appendChild(h("p.hint", {}, "Weigh in a few mornings a week. The 7-day average evens out day-to-day water and salt swings."));
  }

  const base = todayW != null ? todayW : latest ? latest.weight : null;
  const input = numInput(todayW, base, "kg", (v) => { setMetric(t, "weight", v); renderProgress(); }, "Today's weight in kg", "wide");
  const bump = (d) => {
    const cur = parseNum(input.value) != null ? parseNum(input.value) : base;
    if (cur == null) { input.focus(); return; }
    setMetric(t, "weight", r1(cur + d));
    renderProgress();
  };
  card.appendChild(h("div.quick-log", {},
    h("span.quick-label", {}, todayW != null ? "Today" : "Log today"),
    h("button.step-btn", { type: "button", "aria-label": "0.1 kg less", onclick: () => bump(-0.1) }, icon("minus")),
    input,
    h("span.unit", {}, "kg"),
    h("button.step-btn", { type: "button", "aria-label": "0.1 kg more", onclick: () => bump(0.1) }, icon("plus"))));

  const labels = [], vals = [], avgs = [];
  for (let k = 29; k >= 0; k--) {
    const iso = addDays(t, -k);
    labels.push(k === 0 ? "Today" : fmtDate(iso, { day: "numeric", month: "short" }));
    vals.push(getW(iso));
    const a = avg7(iso);
    avgs.push(a == null ? null : r1(a));
  }
  if (vals.filter((v) => v != null).length >= 2) {
    card.appendChild(lineChart([{ values: avgs, cls: "avg", bridge: true }, { values: vals, cls: "main" }], labels, { height: 150, minSpan: 1, label: "Bodyweight over the last 30 days" }));
    card.appendChild(h("p.legend", {}, h("i.lg.main"), "Daily", h("i.lg.avg"), "7-day average"));
  }
  const waist = latestMetric("waist");
  if (waist) card.appendChild(h("p.hint", {}, "Waist " + fmtNum(waist.waist) + " cm · " + dLabel(waist.date)));
  return card;
}

function weightTrend(mode) {
  const t = todayISO();
  const values = [], labels = [], avgs = [];
  if (mode === "day") {
    for (let k = 20; k >= 0; k--) {
      const iso = addDays(t, -k);
      values.push(getW(iso));
      const a = avg7(iso);
      avgs.push(a == null ? null : r1(a));
      labels.push(k === 0 ? "Today" : fmtDate(iso, { day: "numeric", month: "short" }));
    }
    return { values, labels, avgs };
  }
  if (mode === "month") {
    const today = parseISO(t);
    for (let m = 11; m >= 0; m--) {
      const ms = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const me = new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
      const v = [];
      for (let d = new Date(ms); d <= me && d <= today; d.setDate(d.getDate() + 1)) { const w = getW(isoOf(d)); if (w != null) v.push(w); }
      values.push(v.length ? r1(avg(v)) : null);
      labels.push(ms.toLocaleDateString(undefined, { month: "short" }));
    }
    return { values, labels, avgs: null };
  }
  const ws = weekStartISO(t);
  for (let w = 11; w >= 0; w--) {
    const start = addDays(ws, -7 * w);
    const v = [];
    for (let i = 0; i < 7; i++) { const iso = addDays(start, i); if (iso > t) break; const x = getW(iso); if (x != null) v.push(x); }
    values.push(v.length ? r1(avg(v)) : null);
    labels.push(w === 0 ? "This wk" : fmtDate(start, { day: "numeric", month: "short" }));
  }
  return { values, labels, avgs: null };
}

function openWeightScreen() {
  let mode = "day", showCal = false, selDate = null;
  let calMonth = firstOfMonth(new Date());
  let paint = () => {};
  const calBtn = h("button.icon-btn", { type: "button", "aria-label": "Calendar", "aria-pressed": "false", onclick: () => { showCal = !showCal; selDate = null; calBtn.setAttribute("aria-pressed", String(showCal)); paint(); } }, icon("history"));
  openSheet({
    title: "Bodyweight", full: true, headRight: calBtn,
    onClose: () => { if (view.tab === "progress") renderProgress(); },
    body: (b) => {
      paint = () => {
        b.innerHTML = "";
        const t = todayISO();
        const wIn = numInput(getW(t), latestMetric("weight") ? latestMetric("weight").weight : null, "kg", (v) => { setMetric(t, "weight", v); paint(); }, "Today's weight in kg", "big");
        const waistIn = numInput(getMetric(t, "waist"), latestMetric("waist") ? latestMetric("waist").waist : null, "cm", (v) => { setMetric(t, "waist", v); paint(); }, "Today's waist in cm");
        b.appendChild(h("div.weigh-today", {},
          h("div.field", {}, h("span.field-label", {}, "Today · " + fmtDate(t)), h("div.inline", {}, wIn, h("span.unit", {}, "kg"))),
          h("div.field", {}, h("span.field-label", {}, "Waist at the navel (weekly)"), h("div.inline", {}, waistIn, h("span.unit", {}, "cm")))));

        if (showCal) { paintCalendar(b); return; }

        const tr = weightTrend(mode);
        const series = [{ values: tr.values, cls: "main", bridge: mode !== "day" }];
        if (tr.avgs) series.unshift({ values: tr.avgs, cls: "avg", bridge: true });
        b.appendChild(h("div.card-title-row", {}, h("h3.sec-title", {}, "Trend"),
          segControl([["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]], mode, (v) => { mode = v; paint(); }, "Trend range")));
        if (tr.values.filter((v) => v != null).length >= 2) {
          b.appendChild(lineChart(series, tr.labels, { minSpan: 1, label: "Bodyweight trend" }));
          if (tr.avgs) b.appendChild(h("p.legend", {}, h("i.lg.main"), "Daily", h("i.lg.avg"), "7-day average"));
        } else b.appendChild(h("p.hint", {}, "Log a few days to see the trend."));

        b.appendChild(h("h3.sec-title", {}, "Last 14 days"));
        const list = h("div.kv-list");
        for (let k = 1; k <= 14; k++) {
          const iso = addDays(t, -k);
          list.appendChild(h("div.kv.editable", {}, h("span", {}, dLabel(iso)),
            h("div.inline", {}, numInput(getW(iso), null, "-", (v) => { setMetric(iso, "weight", v); }, "Weight on " + fmtDate(iso)), h("span.unit", {}, "kg"))));
        }
        b.appendChild(list);
      };

      function paintCalendar(root) {
        const t = todayISO();
        const minM = new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1);
        root.appendChild(h("div.cal-nav", {},
          h("button.icon-btn.sm", { type: "button", "aria-label": "Previous month", disabled: calMonth <= minM, onclick: () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); paint(); } }, icon("back")),
          h("b", {}, calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })),
          h("button.icon-btn.sm", { type: "button", "aria-label": "Next month", disabled: calMonth >= firstOfMonth(new Date()), onclick: () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); paint(); } }, icon("chevronR"))));
        root.appendChild(monthGrid(calMonth, (iso) => {
          const w = getW(iso);
          const cls = [w != null ? "has" : "", iso === t ? "today" : "", iso === selDate ? "sel" : ""].join(" ");
          if (iso > t) return { cls: cls + " disabled" };
          return { cls, inner: w != null ? "<i>" + fmtNum(w) + "</i>" : "", onclick: (d) => { selDate = d; paint(); }, label: fmtDate(iso) + (w != null ? ", " + w + " kg" : "") };
        }));
        if (selDate) {
          root.appendChild(h("div.weigh-today", {},
            h("div.field", {}, h("span.field-label", {}, dLabel(selDate)),
              h("div.inline", {}, numInput(getW(selDate), null, "kg", (v) => { setMetric(selDate, "weight", v); paint(); }, "Weight on " + fmtDate(selDate), "big"), h("span.unit", {}, "kg"))),
            h("div.field", {}, h("span.field-label", {}, "Waist"),
              h("div.inline", {}, numInput(getMetric(selDate, "waist"), null, "cm", (v) => { setMetric(selDate, "waist", v); paint(); }, "Waist on " + fmtDate(selDate)), h("span.unit", {}, "cm")))));
        } else root.appendChild(h("p.hint", {}, "Tap a day to add or change its entry."));
      }
      paint();
    }
  });
}

/* ---------- sets per muscle ---------- */

function muscleCard() {
  const t = todayISO();
  const thisWeek = weekStartISO(t);
  muscleWeek = muscleWeek || thisWeek;
  const p = activeProg();
  const done = weekMuscleSets(muscleWeek).done;
  const plan = plannedMuscleSets(p);
  const keys = Object.keys(NAMES)
    .filter((m) => (plan[m] || 0) > 0 || (done[m] || 0) > 0)
    .sort((a, b) => (plan[b] || 0) - (plan[a] || 0) || (done[b] || 0) - (done[a] || 0));
  const max = Math.max(24, ...keys.map((k) => Math.max(plan[k] || 0, done[k] || 0)));
  const pct = (v) => (Math.min(v, max) / max * 100).toFixed(2) + "%";
  const label = muscleWeek === thisWeek ? "This week" : fmtDate(muscleWeek, { day: "numeric", month: "short" }) + " to " + fmtDate(addDays(muscleWeek, 6), { day: "numeric", month: "short" });

  const card = h("section.panel-card", {},
    h("div.card-title-row", {},
      h("h2.card-title", {}, "Sets per muscle"),
      h("div.week-nav", {},
        h("button.icon-btn.sm", { type: "button", "aria-label": "Previous week", onclick: () => { muscleWeek = addDays(muscleWeek, -7); renderProgress(); } }, icon("back")),
        h("span", {}, label),
        h("button.icon-btn.sm", { type: "button", "aria-label": "Next week", disabled: muscleWeek >= thisWeek, onclick: () => { muscleWeek = addDays(muscleWeek, 7); renderProgress(); } }, icon("chevronR")))));
  if (!keys.length) {
    card.appendChild(h("p.hint", {}, "Once you log sets, this shows how many each muscle got against your plan."));
    return card;
  }
  const bars = h("div.mbars", { role: "list" });
  keys.forEach((m) => {
    const d = done[m] || 0, pl = plan[m] || 0;
    bars.appendChild(h("div.mbar", { role: "listitem", "aria-label": NAMES[m] + ": " + fmtNum(d) + " of " + pl + " planned sets" },
      h("span.mbar-name", {}, SHORT_NAMES[m]),
      h("span.mbar-track", {},
        h("span.mbar-band", { style: "left:" + pct(10) + ";width:" + (10 / max * 100).toFixed(2) + "%" }),
        h("span", { class: "mbar-fill" + (pl && d >= pl ? " met" : ""), style: "width:" + pct(d) }),
        pl ? h("span.mbar-plan", { style: "left:" + pct(pl) }) : null),
      h("span.mbar-val.num", {}, fmtNum(d) + (pl ? "/" + pl : ""))));
  });
  card.appendChild(bars);
  card.appendChild(h("p.hint", {}, "Sets where the muscle is the main target, against the “" + p.name + "” plan (tick). The shaded band marks a common 10 to 20 sets a week; assisting work adds more."));
  return card;
}

/* ---------- exercises ---------- */

function bestText(rec) {
  const b = rec.best;
  switch (rec.type) {
    case "wr": return b.e1rm ? "Est. 1RM " + prValueText("e1rm", b.e1rm) : b.heavy ? "Heaviest " + prValueText("heavy", b.heavy) : "";
    case "bw": return (b.reps ? prValueText("reps", b.reps) : "") + (b.heavy ? " · +" + prValueText("heavy", b.heavy) : "");
    case "assist": return b.reps ? prValueText("reps", b.reps) : "";
    case "time": return b.sec ? "Longest " + prValueText("sec", b.sec) : "";
    case "dist": return b.m ? "Farthest " + prValueText("m", b.m) : "";
    case "cardio": return b.km ? prValueText("km", b.km) : b.min ? prValueText("min", b.min) : "";
  }
  return "";
}

function exercisesCard() {
  const recs = Array.from(stats().byEx.values()).sort((a, b) => b.sessions[0].ts - a.sessions[0].ts);
  const card = h("section.panel-card", {}, h("div.card-title-row", {}, h("h2.card-title", {}, "Exercises"), recs.length ? h("span.muted", {}, String(recs.length)) : null));
  if (!recs.length) {
    card.appendChild(h("p.hint", {}, "Records and charts appear here once you log weights and reps."));
    return card;
  }
  const search = h("input.search-in.sm", { type: "search", placeholder: "Find an exercise", value: exFilter, "aria-label": "Find a logged exercise", autocomplete: "off" });
  const list = h("div.ex-rec-list");
  const paint = () => {
    list.innerHTML = "";
    let shown = recs;
    if (exFilter.trim()) {
      const byId = new Map(recs.map((r) => [r.ex, r]));
      shown = searchExercises(exFilter, { pool: recs.map((r) => exInfo(r.ex)) }).map((x) => byId.get(x.info.id)).filter(Boolean);
    }
    const limit = exShowAll || exFilter.trim() ? shown.length : 10;
    shown.slice(0, limit).forEach((r) => {
      const info = exInfo(r.ex);
      list.appendChild(h("button.hist-row", { type: "button", onclick: () => openExerciseDetail(r.ex) },
        thumbFor(EX_IMAGES[String(r.ex)] || null, info, "thumb"),
        h("span.hist-main", {}, h("b", {}, info.unknown ? r.n : info.n), h("small", {}, [bestText(r), r.sessions.length + (r.sessions.length === 1 ? " session" : " sessions"), "last " + dLabel(r.sessions[0].date)].filter(Boolean).join(" · "))),
        icon("chevronR", "muted")));
    });
    if (!shown.length) list.appendChild(h("p.hint", {}, "No logged exercise matches."));
    if (shown.length > limit) list.appendChild(h("button.btn.ghost.block", { type: "button", onclick: () => { exShowAll = true; paint(); } }, "Show all " + shown.length));
  };
  search.addEventListener("input", () => { exFilter = search.value; paint(); });
  card.append(search, list);
  paint();
  return card;
}

const METRICS = {
  wr: [["e1rm", "Est. 1RM"], ["heavy", "Heaviest"], ["vol", "Volume"]],
  bw: [["reps", "Reps"], ["heavy", "Added kg"]],
  assist: [["reps", "Reps"]],
  time: [["sec", "Seconds"], ["heavy", "Added kg"]],
  dist: [["m", "Metres"], ["heavy", "Added kg"]],
  cardio: [["km", "Km"], ["min", "Minutes"]]
};

function openExerciseDetail(exId, ctx) {
  const info = exInfo(exId);
  const rec = exRecord(exId);
  const type = (rec && rec.type) || info.type;
  const item = ctx && ctx.item;
  const img = item ? slotInfo(item, null).img : (EX_IMAGES[String(exId)] || null);
  openSheet({
    title: info.unknown && rec ? rec.n : info.n, full: true,
    onClose: () => { if (view.tab === "today" && !overlays.length) renderList(); },
    body: (b) => {
      const im = exImg(img, "web", "detail-img", info.n);
      if (im) b.appendChild(im);
      b.appendChild(h("p.muted", {}, [info.cat, info.equip].filter(Boolean).join(" · ")));
      b.appendChild(muscleLine(item ? slotInfo(item, null).p : info.p, item ? slotInfo(item, null).s : info.s));

      if (!rec) {
        b.appendChild(h("p.hint", {}, "No sets with numbers logged yet. Records and a chart appear after your first session."));
      } else {
        const metrics = METRICS[type] || METRICS.wr;
        let metric = metrics[0][0];
        const chartWrap = h("div.chart-wrap");
        const paint = () => {
          const ses = rec.sessions.slice(0, 24).reverse();
          const vals = ses.map((s) => {
            const work = s.sets.filter((x) => x.t !== "warmup");
            let best = 0;
            if (metric === "vol") best = work.reduce((sum, x) => sum + (x.a || 0) * (x.b || 0), 0);
            else work.forEach((x) => { const v = setScores(x, type)[metric] || 0; if (v > best) best = v; });
            return best ? r1(best) : null;
          });
          chartWrap.innerHTML = "";
          chartWrap.appendChild(lineChart([{ values: vals, cls: "main", area: true, bridge: true }], ses.map((s) => fmtDate(s.date, { day: "numeric", month: "short" })), { minSpan: 2, label: info.n + " progress", empty: "No numbers for this measure yet." }));
        };
        if (metrics.length > 1) b.appendChild(segControl(metrics, metric, (v) => { metric = v; paint(); }, "Measure"));
        b.appendChild(chartWrap);
        paint();

        const keys = (PR_KEYS[type] || []).concat(type === "wr" ? ["vol"] : []).filter((k) => rec.best[k]);
        if (keys.length) {
          b.appendChild(sheetSection("Records", h("div.kv-list", {}, keys.map((k) => h("div.kv", {},
            h("span", {}, PR_LABEL[k]),
            h("b", {}, prValueText(k, rec.best[k]), h("small", {}, " " + setText(rec.bestAt[k].set, type) + " · " + fmtDate(rec.bestAt[k].date))))))));
        }
        b.appendChild(sheetSection("Recent sessions", h("div.kv-list", {}, rec.sessions.slice(0, 15).map((s) => h("div.kv", {},
          h("span", {}, dLabel(s.date)), h("b", {}, setsSummary(s.sets, type) || "-"))))));
      }
      const ta = h("textarea.note-in", { rows: "3", placeholder: "Shows on this exercise every session: seat 4, pin 7, grip width…", value: store.exNote[exId] || "", "aria-label": "Your note for this exercise" });
      ta.addEventListener("input", () => { if (ta.value.trim()) store.exNote[exId] = ta.value; else delete store.exNote[exId]; save(); });
      b.appendChild(sheetSection("Your note", ta));
    }
  });
}

/* ---------- progress photos (IndexedDB, this device only) ---------- */

const PhotoDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!("indexedDB" in window)) { rej(new Error("IndexedDB unavailable")); return; }
      const r = indexedDB.open("training-split-photos", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("photos", { keyPath: "id" });
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  run(mode, fn) {
    return this.open().then((db) => new Promise((res, rej) => {
      const tx = db.transaction("photos", mode);
      const req = fn(tx.objectStore("photos"));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    }));
  },
  all() { return this.run("readonly", (st) => st.getAll()).then((l) => (l || []).sort((a, b) => b.ts - a.ts)); },
  put(rec) { return this.run("readwrite", (st) => st.put(rec)); },
  del(id) { return this.run("readwrite", (st) => st.delete(id)); }
};

function resizePhoto(file, max) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.84);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

let photoUrls = [];
function photosCard() {
  photoUrls.forEach((u) => URL.revokeObjectURL(u));
  photoUrls = [];
  const grid = h("div.photo-grid");
  const fileIn = h("input", { type: "file", accept: "image/*", hidden: true, id: "photoInput" });
  fileIn.addEventListener("change", () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = "";
    if (!f) return;
    resizePhoto(f, 1400)
      .then((blob) => PhotoDB.put({ id: uid(), ts: Date.now(), date: todayISO(), blob }))
      .then(() => { toast("Photo saved on this device"); if (view.tab === "progress") renderProgress(); })
      .catch(() => toast("Couldn't save that photo on this browser."));
  });
  const card = h("section.panel-card", {},
    h("div.card-title-row", {}, h("h2.card-title", {}, "Progress photos"),
      h("button.btn.sm", { type: "button", onclick: () => fileIn.click() }, icon("camera", "sm"), "Add")),
    h("p.hint", {}, "Same light, same pose, every two weeks. Stored only on this device and not included in backups."),
    grid, fileIn);
  PhotoDB.all().then((list) => {
    if (!list.length) { grid.appendChild(h("p.hint", {}, "No photos yet.")); return; }
    list.slice(0, 12).forEach((ph) => {
      const u = URL.createObjectURL(ph.blob);
      photoUrls.push(u);
      grid.appendChild(h("button.photo", { type: "button", "aria-label": "Photo from " + fmtDate(ph.date), onclick: () => openPhoto(ph) },
        h("img", { src: u, alt: "" }), h("span", {}, fmtDate(ph.date, { day: "numeric", month: "short" }))));
    });
  }).catch(() => { grid.appendChild(h("p.hint", {}, "Photos need browser storage that isn't available here (private browsing?).")); });
  return card;
}

function openPhoto(ph) {
  const u = URL.createObjectURL(ph.blob);
  openSheet({
    title: fmtDate(ph.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" }), full: true,
    onClose: () => URL.revokeObjectURL(u),
    body: (b, api) => {
      b.append(h("img.photo-full", { src: u, alt: "Progress photo" }),
        h("div.sheet-actions", {}, h("button.btn.danger", {
          type: "button", onclick: () => {
            if (!confirm("Delete this photo? It isn't in any backup.")) return;
            PhotoDB.del(ph.id).then(() => api.close(() => { renderProgress(); toast("Photo deleted"); }));
          }
        }, icon("trash"), "Delete photo")));
    }
  });
}

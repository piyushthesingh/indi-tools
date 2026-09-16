/* ===============================================================
   History: streak, calendar and the list of saved workouts.
=============================================================== */

let histMonth = null;
let histShown = 40;

function renderHistory() {
  const root = $("viewHistory");
  root.innerHTML = "";
  const st = computeStreak();
  root.appendChild(h("header.page-head", {}, h("h1", {}, "History")));

  root.appendChild(h("section.panel-card.streak-card", {},
    icon("flame", "flame"),
    h("div", {},
      h("div.streak-big", {}, h("b.num", {}, String(st.current)), st.current === 1 ? " day streak" : " day streak"),
      h("div.hint", {}, "Best " + st.best + " · up to 2 rest days in any week keeps it going"))));

  histMonth = histMonth || firstOfMonth(new Date());
  const byDate = {};
  store.history.forEach((x) => { (byDate[x.date] = byDate[x.date] || []).push(x); });
  const t = todayISO();
  const cal = h("section.panel-card", {},
    h("div.cal-nav", {},
      h("button.icon-btn.sm", { type: "button", "aria-label": "Previous month", onclick: () => { histMonth = new Date(histMonth.getFullYear(), histMonth.getMonth() - 1, 1); renderHistory(); } }, icon("back")),
      h("b", {}, histMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })),
      h("button.icon-btn.sm", { type: "button", "aria-label": "Next month", disabled: histMonth >= firstOfMonth(new Date()), onclick: () => { histMonth = new Date(histMonth.getFullYear(), histMonth.getMonth() + 1, 1); renderHistory(); } }, icon("chevronR"))),
    monthGrid(histMonth, (iso) => {
      const cls = [];
      if (iso === t) cls.push("today");
      if (iso > t) return { cls: cls.concat("disabled").join(" ") };
      const list = byDate[iso];
      if (st.wk.has(iso)) {
        cls.push("wk");
        const pct = list ? Math.max.apply(null, list.map((x) => x.pct || 0)) : null;
        return { cls: cls.join(" "), inner: pct != null ? "<i>" + pct + "%</i>" : "<i>•</i>", onclick: list ? () => openWorkoutsOn(iso) : null, label: fmtDate(iso) + ", workout" };
      }
      if ((st.byDate[iso] || 0) > 0) { cls.push("rest"); return { cls: cls.join(" "), inner: "<i>z</i>", label: fmtDate(iso) + ", rest day" }; }
      return { cls: cls.join(" ") };
    }),
    h("p.hint", {}, "Filled days are workouts, with the share of sets completed. ", h("b.rest-chip", {}, "z"), " is a rest day that kept the streak."));
  root.appendChild(cal);

  if (!store.history.length) {
    root.appendChild(h("div.empty-state", {}, h("p", {}, "No saved workouts yet. Finish a session on Today and it lands here.")));
    return;
  }

  let month = null;
  const list = h("section.hist-list");
  store.history.slice(0, histShown).forEach((x) => {
    const m = x.date.slice(0, 7);
    if (m !== month) {
      month = m;
      list.appendChild(h("h2.hist-month", {}, parseISO(x.date).toLocaleDateString(undefined, { month: "long", year: "numeric" })));
    }
    list.appendChild(historyRow(x));
  });
  root.appendChild(list);
  if (store.history.length > histShown) {
    root.appendChild(h("button.btn.ghost.block", { type: "button", onclick: () => { histShown += 60; renderHistory(); } }, "Show older workouts"));
  }
}

function historyRow(x) {
  const bits = [x.programName, fmtTime(x.ts), x.dur ? fmtMins(x.dur) : null, x.setsDone + "/" + x.setsTotal + " sets", x.volume ? x.volume.toLocaleString() + " kg" : null];
  return h("button.hist-row", { type: "button", onclick: () => openWorkoutDetail(x.id) },
    h("span.hist-date", {}, h("b.num", {}, fmtDate(x.date, { day: "numeric" })), h("small", {}, fmtDate(x.date, { weekday: "short" }))),
    h("span.hist-main", {}, h("b", {}, x.title), h("small", {}, bits.filter(Boolean).join(" · "))),
    x.prs && x.prs.length ? h("span.pr-badge", {}, x.prs.length + " PR") : null,
    icon("chevronR", "muted"));
}

function openWorkoutsOn(iso) {
  const list = store.history.filter((x) => x.date === iso);
  if (list.length === 1) { openWorkoutDetail(list[0].id); return; }
  menuSheet(dLabel(iso), list.map((x) => ({
    icon: "history", label: x.title, hint: fmtTime(x.ts) + " · " + x.setsDone + " sets", fn: () => openWorkoutDetail(x.id)
  })));
}

function openWorkoutDetail(id) {
  const x = store.history.find((e) => e.id === id);
  if (!x) return;
  openSheet({
    title: x.title, full: true,
    body: (b, api) => {
      b.appendChild(h("p.muted", {}, fmtDate(x.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " · " + fmtTime(x.ts) + (x.programName ? " · " + x.programName : "")));
      b.appendChild(h("div.stat-grid", {},
        stat(x.dur ? fmtDur(x.dur) : "-", "duration"),
        stat(x.setsDone + "/" + x.setsTotal, "sets"),
        stat(x.volume ? x.volume.toLocaleString() : "-", "kg volume"),
        stat(String((x.prs || []).length), (x.prs || []).length === 1 ? "PR" : "PRs")));
      if (x.prs && x.prs.length) b.appendChild(sheetSection("Personal records", x.prs.map(prRow)));
      const grouped = x.lines.some((l) => l.section);
      const rows = [];
      let lastSec;
      x.lines.forEach((l) => {
        const sec = l.section || null;
        if (grouped && sec !== lastSec) {
          rows.push(h("div.section-label", {}, icon(sectionIcon(sec), "sm"), sectionName(sec)));
          lastSec = sec;
        }
        rows.push(h("div.hist-line", {},
          h("div.hist-line-head", {},
            l.ex != null ? h("button.link-btn", { type: "button", onclick: () => openExerciseDetail(l.ex) }, l.n) : h("b", {}, l.n),
            h("span.muted", {}, l.skipped ? "skipped" : l.done + "/" + l.total + " sets")),
          l.sets && l.sets.length ? h("div.hist-sets", {}, l.sets.map((s) => h("span", {
            class: "set-chip" + (s.t !== "work" ? " " + s.t : "") + (s.pr ? " pr" : "")
          }, (s.t === "warmup" ? "W · " : s.t === "drop" ? "D · " : s.t === "fail" ? "F · " : "") + setText(s, l.type)))) : null,
          l.note ? h("p.ex-note.today", {}, l.note) : null));
      });
      b.appendChild(sheetSection("Exercises", rows));
      if (x.legacy) b.appendChild(h("p.hint", {}, "Logged before weights and reps were tracked, so only set counts were kept."));
      b.appendChild(h("div.sheet-actions", {},
        h("button.btn", { type: "button", onclick: () => shareWorkout(x) }, icon("share"), "Share card"),
        h("button.btn.danger", {
          type: "button", onclick: () => {
            if (!confirm("Delete this workout from History? Only a backup can bring it back.")) return;
            store.history = store.history.filter((e) => e !== x);
            invalidateStats();
            saveNow();
            api.close(() => { renderCurrent(); toast("Workout deleted"); });
          }
        }, icon("trash"), "Delete")));
    }
  });
}

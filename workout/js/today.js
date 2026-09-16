/* ===============================================================
   Today: the workout screen.
=============================================================== */

const openState = new Map();       /* uid -> open/closed when the user toggled a card */
const openNotes = new Set();
const openSections = new Map();    /* section id -> expanded; warm-up and the rest start closed */
let renderedDayKey = null;
const SET_TYPES = ["work", "warmup", "drop", "fail"];
const SET_TYPE_NAME = { work: "working set", warmup: "warm-up", drop: "drop set", fail: "to failure" };

function renderToday(opts) {
  opts = opts || {};
  const root = $("viewToday");
  const p = activeProg();
  const day = curDay();
  if (day) view.dayId = day.id;
  const key = p.id + ":" + (day ? day.id : "");
  if (key !== renderedDayKey) { openState.clear(); openNotes.clear(); openSections.clear(); renderedDayKey = key; opts.scroll = true; }
  root.innerHTML = "";
  root.appendChild(todayTopbar(p, day));
  if (!day) {
    root.appendChild(h("div.empty-state", {},
      h("p", {}, "“" + p.name + "” has no days yet."),
      h("button.btn.primary", { type: "button", onclick: () => openProgramEditor(p.id) }, icon("plus"), "Add a day")));
    return;
  }
  root.appendChild(dayIntro(p, day));
  root.appendChild(h("div", { class: "ex-list", id: "exList" }));
  root.appendChild(dayFooter(p, day));
  renderList();
  if (opts.scroll) {
    const sess = curSession(false);
    if (sess && sess.startedAt) requestAnimationFrame(() => scrollToCurrent(false));
    else window.scrollTo(0, 0);
  }
}

function usesWeekdays(p) {
  const m = store.settings.daySelect;
  return m === "weekday" || (m === "auto" && p.days.length >= 6);
}

function todayTopbar(p, day) {
  const chips = h("div.day-chips", { role: "tablist", "aria-label": "Days" });
  const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdays = usesWeekdays(p);
  p.days.forEach((d, i) => {
    const logged = anyLogged(getSession(p.id, d.id));
    const doneToday = store.history.some((x) => x.date === todayISO() && x.program === p.id && x.dayId === d.id);
    chips.appendChild(h("button.day-chip", {
      type: "button", role: "tab", "aria-selected": String(!!day && d.id === day.id),
      onclick: () => selectDay(d.id)
    },
      weekdays && i < 7 ? h("small", {}, WD[i]) : null,
      h("span", {}, d.name),
      logged ? h("i.dot.live", { title: "In progress" }) : doneToday ? h("i.dot.ok", { title: "Done today" }) : null));
  });
  requestAnimationFrame(() => {
    const sel = chips.querySelector('[aria-selected="true"]');
    if (sel) chips.scrollLeft = sel.offsetLeft - (chips.clientWidth - sel.offsetWidth) / 2;
  });
  return h("header.topbar", {},
    h("div.topbar-row", {},
      h("button.prog-pill", { type: "button", onclick: openProgramSwitcher, "aria-label": "Programme: " + p.name + ". Switch programme" },
        h("span.prog-emoji", { "aria-hidden": "true" }, p.emoji || "🏋️"), h("b", {}, p.name), icon("chevron", "sm")),
      h("span.grow"),
      p.notes && p.notes.length ? h("button.icon-btn", { type: "button", "aria-label": "Programme guide", onclick: () => openGuide(p) }, icon("book")) : null,
      h("button.icon-btn", { type: "button", "aria-label": "Edit programme", onclick: () => openProgramEditor(p.id) }, icon("edit"))),
    p.days.length ? chips : null,
    h("div", { class: "sessbar", id: "sessBar", hidden: true }));
}

function selectDay(id) {
  view.dayId = id;
  store.lastDay[store.program] = id;
  saveNow();
  renderToday({ scroll: true });
}

function dayIntro(p, day) {
  const sess = curSession(false);
  const idle = sessionState(sess) === "idle" && !anyLogged(sess);
  return h("section.day-intro", {},
    h("div.day-intro-text", {},
      h("h1.day-title", {}, day.title || day.name),
      day.focus ? h("p.day-focus", {}, day.focus) : null,
      store.deload ? h("span.pill.warm", {}, "Deload week · half the sets") : null),
    idle ? h("button.btn.primary.start-btn", { type: "button", onclick: startWorkout }, icon("play"), "Start") : null);
}

function startWorkout() {
  unlockAudio();
  const s = curSession(true);
  touch(s);
  saveNow();
  renderToday();
  afterLog();
}

/* ---------- session bar ---------- */

function paintSessionBar() {
  const bar = $("sessBar");
  if (!bar) return;
  const day = curDay();
  const sess = curSession(false);
  const st = sessionState(sess);
  if (!day || (st === "idle" && !anyLogged(sess))) { bar.hidden = true; return; }
  bar.hidden = false;
  if (!bar.firstChild) {
    bar.append(
      h("div.sess-row", {},
        h("div.sess-info", {},
          h("b", { class: "num", id: "sessClock" }),
          h("span", { id: "sessSets" })),
        h("button", { class: "icon-btn", type: "button", id: "sessPause", onclick: togglePause }),
        h("button.btn.ok.sm", { type: "button", onclick: openFinish }, "Finish")),
      h("div", { class: "sess-segs", id: "sessSegs", "aria-hidden": "true" }));
  }
  const pr = dayProgress(day, sess);
  $("sessClock").textContent = fmtDur(elapsedAt(sess));
  $("sessSets").textContent = (st === "paused" ? "Paused · " : "") + pr.done + " of " + pr.total + " sets"
    + (pr.extra ? " · " + pr.extra + " extra" : "");
  const pb = $("sessPause");
  pb.innerHTML = "";
  pb.appendChild(icon(st === "paused" || st === "idle" ? "play" : "pause"));
  pb.setAttribute("aria-label", st === "running" ? "Pause workout clock" : "Resume workout clock");
  const segs = $("sessSegs");
  segs.innerHTML = "";
  sessionItems(day, sess).forEach((it) => {
    if (it.section) return;
    const e = sess && sess.entries[it.uid];
    const p = entryProgress(it, e);
    const cls = e && e.skipped ? "skip" : p.total && p.done >= p.total ? "done" : p.done ? "part" : "";
    segs.appendChild(h("i", { class: cls, style: p.done && p.done < p.total ? "--p:" + Math.round(p.done / p.total * 100) + "%" : null }));
  });
}

function togglePause() {
  const s = curSession(true);
  const st = sessionState(s);
  if (st === "running") s.pausedAt = Date.now();
  else touch(s);
  saveNow();
  paintSessionBar();
  syncWake();
}

/* ---------- exercise list ---------- */

/* the workout group stays open; warm-up, stretching and cooldown start closed */
function sectionExpanded(id) {
  const key = id || "workout";
  if (openSections.has(key)) return openSections.get(key);
  return !id;
}
function toggleSection(id) {
  openSections.set(id || "workout", !sectionExpanded(id));
  renderList();
}

function sectionHead(group, sess) {
  let done = 0, total = 0;
  group.items.forEach((it) => {
    const p = entryProgress(it, sess && sess.entries[it.uid]);
    done += p.done; total += p.total;
  });
  const open = sectionExpanded(group.section);
  const n = group.items.length;
  return h("div", { class: "sec-head-row" + (group.section ? "" : " main") },
    h("button", { class: "sec-head" + (open ? " open" : "") + (group.section ? "" : " main"), type: "button", "aria-expanded": String(open), onclick: () => toggleSection(group.section) },
      icon(sectionIcon(group.section), "sm"),
      h("b", {}, sectionName(group.section)),
      h("small", {}, n + (n === 1 ? " exercise" : " exercises") + (total ? " · " + done + "/" + total + " sets" : "")),
      icon("chevron", "muted")),
    h("button.icon-btn.sm", { type: "button", "aria-label": "More for " + sectionName(group.section), onclick: () => openSectionMenu(group) }, icon("more")));
}

function openSectionMenu(group) {
  const day = curDay();
  const sess = curSession(true);
  const name = sectionName(group.section);
  const extras = group.items.filter((it) => (sess.extra || []).indexOf(it) !== -1);
  menuSheet(name, [
    { icon: "plus", label: "Add an exercise here", fn: () => addToSection(group.section, day) },
    extras.length ? {
      icon: "edit", label: "Keep in the programme",
      hint: extras.length + (extras.length === 1 ? " exercise here is today only" : " exercises here are today only"),
      fn: () => {
        extras.forEach((it) => keepInProgramme(day, it, true));
        saveNow();
        renderList();
        toast(name + " saved in " + day.name);
      }
    } : null,
    { icon: "edit", label: "Edit in the programme", hint: "Sets, reps and order for every " + day.name, fn: () => openDayEditor(store.program, day.id) },
    group.section ? {
      icon: "trash", label: "Remove " + name.toLowerCase() + " today", danger: true,
      fn: () => {
        group.items.forEach((it) => removeToday(day, it, true));
        saveNow();
        renderList();
        afterLog();
        toast(name + " removed from today");
      }
    } : null
  ]);
}

/* today only, or part of the programme from now on */
function askScope(day, onChoice) {
  menuSheet("Add to", [
    { icon: "today", label: "Just today", hint: "Gone tomorrow", fn: () => onChoice("today") },
    { icon: "edit", label: "Every " + day.name, hint: "Saved in the programme", fn: () => onChoice("programme") }
  ]);
}

function addItemsToDay(items, scope, day, label) {
  const sess = curSession(true);
  if (scope === "programme") {
    items.forEach((it) => { day.items.push(it); placeBySection(day.items, it); });
    sess.order = null;
  } else {
    items.forEach((it) => sess.extra.push(it));
  }
  saveNow();
  renderList();
  afterLog();
  toast(label + (scope === "programme" ? " added to every " + day.name : " added to today"));
}

function addToSection(sectionId, day) {
  const existing = sessionItems(day, curSession(false));
  openPicker({
    title: "Add to " + sectionName(sectionId).toLowerCase(), multi: true,
    onPick: (ids) => withDuplicateCheck(existing, ids, (id) => id, "this day", (keep) => askScope(day, (scope) => {
      const items = keep.map((id) => newItem(id, sectionId ? { section: sectionId, rest: 0 } : {}));
      addItemsToDay(items, scope, day, items.length === 1 ? exInfo(keep[0]).n : items.length + " exercises");
    }))
  });
}

function renderList() {
  const list = $("exList");
  if (!list) return;
  const day = curDay();
  const sess = curSession(false);
  const items = sessionItems(day, sess);
  const isDone = (it) => entryDone(it, sess && sess.entries[it.uid]);
  /* the workout leads: a warm-up exercise never becomes the current card */
  const cur = items.find((it) => !it.section && !isDone(it)) || items.find((it) => !isDone(it));
  list.innerHTML = "";
  const groups = [];
  items.forEach((it) => {
    const sec = it.section || null;
    const last = groups[groups.length - 1];
    if (last && last.section === sec) last.items.push(it);
    else groups.push({ section: sec, items: [it] });
  });
  const grouped = groups.some((g) => g.section);
  groups.forEach((g) => {
    if (grouped) list.appendChild(sectionHead(g, sess));
    if (grouped && !sectionExpanded(g.section)) return;
    g.items.forEach((it, i) => {
      const prev = g.items[i - 1], next = g.items[i + 1];
      const card = renderItem(day, items, it, cur ? cur.uid : null);
      if (it.ss) {
        if (!(prev && prev.ss === it.ss)) card.classList.add("ss-first");
        if (!(next && next.ss === it.ss)) card.classList.add("ss-last");
      }
      list.appendChild(card);
    });
  });
  if (!items.length) list.appendChild(h("p.empty", {}, "No exercises in this day yet. Add one below."));
  paintSessionBar();
}

function renderItem(day, items, it, curUid) {
  const sess = curSession(false);
  const e = sess && sess.entries[it.uid];
  const si = slotInfo(it, e);
  const skipped = !!(e && e.skipped);
  const done = entryDone(it, e);
  const isCur = it.uid === curUid;
  const open = openState.has(it.uid) ? openState.get(it.uid) : (isCur && !it.section);
  const ssLabel = supersetLabel(items, it);
  const card = h("article", {
    class: ["card", open && "open", done && "done", isCur && "current", skipped && "skipped", ssLabel && "in-ss"].filter(Boolean).join(" "),
    dataset: { uid: it.uid }
  });
  if (ssLabel && !(items[items.indexOf(it) - 1] && items[items.indexOf(it) - 1].ss === it.ss)) {
    card.appendChild(h("div.ss-label", {}, icon("link", "sm"), ssLabel));
  }
  const nextOpt = it.opts.length > 1 ? it.opts[(it.pick + 1) % it.opts.length] : null;
  const head = h("div.card-head", { role: "button", tabindex: "0", "aria-expanded": String(open) },
    thumbFor(si.img, si.info, "thumb"),
    h("div.card-main", {},
      h("div.card-name", {}, si.name, si.swapped ? h("span.pill.sm", {}, "today only") : null),
      h("div.card-meta", {}, cardMeta(it, si, e, done, skipped, open))),
    h("div.card-right", {},
      open && nextOpt && !si.swapped
        ? h("button.icon-btn.sm", { type: "button", "aria-label": "Switch to " + (nextOpt.n || exInfo(nextOpt.ex).n), title: "Switch to " + (nextOpt.n || exInfo(nextOpt.ex).n), onclick: (ev) => { ev.stopPropagation(); cycleVariant(it); } }, icon("swap"))
        : null,
      open ? h("button.icon-btn.sm", { type: "button", "aria-label": "More for " + si.name, onclick: (ev) => { ev.stopPropagation(); openCardMenu(day, it); } }, icon("more")) : null,
      done && !open ? h("span", { class: "tick" + (skipped ? " skip" : ""), role: "img", "aria-label": skipped ? "Skipped" : "Done" }, icon(skipped ? "skip" : "check")) : null,
      !done && !open ? icon("chevron", "muted") : null));
  const toggle = () => { openState.set(it.uid, !open); renderList(); };
  head.addEventListener("click", (ev) => { if (!ev.target.closest("button")) toggle(); });
  head.addEventListener("keydown", (ev) => { if (ev.target === head && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); toggle(); } });
  card.appendChild(head);
  if (open) card.appendChild(skipped
    ? h("div.card-body", {}, h("button.btn", { type: "button", onclick: () => setSkipped(it, false) }, "Don't skip"))
    : cardBody(day, items, it));
  return card;
}

function cardMeta(it, si, e, done, skipped, open) {
  if (skipped) return "Skipped today";
  if (done && !open) return setsSummary(e.sets.filter((s) => s.done), si.type) || "Done";
  const parts = [];
  if (si.type === "cardio") parts.push(it.reps || "Cardio");
  else parts.push(plannedSets(it) + " × " + (it.reps || "-"));
  const rest = restFor(it, si);
  if (rest && si.type !== "cardio") parts.push("rest " + fmtClock(rest));
  if (open) { if (it.tag && !si.swapped) parts.push(it.tag); }
  else {
    const rec = exRecord(si.info.id);
    const last = rec && rec.sessions[0];
    const txt = last && setsSummary(last.sets, si.type);
    if (txt) parts.push("last " + txt);
  }
  return parts.join(" · ");
}

function cardBody(day, items, it) {
  const sess = curSession(true);
  const e = ensureEntry(sess, it);
  const si = slotInfo(it, e);
  const T = TYPES[si.type] || TYPES.wr;
  const body = h("div.card-body");

  const sug = suggestion(it, si);
  if (sug) body.appendChild(h("div", { class: "coach " + sug.kind }, icon(sug.kind === "up" ? "up" : "info"), h("span", {}, sug.text)));
  if (store.exNote[si.info.id]) body.appendChild(h("p.ex-note", {}, icon("note", "sm"), store.exNote[si.info.id]));

  const rir = store.settings.rir && si.type !== "cardio" && !it.section;
  /* stretches and mobility drills don't take a weight */
  const noLoad = (!!it.section || isMobility(si.info)) && (si.type === "time" || si.type === "bw");
  const table = h("div", { class: "sets" + (rir ? " with-rir" : ""), role: "group", "aria-label": "Sets for " + si.name });
  table.appendChild(h("div.set-row.set-headrow", { "aria-hidden": "true" },
    h("span", {}, "Set"), h("span", {}, "Last"), h("span", {}, noLoad ? "" : T.a), h("span", {}, T.b), rir ? h("span", {}, "RIR") : null, h("span")));
  let workNo = 0;
  e.sets.forEach((s, idx) => {
    if (s.t !== "warmup") workNo++;
    table.appendChild(setRow(day, items, it, si, e, idx, workNo, rir, noLoad));
  });
  body.appendChild(table);

  const lastSet = e.sets[e.sets.length - 1];
  const canRemove = !!lastSet && !lastSet.done && (lastSet.t === "warmup" || e.sets.filter((s) => s.t !== "warmup").length > 1);
  body.appendChild(h("div.card-actions", {},
    h("button.chip-btn", { type: "button", onclick: () => addSet(it) }, icon("plus", "sm"), "Set"),
    h("button.chip-btn", { type: "button", disabled: !canRemove, onclick: () => removeSet(it), "aria-label": "Remove last set" }, icon("minus", "sm"), "Set"),
    h("button.chip-btn", { type: "button", "aria-expanded": String(openNotes.has(it.uid)), onclick: () => { if (openNotes.has(it.uid)) openNotes.delete(it.uid); else openNotes.add(it.uid); renderList(); } },
      icon("note", "sm"), e.note ? "Note •" : "Note"),
    si.type !== "cardio" ? h("button.chip-btn", { type: "button", onclick: () => openRestSheet(it), "aria-label": "Rest time " + fmtClock(restFor(it, si)) }, icon("timer", "sm"), fmtClock(restFor(it, si))) : null));

  if (openNotes.has(it.uid)) {
    const ta = h("textarea.note-in", { rows: "2", placeholder: "Note for today (seat height, grip, how it felt)", "aria-label": "Note for " + si.name, value: e.note || "" });
    ta.addEventListener("input", () => { e.note = ta.value; save(); });
    body.appendChild(ta);
    setTimeout(() => ta.focus(), 30);
  } else if (e.note) {
    body.appendChild(h("p.ex-note.today", {}, e.note));
  }

  const how = h("details.howto", {}, h("summary", {}, "How to", h("small", {}, si.img ? "image, cue and muscles" : "cue and muscles")));
  const img = exImg(si.img, "web", "howto-img", si.name);
  if (img) how.appendChild(img);
  const cue = !si.swapped && it.cue;
  if (cue) how.appendChild(h("p.cue", {}, cue));
  how.appendChild(muscleLine(si.p, si.s));
  if (si.info.equip) how.appendChild(h("p.muted.small", {}, "Equipment: " + si.info.equip));
  body.appendChild(how);
  return body;
}

function muscleLine(p, s) {
  const wrap = h("div.muscles");
  if (p && p.length) wrap.appendChild(h("div", {}, h("b", {}, "Primary: "), p.map((m) => NAMES[m] || m).join(", ")));
  if (s && s.length) wrap.appendChild(h("div", {}, h("b", {}, "Assisting: "), s.map((m) => NAMES[m] || m).join(", ")));
  return wrap;
}

function setRow(day, items, it, si, e, idx, workNo, rir, noLoad) {
  const s = e.sets[idx];
  const T = TYPES[si.type] || TYPES.wr;
  const pf = prefillFor(it, si, e, idx);
  const label = s.t === "warmup" ? "W" : s.t === "drop" ? "D" : s.t === "fail" ? "F" : String(workNo);
  const edited = () => { if (s.done && !it.section) refreshPRs(si, e); save(); };
  const row = h("div", { class: "set-row" + (s.done ? " done" : "") + (s.t !== "work" ? " " + s.t : "") },
    h("button.set-type", { type: "button", "aria-label": "Set " + label + ": " + SET_TYPE_NAME[s.t] + ". Tap to change type.", onclick: () => cycleSetType(it, idx) }, label),
    h("span.set-prev", {}, pf.prev ? setText(pf.prev, si.type) : "-"),
    noLoad ? h("span.set-na", { "aria-hidden": "true" }) : numInput(s.a, pf.a, T.a, (v) => { s.a = v; edited(); }, T.a + ", set " + label),
    numInput(s.b, pf.b, T.b, (v) => { s.b = v; edited(); }, T.b + ", set " + label),
    rir ? rirSelect(s, label, edited) : null,
    h("button.set-check", { type: "button", "aria-pressed": String(!!s.done), "aria-label": (s.done ? "Undo set " : "Log set ") + label, onclick: () => toggleSet(day, items, it, idx) }, icon("check")));
  if (s.pr && s.pr.length) row.appendChild(h("span.pr-tag", { title: s.pr.map((k) => PR_LABEL[k]).join(", ") }, "PR"));
  return row;
}

function rirSelect(s, label, onChange) {
  const sel = h("select.rir-in", { "aria-label": "Reps in reserve, set " + label });
  sel.appendChild(h("option", { value: "" }, "-"));
  [0, 1, 2, 3, 4].forEach((v) => sel.appendChild(h("option", { value: String(v), selected: s.rir === v }, v === 4 ? "4+" : String(v))));
  sel.addEventListener("change", () => { s.rir = sel.value === "" ? null : +sel.value; onChange(); });
  return sel;
}

function refreshPRs(si, e) {
  e.sets.forEach((o) => {
    const k = livePRs(si.info.id, si.type, o, e.sets);
    if (k.length) o.pr = k; else delete o.pr;
  });
}

function toggleSet(day, items, it, idx) {
  unlockAudio();
  const sess = curSession(true);
  touch(sess);
  const e = ensureEntry(sess, it);
  const s = e.sets[idx];
  const si = slotInfo(it, e);
  if (!s.done) {
    const pf = prefillFor(it, si, e, idx);
    if (s.a == null && pf.a != null) s.a = pf.a;
    if (s.b == null && pf.b != null) s.b = pf.b;
    s.done = true;
    s.at = Date.now();
    if (!it.section) refreshPRs(si, e);
    if (s.pr && s.pr.length) {
      const k = s.pr[0];
      toast("New PR · " + si.name + " · " + PR_LABEL[k] + " " + prValueText(k, setScores(s, si.type)[k]));
      if (navigator.vibrate) navigator.vibrate([40, 50, 90]);
    }
    const group = it.ss ? items.filter((x) => x.ss === it.ss) : [];
    const nextInGroup = group.slice(group.indexOf(it) + 1).find((x) => !entryDone(x, sess.entries[x.uid]));
    if (nextInGroup) openState.set(nextInGroup.uid, true);
    else if (s.t !== "warmup") {
      const r = restFor(it, si);
      if (r > 0) startRest(r, si.name);
    }
    if (entryDone(it, e)) {
      openState.delete(it.uid);
      if (group.length) {
        const back = group.find((x) => !entryDone(x, sess.entries[x.uid]));
        if (back) openState.set(back.uid, true);
      }
    }
  } else {
    s.done = false;
    delete s.pr;
    if (!it.section) refreshPRs(si, e);
  }
  saveNow();
  renderList();
  afterLog();
  if (s.done && entryDone(it, e)) scrollToCurrent(true);
}

function scrollToCurrent(smooth) {
  const card = document.querySelector("#exList .card.current");
  if (!card) return;
  const bar = document.querySelector(".topbar");
  const offset = (bar ? bar.getBoundingClientRect().height : 0) + 10;
  const r = card.getBoundingClientRect();
  if (smooth && r.top >= offset && r.top < window.innerHeight * 0.45) return;
  window.scrollTo({ top: Math.max(0, r.top + window.scrollY - offset), behavior: smooth ? "smooth" : "auto" });
}

function afterLog() {
  paintSessionBar();
  updateNav();
  syncWake();
}

/* ---------- set and card actions ---------- */

function withEntry(it, fn) {
  const sess = curSession(true);
  const e = ensureEntry(sess, it);
  fn(e, sess);
  saveNow();
  renderList();
}

function addSet(it) {
  withEntry(it, (e) => {
    e.sets.push(newSet());
    e.n = e.sets.filter((s) => s.t !== "warmup").length;
  });
}
function removeSet(it) {
  withEntry(it, (e) => {
    const last = e.sets[e.sets.length - 1];
    if (!last || last.done) return;
    e.sets.pop();
    e.n = e.sets.filter((s) => s.t !== "warmup").length;
  });
}
function cycleSetType(it, idx) {
  withEntry(it, (e) => {
    const s = e.sets[idx];
    s.t = SET_TYPES[(SET_TYPES.indexOf(s.t) + 1) % SET_TYPES.length];
    e.n = e.sets.filter((x) => x.t !== "warmup").length;
    if (s.t === "warmup") delete s.pr;
  });
}
function cycleVariant(it) {
  it.pick = (it.pick + 1) % it.opts.length;
  saveNow();
  renderList();
}
function setSkipped(it, v) {
  withEntry(it, (e) => { e.skipped = v; });
  openState.set(it.uid, false);
  renderList();
  afterLog();
}

function isExtra(it) {
  const sess = curSession(false);
  return !!(sess && sess.extra && sess.extra.indexOf(it) !== -1);
}

function openCardMenu(day, it) {
  const sess = curSession(true);
  const e = ensureEntry(sess, it);
  const si = slotInfo(it, e);
  const items = sessionItems(day, sess);
  const i = items.indexOf(it);
  const next = items[i + 1];
  const linked = !!(it.ss && next && next.ss === it.ss);
  const extra = isExtra(it);
  const others = it.opts.map((o, k) => ({ o, k })).filter((x) => x.k !== it.pick);
  menuSheet(si.name, [
    { icon: "swap", label: "Swap exercise", hint: "Pick from the exercise library", fn: () => swapFlow(it) },
    si.swapped ? { icon: "back", label: "Undo swap", hint: "Back to " + (it.opts[it.pick].n || exInfo(it.opts[it.pick].ex).n), fn: () => withEntry(it, (en) => { en.swap = null; }) } : null
  ].concat(others.map((x) => ({
    icon: "swap", label: "Use " + (x.o.n || exInfo(x.o.ex).n), hint: "Alternative in this programme",
    fn: () => { it.pick = x.k; withEntry(it, (en) => { en.swap = null; }); }
  }))).concat([
    { icon: "progress", label: "History and records", fn: () => openExerciseDetail(si.info.id, { item: it }) },
    si.type === "wr" ? { icon: "plus", label: "Add warm-up sets", hint: "Worked out from your first working weight", fn: () => addWarmups(it) } : null,
    si.type === "wr" ? { icon: "plate", label: "Plate calculator", fn: () => openPlateCalc(currentLoad(it)) } : null,
    si.type !== "cardio" ? { icon: "timer", label: "Rest time", hint: fmtClock(restFor(it, si)) + (it.rest == null ? " (automatic)" : ""), fn: () => openRestSheet(it) } : null,
    next ? { icon: "link", label: linked ? "Unlink superset" : "Superset with next", hint: slotInfo(next, sess.entries[next.uid]).name, fn: () => toggleSuperset(items, i) } : null,
    i > 0 && (items[i - 1].section || null) === (it.section || null) ? { icon: "up", label: "Move up", hint: "Today only", fn: () => moveToday(day, it, -1) } : null,
    next && (next.section || null) === (it.section || null) ? { icon: "down", label: "Move down", hint: "Today only", fn: () => moveToday(day, it, 1) } : null,
    { icon: "skip", label: e.skipped ? "Don't skip" : "Skip today", fn: () => setSkipped(it, !e.skipped) },
    !extra ? { icon: "edit", label: "Edit in programme", hint: "Sets, reps, rest, section, cue, alternatives", fn: () => openItemEditor(store.program, day.id, it.uid) } : null,
    extra ? { icon: "edit", label: "Keep in the programme", hint: "Add it to " + day.name + " from now on", fn: () => keepInProgramme(day, it) } : null,
    { icon: "trash", label: "Remove from today", danger: true, fn: () => removeToday(day, it) }
  ]));
}

function swapFlow(it) {
  openPicker({
    title: "Swap exercise",
    onPick: (ids) => {
      const id = ids[0];
      const info = exInfo(id);
      if (isExtra(it)) {
        it.opts[it.pick] = { ex: id, n: null, img: null };
        it.reps = DEFAULT_REPS[info.type] || it.reps;
        withEntry(it, (en) => { en.swap = null; en.sets.forEach((s) => { if (!s.done) { s.a = null; s.b = null; } }); });
        return;
      }
      menuSheet("Swap to " + info.n, [
        { icon: "today", label: "Just today", hint: "Your programme stays the same", fn: () => withEntry(it, (en) => {
          en.swap = { ex: id, n: null, img: null };
          en.sets.forEach((s) => { if (!s.done) { s.a = null; s.b = null; } });
        }) },
        { icon: "edit", label: "Replace in programme", hint: "Use " + info.n + " from now on", fn: () => {
          replaceItemExercise(it, id);
          withEntry(it, (en) => { en.swap = null; en.sets.forEach((s) => { if (!s.done) { s.a = null; s.b = null; } }); });
          toast("Programme updated");
        } }
      ]);
    }
  });
}

function replaceItemExercise(it, id) {
  const info = exInfo(id);
  const oldType = slotInfo(it, null).type;
  it.opts[it.pick] = { ex: id, n: null, img: null };
  if (it.opts.length === 1) { delete it.p; delete it.s; delete it.cue; delete it.tag; }
  if (info.type !== oldType) { it.reps = DEFAULT_REPS[info.type] || it.reps; delete it.type; }
}

function toggleSuperset(items, i) {
  const a = items[i], b = items[i + 1];
  if (a.ss && b.ss === a.ss) {
    const g = a.ss;
    b.ss = null;
    if (!items.some((x) => x !== a && x.ss === g)) a.ss = null;
    delete b.ss;
    if (!a.ss) delete a.ss;
  } else {
    const g = a.ss || b.ss || uid();
    a.ss = g; b.ss = g;
  }
  saveNow();
  renderList();
}

function moveToday(day, it, dir) {
  const sess = curSession(true);
  const order = sessionItems(day, sess).map((x) => x.uid);
  const i = order.indexOf(it.uid), j = i + dir;
  if (j < 0 || j >= order.length) return;
  order.splice(i, 1);
  order.splice(j, 0, it.uid);
  sess.order = order;
  saveNow();
  renderList();
}

function removeToday(day, it, quiet) {
  const sess = curSession(true);
  const si = slotInfo(it, sess.entries[it.uid]);
  const extraIdx = sess.extra.indexOf(it);
  if (extraIdx !== -1) sess.extra.splice(extraIdx, 1);
  else sess.removed.push(it.uid);
  const entry = sess.entries[it.uid];
  delete sess.entries[it.uid];
  if (quiet) return;
  saveNow();
  renderList();
  afterLog();
  toast(si.name + " removed from today", { action: { label: "Undo", fn: () => {
    if (extraIdx !== -1) sess.extra.splice(extraIdx, 0, it);
    else sess.removed = sess.removed.filter((u) => u !== it.uid);
    if (entry) sess.entries[it.uid] = entry;
    saveNow();
    renderList();
    afterLog();
  } } });
}

function openRestSheet(it) {
  const si = slotInfo(it, null);
  const saved = it.rest;
  delete it.rest;
  const auto = restFor(it, si);
  if (saved != null) it.rest = saved;
  let val = restFor(it, si);
  openSheet({
    title: "Rest after " + si.name,
    body: (b, api) => {
      const out = h("div.big-num.num", { "aria-live": "polite" }, fmtClock(val));
      const set = (v) => { val = clamp(v, 0, 900); out.textContent = fmtClock(val); };
      b.append(out,
        h("div.row-btns.center", {}, [-30, -15, 15, 30].map((d) => h("button.btn", { type: "button", onclick: () => set(val + d) }, (d > 0 ? "+" : "−") + Math.abs(d) + " s"))),
        h("div.chip-row.center", {}, [45, 60, 90, 120, 150, 180, 240].map((v) => h("button.chip-btn", { type: "button", onclick: () => set(v) }, fmtClock(v)))),
        h("p.hint.center", {}, "Automatic for " + (it.reps || "this exercise") + ": " + fmtClock(auto) + ". Saved to the programme."),
        h("div.sheet-actions", {},
          h("button.btn", { type: "button", onclick: () => { delete it.rest; saveNow(); api.close(); renderList(); } }, "Use automatic"),
          h("button.btn.primary", { type: "button", onclick: () => { it.rest = val; saveNow(); api.close(); renderList(); } }, "Save")));
    }
  });
}

function currentLoad(it) {
  const sess = curSession(true);
  const e = ensureEntry(sess, it);
  const si = slotInfo(it, e);
  const idx = e.sets.findIndex((s) => s.t !== "warmup");
  if (idx < 0) return null;
  const s = e.sets[idx];
  return s.a != null ? s.a : prefillFor(it, si, e, idx).a;
}

function addWarmups(it) {
  const top = currentLoad(it);
  if (!top) { toast("Enter a working weight on set 1 first"); return; }
  const bar = store.settings.bar || 20;
  const round = (x) => Math.round(x / 2.5) * 2.5;
  const plan = [];
  if (top >= bar + 20) plan.push([bar, 10]);
  [[0.5, 5], [0.7, 3], [0.85, 1]].forEach((f) => {
    const w = round(top * f[0]);
    if (w > bar && w < top && !plan.some((x) => x[0] === w)) plan.push([w, f[1]]);
  });
  if (!plan.length) { toast("Too light for warm-up sets"); return; }
  withEntry(it, (e) => {
    const keep = e.sets.filter((s) => s.t !== "warmup" || s.done);
    e.sets = plan.map((x) => Object.assign(newSet("warmup"), { a: x[0], b: x[1] })).concat(keep);
    e.n = e.sets.filter((s) => s.t !== "warmup").length;
  });
  toast(plan.length + " warm-up sets added: " + plan.map((x) => fmtNum(x[0]) + "×" + x[1]).join(", "));
}

/* ---------- plate calculator ---------- */

function platesFor(target, bar, plates) {
  let per = (target - bar) / 2;
  if (per < -1e-9) return null;
  const out = [];
  plates.slice().sort((a, b) => b - a).forEach((p) => {
    while (per >= p - 1e-9) { out.push(p); per = Math.round((per - p) * 1000) / 1000; }
  });
  return { plates: out, left: per };
}

function openPlateCalc(kg) {
  let target = kg || 60;
  let bar = store.settings.bar || 20;
  openSheet({
    title: "Plate calculator",
    body: (b) => {
      const result = h("div.plates-out", { "aria-live": "polite" });
      const paint = () => {
        result.innerHTML = "";
        const r = platesFor(target, bar, store.settings.plates);
        if (!r) { result.appendChild(h("p.hint", {}, "Lighter than the bar.")); return; }
        const loaded = bar + 2 * r.plates.reduce((s, x) => s + x, 0);
        const max = Math.max.apply(null, store.settings.plates);
        appendKids(result, [
          h("div.bar-visual", { "aria-hidden": "true" },
            h("span.sleeve"),
            r.plates.map((p) => h("span.plate", { style: "height:" + Math.round(34 + 66 * p / max) + "px" }, fmtNum(p)))),
          h("p.plates-text", {}, r.plates.length ? "Each side: " + r.plates.map(fmtNum).join(" + ") + " kg" : "Just the bar"),
          Math.abs(loaded - target) > 1e-6 ? h("p.hint", {}, "Closest you can load: " + fmtNum(loaded) + " kg") : null]);
      };
      b.append(
        h("div.form-row", {}, h("label", { for: "plateTarget" }, "Target"),
          (() => { const i = numInput(target, null, "kg", (v) => { if (v != null) { target = v; paint(); } }, "Target weight in kg", "wide"); i.id = "plateTarget"; return i; })(),
          h("span.unit", {}, "kg")),
        h("div.form-row", {}, h("label", {}, "Bar"),
          segControl([[20, "20"], [15, "15"], [10, "10"], [0, "None"]], [20, 15, 10, 0].indexOf(bar) === -1 ? 20 : bar, (v) => { bar = v; paint(); }, "Bar weight")),
        result,
        h("p.hint", {}, "Plates you have: " + store.settings.plates.map(fmtNum).join(", ") + " kg. Change them in You → Settings."));
      paint();
    }
  });
}

/* ---------- footer, programme switcher, guide ---------- */

function dayFooter(p, day) {
  return h("section.day-foot", {},
    h("div.row-btns", {},
      h("button.btn.ghost", { type: "button", onclick: () => addToToday() }, icon("plus"), "Add exercise"),
      h("button.btn.ghost", { type: "button", onclick: () => openDayEditor(p.id, day.id) }, icon("edit"), "Edit this day")),
    h("p.hint", {}, "Adding asks whether it is just for today or part of every " + day.name + ". Warm-up, stretching and cooldown packages live under Add exercise."));
}

function sectionItems(specs, sec) {
  return specs.map((s) => newItem(s.ex, { sets: s.sets, reps: s.reps, rest: 0, section: sec.id }));
}

/* move a today-only exercise into the programme, keeping what is already logged */
function keepInProgramme(day, it, quiet) {
  const sess = curSession(true);
  const i = sess.extra.indexOf(it);
  if (i === -1) return;
  const name = slotInfo(it, sess.entries[it.uid]).name;
  sess.extra.splice(i, 1);
  day.items.push(it);
  placeBySection(day.items, it);
  sess.order = null;
  if (quiet) return;
  saveNow();
  renderList();
  toast(name + " added to " + day.name);
}

function addToToday() {
  const day = curDay();
  const existing = sessionItems(day, curSession(false));
  openPicker({
    title: "Add exercises", multi: true,
    sections: {
      day,
      onAdd: (specs, sec) => withDuplicateCheck(existing, specs, (s) => s.ex, "this day", (keep) => askScope(day, (scope) => {
        const items = sectionItems(keep, sec);
        addItemsToDay(items, scope, day, sec.name + ": " + items.length + (items.length === 1 ? " exercise" : " exercises"));
      }))
    },
    onPick: (ids) => withDuplicateCheck(existing, ids, (id) => id, "this day", (keep) => askScope(day, (scope) => {
      const items = keep.map((id) => newItem(id));
      if (items.length === 1) openState.set(items[0].uid, true);
      addItemsToDay(items, scope, day, items.length === 1 ? exInfo(keep[0]).n : items.length + " exercises");
    }))
  });
}

function switchProgram(id) {
  if (!store.programs[id] || id === store.program) return;
  store.program = id;
  view.dayId = store.lastDay[id] || suggestedDay(store.programs[id]);
  saveNow();
  renderCurrent();
}

function openProgramSwitcher() {
  menuSheet("Programme", store.programOrder.map((id) => {
    const p = store.programs[id];
    return { emoji: p.emoji || "🏋️", label: p.name, hint: p.days.length + (p.days.length === 1 ? " day" : " days"), current: id === store.program, fn: () => switchProgram(id) };
  }).concat([
    { icon: "edit", label: "Manage programmes", hint: "Create, copy, edit or share", fn: () => showTab("you") }
  ]));
}

function openGuide(p) {
  openSheet({
    title: p.name + " guide",
    body: (b) => {
      if (!p.notes.length) { b.appendChild(h("p.hint", {}, "No notes yet. Add them in the programme editor.")); return; }
      p.notes.forEach((n) => b.appendChild(h("details.note-item", {}, h("summary", {}, n[0]), h("p", {}, n[1]))));
    }
  });
}

/* ---------- finish ---------- */

function openFinish() {
  const p = activeProg();
  const day = curDay();
  const sess = curSession(false);
  if (!sess || !anyLogged(sess)) { toast("Log at least one set first"); return; }
  const now = Date.now();
  const s = summarize(day, sess);
  const preview = { ts: now, lines: clone(s.lines) };
  markPRs(preview);
  const last = store.history.find((x) => x.program === p.id && x.dayId === day.id && x.volume);
  const volDelta = last && s.volume ? s.volume - last.volume : null;
  const streak = computeStreak().current;
  openSheet({
    title: "Finish workout",
    body: (b, api) => {
      b.appendChild(h("div.celebrate", {},
        h("img.mascot-sm", { src: "assets/mascot-web.jpg", alt: "" }),
        h("div", {},
          h("b", {}, (day.title || day.name) + " done"),
          h("span", {}, fmtDate(todayISO()) + " · " + p.name + (preview.prs.length ? " · " + preview.prs.length + (preview.prs.length === 1 ? " new PR" : " new PRs") : "")))));
      b.appendChild(h("div.stat-grid", {},
        stat(fmtDur(elapsedAt(sess, now)), "duration"),
        stat(s.setsDone + "/" + s.setsTotal, "sets"),
        stat(s.volume ? s.volume.toLocaleString() : "-", "kg volume", volDelta ? (volDelta > 0 ? "+" : "−") + Math.abs(volDelta).toLocaleString() : null, volDelta > 0),
        stat(String(streak), streak === 1 ? "day streak" : "day streak")));
      if (preview.prs.length) b.appendChild(sheetSection("Personal records", preview.prs.map(prRow)));
      const hints = nextTimeHints(day, sess);
      if (hints.length) b.appendChild(sheetSection("Next time", h("div.kv-list", {}, hints)));
      if (s.extraSets) b.appendChild(h("p.hint", {}, "Plus " + s.extraSets + " warm-up, stretching or cooldown " + (s.extraSets === 1 ? "set" : "sets") + ", kept out of the totals above."));
      const open = s.lines.filter((l) => !l.skipped && !l.section && l.done < l.total).length;
      if (open) b.appendChild(h("p.hint", {}, open + (open === 1 ? " exercise isn't" : " exercises aren't") + " finished. Whatever you logged is saved."));
      b.appendChild(h("div.sheet-actions", {},
        h("button.btn", { type: "button", onclick: () => api.close() }, "Keep going"),
        h("button.btn.primary", { type: "button", onclick: () => api.close(() => saveWorkout(false)) }, "Save workout")));
      b.appendChild(h("div.sheet-actions.minor", {},
        h("button.btn.ghost.sm.danger", { type: "button", onclick: () => { if (confirm("Discard this session? Nothing from it will be saved.")) api.close(discardSession); } }, icon("trash", "sm"), "Discard"),
        h("button.btn.ghost.sm", { type: "button", onclick: () => api.close(() => saveWorkout(true)) }, icon("share", "sm"), "Save and share")));
    }
  });
}

function nextTimeHints(day, sess) {
  const out = [];
  sessionItems(day, sess).forEach((it) => {
    const e = sess.entries[it.uid];
    if (!e || e.skipped) return;
    const si = slotInfo(it, e);
    const done = e.sets.filter((s) => s.done);
    if (!done.length) return;
    const sug = suggestion(it, si, done);
    if (sug && sug.short) out.push(h("div.kv", { class: sug.kind === "up" ? "up" : "" }, h("span", {}, si.name), h("b", {}, sug.short)));
  });
  return out.slice(0, 8);
}

function saveWorkout(share) {
  const p = activeProg();
  const day = curDay();
  const sess = curSession(false);
  if (!sess) return;
  const entry = commitSession(p.id, day.id, sess, Date.now(), todayISO());
  delete store.today.sessions[sessKey(p.id, day.id)];
  if (store.timer) stopRest();
  saveNow();
  openState.clear();
  renderToday();
  afterLog();
  requestPersistence();
  if (!entry) return;
  if (share) { shareWorkout(entry); return; }
  const due = store.history.length - (store.backup.countAtLast || 0) >= 10;
  const msg = "Workout saved" + (entry.prs.length ? " · " + entry.prs.length + (entry.prs.length === 1 ? " PR" : " PRs") : "");
  if (due) toast(msg + ". Time for a backup.", { action: { label: "Back up", fn: exportBackup } });
  else toast(msg, { action: { label: "Share", fn: () => shareWorkout(entry) } });
}

function discardSession() {
  const p = activeProg();
  const day = curDay();
  delete store.today.sessions[sessKey(p.id, day.id)];
  if (store.timer) stopRest();
  saveNow();
  openState.clear();
  renderToday();
  afterLog();
  toast("Session discarded");
}

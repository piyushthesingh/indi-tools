/* ===============================================================
   Editing: the exercise library picker, custom exercises, and the
   programme (split), day and exercise editors.
=============================================================== */

/* ---------- exercise picker ----------
   o: { title, multi, onPick(ids), sections?: { day, onAdd(specs, section) } }
   With `sections`, Warm-up / Stretching / Cooldown packages are offered first. */
function openPicker(o) {
  let q = "", cat = null;
  const picked = [];
  return openSheet({
    title: o.title || "Exercise library", full: true, cls: "picker",
    body: (b, api) => {
      const input = h("input.search-in", {
        type: "search", placeholder: "Search " + allExercises().length + " exercises", autocomplete: "off",
        autocorrect: "off", autocapitalize: "none", spellcheck: "false", "aria-label": "Search exercises", autofocus: true
      });
      const chips = h("div.chip-row.scroll", { role: "radiogroup", "aria-label": "Category" });
      [null].concat(CATEGORIES, store.custom.length ? ["__custom"] : []).forEach((c) => {
        const btn = h("button.chip-btn", { type: "button", role: "radio", "aria-checked": String(c === cat) },
          c == null ? "All" : c === "__custom" ? "Your exercises" : c);
        btn.addEventListener("click", () => {
          cat = c;
          $$("button", chips).forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
          paint();
        });
        chips.appendChild(btn);
      });
      const count = h("p.hint.pick-count", { "aria-live": "polite" });
      const list = h("div.pick-list", { role: "listbox", "aria-label": "Exercises", "aria-multiselectable": o.multi ? "true" : null });
      b.append(h("div.search-wrap", {}, icon("search"), input), chips, count, list);

      let t = null;
      input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { q = input.value; paint(); }, 50); });
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const first = list.querySelector(".pick-row");
        if (first && !o.multi) first.click();
        input.blur();
      });

      function paintFoot() {
        if (!o.multi) return;
        api.setFooter(picked.length
          ? h("button.btn.primary.block", { type: "button", onclick: () => api.close(() => o.onPick(picked.slice())) },
              "Add " + picked.length + (picked.length === 1 ? " exercise" : " exercises"))
          : null);
      }

      function paint() {
        const custom = cat === "__custom";
        const res = searchExercises(q, { cat: custom ? null : cat, pool: custom ? store.custom : null, limit: 150 });
        list.innerHTML = "";
        count.textContent = q.trim() ? (res.length ? res.length + (res.length === 1 ? " match" : " matches") : "No matches") : "";
        if (o.sections && !q.trim() && cat == null) {
          list.appendChild(h("div.pick-group", {}, "Sections"));
          SECTIONS.forEach((sec) => {
            list.appendChild(h("button.pick-row.section", { type: "button", onclick: () => api.close(() => openSectionPackage(sec, o.sections)) },
              h("span.thumb.ph.sec-ico", { "aria-hidden": "true" }, icon(sec.icon)),
              h("span.pick-main", {}, h("span.pick-name", {}, sec.name), h("small.wrap", {}, sec.hint)),
              icon("chevronR", "muted")));
          });
          list.appendChild(h("div.pick-group", {}, "Exercises"));
        }
        res.forEach((r) => {
          const info = r.info;
          const sel = picked.indexOf(info.id) !== -1;
          const check = o.multi ? h("span.pick-check", { "aria-hidden": "true" }, icon(sel ? "check" : "plus")) : icon("chevronR", "muted");
          const row = h("button.pick-row", { type: "button", role: "option", "aria-selected": String(sel) },
            thumbFor(EX_IMAGES[String(info.id)] || null, info, "thumb"),
            h("span.pick-main", {},
              h("span.pick-name", { html: highlightName(info.n, q) }),
              h("small", {}, [info.cat, info.equip].filter(Boolean).join(" · "))),
            check);
          row.addEventListener("click", () => {
            if (!o.multi) { api.close(() => o.onPick([info.id])); return; }
            const i = picked.indexOf(info.id);
            if (i === -1) picked.push(info.id); else picked.splice(i, 1);
            row.setAttribute("aria-selected", String(i === -1));
            check.innerHTML = "";
            check.appendChild(icon(i === -1 ? "check" : "plus"));
            paintFoot();
          });
          list.appendChild(row);
        });
        const typed = q.trim();
        if (typed.length >= 2) {
          list.appendChild(h("button.pick-row.create", {
            type: "button",
            onclick: () => openCustomExercise(typed, (id) => {
              if (!o.multi) { api.close(() => o.onPick([id])); return; }
              picked.push(id); paint(); paintFoot();
            })
          }, h("span.thumb.ph", { "aria-hidden": "true" }, icon("plus")),
            h("span.pick-main", {}, h("span.pick-name", {}, "Create “" + typed + "”"), h("small", {}, "Can't find it? Add your own exercise"))));
        }
      }
      paint();
    }
  });
}

/* a suggested warm-up, stretching or cooldown package for a day, with body areas to adjust */
function openSectionPackage(sec, ctx) {
  const det = detectRegions(ctx.day);
  let regions = det.regions.slice();
  const unchecked = new Set();
  openSheet({
    title: sec.name + " · " + (ctx.day.title || ctx.day.name), full: true,
    body: (b, api) => {
      function paintFoot(specs) {
        const n = specs.filter((s) => !unchecked.has(s.ex)).length;
        api.setFooter(h("button.btn.primary.block", {
          type: "button", disabled: !n,
          onclick: () => api.close(() => ctx.onAdd(specs.filter((s) => !unchecked.has(s.ex)), sec))
        }, n ? "Add " + n + (n === 1 ? " exercise" : " exercises") + (sec.where === "start" ? " at the start" : " at the end") : "Pick at least one"));
      }
      function paint() {
        b.innerHTML = "";
        b.appendChild(h("p.hint", {}, sec.hint));
        b.appendChild(h("p.pkg-reason", {}, icon("info", "sm"), h("span", {}, det.reason + " Change the body areas to adjust.")));
        const chips = h("div.chip-row", { role: "group", "aria-label": "Body areas" });
        REGIONS.forEach((r) => {
          const on = regions.indexOf(r[0]) !== -1;
          chips.appendChild(h("button.chip-btn", {
            type: "button", role: "checkbox", "aria-checked": String(on),
            onclick: () => {
              regions = on ? regions.filter((x) => x !== r[0]) : regions.concat(r[0]);
              paint();
            }
          }, r[1]));
        });
        b.appendChild(chips);
        const specs = packageFor(sec.id, regions);
        const list = h("div.pick-list", { role: "group", "aria-label": sec.name + " exercises" });
        specs.forEach((spec) => {
          const info = exInfo(spec.ex);
          const check = h("span.pick-check", { "aria-hidden": "true" });
          const row = h("button.pick-row", { type: "button", role: "checkbox" },
            thumbFor(EX_IMAGES[String(info.id)] || null, info, "thumb"),
            h("span.pick-main", {},
              h("span.pick-name", {}, info.n),
              h("small", {}, (spec.sets > 1 ? spec.sets + " × " : "") + spec.reps + (info.equip && !/^bodyweight$/i.test(info.equip) ? " · " + info.equip : ""))),
            check);
          const sync = () => {
            const on = !unchecked.has(spec.ex);
            row.setAttribute("aria-checked", String(on));
            row.setAttribute("aria-selected", String(on));
            check.innerHTML = "";
            check.appendChild(icon(on ? "check" : "plus"));
          };
          row.addEventListener("click", () => {
            if (unchecked.has(spec.ex)) unchecked.delete(spec.ex); else unchecked.add(spec.ex);
            sync();
            paintFoot(specs);
          });
          sync();
          list.appendChild(row);
        });
        if (!specs.length) list.appendChild(h("p.empty", {}, "Pick at least one body area."));
        b.appendChild(list);
        b.appendChild(h("p.hint", {}, "Added as their own section with no rest timer. Change holds and rounds like any exercise."));
        paintFoot(specs);
      }
      paint();
    }
  });
}

/* Adding something that is already there is allowed, but say so first. */
function withDuplicateCheck(existing, list, getEx, where, onProceed) {
  const have = new Set();
  (existing || []).forEach((it) => it.opts.forEach((o) => have.add(o.ex)));
  const dupes = list.filter((x) => have.has(getEx(x)));
  if (!dupes.length) { onProceed(list); return; }
  const names = dupes.map((x) => exInfo(getEx(x)).n);
  openSheet({
    title: dupes.length === 1 ? "Already in " + where : names.length + " already in " + where,
    body: (b, api) => {
      appendKids(b, [
        h("p", {}, dupes.length === 1
          ? "“" + names[0] + "” is already in " + where + "."
          : "These are already in " + where + ":"),
        dupes.length > 1 ? h("div.kv-list", {}, names.map((n) => h("div.kv", {}, h("span", {}, n)))) : null,
        h("p.hint", {}, "Adding it twice is fine if you meant to, for example a lighter set later in the session."),
        h("div.sheet-actions", {},
          h("button.btn", {
            type: "button",
            onclick: () => api.close(() => {
              const keep = list.filter((x) => !have.has(getEx(x)));
              if (keep.length) onProceed(keep);
            })
          }, dupes.length === list.length ? "Cancel" : "Skip " + dupes.length),
          h("button.btn.primary", { type: "button", onclick: () => api.close(() => onProceed(list)) }, "Add anyway"))
      ]);
    }
  });
}

/* today's list can be ordered by hand; forget that order when the day changes */
function clearSessionOrder(p, d) {
  const s = store.today.sessions[sessKey(p.id, d.id)];
  if (s) s.order = null;
}

function formField(label, control, hint) {
  return h("label.field", {}, h("span.field-label", {}, label), control, hint ? h("small.hint", {}, hint) : null);
}

function openCustomExercise(name, done) {
  openSheet({
    title: "New exercise",
    body: (b, api) => {
      const nameIn = h("input.text-in", { type: "text", value: cap(name || ""), autocomplete: "off", maxlength: "60" });
      const catSel = h("select.text-in", {}, CATEGORIES.map((c) => h("option", { value: c }, c)));
      const typeSel = h("select.text-in", {}, Object.keys(TYPES).map((k) => h("option", { value: k, selected: k === "wr" }, TYPES[k].label)));
      const mSel = h("select.text-in", {}, h("option", { value: "" }, "Not sure"), Object.keys(NAMES).map((k) => h("option", { value: k }, NAMES[k])));
      const equipIn = h("input.text-in", { type: "text", placeholder: "e.g. Dumbbells, bench", maxlength: "60" });
      b.append(
        formField("Name", nameIn),
        formField("Category", catSel),
        formField("How you log it", typeSel),
        formField("Main muscle", mSel, "Used for the sets-per-muscle chart."),
        formField("Equipment", equipIn),
        h("div.sheet-actions", {},
          h("button.btn", { type: "button", onclick: () => api.close() }, "Cancel"),
          h("button.btn.primary", {
            type: "button", onclick: () => {
              const n = nameIn.value.trim();
              if (!n) { nameIn.focus(); return; }
              const same = allExercises().find((x) => x.n.toLowerCase() === n.toLowerCase());
              if (same) { toast("“" + same.n + "” is already in the library"); api.close(() => done(same.id)); return; }
              const id = "c:" + uid();
              store.custom.push({
                id, n, cat: catSel.value, target: mSel.value ? NAMES[mSel.value] : "", fam: "",
                equip: equipIn.value.trim(), tier: 2, type: typeSel.value, p: mSel.value ? [mSel.value] : [], s: [], custom: true
              });
              saveNow();
              api.close(() => done(id));
            }
          }, "Create")));
    }
  });
}

/* ---------- helpers shared by the editors ---------- */

function moveInArray(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
}

function menuRow(iconName, label, hint, fn, danger) {
  return h("button", { type: "button", class: "menu-item" + (danger ? " danger" : ""), onclick: fn },
    icon(iconName), h("span.menu-label", {}, label, hint ? h("small", {}, hint) : null));
}

function repsInput(it, si) {
  const i = h("input.text-in", { type: "text", value: it.reps, placeholder: DEFAULT_REPS[si.type] || "8-12", "aria-label": "Target reps or time", autocomplete: "off", maxlength: "30" });
  i.addEventListener("change", () => { it.reps = i.value.trim() || DEFAULT_REPS[si.type] || "8-12"; i.value = it.reps; saveNow(); });
  return i;
}

const REST_CHOICES = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
function restSelect(it, si) {
  const saved = it.rest;
  delete it.rest;
  const auto = restFor(it, si);
  if (saved != null) it.rest = saved;
  const sel = h("select.text-in", { "aria-label": "Rest between sets" },
    h("option", { value: "" }, "Auto " + fmtClock(auto)),
    REST_CHOICES.map((v) => h("option", { value: String(v), selected: it.rest === v }, fmtClock(v))));
  if (it.rest != null && REST_CHOICES.indexOf(it.rest) === -1) sel.appendChild(h("option", { value: String(it.rest), selected: true }, fmtClock(it.rest)));
  sel.addEventListener("change", () => { if (sel.value === "") delete it.rest; else it.rest = +sel.value; saveNow(); });
  return sel;
}

function findItem(pid, dayId, itemUid) {
  const p = store.programs[pid];
  const d = p && p.days.find((x) => x.id === dayId);
  const it = d && d.items.find((x) => x.uid === itemUid);
  return { p, d, it };
}

/* ---------- programmes ---------- */

function createProgram(base, name) {
  const id = "p" + uid();
  let p;
  if (base) {
    p = clone(base);
    const ssMap = {};
    p.days.forEach((d) => d.items.forEach((it) => {
      it.uid = uid();
      if (it.ss) { ssMap[it.ss] = ssMap[it.ss] || uid(); it.ss = ssMap[it.ss]; }
    }));
  } else {
    p = { emoji: "🏋️", days: [{ id: uid(), name: "Day 1", title: "", focus: "", items: [] }], notes: [] };
  }
  p.id = id;
  p.name = name || (base ? base.name + " copy" : "My programme");
  store.programs[id] = p;
  store.programOrder.push(id);
  saveNow();
  return p;
}

function openNewProgram() {
  menuSheet("New programme", [
    { icon: "plus", label: "Start blank", hint: "One empty day to build on", fn: () => {
      const p = createProgram(null, "My programme");
      switchProgram(p.id);
      openProgramEditor(p.id);
    } }
  ].concat(store.programOrder.map((id) => {
    const src = store.programs[id];
    return { emoji: src.emoji || "🏋️", label: "Copy " + src.name, hint: "Your current version, with your edits", fn: () => {
      const p = createProgram(src, src.name + " copy");
      toast("Created “" + p.name + "”");
      openProgramEditor(p.id);
    } };
  })).concat(TEMPLATES.map((t) => ({
    emoji: t.emoji, label: "Original " + t.name, hint: "The built-in template, unedited", fn: () => {
      const p = createProgram(programFromTemplate(t), t.name);
      p.template = t.id;
      saveNow();
      toast("Created “" + p.name + "”");
      openProgramEditor(p.id);
    }
  }))));
}

function deleteProgram(p, api) {
  if (!confirm("Delete “" + p.name + "”? Workouts you logged with it stay in History.")) return;
  Object.keys(store.today.sessions).forEach((k) => {
    if (k.indexOf(p.id + ":") !== 0) return;
    const sess = store.today.sessions[k];
    if (anyLogged(sess)) commitSession(p.id, k.slice(p.id.length + 1), sess, sess.lastAt || Date.now(), todayISO());
    delete store.today.sessions[k];
  });
  delete store.programs[p.id];
  store.programOrder = store.programOrder.filter((x) => x !== p.id);
  delete store.lastDay[p.id];
  if (store.program === p.id) { store.program = store.programOrder[0]; chooseDay(); }
  saveNow();
  api.close(() => { renderCurrent(); toast("Programme deleted"); });
}

function openProgramEditor(pid) {
  const p = store.programs[pid];
  if (!p) return;
  openSheet({
    title: "Edit programme", full: true,
    onClose: () => renderCurrent(),
    body: (b, api) => {
      function paint() {
        b.innerHTML = "";
        const emojiIn = h("input.text-in.emoji-in", { type: "text", value: p.emoji || "", "aria-label": "Programme icon (an emoji)", maxlength: "8" });
        emojiIn.addEventListener("change", () => { p.emoji = emojiIn.value.trim() || "🏋️"; saveNow(); });
        const nameIn = h("input.text-in", { type: "text", value: p.name, "aria-label": "Programme name", maxlength: "40" });
        nameIn.addEventListener("change", () => { p.name = nameIn.value.trim() || p.name; nameIn.value = p.name; saveNow(); });
        b.appendChild(h("div.name-row", {}, emojiIn, nameIn));

        b.appendChild(h("h3.sec-title", {}, "Days (" + p.days.length + ")"));
        b.appendChild(h("p.hint", {}, usesWeekdays(p)
          ? "With 6 or more days, Today opens on the day matching the weekday: Monday is day 1. Change this in You → Settings."
          : "Today opens on the day after the one you last finished. Change this in You → Settings."));
        const list = h("div.edit-list");
        p.days.forEach((d, i) => {
          list.appendChild(h("div.edit-row", {},
            h("span.day-num.num", { "aria-hidden": "true" }, String(i + 1)),
            h("button.edit-main", { type: "button", onclick: () => openDayEditor(pid, d.id, paint) },
              h("b", {}, d.name),
              h("small", {}, d.items.length + (d.items.length === 1 ? " exercise" : " exercises") + (d.focus ? " · " + d.focus : ""))),
            h("button.icon-btn.sm", { type: "button", "aria-label": "Move " + d.name + " up", disabled: i === 0, onclick: () => { moveInArray(p.days, i, -1); saveNow(); paint(); } }, icon("up")),
            h("button.icon-btn.sm", { type: "button", "aria-label": "Move " + d.name + " down", disabled: i === p.days.length - 1, onclick: () => { moveInArray(p.days, i, 1); saveNow(); paint(); } }, icon("down")),
            h("button.icon-btn.sm", { type: "button", "aria-label": "More for " + d.name, onclick: () => menuSheet(d.name, [
              { icon: "edit", label: "Edit day", fn: () => openDayEditor(pid, d.id, paint) },
              { icon: "copy", label: "Duplicate day", fn: () => { duplicateDay(p, i); paint(); } },
              { icon: "trash", label: "Delete day", danger: true, fn: () => { if (deleteDay(p, d)) paint(); } }
            ]) }, icon("more"))));
        });
        b.appendChild(list);
        b.appendChild(h("button.btn.ghost.block", {
          type: "button", onclick: () => {
            const d = { id: uid(), name: "Day " + (p.days.length + 1), title: "", focus: "", items: [] };
            p.days.push(d);
            saveNow();
            paint();
            openDayEditor(pid, d.id, paint);
          }
        }, icon("plus"), "Add day"));

        b.appendChild(h("h3.sec-title", {}, "Guide notes"));
        b.appendChild(h("p.hint", {}, "Shown from the book button on Today. Good for the “why” behind the plan."));
        const notes = h("div.notes-edit");
        p.notes.forEach((n, i) => {
          const tIn = h("input.text-in", { type: "text", value: n[0], "aria-label": "Note title", maxlength: "80" });
          const bIn = h("textarea.text-in", { rows: "3", value: n[1], "aria-label": "Note text" });
          tIn.addEventListener("change", () => { n[0] = tIn.value; saveNow(); });
          bIn.addEventListener("change", () => { n[1] = bIn.value; saveNow(); });
          notes.appendChild(h("div.note-edit", {}, h("div.note-edit-head", {}, tIn,
            h("button.icon-btn.sm", { type: "button", "aria-label": "Delete note", onclick: () => { p.notes.splice(i, 1); saveNow(); paint(); } }, icon("trash"))), bIn));
        });
        b.appendChild(notes);
        b.appendChild(h("button.btn.ghost.block", { type: "button", onclick: () => { p.notes.push(["New note", ""]); saveNow(); paint(); } }, icon("plus"), "Add note"));

        b.appendChild(h("h3.sec-title", {}, "Programme"));
        const tpl = p.template && TEMPLATES.find((t) => t.id === p.template);
        b.appendChild(h("div.menu-list", {},
          store.program !== p.id ? menuRow("check", "Use this programme", null, () => { switchProgram(p.id); api.close(); }) : null,
          menuRow("link", "Share as a link", "Anyone with the link can add their own copy", () => shareProgramLink(p)),
          menuRow("copy", "Duplicate", null, () => { const c = createProgram(p, p.name + " copy"); toast("Created “" + c.name + "”"); }),
          tpl ? menuRow("back", "Reset to the original " + tpl.name, "Undo every edit to days and exercises. History stays.", () => resetProgram(p, tpl, api)) : null,
          store.programOrder.length > 1 ? menuRow("trash", "Delete programme", "History stays", () => deleteProgram(p, api), true) : null));
      }
      paint();
    }
  });
}

function duplicateDay(p, i) {
  const c = clone(p.days[i]);
  const ssMap = {};
  c.id = uid();
  c.name = p.days[i].name + " copy";
  c.title = c.title ? c.title + " copy" : "";
  c.items.forEach((it) => {
    it.uid = uid();
    if (it.ss) { ssMap[it.ss] = ssMap[it.ss] || uid(); it.ss = ssMap[it.ss]; }
  });
  p.days.splice(i + 1, 0, c);
  saveNow();
}

function deleteDay(p, d) {
  if (!confirm("Delete “" + d.name + "”? Workouts already logged for it stay in History.")) return false;
  const k = sessKey(p.id, d.id);
  const sess = store.today.sessions[k];
  if (sess && anyLogged(sess)) {
    commitSession(p.id, d.id, sess, sess.lastAt || Date.now(), todayISO());
    toast("Today's sets for " + d.name + " were saved to History");
  }
  delete store.today.sessions[k];
  p.days = p.days.filter((x) => x !== d);
  if (store.lastDay[p.id] === d.id) delete store.lastDay[p.id];
  if (store.program === p.id && view.dayId === d.id) view.dayId = p.days[0] ? p.days[0].id : null;
  saveNow();
  return true;
}

function resetProgram(p, tpl, api) {
  if (!confirm("Reset “" + p.name + "” to the original " + tpl.name + "? Your edits to its days are lost; History stays.")) return;
  const fresh = programFromTemplate(tpl, p.id);
  fresh.name = p.name;
  fresh.emoji = p.emoji;
  Object.keys(store.today.sessions).forEach((k) => {
    if (k.indexOf(p.id + ":") !== 0) return;
    const dayId = k.slice(p.id.length + 1);
    const sess = store.today.sessions[k];
    if (!fresh.days.some((d) => d.id === dayId)) {
      if (anyLogged(sess)) commitSession(p.id, dayId, sess, sess.lastAt || Date.now(), todayISO());
      delete store.today.sessions[k];
    }
  });
  store.programs[p.id] = fresh;
  if (store.program === p.id && !fresh.days.some((d) => d.id === view.dayId)) view.dayId = fresh.days[0] && fresh.days[0].id;
  saveNow();
  api.close(() => { openProgramEditor(p.id); toast("Reset to the original"); });
}

/* ---------- day editor ---------- */

function openDayEditor(pid, dayId, after) {
  const p = store.programs[pid];
  const d = p && p.days.find((x) => x.id === dayId);
  if (!d) return;
  openSheet({
    title: "Edit day", full: true,
    onClose: () => { if (after) after(); if (!overlays.length) renderCurrent(); },
    body: (b) => {
      function paint() {
        b.innerHTML = "";
        const nameIn = h("input.text-in", { type: "text", value: d.name, maxlength: "30", "aria-label": "Day name" });
        nameIn.addEventListener("change", () => {
          const v = nameIn.value.trim() || d.name;
          if (!d.title || d.title === d.name) d.title = v;
          d.name = v;
          nameIn.value = v;
          saveNow();
        });
        const titleIn = h("input.text-in", { type: "text", value: d.title || "", placeholder: d.name, maxlength: "60", "aria-label": "Day heading" });
        titleIn.addEventListener("change", () => { d.title = titleIn.value.trim(); saveNow(); });
        const focusIn = h("input.text-in", { type: "text", value: d.focus || "", placeholder: "e.g. Quads, hamstrings, calves", maxlength: "90" });
        focusIn.addEventListener("change", () => { d.focus = focusIn.value.trim(); saveNow(); });
        b.append(
          formField("Tab name", nameIn, "Short, shown in the day tabs."),
          formField("Heading", titleIn),
          formField("Focus", focusIn));

        b.appendChild(h("h3.sec-title", {}, "Exercises (" + d.items.length + ")"));
        const list = h("div.item-list");
        /* anything added on Today for today only shows here too, so it can be kept */
        const sess = store.today.sessions[sessKey(p.id, d.id)];
        const extras = (sess && sess.extra) || [];
        if (extras.length) {
          b.appendChild(h("p.hint", {}, extras.length + (extras.length === 1 ? " exercise was added for today only. Keep it" : " exercises were added for today only. Keep them") + " to make them part of every " + d.name + "."));
        }
        const rows = d.items.map((it) => ({ it, perm: true })).concat(extras.map((it) => ({ it, perm: false })));
        rows.sort((a, b2) => sectionRank(a.it) - sectionRank(b2.it));
        const grouped = rows.some((r) => r.it.section);
        let lastSec;
        rows.forEach((r) => {
          const sec = r.it.section || null;
          if (grouped && sec !== lastSec) {
            list.appendChild(h("div.section-label", {}, icon(sectionIcon(sec), "sm"), sectionName(sec)));
            lastSec = sec;
          }
          if (r.perm) list.appendChild(itemEditRow(p, d, r.it, d.items.indexOf(r.it), paint));
          else list.appendChild(todayOnlyRow(p, d, r.it, paint));
        });
        if (!d.items.length) list.appendChild(h("p.empty", {}, "No exercises yet."));
        b.appendChild(list);
        b.appendChild(h("button.btn.primary.block", {
          type: "button",
          onclick: () => openPicker({
            title: "Add to " + d.name, multi: true,
            sections: {
              day: d,
              onAdd: (specs, sec) => withDuplicateCheck(d.items, specs, (s) => s.ex, d.name, (keep) => {
                const items = sectionItems(keep, sec);
                items.forEach((it) => d.items.push(it));
                items.forEach((it) => placeBySection(d.items, it));
                clearSessionOrder(p, d);
                saveNow();
                paint();
                toast(sec.name + ": " + items.length + (items.length === 1 ? " exercise" : " exercises") + " added to " + d.name);
              })
            },
            onPick: (ids) => withDuplicateCheck(d.items, ids, (id) => id, d.name, (keep) => {
              keep.forEach((id) => d.items.push(newItem(id)));
              clearSessionOrder(p, d);
              saveNow();
              paint();
              toast(keep.length === 1 ? exInfo(keep[0]).n + " added" : keep.length + " exercises added");
            })
          })
        }, icon("plus"), "Add exercises"));
        b.appendChild(h("p.hint", {}, "Changes are saved as you go and show up on Today straight away."));
      }
      paint();
    }
  });
}

function itemEditRow(p, d, it, i, repaint) {
  const si = slotInfo(it, null);
  const names = it.opts.map((o) => o.n || exInfo(o.ex).n).join(" / ");
  const next = d.items[i + 1];
  const linked = !!(it.ss && next && next.ss === it.ss);
  return h("div", { class: "item-edit" + (it.ss ? " in-ss" : "") },
    h("div.item-edit-head", {},
      thumbFor(si.img, si.info, "thumb"),
      h("button.edit-main", { type: "button", onclick: () => openItemEditor(p.id, d.id, it.uid, repaint) },
        h("b", {}, names),
        h("small", {}, (it.section ? sectionName(it.section) + " · " : "") + (TYPES[si.type] || TYPES.wr).label + (it.opts.length > 1 ? " · " + it.opts.length + " options" : "") + (it.tag ? " · " + it.tag : ""))),
      h("button.icon-btn.sm", { type: "button", "aria-label": "Move up", disabled: !(i > 0 && (d.items[i - 1].section || null) === (it.section || null)), onclick: () => { moveInArray(d.items, i, -1); clearSessionOrder(p, d); saveNow(); repaint(); } }, icon("up")),
      h("button.icon-btn.sm", { type: "button", "aria-label": "Move down", disabled: !(next && (next.section || null) === (it.section || null)), onclick: () => { moveInArray(d.items, i, 1); clearSessionOrder(p, d); saveNow(); repaint(); } }, icon("down")),
      h("button.icon-btn.sm", { type: "button", "aria-label": "More for " + names, onclick: () => menuSheet(names, [
        { icon: "edit", label: "Edit details", hint: "Alternatives, cue, logging type", fn: () => openItemEditor(p.id, d.id, it.uid, repaint) },
        { icon: "swap", label: "Replace exercise", fn: () => openPicker({ title: "Replace " + si.name, onPick: (ids) => { replaceItemExercise(it, ids[0]); saveNow(); repaint(); } }) },
        { icon: "plus", label: "Add an alternative", hint: "Switch between them with ⇄ on Today", fn: () => openPicker({ title: "Alternative to " + si.name, onPick: (ids) => { it.opts.push({ ex: ids[0], n: null, img: null }); saveNow(); repaint(); } }) },
        next ? { icon: "link", label: linked ? "Unlink superset" : "Superset with next", hint: slotInfo(next, null).name, fn: () => { editorToggleSuperset(d.items, i); saveNow(); repaint(); } } : null,
        { icon: "copy", label: "Duplicate", fn: () => { const c = clone(it); c.uid = uid(); delete c.ss; d.items.splice(i + 1, 0, c); clearSessionOrder(p, d); saveNow(); repaint(); } },
        { icon: "trash", label: "Remove from " + d.name, danger: true, fn: () => { d.items.splice(i, 1); clearSessionOrder(p, d); saveNow(); repaint(); } }
      ]) }, icon("more"))),
    h("div.item-edit-fields", {},
      h("div.mini-field", {}, h("span", {}, "Sets"), stepper(it.sets, { min: 1, max: 12, label: "Sets" }, (v) => { it.sets = v; saveNow(); })),
      h("label.mini-field", {}, h("span", {}, si.type === "cardio" ? "Time" : "Reps"), repsInput(it, si)),
      si.type !== "cardio" ? h("label.mini-field", {}, h("span", {}, "Rest"), restSelect(it, si)) : null),
    linked ? h("div.ss-link", {}, icon("link", "sm"), "Superset with the next exercise") : null);
}

/* an exercise that exists only in today's session: keep it, or drop it */
function todayOnlyRow(p, d, it, repaint) {
  const si = slotInfo(it, null);
  const sess = () => store.today.sessions[sessKey(p.id, d.id)];
  const drop = () => {
    const s = sess();
    if (!s) return;
    const i = s.extra.indexOf(it);
    if (i !== -1) s.extra.splice(i, 1);
    delete s.entries[it.uid];
    s.order = null;
  };
  return h("div.item-edit.today-only", {},
    h("div.item-edit-head", {},
      thumbFor(si.img, si.info, "thumb"),
      h("div.edit-main.static", {},
        h("b", {}, si.name),
        h("small", {}, "Today only · " + plannedSets(it) + " × " + (it.reps || "-"))),
      h("button.chip-btn", {
        type: "button",
        onclick: () => {
          const s = sess();
          if (!s) return;
          const i = s.extra.indexOf(it);
          if (i !== -1) s.extra.splice(i, 1);
          d.items.push(it);
          placeBySection(d.items, it);
          s.order = null;
          saveNow();
          repaint();
          toast(si.name + " added to every " + d.name);
        }
      }, "Keep"),
      h("button.icon-btn.sm", {
        type: "button", "aria-label": "Remove " + si.name + " from today",
        onclick: () => { drop(); saveNow(); repaint(); }
      }, icon("trash"))));
}

function editorToggleSuperset(items, i) {
  const a = items[i], b = items[i + 1];
  if (a.ss && b.ss === a.ss) {
    const g = a.ss;
    delete b.ss;
    if (!items.some((x) => x !== a && x.ss === g)) delete a.ss;
  } else {
    const g = a.ss || b.ss || uid();
    a.ss = g; b.ss = g;
  }
}

/* ---------- single exercise editor ---------- */

function openItemEditor(pid, dayId, itemUid, after) {
  const found = findItem(pid, dayId, itemUid);
  const it = found.it;
  if (!it) return;
  openSheet({
    title: "Edit exercise", full: true,
    onClose: () => { if (after) after(); if (view.tab === "today") renderList(); },
    body: (b, api) => {
      function paint() {
        b.innerHTML = "";
        const si = slotInfo(it, null);
        b.appendChild(h("p.muted", {}, found.d.name + " · " + sectionName(it.section) + (it.section ? " section" : "")));
        b.appendChild(h("h3.sec-title", {}, it.opts.length > 1 ? "Exercise and alternatives" : "Exercise"));
        const optList = h("div.edit-list");
        it.opts.forEach((o, k) => {
          const info = exInfo(o.ex);
          optList.appendChild(h("div.edit-row", {},
            thumbFor(imageFor(o, info), info, "thumb"),
            h("div.edit-main.static", {},
              h("b", {}, o.n || info.n),
              h("small", {}, k === it.pick ? (it.opts.length > 1 ? "In use" : [info.cat, info.equip].filter(Boolean).join(" · ")) : "Alternative")),
            it.opts.length > 1 && k !== it.pick ? h("button.chip-btn", { type: "button", onclick: () => { it.pick = k; saveNow(); paint(); } }, "Use") : null,
            h("button.icon-btn.sm", {
              type: "button", "aria-label": "Replace " + (o.n || info.n),
              onclick: () => openPicker({ title: "Replace " + (o.n || info.n), onPick: (ids) => {
                const keep = it.pick;
                it.pick = k;
                replaceItemExercise(it, ids[0]);
                it.pick = keep;
                saveNow();
                paint();
              } })
            }, icon("swap")),
            it.opts.length > 1 ? h("button.icon-btn.sm", {
              type: "button", "aria-label": "Remove " + (o.n || info.n),
              onclick: () => {
                it.opts.splice(k, 1);
                if (it.pick > k) it.pick--;
                it.pick = clamp(it.pick, 0, it.opts.length - 1);
                saveNow();
                paint();
              }
            }, icon("trash")) : null));
        });
        b.appendChild(optList);
        b.appendChild(h("button.btn.ghost.block", {
          type: "button", onclick: () => openPicker({ title: "Add alternative", onPick: (ids) => { it.opts.push({ ex: ids[0], n: null, img: null }); saveNow(); paint(); } })
        }, icon("plus"), "Add alternative"));

        b.appendChild(h("h3.sec-title", {}, "Target"));
        b.appendChild(h("div.form-grid", {},
          h("div.mini-field", {}, h("span", {}, "Sets"), stepper(it.sets, { min: 1, max: 12, label: "Sets" }, (v) => { it.sets = v; saveNow(); })),
          h("label.mini-field", {}, h("span", {}, si.type === "cardio" ? "Time" : "Reps"), repsInput(it, si)),
          si.type !== "cardio" ? h("label.mini-field", {}, h("span", {}, "Rest"), restSelect(it, si)) : null));

        const typeSel = h("select.text-in", {},
          h("option", { value: "" }, "Automatic: " + TYPES[si.info.type].label),
          Object.keys(TYPES).map((k) => h("option", { value: k, selected: it.type === k }, TYPES[k].label)));
        typeSel.addEventListener("change", () => {
          if (typeSel.value) it.type = typeSel.value; else delete it.type;
          saveNow();
          paint();
        });
        const tagIn = h("input.text-in", { type: "text", value: it.tag || "", placeholder: "e.g. pause at the top", maxlength: "60" });
        tagIn.addEventListener("change", () => { if (tagIn.value.trim()) it.tag = tagIn.value.trim(); else delete it.tag; saveNow(); });
        const cueIn = h("textarea.text-in", { rows: "3", value: it.cue || "", placeholder: "What to focus on during the set" });
        cueIn.addEventListener("change", () => { if (cueIn.value.trim()) it.cue = cueIn.value.trim(); else delete it.cue; saveNow(); });
        const secSel = h("select.text-in", {},
          h("option", { value: "" }, "Workout"),
          SECTIONS.map((s) => h("option", { value: s.id, selected: it.section === s.id }, s.name)));
        secSel.addEventListener("change", () => {
          if (secSel.value) { it.section = secSel.value; if (it.rest == null) it.rest = 0; }
          else { delete it.section; if (it.rest === 0) delete it.rest; }
          placeBySection(found.d.items, it);
          clearSessionOrder(found.p, found.d);
          saveNow();
          paint();
        });
        b.append(
          h("h3.sec-title", {}, "Details"),
          formField("Section", secSel, "Warm-up sits at the start; stretching and cooldown at the end, collapsed until you open them."),
          formField("Log as", typeSel),
          formField("Short note", tagIn, "Shown under the name while the card is open."),
          formField("Coaching cue", cueIn, "Shown under “How to”."));

        b.appendChild(h("div.menu-list", {},
          menuRow("trash", "Remove from " + found.d.name, null, () => {
            found.d.items = found.d.items.filter((x) => x !== it);
            saveNow();
            api.close();
          }, true)));
      }
      paint();
    }
  });
}

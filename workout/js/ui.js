/* ===============================================================
   UI kit: icons, toast, bottom sheets and full screens (the phone's
   Back button closes the top one), small controls, line chart.
=============================================================== */

const ICON_PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  chevronR: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  swap: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  today: '<path d="M6.5 7v10M17.5 7v10M3.5 10v4M20.5 10v4M6.5 12h11"/>',
  history: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
  progress: '<path d="M3.5 20h17M5.5 15.5l4.5-4.5 3.5 3L20 7"/>',
  you: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c1-4 3.8-6 7.5-6s6.5 2 7.5 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  flame: '<path fill="currentColor" stroke="none" d="M13 2c1 3-1 4-2 6-1 1.6-1 3 .3 4 .8-.6 1.2-1.6 1.4-2.6 1.6 1.4 2.8 3.4 2.8 5.6a5.5 5.5 0 1 1-11 0c0-2.7 1.6-4.6 3-6 .1 1 .5 2 1.5 2.6.8-2 .2-3.8-.3-5.2C11.4 6.5 12 3.7 13 2z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V20h14v-7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 2M9.5 2.5h5"/>',
  note: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6.5M9 15h6.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"/>',
  plate: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/>',
  skip: '<path d="M6 5.5l8.5 6.5L6 18.5zM18 5.5v13"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V4H4v11.5h4.5"/>',
  download: '<path d="M12 3.5v11.5M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 20h14"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.3" r="3.3"/>',
  shield: '<path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z"/>',
  scale: '<path d="M5 20h14l-1.5-13h-11z"/><path d="M9.5 10.5a2.5 2.5 0 0 1 5 0"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
  stretch: '<circle cx="12" cy="4.5" r="2"/><path d="M4.5 8.5l7.5 2 7.5-2M12 10.5v4.5l-3.5 6M12 15l3.5 6"/>',
  cool: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>'
};

function icon(name, cls) {
  return h("span", {
    class: "ico" + (cls ? " " + cls : ""), "aria-hidden": "true",
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || "") + "</svg>"
  });
}

/* ---------- toast ---------- */

let toastTimer = null;
function toast(msg, opts) {
  opts = opts || {};
  const t = $("toast");
  t.innerHTML = "";
  t.appendChild(h("span.toast-msg", {}, msg));
  if (opts.action) {
    t.appendChild(h("button.toast-btn", { type: "button", onclick: () => { hideToast(); opts.action.fn(); } }, opts.action.label));
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  if (!opts.sticky) toastTimer = setTimeout(hideToast, opts.ms || (opts.action ? 5500 : 2600));
}
function hideToast() { $("toast").classList.remove("show"); }

/* ---------- sheets and screens ---------- */

const overlays = [];
let popSkips = 0;
const popThen = [];

/* o: { title, full, body(bodyEl, api) | Node, headRight, onClose, cls } */
function openSheet(o) {
  const wrap = h("div", { class: "overlay " + (o.full ? "full" : "sheet") + (o.cls ? " " + o.cls : ""), role: "dialog", "aria-modal": "true", "aria-label": o.title || "" });
  const panel = h("div.panel");
  const api = { el: wrap, closed: false };
  const head = h("div.panel-head", {},
    o.full ? h("button.icon-btn", { type: "button", "aria-label": "Back", onclick: () => api.close() }, icon("back")) : null,
    h("h2.panel-title", {}, o.title || ""),
    o.headRight || null,
    !o.full ? h("button.icon-btn", { type: "button", "aria-label": "Close", onclick: () => api.close() }, icon("close")) : null);
  const body = h("div.panel-body");
  panel.append(head, body);
  wrap.appendChild(panel);
  api.body = body;
  api.head = head;
  api.panel = panel;
  api.setTitle = (t) => { head.querySelector(".panel-title").textContent = t; };
  api.setFooter = (node) => {
    const old = panel.querySelector(".panel-foot");
    if (old) old.remove();
    if (node) panel.appendChild(h("div.panel-foot", {}, node));
  };
  /* then: runs once the Back navigation this close causes has settled,
     so opening another sheet from a menu does not race the history stack */
  api.close = (then, fromPop) => {
    if (api.closed) return;
    api.closed = true;
    const i = overlays.indexOf(api);
    if (i !== -1) overlays.splice(i, 1);
    wrap.classList.remove("in");
    setTimeout(() => wrap.remove(), 180);
    if (!overlays.length) document.body.classList.remove("has-overlay");
    if (o.onClose) o.onClose();
    const run = typeof then === "function" ? then : null;
    if (!fromPop && api.pushed) {
      popSkips++;
      popThen.push(run);
      try { history.back(); } catch (e) { popSkips--; popThen.pop(); if (run) run(); }
    } else if (run) run();
  };
  if (!o.full) wrap.addEventListener("click", (e) => { if (e.target === wrap) api.close(); });
  wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); api.close(); } });
  document.body.appendChild(wrap);
  document.body.classList.add("has-overlay");
  try { history.pushState({ ov: overlays.length + 1 }, ""); api.pushed = true; } catch (e) { api.pushed = false; }
  overlays.push(api);
  if (typeof o.body === "function") o.body(body, api);
  else if (o.body) body.appendChild(o.body);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("in")));
  setTimeout(() => {
    const f = wrap.querySelector("[autofocus]");
    if (f) f.focus();
  }, 60);
  return api;
}
window.addEventListener("popstate", () => {
  if (popSkips > 0) {
    popSkips--;
    const fn = popThen.shift();
    if (fn) fn();
    return;
  }
  const top = overlays[overlays.length - 1];
  if (top) top.close(null, true);
});
function closeAllOverlays() {
  while (overlays.length) overlays[overlays.length - 1].close();
}

/* list of actions in a sheet. items: [{ icon, label, hint, fn, danger, disabled }], nulls skipped */
function menuSheet(title, items) {
  return openSheet({
    title, cls: "menu",
    body: (b, api) => {
      items.filter(Boolean).forEach((it) => {
        b.appendChild(h("button", {
          type: "button", class: "menu-item" + (it.danger ? " danger" : "") + (it.current ? " current" : ""), disabled: it.disabled,
          onclick: () => api.close(it.fn)
        }, it.icon ? icon(it.icon) : (it.emoji ? h("span.menu-emoji", {}, it.emoji) : null),
          h("span.menu-label", {}, it.label, it.hint ? h("small", {}, it.hint) : null),
          it.current ? icon("check", "accent") : null));
      });
    }
  });
}

/* ---------- controls ---------- */

function segControl(options, value, onChange, label) {
  const wrap = h("div.seg", { role: "radiogroup", "aria-label": label || "" });
  options.forEach((opt) => {
    const b = h("button", { type: "button", role: "radio", "aria-checked": String(opt[0] === value) }, opt[1]);
    b.addEventListener("click", () => {
      $$("button", wrap).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      onChange(opt[0]);
    });
    wrap.appendChild(b);
  });
  return wrap;
}

function switchBtn(on, onChange, label) {
  const b = h("button.switch", { type: "button", role: "switch", "aria-checked": String(!!on), "aria-label": label });
  b.addEventListener("click", () => {
    const v = b.getAttribute("aria-checked") !== "true";
    b.setAttribute("aria-checked", String(v));
    onChange(v);
  });
  return b;
}

function stepper(value, o, onChange) {
  let v = value;
  const out = h("span.step-val.num", {}, o.fmt ? o.fmt(v) : String(v));
  const set = (nv) => {
    v = clamp(Math.round(nv * 100) / 100, o.min == null ? -Infinity : o.min, o.max == null ? Infinity : o.max);
    out.textContent = o.fmt ? o.fmt(v) : String(v);
    onChange(v);
  };
  return h("div.stepper", { role: "group", "aria-label": o.label || "" },
    h("button.step-btn", { type: "button", "aria-label": "Decrease", onclick: () => set(v - (o.step || 1)) }, icon("minus")),
    out,
    h("button.step-btn", { type: "button", "aria-label": "Increase", onclick: () => set(v + (o.step || 1)) }, icon("plus")));
}

/* decimal text input that reports a number or null on change */
function numInput(value, placeholder, unit, onChange, label, cls) {
  const inp = h("input", {
    class: "num-in" + (cls ? " " + cls : ""), type: "text", inputmode: "decimal", autocomplete: "off",
    enterkeyhint: "done", value: value == null ? "" : fmtNum(value),
    placeholder: placeholder == null || placeholder === "" ? unit : fmtNum(placeholder),
    "aria-label": label
  });
  inp.addEventListener("focus", () => { try { inp.select(); } catch (e) {} });
  inp.addEventListener("change", () => {
    const n = parseNum(inp.value);
    if (inp.value.trim() !== "" && (n == null || n < 0)) { inp.value = value == null ? "" : fmtNum(value); return; }
    value = n;
    onChange(n);
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
  return inp;
}

function stat(big, small, delta, good) {
  return h("div.stat", {},
    h("b.num", {}, big),
    h("span", {}, small, delta ? h("em", { class: good ? "good" : "" }, " " + delta) : null));
}
function sheetSection(title, kids) {
  return h("section.sheet-sec", {}, h("h3.sec-title", {}, title), kids);
}
const PR_SHORT = { e1rm: "1RM", heavy: "KG", vol: "VOL", reps: "REPS", sec: "TIME", m: "DIST", km: "KM", min: "MIN" };
function prRow(pr) {
  const detail = setText(pr.set, pr.type) + (pr.key === "e1rm" ? " → " + prValueText("e1rm", pr.value) + " estimated" : "");
  return h("div.pr-row", {},
    h("span.pr-badge", {}, PR_SHORT[pr.key] || "PR"),
    h("div.pr-main", {}, h("b", {}, pr.n), h("small", {}, PR_LABEL[pr.key] + " · " + detail)),
    h("span.pr-up", {}, pr.prev ? "+" + fmtNum(r1(pr.value - pr.prev)) : "new"));
}

/* ---------- line chart (inline SVG) ----------
   series: [{ values: [number|null], cls: "main"|"avg", area: bool }], labels: [string] */
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
function lineChart(series, labels, o) {
  o = o || {};
  const W = 320, H = o.height || 160, x0 = 36, x1 = W - 12, y0 = 12, y1 = H - 24;
  const all = [];
  series.forEach((s) => s.values.forEach((v) => { if (v != null) all.push(v); }));
  if (!all.length) return h("div.chart-empty", {}, o.empty || "Nothing logged yet.");
  const dMin = Math.min.apply(null, all), dMax = Math.max.apply(null, all);
  let span = dMax - dMin;
  if (span < (o.minSpan || 1)) span = o.minSpan || 1;
  const pad = span * 0.18;
  const step = niceStep((span + 2 * pad) / 4);
  let lo = Math.floor((dMin - pad) / step) * step;
  if (o.zero && lo < 0) lo = 0;
  const hi = Math.ceil((dMax + pad) / step) * step;
  const n = labels.length;
  const X = (i) => x0 + (n <= 1 ? (x1 - x0) / 2 : (i / (n - 1)) * (x1 - x0));
  const Y = (v) => y1 - ((v - lo) / (hi - lo || 1)) * (y1 - y0);
  const fmt = (v) => (step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(v)));
  let g = "";
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const yy = Y(v).toFixed(1);
    g += '<line class="c-grid" x1="' + x0 + '" y1="' + yy + '" x2="' + x1 + '" y2="' + yy + '"/>';
    g += '<text class="c-tick" x="' + (x0 - 6) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + fmt(v) + "</text>";
  }
  const every = Math.max(1, Math.ceil(n / 6));
  labels.forEach((lab, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every * 0.6) return;
    g += '<text class="c-tick" x="' + X(i).toFixed(1) + '" y="' + (y1 + 16) + '" text-anchor="' + (i === 0 ? "start" : i === n - 1 ? "end" : "middle") + '">' + esc(lab) + "</text>";
  });
  let marks = "";
  series.forEach((s) => {
    let d = "", pen = false, dots = "", first = null, lastPt = null;
    s.values.forEach((v, i) => {
      if (v == null) { if (!s.bridge) pen = false; return; }
      const px = X(i).toFixed(1), py = Y(v).toFixed(1);
      d += (pen ? " L" : " M") + px + " " + py;
      pen = true;
      if (first == null) first = px;
      lastPt = [px, py];
      if (s.cls !== "avg") dots += '<circle class="c-dot" cx="' + px + '" cy="' + py + '" r="2.6"/>';
    });
    if (s.area && lastPt && d.indexOf("M", 1) === -1) {
      marks += '<path class="c-area" d="' + d.trim() + " L" + lastPt[0] + " " + y1 + " L" + first + " " + y1 + ' Z"/>';
    }
    marks += '<path class="c-line ' + (s.cls || "main") + '" d="' + d.trim() + '"/>' + dots;
    if (lastPt && s.cls !== "avg") marks += '<circle class="c-end" cx="' + lastPt[0] + '" cy="' + lastPt[1] + '" r="4"/>';
  });
  const wrap = h("div.chart");
  wrap.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.label || "Chart") + '">' + g + marks + "</svg>";
  return wrap;
}

/* small month calendar used by History and the weight log.
   cell(iso, dayNum) -> { cls, inner, onclick } */
function monthGrid(month, cell) {
  const y = month.getFullYear(), mo = month.getMonth();
  const grid = h("div.cal-grid");
  ["M", "T", "W", "T", "F", "S", "S"].forEach((d) => grid.appendChild(h("div.cal-dow", { "aria-hidden": "true" }, d)));
  const startDow = (month.getDay() + 6) % 7;
  for (let i = 0; i < startDow; i++) grid.appendChild(h("div.cal-day.pad"));
  const dim = new Date(y, mo + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const iso = y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const c = cell(iso, d) || {};
    const el = h(c.onclick ? "button" : "div", { class: "cal-day " + (c.cls || ""), type: c.onclick ? "button" : null, disabled: c.disabled, "aria-label": c.label || null, html: "<b>" + d + "</b>" + (c.inner || "") });
    if (c.onclick && !c.disabled) el.addEventListener("click", () => c.onclick(iso));
    grid.appendChild(el);
  }
  return grid;
}

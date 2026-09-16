/* ===============================================================
   Boot, tabs, theme and the service worker update prompt.
=============================================================== */

let updateWorker = null;
let swReg = null;

const TABS = { today: renderToday, history: renderHistory, progress: renderProgress, you: renderYou };

function applyTheme() {
  const t = store.theme;
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
  else root.removeAttribute("data-theme");
  const dark = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#15130f" : "#fcf4e9");
}

function showTab(name) {
  if (!TABS[name]) name = "today";
  closeAllOverlays();
  view.tab = name;
  Object.keys(TABS).forEach((k) => { $("view" + cap(k)).hidden = k !== name; });
  $$(".nav-item").forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  TABS[name]();
  if (name !== "today") window.scrollTo(0, 0);
  updateNav();
}

function renderCurrent() {
  TABS[view.tab]();
  updateNav();
}

function updateNav() {
  const live = Object.values(store.today.sessions).some(anyLogged);
  $("navTodayDot").hidden = !live;
  const backupDue = store.history.length && store.history.length - (store.backup.countAtLast || 0) >= 10;
  $("navYouDot").hidden = !(updateWorker || backupDue);
}

$$(".nav-item").forEach((b) => b.addEventListener("click", () => {
  if (view.tab === b.dataset.tab && !overlays.length) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  showTab(b.dataset.tab);
}));

/* ---------- service worker ---------- */

function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol.indexOf("http") !== 0) return;
  /* on a local dev server a cached shell hides edits; add ?sw=1 to test offline and updates */
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search)) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    saveNow();
    location.reload();
  });
  navigator.serviceWorker.ready.then((reg) => { if (reg.active) reg.active.postMessage({ type: "warm", urls: programImageUrls() }); }).catch(() => {});
  navigator.serviceWorker.register("sw.js").then((reg) => {
    swReg = reg;
    const check = () => { if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting); };
    check();
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (w) w.addEventListener("statechange", () => { if (w.state === "installed") check(); });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
}

/* full-size images for every exercise in every programme */
function programImageUrls() {
  const names = new Set();
  Object.values(store.programs).forEach((p) => p.days.forEach((d) => d.items.forEach((it) => it.opts.forEach((o) => {
    const name = imageFor(o, exInfo(o.ex));
    if (name) names.add(IMG_ROOT + "web/" + name + ".jpg");
  }))));
  return Array.from(names);
}

function offerUpdate(worker) {
  if (updateWorker === worker) return;
  updateWorker = worker;
  updateNav();
  const busy = Object.values(store.today.sessions).some((s) => sessionState(s) === "running");
  toast(busy ? "Update ready. It installs when you reload." : "A new version is ready", { sticky: true, action: { label: "Reload", fn: applyUpdate } });
  if (view.tab === "you") renderYou();
}

function applyUpdate() {
  saveNow();
  if (updateWorker) updateWorker.postMessage("skipWaiting");
  else location.reload();
}

/* ---------- lifecycle ---------- */

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") { saveNow(); return; }
  if (rolloverIfNeeded()) { chooseDay(); renderCurrent(); }
  restoreRest();
  syncWake();
  if (view.tab === "today") paintSessionBar();
  if (swReg) swReg.update().catch(() => {});
});
window.addEventListener("pagehide", saveNow);

/* another tab saved: stop this tab writing its older copy over it */
window.addEventListener("storage", (e) => {
  if (e.key !== SKEY) return;
  blockSaves();
  toast("Updated in another tab. Reload to keep logging here.", { sticky: true, action: { label: "Reload", fn: () => location.reload() } });
});

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
if (darkQuery.addEventListener) darkQuery.addEventListener("change", applyTheme);

setInterval(() => {
  if (document.visibilityState === "visible" && view.tab === "today") paintSessionBar();
}, 1000);

function boot() {
  store = loadStore();
  rolloverIfNeeded();
  applyTheme();
  chooseDay();
  saveNow();
  showTab("today");
  restoreRest();
  syncWake();
  registerSW();
  handleProgramLink();
}

boot();

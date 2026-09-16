/* ===============================================================
   Rest timer and screen wake lock.
   The timer is an end timestamp saved in the store, so a reload, or
   iOS unloading the app in the background, does not lose a rest.
=============================================================== */

let restInt = null;
let audioCtx = null;
const RING_C = 2 * Math.PI * 15;

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {}
}

function beep() {
  try {
    unlockAudio();
    const now = audioCtx.currentTime;
    [0, 0.18].forEach((off) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, now + off);
      g.gain.exponentialRampToValueAtTime(0.35, now + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.16);
      o.start(now + off); o.stop(now + off + 0.18);
    });
  } catch (e) {}
}

function restLeft() {
  const t = store.timer;
  if (!t) return 0;
  return t.pausedLeft != null ? t.pausedLeft : Math.round((t.endAt - Date.now()) / 1000);
}

function startRest(sec, label) {
  store.timer = { endAt: Date.now() + sec * 1000, dur: sec, label: label || "", pausedLeft: null, rang: false };
  saveNow();
  restLoop();
  paintRest();
  syncWake();
}
function toggleRestPause() {
  const t = store.timer;
  if (!t) return;
  if (t.pausedLeft != null) { t.endAt = Date.now() + t.pausedLeft * 1000; t.pausedLeft = null; }
  else t.pausedLeft = restLeft();
  saveNow();
  paintRest();
}
function nudgeRest(d) {
  const t = store.timer;
  if (!t) return;
  if (t.pausedLeft != null) t.pausedLeft += d;
  else t.endAt += d * 1000;
  t.dur = Math.max(1, t.dur + d);
  if (restLeft() > 0) t.rang = false;
  saveNow();
  paintRest();
}
function stopRest() {
  store.timer = null;
  clearInterval(restInt);
  saveNow();
  paintRest();
  syncWake();
}

function restLoop() {
  clearInterval(restInt);
  restInt = setInterval(() => {
    const t = store.timer;
    if (!t) { clearInterval(restInt); return; }
    const r = restLeft();
    if (r <= 0 && !t.rang && t.pausedLeft == null) {
      t.rang = true;
      save();
      if (store.settings.sound) beep();
      if (navigator.vibrate) navigator.vibrate([160, 90, 160]);
    }
    if (r < -600) { stopRest(); return; }
    paintRest();
  }, 250);
}

function paintRest() {
  const pill = $("restPill");
  const t = store.timer;
  pill.hidden = !t;
  document.body.classList.toggle("resting", !!t);
  if (!t) return;
  const r = restLeft();
  $("restClock").textContent = fmtClock(r);
  $("restLabel").textContent = t.pausedLeft != null ? "PAUSED" : r <= 0 ? "REST OVER" : "REST";
  $("restRing").setAttribute("stroke-dashoffset", (RING_C * (1 - clamp(r / (t.dur || 1), 0, 1))).toFixed(1));
  pill.classList.toggle("ringing", r <= 0);
}

function restoreRest() {
  const t = store.timer;
  if (!t) { paintRest(); return; }
  if (restLeft() < -600) { store.timer = null; paintRest(); return; }
  if (restLeft() <= 0) t.rang = true;
  restLoop();
  paintRest();
}

$("restClockBtn").addEventListener("click", () => { unlockAudio(); toggleRestPause(); });
$("restMinus").addEventListener("click", () => nudgeRest(-15));
$("restPlus").addEventListener("click", () => nudgeRest(15));
$("restSkip").addEventListener("click", stopRest);

/* ---------- wake lock ---------- */

let wakeLock = null, wakeWanted = false;
async function acquireWake() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch (e) {}
}
function releaseWake() { if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; } }
function syncWake() {
  const running = Object.values(store.today.sessions).some((s) => sessionState(s) === "running");
  wakeWanted = running || !!store.timer;
  if (wakeWanted) acquireWake(); else releaseWake();
}

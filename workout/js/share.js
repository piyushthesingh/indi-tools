/* ===============================================================
   Sharing: a workout summary image, and programmes as links.
   Nothing leaves the device unless you share it.
=============================================================== */

function shareWorkout(entry) {
  drawShareCard(entry).then((blob) => {
    const name = "workout-" + entry.date + ".png";
    const file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
    const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    const url = URL.createObjectURL(blob);
    openSheet({
      title: "Share card",
      onClose: () => URL.revokeObjectURL(url),
      body: (b) => {
        b.append(
          h("img.share-preview", { src: url, alt: "Summary card for " + entry.title }),
          h("div.sheet-actions", {},
            h("button.btn", { type: "button", onclick: () => downloadBlob(blob, name) }, icon("download"), "Save image"),
            canShare ? h("button.btn.primary", { type: "button", onclick: () => navigator.share({ files: [file], title: entry.title }).catch(() => {}) }, icon("share"), "Share") : null));
      }
    });
  }).catch(() => toast("This browser couldn't make the image."));
}

function drawShareCard(x) {
  return new Promise((resolve, reject) => {
    const W = 1080, H = 1350, P = 80;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    if (!g) { reject(new Error("canvas")); return; }
    const C = { bg: "#fcf4e9", ink: "#2a2018", muted: "#7a6a54", line: "#e7d9c2", hot: "#e8841e", hotInk: "#a94a12", onHot: "#2a1c0c" };
    const sans = (w, s) => w + " " + s + "px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const cond = (w, s) => w + " " + s + "px 'Avenir Next Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif";
    const text = (str, font, color, px, py, max, align) => {
      g.font = font;
      g.fillStyle = color;
      g.textAlign = align || "left";
      let t = String(str);
      if (max && g.measureText(t).width > max) {
        while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
        t += "…";
      }
      g.fillText(t, px, py);
      g.textAlign = "left";
    };
    const pill = (px, py, w, hh, r) => {
      g.beginPath();
      g.moveTo(px + r, py);
      g.arcTo(px + w, py, px + w, py + hh, r);
      g.arcTo(px + w, py + hh, px, py + hh, r);
      g.arcTo(px, py + hh, px, py, r);
      g.arcTo(px, py, px + w, py, r);
      g.closePath();
    };

    const draw = (mascot) => {
      g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
      g.fillStyle = C.hot; g.fillRect(0, 0, W, 16);
      let tx = P;
      if (mascot) {
        g.save(); g.beginPath(); g.arc(P + 58, 158, 58, 0, Math.PI * 2); g.clip();
        g.drawImage(mascot, P, 100, 116, 116); g.restore();
        tx = P + 146;
      }
      text([x.programName, fmtDate(x.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · "), sans(600, 32), C.muted, tx, 140, W - tx - P);
      text(x.title, sans(800, 64), C.ink, tx, 212, W - tx - P);

      const cells = [[x.dur ? fmtDur(x.dur) : "-", "duration"], [x.setsDone + "/" + x.setsTotal, "sets"], [x.volume ? x.volume.toLocaleString() : "-", "kg volume"]];
      const colW = (W - 2 * P) / 3;
      cells.forEach((s, i) => {
        text(s[0], cond(700, 108), C.ink, P + i * colW, 400, colW - 24);
        text(s[1], sans(600, 28), C.muted, P + i * colW, 444);
      });
      let y = 506;
      g.fillStyle = C.line; g.fillRect(P, y, W - 2 * P, 3);
      y += 72;

      const prs = x.prs || [];
      if (prs.length) {
        text("PERSONAL RECORDS", sans(800, 26), C.hotInk, P, y);
        prs.slice(0, 3).forEach((pr) => {
          y += 64;
          g.fillStyle = C.hot; pill(P, y - 38, 96, 48, 12); g.fill();
          text(PR_SHORT[pr.key] || "PR", sans(800, 22), C.onHot, P + 48, y - 6, 0, "center");
          text(pr.n, sans(700, 36), C.ink, P + 120, y - 2, 560);
          text(prValueText(pr.key, pr.value), sans(600, 30), C.muted, W - P, y - 2, 260, "right");
        });
        y += 64;
      }
      text("EXERCISES", sans(800, 26), C.hotInk, P, y);
      /* the card is about the workout; warm-up and stretching stay off it */
      const lines = x.lines.filter((l) => !l.section && ((l.sets && l.sets.length) || l.done));
      const room = Math.max(1, Math.floor((H - 170 - y) / 60));
      const shown = lines.length > room ? room - 1 : lines.length;
      lines.slice(0, shown).forEach((l) => {
        y += 60;
        text(l.n, sans(600, 34), C.ink, P, y, 500);
        text(l.sets && l.sets.length ? setsSummary(l.sets, l.type) : l.done + "/" + l.total + " sets", sans(500, 30), C.muted, W - P, y, 420, "right");
      });
      if (lines.length > shown) { y += 60; text("+ " + (lines.length - shown) + " more", sans(500, 30), C.muted, P, y); }
      text("Training Split", sans(700, 30), C.ink, P, H - 72);
      text("indi.tools/workout", sans(600, 30), C.hotInk, W - P, H - 72, 0, "right");
      c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/png");
    };
    const img = new Image();
    img.onload = () => draw(img);
    img.onerror = () => draw(null);
    img.src = "assets/mascot-web.jpg";
  });
}

/* ---------- programme links ----------
   The whole programme is packed into the URL fragment, which browsers
   never send to the server. Compressed where the browser supports it. */

function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function packProgram(p) {
  const used = new Set();
  const data = {
    v: 1, name: p.name, emoji: p.emoji, notes: p.notes,
    days: p.days.map((d) => ({
      n: d.name, t: d.title, f: d.focus,
      i: d.items.map((it) => {
        it.opts.forEach((o) => used.add(o.ex));
        const o = { o: it.opts.map((x) => (x.img ? [x.ex, x.n || "", x.img] : x.n ? [x.ex, x.n] : [x.ex])), s: it.sets, r: it.reps };
        if (it.pick) o.k = it.pick;
        if (it.rest != null) o.t = it.rest;
        if (it.tag) o.g = it.tag;
        if (it.cue) o.c = it.cue;
        if (it.ss) o.x = it.ss;
        if (it.type) o.y = it.type;
        if (it.section) o.f = it.section;
        if (it.p) o.p = it.p;
        if (it.s) o.a = it.s;
        return o;
      })
    }))
  };
  const custom = store.custom.filter((c) => used.has(c.id));
  if (custom.length) data.custom = custom;
  return data;
}

async function encodeProgram(p) {
  const json = JSON.stringify(packProgram(p));
  if (typeof CompressionStream === "function") {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return "z" + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
    } catch (e) {}
  }
  return "j" + b64url(new TextEncoder().encode(json));
}

async function decodeProgram(code) {
  const bytes = fromB64url(code.slice(1));
  let json;
  if (code[0] === "z") {
    if (typeof DecompressionStream !== "function") throw new Error("This browser can't open compressed links");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    json = await new Response(stream).text();
  } else json = new TextDecoder().decode(bytes);
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.days)) throw new Error("bad programme");
  return data;
}

async function shareProgramLink(p) {
  const url = location.origin + location.pathname + "#program=" + (await encodeProgram(p));
  if (navigator.share) {
    navigator.share({ title: p.name, text: "Training programme: " + p.name, url }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => toast("Link copied")).catch(() => prompt("Copy this link", url));
  } else {
    prompt("Copy this link", url);
  }
}

async function handleProgramLink() {
  const m = location.hash.match(/^#program=([zj][\w-]+)/);
  if (!m) return;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  let data;
  try { data = await decodeProgram(m[1]); }
  catch (e) { toast("That programme link is broken or incomplete."); return; }
  const count = data.days.reduce((n, d) => n + (d.i || []).length, 0);
  openSheet({
    title: "Add programme",
    body: (b, api) => {
      b.append(
        h("div.celebrate", {}, h("span.prog-emoji.lg", { "aria-hidden": "true" }, data.emoji || "🏋️"),
          h("div", {}, h("b", {}, data.name || "Shared programme"), h("span", {}, data.days.length + " days · " + count + " exercises"))),
        h("div.kv-list", {}, data.days.map((d) => h("div.kv", {}, h("span", {}, d.n), h("b", {}, (d.i || []).length + " exercises")))),
        h("p.hint", {}, "It's added as a separate programme. Nothing you already have changes."),
        h("div.sheet-actions", {},
          h("button.btn", { type: "button", onclick: () => api.close() }, "Cancel"),
          h("button.btn.primary", { type: "button", onclick: () => { const p = unpackProgram(data); api.close(() => { switchProgram(p.id); showTab("today"); toast("Added “" + p.name + "”"); }); } }, "Add programme")));
    }
  });
}

function unpackProgram(data) {
  (data.custom || []).forEach((c) => { if (!store.custom.some((x) => x.id === c.id)) store.custom.push(c); });
  const id = "p" + uid();
  const p = {
    id, name: data.name || "Shared programme", emoji: data.emoji || "🏋️", notes: Array.isArray(data.notes) ? data.notes : [],
    days: data.days.map((d) => ({
      id: uid(), name: d.n || "Day", title: d.t || "", focus: d.f || "",
      items: (d.i || []).map((o) => normItem({
        opts: (o.o || []).map((x) => ({ ex: x[0], n: x[1] || null, img: x[2] || null })), pick: o.k, sets: o.s, reps: o.r,
        rest: o.t, tag: o.g, cue: o.c, ss: o.x, type: o.y, p: o.p, s: o.a, section: o.f
      }))
    }))
  };
  p.days.forEach((d) => d.items.forEach((it) => {
    ["rest", "tag", "cue", "ss", "type", "p", "s", "section"].forEach((k) => { if (it[k] == null) delete it[k]; });
  }));
  store.programs[id] = p;
  store.programOrder.push(id);
  saveNow();
  return p;
}

import { STYLES, GROUPS, DEPTHS, WIDTHS, CORNERS, CORNER_INTERIORS, styleById, allowedWidths, fillWidths, HEIGHT } from "./catalog.js";
import { LAYOUTS, WALL_NAMES, ROOM_WALLS, ROOM_FLOORS, defaultDesign, activeWalls, wallGeometry, lineItems, partsList, totalPrice, problems, encode, decode, moduleInfo, cornerInfo, wallDepth, setWallDepth, setModuleDepth, dropTarget, moveModule } from "./design.js";
import { money, PRICES_ARE_SAMPLE } from "./pricing.js";
import { elevationsHtml, drawModule } from "./elevation.js";
import { planHtml } from "./plan.js";
import { ClosetScene } from "./scene.js";

const SALES_EMAIL = "sales@artisancabinets.co";
const STORE_KEY = "artisan-closet-design-v1";

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- state ------------------------------------------------------------------
const fromHash = location.hash.length > 1 ? decode(location.hash.slice(1)) : null;
let saved = null;
try { saved = decode(localStorage.getItem(STORE_KEY) || ""); } catch { /* private mode */ }
const ui = {
  design: fromHash || saved || defaultDesign(),
  wall: "back",
  depth: "S",
  style: "2hr",
  width: 30,
  selected: null,
  doorsOpen: false,
  view: "3d",
  look: false,
  sketch: false,
  shots: [], // extra camera angles for the PDF
};
const MAX_SHOTS = 6;
const TOUCH = matchMedia("(pointer: coarse)").matches;
if (fromHash) history.replaceState(null, "", location.pathname);

const scene = new ClosetScene($("#view3d"), {
  onPick: (p) => {
    if (p && !p.corner) { ui.selected = p; ui.wall = p.wall; }
    else ui.selected = null;
    render();
  },
  onMenu: (p, x, y) => (p ? openMenu(p, x, y) : closeMenu()),
  // Live reorder while dragging; returns where the module is now.
  onDrag: (from, x, z) => {
    const to = dropTarget(D(), from, x, z);
    if (to.wall === from.wall && to.index === from.index) return from;
    moveModule(D(), from, to);
    ui.selected = to; ui.wall = to.wall;
    render();
    return to;
  },
  onDragEnd: () => commit(),
});

// ---- helpers ------------------------------------------------------------------
const D = () => ui.design;
const walls = () => activeWalls(D());
function commit() {
  try { localStorage.setItem(STORE_KEY, encode(D())); } catch { /* ignore */ }
  render();
}
function icon(look, w) {
  return `<svg viewBox="-2 -6 ${w + 4} ${HEIGHT + 10}" class="mini">${drawModule(0, w, look, "", false)}</svg>`;
}
const inchesLabel = (n) => `${n}" <span>${Math.floor(n / 12)}' ${+(n % 12).toFixed(2)}"</span>`;

// ---- panel: step 1, space -------------------------------------------------------
function renderSpace() {
  const d = D();
  const shapes = {
    reach: `<path d="M6 8h36v6H6z"/>`,
    L: `<path d="M6 8h36v6H12v26H6z"/>`,
    U: `<path d="M6 8h36v32h-6V14H12v26H6z"/>`,
  };
  const layoutBtns = Object.entries(LAYOUTS).map(([k, v]) => `
    <button class="layout ${d.layout === k ? "on" : ""}" data-layout="${k}">
      <svg viewBox="0 0 48 44"><rect x="2" y="4" width="44" height="38" rx="2" class="room"/>${shapes[k]}</svg>
      <span>${v.name}</span></button>`).join("");
  const wallInputs = walls().map((k) => {
    const dep = wallDepth(d, k);
    return `
    <div class="wallset"><b>${WALL_NAMES[k]}</b>
      <label class="field"><span>Width</span>
        <span class="inch"><input type="number" min="15" max="400" step="0.25" value="${d.walls[k].width}" data-wallwidth="${k}"> in</span>
        <small>${Math.floor(d.walls[k].width / 12)}' ${+(d.walls[k].width % 12).toFixed(2)}"</small></label>
      <label class="field"><span>Cabinet depth</span>
        <select data-walldepth="${k}">
          ${dep === "mixed" ? `<option value="" selected disabled>Mixed</option>` : ""}
          ${Object.entries(DEPTHS).map(([dk, v]) => `<option value="${dk}" ${dep === dk ? "selected" : ""}>${v.label}</option>`).join("")}
        </select>
        <small>${dep === "mixed" ? "Pick one to set every module" : dep === "D" ? "Deep: fits hanging with doors" : "Standard reach-in depth"}</small></label>
    </div>`;
  }).join("");
  const cornerInputs = ["left", "right"].filter((s) => walls().includes(s)).map((side) => {
    const c = d.corners[side];
    const opts = [`<option value="">No corner module</option>`, ...CORNERS.flatMap((cc) =>
      CORNER_INTERIORS.filter((i) => !i.only || i.only === cc.code).map((i) =>
        `<option value="${cc.code}|${i.id}" ${c && c.code === cc.code && c.interior === i.id ? "selected" : ""}>${cc.code} · ${cc.size}" ${DEPTHS[cc.depth].label} · ${i.name}</option>`))].join("");
    return `<label class="field wide"><span>${side === "left" ? "Back-left" : "Back-right"} corner</span><select data-corner="${side}">${opts}</select></label>`;
  }).join("");
  return `
    <section class="step"><h2><b>1</b>Your space</h2>
      <div class="layouts">${layoutBtns}</div>
      <div class="fields">${wallInputs}${cornerInputs}</div>
      <p class="hint">Artisan closets are 90" tall. Measure each wall from corner to corner.</p>
      <h3>Room look <small>pictures only</small></h3>
      <div class="swatches" aria-label="Wall color">${Object.entries(ROOM_WALLS).map(([k, v]) =>
        `<button class="swatch ${d.room.wall === k ? "on" : ""}" data-wallcolor="${k}" title="${v.name} walls"><i style="background:${v.color}"></i><span>${v.name}</span></button>`).join("")}</div>
      <div class="swatches" aria-label="Floor">${Object.entries(ROOM_FLOORS).map(([k, v]) =>
        `<button class="swatch ${d.room.floor === k ? "on" : ""}" data-floor="${k}" title="${v.name} floor"><i class="${v.grain ? "grain" : "pile"}" style="background-color:${v.color}"></i><span>${v.name}</span></button>`).join("")}</div>
      <label class="check"><input type="checkbox" data-decor ${d.room.decor ? "checked" : ""}> Show folded clothes, baskets and a rug</label>
    </section>`;
}

// ---- panel: step 2, modules ---------------------------------------------------------
function renderModules() {
  const d = D();
  if (!walls().includes(ui.wall)) ui.wall = "back";
  const geo = wallGeometry(d);
  const g = geo[ui.wall];
  const tabs = walls().map((k) => {
    const gg = geo[k];
    return `<button class="tab ${ui.wall === k ? "on" : ""}" data-wall="${k}">${WALL_NAMES[k]}<small class="${gg.free < 0 ? "bad" : ""}">${gg.free}" free</small></button>`;
  }).join("");
  const depthBtns = Object.entries(DEPTHS).map(([k, v]) => `<button class="seg ${ui.depth === k ? "on" : ""}" data-depth="${k}">${v.label}</button>`).join("");
  const available = STYLES.filter((s) => s.depths.includes(ui.depth));
  if (!available.find((s) => s.id === ui.style)) ui.style = available[0].id;
  const styleCards = GROUPS.map((grp) => {
    const list = available.filter((s) => s.group === grp);
    if (!list.length) return "";
    return `<div class="group"><h3>${grp}</h3><div class="cards">${list.map((s) => `
      <button class="card ${ui.style === s.id ? "on" : ""}" data-style="${s.id}" title="${esc(s.name)}">
        ${icon(s.look(), 24)}<span>${esc(s.name)}</span></button>`).join("")}</div></div>`;
  }).join("");
  const widths = allowedWidths(ui.style, ui.depth);
  if (!widths.includes(ui.width)) ui.width = widths.find((w) => w <= g.free) || widths[widths.length - 1];
  const widthChips = WIDTHS.map((w) => {
    const ok = widths.includes(w);
    const fits = w <= g.free + 0.001;
    return `<button class="chip ${ui.width === w ? "on" : ""} ${ok && !fits ? "nofit" : ""}" data-width="${w}" ${ok ? "" : "disabled"}>${w}"</button>`;
  }).join("");
  const preview = moduleInfo({ style: ui.style, w: ui.width, depth: ui.depth, hinge: "L" });
  const fill = fillWidths(Math.max(0, g.free), widths);
  const list = d.walls[ui.wall].modules.map((m, i) => {
    const info = moduleInfo(m);
    const st = styleById[m.style];
    const sel = ui.selected && ui.selected.wall === ui.wall && ui.selected.index === i;
    const widthOpts = st.widths.filter((w) => st.depths.includes(m.depth)).map((w) => `<option ${w === m.w ? "selected" : ""}>${w}</option>`).join("");
    const styleOpts = STYLES.filter((s) => s.depths.includes(m.depth) && s.widths.includes(m.w)).map((s) => `<option value="${s.id}" ${s.id === m.style ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const hinge = st.hinged && m.w <= 24 ? `<button class="mini-btn" data-act="hinge" title="Door hinge side">Hinge ${m.hinge === "R" ? "right" : "left"}</button>` : "";
    return `<li class="${sel ? "sel" : ""}" data-index="${i}">
      ${icon(info.look, m.w)}
      <div class="meta"><b>${info.code}</b><span>${esc(info.name)} · ${money(info.price)}</span>
        <div class="row-ctl">
          <select data-act="style">${styleOpts}</select>
          <select data-act="width" title="Width">${widthOpts}</select>${hinge}
        </div></div>
      <div class="order">
        <button class="icon-btn" data-act="left" title="Move left" ${i === 0 ? "disabled" : ""}>‹</button>
        <button class="icon-btn" data-act="right" title="Move right" ${i === d.walls[ui.wall].modules.length - 1 ? "disabled" : ""}>›</button>
        <button class="icon-btn del" data-act="remove" title="Remove">×</button>
      </div></li>`;
  }).join("");
  return `
    <section class="step"><h2><b>2</b>Add modules</h2>
      <div class="tabs">${tabs}</div>
      <div class="meter"><div style="width:${Math.min(100, (g.used / Math.max(g.space, 1)) * 100)}%" class="${g.free < 0 ? "bad" : ""}"></div></div>
      <p class="hint">${g.used}" of ${+g.space.toFixed(2)}" used on the ${WALL_NAMES[ui.wall].toLowerCase()}.</p>
      <div class="segs">${depthBtns}</div>
      ${styleCards}
      <h3>Width</h3><div class="chips">${widthChips}</div>
      <div class="add-row">
        <div class="add-info"><b>${preview.code}</b><span>${money(preview.price)} MSRP</span></div>
        <button class="btn primary" id="addBtn">Add to ${WALL_NAMES[ui.wall].toLowerCase()}</button>
      </div>
      ${fill.length ? `<button class="btn ghost full" id="fillBtn">Fill the rest with ${esc(styleById[ui.style].name.toLowerCase())}: ${fill.map((w) => w + '"').join(" + ")}</button>` : ""}
      <h3>On this wall</h3>
      ${list ? `<ul class="mods">${list}</ul>` : `<p class="empty">No modules yet. Pick one above and add it.</p>`}
    </section>`;
}

// ---- summary ---------------------------------------------------------------------------
function renderSummary() {
  const d = D();
  const items = lineItems(d);
  const total = totalPrice(d);
  const warn = problems(d);
  const parts = partsList(d);
  $("#total").textContent = money(total);
  $("#summary").innerHTML = `
    <div class="total-card"><span>Estimated MSRP</span><b>${money(total)}</b>
      ${PRICES_ARE_SAMPLE ? `<small class="sample">Sample prices for the demo. Final pricing confirmed by Artisan.</small>` : ""}</div>
    ${warn.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}
    <button class="btn primary full" id="sendBtn2" ${items.length ? "" : "disabled"}>Send design to Artisan</button>
    <h3>Your closet <small>${items.length} module${items.length === 1 ? "" : "s"}</small></h3>
    <ul class="lines">${items.map((it) => `<li><span><b>${it.code}</b><i>${esc(it.wall)} · ${esc(it.name)}</i></span><em>${money(it.price)}</em></li>`).join("") || `<li class="empty">Nothing added yet.</li>`}</ul>
    <details><summary>Parts list (${parts.reduce((a, p) => a + p.qty, 0)} parts)</summary>
      <table class="parts"><thead><tr><th>Part</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>${parts.map((p) => `<tr><td>${esc(p.part)}</td><td>${p.qty}</td><td>${money(p.total)}</td></tr>`).join("")}</tbody></table>
    </details>
    <div class="side-actions">
      <button class="btn ghost" id="shareBtn">Copy link to this design</button>
      <button class="btn ghost" id="resetBtn">Start over</button>
    </div>`;
}

function render() {
  $("#panel").innerHTML = renderSpace() + renderModules();
  renderSummary();
  if (ui.view === "3d") scene.update(D(), { doorsOpen: ui.doorsOpen, selected: ui.selected, sketch: ui.sketch });
  else if (ui.view === "plan") $("#elev").innerHTML = planHtml(D(), ui.selected);
  else $("#elev").innerHTML = elevationsHtml(D(), ui.selected);
  $("#doorsBtn").textContent = ui.doorsOpen ? "Close doors" : "Open doors";
  document.querySelectorAll(".only3d").forEach((b) => b.classList.toggle("off3d", ui.view !== "3d"));
  $("#lookBtn").textContent = ui.look ? "Back to overview" : "Look around";
  $("#lookBtn").classList.toggle("active", ui.look);
  $("#sketchBtn").classList.toggle("active", ui.sketch);
  $("#motionBtn").hidden = !(ui.look && TOUCH);
  $("#motionBtn").textContent = scene.motion ? "Stop phone motion" : "Use phone motion";
  $("#shotBtn").textContent = ui.shots.length ? `Add view to PDF (${ui.shots.length})` : "Add view to PDF";
  $("#hint").textContent = ui.view !== "3d" ? (TOUCH ? "Tap a module to select it" : "Click a module to select it · right-click to change it")
    : ui.look ? (scene.motion ? "Move your phone to look around" : "Drag to look around")
    : TOUCH ? "Drag to turn · hold a module to move it or change it"
    : "Drag a module to move it · right-click it to change it · drag the room to turn";
  document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === ui.view));
}

// ---- events ---------------------------------------------------------------------------
$("#panel").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) {
    const li = e.target.closest(".mods li");
    if (li && !e.target.closest("select")) { ui.selected = { wall: ui.wall, index: +li.dataset.index }; render(); }
    return;
  }
  const d = D();
  if (b.dataset.layout) {
    d.layout = b.dataset.layout;
    ui.selected = null;
    if (!walls().includes(ui.wall)) ui.wall = "back";
    return commit();
  }
  if (b.dataset.wallcolor) { d.room.wall = b.dataset.wallcolor; return commit(); }
  if (b.dataset.floor) { d.room.floor = b.dataset.floor; return commit(); }
  if (b.dataset.wall) {
    ui.wall = b.dataset.wall; ui.selected = null;
    const dep = wallDepth(d, ui.wall);
    if (dep !== "mixed") ui.depth = dep;
    return render();
  }
  if (b.dataset.depth) { ui.depth = b.dataset.depth; return render(); }
  if (b.dataset.style) { ui.style = b.dataset.style; return render(); }
  if (b.dataset.width) { ui.width = +b.dataset.width; return render(); }
  if (b.id === "addBtn") {
    d.walls[ui.wall].depth = ui.depth;
    d.walls[ui.wall].modules.push({ style: ui.style, w: ui.width, depth: ui.depth, hinge: "L" });
    ui.selected = { wall: ui.wall, index: d.walls[ui.wall].modules.length - 1 };
    return commit();
  }
  if (b.id === "fillBtn") {
    const g = wallGeometry(d)[ui.wall];
    for (const w of fillWidths(g.free, allowedWidths(ui.style, ui.depth))) d.walls[ui.wall].modules.push({ style: ui.style, w, depth: ui.depth, hinge: "L" });
    return commit();
  }
  const li = b.closest(".mods li");
  if (li && b.dataset.act) { modAction({ wall: ui.wall, index: +li.dataset.index }, b.dataset.act); return commit(); }
});
$("#panel").addEventListener("contextmenu", (e) => {
  const li = e.target.closest(".mods li");
  if (!li) return;
  e.preventDefault();
  openMenu({ wall: ui.wall, index: +li.dataset.index }, e.clientX, e.clientY);
});

// ---- module actions (list buttons and the right-click menu) ------------------------------
// Returns the module's new place, or null if it was removed.
function modAction(at, act, value) {
  const d = D();
  const mods = d.walls[at.wall].modules;
  const i = at.index;
  const m = mods[i];
  if (!m) return null;
  let to = { ...at };
  if (act === "remove") { mods.splice(i, 1); ui.selected = null; return null; }
  if (act === "left" && i > 0) { [mods[i - 1], mods[i]] = [mods[i], mods[i - 1]]; to.index = i - 1; }
  if (act === "right" && i < mods.length - 1) { [mods[i + 1], mods[i]] = [mods[i], mods[i + 1]]; to.index = i + 1; }
  if (act === "hinge") m.hinge = m.hinge === "R" ? "L" : "R";
  if (act === "dup") { mods.splice(i + 1, 0, { ...m }); to.index = i + 1; }
  if (act === "towall") { mods.splice(i, 1); d.walls[value].modules.push(m); to = { wall: value, index: d.walls[value].modules.length - 1 }; }
  if (act === "style") {
    m.style = value;
    const s = styleById[value];
    if (!s.widths.includes(m.w)) m.w = s.widths.reduce((a, w) => (Math.abs(w - m.w) < Math.abs(a - m.w) ? w : a));
  }
  if (act === "width") {
    m.w = +value;
    if (!styleById[m.style].widths.includes(m.w)) m.style = "5s";
  }
  if (act === "depth") {
    const old = setModuleDepth(m, value);
    if (old) toast(`${old} isn’t made ${DEPTHS[value].label}, so it became ${styleById[m.style].name.toLowerCase()}.`);
  }
  ui.selected = to; ui.wall = to.wall;
  return to;
}

// ---- right-click menu ----------------------------------------------------------------------
let menuAt = null;
function closeMenu() { $("#ctx").hidden = true; menuAt = null; }
function openMenu(at, x, y) {
  menuAt = at;
  if (!at.corner) { ui.selected = { wall: at.wall, index: at.index }; ui.wall = at.wall; render(); }
  renderMenu();
  const el = $("#ctx");
  el.hidden = false;
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
}
function renderMenu() {
  const d = D();
  const at = menuAt;
  if (!at) return;
  if (at.corner) {
    const c = d.corners[at.wall];
    if (!c) return closeMenu();
    const info = cornerInfo(c);
    const opts = CORNERS.flatMap((cc) => CORNER_INTERIORS.filter((i) => !i.only || i.only === cc.code).map((i) =>
      `<option value="${cc.code}|${i.id}" ${c.code === cc.code && c.interior === i.id ? "selected" : ""}>${cc.code} · ${cc.size}" · ${i.name}</option>`)).join("");
    $("#ctx").innerHTML = `
      <div class="ctx-head"><b>${info.code}</b><span>${esc(info.name)} · ${money(info.price)}</span></div>
      <label class="ctx-row"><span>Corner</span><select data-cact="corner">${opts}</select></label>
      <div class="ctx-acts"><button data-cact="remove" class="danger">Remove corner</button></div>`;
    return;
  }
  const m = d.walls[at.wall].modules[at.index];
  if (!m) return closeMenu();
  const info = moduleInfo(m);
  const st = styleById[m.style];
  const n = d.walls[at.wall].modules.length;
  const styleOpts = GROUPS.map((g) => {
    const list = STYLES.filter((s) => s.group === g && s.depths.includes(m.depth));
    return list.length ? `<optgroup label="${g}">${list.map((s) => `<option value="${s.id}" ${s.id === m.style ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  const widths = WIDTHS.map((w) => `<button class="chip ${w === m.w ? "on" : ""}" data-cact="width" data-v="${w}" ${st.widths.includes(w) ? "" : "disabled"}>${w}"</button>`).join("");
  const depths = Object.entries(DEPTHS).map(([k, v]) => `<button class="seg ${m.depth === k ? "on" : ""}" data-cact="depth" data-v="${k}">${v.label}</button>`).join("");
  const otherWalls = walls().filter((k) => k !== at.wall);
  $("#ctx").innerHTML = `
    <div class="ctx-head"><b>${info.code}</b><span>${esc(WALL_NAMES[at.wall])} · ${money(info.price)}</span></div>
    <label class="ctx-row"><span>Style</span><select data-cact="style">${styleOpts}</select></label>
    <div class="ctx-row"><span>Width</span><div class="chips">${widths}</div></div>
    <div class="ctx-row"><span>Depth</span><div class="segs">${depths}</div></div>
    ${st.hinged && m.w <= 24 ? `<div class="ctx-row"><span>Door hinge</span><div class="segs">
      <button class="seg ${m.hinge !== "R" ? "on" : ""}" data-cact="hinge" data-v="L">Left</button>
      <button class="seg ${m.hinge === "R" ? "on" : ""}" data-cact="hinge" data-v="R">Right</button></div></div>` : ""}
    <div class="ctx-acts">
      <button data-cact="left" ${at.index === 0 ? "disabled" : ""}>‹ Move left</button>
      <button data-cact="right" ${at.index === n - 1 ? "disabled" : ""}>Move right ›</button>
      ${otherWalls.map((k) => `<button data-cact="towall" data-v="${k}">To ${WALL_NAMES[k].toLowerCase()}</button>`).join("")}
      <button data-cact="dup">Duplicate</button>
      <button data-cact="remove" class="danger">Remove</button>
    </div>`;
}
function menuAct(act, v) {
  const d = D();
  if (menuAt.corner) {
    if (act === "remove") { d.corners[menuAt.wall] = null; closeMenu(); return commit(); }
    if (act === "corner") { const [code, interior] = v.split("|"); d.corners[menuAt.wall] = { code, interior }; }
    commit(); return renderMenu();
  }
  if (act === "hinge") { const m = d.walls[menuAt.wall].modules[menuAt.index]; if (m.hinge === v || (!m.hinge && v === "L")) return; }
  const to = modAction(menuAt, act, v);
  commit();
  if (!to) return closeMenu();
  menuAt = to;
  renderMenu();
}
$("#ctx").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-cact]");
  if (b && !b.disabled) menuAct(b.dataset.cact, b.dataset.v);
});
$("#ctx").addEventListener("change", (e) => {
  if (e.target.dataset.cact) menuAct(e.target.dataset.cact, e.target.value);
});
document.addEventListener("pointerdown", (e) => { if (!$("#ctx").hidden && !e.target.closest("#ctx") && !e.target.closest("#view3d")) closeMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
addEventListener("resize", closeMenu);

$("#panel").addEventListener("change", (e) => {
  const t = e.target;
  const d = D();
  if (t.dataset.decor !== undefined) { d.room.decor = t.checked; return commit(); }
  if (t.dataset.walldepth) {
    const k = t.dataset.walldepth;
    const swapped = setWallDepth(d, k, t.value);
    if (ui.wall === k) ui.depth = t.value;
    if (swapped.length) toast(`${[...new Set(swapped)].join(", ")} isn’t made ${DEPTHS[t.value].label}, so the nearest style was used.`);
    return commit();
  }
  if (t.dataset.wallwidth) {
    const v = Math.max(15, Math.min(400, +t.value || 0));
    d.walls[t.dataset.wallwidth].width = v;
    return commit();
  }
  if (t.dataset.corner !== undefined) {
    const [code, interior] = t.value.split("|");
    d.corners[t.dataset.corner] = code ? { code, interior } : null;
    return commit();
  }
  const li = t.closest(".mods li");
  if (li) {
    const m = d.walls[ui.wall].modules[+li.dataset.index];
    if (t.dataset.act === "width") {
      m.w = +t.value;
      if (!styleById[m.style].widths.includes(m.w)) m.style = "5s";
    }
    if (t.dataset.act === "style") m.style = t.value;
    return commit();
  }
});

document.querySelector(".stage-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (!b) return;
  ui.view = b.dataset.view;
  $("#view3d").hidden = ui.view !== "3d";
  $("#elev").hidden = ui.view === "3d";
  render();
});
$("#elev").addEventListener("contextmenu", (e) => {
  const g = e.target.closest(".mod");
  if (!g) return;
  e.preventDefault();
  openMenu({ wall: g.dataset.wall, index: +g.dataset.index }, e.clientX, e.clientY);
});
$("#elev").addEventListener("click", (e) => {
  const g = e.target.closest(".mod");
  if (!g) return;
  ui.selected = { wall: g.dataset.wall, index: +g.dataset.index };
  ui.wall = g.dataset.wall;
  render();
});
$("#doorsBtn").addEventListener("click", () => { ui.doorsOpen = !ui.doorsOpen; render(); });
$("#lookBtn").addEventListener("click", () => {
  ui.look = !ui.look;
  scene.setLook(ui.look);
  render();
  if (ui.look) toast(TOUCH ? "Drag to look around, or tap “Use phone motion”." : "Drag to look around the closet.");
});
$("#motionBtn").addEventListener("click", async () => {
  const ok = await scene.setMotion(!scene.motion);
  if (!ok && !scene.motion && $("#motionBtn").textContent.startsWith("Use")) toast("Motion isn’t available in this browser. Drag to look around instead.");
  render();
});
$("#sketchBtn").addEventListener("click", () => { ui.sketch = !ui.sketch; render(); });
$("#shotBtn").addEventListener("click", () => {
  if (ui.shots.length >= MAX_SHOTS) return toast(`Up to ${MAX_SHOTS} views. Remove one in the send window first.`);
  ui.shots.push(snapshot());
  render();
  toast(`View ${ui.shots.length} added. It will be in your PDF and sent with your design.`);
});
$("#shotsField").addEventListener("click", (e) => {
  const b = e.target.closest("[data-shot]");
  if (!b) return;
  ui.shots.splice(+b.dataset.shot, 1);
  renderShots();
  render();
});
function renderShots() {
  $("#shotsField").innerHTML = ui.shots.length
    ? `<span class="lbl">Views for your PDF</span><div class="shots">${ui.shots.map((s, i) =>
        `<figure><img src="${s}" alt="View ${i + 1}"><button type="button" data-shot="${i}" title="Remove this view">×</button></figure>`).join("")}</div>`
    : `<span class="lbl">Views for your PDF</span><p class="tiny">Tip: use “Add view to PDF” on the 3D view to include more angles. Without it, the current view is used.</p>`;
}
$("#snapBtn").addEventListener("click", () => download(snapshot(), "artisan-closet.png"));
$("#photoBtn").addEventListener("click", () => {
  $("#photoImg").src = snapshot();
  $("#photoDlg").showModal();
});
$("#photoDownload").addEventListener("click", () => download($("#photoImg").src, "artisan-closet.png"));

$("#summary").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "sendBtn2") openSend();
  if (b.id === "shareBtn") {
    const url = `${location.origin}${location.pathname}#${encode(D())}`;
    navigator.clipboard?.writeText(url).then(() => toast("Link copied"), () => prompt("Copy this link", url));
  }
  if (b.id === "resetBtn" && confirm("Start a new design? This clears the current one.")) {
    ui.design = defaultDesign();
    ui.design.walls.back.modules = [];
    ui.selected = null;
    commit();
  }
});
$("#sendBtn").addEventListener("click", openSend);

// ---- send to Artisan ---------------------------------------------------------------------
function snapshot() {
  scene.update(D(), { doorsOpen: ui.doorsOpen, selected: null, sketch: ui.sketch });
  const url = scene.snapshot();
  scene.update(D(), { doorsOpen: ui.doorsOpen, selected: ui.selected, sketch: ui.sketch });
  return url;
}

function openSend() {
  if (!lineItems(D()).length) return;
  renderShots();
  $("#sendDlg").showModal();
}

function summaryText(form) {
  const d = D();
  const geo = wallGeometry(d);
  const lines = [
    `New closet design from the website`,
    ``,
    `Name: ${form.name}`, `Email: ${form.email}`, `Phone: ${form.phone || "-"}`, `ZIP: ${form.zip || "-"}`,
    `Installation: ${form.install || "Not sure yet"}`,
    ui.shots.length ? `Views saved for the PDF: ${ui.shots.length}` : "",
    form.notes ? `Notes: ${form.notes}` : "",
    ``,
    `Layout: ${LAYOUTS[d.layout].name}`,
    ...activeWalls(d).map((k) => `${WALL_NAMES[k]}: ${d.walls[k].width}" (${geo[k].free}" left open)`),
    ``,
    `MODULES`,
    ...lineItems(d).map((it) => `- ${it.code}  (${it.wall}, ${it.name})  ${money(it.price)}`),
    ``,
    `PARTS`,
    ...partsList(d).map((p) => `- ${p.part} x${p.qty}`),
    ``,
    `Estimated MSRP: ${money(totalPrice(d))}${PRICES_ARE_SAMPLE ? " (sample prices)" : ""}`,
    ``,
    `Open this design: ${location.origin}${location.pathname}#${encode(d)}`,
  ];
  return lines.filter((l) => l !== "").join("\n").replace(/\n(MODULES|PARTS|Layout|Estimated)/g, "\n\n$1");
}

$("#sendForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  const wantsInstall = (form.install || "").startsWith("Yes");
  const subject = `Closet design: ${form.name} · ${money(totalPrice(D()))}${wantsInstall ? " · installation requested" : ""}`;
  location.href = `mailto:${SALES_EMAIL}?cc=${encodeURIComponent(form.email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summaryText(form))}`;
  $("#sendDlg").close();
  toast("Your email app opened with the design. Press send to deliver it to Artisan.");
});
$("#printBtn").addEventListener("click", () => printSummary(Object.fromEntries(new FormData($("#sendForm")))));
document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

function printSummary(form) {
  const d = D();
  const imgs = ui.shots.length ? ui.shots : [snapshot()];
  document.querySelector("#printFrame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "printFrame";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.srcdoc = `<!doctype html><html><head><title>Artisan closet design${form.name ? " · " + esc(form.name) : ""}</title>
  <link rel="stylesheet" href="${new URL("css/app.css", location.href)}"></head><body class="print">
  <header class="print-head"><div class="brand">artisan.</div><div><b>Closet design</b><br>${new Date().toLocaleDateString()}</div></header>
  ${form.name ? `<p>${esc(form.name)} · ${esc(form.email || "")} · ${esc(form.phone || "")}</p>` : ""}
  ${form.install ? `<p><b>Installation:</b> ${esc(form.install)}</p>` : ""}
  <div class="print-shots ${imgs.length > 1 ? "multi" : ""}">${imgs.map((s) => `<img src="${s}" class="print-shot">`).join("")}</div>
  <div class="print-elev">${planHtml(d, null)}${elevationsHtml(d, null)}</div>
  <table class="parts"><thead><tr><th>Closet code</th><th>Where</th><th>Description</th><th>MSRP</th></tr></thead><tbody>
  ${lineItems(d).map((it) => `<tr><td>${it.code}</td><td>${esc(it.wall)}</td><td>${esc(it.name)}</td><td>${money(it.price)}</td></tr>`).join("")}
  <tr class="tot"><td colspan="3">Estimated MSRP${PRICES_ARE_SAMPLE ? " (sample prices)" : ""}</td><td>${money(totalPrice(d))}</td></tr></tbody></table>
  <h3>Parts to order</h3><table class="parts"><tbody>${partsList(d).map((p) => `<tr><td>${esc(p.part)}</td><td>× ${p.qty}</td></tr>`).join("")}</tbody></table>
  <p class="fine">Designs are for planning. Artisan confirms all dimensions, parts and prices before ordering.</p>
  </body></html>`;
  frame.onload = () => setTimeout(() => frame.contentWindow.print(), 300);
  document.body.appendChild(frame);
  toast("Choose “Save as PDF” in the print window.");
}

function download(url, name) {
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3800);
}

render();

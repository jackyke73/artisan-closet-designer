import { STYLES, GROUPS, DEPTHS, WIDTHS, CORNERS, CORNER_INTERIORS, styleById, allowedWidths, fillWidths, HEIGHT, FILLER_MIN, FILLER_MAX, clampFiller, customFromLook, normalizeCustom, customProblems, customLook, customParts, customCode, customName, SNAP, DRAWER_TOP, SHOE_TOP, TOE, T, CUSTOM_SHOE_WIDTHS } from "./catalog.js";
import { clashSet, PRESETS, SIDES, WALL_NAMES, ROOM_WALLS, ROOM_FLOORS, defaultDesign, activeWalls, wallGeometry, lineItems, partsList, totalPrice, problems, encode, decode, moduleInfo, cornerInfo, wallDepth, setWallDepth, setModuleDepth, dropTarget, moveModule, fillerPlan, addFillers, collisions, WALL_T, CEILING, OPENING_DEFAULTS, OBSTACLE_DEFAULTS, layoutName, presetKey, applyPreset, roomDepth, isWalk, wallLength, isCustom, ROOM_SHAPES, SHAPE_ICONS, applyShape, toCustom, shapeWalls, shapeBox, moveShapeWall, setShapeWallLength, splitShapeWall, wallRef } from "./design.js";
import { priceOf } from "./pricing.js";
import { money, PRICES_ARE_SAMPLE } from "./pricing.js";
import { elevationsHtml, drawModule, wallSvg } from "./elevation.js";
import { planHtml } from "./plan.js";
import { ClosetScene, VIEWS } from "./scene.js";
import { fmtIn } from "./units.js";
import { initAuth } from "./auth.js";

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
  cut: true,       // 3D: hide walls between the camera and the closet
  dims: false,     // 3D: show sizes
  measure: false,  // measuring tool on
  m2: {},          // drawing measurements: { figureKey: [{ a: [x, y], b: [x, y] }] }
  m2pend: null,    // { key, a } first point of a drawing measurement
  grid: false,     // floor plan grid
  clear: true,     // floor plan walkway sizes
  heights: false,  // front drawings: shelf heights on every module
  vb: {},          // zoomed drawings: { figureKey: [x, y, w, h] }
};
const MAX_SHOTS = 6;
const TOUCH = matchMedia("(pointer: coarse)").matches;
if (fromHash) history.replaceState(null, "", location.pathname);

let dragWarned = false;
const scene = new ClosetScene($("#view3d"), {
  onPick: (p) => {
    if (p && !p.corner) { ui.selected = p; ui.wall = p.wall; }
    else ui.selected = null;
    render();
  },
  onMenu: (p, x, y) => (p ? openMenu(p, x, y) : closeMenu()),
  onDrag: (from, x, z) => dragModule(from, x, z),
  onDragEnd: () => { dragWarned = false; commit(); },
  onMeasure: () => renderTools(),
});

// Live reorder while dragging a module (3D view or floor plan), from a point on the floor
// (x across, z out from the back wall). Returns where the module is now.
function dragModule(from, x, z) {
  const to = dropTarget(D(), from, x, z);
  if (to.wall === from.wall && to.index === from.index) return from;
  if (to.wall !== from.wall) {
    const trial = JSON.parse(JSON.stringify(D()));
    const n0 = collisions(trial).length;
    moveModule(trial, from, to);
    if (collisions(trial).length > n0) {
      if (!dragWarned) { dragWarned = true; toast(`No room on the ${WALL_NAMES[to.wall].toLowerCase()} for that module.`); }
      return from;
    }
  }
  moveModule(D(), from, to);
  ui.selected = to; ui.wall = to.wall;
  render();
  return to;
}

// ---- helpers ------------------------------------------------------------------
const D = () => ui.design;
const walls = () => activeWalls(D());
// Every change goes through commit(). A change that makes cabinets overlap is undone.
const snap = () => JSON.stringify({ design: D(), selected: ui.selected, wall: ui.wall });
let lastGood = null;
// Room changes (walls, ceiling, windows…) are kept with a warning; cabinet changes that clash are undone.
function commit({ room = false } = {}) {
  const before = lastGood ? collisions(JSON.parse(lastGood).design) : [];
  const now = collisions(D());
  const fresh = now.filter((m) => !before.includes(m));
  if (room && fresh.length) toast(`Heads up: ${fresh[0].replace(" would be ", " is ").replace(" would hit ", " hits ")} Move or remove that module.`);
  else if (lastGood && fresh.length) {
    const s = JSON.parse(lastGood);
    ui.design = s.design; // keep the wall tab the customer is on
    const sel = s.selected;
    ui.selected = sel && ui.design.walls[sel.wall]?.modules[sel.index] ? sel : null;
    render();
    toast(`Not placed: ${fresh[0]}`);
    return false;
  }
  lastGood = snap();
  remember();
  try { localStorage.setItem(STORE_KEY, encode(D())); } catch { /* ignore */ }
  render();
  return true;
}

// ---- undo and redo ----------------------------------------------------------------
const hist = { list: [], at: -1 };
function remember() {
  const s = JSON.stringify(D());
  if (hist.list[hist.at] === s) return;
  hist.list = hist.list.slice(0, hist.at + 1);
  hist.list.push(s);
  if (hist.list.length > 100) hist.list.shift();
  hist.at = hist.list.length - 1;
}
function travel(step) {
  const i = hist.at + step;
  if (i < 0 || i >= hist.list.length) return;
  hist.at = i;
  ui.design = JSON.parse(hist.list[i]);
  const sel = ui.selected;
  if (sel && !ui.design.walls[sel.wall]?.modules[sel.index]) ui.selected = null;
  if (!walls().includes(ui.wall)) ui.wall = walls()[0];
  lastGood = snap();
  try { localStorage.setItem(STORE_KEY, encode(D())); } catch { /* ignore */ }
  closeMenu();
  render();
  toast(step < 0 ? "Undone" : "Redone");
}
$("#undoBtn").addEventListener("click", () => travel(-1));
$("#redoBtn").addEventListener("click", () => travel(1));
function icon(look, w) {
  return `<svg viewBox="-2 -6 ${w + 4} ${HEIGHT + 10}" class="mini">${drawModule(0, w, look, "", false)}</svg>`;
}
const inchesLabel = (n) => `${n}" <span>${Math.floor(n / 12)}' ${+(n % 12).toFixed(2)}"</span>`;

// ---- panel: step 1, space -------------------------------------------------------
const PRESET_ICONS = {
  reach: `<path d="M6 8h36v6H6z"/>`,
  Lleft: `<path d="M6 8h36v6H12v26H6z"/>`,
  Lright: `<path d="M6 8h36v32h-6V14H6z"/>`,
  U: `<path d="M6 8h36v32h-6V14H12v26H6z"/>`,
  galley: `<path d="M6 8h6v32H6zM36 8h6v32h-6z"/>`,
  single: `<path d="M6 8h36v6H6z"/><path d="M20 40h8" class="door"/>`,
};
const roomText = (d) => (isCustom(d)
  ? `Custom room, ${d.shape.ids.length} walls, ${fmtIn(shapeBox(d).W)} × ${fmtIn(shapeBox(d).D)} overall`
  : `${fmtIn(d.walls.back.width)} wide${isWalk(d) ? ` × ${fmtIn(roomDepth(d))} deep` : ""}`);
const num = (attrs, v, unit = "in") => `<span class="inch"><input type="number" ${attrs} value="${v}"> ${unit}</span>`;
const ftIn = (n) => `${Math.floor(n / 12)}' ${+(n % 12).toFixed(2)}"`;

// Custom room: start shapes, then each wall with its length, cabinets on or off, and a
// button that adds a jog. Walls can also be dragged on the floor plan.
function customRoomHtml(d) {
  const shapes = Object.entries(ROOM_SHAPES).map(([k, v]) =>
    `<button class="btn ghost sm shape-btn" data-shape="${k}"><svg viewBox="0 0 48 44"><path d="${SHAPE_ICONS[k]}"/></svg>${v.name}</button>`).join("");
  const rows = shapeWalls(d).map((w) => `<div class="wrow">
      <label class="check"><input type="checkbox" data-cab="${w.k}" ${d.cab[w.k] ? "checked" : ""}> <b>${WALL_NAMES[w.k]}</b></label>
      ${num(`min="${6}" max="600" step="0.25" data-wlen="${w.i}"`, +w.len.toFixed(2))}
      <button class="icon-btn" data-split="${w.i}" title="Add a 12&quot; jog in the middle of ${WALL_NAMES[w.k].toLowerCase()}">⌐</button>
    </div>`).join("");
  return `<div class="custom-room">
      <div class="shape-row"><span>Start from</span>${shapes}</div>
      <div class="wrows"><div class="wrow head"><span>Wall · cabinets</span><span>Length</span><span>Jog</span></div>${rows}</div>
      <p class="tiny">Tick the walls that get cabinets. Drag a wall on the floor plan to move it, or type its length; the walls next to it stretch to match.</p>
    </div>`;
}

function renderSpace() {
  const d = D();
  const walk = isWalk(d);
  const pk = presetKey(d);
  const custom = isCustom(d);
  const presetBtns = Object.entries(PRESETS).map(([k, v]) => `
    <button class="layout ${pk === k ? "on" : ""}" data-preset="${k}">
      <svg viewBox="0 0 48 44"><rect x="2" y="4" width="44" height="38" rx="2" class="room"/>${PRESET_ICONS[k]}</svg>
      <span>${v.name}</span></button>`).join("") + `
    <button class="layout wide-tile ${custom ? "on" : ""}" data-preset="custom">
      <svg viewBox="0 0 48 44"><path d="M6 18h12V6h24v32H6z" class="outline"/><path d="M18 6v12H6" class="jog"/></svg>
      <span>Custom room<small>any shape, any wall</small></span></button>`;
  const cabChecks = custom ? "" : walk ? `<div class="cabwalls"><span>Cabinets on</span>${SIDES.map((k) =>
    `<label class="check"><input type="checkbox" data-cab="${k}" ${d.cab[k] ? "checked" : ""}> ${WALL_NAMES[k].replace(" wall", "")}</label>`).join("")}</div>` : "";
  const sizeInputs = `
    ${custom ? "" : `<label class="field"><span>${walk ? "Room width (back wall)" : "Closet width"}</span>
      ${num(`min="24" max="400" step="0.25" data-roomw`, d.walls.back.width)}<small>${ftIn(d.walls.back.width)}</small></label>`}
    ${walk ? `<label class="field"><span>Room depth (side walls)</span>
      ${num(`min="36" max="400" step="0.25" data-roomd`, d.walls.left.width)}<small>${ftIn(d.walls.left.width)}</small></label>` : ""}
    <label class="field"><span>Ceiling height</span>
      ${num(`min="${CEILING.min}" max="${CEILING.max}" step="0.25" data-ceiling`, d.ceiling)}<small>${d.ceiling < HEIGHT ? `<b class="bad">Under the ${HEIGHT}" cabinets</b>` : ftIn(d.ceiling)}</small></label>
    <label class="field"><span>Wall thickness</span>
      ${num(`min="${WALL_T.min}" max="${WALL_T.max}" step="0.25" data-wallthick`, d.wallT)}<small>Drywall over 2×4 studs is about 4.5"</small></label>`;
  const depthInputs = walls().map((k) => {
    const dep = wallDepth(d, k);
    return `<label class="field"><span>${WALL_NAMES[k]} cabinet depth</span>
        <select data-walldepth="${k}">
          ${dep === "mixed" ? `<option value="" selected disabled>Mixed</option>` : ""}
          ${Object.entries(DEPTHS).map(([dk, v]) => `<option value="${dk}" ${dep === dk ? "selected" : ""}>${v.label}</option>`).join("")}
        </select></label>`;
  }).join("");
  const cornerInputs = walk && d.cab.back ? ["left", "right"].filter((s) => d.cab[s]).map((side) => {
    const c = d.corners[side];
    const opts = [`<option value="">No corner module</option>`, ...CORNERS.flatMap((cc) =>
      CORNER_INTERIORS.filter((i) => !i.only || i.only === cc.code).map((i) =>
        `<option value="${cc.code}|${i.id}" ${c && c.code === cc.code && c.interior === i.id ? "selected" : ""}>${cc.code} · ${cc.size}" ${DEPTHS[cc.depth].label} · ${i.name}</option>`))].join("");
    return `<label class="field wide"><span>${side === "left" ? "Back-left" : "Back-right"} corner</span><select data-corner="${side}">${opts}</select></label>`;
  }).join("") : "";

  // windows and doors
  const openWalls = custom ? d.shape.ids : walk ? ["back", "left", "right", "front"] : ["back"];
  const openRows = d.openings.map((o, i) => {
    if (!openWalls.includes(o.wall)) return "";
    const along = custom ? "From wall start" : o.wall === "left" || o.wall === "right" ? "From back" : "From left";
    return `<div class="orow" data-oi="${i}">
      <div class="orow-h"><b>${o.kind === "window" ? "Window" : "Door"}</b>
        <select data-o="wall">${openWalls.map((k) => `<option value="${k}" ${o.wall === k ? "selected" : ""}>${WALL_NAMES[k]}</option>`).join("")}</select>
        <button class="icon-btn del" data-delopen="${i}" title="Remove">×</button></div>
      <div class="orow-f">
        <label>${along}${num(`step="0.25" min="0" data-o="at"`, o.at)}</label>
        <label>Width${num(`step="0.25" min="12" data-o="w"`, o.w)}</label>
        <label>Height${num(`step="0.25" min="12" data-o="h"`, o.h)}</label>
        ${o.kind === "window" ? `<label>Sill${num(`step="0.25" min="0" data-o="sill"`, o.sill)}</label>`
          : `<label>Swings<select data-o="swing"><option value="in" ${o.swing !== "out" ? "selected" : ""}>Into the closet</option><option value="out" ${o.swing === "out" ? "selected" : ""}>Out / sliding</option></select></label>`}
      </div></div>`;
  }).join("");
  const obRows = d.obstacles.map((b, i) => `<div class="orow" data-bi="${i}">
      <div class="orow-h"><b>${b.kind === "column" ? "Column" : "Soffit / beam"}</b><button class="icon-btn del" data-delob="${i}" title="Remove">×</button></div>
      <div class="orow-f">
        <label>From left${num(`step="0.25" min="0" data-b="x"`, b.x)}</label>
        <label>From back${num(`step="0.25" min="0" data-b="z"`, b.z)}</label>
        <label>Width${num(`step="0.25" min="1" data-b="w"`, b.w)}</label>
        <label>Depth${num(`step="0.25" min="1" data-b="d"`, b.d)}</label>
        ${b.kind === "soffit" ? `<label>Bottom at${num(`step="0.25" min="40" data-b="bottom"`, b.bottom)}</label>` : ""}
      </div></div>`).join("");
  const sl = d.slope;
  const slopeWalls = walk ? SIDES : SIDES;
  const slopeRow = custom ? "" : `<div class="orow">
      <div class="orow-h"><b>Sloped ceiling</b>
        <select data-slope="wall"><option value="">None</option>${slopeWalls.map((k) => `<option value="${k}" ${sl?.wall === k ? "selected" : ""}>Comes down to the ${WALL_NAMES[k].toLowerCase()}</option>`).join("")}</select></div>
      ${sl ? `<div class="orow-f">
        <label>Height at that wall${num(`step="0.25" min="24" data-slope="knee"`, sl.knee)}</label>
        <label>Slope width${num(`step="0.25" min="6" data-slope="run"`, sl.run)}</label>
      </div><p class="tiny">Attic rooms: the ceiling rises from the low wall to full height over the slope width.</p>` : ""}
    </div>`;
  const nRoom = d.openings.filter((o) => openWalls.includes(o.wall)).length + d.obstacles.length + (sl ? 1 : 0);
  return `
    <section class="step"><h2><b>1</b>Your space</h2>
      <div class="layouts six">${presetBtns}</div>
      ${cabChecks}
      ${custom ? customRoomHtml(d) : ""}
      <div class="fields">${sizeInputs}${depthInputs}${cornerInputs}</div>
      <details class="roomx" ${ui.roomOpen ? "open" : ""}><summary>Windows, doors, columns${custom ? "" : " and slopes"}${nRoom ? ` <em>${nRoom}</em>` : ""}</summary>
        <p class="tiny">Cabinets can’t go over a window (unless its sill is above ${HEIGHT}"), a door or its swing, a column, a low soffit, or a sloped ceiling under ${HEIGHT}".</p>
        ${openRows}${obRows}${slopeRow}
        <div class="add-room">
          <button class="btn ghost sm" data-addopen="window">+ Window</button>
          <button class="btn ghost sm" data-addopen="door">+ Door</button>
          <button class="btn ghost sm" data-addob="column">+ Column</button>
          <button class="btn ghost sm" data-addob="soffit">+ Soffit</button>
        </div>
      </details>
      <p class="hint">Artisan closets are ${HEIGHT}" tall. Measure each wall from corner to corner.${custom ? " Walls are numbered clockwise, seen from above." : ""}</p>
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
  if (!walls().includes(ui.wall)) ui.wall = walls()[0];
  const geo = wallGeometry(d);
  const g = geo[ui.wall];
  const tabs = walls().map((k) => {
    const gg = geo[k];
    return `<button class="tab ${ui.wall === k ? "on" : ""}" data-wall="${k}">${WALL_NAMES[k]}<small class="${gg.free < 0 ? "bad" : ""}">${gg.free}" free</small></button>`;
  }).join("");
  const depthBtns = Object.entries(DEPTHS).map(([k, v]) => `<button class="seg ${ui.depth === k ? "on" : ""}" data-depth="${k}">${v.label}</button>`).join("");
  const available = STYLES.filter((s) => s.depths.includes(ui.depth));
  if (ui.style !== "custom" && !available.find((s) => s.id === ui.style)) ui.style = available[0].id;
  const custom = ui.style === "custom";
  const styleCards = GROUPS.map((grp) => {
    const list = available.filter((s) => s.group === grp);
    if (!list.length) return "";
    return `<div class="group"><h3>${grp}</h3><div class="cards">${list.map((s) => `
      <button class="card ${ui.style === s.id ? "on" : ""}" data-style="${s.id}" title="${esc(s.name)}">
        ${icon(s.look(), 24)}<span>${esc(s.name)}</span></button>`).join("")}</div></div>`;
  }).join("") + `<div class="group"><h3>Custom</h3><div class="cards">
      <button class="card ${custom ? "on" : ""}" data-style="custom" title="Choose your own shelves, rods, drawers and doors">
        ${icon({ shelves: [52, 70], rods: [43], drawers: false }, 24)}<span>Build your own interior</span></button></div></div>`;
  const widths = custom ? WIDTHS : allowedWidths(ui.style, ui.depth);
  if (!widths.includes(ui.width)) ui.width = widths.find((w) => w <= g.free) || widths[widths.length - 1];
  const widthChips = WIDTHS.map((w) => {
    const ok = widths.includes(w);
    const fits = w <= g.free + 0.001;
    return `<button class="chip ${ui.width === w ? "on" : ""} ${ok && !fits ? "nofit" : ""}" data-width="${w}" ${ok ? "" : "disabled"}>${w}"</button>`;
  }).join("");
  const preview = custom ? { code: customCode(ui.width, ui.depth), price: null } : moduleInfo({ style: ui.style, w: ui.width, depth: ui.depth, hinge: "L" });
  const fill = custom ? [] : fillWidths(Math.max(0, g.free), widths);
  const fillLeft = +(g.free - fill.reduce((a, w) => a + w, 0)).toFixed(2);
  const fillFill = fillerPlan(fillLeft) || [];
  const gapFill = fillerPlan(g.free);
  const fillerBtn = gapFill && gapFill.length
    ? `<button class="btn ghost full filler-btn" id="fillerBtn">Close the ${g.free}" gap with ${gapFill.length === 2 ? `two fillers, ${gapFill[1]}" and ${gapFill[0]}" at each end` : `a ${gapFill[0]}" filler`}</button>`
    : "";
  const clash = clashSet(d);
  const list = d.walls[ui.wall].modules.map((m, i) => {
    const info = moduleInfo(m);
    const bad = clash.has(`${ui.wall}:${i}`) ? " clash" : "";
    const st = styleById[m.style];
    const sel = ui.selected && ui.selected.wall === ui.wall && ui.selected.index === i;
    if (st.filler) {
      return `<li class="${sel ? "sel" : ""} filler-row${bad}" data-index="${i}">
      ${icon(info.look, Math.max(m.w, 3))}
      <div class="meta"><b>${info.code}</b><span>Filler strip · ${money(info.price)}</span>
        <div class="row-ctl"><label class="fw">Width <input type="number" min="${FILLER_MIN}" max="${FILLER_MAX}" step="0.25" value="${m.w}" data-act="fwidth"> in</label></div></div>
      <div class="order">
        <button class="icon-btn" data-act="left" title="Move left" ${i === 0 ? "disabled" : ""}>‹</button>
        <button class="icon-btn" data-act="right" title="Move right" ${i === d.walls[ui.wall].modules.length - 1 ? "disabled" : ""}>›</button>
        <button class="icon-btn del" data-act="remove" title="Remove">×</button>
      </div></li>`;
    }
    const widthOpts = (m.custom ? WIDTHS : st.widths.filter((w) => st.depths.includes(m.depth))).map((w) => `<option ${w === m.w ? "selected" : ""}>${w}</option>`).join("");
    const styleOpts = (m.custom ? `<option value="" selected>Custom interior</option>` : "") +
      STYLES.filter((s) => s.depths.includes(m.depth) && s.widths.includes(m.w)).map((s) => `<option value="${s.id}" ${!m.custom && s.id === m.style ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const hasDoors = m.custom ? m.custom.doors : st.hinged;
    const hinge = hasDoors && m.w <= 24 ? `<button class="mini-btn" data-act="hinge" title="Door hinge side">Hinge ${m.hinge === "R" ? "right" : "left"}</button>` : "";
    return `<li class="${sel ? "sel" : ""}${bad}" data-index="${i}">
      ${icon(info.look, m.w)}
      <div class="meta"><b>${info.code}${bad ? ` <em class="clash-tag">⚠ Overlaps</em>` : ""}</b><span>${esc(info.name)} · ${money(info.price)}</span>
        <div class="row-ctl">
          <select data-act="style">${styleOpts}</select>
          <select data-act="width" title="Width">${widthOpts}</select>${hinge}
          <button class="mini-btn" data-act="interior" title="Choose shelves, rods, drawers and doors">Interior…</button>
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
        <div class="add-info"><b>${preview.code}</b><span>${custom ? "You choose the interior next" : `${money(preview.price)} MSRP`}</span></div>
        <button class="btn primary" id="addBtn">${custom ? "Add and design" : `Add to ${WALL_NAMES[ui.wall].toLowerCase()}`}</button>
      </div>
      ${fill.length ? `<button class="btn ghost full" id="fillBtn">Fill the rest with ${esc(styleById[ui.style].name.toLowerCase())}: ${fill.map((w) => w + '"').join(" + ")}${fillFill.length ? ` + ${fillFill.map((w) => w + '"').join(" + ")} filler` : ""}</button>` : ""}
      ${fillerBtn}
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
    ${warn.length ? `<div class="warn-box"><b>⚠ ${warn.length === 1 ? "1 problem" : `${warn.length} problems`} to fix before ordering</b>${warn.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}<small>Cabinets in red overlap something. Undo, move or remove them.</small></div>` : ""}
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
  else drawDrawings();
  renderTools();
  $("#undoBtn").disabled = hist.at <= 0;
  $("#redoBtn").disabled = hist.at >= hist.list.length - 1;
  $("#doorsBtn").textContent = ui.doorsOpen ? "Close doors" : "Open doors";
  document.querySelectorAll(".only3d").forEach((b) => b.classList.toggle("off3d", ui.view !== "3d"));
  $("#lookBtn").textContent = ui.look ? "Back to overview" : "Look around";
  $("#lookBtn").classList.toggle("active", ui.look);
  $("#sketchBtn").classList.toggle("active", ui.sketch);
  $("#motionBtn").hidden = !(ui.look && TOUCH);
  $("#motionBtn").textContent = scene.motion ? "Stop phone motion" : "Use phone motion";
  $("#shotBtn").textContent = ui.shots.length ? `Add view to PDF (${ui.shots.length})` : "Add view to PDF";
  $("#hint").textContent = ui.measure ? (TOUCH ? "Tap two points to measure" : "Click two points to measure · hold Shift for a straight line · Esc to stop")
    : ui.view === "plan" ? (TOUCH ? "Drag a module to move it · tap it to select it · use + and − to zoom" : "Drag a module to move it · right-click it to change it · scroll to zoom")
    : ui.view !== "3d" ? (TOUCH ? "Tap a module to select it · use + and − to zoom" : "Click a module to select it · right-click to change it · pinch or Ctrl+scroll to zoom")
    : ui.look ? (scene.motion ? "Move your phone to look around" : "Drag to look around")
    : TOUCH ? "Drag to turn · hold a module to move it or change it"
    : "Drag a module to move it · right-click it to change it · drag the room to turn";
  document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === ui.view));
}

// ---- view tools: camera views, measuring, zoom ------------------------------------------
function renderTools() {
  const t = $("#tools");
  const btn = (attrs, label, on, title) => `<button type="button" class="tb${on ? " on" : ""}" ${attrs} title="${esc(title)}">${label}</button>`;
  const ruler = `<svg viewBox="0 0 16 16" class="ico"><path d="M1.5 10.5l9-9 4 4-9 9z M4 8l1.5 1.5 M6 6l2 2 M8 4l1.5 1.5"/></svg>`;
  if (ui.view === "3d") {
    t.hidden = ui.look;
    if (ui.look) return;
    const n = scene.measures.length;
    t.innerHTML = `<div class="seg">${Object.entries(VIEWS).map(([k, v]) =>
      btn(`data-cam="${k}"`, v.name, scene.viewName === k, v.title || "Three-quarter view")).join("")}</div>
      <div class="seg">${btn('data-tool="flat"', "Flat", scene.flat, "No perspective, like a technical drawing")}${btn('data-tool="cut"', "Cut walls", ui.cut, "Hide walls between you and the closet")}${btn('data-tool="dims"', "Sizes", ui.dims, "Show dimensions in the 3D view")}${btn('data-tool="measure"', `${ruler} Measure`, ui.measure, "Click two points to measure the distance")}${n ? btn('data-tool="clear"', `Clear ${n}`, false, "Remove your measurements") : ""}</div>`;
    return;
  }
  t.hidden = false;
  const n = Object.entries(ui.m2).filter(([k]) => k.startsWith(ui.view)).reduce((a, [, l]) => a + l.length, 0);
  t.innerHTML = `<div class="seg">${btn('data-zoom="in"', "+", false, "Zoom in")}${btn('data-zoom="out"', "−", false, "Zoom out")}${btn('data-zoom="fit"', "Fit", false, "Show the whole drawing")}</div>
    <div class="seg">${ui.view === "plan"
      ? btn('data-tool="grid"', "Grid", ui.grid, "Show a 1 ft grid") + btn('data-tool="clearance"', "Walkways", ui.clear, "Show the walking room between cabinets")
      : btn('data-tool="heights"', "Shelf heights", ui.heights, "Show shelf and rod heights on every module")}${btn('data-tool="measure"', `${ruler} Measure`, ui.measure, "Click two points to measure the distance")}${n ? btn('data-tool="clear"', `Clear ${n}`, false, "Remove your measurements") : ""}</div>`;
}

function setMeasure(on) {
  ui.measure = on;
  ui.m2pend = null;
  scene.setMeasuring(on && ui.view === "3d");
  if (on) closeMenu();
  render();
}

$("#tools").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.cam) { scene.setView(b.dataset.cam); return renderTools(); }
  if (b.dataset.zoom) {
    document.querySelectorAll("#elev figure[data-key] svg").forEach((svg) => {
      if (b.dataset.zoom === "fit") return resetZoom(svg);
      const vb = svg.viewBox.baseVal;
      zoomSvg(svg, b.dataset.zoom === "in" ? 1.4 : 1 / 1.4, vb.x + vb.width / 2, vb.y + vb.height / 2);
    });
    return;
  }
  const t = b.dataset.tool;
  if (t === "flat") scene.setFlat(!scene.flat);
  if (t === "cut") { ui.cut = !ui.cut; scene.setCut(ui.cut); }
  if (t === "dims") { ui.dims = !ui.dims; scene.setDims(ui.dims); return render(); }
  if (t === "measure") return setMeasure(!ui.measure);
  if (t === "clear") {
    if (ui.view === "3d") scene.clearMeasures();
    else for (const k of Object.keys(ui.m2)) if (k.startsWith(ui.view)) delete ui.m2[k];
    ui.m2pend = null;
    return render();
  }
  if (t === "grid") { ui.grid = !ui.grid; return render(); }
  if (t === "clearance") { ui.clear = !ui.clear; return render(); }
  if (t === "heights") { ui.heights = !ui.heights; return render(); }
  renderTools();
});

// A dimension line between two drawing points, labelled in inches.
function dim2(a, b, cls) {
  const [x0, y0] = a, [x1, y1] = b;
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 0.05) return "";
  const nx = -(y1 - y0) / L * 2, ny = (x1 - x0) / L * 2;
  let ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang <= -90) ang += 180;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return `<g class="dim ${cls}"><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>` +
    `<line x1="${x0 - nx}" y1="${y0 - ny}" x2="${x0 + nx}" y2="${y0 + ny}"/><line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x1 + nx}" y2="${y1 + ny}"/>` +
    `<circle cx="${x0}" cy="${y0}" r=".7"/><circle cx="${x1}" cy="${y1}" r=".7"/>` +
    `<text transform="translate(${mx} ${my}) rotate(${ang})" y="-1.5">${fmtIn(L)}</text></g>`;
}
const withMeasures = (html, key) =>
  html.replace("</svg></figure>", `<g class="m2">${(ui.m2[key] || []).map((m) => dim2(m.a, m.b, "measure")).join("")}</g><g class="m2live"></g></svg></figure>`);

function drawingHtml(d, selected) {
  if (ui.view === "plan") return withMeasures(planHtml(d, selected, { grid: ui.grid, clear: ui.clear }), "plan");
  return walls().map((k) => withMeasures(wallSvg(d, k, selected, { heights: ui.heights ? "all" : "selected" }), `elev-${k}`)).join("");
}

function drawDrawings() {
  const el = $("#elev");
  el.innerHTML = drawingHtml(D(), ui.selected);
  el.classList.toggle("measuring", ui.measure);
  el.querySelectorAll("figure[data-key] svg").forEach((svg) => {
    svg.dataset.vb0 = svg.getAttribute("viewBox");
    const vb = ui.vb[svg.closest("figure").dataset.key];
    if (vb) { svg.setAttribute("viewBox", vb.join(" ")); svg.classList.add("zoomed"); }
  });
}

const svgPoint = (svg, cx, cy) => new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
function resetZoom(svg) {
  delete ui.vb[svg.closest("figure").dataset.key];
  svg.setAttribute("viewBox", svg.dataset.vb0);
  svg.classList.remove("zoomed");
}
function zoomSvg(svg, f, cx, cy) {
  const vb = svg.viewBox.baseVal;
  const vb0 = svg.dataset.vb0.split(" ").map(Number);
  const w = vb.width / f, h = vb.height / f;
  if (w >= vb0[2] - 0.01) return resetZoom(svg);
  if (w < vb0[2] / 14) return;
  const next = [cx - (cx - vb.x) / f, cy - (cy - vb.y) / f, w, h].map((v) => +v.toFixed(3));
  ui.vb[svg.closest("figure").dataset.key] = next;
  svg.setAttribute("viewBox", next.join(" "));
  svg.classList.add("zoomed");
}

// Snap to the nearest corner (or else edge) of what is drawn, within a few pixels.
function snap2(svg, cx, cy, from, shift) {
  let corner = null, cd = 11, edge = null, ed = 7;
  for (const el of svg.querySelectorAll("rect, polygon, polyline, line")) {
    if (el.closest(".m2, .m2live, .dim, .grid, .hmarks")) continue;
    const m = el.getScreenCTM();
    if (!m) continue;
    let pts, closed = false;
    if (el.tagName === "rect") {
      const x = el.x.baseVal.value, y = el.y.baseVal.value, w = el.width.baseVal.value, h = el.height.baseVal.value;
      pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; closed = true;
    } else if (el.tagName === "line") pts = [[el.x1.baseVal.value, el.y1.baseVal.value], [el.x2.baseVal.value, el.y2.baseVal.value]];
    else { pts = Array.from(el.points, (p) => [p.x, p.y]); closed = el.tagName === "polygon"; }
    const sp = pts.map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    sp.forEach((p, i) => {
      const dd = Math.hypot(p.x - cx, p.y - cy);
      if (dd < cd) { cd = dd; corner = p; }
      const q = sp[i + 1] || (closed ? sp[0] : null);
      if (!q) return;
      const vx = q.x - p.x, vy = q.y - p.y, len2 = vx * vx + vy * vy;
      if (!len2) return;
      const k = Math.max(0, Math.min(1, ((cx - p.x) * vx + (cy - p.y) * vy) / len2));
      const ex = p.x + k * vx, ey = p.y + k * vy, de = Math.hypot(ex - cx, ey - cy);
      if (de < ed) { ed = de; edge = { x: ex, y: ey }; }
    });
  }
  const P = corner || edge;
  const q = svgPoint(svg, P ? P.x : cx, P ? P.y : cy);
  let v = [q.x, q.y].map((c) => Math.round(c * 16) / 16);
  if (from) {
    const dx = v[0] - from[0], dy = v[1] - from[1];
    if (shift ? Math.abs(dx) >= Math.abs(dy) : Math.abs(dy) < Math.abs(dx) * 0.07) v[1] = from[1];
    else if (shift || Math.abs(dx) < Math.abs(dy) * 0.07) v[0] = from[0];
  }
  return { v, snapped: !!P };
}

function liveMeasure(svg, e) {
  const key = svg.closest("figure").dataset.key;
  const pend = ui.m2pend?.key === key ? ui.m2pend.a : null;
  const { v, snapped } = snap2(svg, e.clientX, e.clientY, pend, e.shiftKey);
  const r = 4 / svg.getScreenCTM().a;
  const live = svg.querySelector(".m2live");
  if (live) live.innerHTML = (pend ? dim2(pend, v, "measure live") : "") +
    `<circle cx="${v[0]}" cy="${v[1]}" r="${snapped ? r * 1.3 : r}" class="cursor${snapped ? " snap" : ""}"/>`;
  return { key, v, pend };
}

let pan = null;
$("#elev").addEventListener("wheel", (e) => {
  const svg = e.target.closest("figure[data-key] svg");
  if (!svg) return;
  if (ui.view !== "plan" && !e.ctrlKey && !e.metaKey) return; // let the drawings scroll
  e.preventDefault();
  const p = svgPoint(svg, e.clientX, e.clientY);
  zoomSvg(svg, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), p.x, p.y);
}, { passive: false });
$("#elev").addEventListener("pointerdown", (e) => {
  const svg = e.target.closest("figure[data-key] svg");
  if (!svg || e.button !== 0 || ui.measure || e.target.closest(".mod, .cwall") || !svg.classList.contains("zoomed")) return;
  pan = { svg, x: e.clientX, y: e.clientY, vb: [...ui.vb[svg.closest("figure").dataset.key]], k: 1 / svg.getScreenCTM().a };
  svg.setPointerCapture(e.pointerId);
});
$("#elev").addEventListener("pointermove", (e) => {
  if (pan) {
    const [x, y, w, h] = pan.vb;
    const next = [x - (e.clientX - pan.x) * pan.k, y - (e.clientY - pan.y) * pan.k, w, h];
    ui.vb[pan.svg.closest("figure").dataset.key] = next;
    pan.svg.setAttribute("viewBox", next.join(" "));
    return;
  }
  if (!ui.measure || e.pointerType !== "mouse") return;
  const svg = e.target.closest("figure[data-key] svg");
  $("#elev").querySelectorAll(".m2live").forEach((g) => { if (!svg || !svg.contains(g)) g.innerHTML = ""; });
  if (svg) liveMeasure(svg, e);
});
addEventListener("pointerup", () => { pan = null; });

// Floor plan of a custom room: drag a wall to move it in or out. The drawing is held still
// while dragging (the room's corner stays at 0,0, so the view follows that shift).
let wdrag = null, noClickUntil = 0;
$("#elev").addEventListener("pointerdown", (e) => {
  const g = e.target.closest('figure[data-key="plan"] .cwall');
  if (!g || e.button !== 0 || ui.measure || !isCustom(D())) return;
  const svg = g.closest("svg");
  const vb = svg.viewBox.baseVal;
  wdrag = { i: +g.dataset.edge, id: e.pointerId, p0: svgPoint(svg, e.clientX, e.clientY), base: JSON.stringify(D()),
    vb0: [vb.x, vb.y, vb.width, vb.height], hadVb: !!ui.vb.plan, last: 0, on: false };
  e.preventDefault();
});
addEventListener("pointermove", (e) => {
  if (!wdrag || e.pointerId !== wdrag.id) return;
  const svg = $('#elev figure[data-key="plan"] svg');
  if (!svg) return;
  const base = JSON.parse(wdrag.base);
  const f = shapeWalls(base)[wdrag.i];
  // hold the view still in the coordinates the drag started in
  ui.vb.plan = wdrag.cur || wdrag.vb0;
  svg.setAttribute("viewBox", ui.vb.plan.join(" "));
  const p = svgPoint(svg, e.clientX, e.clientY);
  const raw = (p.x - wdrag.p0.x - (wdrag.shift?.[0] || 0)) * f.n[0] + (p.y - wdrag.p0.y - (wdrag.shift?.[1] || 0)) * f.n[1];
  const delta = Math.round(raw * 2) / 2;
  if (!wdrag.on && Math.abs(raw) < 0.75) return;
  wdrag.on = true;
  if (delta === wdrag.last) return;
  if (!moveShapeWall(base, wdrag.i, delta)) return; // keep the last shape that worked
  wdrag.last = delta;
  // a corner the drag doesn't move, to see how far the outline was shifted
  const N = base.shape.pts.length, j = (wdrag.i + 2) % N;
  const old = JSON.parse(wdrag.base).shape.pts[j], now = base.shape.pts[j];
  wdrag.shift = [now[0] - old[0], now[1] - old[1]];
  wdrag.cur = [wdrag.vb0[0] + wdrag.shift[0], wdrag.vb0[1] + wdrag.shift[1], wdrag.vb0[2], wdrag.vb0[3]];
  ui.design = base;
  ui.vb.plan = wdrag.cur;
  render();
});
function endWallDrag(e) {
  if (!wdrag || e.pointerId !== wdrag.id) return;
  const { on, hadVb } = wdrag;
  wdrag = null;
  if (!hadVb) delete ui.vb.plan;
  if (!on) return render();
  noClickUntil = performance.now() + 350;
  commit({ room: true });
}
addEventListener("pointerup", endWallDrag);
addEventListener("pointercancel", endWallDrag);

// Floor plan: drag a module along its wall or onto another wall. The plan is redrawn on
// every move, so the pointer is tracked on the window and the svg looked up each time.
let pdrag = null;
$("#elev").addEventListener("pointerdown", (e) => {
  const g = e.target.closest('figure[data-key="plan"] .mod');
  if (!g || e.button !== 0 || ui.measure) return;
  pdrag = { from: { wall: g.dataset.wall, index: +g.dataset.index }, x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
});
addEventListener("pointermove", (e) => {
  if (!pdrag || e.pointerId !== pdrag.id) return;
  if (!pdrag.on) {
    if (Math.hypot(e.clientX - pdrag.x, e.clientY - pdrag.y) < 5) return;
    pdrag.on = true;
    $("#elev").classList.add("dragging");
    ui.selected = pdrag.from; ui.wall = pdrag.from.wall;
    render();
  }
  const svg = $('#elev figure[data-key="plan"] svg');
  if (!svg) return;
  const p = svgPoint(svg, e.clientX, e.clientY);
  pdrag.from = dragModule(pdrag.from, p.x, p.y);
});
function endPlanDrag(e) {
  if (!pdrag || e.pointerId !== pdrag.id) return;
  const moved = pdrag.on;
  pdrag = null;
  $("#elev").classList.remove("dragging");
  if (!moved) return;
  noClickUntil = performance.now() + 350;
  dragWarned = false;
  commit();
}
addEventListener("pointerup", endPlanDrag);
addEventListener("pointercancel", endPlanDrag);
function measureClick(e) {
  const svg = e.target.closest("figure[data-key] svg");
  if (!svg) return;
  const { key, v, pend } = liveMeasure(svg, e);
  if (!pend) { ui.m2pend = { key, a: v }; return; }
  if (Math.hypot(v[0] - pend[0], v[1] - pend[1]) > 0.05) (ui.m2[key] ||= []).push({ a: pend, b: v });
  ui.m2pend = null;
  render();
}

// ---- keyboard shortcuts ---------------------------------------------------------------------
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.measure) {
    if (ui.m2pend || scene.pending) { ui.m2pend = null; scene.cancelMeasure(); render(); }
    else setMeasure(false);
    return;
  }
  if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]") || document.body.classList.contains("gated")) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod && k === "z") { e.preventDefault(); return travel(e.shiftKey ? 1 : -1); }
  if (mod && k === "y") { e.preventDefault(); return travel(1); }
  if (mod || e.altKey) return;
  if (k === "m") return setMeasure(!ui.measure);
  const sel = ui.selected;
  if (!sel || !D().walls[sel.wall]?.modules[sel.index]) return;
  const act = { delete: "remove", backspace: "remove", arrowleft: "left", arrowright: "right", d: "dup" }[k];
  if (!act) return;
  e.preventDefault();
  closeMenu();
  modAction(sel, act);
  commit();
});

// ---- events ---------------------------------------------------------------------------
$("#panel").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) {
    const li = e.target.closest(".mods li");
    if (li && !e.target.closest("select")) { ui.selected = { wall: ui.wall, index: +li.dataset.index }; render(); }
    return;
  }
  const d = D();
  if (b.dataset.preset === "custom") {
    if (isCustom(d)) return;
    const hadCorners = isWalk(d) && (d.corners.left || d.corners.right) && d.cab.back;
    toCustom(d);
    ui.selected = null;
    if (!walls().includes(ui.wall)) ui.wall = walls()[0];
    if (hadCorners) toast("Corner modules aren’t available in custom rooms yet, so they were left out.");
    if (ui.view === "3d") toast("Now drag the walls on the floor plan, or type their lengths.");
    return commit({ room: true });
  }
  if (b.dataset.shape) {
    applyShape(d, b.dataset.shape);
    ui.selected = null;
    ui.wall = walls()[0];
    toast(`${ROOM_SHAPES[b.dataset.shape].name} room. Undo brings your cabinets back.`);
    return commit({ room: true });
  }
  if (b.dataset.split != null) {
    if (!splitShapeWall(d, +b.dataset.split)) return toast("That wall is too short for a jog.");
    ui.selected = null; // walls were renumbered
    if (!walls().includes(ui.wall)) ui.wall = walls()[0];
    return commit({ room: true });
  }
  if (b.dataset.preset) {
    applyPreset(d, b.dataset.preset);
    ui.selected = null;
    if (!walls().includes(ui.wall)) ui.wall = walls()[0];
    return commit({ room: true });
  }
  if (b.dataset.addopen) { addOpening(b.dataset.addopen); ui.roomOpen = true; return commit({ room: true }); }
  if (b.dataset.addob) { addObstacle(b.dataset.addob); ui.roomOpen = true; return commit({ room: true }); }
  if (b.dataset.delopen) { d.openings.splice(+b.dataset.delopen, 1); return commit({ room: true }); }
  if (b.dataset.delob) { d.obstacles.splice(+b.dataset.delob, 1); return commit({ room: true }); }
  if (b.dataset.act === "interior") { const li = b.closest(".mods li"); return openInterior({ wall: ui.wall, index: +li.dataset.index }); }
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
    const custom = ui.style === "custom";
    const m = { style: custom ? "5s" : ui.style, w: ui.width, depth: ui.depth, hinge: "L" };
    if (custom) m.custom = customFromLook({ shelves: [52, 70], rods: [43] });
    d.walls[ui.wall].modules.push(m);
    const at = { wall: ui.wall, index: d.walls[ui.wall].modules.length - 1 };
    ui.selected = at;
    if (commit() && custom) openInterior(at);
    return;
  }
  if (b.id === "fillBtn") {
    const g = wallGeometry(d)[ui.wall];
    for (const w of fillWidths(g.free, allowedWidths(ui.style, ui.depth))) d.walls[ui.wall].modules.push({ style: ui.style, w, depth: ui.depth, hinge: "L" });
    addFillers(d, ui.wall);
    return commit();
  }
  if (b.id === "fillerBtn") {
    const plan = addFillers(d, ui.wall);
    if (plan?.length) toast(`Filler added. Artisan cuts it to fit on site.`);
    return commit();
  }
  const li = b.closest(".mods li");
  if (li && b.dataset.act) { modAction({ wall: ui.wall, index: +li.dataset.index }, b.dataset.act); return commit(); }
});
$("#panel").addEventListener("toggle", (e) => { if (e.target.matches?.("details.roomx")) ui.roomOpen = e.target.open; }, true);
$("#panel").addEventListener("contextmenu", (e) => {
  const li = e.target.closest(".mods li");
  if (!li) return;
  e.preventDefault();
  openMenu({ wall: ui.wall, index: +li.dataset.index }, e.clientX, e.clientY);
});

// ---- room features ------------------------------------------------------------------------
// New windows and doors go where they don't clash with cabinets, if there is such a place.
function addOpening(kind) {
  const d = D();
  const def = OPENING_DEFAULTS[kind];
  const order = isCustom(d)
    ? [...d.shape.ids].sort((a, b) => (d.cab[a] ? 1 : 0) - (d.cab[b] ? 1 : 0))
    : isWalk(d)
    ? (kind === "door" ? ["front", "left", "right", "back"] : ["left", "right", "back", "front"])
    : ["back"];
  const base = collisions(d).length;
  let pick = null;
  for (const wall of order) {
    const L = wallLength(d, wall);
    if (L < def.w) continue;
    for (const frac of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      const o = { wall, kind, ...def, at: +Math.max(0, Math.min(L - def.w, L * frac - def.w / 2)).toFixed(2) };
      if (d.openings.some((p) => p.wall === wall && p.at < o.at + o.w + 4 && o.at < p.at + p.w + 4)) continue;
      d.openings.push(o);
      const ok = collisions(d).length === base;
      d.openings.pop();
      if (ok) { pick = o; break; }
    }
    if (pick) break;
  }
  const wall = order[0];
  d.openings.push(pick || { wall, kind, ...def, at: +Math.max(0, (wallLength(d, wall) - def.w) / 2).toFixed(2) });
}
function addObstacle(kind) {
  const d = D();
  const def = OBSTACLE_DEFAULTS[kind];
  const W = isCustom(d) ? shapeBox(d).W : d.walls.back.width;
  if (kind === "column") d.obstacles.push({ kind, ...def, x: +(W - def.w).toFixed(2), z: 0 });
  else d.obstacles.push({ kind, ...def, w: Math.min(W, def.w), x: 0, z: 0 });
}

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
  if (act === "dup") { mods.splice(i + 1, 0, JSON.parse(JSON.stringify(m))); to.index = i + 1; }
  if (act === "fwidth") m.w = clampFiller(value);
  if (act === "addfiller") {
    const free = wallGeometry(d)[at.wall].free;
    const w = clampFiller(free >= FILLER_MIN ? Math.min(free, 3) : 3);
    const k = value === "L" ? i : i + 1;
    mods.splice(k, 0, { style: "filler", w, depth: m.depth, hinge: "L" });
    to.index = k;
    if (free < w) toast(`The wall has only ${Math.max(0, free)}" free. Narrow the filler or a module.`);
  }
  if (act === "towall") { mods.splice(i, 1); d.walls[value].modules.push(m); to = { wall: value, index: d.walls[value].modules.length - 1 }; }
  if (act === "style") {
    delete m.custom;
    m.style = value;
    const s = styleById[value];
    if (!s.widths.includes(m.w)) m.w = s.widths.reduce((a, w) => (Math.abs(w - m.w) < Math.abs(a - m.w) ? w : a));
  }
  if (act === "width") {
    m.w = +value;
    if (m.custom) {
      if (m.custom.shoe && !CUSTOM_SHOE_WIDTHS.includes(m.w)) { m.custom.shoe = false; toast(`Shoe racks don’t come ${m.w}" wide, so it was taken out.`); }
    } else if (!styleById[m.style].widths.includes(m.w)) m.style = "5s";
  }
  if (act === "depth") {
    const old = setModuleDepth(m, value);
    if (old) toast(`${old} isn’t made ${DEPTHS[value].label}, so it became ${styleById[m.style].name.toLowerCase()}.`);
  }
  ui.selected = to; ui.wall = to.wall;
  return to;
}

// ---- interior editor ------------------------------------------------------------------------
// Shelves, rods, drawers, shoe rack and doors for one module, all from catalog parts.
let iv = null; // { at, w, depth, c }
function openInterior(at) {
  const m = D().walls[at.wall]?.modules[at.index];
  if (!m || styleById[m.style].filler) return;
  closeMenu();
  iv = { at, w: m.w, depth: m.depth, c: normalizeCustom(m.custom || customFromLook(moduleInfo(m).look)) };
  renderInterior();
  $("#interiorDlg").showModal();
}
const lockedShelf = (y) => iv.c.drawers && y === DRAWER_TOP;
function ivGraphic() {
  const { w, c } = iv;
  const yy = (v) => HEIGHT - v;
  const items = [
    ...c.shelves.map((y, i) => ({ k: "shelves", i, y, locked: lockedShelf(y) })),
    ...c.rods.map((y, i) => ({ k: "rods", i, y })),
  ];
  const doors = c.doors ? `<rect x="0.4" y="0.4" width="${w - 0.8}" height="${HEIGHT - (c.drawers ? DRAWER_TOP : TOE) - 0.4}" class="ivdoor ${c.doors}"/>` : "";
  return drawModule(0, w, { ...customLook(c), doors: null }, "", false) + doors + items.map((it) =>
    `<g class="ivh ${it.k}${it.locked ? " locked" : ""}" data-k="${it.k}" data-i="${it.i}">
      <rect x="-1" y="${yy(it.y) - 1.8}" width="${w + 2}" height="3.6" class="hit"/>
      <text x="${w + 2.5}" y="${yy(it.y) + 1.1}" class="ivlab">${+it.y.toFixed(2)}"</text></g>`).join("");
}
function renderInterior() {
  const { w, depth, c } = iv;
  const probs = customProblems(w, depth, c);
  const info = moduleInfo({ style: "5s", w, depth, custom: c });
  const parts = info.parts;
  const price = info.price;
  const bottom = c.drawers ? "drawers" : c.shoe ? "shoe" : "none";
  const list = (k, label) => c[k].map((y, i) => lockedShelf(y)
    ? `<div class="iv-item locked"><span>Shelf over the drawers</span><span>${y}"</span></div>`
    : `<div class="iv-item"><span>${label}</span>${num(`step="${SNAP}" data-iv="${k}" data-i="${i}"`, y)}<button class="icon-btn del" data-iv="del" data-k="${k}" data-i="${i}" title="Remove">×</button></div>`).join("");
  $("#ivBody").innerHTML = `
    <div class="iv-draw"><svg id="ivSvg" viewBox="-4 -5 ${w + 16} ${HEIGHT + 9}"><g id="ivG">${ivGraphic()}</g></svg>
      <p class="tiny">Drag a shelf or rod to move it. Heights are from the floor.</p></div>
    <div class="iv-ctl">
      <div class="ctx-head"><b>${info.code}</b><span>${info.custom ? "" : `Same as the catalog ${esc(info.name.toLowerCase())} · `}${w}" wide · ${DEPTHS[depth].label} · ${money(price)}</span></div>
      <label class="ctx-row"><span>Start from a catalog style</span><select data-iv="from"><option value="">Choose…</option>
        ${STYLES.filter((st) => st.depths.includes(depth)).map((st) => `<option value="${st.id}">${esc(st.name)}</option>`).join("")}</select></label>
      <div class="ctx-row"><span>Doors</span><div class="segs">${[["", "None"], ["solid", "Solid oak"], ["glass", "Glass"]].map(([v, l]) =>
        `<button class="seg ${(c.doors || "") === v ? "on" : ""}" data-iv="doors" data-v="${v}">${l}</button>`).join("")}</div></div>
      <div class="ctx-row"><span>Bottom</span><div class="segs">${[["none", "Open"], ["drawers", "3 drawers"], ["shoe", "Shoe rack"]].map(([v, l]) =>
        `<button class="seg ${bottom === v ? "on" : ""}" data-iv="bottom" data-v="${v}">${l}</button>`).join("")}</div></div>
      <div class="iv-list"><div class="iv-lh"><b>Shelves</b><button class="btn ghost sm" data-iv="add" data-k="shelves">+ Shelf</button></div>
        ${list("shelves", "Shelf") || `<p class="tiny">No shelves.</p>`}</div>
      <div class="iv-list"><div class="iv-lh"><b>Hanging rods</b><button class="btn ghost sm" data-iv="add" data-k="rods">+ Rod</button></div>
        ${list("rods", "Rod") || `<p class="tiny">No rods.</p>`}</div>
      ${probs.length ? probs.map((p) => `<p class="warn">${esc(p)}</p>`).join("")
        : `<p class="ok">Made from ${parts.reduce((a, [, q]) => a + q, 0)} Artisan catalog parts.</p>`}
    </div>`;
  $("#ivApply").disabled = probs.length > 0;
}
// Put a new shelf or rod in the biggest open space.
function ivAdd(k) {
  const c = iv.c;
  const lo = c.drawers ? DRAWER_TOP : c.shoe ? SHOE_TOP : TOE + T;
  const marks = [lo, ...c.shelves, ...c.rods, HEIGHT - T].filter((y) => y >= lo).sort((a, b) => a - b);
  let best = [lo, HEIGHT - T];
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > best[1] - best[0]) best = [marks[i - 1], marks[i]];
  const snap = (v) => Math.round(v / SNAP) * SNAP;
  const y = k === "rods" && best[1] - 3 - best[0] >= 24 ? snap(best[1] - 3) : snap((best[0] + best[1]) / 2);
  c[k].push(y);
  iv.c = normalizeCustom(c);
}
$("#ivBody").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-iv]");
  if (!b) return;
  const c = iv.c, k = b.dataset.iv;
  if (k === "doors") c.doors = b.dataset.v || null;
  if (k === "bottom") {
    c.drawers = b.dataset.v === "drawers";
    c.shoe = b.dataset.v === "shoe";
    if (c.shoe) { c.shelves = c.shelves.filter((y) => y >= SHOE_TOP); c.rods = c.rods.filter((y) => y >= SHOE_TOP + 24); }
    if (c.drawers) { c.shelves = c.shelves.filter((y) => y > DRAWER_TOP + 1); c.rods = c.rods.filter((y) => y > DRAWER_TOP + 24); }
  }
  if (k === "add") ivAdd(b.dataset.k);
  if (k === "del") c[b.dataset.k].splice(+b.dataset.i, 1);
  iv.c = normalizeCustom(c);
  renderInterior();
});
$("#ivBody").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.iv === "from" && t.value) iv.c = customFromLook(styleById[t.value].look());
  else if (t.dataset.iv === "shelves" || t.dataset.iv === "rods") iv.c[t.dataset.iv][+t.dataset.i] = Math.round((+t.value || 0) / SNAP) * SNAP;
  else return;
  iv.c = normalizeCustom(iv.c);
  renderInterior();
});
let ivDrag = null;
$("#ivBody").addEventListener("pointerdown", (e) => {
  const h = e.target.closest(".ivh");
  if (!h || h.classList.contains("locked")) return;
  const svg = $("#ivSvg");
  ivDrag = { k: h.dataset.k, i: +h.dataset.i, svg };
  svg.setPointerCapture(e.pointerId);
  e.preventDefault();
});
$("#ivBody").addEventListener("pointermove", (e) => {
  if (!ivDrag) return;
  const { svg, k, i } = ivDrag;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const y = Math.max(TOE + T + 1, Math.min(HEIGHT - T - 1, Math.round((HEIGHT - p.y) / SNAP) * SNAP));
  if (iv.c[k][i] === y) return;
  iv.c[k][i] = y;
  $("#ivG").innerHTML = ivGraphic();
});
const ivDrop = () => { if (!ivDrag) return; ivDrag = null; iv.c = normalizeCustom(iv.c); renderInterior(); };
$("#ivBody").addEventListener("pointerup", ivDrop);
$("#ivBody").addEventListener("pointercancel", ivDrop);
$("#ivApply").addEventListener("click", () => {
  const m = D().walls[iv.at.wall]?.modules[iv.at.index];
  if (!m || customProblems(iv.w, iv.depth, iv.c).length) return;
  m.custom = normalizeCustom(iv.c);
  $("#interiorDlg").close();
  ui.selected = iv.at; ui.wall = iv.at.wall;
  commit();
  const info = moduleInfo(m);
  toast(info.custom ? `${info.name}. The parts list is updated.` : `That matches the catalog ${info.name.toLowerCase()}, ${info.code}.`);
});

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
  const otherWallBtns = walls().filter((k) => k !== at.wall).map((k) => `<button data-cact="towall" data-v="${k}">To ${WALL_NAMES[k].toLowerCase()}</button>`).join("");
  if (st.filler) {
    $("#ctx").innerHTML = `
      <div class="ctx-head"><b>${info.code}</b><span>Filler strip · ${esc(WALL_NAMES[at.wall])} · ${money(info.price)}</span></div>
      <label class="ctx-row"><span>Width (${FILLER_MIN}–${FILLER_MAX}")</span><input type="number" min="${FILLER_MIN}" max="${FILLER_MAX}" step="0.25" value="${m.w}" data-cact="fwidth"></label>
      <p class="ctx-note">Fillers close the gap between the modules and a wall. Artisan cuts them to fit on site.</p>
      <div class="ctx-acts">
        <button data-cact="left" ${at.index === 0 ? "disabled" : ""}>‹ Move left</button>
        <button data-cact="right" ${at.index === n - 1 ? "disabled" : ""}>Move right ›</button>
        ${otherWallBtns}
        <button data-cact="remove" class="danger">Remove</button>
      </div>`;
    return;
  }
  const styleOpts = (m.custom ? `<option value="" selected>Custom interior</option>` : "") + GROUPS.map((g) => {
    const list = STYLES.filter((s) => s.group === g && s.depths.includes(m.depth));
    return list.length ? `<optgroup label="${g}">${list.map((s) => `<option value="${s.id}" ${!m.custom && s.id === m.style ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  const widths = WIDTHS.map((w) => `<button class="chip ${w === m.w ? "on" : ""}" data-cact="width" data-v="${w}" ${m.custom || st.widths.includes(w) ? "" : "disabled"}>${w}"</button>`).join("");
  const hasDoors = m.custom ? m.custom.doors : st.hinged;
  const depths = Object.entries(DEPTHS).map(([k, v]) => `<button class="seg ${m.depth === k ? "on" : ""}" data-cact="depth" data-v="${k}">${v.label}</button>`).join("");
  const otherWalls = walls().filter((k) => k !== at.wall);
  $("#ctx").innerHTML = `
    <div class="ctx-head"><b>${info.code}</b><span>${m.custom ? esc(info.name) + " · " : ""}${esc(WALL_NAMES[at.wall])} · ${money(info.price)}</span></div>
    <label class="ctx-row"><span>Style</span><select data-cact="style">${styleOpts}</select></label>
    <button class="btn ghost full sm" data-cact="interior">Customize interior…</button>
    <div class="ctx-row"><span>Width</span><div class="chips">${widths}</div></div>
    <div class="ctx-row"><span>Depth</span><div class="segs">${depths}</div></div>
    ${hasDoors && m.w <= 24 ? `<div class="ctx-row"><span>Door hinge</span><div class="segs">
      <button class="seg ${m.hinge !== "R" ? "on" : ""}" data-cact="hinge" data-v="L">Left</button>
      <button class="seg ${m.hinge === "R" ? "on" : ""}" data-cact="hinge" data-v="R">Right</button></div></div>` : ""}
    <div class="ctx-acts">
      <button data-cact="left" ${at.index === 0 ? "disabled" : ""}>‹ Move left</button>
      <button data-cact="right" ${at.index === n - 1 ? "disabled" : ""}>Move right ›</button>
      ${otherWalls.map((k) => `<button data-cact="towall" data-v="${k}">To ${WALL_NAMES[k].toLowerCase()}</button>`).join("")}
      <button data-cact="dup">Duplicate</button>
      <button data-cact="addfiller" data-v="L">+ Filler left</button>
      <button data-cact="addfiller" data-v="R">+ Filler right</button>
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
  if (act === "interior") return openInterior({ ...menuAt });
  if (act === "style" && !v) return;
  const to = modAction(menuAt, act, v);
  if (!commit()) return renderMenu();
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
  if (t.dataset.cab) {
    const k = t.dataset.cab;
    if (!t.checked && walls().length === 1) { t.checked = true; return toast("A walk-in needs cabinets on at least one wall."); }
    d.cab[k] = t.checked;
    if (!walls().includes(ui.wall)) ui.wall = walls()[0];
    ui.selected = null;
    return commit({ room: true });
  }
  if (t.dataset.wlen !== undefined) {
    const i = +t.dataset.wlen;
    const want = Math.max(6, Math.min(600, +t.value || 0));
    if (!setShapeWallLength(d, i, want)) { toast("That length doesn’t fit with the other walls. Change the wall after it first."); return render(); }
    return commit({ room: true });
  }
  if (t.dataset.roomw !== undefined) { d.walls.back.width = Math.max(24, Math.min(400, +t.value || 96)); return commit({ room: true }); }
  if (t.dataset.roomd !== undefined) { d.walls.left.width = d.walls.right.width = Math.max(36, Math.min(400, +t.value || 72)); return commit({ room: true }); }
  if (t.dataset.ceiling !== undefined) { d.ceiling = Math.max(CEILING.min, Math.min(CEILING.max, +t.value || CEILING.def)); return commit({ room: true }); }
  if (t.dataset.slope) {
    const k = t.dataset.slope;
    if (k === "wall") d.slope = t.value ? { wall: t.value, knee: d.slope?.knee ?? 48, run: d.slope?.run ?? 36 } : null;
    else if (d.slope) d.slope[k] = Math.max(k === "knee" ? 24 : 6, Math.min(k === "knee" ? d.ceiling : 400, +t.value || 0));
    return commit({ room: true });
  }
  const orow = t.closest("[data-oi]");
  if (orow && t.dataset.o) {
    const o = d.openings[+orow.dataset.oi];
    const k = t.dataset.o;
    if (k === "wall" || k === "swing") o[k] = t.value;
    else o[k] = Math.max(0, +t.value || 0);
    o.w = Math.max(12, o.w); o.h = Math.max(12, o.h);
    o.at = Math.min(o.at, Math.max(0, wallLength(d, o.wall) - o.w));
    return commit({ room: true });
  }
  const brow = t.closest("[data-bi]");
  if (brow && t.dataset.b) {
    const b = d.obstacles[+brow.dataset.bi];
    b[t.dataset.b] = Math.max(t.dataset.b === "w" || t.dataset.b === "d" ? 1 : 0, +t.value || 0);
    return commit({ room: true });
  }
  if (t.dataset.wallthick !== undefined) {
    d.wallT = Math.max(WALL_T.min, Math.min(WALL_T.max, +t.value || WALL_T.def));
    return commit({ room: true });
  }
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
      modAction({ wall: ui.wall, index: +li.dataset.index }, "width", t.value);
    }
    if (t.dataset.act === "style" && t.value) { m.style = t.value; delete m.custom; }
    if (t.dataset.act === "fwidth") m.w = clampFiller(t.value);
    return commit();
  }
});

document.querySelector(".stage-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (!b) return;
  ui.view = b.dataset.view;
  ui.m2pend = null;
  scene.setMeasuring(ui.measure && ui.view === "3d");
  $("#view3d").hidden = ui.view !== "3d";
  $("#elev").hidden = ui.view === "3d";
  render();
});
$("#elev").addEventListener("contextmenu", (e) => {
  if (ui.measure) { e.preventDefault(); ui.m2pend = null; return render(); }
  const g = e.target.closest(".mod");
  if (!g) return;
  e.preventDefault();
  openMenu({ wall: g.dataset.wall, index: +g.dataset.index }, e.clientX, e.clientY);
});
$("#elev").addEventListener("click", (e) => {
  if (performance.now() < noClickUntil) return; // the end of a drag, not a click
  if (ui.measure) return measureClick(e);
  const g = e.target.closest(".mod");
  if (!g) return;
  ui.selected = { wall: g.dataset.wall, index: +g.dataset.index };
  ui.wall = g.dataset.wall;
  render();
});
$("#doorsBtn").addEventListener("click", () => { ui.doorsOpen = !ui.doorsOpen; render(); });
$("#lookBtn").addEventListener("click", () => {
  ui.look = !ui.look;
  if (ui.look && ui.measure) { ui.measure = false; scene.setMeasuring(false); }
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
    `Layout: ${layoutName(d)}`,
    `Room: ${roomText(d)}, ceiling ${d.ceiling}"${d.slope ? `, sloping down to ${d.slope.knee}" at the ${WALL_NAMES[d.slope.wall].toLowerCase()} over ${d.slope.run}"` : ""}`,
    ...(isCustom(d) ? shapeWalls(d).map((w) => `${WALL_NAMES[w.k]}: ${+w.len.toFixed(2)}"`) : []),
    ...d.openings.filter((o) => isWalk(d) || isCustom(d) || o.wall === "back").map((o) => `${o.kind === "window" ? "Window" : "Door"} on ${wallRef(o.wall)}: ${o.w}" x ${o.h}", ${o.at}" from ${isCustom(d) ? "its start" : `the ${o.wall === "left" || o.wall === "right" ? "back" : "left"}`}${o.kind === "window" ? `, sill ${o.sill}"` : ""}`),
    ...d.obstacles.map((b) => `${b.kind === "column" ? "Column" : `Soffit (bottom ${b.bottom}")`}: ${b.w}" x ${b.d}" at ${b.x}" from the left, ${b.z}" from the back`),
    ...activeWalls(d).map((k) => `${WALL_NAMES[k]} cabinets: ${geo[k].space}" of wall (${geo[k].free}" left open)`),
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

// Pictures of the closet from several angles, for the PDF.
function autoViews() {
  scene.update(D(), { doorsOpen: ui.doorsOpen, selected: null, sketch: ui.sketch });
  const names = isWalk(D()) || isCustom(D()) ? ["overview", "top", "cornerL", "cornerR"] : ["overview", "front", "top", "cornerL"];
  const imgs = names.map((n) => ({ src: scene.renderView(n), name: n === "overview" ? "3D view" : VIEWS[n].name }));
  scene.update(D(), { doorsOpen: ui.doorsOpen, selected: ui.selected, sketch: ui.sketch });
  return imgs;
}

function printSummary(form) {
  const d = D();
  const date = new Date().toLocaleDateString();
  const views = [...ui.shots.map((src, i) => ({ src, name: `Your view ${i + 1}` })), ...autoViews()].slice(0, 8);
  const sheets = [];
  sheets.push({ title: "3D views", body: `
    ${form.name ? `<p>${esc(form.name)} · ${esc(form.email || "")} · ${esc(form.phone || "")}</p>` : ""}
    ${form.install ? `<p><b>Installation:</b> ${esc(form.install)}</p>` : ""}
    <div class="print-shots multi">${views.map((v) => `<figure><img src="${v.src}" class="print-shot"><figcaption>${esc(v.name)}</figcaption></figure>`).join("")}</div>` });
  sheets.push({ title: "Floor plan", body: withMeasures(planHtml(d, null, { grid: ui.grid, clear: true }), "plan") });
  for (const k of activeWalls(d)) sheets.push({ title: `${WALL_NAMES[k]} elevation`, body: withMeasures(wallSvg(d, k, null, { heights: "all" }), `elev-${k}`) });
  sheets.push({ title: "Modules and parts", body: `
  <table class="parts"><thead><tr><th>Closet code</th><th>Where</th><th>Description</th><th>MSRP</th></tr></thead><tbody>
  ${lineItems(d).map((it) => `<tr><td>${it.code}</td><td>${esc(it.wall)}</td><td>${esc(it.name)}</td><td>${money(it.price)}</td></tr>`).join("")}
  <tr class="tot"><td colspan="3">Estimated MSRP${PRICES_ARE_SAMPLE ? " (sample prices)" : ""}</td><td>${money(totalPrice(d))}</td></tr></tbody></table>
  <h3>Parts to order</h3><table class="parts"><tbody>${partsList(d).map((p) => `<tr><td>${esc(p.part)}</td><td>× ${p.qty}</td></tr>`).join("")}</tbody></table>
  <p class="fine">Designs are for planning. Artisan confirms all dimensions, parts and prices before ordering.</p>` });
  const room = `${isCustom(d) ? roomText(d) : `${layoutName(d)} · ${roomText(d)}`} · ceiling ${fmtIn(d.ceiling)}`;
  document.querySelector("#printFrame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "printFrame";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.srcdoc = `<!doctype html><html><head><title>Artisan closet design${form.name ? " · " + esc(form.name) : ""}</title>
  <link rel="stylesheet" href="${new URL("css/app.css", location.href)}"></head><body class="print">
  ${sheets.map((sh, i) => `<section class="sheet">
    <header class="print-head"><div class="brand">artisan.</div><div><b>${esc(sh.title)}</b><br>${esc(room)}</div></header>
    <div class="sheet-body">${sh.body}</div>
    <footer class="tblock"><span><b>Artisan Cabinets</b> · Closet design${form.name ? ` for ${esc(form.name)}` : ""}</span><span>${date}</span><span>Inches · not to scale</span><span>Sheet ${i + 1} of ${sheets.length}</span></footer>
  </section>`).join("")}
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

lastGood = snap();
remember();
render();

// Sign-in screen (demo), on top of the designer.
initAuth();

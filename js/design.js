// The design: room, walls, modules, corners. Pure data and math, no DOM.
import { DEPTHS, styleById, cornerByCode, cornerParts, cornerCode, CORNER_INTERIORS, FILLER_MAX, FILLER_MIN, clampFiller } from "./catalog.js";
import { priceOf } from "./pricing.js";

export const LAYOUTS = {
  reach: { name: "Reach-in", walls: ["back"] },
  L: { name: "Walk-in, L-shape", walls: ["left", "back"] },
  U: { name: "Walk-in, U-shape", walls: ["left", "back", "right"] },
};
export const WALL_NAMES = { left: "Left wall", back: "Back wall", right: "Right wall" };

// Room look: colors only change the pictures, not the order.
export const ROOM_WALLS = {
  white: { name: "Warm white", color: "#f3efe8" },
  greige: { name: "Greige", color: "#d9d0c2" },
  sage: { name: "Sage", color: "#c3cbb8" },
  charcoal: { name: "Charcoal", color: "#4b4b4d" },
};
export const ROOM_FLOORS = {
  oak: { name: "Light oak", color: "#b9a68c", grain: true },
  walnut: { name: "Walnut", color: "#6f5442", grain: true },
  grey: { name: "Grey wash", color: "#a19d96", grain: true },
  carpet: { name: "Carpet", color: "#cdc4b6", grain: false },
};
const defaultRoom = () => ({ wall: "white", floor: "oak", decor: true });

export function defaultDesign() {
  return {
    layout: "reach",
    walls: {
      back: { width: 96, modules: [
        { style: "3gdr", w: 24, depth: "S", hinge: "L" },
        { style: "2hr", w: 36, depth: "S", hinge: "L" },
        { style: "5s", w: 36, depth: "S", hinge: "L" },
      ] },
      left: { width: 72, modules: [] },
      right: { width: 72, modules: [] },
    },
    corners: { left: null, right: null }, // { code, interior }
    room: defaultRoom(),
  };
}

const depthOf = (m) => DEPTHS[m.depth].inches;
const maxDepth = (mods) => mods.reduce((a, m) => Math.max(a, depthOf(m)), 0);

export function activeWalls(design) {
  return LAYOUTS[design.layout].walls;
}

// Where each wall's run starts and how much room it has.
// Corners take their size from both walls they touch. Without a corner,
// the back wall runs into the corner and the side run starts in front of it.
export function wallGeometry(design) {
  const walls = activeWalls(design);
  const back = design.walls.back;
  const geo = {};
  const cornerSize = (side) => (walls.includes(side) && design.corners[side] ? cornerByCode[design.corners[side].code].size : 0);
  const lc = cornerSize("left"), rc = cornerSize("right");
  geo.back = { start: lc, end: back.width - rc };
  for (const side of ["left", "right"]) {
    if (!walls.includes(side)) continue;
    const c = side === "left" ? lc : rc;
    const start = c || maxDepth(back.modules);
    geo[side] = { start, end: design.walls[side].width };
  }
  for (const k of Object.keys(geo)) {
    const g = geo[k];
    g.space = g.end - g.start;
    g.used = design.walls[k].modules.reduce((a, m) => a + m.w, 0);
    g.free = +(g.space - g.used).toFixed(2);
  }
  return geo;
}

// --- depth -------------------------------------------------------------------
// Styles that only come in one depth swap to their nearest match.
const DEPTH_SWAP = { door2hr: "door", glasshr: "glass", "3gdrhr": "3gdr", shoe: "5s" };

// Change one module's depth. Returns the old style name if the style had to change.
export function setModuleDepth(m, depth) {
  if (m.depth === depth) return null;
  let s = styleById[m.style];
  let swapped = null;
  if (!s.depths.includes(depth)) {
    const alt = styleById[DEPTH_SWAP[m.style]] || styleById["5s"];
    swapped = s.name;
    m.style = alt.id;
    s = alt;
  }
  m.depth = depth;
  if (!s.filler && !s.widths.includes(m.w)) m.w = s.widths.reduce((a, w) => (Math.abs(w - m.w) < Math.abs(a - m.w) ? w : a));
  return swapped;
}

// "S", "D" or "mixed" for the modules on a wall.
export function wallDepth(design, k) {
  const wall = design.walls[k];
  const set = new Set(wall.modules.map((m) => m.depth));
  if (set.size > 1) return "mixed";
  return [...set][0] || wall.depth || "S";
}

export function setWallDepth(design, k, depth) {
  const wall = design.walls[k];
  wall.depth = depth;
  return wall.modules.map((m) => setModuleDepth(m, depth)).filter(Boolean);
}

// Where a dragged module would land, from a point on the floor plan (x across, z out from the back wall).
export function dropTarget(design, from, x, z) {
  const walls = activeWalls(design);
  const W = design.walls.back.width;
  const dist = { back: z, left: x, right: W - x };
  const wall = walls.reduce((a, k) => (dist[k] < dist[a] ? k : a), walls[0]);
  const mods = design.walls[wall].modules.filter((_, i) => !(wall === from.wall && i === from.index));
  const t = wall === "back" ? x : z;
  let s = wallGeometry(design)[wall].start, index = 0;
  for (const m of mods) { if (t > s + m.w / 2) index++; s += m.w; }
  return { wall, index };
}

// Fillers that close the gap left on a wall: one at the end, or one at each end if the gap is over 6".
// Returns the fillers' widths, or null if the gap is too big for fillers.
export function fillerPlan(free) {
  const f = Math.floor(free * 4) / 4;
  if (f < FILLER_MIN) return [];
  if (f <= FILLER_MAX) return [f];
  if (f <= 2 * FILLER_MAX) { const a = Math.floor((f / 2) * 4) / 4; return [a, +(f - a).toFixed(2)]; }
  return null;
}
export function addFillers(design, k) {
  const wall = design.walls[k];
  const plan = fillerPlan(wallGeometry(design)[k].free);
  if (!plan || !plan.length) return plan;
  const depth = wallDepth(design, k) === "D" ? "D" : "S";
  const make = (w) => ({ style: "filler", w: clampFiller(w), depth, hinge: "L" });
  if (plan.length === 2) wall.modules.unshift(make(plan[1]));
  wall.modules.push(make(plan[0]));
  return plan;
}

export function moveModule(design, from, to) {
  const [m] = design.walls[from.wall].modules.splice(from.index, 1);
  design.walls[to.wall].modules.splice(to.index, 0, m);
}

export function moduleInfo(m) {
  const s = styleById[m.style];
  const parts = s.parts(m.w, m.depth);
  return { code: s.code(m.w, m.depth), name: s.name, parts, look: s.look(), price: sumParts(parts) };
}

export function cornerInfo(corner) {
  const parts = cornerParts(corner.code, corner.interior);
  const interior = CORNER_INTERIORS.find((i) => i.id === corner.interior);
  return { code: cornerCode(corner.code, corner.interior), name: interior.name, parts, look: interior.look, price: sumParts(parts) };
}

function sumParts(parts) {
  return parts.reduce((a, [p, q]) => a + priceOf(p) * q, 0);
}

// Every line of the order, wall by wall.
export function lineItems(design) {
  const items = [];
  const walls = activeWalls(design);
  for (const side of ["left", "right"]) {
    if (walls.includes(side) && design.corners[side]) {
      items.push({ wall: `${WALL_NAMES[side]} corner`, ...cornerInfo(design.corners[side]) });
    }
  }
  for (const k of walls) {
    design.walls[k].modules.forEach((m, i) => items.push({ wall: WALL_NAMES[k], index: i, module: m, ...moduleInfo(m) }));
  }
  return items;
}

export function partsList(design) {
  const map = new Map();
  for (const it of lineItems(design)) {
    for (const [p, q] of it.parts) map.set(p, (map.get(p) || 0) + q);
  }
  return [...map.entries()]
    .map(([part, qty]) => ({ part, qty, unit: priceOf(part), total: priceOf(part) * qty }))
    .sort((a, b) => a.part.localeCompare(b.part));
}

export const totalPrice = (design) => lineItems(design).reduce((a, it) => a + it.price, 0);

export function problems(design) {
  const out = [];
  const geo = wallGeometry(design);
  for (const [k, g] of Object.entries(geo)) {
    if (g.free < 0) out.push(`${WALL_NAMES[k]} is over by ${-g.free}". Remove or narrow a module.`);
  }
  return out;
}

// --- share links ---------------------------------------------------------------
export function encode(design) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(design))));
}
export function decode(text) {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(text))));
    if (d && d.walls && d.layout in LAYOUTS) {
      const r = d.room || {};
      d.room = { ...defaultRoom(), ...r };
      if (!(d.room.wall in ROOM_WALLS)) d.room.wall = "white";
      if (!(d.room.floor in ROOM_FLOORS)) d.room.floor = "oak";
      return d;
    }
  } catch { /* ignore */ }
  return null;
}

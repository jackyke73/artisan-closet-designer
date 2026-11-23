// The design: room, walls, modules, corners. Pure data and math, no DOM.
import { DEPTHS, HEIGHT, styleById, cornerByCode, cornerParts, cornerCode, CORNER_INTERIORS, FILLER_MAX, FILLER_MIN, clampFiller, customLook, customParts, customCode, customName, normalizeCustom, customFromLook, STYLES } from "./catalog.js";
import { priceOf } from "./pricing.js";

// A reach-in has cabinets on its back wall only. A walk-in can have cabinets
// on any mix of its left, back and right walls; the front wall has the entry.
export const SIDES = ["left", "back", "right"];
export const PRESETS = {
  reach: { name: "Reach-in", type: "reach", cab: ["back"] },
  Lleft: { name: "Walk-in, L left", type: "walk", cab: ["left", "back"] },
  Lright: { name: "Walk-in, L right", type: "walk", cab: ["back", "right"] },
  U: { name: "Walk-in, U-shape", type: "walk", cab: ["left", "back", "right"] },
  galley: { name: "Walk-in, two sides", type: "walk", cab: ["left", "right"] },
  single: { name: "Walk-in, back only", type: "walk", cab: ["back"] },
};
export const WALL_NAMES = { left: "Left wall", back: "Back wall", right: "Right wall", front: "Front wall" };
export const REACH_DEPTH = 30;   // depth of a reach-in closet, inches
export const CEILING = { min: 72, max: 144, def: 96 };
export const OPENING_DEFAULTS = {
  window: { w: 36, h: 48, sill: 36 },
  door: { w: 32, h: 80, sill: 0, swing: "in" },
};
export const OBSTACLE_DEFAULTS = {
  column: { w: 12, d: 12 },
  soffit: { w: 48, d: 24, bottom: 84 },
};

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
export const WALL_T = { min: 2, max: 12, def: 4.5 }; // room wall thickness, inches (2x4 studs + drywall)

export function defaultDesign() {
  return {
    type: "reach",
    cab: { left: false, back: true, right: false },
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
    wallT: WALL_T.def,
    ceiling: CEILING.def,
    slope: null,       // { wall: "left" | "back" | "right", knee, run }: an attic ceiling coming down to that wall
    openings: [],      // { wall, kind: "window" | "door", at, w, h, sill, swing }
    obstacles: [],     // { kind: "column" | "soffit", x, z, w, d, bottom }
  };
}

export function layoutName(design) {
  const cab = activeWalls(design).join();
  const p = Object.values(PRESETS).find((v) => v.type === design.type && v.cab.join() === cab);
  return p ? p.name : "Walk-in";
}
export function presetKey(design) {
  const cab = activeWalls(design).join();
  return Object.keys(PRESETS).find((k) => PRESETS[k].type === design.type && PRESETS[k].cab.join() === cab) || null;
}
export function applyPreset(design, key) {
  const p = PRESETS[key];
  design.type = p.type;
  for (const k of SIDES) design.cab[k] = p.cab.includes(k);
  if (p.type === "reach") design.openings = design.openings.filter((o) => o.wall === "back");
  if (p.type === "walk" && !design.openings.some((o) => o.wall === "front")) {
    const W = design.walls.back.width;
    design.openings.push({ wall: "front", kind: "door", ...OPENING_DEFAULTS.door, at: +Math.max(0, (W - 32) / 2).toFixed(2) });
  }
}

// Inside depth of the room, from the back wall to the front wall or closet opening.
export const roomDepth = (design) => (design.type === "reach" ? REACH_DEPTH : design.walls.left.width);
export const isWalk = (design) => design.type === "walk";
export const cornerOn = (design, side) => isWalk(design) && design.cab.back && design.cab[side] && design.corners[side] ? design.corners[side] : null;

// Ceiling height at a floor point (x across, z out from the back wall).
export function ceilingAt(design, x, z) {
  const c = design.ceiling || CEILING.def;
  const s = design.slope;
  if (!s) return c;
  const W = design.walls.back.width;
  const dist = s.wall === "back" ? z : s.wall === "left" ? x : W - x;
  if (dist >= s.run) return c;
  return +(s.knee + ((c - s.knee) * Math.max(0, dist)) / s.run).toFixed(2);
}
const lowestCeiling = (design, b) => Math.min(...[b.x[0], b.x[1]].flatMap((x) => [b.z[0], b.z[1]].map((z) => ceilingAt(design, x, z))));

// Openings as floor boxes: a window or door in a wall, plus a door's swing.
export function openingBox(design, o) {
  const W = design.walls.back.width, RD = roomDepth(design);
  const reach = o.kind === "door" && o.swing !== "out" ? Math.min(o.w, 36) : 1;
  const a = [o.at, o.at + o.w];
  if (o.wall === "back") return { x: a, z: [0, reach] };
  if (o.wall === "left") return { x: [0, reach], z: a };
  if (o.wall === "right") return { x: [W - reach, W], z: a };
  return { x: a, z: [RD - reach, RD] };
}
export const openingLabel = (o) => `the ${o.kind} on the ${WALL_NAMES[o.wall].toLowerCase()}`;
export const wallLength = (design, k) => (k === "back" || k === "front" ? design.walls.back.width : roomDepth(design));

const depthOf = (m) => DEPTHS[m.depth].inches;
const maxDepth = (mods) => mods.reduce((a, m) => Math.max(a, depthOf(m)), 0);

export function activeWalls(design) {
  return design.type === "reach" ? ["back"] : SIDES.filter((k) => design.cab[k]);
}

// Where each wall's run starts and how much room it has.
// Corners take their size from both walls they touch. Without a corner,
// the back wall runs into the corner and the side run starts in front of it.
export function wallGeometry(design) {
  const walls = activeWalls(design);
  const back = design.walls.back;
  const geo = {};
  const cornerSize = (side) => (cornerOn(design, side) ? cornerByCode[design.corners[side].code].size : 0);
  const lc = cornerSize("left"), rc = cornerSize("right");
  if (walls.includes("back")) geo.back = { start: lc, end: back.width - rc };
  for (const side of ["left", "right"]) {
    if (!walls.includes(side)) continue;
    const c = side === "left" ? lc : rc;
    const start = c || (walls.includes("back") ? maxDepth(back.modules) : 0);
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
  if (m.custom) {
    m.depth = depth;
    if (depth === "S" && m.custom.doors && m.custom.rods.length) { m.custom.doors = null; return "Custom doors over hanging"; }
    return null;
  }
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
  if (!walls.length) return from;
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

// The catalog style a custom interior is identical to, if any (so it keeps the catalog code and parts).
export function matchStyle(w, depth, c) {
  const key = (x) => JSON.stringify([x.doors || null, !!x.drawers, !!x.shoe, x.shelves, x.rods]);
  const k = key(c);
  return STYLES.find((s) => s.depths.includes(depth) && s.widths.includes(w) && key(customFromLook(s.look())) === k) || null;
}

export function moduleInfo(m) {
  if (m.custom && !styleById[m.style]?.filler) {
    const same = matchStyle(m.w, m.depth, m.custom);
    if (same) return moduleInfo({ ...m, custom: undefined, style: same.id });
    const c = m.custom;
    const parts = customParts(m.w, m.depth, c);
    return { code: customCode(m.w, m.depth), name: customName(c), parts, look: customLook(c), price: sumParts(parts), custom: true };
  }
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
    if (cornerOn(design, side)) {
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

// Floor footprints of everything in the closet: x across, z out from the back wall.
export function footprints(design) {
  const geo = wallGeometry(design);
  const W = design.walls.back.width;
  const walls = activeWalls(design);
  const boxes = [];
  for (const side of ["left", "right"]) {
    const c = cornerOn(design, side);
    if (!c) continue;
    const cc = cornerByCode[c.code], dd = DEPTHS[cc.depth].inches, s = cc.size;
    const label = `the ${side === "left" ? "back-left" : "back-right"} corner`;
    const x0 = side === "left" ? 0 : W - s;
    boxes.push({ label, wall: `c${side}`, cab: true, x: [x0, x0 + s], z: [0, dd] });
    boxes.push({ label, wall: `c${side}`, cab: true, x: side === "left" ? [0, dd] : [W - dd, W], z: [0, s] });
  }
  for (const k of walls) {
    let s = geo[k].start;
    design.walls[k].modules.forEach((m, i) => {
      const d = DEPTHS[m.depth].inches;
      const label = `${moduleInfo(m).code} on the ${WALL_NAMES[k].toLowerCase()}`;
      const b = { label, wall: k, cab: true, index: i };
      if (k === "back") Object.assign(b, { x: [s, s + m.w], z: [0, d] });
      if (k === "left") Object.assign(b, { x: [0, d], z: [s, s + m.w] });
      if (k === "right") Object.assign(b, { x: [W - d, W], z: [s, s + m.w] });
      boxes.push(b);
      s += m.w;
    });
  }
  return boxes;
}

// Fixed things in the room that cabinets can't go over.
function roomBlocks(design) {
  const out = [];
  const front = isWalk(design);
  design.openings.forEach((o, i) => {
    if (o.wall === "front" ? !front : o.wall !== "back" && !front) return;
    if (o.kind === "window" && o.sill >= HEIGHT) return;
    out.push({ label: openingLabel(o) + (o.kind === "door" && o.swing !== "out" ? " (and its swing)" : ""), wall: `o${i}`, ...openingBox(design, o) });
  });
  design.obstacles.forEach((b, i) => {
    if (b.kind === "soffit" && b.bottom >= HEIGHT) return;
    out.push({ label: b.kind === "column" ? "the column" : `the soffit (${b.bottom}" high)`, wall: `b${i}`, x: [b.x, b.x + b.w], z: [b.z, b.z + b.d] });
  });
  return out;
}

// Everything that stops the closet from going in: a run longer than its wall,
// cabinets taking the same floor space, or cabinets over a window, door, column,
// soffit or under a low or sloped ceiling.
export function collisions(design) {
  const out = [];
  const geo = wallGeometry(design);
  for (const [k, g] of Object.entries(geo)) {
    if (g.free < -0.001) out.push(`The ${WALL_NAMES[k].toLowerCase()} would be over by ${+(-g.free).toFixed(2)}".`);
  }
  const boxes = footprints(design);
  const hasCab = boxes.length > 0;
  if (hasCab && design.ceiling < HEIGHT) out.push(`The ${design.ceiling}" ceiling is lower than the ${HEIGHT}" cabinets.`);
  const hit = (a, b) => a[0] < b[1] - 0.01 && b[0] < a[1] - 0.01;
  const all = [...boxes, ...roomBlocks(design)];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.wall === b.wall || (!a.cab && !b.cab)) continue;
      if (hit(a.x, b.x) && hit(a.z, b.z)) out.push(`${a.label[0].toUpperCase()}${a.label.slice(1)} would hit ${b.label}.`);
    }
  }
  if (design.slope && design.ceiling >= HEIGHT) {
    for (const b of boxes) {
      const low = lowestCeiling(design, b);
      if (low < HEIGHT - 0.01) out.push(`${b.label[0].toUpperCase()}${b.label.slice(1)} would be under the sloped ceiling (${low}" high there).`);
    }
  }
  return [...new Set(out)];
}

export function problems(design) {
  return collisions(design).map((m) => m.replace(" would be ", " is ").replace(" would hit ", " hits ") + " Move, narrow or remove that module, or change the room.");
}

// --- share links ---------------------------------------------------------------
export function encode(design) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(design))));
}
export function decode(text) {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(text))));
    if (d && d.walls && d.walls.back && (d.layout || d.type)) {
      // designs saved before walk-ins could take any wall mix
      if (d.layout) {
        const old = { reach: "reach", L: "Lleft", U: "U" }[d.layout] || "reach";
        d.type = PRESETS[old].type;
        d.cab = Object.fromEntries(SIDES.map((k) => [k, PRESETS[old].cab.includes(k)]));
        delete d.layout;
      }
      if (d.type !== "walk") d.type = "reach";
      d.cab = Object.fromEntries(SIDES.map((k) => [k, !!(d.cab || {})[k]]));
      for (const k of SIDES) {
        d.walls[k] = d.walls[k] || { width: 72, modules: [] };
        d.walls[k].modules = (d.walls[k].modules || []).filter((m) => m && (styleById[m.style] || m.custom));
        for (const m of d.walls[k].modules) {
          if (m.custom) m.custom = normalizeCustom(m.custom);
          if (!styleById[m.style]) m.style = "5s";
        }
      }
      const depth = Math.max(+d.walls.left.width || 72, +d.walls.right.width || 72);
      d.walls.left.width = d.walls.right.width = depth;
      d.corners = d.corners || { left: null, right: null };
      if (!(+d.ceiling >= CEILING.min && +d.ceiling <= CEILING.max)) d.ceiling = CEILING.def;
      d.openings = Array.isArray(d.openings) ? d.openings.filter((o) => o && o.kind in OPENING_DEFAULTS && (o.wall in WALL_NAMES)) : [];
      d.obstacles = Array.isArray(d.obstacles) ? d.obstacles.filter((o) => o && o.kind in OBSTACLE_DEFAULTS) : [];
      if (d.slope && !(SIDES.includes(d.slope.wall) && d.slope.run > 0)) d.slope = null;
      const r = d.room || {};
      d.room = { ...defaultRoom(), ...r };
      if (!(d.room.wall in ROOM_WALLS)) d.room.wall = "white";
      if (!(d.room.floor in ROOM_FLOORS)) d.room.floor = "oak";
      if (!(+d.wallT >= WALL_T.min && +d.wallT <= WALL_T.max)) d.wallT = WALL_T.def;
      return d;
    }
  } catch { /* ignore */ }
  return null;
}

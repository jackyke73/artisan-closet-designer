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
// Walls of a custom room are "w1", "w2"…, named "Wall 1", "Wall 2"….
const BASE_NAMES = { left: "Left wall", back: "Back wall", right: "Right wall", front: "Front wall" };
const isShapeWall = (k) => typeof k === "string" && /^w\d+$/.test(k);
export const WALL_NAMES = new Proxy(BASE_NAMES, {
  get: (o, k) => (k in o ? o[k] : isShapeWall(k) ? `Wall ${k.slice(1)}` : undefined),
  has: (o, k) => k in o || isShapeWall(k),
});
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
  if (isCustom(design)) return "Custom room";
  const cab = activeWalls(design).join();
  const p = Object.values(PRESETS).find((v) => v.type === design.type && v.cab.join() === cab);
  return p ? p.name : "Walk-in";
}
export function presetKey(design) {
  if (isCustom(design)) return "custom";
  const cab = activeWalls(design).join();
  return Object.keys(PRESETS).find((k) => PRESETS[k].type === design.type && PRESETS[k].cab.join() === cab) || null;
}
export function applyPreset(design, key) {
  const p = PRESETS[key];
  if (isCustom(design)) {
    // back to a box room: drop the custom walls' cabinets and openings
    for (const k of Object.keys(design.walls)) if (isShapeWall(k)) delete design.walls[k];
    for (const k of Object.keys(design.cab)) if (isShapeWall(k)) delete design.cab[k];
    design.openings = design.openings.filter((o) => !isShapeWall(o.wall));
    delete design.shape;
  }
  design.type = p.type;
  for (const k of SIDES) design.cab[k] = p.cab.includes(k);
  if (p.type === "reach") design.openings = design.openings.filter((o) => o.wall === "back");
  if (p.type === "walk" && !design.openings.some((o) => o.wall === "front")) {
    const W = design.walls.back.width;
    design.openings.push({ wall: "front", kind: "door", ...OPENING_DEFAULTS.door, at: +Math.max(0, (W - 32) / 2).toFixed(2) });
  }
}

// Inside depth of the room, from the back wall to the front wall or closet opening.
export const roomDepth = (design) => (design.type === "reach" ? REACH_DEPTH : isCustom(design) ? shapeBox(design).D : design.walls.left.width);
export const isWalk = (design) => design.type === "walk";
export const isCustom = (design) => design.type === "custom";

// --- custom rooms ----------------------------------------------------------------
// A custom room is a floor outline with square corners. Its points run clockwise on the
// floor plan (x right, z down), so each wall runs left to right as seen from inside the
// room, and the room is on the wall's `n` side. Wall i runs from point i to point i + 1.
export const ROOM_SHAPES = {
  rect: { name: "Rectangle", pts: [[0, 0], [120, 0], [120, 96], [0, 96]], door: 2, cab: 0 },
  L: { name: "L-shape", pts: [[0, 0], [144, 0], [144, 120], [72, 120], [72, 60], [0, 60]], door: 3, cab: 0 },
  notch: { name: "Notched corner", pts: [[0, 48], [48, 48], [48, 0], [144, 0], [144, 108], [0, 108]], door: 4, cab: 2 },
};
export const SHAPE_ICONS = {
  rect: "M6 6h36v32H6z",
  L: "M6 6h36v32H24V22H6z",
  notch: "M6 18h12V6h24v32H6z",
};
export const MIN_WALL = 6; // shortest wall of a custom room, inches

// Every wall of a custom room: start A, end B, direction u, room side n, length.
export function shapeWalls(design) {
  const { pts, ids } = design.shape;
  const N = pts.length;
  return ids.map((k, i) => {
    const A = pts[i], B = pts[(i + 1) % N];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const u = len ? [(B[0] - A[0]) / len, (B[1] - A[1]) / len] : [1, 0];
    return { k, i, A, B, u, n: [-u[1], u[0]], len: +len.toFixed(3), rev: false };
  });
}
// Is the corner at the start of wall i an inside corner (the room's own corner, 90 degrees)?
export function insideCornerAt(walls, i) {
  const p = walls[(i - 1 + walls.length) % walls.length].u, q = walls[i].u;
  return p[0] * q[1] - p[1] * q[0] > 0;
}
export function shapeBox(design) {
  const xs = design.shape.pts.map((p) => p[0]), zs = design.shape.pts.map((p) => p[1]);
  return { x0: Math.min(...xs), z0: Math.min(...zs), W: Math.max(...xs) - Math.min(...xs), D: Math.max(...zs) - Math.min(...zs) };
}
// Point inside the outline (ray casting).
export function insideShape(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// A floor box is inside the room if its middle is inside and no wall cuts through it.
export function boxInShape(pts, b, tol = 0.05) {
  if (!insideShape(pts, (b.x[0] + b.x[1]) / 2, (b.z[0] + b.z[1]) / 2)) return false;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    if (Math.abs(az - bz) < 1e-6) {
      if (az > b.z[0] + tol && az < b.z[1] - tol && Math.min(ax, bx) < b.x[1] - tol && Math.max(ax, bx) > b.x[0] + tol) return false;
    } else if (ax > b.x[0] + tol && ax < b.x[1] - tol && Math.min(az, bz) < b.z[1] - tol && Math.max(az, bz) > b.z[0] + tol) return false;
  }
  return true;
}
// Outline is usable: square corners, clockwise, walls long enough, no wall crossing another.
export function shapeOk(pts) {
  const N = pts.length;
  if (N < 4) return false;
  let area = 0;
  for (let i = 0; i < N; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % N];
    const dx = bx - ax, dz = bz - az;
    if ((Math.abs(dx) > 1e-6) === (Math.abs(dz) > 1e-6)) return false; // not square, or no length
    if (Math.hypot(dx, dz) < MIN_WALL - 1e-6) return false;
    area += ax * bz - bx * az;
  }
  if (area <= 0) return false;
  const seg = (i) => { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % N]; return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) }; };
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (j === i + 1 || (i === 0 && j === N - 1)) continue;
      const a = seg(i), b = seg(j);
      if (a.x0 <= b.x1 + 1e-6 && b.x0 <= a.x1 + 1e-6 && a.z0 <= b.z1 + 1e-6 && b.z0 <= a.z1 + 1e-6) return false;
    }
  }
  return true;
}
// Shift the outline so its top-left is at 0,0 (cabinet and room positions shift with it).
function normalizeShape(design) {
  const { x0, z0 } = shapeBox(design);
  if (!x0 && !z0) return;
  design.shape.pts = design.shape.pts.map(([x, z]) => [+(x - x0).toFixed(3), +(z - z0).toFixed(3)]);
  for (const b of design.obstacles) { b.x = +(b.x - x0).toFixed(3); b.z = +(b.z - z0).toFixed(3); }
}
// Keep each wall's stored length in step with the outline.
function syncShapeWalls(design) {
  for (const w of shapeWalls(design)) {
    design.walls[w.k] = design.walls[w.k] || { width: w.len, modules: [] };
    design.walls[w.k].width = w.len;
    if (!(w.k in design.cab)) design.cab[w.k] = false;
  }
  for (const o of design.openings) {
    const L = design.walls[o.wall]?.width;
    if (L != null) o.at = +Math.max(0, Math.min(o.at, L - o.w)).toFixed(2);
  }
}
// Move wall i out of (negative) or into (positive) the room. The walls on either side
// stretch or shrink. Returns false and changes nothing if the outline would break.
export function moveShapeWall(design, i, delta) {
  const pts = design.shape.pts.map((p) => [...p]);
  const w = shapeWalls(design)[i];
  const N = pts.length;
  for (const j of [i, (i + 1) % N]) pts[j] = [+(pts[j][0] + w.n[0] * delta).toFixed(3), +(pts[j][1] + w.n[1] * delta).toFixed(3)];
  if (!shapeOk(pts)) return false;
  design.shape.pts = pts;
  normalizeShape(design);
  syncShapeWalls(design);
  return true;
}
// Make wall i a given length by moving the wall after it.
export function setShapeWallLength(design, i, len) {
  const walls = shapeWalls(design);
  const w = walls[i], next = walls[(i + 1) % walls.length];
  const s = next.n[0] * w.u[0] + next.n[1] * w.u[1]; // +1: moving the next wall in makes this one longer
  return moveShapeWall(design, next.i, (len - w.len) / s);
}
// Split wall i in the middle and set the second half back by `step` inches (a jog).
export function splitShapeWall(design, i, step = 12) {
  const w = shapeWalls(design)[i];
  if (w.len < 2 * MIN_WALL) return false;
  const mid = Math.round((w.len / 2) * 2) / 2;
  const M = [+(w.A[0] + w.u[0] * mid).toFixed(3), +(w.A[1] + w.u[1] * mid).toFixed(3)];
  const trial = JSON.parse(JSON.stringify(design));
  const sh = trial.shape;
  const a = `w${sh.next++}`, b = `w${sh.next++}`;
  // wall i keeps the first half; a zero-length wall `a` and the second half `b` follow
  sh.pts.splice(i + 1, 0, [...M], [...M]);
  sh.ids.splice(i + 1, 0, a, b);
  // modules past the middle move to the second half
  const mods = trial.walls[w.k].modules;
  const geoStart = wallGeometry(trial)[w.k]?.start || 0;
  let s = geoStart, cut = mods.length;
  for (let j = 0; j < mods.length; j++) { if (s + mods[j].w > mid + 0.01) { cut = j; break; } s += mods[j].w; }
  trial.walls[b] = { width: w.len - mid, modules: mods.splice(cut) };
  trial.walls[a] = { width: 0, modules: [] };
  trial.cab[b] = !!trial.cab[w.k]; trial.cab[a] = false;
  for (const o of trial.openings) if (o.wall === w.k && o.at >= mid) { o.wall = b; o.at = +(o.at - mid).toFixed(2); }
  // push the second half (wall b, now index i + 2) into the room, or out of it if going in
  // would cut into cabinets or can't be done
  const pts = sh.pts.map((p) => [...p]);
  const before = collisions(design).length;
  let fallback = null;
  for (const dir of [1, -1]) {
    const t = JSON.parse(JSON.stringify(trial));
    for (const j of [i + 2, (i + 3) % t.shape.pts.length]) t.shape.pts[j] = [+(pts[j][0] + w.n[0] * step * dir).toFixed(3), +(pts[j][1] + w.n[1] * step * dir).toFixed(3)];
    if (!shapeOk(t.shape.pts)) continue;
    normalizeShape(t);
    syncShapeWalls(t);
    if (collisions(t).length <= before) { Object.assign(design, renumberShape(t)); return true; }
    fallback = fallback || t;
  }
  if (fallback) { Object.assign(design, renumberShape(fallback)); return true; }
  return false;
}
// Name the walls 1, 2, 3… clockwise again (after a jog adds walls in the middle).
function renumberShape(design) {
  const map = Object.fromEntries(design.shape.ids.map((k, i) => [k, `w${i + 1}`]));
  const walls = {}, cab = {};
  for (const [k, v] of Object.entries(design.walls)) if (!isShapeWall(k)) walls[k] = v;
  for (const [k, v] of Object.entries(design.cab)) if (!isShapeWall(k)) cab[k] = v;
  for (const [a, b] of Object.entries(map)) { walls[b] = design.walls[a]; cab[b] = !!design.cab[a]; }
  design.walls = walls;
  design.cab = cab;
  design.openings = design.openings.map((o) => (map[o.wall] ? { ...o, wall: map[o.wall] } : o));
  design.shape.lead = (design.shape.lead || []).map((k) => map[k]).filter(Boolean);
  design.shape.ids = design.shape.ids.map((k) => map[k]);
  design.shape.next = design.shape.ids.length + 1;
  return design;
}

// Start a custom room from one of ROOM_SHAPES. Cabinets are cleared; windows and doors too,
// except an entry door.
export function applyShape(design, key) {
  const t = ROOM_SHAPES[key];
  const ids = t.pts.map((_, i) => `w${i + 1}`);
  design.type = "custom";
  design.shape = { pts: t.pts.map((p) => [...p]), ids, next: ids.length + 1 };
  design.cab = Object.fromEntries(SIDES.map((k) => [k, !!design.cab?.[k]]));
  for (const k of Object.keys(design.walls)) if (isShapeWall(k)) delete design.walls[k];
  design.corners = design.corners || { left: null, right: null };
  design.slope = null;
  design.obstacles = [];
  syncShapeWalls(design);
  design.cab[ids[t.cab]] = true;
  const dw = shapeWalls(design)[t.door];
  design.openings = [{ wall: dw.k, kind: "door", ...OPENING_DEFAULTS.door, at: +Math.max(0, (dw.len - 32) / 2).toFixed(2) }];
}
// Turn the current preset room into a custom rectangle, keeping its cabinets, windows and doors.
export function toCustom(design) {
  if (isCustom(design)) return;
  const walk = isWalk(design);
  const W = design.walls.back.width, RD = walk ? roomDepth(design) : 96; // a reach-in becomes a small room
  const old = JSON.parse(JSON.stringify(design));
  const keys = ["back", "right", "front", "left"];
  const ids = ["w1", "w2", "w3", "w4"];
  for (const k of Object.keys(design.walls)) if (isShapeWall(k)) delete design.walls[k];
  design.type = "custom";
  // the back wall goes into both corners, as in the box rooms; the left wall's cabinets stay at the back
  design.shape = { pts: [[0, 0], [W, 0], [W, RD], [0, RD]], ids, next: 5, lead: ["w1"] };
  syncShapeWalls(design);
  const was = walk ? activeWalls(old) : ["back"];
  keys.forEach((k, i) => {
    const id = ids[i];
    const mods = was.includes(k) ? old.walls[k].modules : [];
    // the left wall's run was measured from the back; custom walls run the other way
    design.walls[id].modules = k === "left" ? [...mods].reverse() : [...mods];
    if (k === "left") design.walls[id].align = "end";
    if (old.walls[k]?.depth) design.walls[id].depth = old.walls[k].depth;
    design.cab[id] = was.includes(k);
  });
  const L = { back: W, front: W, left: RD, right: RD };
  design.openings = (walk ? old.openings : old.openings.filter((o) => o.wall === "back")).map((o) => {
    const i = keys.indexOf(o.wall);
    const flip = o.wall === "front" || o.wall === "left";
    return { ...o, wall: ids[i], at: flip ? +(L[o.wall] - o.at - o.w).toFixed(2) : o.at };
  });
  if (!walk) design.openings.push({ wall: "w3", kind: "door", ...OPENING_DEFAULTS.door, at: +Math.max(0, (W - 32) / 2).toFixed(2) });
  design.slope = null;
}
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
  if (isCustom(design)) {
    const f = wallFrame(design, o.wall);
    return f ? wallBox(f, o.at, o.w, o.kind === "door" && o.swing !== "out" ? Math.min(o.w, 36) : 1) : { x: [0, 0], z: [0, 0] };
  }
  const W = design.walls.back.width, RD = roomDepth(design);
  const reach = o.kind === "door" && o.swing !== "out" ? Math.min(o.w, 36) : 1;
  const a = [o.at, o.at + o.w];
  if (o.wall === "back") return { x: a, z: [0, reach] };
  if (o.wall === "left") return { x: [0, reach], z: a };
  if (o.wall === "right") return { x: [W - reach, W], z: a };
  return { x: a, z: [RD - reach, RD] };
}
// "the back wall", or "wall 3" in a custom room
export const wallRef = (k) => (isShapeWall(k) ? WALL_NAMES[k].toLowerCase() : `the ${WALL_NAMES[k].toLowerCase()}`);
export const openingLabel = (o) => `the ${o.kind} on ${wallRef(o.wall)}`;
export const wallLength = (design, k) => (isCustom(design) ? design.walls[k]?.width ?? 0 : k === "back" || k === "front" ? design.walls.back.width : roomDepth(design));

// Where a wall is on the floor: start A, direction u (left to right seen from the room),
// room side n, length. `rev`: a position along the wall's run counts from its far end.
export function wallFrame(design, k) {
  if (isCustom(design)) return shapeWalls(design).find((w) => w.k === k);
  const W = design.walls.back.width, RD = roomDepth(design);
  const f = {
    back: { A: [0, 0], u: [1, 0], len: W, rev: false },
    right: { A: [W, 0], u: [0, 1], len: RD, rev: false },
    front: { A: [W, RD], u: [-1, 0], len: W, rev: true },
    left: { A: [0, RD], u: [0, -1], len: RD, rev: true },
  }[k];
  return f && { ...f, k, n: [-f.u[1], f.u[0]] };
}
// Floor point of a spot on wall frame f: `at` along the run (for something `w` wide),
// `along` across that thing, `out` into the room.
export function onWall(f, at, w, along = 0, out = 0) {
  const t = (f.rev ? f.len - at - w : at) + along;
  return [f.A[0] + f.u[0] * t + f.n[0] * out, f.A[1] + f.u[1] * t + f.n[1] * out];
}
// Axis-aligned floor box of a rectangle on a wall: `at`..`at + w` along it, 0..`d` out from it.
export function wallBox(f, at, w, d) {
  const ps = [onWall(f, at, w, 0, 0), onWall(f, at, w, w, d)];
  return { x: [Math.min(ps[0][0], ps[1][0]), Math.max(ps[0][0], ps[1][0])], z: [Math.min(ps[0][1], ps[1][1]), Math.max(ps[0][1], ps[1][1])] };
}

const depthOf = (m) => DEPTHS[m.depth].inches;
const maxDepth = (mods) => mods.reduce((a, m) => Math.max(a, depthOf(m)), 0);

export function activeWalls(design) {
  if (isCustom(design)) return design.shape.ids.filter((k) => design.cab[k]);
  return design.type === "reach" ? ["back"] : SIDES.filter((k) => design.cab[k]);
}

// Where each wall's run starts and how much room it has.
// Corners take their size from both walls they touch. Without a corner,
// the back wall runs into the corner and the side run starts in front of it.
export function wallGeometry(design) {
  if (isCustom(design)) return customGeometry(design);
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

// Custom rooms: where two cabinet walls meet in an inside corner, the earlier wall's run
// goes into the corner and the later one starts in front of it, unless the later wall is
// listed in shape.lead (it then goes into the corner instead). A wall with align "end"
// packs its cabinets against its far end. `start` is where the cabinets begin, `runStart`
// where the run begins, `openAt` where the open part of the run begins.
function customGeometry(design) {
  const ws = shapeWalls(design);
  const lead = design.shape.lead || [];
  const geo = {};
  ws.forEach((w, i) => {
    if (!design.cab[w.k]) return;
    const prev = ws[(i - 1 + ws.length) % ws.length], next = ws[(i + 1) % ws.length];
    const runStart = insideCornerAt(ws, i) && design.cab[prev.k] && !lead.includes(w.k) ? maxDepth(design.walls[prev.k].modules) : 0;
    const end = w.len - (insideCornerAt(ws, next.i) && design.cab[next.k] && lead.includes(next.k) ? maxDepth(design.walls[next.k].modules) : 0);
    const used = design.walls[w.k].modules.reduce((a, m) => a + m.w, 0);
    const space = end - runStart;
    const free = +(space - used).toFixed(2);
    const atEnd = design.walls[w.k].align === "end" && free > 0;
    geo[w.k] = { start: atEnd ? runStart + free : runStart, runStart, openAt: atEnd ? runStart : runStart + used, end, space, used, free };
  });
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
  if (isCustom(design)) {
    const ws = shapeWalls(design).filter((w) => design.cab[w.k]);
    if (!ws.length) return from;
    const dist = (w) => {
      const t = Math.max(0, Math.min(w.len, (x - w.A[0]) * w.u[0] + (z - w.A[1]) * w.u[1]));
      return Math.hypot(x - (w.A[0] + w.u[0] * t), z - (w.A[1] + w.u[1] * t));
    };
    const w = ws.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const t = (x - w.A[0]) * w.u[0] + (z - w.A[1]) * w.u[1];
    const mods = design.walls[w.k].modules.filter((_, i) => !(w.k === from.wall && i === from.index));
    let s = wallGeometry(design)[w.k].start, index = 0;
    for (const m of mods) { if (t > s + m.w / 2) index++; s += m.w; }
    return { wall: w.k, index };
  }
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
    const f = isCustom(design) ? wallFrame(design, k) : null;
    design.walls[k].modules.forEach((m, i) => {
      const d = DEPTHS[m.depth].inches;
      const label = `${moduleInfo(m).code} on ${wallRef(k)}`;
      const b = { label, wall: k, cab: true, index: i };
      if (f) Object.assign(b, wallBox(f, s, m.w, d));
      else if (k === "back") Object.assign(b, { x: [s, s + m.w], z: [0, d] });
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
  const custom = isCustom(design);
  design.openings.forEach((o, i) => {
    if (custom ? !design.walls[o.wall] : o.wall === "front" ? !front : o.wall !== "back" && !front) return;
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
    if (g.free < -0.001) out.push(`${wallRef(k).replace(/^./, (c) => c.toUpperCase())} would be over by ${+(-g.free).toFixed(2)}".`);
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
  if (isCustom(design)) {
    for (const b of boxes) if (!boxInShape(design.shape.pts, b)) out.push(`${b.label[0].toUpperCase()}${b.label.slice(1)} would go through a wall.`);
  }
  if (design.slope && design.ceiling >= HEIGHT) {
    for (const b of boxes) {
      const low = lowestCeiling(design, b);
      if (low < HEIGHT - 0.01) out.push(`${b.label[0].toUpperCase()}${b.label.slice(1)} would be under the sloped ceiling (${low}" high there).`);
    }
  }
  return [...new Set(out)];
}

// Which cabinets are in trouble, for drawing them red: "back:2", "corner:left".
export function clashSet(design) {
  const out = new Set();
  const key = (b) => (b.wall.startsWith("c") && b.index == null ? `corner:${b.wall.slice(1)}` : `${b.wall}:${b.index}`);
  const geo = wallGeometry(design);
  for (const [k, g] of Object.entries(geo)) {
    if (g.free >= -0.001) continue;
    let s = g.start;
    design.walls[k].modules.forEach((m, i) => { s += m.w; if (s > g.end + 0.001) out.add(`${k}:${i}`); });
  }
  const boxes = footprints(design);
  if (boxes.length && design.ceiling < HEIGHT) boxes.forEach((b) => out.add(key(b)));
  const hit = (a, b) => a[0] < b[1] - 0.01 && b[0] < a[1] - 0.01;
  const all = [...boxes, ...roomBlocks(design)];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.wall === b.wall || (!a.cab && !b.cab)) continue;
      if (hit(a.x, b.x) && hit(a.z, b.z)) { if (a.cab) out.add(key(a)); if (b.cab) out.add(key(b)); }
    }
  }
  if (isCustom(design)) for (const b of boxes) if (!boxInShape(design.shape.pts, b)) out.add(key(b));
  if (design.slope && design.ceiling >= HEIGHT) for (const b of boxes) if (lowestCeiling(design, b) < HEIGHT - 0.01) out.add(key(b));
  return out;
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
      const custom = d.type === "custom" && d.shape && Array.isArray(d.shape.pts) && Array.isArray(d.shape.ids) &&
        d.shape.pts.length === d.shape.ids.length && d.shape.ids.every(isShapeWall) && shapeOk(d.shape.pts);
      if (!custom && d.type !== "walk") d.type = "reach";
      const cab0 = d.cab || {};
      d.cab = Object.fromEntries(SIDES.map((k) => [k, !!cab0[k]]));
      if (custom) {
        d.shape.next = Math.max(+d.shape.next || 0, ...d.shape.ids.map((k) => +k.slice(1) + 1));
        for (const k of d.shape.ids) {
          d.cab[k] = !!cab0[k];
          d.walls[k] = d.walls[k] || { width: 0, modules: [] };
          d.walls[k].modules = (d.walls[k].modules || []).filter((m) => m && (styleById[m.style] || m.custom));
          for (const m of d.walls[k].modules) {
            if (m.custom) m.custom = normalizeCustom(m.custom);
            if (!styleById[m.style]) m.style = "5s";
          }
        }
        d.obstacles = Array.isArray(d.obstacles) ? d.obstacles : [];
        d.openings = Array.isArray(d.openings) ? d.openings : [];
        syncShapeWalls(d);
      } else delete d.shape;
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
      d.openings = Array.isArray(d.openings) ? d.openings.filter((o) => o && o.kind in OPENING_DEFAULTS && (custom ? d.shape.ids.includes(o.wall) : o.wall in BASE_NAMES)) : [];
      d.obstacles = Array.isArray(d.obstacles) ? d.obstacles.filter((o) => o && o.kind in OBSTACLE_DEFAULTS) : [];
      if (custom || (d.slope && !(SIDES.includes(d.slope.wall) && d.slope.run > 0))) d.slope = null;
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

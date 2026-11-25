// Artisan Slab Oak closet system, from ARTISAN-Closet-Catalog (October 2026).
// Everything the designer knows about modules lives here, so the catalog can be
// updated in one place as it is finished.

export const HEIGHT = 90;       // overall height, inches
export const TOE = 4.5;         // flush toe kick
export const T = 0.75;          // panel thickness
export const DRAWER_ZONE = 30;  // 85.5" opening minus the 55.5" door over drawers

export const WIDTHS = [15, 18, 21, 24, 27, 30, 33, 36];
export const DEPTHS = {
  S: { label: '15" deep', inches: 15, suffix: "" },
  D: { label: '23.75" deep', inches: 23.75, suffix: "D" },
};
const SHOE_WIDTHS = [15, 18, 21, 24, 30, 36];
const ROD_WIDTHS = [24, 27, 30, 33, 36];
const NARROW = [15, 18, 21, 24];
const WIDE = [27, 30, 33, 36];

// --- part-number helpers (catalog p.6) ---------------------------------------
const side = (d) => (d === "D" ? "SO SP2490" : "SO SP1590");
const topBottom = (w, d) => `SO TB${w}${d === "D" ? "24" : "15"}`;
const back = (w) => `SO BP${w}90`;
const shelf = (w, d) => `SO S${w}${d === "D" ? "D" : ""}`;
const rod = (w) => (w >= 24 ? `HR${w}` : "HR24 (cut to fit)");
const KIT = "Closet Kit";

function fullDoor(w, glass) {
  const p = glass ? "GD" : "SO";
  if (w === 30) return [[`${p} PC1590-FD`, 2]];
  if (w === 36) return [[`${p} PC1890-FD`, 2]];
  return [[`${p} PC${w}90-FD`, 1]];
}
const doorOverDrawers = (w, glass) => [[`${glass ? "GD" : "SO"} PC${w}55.5`, 1]];
function drawers(w, d) {
  const boxes = d === "D" ? [`B ${w}T`, `B ${w}M/B`] : [`B ${w}N`, `B ${w}H`];
  return [[`SO 3DB${w}`, 1], [boxes[0], 1], [boxes[1], 2]];
}
const base = (w, d, shelves) => [
  [side(d), 1], [topBottom(w, d), 1], [back(w), 1], [shelf(w, d), shelves],
];

export const moduleCode = (w, d) => `C${w}90${DEPTHS[d].suffix}`;

// --- module styles -----------------------------------------------------------
// look: what the 3D view and elevation draw.
//   doors: "solid" | "glass" | null, drawers: bool, rods: [heights], shelves: [heights], shoe: bool
export const STYLES = [
  {
    id: "open", group: "Shelving", name: "Open, 1 shelf",
    depths: ["S", "D"], widths: WIDTHS,
    code: (w, d) => moduleCode(w, d),
    parts: (w, d) => [...base(w, d, 1), [KIT, 1]],
    look: () => ({ shelves: [50] }),
  },
  {
    id: "5s", group: "Shelving", name: "Open shelves",
    depths: ["S", "D"], widths: WIDTHS,
    code: (w, d) => `${moduleCode(w, d)}-5S`,
    parts: (w, d) => [...base(w, d, 4), [KIT, 1]],
    look: () => ({ shelves: evenly(5) }),
  },
  {
    id: "2hr", group: "Hanging", name: "Double hanging",
    depths: ["S", "D"], widths: ROD_WIDTHS,
    code: (w, d) => `${moduleCode(w, d)}-2HR`,
    parts: (w, d) => [...base(w, d, 1), [rod(w), 1], [KIT, 1]],
    look: () => ({ shelves: [46, 86.5], rods: [83.5, 43] }),
  },
  {
    id: "door", group: "Doors", name: "Solid door, shelves",
    depths: ["S", "D"], widths: WIDTHS, hinged: true,
    code: (w, d) => `${moduleCode(w, d)}-${w <= 24 ? "D" : "2D"}`,
    parts: (w, d) => [...base(w, d, 4), ...fullDoor(w, false), [KIT, 1]],
    look: () => ({ doors: "solid", shelves: evenly(5) }),
  },
  {
    id: "door2hr", group: "Doors", name: "Solid door, hanging",
    depths: ["D"], widths: WIDTHS, hinged: true,
    code: (w, d) => `${moduleCode(w, d)}-${w <= 24 ? "1D2HR" : "2D2HR"}`,
    parts: (w, d) => [...base(w, d, 4), ...fullDoor(w, false), [rod(w), 1], [KIT, 1]],
    look: () => ({ doors: "solid", shelves: [46, 86.5], rods: [83.5, 43] }),
  },
  {
    id: "glass", group: "Glass doors", name: "Glass door, shelves",
    depths: ["S", "D"], widths: WIDTHS, hinged: true,
    code: (w, d) => `${moduleCode(w, d)}-${w <= 24 ? "1GD" : "2GD"}`,
    parts: (w, d) => [...base(w, d, 4), ...fullDoor(w, true), [KIT, 1]],
    look: () => ({ doors: "glass", shelves: evenly(5) }),
  },
  {
    id: "glasshr", group: "Glass doors", name: "Glass door, hanging",
    depths: ["D"], widths: WIDTHS, hinged: true,
    code: (w, d) => `${moduleCode(w, d)}-${w <= 24 ? "1GD1HR" : "2GD2HR"}`,
    parts: (w, d) => [...base(w, d, 4), ...fullDoor(w, true), [rod(w), 1], [KIT, 1]],
    look: () => ({ doors: "glass", shelves: [46, 86.5], rods: [83.5, 43] }),
  },
  {
    id: "3dr", group: "Drawers", name: "Door over 3 drawers",
    depths: ["S", "D"], widths: WIDTHS, hinged: true,
    code: (w, d) => `${moduleCode(w, d)}-3DR`,
    parts: (w, d) => [...base(w, d, d === "D" && w <= 21 ? 4 : 3), ...doorOverDrawers(w, false), ...drawers(w, d), [KIT, 1]],
    look: () => ({ doors: "solid", drawers: true, shelves: [TOE + DRAWER_ZONE, 52, 68] }),
  },
  {
    id: "3gdr", group: "Drawers", name: "Glass door over 3 drawers",
    depths: ["S", "D"], widths: WIDTHS, hinged: true,
    code: (w, d) => `${moduleCode(w, d)}-3GDR`,
    parts: (w, d) => [...base(w, d, d === "D" && w <= 21 ? 4 : 3), ...doorOverDrawers(w, true), ...drawers(w, d), [KIT, 1]],
    look: () => ({ doors: "glass", drawers: true, shelves: [TOE + DRAWER_ZONE, 52, 68] }),
  },
  {
    id: "3gdrhr", group: "Drawers", name: "Glass door, hanging, 3 drawers",
    depths: ["D"], widths: WIDTHS, hinged: true,
    code: (w, d) => `${moduleCode(w, d)}-3GDR-1HR`,
    parts: (w, d) => [...base(w, d, d === "D" && w <= 21 ? 4 : 3), ...doorOverDrawers(w, true), ...drawers(w, d), [rod(w), 1], [KIT, 1]],
    look: () => ({ doors: "glass", drawers: true, shelves: [TOE + DRAWER_ZONE, 86.5], rods: [83.5] }),
  },
  {
    id: "shoe", group: "Shoes", name: "Shoe rack",
    depths: ["S"], widths: SHOE_WIDTHS,
    code: (w, d) => `${moduleCode(w, d)} + SR${w}`,
    parts: (w, d) => [...base(w, d, 1), [`SR${w}`, 1], [KIT, 1]],
    look: () => ({ shelves: [77], shoe: true }),
  },
];

export const GROUPS = ["Shelving", "Hanging", "Doors", "Glass doors", "Drawers", "Shoes"];

// Filler strip: closes a gap between the modules and a wall. Cut to any width up to 6".
// PART NUMBER IS A PLACEHOLDER until Artisan confirms its filler part.
export const FILLER_MIN = 0.5, FILLER_MAX = 6;
export const FILLER_PART = 'Filler 6" x 90" (cut to fit)';
export const FILLER = {
  id: "filler", group: "Filler", name: "Filler strip", filler: true,
  depths: ["S", "D"], widths: [],
  code: (w) => `FILLER ${+w.toFixed(2)}"`,
  parts: () => [[FILLER_PART, 1]],
  look: () => ({ filler: true }),
};
export const styleById = Object.fromEntries([...STYLES, FILLER].map((s) => [s.id, s]));
export const clampFiller = (w) => Math.min(FILLER_MAX, Math.max(FILLER_MIN, Math.round((+w || 0) * 4) / 4));

// Crown moulding along the tops of the cabinets, in the cabinet finish. Sold in 8' lengths,
// cut and mitered on site. PART NUMBERS AND PROFILES ARE PLACEHOLDERS until Artisan confirms them.
// Profile points are (out, up) in inches: `out` from the cabinet fronts, `up` from the cabinet top.
// The part behind the fronts (out < 0) sits on the cabinet top.
export const CROWN_STICK = 96;
const arc = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
export const CROWNS = {
  flat: {
    name: "Flat", note: "a clean, modern step", h: 3, proj: 1,
    part: "Crown moulding, flat 8' (cut to fit)",
    pts: [[-1.5, 0], [0.25, 0], [0.25, 2.25], [1, 2.25], [1, 3], [-1.5, 3]],
  },
  cove: {
    name: "Cove", note: "a soft curve, transitional", h: 2.75, proj: 1.75,
    part: "Crown moulding, cove 8' (cut to fit)",
    pts: [[-1.5, 0], [0.25, 0], ...arc(10, (t) => [1.5 + 1.25 * Math.cos(Math.PI * (1 - t / 2)), 0.5 + 1.25 * Math.sin(Math.PI * (1 - t / 2))]), [1.75, 1.75], [1.75, 2.75], [-1.5, 2.75]],
  },
  classic: {
    name: "Classic", note: "a traditional ogee with a bead", h: 4, proj: 2.5,
    part: "Crown moulding, classic 8' (cut to fit)",
    pts: [[-1.5, 0], [0.3, 0], [0.3, 0.6], ...arc(6, (t) => [0.3 + 0.3 * Math.sin(Math.PI * t), 0.9 - 0.3 * Math.cos(Math.PI * t)]).slice(1),
      ...arc(14, (t) => [0.3 + 1.9 * (1 - Math.cos(Math.PI * t)) / 2, 1.2 + 2 * t]).slice(1), [2.5, 3.2], [2.5, 4], [-1.5, 4]],
  },
};

// Easy-reach corner modules (catalog p.5): an L footprint of size x size.
export const CORNERS = [
  { code: "ER3090", size: 30, depth: "S", backPart: "SO CBP3015", tb: "SO CTB3015", shelf: "SO S30ER", side: "SO SP1590" },
  { code: "ER3690", size: 36, depth: "S", backPart: "SO CBP3615", tb: "SO CTB3615", shelf: "SO S36ER", side: "SO SP1590" },
  { code: "ER4290", size: 42, depth: "D", backPart: "SO CBP4224", tb: "SO CTB4224", shelf: "SO S42ER", side: "SO SP2490" },
];
export const CORNER_INTERIORS = [
  { id: "5s", name: "Corner shelves", suffix: "-5S", look: { shelves: evenly(5) } },
  { id: "2hr", name: "Corner hanging", suffix: "-2HR", look: { shelves: [46, 86.5], rods: [83.5, 43] } },
  { id: "2d2hr", name: "Corner with doors", suffix: "-2D2HR", only: "ER4290", look: { doors: "solid", shelves: [46, 86.5], rods: [83.5, 43] } },
];
export const cornerByCode = Object.fromEntries(CORNERS.map((c) => [c.code, c]));

export function cornerParts(code, interior) {
  const c = cornerByCode[code];
  const parts = [[c.side, 1], [c.tb, 1], [c.backPart, 1]];
  if (interior === "5s") parts.push([c.shelf, 4]);
  if (interior === "2hr" && code === "ER4290") parts.push([c.shelf, 1]);
  if (interior === "2d2hr") parts.push(["SO ER4290-FD", 1]);
  parts.push([KIT, 1]);
  return parts;
}
export const cornerCode = (code, interior) =>
  code + CORNER_INTERIORS.find((i) => i.id === interior).suffix;

// --- helpers -----------------------------------------------------------------
export function evenly(n) {
  const lo = TOE + T, hi = HEIGHT - T, step = (hi - lo) / (n + 1);
  return Array.from({ length: n }, (_, i) => +(lo + step * (i + 1)).toFixed(2));
}

export function allowedWidths(styleId, depth) {
  const s = styleById[styleId];
  return s.depths.includes(depth) ? s.widths : [];
}

// Best combination of allowed widths that fits `space`: most wall used, then fewest modules.
export function fillWidths(space, widths) {
  const max = Math.floor(space);
  if (max < Math.min(...widths)) return [];
  const best = new Array(max + 1).fill(null);
  best[0] = [];
  for (let s = 1; s <= max; s++) {
    for (const w of widths) {
      if (w <= s && best[s - w]) {
        const cand = [...best[s - w], w];
        if (!best[s] || cand.length < best[s].length) best[s] = cand;
      }
    }
  }
  for (let s = max; s >= 0; s--) if (best[s]) return best[s].sort((a, b) => b - a);
  return [];
}

// --- custom interiors --------------------------------------------------------------
// Any module can be built up from the same catalog parts: a carcass plus the
// shelves, rods, drawer bank, shoe rack and doors the customer chooses.
// c = { doors: null | "solid" | "glass", drawers: bool, shoe: bool, shelves: [heights], rods: [heights] }
export const SNAP = 0.5;                       // shelf and rod heights move in 1/2" steps
export const DRAWER_TOP = TOE + DRAWER_ZONE;    // fixed shelf over the drawer bank
export const SHOE_TOP = 72;                     // the shoe rack fills the space below this
export const ROD_DROP = 24;                     // hanging space a rod needs below it
export const MIN_GAP = 2;                       // between two shelves or rods
export const MAX_SHELVES = 12;
export const CUSTOM_SHOE_WIDTHS = SHOE_WIDTHS;

export function customFromLook(look) {
  const c = {
    doors: look.doors || null,
    drawers: !!look.drawers,
    shoe: !!look.shoe,
    shelves: [...(look.shelves || [])],
    rods: [...(look.rods || [])],
  };
  if (c.shoe) c.shelves = c.shelves.filter((y) => y >= SHOE_TOP);
  return normalizeCustom(c);
}

export function normalizeCustom(c) {
  const shelves = [...new Set((c.shelves || []).map((y) => +(+y).toFixed(2)))];
  if (c.drawers && !shelves.includes(DRAWER_TOP)) shelves.push(DRAWER_TOP);
  return {
    doors: c.doors === "solid" || c.doors === "glass" ? c.doors : null,
    drawers: !!c.drawers && !c.shoe,
    shoe: !!c.shoe,
    shelves: shelves.filter((y) => !(y === DRAWER_TOP && !c.drawers)).sort((a, b) => a - b),
    rods: [...new Set((c.rods || []).map((y) => +(+y).toFixed(2)))].sort((a, b) => a - b),
  };
}

export const customLook = (c) => ({ doors: c.doors, drawers: c.drawers, shoe: c.shoe, shelves: [...c.shelves], rods: [...c.rods] });

export function customParts(w, d, c) {
  const glass = c.doors === "glass";
  const parts = [[side(d), 1], [topBottom(w, d), 1], [back(w), 1]];
  if (c.shelves.length) parts.push([shelf(w, d), c.shelves.length]);
  if (c.rods.length) parts.push([rod(w), c.rods.length]);
  if (c.drawers) parts.push(...drawers(w, d));
  if (c.shoe) parts.push([`SR${w}`, 1]);
  if (c.doors) parts.push(...(c.drawers ? doorOverDrawers(w, glass) : fullDoor(w, glass)));
  parts.push([KIT, 1]);
  return parts;
}

export const customCode = (w, d) => `${moduleCode(w, d)}-CUSTOM`;

export function customName(c) {
  const bits = [];
  const n = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : "");
  const shelves = c.shelves.filter((y) => !(c.drawers && y === DRAWER_TOP)).length;
  bits.push(n(c.rods.length, "rod", "rods"), n(shelves, "shelf", "shelves"));
  if (c.drawers) bits.push("3 drawers");
  if (c.shoe) bits.push("shoe rack");
  if (c.doors) bits.push(`${c.doors} door${c.drawers ? "" : "s"}`);
  return `Custom: ${bits.filter(Boolean).join(", ") || "empty"}`;
}

// What stops a custom interior from being built. Empty when it is fine.
export function customProblems(w, d, c) {
  const out = [];
  const lo = (c.drawers ? DRAWER_TOP : TOE + T) + MIN_GAP;
  const hi = HEIGHT - T - MIN_GAP;
  if (c.doors && c.rods.length && d !== "D") out.push('Doors over hanging clothes need the 23.75" depth.');
  if (c.shoe && !SHOE_WIDTHS.includes(w)) out.push(`Shoe racks come in ${SHOE_WIDTHS.join(", ")}" widths.`);
  if (c.shoe && [...c.shelves, ...c.rods].some((y) => y < SHOE_TOP)) out.push(`Keep the bottom ${SHOE_TOP}" clear for the shoe rack.`);
  const items = [...c.shelves.filter((y) => !(c.drawers && y === DRAWER_TOP)).map((y) => ["Shelf", y]), ...c.rods.map((y) => ["Rod", y])];
  if (items.some(([, y]) => y < lo || y > hi)) out.push(`Shelves and rods go between ${lo}" and ${hi}" from the floor.`);
  const all = [...c.shelves, ...c.rods].sort((a, b) => a - b);
  for (let i = 1; i < all.length; i++) if (all[i] - all[i - 1] < MIN_GAP) { out.push(`Leave at least ${MIN_GAP}" between shelves and rods.`); break; }
  const floors = [TOE + T, ...c.shelves, ...(c.shoe ? [SHOE_TOP] : [])];
  for (const r of c.rods) {
    const below = Math.max(...floors.filter((y) => y < r), ...c.rods.filter((y) => y < r));
    if (r - below < ROD_DROP) { out.push(`A rod needs ${ROD_DROP}" of hanging space below it (the rod at ${r}" has ${+(r - below).toFixed(2)}").`); break; }
  }
  if (c.shelves.length > MAX_SHELVES) out.push(`Up to ${MAX_SHELVES} shelves per module.`);
  return out;
}

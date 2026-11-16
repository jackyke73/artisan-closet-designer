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
export const styleById = Object.fromEntries(STYLES.map((s) => [s.id, s]));

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

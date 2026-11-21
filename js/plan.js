// Floor plan (top view) as SVG, with closet codes and dimensions.
// Plan coordinates match the 3D view: x runs along the back wall, y (the 3D z)
// comes out from the back wall into the room.
import { DEPTHS, cornerByCode } from "./catalog.js";
import { activeWalls, wallGeometry, moduleInfo, cornerInfo, WALL_NAMES } from "./design.js";

const WALL = 4;       // drawn wall thickness
const REACH_DEPTH = 30; // drawn depth of a reach-in closet

const n = (v) => +v.toFixed(2);

function dimH(x0, x1, y, label, cls = "") {
  return `<g class="dim ${cls}"><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/>` +
    `<line x1="${x0}" x2="${x0}" y1="${y - 2.5}" y2="${y + 2.5}"/><line x1="${x1}" x2="${x1}" y1="${y - 2.5}" y2="${y + 2.5}"/>` +
    `<text x="${(x0 + x1) / 2}" y="${y - 1.6}">${label}</text></g>`;
}
function dimV(y0, y1, x, label, cls = "") {
  const ym = (y0 + y1) / 2;
  return `<g class="dim ${cls}"><line x1="${x}" x2="${x}" y1="${y0}" y2="${y1}"/>` +
    `<line x1="${x - 2.5}" x2="${x + 2.5}" y1="${y0}" y2="${y0}"/><line x1="${x - 2.5}" x2="${x + 2.5}" y1="${y1}" y2="${y1}"/>` +
    `<text x="${x - 1.6}" y="${ym}" transform="rotate(-90 ${x - 1.6} ${ym})">${label}</text></g>`;
}

// One module in its own coordinates: x along the wall (0..w), y out from the wall (0..d).
function moduleShape(m, info, selected) {
  const d = DEPTHS[m.depth].inches;
  const w = m.w;
  const look = info.look;
  if (look.filler) return `<rect x="0" y="${d - 0.75}" width="${w}" height="0.75" class="box filler${selected ? " sel" : ""}"/>` +
    `<rect x="0" y="0" width="${w}" height="${d}" class="fillzone"/>`;
  const s = [`<rect x="0" y="0" width="${w}" height="${d}" class="box${selected ? " sel" : ""}"/>`];
  if (look.rods?.length) s.push(`<line x1="1" x2="${w - 1}" y1="${Math.min(d / 2, 11)}" y2="${Math.min(d / 2, 11)}" class="rod"/>`);
  if (look.doors) {
    const leaves = w <= 24 ? [m.hinge === "R" ? "R" : "L"] : ["L", "R"];
    const lw = w / leaves.length;
    leaves.forEach((side, i) => {
      const hx = side === "L" ? i * lw : (i + 1) * lw;
      const fx = side === "L" ? hx + lw : hx - lw;
      const sweep = side === "L" ? 1 : 0;
      s.push(`<path d="M${hx} ${d} L${hx} ${d + lw} A${lw} ${lw} 0 0 ${sweep} ${fx} ${d}" class="swing"/>`);
    });
  }
  if (look.drawers) s.push(`<line x1="0.6" x2="${w - 0.6}" y1="${d - 1.6}" y2="${d - 1.6}" class="thin"/>`);
  s.push(`<text x="${w / 2}" y="${d / 2 - 0.6}" class="code">${info.code}</text>`);
  s.push(`<text x="${w / 2}" y="${d / 2 + 3.6}" class="size">${w}" × ${d}"</text>`);
  return s.join("");
}

export function planHtml(design, selected) {
  const walls = activeWalls(design);
  const geo = wallGeometry(design);
  const W = design.walls.back.width;
  const reach = design.layout === "reach";
  const sideLen = reach ? REACH_DEPTH : Math.max(...walls.filter((k) => k !== "back").map((k) => design.walls[k].width));
  const RD = sideLen;
  const out = [];

  // walls
  out.push(`<rect x="${-WALL}" y="${-WALL}" width="${W + 2 * WALL}" height="${WALL}" class="wall"/>`);
  const hasLeft = true, hasRight = design.layout !== "L";
  if (hasLeft) out.push(`<rect x="${-WALL}" y="0" width="${WALL}" height="${reach ? RD : design.walls.left.width}" class="wall"/>`);
  if (hasRight) out.push(`<rect x="${W}" y="0" width="${WALL}" height="${reach ? RD : design.walls.right.width}" class="wall"/>`);
  if (reach) {
    out.push(`<rect x="${-WALL - 30}" y="${RD}" width="${WALL + 30}" height="${WALL}" class="wall"/>`);
    out.push(`<rect x="${W}" y="${RD}" width="${WALL + 30}" height="${WALL}" class="wall"/>`);
    out.push(`<line x1="0" x2="${W}" y1="${RD + WALL / 2}" y2="${RD + WALL / 2}" class="opening"/>`);
    out.push(`<text x="${W / 2}" y="${RD + WALL + 7}" class="note">Closet opening</text>`);
  } else {
    out.push(`<line x1="0" x2="${W}" y1="${RD}" y2="${RD}" class="opening"/>`);
    out.push(`<text x="${W / 2}" y="${RD + 7}" class="note">Entry side</text>`);
    if (!hasRight) out.push(`<line x1="${W}" x2="${W}" y1="0" y2="${RD}" class="opening"/>`);
  }

  // corners (L-shaped, back-left drawn first, right mirrored)
  for (const side of ["left", "right"]) {
    const c = design.corners[side];
    if (!c || !walls.includes(side)) continue;
    const spec = cornerByCode[c.code];
    const S = spec.size, d = DEPTHS[spec.depth].inches;
    const mx = (x) => (side === "right" ? W - x : x);
    const pts = [[0, 0], [S, 0], [S, d], [d, d], [d, S], [0, S]].map(([x, y]) => `${mx(x)},${y}`).join(" ");
    const info = cornerInfo(c);
    out.push(`<polygon points="${pts}" class="box corner"/>`);
    out.push(`<text x="${mx(S / 2)}" y="${d / 2 + 1}" class="code">${info.code}</text>`);
  }

  // modules on each wall, placed with the same transforms as the 3D view
  for (const k of walls) {
    let s = geo[k].start;
    design.walls[k].modules.forEach((m, i) => {
      const info = moduleInfo(m);
      const sel = selected && selected.wall === k && selected.index === i;
      const t = k === "back" ? `translate(${s} 0)`
        : k === "left" ? `matrix(0 -1 1 0 0 ${s + m.w})`
        : `matrix(0 1 -1 0 ${W} ${s})`;
      out.push(`<g class="mod" data-wall="${k}" data-index="${i}" transform="${t}">${moduleShape(m, info, sel)}</g>`);
      if (k === "back") out.push(dimH(s, s + m.w, -WALL - 8, `${m.w}"`));
      if (k === "left") out.push(dimV(s, s + m.w, -WALL - 8, `${m.w}"`));
      if (k === "right") out.push(dimV(s, s + m.w, W + WALL + 12, `${m.w}"`));
      s += m.w;
    });
    const g = geo[k];
    if (g.free > 0.01) {
      if (k === "back") out.push(dimH(s, s + g.free, -WALL - 8, `${g.free}" open`, "muted"));
      if (k === "left") out.push(dimV(s, s + g.free, -WALL - 8, `${g.free}" open`, "muted"));
      if (k === "right") out.push(dimV(s, s + g.free, W + WALL + 12, `${g.free}" open`, "muted"));
    }
  }

  // overall dimensions
  out.push(dimH(0, W, -WALL - 20, `Back wall ${n(W)}"`, "strong"));
  if (!reach) {
    if (walls.includes("left")) out.push(dimV(0, design.walls.left.width, -WALL - 20, `Left wall ${n(design.walls.left.width)}"`, "strong"));
    if (walls.includes("right")) out.push(dimV(0, design.walls.right.width, W + WALL + 24, `Right wall ${n(design.walls.right.width)}"`, "strong"));
  }

  const x0 = -WALL - 34, y0 = -WALL - 30;
  const x1 = W + WALL + (reach ? 40 : 34), y1 = RD + WALL + 14;
  return `<figure class="elev plan"><figcaption>Floor plan · ${WALL_NAMES.back.toLowerCase()} at top</figcaption>
  <svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet">
    <rect x="${-WALL}" y="0" width="${W + 2 * WALL}" height="${RD}" class="floorarea"/>
    ${out.join("")}
  </svg></figure>`;
}

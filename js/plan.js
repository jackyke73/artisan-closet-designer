// Floor plan (top view) as SVG, with closet codes and dimensions.
// Plan coordinates match the 3D view: x runs along the back wall, y (the 3D z)
// comes out from the back wall into the room.
import { DEPTHS, HEIGHT, cornerByCode } from "./catalog.js";
import { activeWalls, wallGeometry, moduleInfo, cornerInfo, cornerOn, roomDepth, isWalk, wallLength, WALL_NAMES, clashSet, isCustom, shapeWalls, shapeBox, insideCornerAt , cabinetTop } from "./design.js";

let WALL = 4.5;     // drawn wall thickness, set from the design
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
function moduleShape(m, info, selected, upright = "") {
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
  // upright: a transform that keeps the labels readable on walls drawn upside down
  s.push(`<g${upright}><text x="${w / 2}" y="${d / 2 - 0.6}" class="code">${info.code}</text>`);
  s.push(`<text x="${w / 2}" y="${d / 2 + 3.6}" class="size">${w}" × ${d}"</text></g>`);
  return s.join("");
}

// A wall drawn as solid pieces with gaps for its windows and doors.
// Returns svg for wall k between u0 and u1 (in the wall's own direction).
function wallWithOpenings(design, k, u0, u1, W, RD) {
  const ops = design.openings.filter((o) => o.wall === k && (isWalk(design) || k === "back")).sort((a, b) => a.at - b.at);
  const out = [];
  const rect = (a, b) => {
    if (b - a < 0.01) return;
    if (k === "back") out.push(`<rect x="${a}" y="${-WALL}" width="${b - a}" height="${WALL}" class="wall"/>`);
    if (k === "front") out.push(`<rect x="${a}" y="${RD}" width="${b - a}" height="${WALL}" class="wall"/>`);
    if (k === "left") out.push(`<rect x="${-WALL}" y="${a}" width="${WALL}" height="${b - a}" class="wall"/>`);
    if (k === "right") out.push(`<rect x="${W}" y="${a}" width="${WALL}" height="${b - a}" class="wall"/>`);
  };
  let u = u0;
  const side = k === "left" || k === "right";
  for (const o of ops) {
    rect(u, Math.max(u, o.at));
    u = Math.max(u, o.at + o.w);
    // position along the wall -> plan coordinates
    const P = (along, off) => (k === "back" ? [along, -off] : k === "front" ? [along, RD + off] : k === "left" ? [-off, along] : [W + off, along]);
    if (o.kind === "window") {
      const [x0, y0] = P(o.at, WALL / 2), [x1, y1] = P(o.at + o.w, WALL / 2);
      const [a0, b0] = P(o.at, 0), [a1, b1] = P(o.at + o.w, WALL);
      out.push(`<rect x="${Math.min(a0, a1)}" y="${Math.min(b0, b1)}" width="${Math.abs(a1 - a0)}" height="${Math.abs(b1 - b0)}" class="winbox"/>`);
      out.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="glass"/>`);
      const [tx, ty] = P(o.at + o.w / 2, k === "back" ? WALL + 4 : k === "front" ? WALL + 7 : WALL + 3.2);
      out.push(`<text x="${tx}" y="${ty}" class="note"${side ? ` transform="rotate(-90 ${tx} ${ty})"` : ""}>Window ${o.w}"${o.sill >= HEIGHT ? "" : `, sill ${o.sill}"`}</text>`);
    } else {
      // swing arc into the room (or out), hinged at the start of the opening
      const inward = o.swing !== "out";
      const r = o.w;
      const sgn = inward ? 1 : -1;
      const face = inward ? 0 : WALL;
      const [hx, hy] = P(o.at, face), [ex, ey] = P(o.at + o.w, face), [lx, ly] = P(o.at, face - sgn * r);
      const sweep = (k === "back" || k === "right") === inward ? 1 : 0;
      out.push(`<line x1="${hx}" y1="${hy}" x2="${lx}" y2="${ly}" class="doorleaf"/>`);
      out.push(`<path d="M${lx} ${ly} A${r} ${r} 0 0 ${sweep} ${ex} ${ey}" class="swing"/>`);
      const [tx, ty] = P(o.at + o.w / 2, k === "front" ? WALL + 7 : k === "back" ? WALL + 4 : WALL + 3.2);
      out.push(`<text x="${tx}" y="${ty}" class="note"${side ? ` transform="rotate(-90 ${tx} ${ty})"` : ""}>${k === "front" ? "Entry " : ""}door ${o.w}"</text>`);
    }
  }
  rect(u, u1);
  return out.join("");
}

// Walking room left between the cabinet runs of a walk-in, for the plan.
function clearances(design, W, RD) {
  if (!isWalk(design)) return [];
  const runDepth = (k) => {
    if (!activeWalls(design).includes(k)) return 0;
    const ds = design.walls[k].modules.filter((m) => m.style !== "filler").map((m) => DEPTHS[m.depth].inches);
    const c = (k === "left" || k === "right") && cornerOn(design, k) ? DEPTHS[cornerByCode[cornerOn(design, k).code].depth].inches : 0;
    return Math.max(0, c, ...ds);
  };
  const L = runDepth("left"), R = runDepth("right"), B = runDepth("back");
  const out = [];
  const tight = (v) => (v < 30 ? " tight" : "");
  if (L || R) {
    const z = B + (RD - B) * 0.55;
    const v = W - L - R;
    out.push(dimH(L, W - R, z, `Walkway ${n(v)}"${v < 30 ? " · tight" : ""}`, `clear${tight(v)}`));
  }
  if (B) {
    const v = RD - B;
    out.push(dimV(B, RD, Math.max(L + 8, W - R - 8), `Clear ${n(v)}"${v < 30 ? " · tight" : ""}`, `clear${tight(v)}`));
  }
  return out;
}

// A dimension line from a to b (floor points), with the label turned to read along it.
function dimAt(a, b, label, cls = "") {
  const [x0, y0] = a, [x1, y1] = b;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len * 2.5, ny = (x1 - x0) / len * 2.5;
  let ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  if (ang > 90.5 || ang <= -89.5) ang += 180;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const off = 1.6;
  // text sits on the side the line was offset to (above it when read)
  const r = (ang * Math.PI) / 180;
  const tx = mx + Math.sin(r) * off, ty = my - Math.cos(r) * off;
  return `<g class="dim ${cls}"><line x1="${n(x0)}" y1="${n(y0)}" x2="${n(x1)}" y2="${n(y1)}"/>` +
    `<line x1="${n(x0 - nx)}" y1="${n(y0 - ny)}" x2="${n(x0 + nx)}" y2="${n(y0 + ny)}"/><line x1="${n(x1 - nx)}" y1="${n(y1 - ny)}" x2="${n(x1 + nx)}" y2="${n(y1 + ny)}"/>` +
    `<text x="${n(tx)}" y="${n(ty)}" transform="rotate(${n(ang)} ${n(tx)} ${n(ty)})">${label}</text></g>`;
}

// Floor plan of a custom room: the outline's walls (which can be dragged to resize the room),
// windows and doors, cabinets on any wall, and every wall's length.
function customPlan(design, selected, { grid = false } = {}) {
  WALL = design.wallT || 4.5;
  const ws = shapeWalls(design);
  const geo = wallGeometry(design);
  const box = shapeBox(design);
  const clash = clashSet(design);
  const out = [], over = [], dims = [];
  const P = (f, t, off) => [f.A[0] + f.u[0] * t - f.n[0] * off, f.A[1] + f.u[1] * t - f.n[1] * off]; // off: out of the room
  const quad = (f, t0, t1, o0, o1) => [P(f, t0, o0), P(f, t1, o0), P(f, t1, o1), P(f, t0, o1)].map((p) => p.map(n).join(",")).join(" ");
  ws.forEach((f, i) => {
    const next = ws[(i + 1) % ws.length];
    const t0 = insideCornerAt(ws, i) ? 0 : 0, t1 = f.len + (insideCornerAt(ws, next.i) ? WALL : 0);
    const ops = design.openings.filter((o) => o.wall === f.k).sort((a, b) => a.at - b.at);
    // the wall as solid pieces around its openings, plus an invisible wider strip to grab
    let u = t0;
    const pieces = [];
    for (const o of ops) { if (o.at > u) pieces.push([u, o.at]); u = Math.max(u, o.at + o.w); }
    if (t1 > u) pieces.push([u, t1]);
    out.push(`<g class="cwall ${Math.abs(f.u[0]) > 0.5 ? "h" : "v"}" data-edge="${i}">${pieces.map(([a, b]) => `<polygon points="${quad(f, a, b, 0, WALL)}" class="wall"/>`).join("")}` +
      `<polygon points="${quad(f, 0, f.len, -3, WALL + 3)}" class="grab"/></g>`);
    for (const o of ops) {
      if (o.kind === "window") {
        out.push(`<polygon points="${quad(f, o.at, o.at + o.w, 0, WALL)}" class="winbox"/>`);
        const [a, b] = [P(f, o.at, WALL / 2), P(f, o.at + o.w, WALL / 2)];
        out.push(`<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" class="glass"/>`);
      } else {
        const inward = o.swing !== "out";
        const face = inward ? 0 : WALL, r = o.w;
        const H0 = P(f, o.at, face), E = P(f, o.at + o.w, face), L = P(f, o.at, face + (inward ? -r : r));
        const cross = (L[0] - H0[0]) * (E[1] - H0[1]) - (L[1] - H0[1]) * (E[0] - H0[0]);
        out.push(`<line x1="${n(H0[0])}" y1="${n(H0[1])}" x2="${n(L[0])}" y2="${n(L[1])}" class="doorleaf"/>`);
        out.push(`<path d="M${n(L[0])} ${n(L[1])} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${n(E[0])} ${n(E[1])}" class="swing"/>`);
      }
      const [tx, ty] = P(f, o.at + o.w / 2, -5);
      let ang = (Math.atan2(f.u[1], f.u[0]) * 180) / Math.PI;
      if (ang > 90.5 || ang <= -89.5) ang += 180;
      over.push(`<text x="${n(tx)}" y="${n(ty)}" class="note" transform="rotate(${n(ang)} ${n(tx)} ${n(ty)})">${o.kind === "window" ? "Window" : "Door"} ${o.w}"</text>`);
    }
    // cabinets
    let s = geo[f.k]?.start || 0;
    const upright = f.u[0] < -0.5 || f.u[1] > 0.5;
    const cabs = design.cab[f.k] ? design.walls[f.k].modules : [];
    const marks = [s];
    cabs.forEach((m, j) => {
      const info = moduleInfo(m);
      const sel = selected && selected.wall === f.k && selected.index === j;
      const t = `matrix(${f.u[0]} ${f.u[1]} ${f.n[0]} ${f.n[1]} ${n(f.A[0] + f.u[0] * s)} ${n(f.A[1] + f.u[1] * s)})`;
      const d = DEPTHS[m.depth].inches;
      const flip = upright ? ` transform="rotate(180 ${m.w / 2} ${d / 2 + 1.5})"` : "";
      out.push(`<g class="mod${clash.has(`${f.k}:${j}`) ? " clash" : ""}" data-wall="${f.k}" data-index="${j}" transform="${t}">${moduleShape(m, info, sel, flip)}</g>`);
      s += m.w;
      marks.push(s);
    });
    // dimensions outside the wall: module widths, then the wall's length
    let off = WALL + 7;
    if (cabs.length) {
      for (let j = 0; j < cabs.length; j++) dims.push(dimAt(P(f, marks[j], off), P(f, marks[j + 1], off), `${cabs[j].w}"`));
      const g = geo[f.k];
      if (g.free > 0.01) dims.push(dimAt(P(f, g.openAt, off), P(f, g.openAt + g.free, off), `${g.free}" open`, "muted"));
      off += 9;
    }
    dims.push(dimAt(P(f, 0, off), P(f, f.len, off), `${WALL_NAMES[f.k]} · ${n(f.len)}"`, "strong wlen"));
    // wall name inside the room
    const tName = [0.5, 0.25, 0.75, 0.15, 0.85].map((q) => f.len * q).find((t) => !ops.some((o) => t > o.at - 10 && t < o.at + o.w + 10)) ?? f.len / 2;
    const [lx, ly] = P(f, tName, -6);
    if (!cabs.length && f.len >= 30) over.push(`<text x="${n(lx)}" y="${n(ly)}" class="note wname">${WALL_NAMES[f.k]}</text>`);
  });
  for (const b of design.obstacles) {
    over.push(`<rect x="${b.x}" y="${b.z}" width="${b.w}" height="${b.d}" class="${b.kind === "column" ? "column" : "soffit"}"/>`);
    over.push(`<text x="${b.x + b.w / 2}" y="${b.z + b.d / 2 + 1}" class="note">${b.kind === "column" ? "Column" : `Soffit ${b.bottom}"`}</text>`);
  }
  const pad = WALL + 30;
  const x0 = box.x0 - pad, y0 = box.z0 - pad, x1 = box.x0 + box.W + pad, y1 = box.z0 + box.D + pad;
  const poly = design.shape.pts.map((p) => p.join(",")).join(" ");
  let gridLines = "";
  if (grid) {
    const g = [];
    for (let x = 12; x < box.W; x += 12) g.push(`<line x1="${x}" x2="${x}" y1="0" y2="${box.D}" class="${x % 48 ? "" : "major"}"/>`);
    for (let y = 12; y < box.D; y += 12) g.push(`<line x1="0" x2="${box.W}" y1="${y}" y2="${y}" class="${y % 48 ? "" : "major"}"/>`);
    gridLines = `<clipPath id="roomclip"><polygon points="${poly}"/></clipPath><g class="grid" clip-path="url(#roomclip)">${g.join("")}</g>`;
  }
  return `<figure class="elev plan custom" data-key="plan"><figcaption>Floor plan · custom room${grid ? " · grid 1 ft" : ""} · drag a wall to move it</figcaption>
  <svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet">
    <polygon points="${poly}" class="floorarea"/>
    ${gridLines}
    ${out.join("")}
    ${over.join("")}
    ${dims.join("")}
  </svg></figure>`;
}

export function planHtml(design, selected, { grid = false, clear = true } = {}) {
  if (isCustom(design)) return customPlan(design, selected, { grid });
  WALL = design.wallT || 4.5;
  const walls = activeWalls(design);
  const geo = wallGeometry(design);
  const W = design.walls.back.width;
  const walk = isWalk(design);
  const reach = !walk;
  const RD = roomDepth(design);
  const out = [];
  const clash = clashSet(design);

  // walls, with gaps for windows and doors
  out.push(wallWithOpenings(design, "back", -WALL, W + WALL, W, RD));
  out.push(wallWithOpenings(design, "left", 0, RD, W, RD));
  out.push(wallWithOpenings(design, "right", 0, RD, W, RD));
  if (reach) {
    out.push(`<rect x="${-WALL - 30}" y="${RD}" width="${WALL + 30}" height="${WALL}" class="wall"/>`);
    out.push(`<rect x="${W}" y="${RD}" width="${WALL + 30}" height="${WALL}" class="wall"/>`);
    out.push(`<line x1="0" x2="${W}" y1="${RD + WALL / 2}" y2="${RD + WALL / 2}" class="opening"/>`);
    out.push(`<text x="${W / 2}" y="${RD + WALL + 7}" class="note">Closet opening</text>`);
  } else {
    out.push(wallWithOpenings(design, "front", -WALL, W + WALL, W, RD));
  }

  // sloped ceiling: shade where it is under the cabinet height
  const sl = design.slope;
  const top = cabinetTop(design);
  if (sl && sl.knee < top && design.ceiling > sl.knee) {
    const low = Math.min(sl.run, (sl.run * (top - sl.knee)) / (design.ceiling - sl.knee));
    const zone = sl.wall === "back" ? [0, 0, W, low] : sl.wall === "left" ? [0, 0, low, RD] : [W - low, 0, low, RD];
    out.push(`<rect x="${zone[0]}" y="${zone[1]}" width="${zone[2]}" height="${zone[3]}" class="lowceil"/>`);
    const [tx, ty] = sl.wall === "back" ? [W / 2, low - 2] : [zone[0] + zone[2] / 2, RD / 2];
    out.push(`<text x="${tx}" y="${ty}" class="note low" ${sl.wall === "back" ? "" : `transform="rotate(-90 ${tx} ${ty})"`}>Ceiling under ${top}"</text>`);
  }
  // columns and soffits (drawn over the cabinets, see below)
  const over = [];
  for (const b of design.obstacles) {
    over.push(`<rect x="${b.x}" y="${b.z}" width="${b.w}" height="${b.d}" class="${b.kind === "column" ? "column" : "soffit"}"/>`);
    over.push(`<text x="${b.x + b.w / 2}" y="${b.z + b.d / 2 + 1}" class="note">${b.kind === "column" ? "Column" : `Soffit ${b.bottom}"`}</text>`);
  }

  // corners (L-shaped, back-left drawn first, right mirrored)
  for (const side of ["left", "right"]) {
    const c = cornerOn(design, side);
    if (!c) continue;
    const spec = cornerByCode[c.code];
    const S = spec.size, d = DEPTHS[spec.depth].inches;
    const mx = (x) => (side === "right" ? W - x : x);
    const pts = [[0, 0], [S, 0], [S, d], [d, d], [d, S], [0, S]].map(([x, y]) => `${mx(x)},${y}`).join(" ");
    const info = cornerInfo(c);
    out.push(`<polygon points="${pts}" class="box corner${clash.has(`corner:${side}`) ? " clash" : ""}"/>`);
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
      out.push(`<g class="mod${clash.has(`${k}:${i}`) ? " clash" : ""}" data-wall="${k}" data-index="${i}" transform="${t}">${moduleShape(m, info, sel)}</g>`);
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

  out.push(...over);
  if (clear) out.push(...clearances(design, W, RD));
  // overall dimensions
  out.push(dimH(0, W, -WALL - 20, `Back wall ${n(W)}"`, "strong"));
  if (!reach) {
    out.push(dimV(0, RD, -WALL - 20, `Room depth ${n(RD)}"`, "strong"));
  }

  const x0 = -WALL - 34, y0 = -WALL - 30;
  const x1 = W + WALL + (reach ? 40 : 34), y1 = RD + WALL + 16;
  let gridLines = "";
  if (grid) {
    const g = [];
    for (let x = 12; x < W; x += 12) g.push(`<line x1="${x}" x2="${x}" y1="0" y2="${RD}" class="${x % 48 ? "" : "major"}"/>`);
    for (let y = 12; y < RD; y += 12) g.push(`<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="${y % 48 ? "" : "major"}"/>`);
    gridLines = `<g class="grid">${g.join("")}</g>`;
  }
  return `<figure class="elev plan" data-key="plan"><figcaption>Floor plan · ${WALL_NAMES.back.toLowerCase()} at top${grid ? " · grid 1 ft" : ""}</figcaption>
  <svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet">
    <rect x="${-WALL}" y="0" width="${W + 2 * WALL}" height="${RD}" class="floorarea"/>
    ${gridLines}
    ${out.join("")}
  </svg></figure>`;
}

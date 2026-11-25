// Front elevation of each wall as SVG, with closet codes and dimensions.
import { HEIGHT as H, TOE, DRAWER_ZONE, cornerByCode, CROWNS } from "./catalog.js";
import { activeWalls, wallGeometry, moduleInfo, cornerInfo, cornerOn, ceilingAt, roomDepth, isWalk, WALL_NAMES, clashSet, isCustom, wallFrame, wallLength, crownPlan } from "./design.js";

const PAD = { l: 34, r: 14, t: 34, b: 52 };

function fmt(inches) {
  const n = +inches.toFixed(2);
  const ft = Math.floor(n / 12), rem = +(n - ft * 12).toFixed(2);
  return `${n}"${n >= 12 ? ` (${ft}'${rem ? ` ${rem}"` : ""})` : ""}`;
}

export function drawModule(x, w, look, code, selected, lift = 0) {
  const s = [];
  const y = (v) => H - v; // svg y from floor height
  if (look.filler) {
    return `<rect x="${x}" y="${y(H)}" width="${w}" height="${H}" class="carcass filler${selected ? " sel" : ""}"/>` +
      `<text x="${x + w / 2}" y="${y(H / 2)}" class="fill-label" transform="rotate(-90 ${x + w / 2} ${y(H / 2)})">FILLER</text>`;
  }
  s.push(`<rect x="${x}" y="${y(H)}" width="${w}" height="${H}" class="carcass${selected ? " sel" : ""}"/>`);
  s.push(`<line x1="${x}" x2="${x + w}" y1="${y(TOE)}" y2="${y(TOE)}" class="thin"/>`);
  const doorBottom = look.drawers ? TOE + DRAWER_ZONE : TOE;
  if (!look.doors) {
    for (const sh of look.shelves || []) s.push(`<line x1="${x + 0.75}" x2="${x + w - 0.75}" y1="${y(sh)}" y2="${y(sh)}" class="shelf"/>`);
    for (const r of look.rods || []) {
      s.push(`<line x1="${x + 0.75}" x2="${x + w - 0.75}" y1="${y(r)}" y2="${y(r)}" class="rod"/>`);
      for (let gx = x + 3; gx < x + w - 2; gx += 4) s.push(`<path d="M${gx} ${y(r)} l-1.6 3 h3.2 z" class="hanger"/>`);
    }
    if (look.shoe) for (let i = 0; i < 5; i++) {
      const yy = 12 + i * 13;
      s.push(`<line x1="${x + 0.75}" x2="${x + w - 0.75}" y1="${y(yy + 2)}" y2="${y(yy - 2)}" class="shoe"/>`);
    }
  }
  if (look.drawers) {
    for (const [a, b] of [[TOE, TOE + 11], [TOE + 11, TOE + 22], [TOE + 22, TOE + DRAWER_ZONE]]) {
      s.push(`<rect x="${x + 0.3}" y="${y(b)}" width="${w - 0.6}" height="${b - a}" class="front"/>`);
      const L = Math.min(12, w * 0.45);
      s.push(`<line x1="${x + w / 2 - L / 2}" x2="${x + w / 2 + L / 2}" y1="${y((a + b) / 2)}" y2="${y((a + b) / 2)}" class="handle"/>`);
    }
  }
  if (look.doors) {
    const leaves = w <= 24 ? 1 : 2;
    const lw = w / leaves;
    for (let i = 0; i < leaves; i++) {
      const lx = x + i * lw;
      const cls = look.doors === "glass" ? "front glass" : "front";
      s.push(`<rect x="${lx + 0.3}" y="${y(H)}" width="${lw - 0.6}" height="${H - doorBottom}" class="${cls}"/>`);
      if (look.doors === "glass") s.push(`<rect x="${lx + 1.6}" y="${y(H) + 1.3}" width="${lw - 3.2}" height="${H - doorBottom - 2.6}" class="pane"/>`);
      const hingeLeft = leaves === 2 ? i === 0 : look.hinge !== "R";
      const hx = hingeLeft ? lx + lw - 2 : lx + 2;
      const [h0, h1] = look.drawers ? [doorBottom + 3, doorBottom + 13] : [38, 50];
      s.push(`<line x1="${hx}" x2="${hx}" y1="${y(h1)}" y2="${y(h0)}" class="handle"/>`);
      // swing marks: apex on the hinge side
      const ax = hingeLeft ? lx : lx + lw, bx = hingeLeft ? lx + lw : lx;
      s.push(`<path d="M${bx} ${y(H)} L${ax} ${y((H + doorBottom) / 2)} L${bx} ${y(doorBottom)}" class="swing"/>`);
    }
  }
  s.push(`<text x="${x + w / 2}" y="${y(H) - 4 - lift}" class="code">${code}</text>`);
  return s.join("");
}

// Crown moulding seen from the front: a band on top of the cabinets, sticking out past an
// open end by its projection (where it turns back along the side).
function crownSvg(cr, x0, x1, outLo, outHi) {
  const a = x0 - (outLo ? cr.proj : 0), b = x1 + (outHi ? cr.proj : 0);
  const lines = cr.pts.filter(([o, y]) => o > 0 && y > 0.05 && y < cr.h - 0.05).map(([, y]) => y);
  const steps = [...new Set(lines.map((y) => +y.toFixed(1)))].filter((y, i, l) => i === 0 || y - l[i - 1] > 0.4);
  return `<g class="crown"><rect x="${a}" y="${-cr.h}" width="${b - a}" height="${cr.h}"/>` +
    steps.map((y) => `<line x1="${a}" x2="${b}" y1="${-y}" y2="${-y}"/>`).join("") + `</g>`;
}

function dim(x0, x1, yy, label, cls = "") {
  return `<g class="dim ${cls}"><line x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}"/>` +
    `<line x1="${x0}" x2="${x0}" y1="${yy - 2.5}" y2="${yy + 2.5}"/><line x1="${x1}" x2="${x1}" y1="${yy - 2.5}" y2="${yy + 2.5}"/>` +
    `<text x="${(x0 + x1) / 2}" y="${yy - 1.6}">${label}</text></g>`;
}

// Heights of shelves and rods from the floor, written inside the module.
function heightMarks(x, w, look) {
  const marks = [];
  if (!look.doors) {
    for (const h of look.shelves || []) marks.push([h, "shelf"]);
    for (const h of look.rods || []) marks.push([h, "rod"]);
  }
  if (look.drawers) marks.push([TOE + DRAWER_ZONE, "drawers"]);
  if (!marks.length) return "";
  marks.sort((a, b) => a[0] - b[0]);
  return `<g class="hmarks">${marks.map(([h, kind]) =>
    // shelf heights on the left, rod heights on the right, so a shelf just above a rod stays readable
    kind === "rod"
      ? `<text x="${x + w - 1.4}" y="${H - h - 0.9}" class="hmark hm-rod" text-anchor="end">rod ${+h.toFixed(2)}"</text>`
      : `<text x="${x + 1.4}" y="${H - h - 0.9}" class="hmark">${+h.toFixed(2)}"</text>`).join("")}</g>`;
}

export function wallSvg(design, k, selected, { heights = "selected" } = {}) {
  const geo = wallGeometry(design)[k];
  const wall = design.walls[k];
  const custom = isCustom(design);
  const W = custom ? wallLength(design, k) : k === "back" ? wall.width : roomDepth(design);
  const parts = [];
  const room = [];
  const clash = clashSet(design);
  const cr = CROWNS[design.crown] || null;
  const lift = cr ? cr.h : 0;
  const plan = cr ? crownPlan(design)?.[k] : null;
  let x = geo.start;
  // corner pieces seen from the front
  const corner = (side) => cornerOn(design, side);
  const ownCorner = k === "back" ? [["left", 0], ["right", W - (corner("right") ? cornerByCode[corner("right").code].size : 0)]] : [[k, 0]];
  for (const [side, cx] of ownCorner) {
    const c = corner(side);
    if (!c) continue;
    const size = cornerByCode[c.code].size;
    const info = cornerInfo(c);
    const at = k === "back" ? cx : (k === "left" ? 0 : 0);
    parts.push(`<g class="corner${clash.has(`corner:${side}`) ? " clash" : ""}">${drawModule(at, size, info.look, info.code, false, lift)}</g>`);
    if (cr) parts.push(crownSvg(cr, at, at + size, false, false));
    parts.push(dim(at, at + size, H + 10, `${size}"`));
  }
  if (custom) {
    // corner space taken by the next or previous wall's cabinets
    for (const [a, b] of [[0, geo.runStart], [geo.end, W]]) {
      if (b - a < 0.01) continue;
      parts.push(`<rect x="${a}" y="0" width="${b - a}" height="${H}" class="deadzone"/>`);
      parts.push(`<text x="${(a + b) / 2}" y="${H / 2}" class="deadlabel" transform="rotate(-90 ${(a + b) / 2} ${H / 2})">corner</text>`);
    }
  } else if (k !== "back" && !corner(k) && geo.start > 0) {
    parts.push(`<rect x="0" y="0" width="${geo.start}" height="${H}" class="deadzone"/>`);
    parts.push(`<text x="${geo.start / 2}" y="${H / 2}" class="deadlabel" transform="rotate(-90 ${geo.start / 2} ${H / 2})">back run</text>`);
  }
  wall.modules.forEach((m, i) => {
    const info = moduleInfo(m);
    const sel = selected && selected.wall === k && selected.index === i;
    parts.push(`<g data-wall="${k}" data-index="${i}" class="mod${clash.has(`${k}:${i}`) ? " clash" : ""}">${drawModule(x, m.w, { ...info.look, hinge: m.hinge }, info.code, sel, lift)}</g>`);
    if (plan) {
      // lo is the end at the start of the wall's frame, which is the far end of a reversed run
      const [l, r] = wallFrame(design, k)?.rev ? [plan[i].hi, plan[i].lo] : [plan[i].lo, plan[i].hi];
      parts.push(crownSvg(cr, x, x + m.w, l > 0, r > 0));
    }
    if ((heights === "all" || sel) && !info.look.filler) parts.push(heightMarks(x, m.w, info.look));
    parts.push(dim(x, x + m.w, H + 10, `${m.w}"`));
    x += m.w;
  });
  if (geo.free > 0.01) {
    const ox = geo.openAt ?? x;
    parts.push(`<rect x="${ox}" y="0" width="${geo.free}" height="${H}" class="free"/>`);
    parts.push(dim(ox, ox + geo.free, H + 10, `${geo.free}" open`, "muted"));
  } else if (geo.free < -0.01) {
    parts.push(`<rect x="${geo.end ?? W}" y="0" width="${-geo.free}" height="${H}" class="over"/>`);
  }
  parts.push(dim(0, W, H + 24, `Wall ${fmt(W)}`, "strong"));
  // the room around the cabinets: ceiling line (with any slope), windows, doors, columns and soffits
  const RD = roomDepth(design), BW = design.walls.back.width;
  const pt = (u) => (k === "back" ? [u, 0] : k === "left" ? [0, u] : [BW, u]);
  const us = [0, W];
  if (design.slope && !custom) for (const b of [design.slope.run, BW - design.slope.run]) if (b > 0 && b < W) us.push(b);
  us.sort((a, b) => a - b);
  const top = us.map((u) => [u, ceilingAt(design, ...pt(u))]);
  const C = Math.max(...top.map(([, h]) => h));
  room.push(`<polyline points="${top.map(([u, h]) => `${u},${H - h}`).join(" ")}" class="ceil"/>`);
  room.push(`<text x="${W - 1}" y="${H - top[top.length - 1][1] - 1.5}" class="ceil-label">Ceiling ${+top[top.length - 1][1].toFixed(2)}"</text>`);
  for (const o of design.openings) {
    if (o.wall !== k || (!isWalk(design) && !custom && k !== "back")) continue;
    const y0 = o.kind === "door" ? 0 : o.sill;
    room.push(`<rect x="${o.at}" y="${H - y0 - o.h}" width="${o.w}" height="${o.h}" class="opening-${o.kind}"/>`);
    room.push(`<text x="${o.at + o.w / 2}" y="${H - y0 - o.h / 2}" class="olabel">${o.kind === "window" ? "WINDOW" : "DOOR"} ${o.w}"×${o.h}"</text>`);
    parts.push(dim(o.at, o.at + o.w, H + 38, `${o.kind} ${o.w}" at ${o.at}"`, "muted"));
  }
  for (const b of design.obstacles) {
    // things touching this wall
    let near, u0, u1;
    if (custom) {
      // touching this wall: its near face on the wall line, and overlapping it along the wall
      const f = wallFrame(design, k);
      const cs = [[b.x, b.z], [b.x + b.w, b.z], [b.x, b.z + b.d], [b.x + b.w, b.z + b.d]];
      const ts = cs.map(([x, z]) => (x - f.A[0]) * f.u[0] + (z - f.A[1]) * f.u[1]);
      const vs = cs.map(([x, z]) => (x - f.A[0]) * f.n[0] + (z - f.A[1]) * f.n[1]);
      u0 = Math.max(0, Math.min(...ts)); u1 = Math.min(W, Math.max(...ts));
      near = Math.min(...vs) < 1 && Math.max(...vs) > 0 && u1 - u0 > 0.5;
    } else {
      near = k === "back" ? b.z < 1 : k === "left" ? b.x < 1 : b.x + b.w > BW - 1;
      [u0, u1] = k === "back" ? [b.x, b.x + b.w] : [b.z, b.z + b.d];
    }
    if (!near) continue;
    const y0 = b.kind === "soffit" ? b.bottom : 0;
    const yTop = ceilingAt(design, b.x + b.w / 2, b.z + b.d / 2);
    room.push(`<rect x="${u0}" y="${H - yTop}" width="${u1 - u0}" height="${yTop - y0}" class="obst"/>`);
    room.push(`<text x="${(u0 + u1) / 2}" y="${H - (y0 + yTop) / 2}" class="olabel">${b.kind === "column" ? "COLUMN" : "SOFFIT"}</text>`);
  }
  parts.push(`<g class="dim"><line x1="-12" x2="-12" y1="0" y2="${H}"/><line x1="-14.5" x2="-9.5" y1="0" y2="0"/><line x1="-14.5" x2="-9.5" y1="${H}" y2="${H}"/>` +
    `<text x="-14" y="${H / 2}" transform="rotate(-90 -14 ${H / 2})">90"</text></g>`);
  if (cr && wall.modules.length) parts.push(`<g class="dim"><line x1="-12" x2="-12" y1="${-cr.h}" y2="0"/><line x1="-14.5" x2="-9.5" y1="${-cr.h}" y2="${-cr.h}"/>` +
    `<text x="-15" y="${-cr.h / 2 + 1}" text-anchor="end">crown ${H + cr.h}"</text></g>`);
  const vbW = Math.max(W, x) + PAD.l + PAD.r;
  const extra = Math.max(0, C - H);
  return `<figure class="elev" data-key="elev-${k}"><figcaption>${WALL_NAMES[k]}</figcaption>
  <svg viewBox="${-PAD.l} ${-PAD.t - extra} ${vbW} ${H + PAD.t + PAD.b + extra + 14}" preserveAspectRatio="xMidYMid meet">
    <line x1="${-PAD.l}" x2="${vbW}" y1="${H}" y2="${H}" class="floor"/>
    ${parts.join("")}
    ${room.join("")}
  </svg></figure>`;
}

export function elevationsHtml(design, selected, opts) {
  return activeWalls(design).map((k) => wallSvg(design, k, selected, opts)).join("");
}

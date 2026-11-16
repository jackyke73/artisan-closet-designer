// Front elevation of each wall as SVG, with closet codes and dimensions.
import { HEIGHT as H, TOE, DRAWER_ZONE, cornerByCode } from "./catalog.js";
import { activeWalls, wallGeometry, moduleInfo, cornerInfo, WALL_NAMES } from "./design.js";

const PAD = { l: 34, r: 14, t: 34, b: 52 };

function fmt(inches) {
  const n = +inches.toFixed(2);
  const ft = Math.floor(n / 12), rem = +(n - ft * 12).toFixed(2);
  return `${n}"${n >= 12 ? ` (${ft}'${rem ? ` ${rem}"` : ""})` : ""}`;
}

export function drawModule(x, w, look, code, selected) {
  const s = [];
  const y = (v) => H - v; // svg y from floor height
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
  s.push(`<text x="${x + w / 2}" y="${y(H) - 4}" class="code">${code}</text>`);
  return s.join("");
}

function dim(x0, x1, yy, label, cls = "") {
  return `<g class="dim ${cls}"><line x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}"/>` +
    `<line x1="${x0}" x2="${x0}" y1="${yy - 2.5}" y2="${yy + 2.5}"/><line x1="${x1}" x2="${x1}" y1="${yy - 2.5}" y2="${yy + 2.5}"/>` +
    `<text x="${(x0 + x1) / 2}" y="${yy - 1.6}">${label}</text></g>`;
}

export function wallSvg(design, k, selected) {
  const geo = wallGeometry(design)[k];
  const wall = design.walls[k];
  const W = wall.width;
  const parts = [];
  let x = geo.start;
  // corner pieces seen from the front
  const corner = (side) => design.corners[side] && activeWalls(design).includes(side) ? design.corners[side] : null;
  const ownCorner = k === "back" ? [["left", 0], ["right", W - (corner("right") ? cornerByCode[corner("right").code].size : 0)]] : [[k, 0]];
  for (const [side, cx] of ownCorner) {
    const c = corner(side);
    if (!c) continue;
    const size = cornerByCode[c.code].size;
    const info = cornerInfo(c);
    const at = k === "back" ? cx : (k === "left" ? 0 : 0);
    parts.push(`<g class="corner">${drawModule(at, size, info.look, info.code, false)}</g>`);
    parts.push(dim(at, at + size, H + 10, `${size}"`));
  }
  if (k !== "back" && !corner(k) && geo.start > 0) {
    parts.push(`<rect x="0" y="0" width="${geo.start}" height="${H}" class="deadzone"/>`);
    parts.push(`<text x="${geo.start / 2}" y="${H / 2}" class="deadlabel" transform="rotate(-90 ${geo.start / 2} ${H / 2})">back run</text>`);
  }
  wall.modules.forEach((m, i) => {
    const info = moduleInfo(m);
    const sel = selected && selected.wall === k && selected.index === i;
    parts.push(`<g data-wall="${k}" data-index="${i}" class="mod">${drawModule(x, m.w, { ...info.look, hinge: m.hinge }, info.code, sel)}</g>`);
    parts.push(dim(x, x + m.w, H + 10, `${m.w}"`));
    x += m.w;
  });
  if (geo.free > 0.01) {
    parts.push(`<rect x="${x}" y="0" width="${geo.free}" height="${H}" class="free"/>`);
    parts.push(dim(x, x + geo.free, H + 10, `${geo.free}" open`, "muted"));
  } else if (geo.free < -0.01) {
    parts.push(`<rect x="${W}" y="0" width="${-geo.free}" height="${H}" class="over"/>`);
  }
  parts.push(dim(0, W, H + 24, `Wall ${fmt(W)}`, "strong"));
  parts.push(`<g class="dim"><line x1="-12" x2="-12" y1="0" y2="${H}"/><line x1="-14.5" x2="-9.5" y1="0" y2="0"/><line x1="-14.5" x2="-9.5" y1="${H}" y2="${H}"/>` +
    `<text x="-14" y="${H / 2}" transform="rotate(-90 -14 ${H / 2})">90"</text></g>`);
  const vbW = Math.max(W, x) + PAD.l + PAD.r;
  return `<figure class="elev"><figcaption>${WALL_NAMES[k]}</figcaption>
  <svg viewBox="${-PAD.l} ${-PAD.t} ${vbW} ${H + PAD.t + PAD.b}" preserveAspectRatio="xMidYMid meet">
    <line x1="${-PAD.l}" x2="${vbW}" y1="${H}" y2="${H}" class="floor"/>
    ${parts.join("")}
  </svg></figure>`;
}

export function elevationsHtml(design, selected) {
  return activeWalls(design).map((k) => wallSvg(design, k, selected)).join("");
}

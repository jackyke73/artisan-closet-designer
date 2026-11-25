// Closet accessories for the 3D view: clothes on hangers, folded stacks, shoes, baskets,
// handbags, a rug and an ottoman. Everything is built from code (no model files), with
// small canvas textures for fabric, wicker and wool. Geometries are cached and shared,
// so they are marked `shared` and must not be disposed when the scene is rebuilt.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---- textures -----------------------------------------------------------------------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Light grey, so the material color tints it.
const TEX = {};
const tex = {
  // plain weave: shirts, trousers, coats
  weave: () => TEX.weave || (TEX.weave = canvasTex(128, (g, s) => {
    g.fillStyle = "#eeeeee"; g.fillRect(0, 0, s, s);
    const r = rand(3);
    for (let i = 0; i < s; i += 2) {
      g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; g.fillRect(0, i, s, 1);
      g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`; g.fillRect(i, 0, 1, s);
    }
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * s, r() * s, 1, 1); }
  }, 6)),
  // ribbed knit: sweaters
  knit: () => TEX.knit || (TEX.knit = canvasTex(64, (g, s) => {
    g.fillStyle = "#ececec"; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 4) {
      const grd = g.createLinearGradient(x, 0, x + 4, 0);
      grd.addColorStop(0, "rgba(0,0,0,0.14)"); grd.addColorStop(0.5, "rgba(255,255,255,0.10)"); grd.addColorStop(1, "rgba(0,0,0,0.14)");
      g.fillStyle = grd; g.fillRect(x, 0, 4, s);
    }
    for (let y = 0; y < s; y += 3) { g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(0, y, s, 1); }
  }, 5)),
  // denim twill
  twill: () => TEX.twill || (TEX.twill = canvasTex(64, (g, s) => {
    g.fillStyle = "#e9e9e9"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 1;
    for (let i = -s; i < s; i += 3) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke(); }
    const r = rand(9);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * s, r() * s, 1, 1); }
  }, 6)),
  // basket weave: wicker and seagrass
  wicker: () => TEX.wicker || (TEX.wicker = canvasTex(128, (g, s) => {
    g.fillStyle = "#5c4428"; g.fillRect(0, 0, s, s);
    const r = rand(21), row = 8, col = 16;
    for (let y = 0; y < s; y += row) {
      for (let x = 0; x < s; x += col) {
        const off = (y / row) % 2 ? col / 2 : 0;
        const grd = g.createLinearGradient(0, y, 0, y + row);
        const l = 205 + r() * 30;
        grd.addColorStop(0, `rgb(${l * 0.8},${l * 0.64},${l * 0.42})`);
        grd.addColorStop(0.5, `rgb(${l},${l * 0.83},${l * 0.58})`);
        grd.addColorStop(1, `rgb(${l * 0.75},${l * 0.6},${l * 0.4})`);
        g.fillStyle = grd;
        g.beginPath(); g.roundRect(x + off - col / 2 + 1, y + 1, col - 2, row - 2, 3); g.fill();
        g.beginPath(); g.roundRect(x + off + col / 2 + 1, y + 1, col - 2, row - 2, 3); g.fill();
      }
    }
  }, 1)),
  // linen bins and the ottoman
  linen: () => TEX.linen || (TEX.linen = canvasTex(128, (g, s) => {
    g.fillStyle = "#efefef"; g.fillRect(0, 0, s, s);
    const r = rand(33);
    for (let i = 0; i < s; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.07})`; g.fillRect(0, i, s, 1);
      g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(i, 0, 1, s);
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.25})`; g.fillRect(r() * s, r() * s, 2, 1); }
  }, 3)),
  // wool rug with a border and a soft lattice
  rug: () => TEX.rug || (TEX.rug = canvasTex(512, (g, s) => {
    g.fillStyle = "#ebe5da"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(120,104,84,0.22)"; g.lineWidth = 3;
    for (let i = -s; i < 2 * s; i += 48) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke();
      g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke();
    }
    g.strokeStyle = "#8f7f69"; g.lineWidth = 14; g.strokeRect(26, 26, s - 52, s - 52);
    g.strokeStyle = "rgba(143,127,105,0.6)"; g.lineWidth = 3; g.strokeRect(46, 46, s - 92, s - 92);
    const r = rand(44);
    for (let i = 0; i < 26000; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.06})` : `rgba(255,255,255,${r() * 0.1})`; g.fillRect(r() * s, r() * s, 1.5, 1.5); }
  }, 1)),
};

// ---- materials ------------------------------------------------------------------------
const MATS = {};
function mat(color, kind = "weave", opts = {}) {
  const key = `${color}|${kind}|${JSON.stringify(opts)}`;
  if (!MATS[key]) {
    const map = kind && tex[kind] ? tex[kind]() : null;
    MATS[key] = new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: map ? 0.6 : 0, roughness: 0.92, ...opts });
  }
  return MATS[key];
}
const HANGER = () => MATS.hanger || (MATS.hanger = new THREE.MeshStandardMaterial({ color: "#2a2623", roughness: 0.75 }));

// Real wardrobe colors, grouped so a rail reads like someone's own clothes.
const SHIRTS = ["#f6f4ef", "#e9eef3", "#cfdceb", "#f2ede3", "#9fb3c8", "#2c3a52"];
const KNITS = ["#c9b9a2", "#7f8489", "#3c4148", "#e5ddd0", "#8c6e52", "#5b6450"];
const DARKS = ["#1f2735", "#2b2b2e", "#3a3f47", "#4b4038", "#6e6a63"];
const COATS = ["#a8835a", "#3b3f45", "#1e2430", "#c2b29a", "#5a4b3f"];
const DRESSES = ["#1e1e22", "#6b2f35", "#e8e1d6", "#40576e", "#b89f86"];
const DENIM = ["#3e5878", "#2f4560", "#5d7695", "#24344a"];
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };

// ---- shared geometry -----------------------------------------------------------------
const GEO = {};
function shared(key, make) {
  if (!GEO[key]) { GEO[key] = make(); GEO[key].userData.shared = true; }
  return GEO[key];
}
const q = (v, step = 0.5) => Math.round(v / step) * step;

// A garment seen face on: x across the shoulders, y up (0 at the hem), extruded `thick`.
// Centered on x and z, so it can be turned to hang along either rod direction.
function garmentGeo(kind, len, span, thick) {
  return shared(`g|${kind}|${q(len)}|${q(span)}|${q(thick, 0.25)}`, () => {
    const h = span / 2, s = new THREE.Shape();
    const shoulderY = len - (kind === "coat" || kind === "jacket" ? 2.6 : 2.2);
    const hem = { shirt: 0.4, knit: 0.42, jacket: 0.44, coat: 0.47, dress: 0.56, pants: 0.33 }[kind] * span;
    const top = { shirt: 0.47, knit: 0.46, jacket: 0.5, coat: 0.5, dress: 0.36, pants: 0.33 }[kind] * span;
    if (kind === "pants") {
      // trousers folded over the bar: straight sides, a rounded fold at the bottom
      s.moveTo(-top, len);
      s.lineTo(top, len);
      s.lineTo(hem, 2);
      s.quadraticCurveTo(hem, 0, hem - 2, 0);
      s.lineTo(-hem + 2, 0);
      s.quadraticCurveTo(-hem, 0, -hem, 2);
      s.closePath();
    } else {
      const neck = kind === "dress" ? 0.16 * span : 0.12 * span;
      s.moveTo(-hem, 0);
      s.lineTo(hem, 0);
      s.quadraticCurveTo(top * 0.92, len * 0.45, top, shoulderY - 1.2); // side seam, a little shape at the waist
      s.quadraticCurveTo(top + 0.2, shoulderY, top - 1.2, shoulderY + 0.4); // shoulder point
      s.quadraticCurveTo(neck + 2, len - 0.2, neck, len);                    // shoulder slope up to the collar
      s.quadraticCurveTo(0, len - 1.4, -neck, len);                          // neckline
      s.quadraticCurveTo(-neck - 2, len - 0.2, -top + 1.2, shoulderY + 0.4);
      s.quadraticCurveTo(-top - 0.2, shoulderY, -top, shoulderY - 1.2);
      s.quadraticCurveTo(-top * 0.92, len * 0.45, -hem, 0);
    }
    const bevel = Math.min(thick * 0.42, 0.7);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.05, thick - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: Math.min(bevel, 0.5), bevelSegments: 3, curveSegments: 8 });
    g.translate(0, 0, -(thick - 2 * bevel) / 2);
    // soft drape: the hem swings out a touch, the body gets slightly fuller below the chest
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i);
      const t = 1 - Math.min(1, y / len);
      p.setZ(i, z * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3))) + Math.sin(p.getX(i) * 0.5) * 0.18 * t);
    }
    g.computeVertexNormals();
    return g;
  });
}

// Slim velvet hanger with its hook, across x, top of the hook at y = 0 (the rod).
function hangerGeo(span) {
  return shared(`h|${q(span)}`, () => {
    const h = span * 0.44;
    const s = new THREE.Shape();
    s.moveTo(-h, -3.9); s.quadraticCurveTo(-h * 0.5, -2.3, 0, -2.0); s.quadraticCurveTo(h * 0.5, -2.3, h, -3.9);
    s.lineTo(h, -4.4); s.quadraticCurveTo(h * 0.5, -2.85, 0, -2.6); s.quadraticCurveTo(-h * 0.5, -2.85, -h, -4.4); s.closePath();
    const bar = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 6 });
    bar.translate(0, 0, -0.15);
    const hook = new THREE.TorusGeometry(0.7, 0.08, 6, 14, Math.PI * 1.35);
    hook.rotateZ(-Math.PI * 0.18);
    hook.translate(0, -0.05, 0);
    const stem = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6);
    stem.translate(0.0, -1.3, 0);
    [bar, hook, stem].forEach((x) => { x.deleteAttribute("uv"); });
    return mergeGeometries([bar.toNonIndexed(), hook.toNonIndexed(), stem.toNonIndexed()]);
  });
}

// ---- hanging clothes ---------------------------------------------------------------------
// One rod's worth: axis "x" (rod across x, clothes face along z) or "z".
// a0..a1 along the rod, rod at height y, rail line c, span: shoulder width, avail: drop.
export function hangClothes(parent, axis, a0, a1, y, c, span, avail, rnd) {
  const grp = new THREE.Group();
  grp.userData.soft = true;
  parent.add(grp);
  const long = avail > 52;
  // what goes on this rail
  const kinds = long
    ? [["coat", 0.3], ["dress", 0.35], ["shirt", 0.2], ["jacket", 0.15]]
    : avail > 34 ? [["shirt", 0.42], ["jacket", 0.18], ["knit", 0.2], ["pants", 0.2]]
    : [["pants", 0.55], ["shirt", 0.45]];
  const pick = () => { let r = rnd(), acc = 0; for (const [k, p] of kinds) { acc += p; if (r < acc) return k; } return kinds[0][0]; };
  const items = [];
  let pos = a0 + 1.2;
  const end = a1 - 1.2;
  while (pos < end) {
    const kind = pick();
    const thick = { shirt: 0.7, knit: 1.5, jacket: 1.9, coat: 2.3, dress: 0.9, pants: 1.0 }[kind] * (0.85 + rnd() * 0.3);
    if (pos + thick > end) break;
    const pal = { shirt: SHIRTS, knit: KNITS, jacket: DARKS, coat: COATS, dress: DRESSES, pants: rnd() < 0.5 ? DENIM : DARKS }[kind];
    const color = pal[Math.floor(rnd() * pal.length)];
    const baseLen = { shirt: 30, knit: 26, jacket: 31, coat: 42, dress: 44, pants: 22 }[kind];
    const len = Math.min(avail - 3.5, baseLen + (rnd() - 0.5) * 3);
    items.push({ kind, thick, color, len, gap: 0.45 + rnd() * 0.9, pal });
    pos += thick + items[items.length - 1].gap;
  }
  // group by kind and run light to dark, the way a tidy closet is kept
  const order = ["coat", "dress", "jacket", "shirt", "knit", "pants"];
  items.sort((p, r) => order.indexOf(p.kind) - order.indexOf(r.kind) || lum(r.color) - lum(p.color));
  // spread them along the rail with the slack shared out
  const used = items.reduce((s, it) => s + it.thick + it.gap, 0);
  let x = a0 + 1.2 + Math.max(0, (end - (a0 + 1.2) - used) / 2);
  for (const it of items) {
    const mid = x + it.thick / 2;
    x += it.thick + it.gap;
    if (it.len < 10) continue;
    const kindMat = it.kind === "knit" ? "knit" : it.pal === DENIM ? "twill" : "weave";
    const g = new THREE.Mesh(garmentGeo(it.kind, it.len, span * (it.kind === "coat" || it.kind === "jacket" ? 1.02 : 0.94), it.thick), mat(it.color, kindMat, { roughness: it.kind === "dress" && it.color === "#1e1e22" ? 0.6 : 0.92 }));
    const hang = new THREE.Mesh(hangerGeo(span), HANGER());
    for (const m of [g, hang]) { m.castShadow = true; m.receiveShadow = true; }
    g.position.y = -2.4 - it.len;
    const holder = new THREE.Group();
    holder.add(g, hang);
    // a hanger turns a little on the rod
    const yaw = (rnd() - 0.5) * 0.16;
    if (axis === "x") { holder.rotation.y = Math.PI / 2 + yaw; holder.position.set(mid, y, c); }
    else { holder.rotation.y = yaw; holder.position.set(c, y, mid); }
    grp.add(holder);
  }
}

// ---- folded stacks, baskets, handbags ------------------------------------------------------
function roundBox(w, h, d, r) {
  return shared(`rb|${q(w, 0.25)}|${q(h, 0.1)}|${q(d, 0.25)}|${r}`, () => new RoundedBoxGeometry(q(w, 0.25), q(h, 0.1), q(d, 0.25), 3, Math.min(r, q(h, 0.1) / 2 - 0.01)));
}
const STACKS = [
  { kind: "knit", h: [2.0, 2.6], pal: KNITS, tex: "knit" },
  { kind: "tee", h: [1.1, 1.4], pal: SHIRTS.concat(["#2b2b2e", "#7f8489"]), tex: "weave" },
  { kind: "denim", h: [1.5, 1.8], pal: DENIM, tex: "twill" },
  { kind: "towel", h: [2.2, 2.6], pal: ["#f3f0ea", "#e4ddd0", "#cfc6b8"], tex: "linen" },
];

export function shelfItems(parent, { w, z0, z1, top, gap, T, rnd, style }) {
  const add = (geo, m, x, y, z, ry = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const inner = w - 2 * T;
  const dz = z1 - z0, zc = (z0 + z1) / 2;
  // baskets or linen bins across the shelf
  if (style === "baskets") {
    const n = Math.max(1, Math.floor(inner / 13));
    const bw = (inner - 1.5 * (n + 1)) / n, bh = Math.min(gap - 2.5, 10);
    const linen = rnd() < 0.4;
    for (let k = 0; k < n; k++) {
      const x = T + 1.5 + k * (bw + 1.5) + bw / 2;
      if (linen) {
        add(roundBox(bw, bh, dz, 0.8), mat("#cdc3b4", "linen"), x, top + bh / 2, zc);
        add(roundBox(2.6, 1.1, 0.4, 0.15), mat("#6b4a31", null, { roughness: 0.5 }), x, top + bh * 0.72, z1 + 0.05); // leather tab
      } else {
        const m = mat("#d8b98c", "wicker", { roughness: 0.95 });
        add(roundBox(bw, bh, dz, 0.9), m, x, top + bh / 2, zc);
        add(roundBox(bw + 0.25, 0.7, dz + 0.25, 0.3), mat("#b58f5e", "wicker"), x, top + bh - 0.35, zc); // rim
        add(roundBox(3.2, 1.0, 0.5, 0.45), mat("#2b2118", null), x, top + bh - 1.8, z1 + 0.02); // hand hole
      }
    }
    return;
  }
  // a handbag now and then on a tall shelf
  if (style === "bag") {
    const bw = Math.min(13, inner - 4), bh = Math.min(gap - 4, 9);
    const color = ["#6b4a31", "#1d1d1f", "#b58b5b", "#d8cbb8", "#7b2e2e"][Math.floor(rnd() * 5)];
    const leather = mat(color, null, { roughness: 0.45 });
    const s = new THREE.Shape();
    s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0); s.lineTo(bw / 2 - 1.2, bh); s.lineTo(-bw / 2 + 1.2, bh); s.closePath();
    const geo = shared(`bag|${q(bw)}|${q(bh)}`, () => {
      const g = new THREE.ExtrudeGeometry(s, { depth: 3.2, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.7, bevelSegments: 4, curveSegments: 4 });
      g.translate(0, 0, -1.6);
      return g;
    });
    const x = T + 2 + bw / 2 + rnd() * Math.max(0, inner - bw - 4);
    add(geo, leather, x, top + 0.7, zc + 1, (rnd() - 0.5) * 0.3);
    const handle = new THREE.Mesh(shared(`handle|${q(bw)}`, () => new THREE.TorusGeometry(bw * 0.26, 0.28, 8, 24, Math.PI)), leather);
    handle.position.set(x, top + bh + 0.6, zc + 1);
    handle.rotation.y = (rnd() - 0.5) * 0.3;
    handle.castShadow = true;
    parent.add(handle);
    return;
  }
  // folded stacks, each stack one kind of clothing
  const n = Math.max(1, Math.floor((inner - 2) / 11));
  const sw = Math.min(10.5, (inner - 2) / n - 1);
  for (let k = 0; k < n; k++) {
    if (rnd() < 0.22) continue;
    const st = STACKS[Math.floor(rnd() * STACKS.length)];
    let y = top;
    const xc = T + 1 + k * (sw + 1) + sw / 2;
    const tint = st.pal[Math.floor(rnd() * st.pal.length)];
    const count = 2 + Math.floor(rnd() * 5);
    for (let l = 0; l < count; l++) {
      const h = st.h[0] + rnd() * (st.h[1] - st.h[0]);
      if (y + h > top + gap - 1.2) break;
      // mostly the same color in a stack, with the odd one out
      const color = rnd() < 0.7 ? tint : st.pal[Math.floor(rnd() * st.pal.length)];
      const ww = sw * (0.9 + rnd() * 0.1), dd = Math.min(dz, 11) * (0.92 + rnd() * 0.08);
      add(roundBox(ww, h, dd, h * 0.45), mat(color, st.tex), xc + (rnd() - 0.5) * 0.5, y + h / 2, z1 - dd / 2 - rnd() * 0.4, (rnd() - 0.5) * 0.06);
      y += h - 0.05;
    }
  }
}

// ---- shoes ---------------------------------------------------------------------------------
// Side profile in (z, y), toe toward +z, 9.6" long, extruded across x.
const SHOE_TYPES = {
  sneaker: { upper: [[-4.8, 0.9], [-4.8, 2.9], [-4.5, 3.5], [-3.7, 3.5], [-1.6, 2.9], [0.6, 3.0], [1.6, 2.6], [3.6, 1.9], [4.7, 1.5], [4.9, 0.9]], sole: 0.95, soleColor: "#f4f2ee" },
  loafer: { upper: [[-4.8, 0.45], [-4.8, 2.4], [-4.3, 2.6], [-1.4, 2.0], [0.4, 2.15], [2.6, 1.8], [4.4, 1.25], [4.95, 0.45]], sole: 0.45, soleColor: "#2a211b" },
  boot: { upper: [[-4.8, 0.7], [-4.8, 5.8], [-4.3, 6.0], [-1.7, 6.0], [-1.6, 3.3], [0.8, 2.6], [3.4, 1.8], [4.7, 1.4], [4.95, 0.7]], sole: 0.7, soleColor: "#1e1a17" },
};
const SHOE_LOOKS = [
  ["sneaker", "#f4f2ee", 0.7], ["sneaker", "#dcdad4", 0.7], ["sneaker", "#2a2c31", 0.7],
  ["loafer", "#6b4a31", 0.38], ["loafer", "#1c1b1d", 0.32], ["loafer", "#9c6b43", 0.4],
  ["boot", "#8a6646", 0.85], ["boot", "#2a2624", 0.5],
];
function shoeGeo(type, part) {
  return shared(`shoe|${type}|${part}`, () => {
    const t = SHOE_TYPES[type];
    const s = new THREE.Shape();
    if (part === "upper") {
      const p = t.upper;
      s.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) {
        const [x, y] = p[i], [px, py] = p[i - 1];
        s.quadraticCurveTo(px + (x - px) * 0.15, py + (y - py) * 0.85, x, y);
      }
      s.lineTo(p[0][0], p[0][1]);
    } else {
      s.moveTo(-4.95, 0); s.lineTo(4.7, 0); s.quadraticCurveTo(5.15, 0.1, 5.05, t.sole + 0.05); s.lineTo(-4.95, t.sole + 0.05); s.closePath();
    }
    const w = part === "upper" ? 1.7 : 2.7;
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: part === "upper" ? 0.55 : 0.25, bevelSize: part === "upper" ? 0.45 : 0.15, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -w / 2);
    g.rotateY(-Math.PI / 2); // profile z -> world z, extrusion -> x
    // round it off: narrower at the toe and heel, and the upper narrows toward the top
    const top = Math.max(...t.upper.map(([, y]) => y));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i);
      const toe = z > 1.5 ? 1 - 0.42 * ((z - 1.5) / 3.6) ** 2 : 1;
      const heel = z < -3 ? 1 - 0.22 * ((-3 - z) / 2) ** 2 : 1;
      const up = part === "upper" ? 1 - 0.3 * Math.max(0, (y - t.sole) / (top - t.sole)) ** 1.5 : 1;
      p.setX(i, p.getX(i) * toe * heel * up);
    }
    g.computeVertexNormals();
    return g;
  });
}
// A pair on a tilted shoe shelf: x is the middle of the pair, the shelf surface at y = 0.
export function shoePair(parent, x, rnd) {
  const [type, color, rough] = SHOE_LOOKS[Math.floor(rnd() * SHOE_LOOKS.length)];
  const t = SHOE_TYPES[type];
  const upper = mat(color, type === "sneaker" ? "weave" : null, { roughness: rough });
  const sole = mat(t.soleColor, null, { roughness: 0.8 });
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const u = new THREE.Mesh(shoeGeo(type, "upper"), upper);
    const s = new THREE.Mesh(shoeGeo(type, "sole"), sole);
    for (const m of [u, s]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.position.set(x + side * 1.75, 0.25, 0);
    g.rotation.y = side * 0.05;
    parent.add(g);
  }
}

// ---- room: rug and ottoman ----------------------------------------------------------------------
export function rug(parent, cx, cz, w, l) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.45, l, 2, 0.2), mat("#ffffff", "rug", { roughness: 1, bumpScale: 1.2 }));
  m.position.set(cx, 0.23, cz);
  m.receiveShadow = true;
  parent.add(m);
}
export function ottoman(parent, x, z) {
  const geo = shared("ottoman", () => {
    const pts = [[0, 0.6], [8.6, 0.6], [9.8, 1.6], [10.4, 4], [10.5, 12], [10.1, 14.8], [8.8, 16.1], [0, 16.3]].map(([a, b]) => new THREE.Vector2(a, b));
    const curve = new THREE.SplineCurve(pts);
    return new THREE.LatheGeometry(curve.getPoints(40), 56);
  });
  const o = new THREE.Mesh(geo, mat("#b9ab98", "linen", { roughness: 1, bumpScale: 1.5 }));
  o.position.set(x, 0, z);
  o.castShadow = o.receiveShadow = true;
  parent.add(o);
  // piping around the top
  const pipe = new THREE.Mesh(shared("piping", () => new THREE.TorusGeometry(9.5, 0.28, 8, 64)), mat("#a09280", "linen"));
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(x, 15.4, z);
  parent.add(pipe);
}

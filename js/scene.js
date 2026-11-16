// 3D view. World units are inches. The room's back-left floor corner is the origin;
// +x runs along the back wall, +z comes out of the back wall toward the viewer.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HEIGHT as H, TOE, T, DRAWER_ZONE, DEPTHS, cornerByCode } from "./catalog.js";
import { activeWalls, wallGeometry, moduleInfo, cornerInfo } from "./design.js";

const OPEN_ANGLE = 1.75; // about 100 degrees
const GARMENT_COLORS = ["#2f3640", "#4a5568", "#d9d4c7", "#8b7d6b", "#1f2a44", "#b9a58b", "#e8e4dc", "#5c4b3b", "#7a8a99"];
const SHOE_COLORS = ["#f2f2f0", "#6b4a2f", "#1d1d1f", "#b08a63", "#e9e6e0"];

function woodTexture(vertical, base = "#c9a273") {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  const rnd = mulberry(vertical ? 7 : 11);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * 512, amp = 1 + rnd() * 5, f = 0.003 + rnd() * 0.01, ph = rnd() * 6;
    g.strokeStyle = rnd() < 0.55 ? `rgba(118,78,42,${0.04 + rnd() * 0.12})` : `rgba(240,212,170,${0.05 + rnd() * 0.12})`;
    g.lineWidth = 0.5 + rnd() * 2.2;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const yy = y + Math.sin(x * f + ph) * amp;
      x ? g.lineTo(x, yy) : g.moveTo(x, yy);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (vertical) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  return t;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ClosetScene {
  constructor(container, { onPick } = {}) {
    this.container = container;
    this.onPick = onPick;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#ece8e1");
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 3000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 900;

    this.scene.add(new THREE.HemisphereLight("#fffaf2", "#b8a993", 0.55));
    const sun = (this.sun = new THREE.DirectionalLight("#fff3e0", 2.1));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 4;
    this.scene.add(sun, sun.target);

    this.mat = {
      oakV: new THREE.MeshStandardMaterial({ map: woodTexture(true, "#c39a68"), roughness: 0.58 }),
      oakH: new THREE.MeshStandardMaterial({ map: woodTexture(false, "#c39a68"), roughness: 0.58 }),
      black: new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.35, metalness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#cfd8d6", transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0, depthWrite: false }),
      chrome: new THREE.MeshStandardMaterial({ color: "#d8d8d8", roughness: 0.22, metalness: 0.95 }),
      shoeShelf: new THREE.MeshStandardMaterial({ color: "#3b3b3d", roughness: 0.5, metalness: 0.2 }),
      wall: new THREE.MeshStandardMaterial({ color: "#f3efe8", roughness: 0.95 }),
      floor: new THREE.MeshStandardMaterial({ map: woodTexture(false, "#b9a68c"), roughness: 0.8 }),
      select: new THREE.LineBasicMaterial({ color: "#e5322d" }),
    };
    this.mat.floor.map.repeat.set(4, 4);
    this.garmentMats = GARMENT_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    this.shoeMats = SHOE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.frameKey = "";

    this._bindPicking();
    new ResizeObserver(() => this._resize()).observe(container);
    this._resize();
    const loop = () => {
      this.controls.update();
      r.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _bindPicking() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    el.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      for (const hit of ray.intersectObjects(this.root.children, true)) {
        let o = hit.object;
        while (o && !o.userData.pick) o = o.parent;
        if (o) return this.onPick?.(o.userData.pick);
      }
      this.onPick?.(null);
    });
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  // --- build ------------------------------------------------------------------
  update(design, { doorsOpen = false, selected = null } = {}) {
    this.root.clear();
    const walls = activeWalls(design);
    const geo = wallGeometry(design);
    const W = design.walls.back.width;
    const sideLen = walls.length > 1 ? Math.max(...walls.filter((k) => k !== "back").map((k) => design.walls[k].width)) : 30;
    this._room(design.layout, W, sideLen);

    const place = (k, m, i, s) => {
      const info = moduleInfo(m);
      const d = DEPTHS[m.depth].inches;
      const g = this._module(info.look, m.w, d, { hinge: m.hinge, doorsOpen, seed: i * 31 + k.length });
      g.userData.pick = { wall: k, index: i };
      if (k === "back") g.position.set(s, 0, 0);
      if (k === "left") { g.rotation.y = Math.PI / 2; g.position.set(0, 0, s + m.w); }
      if (k === "right") { g.rotation.y = -Math.PI / 2; g.position.set(W, 0, s); }
      this.root.add(g);
      if (selected && selected.wall === k && selected.index === i) this._outline(g);
    };
    for (const k of walls) {
      let s = geo[k].start;
      design.walls[k].modules.forEach((m, i) => { place(k, m, i, s); s += m.w; });
    }
    for (const side of ["left", "right"]) {
      const c = design.corners[side];
      if (walls.includes(side) && c) {
        const g = this._corner(c, side === "right" ? W : null, doorsOpen);
        g.userData.pick = { wall: side, corner: true };
        this.root.add(g);
      }
    }

    const key = `${design.layout}|${W}|${sideLen}`;
    if (key !== this.frameKey) { this.frameKey = key; this.frame(W, sideLen, design.layout); }
    this._light(W, sideLen);
  }

  frame(W, sideLen, layout) {
    const depth = layout === "reach" ? 24 : sideLen;
    const target = new THREE.Vector3(W / 2, 44, depth * 0.3);
    const span = Math.max(W, depth, 90);
    const dist = span * 1.3 + 70 + (layout === "reach" ? 0 : depth * 0.7);
    this.camera.position.set(W / 2 + span * 0.35, 70, target.z + dist);
    this.controls.target.copy(target);
    this.controls.update();
  }

  _light(W, D) {
    const s = Math.max(W, D, 100);
    this.sun.position.set(W * 0.75, 260, D + 220);
    this.sun.target.position.set(W / 2, 30, D / 3);
    const cam = this.sun.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 10; cam.far = 900;
    cam.updateProjectionMatrix();
  }

  _room(layout, W, sideLen) {
    const g = new THREE.Group();
    const roomD = layout === "reach" ? 30 : sideLen;
    const plane = (w, h, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.receiveShadow = true;
      return m;
    };
    const floorD = roomD + 140, floorW = W + 160;
    const floor = plane(floorW, floorD, this.mat.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, floorD / 2);
    g.add(floor);
    const wallH = 100;
    const back = plane(layout === "reach" ? W + 160 : W, wallH, this.mat.wall);
    back.position.set(W / 2, wallH / 2, -0.05);
    g.add(back);
    const left = plane(roomD, wallH, this.mat.wall);
    left.rotation.y = Math.PI / 2;
    left.position.set(-0.05, wallH / 2, roomD / 2);
    const right = plane(roomD, wallH, this.mat.wall);
    right.rotation.y = -Math.PI / 2;
    right.position.set(W + 0.05, wallH / 2, roomD / 2);
    if (layout !== "reach" || true) g.add(left);
    if (layout !== "L") g.add(right);
    if (layout === "reach") {
      // header above the closet opening
      const header = new THREE.Mesh(new THREE.BoxGeometry(W + 160, wallH - 92, 4), this.mat.wall);
      header.position.set(W / 2, 92 + (wallH - 92) / 2, roomD + 2);
      header.receiveShadow = true;
      for (const x of [-40, W + 40]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(80, wallH, 4), this.mat.wall);
        jamb.position.set(x, wallH / 2, roomD + 2);
        jamb.receiveShadow = true;
        g.add(jamb);
      }
      g.add(header);
    }
    this.root.add(g);
  }

  _box(parent, mat, [x0, x1], [y0, y1], [z0, z1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _rod(parent, axis, a0, a1, y, c) {
    const len = a1 - a0;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 16), this.mat.chrome);
    if (axis === "x") { m.rotation.z = Math.PI / 2; m.position.set(a0 + len / 2, y, c); }
    else { m.rotation.x = Math.PI / 2; m.position.set(c, y, a0 + len / 2); }
    m.castShadow = true;
    parent.add(m);
  }

  _garments(parent, axis, a0, a1, y, c, span, avail, rnd) {
    const n = Math.floor((a1 - a0 - 2) / 2.3);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.12) continue;
      const a = a0 + 1.5 + i * 2.3 + (rnd() - 0.5) * 0.5;
      const len = Math.min(avail - 3, 26 + rnd() * 12);
      const mat = this.garmentMats[Math.floor(rnd() * this.garmentMats.length)];
      const sp = span - rnd() * 2;
      if (axis === "x") this._box(parent, mat, [a - 0.45, a + 0.45], [y - len, y - 1.2], [c - sp / 2, c + sp / 2]);
      else this._box(parent, mat, [c - sp / 2, c + sp / 2], [y - len, y - 1.2], [a - 0.45, a + 0.45]);
    }
  }

  _module(look, w, d, { hinge, doorsOpen, seed }) {
    const g = new THREE.Group();
    const { oakV, oakH, black, glass } = this.mat;
    const rnd = mulberry(seed + w * 7);
    this._box(g, oakV, [0, T], [0, H], [0, d]);
    this._box(g, oakV, [w - T, w], [0, H], [0, d]);
    this._box(g, oakH, [T, w - T], [TOE, TOE + T], [T, d]);
    this._box(g, oakH, [T, w - T], [H - T, H], [T, d]);
    this._box(g, oakH, [T, w - T], [0, TOE], [d - T, d]);
    this._box(g, oakV, [T, w - T], [TOE + T, H - T], [0, T]);

    const shelves = look.shelves || [];
    for (const y of shelves) this._box(g, oakH, [T, w - T], [y - T / 2, y + T / 2], [T, d - 0.4]);

    const floorUnder = (y) => Math.max(TOE + T, ...[TOE + T, ...shelves].filter((s) => s < y - 1));
    const rodZ = Math.min(d / 2, 11);
    for (const y of look.rods || []) {
      this._rod(g, "x", T, w - T, y, rodZ);
      const span = Math.min(d - 3, 17);
      this._garments(g, "x", T, w - T, y, Math.max(span / 2 + T, rodZ), span, y - floorUnder(y), rnd);
    }

    if (look.shoe) {
      for (let i = 0; i < 5; i++) {
        const y = 12 + i * 13;
        const tray = new THREE.Group();
        tray.position.set(w / 2, y, d / 2);
        tray.rotation.x = 0.26;
        this._box(tray, this.mat.shoeShelf, [-(w / 2 - T), w / 2 - T], [-0.25, 0.25], [-(d / 2 - 1), d / 2 - 1]);
        const pairs = Math.floor((w - 2 * T) / 7);
        for (let p = 0; p < pairs; p++) {
          const x = -(w / 2 - T) + 1.2 + p * 7 + (rnd() - 0.5);
          const mat = this.shoeMats[Math.floor(rnd() * this.shoeMats.length)];
          for (const dx of [0, 3.1]) this._box(tray, mat, [x + dx, x + dx + 2.8], [0.25, 3.2], [-4.6, 4.6]);
        }
        g.add(tray);
      }
    }

    let doorBottom = TOE;
    if (look.drawers) {
      const fronts = [[TOE, TOE + 11], [TOE + 11, TOE + 22], [TOE + 22, TOE + DRAWER_ZONE]];
      for (const [y0, y1] of fronts) {
        this._box(g, oakH, [0.06, w - 0.06], [y0 + 0.06, y1 - 0.06], [d, d + T]);
        const L = Math.min(12, w * 0.45), yc = (y0 + y1) / 2;
        this._box(g, black, [w / 2 - L / 2, w / 2 + L / 2], [yc - 0.25, yc + 0.25], [d + T + 0.35, d + T + 0.85]);
        this._box(g, black, [w / 2 - L / 2 + 0.5, w / 2 - L / 2 + 1], [yc - 0.25, yc + 0.25], [d + T, d + T + 0.4]);
        this._box(g, black, [w / 2 + L / 2 - 1, w / 2 + L / 2 - 0.5], [yc - 0.25, yc + 0.25], [d + T, d + T + 0.4]);
      }
      doorBottom = TOE + DRAWER_ZONE;
    }

    if (look.doors) {
      const leaves = w <= 24 ? [hinge === "R" ? "R" : "L"] : ["L", "R"];
      const lw = w / leaves.length;
      leaves.forEach((side, i) => {
        const sign = side === "L" ? 1 : -1;
        const pivot = new THREE.Group();
        pivot.position.set(side === "L" ? i * lw : (i + 1) * lw, 0, d);
        const span = (a, b) => (sign > 0 ? [a, b] : [-b, -a]);
        const y0 = doorBottom + 0.06, y1 = H - 0.06;
        if (look.doors === "solid") {
          this._box(pivot, oakV, span(0.06, lw - 0.06), [y0, y1], [0, T]);
        } else {
          const f = 1.2;
          this._box(pivot, black, span(0.06, 0.06 + f), [y0, y1], [0, T]);
          this._box(pivot, black, span(lw - 0.06 - f, lw - 0.06), [y0, y1], [0, T]);
          this._box(pivot, black, span(0.06 + f, lw - 0.06 - f), [y1 - f, y1], [0, T]);
          this._box(pivot, black, span(0.06 + f, lw - 0.06 - f), [y0, y0 + f], [0, T]);
          const pane = this._box(pivot, glass, span(0.06 + f, lw - 0.06 - f), [y0 + f, y1 - f], [T / 2 - 0.1, T / 2 + 0.1]);
          pane.castShadow = false;
        }
        const hx = span(lw - 2.2, lw - 1.7);
        const hy = look.drawers ? [y0 + 3, y0 + 13] : [38, 50];
        this._box(pivot, black, hx, hy, [T + 0.35, T + 0.85]);
        this._box(pivot, black, hx, [hy[0] + 0.5, hy[0] + 1], [T, T + 0.4]);
        this._box(pivot, black, hx, [hy[1] - 1, hy[1] - 0.5], [T, T + 0.4]);
        pivot.rotation.y = doorsOpen ? (sign > 0 ? -OPEN_ANGLE : OPEN_ANGLE) : 0;
        g.add(pivot);
      });
    }
    return g;
  }

  // L-shaped easy-reach corner. Built for the back-left corner; `mirrorAt` mirrors it to x = mirrorAt - x.
  _corner(corner, mirrorAt, doorsOpen) {
    const g = new THREE.Group();
    const spec = cornerByCode[corner.code];
    const S = spec.size, d = DEPTHS[spec.depth].inches;
    const look = cornerInfo(corner).look;
    const { oakV, oakH } = this.mat;
    const mx = (r) => (mirrorAt == null ? r : [mirrorAt - r[1], mirrorAt - r[0]]);
    const box = (m, x, y, z) => this._box(g, m, mx(x), y, z);
    const rnd = mulberry(S);

    box(oakV, [0, S], [0, H], [0, T]);
    box(oakV, [0, T], [0, H], [T, S]);
    box(oakV, [S - T, S], [0, H], [T, d]);
    box(oakV, [T, d], [0, H], [S - T, S]);
    const slab = (y0, y1, m = oakH) => {
      box(m, [T, S - T], [y0, y1], [T, d]);
      box(m, [T, d], [y0, y1], [d, S - T]);
    };
    slab(TOE, TOE + T);
    slab(H - T, H);
    box(oakH, [d, S - T], [0, TOE], [d - T, d]);
    box(oakH, [d - T, d], [0, TOE], [d, S - T]);
    for (const y of look.shelves || []) slab(y - T / 2, y + T / 2);
    const shelves = look.shelves || [];
    for (const y of look.rods || []) {
      const c = Math.min(d / 2, 11);
      const below = Math.max(TOE + T, ...shelves.filter((s) => s < y - 1));
      const rodX = mx([c, S - T]);
      this._rod(g, "x", rodX[0], rodX[1], y, c);
      this._rod(g, "z", c, S - T, y, mirrorAt == null ? c : mirrorAt - c);
      const span = Math.min(d - 3, 16);
      const gx = mx([d + 1, S - T]);
      this._garments(g, "x", gx[0], gx[1], y, c, span, y - below, rnd);
      this._garments(g, "z", d + 1, S - T, y, mirrorAt == null ? c : mirrorAt - c, span, y - below, rnd);
    }
    if (look.doors && !doorsOpen) {
      box(oakV, [d, S - 0.06], [TOE + 0.06, H - 0.06], [d, d + T]);
      box(oakV, [d, d + T], [TOE + 0.06, H - 0.06], [d + T, S - 0.06]);
      const hx = mx([d + 1.7, d + 2.2]);
      this._box(g, this.mat.black, hx, [38, 50], [d + T + 0.35, d + T + 0.85]);
    }
    return g;
  }

  _outline(group) {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    box.expandByScalar(0.6);
    const helper = new THREE.Box3Helper(box, "#e5322d");
    this.root.add(helper);
  }
}

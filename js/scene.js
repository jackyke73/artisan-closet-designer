// 3D view. World units are inches. The room's back-left floor corner is the origin;
// +x runs along the back wall, +z comes out of the back wall toward the viewer.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HEIGHT as H, TOE, T, DRAWER_ZONE, DEPTHS, cornerByCode } from "./catalog.js";
import { activeWalls, wallGeometry, moduleInfo, cornerInfo, ROOM_WALLS, ROOM_FLOORS } from "./design.js";

const OPEN_ANGLE = 1.75; // about 100 degrees
const GARMENT_COLORS = ["#2f3640", "#4a5568", "#d9d4c7", "#8b7d6b", "#1f2a44", "#b9a58b", "#e8e4dc", "#5c4b3b", "#7a8a99"];
const SHOE_COLORS = ["#f2f2f0", "#6b4a2f", "#1d1d1f", "#b08a63", "#e9e6e0"];
const EYE = 63;           // standing eye height for the look-around view, inches
const ORBIT_FOV = 38, LOOK_FOV = 74;

function carpetTexture(base) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const rnd = mulberry(5);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * 0.06})` : `rgba(255,255,255,${rnd() * 0.08})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

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
  constructor(container, { onPick, onMenu, onDrag, onDragEnd } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.onMenu = onMenu;
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
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
      ceiling: new THREE.MeshStandardMaterial({ color: "#fbfaf7", roughness: 1 }),
      basket: new THREE.MeshStandardMaterial({ color: "#a58457", roughness: 0.95 }),
      rug: new THREE.MeshStandardMaterial({ color: "#e4ddd0", roughness: 1 }),
      rugEdge: new THREE.MeshStandardMaterial({ color: "#8c7f6c", roughness: 1 }),
      ottoman: new THREE.MeshStandardMaterial({ color: "#b9ab98", roughness: 0.95 }),
      select: new THREE.LineBasicMaterial({ color: "#e5322d" }),
      // sketch mode
      sketchFill: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      sketchGlass: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, transparent: true, opacity: 0.12, depthWrite: false }),
      ink: new THREE.LineBasicMaterial({ color: "#1d1d1d", toneMapped: false }),
      inkSoft: new THREE.LineBasicMaterial({ color: "#a9a49c", toneMapped: false }),
    };
    this.floorMats = {};
    this.garmentMats = GARMENT_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    this.shoeMats = SHOE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.frameKey = "";
    this.look = false;     // look-around (first-person) view
    this.motion = false;   // phone motion drives the look-around view
    this.sketch = false;
    this.decor = true;
    this.eye = new THREE.Vector3(0, EYE, 100);

    this._bindPicking();
    new ResizeObserver(() => this._resize()).observe(container);
    this._resize();
    const loop = () => {
      if (this.motion && this._orient) this._applyOrientation();
      else this.controls.update();
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
    if (this.look) this.camera.fov = this._lookFov();
    this.camera.updateProjectionMatrix();
  }

  _ray(cx, cy) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  _pickAt(cx, cy) {
    for (const hit of this._ray(cx, cy).intersectObjects(this.root.children, true)) {
      let o = hit.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick;
    }
    return null;
  }

  // Point on a plane at cabinet mid-height, as floor-plan x/z.
  _planePoint(cx, cy) {
    const p = new THREE.Vector3();
    return this._ray(cx, cy).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -40), p) ? p : null;
  }

  // Mouse: drag a module to move it, right-click for its settings.
  // Touch: press and hold a module, then drag to move it or let go for its settings.
  _bindPicking() {
    const el = this.renderer.domElement;
    const box = this.container;
    let down = null;      // { x, y, button, pick, touch }
    let drag = null;      // the module being dragged: { wall, index }
    let armed = false;    // touch: held long enough
    let holdTimer = null;
    const canDrag = (p) => p && !p.corner && !this.look;
    const endDrag = (e) => {
      clearTimeout(holdTimer);
      const wasDrag = drag;
      drag = null; armed = false;
      this.controls.enabled = !this.motion;
      el.style.cursor = "";
      if (wasDrag) this.onDragEnd?.();
      return wasDrag;
    };
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    box.addEventListener("pointerdown", (e) => {
      if (e.target !== el) return;
      this.onMenu?.(null);
      const pick = this._pickAt(e.clientX, e.clientY);
      down = { x: e.clientX, y: e.clientY, button: e.button, pick, touch: e.pointerType === "touch" };
      if (down.touch) {
        if (!canDrag(pick)) return;
        holdTimer = setTimeout(() => {
          armed = true;
          this.controls.enabled = false;
          navigator.vibrate?.(12);
          this.onPick?.(pick);
        }, 450);
      } else if (e.button === 0 && canDrag(pick)) {
        this.controls.enabled = false; // the press is on a module: move it, don't turn the view
      }
    }, true);
    box.addEventListener("pointermove", (e) => {
      if (!down) {
        if (e.pointerType === "mouse" && !this.look) el.style.cursor = canDrag(this._pickAt(e.clientX, e.clientY)) ? "grab" : "";
        return;
      }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (down.touch && !armed) { if (moved > 8) clearTimeout(holdTimer); return; }
      const ok = down.touch ? armed : down.button === 0 && canDrag(down.pick);
      if (!ok) return;
      if (!drag && moved > 5) { drag = { ...down.pick }; el.style.cursor = "grabbing"; }
      if (!drag) return;
      const p = this._planePoint(e.clientX, e.clientY);
      if (p) {
        const to = this.onDrag?.(drag, p.x, p.z);
        if (to) drag = to;
      }
    }, true);
    const up = (e) => {
      if (!down) return;
      const d = down;
      down = null;
      const wasArmed = armed;
      if (endDrag(e)) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved > 5) return;
      if (d.touch && wasArmed) return this.onMenu?.(d.pick, e.clientX, e.clientY);
      if (d.button === 2) {
        if (d.pick) { this.onPick?.(d.pick.corner ? null : d.pick); this.onMenu?.(d.pick, e.clientX, e.clientY); }
        return;
      }
      if (d.button === 0) this.onPick?.(d.pick && !d.pick.corner ? d.pick : null);
    };
    box.addEventListener("pointerup", up, true);
    box.addEventListener("pointercancel", () => { down = null; endDrag(); }, true);
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  // --- build ------------------------------------------------------------------
  update(design, { doorsOpen = false, selected = null, sketch = false } = {}) {
    this._clear();
    this.sketch = sketch;
    this.decor = design.room?.decor !== false;
    const walls = activeWalls(design);
    const geo = wallGeometry(design);
    const W = design.walls.back.width;
    const sideLen = walls.length > 1 ? Math.max(...walls.filter((k) => k !== "back").map((k) => design.walls[k].width)) : 30;
    this._room(design, W, sideLen);

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

    const key = `${design.layout}|${W}|${sideLen}|${this.look}`;
    this.eye.set(W / 2, EYE, design.layout === "reach" ? 30 + 84 : Math.max(sideLen - 10, 40));
    if (key !== this.frameKey) {
      this.frameKey = key;
      if (this.look) this._placeEye(); else this.frame(W, sideLen, design.layout);
    }
    this._light(W, sideLen);
    if (sketch) this._sketchify();
    this.scene.background.set(sketch ? "#ffffff" : "#ece8e1");
  }

  _clear() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.root.clear();
  }

  // ---- look-around view -------------------------------------------------------
  setLook(on) {
    if (this.look === on) return;
    this.look = on;
    const c = this.controls;
    this.camera.fov = on ? this._lookFov() : ORBIT_FOV;
    this.camera.updateProjectionMatrix();
    c.enableZoom = c.enablePan = !on;
    c.minDistance = on ? 0 : 30;
    c.maxDistance = on ? Infinity : 900;
    c.rotateSpeed = on ? -0.35 : 1;
    c.minPolarAngle = on ? 0.15 : 0;
    c.maxPolarAngle = on ? Math.PI - 0.15 : Math.PI / 2 - 0.03;
    if (!on) this.setMotion(false);
    this.frameKey = ""; // re-place the camera on the next update
  }

  // Portrait screens (phones) get a wider view so the closet still fits.
  _lookFov() {
    // keep at least an 80-degree horizontal view
    const v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(40)) / this.camera.aspect);
    return Math.min(105, Math.max(LOOK_FOV, THREE.MathUtils.radToDeg(v)));
  }

  _placeEye() {
    this.camera.position.copy(this.eye);
    this.controls.target.copy(this.eye).add(new THREE.Vector3(0, -0.012, -0.1));
    this.camera.quaternion.identity();
    this.controls.update();
  }

  // Phone motion: returns false if the browser does not allow it.
  async setMotion(on) {
    if (!on) {
      if (this._onOrient) window.removeEventListener("deviceorientation", this._onOrient);
      this.motion = false; this._orient = null; this._alpha0 = null;
      this.controls.enabled = true;
      if (this.look) this._placeEye();
      return false;
    }
    try {
      const D = window.DeviceOrientationEvent;
      if (!D) return false;
      if (typeof D.requestPermission === "function" && (await D.requestPermission()) !== "granted") return false;
    } catch { return false; }
    this._onOrient = (e) => { if (e.alpha != null) this._orient = e; };
    window.addEventListener("deviceorientation", this._onOrient);
    this.motion = true;
    this.controls.enabled = false;
    return true;
  }

  _applyOrientation() {
    const { alpha, beta, gamma } = this._orient;
    if (this._alpha0 == null) this._alpha0 = alpha;
    const rad = THREE.MathUtils.degToRad;
    const screenAngle = rad(screen.orientation?.angle ?? window.orientation ?? 0);
    const euler = new THREE.Euler(rad(beta), rad(alpha - this._alpha0), -rad(gamma), "YXZ");
    const q = new THREE.Quaternion().setFromEuler(euler);
    q.multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenAngle));
    this.camera.position.copy(this.eye);
    this.camera.quaternion.copy(q);
  }

  // ---- sketch mode: white surfaces with ink outlines ------------------------------
  _sketchify() {
    const meshes = [];
    this.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      let soft = false;
      for (let o = m; o; o = o.parent) if (o.userData.soft) { soft = true; break; }
      m.material = m.material === this.mat.glass ? this.mat.sketchGlass : this.mat.sketchFill;
      m.castShadow = m.receiveShadow = false;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), soft ? this.mat.inkSoft : this.mat.ink);
      m.add(edges);
    }
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

  _floorMat(id) {
    if (!this.floorMats[id]) {
      const f = ROOM_FLOORS[id];
      const map = f.grain ? woodTexture(false, f.color) : carpetTexture(f.color);
      map.repeat.set(f.grain ? 4 : 8, f.grain ? 4 : 8);
      this.floorMats[id] = new THREE.MeshStandardMaterial({ map, roughness: f.grain ? 0.75 : 1 });
    }
    return this.floorMats[id];
  }

  _room(design, W, sideLen) {
    const layout = design.layout;
    const room = design.room || { wall: "white", floor: "oak", decor: true };
    this.mat.wall.color.set(ROOM_WALLS[room.wall]?.color || "#f3efe8");
    this.mat.floor = this._floorMat(room.floor in ROOM_FLOORS ? room.floor : "oak");
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
    if (this.look) this._enclose(g, layout, W, roomD, floorW, floorD, wallH, plane);
    if (this.decor) this._roomDecor(g, layout, W, roomD);
    this.root.add(g);
  }

  // In the look-around view, close the room around the viewer (walls behind, ceiling).
  _enclose(g, layout, W, roomD, floorW, floorD, wallH, plane) {
    const add = (w, h, rx, ry, x, y, z, mat = this.mat.wall) => {
      const m = plane(w, h, mat);
      m.rotation.set(rx, ry, 0);
      m.position.set(x, y, z);
      g.add(m);
    };
    if (layout === "reach") {
      const x0 = W / 2 - floorW / 2, x1 = W / 2 + floorW / 2, z0 = roomD + 4, z1 = floorD;
      add(floorW, wallH, 0, Math.PI, W / 2, wallH / 2, z1);
      add(z1 - z0, wallH, 0, Math.PI / 2, x0, wallH / 2, (z0 + z1) / 2);
      add(z1 - z0, wallH, 0, -Math.PI / 2, x1, wallH / 2, (z0 + z1) / 2);
      add(floorW, floorD, Math.PI / 2, 0, W / 2, wallH, floorD / 2, this.mat.ceiling);
    } else {
      const door = 32, side = (W - door) / 2;
      if (side > 0) {
        add(side, wallH, 0, Math.PI, side / 2, wallH / 2, roomD);
        add(side, wallH, 0, Math.PI, W - side / 2, wallH / 2, roomD);
      }
      add(Math.min(door, W), wallH - 82, 0, Math.PI, W / 2, 82 + (wallH - 82) / 2, roomD);
      if (layout === "L") add(roomD, wallH, 0, -Math.PI / 2, W, wallH / 2, roomD / 2);
      add(W, roomD, Math.PI / 2, 0, W / 2, wallH, roomD / 2, this.mat.ceiling);
    }
  }

  // Rug and, in a walk-in, an ottoman.
  _roomDecor(g, layout, W, roomD) {
    const d = new THREE.Group();
    d.userData.soft = true;
    const rug = (cx, cz, w, l) => {
      this._box(d, this.mat.rugEdge, [cx - w / 2, cx + w / 2], [0, 0.25], [cz - l / 2, cz + l / 2]).castShadow = false;
      this._box(d, this.mat.rug, [cx - w / 2 + 2, cx + w / 2 - 2], [0.25, 0.4], [cz - l / 2 + 2, cz + l / 2 - 2]).castShadow = false;
    };
    if (layout === "reach") {
      rug(W / 2, roomD + 42, Math.min(W, 84), 48);
    } else {
      const clear = W - 2 * 24 - 12;
      const len = roomD - 24 - 18;
      if (clear >= 30 && len >= 30) {
        const cz = 24 + 6 + len / 2;
        rug(W / 2, cz, Math.min(clear, 72), Math.min(len, 96));
        if (clear >= 44 && len >= 44) {
          const o = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 16, 40), this.mat.ottoman);
          o.position.set(W / 2, 8.4, cz);
          o.castShadow = o.receiveShadow = true;
          d.add(o);
        }
      }
    }
    g.add(d);
  }

  // Folded clothes and baskets on open shelves.
  _shelfDecor(g, look, w, d, rnd) {
    if (look.doors === "solid" || look.shoe) return;
    const shelves = [...(look.shelves || [])].sort((a, b) => a - b);
    const tops = [TOE + T, ...shelves.map((y) => y + T / 2)];
    const ceilings = [...shelves.map((y) => y - T / 2), H - T];
    const dec = new THREE.Group();
    dec.userData.soft = true;
    const itemD = Math.min(d - 3, 12);
    const z1 = d - 1.2, z0 = z1 - itemD;
    tops.forEach((top, i) => {
      const ceil = ceilings[i];
      const gap = ceil - top;
      if (gap < 7) return;
      if (look.drawers && top < TOE + DRAWER_ZONE + 1) return;
      if ((look.rods || []).some((r) => r > top && r <= ceil + 1)) return;
      if (gap > 16 && rnd() < 0.45) {
        const n = Math.max(1, Math.floor((w - 2 * T) / 13));
        const bw = (w - 2 * T - 1.5 * (n + 1)) / n;
        for (let k = 0; k < n; k++) {
          const x = T + 1.5 + k * (bw + 1.5);
          this._box(dec, this.mat.basket, [x, x + bw], [top, top + Math.min(gap - 3, 10)], [z0, z1]);
        }
        return;
      }
      const n = Math.max(1, Math.floor((w - 2 * T - 2) / 11));
      const sw = Math.min(10, (w - 2 * T - 2) / n - 1);
      for (let k = 0; k < n; k++) {
        if (rnd() < 0.3) continue;
        const layers = Math.min(Math.floor((gap - 2) / 1.6), 3 + Math.floor(rnd() * 4));
        const x = T + 1 + k * (sw + 1) + (rnd() - 0.5) * 0.4;
        for (let l = 0; l < layers; l++) {
          const mat = this.garmentMats[Math.floor(rnd() * this.garmentMats.length)];
          const j = (rnd() - 0.5) * 0.5;
          this._box(dec, mat, [x + j, x + sw + j], [top + l * 1.6, top + (l + 1) * 1.6 - 0.1], [z0, z1]);
        }
      }
    });
    g.add(dec);
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

  _garments(parent0, axis, a0, a1, y, c, span, avail, rnd) {
    const parent = new THREE.Group();
    parent.userData.soft = true;
    parent0.add(parent);
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
        tray.userData.soft = true;
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

    if (this.decor) this._shelfDecor(g, look, w, d, rnd);

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

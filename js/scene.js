// 3D view. World units are inches. The room's back-left floor corner is the origin;
// +x runs along the back wall, +z comes out of the back wall toward the viewer.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { fmtIn } from "./units.js";
import { HEIGHT as H, TOE, T, DRAWER_ZONE, DEPTHS, cornerByCode } from "./catalog.js";
import { activeWalls, wallGeometry, moduleInfo, cornerInfo, cornerOn, roomDepth, isWalk, ceilingAt, wallLength, ROOM_WALLS, ROOM_FLOORS } from "./design.js";

const OPEN_ANGLE = 1.75; // about 100 degrees
const GARMENT_COLORS = ["#2f3640", "#4a5568", "#d9d4c7", "#8b7d6b", "#1f2a44", "#b9a58b", "#e8e4dc", "#5c4b3b", "#7a8a99"];
const SHOE_COLORS = ["#f2f2f0", "#6b4a2f", "#1d1d1f", "#b08a63", "#e9e6e0"];
const EYE = 63;           // standing eye height for the look-around view, inches
const ORBIT_FOV = 38, LOOK_FOV = 74;
const SNAP_R = 2.5;       // measuring snaps to a corner this close, inches
// Camera views. dir points from the room toward the camera; flat views start without perspective.
export const VIEWS = {
  overview: { name: "3D" },
  front: { name: "Front", dir: [0, 0, 1], flat: true, title: "Straight at the back wall" },
  top: { name: "Top", dir: [0, 1, 0.0001], flat: true, title: "From above, like the floor plan" },
  left: { name: "Left wall", dir: [1, 0, 0], flat: true, title: "Straight at the left wall" },
  right: { name: "Right wall", dir: [-1, 0, 0], flat: true, title: "Straight at the right wall" },
  cornerL: { name: "Left corner", dir: [-0.8, 0.6, 1], title: "From the front left corner" },
  cornerR: { name: "Right corner", dir: [0.8, 0.6, 1], title: "From the front right corner" },
};

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

// false if the object or any parent is hidden (raycasting ignores visibility)
function shown(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
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
  constructor(container, { onPick, onMenu, onDrag, onDragEnd, onMeasure } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.onMenu = onMenu;
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
    this.onMeasure = onMeasure;
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

    this.persp = this.camera = new THREE.PerspectiveCamera(38, 1, 1, 3000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.minZoom = 0.3;
    this.controls.maxZoom = 12;
    // labels for dimensions and measurements
    const css = (this.labels = new CSS2DRenderer());
    css.domElement.className = "labels3d";
    container.appendChild(css.domElement);
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
      window: new THREE.MeshStandardMaterial({ color: "#dfeef5", emissive: "#cfe6f2", emissiveIntensity: 0.55, roughness: 0.1 }),
      trim: new THREE.MeshStandardMaterial({ color: "#fbfaf6", roughness: 0.6 }),
      doorLeaf: new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.55 }),
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
      dimLine: new THREE.LineBasicMaterial({ color: "#1d1d1d", depthTest: false, transparent: true, opacity: 0.85 }),
      tape: new THREE.LineBasicMaterial({ color: "#e5322d", depthTest: false }),
      tapeDot: new THREE.MeshBasicMaterial({ color: "#e5322d", depthTest: false }),
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
    this.dimGroup = new THREE.Group();
    this.tapeGroup = new THREE.Group();
    this.scene.add(this.dimGroup, this.tapeGroup);
    this.dimGroup.renderOrder = this.tapeGroup.renderOrder = 10;
    this.viewName = "overview";
    this.flat = false;
    this.cut = true;        // hide walls between the camera and the room
    this.cutters = [];      // wall pieces that can be hidden
    this.showDims = false;
    this.measuring = false;
    this.measures = [];     // [{ a, b }] in world inches
    this.pending = null;    // first point of a measurement in progress
    this.tween = null;
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
      else {
        if (this.tween) this._stepTween();
        this.controls.update();
      }
      this._cutaway();
      r.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.persp.aspect = w / h;
    if (this.look) this.persp.fov = this._lookFov();
    this.persp.updateProjectionMatrix();
    this._orthoFrustum();
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
      if (!shown(hit.object)) continue;
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
    const canDrag = (p) => p && !p.corner && !this.look && !this.measuring;
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
        if (this.measuring) { el.style.cursor = "crosshair"; if (e.pointerType === "mouse") this._tapeHover(e.clientX, e.clientY, e.shiftKey); return; }
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
      if (this.measuring) {
        if (d.button === 2) this.cancelMeasure();
        else if (d.button === 0) this._tapeClick(e.clientX, e.clientY, e.shiftKey);
        return;
      }
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
    const sideLen = roomDepth(design);
    const layout = isWalk(design) ? "walk" : "reach";
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
      const c = cornerOn(design, side);
      if (c) {
        const g = this._corner(c, side === "right" ? W : null, doorsOpen);
        g.userData.pick = { wall: side, corner: true };
        this.root.add(g);
      }
    }

    this.bounds = { W, D: sideLen, H: Math.max(design.ceiling || 96, H), t: design.wallT || 4.5, walk: layout === "walk" };
    this._buildDims(design, geo, walls);
    const key = `${layout}|${W}|${sideLen}|${this.look}`;
    this.eye.set(W / 2, Math.min(EYE, (design.ceiling || 96) - 12), layout === "reach" ? 30 + 84 : Math.max(sideLen - 10, 40));
    if (key !== this.frameKey) {
      this.frameKey = key;
      if (this.look) this._placeEye(); else this._applyView(true);
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
    this.tween = null;
    if (on) this._useCamera(this.persp);
    else this._useCamera(this.flat ? this.ortho : this.persp);
    this.persp.fov = on ? this._lookFov() : ORBIT_FOV;
    this.persp.updateProjectionMatrix();
    c.enableZoom = c.enablePan = !on;
    c.minDistance = on ? 0 : 30;
    c.maxDistance = on ? Infinity : 900;
    c.rotateSpeed = on ? -0.35 : 1;
    c.minPolarAngle = on ? 0.15 : 0;
    c.maxPolarAngle = on ? Math.PI - 0.15 : Math.PI / 2;
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

  frame() { this._applyView(true); }

  // ---- camera views ------------------------------------------------------------
  setView(name, { instant = false } = {}) {
    if (!VIEWS[name]) return;
    this.viewName = name;
    if (this.look) return;
    const flat = !!VIEWS[name].flat;
    if (flat !== this.flat) this.setFlat(flat, { reframe: false });
    this._applyView(instant);
  }

  setFlat(on, { reframe = true } = {}) {
    this.flat = on;
    if (this.look) return;
    const from = this.camera;
    const target = this.controls.target.clone();
    const to = on ? this.ortho : this.persp;
    if (to === from) return;
    // keep the same direction; the views fit themselves below
    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    this._useCamera(to);
    this.controls.target.copy(target);
    if (reframe) this._applyView(true, { keepDir: true });
  }

  _useCamera(cam) {
    this.camera = cam;
    this.controls.object = cam;
    if (cam === this.ortho) { cam.zoom = 1; this._orthoFrustum(); }
    cam.updateProjectionMatrix();
    this.controls.update();
  }

  _orthoFrustum() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    const a = w / h, half = this.halfH || 80;
    Object.assign(this.ortho, { left: -half * a, right: half * a, top: half, bottom: -half });
    this.ortho.updateProjectionMatrix();
  }

  // Put the camera so the whole room fits. keepDir: fit along the current direction.
  _applyView(instant, { keepDir = false } = {}) {
    const b = this.bounds;
    if (!b) return;
    if (this.look) { this._placeEye(); return; }
    const reach = !b.walk;
    const depth = reach ? 24 : b.D;
    let target, dir;
    if (keepDir) {
      target = this.controls.target.clone();
      dir = this.camera.position.clone().sub(target).normalize();
    } else if (this.viewName === "overview") {
      // the original three-quarter view
      target = new THREE.Vector3(b.W / 2, 44, depth * 0.3);
      const span = Math.max(b.W, depth, 90);
      const dist = span * 1.3 + 70 + (reach ? 0 : depth * 0.7);
      const pos = new THREE.Vector3(b.W / 2 + span * 0.35, 70, target.z + dist);
      dir = pos.clone().sub(target).normalize();
      if (!this.flat) return this._moveTo(pos, target, instant, Math.max(80, dist * 0.18));
    } else {
      const v = VIEWS[this.viewName];
      target = new THREE.Vector3(b.W / 2, this.viewName === "top" ? 0 : b.H / 2, (reach ? b.D : b.D) / 2);
      dir = new THREE.Vector3(...v.dir).normalize();
    }
    // size of the room as seen along dir
    const f = dir.clone().negate();
    const up = Math.abs(f.y) > 0.99 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(f, up).normalize();
    const up2 = new THREE.Vector3().crossVectors(right, f).normalize();
    let w = 0, h = 0, dz = 0;
    for (const x of [-b.t, b.W + b.t]) for (const y of [0, b.H]) for (const z of [-b.t, b.D + (reach ? 10 : 0)]) {
      const p = new THREE.Vector3(x, y, z).sub(target);
      w = Math.max(w, Math.abs(p.dot(right)));
      h = Math.max(h, Math.abs(p.dot(up2)));
      dz = Math.max(dz, Math.abs(p.dot(f)));
    }
    const { clientWidth: cw, clientHeight: ch } = this.container;
    const aspect = cw && ch ? cw / ch : 1.5;
    const margin = this.fitMargin || 1.38; // room for the tool bars over the view
    if (this.flat) {
      this.halfH = Math.max(h, w / aspect) * margin + 6;
      this.ortho.zoom = 1;
      this._orthoFrustum();
      return this._moveTo(target.clone().addScaledVector(dir, 2000), target, instant, 0);
    }
    const tan = Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
    const dist = Math.max(h / tan, w / (tan * aspect)) * margin + dz;
    this._moveTo(target.clone().addScaledVector(dir, dist), target, instant, 0);
  }

  _moveTo(pos, target, instant) {
    if (instant) {
      this.tween = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this.tween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms: 450 };
  }

  _stepTween() {
    const tw = this.tween;
    const k = Math.min(1, (performance.now() - tw.start) / tw.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    // swing around the target instead of cutting through the room
    const r0 = tw.p0.clone().sub(tw.t0), r1 = tw.p1.clone().sub(tw.t1);
    const len = r0.length() + (r1.length() - r0.length()) * e;
    const d = r0.normalize().lerp(r1.normalize(), e);
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    const t = tw.t0.clone().lerp(tw.t1, e);
    this.controls.target.copy(t);
    this.camera.position.copy(t).addScaledVector(d.normalize(), len);
    if (k >= 1) this.tween = null;
  }

  // Render one named view to a picture without moving the customer's camera.
  renderView(name) {
    const keep = { cam: this.camera, pos: this.camera.position.clone(), q: this.camera.quaternion.clone(), target: this.controls.target.clone(),
      view: this.viewName, flat: this.flat, halfH: this.halfH, zoom: this.ortho.zoom, look: this.look };
    if (this.look) this.setLook(false);
    this.tween = null;
    this.viewName = name;
    this.flat = !!VIEWS[name]?.flat;
    this._useCamera(this.flat ? this.ortho : this.persp);
    this.fitMargin = 1.08; // nothing covers a saved picture
    this._applyView(true);
    this.fitMargin = null;
    this._cutaway();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    // restore
    this.viewName = keep.view; this.flat = keep.flat; this.halfH = keep.halfH;
    this._useCamera(keep.cam);
    this.ortho.zoom = keep.zoom; this.ortho.updateProjectionMatrix();
    this.camera.position.copy(keep.pos); this.camera.quaternion.copy(keep.q);
    this.controls.target.copy(keep.target);
    this.controls.update();
    if (keep.look) this.setLook(true), this._placeEye();
    return url;
  }

  // Hide each wall the camera is behind, so the cabinets on it stay visible.
  _cutaway() {
    const b = this.bounds;
    if (!b) return;
    const p = this.camera.position;
    for (const o of this.cutters) {
      const k = o.userData.side;
      const behind = k === "back" ? p.z < -1 : k === "front" ? p.z > b.D + 1 : k === "left" ? p.x < -1 : p.x > b.W + 1;
      o.visible = !(this.cut && !this.look && behind);
    }
  }

  // ---- dimensions in 3D -------------------------------------------------------------
  _label(text, pos, cls = "") {
    const div = document.createElement("div");
    div.className = `dim3d ${cls}`;
    div.textContent = text;
    const o = new CSS2DObject(div);
    o.position.copy(pos);
    return o;
  }

  _clearGroup(g) {
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    g.clear();
  }

  _buildDims(design, geo, walls) {
    const g = this.dimGroup;
    this._clearGroup(g);
    if (!this.showDims) return;
    const W = design.walls.back.width, RD = roomDepth(design);
    const walk = isWalk(design);
    const pts = [];
    // wall k: u along the wall, y up, v out from the wall -> world
    const P = (k, u, y, v) => (k === "back" ? new THREE.Vector3(u, y, v) : k === "left" ? new THREE.Vector3(v, y, u) : new THREE.Vector3(W - v, y, u));
    const seg = (a, b) => pts.push(a, b);
    const chain = (k, marks, y, v, labels, cls) => {
      seg(P(k, marks[0], y, v), P(k, marks[marks.length - 1], y, v));
      for (const u of marks) seg(P(k, u, y - 1.6, v), P(k, u, y + 1.6, v));
      labels.forEach(([u, text]) => g.add(this._label(text, P(k, u, y + 2.2, v), cls)));
    };
    for (const k of walls) {
      const mods = design.walls[k].modules;
      if (!mods.length) continue;
      let s = geo[k].start;
      const marks = [s], labels = [];
      let deep = 0;
      for (const m of mods) {
        labels.push([s + m.w / 2, fmtIn(m.w, { feet: false })]);
        s += m.w;
        marks.push(s);
        deep = Math.max(deep, DEPTHS[m.depth].inches);
      }
      chain(k, marks, H + 3, deep + 1.5, labels, "");
    }
    // overall wall lengths along the top of each wall
    const sides = walk ? ["back", "left", "right"] : ["back"];
    for (const k of sides) {
      const len = k === "back" ? W : RD;
      chain(k, [0, len], H + 11, 1.5, [[len / 2, `${k === "back" ? "Back" : k === "left" ? "Left" : "Right"} wall ${fmtIn(len)}`]], "strong");
    }
    // heights: cabinets and ceiling
    const ceil = design.ceiling || 96;
    // at the front right corner of a walk-in, the back right corner of a reach-in
    const hx = Math.max(2, W - 3), hz = walk ? Math.max(2, RD - 3) : 2;
    seg(new THREE.Vector3(hx, 0, hz), new THREE.Vector3(hx, ceil, hz));
    for (const y of [0, H, ceil]) seg(new THREE.Vector3(hx - 1.6, y, hz), new THREE.Vector3(hx + 1.6, y, hz));
    g.add(this._label(`Ceiling ${fmtIn(ceil)}`, new THREE.Vector3(hx, ceil - 4, hz), "strong"));
    g.add(this._label(`Cabinets ${H}"`, new THREE.Vector3(hx, H / 2, hz), ""));
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this.mat.dimLine);
    lines.renderOrder = 10;
    g.add(lines);
  }

  setDims(on) { this.showDims = on; }
  setCut(on) { this.cut = on; }

  // ---- tape measure ---------------------------------------------------------------------
  setMeasuring(on) {
    this.measuring = on;
    this.pending = null;
    this.renderer.domElement.style.cursor = on ? "crosshair" : "";
    this._drawTape();
  }
  cancelMeasure() { this.pending = null; this._drawTape(); }
  clearMeasures() { this.measures = []; this.pending = null; this._drawTape(); this.onMeasure?.(this.measures); }

  // The surface point under the pointer, snapped to a nearby corner.
  _tapePoint(cx, cy) {
    for (const hit of this._ray(cx, cy).intersectObjects([...this.root.children], true)) {
      const o = hit.object;
      if (!o.isMesh || !shown(o) || o.material === this.mat.glass || o.material === this.mat.sketchGlass) continue;
      const p = hit.point.clone();
      const pos = o.geometry.getAttribute("position");
      let best = null, bd = SNAP_R;
      if (pos && pos.count < 4000) {
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const dd = v.distanceTo(p);
          if (dd < bd) { bd = dd; best = v.clone(); }
        }
      }
      if (best) return { p: best, snapped: true };
      return { p: new THREE.Vector3(...p.toArray().map((c) => Math.round(c * 8) / 8)), snapped: false };
    }
    return null;
  }

  // Shift keeps the line straight along one direction.
  _lock(a, b, on) {
    if (!on || !a) return b;
    const d = b.clone().sub(a);
    const ax = ["x", "y", "z"].reduce((m, k) => (Math.abs(d[k]) > Math.abs(d[m]) ? k : m), "x");
    const out = a.clone();
    out[ax] = b[ax];
    return out;
  }

  _tapeHover(cx, cy, shift) {
    const hit = this._tapePoint(cx, cy);
    this._hover = hit ? { ...hit, p: this._lock(this.pending, hit.p, shift) } : null;
    this._drawTape();
  }

  _tapeClick(cx, cy, shift) {
    const hit = this._tapePoint(cx, cy);
    if (!hit) return;
    const p = this._lock(this.pending, hit.p, shift);
    if (!this.pending) this.pending = p;
    else {
      if (p.distanceTo(this.pending) > 0.05) this.measures.push({ a: this.pending, b: p });
      this.pending = null;
      this.onMeasure?.(this.measures);
    }
    this._hover = null;
    this._drawTape();
  }

  _drawTape() {
    const g = this.tapeGroup;
    this._clearGroup(g);
    const dot = (p, r = 0.9) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), this.mat.tapeDot);
      m.position.copy(p);
      m.renderOrder = 11;
      g.add(m);
    };
    const line = (a, b, cls) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), this.mat.tape);
      l.renderOrder = 11;
      g.add(l);
      dot(a); dot(b);
      g.add(this._label(fmtIn(a.distanceTo(b)), a.clone().lerp(b, 0.5), `tape ${cls}`));
    };
    for (const m of this.measures) line(m.a, m.b, "");
    if (!this.measuring) return;
    if (this.pending && this._hover) line(this.pending, this._hover.p, "live");
    else if (this.pending) dot(this.pending);
    else if (this._hover) dot(this._hover.p, this._hover.snapped ? 1.3 : 0.7);
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

  // Walls are slabs `t` thick that grow outward, so the room keeps its inside size.
  // Their tops follow the ceiling (including a slope), and windows and doors are cut out.
  _room(design, W, roomD) {
    const walk = isWalk(design);
    const room = design.room || { wall: "white", floor: "oak", decor: true };
    this.mat.wall.color.set(ROOM_WALLS[room.wall]?.color || "#f3efe8");
    this.mat.floor = this._floorMat(room.floor in ROOM_FLOORS ? room.floor : "oak");
    const g = new THREE.Group();
    this.cutters = [];
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
    const t = design.wallT || 4.5;
    const ceil = design.ceiling || 96;
    const openings = (design.openings || []).filter((o) => (walk ? true : o.wall === "back"));

    // wall k: u runs along the wall (back/front: x, left/right: z), from u0 to u1
    const heightAt = (k, u) => {
      const p = { back: [u, 0], front: [u, roomD], left: [0, u], right: [W, u] }[k];
      return ceilingAt(design, p[0], p[1]);
    };
    const wallMesh = (k, u0, u1, top = null) => {
      const us = [u0, u1];
      const sl = design.slope;
      if (sl && top == null) {
        const run = sl.run;
        const breaks = { back: { left: [run], right: [W - run] }, front: { left: [run], right: [W - run] }, left: { back: [run] }, right: { back: [run] } }[k]?.[sl.wall] || [];
        for (const b of breaks) if (b > u0 && b < u1) us.push(b);
      }
      us.sort((a, b) => a - b);
      const h = (u) => (top != null ? top : heightAt(k, Math.min(Math.max(u, k === "back" || k === "front" ? 0 : 0), wallLength(design, k))));
      const shape = new THREE.Shape();
      shape.moveTo(u0, 0);
      shape.lineTo(u1, 0);
      for (const u of [...us].reverse()) shape.lineTo(u, h(u));
      shape.closePath();
      for (const o of openings) {
        if (o.wall !== k || top != null) continue;
        const a = Math.max(o.at, u0 + 0.1), b = Math.min(o.at + o.w, u1 - 0.1);
        const y0 = o.kind === "door" ? 0.01 : o.sill, y1 = Math.min(y0 + o.h, Math.min(h(a), h(b)) - 0.5);
        if (b - a < 1 || y1 - y0 < 1) continue;
        const hole = new THREE.Path();
        hole.moveTo(a, y0); hole.lineTo(b, y0); hole.lineTo(b, y1); hole.lineTo(a, y1); hole.closePath();
        shape.holes.push(hole);
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
      const m = new THREE.Mesh(geo, this.mat.wall);
      m.receiveShadow = true;
      m.castShadow = false;
      if (k === "back") m.position.set(0, 0, -t);
      if (k === "front") m.position.set(0, 0, roomD);
      if (k === "left") { m.rotation.y = -Math.PI / 2; m.position.set(0, 0, 0); }
      if (k === "right") { m.rotation.y = -Math.PI / 2; m.position.set(W + t, 0, 0); }
      m.userData.side = k;
      this.cutters.push(m);
      g.add(m);
      return m;
    };

    if (walk) {
      wallMesh("back", -t, W + t);
      wallMesh("left", 0, roomD);
      wallMesh("right", 0, roomD);
      if (this.look) wallMesh("front", -t, W + t);
    } else {
      // reach-in: the closet's back and short sides, and the bedroom wall with the opening
      wallMesh("back", -80, W + 80);
      wallMesh("left", 0, roomD);
      wallMesh("right", 0, roomD);
      const header = Math.min(ceil, 92);
      const front = new THREE.Group();
      const slab = (sx, sy, x, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, t), this.mat.wall);
        m.position.set(x, y, roomD + t / 2);
        m.receiveShadow = true;
        front.add(m);
      };
      if (ceil > header) slab(W + 160, ceil - header, W / 2, header + (ceil - header) / 2);
      for (const x of [-40 - t / 2, W + 40 + t / 2]) slab(80 - t, ceil, x, ceil / 2);
      g.add(front);
    }
    for (const o of openings) this._openingFill(g, design, o, W, roomD, t);
    for (const b of design.obstacles || []) {
      const top = b.kind === "soffit" ? ceilingAt(design, b.x + b.w / 2, b.z + b.d / 2) : ceilingAt(design, b.x + b.w / 2, b.z + b.d / 2);
      const y0 = b.kind === "soffit" ? b.bottom : 0;
      if (top - y0 > 0.5) {
        const m = this._box(g, this.mat.wall, [b.x, b.x + b.w], [y0, top], [b.z, b.z + b.d]);
        m.userData.obstacle = true;
      }
    }
    if (design.slope) this._slopeCeiling(g, design, W, roomD, walk);
    if (this.look) this._enclose(g, walk, W, roomD, floorW, floorD, ceil, plane, design);
    if (this.decor) this._roomDecor(g, walk ? "walk" : "reach", W, roomD);
    this.root.add(g);
  }

  // Glass in a window opening, a door leaf in a door opening, with trim on the room side.
  _openingFill(g, design, o, W, roomD, t) {
    const grp = new THREE.Group();
    const y0 = o.kind === "door" ? 0 : o.sill, h = o.h;
    const trim = 2.25;
    const box = (m, x, y, z) => this._box(grp, m, x, y, z);
    if (o.kind === "window") {
      const pane = box(this.mat.window, [0, o.w], [y0, y0 + h], [-t / 2 - 0.15, -t / 2 + 0.15]);
      pane.castShadow = false;
      box(this.mat.trim, [0, o.w], [y0 + h / 2 - 0.6, y0 + h / 2 + 0.6], [-t / 2 - 0.5, -t / 2 + 0.5]);
      box(this.mat.trim, [-trim, o.w + trim], [y0 - 1.4, y0], [0, 1.4]); // sill
    } else {
      const leaf = new THREE.Group();
      this._box(leaf, this.mat.doorLeaf, [0, o.w - 0.25], [0.2, h - 0.25], [0, 1.4]);
      this._box(leaf, this.mat.black, [o.w - 3.2, o.w - 2.6], [35, 37], [1.4, 3]);
      leaf.position.set(0.1, 0, o.swing === "out" ? -t : 0);
      leaf.rotation.y = o.swing === "out" ? 0 : 0;
      grp.add(leaf);
    }
    for (const [x0, x1] of [[-trim, 0], [o.w, o.w + trim]]) box(this.mat.trim, [x0, x1], [y0, y0 + h + trim], [0, 0.6]);
    box(this.mat.trim, [-trim, o.w + trim], [y0 + h, y0 + h + trim], [0, 0.6]);
    // grp is built facing +z on the back wall; turn it onto its wall
    if (o.wall === "back") grp.position.set(o.at, 0, 0);
    if (o.wall === "front") { grp.rotation.y = Math.PI; grp.position.set(o.at + o.w, 0, roomD); }
    if (o.wall === "left") { grp.rotation.y = Math.PI / 2; grp.position.set(0, 0, o.at + o.w); }
    if (o.wall === "right") { grp.rotation.y = -Math.PI / 2; grp.position.set(W, 0, o.at); }
    if (o.wall === "front" && !this.look) return;
    grp.userData.side = o.wall;
    this.cutters.push(grp);
    g.add(grp);
  }

  // The sloped part of an attic ceiling. It faces down, so it disappears when the view is from above.
  _slopeCeiling(g, design, W, roomD, walk) {
    const s = design.slope, c = design.ceiling || 96;
    const run = Math.min(s.run, s.wall === "back" ? roomD : W);
    const hi = s.knee + ((c - s.knee) * run) / s.run;
    let pts;
    const D = walk ? roomD : roomD;
    if (s.wall === "back") pts = [[0, s.knee, 0], [W, s.knee, 0], [W, hi, run], [0, hi, run]];
    if (s.wall === "left") pts = [[0, s.knee, D], [0, s.knee, 0], [run, hi, 0], [run, hi, D]];
    if (s.wall === "right") pts = [[W, s.knee, 0], [W, s.knee, D], [W - run, hi, D], [W - run, hi, 0]];
    const geo = new THREE.BufferGeometry();
    const v = pts.flat();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const n = new THREE.Vector3().fromBufferAttribute(geo.getAttribute("normal"), 0);
    if (n.y > 0) { geo.setIndex([0, 2, 1, 0, 3, 2]); geo.computeVertexNormals(); }
    const m = new THREE.Mesh(geo, this.mat.ceiling);
    m.receiveShadow = true;
    g.add(m);
  }

  // In the look-around view, close the room around the viewer (walls behind, ceiling).
  _enclose(g, walk, W, roomD, floorW, floorD, wallH, plane, design) {
    const add = (w, h, rx, ry, x, y, z, mat = this.mat.wall) => {
      const m = plane(w, h, mat);
      m.rotation.set(rx, ry, 0);
      m.position.set(x, y, z);
      g.add(m);
    };
    if (!walk) {
      const x0 = W / 2 - floorW / 2, x1 = W / 2 + floorW / 2, z0 = roomD + 4, z1 = floorD;
      add(floorW, wallH, 0, Math.PI, W / 2, wallH / 2, z1);
      add(z1 - z0, wallH, 0, Math.PI / 2, x0, wallH / 2, (z0 + z1) / 2);
      add(z1 - z0, wallH, 0, -Math.PI / 2, x1, wallH / 2, (z0 + z1) / 2);
      add(floorW, floorD, Math.PI / 2, 0, W / 2, wallH, floorD / 2, this.mat.ceiling);
    } else {
      // flat part of the ceiling (the slope is drawn separately)
      const s = design.slope;
      let [x0, x1, z0, z1] = [0, W, 0, roomD];
      if (s?.wall === "back") z0 = Math.min(roomD, s.run);
      if (s?.wall === "left") x0 = Math.min(W, s.run);
      if (s?.wall === "right") x1 = Math.max(0, W - s.run);
      if (x1 > x0 && z1 > z0) add(x1 - x0, z1 - z0, Math.PI / 2, 0, (x0 + x1) / 2, wallH, (z0 + z1) / 2, this.mat.ceiling);
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
    if (look.filler) {
      // a flat strip flush with the module fronts, with a short return to the wall
      this._box(g, oakV, [0, w], [0, H], [d - T, d]);
      this._box(g, oakV, [w / 2 - T / 2, w / 2 + T / 2], [0, H], [0, d - T]);
      return g;
    }
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

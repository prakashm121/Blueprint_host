/*
 * The plan tower: a lit architectural scale model of a placement plan, one floor per week.
 *
 * Built weeks are solid (white card, reflective glass, a few windows lit), the current week glows
 * with highlighter light while a tower crane lifts the next floor, and weeks still to come are only
 * drawn: dashed blueprint outlines. The model sits on a plinth, casts real shadows, turns slowly
 * and can be spun by dragging.
 *
 * Variants: hero / compact (the tower), broken (404: a floor knocked out), exploded (the landing
 * page's parts list, one slab per part, with one highlighted).
 *
 * Plain three.js, loaded lazily by PlanModel.jsx so it never lands in the main bundle.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CatmullRomCurve3,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FLOOR_H = 0.38; // slab + glass
const SLAB_H = 0.05;

const towerWidth = (i) => (i < 4 ? 3 : i < 8 ? 2.4 : i < 11 ? 1.8 : 1.2);

// fit: [width, height] of world space that must stay in view
const VARIANTS = {
  hero: { floors: 12, width: towerWidth, storey: 0.4, crane: true, route: true, flag: true, plinth: 3.7, fit: [9.4, 7.6] },
  compact: { floors: 12, width: towerWidth, storey: 0.4, crane: true, route: true, flag: true, plinth: 3.7, fit: [8.6, 7.4] },
  broken: { floors: 12, width: towerWidth, storey: 0.4, missing: 6, flag: true, plinth: 3.7, fit: [12.4, 8.6] },
  exploded: { floors: 8, width: (i) => 2.9 - i * 0.2, storey: 0.66, allBuilt: true, plinth: 2.5, fit: [7, 7.4] },
};

// Build timeline, in seconds from start: outlines are drawn first, then floors go up.
const wireAt = (i) => 0.05 + i * 0.045;
const solidAt = (i) => 0.45 + i * 0.1;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => 1 + 2.5 * Math.pow(t - 1, 3) + 1.5 * Math.pow(t - 1, 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    paper: v('--color-paper', '#eaf1f8'),
    line: v('--color-line', '#a6bfd8'),
    highlight: v('--color-highlight', '#ffd166'),
    accent: light ? '#e8a600' : v('--color-highlight', '#ffd166'),
    redline: v('--color-redline', '#ff8a70'),
    // Dark theme: a white card model on a blue base. Light theme: the inverse, a Prussian-blue
    // model on a pale base, so it reads as strongly against the light page.
    plinth: light ? '#c9d7e6' : '#0c2e52',
    model: light ? '#27496f' : '#eef3f8',
    glass: light ? '#4f7aa6' : '#6f97bf',
    crane: light ? '#e8a600' : v('--color-highlight', '#ffd166'),
  };
}

/** Curtain-wall texture: mullions on the colour map, lit windows on the emissive map. */
function windowTextures(cols, rand, litRatio) {
  const W = 256;
  const H = 64;
  const map = document.createElement('canvas');
  map.width = W;
  map.height = H;
  const m = map.getContext('2d');
  const g = m.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#c9d6e4');
  m.fillStyle = g;
  m.fillRect(0, 0, W, H);
  m.fillStyle = 'rgba(12, 32, 58, 0.55)';
  const cw = W / cols;
  for (let c = 0; c <= cols; c++) m.fillRect(Math.round(c * cw) - 1.5, 0, 3, H);
  m.fillRect(0, Math.round(H * 0.72), W, 2);

  const em = document.createElement('canvas');
  em.width = W;
  em.height = H;
  const e = em.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  for (let c = 0; c < cols; c++) {
    if (rand() < litRatio) {
      e.fillStyle = `rgba(255, 255, 255, ${0.55 + rand() * 0.45})`;
      e.fillRect(Math.round(c * cw) + 3, 4, Math.round(cw) - 6, H - 8);
    }
  }
  const mapTex = new CanvasTexture(map);
  mapTex.colorSpace = SRGBColorSpace;
  const emTex = new CanvasTexture(em);
  emTex.colorSpace = SRGBColorSpace;
  return { mapTex, emTex };
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      [].concat(o.material).forEach((mat) => {
        mat.map?.dispose();
        mat.emissiveMap?.dispose();
        mat.dispose();
      });
    }
  });
}

/** Grid lines clipped to a disc, for the top of the plinth. */
function discGrid(radius, step) {
  const pts = [];
  for (let x = -radius + step; x < radius; x += step) {
    const h = Math.sqrt(radius * radius - x * x);
    pts.push(x, 0, -h, x, 0, h, -h, 0, x, h, 0, x);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

/**
 * @param {HTMLElement} container  element the canvas fills
 * @param {object} opts  progress (0..1), variant, labels [{ el, floor, side }], interactive, highlight
 */
export function createTowerScene(container, opts) {
  let { progress = 0.5, variant = 'hero', labels = [], interactive = true, highlight = -1 } = opts;
  const cfg = VARIANTS[variant] ?? VARIANTS.hero;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // ---------------------------------------------------------------- renderer, camera, lights
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.touchAction = 'pan-y'; // vertical swipes still scroll the page
  canvas.setAttribute('aria-hidden', 'true');
  if (interactive) canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex; // gives the glass something to reflect

  const camera = new PerspectiveCamera(30, 1, 0.1, 200);
  const totalH = (cfg.floors - 1) * cfg.storey + FLOOR_H;
  const target = new Vector3(0, totalH / 2 + (cfg.flag ? 0.25 : 0), 0);
  const viewDir = new Vector3(1, 0.62, 1).normalize();

  const hemi = new HemisphereLight('#dceaff', '#0a2a4a', 1.4);
  const key = new DirectionalLight('#fff3e0', 2.6);
  key.position.set(6, 11, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  const rim = new DirectionalLight('#9cc4ff', 0.9);
  rim.position.set(-6, 4, -7);
  scene.add(hemi, key, rim);

  // The model turns under fixed lights, so its shadow sweeps across the plinth as it rotates.
  const root = new Group();
  scene.add(root);

  // ---------------------------------------------------------------- model
  let model = null;
  let floors = [];
  let crane = null;
  let route = null;
  let traveler = null;
  let ring = null; // faces the camera, so it lives outside the rotating group
  let flag = null;
  let stray = null;
  let colors = readColors();
  let startTime = performance.now();
  let animateBuild = !reduceMotion;

  function build() {
    if (model) {
      root.remove(model);
      disposeTree(model);
    }
    if (ring) {
      scene.remove(ring);
      disposeTree(ring);
    }
    const c = (colors = readColors());
    hemi.color.set(c.light ? '#ffffff' : '#dceaff');
    hemi.groundColor.set(c.light ? '#dfe8f2' : '#0a2a4a');
    hemi.intensity = c.light ? 1.1 : 1.25;
    key.intensity = c.light ? 2.2 : 2.8;
    renderer.toneMappingExposure = c.light ? 0.95 : 1.05;

    model = new Group();
    floors = [];
    crane = route = traveler = ring = flag = stray = null;

    const N = cfg.floors;
    const complete = cfg.allBuilt || cfg.missing !== undefined;
    const built = complete ? N : Math.round(clamp01(progress) * N);
    const current = complete || built >= N ? -1 : built;
    const rand = seeded(7);

    // Plinth: the base board a scale model is mounted on.
    const R = cfg.plinth;
    const plinth = new Mesh(
      new CylinderGeometry(R, R + 0.08, 0.16, 72),
      new MeshStandardMaterial({ color: c.plinth, roughness: 0.92, metalness: 0 }),
    );
    plinth.position.y = -0.08;
    plinth.receiveShadow = true;
    model.add(plinth);
    const grid = new LineSegments(
      discGrid(R - 0.05, 0.5),
      new LineBasicMaterial({ color: c.line, transparent: true, opacity: c.light ? 0.55 : 0.22 }),
    );
    grid.position.y = 0.002;
    model.add(grid);

    const concrete = new MeshStandardMaterial({ color: c.model, roughness: 0.88, metalness: 0 });

    for (let i = 0; i < N; i++) {
      const w = cfg.width(i);
      const y0 = i * cfg.storey;
      const isBuilt = i < built;
      const isCurrent = i === current;
      const isMissing = i === cfg.missing;

      const group = new Group();
      group.position.y = y0;
      model.add(group);

      // Blueprint outline: every floor is drawn before it is built.
      const outline = new EdgesGeometry(new BoxGeometry(w, FLOOR_H, w));
      outline.translate(0, FLOOR_H / 2, 0);
      let wireMat;
      if (isBuilt && !isMissing) {
        wireMat = new LineBasicMaterial({ color: c.paper, transparent: true, opacity: c.light ? 0.25 : 0.3 });
      } else if (isCurrent) {
        wireMat = new LineBasicMaterial({ color: c.accent, transparent: true, opacity: 1 });
      } else {
        wireMat = new LineDashedMaterial({
          color: isMissing ? c.redline : c.line,
          dashSize: 0.12,
          gapSize: 0.09,
          transparent: true,
          opacity: 0.9,
        });
      }
      const wire = new LineSegments(outline, wireMat);
      if (wireMat.isLineDashedMaterial) wire.computeLineDistances();
      group.add(wire);

      if (!isBuilt && !isCurrent) {
        // A faint wash so planned floors read as volumes, not just lines.
        const ghost = new Mesh(
          new BoxGeometry(w, FLOOR_H, w),
          new MeshBasicMaterial({ color: c.paper, transparent: true, opacity: c.light ? 0.07 : 0.035, depthWrite: false }),
        );
        ghost.position.y = FLOOR_H / 2;
        group.add(ghost);
      }

      let body = null;
      let glassMat = null;
      let baseEmissive = 0;
      if (isBuilt || isCurrent) {
        body = new Group();
        const slab = new Mesh(new BoxGeometry(w, SLAB_H, w), concrete);
        slab.position.y = SLAB_H / 2;
        const roof = new Mesh(new BoxGeometry(w, 0.03, w), concrete);
        roof.position.y = FLOOR_H - 0.015;
        const cols = Math.max(3, Math.round(w / 0.27));
        // Day (light theme): lights off. Night (dark theme): some offices still lit.
        // (Exploded slabs map every window, so the whole slab can light up when highlighted.)
        const lit = isCurrent || variant === 'exploded' ? 1 : c.light ? 0 : 0.28;
        const { mapTex, emTex } = windowTextures(cols, rand, lit);
        baseEmissive = isCurrent ? (c.light ? 1.3 : 2.2) : variant === 'exploded' || c.light ? 0 : 0.85;
        glassMat = new MeshStandardMaterial({
          // The current floor's glass is tinted with the highlighter it glows with.
          color: isCurrent ? new Color(c.glass).lerp(new Color(c.highlight), 0.55) : c.glass,
          map: mapTex,
          emissive: isCurrent ? c.highlight : '#ffd29a',
          emissiveMap: emTex,
          emissiveIntensity: baseEmissive,
          metalness: 0.45,
          roughness: 0.14,
          envMapIntensity: 1.3,
        });
        const glassH = FLOOR_H - SLAB_H - 0.03;
        const glass = new Mesh(new BoxGeometry(w - 0.12, glassH, w - 0.12), glassMat);
        glass.position.y = SLAB_H + glassH / 2;
        for (const m of [slab, roof, glass]) {
          m.castShadow = true;
          m.receiveShadow = true;
          body.add(m);
        }
        body.scale.y = animateBuild ? 0.001 : 1;
        group.add(body);
      }

      if (isMissing && body) {
        // 404: the floor is out of the stack, drifting beside it. Its slot stays drawn, in red.
        group.remove(body);
        const drift = new Group();
        drift.add(body);
        drift.position.set(3.2, y0 - 0.5, -0.4);
        drift.rotation.set(0.3, 0.6, -0.35);
        model.add(drift);
        stray = { group: drift, baseY: drift.position.y };
      }

      if (animateBuild) wireMat.opacity = 0;
      floors.push({
        group,
        body,
        wireMat,
        wireOpacity: isBuilt && !isMissing ? (c.light ? 0.25 : 0.3) : isCurrent ? 1 : 0.9,
        glassMat,
        baseEmissive,
        current: isCurrent,
        anchorY: y0 + FLOOR_H / 2,
        w,
        wireAt: wireAt(i),
        solidAt: solidAt(i),
        hl: 0,
      });
    }

    const topY = (N - 1) * cfg.storey + FLOOR_H;

    // Flag on a mast: the offer. Gold once the plan is complete.
    if (cfg.flag) {
      const done = built >= N && cfg.missing === undefined;
      const mast = new Mesh(
        new CylinderGeometry(0.015, 0.015, 0.8, 8),
        new MeshStandardMaterial({ color: c.model, roughness: 0.5 }),
      );
      mast.position.y = topY + 0.4;
      mast.castShadow = true;
      const shape = new Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.42, -0.1);
      shape.lineTo(0, -0.22);
      const cloth = new Mesh(
        new ShapeGeometry(shape),
        new MeshStandardMaterial({ color: done ? c.accent : c.line, side: DoubleSide, roughness: 0.7 }),
      );
      const pivot = new Group();
      pivot.position.y = topY + 0.78;
      pivot.add(cloth);
      model.add(mast, pivot);
      flag = { mast, pivot, appearAt: solidAt(N) };
    }

    // Route: a lit path climbing a quarter turn per floor, then dashed where it is still planned.
    if (cfg.route) {
      const reach = current === -1 ? N : current + 0.5;
      const pointAt = (f) => {
        const floor = Math.min(N - 1, Math.floor(f));
        const r = (cfg.width(floor) / 2) * Math.SQRT2 + 0.3;
        const a = Math.PI / 4 + f * (Math.PI / 2);
        return new Vector3(Math.cos(a) * r, f * cfg.storey + 0.04, Math.sin(a) * r);
      };
      const pts = [];
      for (let f = 0; f <= reach + 1e-6; f += 1 / 8) pts.push(pointAt(f));
      if (pts.length > 1) {
        const curve = new CatmullRomCurve3(pts);
        const tube = new TubeGeometry(curve, Math.max(12, Math.round(reach * 14)), 0.03, 8, false);
        const tubeMesh = new Mesh(
          tube,
          new MeshStandardMaterial({ color: c.accent, emissive: c.accent, emissiveIntensity: c.light ? 0.12 : 0.55, roughness: 0.4 }),
        );
        tubeMesh.castShadow = true;
        tube.setDrawRange(0, animateBuild ? 0 : tube.index.count);
        model.add(tubeMesh);

        const dot = new Mesh(
          new SphereGeometry(0.09, 20, 16),
          new MeshStandardMaterial({ color: c.accent, emissive: c.accent, emissiveIntensity: c.light ? 0.3 : 0.9 }),
        );
        dot.position.copy(curve.getPoint(1));
        model.add(dot);
        ring = new Mesh(
          new RingGeometry(0.14, 0.18, 40),
          new MeshBasicMaterial({ color: c.accent, transparent: true, side: DoubleSide, depthWrite: false }),
        );
        scene.add(ring);

        // A spark that keeps travelling the finished part of the route.
        traveler = new Mesh(new SphereGeometry(0.05, 12, 10), new MeshBasicMaterial({ color: '#fffbe8' }));
        traveler.visible = false;
        model.add(traveler);

        route = { tube, curve, dot, total: tube.index.count, from: 0.55, to: solidAt(Math.ceil(reach)) + 0.35 };
      }
      if (reach < N) {
        const rest = [];
        for (let f = reach; f <= N; f += 1 / 10) rest.push(pointAt(f));
        const l = new Line(
          new BufferGeometry().setFromPoints(rest),
          new LineDashedMaterial({ color: c.line, dashSize: 0.1, gapSize: 0.1, transparent: true, opacity: 0.75 }),
        );
        l.computeLineDistances();
        model.add(l);
      }
    }

    // Tower crane beside the podium, lifting the next floor into place.
    if (cfg.crane && current !== -1) {
      const yellow = new MeshStandardMaterial({ color: c.crane, roughness: 0.55, metalness: 0.2 });
      const steel = new MeshStandardMaterial({ color: c.light ? '#3b5775' : '#cfdbe8', roughness: 0.5, metalness: 0.4 });
      const H = Math.max(1.3, (current + 2.4) * cfg.storey);
      const cx = cfg.width(0) / 2 + 0.55;
      const g = new Group();
      g.position.set(cx, 0, -0.35);

      const mast = new Mesh(new BoxGeometry(0.13, H, 0.13), yellow);
      mast.position.y = H / 2;
      mast.castShadow = true;
      g.add(mast);
      // Lattice bracing drawn on the mast faces.
      const lat = [];
      const a = 0.066;
      for (let y = 0; y < H - 0.12; y += 0.12) {
        lat.push(-a, y, a, a, y + 0.12, a, a, y, -a, -a, y + 0.12, -a, a, y, a, a, y + 0.12, -a, -a, y, -a, -a, y + 0.12, a);
      }
      const latGeo = new BufferGeometry();
      latGeo.setAttribute('position', new Float32BufferAttribute(lat, 3));
      g.add(new LineSegments(latGeo, new LineBasicMaterial({ color: c.light ? '#8a6500' : '#b08a2a' })));

      const slew = new Group();
      slew.position.y = H;
      const jibLen = cx + 0.9;
      const jib = new Mesh(new BoxGeometry(jibLen, 0.07, 0.09), yellow);
      jib.position.x = jibLen / 2;
      const counterJib = new Mesh(new BoxGeometry(0.85, 0.07, 0.09), yellow);
      counterJib.position.x = -0.42;
      const weight = new Mesh(new BoxGeometry(0.24, 0.2, 0.16), steel);
      weight.position.set(-0.72, -0.1, 0);
      const cab = new Mesh(new BoxGeometry(0.16, 0.13, 0.16), steel);
      cab.position.set(0.1, -0.1, 0.1);
      const apex = new Mesh(new BoxGeometry(0.05, 0.4, 0.05), yellow);
      apex.position.y = 0.2;
      for (const m of [jib, counterJib, weight, cab, apex]) {
        m.castShadow = true;
        slew.add(m);
      }
      slew.add(
        new Line(
          new BufferGeometry().setFromPoints([new Vector3(jibLen * 0.8, 0.03, 0), new Vector3(0, 0.4, 0), new Vector3(-0.8, 0.03, 0)]),
          new LineBasicMaterial({ color: c.line }),
        ),
      );

      const trolley = new Group();
      const cable = new Line(
        new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, -1, 0)]),
        new LineBasicMaterial({ color: c.light ? '#27405c' : '#dce7f2' }),
      );
      const load = new Mesh(new BoxGeometry(0.5, 0.06, 0.26), concrete);
      load.castShadow = true;
      trolley.add(cable, load);
      slew.add(trolley);
      g.add(slew);
      g.scale.setScalar(animateBuild ? 0.001 : 1);
      model.add(g);

      crane = { g, slew, trolley, cable, load, H, jibLen, liftTo: (current + 1) * cfg.storey + 0.15, appearAt: solidAt(current) + 0.1 };
    }

    root.add(model);
  }

  // ---------------------------------------------------------------- framing
  function frame() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    // Labelled models need room at the sides for their labels, more so on narrow screens.
    const labelRoom = labels.length ? (w < 420 ? 1.35 : w < 560 ? 1.18 : 1) : 1;
    const [needW, needH] = cfg.fit;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(needH / 2 / t, (needW * labelRoom) / 2 / (t * camera.aspect));
    camera.position.copy(target).addScaledVector(viewDir, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- interaction
  let yaw = -0.35;
  let spin = 0; // drag inertia, rad/s
  const AUTO = reduceMotion ? 0.1 : 0.2; // rad/s: a full turn about every 30 seconds (60 with reduced motion)
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let drag = null;

  const onHover = (e) => {
    const r = container.getBoundingClientRect();
    pointer.tx = clamp01((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = clamp01((e.clientY - r.top) / r.height) * 2 - 1;
  };
  const onDown = (e) => {
    drag = { x: e.clientX, t: performance.now(), id: e.pointerId };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now();
    const d = (e.clientX - drag.x) * 0.009;
    yaw += d;
    spin = lerp(spin, d / (Math.max(1, now - drag.t) / 1000), 0.5);
    drag.x = e.clientX;
    drag.t = now;
  };
  const onUp = () => {
    if (!drag) return;
    drag = null;
    canvas.style.cursor = 'grab';
  };
  if (interactive) {
    if (!coarse && !reduceMotion) window.addEventListener('pointermove', onHover, { passive: true });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }

  // ---------------------------------------------------------------- labels
  const v = new Vector3();
  const highlightColor = new Color();
  function placeLabels(elapsed) {
    if (!labels.length) return;
    const { clientWidth: w, clientHeight: h } = container;
    for (const { el, floor, side = 'right' } of labels) {
      const f = floors[floor];
      if (!el || !f) continue;
      const half = f.w / 2;
      let best = null;
      // Pin to whichever corner is currently furthest out on the label's side.
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        v.set(sx * half + f.group.position.x, f.anchorY, sz * half);
        v.applyMatrix4(root.matrixWorld).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        if (!best || (side === 'right' ? x > best.x : x < best.x)) best = { x, y: (-v.y * 0.5 + 0.5) * h };
      }
      el.style.transform = `translate(${best.x}px, ${best.y}px) translate(${side === 'right' ? '0' : '-100%'}, -50%)`;
      const shown = !animateBuild || elapsed > f.solidAt + 0.3;
      if (el.dataset.shown !== String(shown)) el.dataset.shown = String(shown);
    }
  }

  // ---------------------------------------------------------------- loop
  let raf = 0;
  let last = performance.now();
  let visible = true;
  let running = false;

  function render(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = (now - startTime) / 1000;
    const anim = animateBuild;

    floors.forEach((f, i) => {
      f.wireMat.opacity = f.wireOpacity * (anim ? easeOutCubic(clamp01((elapsed - f.wireAt) / 0.35)) : 1);
      if (f.body) f.body.scale.y = anim ? Math.max(0.001, easeOutBack(clamp01((elapsed - f.solidAt) / 0.55))) : 1;

      if (variant === 'exploded') {
        // Highlighted part slides out of the stack and lights up.
        f.hl = reduceMotion ? (i === highlight ? 1 : 0) : lerp(f.hl, i === highlight ? 1 : 0, 0.12);
        f.group.position.x = f.hl * 1.0;
        f.group.position.y = i * cfg.storey + f.hl * 0.08;
        if (f.glassMat) {
          f.glassMat.color.set(colors.glass).lerp(highlightColor.set(colors.highlight), f.hl * 0.75);
          f.glassMat.emissive.set(colors.highlight);
          f.glassMat.emissiveIntensity = f.hl * (colors.light ? 1.2 : 1.8);
        }
      } else if (f.current && f.glassMat && !reduceMotion) {
        // The floor being worked on: lights breathe.
        f.glassMat.emissiveIntensity = f.baseEmissive * (0.8 + 0.25 * Math.sin(elapsed * 2.4));
      }
    });

    if (route) {
      const t = anim ? clamp01((elapsed - route.from) / (route.to - route.from)) : 1;
      route.tube.setDrawRange(0, Math.floor((route.total * easeOutCubic(t)) / 3) * 3);
      const on = t >= 1;
      route.dot.visible = on;
      route.dot.getWorldPosition(ring.position);
      ring.quaternion.copy(camera.quaternion);
      ring.visible = on;
      const p = reduceMotion ? 0 : (elapsed % 1.8) / 1.8;
      ring.scale.setScalar(1 + p * 1.8);
      ring.material.opacity = 1 - p;
      traveler.visible = on && !reduceMotion;
      if (traveler.visible) route.curve.getPoint((elapsed * 0.28) % 1, traveler.position);
    }

    if (flag) {
      flag.pivot.visible = flag.mast.visible = !anim || elapsed > flag.appearAt;
      if (!reduceMotion) flag.pivot.rotation.y = Math.sin(elapsed * 1.7) * 0.25;
    }

    if (crane) {
      crane.g.scale.setScalar(anim ? Math.max(0.001, easeOutBack(clamp01((elapsed - crane.appearAt) / 0.6))) : 1);
      // Swing between the stockpile and the tower, lifting the load on the way over.
      const cycle = reduceMotion ? 0.55 : (Math.sin(elapsed * 0.45) + 1) / 2;
      crane.slew.rotation.y = lerp(0.2, Math.PI - 0.15, cycle);
      crane.trolley.position.x = lerp(crane.jibLen * 0.85, crane.jibLen * 0.55, cycle);
      const hookY = lerp(-crane.H + 0.3, -(crane.H - crane.liftTo) + 0.1, Math.min(1, cycle * 1.4));
      crane.load.position.y = hookY;
      const pos = crane.cable.geometry.attributes.position;
      pos.setY(1, hookY + 0.03);
      pos.needsUpdate = true;
    }

    if (stray && !reduceMotion) {
      stray.group.position.y = stray.baseY + Math.sin(elapsed * 1.1) * 0.12;
      stray.group.rotation.y = 0.6 + elapsed * 0.3;
    }

    // Always turning; a drag adds spin that dies away within about a second.
    if (!drag) {
      spin *= Math.pow(0.04, dt);
      yaw += (AUTO + spin) * dt;
    }
    pointer.x = lerp(pointer.x, pointer.tx, 0.05);
    pointer.y = lerp(pointer.y, pointer.ty, 0.05);
    root.rotation.y = yaw + pointer.x * 0.2;
    root.rotation.x = pointer.y * 0.04;

    root.updateMatrixWorld();
    renderer.render(scene, camera);
    placeLabels(elapsed);
  }

  function loop(now) {
    render(now);
    raf = running ? requestAnimationFrame(loop) : 0;
  }
  function start() {
    if (running || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }
  const drawOnce = () => requestAnimationFrame(render);
  const kick = start;

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) kick();
    else stop();
  });
  io.observe(container);
  const onVisibility = () => (document.hidden ? stop() : kick());
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => {
    frame();
    if (!running) drawOnce();
  });
  ro.observe(container);
  // Re-colour on theme change. The build timeline runs off startTime, so a rebuild mid-animation carries on.
  const mo = new MutationObserver(() => {
    build();
    if (!running) drawOnce();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  frame();
  build();
  kick();

  return {
    update(next) {
      if (next.labels) labels = next.labels;
      if (next.highlight !== undefined) {
        highlight = next.highlight;
        if (!running) drawOnce();
      }
      if (next.progress !== undefined && next.progress !== progress) {
        progress = next.progress;
        startTime = performance.now();
        animateBuild = !reduceMotion;
        build();
        kick();
      }
    },
    dispose() {
      stop();
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onHover);
      if (model) disposeTree(model);
      if (ring) disposeTree(ring);
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

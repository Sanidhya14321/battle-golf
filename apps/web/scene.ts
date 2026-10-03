import { GolfAudio } from "./audio";
import * as THREE from "three";
import {
  COURSES,
  THEMES,
  layout,
  type Course,
  type Vec,
} from "../../packages/game/content";
import {
  shotSpeed,
  type Input,
  type PlayerView,
  type Snapshot,
} from "../../packages/game/simulation";
import { Golfer, loadGolfers } from "./character";
import { MovementPrediction } from "./prediction";
const material = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
const mesh = (g: THREE.BufferGeometry, c: string) => {
  const m = new THREE.Mesh(g, material(c));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const vec = (p: Vec) => new THREE.Vector3(p.x, p.y, p.z);
export class GolfRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.08, 400);
  courseGroup = new THREE.Group();
  entities = new Map<string, THREE.Group>();
  balls = new Map<string, THREE.Mesh>();
  characters = new Map<string, Golfer>();
  snapshot: Snapshot | null = null;
  selfId = "";
  spectating = "";
  yaw = 0;
  pitch = 0.28;
  power = 0;
  angle = 8;
  aiming = false;
  hero = false;
  muted = false;
  shake = true;
  input: Input = { x: 0, z: 0, yaw: 0, charging: false };
  ready = loadGolfers();
  courseId = "";
  crates: THREE.Group[] = [];
  checkpoints: THREE.Mesh[] = [];
  captureHint = "";
  private disposed = false;
  private frame = 0;
  private last = performance.now();
  private elapsed = 0;
  private obstacle = new THREE.Group();
  private dynamic = new Map<string, THREE.Mesh>();
  private fx: { mesh: THREE.Mesh; end: number }[] = [];
  private seen = new Set<number>();
  private aimPositions = new Float32Array(128 * 3);
  private aimLine: THREE.Line;
  private ring: THREE.Mesh;
  private observer: ResizeObserver;
  private ctx?: AudioContext;
  private samples = new Map<string, AudioBuffer>();
  private ray = new THREE.Raycaster();
  private labels = new Map<string, THREE.Sprite>();
  private ballLabels = new Map<string, THREE.Sprite>();
  private trails = new Map<
    string,
    {
      line: THREE.Line;
      points: Float32Array;
      count: number;
      last: THREE.Vector3;
      at: number;
    }
  >();
  private asset: Awaited<ReturnType<typeof loadGolfers>> | null = null;
  audio = new GolfAudio();
  private prediction = new MovementPrediction();
  private predicting = false;
  constructor(
    public host: HTMLElement,
    hero = false,
  ) {
    this.hero = hero;
    this.scene.background = new THREE.Color("#b6d3cd");
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.scene.add(
      this.courseGroup,
      new THREE.HemisphereLight("#fff6dc", "#44693e", 2.4),
    );
    const sun = new THREE.DirectionalLight("#fff4d5", 2.8);
    sun.position.set(-20, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -65,
      right: 65,
      top: 55,
      bottom: -150,
      far: 200,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.aimPositions, 3),
    );
    geo.setDrawRange(0, 0);
    this.aimLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: "#fff49a" }),
    );
    this.aimLine.frustumCulled = false;
    this.scene.add(this.aimLine);
    this.ring = mesh(new THREE.RingGeometry(0.48, 0.62, 32), "#fff1a2");
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.ready.then((asset) => {
      if (!this.disposed) {
        this.asset = asset;
        if (this.snapshot) this.update(this.snapshot, this.selfId);
      }
    });
    this.loop();
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  quality(low: boolean) {
    this.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !low;
    this.resize();
  }
  private add(
    g: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    block = false,
  ) {
    const m = mesh(g, color);
    m.position.set(x, y, z);
    m.userData.cameraBlock = block;
    this.courseGroup.add(m);
    return m;
  }
  createCourse(c: Course) {
    this.clear(this.courseGroup);
    this.courseGroup.clear();
    this.courseId = c.id;
    const l = layout(c),
      t = THEMES[c.theme];
    this.scene.background = new THREE.Color(t.sky);
    this.scene.fog = new THREE.Fog(t.sky, 110, 230);
    this.crates = [];
    this.checkpoints = [];
    for (const p of l.platforms) {
      this.add(
        new THREE.BoxGeometry(p.w, 2, p.d),
        t.edge,
        p.x,
        (p.y || 0) - 1,
        p.z,
        true,
      );
      this.add(
        new THREE.PlaneGeometry(p.w - 0.08, p.d - 0.08),
        t.ground,
        p.x,
        (p.y || 0) + 0.01,
        p.z,
      ).rotation.x = -Math.PI / 2;
    }
    // Fairway stripes and green are flat surfaces; hazard volumes match simulation exactly.
    for (let z = 0; z > -c.length + 10; z -= 8) {
      const p = l.platforms.find((p) => Math.abs(z - p.z) < p.d / 2);
      if (p)
        this.add(
          new THREE.PlaneGeometry(p.w - 1, 4),
          "#ffffff",
          p.x,
          (p.y || 0) + 0.025,
          z,
        ).material = new THREE.MeshStandardMaterial({
          color: "#ffffff",
          transparent: true,
          opacity: 0.035,
          depthWrite: false,
        });
      const o = this.courseGroup.children.at(-1);
      if (o) o.rotation.x = -Math.PI / 2;
    }
    for (const s of l.sand)
      this.add(
        new THREE.PlaneGeometry(s.w, s.d),
        t.sand,
        s.x,
        (c.id === "factory" ? 1.2 : 0) + 0.045,
        s.z,
      ).rotation.x = -Math.PI / 2;
    for (const w of l.water)
      this.add(
        new THREE.CircleGeometry(w.r, 48),
        t.water,
        w.x,
        0.08,
        w.z,
      ).rotation.x = -Math.PI / 2;
    if (c.id === "bridge") {
      const sea = this.add(
        new THREE.PlaneGeometry(100, 170),
        t.water,
        0,
        -0.45,
        -55,
      );
      sea.rotation.x = -Math.PI / 2;
      for (let z = -20; z > -73; z -= 3) {
        for (const x of [7.2, 14.8])
          this.add(
            new THREE.BoxGeometry(0.16, 0.75, 0.16),
            "#f6d8a6",
            x,
            0.35,
            z,
          );
      }
    }
    if (c.id === "clover")
      for (const x of [-17, 17])
        this.add(
          new THREE.BoxGeometry(0.6, 0.6, 84),
          "#f1e5c4",
          x,
          0.3,
          -30,
          true,
        );
    const green = this.add(
      new THREE.CircleGeometry(5, 48),
      "#96cb75",
      l.hole.x,
      l.hole.y - 0.07,
      l.hole.z,
    );
    green.rotation.x = -Math.PI / 2;
    this.add(
      new THREE.CylinderGeometry(0.6, 0.6, 0.04, 40),
      "#273e35",
      l.hole.x,
      l.hole.y - 0.045,
      l.hole.z,
    );
    this.add(
      new THREE.CylinderGeometry(0.04, 0.04, 3, 8),
      "#fff6dd",
      l.hole.x,
      l.hole.y + 1.38,
      l.hole.z,
    );
    const flag = this.add(
      new THREE.PlaneGeometry(1.15, 0.65),
      "#ff7860",
      l.hole.x + 0.56,
      l.hole.y + 2.53,
      l.hole.z,
    );
    (flag.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    this.obstacle = new THREE.Group();
    const ob = mesh(new THREE.BoxGeometry(10, 0.7, 1.3), "#fff0b5");
    this.obstacle.add(ob);
    ob.userData.cameraBlock = true;
    this.obstacle.position.set(l.obstacle.x, 1.2, l.obstacle.z);
    this.courseGroup.add(this.obstacle);
    if (c.id === "factory") {
      this.add(
        new THREE.CylinderGeometry(1.9, 2.5, 8, 8),
        "#f7ddac",
        0,
        4,
        -51,
      );
      this.add(new THREE.ConeGeometry(3, 2.5, 8), "#d97862", 0, 9, -51);
      for (const x of [-5.5, 5.5])
        this.add(new THREE.BoxGeometry(0.5, 3, 0.5), "#42635b", x, 1.5, -48);
    }
    const ramp = this.add(
      new THREE.BoxGeometry(l.ramp.w, 0.3, l.ramp.d),
      "#ffd86a",
      l.ramp.x,
      l.ramp.y,
      l.ramp.z,
      true,
    );
    ramp.rotation.x = l.ramp.angle;
    for (let i = 0; i < l.crates.length; i++) {
      const g = new THREE.Group();
      const box = mesh(new THREE.BoxGeometry(0.85, 0.75, 0.85), "#ffce58");
      g.add(box);
      const label = this.label("?", 64, "#283b32");
      label.position.y = 0.1;
      label.scale.set(4.2, 1.05, 1);
      g.add(label);
      g.position.copy(vec(l.crates[i]));
      this.courseGroup.add(g);
      this.crates.push(g);
    }
    for (const cp of l.checkpoints) {
      const ring = mesh(new THREE.TorusGeometry(1.8, 0.1, 8, 40), "#ff806c");
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cp.x, cp.y - 1 + 0.14, cp.z);
      this.courseGroup.add(ring);
      this.checkpoints.push(ring);
    }
    // Scenery outside the playable surface never creates invisible obstructions.
    for (let i = 0; i < 28; i++) {
      const x = (i % 2 ? -1 : 1) * (22 + (i % 4) * 3),
        z = 8 - i * 4.6;
      this.add(
        new THREE.CylinderGeometry(0.18, 0.27, 2.6, 7),
        "#936a43",
        x,
        1.3,
        z,
      );
      this.add(
        new THREE.IcosahedronGeometry(1.9, 1),
        i % 3 ? "#458959" : "#72aa62",
        x,
        3.2,
        z,
      );
    }
  }
  private label(text: string, size = 40, color = "#fff4db") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.font = `800 ${size}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#213d35";
    ctx.strokeText(text, 256, 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false }),
    );
    sprite.scale.set(2.8, 0.7, 1);
    return sprite;
  }
  update(s: Snapshot, self: string) {
    this.snapshot = s;
    this.selfId = self;
    if (s.courseId !== this.courseId)
      this.createCourse(COURSES.find((c) => c.id === s.courseId)!);
    if (this.predicting) this.prediction.reconcile(s, self);
    const live = new Set(s.players.map((p) => p.id));
    for (const [id, g] of this.entities)
      if (!live.has(id)) {
        this.scene.remove(g, this.balls.get(id)!, this.labels.get(id)!);
        this.characters.get(id)?.dispose();
        this.characters.delete(id);
        this.entities.delete(id);
        const b = this.balls.get(id)!;
        b.geometry.dispose();
        (b.material as THREE.Material).dispose();
        this.balls.delete(id);
        const label = this.labels.get(id);
        if (label) {
          label.material.map?.dispose();
          label.material.dispose();
          this.labels.delete(id);
        }
        const ballLabel = this.ballLabels.get(id);
        if (ballLabel) {
          this.scene.remove(ballLabel);
          ballLabel.material.map?.dispose();
          ballLabel.material.dispose();
          this.ballLabels.delete(id);
        }
        const trail = this.trails.get(id);
        if (trail) {
          this.scene.remove(trail.line);
          this.clear(trail.line);
          this.trails.delete(id);
        }
      }
    for (const p of s.players)
      if (!this.entities.has(p.id) && this.asset) {
        const golfer = new Golfer(this.asset, p);
        this.characters.set(p.id, golfer);
        this.entities.set(p.id, golfer.root);
        golfer.root.position.set(p.pos.x, p.pos.y - 0.82, p.pos.z);
        this.scene.add(golfer.root);
        const ball = mesh(new THREE.SphereGeometry(0.18, 16, 12), p.color);
        ball.position.copy(vec(p.ball));
        this.balls.set(p.id, ball);
        this.scene.add(ball);
        const name = this.label(p.name + (p.bot ? " · BOT" : ""));
        this.labels.set(p.id, name);
        this.scene.add(name);
        const ballLabel = this.label(
          p.id === self ? "◉ YOUR BALL" : "◆ " + p.name,
          32,
          p.color,
        );
        ballLabel.scale.set(2.5, 0.625, 1);
        this.ballLabels.set(p.id, ballLabel);
        this.scene.add(ballLabel);
        const points = new Float32Array(32 * 3),
          geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
        geometry.setDrawRange(0, 0);
        const trail = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: p.color,
            transparent: true,
            opacity: 0.5,
          }),
        );
        trail.frustumCulled = false;
        this.scene.add(trail);
        this.trails.set(p.id, {
          line: trail,
          points,
          count: 0,
          last: vec(p.ball),
          at: this.elapsed,
        });
      }
    for (const e of s.effects)
      if (!this.seen.has(e.id)) {
        this.seen.add(e.id);
        if (this.seen.size > 512)
          this.seen.delete(this.seen.values().next().value!);
        if (["chat", "announce", "join", "item"].includes(e.kind)) continue;
        const m = mesh(new THREE.IcosahedronGeometry(0.25, 0), e.color);
        m.position.copy(vec(e.pos));
        (m.material as THREE.MeshStandardMaterial).transparent = true;
        this.scene.add(m);
        this.fx.push({ mesh: m, end: this.elapsed + 0.5 });
        this.sound(e.kind);
      }
  }
  activateAudio() {
    this.audio.muted = this.muted;
    void this.audio.activate();
  }
  predictInput(input: Input) {
    this.predicting = true;
    if (this.snapshot && !this.prediction.position)
      this.prediction.reconcile(this.snapshot, this.selfId);
    this.prediction.push(input);
  }
  private sound(kind: string) {
    this.audio.muted = this.muted;
    this.audio.play(kind);
  }
  groundTarget() {
    const p = this.snapshot?.players.find((p) => p.id === this.selfId);
    return p
      ? {
          x: p.pos.x + Math.sin(this.yaw) * 5,
          y: 0,
          z: p.pos.z - Math.cos(this.yaw) * 5,
        }
      : { x: 0, y: 0, z: 0 };
  }
  private updateDynamic(s: Snapshot) {
    const live = new Set<string>();
    for (const data of [
      ...s.mines.map((m) => ({ ...m, key: "mine-" + m.id, kind: "mine" })),
      ...s.projectiles.map((m) => ({
        ...m,
        key: "rocket-" + m.id,
        kind: "rocket",
      })),
    ]) {
      live.add(data.key);
      let m = this.dynamic.get(data.key);
      if (!m) {
        m = mesh(
          data.kind === "mine"
            ? new THREE.CylinderGeometry(0.45, 0.55, 0.15, 10)
            : new THREE.ConeGeometry(0.17, 0.65, 8),
          data.kind === "mine" ? "#e56757" : "#ffe183",
        );
        this.dynamic.set(data.key, m);
        this.scene.add(m);
      }
      m.position.copy(vec(data.pos));
      if (data.kind === "mine")
        (m.material as THREE.MeshStandardMaterial).emissive.set(
          s.time % 1 < 0.5 ? "#903020" : "#000000",
        );
    }
    for (const [id, m] of this.dynamic)
      if (!live.has(id)) {
        this.scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.dynamic.delete(id);
      }
  }
  loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now(),
      dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;
    const s = this.snapshot;
    if (s) {
      const follow =
        s.players.find((p) => p.id === (this.spectating || this.selfId)) ||
        s.players[0];
      for (const p of s.players) {
        const g = this.entities.get(p.id),
          b = this.balls.get(p.id);
        if (!g || !b) continue;
        const predicted =
          p.id === this.selfId && !this.spectating
            ? this.prediction.position
            : undefined;
        const pos = predicted || p.pos;
        const at = new THREE.Vector3(pos.x, pos.y - 0.82, pos.z);
        g.position.lerp(at, 1 - Math.exp(-18 * dt));
        const movementYaw =
          Math.hypot(p.velocity.x, p.velocity.z) > 0.3
            ? Math.atan2(p.velocity.x, -p.velocity.z)
            : p.yaw;
        const yaw = p.animation === "run" ? movementYaw : p.yaw;
        g.rotation.y +=
          Math.atan2(
            Math.sin(yaw - g.rotation.y),
            Math.cos(yaw - g.rotation.y),
          ) * Math.min(1, dt * 15);
        this.characters
          .get(p.id)
          ?.update(
            p,
            s.time,
            dt,
            p.id === this.selfId && this.aiming,
            this.power,
          );
        g.visible = !p.eliminated;
        b.position.lerp(vec(p.ball), 1 - Math.exp(-22 * dt));
        b.visible = !p.finished;
        const ballLabel = this.ballLabels.get(p.id);
        if (ballLabel) {
          ballLabel.position
            .copy(b.position)
            .add(new THREE.Vector3(0, 0.55, 0));
          ballLabel.visible = !p.finished && !this.hero;
        }
        const trail = this.trails.get(p.id)!;
        if (b.position.distanceTo(trail.last) > 0.04) {
          trail.points.copyWithin(3, 0, 93);
          trail.points[0] = b.position.x;
          trail.points[1] = b.position.y;
          trail.points[2] = b.position.z;
          trail.count = Math.min(32, trail.count + 1);
          trail.last.copy(b.position);
          trail.at = this.elapsed;
          (
            trail.line.geometry.attributes.position as THREE.BufferAttribute
          ).needsUpdate = true;
          trail.line.geometry.setDrawRange(0, trail.count);
        }
        trail.line.visible =
          !p.finished && !this.hero && this.elapsed - trail.at < 0.7;
        const name = this.labels.get(p.id)!;
        name.position.copy(g.position).add(new THREE.Vector3(0, 2.3, 0));
        name.visible = p.id !== this.selfId;
        const mats = this.characters.get(p.id)!.root;
        mats.traverse((o) => {
          if (o instanceof THREE.SkinnedMesh)
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material]) {
              const mat = m as THREE.MeshStandardMaterial;
              mat.emissive.set(
                p.shield > s.time
                  ? "#244b79"
                  : p.animation === "freeze"
                    ? "#346c89"
                    : p.immune > s.time
                      ? "#283a25"
                      : "#000000",
              );
            }
        });
      }
      if (follow && !this.hero)
        this.audio.footsteps(
          dt,
          Math.hypot(follow.velocity.x, follow.velocity.z),
          follow.grounded,
        );
      if (follow && this.entities.has(follow.id)) {
        const g = this.entities.get(follow.id)!;
        const target = g.position
          .clone()
          .add(new THREE.Vector3(0, this.aiming ? 0.9 : 1.25, 0));
        const yaw = this.spectating ? follow.yaw : this.yaw;
        const distance = this.aiming ? 4.2 : 5;
        const pitch = this.aiming ? Math.max(0.45, this.pitch) : this.pitch;
        const horizontal = Math.cos(pitch) * distance;
        const offset = new THREE.Vector3(
          -Math.sin(yaw) * horizontal,
          Math.sin(pitch) * distance,
          Math.cos(yaw) * horizontal,
        );
        if (this.aiming) {
          offset.x += Math.cos(yaw) * 1;
          offset.z += Math.sin(yaw) * 1;
          target.x += Math.sin(yaw) * 0.8 + Math.cos(yaw) * 0.2;
          target.z -= Math.cos(yaw) * 0.8 - Math.sin(yaw) * 0.2;
        }
        this.ray.set(target, offset.clone().normalize());
        this.ray.far = distance;
        const blocks: THREE.Object3D[] = [];
        this.courseGroup.traverse((o) => {
          if (o.userData.cameraBlock) blocks.push(o);
        });
        const hit = this.ray.intersectObjects(blocks, true)[0];
        if (hit) offset.setLength(Math.max(0.5, hit.distance - 0.25));
        const desired = target.clone().add(offset);
        if (this.hero) {
          desired.set(1.75, 1.55, -2.6);
          target.set(0, 1.05, 0);
        }
        this.camera.position.lerp(desired, 1 - Math.exp(-12 * dt));
        this.camera.lookAt(target);
        this.ring.position.set(
          follow.ball.x,
          follow.ball.y - 0.16,
          follow.ball.z,
        );
        this.ring.visible = !this.hero && !follow.finished;
        let count = 0;
        if (this.aiming) {
          const v = shotSpeed(this.power, this.angle),
            rad = (this.angle * Math.PI) / 180;
          for (let t = 0; t < 3 && count < 128; t += 0.04) {
            const putt = this.angle === 8;
            const y = putt
              ? follow.ball.y
              : follow.ball.y + v * Math.sin(rad) * t - 4.905 * t * t;
            if (!putt && y < Math.max(0.12, follow.ball.y - 0.06)) break;
            const travel = putt
              ? (v * (1 - Math.exp(-1.09 * t))) / 1.09
              : v * Math.cos(rad) * t;
            this.aimPositions[count * 3] =
              follow.ball.x + Math.sin(yaw) * travel;
            this.aimPositions[count * 3 + 1] = y;
            this.aimPositions[count * 3 + 2] =
              follow.ball.z - Math.cos(yaw) * travel;
            count++;
          }
        }
        (
          this.aimLine.geometry.attributes.position as THREE.BufferAttribute
        ).needsUpdate = true;
        this.aimLine.geometry.setDrawRange(0, count);
        this.aimLine.visible = this.aiming;
      }
      this.crates.forEach((g, i) => {
        g.visible = s.crates[i]?.ready;
        g.position.y = 1 + Math.sin(this.elapsed * 2 + i) * 0.12;
        g.rotation.y = this.elapsed * 0.5;
      });
      this.checkpoints.forEach((g, i) =>
        (g.material as THREE.MeshStandardMaterial).color.set(
          i <= (follow?.checkpoint ?? -1) ? "#9ee577" : "#ff806c",
        ),
      );
      this.obstacle.rotation.y = s.time * 0.7;
      this.updateDynamic(s);
    }
    this.fx = this.fx.filter((f) => {
      const life = f.end - this.elapsed;
      if (life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        return false;
      }
      f.mesh.scale.setScalar(1 + (1 - life / 0.5) * 7);
      (f.mesh.material as THREE.MeshStandardMaterial).opacity = life / 0.5;
      return true;
    });
    this.renderer.render(this.scene, this.camera);
  };
  private clear(g: THREE.Object3D) {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.dispose();
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.prediction.dispose();
    for (const c of this.characters.values()) c.dispose();
    this.clear(this.courseGroup);
    for (const b of this.balls.values()) this.clear(b);
    for (const m of this.dynamic.values()) this.clear(m);
    for (const f of this.fx) this.clear(f.mesh);
    this.clear(this.aimLine);
    this.clear(this.ring);
    for (const s of this.labels.values()) {
      s.material.map?.dispose();
      s.material.dispose();
    }
    for (const label of this.ballLabels.values()) {
      label.material.map?.dispose();
      label.material.dispose();
    }
    for (const trail of this.trails.values()) this.clear(trail.line);
    this.audio.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

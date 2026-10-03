import * as THREE from "three";
import {
  COURSES,
  THEMES,
  COLORS,
  layout,
  type Course,
  type Vec,
} from "../../packages/game/content";
import type {
  Snapshot,
  PlayerView,
  Input,
} from "../../packages/game/simulation";
const mat = (color: string, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness });
const mesh = (g: THREE.BufferGeometry, color: string) => {
  const m = new THREE.Mesh(g, mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const v3 = (p: Vec) => new THREE.Vector3(p.x, p.y, p.z);
export class GolfRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 650);
  courseGroup = new THREE.Group();
  entities = new Map<string, THREE.Group>();
  balls = new Map<string, THREE.Mesh>();
  crates: THREE.Group[] = [];
  checkpoints: THREE.Group[] = [];
  effects = new THREE.Group();
  cartGroup = new THREE.Group();
  dynamicGroup = new THREE.Group();
  obstacle = new THREE.Group();
  snapshot: Snapshot | null = null;
  courseId = "";
  yaw = 0;
  hero = false;
  selfId = "";
  spectating = "";
  input: Input = { x: 0, z: 0, yaw: 0, charging: false };
  power = 0;
  angle = 25;
  aiming = false;
  aimLine: THREE.Line;
  ballRing: THREE.Mesh;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private last = performance.now();
  private animation = 0;
  private predict = new THREE.Vector3();
  private predictedId = "";
  private seenEffects = new Set<number>();
  private fx: { mesh: THREE.Mesh; end: number; start: number; kind: string }[] =
    [];
  private clock = 0;
  private soundCtx: AudioContext | null = null;
  muted = false;
  shake = true;
  constructor(
    public host: HTMLElement,
    hero = false,
  ) {
    this.hero = hero;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#b6d3cd");
    host.appendChild(this.renderer.domElement);
    this.scene.add(
      this.courseGroup,
      this.effects,
      this.cartGroup,
      this.dynamicGroup,
    );
    this.scene.add(new THREE.HemisphereLight("#fff8df", "#315849", 2.5));
    const sun = new THREE.DirectionalLight("#fff3d7", 3);
    sun.position.set(-25, 55, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -180;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: "#fff9de",
        dashSize: 0.65,
        gapSize: 0.5,
      }),
    );
    this.scene.add(this.aimLine);
    this.ballRing = mesh(new THREE.RingGeometry(0.65, 0.78, 40), "#e9f769");
    this.ballRing.rotation.x = -Math.PI / 2;
    this.ballRing.position.y = 0.05;
    this.scene.add(this.ballRing);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
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
  createCourse(course: Course) {
    this.disposeGroup(this.courseGroup);
    this.courseGroup.clear();
    this.courseId = course.id;
    this.crates = [];
    this.checkpoints = [];
    const t = THEMES[course.theme],
      l = layout(course);
    this.scene.background = new THREE.Color(t.sky);
    this.scene.fog = new THREE.Fog(t.sky, 90, 260);
    const ocean = mesh(new THREE.PlaneGeometry(600, 600), t.water);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -5, -60);
    ocean.castShadow = false;
    this.courseGroup.add(ocean);
    for (const p of l.platforms) {
      const base = mesh(new THREE.BoxGeometry(p.w, 5, p.d), t.edge);
      base.position.set(p.x, -2.5, p.z);
      this.courseGroup.add(base);
      const turf = mesh(new THREE.BoxGeometry(p.w, 0.22, p.d), t.ground);
      turf.position.set(p.x, 0.01, p.z);
      this.courseGroup.add(turf);
      for (const side of [-1, 1]) {
        const rail = mesh(new THREE.BoxGeometry(0.45, 0.85, p.d), t.edge);
        rail.position.set(p.x + (side * p.w) / 2, 0.42, p.z);
        this.courseGroup.add(rail);
      }
    }
    for (const s of l.sand) {
      const sand = mesh(new THREE.CircleGeometry(1, 18), t.sand);
      sand.rotation.x = -Math.PI / 2;
      sand.scale.set(s.w / 2, s.d / 2, 1);
      sand.position.set(s.x, 0.14, s.z);
      this.courseGroup.add(sand);
    }
    for (const w of l.water) {
      const pond = mesh(new THREE.CircleGeometry(w.r, 28), t.water);
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(w.x, 0.15, w.z);
      this.courseGroup.add(pond);
    }
    const cup = mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 0.12, 32),
      "#203d30",
    );
    cup.position.set(l.hole.x, 0.14, l.hole.z);
    this.courseGroup.add(cup);
    const pole = mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 4.6, 8),
      "#fff4de",
    );
    pole.position.set(l.hole.x, 2.4, l.hole.z);
    this.courseGroup.add(pole);
    const flag = mesh(new THREE.BoxGeometry(1.9, 1.1, 0.04), "#ff855e");
    flag.position.set(l.hole.x + 0.9, 4.1, l.hole.z);
    this.courseGroup.add(flag);
    for (let i = 0; i < l.platforms.length; i++) {
      const p = l.platforms[i];
      for (let side of [-1, 1]) {
        const tree = this.tree(course.theme);
        tree.position.set(p.x + side * (10 + (i % 3) * 0.3), 0, p.z - 3);
        tree.scale.setScalar(0.9 + (i % 3) * 0.2);
        this.courseGroup.add(tree);
      }
      for (let n = 0; n < 5; n++) {
        const rock = mesh(
          new THREE.DodecahedronGeometry(0.6 + (n % 2) * 0.3, 0),
          course.theme === "ice" ? "#f4faf5" : t.edge,
        );
        rock.position.set(p.x - 12 + n * 0.4, 0.2, p.z + 4 + n * 0.5);
        this.courseGroup.add(rock);
      }
    }
    for (const c of l.checkpoints) {
      const g = new THREE.Group();
      const ring = mesh(new THREE.TorusGeometry(1, 0.13, 8, 20), "#ed9673");
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      const stem = mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6),
        "#fff4de",
      );
      stem.position.y = -1;
      g.add(stem);
      g.position.set(c.x, 2, c.z);
      this.courseGroup.add(g);
      this.checkpoints.push(g);
    }
    for (const c of l.crates) {
      const g = new THREE.Group();
      const box = mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), "#e9f769");
      box.rotation.z = 0.16;
      g.add(box);
      const cross = mesh(new THREE.BoxGeometry(0.25, 0.9, 1.12), "#49613b");
      g.add(cross);
      const cross2 = mesh(new THREE.BoxGeometry(0.7, 0.22, 1.14), "#49613b");
      cross2.position.y = 0.18;
      g.add(cross2);
      g.position.set(c.x, 1, c.z);
      this.courseGroup.add(g);
      this.crates.push(g);
    }
    for (const b of l.boosts) {
      const pad = mesh(new THREE.BoxGeometry(2, 0.15, 3), t.accent);
      pad.position.set(b.x, 0.15, b.z);
      this.courseGroup.add(pad);
      for (let n = 0; n < 3; n++) {
        const arrow = mesh(new THREE.ConeGeometry(0.35, 0.1, 3), "#35554b");
        arrow.rotation.x = Math.PI / 2;
        arrow.position.set(b.x, 0.25, b.z + n * 0.6 - 0.6);
        this.courseGroup.add(arrow);
      }
    }
    const ramp = mesh(new THREE.BoxGeometry(4, 0.5, 6), t.accent);
    ramp.position.set(l.ramp.x, 0.4, l.ramp.z);
    ramp.rotation.x = 0.24;
    this.courseGroup.add(ramp);
    this.obstacle = new THREE.Group();
    const bar = mesh(
      new THREE.BoxGeometry(course.obstacle === "elevator" ? 4 : 10, 0.7, 1.3),
      course.theme === "industrial" ? "#ffc969" : "#eee8cf",
    );
    this.obstacle.add(bar);
    const hub = mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 12), t.edge);
    hub.position.y = -0.7;
    this.obstacle.add(hub);
    this.courseGroup.add(this.obstacle);
    // Decorative clouds and distant islands keep the silhouette readable.
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = mesh(
          new THREE.IcosahedronGeometry(2.5 + j * 0.6, 1),
          "#e8eee0",
        );
        puff.castShadow = false;
        puff.position.x = j * 2.2;
        cloud.add(puff);
      }
      cloud.position.set(
        (i % 2 ? 1 : -1) * (35 + i * 3),
        18 + (i % 3) * 5,
        -i * 20,
      );
      this.courseGroup.add(cloud);
    }
  }
  tree(theme: string) {
    const g = new THREE.Group();
    const trunk = mesh(
      new THREE.CylinderGeometry(0.35, 0.6, 3.6, 7),
      theme === "ice" ? "#91abb1" : "#826245",
    );
    trunk.position.y = 1.8;
    g.add(trunk);
    if (theme === "desert") {
      const top = mesh(new THREE.CylinderGeometry(0.55, 0.55, 4, 6), "#668c67");
      top.position.y = 3;
      g.add(top);
      for (const side of [-1, 1]) {
        const arm = mesh(new THREE.BoxGeometry(1.4, 0.5, 0.5), "#668c67");
        arm.position.set(side * 0.7, 2.5 + side * 0.4, 0);
        g.add(arm);
      }
    } else if (theme === "fantasy") {
      const top = mesh(
        new THREE.SphereGeometry(2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        "#e6b4e4",
      );
      top.position.y = 3.5;
      g.add(top);
    } else {
      for (let i = 0; i < 3; i++) {
        const canopy = mesh(
          theme === "ice"
            ? new THREE.ConeGeometry(2 - i * 0.3, 2.7, 7)
            : new THREE.IcosahedronGeometry(2 - i * 0.25, 0),
          theme === "ice"
            ? "#e9f5f1"
            : theme === "tropical"
              ? "#438d6c"
              : i % 2
                ? "#779d64"
                : "#5d8855",
        );
        canopy.position.set(i === 1 ? 0.6 : 0, 3 + i * 0.7, 0);
        g.add(canopy);
      }
    }
    return g;
  }
  avatar(p: PlayerView) {
    const g = new THREE.Group();
    const color = p.outfit ? COLORS[p.outfit % 8] : p.color;
    const body = mesh(new THREE.CapsuleGeometry(0.32, 0.45, 4, 8), color);
    body.position.y = 0.12;
    g.add(body);
    const head = mesh(new THREE.SphereGeometry(0.3, 10, 8), "#f3c39e");
    head.position.y = 0.78;
    g.add(head);
    const nose = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.13), "#e7ae87");
    nose.position.set(0, 0.75, -0.29);
    g.add(nose);
    for (const x of [-0.11, 0.11]) {
      const eye = mesh(new THREE.SphereGeometry(0.03, 6, 4), "#293b30");
      eye.position.set(x, 0.83, -0.28);
      g.add(eye);
    }
    const brim = mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.06, 10), color);
    brim.position.y = 1.05;
    g.add(brim);
    const cap = mesh(
      p.hat % 3 === 1
        ? new THREE.ConeGeometry(0.3, 0.55, 8)
        : p.hat % 3 === 2
          ? new THREE.BoxGeometry(0.45, 0.4, 0.45)
          : new THREE.SphereGeometry(
              0.3,
              10,
              6,
              0,
              Math.PI * 2,
              0,
              Math.PI / 2,
            ),
      p.hat ? COLORS[p.hat % 8] : color,
    );
    cap.position.y = 1.09;
    g.add(cap);
    for (const side of [-1, 1]) {
      const leg = mesh(new THREE.CapsuleGeometry(0.1, 0.3, 3, 6), "#344e43");
      leg.position.set(side * 0.16, -0.45, 0);
      leg.name = "leg" + side;
      g.add(leg);
      const arm = mesh(new THREE.CapsuleGeometry(0.1, 0.3, 3, 6), color);
      arm.position.set(side * 0.45, 0.1, 0);
      arm.rotation.z = side * 0.3;
      g.add(arm);
    }
    const club = mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6),
      p.club ? COLORS[p.club % 8] : "#dddcc6",
    );
    club.position.set(0.53, -0.3, -0.3);
    club.rotation.x = 0.4;
    g.add(club);
    const clubHead = mesh(new THREE.BoxGeometry(0.35, 0.12, 0.18), "#cbd5cd");
    clubHead.position.set(0.53, -0.85, -0.5);
    g.add(clubHead);
    const shield = mesh(new THREE.SphereGeometry(1.1, 16, 12), "#9ee5ef");
    shield.name = "shield";
    (shield.material as THREE.MeshStandardMaterial).transparent = true;
    (shield.material as THREE.MeshStandardMaterial).opacity = 0.2;
    g.add(shield);
    return g;
  }
  update(s: Snapshot, self: string) {
    this.snapshot = s;
    this.selfId = self;
    if (this.courseId !== s.courseId)
      this.createCourse(COURSES.find((c) => c.id === s.courseId)!);
    const ids = new Set(s.players.map((p) => p.id));
    for (const [id, g] of this.entities)
      if (!ids.has(id)) {
        this.scene.remove(g);
        this.disposeGroup(g);
        this.entities.delete(id);
        const b = this.balls.get(id);
        if (b) {
          this.scene.remove(b);
          b.geometry.dispose();
          (b.material as THREE.Material).dispose();
          this.balls.delete(id);
        }
      }
    for (const p of s.players) {
      if (!this.entities.has(p.id)) {
        const g = this.avatar(p);
        g.position.copy(v3(p.pos));
        this.scene.add(g);
        this.entities.set(p.id, g);
        const b = mesh(
          new THREE.SphereGeometry(0.32, 16, 12),
          p.ballSkin ? COLORS[p.ballSkin % 8] : p.color,
        );
        this.balls.set(p.id, b);
        this.scene.add(b);
      }
      if (p.id === self && this.predictedId !== self) {
        this.predict.copy(v3(p.pos));
        this.predictedId = self;
      }
    }
    for (const e of s.effects)
      if (!this.seenEffects.has(e.id)) {
        this.seenEffects.add(e.id);
        if (this.seenEffects.size > 2000) this.seenEffects.clear();
        if (["chat", "announce", "join"].includes(e.kind)) continue;
        const m = mesh(
          new THREE.IcosahedronGeometry(e.kind === "laser" ? 3 : 1, 1),
          e.color,
        );
        (m.material as THREE.MeshStandardMaterial).transparent = true;
        m.position.copy(v3(e.pos));
        this.effects.add(m);
        this.fx.push({
          mesh: m,
          start: this.clock,
          end: this.clock + 0.7,
          kind: e.kind,
        });
        if (!this.hero) this.sound(e.kind);
      }
    if (this.hero) this.yaw = 0;
  }
  sound(kind: string) {
    if (this.muted || !this.soundCtx) return;
    const ctx = this.soundCtx,
      o = ctx.createOscillator(),
      gain = ctx.createGain();
    o.type = ["explosion", "laser", "hit"].includes(kind) ? "sawtooth" : "sine";
    const f =
      kind === "swing"
        ? 180
        : kind === "pickup"
          ? 680
          : kind === "finish"
            ? 880
            : kind === "checkpoint"
              ? 500
              : 90;
    o.frequency.setValueAtTime(f, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f * 1.7, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.connect(gain);
    gain.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.22);
  }
  activateAudio() {
    if (!this.soundCtx) this.soundCtx = new AudioContext();
    void this.soundCtx.resume();
  }
  groundTarget() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const p = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return { x: p.x, y: 0, z: p.z };
  }
  loop = () => {
    if (this.disposed) return;
    this.animation = requestAnimationFrame(this.loop);
    const now = performance.now(),
      dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    const s = this.snapshot;
    if (s) {
      let follow =
        s.players.find((p) => p.id === (this.spectating || this.selfId)) ||
        s.players[0];
      for (const p of s.players) {
        const g = this.entities.get(p.id)!,
          b = this.balls.get(p.id)!;
        if (p.id === this.selfId && !this.hero && !this.spectating) {
          const movement = new THREE.Vector3(this.input.x, 0, this.input.z);
          if (movement.length() > 1) movement.normalize();
          if (
            !this.aiming &&
            p.stun < s.time &&
            !p.finished &&
            !p.eliminated &&
            !p.cart
          ) {
            movement.multiplyScalar(
              9 * s.rules.speed * (p.boost > s.time ? 1.6 : 1) * dt,
            );
            this.predict.add(movement);
          }
          const authoritative = v3(p.pos);
          if (this.predict.distanceTo(authoritative) > 4)
            this.predict.copy(authoritative);
          else this.predict.lerp(authoritative, dt * 5);
          this.predict.y = p.pos.y;
          g.position.copy(this.predict);
        } else g.position.lerp(v3(p.pos), Math.min(1, dt * 15));
        g.rotation.y = p.id === this.selfId ? this.yaw : p.yaw;
        g.visible = !p.eliminated;
        g.getObjectByName("shield")!.visible = p.shield > s.time;
        for (const side of [-1, 1])
          g.getObjectByName("leg" + side)!.rotation.x =
            Math.sin(this.clock * 12 + side) * 0.3 * (p.stun > s.time ? 0 : 1);
        b.position.lerp(v3(p.ball), Math.min(1, dt * 20));
        b.visible = !p.finished;
      }
      if (follow) {
        const g = this.entities.get(follow.id)!;
        const flying = follow.ball.y > 2 && !this.aiming;
        const target = flying ? v3(follow.ball) : g.position.clone();
        const yaw = this.spectating ? follow.yaw : this.yaw;
        const cam = new THREE.Vector3(
          target.x - Math.sin(yaw) * (this.aiming ? 11 : 8),
          target.y + (flying ? 5 : this.aiming ? 7 : 4),
          target.z + Math.cos(yaw) * (this.aiming ? 11 : 8),
        );
        if (this.hero) {
          cam.set(35 + Math.sin(this.clock * 0.04) * 3, 40, 36);
          target.set(0, 0, -35);
        }
        this.camera.position.lerp(cam, Math.min(1, dt * 5));
        this.camera.lookAt(
          target.x,
          target.y + (this.hero ? 0 : 0.6),
          target.z - (this.hero ? 0 : 2),
        );
        this.ballRing.position.set(follow.ball.x, 0.18, follow.ball.z);
        this.ballRing.visible = !this.hero && !follow.finished;
        const points: THREE.Vector3[] = [];
        if (this.aiming) {
          const speed = 4 + this.power * 36,
            rad = (this.angle * Math.PI) / 180;
          for (let t = 0; t < 2.5; t += 0.07) {
            const y =
              follow.ball.y +
              speed * Math.sin(rad) * t -
              4.905 * s.rules.gravity * t * t;
            if (y < 0.1) break;
            points.push(
              new THREE.Vector3(
                follow.ball.x + Math.sin(this.yaw) * speed * Math.cos(rad) * t,
                y,
                follow.ball.z - Math.cos(this.yaw) * speed * Math.cos(rad) * t,
              ),
            );
          }
        }
        this.aimLine.geometry.dispose();
        this.aimLine.geometry = new THREE.BufferGeometry().setFromPoints(
          points,
        );
        this.aimLine.computeLineDistances();
        this.aimLine.visible = this.aiming;
      }
      this.crates.forEach((g, i) => {
        g.visible = s.crates[i]?.ready ?? false;
        g.position.y = 1.1 + Math.sin(this.clock * 2 + i) * 0.15;
        g.rotation.y = this.clock * 0.5;
      });
      this.checkpoints.forEach((g, i) => {
        g.position.y = 2 + Math.sin(this.clock * 2 + i) * 0.12;
        const ring = g.children[0] as THREE.Mesh;
        (ring.material as THREE.MeshStandardMaterial).color.set(
          i <= (follow?.checkpoint ?? -1) ? "#b5ee72" : "#ed9673",
        );
      });
      const l = layout(COURSES.find((c) => c.id === s.courseId)!);
      this.obstacle.position.set(
        l.obstacle.x +
          (COURSES.find((c) => c.id === s.courseId)!.obstacle === "windmill"
            ? Math.sin(s.time) * 5
            : 0),
        COURSES.find((c) => c.id === s.courseId)!.obstacle === "elevator"
          ? 1.2 + Math.sin(s.time) * 1.1
          : 1.2,
        l.obstacle.z,
      );
      this.obstacle.rotation.y = s.time * 0.7;
      this.disposeGroup(this.dynamicGroup);
      this.dynamicGroup.clear();
      for (const m of s.mines) {
        const mine = mesh(
          new THREE.CylinderGeometry(0.5, 0.6, 0.15, 10),
          "#eb826e",
        );
        mine.position.copy(v3(m.pos));
        this.dynamicGroup.add(mine);
      }
      for (const r of s.projectiles) {
        const rocket = mesh(new THREE.ConeGeometry(0.25, 0.8, 8), "#ffdf84");
        rocket.position.copy(v3(r.pos));
        this.dynamicGroup.add(rocket);
      }
      if (s.mode === "royale") {
        const zone = mesh(
          new THREE.TorusGeometry(s.zone.r, 0.2, 6, 80),
          "#f08587",
        );
        zone.rotation.x = Math.PI / 2;
        zone.position.set(s.zone.x, 0.3, s.zone.z);
        this.dynamicGroup.add(zone);
      }
      this.disposeGroup(this.cartGroup);
      this.cartGroup.clear();
      for (const c of s.carts) {
        const g = new THREE.Group();
        const body = mesh(new THREE.BoxGeometry(2.2, 1, 3.2), "#e9f769");
        g.add(body);
        const roof = mesh(new THREE.BoxGeometry(2.4, 0.15, 3.3), "#eee7d6");
        roof.position.y = 1.6;
        g.add(roof);
        for (const x of [-1, 1])
          for (const z of [-1, 1]) {
            const post = mesh(
              new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5),
              "#e5ded1",
            );
            post.position.set(x, 0.8, z * 1.3);
            g.add(post);
            const wheel = mesh(
              new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10),
              "#263d37",
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x * 1.2, -0.5, z);
            g.add(wheel);
          }
        g.position.copy(v3(c.pos));
        g.rotation.y = c.yaw;
        this.cartGroup.add(g);
      }
    }
    this.fx = this.fx.filter((f) => {
      if (f.end < this.clock) {
        this.effects.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        return false;
      }
      const age = this.clock - f.start;
      f.mesh.scale.setScalar(0.1 + age * 6);
      f.mesh.position.y += dt * 2;
      (f.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(
        0,
        1 - age / 0.7,
      );
      return true;
    });
    this.renderer.render(this.scene, this.camera);
  };
  disposeGroup(g: THREE.Group) {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.aimLine.geometry.dispose();
    (this.aimLine.material as THREE.Material).dispose();
    this.renderer.dispose();
    void this.soundCtx?.close();
    this.renderer.domElement.remove();
  }
}

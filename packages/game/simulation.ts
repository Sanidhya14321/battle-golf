import RAPIER from "@dimforge/rapier3d-compat";
import {
  COURSES,
  COLORS,
  ITEMS,
  itemById,
  layout,
  rulesFor,
  type Course,
  type ItemId,
  type Mode,
  type Rules,
  type Vec,
} from "./content";
let physicsReady: Promise<void> | null = null;
export const initPhysics = () =>
  (physicsReady ??= RAPIER.init() as Promise<void>);
export type Input = { x: number; z: number; yaw: number; charging: boolean };
export type Action = {
  type: string;
  power?: number;
  angle?: number;
  slot?: number;
  target?: Vec;
  text?: string;
};
export type Pickup = { kind: ItemId; ammo: number };
export type PlayerView = {
  id: string;
  name: string;
  color: string;
  pos: Vec;
  ball: Vec;
  yaw: number;
  strokes: number;
  score: number;
  finished: boolean;
  bot: boolean;
  shield: number;
  stun: number;
  boost: number;
  checkpoint: number;
  inventory: Pickup[];
  lives: number;
  eliminated: boolean;
  cart: string | null;
  connected: boolean;
  outfit: number;
  hat: number;
  ballSkin: number;
  club: number;
  emote: number;
};
type Player = PlayerView & {
  body: RAPIER.RigidBody;
  ballBody: RAPIER.RigidBody;
  input: Input;
  lastDive: number;
  lastClub: number;
  lastShot: number;
  immune: number;
  overshoot: number;
  hits: number;
  style: number;
  knock: Vec;
  ballOrigin: Vec;
  finishTime: number;
  aiTime: number;
  aiTarget: number;
  lastAttacker: string | null;
  hitTime: number;
};
export type Effect = {
  id: number;
  kind: string;
  pos: Vec;
  color: string;
  until: number;
  text?: string;
};
export type Projectile = {
  id: number;
  pos: Vec;
  target: string;
  owner: string;
};
export type Cart = {
  id: string;
  pos: Vec;
  yaw: number;
  seats: string[];
  body: RAPIER.RigidBody;
  ram: Record<string, number>;
};
export type Snapshot = {
  mode: Mode;
  courseId: string;
  hole: number;
  holes: number;
  phase: string;
  time: number;
  phaseStart: number;
  roomCode?: string;
  remaining: number;
  players: PlayerView[];
  effects: Effect[];
  projectiles: Projectile[];
  mines: { id: number; pos: Vec; owner: string }[];
  crates: { pos: Vec; ready: boolean }[];
  carts: { id: string; pos: Vec; yaw: number; seats: string[] }[];
  zone: { x: number; z: number; r: number };
  wind: Vec;
  winner: string | null;
  rules: Rules;
  obstacle: number;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = (a: Vec) => ({ x: a.x, y: a.y, z: a.z });
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export class Game {
  world!: RAPIER.World;
  players = new Map<string, Player>();
  course: Course;
  rules: Rules;
  map: ReturnType<typeof layout>;
  time = 0;
  hole = 1;
  phase = "lobby";
  holeStart = 0;
  phaseStart = 0;
  effects: Effect[] = [];
  projectiles: Projectile[] = [];
  mines: { id: number; pos: Vec; owner: string; armed: number }[] = [];
  lasers: { pos: Vec; owner: string; at: number }[] = [];
  crates: { pos: Vec; next: number }[] = [];
  carts = new Map<string, Cart>();
  moving!: RAPIER.RigidBody;
  winner: string | null = null;
  events: { playerId: string; text: string }[] = [];
  private serial = 0;
  private randomState: number;
  zoneExposure = new Map<string, number>();
  resultsReady = false;
  constructor(
    public mode: Mode = "practice",
    custom: Partial<Rules> = {},
    seed = 42,
  ) {
    this.rules = rulesFor(mode, custom);
    this.randomState = seed >>> 0;
    this.course = COURSES.find((c) => c.id === this.rules.courseIds[0])!;
    this.map = layout(this.course);
    this.buildWorld();
  }
  random() {
    this.randomState =
      (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  buildWorld() {
    if (this.world) this.world.free();
    this.world = new RAPIER.World({
      x: 0,
      y: -9.81 * this.rules.gravity,
      z: 0,
    });
    this.world.timestep = 1 / 60;
    this.map = layout(this.course);
    this.carts.clear();
    this.mines = [];
    this.projectiles = [];
    this.lasers = [];
    this.effects = [];
    this.crates = this.map.crates.map((pos) => ({ pos: copy(pos), next: 0 }));
    for (const p of this.map.platforms) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, -1, p.z),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(p.w / 2, 1, p.d / 2)
          .setFriction(0.7)
          .setRestitution(0.25),
        body,
      );
    }
    // Side rails protect the safe route. Gaps and water remain genuine hazards.
    for (const p of this.map.platforms)
      for (const side of [-1, 1]) {
        const b = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(
            p.x + (side * p.w) / 2,
            0.45,
            p.z,
          ),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.25, 0.45, p.d / 2).setRestitution(0.7),
          b,
        );
      }
    const r = this.map.ramp;
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(r.x, 0.35, r.z)
        .setRotation({ x: Math.sin(0.12), y: 0, z: 0, w: Math.cos(0.12) }),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.25, 3), rb);
    this.moving = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.map.obstacle.x,
        1.2,
        this.map.obstacle.z,
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        this.course.obstacle === "elevator" ? 2 : 5,
        0.35,
        0.65,
      ).setRestitution(0.8),
      this.moving,
    );
    // Dense vegetation is physical, not just decoration.
    for (let i = 0; i < 5; i++) {
      const p = this.map.platforms[i];
      const tree = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          p.x + (i % 2 ? -10 : 10),
          1.5,
          p.z - 3,
        ),
      );
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 0.65), tree);
    }
    for (const p of this.players.values()) this.createBodies(p);
  }
  createBodies(p: Player) {
    const tee = this.map.tee;
    p.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          tee.x + ((this.players.size % 4) - 1.5) * 1.2,
          1.2,
          tee.z,
        )
        .lockRotations()
        .setLinearDamping(0.5)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, 0.35)
        .setMass(1)
        .setFriction(0)
        .setCollisionGroups(this.rules.collisions ? 0x0001ffff : 0x00010002),
      p.body,
    );
    p.ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          tee.x + ((this.players.size % 4) - 1.5) * 1.2,
          0.4,
          tee.z - 2,
        )
        .setCcdEnabled(true)
        .setAngularDamping(0.8),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.32)
        .setMass(0.35)
        .setRestitution(this.rules.bounce)
        .setFriction(0.6)
        .setCollisionGroups(this.rules.collisions ? 0x0002ffff : 0x00020001),
      p.ballBody,
    );
    p.pos = copy(p.body.translation());
    p.ball = copy(p.ballBody.translation());
    p.checkpoint = -1;
    p.strokes = 0;
    p.finished = false;
    p.eliminated = false;
    p.lives = 3;
    p.cart = null;
    p.inventory = [];
    p.shield = 0;
    p.stun = 0;
    p.boost = 0;
    p.immune = 0;
    p.hits = 0;
    p.style = 0;
    p.knock = { x: 0, y: 0, z: 0 };
    p.input = { x: 0, z: 0, yaw: 0, charging: false };
    p.ballOrigin = copy(p.ball);
    p.finishTime = Infinity;
  }
  addPlayer(
    id: string,
    name: string,
    bot = false,
    appearance: Partial<PlayerView> = {},
  ) {
    if (this.players.size >= 8 || this.players.has(id)) return;
    const p = {
      id,
      name: name.replace(/[<>]/g, "").slice(0, 20) || "Golfer",
      bot,
      color: COLORS[this.players.size % 8],
      score: 0,
      yaw: 0,
      lastDive: -10,
      lastClub: -10,
      lastShot: -10,
      overshoot: 0,
      aiTime: 0,
      aiTarget: 0,
      lastAttacker: null,
      hitTime: 0,
      connected: true,
      outfit: 0,
      hat: 0,
      ballSkin: 0,
      club: 0,
      emote: 0,
      ...appearance,
    } as Player;
    this.players.set(id, p);
    this.createBodies(p);
    this.effect("join", p.pos, p.color, 2, `${p.name} joined`);
  }
  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.leaveCart(p);
    this.world.removeRigidBody(p.body);
    this.world.removeRigidBody(p.ballBody);
    this.players.delete(id);
  }
  start() {
    if (!this.players.size) return;
    this.phase = "playing";
    this.holeStart = this.time;
    this.phaseStart = this.time;
    this.effect("announce", this.map.tee, "#e9f769", 3, "LET’S PLAY");
  }
  input(id: string, input: Input) {
    const p = this.players.get(id);
    if (!p) return;
    const vals = [input.x, input.z, input.yaw];
    if (!vals.every(Number.isFinite)) return;
    p.input = {
      x: clamp(input.x, -1, 1),
      z: clamp(input.z, -1, 1),
      yaw: input.yaw,
      charging: !!input.charging,
    };
  }
  effect(
    kind: string,
    pos: Vec,
    color = "#e9f769",
    duration = 0.7,
    text?: string,
  ) {
    this.effects.push({
      id: ++this.serial,
      kind,
      pos: copy(pos),
      color,
      until: this.time + duration,
      text,
    });
  }
  notify(id: string, text: string) {
    this.events.push({ playerId: id, text });
  }
  hit(
    owner: string,
    p: Player,
    dir: Vec,
    strength = 15,
    stun = 1,
    kind = "hit",
  ) {
    if (
      p.id === owner ||
      p.finished ||
      p.eliminated ||
      p.immune > this.time ||
      p.shield > this.time
    )
      return false;
    p.stun = this.time + stun;
    p.immune = this.time + stun + 1.5;
    p.knock = {
      x: dir.x * strength * this.rules.knockback,
      y: Math.min(10, strength / 3),
      z: dir.z * strength * this.rules.knockback,
    };
    p.body.setLinvel({ x: p.knock.x, y: p.knock.y, z: p.knock.z }, true);
    p.lastAttacker = owner;
    p.hitTime = this.time;
    const a = this.players.get(owner);
    if (a && a.hits < 5) {
      a.score += this.rules.attackPoints;
      a.hits++;
      this.notify(owner, `+${this.rules.attackPoints} · Clean hit`);
    }
    this.effect(kind, p.pos, p.color, 1);
    return true;
  }
  action(id: string, a: Action) {
    const p = this.players.get(id);
    if (!p || this.phase !== "playing" || p.eliminated || p.finished) return;
    const dir = { x: Math.sin(p.input.yaw), y: 0, z: -Math.cos(p.input.yaw) };
    if (a.type === "chat") {
      this.effect(
        "chat",
        p.pos,
        p.color,
        3,
        ["Nice shot!", "Fore!", "Good game!", "Oops…", "Catch me!", "Thanks!"][
          Math.max(0, Math.min(5, Math.floor(a.slot || 0)))
        ],
      );
      return;
    }
    if (a.type === "drop") {
      const slot = Math.floor(a.slot ?? 0);
      if (slot >= 0 && slot < p.inventory.length) {
        p.inventory.splice(slot, 1);
        this.effect("pickup", p.pos, p.color);
      }
      return;
    }
    if (p.stun > this.time) return;
    if (a.type === "dive" && this.time - p.lastDive > 2) {
      p.lastDive = this.time;
      p.knock = { x: dir.x * 16, y: 4, z: dir.z * 16 };
      p.body.setLinvel({ x: p.knock.x, y: 4, z: p.knock.z }, true);
      this.effect("dive", p.pos, p.color);
    }
    if (a.type === "swing") {
      if (!Number.isFinite(a.power) || !Number.isFinite(a.angle)) return;
      if (dist(p.pos, p.ball) > 2.4) {
        this.notify(id, "Get closer to your ball");
        return;
      }
      const v = p.ballBody.linvel();
      if (Math.hypot(v.x, v.y, v.z) > 0.8 || this.time - p.lastShot < 0.5) {
        this.notify(id, "Let your ball settle");
        return;
      }
      p.lastShot = this.time;
      p.strokes++;
      p.ballOrigin = copy(p.ball);
      const angle = (clamp(a.angle!, 5, 70) * Math.PI) / 180;
      const power = clamp(a.power!, 0, 1);
      const velocity = (4 + power * 36) * (p.overshoot > this.time ? 1.8 : 1);
      p.overshoot = 0;
      p.ballBody.setLinvel(
        {
          x: dir.x * velocity * Math.cos(angle),
          y: velocity * Math.sin(angle),
          z: dir.z * velocity * Math.cos(angle),
        },
        true,
      );
      this.effect("swing", p.ball, p.color, 1);
      return;
    }
    if (a.type === "club" && this.rules.combat && this.time - p.lastClub > 2) {
      p.lastClub = this.time;
      this.effect("club", p.pos, p.color, 0.4);
      for (const o of this.players.values())
        if (dist(p.pos, o.pos) < 2.5 && this.hit(id, o, dir, 10, 0.7, "club"))
          p.boost = this.time + 1.5;
      return;
    }
    if (a.type === "interact") {
      if (p.cart) {
        this.leaveCart(p);
        return;
      }
      const c = [...this.carts.values()].find(
        (c) => dist(c.pos, p.pos) < 3 && c.seats.length < 4,
      );
      if (c) {
        c.seats.push(id);
        p.cart = c.id;
        p.body.collider(0).setSensor(true);
      }
      return;
    }
    if (a.type === "honk" && p.cart) {
      this.effect("chat", p.pos, "#ffce65", 1, "HONK!");
      return;
    }
    if (a.type !== "item") return;
    const slot = Math.floor(a.slot ?? 0);
    const item = p.inventory[slot];
    if (!item) return;
    const target = [...this.players.values()]
      .filter((o) => o.id !== id && !o.finished && !o.eliminated)
      .map((o) => ({
        p: o,
        d: dist(o.pos, p.pos),
        dot:
          ((o.pos.x - p.pos.x) * dir.x + (o.pos.z - p.pos.z) * dir.z) /
          Math.max(0.01, dist(o.pos, p.pos)),
      }))
      .filter((o) => o.dot > 0.92)
      .sort((a, b) => a.d - b.d)[0]?.p;
    switch (item.kind) {
      case "shield":
        p.shield = this.time + 6;
        break;
      case "coffee":
        p.boost = this.time + 10;
        break;
      case "boots":
        p.knock = { x: dir.x * 24, y: 15, z: dir.z * 24 };
        p.body.setLinvel({ x: p.knock.x, y: 15, z: p.knock.z }, true);
        break;
      case "rocket":
        if (!target) {
          this.notify(id, "Face an opponent to lock on");
          return;
        }
        this.projectiles.push({
          id: ++this.serial,
          pos: { x: p.pos.x, y: 1.5, z: p.pos.z },
          target: target.id,
          owner: id,
        });
        break;
      case "pistol":
      case "rifle":
        if (
          target &&
          dist(target.pos, p.pos) < (item.kind === "rifle" ? 65 : 25)
        )
          this.hit(id, target, dir, item.kind === "rifle" ? 38 : 8, 1.2);
        if (item.kind === "rifle") {
          p.knock = { x: -dir.x * 18, y: 5, z: -dir.z * 18 };
          p.body.setLinvel(p.knock, true);
        }
        this.effect("shot", p.pos, "#ffce65");
        break;
      case "mine":
        if (this.mines.filter((m) => m.owner === id).length >= 3) {
          this.notify(id, "Three mines already deployed");
          return;
        }
        this.mines.push({
          id: ++this.serial,
          pos: { x: p.pos.x, y: 0.2, z: p.pos.z },
          owner: id,
          armed: this.time + 1,
        });
        break;
      case "freeze":
        for (const o of this.players.values())
          if (dist(p.pos, o.pos) < 9)
            this.hit(id, o, { x: 0, y: 0, z: 0 }, 0, 2, "freeze");
        break;
      case "horn":
        for (const o of this.players.values())
          if (
            o.id !== id &&
            dist(o.pos, p.pos) < 14 &&
            o.input.charging &&
            o.shield <= this.time
          ) {
            o.overshoot = this.time + 3;
            this.notify(o.id, "AIR HORN! Your next swing will overshoot");
          }
        this.effect("chat", p.pos, "#ffce65", 2, "BWAAAP!");
        break;
      case "laser": {
        const t = a.target;
        if (
          !t ||
          ![t.x, t.y, t.z].every(Number.isFinite) ||
          dist(t, p.pos) > 180
        )
          return;
        this.lasers.push({
          pos: {
            x: clamp(t.x, -30, 30),
            y: 0,
            z: clamp(t.z, -this.course.length, 15),
          },
          owner: id,
          at: this.time + 1.5,
        });
        this.effect("marker", this.lasers.at(-1)!.pos, "#ff725e", 1.5);
        break;
      }
      case "cart": {
        if (p.cart) return;
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(p.pos.x, 1, p.pos.z)
            .lockRotations()
            .setCcdEnabled(true),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(1.1, 0.5, 1.6).setMass(3),
          body,
        );
        const c = {
          id: `cart-${++this.serial}`,
          pos: copy(p.pos),
          yaw: p.yaw,
          seats: [id],
          body,
          ram: {},
        };
        this.carts.set(c.id, c);
        p.cart = c.id;
        p.body.collider(0).setSensor(true);
        break;
      }
    }
    item.ammo--;
    if (item.ammo <= 0) p.inventory.splice(slot, 1);
    this.effect("item", p.pos, p.color, 1, itemById(item.kind).name);
  }
  leaveCart(p: Player) {
    const c = p.cart && this.carts.get(p.cart);
    if (c) c.seats = c.seats.filter((id) => id !== p.id);
    p.cart = null;
    p.body.collider(0).setSensor(false);
  }
  reset(p: Player, ball: boolean) {
    const cp =
      p.checkpoint >= 0 ? this.map.checkpoints[p.checkpoint] : this.map.tee;
    let spawn = copy(cp);
    const zone = this.zone();
    if (this.mode === "royale" && !ball) {
      p.lives--;
      if (p.lives <= 0) {
        p.eliminated = true;
        p.body.setEnabled(false);
        p.ballBody.setEnabled(false);
        this.leaveCart(p);
        this.effect("announce", p.pos, p.color, 2, `${p.name} eliminated`);
        return;
      }
      const valid = [
        this.map.tee,
        ...this.map.checkpoints,
        this.map.hole,
      ].filter((v) => dist(v, { ...zone, y: 0 }) < zone.r - 1);
      spawn = copy(
        valid.sort((a, b) => dist(a, cp) - dist(b, cp))[0] || this.map.hole,
      );
    }
    if (ball) {
      p.ballBody.setTranslation({ x: spawn.x, y: 0.6, z: spawn.z - 1 }, true);
      p.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      this.leaveCart(p);
      p.body.setTranslation({ x: spawn.x, y: 1.3, z: spawn.z }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.knock = { x: 0, y: 0, z: 0 };
      p.immune = this.time + 2;
    }
    if (p.lastAttacker && this.time - p.hitTime < 5) {
      const attacker = this.players.get(p.lastAttacker);
      if (attacker && attacker.style < 3) {
        attacker.score += this.rules.stylePoints;
        attacker.style++;
        this.notify(attacker.id, "Hazard assist · style bonus");
      }
      p.lastAttacker = null;
    }
    this.effect("respawn", spawn, p.color, 1);
  }
  bot(p: Player) {
    if (p.aiTime > this.time || p.finished || p.eliminated) return;
    p.aiTime = this.time + 0.15;
    const nearBall = dist(p.pos, p.ball) < 1.8;
    const destination = nearBall ? this.map.hole : p.ball;
    const dx = destination.x - p.pos.x,
      dz = destination.z - p.pos.z;
    const yaw = Math.atan2(dx, -dz);
    p.input = {
      x: nearBall ? 0 : Math.sin(yaw),
      z: nearBall ? 0 : -Math.cos(yaw),
      yaw,
      charging: nearBall,
    };
    if (nearBall) {
      const speed = p.ballBody.linvel();
      if (
        Math.hypot(speed.x, speed.y, speed.z) < 0.6 &&
        this.time - p.lastShot > 1.2
      ) {
        const next =
          this.map.checkpoints.find(
            (c) => c.z < p.ball.z - 5 && c.z > this.map.hole.z,
          ) || this.map.hole;
        const d = dist(next, p.ball);
        p.input.yaw = Math.atan2(next.x - p.ball.x, -(next.z - p.ball.z));
        this.action(p.id, {
          type: "swing",
          angle: d < 10 ? 5 : 25,
          power: clamp(
            (Math.sqrt((d * 9.81) / Math.sin((Math.PI * 50) / 180)) - 4) / 36,
            0.06,
            0.8,
          ),
        });
      }
    }
    if (p.inventory.length && this.random() < 0.03) {
      const target = this.map.hole;
      this.action(p.id, { type: "item", slot: 0, target });
    }
    if (this.random() < 0.005) this.action(p.id, { type: "dive" });
    if (
      [...this.players.values()].some(
        (o) => o.id !== p.id && dist(o.pos, p.pos) < 2.3,
      )
    )
      this.action(p.id, { type: "club" });
  }
  zone() {
    const age = this.time - this.holeStart;
    const r =
      this.mode === "royale"
        ? Math.max(
            0.25,
            (this.course.length + 20) * (1 - clamp((age - 30) / 210, 0, 1)),
          )
        : 999;
    return { x: this.map.hole.x, z: this.map.hole.z, r };
  }
  tick() {
    this.time += 1 / 60;
    this.effects = this.effects.filter((e) => e.until > this.time);
    if (this.phase === "results") {
      if (this.time - this.phaseStart > 8) {
        if (this.hole < this.rules.holes && this.mode !== "royale") {
          this.hole++;
          this.course = COURSES.find(
            (c) =>
              c.id ===
              this.rules.courseIds[
                (this.hole - 1) % this.rules.courseIds.length
              ],
          )!;
          this.buildWorld();
          this.start();
        } else {
          this.phase = "complete";
          this.resultsReady = true;
        }
      }
      return;
    }
    if (this.phase !== "playing") return;
    const now = this.time,
      wind = this.rules.wind
        ? { x: Math.sin(now * 0.08) * 2.5, y: 0, z: Math.cos(now * 0.1) * 0.8 }
        : { x: 0, y: 0, z: 0 };
    const ob = this.map.obstacle;
    this.moving.setNextKinematicTranslation({
      x: ob.x + (this.course.obstacle === "windmill" ? Math.sin(now) * 5 : 0),
      y: this.course.obstacle === "elevator" ? 1.2 + Math.sin(now) * 1.1 : 1.2,
      z: ob.z,
    });
    this.moving.setNextKinematicRotation({
      x: 0,
      y: Math.sin((now * 0.7) / 2),
      z: 0,
      w: Math.cos((now * 0.7) / 2),
    });
    for (const p of this.players.values()) {
      if (p.bot) this.bot(p);
      if (p.finished || p.eliminated) {
        p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        continue;
      }
      p.yaw = p.input.yaw;
      const v = p.body.linvel();
      const n = Math.max(1, Math.hypot(p.input.x, p.input.z));
      const speed = 9 * this.rules.speed * (p.boost > now ? 1.6 : 1);
      p.knock.x *= 0.96;
      p.knock.z *= 0.96;
      if (!p.cart)
        p.body.setLinvel(
          {
            x:
              (p.stun > now || p.input.charging ? 0 : (p.input.x / n) * speed) +
              p.knock.x,
            y: v.y,
            z:
              (p.stun > now || p.input.charging ? 0 : (p.input.z / n) * speed) +
              p.knock.z,
          },
          true,
        );
      p.ballBody.resetForces(true);
      const bv = p.ballBody.linvel(),
        b = p.ballBody.translation();
      if (b.y < 0.6) {
        const sand = this.map.sand.some(
          (s) => Math.abs(b.x - s.x) < s.w / 2 && Math.abs(b.z - s.z) < s.d / 2,
        );
        const damp =
          (sand ? 0.93 : this.course.theme === "ice" ? 0.997 : 0.978) **
          this.rules.friction;
        p.ballBody.setLinvel({ x: bv.x * damp, y: bv.y, z: bv.z * damp }, true);
      } else
        p.ballBody.addForce({ x: wind.x * 0.08, y: 0, z: wind.z * 0.08 }, true);
    }
    for (const c of this.carts.values()) {
      const driver = this.players.get(c.seats[0]);
      if (driver) {
        const i = driver.input,
          n = Math.max(1, Math.hypot(i.x, i.z)),
          v = c.body.linvel();
        c.yaw = i.yaw;
        c.body.setLinvel(
          { x: (i.x / n) * 22, y: v.y, z: (i.z / n) * 22 },
          true,
        );
      } else {
        const v = c.body.linvel();
        c.body.setLinvel({ x: v.x * 0.94, y: v.y, z: v.z * 0.94 }, true);
      }
      c.pos = copy(c.body.translation());
      if (c.pos.y < -6) {
        for (const id of [...c.seats]) {
          const p = this.players.get(id);
          if (p) this.reset(p, false);
        }
        this.world.removeRigidBody(c.body);
        this.carts.delete(c.id);
        continue;
      }
      for (const id of c.seats) {
        const p = this.players.get(id);
        if (p) {
          p.body.setTranslation(
            {
              x: c.pos.x + (id === c.seats[0] ? -0.5 : 0.5),
              y: c.pos.y + 0.6,
              z: c.pos.z,
            },
            true,
          );
          p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
      for (const p of this.players.values())
        if (
          !c.seats.includes(p.id) &&
          dist(c.pos, p.pos) < 2 &&
          Math.hypot(c.body.linvel().x, c.body.linvel().z) > 7 &&
          (c.ram[p.id] || 0) < now
        ) {
          c.ram[p.id] = now + 2;
          this.hit(
            c.seats[0] || c.id,
            p,
            { x: Math.sin(c.yaw), y: 0, z: -Math.cos(c.yaw) },
            24,
            1,
          );
        }
    }
    this.world.step();
    for (const p of this.players.values()) {
      p.pos = copy(p.body.translation());
      p.ball = copy(p.ballBody.translation());
      if (p.finished || p.eliminated) continue;
      for (let i = 0; i < this.map.checkpoints.length; i++)
        if (
          i > p.checkpoint &&
          (dist(p.pos, this.map.checkpoints[i]) < 2 ||
            dist(p.ball, this.map.checkpoints[i]) < 2)
        ) {
          p.checkpoint = i;
          this.effect("checkpoint", this.map.checkpoints[i], p.color);
          this.notify(p.id, "Checkpoint saved");
        }
      const inWater = (v: Vec) =>
        v.y < 1 &&
        this.map.water.some((w) => dist(v, { x: w.x, y: 0, z: w.z }) < w.r);
      if (p.ball.y < -5 || inWater(p.ball)) this.reset(p, true);
      if (p.pos.y < -5 || inWater(p.pos)) this.reset(p, false);
      for (const b of this.map.boosts)
        if (dist(p.pos, { ...b, y: 0 }) < 1.5) {
          p.boost = now + 1;
        }
      for (const c of this.crates)
        if (
          c.next < now &&
          p.inventory.length < 3 &&
          dist(p.pos, c.pos) < 1.6 &&
          this.rules.items.length
        ) {
          let candidates = ITEMS.filter((i) => this.rules.items.includes(i.id));
          const sum = candidates.reduce((s, i) => s + i.weight, 0);
          let value = this.random() * sum;
          const item =
            candidates.find((i) => (value -= i.weight) < 0) || candidates[0];
          p.inventory.push({ kind: item.id, ammo: item.ammo });
          c.next = now + 12;
          this.effect("pickup", c.pos, p.color, 1);
          this.notify(p.id, `${item.name} picked up`);
        }
      if (this.mode === "royale") {
        const zone = this.zone();
        if (dist(p.pos, { ...zone, y: 0 }) > zone.r) {
          const age = (this.zoneExposure.get(p.id) || 0) + 1 / 60;
          this.zoneExposure.set(p.id, age);
          if (age > 5) {
            this.zoneExposure.set(p.id, 0);
            this.reset(p, false);
          }
        } else this.zoneExposure.set(p.id, 0);
      } else if (
        dist(p.ball, this.map.hole) < 0.7 &&
        p.ball.y < 0.75 &&
        Math.hypot(p.ballBody.linvel().x, p.ballBody.linvel().z) < 10
      ) {
        p.finished = true;
        p.body.setEnabled(false);
        p.ballBody.setEnabled(false);
        p.finishTime = now;
        const place = [...this.players.values()].filter(
          (o) => o.finished,
        ).length;
        const points =
          (this.rules.finishPoints[place - 1] || 0) +
          Math.max(0, 10 - p.strokes);
        p.score += points;
        if (dist(p.ballOrigin, this.map.hole) > 12 && p.style < 3) {
          p.score += this.rules.stylePoints;
          p.style++;
        }
        p.ballBody.setTranslation(
          { x: this.map.hole.x, y: -0.5, z: this.map.hole.z },
          true,
        );
        p.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.effect(
          "finish",
          this.map.hole,
          p.color,
          3,
          `${p.name} · #${place}`,
        );
        this.notify(p.id, `In the cup! +${points} points`);
      }
    }
    this.projectiles = this.projectiles.filter((r) => {
      const target = this.players.get(r.target);
      if (!target || target.eliminated) return false;
      const d = Math.hypot(
        target.pos.x - r.pos.x,
        target.pos.y - r.pos.y,
        target.pos.z - r.pos.z,
      );
      if (d < 1.2) {
        this.hit(
          r.owner,
          target,
          {
            x: (target.pos.x - r.pos.x) / Math.max(d, 0.01),
            y: 0,
            z: (target.pos.z - r.pos.z) / Math.max(d, 0.01),
          },
          20,
          1.5,
          "explosion",
        );
        return false;
      }
      r.pos.x += ((target.pos.x - r.pos.x) / d) * 0.5;
      r.pos.y += ((target.pos.y - r.pos.y) / d) * 0.5;
      r.pos.z += ((target.pos.z - r.pos.z) / d) * 0.5;
      return true;
    });
    this.mines = this.mines.filter((m) => {
      const p = [...this.players.values()].find(
        (p) =>
          p.id !== m.owner &&
          !p.eliminated &&
          dist(p.pos, m.pos) < 1.4 &&
          m.armed < now,
      );
      if (p) {
        this.hit(m.owner, p, { x: 0, y: 0, z: 0 }, 0, 1.8, "explosion");
        this.effect("explosion", m.pos, "#ffce65", 1);
        return false;
      }
      return true;
    });
    this.lasers = this.lasers.filter((l) => {
      if (l.at > now) return true;
      this.effect("laser", l.pos, "#ff725e", 1);
      for (const p of this.players.values())
        if (dist(p.pos, l.pos) < 8 && p.shield < now) {
          if (
            this.hit(
              l.owner,
              p,
              { x: (p.pos.x - l.pos.x) / 8, y: 0, z: (p.pos.z - l.pos.z) / 8 },
              40,
              2,
              "explosion",
            ) &&
            this.mode === "royale"
          )
            this.reset(p, false);
        }
      return false;
    });
    const active = [...this.players.values()].filter((p) => !p.eliminated);
    const over =
      this.mode === "royale"
        ? active.length <= 1
        : [...this.players.values()].every((p) => p.finished);
    if (
      over ||
      (this.mode !== "practice" && now - this.holeStart > this.rules.timeLimit)
    ) {
      this.phase = "results";
      this.phaseStart = now;
      const sorted = [...this.players.values()].sort((a, b) =>
        this.mode === "royale"
          ? Number(a.eliminated) - Number(b.eliminated) || b.lives - a.lives
          : b.score - a.score ||
            a.strokes - b.strokes ||
            a.finishTime - b.finishTime,
      );
      this.winner = sorted[0]?.id || null;
      if (this.mode === "royale" && sorted[0]) sorted[0].score += 30;
    }
  }
  snapshot(): Snapshot {
    return {
      mode: this.mode,
      courseId: this.course.id,
      hole: this.hole,
      holes: this.mode === "royale" ? 1 : this.rules.holes,
      phase: this.phase,
      time: this.time,
      phaseStart: this.phaseStart,
      remaining: Math.max(
        0,
        this.rules.timeLimit - (this.time - this.holeStart),
      ),
      players: [...this.players.values()].map(
        ({
          body,
          ballBody,
          input,
          lastDive,
          lastClub,
          lastShot,
          immune,
          overshoot,
          hits,
          style,
          knock,
          ballOrigin,
          finishTime,
          aiTime,
          aiTarget,
          lastAttacker,
          hitTime,
          ...p
        }) => ({
          ...p,
          pos: copy(p.pos),
          ball: copy(p.ball),
          inventory: p.inventory.map((i) => ({ ...i })),
        }),
      ),
      effects: this.effects,
      projectiles: this.projectiles,
      mines: this.mines,
      crates: this.crates.map((c) => ({
        pos: c.pos,
        ready: c.next < this.time,
      })),
      carts: [...this.carts.values()].map(({ body, ram, ...c }) => c),
      zone: this.zone(),
      wind: this.rules.wind
        ? {
            x: Math.sin(this.time * 0.08) * 2.5,
            y: 0,
            z: Math.cos(this.time * 0.1) * 0.8,
          }
        : { x: 0, y: 0, z: 0 },
      winner: this.winner,
      rules: this.rules,
      obstacle: this.time,
    };
  }
}

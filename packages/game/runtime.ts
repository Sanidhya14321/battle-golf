import { moveGolfer } from "./movement";
import type * as RAPIERTypes from "@dimforge/rapier3d-compat";
let RAPIER: typeof RAPIERTypes;
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
  (physicsReady ??= (async () => {
    const module = await import("@dimforge/rapier3d-compat");
    RAPIER = module;
    await module.init();
  })());
export const PROTOCOL = 2;
export type Input = {
  x: number;
  z: number;
  yaw: number;
  charging: boolean;
  seq?: number;
};
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
  velocity: Vec;
  grounded: boolean;
  animation: string;
  actionStart: number;
  charge: number;
  immune: number;
  ready: string;
  diveReady: number;
  clubReady: number;
  finishTime: number;
  totalStrokes: number;
  totalFinishTime: number;
  lastInputSeq: number;
  knockVelocity: Vec;
  heldItem: ItemId | null;
};
type Player = PlayerView & {
  body: RAPIERTypes.RigidBody;
  ballBody: RAPIERTypes.RigidBody;
  controller: RAPIERTypes.KinematicCharacterController;
  input: Input;
  knock: Vec;
  chargeStart: number | null;
  pending: {
    type: "swing" | "club";
    at: number;
    yaw: number;
    power: number;
    angle: number;
    origin: Vec;
  } | null;
  actionEnd: number;
  lastShot: number;
  hits: number;
  previousBall: Vec;
  aiTime: number;
  aiTarget: number;
  lockStart: number | null;
  lockTarget: string;
};
export type Effect = {
  id: number;
  kind: string;
  pos: Vec;
  color: string;
  until: number;
  text?: string;
  playerId?: string;
};
export type Projectile = {
  id: number;
  pos: Vec;
  target: string;
  owner: string;
  expires: number;
};
export type Snapshot = {
  protocol: number;
  mode: Mode;
  courseId: string;
  hole: number;
  holes: number;
  phase: string;
  time: number;
  phaseStart: number;
  roomCode?: string;
  owner?: string;
  remaining: number;
  finishWindow: boolean;
  players: PlayerView[];
  effects: Effect[];
  projectiles: Projectile[];
  mines: { id: number; pos: Vec; owner: string; armed: number }[];
  crates: { pos: Vec; ready: boolean }[];
  carts: { id: string; pos: Vec; yaw: number; seats: string[] }[];
  zone: { x: number; z: number; r: number };
  wind: Vec;
  winner: string | null;
  rules: Rules;
  obstacle: number;
};
const copy = (v: Vec) => ({ x: v.x, y: v.y, z: v.z });
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const direction = (yaw: number) => ({
  x: Math.sin(yaw),
  y: 0,
  z: -Math.cos(yaw),
});
const magnitude = (v: Vec) => Math.hypot(v.x, v.y, v.z);
export function shotSpeed(power: number, angle: number) {
  return angle === 8 ? 1 + power * 16 : 4 + power * 28;
}
export class Game {
  world!: RAPIERTypes.World;
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
  crates: { pos: Vec; next: number }[] = [];
  moving!: RAPIERTypes.RigidBody;
  winner: string | null = null;
  events: { playerId: string; text: string }[] = [];
  resultsReady = false;
  finishDeadline = Infinity;
  private bombs: { owner: string; pos: Vec; at: number }[] = [];
  private serial = 0;
  private randomState: number;
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
    this.world?.free();
    this.world = new RAPIER.World({
      x: 0,
      y: -9.81 * this.rules.gravity,
      z: 0,
    });
    this.world.timestep = 1 / 60;
    this.map = layout(this.course);
    this.effects = [];
    this.bombs = [];
    this.mines = [];
    this.projectiles = [];
    this.crates = this.map.crates.map((pos) => ({ pos: copy(pos), next: 0 }));
    for (const p of this.map.platforms) {
      const b = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, (p.y || 0) - 1, p.z),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(p.w / 2, 1, p.d / 2)
          .setFriction(0.65)
          .setRestitution(0.25)
          .setCollisionGroups(0x0001ffff),
        b,
      );
    }
    if (this.course.id === "clover")
      for (const x of [-17, 17]) {
        const b = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.3, -30),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.3, 0.3, 42).setRestitution(0.7),
          b,
        );
      }
    const r = this.map.ramp;
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(r.x, r.y, r.z)
        .setRotation({
          x: Math.sin(r.angle / 2),
          y: 0,
          z: 0,
          w: Math.cos(r.angle / 2),
        }),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(r.w / 2, 0.15, r.d / 2),
      rb,
    );
    this.moving = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.map.obstacle.x,
        1.2,
        this.map.obstacle.z,
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(5, 0.35, 0.65).setRestitution(0.8),
      this.moving,
    );
    for (const p of this.players.values()) this.createBodies(p);
  }
  createBodies(p: Player) {
    const index = [...this.players.keys()].indexOf(p.id),
      x = ((index % 4) - 1.5) * 1.3,
      z = this.map.tee.z + Math.floor(index / 4) * 1.4;
    p.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0.84, z),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.48, 0.34).setCollisionGroups(0x00040005),
      p.body,
    );
    p.controller = this.world.createCharacterController(0.02);
    p.controller.enableAutostep(0.3, 0.2, false);
    p.controller.enableSnapToGround(0.25);
    p.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    p.controller.setMinSlopeSlideAngle(Math.PI / 3);
    p.controller.setApplyImpulsesToDynamicBodies(false);
    p.ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 0.34, z - 1.25)
        .setCcdEnabled(true)
        .setAngularDamping(0.8),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.18)
        .setMass(0.35)
        .setRestitution(this.rules.bounce)
        .setFriction(0.6)
        .setCollisionGroups(this.rules.collisions ? 0x00020003 : 0x00020001),
      p.ballBody,
    );
    Object.assign(p, {
      pos: copy(p.body.translation()),
      ball: copy(p.ballBody.translation()),
      checkpoint: -1,
      strokes: 0,
      finished: false,
      eliminated: false,
      lives: 3,
      cart: null,
      inventory: [],
      shield: 0,
      stun: 0,
      boost: 0,
      immune: 0,
      hits: 0,
      knock: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      input: { x: 0, z: 0, yaw: 0, charging: false },
      finishTime: Infinity,
      chargeStart: null,
      pending: null,
      actionEnd: 0,
      lastShot: -10,
      animation: "idle",
      actionStart: this.time,
      charge: 0,
      grounded: true,
      ready: "Ready to swing",
      diveReady: 0,
      clubReady: 0,
      lockStart: null,
      lockTarget: "",
      heldItem: null,
      aiTarget: 0,
      lastInputSeq: 0,
      knockVelocity: { x: 0, y: 0, z: 0 },
    });
    p.previousBall = copy(p.ball);
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
      aiTime: 0,
      connected: true,
      outfit: 0,
      hat: 0,
      ballSkin: 0,
      club: 0,
      emote: 0,
      totalStrokes: 0,
      totalFinishTime: 0,
      ...appearance,
    } as Player;
    this.players.set(id, p);
    this.createBodies(p);
    this.effect("join", p.pos, p.color, 2, `${p.name} joined`);
  }
  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.world.removeCharacterController(p.controller);
    this.world.removeRigidBody(p.body);
    this.world.removeRigidBody(p.ballBody);
    this.players.delete(id);
  }
  start() {
    if (!this.players.size) return;
    this.phase = "playing";
    this.holeStart = this.time;
    this.phaseStart = this.time;
    this.finishDeadline = Infinity;
    this.effect("announce", this.map.tee, "#ffdf68", 3, "LET’S PLAY");
  }
  input(id: string, input: Input) {
    const p = this.players.get(id);
    if (!p || ![input.x, input.z, input.yaw].every(Number.isFinite)) return;
    p.lastInputSeq = Number.isSafeInteger(input.seq)
      ? input.seq!
      : p.lastInputSeq;
    p.input = {
      x: clamp(input.x, -1, 1),
      z: clamp(input.z, -1, 1),
      yaw: input.yaw,
      charging: !!input.charging,
    };
    if (Math.hypot(input.x, input.z) > 0.05 || !input.charging)
      this.cancelCharge(p);
  }
  effect(
    kind: string,
    pos: Vec,
    color = "#ffdf68",
    duration = 0.7,
    text?: string,
    playerId?: string,
  ) {
    this.effects.push({
      id: ++this.serial,
      kind,
      pos: copy(pos),
      color,
      until: this.time + duration,
      text,
      playerId,
    });
  }
  notify(id: string, text: string) {
    this.events.push({ playerId: id, text });
  }
  animate(p: Player, name: string, duration = 0) {
    p.animation = name;
    p.actionStart = this.time;
    p.actionEnd = this.time + duration;
  }
  cancelCharge(p: Player) {
    p.chargeStart = null;
    p.charge = 0;
  }
  readiness(p: Player) {
    if (!p.grounded) return "Find solid ground";
    if (dist(p.pos, p.ball) > 1.8) return "Move closer to your ball";
    if (magnitude(p.ballBody.linvel()) > 0.65) return "Ball still rolling";
    if (p.stun > this.time || p.actionEnd > this.time) return "Recovering";
    return "Ready to swing";
  }
  hit(
    owner: string,
    p: Player,
    dir: Vec,
    strength = 10,
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
    p.stun = this.time + Math.min(1.5, stun);
    p.immune = p.stun + 1.25;
    p.knock = {
      x: dir.x * strength,
      y: Math.min(5, strength / 3),
      z: dir.z * strength,
    };
    p.pending = null;
    this.cancelCharge(p);
    this.animate(p, kind === "freeze" ? "freeze" : "hit", Math.min(1.5, stun));
    const a = this.players.get(owner);
    if (a) a.hits = Math.min(2, a.hits + 1);
    this.effect(kind, p.pos, p.color, 1, undefined, p.id);
    this.notify(p.id, "Shot interrupted");
    return true;
  }
  lineOfSight(a: Vec, b: Vec) {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      length = magnitude(d);
    if (!length) return true;
    return !this.world.castRay(
      new RAPIER.Ray(a, { x: d.x / length, y: d.y / length, z: d.z / length }),
      length,
      true,
      undefined,
      0x00080001,
    );
  }
  target(p: Player) {
    const dir = direction(p.input.yaw);
    return [...this.players.values()]
      .filter(
        (o) =>
          o.id !== p.id &&
          !o.finished &&
          !o.eliminated &&
          dist(o.pos, p.pos) <= 30 &&
          ((o.pos.x - p.pos.x) * dir.x + (o.pos.z - p.pos.z) * dir.z) /
            Math.max(0.01, dist(o.pos, p.pos)) >
            0.96 &&
          this.lineOfSight(p.pos, o.pos),
      )
      .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0];
  }
  action(id: string, a: Action) {
    const p = this.players.get(id);
    if (!p || this.phase !== "playing" || p.finished || p.eliminated) return;
    const dir = direction(p.input.yaw);
    if (a.type === "chat") {
      this.effect(
        "chat",
        p.pos,
        p.color,
        3,
        ["Nice shot!", "Fore!", "Good game!", "Oops…", "Catch me!", "Thanks!"][
          clamp(Math.floor(a.slot || 0), 0, 5)
        ],
        id,
      );
      return;
    }
    if (a.type === "cancel") {
      this.cancelCharge(p);
      p.lockStart = null;
      p.lockTarget = "";
      p.heldItem = null;
      return;
    }
    if (a.type === "reset" && this.mode === "practice") {
      this.reset(p, true, false);
      return;
    }
    if (a.type === "drop") {
      const slot = Math.floor(a.slot ?? 0);
      if (slot >= 0 && slot < p.inventory.length) p.inventory.splice(slot, 1);
      return;
    }
    if (p.stun > this.time || p.actionEnd > this.time) return;
    if (a.type === "charge") {
      p.ready = this.readiness(p);
      if (p.ready !== "Ready to swing") {
        this.notify(id, p.ready);
        return;
      }
      p.chargeStart = this.time;
      p.input.charging = true;
      return;
    }
    if (a.type === "swing") {
      if (p.chargeStart === null || !Number.isFinite(a.angle)) return;
      p.ready = this.readiness(p);
      if (p.ready !== "Ready to swing") {
        this.notify(id, p.ready);
        this.cancelCharge(p);
        return;
      }
      const power = clamp((this.time - p.chargeStart) / 1.2, 0.02, 1),
        angle = [8, 30, 55].reduce(
          (best, n) =>
            Math.abs(n - a.angle!) < Math.abs(best - a.angle!) ? n : best,
          8,
        );
      p.pending = {
        type: "swing",
        at: this.time + 0.25,
        yaw: p.input.yaw,
        power,
        angle,
        origin: copy(p.ball),
      };
      this.cancelCharge(p);
      this.animate(p, "swing", 1);
      return;
    }
    if (a.type === "dive" && this.time >= p.diveReady && p.grounded) {
      const n = Math.hypot(p.input.x, p.input.z),
        d = n > 0.1 ? { x: p.input.x / n, z: p.input.z / n } : dir;
      p.knock = { x: d.x * 12, y: 2, z: d.z * 12 };
      p.diveReady = this.time + 2;
      this.cancelCharge(p);
      this.animate(p, "dive", 0.6);
      return;
    }
    if (a.type === "club" && this.rules.combat && this.time >= p.clubReady) {
      p.clubReady = this.time + 1.5;
      p.pending = {
        type: "club",
        at: this.time + 0.18,
        yaw: p.input.yaw,
        power: 0,
        angle: 0,
        origin: copy(p.pos),
      };
      this.cancelCharge(p);
      this.animate(p, "club", 0.7);
      return;
    }
    if (a.type === "lock") {
      p.heldItem = "rocket";
      const t = this.target(p);
      if (t && p.lockTarget !== t.id) {
        p.lockTarget = t.id;
        p.lockStart = this.time;
      } else if (!t) {
        p.lockStart = null;
        p.lockTarget = "";
      }
      return;
    }
    if (a.type !== "item") return;
    const slot = Math.floor(a.slot ?? 0),
      item = p.inventory[slot];
    if (!item) return;
    switch (item.kind) {
      case "shield":
        p.shield = this.time + 6;
        this.animate(p, "throw", 0.4);
        break;
      case "coffee":
        p.heldItem = "coffee";
        p.boost = this.time + 8;
        this.animate(p, "drink", 0.8);
        break;
      case "boots":
        p.knock = { x: dir.x * 26, y: 9, z: dir.z * 26 };
        this.animate(p, "dive", 0.6);
        break;
      case "rocket": {
        p.heldItem = "rocket";
        const t = this.target(p);
        if (
          !t ||
          t.id !== p.lockTarget ||
          p.lockStart === null ||
          this.time - p.lockStart < 0.4
        ) {
          this.notify(id, "Hold Q to lock onto an opponent");
          return;
        }
        this.projectiles.push({
          id: ++this.serial,
          pos: copy(p.pos),
          target: t.id,
          owner: id,
          expires: this.time + 5,
        });
        this.animate(p, "throw", 0.6);
        p.lockStart = null;
        p.lockTarget = "";
        break;
      }
      case "mine":
        p.heldItem = "mine";
        if (this.mines.filter((m) => m.owner === id).length >= 2) {
          this.notify(id, "Two mines already deployed");
          return;
        }
        this.mines.push({
          id: ++this.serial,
          pos: { x: p.pos.x, y: 0.15, z: p.pos.z },
          owner: id,
          armed: this.time + 1,
        });
        this.animate(p, "address", 0.5);
        break;
      case "freeze": {
        const at = { x: p.pos.x + dir.x * 4, y: 0.2, z: p.pos.z + dir.z * 4 };
        p.heldItem = "freeze";
        this.bombs.push({ owner: id, pos: at, at: this.time + 0.45 });
        this.effect("freezeMarker", at, "#9aeeff", 0.45);
        this.animate(p, "throw", 0.6);
        break;
      }
      default:
        return;
    }
    if (--item.ammo <= 0) p.inventory.splice(slot, 1);
    this.effect("item", p.pos, p.color, 0.5, itemById(item.kind).name, id);
  }
  reset(p: Player, ball: boolean, penalty = true) {
    const cp =
      p.checkpoint >= 0 ? this.map.checkpoints[p.checkpoint] : this.map.tee;
    if (ball) {
      p.ballBody.setTranslation({ x: cp.x, y: cp.y - 1 + 0.4, z: cp.z }, true);
      p.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      p.ball = copy(p.ballBody.translation());
      p.previousBall = copy(p.ball);
      if (penalty) p.strokes++;
      p.aiTarget = Math.max(
        0,
        this.map.route.findIndex((v) => v.z < cp.z - 3),
      );
    } else {
      p.body.setTranslation(
        { x: cp.x, y: cp.y - 1 + 0.85, z: cp.z + 1.2 },
        true,
      );
      p.velocity = { x: 0, y: 0, z: 0 };
      p.knock = { x: 0, y: 0, z: 0 };
      p.immune = this.time + 1.5;
      this.animate(p, "hit", 0.5);
    }
    this.cancelCharge(p);
    p.pending = null;
    this.effect("respawn", cp, p.color, 1);
    this.notify(
      p.id,
      ball
        ? penalty
          ? "Water / fall · +1 stroke"
          : "Ball reset"
        : "Back at checkpoint",
    );
  }
  bot(p: Player) {
    if (
      p.finished ||
      p.eliminated ||
      p.stun > this.time ||
      p.actionEnd > this.time
    )
      return;
    const near = dist(p.pos, p.ball) < 1.6;
    let destination = p.ball;
    if (
      !near &&
      p.inventory.length < 2 &&
      magnitude(p.ballBody.linvel()) > 0.8
    ) {
      const crate = this.crates
        .filter((c) => c.next < this.time && dist(c.pos, p.pos) < 7)
        .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0];
      if (crate) destination = crate.pos;
    }
    if (
      !near &&
      this.course.id === "bridge" &&
      p.pos.z > -73 &&
      p.pos.z < -13 &&
      p.pos.x < 7 &&
      p.ball.z < p.pos.z - 8
    )
      destination = { x: 11, y: 0, z: p.pos.z - 5 };
    const yaw = Math.atan2(destination.x - p.pos.x, -(destination.z - p.pos.z));
    p.input = {
      x: near ? 0 : Math.sin(yaw),
      z: near ? 0 : -Math.cos(yaw),
      yaw,
      charging: near,
    };
    if (near && this.readiness(p) === "Ready to swing") {
      while (p.aiTarget < this.map.route.length - 1) {
        const target = this.map.route[p.aiTarget],
          previous = p.aiTarget ? this.map.route[p.aiTarget - 1] : this.map.tee,
          dx = target.x - previous.x,
          dz = target.z - previous.z,
          along =
            ((p.ball.x - previous.x) * dx + (p.ball.z - previous.z) * dz) /
            (dx * dx + dz * dz || 1),
          cross =
            Math.abs(
              (p.ball.x - previous.x) * dz - (p.ball.z - previous.z) * dx,
            ) / Math.max(1, Math.hypot(dx, dz));
        if (dist(p.ball, target) < 3 || (along >= 1 && cross < 4)) p.aiTarget++;
        else break;
      }
      const next = this.map.route[p.aiTarget] || this.map.hole,
        d = dist(next, p.ball);
      p.input.yaw = Math.atan2(next.x - p.ball.x, -(next.z - p.ball.z));
      const elevated = next.y > p.ball.y + 0.1,
        angle = elevated ? 55 : d < 15 ? 8 : 30,
        power =
          angle === 8
            ? clamp((Math.sqrt(d * 2.6) - 1) / 16, 0.03, 1)
            : clamp(
                ((elevated
                  ? Math.sqrt(
                      (9.81 * (d * 0.9) ** 2) /
                        (2 *
                          Math.cos((55 * Math.PI) / 180) ** 2 *
                          Math.max(
                            0.2,
                            d * 0.9 * Math.tan((55 * Math.PI) / 180) -
                              (next.y + 0.18 - p.ball.y),
                          )),
                    )
                  : (-0.7 + Math.sqrt(0.49 + 0.48 * d)) / 0.24) -
                  4) /
                  28,
                0.05,
                1,
              );
      if (p.chargeStart === null) this.action(p.id, { type: "charge" });
      else if (this.time - p.chargeStart >= power * 1.2)
        this.action(p.id, { type: "swing", angle });
    } else if (!near) this.cancelCharge(p);
    if (!near && this.rules.combat) {
      const rival = [...this.players.values()]
        .filter((o) => o.id !== p.id && !o.finished && !o.eliminated)
        .sort(
          (a, b) =>
            b.score - a.score || dist(a.pos, p.pos) - dist(b.pos, p.pos),
        )[0];
      if (
        rival &&
        p.inventory[0]?.kind === "rocket" &&
        dist(rival.pos, p.pos) < 30
      ) {
        p.input.yaw = Math.atan2(
          rival.pos.x - p.pos.x,
          -(rival.pos.z - p.pos.z),
        );
        this.action(p.id, { type: "lock" });
        if (p.lockStart !== null && this.time - p.lockStart > 0.45)
          this.action(p.id, { type: "item", slot: 0 });
      } else if (rival && dist(rival.pos, p.pos) < 2) {
        p.input.yaw = Math.atan2(
          rival.pos.x - p.pos.x,
          -(rival.pos.z - p.pos.z),
        );
        this.action(p.id, { type: "club" });
      }
    }
    if (this.time > p.aiTime) {
      p.aiTime = this.time + 3;
      if (!near && p.inventory.length && p.inventory[0].kind !== "rocket")
        this.action(p.id, { type: "item", slot: 0 });
    }
  }
  explosion(owner: string, pos: Vec) {
    this.effect("explosion", pos, "#ffba54", 0.6);
    for (const p of this.players.values()) {
      const d = dist(p.ball, pos);
      if (!p.finished && d < 4)
        p.ballBody.applyImpulse(
          { x: (p.ball.x - pos.x) * 0.7, y: 1, z: (p.ball.z - pos.z) * 0.7 },
          true,
        );
    }
  }
  tick() {
    this.time += 1 / 60;
    this.effects = this.effects.filter((e) => e.until > this.time);
    if (this.phase === "results") {
      if (this.time - this.phaseStart >= 8) {
        if (this.hole < this.rules.holes) {
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
    const now = this.time;
    this.moving.setNextKinematicRotation({
      x: 0,
      y: Math.sin((now * 0.7) / 2),
      z: 0,
      w: Math.cos((now * 0.7) / 2),
    });
    for (const p of this.players.values()) {
      if (p.finished || p.eliminated) continue;
      const ballVelocity = p.ballBody.linvel(),
        ballSpeed = magnitude(ballVelocity);
      if (ballSpeed > 8)
        for (const other of this.players.values())
          if (
            dist(p.ball, other.pos) < 0.55 &&
            Math.abs(p.ball.y - (other.pos.y - 0.4)) < 0.8
          )
            this.hit(
              p.id,
              other,
              {
                x: ballVelocity.x / ballSpeed,
                y: 0,
                z: ballVelocity.z / ballSpeed,
              },
              3,
              0.35,
            );
      if (p.bot) this.bot(p);
      p.yaw = p.input.yaw;
      p.ready = this.readiness(p);
      p.charge =
        p.chargeStart === null ? 0 : clamp((now - p.chargeStart) / 1.2, 0, 1);
      if (p.pending && p.pending.at <= now) {
        const a = p.pending;
        p.pending = null;
        const dir = direction(a.yaw);
        if (a.type === "swing") {
          if (
            dist(p.ball, a.origin) > 0.2 ||
            dist(p.pos, p.ball) > 1.8 ||
            magnitude(p.ballBody.linvel()) > 0.8
          ) {
            this.notify(p.id, "Shot interrupted");
            this.animate(p, "idle");
          } else {
            p.strokes++;
            p.lastShot = now;
            const v = shotSpeed(a.power, a.angle),
              rad = (a.angle * Math.PI) / 180;
            p.ballBody.setLinvel(
              {
                x: dir.x * v * Math.cos(rad),
                y: v * Math.sin(rad),
                z: dir.z * v * Math.cos(rad),
              },
              true,
            );
            this.effect("swing", p.ball, p.color, 0.5, undefined, p.id);
          }
        } else {
          for (const o of this.players.values()) {
            const d = dist(p.pos, o.pos),
              dot =
                ((o.pos.x - p.pos.x) * dir.x + (o.pos.z - p.pos.z) * dir.z) /
                Math.max(0.01, d);
            if (d < 2 && dot > 0.5) this.hit(p.id, o, dir, 8, 0.8, "hit");
          }
          this.effect("club", p.pos, p.color, 0.4);
        }
      }
      const locked = p.stun > now || p.actionEnd > now || p.input.charging,
        speed = 6 * this.rules.speed * (p.boost > now ? 1.35 : 1);
      const dir = direction(p.yaw),
        stance =
          p.input.charging &&
          p.actionEnd <= now &&
          dist(p.pos, p.ball) < 1.8 &&
          magnitude(p.ballBody.linvel()) < 0.65
            ? {
                x: p.ball.x - dir.x * 0.5 - Math.cos(p.yaw) * 0.18,
                y: p.pos.y,
                z: p.ball.z - dir.z * 0.5 - Math.sin(p.yaw) * 0.18,
              }
            : undefined;
      moveGolfer(
        p.body,
        p.controller,
        p,
        p.input,
        locked,
        speed,
        1 / 60,
        stance,
      );
      p.knockVelocity = copy(p.knock);
      if (p.actionEnd <= now) {
        if (p.lockStart === null) p.heldItem = null;
        const name =
          p.lockStart !== null
            ? "rocketAim"
            : p.chargeStart !== null
              ? "backswing"
              : p.input.charging && p.ready === "Ready to swing"
                ? "address"
                : Math.hypot(p.velocity.x, p.velocity.z) > 0.4
                  ? "run"
                  : "idle";
        if (p.animation !== name) this.animate(p, name);
      }
      p.previousBall = copy(p.ball);
      const bv = p.ballBody.linvel(),
        b = p.ballBody.translation();
      p.ballBody.resetForces(true);
      const ground = this.map.platforms
        .filter(
          (p) => Math.abs(b.x - p.x) < p.w / 2 && Math.abs(b.z - p.z) < p.d / 2,
        )
        .reduce((h, p) => Math.max(h, p.y || 0), 0);
      if (b.y < ground + 0.65) {
        const sand = this.map.sand.some(
            (s) =>
              Math.abs(b.x - s.x) < s.w / 2 && Math.abs(b.z - s.z) < s.d / 2,
          ),
          damp = sand ? 0.9 : 0.982;
        p.ballBody.setLinvel({ x: bv.x * damp, y: bv.y, z: bv.z * damp }, true);
      } else if (this.rules.wind)
        p.ballBody.addForce(
          {
            x: Math.sin(now * 0.08) * 0.06,
            y: 0,
            z: Math.cos(now * 0.1) * 0.02,
          },
          true,
        );
    }
    this.world.step();
    for (const p of this.players.values()) {
      p.pos = copy(p.body.translation());
      p.ball = copy(p.ballBody.translation());
      if (p.finished || p.eliminated) continue;
      for (let i = 0; i < this.map.checkpoints.length; i++)
        if (
          i > p.checkpoint &&
          p.ball.y < 2 &&
          dist(p.ball, this.map.checkpoints[i]) < 2
        ) {
          p.checkpoint = i;
          this.effect("checkpoint", this.map.checkpoints[i], p.color);
          this.notify(p.id, "Ball checkpoint saved");
        }
      const water = (v: Vec) =>
        v.y < 0.7 &&
        this.map.water.some((w) => dist(v, { x: w.x, y: 0, z: w.z }) < w.r);
      if (p.ball.y < -5 || water(p.ball)) this.reset(p, true);
      if (p.pos.y < -5 || water({ x: p.pos.x, y: p.pos.y - 0.83, z: p.pos.z }))
        this.reset(p, false);
      for (const c of this.crates)
        if (
          c.next < now &&
          p.inventory.length < 3 &&
          dist(p.pos, c.pos) < 1.5 &&
          this.rules.items.length
        ) {
          const choices = ITEMS.filter((i) => this.rules.items.includes(i.id)),
            weights: Record<string, number> = {
              rocket: 20,
              mine: 15,
              freeze: 15,
              shield: 20,
              boots: 15,
              coffee: 15,
            };
          let r =
            this.random() *
            choices.reduce((s, i) => s + (weights[i.id] || 0), 0);
          const item =
            choices.find((i) => (r -= weights[i.id] || 0) < 0) || choices[0];
          p.inventory.push({
            kind: item.id,
            ammo: item.id === "mine" ? 2 : item.ammo,
          });
          c.next = now + 12;
          this.effect("pickup", c.pos, p.color);
          this.notify(p.id, `${item.name} picked up`);
        }
      const a = p.previousBall,
        b = p.ball,
        h = this.map.hole,
        dx = b.x - a.x,
        dz = b.z - a.z,
        t = clamp(
          ((h.x - a.x) * dx + (h.z - a.z) * dz) / (dx * dx + dz * dz || 1),
          0,
          1,
        ),
        near = { x: a.x + dx * t, y: b.y, z: a.z + dz * t };
      if (
        dist(near, h) < 0.58 &&
        b.y < h.y + 0.55 &&
        Math.hypot(p.ballBody.linvel().x, p.ballBody.linvel().z) < 5
      ) {
        p.finished = true;
        p.finishTime = now - this.holeStart;
        p.totalFinishTime += p.finishTime;
        p.totalStrokes += p.strokes;
        this.animate(p, "celebrate");
        p.body.setEnabled(false);
        p.ballBody.setEnabled(false);
        const place = [...this.players.values()].filter(
            (o) => o.finished,
          ).length,
          points =
            (this.rules.finishPoints[place - 1] || 0) +
            clamp(this.course.par + 1 - p.strokes, 0, 3) +
            p.hits;
        p.score += points;
        if (this.mode !== "practice")
          this.finishDeadline = Math.min(
            this.finishDeadline,
            now + 25,
            this.holeStart + this.rules.timeLimit,
          );
        this.effect("finish", h, p.color, 3, `${p.name} · #${place}`, p.id);
        this.notify(p.id, `In the cup! +${points} points`);
      }
    }
    this.projectiles = this.projectiles.filter((r) => {
      const t = this.players.get(r.target);
      if (!t || t.finished || t.eliminated || r.expires < now) return false;
      const d = Math.hypot(
        t.pos.x - r.pos.x,
        t.pos.y - r.pos.y,
        t.pos.z - r.pos.z,
      );
      if (d < 1.2) {
        this.hit(
          r.owner,
          t,
          direction(Math.atan2(t.pos.x - r.pos.x, -(t.pos.z - r.pos.z))),
          14,
          1.2,
        );
        this.explosion(r.owner, r.pos);
        return false;
      }
      const next = {
        x: r.pos.x + ((t.pos.x - r.pos.x) / d) * 0.35,
        y: r.pos.y + ((t.pos.y - r.pos.y) / d) * 0.35,
        z: r.pos.z + ((t.pos.z - r.pos.z) / d) * 0.35,
      };
      if (!this.lineOfSight(r.pos, next)) {
        this.explosion(r.owner, r.pos);
        return false;
      }
      r.pos = next;
      return true;
    });
    this.bombs = this.bombs.filter((b) => {
      if (b.at > now) return true;
      for (const p of this.players.values())
        if (dist(p.pos, b.pos) < 4)
          this.hit(b.owner, p, { x: 0, y: 0, z: 0 }, 0, 1, "freeze");
      this.effect("freeze", b.pos, "#9aeeff", 1);
      return false;
    });
    this.mines = this.mines.filter((m) => {
      const p = [...this.players.values()].find(
        (p) =>
          p.id !== m.owner &&
          !p.finished &&
          !p.eliminated &&
          dist(p.pos, m.pos) < 1.3 &&
          m.armed < now,
      );
      if (!p) return true;
      this.hit(m.owner, p, { x: 0, y: 0, z: 0 }, 0, 1.2);
      this.explosion(m.owner, m.pos);
      return false;
    });
    if (
      [...this.players.values()].every((p) => p.finished || p.eliminated) ||
      (this.mode !== "practice" &&
        (now >= this.finishDeadline ||
          now - this.holeStart >= this.rules.timeLimit))
    ) {
      this.phase = "results";
      this.phaseStart = now;
      for (const p of this.players.values())
        if (!p.finished) {
          p.totalStrokes += p.strokes;
          p.totalFinishTime += this.rules.timeLimit;
        }
      const sorted = [...this.players.values()].sort(
        (a, b) =>
          b.score - a.score ||
          a.totalStrokes - b.totalStrokes ||
          a.totalFinishTime - b.totalFinishTime,
      );
      this.winner = sorted[0]?.id || null;
    }
  }
  snapshot(): Snapshot {
    return {
      protocol: PROTOCOL,
      mode: this.mode,
      courseId: this.course.id,
      hole: this.hole,
      holes: this.rules.holes,
      phase: this.phase,
      time: this.time,
      phaseStart: this.phaseStart,
      remaining: Math.max(
        0,
        Math.min(this.holeStart + this.rules.timeLimit, this.finishDeadline) -
          this.time,
      ),
      finishWindow: Number.isFinite(this.finishDeadline),
      players: [...this.players.values()].map(
        ({
          body,
          ballBody,
          controller,
          input,
          knock,
          chargeStart,
          pending,
          actionEnd,
          lastShot,
          hits,
          previousBall,
          aiTime,
          aiTarget,
          lockStart,
          lockTarget,
          ...p
        }) => ({
          ...p,
          pos: copy(p.pos),
          ball: copy(p.ball),
          velocity: copy(p.velocity),
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
      carts: [],
      zone: { x: 0, z: 0, r: 999 },
      wind: {
        x: Math.sin(this.time * 0.08) * 2,
        y: 0,
        z: Math.cos(this.time * 0.1),
      },
      winner: this.winner,
      rules: this.rules,
      obstacle: this.time,
    };
  }
}

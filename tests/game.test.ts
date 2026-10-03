import test from "node:test";
import assert from "node:assert/strict";
import { Game, initPhysics, PROTOCOL } from "../packages/game/simulation";
import { COURSES, rulesFor } from "../packages/game/content";
await initPhysics();
function game() {
  const g = new Game("party");
  g.addPlayer("a", "Alice");
  g.addPlayer("b", "Bob");
  g.start();
  for (let i = 0; i < 30; i++) g.tick();
  return g;
}
function advance(g: Game, frames: number) {
  for (let i = 0; i < frames; i++) g.tick();
}
function charge(g: Game, frames = 72) {
  g.input("a", { x: 0, z: 0, yaw: 0, charging: true });
  g.action("a", { type: "charge" });
  advance(g, frames);
}
test("three authored courses keep eight grounded golfers stable", () => {
  assert.equal(COURSES.length, 3);
  for (const course of COURSES) {
    const g = new Game("party");
    g.course = course;
    g.buildWorld();
    for (let i = 0; i < 8; i++) g.addPlayer(String(i), "Golfer");
    g.start();
    advance(g, 300);
    for (const p of g.players.values()) {
      assert.ok(p.grounded);
      assert.ok(p.pos.y > 0.8 && p.pos.y < 0.9);
      assert.ok(p.ball.y > 0.17);
      assert.equal(p.strokes, 0);
    }
    assert.equal(g.snapshot().protocol, PROTOCOL);
    g.world.free();
  }
});
test("server charge controls power; stroke and launch happen at club contact", () => {
  const g = game(),
    p = g.players.get("a")!;
  charge(g, 36);
  g.action("a", { type: "swing", power: 999, angle: 30 });
  assert.equal(p.strokes, 0);
  assert.equal(p.animation, "swing");
  advance(g, 14);
  assert.equal(p.strokes, 0);
  advance(g, 2);
  assert.equal(p.strokes, 1);
  assert.ok(p.ballBody.linvel().z < -10 && p.ballBody.linvel().z > -25);
  g.world.free();
});
test("movement cancels charging; an attack cancels a committed swing before contact", () => {
  const g = game(),
    p = g.players.get("a")!;
  charge(g, 30);
  g.input("a", { x: 1, z: 0, yaw: 0, charging: false });
  g.action("a", { type: "swing", angle: 30 });
  advance(g, 20);
  assert.equal(p.strokes, 0);
  p.body.setTranslation({ x: p.ball.x, y: 0.84, z: p.ball.z + 1.2 }, true);
  p.pos = { ...p.body.translation() };
  p.velocity = { x: 0, y: 0, z: 0 };
  charge(g, 30);
  g.action("a", { type: "swing", angle: 30 });
  g.hit("b", p, { x: 1, y: 0, z: 0 });
  advance(g, 20);
  assert.equal(p.strokes, 0);
  assert.ok(g.events.some((e) => e.text === "Shot interrupted"));
  g.world.free();
});
test("avatars cannot push balls; golf balls transfer momentum", () => {
  const g = game(),
    a = g.players.get("a")!,
    b = g.players.get("b")!;
  const origin = { ...a.ball };
  g.input("a", { x: 0, z: -1, yaw: 0, charging: false });
  advance(g, 20);
  assert.ok(Math.hypot(a.ball.x - origin.x, a.ball.z - origin.z) < 0.05);
  a.ballBody.setTranslation({ x: -2, y: 0.4, z: 0 }, true);
  b.ballBody.setTranslation({ x: 0, y: 0.4, z: 0 }, true);
  a.ballBody.setLinvel({ x: 14, y: 0, z: 0 }, true);
  advance(g, 20);
  assert.ok(b.ballBody.linvel().x > 1);
  g.world.free();
});
test("club has a forward arc and windup; shields and recovery immunity prevent chain stuns", () => {
  const g = game(),
    a = g.players.get("a")!,
    b = g.players.get("b")!;
  a.pos = { x: 0, y: 0.84, z: 0 };
  a.body.setTranslation(a.pos, true);
  b.pos = { x: 0, y: 0.84, z: 1.5 };
  b.body.setTranslation(b.pos, true);
  g.action("a", { type: "club" });
  assert.equal(b.stun, 0);
  advance(g, 20);
  assert.equal(b.stun, 0);
  advance(g, 100);
  b.pos = { x: 0, y: 0.84, z: -1.5 };
  b.body.setTranslation(b.pos, true);
  g.action("a", { type: "club" });
  advance(g, 14);
  assert.ok(b.stun > g.time);
  assert.equal(g.hit("a", b, { x: 1, y: 0, z: 0 }), false);
  assert.equal(a.score, 0);
  g.time = b.immune + 0.1;
  b.inventory = [{ kind: "shield", ammo: 1 }];
  g.action("b", { type: "item", slot: 0 });
  assert.equal(g.hit("a", b, { x: 1, y: 0, z: 0 }), false);
  g.world.free();
});
test("only the ball activates checkpoints; water costs a stroke; avatar reset leaves ball alone", () => {
  const g = game(),
    p = g.players.get("a")!,
    cp = g.map.checkpoints[0];
  p.body.setTranslation({ x: cp.x, y: 0.84, z: cp.z }, true);
  advance(g, 5);
  assert.equal(p.checkpoint, -1);
  p.ballBody.setTranslation({ x: cp.x, y: 0.4, z: cp.z }, true);
  advance(g, 5);
  assert.equal(p.checkpoint, 0);
  const w = g.map.water[0];
  p.ballBody.setTranslation({ x: w.x, y: 0.4, z: w.z }, true);
  g.tick();
  assert.equal(p.strokes, 1);
  assert.ok(Math.abs(p.ballBody.translation().z - cp.z) < 0.1);
  const ball = { ...p.ballBody.translation() };
  g.reset(p, false);
  assert.deepEqual({ ...p.ballBody.translation() }, ball);
  g.world.free();
});
test("six-item pool, two-mine cap, finite inventory and protection durations", () => {
  assert.deepEqual(
    new Set(rulesFor("party").items),
    new Set(["rocket", "mine", "freeze", "shield", "boots", "coffee"]),
  );
  const g = game(),
    p = g.players.get("a")!;
  p.inventory = [{ kind: "mine", ammo: 4 }];
  for (let i = 0; i < 4; i++) {
    g.action("a", { type: "item", slot: 0 });
    advance(g, 40);
  }
  assert.equal(g.mines.length, 2);
  assert.equal(p.inventory[0].ammo, 2);
  p.inventory = [{ kind: "coffee", ammo: 1 }];
  g.action("a", { type: "item", slot: 0 });
  assert.equal(p.boost, g.time + 8);
  g.world.free();
});
test("first finish starts 25-second window; DNF receives no combat points; transitions rebuild worlds", () => {
  const g = game(),
    a = g.players.get("a")!,
    b = g.players.get("b")!;
  g.hit("b", a, { x: 1, y: 0, z: 0 });
  a.ballBody.setTranslation(
    { x: g.map.hole.x, y: 0.35, z: g.map.hole.z },
    true,
  );
  a.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  g.tick();
  assert.ok(a.finished);
  assert.ok(g.finishDeadline - g.time <= 25);
  assert.equal(a.score, 23);
  assert.equal(b.score, 0);
  advance(g, 1501);
  assert.equal(g.phase, "results");
  advance(g, 481);
  assert.equal(g.hole, 2);
  assert.equal(g.course.id, "bridge");
  assert.equal(a.finished, false);
  assert.equal(a.score, 23);
  g.world.free();
});
test("fast balls lip out; low rolling balls sink", () => {
  const g = game(),
    p = g.players.get("a")!;
  p.ballBody.setTranslation(
    { x: g.map.hole.x, y: 0.35, z: g.map.hole.z + 1 },
    true,
  );
  p.ballBody.setLinvel({ x: 0, y: 0, z: -12 }, true);
  advance(g, 8);
  assert.equal(p.finished, false);
  p.ballBody.setTranslation(
    { x: g.map.hole.x, y: 0.35, z: g.map.hole.z + 0.6 },
    true,
  );
  p.ballBody.setLinvel({ x: 0, y: 0, z: -1.5 }, true);
  advance(g, 12);
  assert.equal(p.finished, true);
  g.world.free();
});

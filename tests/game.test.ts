import test from "node:test";
import assert from "node:assert/strict";
import { Game, initPhysics } from "../packages/game/simulation";
import {
  COURSES,
  ITEMS,
  COSMETICS,
  rulesFor,
  ratingChanges,
} from "../packages/game/content";
await initPhysics();
function game(mode: any = "party") {
  const g = new Game(mode);
  g.addPlayer("a", "Alice");
  g.addPlayer("b", "Bob");
  g.start();
  return g;
}
test("all twelve courses have stable playable physics and content", () => {
  assert.equal(COURSES.length, 12);
  assert.equal(COSMETICS.length, 240);
  assert.equal(new Set(COSMETICS.map((c) => c.id)).size, 240);
  for (const c of COURSES) {
    const g = game();
    g.course = c;
    g.buildWorld();
    for (let t = 0; t < 300; t++) g.tick();
    for (const p of g.players.values()) {
      assert.ok(Number.isFinite(p.pos.x));
      assert.ok(p.pos.y > 0);
      assert.ok(p.ball.y > 0);
    }
    g.world.free();
  }
});
test("a swing is accepted only near a settled ball with finite bounded input", () => {
  const g = game(),
    p = g.players.get("a")!;
  for (let i = 0; i < 60; i++) g.tick();
  g.action("a", { type: "swing", power: 1, angle: 25 });
  assert.equal(p.strokes, 1);
  assert.ok(p.ballBody.linvel().z < -20);
  g.action("a", { type: "swing", power: Infinity, angle: 25 });
  assert.equal(p.strokes, 1);
  p.body.setTranslation({ x: 20, y: 1, z: 0 }, true);
  p.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  g.tick();
  g.action("a", { type: "swing", power: 0.8, angle: 25 });
  assert.equal(p.strokes, 1);
  g.world.free();
});
test("ball collisions transfer momentum instead of passing through opponents", () => {
  const g = game(),
    a = g.players.get("a")!,
    b = g.players.get("b")!;
  a.ballBody.setTranslation({ x: -2, y: 0.4, z: 0 }, true);
  b.ballBody.setTranslation({ x: 0, y: 0.4, z: 0 }, true);
  a.ballBody.setLinvel({ x: 14, y: 0, z: 0 }, true);
  for (let i = 0; i < 20; i++) g.tick();
  assert.ok(b.ballBody.linvel().x > 1);
  g.world.free();
});
test("shield blocks attacks; immunity stops repeated stun farming", () => {
  const g = game(),
    a = g.players.get("a")!,
    b = g.players.get("b")!;
  b.inventory = [{ kind: "shield", ammo: 1 }];
  g.action("b", { type: "item", slot: 0 });
  assert.equal(g.hit("a", b, { x: 1, y: 0, z: 0 }), false);
  g.time = 7;
  assert.equal(g.hit("a", b, { x: 1, y: 0, z: 0 }), true);
  assert.equal(g.hit("a", b, { x: 1, y: 0, z: 0 }), false);
  assert.equal(a.score, 2);
  g.world.free();
});
test("water resets the ball to its checkpoint without losing a Royale life", () => {
  const g = game("royale"),
    p = g.players.get("a")!;
  p.checkpoint = 1;
  const w = g.map.water[0];
  p.ballBody.setTranslation({ x: w.x, y: 0.4, z: w.z }, true);
  g.tick();
  assert.equal(p.lives, 3);
  assert.ok(
    Math.abs(p.ballBody.translation().z - (g.map.checkpoints[1].z - 1)) < 1,
  );
  g.reset(p, false);
  assert.equal(p.lives, 2);
  g.reset(p, false);
  g.reset(p, false);
  assert.equal(p.eliminated, true);
  g.world.free();
});
test("all eleven items consume bounded ammunition and mines have a hard cap", () => {
  const g = game(),
    p = g.players.get("a")!,
    b = g.players.get("b")!;
  b.pos = { x: p.pos.x, y: 1, z: p.pos.z - 8 };
  for (const item of ITEMS) {
    p.inventory = [{ kind: item.id, ammo: item.ammo }];
    g.action("a", { type: "item", slot: 0, target: { x: 0, y: 0, z: -20 } });
    if (item.id !== "mine")
      assert.ok(p.inventory.length === 0 || p.inventory[0].ammo < item.ammo);
  }
  p.inventory = [{ kind: "mine", ammo: 8 }];
  for (let i = 0; i < 8; i++) g.action("a", { type: "item", slot: 0 });
  assert.equal(g.mines.length, 3);
  g.world.free();
});
test("ranked removes chaos items and malformed custom physics is clamped", () => {
  const r = rulesFor("ranked");
  for (const id of ["laser", "cart", "rifle", "horn"])
    assert.ok(!r.items.includes(id as any));
  assert.equal(r.bots, 0);
  const c = rulesFor("custom", {
    gravity: -100,
    timeLimit: 9999,
    bots: 100,
    courseIds: ["not-a-course"],
  });
  assert.equal(c.gravity, 0.5);
  assert.equal(c.timeLimit, 600);
  assert.equal(c.bots, 7);
  assert.ok(c.courseIds.length);
});
test("Elo rewards the higher finishing player and balances equal ratings", () => {
  const changes = ratingChanges([
    { id: "a", rating: 800, score: 50 },
    { id: "b", rating: 800, score: 30 },
  ]);
  assert.equal(changes[0].change, 16);
  assert.equal(changes[1].change, -16);
});

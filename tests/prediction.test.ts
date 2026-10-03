import test from "node:test";
import assert from "node:assert/strict";
import { Game, initPhysics } from "../packages/game/simulation";
import { MovementPrediction } from "../apps/web/prediction";
await initPhysics();
test("delayed authority acknowledgements replay pending movement without drifting", () => {
  const server = new Game("practice");
  server.addPlayer("a", "Alice");
  server.start();
  for (let i = 0; i < 30; i++) server.tick();
  const prediction = new MovementPrediction();
  prediction.reconcile(server.snapshot(), "a");
  const queue = [];
  for (let seq = 1; seq <= 60; seq++) {
    const input = { x: seq <= 30 ? 1 : 0, z: 0, yaw: 0, charging: false, seq };
    prediction.push(input);
    queue.push(input);
    if (queue.length > 3) {
      server.input("a", queue.shift()!);
      server.tick();
      server.tick();
      prediction.reconcile(server.snapshot(), "a");
    }
  }
  for (const input of queue) {
    server.input("a", input);
    server.tick();
    server.tick();
    prediction.reconcile(server.snapshot(), "a");
  }
  const at = prediction.position!,
    authoritative = server.players.get("a")!.pos;
  assert.ok(Math.hypot(at.x - authoritative.x, at.z - authoritative.z) < 0.01);
  prediction.dispose();
  server.world.free();
});

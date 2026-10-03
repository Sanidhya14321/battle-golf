import test from "node:test";
import assert from "node:assert/strict";
import { Game, initPhysics } from "../packages/game/simulation";
import { COURSES } from "../packages/game/content";
await initPhysics();
test("a bot finishes each authored route, including bridge corners and the raised green, using legal shots", () => {
  for (const course of COURSES) {
    const g = new Game("practice");
    g.course = course;
    g.buildWorld();
    g.addPlayer("bot", "Birdie", true);
    g.start();
    let contacts = 0;
    for (let i = 0; i < 10800 && g.phase === "playing"; i++) {
      g.tick();
      for (const e of g.effects)
        if (e.kind === "swing" && e.until - g.time > 0.48) contacts++;
    }
    const p = g.players.get("bot")!;
    assert.ok(
      p.finished,
      `${course.name}: ball ${JSON.stringify(p.ball)} golfer ${JSON.stringify(p.pos)}`,
    );
    assert.ok(p.strokes >= 1);
    assert.ok(contacts >= p.strokes);
    assert.ok(p.finishTime < 180);
    g.world.free();
  }
});

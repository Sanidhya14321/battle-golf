import {
  Game,
  type Input,
  type Snapshot,
  type PlayerView,
} from "../../packages/game/simulation";
import { COURSES } from "../../packages/game/content";
import { moveGolfer } from "../../packages/game/movement";
export class MovementPrediction {
  private game: Game | null = null;
  private pending: Input[] = [];
  private id = "";
  private view: PlayerView | null = null;
  private time = 0;
  get position() {
    const p = this.game?.players.get(this.id);
    return p?.body.translation();
  }
  reconcile(s: Snapshot, id: string) {
    const own = s.players.find((p) => p.id === id);
    if (!own) return;
    if (!this.game || this.game.course.id !== s.courseId) {
      this.game?.world.free();
      this.game = new Game("practice");
      this.game.course = COURSES.find((c) => c.id === s.courseId)!;
      this.game.buildWorld();
      this.pending = [];
    }
    this.id = id;
    this.view = own;
    this.time = s.time;
    for (const p of s.players) {
      if (!this.game.players.has(p.id))
        this.game.addPlayer(p.id, p.name, false);
      const local = this.game.players.get(p.id)!;
      local.body.setEnabled(!p.finished && !p.eliminated);
      local.body.setTranslation(p.pos, true);
      local.ballBody.setTranslation(p.ball, true);
      local.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (p.id === id) {
        local.velocity = { ...p.velocity };
        local.knock = { ...p.knockVelocity };
        local.grounded = p.grounded;
      }
    }
    for (const id of this.game.players.keys())
      if (!s.players.some((p) => p.id === id)) this.game.removePlayer(id);
    this.pending = this.pending
      .filter((i) => (i.seq || 0) > own.lastInputSeq)
      .slice(-120);
    for (const input of this.pending) this.step(input);
  }
  push(input: Input) {
    this.pending.push(input);
    if (this.pending.length > 120) this.pending.shift();
    this.step(input);
  }
  private step(input: Input) {
    const p = this.game?.players.get(this.id),
      view = this.view;
    if (!p || !view || view.finished) return;
    const durations: Record<string, number> = {
      swing: 1,
      club: 0.7,
      dive: 0.6,
      throw: 0.6,
      drink: 0.8,
      hit: 1.2,
    };
    const locked =
        input.charging ||
        view.stun > this.time ||
        this.time - view.actionStart < (durations[view.animation] || 0),
      speed = 6 * this.game!.rules.speed * (view.boost > this.time ? 1.35 : 1);
    const dx = p.body.translation().x - view.ball.x,
      dz = p.body.translation().z - view.ball.z;
    const stance =
      input.charging &&
      Math.hypot(dx, dz) < 1.8 &&
      view.ready === "Ready to swing"
        ? {
            x:
              view.ball.x -
              Math.sin(input.yaw) * 0.5 -
              Math.cos(input.yaw) * 0.18,
            y: view.pos.y,
            z:
              view.ball.z +
              Math.cos(input.yaw) * 0.5 -
              Math.sin(input.yaw) * 0.18,
          }
        : undefined;
    for (let i = 0; i < 2; i++) {
      moveGolfer(p.body, p.controller, p, input, locked, speed, 1 / 60, stance);
      this.game!.moving.setNextKinematicRotation({
        x: 0,
        y: Math.sin((this.time * 0.7) / 2),
        z: 0,
        w: Math.cos((this.time * 0.7) / 2),
      });
      this.game!.world.step();
      this.time += 1 / 60;
    }
  }
  dispose() {
    this.game?.world.free();
    this.game = null;
    this.pending = [];
  }
}

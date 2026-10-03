import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client, type Room } from "@colyseus/sdk";
test(
  "eight independent clients share v2 authoritative state; old protocol and spoofed swings are rejected",
  { timeout: 90000 },
  async () => {
    const server = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/index.ts"],
      {
        env: {
          ...process.env,
          PORT: "2569",
          SUPABASE_URL: "",
          SUPABASE_SECRET_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    server.stderr.on("data", (d) => (output += String(d)));
    server.stdout.on("data", (d) => (output += String(d)));
    const joined: Room[] = [];
    try {
      let ready = false;
      for (let i = 0; i < 300; i++) {
        try {
          ready = (await fetch("http://localhost:2569/api/health")).ok;
          if (ready) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, output);
      const rankedToken = (
        await (
          await fetch("http://localhost:2569/api/guest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Guest ranked" }),
          })
        ).json()
      ).token;
      await assert.rejects(
        new Client("http://localhost:2569").joinOrCreate("battle", {
          mode: "party",
          token: rankedToken,
        }),
        /Game updated/,
      );
      await new Promise((r) => setTimeout(r, 100));
      const clients = Array.from(
        { length: 8 },
        () => new Client("http://localhost:2569"),
      );
      for (let i = 0; i < 8; i++) {
        const token = (
          await (
            await fetch("http://localhost:2569/api/guest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `Player ${i}` }),
            })
          ).json()
        ).token;
        const room = await clients[i].joinOrCreate("battle", {
          mode: "party",
          token,
          protocol: 2,
        });
        room.onMessage("snapshot", () => {});
        room.onMessage("welcome", () => {});
        room.onMessage("notice", () => {});
        room.onMessage("saved", () => {});
        joined.push(room);
      }
      const state: any = await new Promise((resolve) =>
        joined[0].onMessage("snapshot", (s) => {
          if (s.players.length === 8 && s.phase === "playing") resolve(s);
        }),
      );
      assert.equal(new Set(state.players.map((p: any) => p.id)).size, 8);
      const channel = joined[0].input<{
        x: number;
        z: number;
        yaw: number;
        charging: boolean;
      }>();
      Object.assign(channel.data, { x: 100000, z: 0, yaw: 0, charging: false });
      channel.send();
      joined[0].send("action", { type: "swing", power: Infinity, angle: 25 });
      const later: any = await new Promise((resolve) => {
        let n = 0;
        joined[1].onMessage("snapshot", (s) => {
          if (++n > 5) resolve(s);
        });
      });
      const player = later.players.find(
        (p: any) => p.id === joined[0].sessionId,
      );
      assert.ok(Math.abs(player.pos.x) < 10);
      assert.equal(player.strokes, 0);
      assert.equal(later.players.length, 8);
      const shooter = joined[7];
      const shotInput = shooter.input<{
        x: number;
        z: number;
        yaw: number;
        charging: boolean;
        seq: number;
      }>();
      Object.assign(shotInput.data, {
        x: 0,
        z: 0,
        yaw: 0,
        charging: true,
        seq: 1,
      });
      shotInput.send();
      await new Promise((r) => setTimeout(r, 110));
      shooter.send("action", { type: "charge" });
      await new Promise((r) => setTimeout(r, 600));
      shooter.send("action", { type: "swing", angle: 30, power: 9999 });
      const contact: any = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("Authoritative contact never arrived")),
          5000,
        );
        joined[2].onMessage("snapshot", (s) => {
          const p = s.players.find((p: any) => p.id === shooter.sessionId);
          if (p?.strokes === 1) {
            clearTimeout(timeout);
            resolve(s);
          }
        });
      });
      assert.equal(contact.protocol, 2);
      assert.equal(
        contact.players.find((p: any) => p.id === shooter.sessionId)
          .lastInputSeq,
        1,
      );
      assert.ok(
        contact.effects.some(
          (e: any) => e.kind === "swing" && e.playerId === shooter.sessionId,
        ),
      );
    } finally {
      for (const r of joined) await r.leave();
      server.kill();
    }
  },
);

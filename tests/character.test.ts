import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Golfer } from "../apps/web/character";
import { Game, initPhysics } from "../packages/game/simulation";
test("original golfer has a skin, face morphs and working in-place animation clips", async () => {
  await initPhysics();
  const bytes = fs.readFileSync("public/assets/golfer.glb");
  const asset = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  assert.equal(asset.animations.length, 12);
  for (const name of ["run", "swing", "hit", "dive", "celebrate"]) {
    const clip = asset.animations.find((a) => a.name === name)!;
    assert.ok(clip);
    assert.ok(
      clip.tracks.some((t) => {
        const n = t.getValueSize();
        return [...t.values].some(
          (v, i) => Math.abs(v - t.values[i % n]) > 0.001,
        );
      }),
    );
  }
  let skinned = 0;
  asset.scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      skinned++;
      assert.ok(o.skeleton.bones.length >= 16);
      assert.ok(o.morphTargetDictionary?.Focused !== undefined);
    }
  });
  assert.ok(skinned > 0);
  const g = new Game("practice");
  g.addPlayer("a", "Alice");
  const view = g.snapshot().players[0];
  for (let i = 0; i < 20; i++) {
    const golfer = new Golfer(asset, view);
    golfer.update({ ...view, animation: "run" }, 0.15, 0.15);
    golfer.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(golfer.root);
    assert.ok(bounds.max.y < 2.3);
    golfer.update({ ...view, animation: "idle", actionStart: 1 }, 1, 0.15);
    golfer.dispose();
  }
  g.world.free();
});

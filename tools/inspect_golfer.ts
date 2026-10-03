import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const bytes = fs.readFileSync("public/assets/golfer.glb");
const asset = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  "",
);
asset.scene.updateMatrixWorld(true);
console.log(
  "Rest bounds",
  new THREE.Box3().setFromObject(asset.scene).min,
  new THREE.Box3().setFromObject(asset.scene).max,
);
const mixer = new THREE.AnimationMixer(asset.scene);
const action = mixer.clipAction(
  asset.animations.find((a) => a.name === "idle")!,
);
action.play();
mixer.update(0.1);
asset.scene.updateMatrixWorld(true);
console.log(
  "Animated bounds",
  new THREE.Box3().setFromObject(asset.scene).min,
  new THREE.Box3().setFromObject(asset.scene).max,
);
asset.scene.traverse((o) => {
  if (o instanceof THREE.SkinnedMesh)
    console.log(
      o.name,
      o.visible,
      o.position,
      o.scale,
      o.material instanceof Array
        ? o.material.map((m) => m.name)
        : o.material.name,
      o.geometry.attributes.position.count,
    );
});
for (const clip of asset.animations) {
  let changing = 0;
  for (const track of clip.tracks) {
    const size = track.getValueSize();
    for (let i = size; i < track.values.length; i++)
      if (Math.abs(track.values[i] - track.values[i % size]) > 1e-5) {
        changing++;
        break;
      }
  }
  console.log(clip.name, "changing tracks", changing);
}

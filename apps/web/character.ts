import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { PlayerView } from "../../packages/game/simulation";
const loader = new GLTFLoader();
let library: Promise<Awaited<ReturnType<typeof loader.loadAsync>>> | undefined;
export const loadGolfers = () =>
  (library ??= loader.loadAsync("/assets/golfer.glb"));
export class Golfer {
  root = new THREE.Group();
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  current = "";
  lastStart = -1;
  private active?: THREE.AnimationAction;
  private bodyVariant = 0;
  private face = 0;
  private spine?: THREE.Bone;
  private skinMeshes: THREE.SkinnedMesh[] = [];
  private accessories: THREE.Mesh[] = [];
  private props = new Map<string, THREE.Group>();
  private clock = 0;
  private shield: THREE.Mesh;
  constructor(
    asset: Awaited<ReturnType<typeof loader.loadAsync>>,
    p: PlayerView,
  ) {
    const model = clone(asset.scene);
    this.root.add(model);
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 12),
      new THREE.MeshStandardMaterial({
        color: "#77d9ff",
        emissive: "#214c70",
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );
    this.shield.position.y = 0.95;
    this.shield.scale.set(0.8, 1.12, 0.8);
    this.shield.visible = false;
    this.root.add(this.shield);
    this.accessories.push(this.shield);
    this.bodyVariant = p.club % 2;
    this.face = p.emote % 4;
    model.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        this.skinMeshes.push(o);
        const multi = Array.isArray(o.material);
        const source = multi
          ? (o.material as THREE.Material[])
          : [o.material as THREE.Material];
        const materials = source.map((m) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          if (m.name === "Team" || m.name === "Hat") c.color.set(p.color);
          if (m.name === "Hat" && p.hat % 3) {
            c.transparent = true;
            c.opacity = 0;
            c.depthWrite = false;
          }
          if (m.name === "Shorts" && p.outfit % 2) c.color.set("#f2e9cf");
          return c;
        });
        o.material = multi ? materials : materials[0];
        // Body variants share height, rig and collision shape.
        for (const b of o.skeleton.bones)
          if (b.name === "Spine") this.spine = b;
      }
    });
    if (p.hat % 3) {
      model.updateMatrixWorld(true);
      const head = model.getObjectByName("Head");
      if (head) {
        const accessory = new THREE.Group();
        const point = head.worldToLocal(new THREE.Vector3(0, 1.77, 0));
        accessory.position.copy(point);
        accessory.quaternion.copy(
          head.getWorldQuaternion(new THREE.Quaternion()).invert(),
        );
        head.add(accessory);
        const add = (geometry: THREE.BufferGeometry, y: number) => {
          const hat = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.8 }),
          );
          hat.position.y = y;
          hat.castShadow = true;
          accessory.add(hat);
          this.accessories.push(hat);
        };
        if (p.hat % 3 === 1) {
          add(new THREE.CylinderGeometry(0.235, 0.27, 0.2, 16), 0);
          add(new THREE.CylinderGeometry(0.32, 0.32, 0.035, 20), -0.1);
        } else {
          add(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16), -0.06);
          const brim = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 6),
            new THREE.MeshStandardMaterial({ color: "#fff2ce" }),
          );
          brim.scale.set(0.23, 0.018, 0.13);
          brim.position.set(0, -0.07, -0.23);
          accessory.add(brim);
          this.accessories.push(brim);
        }
      }
    }
    const hand = model.getObjectByName("HandR");
    if (hand) {
      const prop = (
        name: string,
        geometry: THREE.BufferGeometry,
        color: string,
      ) => {
        const group = new THREE.Group();
        const object = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
        );
        object.castShadow = true;
        group.add(object);
        group.visible = false;
        hand.add(group);
        this.accessories.push(object);
        this.props.set(name, group);
        return { group, object };
      };
      const rocket = prop(
        "rocket",
        new THREE.CylinderGeometry(0.09, 0.1, 0.65, 12),
        "#495b44",
      );
      rocket.object.position.y = 0.25;
      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.15, 10),
        new THREE.MeshStandardMaterial({ color: "#ffcf66" }),
      );
      nose.position.y = 0.65;
      rocket.group.add(nose);
      this.accessories.push(nose);
      const cup = prop(
        "coffee",
        new THREE.CylinderGeometry(0.065, 0.045, 0.12, 12),
        "#fff0ca",
      );
      cup.object.position.set(0, -0.03, 0.05);
      cup.object.rotation.x = Math.PI;
      const bomb = prop(
        "freeze",
        new THREE.SphereGeometry(0.11, 12, 8),
        "#75dce8",
      );
      bomb.object.position.y = 0.04;
      const mine = prop(
        "mine",
        new THREE.CylinderGeometry(0.1, 0.12, 0.035, 12),
        "#e8735b",
      );
      mine.object.position.y = -0.04;
    }
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of asset.animations) {
      const name = clip.name.replace(/.*\|/, "");
      this.actions.set(name, this.mixer.clipAction(clip));
    }
  }
  update(p: PlayerView, time: number, dt: number, aiming = false, power = 0) {
    const requested = p.finished
      ? "celebrate"
      : p.animation === "freeze"
        ? "hit"
        : p.animation;
    const name =
      (requested === "idle" ||
        requested === "address" ||
        requested === "backswing") &&
      aiming
        ? power > 0
          ? "backswing"
          : "address"
        : requested;
    const action = this.actions.get(name) || this.actions.get("idle");
    if (
      action &&
      (name !== this.current ||
        (p.actionStart !== this.lastStart &&
          ["swing", "hit", "dive", "club", "throw", "drink"].includes(name)))
    ) {
      const old = this.active;
      action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
      const once = ["swing", "hit", "dive", "club", "throw", "drink"].includes(
        name,
      );
      action.setLoop(
        once ? THREE.LoopOnce : THREE.LoopRepeat,
        once ? 1 : Infinity,
      );
      action.clampWhenFinished = once;
      action.play();
      if (old && old !== action) {
        action.crossFadeFrom(old, 0.12, false);
      }
      this.active = action;
      this.current = name;
      this.lastStart = p.actionStart;
      if (once)
        action.time = Math.min(
          action.getClip().duration,
          Math.max(0, time - p.actionStart),
        );
    }
    if (this.active && name === "backswing") {
      this.active.paused = true;
      this.active.time = Math.min(0.999, Math.max(power, p.charge));
    } else if (this.active) {
      this.active.paused = p.animation === "freeze";
      if (name === "run")
        this.active.timeScale = Math.max(
          0.4,
          Math.hypot(p.velocity.x, p.velocity.z) / 6,
        );
    }
    this.mixer.update(dt);
    this.clock += dt;
    this.shield.visible = p.shield > time;
    for (const [name, prop] of this.props) prop.visible = p.heldItem === name;
    if (this.spine) this.spine.scale.x = this.bodyVariant ? 1.13 : 1;
    for (const mesh of this.skinMeshes) {
      if (mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences.fill(0);
        if (this.face) mesh.morphTargetInfluences[this.face - 1] = 1;
        const blink = mesh.morphTargetDictionary?.Blink;
        if (blink !== undefined) {
          const phase = this.clock % 3.6;
          mesh.morphTargetInfluences[blink] =
            phase > 3.35 ? Math.sin(((phase - 3.35) / 0.25) * Math.PI) : 0;
        }
      }
      for (const m of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        if (m.name === "Club") {
          m.transparent = true;
          m.opacity = p.heldItem ? 0 : 1;
        }
    }
  }
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    for (const a of this.accessories) {
      a.geometry.dispose();
      (a.material as THREE.Material).dispose();
    }
    this.root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.dispose();
      }
    });
  }
}

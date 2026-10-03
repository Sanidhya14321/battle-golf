import type { Action, Input } from "../../packages/game/simulation";
import type { GolfRenderer } from "./renderer";
export const DEFAULT_KEYS = {
  forward: "w",
  backward: "s",
  left: "a",
  right: "d",
  dive: " ",
  club: "f",
  use: "q",
  drop: "g",
  chat: "t",
  score: "tab",
  map: "m",
  aim: "shift",
  swing: "enter",
};
export type Bindings = typeof DEFAULT_KEYS;
export type ControlOptions = {
  keys: Bindings;
  sensitivity: number;
  invertY: boolean;
  slot: () => number;
  pause: () => void;
  chat: () => void;
  score: (visible: boolean) => void;
  map: () => void;
  status: (power: number, angle: number) => void;
};
export class Controls {
  private keys = new Set<string>();
  private chargeAt = 0;
  private rocket = false;
  private frame = 0;
  private disposed = false;
  private lastInput = 0;
  private fallback = false;
  constructor(
    private renderer: GolfRenderer,
    private send: (a: Action) => void,
    private input: (i: Input) => void,
    private options: ControlOptions,
  ) {
    const canvas = renderer.renderer.domElement;
    canvas.addEventListener("pointerdown", this.down);
    document.addEventListener("pointerup", this.up);
    document.addEventListener("pointermove", this.move);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("contextmenu", this.context);
    document.addEventListener("keydown", this.keydown);
    document.addEventListener("keyup", this.keyup);
    document.addEventListener("pointerlockchange", this.lockChange);
    window.addEventListener("blur", this.blur);
    this.loop();
  }
  get locked() {
    return (
      this.fallback ||
      document.pointerLockElement === this.renderer.renderer.domElement
    );
  }
  capture = () => {
    const canvas = this.renderer.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.focus();
    this.renderer.activateAudio();
    void canvas.requestPointerLock().catch(() => {
      this.fallback = true;
      canvas.focus();
      this.renderer.captureHint =
        "Middle-drag to look · Shift aim · Enter charge / release";
    });
  };
  clear = () => {
    this.keys.clear();
    this.chargeAt = 0;
    this.rocket = false;
    this.renderer.aiming = false;
    this.renderer.power = 0;
    this.input({ x: 0, z: 0, yaw: this.renderer.yaw, charging: false });
    this.send({ type: "cancel" });
    this.options.score(false);
  };
  suspend = () => {
    this.fallback = false;
    this.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  };
  blur = () => {
    this.suspend();
    this.options.pause();
  };
  lockChange = () => {
    if (document.pointerLockElement === this.renderer.renderer.domElement) {
      this.fallback = false;
      this.renderer.captureHint = "";
    } else if (!this.fallback) {
      this.clear();
      this.options.pause();
    }
  };
  down = (e: PointerEvent) => {
    if (!this.locked) {
      this.capture();
      return;
    }
    if (e.button === 2) {
      this.renderer.aiming = true;
      this.input({ x: 0, z: 0, yaw: this.renderer.yaw, charging: true });
    }
    if (e.button === 0 && this.renderer.aiming && !this.chargeAt) {
      this.chargeAt = performance.now();
      this.send({ type: "charge" });
    }
  };
  up = (e: PointerEvent) => {
    if (!this.locked) return;
    if (e.button === 0 && this.chargeAt) {
      this.send({ type: "swing", angle: this.renderer.angle });
      this.chargeAt = 0;
      this.renderer.power = 0;
    }
    if (e.button === 2) {
      this.renderer.aiming = false;
      this.chargeAt = 0;
      this.renderer.power = 0;
      this.send({ type: "cancel" });
    }
  };
  move = (e: PointerEvent) => {
    if (!this.locked || (this.fallback && !(e.buttons & 4))) return;
    this.renderer.yaw -= e.movementX * this.options.sensitivity;
    this.renderer.pitch = Math.max(
      -0.12,
      Math.min(
        0.85,
        this.renderer.pitch +
          e.movementY *
            this.options.sensitivity *
            (this.options.invertY ? -1 : 1),
      ),
    );
  };
  wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.renderer.aiming) return;
    const angles = [8, 30, 55],
      i = angles.indexOf(this.renderer.angle);
    this.renderer.angle =
      angles[Math.max(0, Math.min(2, i + (e.deltaY > 0 ? 1 : -1)))];
    this.options.status(this.renderer.power, this.renderer.angle);
  };
  context = (e: Event) => e.preventDefault();
  keydown = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement)?.matches("input,select,textarea") ||
      !this.locked
    )
      return;
    const key = e.key.toLowerCase(),
      k = this.options.keys;
    this.keys.add(key);
    if ([k.dive, k.score, k.swing].includes(key)) e.preventDefault();
    if (e.repeat) return;
    if (key === "escape" && this.fallback) {
      this.fallback = false;
      this.clear();
      this.options.pause();
      return;
    }
    if (key === k.aim) {
      this.renderer.aiming = !this.renderer.aiming;
      this.input({
        x: 0,
        z: 0,
        yaw: this.renderer.yaw,
        charging: this.renderer.aiming,
      });
      if (!this.renderer.aiming) {
        this.chargeAt = 0;
        this.send({ type: "cancel" });
      }
    }
    if (key === k.swing && this.renderer.aiming && !this.chargeAt) {
      this.chargeAt = performance.now();
      this.send({ type: "charge" });
    }
    if (key === k.dive) this.send({ type: "dive" });
    if (key === k.club) this.send({ type: "club" });
    if (key === k.drop) this.send({ type: "drop", slot: this.options.slot() });
    if (key === k.use) {
      const p = this.renderer.snapshot?.players.find(
        (p) => p.id === this.renderer.selfId,
      );
      if (p?.inventory[this.options.slot()]?.kind === "rocket") {
        this.rocket = true;
        this.send({ type: "lock" });
      } else this.send({ type: "item", slot: this.options.slot() });
    }
    if (key === k.chat) {
      this.clear();
      document.exitPointerLock();
      this.options.chat();
    }
    if (key === k.score) this.options.score(true);
    if (key === k.map) this.options.map();
  };
  keyup = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    this.keys.delete(key);
    if (key === this.options.keys.swing && this.chargeAt) {
      this.send({ type: "swing", angle: this.renderer.angle });
      this.chargeAt = 0;
      this.renderer.power = 0;
    }
    if (key === this.options.keys.score) this.options.score(false);
    if (key === this.options.keys.use && this.rocket) {
      this.send({ type: "item", slot: this.options.slot() });
      this.rocket = false;
    }
  };
  loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (!this.locked) return;
    const k = this.options.keys,
      x = Number(this.keys.has(k.right)) - Number(this.keys.has(k.left)),
      z = Number(this.keys.has(k.backward)) - Number(this.keys.has(k.forward)),
      yaw = this.renderer.yaw;
    if ((x || z) && this.renderer.aiming) {
      this.renderer.aiming = false;
      this.chargeAt = 0;
      this.renderer.power = 0;
      this.send({ type: "cancel" });
    }
    this.renderer.power = this.chargeAt
      ? Math.min(1, (now - this.chargeAt) / 1200)
      : 0;
    if (now - this.lastInput >= 1000 / 30) {
      this.lastInput = now;
      const i = {
        x: x * Math.cos(yaw) - z * Math.sin(yaw),
        z: x * Math.sin(yaw) + z * Math.cos(yaw),
        yaw,
        charging: this.renderer.aiming,
      };
      this.renderer.input = i;
      this.input(i);
      if (this.rocket) this.send({ type: "lock" });
      this.options.status(this.renderer.power, this.renderer.angle);
    }
  };
  configure(options: Partial<ControlOptions>) {
    Object.assign(this.options, options);
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.suspend();
    const canvas = this.renderer.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.down);
    canvas.removeEventListener("wheel", this.wheel);
    canvas.removeEventListener("contextmenu", this.context);
    document.removeEventListener("pointerup", this.up);
    document.removeEventListener("pointermove", this.move);
    document.removeEventListener("keydown", this.keydown);
    document.removeEventListener("keyup", this.keyup);
    document.removeEventListener("pointerlockchange", this.lockChange);
    window.removeEventListener("blur", this.blur);
  }
}

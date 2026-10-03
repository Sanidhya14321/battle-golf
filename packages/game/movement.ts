import type RAPIER from "@dimforge/rapier3d-compat";
import type { Vec } from "./content";
export type Motion = { velocity: Vec; knock: Vec; grounded: boolean };
/** Shared fixed-step controller used by the authority and client reconciliation. */
export function moveGolfer(
  body: RAPIER.RigidBody,
  controller: RAPIER.KinematicCharacterController,
  motion: Motion,
  input: { x: number; z: number },
  locked: boolean,
  speed: number,
  dt = 1 / 60,
  stance?: Vec,
) {
  const n = Math.max(1, Math.hypot(input.x, input.z)),
    blend = 1 - Math.exp(-14 * dt);
  motion.velocity.x +=
    ((locked ? 0 : (input.x / n) * speed) - motion.velocity.x) * blend;
  motion.velocity.z +=
    ((locked ? 0 : (input.z / n) * speed) - motion.velocity.z) * blend;
  motion.knock.x *= Math.pow(0.965, dt * 60);
  motion.knock.z *= Math.pow(0.965, dt * 60);
  motion.velocity.y = motion.grounded
    ? Math.max(0, motion.knock.y)
    : motion.velocity.y - 9.81 * dt;
  motion.knock.y = 0;
  const at = body.translation(),
    dx = stance ? stance.x - at.x : 0,
    dz = stance ? stance.z - at.z : 0,
    length = Math.hypot(dx, dz),
    adjust = Math.min(1, (3 * dt) / (length || 1));
  controller.computeColliderMovement(
    body.collider(0),
    {
      x: (motion.velocity.x + motion.knock.x) * dt + dx * adjust,
      y: motion.velocity.y * dt - 0.002,
      z: (motion.velocity.z + motion.knock.z) * dt + dz * adjust,
    },
    undefined,
    0x00040005,
  );
  const m = controller.computedMovement();
  body.setNextKinematicTranslation({
    x: at.x + m.x,
    y: at.y + m.y,
    z: at.z + m.z,
  });
  motion.grounded = controller.computedGrounded();
}

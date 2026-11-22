// Guard AI: patrols waypoints with pauses, watches a vision cone, and reacts
// to what it sees — suspicious at low alarm, investigates the last seen spot,
// and chases when the alarm hits lockdown. A guard sent to check a tossed
// coin looks around in a full circle before giving up (scan), so a coin buys
// time but never a free pass. Sight is a cone test plus a line-of-sight
// raycast against walls and cases, the same test the renderer draws.
import { CAMERA, DETECTION, GUARD, STEP, TILE } from './config.js';
import { blocksSight } from './level.js';

export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_INVESTIGATE = 'investigate';
export const GUARD_CHASE = 'chase';
export const GUARD_SCAN = 'scan';

/** Shortest signed turn from angle a to angle b, in (-PI, PI]. */
function turnTo(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when the straight line from (x0, y0) to (x1, y1) crosses no sight-blocking tile. */
export function hasLineOfSight(room, vaultOpen, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i++) {
    const x = x0 + (dx * i) / steps;
    const y = y0 + (dy * i) / steps;
    if (blocksSight(room, Math.floor(x / TILE), Math.floor(y / TILE), vaultOpen)) return false;
  }
  return true;
}

/** True when the point is inside the cone and the cone's owner can see it. */
export function inCone(room, vaultOpen, ox, oy, facing, range, halfAngle, tx, ty) {
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  if (dist < 4) return hasLineOfSight(room, vaultOpen, ox, oy, tx, ty);
  const angle = Math.atan2(dy, dx);
  if (Math.abs(turnTo(angle, facing)) > halfAngle) return false;
  return hasLineOfSight(room, vaultOpen, ox, oy, tx, ty);
}

export function createGuard(def) {
  const points = def.waypoints.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));
  return {
    points,
    index: 0,
    x: points[0].x,
    y: points[0].y,
    facing: 0,
    pause: def.pause ?? 1,
    pauseLeft: 0,
    state: GUARD_PATROL,
    memory: 0,
    lastSeen: { x: points[0].x, y: points[0].y },
    touch: 0,
    // Set by a coin toss: this investigate is a noise check, so arriving at
    // the spot with nothing there ends in a look-around scan, not a patrol.
    coinCheck: false,
    scanLeft: 0,
  };
}

/** Walk toward (tx, ty) at speed; true once the guard arrives (within 2 px). */
function walkTo(guard, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  guard.x += (dx / dist) * step;
  guard.y += (dy / dist) * step;
  guard.facing = Math.atan2(dy, dx);
  return dist - step < 2;
}

export function updateGuard(guard, dt, world) {
  const { room, vaultOpen, player, alarm } = world;
  const seen = inCone(room, vaultOpen, guard.x, guard.y, guard.facing,
    GUARD.coneRange, GUARD.coneHalfAngle, player.x, player.y)
    && !world.inSmoke(guard.x, guard.y) && !world.inSmoke(player.x, player.y);
  if (seen) {
    guard.lastSeen = { x: player.x, y: player.y };
    guard.memory = GUARD.memorySeconds;
    guard.coinCheck = false;
    if (alarm >= DETECTION.lockdownAt) guard.state = GUARD_CHASE;
    else if (alarm >= DETECTION.suspiciousAt) guard.state = GUARD_SUSPICIOUS;
  } else if (guard.memory > 0) {
    guard.memory -= dt;
    if (guard.memory <= 0 && guard.state !== GUARD_PATROL) guard.state = GUARD_INVESTIGATE;
  }

  switch (guard.state) {
    case GUARD_CHASE:
      walkTo(guard, player.x, player.y, GUARD.chaseSpeed, dt);
      return seen;
    case GUARD_INVESTIGATE: {
      const arrived = walkTo(guard, guard.lastSeen.x, guard.lastSeen.y, GUARD.investigateSpeed, dt);
      if (arrived) {
        if (guard.coinCheck) {
          // Nothing at the clatter: turn a full circle, looking for the thief.
          guard.coinCheck = false;
          guard.state = GUARD_SCAN;
          guard.scanLeft = (Math.PI * 2) / GUARD.scanSpeed;
        } else {
          guard.state = GUARD_PATROL;
          guard.pauseLeft = guard.pause;
        }
      }
      return seen;
    }
    case GUARD_SCAN:
      guard.facing += GUARD.scanSpeed * dt;
      guard.scanLeft -= dt;
      if (guard.scanLeft <= 0) {
        guard.state = GUARD_PATROL;
        guard.pauseLeft = guard.pause;
      }
      return seen;
    case GUARD_SUSPICIOUS:
      // Stand, look at the last seen spot, then go check it.
      guard.facing += turnTo(Math.atan2(guard.lastSeen.y - guard.y, guard.lastSeen.x - guard.x), guard.facing) * Math.min(1, dt * 4);
      guard.pauseLeft -= dt;
      if (guard.pauseLeft <= 0) guard.state = GUARD_INVESTIGATE;
      return seen;
    default: {
      // Patrol: walk the waypoints, pausing and looking around at each one.
      if (guard.pauseLeft > 0) {
        guard.pauseLeft -= dt;
        guard.facing += dt * 0.9;
        return seen;
      }
      const target = guard.points[(guard.index + 1) % guard.points.length];
      if (walkTo(guard, target.x, target.y, GUARD.patrolSpeed, dt)) {
        guard.index = (guard.index + 1) % guard.points.length;
        guard.pauseLeft = guard.pause;
      }
      return seen;
    }
  }
}

/** A security camera: fixed to the wall, sweeping its cone back and forth. */
export function createCamera(def) {
  return {
    x: (def.tile[0] + 0.5) * TILE,
    y: (def.tile[1] + 0.5) * TILE,
    base: def.base,
    sweep: def.sweep,
    phase: 0,
    facing: def.base,
    disabledLeft: 0,
  };
}

export function updateCamera(camera, dt) {
  if (camera.disabledLeft > 0) {
    camera.disabledLeft -= dt;
    return;
  }
  camera.phase += dt * CAMERA.sweepSpeed;
  camera.facing = camera.base + Math.sin(camera.phase) * camera.sweep;
}

export function cameraSees(camera, room, vaultOpen, world) {
  if (camera.disabledLeft > 0) return false;
  const { player } = world;
  return inCone(room, vaultOpen, camera.x, camera.y, camera.facing,
    CAMERA.coneRange, CAMERA.coneHalfAngle, player.x, player.y)
    && !world.inSmoke(camera.x, camera.y) && !world.inSmoke(player.x, player.y);
}

// Re-exported for the world step, so the step reads one module for both watchers.
export { STEP };

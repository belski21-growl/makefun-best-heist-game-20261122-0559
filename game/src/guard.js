// guard.js — patrol routes, vision cones, suspicion, chase, coin checks, scans.
//
// A guard is a small state machine. It walks its waypoint loop, pauses at
// each stop and turns toward the next leg, and reacts to what its cone
// actually sees: a glimpse makes it stop and stare, a steady sighting sends
// it to the last seen spot, a close sighting turns into a chase. A tossed
// coin pulls the first free guard over to listen; on arrival the guard
// sweeps a full circle before ambling back to its route. Nothing here knows
// about rooms, loot, or the alarm meter — the world supplies the player
// position, the line-of-sight test, and the lockdown flag each step.
import { GUARD, DETECTION, TILE } from './config.js';
import { blocksMove } from './level.js';

export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_INVESTIGATE = 'investigate';
export const GUARD_CHASE = 'chase';
export const GUARD_SCAN = 'scan';

const TAU = Math.PI * 2;
const PATROL_SIGHT_SECONDS = 4.0;
const SUSPICIOUS_SIGHT_SECONDS = 2.0;
const PAUSE_TURN_SPEED = 2.0;
const PLAYER_TOUCH_RADIUS = 11;

function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function angleBetween(a, b) {
  return Math.abs(wrapAngle(a - b));
}

function turnToward(current, target, maxStep) {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

function tileIsSolid(room, px, py, vaultOpen) {
  const col = Math.floor(px / TILE);
  const row = Math.floor(py / TILE);
  return blocksMove(room, col, row, vaultOpen);
}

// One shared cone test for guards and cameras: inside range, inside the
// half-angle, and with an unblocked line of sight. Returns whether the
// target is seen plus the distance (the world turns distance into an alarm
// rate). A target standing on top of the viewer counts as seen.
export function viewerSees(vx, vy, facing, range, halfAngle, tx, ty, hasSight) {
  const dx = tx - vx;
  const dy = ty - vy;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return { seen: false, dist };
  if (dist > 1 && angleBetween(Math.atan2(dy, dx), facing) > halfAngle) {
    return { seen: false, dist };
  }
  if (hasSight && !hasSight(vx, vy, tx, ty)) return { seen: false, dist };
  return { seen: true, dist };
}

export function createGuard(def) {
  const stops = def.waypoints.map(([col, row]) => ({
    x: col * TILE + TILE / 2,
    y: row * TILE + TILE / 2,
  }));
  const first = stops[0];
  const second = stops[1 % stops.length];
  return {
    x: first.x,
    y: first.y,
    facing: Math.atan2(second.y - first.y, second.x - first.x),
    state: GUARD_PATROL,
    waypoints: stops,
    leg: 1 % stops.length,
    arrivedAt: 0,
    pauseLeft: 0,
    pauseSeconds: def.pause ?? 1,
    lastSeen: null,
    seenFor: 0,
    lostFor: 0,
    scanLeft: 0,
    touchFor: 0,
    coinCheck: false,
    investigateTarget: null,
    caught: false,
  };
}

// Walk toward a point without clipping through walls: move on each axis
// separately so the guard slides along a wall instead of sticking to it.
// Returns true when the point is reached this step.
function walkToward(g, ctx, tx, ty, speed, dt) {
  const dx = tx - g.x;
  const dy = ty - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return true;
  const step = speed * dt;
  if (dist <= step) {
    g.x = tx;
    g.y = ty;
    return true;
  }
  const ux = dx / dist;
  const uy = dy / dist;
  g.facing = Math.atan2(dy, dx);
  const nx = g.x + ux * step;
  if (!tileIsSolid(ctx.room, nx, g.y, ctx.vaultOpen)) g.x = nx;
  const ny = g.y + uy * step;
  if (!tileIsSolid(ctx.room, g.x, ny, ctx.vaultOpen)) g.y = ny;
  return false;
}

// The waypoint the guard will head for once its current pause ends, plus the
// direction of that leg (used to turn the guard while it waits).
function nextLeg(g) {
  const target = g.waypoints[g.leg];
  const current = g.waypoints[g.arrivedAt];
  return {
    target,
    direction: Math.atan2(target.y - current.y, target.x - current.x),
  };
}

// A chasing guard that stays pressed against the thief for the full grace
// window makes the catch. Anything shorter is just a brush past.
function checkTouch(g, ctx, dt) {
  const touchDist = Math.hypot(ctx.px - g.x, ctx.py - g.y);
  if (touchDist < GUARD.radius + PLAYER_TOUCH_RADIUS) {
    g.touchFor += dt;
    if (g.touchFor >= GUARD.touchCatchSeconds) g.caught = true;
  } else {
    g.touchFor = 0;
  }
}

function sendToInvestigate(g, target, coin) {
  g.state = GUARD_INVESTIGATE;
  g.investigateTarget = { x: target.x, y: target.y };
  g.coinCheck = coin;
  g.seenFor = 0;
  g.lostFor = 0;
}

// Point a guard at a spot worth checking — a coin clatter, a last seen
// position. The world uses this when a coin is tossed.
export function sendGuardTo(g, target, coin) {
  sendToInvestigate(g, target, coin);
}

function beginScan(g) {
  g.state = GUARD_SCAN;
  g.scanLeft = TAU;
  g.investigateTarget = null;
}

function backToPatrol(g) {
  g.state = GUARD_PATROL;
  g.coinCheck = false;
  g.lastSeen = null;
  g.investigateTarget = null;
  g.seenFor = 0;
  g.lostFor = 0;
  g.touchFor = 0;
  // Resume from the nearest stop so the guard does not hike across the room.
  let best = 0;
  let bestDist = Infinity;
  g.waypoints.forEach((stop, i) => {
    const d = Math.hypot(stop.x - g.x, stop.y - g.y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  g.leg = (best + 1) % g.waypoints.length;
  g.arrivedAt = best;
  g.pauseLeft = 0;
}

// One guard, one step. ctx carries the room, the vault state, the player
// position, a line-of-sight callback, and the lockdown flag. Returns what
// the guard's cone sees this step for the alarm meter.
//
// A glimpse does not move a guard: the cone must hold the thief for a
// steady four seconds before the guard stops to stare, and the stare must
// hold for two more before the guard walks over to look. A cone sweeping
// past a waiting thief therefore costs nothing — the guard simply walks on.
// Only a close sighting turns into a chase, and the global alarm never
// dispatches a guard that never saw the thief itself: cameras alone cannot
// send the patrol running.
export function stepGuard(g, dt, ctx) {
  const sight = viewerSees(
    g.x,
    g.y,
    g.facing,
    GUARD.coneRange,
    GUARD.coneHalfAngle,
    ctx.px,
    ctx.py,
    ctx.hasSight,
  );
  const seen = sight.seen;

  if (seen) {
    g.lastSeen = { x: ctx.px, y: ctx.py };
    g.lostFor = 0;
  }

  // A passive guard (the title backdrop) only ever walks its route: it
  // notices nothing, investigates nothing, and never gives chase.
  if (ctx.lockdown && !ctx.passive && g.state !== GUARD_CHASE) {
    g.state = GUARD_CHASE;
    g.seenFor = 0;
    g.lostFor = 0;
  }

  const closeEnough = seen && sight.dist < 130;

  if (g.state === GUARD_PATROL) {
    if (seen && !ctx.passive) {
      g.seenFor += dt;
      if (g.seenFor >= PATROL_SIGHT_SECONDS) {
        g.state = GUARD_SUSPICIOUS;
        g.seenFor = 0;
      }
    } else {
      g.seenFor = 0;
      if (g.pauseLeft > 0) {
        g.pauseLeft -= dt;
        const upcoming = nextLeg(g);
        g.facing = turnToward(g.facing, upcoming.direction, PAUSE_TURN_SPEED * dt);
        if (g.pauseLeft <= 0) {
          g.pauseLeft = 0;
          g.arrivedAt = g.leg;
          g.leg = (g.leg + 1) % g.waypoints.length;
        }
      } else {
        const target = g.waypoints[g.leg];
        const arrived = walkToward(g, ctx, target.x, target.y, GUARD.patrolSpeed, dt);
        if (arrived) g.pauseLeft = g.pauseSeconds;
      }
    }
  } else if (g.state === GUARD_SUSPICIOUS) {
    g.facing = turnToward(g.facing, Math.atan2(ctx.py - g.y, ctx.px - g.x), 6 * dt);
    if (closeEnough) {
      g.state = GUARD_CHASE;
      g.seenFor = 0;
      g.lostFor = 0;
      g.touchFor = 0;
    } else if (!seen) {
      backToPatrol(g);
    } else {
      g.seenFor += dt;
      if (g.seenFor >= SUSPICIOUS_SIGHT_SECONDS) {
        sendToInvestigate(g, g.lastSeen, false);
      }
    }
  } else if (g.state === GUARD_INVESTIGATE) {
    if (closeEnough) {
      g.state = GUARD_CHASE;
      g.seenFor = 0;
      g.lostFor = 0;
      g.touchFor = 0;
    } else {
      const target = g.investigateTarget ?? g.lastSeen ?? { x: g.x, y: g.y };
      const arrived = walkToward(g, ctx, target.x, target.y, GUARD.investigateSpeed, dt);
      if (arrived) beginScan(g);
    }
  } else if (g.state === GUARD_SCAN) {
    if (closeEnough) {
      g.state = GUARD_CHASE;
      g.seenFor = 0;
      g.lostFor = 0;
      g.touchFor = 0;
    } else {
      g.facing += GUARD.scanSpeed * dt;
      g.scanLeft -= GUARD.scanSpeed * dt;
      if (g.scanLeft <= 0) backToPatrol(g);
    }
  } else if (g.state === GUARD_CHASE) {
    if (ctx.lockdown) {
      walkToward(g, ctx, ctx.px, ctx.py, GUARD.chaseSpeed, dt);
    } else if (seen) {
      g.lostFor = 0;
      walkToward(g, ctx, ctx.px, ctx.py, GUARD.chaseSpeed, dt);
    } else {
      g.lostFor += dt;
      if (g.lostFor >= GUARD.memorySeconds) {
        if (g.lastSeen) sendToInvestigate(g, g.lastSeen, false);
        else backToPatrol(g);
      } else if (g.lastSeen) {
        walkToward(g, ctx, g.lastSeen.x, g.lastSeen.y, GUARD.chaseSpeed, dt);
      }
    }
    checkTouch(g, ctx, dt);
  }

  return sight;
}

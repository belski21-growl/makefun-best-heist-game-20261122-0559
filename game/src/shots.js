// shots.js — the four staged scenes: title, mid-heist, caught, and the win.
//
// A shot is a frozen moment of a simulated run, not a hand-placed diorama:
// the autopilot actually plays the heist (breadth-first routes, waiting out
// cones, picking the vault lock), the reckless pilot actually walks into a
// guard, and the cover pose is a real thief standing in a real camera cone
// until the alarm climbs. Because every scene comes out of the same world
// step the game itself uses, the screenshots cannot drift from the game.
import { STEP, TILE, PLAYER, GUARD, CAMERA } from './config.js';
import { tileAt, blocksMove, blocksSight } from './level.js';
import { beginHeist, SCREEN_PLAY, SCREEN_WIN } from './world.js';
import { viewerSees } from './guard.js';

const ZERO_INPUT = {
  x: 0,
  y: 0,
  sneak: false,
  sprint: false,
  interact: false,
  emp: false,
  smoke: false,
  coinTarget: null,
};

const PILOT_SECONDS = 30;
const POSE_TILES = [
  [20, 8],
  [20, 10],
  [20, 15],
];
const POSE_FREEZE_ALARM = 40;
const POSE_CAP_SECONDS = 60;
const TITLE_AMBIENT_SECONDS = 5;
const MAX_WAIT_SECONDS = 2;
const RECKLESS_STANDOFF = 70;
const NEIGHBOURS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function tileKey(col, row) {
  return `${col},${row}`;
}

function playerTile(state) {
  return [Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE)];
}

// Shortest tile route, or null when the goal cannot be reached (the vault
// idol behind a shut door, for instance). Neighbour order is fixed so the
// route is the same on every run.
function bfsPath(room, from, to, vaultOpen) {
  const startKey = tileKey(from[0], from[1]);
  const goalKey = tileKey(to[0], to[1]);
  if (startKey === goalKey) return [];
  const cameFrom = new Map([[startKey, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const [col, row] = queue.shift();
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = col + dc;
      const nr = row + dr;
      const key = tileKey(nc, nr);
      if (cameFrom.has(key)) continue;
      if (blocksMove(room, nc, nr, vaultOpen)) continue;
      cameFrom.set(key, [col, row]);
      if (key === goalKey) {
        const tiles = [];
        let cursor = [nc, nr];
        while (cursor) {
          tiles.push(cursor);
          cursor = cameFrom.get(tileKey(cursor[0], cursor[1]));
        }
        tiles.reverse();
        tiles.shift();
        return tiles.map(([c, r]) => ({
          x: c * TILE + TILE / 2,
          y: r * TILE + TILE / 2,
        }));
      }
      queue.push([nc, nr]);
    }
  }
  return null;
}

function lineClear(state, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const col = Math.floor((x1 + dx * t) / TILE);
    const row = Math.floor((y1 + dy * t) / TILE);
    if (blocksSight(state.room, col, row, state.vaultOpen)) return false;
  }
  return true;
}

// Is any live eye on the thief right now? Vents hide the thief outright.
// The nearest guard whose cone holds the thief — the only sighting the
// pilot waits out. Cameras cannot chase, and their cones sweep so slowly
// that standing still under one only feeds the alarm; the pilot walks
// through them and lets the meter decay on the other side. The wait is
// capped at two seconds: a cone that has not passed by then is not going
// to, and standing in it any longer only feeds the alarm toward lockdown.
// The nearest guard and its distance — the pilot also holds off when a
// guard is right on top of it, even outside any cone: walking into a
// patrol's path is how a thief gets walked into, and a guard ahead in the
// same corridor is faster to let pass than to overtake into its cone.
function nearestGuard(state) {
  const p = state.player;
  let best = null;
  let bestDist = Infinity;
  for (const g of state.guards) {
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d < bestDist) {
      bestDist = d;
      best = g;
    }
  }
  return { guard: best, dist: bestDist };
}

function guardSeesThief(state) {
  const p = state.player;
  const [col, row] = playerTile(state);
  if (tileAt(state.room, col, row) === 'v') return null;
  const los = (x1, y1, x2, y2) => lineClear(state, x1, y1, x2, y2);
  for (const g of state.guards) {
    if (viewerSees(g.x, g.y, g.facing, GUARD.coneRange, GUARD.coneHalfAngle, p.x, p.y, los).seen) {
      return g;
    }
  }
  return null;
}

function anyChasing(state) {
  return state.guards.some((g) => g.state === 'chase');
}

function newPilot() {
  return {
    plan: null,
    waitFor: 0,
  };
}

// Pick the next thing to steal: the closest reachable loot, otherwise the
// green door. When the only loot left sits behind the shut vault door the
// pilot heads for the door itself and the world lets it pick the lock.
function chooseGoal(state, pilot) {
  const here = playerTile(state);
  let bestGoal = null;
  let bestPath = null;
  for (const item of state.loot) {
    if (item.taken) continue;
    const tile = [Math.floor(item.x / TILE), Math.floor(item.y / TILE)];
    const path = bfsPath(state.room, here, tile, state.vaultOpen);
    if (path && (!bestPath || path.length < bestPath.length)) {
      bestPath = path;
      bestGoal = { tile, kind: 'loot' };
    }
  }
  if (bestGoal) return { goal: bestGoal, path: bestPath };
  // Loot is left but nothing reachable: it sits behind the shut vault door,
  // so the door comes before the exit — walking to the green door now would
  // strand the pilot there with the room still uncleared.
  if (!state.vaultOpen && state.doorTiles.length > 0) {
    let doorGoal = null;
    let doorPath = null;
    for (const door of state.doorTiles) {
      for (const [dc, dr] of NEIGHBOURS) {
        const near = [door.col + dc, door.row + dr];
        if (blocksMove(state.room, near[0], near[1], true)) continue;
        const path = bfsPath(state.room, here, near, state.vaultOpen);
        if (path && (!doorPath || path.length < doorPath.length)) {
          doorPath = path;
          doorGoal = { tile: near, kind: 'door' };
        }
      }
    }
    if (doorGoal) return { goal: doorGoal, path: doorPath };
  }
  const exitTile = state.room.exit;
  const exitPath = bfsPath(state.room, here, exitTile, state.vaultOpen);
  if (exitPath) return { goal: { tile: exitTile, kind: 'exit' }, path: exitPath };
  return { goal: null, path: null };
}

// One autopilot step: follow the cached route, wait out cones, sprint if a
// guard is already running at the thief, and work the vault lock when the
// route needs the door. The route is only re-planned when something changes
// — a goal is pocketed, the room turns over, the vault opens, or the route
// runs out — so the pilot does not wander between plans mid-corridor. The
// pilot never spends a tool.
function pilotInput(world, pilot) {
  const state = world.state;
  const p = state.player;

  const planStale =
    !pilot.plan ||
    pilot.plan.room !== state.roomIndex ||
    pilot.plan.vault !== state.vaultOpen ||
    pilot.plan.path.length === 0 ||
    (pilot.plan.loot && pilot.plan.loot.taken);
  if (planStale) {
    const picked = chooseGoal(state, pilot);
    if (!picked.goal) return { ...ZERO_INPUT };
    const goalKey = `${state.roomIndex}:${tileKey(picked.goal.tile[0], picked.goal.tile[1])}`;
    const lootItem =
      picked.goal.kind === 'loot'
        ? state.loot.find(
            (item) =>
              !item.taken &&
              Math.floor(item.x / TILE) === picked.goal.tile[0] &&
              Math.floor(item.y / TILE) === picked.goal.tile[1],
          )
        : null;
    pilot.plan = {
      key: goalKey,
      path: picked.path ?? [],
      kind: picked.goal.kind,
      room: state.roomIndex,
      vault: state.vaultOpen,
      loot: lootItem ?? null,
    };
  }

  // Close enough to the vault door to work it: stand still and pick.
  if (pilot.plan.kind === 'door' && !state.vaultOpen && pilot.plan.path.length === 0) {
    for (const door of state.doorTiles) {
      if (Math.hypot(door.x - p.x, door.y - p.y) < 48) {
        return { ...ZERO_INPUT, interact: true };
      }
    }
  }

  const seenByGuard = guardSeesThief(state);
  const near = nearestGuard(state);
  if ((seenByGuard || near.dist < 120) && !anyChasing(state)) {
    pilot.waitFor += STEP;
    if (pilot.waitFor < MAX_WAIT_SECONDS) return { ...ZERO_INPUT };
  } else {
    pilot.waitFor = 0;
  }

  while (pilot.plan.path.length > 0) {
    const next = pilot.plan.path[0];
    if (Math.hypot(next.x - p.x, next.y - p.y) < 6) {
      pilot.plan.path.shift();
      continue;
    }
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const dist = Math.hypot(dx, dy);
    return {
      ...ZERO_INPUT,
      x: dx / dist,
      y: dy / dist,
      sprint: anyChasing(state),
    };
  }
  return { ...ZERO_INPUT };
}

function runPilot(world, maxSeconds) {
  const pilot = newPilot();
  const cap = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < cap; i += 1) {
    if (world.state.screen !== SCREEN_PLAY) break;
    world.step(STEP, pilotInput(world, pilot));
  }
}

// The cover pose: after the timed pilot run, walk to the middle of the
// room and stand in the open until the alarm climbs to the freeze line.
// The thief ends up dead-centre in frame, lit by a camera cone, with a
// guard closing in behind — the moment the cover is built around.
//
// The pilot may arrive hot — the last loot run can leave the meter high —
// so the walk to the middle ignores the freeze line and finishes first:
// freezing on arrival would catch the thief mid-corridor instead of
// mid-room. Once there, the pose stands until the meter reaches the line
// (at once, if it arrived hot).
function runPose(world) {
  const state = world.state;
  const tile = POSE_TILES[state.roomIndex] ?? [20, 10];
  const target = { x: tile[0] * TILE + TILE / 2, y: tile[1] * TILE + TILE / 2 };
  const cap = Math.floor(POSE_CAP_SECONDS / STEP);
  let i = 0;
  // Walk to the middle first. Bail out if the meter is about to lock the
  // room down — a frozen thief beats a chased one.
  for (; i < cap; i += 1) {
    if (state.screen !== SCREEN_PLAY) return;
    if (state.alarm >= 90) break;
    const dx = target.x - state.player.x;
    const dy = target.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) break;
    world.step(STEP, { ...ZERO_INPUT, x: dx / dist, y: dy / dist });
  }
  for (; i < cap; i += 1) {
    if (state.screen !== SCREEN_PLAY) break;
    if (state.alarm >= POSE_FREEZE_ALARM) break;
    world.step(STEP, { ...ZERO_INPUT });
  }
}

// The reckless pilot: march straight at the nearest guard and then stand
// in its cone. The guard does the rest.
function runReckless(world) {
  const cap = Math.floor(120 / STEP);
  for (let i = 0; i < cap; i += 1) {
    const state = world.state;
    if (state.screen !== SCREEN_PLAY) break;
    let nearest = null;
    let nearestDist = Infinity;
    for (const g of state.guards) {
      const d = Math.hypot(g.x - state.player.x, g.y - state.player.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = g;
      }
    }
    if (!nearest || nearestDist < RECKLESS_STANDOFF) {
      world.step(STEP, { ...ZERO_INPUT });
      continue;
    }
    const dx = nearest.x - state.player.x;
    const dy = nearest.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    world.step(STEP, { ...ZERO_INPUT, x: dx / dist, y: dy / dist });
  }
}

function runAmbient(world, seconds) {
  const cap = Math.floor(seconds / STEP);
  for (let i = 0; i < cap; i += 1) {
    world.step(STEP, { ...ZERO_INPUT });
  }
}

export function stageShot(name, world) {
  if (name === 'start') {
    runAmbient(world, TITLE_AMBIENT_SECONDS);
    return { screen: world.state.screen };
  }
  if (name === 'win') {
    beginHeist(world);
    runPilot(world, 300);
    return { screen: world.state.screen };
  }
  if (name === 'play') {
    beginHeist(world);
    const pilot = newPilot();
    const cap = Math.floor(PILOT_SECONDS / STEP);
    for (let i = 0; i < cap; i += 1) {
      if (world.state.screen !== SCREEN_PLAY) break;
      if (world.state.totalTime >= PILOT_SECONDS) break;
      world.step(STEP, pilotInput(world, pilot));
    }
    runPose(world);
    return { screen: world.state.screen };
  }
  if (name === 'caught') {
    beginHeist(world);
    runReckless(world);
    return { screen: world.state.screen };
  }
  return { screen: world.state.screen };
}

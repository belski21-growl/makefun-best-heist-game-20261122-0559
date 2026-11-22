// The screenshot scenes behind ?shot=start|play|caught|win. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot that
// reads the cones before it moves (BFS pathfinding plus wait-out-the-cone),
// so the frame is what a short game really looks like and the same seed
// always gives the same frame.
//
// The play scene (the cover) runs the pilot through the rooms, then poses:
// it walks Marlow to the room's exposed centre tile and holds still in the
// open until the alarm meter reads tense (35-50), so the cover shows the
// thief mid-frame, mid-risk — not at the room's front door with a quiet
// meter. The pose never touches gameplay: it only steers the same pilot
// input the win scene uses, and it stops the moment the meter is tense.
import { CAMERA, COLS, DETECTION, FIELD, GUARD, ROWS, STEP, TILE } from './config.js';
import { EVENT_CAUGHT, EVENT_GAME_OVER, EVENT_ROOM_CLEAR, EVENT_WIN } from './world.js';
import { inCone } from './guard.js';
import { blocksMove } from './level.js';
import { SCREEN_CAUGHT, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 30;
const WIN_LIMIT_SECONDS = 900;
const CAUGHT_LIMIT_SECONDS = 300;
const SAMPLE = STEP;

/** The cover pose: hold in the open until the alarm reads tense. */
const POSE_ALARM_TARGET = 40;
const POSE_SECONDS = 20;

/** Where the cover pose stands in each room: on a patrolling guard's path,
 *  near the room's centre — a guard's cone is steady while it walks, so the
 *  meter climbs there, where a sweeping camera alone cannot beat the decay. */
const POSE_TILES = [[20, 8], [20, 10], [20, 15]];

/** How much danger a tile holds right now: a cone on it, or a guard too close. */
function coneDanger(state, x, y) {
  let danger = 0;
  for (const g of state.guards) {
    if (inCone(state.room, state.vaultOpen, g.x, g.y, g.facing, GUARD.coneRange, GUARD.coneHalfAngle, x, y)) {
      danger += 1000;
    }
    const d = Math.hypot(x - g.x, y - g.y);
    if (d < 120) danger += (120 - d) * 2;
  }
  for (const cam of state.cameras) {
    if (cam.disabledLeft > 0) continue;
    if (inCone(state.room, state.vaultOpen, cam.x, cam.y, cam.facing, CAMERA.coneRange, CAMERA.coneHalfAngle, x, y)) {
      danger += 800;
    }
  }
  return danger;
}

/** BFS on the tile grid from the player's tile to the target tile (4-way). */
function bfsPath(state, targetTile) {
  const start = [Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE)];
  const key = ([c, r]) => `${c},${r}`;
  const passable = (c, r) => {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    if (blocksMove(state.room, c, r, state.vaultOpen)) {
      // The locked door is passable only as the path's destination (to pick it).
      return c === targetTile[0] && r === targetTile[1];
    }
    return true;
  };
  const prev = new Map([[key(start), null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur[0] === targetTile[0] && cur[1] === targetTile[1]) {
      const path = [cur];
      let k = key(cur);
      while (prev.get(k)) {
        const p = prev.get(k);
        path.unshift(p);
        k = key(p);
      }
      return path;
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [cur[0] + dc, cur[1] + dr];
      if (!passable(next[0], next[1]) || prev.has(key(next))) continue;
      prev.set(key(next), cur);
      queue.push(next);
    }
  }
  return null;
}

/** Where the pilot wants to go next: flee a chaser, open the vault, take the
 *  nearest loot, then the exit. Returns { tile, point, isDoor }. */
function pickTarget(state) {
  const chaser = state.guards.find((g) => g.state === 'chase');
  if (chaser) {
    const tile = state.room.player;
    return { tile, point: { x: (tile[0] + 0.5) * TILE, y: (tile[1] + 0.5) * TILE }, isDoor: false };
  }
  const door = state.room.vaultDoor;
  if (door && !state.vaultOpen) {
    const idol = state.loot.find((item) => item.kind === 'idol' && !item.taken);
    if (idol) {
      return { tile: door, point: { x: (door[0] + 0.5) * TILE, y: (door[1] + 0.5) * TILE }, isDoor: true };
    }
  }
  let best = null;
  for (const item of state.loot) {
    if (item.taken) continue;
    const d = Math.hypot(item.x - state.player.x, item.y - state.player.y);
    if (best === null || d < best.d) best = { d, item };
  }
  if (best) {
    return {
      tile: [Math.floor(best.item.x / TILE), Math.floor(best.item.y / TILE)],
      point: { x: best.item.x, y: best.item.y },
      isDoor: false,
    };
  }
  if (state.lootTaken >= state.lootTarget) {
    const tile = state.room.exit;
    return { tile, point: { x: (tile[0] + 0.5) * TILE, y: (tile[1] + 0.5) * TILE }, isDoor: false };
  }
  return {
    tile: [Math.floor(FIELD.width / 2 / TILE), Math.floor(FIELD.height / 2 / TILE)],
    point: { x: FIELD.width / 2, y: FIELD.height / 2 },
    isDoor: false,
  };
}

const IDLE = { x: 0, y: 0, sneak: false, sprint: false, interact: false, emp: false, smoke: false, coinTarget: null };

function pilotInput(state, tease) {
  const p = state.player;
  const pilot = state._pilot ?? (state._pilot = { wait: 0, teaseUsed: 0 });
  const target = pickTarget(state);
  const chaser = state.guards.find((g) => g.state === 'chase');

  const nearDoor = target.isDoor && Math.hypot(target.point.x - p.x, target.point.y - p.y) < TILE * 1.6;
  if (nearDoor) {
    return { x: 0, y: 0, sneak: false, sprint: false, interact: true, emp: false, smoke: false, coinTarget: null };
  }

  // Follow the BFS path; the next waypoint is the tile after the player's own.
  const path = bfsPath(state, target.tile);
  let waypoint = target.point;
  if (path && path.length > 1) {
    waypoint = { x: (path[1][0] + 0.5) * TILE, y: (path[1][1] + 0.5) * TILE };
  }
  const dx = waypoint.x - p.x;
  const dy = waypoint.y - p.y;
  const dist = Math.hypot(dx, dy);

  // Read the cone before moving: wait it out, but not forever — after 2.5 s
  // of waiting, push through sneaking (detection is slow while sneaking).
  const inDanger = coneDanger(state, p.x, p.y) > 0;
  const nextDanger = coneDanger(state, waypoint.x, waypoint.y) > 0;
  if (tease && inDanger && pilot.teaseUsed < 1.5) {
    // The play shot wants a little alarm on the meter: linger in the cone,
    // but only 1.5 s total — long enough to look suspicious, not to lock down.
    pilot.teaseUsed += STEP;
    return { x: 0, y: 0, sneak: true, sprint: false, interact: false, emp: false, smoke: false, coinTarget: null };
  }
  if (nextDanger && !chaser) {
    pilot.wait += STEP;
    if (pilot.wait < 2.5) {
      return { x: 0, y: 0, sneak: true, sprint: false, interact: false, emp: false, smoke: false, coinTarget: null };
    }
  } else {
    pilot.wait = 0;
  }
  const len = dist || 1;
  return {
    x: dx / len,
    y: dy / len,
    sneak: inDanger || nextDanger,
    sprint: Boolean(chaser),
    interact: false,
    emp: false,
    smoke: false,
    coinTarget: null,
  };
}

/** The reckless pilot: walk straight at the nearest guard, then stand in its cone. */
function recklessInput(state) {
  const p = state.player;
  let guard = null;
  let best = Infinity;
  for (const g of state.guards) {
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d < best) { best = d; guard = g; }
  }
  if (!guard) return { ...IDLE };
  const dx = guard.x - p.x;
  const dy = guard.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const close = best < 90;
  return {
    x: close ? 0 : dx / len,
    y: close ? 0 : dy / len,
    sneak: false,
    sprint: false,
    interact: false,
    emp: false,
    smoke: false,
    coinTarget: null,
  };
}

/** Step the world for `seconds` with the given pilot; stop early on a terminal event. */
function runFor(world, seconds, inputFn) {
  let events = 0;
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i++) {
    events = world.step(SAMPLE, inputFn(world.state));
    if (events & (EVENT_WIN | EVENT_GAME_OVER)) return events;
    if (events & EVENT_CAUGHT) return events;
    if (events & EVENT_ROOM_CLEAR) return events;
  }
  return events;
}

/** Like runFor, but a cleared room is not a stop: the pilot keeps playing
 *  into the next room. Only a win, a game over, or a catch ends the run. */
function runPilot(world, seconds, inputFn) {
  let events = 0;
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i++) {
    events = world.step(SAMPLE, inputFn(world.state));
    if (events & (EVENT_WIN | EVENT_GAME_OVER | EVENT_CAUGHT)) return events;
  }
  return events;
}

/** The cover pose's steering: walk the BFS path to the pose tile (sneaking
 *  through danger), then stand still in the open — no sneak, so the cones
 *  fill the meter at full rate — until the alarm reads tense. */
function posePilot(state, targetTile) {
  const p = state.player;
  const point = { x: (targetTile[0] + 0.5) * TILE, y: (targetTile[1] + 0.5) * TILE };
  const dist = Math.hypot(point.x - p.x, point.y - p.y);
  if (dist < 24) {
    return { ...IDLE };
  }
  const path = bfsPath(state, targetTile);
  let waypoint = point;
  if (path && path.length > 1) {
    waypoint = { x: (path[1][0] + 0.5) * TILE, y: (path[1][1] + 0.5) * TILE };
  }
  const dx = waypoint.x - p.x;
  const dy = waypoint.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const inDanger = coneDanger(state, p.x, p.y) > 0;
  const nextDanger = coneDanger(state, waypoint.x, waypoint.y) > 0;
  return {
    x: dx / len,
    y: dy / len,
    sneak: inDanger || nextDanger,
    sprint: false,
    interact: false,
    emp: false,
    smoke: false,
    coinTarget: null,
  };
}

export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'caught' && name !== 'win') {
    runFor(world, START_SECONDS, () => ({ ...IDLE }));
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Play through the rooms for PLAY_SECONDS (room clears do not stop the
    // run — the old version stopped at the first clear, which is why the
    // cover caught Marlow at the next room's front door with a quiet meter).
    runPilot(world, PLAY_SECONDS, (state) => pilotInput(state, true));
    // Then pose: reach this room's exposed centre tile and hold in the open
    // until the alarm meter reads tense, then freeze the frame at once.
    // A guard can only catch Marlow in a chase, and a chase needs lockdown
    // (alarm 100); the pose stops at 40, far below it.
    const deadline = Math.floor(POSE_SECONDS / SAMPLE);
    for (let i = 0; i < deadline; i++) {
      const s = world.state;
      const target = POSE_TILES[s.roomIndex] ?? [20, 11];
      const point = { x: (target[0] + 0.5) * TILE, y: (target[1] + 0.5) * TILE };
      const near = Math.hypot(point.x - s.player.x, point.y - s.player.y) < 40;
      if (near && s.alarm >= POSE_ALARM_TARGET) break;
      const events = world.step(SAMPLE, posePilot(s, target));
      if (events & (EVENT_WIN | EVENT_GAME_OVER | EVENT_CAUGHT)) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.lootValue };
  }
  if (name === 'caught') {
    const events = runFor(world, CAUGHT_LIMIT_SECONDS, recklessInput);
    if (events & EVENT_CAUGHT) return { screen: SCREEN_CAUGHT, best: world.state.lootValue };
    return { screen: SCREEN_PLAY, best: world.state.lootValue };
  }
  // win: the careful pilot plays all three rooms.
  let events = 0;
  const deadline = Math.floor(WIN_LIMIT_SECONDS / SAMPLE);
  for (let i = 0; i < deadline; i++) {
    events = world.step(SAMPLE, pilotInput(world.state, false));
    if (events & EVENT_WIN) break;
    if (events & EVENT_GAME_OVER) break;
  }
  if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.lootValue };
  return { screen: SCREEN_OVER, best: world.state.lootValue };
}

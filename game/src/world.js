// world.js — the heist simulation: rooms, the thief, the alarm, tools, loot.
//
// One world holds the whole run: three rooms, the thief's position and
// stamina, every guard and camera, the alarm meter, the tool belt, and the
// loot tally. step() advances it by one fixed slice. The title screen runs
// an ambient version (guards walk, cameras sweep, nobody is watching the
// thief); the real game only starts once the heist begins. Screens are
// plain strings so the renderer and the shot stager can read them without
// importing anything else.
import {
  TILE,
  PLAYER,
  GUARD,
  CAMERA,
  DETECTION,
  TOOLS,
  TRIES,
  LOOT_VALUE,
} from './config.js';
import { ROOMS, tileAt, blocksMove, blocksSight } from './level.js';
import { createGuard, stepGuard, viewerSees, sendGuardTo } from './guard.js';

export const EVENT_CAUGHT = 1;
export const EVENT_WIN = 2;
export const EVENT_GAME_OVER = 4;
export const EVENT_ROOM_CLEAR = 8;
export const EVENT_LOOT = 16;
export const EVENT_EMP = 32;
export const EVENT_SMOKE = 64;
export const EVENT_COIN = 128;
export const EVENT_LOCKPICK = 256;
export const EVENT_LOCKDOWN = 512;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_WIN = 'win';
export const SCREEN_GAME_OVER = 'gameover';

const LOCKPICK_SECONDS = 1.5;
const LOOT_REACH = 22;
const EXIT_REACH = 24;
const DOOR_REACH = 48;
const RETRY_ALARM = 30;
const POST_LOCKDOWN_ALARM = 30;

function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function lerpRate(pointBlank, atMaxRange, fraction) {
  const f = Math.min(1, Math.max(0, fraction));
  return pointBlank + (atMaxRange - pointBlank) * f;
}

function findDoorTiles(room) {
  const doors = [];
  for (let row = 0; row < room.map.length; row += 1) {
    for (let col = 0; col < room.map[row].length; col += 1) {
      if (tileAt(room, col, row) === 'D') {
        const at = tileCenter(col, row);
        doors.push({ x: at.x, y: at.y, col, row });
      }
    }
  }
  return doors;
}

function loadRoom(state, index) {
  const room = ROOMS[index];
  const start = tileCenter(room.player[0], room.player[1]);
  state.roomIndex = index;
  state.room = room;
  state.roomTime = 0;
  state.player.x = start.x;
  state.player.y = start.y;
  state.player.facing = 0;
  state.player.sneaking = false;
  state.player.stamina = PLAYER.staminaMax;
  state.guards = room.guards.map((def) => createGuard(def));
  state.cameras = room.cameras.map((cam) => {
    const at = tileCenter(cam.tile[0], cam.tile[1]);
    return {
      x: at.x,
      y: at.y,
      base: cam.base,
      sweep: cam.sweep,
      facing: cam.base,
      disabledLeft: 0,
    };
  });
  state.loot = room.loot.map(([col, row, kind]) => {
    const at = tileCenter(col, row);
    return { x: at.x, y: at.y, kind, taken: false };
  });
  state.lootTaken = 0;
  state.lootTarget = Number(room.target);
  state.vaultOpen = false;
  state.doorTiles = findDoorTiles(room);
  state.lockpick = { progress: 0, active: false };
  state.smokes = [];
  state.coins = [];
  state.alarm = 0;
  state.lockdownLeft = 0;
  state.lootValueAtRoomEntry = state.lootValue;
}

export function createWorld(random) {
  const state = {
    screen: SCREEN_TITLE,
    roomIndex: 0,
    room: ROOMS[0],
    totalTime: 0,
    roomTime: 0,
    player: { x: 0, y: 0, facing: 0, sneaking: false, stamina: PLAYER.staminaMax },
    guards: [],
    cameras: [],
    loot: [],
    lootTaken: 0,
    lootTarget: 0,
    lootValue: 0,
    lootValueAtRoomEntry: 0,
    best: 0,
    triesLeft: TRIES,
    alarm: 0,
    lockdownLeft: 0,
    tools: { emp: TOOLS.emp, smoke: TOOLS.smoke, coin: TOOLS.coin },
    smokes: [],
    coins: [],
    vaultOpen: false,
    doorTiles: [],
    lockpick: { progress: 0, active: false },
    rng: random,
  };
  loadRoom(state, 0);
  return {
    state,
    step(dt, input) {
      return stepWorld(state, dt, input);
    },
  };
}

export function beginHeist(world) {
  if (world.state.screen === SCREEN_TITLE) world.state.screen = SCREEN_PLAY;
}

export function resetRoom(world) {
  const state = world.state;
  state.lootValue = state.lootValueAtRoomEntry;
  loadRoom(state, state.roomIndex);
  state.alarm = RETRY_ALARM;
  state.screen = SCREEN_PLAY;
}

// A straight line is clear when no sight-blocking tile and no smoke cloud
// sits on it. Sampled every few pixels so thin walls cannot be skipped.
function segmentClear(state, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const sx = x1 + dx * t;
    const sy = y1 + dy * t;
    const col = Math.floor(sx / TILE);
    const row = Math.floor(sy / TILE);
    if (blocksSight(state.room, col, row, state.vaultOpen)) return false;
    for (const cloud of state.smokes) {
      if (Math.hypot(sx - cloud.x, sy - cloud.y) < TOOLS.smokeRadius) return false;
    }
  }
  return true;
}

function movePlayer(state, ux, uy, speed, dt) {
  const step = speed * dt;
  const nx = state.player.x + ux * step;
  const col = Math.floor(nx / TILE);
  const row = Math.floor(state.player.y / TILE);
  if (!blocksMove(state.room, col, row, state.vaultOpen)) state.player.x = nx;
  const ny = state.player.y + uy * step;
  const col2 = Math.floor(state.player.x / TILE);
  const row2 = Math.floor(ny / TILE);
  if (!blocksMove(state.room, col2, row2, state.vaultOpen)) state.player.y = ny;
}

// Let every guard and live camera look at the thief for one step and fold
// the strongest sighting into a single alarm rate. Returns the rate plus
// whether any guard has held the thief long enough to catch them.
function updateWatchers(state, dt, sneaking, inVent, inShadow, sightTest) {
  const p = state.player;
  const guardCtx = {
    room: state.room,
    vaultOpen: state.vaultOpen,
    px: p.x,
    py: p.y,
    hasSight: sightTest,
    lockdown: state.lockdownLeft > 0,
    passive: false,
  };
  let maxRate = 0;
  let caught = false;
  for (const g of state.guards) {
    const sight = stepGuard(g, dt, guardCtx);
    if (g.caught) caught = true;
    if (sight.seen && !inVent) {
      const rate = lerpRate(
        DETECTION.guardPointBlank,
        DETECTION.guardMaxRange,
        sight.dist / GUARD.coneRange,
      );
      if (rate > maxRate) maxRate = rate;
    }
  }
  for (const cam of state.cameras) {
    if (cam.disabledLeft > 0) continue;
    const sight = viewerSees(
      cam.x,
      cam.y,
      cam.facing,
      CAMERA.coneRange,
      CAMERA.coneHalfAngle,
      p.x,
      p.y,
      sightTest,
    );
    if (sight.seen && !inVent) {
      const rate = lerpRate(
        DETECTION.cameraPointBlank,
        DETECTION.cameraMaxRange,
        sight.dist / CAMERA.coneRange,
      );
      if (rate > maxRate) maxRate = rate;
    }
  }
  if (maxRate > 0) {
    if (inShadow) maxRate *= DETECTION.shadowFactor;
    if (sneaking) maxRate *= DETECTION.sneakFactor;
  }
  return { maxRate, caught };
}

function stepWorld(state, dt, input) {
  // Frozen screens never advance: caught, win, game over, and pause hold
  // the moment. The title screen runs the same simulation as play — the
  // guards walk, the cameras sweep, the tools answer — because the title
  // backdrop is the live world, and a fresh world's first step must already
  // be a real one.
  if (
    state.screen !== SCREEN_TITLE &&
    state.screen !== SCREEN_PLAY
  ) {
    return 0;
  }

  state.totalTime += dt;
  state.roomTime += dt;

  for (const cam of state.cameras) {
    if (cam.disabledLeft > 0) cam.disabledLeft = Math.max(0, cam.disabledLeft - dt);
    cam.facing = cam.base - Math.sin(state.totalTime * CAMERA.sweepSpeed) * cam.sweep;
  }
  for (const cloud of state.smokes) cloud.left -= dt;
  state.smokes = state.smokes.filter((cloud) => cloud.left > 0);

  const hasSight = (x1, y1, x2, y2) => segmentClear(state, x1, y1, x2, y2);

  let events = 0;
  const p = state.player;
  const idleInput = {
    x: 0,
    y: 0,
    sneak: false,
    sprint: false,
    interact: false,
    emp: false,
    smoke: false,
    coinTarget: null,
    ...input,
  };

  // --- tools: each press spends one charge, once. ---
  if (idleInput.emp && state.tools.emp > 0) {
    state.tools.emp -= 1;
    for (const cam of state.cameras) cam.disabledLeft = CAMERA.empSeconds;
    state.alarm = Math.min(DETECTION.lockdownAt, state.alarm + TOOLS.empAlarmCost);
    events |= EVENT_EMP;
  }
  if (idleInput.smoke && state.tools.smoke > 0) {
    state.tools.smoke -= 1;
    state.smokes.push({ x: p.x, y: p.y, left: TOOLS.smokeSeconds });
    events |= EVENT_SMOKE;
  }
  if (idleInput.coinTarget && state.tools.coin > 0) {
    state.tools.coin -= 1;
    const target = { x: idleInput.coinTarget.x, y: idleInput.coinTarget.y };
    state.coins.push(target);
    const free = state.guards.find((g) => g.state === 'patrol');
    if (free) sendGuardTo(free, target, true);
    events |= EVENT_COIN;
  }

  // --- movement: sneak is slow and quiet, sprint is fast and tiring. ---
  const mag = Math.hypot(idleInput.x, idleInput.y);
  const sneaking = !!idleInput.sneak;
  p.sneaking = sneaking;
  let speed = PLAYER.walk;
  if (sneaking) speed = PLAYER.sneak;
  else if (idleInput.sprint && p.stamina > 1) speed = PLAYER.sprint;
  if (mag > 0.01) {
    const ux = idleInput.x / mag;
    const uy = idleInput.y / mag;
    movePlayer(state, ux, uy, speed, dt);
    p.facing = Math.atan2(uy, ux);
  }
  if (speed === PLAYER.sprint && mag > 0.01) {
    p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * dt);
  } else {
    p.stamina = Math.min(PLAYER.staminaMax, p.stamina + PLAYER.staminaRegen * dt);
  }

  // --- the vault lock: one press by the door starts the pick; standing
  // still keeps it turning, walking away resets the tumblers. ---
  const picking = { active: state.lockpick.active, progress: state.lockpick.progress };
  if (!state.vaultOpen && state.doorTiles.length > 0) {
    let nearestDist = Infinity;
    for (const door of state.doorTiles) {
      const d = Math.hypot(door.x - p.x, door.y - p.y);
      if (d < nearestDist) nearestDist = d;
    }
    const byTheDoor = nearestDist < DOOR_REACH;
    if (idleInput.interact && byTheDoor && mag <= 0.01) picking.active = true;
    if (picking.active) {
      if (!byTheDoor || mag > 0.01) {
        picking.active = false;
        picking.progress = 0;
      } else {
        picking.progress += dt;
        if (picking.progress >= LOCKPICK_SECONDS) {
          state.vaultOpen = true;
          picking.progress = 0;
          picking.active = false;
          events |= EVENT_LOCKPICK;
        }
      }
    }
  } else {
    picking.active = false;
    picking.progress = 0;
  }
  state.lockpick = picking;

  // --- loot: walk over it to pocket it. ---
  for (const item of state.loot) {
    if (!item.taken && Math.hypot(item.x - p.x, item.y - p.y) < LOOT_REACH) {
      item.taken = true;
      state.lootTaken += 1;
      state.lootValue += LOOT_VALUE[item.kind] ?? 0;
      if (state.lootValue > state.best) state.best = state.lootValue;
      events |= EVENT_LOOT;
    }
  }

  // --- eyes on the thief: guards and live cameras feed one alarm meter. ---
  const playerCol = Math.floor(p.x / TILE);
  const playerRow = Math.floor(p.y / TILE);
  const tileHere = tileAt(state.room, playerCol, playerRow);
  const inVent = tileHere === 'v';
  const inShadow = tileHere === 's';
  const sightTest = inVent ? () => false : hasSight;
  const watched = updateWatchers(state, dt, sneaking, inVent, inShadow, sightTest);
  const caught = watched.caught;
  if (watched.maxRate > 0) {
    state.alarm = Math.min(DETECTION.lockdownAt, state.alarm + watched.maxRate * dt);
  } else {
    state.alarm = Math.max(0, state.alarm - DETECTION.decay * dt);
  }

  // --- lockdown: at 100 the whole estate hunts the thief for a while. ---
  if (state.alarm >= DETECTION.lockdownAt && state.lockdownLeft <= 0) {
    state.lockdownLeft = DETECTION.lockdownSeconds;
    events |= EVENT_LOCKDOWN;
  }
  if (state.lockdownLeft > 0) {
    state.lockdownLeft -= dt;
    if (state.lockdownLeft <= 0) {
      state.lockdownLeft = 0;
      state.alarm = POST_LOCKDOWN_ALARM;
    }
  }

  // --- the way out: all loot first, then the green door. ---
  if (state.lootTaken >= state.lootTarget) {
    const exit = tileCenter(state.room.exit[0], state.room.exit[1]);
    if (Math.hypot(exit.x - p.x, exit.y - p.y) < EXIT_REACH) {
      if (state.roomIndex < ROOMS.length - 1) {
        events |= EVENT_ROOM_CLEAR;
        loadRoom(state, state.roomIndex + 1);
      } else {
        state.screen = SCREEN_WIN;
        events |= EVENT_WIN;
      }
      return events;
    }
  }

  if (caught) {
    state.triesLeft -= 1;
    for (const g of state.guards) g.caught = false;
    events |= EVENT_CAUGHT;
    if (state.triesLeft > 0) {
      state.screen = SCREEN_CAUGHT;
    } else {
      state.screen = SCREEN_GAME_OVER;
      events |= EVENT_GAME_OVER;
    }
  }

  return events;
}

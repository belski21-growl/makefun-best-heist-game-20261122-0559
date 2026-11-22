// The heist simulation: one room at a time, fixed 1/60 s steps. The player
// moves, sneaks and sprints; guards and cameras watch cones; the alarm meter
// fills when the thief is seen and decays when hidden; tools cost charges
// (EMP also costs alarm); loot is collected, the vault door is lockpicked,
// and the getaway door ends the room. Events are bit flags the main loop
// turns into screens and sounds.
import { CAMERA, DETECTION, GUARD, LOOT_VALUE, PLAYER, STEP, TILE, TOOLS, TRIES } from './config.js';
import { blocksMove, ROOMS, tileAt } from './level.js';
import { cameraSees, createCamera, createGuard, updateCamera, updateGuard } from './guard.js';
import { createRandom } from './random.js';

export const EVENT_LOOT = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_ROOM_CLEAR = 4;
export const EVENT_WIN = 8;
export const EVENT_GAME_OVER = 16;
export const EVENT_ALARM = 32;
export const EVENT_LOCKDOWN = 64;
export const EVENT_TOOL = 128;

function centreOf(c, r) {
  return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE };
}

export function createWorld(random) {
  const state = {
    random,
    roomIndex: 0,
    room: ROOMS[0],
    player: { x: 0, y: 0, facing: 0, sneaking: false, sprinting: false, stamina: PLAYER.staminaMax },
    guards: [],
    cameras: [],
    loot: [],
    vaultOpen: false,
    lockpickLeft: 0,
    alarm: 0,
    lockdownLeft: 0,
    triesLeft: TRIES,
    lootValue: 0,
    lootTaken: 0,
    lootTarget: 0,
    tools: { emp: TOOLS.emp, smoke: TOOLS.smoke, coin: TOOLS.coin },
    smokes: [],
    coins: [],
    time: 0,
    totalTime: 0,
    message: '',
    messageLeft: 0,
  };
  const world = {
    state,
    reset() {
      state.roomIndex = 0;
      state.triesLeft = TRIES;
      state.lootValue = 0;
      state.totalTime = 0;
      loadRoom(state, 0);
    },
    step(dt, input) {
      return stepWorld(state, dt, input);
    },
  };
  loadRoom(state, 0);
  return world;
}

/** Fill a room's live state from its definition: guards, cameras, loot, exit. */
function loadRoom(state, index) {
  const room = ROOMS[index];
  state.roomIndex = index;
  state.room = room;
  const start = centreOf(room.player[0], room.player[1]);
  state.player.x = start.x;
  state.player.y = start.y;
  state.player.facing = room.player[0] < 20 ? 0 : Math.PI;
  state.player.stamina = PLAYER.staminaMax;
  state.guards = room.guards.map(createGuard);
  state.cameras = room.cameras.map(createCamera);
  state.loot = room.loot.map(([c, r, kind]) => ({ ...centreOf(c, r), kind, taken: false }));
  state.lootTarget = room.target;
  state.lootTaken = 0;
  state.vaultOpen = false;
  state.lockpickLeft = 0;
  state.alarm = Math.min(state.alarm, 25);
  state.lockdownLeft = 0;
  state.smokes = [];
  state.coins = [];
  state.message = room.name;
  state.messageLeft = 2.5;
}

function say(state, message) {
  state.message = message;
  state.messageLeft = 2.5;
}

function tileUnder(state, x, y) {
  return tileAt(state.room, Math.floor(x / TILE), Math.floor(y / TILE));
}

/** How much of the detection rate applies where the thief stands: nothing in
 *  a vent, halved in shadow and halved again while sneaking. */
function hiddenFactor(state) {
  const t = tileUnder(state, state.player.x, state.player.y);
  if (t === 'v') return DETECTION.ventFactor;
  let factor = 1;
  if (t === 's') factor *= DETECTION.shadowFactor;
  if (state.player.sneaking) factor *= DETECTION.sneakFactor;
  return factor;
}

/** Move the thief, axis by axis so a wall on one axis never blocks the other. */
function movePlayer(state, dir, dt) {
  const p = state.player;
  const onVent = tileUnder(state, p.x, p.y) === 'v';
  let speed = PLAYER.walk;
  p.sneaking = false;
  p.sprinting = false;
  if (dir.sneak && p.stamina > 0) {
    speed = PLAYER.sneak;
    p.sneaking = true;
  } else if (dir.sprint && p.stamina > 0 && (dir.x !== 0 || dir.y !== 0)) {
    speed = PLAYER.sprint;
    p.sprinting = true;
    p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * dt);
  } else {
    p.stamina = Math.min(PLAYER.staminaMax, p.stamina + PLAYER.staminaRegen * dt);
  }
  if (onVent) speed *= 0.6;
  if (dir.x !== 0 || dir.y !== 0) p.facing = Math.atan2(dir.y, dir.x);
  const nx = p.x + dir.x * speed * dt;
  const ny = p.y + dir.y * speed * dt;
  const r = PLAYER.radius;
  if (!hitsWall(state, nx, p.y, r)) p.x = nx;
  if (!hitsWall(state, p.x, ny, r)) p.y = ny;
}

/** True when a circle of radius r at (x, y) overlaps a movement-blocking tile. */
function hitsWall(state, x, y, r) {
  const points = [
    [x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r],
    [x, y - r], [x, y + r], [x - r, y], [x + r, y],
  ];
  return points.some(([px, py]) => blocksMove(state.room,
    Math.floor(px / TILE), Math.floor(py / TILE), state.vaultOpen));
}

function smokeAt(state, x, y) {
  return state.smokes.some((s) => Math.hypot(x - s.x, y - s.y) < TOOLS.smokeRadius);
}

/** The view object guard.js and the cameras read: room, door, player, smoke. */
function watcherView(state) {
  return {
    room: state.room,
    vaultOpen: state.vaultOpen,
    player: state.player,
    inSmoke: (x, y) => smokeAt(state, x, y),
  };
}

/** Alarm fill per second from one guard's cone, nearer = faster. */
function guardFill(state, guard) {
  const dist = Math.hypot(state.player.x - guard.x, state.player.y - guard.y);
  const t = Math.min(1, dist / GUARD.coneRange);
  return DETECTION.guardPointBlank + (DETECTION.guardMaxRange - DETECTION.guardPointBlank) * t;
}

function cameraFill(state, cam) {
  const dist = Math.hypot(state.player.x - cam.x, state.player.y - cam.y);
  const t = Math.min(1, dist / CAMERA.coneRange);
  return DETECTION.cameraPointBlank + (DETECTION.cameraMaxRange - DETECTION.cameraPointBlank) * t;
}

function stepWorld(state, dt, input) {
  let events = 0;
  state.time += dt;
  state.totalTime += dt;
  if (state.messageLeft > 0) state.messageLeft -= dt;
  for (const s of state.smokes) s.left -= dt;
  state.smokes = state.smokes.filter((s) => s.left > 0);
  for (const c of state.coins) c.left -= dt;
  state.coins = state.coins.filter((c) => c.left > 0);

  // Lockpick channel: stand still by the vault door, hold E's press.
  if (state.lockpickLeft > 0) {
    state.lockpickLeft -= dt;
    if (state.lockpickLeft <= 0) {
      state.vaultOpen = true;
      say(state, 'Vault open — the Gilded Idol is yours for the taking.');
      events |= EVENT_TOOL;
    }
  } else if (input.interact) {
    const door = state.room.vaultDoor;
    if (door && !state.vaultOpen) {
      const d = centreOf(door[0], door[1]);
      if (Math.hypot(state.player.x - d.x, state.player.y - d.y) < TILE * 1.6) {
        state.lockpickLeft = 1.5;
        say(state, 'Picking the vault lock… stay still.');
      }
    }
  }

  // Tools, each spent from the thief's stock.
  if (input.emp && state.tools.emp > 0) {
    state.tools.emp -= 1;
    for (const cam of state.cameras) cam.disabledLeft = CAMERA.empSeconds;
    state.alarm = Math.min(100, state.alarm + TOOLS.empAlarmCost);
    say(state, 'EMP pulse — cameras dark for 8s. The surge trips the alarm a little.');
    events |= EVENT_TOOL;
  }
  if (input.smoke && state.tools.smoke > 0) {
    state.tools.smoke -= 1;
    state.smokes.push({ x: state.player.x, y: state.player.y, left: TOOLS.smokeSeconds });
    say(state, 'Smoke out — cones cannot see through it.');
    events |= EVENT_TOOL;
  }
  if (input.coinTarget && state.tools.coin > 0) {
    state.tools.coin -= 1;
    state.coins.push({ x: input.coinTarget.x, y: input.coinTarget.y, left: 6 });
    for (const g of state.guards) {
      g.lastSeen = { x: input.coinTarget.x, y: input.coinTarget.y };
      g.memory = GUARD.memorySeconds;
      if (g.state === 'patrol') {
        // A patrolling guard goes to check the clatter — and scans the spot
        // when nothing is there, instead of walking straight back.
        g.state = 'investigate';
        g.coinCheck = true;
      }
    }
    say(state, 'Coin tossed — a guard goes to check the clatter.');
    events |= EVENT_TOOL;
  }

  if (state.lockpickLeft <= 0) movePlayer(state, input, dt);

  // Detection: every watching cone that sees the thief fills the alarm.
  const hidden = hiddenFactor(state);
  let seenBy = 0;
  for (const g of state.guards) {
    if (updateGuard(g, dt, watcherView(state))) seenBy = Math.max(seenBy, guardFill(state, g));
  }
  for (const cam of state.cameras) {
    updateCamera(cam, dt);
    if (cameraSees(cam, state.room, state.vaultOpen, watcherView(state))) {
      seenBy = Math.max(seenBy, cameraFill(state, cam));
    }
  }
  if (seenBy > 0) {
    state.alarm = Math.min(100, state.alarm + seenBy * hidden * dt);
    if (state.alarm >= DETECTION.suspiciousAt && state.alarm < DETECTION.lockdownAt) events |= EVENT_ALARM;
  } else {
    state.alarm = Math.max(0, state.alarm - DETECTION.decay * dt);
  }

  // Lockdown at a full meter: every guard chases for lockdownSeconds.
  if (state.alarm >= DETECTION.lockdownAt && state.lockdownLeft <= 0) {
    state.lockdownLeft = DETECTION.lockdownSeconds;
    for (const g of state.guards) g.state = 'chase';
    say(state, 'LOCKDOWN — every guard is coming for you!');
    events |= EVENT_LOCKDOWN;
  }
  if (state.lockdownLeft > 0) {
    state.lockdownLeft -= dt;
    if (state.lockdownLeft <= 0) state.alarm = 55;
  }

  // Caught: a chasing guard holds onto the thief for touchCatchSeconds.
  for (const g of state.guards) {
    if (g.state === 'chase' && Math.hypot(g.x - state.player.x, g.y - state.player.y) < GUARD.radius + PLAYER.radius + 2) {
      g.touch += dt;
      if (g.touch >= GUARD.touchCatchSeconds) {
        state.triesLeft -= 1;
        state.alarm = 30;
        state.lockdownLeft = 0;
        for (const gg of state.guards) { gg.state = 'patrol'; gg.touch = 0; }
        if (state.triesLeft <= 0) return events | EVENT_GAME_OVER;
        loadRoom(state, state.roomIndex);
        return events | EVENT_CAUGHT;
      }
    } else {
      g.touch = 0;
    }
  }

  // Loot: walk over it to pocket it.
  for (const item of state.loot) {
    if (!item.taken && Math.hypot(item.x - state.player.x, item.y - state.player.y) < TILE * 0.8) {
      item.taken = true;
      state.lootTaken += 1;
      state.lootValue += LOOT_VALUE[item.kind];
      say(state, `${item.kind === 'idol' ? 'The Gilded Idol' : item.kind === 'gold' ? 'Gold bars' : 'A painting'} — $${LOOT_VALUE[item.kind].toLocaleString('en-US')} in the bag.`);
      events |= EVENT_LOOT;
    }
  }

  // Exit: the getaway door opens once this room's target is met.
  const exit = centreOf(state.room.exit[0], state.room.exit[1]);
  if (Math.hypot(exit.x - state.player.x, exit.y - state.player.y) < TILE * 0.9) {
    if (state.lootTaken >= state.lootTarget) {
      if (state.roomIndex >= ROOMS.length - 1) return events | EVENT_WIN;
      loadRoom(state, state.roomIndex + 1);
      return events | EVENT_ROOM_CLEAR;
    }
    say(state, `The getaway is locked — take ${state.lootTarget - state.lootTaken} more piece${state.lootTarget - state.lootTaken === 1 ? '' : 's'} first.`);
  }
  return events;
}

// Re-exported so the step's view object matches what guard.js expects.
export { STEP };

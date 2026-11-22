// main.js — boot, the fixed-step loop, shot mode, and the screen flow.
//
// Two ways to run. With ?shot=start|play|caught|win in the URL the game
// stages that scene once and then repaints the frozen frame until the shot
// is captured (window.__shotReady tells the capture driver the first paint
// is done). Without it, this is the playable game: title, heist, caught,
// win, and game over, with the input belt, the sound kit, the best-loot
// record, and a pause when the tab hides. Input actions arrive edge by
// edge, so a press is spent the moment it is read; the step itself runs on
// a fixed slice so the simulation plays the same at any frame rate.
import { STEP, BEST_KEY, FIELD } from './config.js';
import {
  createWorld,
  beginHeist,
  resetRoom,
  EVENT_CAUGHT,
  EVENT_WIN,
  EVENT_GAME_OVER,
  EVENT_ROOM_CLEAR,
  EVENT_LOOT,
  EVENT_EMP,
  EVENT_SMOKE,
  EVENT_COIN,
  EVENT_LOCKPICK,
  EVENT_LOCKDOWN,
  SCREEN_TITLE,
  SCREEN_PLAY,
  SCREEN_PAUSED,
  SCREEN_CAUGHT,
  SCREEN_WIN,
  SCREEN_GAME_OVER,
} from './world.js';
import {
  createInput,
  ACTION_CONFIRM,
  ACTION_PAUSE,
  ACTION_EMP,
  ACTION_SMOKE,
  ACTION_INTERACT,
} from './input.js';
import { createAudio } from './audio.js';
import { drawScene } from './render.js';
import { stageShot } from './shots.js';
import { createRandom } from './random.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// The drawing buffer is the field itself: without this the canvas stays at
// its 300x150 default and the game paints into a postage stamp in the
// corner while the stylesheet stretches it over the whole window.
canvas.width = FIELD.width;
canvas.height = FIELD.height;
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const input = createInput(canvas);
const audio = createAudio();

let storedBest = 0;
try {
  storedBest = Number(window.localStorage.getItem(BEST_KEY)) || 0;
} catch (err) {
  storedBest = 0;
}

let world = createWorld(createRandom(seed));
world.state.best = storedBest;

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function money(amount) {
  return `$${Math.floor(amount).toLocaleString('en-US')}`;
}

function persistBest() {
  if (world.state.best > storedBest) {
    storedBest = world.state.best;
    try {
      window.localStorage.setItem(BEST_KEY, String(storedBest));
    } catch (err) {
      // A private window can refuse storage; the run still counts.
    }
  }
}

function playSounds(events, alarmBefore) {
  if (events & EVENT_LOOT) audio.loot();
  if (events & EVENT_EMP) audio.emp();
  if (events & EVENT_SMOKE) audio.smoke();
  if (events & EVENT_COIN) audio.coin();
  if (events & EVENT_LOCKPICK) audio.clear();
  if (events & EVENT_ROOM_CLEAR) audio.clear();
  if (events & EVENT_LOCKDOWN) audio.lockdown();
  if (events & EVENT_CAUGHT) audio.caught();
  if (events & EVENT_WIN) audio.win();
  if (events & EVENT_GAME_OVER) audio.caught();
  if (world.state.alarm >= 35 && alarmBefore < 35) audio.alarm();
}

const unlockOnce = () => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
  window.removeEventListener('keydown', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && world.state.screen === SCREEN_PLAY) {
    world.state.screen = SCREEN_PAUSED;
    announce('Paused');
  }
});

const ZERO_STEP_INPUT = {
  x: 0,
  y: 0,
  sneak: false,
  sprint: false,
  interact: false,
  emp: false,
  smoke: false,
  coinTarget: null,
};

let prevConfirm = false;
let prevPause = false;
let strideCount = 0;
let lastPlayerX = world.state.player.x;
let lastPlayerY = world.state.player.y;

// Screens where the world stands still: a press either starts the heist,
// resumes it, retries the room, or begins a fresh run. Returns true when
// the press was spent on the screen itself and no world step should follow.
function handleStillScreen(screen, confirmEdge, pauseEdge, click) {
  if (screen === SCREEN_TITLE) {
    if (confirmEdge || click) {
      audio.unlock();
      beginHeist(world);
      announce(`${world.state.room.name} — room 1 of 3`);
    }
    return true;
  }
  if (screen === SCREEN_PAUSED) {
    if (pauseEdge || confirmEdge) {
      world.state.screen = SCREEN_PLAY;
      announce('Heist resumed');
    }
    return true;
  }
  if (screen === SCREEN_CAUGHT) {
    if (confirmEdge || click) {
      audio.unlock();
      resetRoom(world);
      announce(`${world.state.room.name} — try this room again`);
    }
    return true;
  }
  if (screen === SCREEN_WIN || screen === SCREEN_GAME_OVER) {
    if (confirmEdge || click) {
      audio.unlock();
      world = createWorld(createRandom((Date.now() % 2147483647) || 1));
      world.state.best = storedBest;
      lastPlayerX = world.state.player.x;
      lastPlayerY = world.state.player.y;
      announce('The Gilded Vault');
    }
    return true;
  }
  return false;
}

function tick() {
  const actions = input.takeActions();
  const confirmEdge = Boolean(actions & ACTION_CONFIRM) && !prevConfirm;
  const pauseEdge = Boolean(actions & ACTION_PAUSE) && !prevPause;
  prevConfirm = Boolean(actions & ACTION_CONFIRM);
  prevPause = Boolean(actions & ACTION_PAUSE);
  const dir = input.direction();
  const click = input.takeClick();
  const screen = world.state.screen;

  // The title backdrop is the live world: let it breathe behind the title.
  if (screen === SCREEN_TITLE) world.step(STEP, ZERO_STEP_INPUT);

  if (handleStillScreen(screen, confirmEdge, pauseEdge, click)) return;

  if (pauseEdge) {
    world.state.screen = SCREEN_PAUSED;
    announce('Paused');
    return;
  }

  const stepInput = {
    x: dir.x,
    y: dir.y,
    sneak: input.sneaking(),
    sprint: input.sprinting(),
    interact: Boolean(actions & ACTION_INTERACT),
    emp: Boolean(actions & ACTION_EMP),
    smoke: Boolean(actions & ACTION_SMOKE),
    coinTarget: click ? { x: click.x, y: click.y } : null,
  };
  const alarmBefore = world.state.alarm;
  const events = world.step(STEP, stepInput);

  const moved =
    Math.hypot(world.state.player.x - lastPlayerX, world.state.player.y - lastPlayerY) > 0.05;
  lastPlayerX = world.state.player.x;
  lastPlayerY = world.state.player.y;
  if (moved) {
    strideCount += 1;
    if (strideCount % 22 === 0) audio.step();
  }

  playSounds(events, alarmBefore);
  if (events & EVENT_CAUGHT) {
    announce(
      world.state.triesLeft > 0
        ? `Caught! ${world.state.triesLeft} ${world.state.triesLeft === 1 ? 'try' : 'tries'} left`
        : 'Caught for good',
    );
  }
  if (events & EVENT_WIN) {
    announce(`The idol is yours — ${money(world.state.lootValue)} in ${Math.round(world.state.totalTime)}s`);
  }
  if (events & EVENT_ROOM_CLEAR) {
    announce(`${world.state.room.name} — room ${world.state.roomIndex + 1} of 3`);
  }
  persistBest();
}

if (shotName) {
  // Shot mode: stage once, repaint the frozen frame forever, and raise the
  // flag after the first paint so the capture driver can shoot.
  stageShot(shotName, world);
  announce(
    shotName === 'start'
      ? 'The Gilded Vault'
      : `The Gilded Vault — ${shotName} scene`,
  );
  let ready = false;
  const repaint = () => {
    drawScene(ctx, world);
    if (!ready) {
      ready = true;
      window.__shotReady = true;
    }
    window.requestAnimationFrame(repaint);
  };
  window.requestAnimationFrame(repaint);
} else {
  announce('The Gilded Vault');
  let last = window.performance.now();
  let acc = 0;
  const frame = (now) => {
    window.requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 8) {
      acc -= STEP;
      guard += 1;
      tick();
    }
    if (guard >= 8) acc = 0;
    drawScene(ctx, world);
  };
  window.requestAnimationFrame(frame);
}

// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between seven screens: title,
// play, paused, caught, room-clear, win and game over.
//
// ?seed=N fixes the layout's random parts. ?shot=start|play|caught|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_GAME_OVER, EVENT_LOOT, EVENT_ROOM_CLEAR, EVENT_TOOL, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_EMP, ACTION_INTERACT, ACTION_PAUSE, ACTION_SMOKE, createInput } from './input.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

/** The best loot total this browser has seen, or 0 when storage is unavailable. */
function loadBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function storeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Stage one screenshot scene and keep painting it until the capture lands. */
function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    // Keep painting every frame (a late viewport resize clears the canvas,
    // so painting exactly twice can leave a blank capture behind).
    if (painted >= 2) window.__shotReady = true;
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = loadBest();
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;
  let pendingActions = 0;
  let pendingClick = null;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Three rooms, three tries. Steal it all, get out clean.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.lootValue > best) {
      best = world.state.lootValue;
      storeBest(best);
    }
    announce(won
      ? `The idol is yours. ${world.state.lootValue} dollars in ${Math.round(world.state.totalTime)} seconds.`
      : `Game over. Loot kept ${world.state.lootValue} dollars.`);
  }

  /** Consume the frame's queued actions (and click) against the current screen. */
  function handleActions() {
    const actions = pendingActions;
    pendingActions = 0;
    const clicked = pendingClick !== null;
    if ((actions & ACTION_CONFIRM || clicked) && screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) {
      pendingClick = null;
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function step(frameActions, click) {
    if (screen === SCREEN_TITLE) return;
    const dir = input.direction();
    const coinTarget = click
      ? { x: (click.x / canvas.clientWidth) * 1280, y: (click.y / canvas.clientHeight) * 720 }
      : null;
    const events = world.step(STEP, {
      x: dir.x,
      y: dir.y,
      sneak: input.sneaking(),
      sprint: input.sprinting(),
      interact: Boolean(frameActions & ACTION_INTERACT),
      emp: Boolean(frameActions & ACTION_EMP),
      smoke: Boolean(frameActions & ACTION_SMOKE),
      coinTarget,
    });
    stepCount += 1;
    if (stepCount % 30 === 0 && (dir.x !== 0 || dir.y !== 0)) audio.step();
    if (events & EVENT_LOOT) audio.loot();
    if (events & EVENT_TOOL) audio.emp();
    if (events & EVENT_CAUGHT) {
      audio.caught();
      screen = SCREEN_CAUGHT;
      announce(`Caught. ${world.state.triesLeft} tries left.`);
    } else if (events & EVENT_ROOM_CLEAR) {
      audio.clear();
      screen = SCREEN_CLEAR;
      announce('Room clear. Next room.');
    } else if (events & EVENT_WIN) {
      audio.win();
      endGame(true);
    } else if (events & EVENT_GAME_OVER) {
      audio.caught();
      endGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    pendingActions |= input.takeActions();
    const click = input.takeClick();
    if (click) pendingClick = click;
    const frameActions = handleActions();
    const frameClick = pendingClick;
    pendingClick = null;
    if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(first ? frameActions : 0, first ? frameClick : null);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('The Gilded Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

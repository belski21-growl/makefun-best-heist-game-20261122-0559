// The Gilded Vault — every tuning number and colour in one place. The
// playfield is a fixed 1280x720 logical area and the renderer scales it to
// the window, so no number below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 32;
export const COLS = 40;
export const ROWS = 22;

/** The simulation's fixed step: 60 updates a second, whatever the display rate. */
export const STEP = 1 / 60;

/** The thief: radii and speeds, plus the stamina pool sprint draws on. */
export const PLAYER = {
  radius: 11,
  walk: 175,
  sneak: 100,
  sprint: 265,
  staminaMax: 100,
  staminaDrain: 34,
  staminaRegen: 22,
};

/** Tries before the crew walks: a caught thief costs one, at zero the heist ends. */
export const TRIES = 3;

/** Detection: how fast the alarm meter (0-100) fills while a cone sees the thief. */
export const DETECTION = {
  guardPointBlank: 62,
  guardMaxRange: 13,
  cameraPointBlank: 48,
  cameraMaxRange: 10,
  sneakFactor: 0.45,
  shadowFactor: 0.5,
  ventFactor: 0,
  decay: 30,
  suspiciousAt: 35,
  lockdownAt: 100,
  lockdownSeconds: 8,
};

/** Guards: patrol / chase / investigate speeds, cone shape, memory, and the
 *  look-around scan a guard does after checking a tossed coin and finding
 *  nothing there (scanSpeed turns a full circle in about 2.4 s). */
export const GUARD = {
  radius: 12,
  patrolSpeed: 62,
  chaseSpeed: 168,
  investigateSpeed: 105,
  coneRange: 250,
  coneHalfAngle: 0.58,
  memorySeconds: 4,
  touchCatchSeconds: 0.25,
  scanSpeed: 2.6,
};

/** Cameras: fixed to the wall, sweeping their cones back and forth; an EMP
 *  pulse blacks them out for empSeconds. */
export const CAMERA = {
  coneRange: 230,
  coneHalfAngle: 0.5,
  sweepSpeed: 0.55,
  empSeconds: 8,
};

/** Tools: how many of each the thief carries, and what each one costs.
 *  EMP also trips the alarm a little (empAlarmCost); smoke hangs for
 *  smokeSeconds in a smokeRadius circle no cone can see through. */
export const TOOLS = {
  emp: 2,
  smoke: 2,
  coin: 3,
  empAlarmCost: 10,
  smokeSeconds: 5,
  smokeRadius: 95,
};

/** What each piece of loot is worth, in dollars. */
export const LOOT_VALUE = { painting: 4000, gold: 6000, idol: 25000 };

/** The palette: gold on near-black, danger in red, safety in green — so safe
 *  cover, danger and loot read at a glance in a shrunken screenshot. */
export const PALETTE = {
  backdrop: '#0d0f14',
  floor: '#232833',
  floorAlt: '#20252f',
  shadow: '#161a24',
  vent: '#101820',
  wall: '#3a4152',
  wallTop: '#4a5468',
  caseGlass: '#2c3a4d',
  caseGold: '#c9a227',
  player: '#f2c94c',
  playerSneak: '#d9a441',
  guard: '#e5534b',
  guardCone: 'rgba(229, 83, 75, 0.20)',
  guardConeEdge: 'rgba(229, 83, 75, 0.45)',
  camera: '#ff7a59',
  cameraCone: 'rgba(255, 122, 89, 0.18)',
  loot: '#ffd94d',
  exit: '#39d98a',
  smoke: 'rgba(180, 190, 205, 0.55)',
  panel: 'rgba(10, 12, 18, 0.82)',
  text: '#eef1f5',
  muted: '#9aa3b2',
  alarmLow: '#39d98a',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best loot total is kept between visits (this browser only). */
export const BEST_KEY = 'gilded-vault.best';

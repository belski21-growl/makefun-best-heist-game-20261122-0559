// Paints the heist: per-room floors (marble gallery, carpeted corridor,
// gold-trimmed vault), raycast vision cones with a distinct language for
// guard eyes vs camera sweeps, loot, the getaway door, the thief, and the
// HUD (alarm meter, loot, tools, tries). Screens: title, play, paused,
// caught, room-clear, win, game over.
//
// Cone language (so a still frame tells them apart at a glance): a guard's
// cone is red with a SOLID edge and a solid red chevron at its mouth; a
// camera's cone is amber with a DASHED edge. A legend chip in the play
// screen names both. The vault-door and getaway "OPEN" labels are painted
// only during live play — never under a menu overlay, where they used to
// bleed through as ghost text.
import { CAMERA, COLS, FIELD, FONT, GUARD, PALETTE, PLAYER, ROWS, TILE, TOOLS } from './config.js';
import { blocksSight, tileAt } from './level.js';
import { GUARD_CHASE, GUARD_INVESTIGATE, GUARD_SCAN, GUARD_SUSPICIOUS } from './guard.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const scale = { x: 1, y: 1, ox: 0, oy: 0 };

  function fit() {
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const s = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    scale.x = s;
    scale.y = s;
    scale.ox = (canvas.width - FIELD.width * s) / 2;
    scale.oy = (canvas.height - FIELD.height * s) / 2;
  }
  fit();
  window.addEventListener('resize', fit);

/** "$73,000" from 73000. */
function money(value) {
  return `$${value.toLocaleString('en-US')}`;
}

/** How far a ray from (x, y) at angle travels before a sight-blocking tile stops it. */
function castRay(room, vaultOpen, x, y, angle, range) {
  const step = 6;
  for (let d = step; d <= range; d += step) {
    const px = x + Math.cos(angle) * d;
    const py = y + Math.sin(angle) * d;
    if (blocksSight(room, Math.floor(px / TILE), Math.floor(py / TILE), vaultOpen)) return d - step;
  }
  return range;
}

/** Trace a vision cone as a path: 26 rays fanned across the half-angle. */
function traceCone(ctx, room, vaultOpen, x, y, facing, range, halfAngle) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  const rays = 26;
  for (let i = 0; i <= rays; i++) {
    const angle = facing - halfAngle + (2 * halfAngle * i) / rays;
    const len = castRay(room, vaultOpen, x, y, angle, range);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
  }
  ctx.closePath();
}

/** Deterministic per-tile hash, so a floor motif never shimmers between frames. */
function hash2(c, r) {
  let h = (c * 73856093) ^ (r * 19349663);
  h ^= h >>> 13;
  h = (h * 1274126177) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** The floor's two base tones for a room, by its name. */
function floorTones(roomName) {
  if (roomName === 'The Marble Gallery') return ['#2b3040', '#272c39'];
  if (roomName === 'The Vault Corridor') return ['#3a1e26', '#351b22'];
  return ['#20242f', '#1d2029']; // The Gilded Vault
}

/** One floor tile: base tone plus the room's own motif. Tile semantics are
 *  untouched — this is paint only, over exactly the same '.' floor. */
function paintFloorTile(ctx, roomName, c, r, x, y) {
  const tones = floorTones(roomName);
  ctx.fillStyle = (c + r) % 2 === 0 ? tones[0] : tones[1];
  ctx.fillRect(x, y, TILE, TILE);
  const h = hash2(c, r);
  if (roomName === 'The Marble Gallery') {
    // Marble veining: a faint diagonal vein across one tile in four.
    if (h % 4 === 0) {
      ctx.strokeStyle = 'rgba(205, 210, 225, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (h % 8 === 0) {
        ctx.moveTo(x + 3, y + TILE - 4);
        ctx.lineTo(x + TILE - 4, y + 3);
      } else {
        ctx.moveTo(x + 3, y + 3);
        ctx.lineTo(x + TILE - 4, y + TILE - 4);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
  } else if (roomName === 'The Vault Corridor') {
    // Carpet: a small gold diamond woven into every other tile, darker
    // pile along the outer columns.
    if ((c + r) % 2 === 0) {
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.38)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + TILE / 2, y + 9);
      ctx.lineTo(x + TILE - 9, y + TILE / 2);
      ctx.lineTo(x + TILE / 2, y + TILE - 9);
      ctx.lineTo(x + 9, y + TILE / 2);
      ctx.closePath();
      ctx.stroke();
    }
    if (c === 1 || c === COLS - 2) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(x, y, TILE, TILE);
    }
  } else {
    // Vault: dark stone with a thin gold grout and a gold fleck or two.
    ctx.fillStyle = 'rgba(201, 162, 39, 0.30)';
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
    if (h % 3 === 0) {
      ctx.fillStyle = 'rgba(201, 162, 39, 0.55)';
      ctx.fillRect(x + 6 + (h % 12), y + 8 + ((h >> 4) % 12), 2, 2);
      ctx.fillRect(x + 20 - (h % 8), y + 20 - ((h >> 6) % 8), 1, 1);
    }
  }
}

function paintTiles(state, labels) {
  const room = state.room;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tileAt(room, c, r);
      const x = c * TILE;
      const y = r * TILE;
      if (t === '#') {
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.wallTop;
        ctx.fillRect(x, y, TILE, 5);
        continue;
      }
      paintFloorTile(ctx, room.name, c, r, x, y);
      if (t === 's') {
        ctx.fillStyle = PALETTE.shadow;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(x, y, TILE, 1);
      } else if (t === 'v') {
        ctx.fillStyle = PALETTE.vent;
        ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = 'rgba(120,140,160,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.beginPath();
        for (let i = 1; i <= 3; i++) {
          ctx.moveTo(x + 5, y + i * 7);
          ctx.lineTo(x + TILE - 5, y + i * 7);
        }
        ctx.stroke();
      } else if (t === 'X') {
        ctx.fillStyle = PALETTE.caseGlass;
        ctx.fillRect(x + 2, y + 6, TILE - 4, TILE - 12);
        ctx.strokeStyle = PALETTE.caseGold;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 6, TILE - 4, TILE - 12);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + 5, y + 9, TILE - 10, 4);
      } else if (t === 'D') {
        ctx.fillStyle = state.vaultOpen ? '#2c3a2e' : '#5a4a1f';
        ctx.fillRect(x, y, TILE, TILE);
        if (labels) {
          ctx.fillStyle = state.vaultOpen ? PALETTE.exit : PALETTE.caseGold;
          ctx.font = `bold 11px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(state.vaultOpen ? 'OPEN' : 'VAULT', x + TILE / 2, y + 19);
        }
      }
    }
  }
}

function paintExit(state, labels) {
  const exit = { x: (state.room.exit[0] + 0.5) * TILE, y: (state.room.exit[1] + 0.5) * TILE };
  const open = state.lootTaken >= state.lootTarget;
  ctx.save();
  ctx.globalAlpha = open ? 1 : 0.45;
  ctx.fillStyle = PALETTE.exit;
  ctx.beginPath();
  ctx.arc(exit.x, exit.y, 20, 0, Math.PI * 2);
  ctx.fill();
  if (labels) {
    ctx.fillStyle = '#0d0f14';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('GETAWAY', exit.x, exit.y - 26);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(open ? 'OPEN' : `${state.lootTaken}/${state.lootTarget}`, exit.x, exit.y + 4);
  }
  ctx.restore();
}

function paintLoot(state) {
  for (const item of state.loot) {
    if (item.taken) continue;
    const pulse = 1 + Math.sin(state.time * 3 + item.x) * 0.08;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.scale(pulse, pulse);
    if (item.kind === 'painting') {
      ctx.fillStyle = PALETTE.caseGold;
      ctx.fillRect(-13, -16, 26, 32);
      ctx.fillStyle = '#7a4a2b';
      ctx.fillRect(-10, -13, 20, 26);
      ctx.fillStyle = '#e8b04b';
      ctx.beginPath();
      ctx.arc(0, -2, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'gold') {
      ctx.fillStyle = '#8a6d1f';
      ctx.fillRect(-14, -6, 28, 12);
      ctx.fillStyle = PALETTE.loot;
      ctx.fillRect(-12, -9, 24, 10);
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(-12, -9, 24, 3);
    } else {
      ctx.fillStyle = PALETTE.caseGold;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(0, -3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d0f14';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('IDOL', 0, 12);
    }
    ctx.restore();
  }
}

function paintCones(state) {
  // Cameras: amber fill, DASHED edge — a sweep, not a stare.
  for (const cam of state.cameras) {
    if (cam.disabledLeft > 0) continue;
    ctx.fillStyle = PALETTE.cameraCone;
    traceCone(ctx, state.room, state.vaultOpen, cam.x, cam.y, cam.facing, CAMERA.coneRange, CAMERA.coneHalfAngle);
    ctx.fill();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = 'rgba(255, 150, 90, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Guards: red fill, SOLID edge, and a solid chevron at the cone's mouth
  // pointing where the guard is looking.
  for (const g of state.guards) {
    ctx.fillStyle = g.state === GUARD_CHASE ? 'rgba(229,83,75,0.30)' : 'rgba(229, 83, 75, 0.24)';
    traceCone(ctx, state.room, state.vaultOpen, g.x, g.y, g.facing, GUARD.coneRange, GUARD.coneHalfAngle);
    ctx.fill();
    ctx.strokeStyle = PALETTE.guardConeEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    const tipX = g.x + Math.cos(g.facing) * GUARD.coneRange * 0.92;
    const tipY = g.y + Math.sin(g.facing) * GUARD.coneRange * 0.92;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(g.facing);
    ctx.fillStyle = '#e5534b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-12, -6);
    ctx.lineTo(-12, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function paintCameras(state) {
  for (const cam of state.cameras) {
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.rotate(cam.facing);
    ctx.fillStyle = cam.disabledLeft > 0 ? '#555c66' : PALETTE.camera;
    ctx.fillRect(-4, -6, 16, 12);
    ctx.fillStyle = cam.disabledLeft > 0 ? '#333' : '#ffd9cc';
    ctx.beginPath();
    ctx.arc(12, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (cam.disabledLeft > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`EMP ${Math.ceil(cam.disabledLeft)}s`, cam.x, cam.y - 14);
    }
  }
}

function paintGuards(state) {
  for (const g of state.guards) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = '#1c1f27';
    ctx.beginPath();
    ctx.arc(0, 0, GUARD.radius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.state === GUARD_CHASE ? '#ff2e2e' : PALETTE.guard;
    ctx.beginPath();
    ctx.arc(0, 0, GUARD.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(g.facing);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(5, -4, 2.5, 0, Math.PI * 2);
    ctx.arc(5, 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(GUARD.radius - 2, -2, 8, 4);
    ctx.restore();
    if (g.state === GUARD_SUSPICIOUS || g.state === GUARD_INVESTIGATE || g.state === GUARD_SCAN) {
      ctx.fillStyle = PALETTE.loot;
      ctx.font = `bold 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('?', g.x, g.y - 20);
    } else if (g.state === GUARD_CHASE) {
      ctx.fillStyle = '#ff2e2e';
      ctx.font = `bold 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', g.x, g.y - 20);
    }
  }
}

function paintSmoke(state) {
  for (const s of state.smokes) {
    ctx.fillStyle = PALETTE.smoke;
    ctx.beginPath();
    ctx.arc(s.x, s.y, TOOLS.smokeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x - 30, s.y + 12, TOOLS.smokeRadius * 0.6, 0, Math.PI * 2);
    ctx.arc(s.x + 28, s.y - 10, TOOLS.smokeRadius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCoins(state) {
  for (const c of state.coins) {
    ctx.fillStyle = PALETTE.loot;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6d1f';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function paintPlayer(state) {
  const p = state.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 7, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.sneaking ? PALETTE.playerSneak : PALETTE.player;
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  // Flat cap + mask: the thief's silhouette.
  ctx.fillStyle = '#20242e';
  ctx.beginPath();
  ctx.arc(0, -2, 9, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-9, -3, 18, 3);
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(-7, -1, 14, 3);
  ctx.rotate(p.facing);
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(PLAYER.radius - 3, -2, 7, 4);
  ctx.restore();
  if (state.lockpickLeft > 0) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(p.x - 26, p.y - 34, 52, 7);
    ctx.fillStyle = PALETTE.loot;
    ctx.fillRect(p.x - 25, p.y - 33, 50 * (1 - state.lockpickLeft / 1.5), 5);
  }
  if (p.stamina < PLAYER.staminaMax - 1) {
    ctx.fillStyle = 'rgba(10,12,18,0.8)';
    ctx.fillRect(p.x - 16, p.y + 16, 32, 4);
    ctx.fillStyle = p.stamina < 25 ? '#e5534b' : '#7ec8ff';
    ctx.fillRect(p.x - 15, p.y + 17, 30 * (p.stamina / PLAYER.staminaMax), 2);
  }
}

function paintHud(state, screen, best) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 0, FIELD.width, 46);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(state.room.name.toUpperCase(), 14, 19);
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(`Room ${state.roomIndex + 1}/3 · ${money(state.lootValue)} · Best ${money(best)}`, 14, 37);

  // Alarm meter — the heart of the HUD.
  const ax = 470;
  const alarm = state.alarm;
  const colour = alarm < 35 ? PALETTE.alarmLow : alarm < 70 ? PALETTE.alarmMid : PALETTE.alarmHigh;
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('ALARM', ax, 19);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(ax + 58, 8, 200, 14);
  ctx.fillStyle = colour;
  ctx.fillRect(ax + 59, 9, 198 * (alarm / 100), 12);
  ctx.fillStyle = alarm >= 100 ? '#ff2e2e' : PALETTE.muted;
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillText(alarm >= 100 ? 'LOCKDOWN!' : alarm >= 35 ? 'SUSPICIOUS' : 'quiet', ax + 58, 37);

  // Loot + tries.
  ctx.fillStyle = PALETTE.loot;
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`◆ ${state.lootTaken}/${state.lootTarget}`, 790, 19);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`Tries ${'●'.repeat(state.triesLeft)}${'○'.repeat(3 - state.triesLeft)}`, 790, 37);

  // Tools.
  ctx.fillStyle = PALETTE.text;
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`[1] EMP ×${state.tools.emp}   [2] Smoke ×${state.tools.smoke}   [Click] Coin ×${state.tools.coin}`, FIELD.width - 14, 19);
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('WASD move · Shift sneak · Space sprint · E lockpick · P pause', FIELD.width - 14, 37);

  if (state.messageLeft > 0) {
    ctx.fillStyle = PALETTE.panel;
    const w = 560;
    ctx.fillRect((FIELD.width - w) / 2, 56, w, 30);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(state.message, FIELD.width / 2, 76);
  }
  if (screen === SCREEN_PLAY && state.room.vaultDoor && !state.vaultOpen) {
    const d = { x: (state.room.vaultDoor[0] + 0.5) * TILE, y: (state.room.vaultDoor[1] + 0.5) * TILE };
    if (Math.hypot(state.player.x - d.x, state.player.y - d.y) < TILE * 2.2) {
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(d.x - 90, d.y - 52, 180, 24);
      ctx.fillStyle = PALETTE.loot;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Press E to pick the vault lock', d.x, d.y - 35);
    }
  }
}

/** Legend chip for the cone language, bottom-left, live play only. */
function paintLegend() {
  const x = 14;
  const y = FIELD.height - 32;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y, 296, 24);
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'left';
  // Guard sample: solid red line.
  ctx.strokeStyle = '#e5534b';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 12);
  ctx.lineTo(x + 32, y + 12);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('guard eyes', x + 38, y + 16);
  // Camera sample: dashed amber line.
  ctx.strokeStyle = '#ff7a59';
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(x + 126, y + 12);
  ctx.lineTo(x + 148, y + 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('camera sweep', x + 154, y + 16);
}

/** Full-screen overlay for the menu screens: title, lines, accent colour. */
function paintOverlay(title, lines, accent) {
  ctx.fillStyle = 'rgba(8, 10, 14, 0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.fillStyle = accent;
  ctx.font = `bold 54px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(title, FIELD.width / 2, 260);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `18px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 310 + i * 30));
}

return {
  draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale.x, 0, 0, scale.y, scale.ox, scale.oy);
    // Door and getaway labels only during live play: under a menu overlay
    // they used to show through as ghost text ("OPENOPEN" on the win screen).
    const labels = screen === SCREEN_PLAY;
    paintTiles(state, labels);
    paintExit(state, labels);
    paintLoot(state);
    paintCones(state);
    paintSmoke(state);
    paintCoins(state);
    paintCameras(state);
    paintGuards(state);
    paintPlayer(state);
    paintHud(state, screen, best);
    if (screen === SCREEN_PLAY) paintLegend();
    if (screen === SCREEN_TITLE) {
      paintOverlay('THE GILDED VAULT', [
        'Marlow the thief. Three rooms. One idol. No alarms — if you are good.',
        'Slip past guards and cameras, pocket the loot, reach the getaway van.',
        'WASD move · Shift sneak · Space sprint · 1 EMP · 2 Smoke · Click: toss a coin',
        'E picks the vault lock · P pauses',
        '',
        'Press Space or click to start the heist.',
      ], PALETTE.loot);
    } else if (screen === SCREEN_PAUSED) {
      paintOverlay('PAUSED', ['The guards wait. The vault waits.', 'Press P to keep stealing.'], PALETTE.text);
    } else if (screen === SCREEN_CAUGHT) {
      paintOverlay('CAUGHT!', [
        `A guard laid hands on Marlow. ${state.triesLeft} ${state.triesLeft === 1 ? 'try' : 'tries'} left.`,
        'Press Space to try this room again.',
      ], '#ff2e2e');
    } else if (screen === SCREEN_CLEAR) {
      paintOverlay('ROOM CLEAR', [
        `Loot so far: ${money(state.lootValue)}.`,
        'Press Space for the next room.',
      ], PALETTE.exit);
    } else if (screen === SCREEN_WIN) {
      paintOverlay('THE IDOL IS YOURS', [
        `Three rooms, one getaway: ${money(state.lootValue)} in ${Math.round(state.totalTime)}s.`,
        'Marlow vanishes into the night. Press Space to run it again.',
      ], PALETTE.loot);
    } else if (screen === SCREEN_OVER) {
      paintOverlay('THE HEIST IS OVER', [
        `Three strikes — the crew walks. Loot kept: ${money(state.lootValue)}.`,
        'Press Space to start a new crew.',
      ], '#ff2e2e');
    }
  },
};
}

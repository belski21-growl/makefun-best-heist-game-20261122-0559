// render.js — everything the player sees, painted in layers.
//
// The picture is built bottom-up: the dark backdrop, the per-room floor
// with its own motif, the vision cones, the walls and furniture, the loot
// and the green way out, smoke, the guards and cameras and the thief, and
// finally the HUD, the room banner, and the legend. Overlays for the title,
// caught, win, and pause screens dim the world but never the HUD, so the
// numbers stay readable under every screen. Door and exit labels only ever
// appear while actually playing, never through an overlay.
import {
  TILE,
  ROWS,
  COLS,
  FIELD,
  FONT,
  PALETTE,
  GUARD,
  CAMERA,
  PLAYER,
  TOOLS,
} from './config.js';
import { tileAt } from './level.js';
import {
  SCREEN_TITLE,
  SCREEN_PLAY,
  SCREEN_PAUSED,
  SCREEN_CAUGHT,
  SCREEN_WIN,
  SCREEN_GAME_OVER,
} from './world.js';

const HUD_HEIGHT = 46;
const BANNER_SECONDS = 10;
const CHEVRON_FRACTION = 0.88;
const ALARM_BAR_X = 529;
const ALARM_BAR_WIDTH = 200;
const ALARM_BAR_Y = 9;
const ALARM_BAR_HEIGHT = 12;

function money(amount) {
  return `$${Math.floor(amount).toLocaleString('en-US')}`;
}

// A stable pseudo-random pick per tile, so every motif lands the same way
// on every run and every repaint.
function hash2(col, row) {
  let h = (col * 374761393 + row * 668265263) ^ (col * row * 974634211 + 2654435761);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function paintFloorTile(ctx, s, col, row, ch) {
  const x = col * TILE;
  const y = row * TILE;
  const checker = (col + row) % 2 === 0;
  if (s.roomIndex === 1) {
    ctx.fillStyle = checker ? '#351c22' : '#3a1e24';
  } else {
    ctx.fillStyle = checker ? PALETTE.floor : PALETTE.floorAlt;
  }
  ctx.fillRect(x, y, TILE, TILE);

  if (ch === 's') {
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(x, y, TILE, TILE);
    return;
  }
  // The corridor keeps its two edge columns darker than the carpet.
  if (s.roomIndex === 1 && (col === 1 || col === COLS - 2)) {
    ctx.fillStyle = '#2a1418';
    ctx.fillRect(x, y, TILE, TILE);
  }

  const dice = hash2(col, row);
  if (s.roomIndex === 0) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + TILE - 0.5, y);
    ctx.lineTo(x + TILE - 0.5, y + TILE);
    ctx.moveTo(x, y + TILE - 0.5);
    ctx.lineTo(x + TILE, y + TILE - 0.5);
    ctx.stroke();
    if (dice < 0.25) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 27);
      ctx.lineTo(x + 27, y + 5);
      ctx.stroke();
    }
  } else if (s.roomIndex === 1) {
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.50)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 10);
    ctx.lineTo(x + 22, y + 16);
    ctx.lineTo(x + 16, y + 22);
    ctx.lineTo(x + 10, y + 16);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + TILE - 0.5, y);
    ctx.lineTo(x + TILE - 0.5, y + TILE);
    ctx.moveTo(x, y + TILE - 0.5);
    ctx.lineTo(x + TILE, y + TILE - 0.5);
    ctx.stroke();
    if (dice < 0.12) {
      ctx.fillStyle = 'rgba(201, 162, 39, 0.55)';
      ctx.fillRect(x + 8 + Math.floor(dice * 90) % 14, y + 8 + Math.floor(dice * 700) % 14, 2, 2);
    }
  }
}

function paintFloor(ctx, s) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const ch = tileAt(s.room, col, row);
      if (ch === '#') continue;
      paintFloorTile(ctx, s, col, row, ch);
    }
  }
}

function paintCone(ctx, x, y, facing, range, halfAngle, fill, edge, dashed) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, facing - halfAngle, facing + halfAngle);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  if (dashed) ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintChevron(ctx, x, y, facing, range) {
  const dist = range * CHEVRON_FRACTION;
  const tipX = x + Math.cos(facing) * dist;
  const tipY = y + Math.sin(facing) * dist;
  const backX = x + Math.cos(facing) * (dist - 12);
  const backY = y + Math.sin(facing) * (dist - 12);
  const px = -Math.sin(facing) * 7;
  const py = Math.cos(facing) * 7;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(backX + px, backY + py);
  ctx.lineTo(backX - px, backY - py);
  ctx.closePath();
  ctx.fillStyle = PALETTE.guard;
  ctx.fill();
}

function paintCones(ctx, s) {
  for (const cam of s.cameras) {
    paintCone(
      ctx,
      cam.x,
      cam.y,
      cam.facing,
      CAMERA.coneRange,
      CAMERA.coneHalfAngle,
      PALETTE.cameraCone,
      'rgba(255, 122, 89, 0.45)',
      true,
    );
  }
  for (const g of s.guards) {
    paintCone(
      ctx,
      g.x,
      g.y,
      g.facing,
      GUARD.coneRange,
      GUARD.coneHalfAngle,
      PALETTE.guardCone,
      PALETTE.guardConeEdge,
      false,
    );
    paintChevron(ctx, g.x, g.y, g.facing, GUARD.coneRange);
  }
}

function paintFurniture(ctx, s) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const ch = tileAt(s.room, col, row);
      const x = col * TILE;
      const y = row * TILE;
      if (ch === '#') {
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.wallTop;
        ctx.fillRect(x, y, TILE, 6);
      } else if (ch === 'X') {
        ctx.fillStyle = PALETTE.caseGlass;
        ctx.fillRect(x + 2, y + 6, 28, 20);
        ctx.strokeStyle = PALETTE.caseGold;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 6, 28, 20);
      } else if (ch === 'v') {
        ctx.fillStyle = PALETTE.vent;
        ctx.fillRect(x + 2, y + 3, 28, 26);
        ctx.strokeStyle = 'rgba(140, 160, 190, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 11);
        ctx.lineTo(x + 27, y + 11);
        ctx.moveTo(x + 5, y + 20);
        ctx.lineTo(x + 27, y + 20);
        ctx.stroke();
      } else if (ch === 'D') {
        if (s.vaultOpen) {
          ctx.fillStyle = '#0d0f14';
          ctx.fillRect(x, y, TILE, TILE);
        } else {
          ctx.fillStyle = '#2a2118';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = PALETTE.caseGold;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
          ctx.beginPath();
          ctx.moveTo(x + 11, y + 4);
          ctx.lineTo(x + 11, y + TILE - 4);
          ctx.moveTo(x + 21, y + 4);
          ctx.lineTo(x + 21, y + TILE - 4);
          ctx.stroke();
        }
      }
    }
  }
}

function paintLootIcon(ctx, item) {
  if (item.kind === 'painting') {
    ctx.fillStyle = '#1a2230';
    ctx.fillRect(item.x - 10, item.y - 13, 20, 26);
    ctx.strokeStyle = PALETTE.caseGold;
    ctx.lineWidth = 2;
    ctx.strokeRect(item.x - 10, item.y - 13, 20, 26);
    ctx.fillStyle = PALETTE.loot;
    ctx.beginPath();
    ctx.arc(item.x, item.y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.kind === 'gold') {
    ctx.fillStyle = PALETTE.loot;
    roundRectPath(ctx, item.x - 9, item.y - 5, 18, 10, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(item.x - 9, item.y + 1, 18, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(item.x - 7, item.y - 4, 14, 2);
  } else {
    ctx.fillStyle = PALETTE.loot;
    ctx.beginPath();
    ctx.arc(item.x, item.y - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(item.x - 1.5, item.y + 2, 3, 6);
    ctx.fillRect(item.x - 6, item.y + 8, 12, 3);
    ctx.strokeStyle = 'rgba(120, 85, 10, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(item.x, item.y - 4, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function paintExit(ctx, s) {
  const exit = {
    x: s.room.exit[0] * TILE + TILE / 2,
    y: s.room.exit[1] * TILE + TILE / 2,
  };
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = PALETTE.exit;
  ctx.beginPath();
  ctx.arc(exit.x, exit.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (s.screen !== SCREEN_PLAY) return;
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.lootTaken >= s.lootTarget ? 'OPEN' : 'GETAWAY', exit.x, exit.y - 24);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(`${s.lootTaken}/${s.lootTarget}`, exit.x, exit.y + 4);
}

function paintSmoke(ctx, s) {
  for (const cloud of s.smokes) {
    ctx.fillStyle = PALETTE.smoke;
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, TOOLS.smokeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220, 228, 240, 0.25)';
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, TOOLS.smokeRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintGuards(ctx, s) {
  for (const g of s.guards) {
    ctx.fillStyle = PALETTE.guard;
    ctx.beginPath();
    ctx.arc(g.x, g.y, GUARD.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const fx = Math.cos(g.facing);
    const fy = Math.sin(g.facing);
    const px = -fy;
    const py = fx;
    ctx.fillStyle = '#ffffff';
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.arc(g.x + fx * 4 + px * 4.5 * side, g.y + fy * 4 + py * 4.5 * side, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (g.state === 'investigate' || g.state === 'scan') {
      ctx.fillStyle = PALETTE.loot;
      ctx.font = `700 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('?', g.x, g.y - 20);
    } else if (g.state === 'chase') {
      ctx.fillStyle = PALETTE.guard;
      ctx.font = `700 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', g.x, g.y - 20);
    }
  }
}

function paintCameras(ctx, s) {
  for (const cam of s.cameras) {
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.rotate(cam.facing);
    ctx.fillStyle = cam.disabledLeft > 0 ? '#5a5148' : PALETTE.camera;
    roundRectPath(ctx, -8, -5, 16, 10, 3);
    ctx.fill();
    ctx.fillStyle = '#1a1210';
    ctx.beginPath();
    ctx.arc(5, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function paintCoins(ctx, s) {
  for (const coin of s.coins) {
    ctx.fillStyle = PALETTE.loot;
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 85, 10, 0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function paintPlayer(ctx, s) {
  const p = s.player;
  ctx.fillStyle = p.sneaking ? PALETTE.playerSneak : PALETTE.player;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x - PLAYER.radius, p.y - PLAYER.radius, PLAYER.radius * 2, PLAYER.radius + 1);
  ctx.clip();
  ctx.fillStyle = '#14100c';
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
  ctx.stroke();
  if (s.lockpick.active) {
    const frac = Math.min(1, s.lockpick.progress / 1.5);
    ctx.fillStyle = 'rgba(10, 12, 18, 0.8)';
    ctx.fillRect(p.x - 20, p.y - 26, 40, 5);
    ctx.fillStyle = PALETTE.loot;
    ctx.fillRect(p.x - 20, p.y - 26, 40 * frac, 5);
  }
}

function paintHud(ctx, s) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(s.room.name.toUpperCase(), 16, 18);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `12px ${FONT}`;
  ctx.fillText(
    `Room ${s.roomIndex + 1}/3 · ${money(s.lootValue)} · Best ${money(s.best)}`,
    16,
    36,
  );

  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('ALARM', 471, 18);
  ctx.fillStyle = '#20242f';
  ctx.fillRect(ALARM_BAR_X, ALARM_BAR_Y, ALARM_BAR_WIDTH, ALARM_BAR_HEIGHT);
  const frac = Math.min(1, Math.max(0, s.alarm / 100));
  if (frac > 0) {
    ctx.fillStyle =
      s.alarm < 35 ? PALETTE.alarmLow : s.alarm < 70 ? PALETTE.alarmMid : PALETTE.alarmHigh;
    ctx.fillRect(ALARM_BAR_X, ALARM_BAR_Y, ALARM_BAR_WIDTH * frac, ALARM_BAR_HEIGHT);
  }
  const word = s.alarm < 35 ? 'quiet' : s.alarm < 100 ? 'SUSPICIOUS' : 'LOCKDOWN';
  ctx.fillStyle =
    s.alarm < 35 ? PALETTE.muted : s.alarm < 70 ? PALETTE.alarmMid : PALETTE.alarmHigh;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(word, ALARM_BAR_X + ALARM_BAR_WIDTH / 2, 36);

  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.loot;
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(`◆ ${s.lootTaken}/${s.lootTarget}`, 790, 18);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `12px ${FONT}`;
  const dots = '●'.repeat(s.triesLeft) + '○'.repeat(Math.max(0, 3 - s.triesLeft));
  ctx.fillText(`Tries ${dots}`, 790, 36);

  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `12px ${FONT}`;
  ctx.fillText(
    `[1] EMP ×${s.tools.emp}  [2] Smoke ×${s.tools.smoke}  [Click] Coin ×${s.tools.coin}`,
    1264,
    18,
  );
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `11px ${FONT}`;
  ctx.fillText('WASD move · Shift sneak · Space sprint · E lockpick · P pause', 1264, 36);
}

function paintBanner(ctx, s) {
  if (s.screen === SCREEN_TITLE || s.roomTime >= BANNER_SECONDS) return;
  ctx.fillStyle = 'rgba(10, 12, 18, 0.65)';
  roundRectPath(ctx, 640 - 115, 85, 230, 30, 8);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.room.name, 640, 105);
}

function paintLegend(ctx) {
  ctx.strokeStyle = PALETTE.guard;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, 707);
  ctx.lineTo(48, 707);
  ctx.stroke();
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('guard eyes', 53, 712);
  ctx.strokeStyle = PALETTE.camera;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(140, 707);
  ctx.lineTo(172, 707);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('camera sweep', 177, 712);
}

function paintOverlay(ctx, s) {
  if (s.screen === SCREEN_PLAY) return;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  if (s.screen === SCREEN_TITLE) {
    ctx.fillStyle = PALETTE.loot;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText('THE GILDED VAULT', 640, 258);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    const lines = [
      'Marlow the thief. Three rooms. One idol. No alarms — if you are good.',
      'Slip past guards and cameras, pocket the loot, reach the getaway van.',
      'WASD move · Shift sneak · Space sprint · 1 EMP · 2 Smoke · Click: toss a coin',
      'E picks the vault lock · P pauses',
    ];
    lines.forEach((line, i) => ctx.fillText(line, 640, 312 + i * 36));
    ctx.fillText('Press Space or click to start the heist.', 640, 458);
  } else if (s.screen === SCREEN_CAUGHT) {
    ctx.fillStyle = PALETTE.alarmHigh;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText('CAUGHT!', 640, 258);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    const word = s.triesLeft === 1 ? 'try' : 'tries';
    ctx.fillText(`A guard laid hands on Marlow. ${s.triesLeft} ${word} left.`, 640, 312);
    ctx.fillText('Press Space to try this room again.', 640, 348);
  } else if (s.screen === SCREEN_WIN) {
    ctx.fillStyle = PALETTE.loot;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText('THE IDOL IS YOURS', 640, 258);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    ctx.fillText(
      `Three rooms, one getaway: ${money(s.lootValue)} in ${Math.round(s.totalTime)}s.`,
      640,
      312,
    );
    ctx.fillText('Marlow vanishes into the night. Press Space to run it again.', 640, 348);
  } else if (s.screen === SCREEN_GAME_OVER) {
    ctx.fillStyle = PALETTE.alarmHigh;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText('CAUGHT FOR GOOD', 640, 258);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    ctx.fillText('Out of tries. The estate keeps its gold.', 640, 312);
    ctx.fillText('Press Space to run it again.', 640, 348);
  } else if (s.screen === SCREEN_PAUSED) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText('PAUSED', 640, 258);
    ctx.font = `19px ${FONT}`;
    ctx.fillText('Press P to resume the heist.', 640, 312);
  }
}

function paintDoorLabel(ctx, s) {
  if (s.screen !== SCREEN_PLAY || s.doorTiles.length === 0) return;
  let cx = 0;
  let cy = 0;
  for (const door of s.doorTiles) {
    cx += door.x;
    cy += door.y;
  }
  cx /= s.doorTiles.length;
  cy /= s.doorTiles.length;
  ctx.fillStyle = PALETTE.caseGold;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.vaultOpen ? 'OPEN' : 'VAULT', cx, cy - 24);
}

export function drawScene(ctx, world) {
  const s = world.state;
  ctx.fillStyle = PALETTE.backdrop;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  paintFloor(ctx, s);
  paintCones(ctx, s);
  paintFurniture(ctx, s);
  for (const item of s.loot) {
    if (!item.taken) paintLootIcon(ctx, item);
  }
  paintExit(ctx, s);
  paintSmoke(ctx, s);
  paintGuards(ctx, s);
  paintCameras(ctx, s);
  paintCoins(ctx, s);
  paintPlayer(ctx, s);
  paintDoorLabel(ctx, s);
  paintOverlay(ctx, s);
  paintHud(ctx, s);
  paintBanner(ctx, s);
  if (s.screen === SCREEN_PLAY) paintLegend(ctx);
}

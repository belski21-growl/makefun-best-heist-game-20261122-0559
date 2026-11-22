// The Gilded Vault — the hand-in program for make.fun's "Make the best heist
// game" bounty. Node 22, standard library only. The game itself is plain
// static files under game/ (game/index.html plus its ES modules, no library,
// no network request at runtime); this program copies game/ and screenshots/
// next to it into /output and writes /output/dossier.json with the vendored
// make.fun library, so the judge can read the game from the dossier.
//
// Play it locally with `node serve.ts` (http://localhost:8080). Outside the
// grader's container MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Two runs write byte-identical /output (same files in, same dossier out);
// see build-log.md for the validation runs.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

const MAX_SHOT_BYTES = 262144;
const MAX_GAME_FILES = 993;
const MAX_GAME_BYTES = 50331648;
const MAX_PATH_BYTES = 1000;

/** Count every file and directory under a directory, recursively. */
function countEntries(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += 1;
    if (entry.isDirectory()) total += countEntries(join(dir, entry.name));
  }
  return total;
}

function gameBytes(dir) {
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) bytes += gameBytes(path);
    else bytes += statSync(path).size;
  }
  return bytes;
}

/**
 * Refuse a hand-in the gate would refuse, with a readable reason, before any
 * file is copied: a missing game/index.html, the wrong number of screenshots,
 * an oversized screenshot, or a game/ over the file/path caps. Nothing here
 * changes the bytes of a valid entry — it only fails loudly instead of
 * handing in something the scorer would reject.
 */
function preflight() {
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('preflight: game/index.html is missing');
  }
  if (!existsSync(shotsDir)) throw new Error('preflight: screenshots/ is missing');
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`preflight: expected 3-4 screenshots, found ${shots.length}`);
  }
  for (const shot of shots) {
    const size = statSync(join(shotsDir, shot)).size;
    if (size > MAX_SHOT_BYTES) {
      throw new Error(`preflight: ${shot} is ${size} bytes (cap ${MAX_SHOT_BYTES})`);
    }
  }
  const entries = countEntries(gameDir);
  if (entries > MAX_GAME_FILES) {
    throw new Error(`preflight: game/ holds ${entries} entries (cap ${MAX_GAME_FILES})`);
  }
  if (gameBytes(gameDir) > MAX_GAME_BYTES) {
    throw new Error('preflight: game/ is over the 48 MiB cap');
  }
  for (const name of readdirSync(gameDir, { withFileTypes: true })) {
    if (Buffer.byteLength(join(gameDir, name.name), 'utf8') > MAX_PATH_BYTES) {
      throw new Error(`preflight: path under game/ over ${MAX_PATH_BYTES} bytes: ${name.name}`);
    }
  }
}

preflight();

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the rest mirror what the gate refuses, so a preflighted entry cannot
// trip them (more than 4 screenshots or one over 256 KiB; more than 993 files
// in game/ or 48 MiB of game files in all, or a path under game/ over 1000
// bytes; game/ counts beside /output's own 1000-entry cap, its screenshots/
// and dossier.json).
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: MAX_SHOT_BYTES },
    game_max_files: MAX_GAME_FILES,
    game_max_bytes: MAX_GAME_BYTES,
    game_path_max_bytes: MAX_PATH_BYTES,
  }),
);

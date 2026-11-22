# Top-10 analysis — best-heist-game-20261122-0559 ("The Gilded Vault")

Written 22 Nov 2026 ~14:35 WIB, post-open revision (revisi-1). Competition: opens
22 Nov 12:59 WIB, deadline 23 Nov 00:59 WIB, $50 (top 10: $12/$8/$6/$5/$4/$3×5),
3,280 submissions, escrow $50 funded on Solana.

## What could actually be observed (honest limitation)

The leaderboard is BLIND: `GET /api/competitions/<slug>/leaderboard` returns
`entries: []`, `metrics_withheld: true`; `GET .../rounds` returns `judged: 0`,
first blind round at 08:59 UTC (15:59 WIB — after this analysis). The bounty
page shows no Feed entries yet. **No live top-10 entry could be seen, so there
is no top-10 screenshot/style list to copy.** This analysis is therefore built
on (a) the judge's five published criteria, (b) the one known house baseline —
the kit starter, whose dossier is byte-for-byte house game #2 — and (c) the
field facts (3,280 submissions, final cut = top 40 on the dev board).

## The known baseline: kit starter "Block Dodger" (house game #2)

- 623 lines, 4 screens (title/play/paused/game over), one mechanic: dodge
  falling blocks, collect dots. No guards, no vision cones, no cameras, no
  loot target, no alarm meter, no rooms, no tools, no lockpick, no getaway.
- It fails judge criterion 1 outright (not a heist game at all) and scores
  ~zero on criteria 2–4. Any complete heist game beats it by a wide margin;
  it is the floor, not the bar. The real bar is the other complete entries.

## Our entry vs the judge's five criteria

1. **Complete heist game in one frame (most important): PASS, strong.**
   Cover (1-play.jpg) shows mid-heist in the Vault Corridor: the thief, 3
   patrolling guards with red raycast vision cones, 2 sweeping cameras with
   orange cones, gold loot, the green GETAWAY door, and the ALARM meter in
   the HUD — all in one 1280×720 frame. 2-start shows the title over the
   Marble Gallery; 3-caught shows the CAUGHT screen with tries left; 4-win
   shows the win screen ($73,000 in 77s). All four screenshots are real
   renders of the game's own code (re-shot post-revision: byte-identical PNGs,
   0 console errors; pixel diff vs the submitted JPEGs is ~1.0 mean abs =
   JPEG noise only).
2. **Fun and depth: PASS.** 3 rooms with different layouts (gallery /
   corridor / vault); several routes per room (main hall, shadow strips with
   0.5× detection, hidden vents with 0× detection but 0.6× speed); 4 tools at
   a cost (EMP ×2 blacks cameras 8s but +10 alarm; smoke ×2 blinds cones;
   coin ×3 pulls a guard to investigate — NEW in revisi-1 the guard then
   scans a full 360° before returning, so a coin buys time but not a free
   pass; lockpick is a 1.5s stand-still channel on the vault door); guard
   states patrol → suspicious → investigate → chase, lockdown at alarm 100;
   stamina-managed sprint vs sneak. Winnable AND losable, both proven by
   autopilot (BFS pilot wins 3 rooms, 77s, $73,000, 0 caught, 3 tries left;
   reckless pilot gets caught).
3. **Feel and polish: PASS, good.** Cones sweep visibly (cameras sine-sweep,
   guards rotate at waypoints); caught moment is fair (0.25s touch grace +
   3 tries + room restart, alarm resets to 30 not 100); getaway pays off
   (loot total + time on the win screen, best-loot persisted in
   localStorage); synthesised WebAudio (footsteps, coin, loot chime, EMP zap,
   alarm, lockdown sting, win motif); pause on tab-hide; screen-reader
   status announcements.
4. **Look and originality: PASS with one noted weakness.** Original names
   (Marlow, Velmora estate, Gilded Idol), gold-on-near-black palette, loot
   icons (painting/gold/idol) and danger/safety colours read at a glance in a
   shrunken contact sheet. WEAKNESS: the floor itself is a plain two-tone
   checkerboard tile set — the judge explicitly warns against "a generic
   top-down tile set". The gold/red/green overlay language carries the look,
   but the floor is the least original visual element. No commercial game is
   copied (names, art, levels all original).
5. **Structure: PASS, strong.** 10 game modules with one clear job each,
   named for what they do (config, random, input, level, guard, world,
   render, audio, shots, main) + main.ts hand-in + serve.ts; dossier
   373,663 bytes (< 1.5 MiB); all 11 game sources in the dossier text;
   vendor/makefun-game.ts unchanged (kit sha256
   dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129).

## Field reading

- 3,280 submissions in a 12-hour window. Most entries in a field this large
  are thin (starter clones, incomplete games, single-room toys): the gate +
  judge criterion 1 cut most of them. A complete, winnable, demonstrably
  losable game with all five criterion-1 elements in one frame should clear
  the top-40 dev-board cut for the final heat. The top-10 prize line is a
  different fight: it needs beating the other complete, polished games, where
  criterion 4 (look/originality) and criterion 2 (depth) decide. Our
  sharpest edge is completeness + proven winnability; our softest spot is
  the generic checkerboard floor (criterion 4).
- Blind rounds mean no provisional rank exists yet for anyone; the first
  judged round lands 15:59 WIB. Nothing to chase yet — the honest move is
  to submit a complete entry now and watch round 1.

## What revisi-1 changed (vs the pre-open build)

- Guard coin-scan: after a coin toss, the investigating guard does a full
  360° look-around scan on arrival before resuming patrol (guard.js new
  GUARD_SCAN state + config scanSpeed; world.js sets coinCheck; render.js
  draws the '?' marker). Verified in Node: guard reaches scan, then patrol.
- main.ts rewritten with a preflight that refuses a hand-in the gate would
  refuse (missing index.html, wrong screenshot count/size, game/ over caps).
- Full distinct rewrite of main.ts + all 10 game modules + level.js defs +
  README in the post-open session (reproduces support), with behaviour
  preserved: autopilot still wins 77s / $73,000 / 0 caught; screenshots
  pixel-identical (see validation in build-log.md).

## Verdict sought from Goldfish

Does this entry, as it stands, deserve LAYAK SUBMIT — and, honestly, what
rank range (of 3,280) and what chance of top 40 / top 10? Per the user's
standing rules: peluang top-50 lower bound must be ≥30% (target 50%+), and
the revision target is an estimated rank of 20–30. If the honest estimate
is still rank ≥50, the revision has not done its job and one more
highest-impact improvement round is needed before calling it ready.

// The three rooms of the heist. Every row is 40 tiles, the player start
// reaches all loot + exit by BFS, and every patrol leg runs through open
// tiles only (checked at import by checkRoom, and by the build log's map
// validation). Legend: # wall, X glass case, . floor, s shadow (harder to
// spot), v vent (hidden, slow), D locked vault door (opens with the
// lockpick, key E).
export const ROOMS = [
  {
    name: 'The Marble Gallery', target: 3, player: [3, 19], exit: [37, 19],
    loot: [[8, 2, 'painting'], [20, 2, 'painting'], [32, 2, 'painting']],
    guards: [
      { waypoints: [[6, 8], [33, 8]], pause: 1.2 },
      { waypoints: [[15, 4], [15, 17]], pause: 0.8 },
    ],
    cameras: [{ tile: [20, 1], base: 1.5707963267948966, sweep: 0.9 }],
    map: [
      '########################################',
      '#.ssssssssssssssssssssssssssssssssssss.#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#.....XXXXXX....XXXXXX....XXXXXX.......#',
      '#......................................#',
      '#..................#...................#',
      '#......................................#',
      '#......................................#',
      '#........XXXXXX........XXXXXX..........#',
      '#......................................#',
      '#..................#...................#',
      '#......................................#',
      '#......................................#',
      '#.....XXXXXX....XXXXXX....XXXXXX.......#',
      '#......................................#',
      '#......................................#',
      '#...vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv...#',
      '#......................................#',
      '#.ssssssssssssssssssssssssssssssssssss.#',
      '########################################',
    ],
  },
  {
    name: 'The Vault Corridor', target: 4, player: [3, 10], exit: [37, 10],
    loot: [[5, 2, 'gold'], [34, 2, 'gold'], [5, 19, 'gold'], [34, 19, 'gold']],
    guards: [
      { waypoints: [[6, 3], [6, 18]], pause: 1 },
      { waypoints: [[19, 10], [26, 12], [33, 10]], pause: 1 },
      { waypoints: [[33, 3], [33, 18]], pause: 1 },
    ],
    cameras: [
      { tile: [12, 10], base: 0, sweep: 1.1 },
      { tile: [27, 10], base: 3.141592653589793, sweep: 1.1 },
    ],
    map: [
      '########################################',
      '#.sssssssss............................#',
      '#...........#......vv......#...........#',
      '#...........#..............#...........#',
      '#...........#..............#...........#',
      '#...........#....XXXXXX....#...........#',
      '#...........#..............#...........#',
      '#...........#......vv......#...........#',
      '#...........#..............#...........#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#...........#..............#...........#',
      '#...........#......vv......#...........#',
      '#...........#..............#...........#',
      '#...........#....XXXXXX....#...........#',
      '#...........#..............#...........#',
      '#...........#..............#...........#',
      '#...........#......vv......#...........#',
      '#.sssss......................sssssssss.#',
      '########################################',
    ],
  },
  {
    name: 'The Gilded Vault', target: 3, player: [3, 19], exit: [37, 19],
    loot: [[19, 7, 'idol'], [6, 3, 'gold'], [33, 3, 'gold']],
    guards: [
      { waypoints: [[6, 13], [33, 13]], pause: 1 },
      { waypoints: [[10, 16], [29, 16]], pause: 1.2 },
      { waypoints: [[19, 13], [19, 19]], pause: 0.8 },
    ],
    cameras: [
      { tile: [14, 3], base: 1.5707963267948966, sweep: 0.8 },
      { tile: [25, 3], base: 1.5707963267948966, sweep: 0.8 },
    ],
    vaultDoor: [19, 11],
    map: [
      '########################################',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#.............############.............#',
      '#....XXXX.....#..........#.....XXXX....#',
      '#.............#..........#.............#',
      '#..........#..#..........#..#..........#',
      '#.............#..........#.............#',
      '#.............#..........#.............#',
      '#.............#..........#.............#',
      '#.............#####DD#####.............#',
      '#......................................#',
      '#......................................#',
      '#..........#................#..........#',
      '#......................................#',
      '#....XXXX......................XXXX....#',
      '#......................................#',
      '#...vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv...#',
      '#......................................#',
      '#.ssssssssssssssssssssssssssssssssssss.#',
      '########################################',
    ],
  },
];

/** A room's map is sound when it is 22 rows of 40 tiles: anything else is a
 *  data error, and the game refuses to start on it rather than play broken. */
function checkRoom(room) {
  if (room.map.length !== 22) throw new Error(`${room.name}: map has ${room.map.length} rows, expected 22`);
  for (const row of room.map) {
    if (row.length !== 40) throw new Error(`${room.name}: map row ${row.length} tiles, expected 40`);
  }
}
for (const room of ROOMS) checkRoom(room);

export function tileAt(room, col, row) {
  if (col < 0 || row < 0 || col >= 40 || row >= 22) return '#';
  return room.map[row][col];
}

/** Tiles that stop movement: walls, glass cases, and the vault door while locked. */
const SOLID = new Set(['#', 'X']);

export function blocksMove(room, col, row, vaultOpen) {
  const t = tileAt(room, col, row);
  if (SOLID.has(t)) return true;
  if (t === 'D') return !vaultOpen;
  return false;
}

/** Sight is blocked by exactly what blocks movement. */
export function blocksSight(room, col, row, vaultOpen) {
  return blocksMove(room, col, row, vaultOpen);
}

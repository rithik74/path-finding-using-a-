/**
 * astar.js — Pure A* Algorithm Logic
 * Completely decoupled from rendering / UI
 *
 * Exports:
 *   runAstar(grid, start, end, options) → { path, explored, cost, nodesExplored }
 *   heuristics  – map of name → function
 */

"use strict";

/* -------------------------------------------------------
   Min-Heap (Priority Queue) for the open list
   Each item: { node, f }
   ------------------------------------------------------- */
class MinHeap {
  constructor() { this._data = []; }

  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this._data.length; }
  isEmpty()  { return this._data.length === 0; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[parent].f <= this._data[i].f) break;
      [this._data[parent], this._data[i]] = [this._data[i], this._data[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let min = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[min].f) min = l;
      if (r < n && this._data[r].f < this._data[min].f) min = r;
      if (min === i) break;
      [this._data[min], this._data[i]] = [this._data[i], this._data[min]];
      i = min;
    }
  }
}

/* -------------------------------------------------------
   Heuristics
   All accept (r1,c1, r2,c2) and return a non-negative value.
   MUST be admissible (never overestimate) to guarantee optimality.
   ------------------------------------------------------- */
const heuristics = {
  manhattan(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2);
  },
  euclidean(r1, c1, r2, c2) {
    return Math.sqrt((r1 - r2) ** 2 + (c1 - c2) ** 2);
  },
  chebyshev(r1, c1, r2, c2) {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
  }
};

/* -------------------------------------------------------
   Neighbour Generator
   Returns valid neighbours of cell (row, col) in the grid.
   Supports 4-directional and 8-directional (diagonal) movement.
   Diagonal moves have cost √2 ≈ 1.414 for true Euclidean cost.
   ------------------------------------------------------- */
function getNeighbours(row, col, rows, cols, allowDiagonal) {
  const dirs4 = [[-1,0],[1,0],[0,-1],[0,1]];
  const dirsDiag = [[-1,-1],[-1,1],[1,-1],[1,1]];

  const dirs = allowDiagonal ? [...dirs4, ...dirsDiag] : dirs4;
  const neighbours = [];

  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const isDiag = dr !== 0 && dc !== 0;
    const cost   = isDiag ? Math.SQRT2 : 1;
    neighbours.push({ row: nr, col: nc, cost });
  }
  return neighbours;
}

/* -------------------------------------------------------
   A* Core Algorithm
   
   @param {boolean[][]} wallMap   – wallMap[r][c] = true → blocked
   @param {{row,col}} start
   @param {{row,col}} end
   @param {object} options
     @param {boolean} options.diagonal   – allow diagonal moves
     @param {string}  options.heuristic  – key into heuristics map
   
   @returns {object}
     path          – [{row,col}] from start→end (empty if not found)
     explored      – [{row,col}] in order they were CLOSED
     openTrace     – [{row,col}] in order they entered the OPEN list
     cost          – total path cost (0 = not found)
     nodesExplored – count of closed nodes
   ------------------------------------------------------- */
function runAstar(wallMap, start, end, options = {}) {
  const { diagonal = false, heuristic: hName = 'manhattan' } = options;
  const h = heuristics[hName] || heuristics.manhattan;

  const rows = wallMap.length;
  const cols = wallMap[0].length;

  // Key helpers
  const key = (r, c) => r * 1000 + c;
  const endKey = key(end.row, end.col);

  // Per-node data stored in flat maps (faster than 2D arrays for sparse graphs)
  const gScore  = new Map();  // key → g value
  const fScore  = new Map();  // key → f value
  const parent  = new Map();  // key → {row,col}
  const closedSet = new Set();

  // Open list (min-heap on f)
  const openHeap = new MinHeap();
  const inOpen   = new Map(); // key → best f when added (lazy deletion)

  const startKey = key(start.row, start.col);
  gScore.set(startKey, 0);
  const startH = h(start.row, start.col, end.row, end.col);
  fScore.set(startKey, startH);
  openHeap.push({ row: start.row, col: start.col, f: startH });
  inOpen.set(startKey, startH);

  // Tracking for visualization
  const explored  = [];  // nodes removed from open (closed)
  const openTrace = [{ row: start.row, col: start.col }]; // nodes added to open

  while (!openHeap.isEmpty()) {
    // Get node with smallest f (lazy-delete stale entries)
    let current;
    while (!openHeap.isEmpty()) {
      current = openHeap.pop();
      const ck = key(current.row, current.col);
      // Skip if already closed or if a better version was added later
      if (closedSet.has(ck)) continue;
      if (inOpen.get(ck) !== current.f) continue;
      break;
    }
    if (!current) break;

    const ck = key(current.row, current.col);

    // Goal reached!
    if (ck === endKey) {
      // Reconstruct path
      const path = [];
      let cur = { row: current.row, col: current.col };
      while (cur) {
        path.unshift(cur);
        const pk = key(cur.row, cur.col);
        cur = parent.get(pk);
      }
      return {
        path,
        explored,
        openTrace,
        cost: parseFloat(gScore.get(endKey).toFixed(2)),
        nodesExplored: closedSet.size + 1
      };
    }

    closedSet.add(ck);
    explored.push({ row: current.row, col: current.col });

    for (const nb of getNeighbours(current.row, current.col, rows, cols, diagonal)) {
      const nk = key(nb.row, nb.col);
      if (closedSet.has(nk)) continue;
      if (wallMap[nb.row][nb.col]) continue;

      const newG = (gScore.get(ck) || 0) + nb.cost;
      const oldG = gScore.get(nk);

      if (oldG === undefined || newG < oldG) {
        parent.set(nk, { row: current.row, col: current.col });
        gScore.set(nk, newG);
        const f = newG + h(nb.row, nb.col, end.row, end.col);
        fScore.set(nk, f);
        openHeap.push({ row: nb.row, col: nb.col, f });
        inOpen.set(nk, f);
        if (oldG === undefined) {
          openTrace.push({ row: nb.row, col: nb.col });
        }
      }
    }
  }

  // No path found
  return { path: [], explored, openTrace, cost: 0, nodesExplored: closedSet.size };
}

/**
 * grid.js — Grid State Management
 * 
 * Responsible for:
 *  - Creating and resetting grid data
 *  - Managing cell types (empty, wall, start, end)
 *  - Random maze generation (recursive backtracking)
 */

"use strict";

/* -------------------------------------------------------
   Cell States
   ------------------------------------------------------- */
const CellState = Object.freeze({
  EMPTY:   0,
  WALL:    1,
  START:   2,
  END:     3,
  OPEN:    4,  // In open list during A* (visualization)
  CLOSED:  5,  // In closed list during A* (visualization)
  PATH:    6   // Final path
});

/* -------------------------------------------------------
   GridModel — represents the logical grid state
   ------------------------------------------------------- */
class GridModel {
  /**
   * @param {number} rows
   * @param {number} cols
   */
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.cells = [];    // 2D array of CellState
    this.startCell = null;
    this.endCell   = null;
    this._init();
  }

  /* ---------- Initialisation ---------- */
  _init() {
    this.cells = Array.from({ length: this.rows }, () =>
      new Array(this.cols).fill(CellState.EMPTY)
    );
    // Place default start and end
    this.setCell(Math.floor(this.rows / 2), 2, CellState.START);
    this.setCell(Math.floor(this.rows / 2), this.cols - 3, CellState.END);
  }

  /* ---------- Public API ---------- */

  /** Set a cell to a given state, respecting start/end tracking. */
  setCell(row, col, state) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;

    // Clear previous start/end
    if (state === CellState.START && this.startCell) {
      this.cells[this.startCell.row][this.startCell.col] = CellState.EMPTY;
    }
    if (state === CellState.END && this.endCell) {
      this.cells[this.endCell.row][this.endCell.col] = CellState.EMPTY;
    }

    // Remove start/end tracking if we're overwriting those cells
    if (this.startCell && this.startCell.row === row && this.startCell.col === col) {
      this.startCell = null;
    }
    if (this.endCell && this.endCell.row === row && this.endCell.col === col) {
      this.endCell = null;
    }

    this.cells[row][col] = state;

    if (state === CellState.START) this.startCell = { row, col };
    if (state === CellState.END)   this.endCell   = { row, col };
  }

  getCell(row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return -1;
    return this.cells[row][col];
  }

  /** Reset all visualization states (open/closed/path) but keep walls/start/end. */
  clearPath() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const st = this.cells[r][c];
        if (st === CellState.OPEN || st === CellState.CLOSED || st === CellState.PATH) {
          this.cells[r][c] = CellState.EMPTY;
        }
      }
    }
  }

  /** Full reset — walls, path, everything. */
  reset() {
    this.startCell = null;
    this.endCell   = null;
    this._init();
  }

  /** Resize the grid, preserving start/end if still in bounds. */
  resize(newRows, newCols) {
    const oldStart = this.startCell;
    const oldEnd   = this.endCell;
    this.rows = newRows;
    this.cols = newCols;
    this.startCell = null;
    this.endCell   = null;
    this.cells = Array.from({ length: newRows }, () =>
      new Array(newCols).fill(CellState.EMPTY)
    );
    // Re-place default positions
    this.setCell(Math.floor(newRows / 2), 2, CellState.START);
    this.setCell(Math.floor(newRows / 2), newCols - 3, CellState.END);
  }

  /** Build a boolean wall-map compatible with the A* algorithm. */
  buildWallMap() {
    return this.cells.map(row => row.map(c => c === CellState.WALL));
  }

  /* ---------- Maze Generation ----------
     Algorithm: Recursive Backtracking (Perfect Maze)
     Works on an odd-dimension grid for clean passages.
     -------------------------------------------- */
  generateMaze() {
    const rows = this.rows;
    const cols = this.cols;

    // Fill everything with walls
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        this.cells[r][c] = CellState.WALL;

    this.startCell = null;
    this.endCell   = null;

    // Use recursive backtracking on "maze cells" at even offsets
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

    const inBounds = (r, c) => r > 0 && r < rows - 1 && c > 0 && c < cols - 1;

    const carve = (r, c) => {
      visited[r][c] = true;
      this.cells[r][c] = CellState.EMPTY;

      // Neighbours 2 steps away (maze cells)
      const dirs = [[-2,0],[2,0],[0,-2],[0,2]].sort(() => Math.random() - 0.5);
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc) || visited[nr][nc]) continue;
        // Carve the wall between
        this.cells[r + dr/2][c + dc/2] = CellState.EMPTY;
        carve(nr, nc);
      }
    };

    // Start from a random odd cell
    const startR = 1 + 2 * Math.floor(Math.random() * Math.floor((rows - 1) / 2));
    const startC = 1 + 2 * Math.floor(Math.random() * Math.floor((cols - 1) / 2));
    carve(startR, startC);

    // Place start and end in open (carved) cells
    const openCells = [];
    for (let r = 1; r < rows - 1; r++)
      for (let c = 1; c < cols - 1; c++)
        if (this.cells[r][c] === CellState.EMPTY) openCells.push({ row: r, col: c });

    // Shuffle and pick far-apart positions
    openCells.sort(() => Math.random() - 0.5);
    const s = openCells[0];
    // Find the cell farthest from s (Manhattan distance)
    let farthest = openCells[1];
    let maxDist = 0;
    for (const cell of openCells) {
      const d = Math.abs(cell.row - s.row) + Math.abs(cell.col - s.col);
      if (d > maxDist) { maxDist = d; farthest = cell; }
    }

    this.setCell(s.row, s.col, CellState.START);
    this.setCell(farthest.row, farthest.col, CellState.END);
  }

  /** Add random obstacles (scatter mode — not a perfect maze). */
  generateScatter(density = 0.3) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const st = this.cells[r][c];
        if (st === CellState.START || st === CellState.END) continue;
        this.cells[r][c] = Math.random() < density ? CellState.WALL : CellState.EMPTY;
      }
    }
    // Ensure start/end cells are preserved
    if (this.startCell) this.cells[this.startCell.row][this.startCell.col] = CellState.START;
    if (this.endCell)   this.cells[this.endCell.row][this.endCell.col]   = CellState.END;
  }
}

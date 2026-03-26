/**
 * visualizer.js — Canvas Renderer
 *
 * Responsible for:
 *   - Drawing the grid onto the <canvas>
 *   - Step-by-step animation of the A* algorithm
 *   - Cell colour mapping and glow effects
 */

"use strict";

/* -------------------------------------------------------
   Colour palette (synced with CSS variables)
   ------------------------------------------------------- */
const COLORS = {
  [CellState.EMPTY]:   null,          // drawn as checkerboard
  [CellState.WALL]:    '#0f172a',
  [CellState.START]:   '#22c55e',
  [CellState.END]:     '#ef4444',
  [CellState.OPEN]:    '#3b82f6',
  [CellState.CLOSED]:  '#7c3aed',
  [CellState.PATH]:    '#fbbf24',
};

// Glow colours for special cells
const GLOW = {
  [CellState.START]:  'rgba(34,197,94,0.6)',
  [CellState.END]:    'rgba(239,68,68,0.6)',
  [CellState.OPEN]:   'rgba(59,130,246,0.4)',
  [CellState.CLOSED]: 'rgba(124,58,237,0.4)',
  [CellState.PATH]:   'rgba(251,191,36,0.5)',
};

// Checkerboard shades for empty cells
const EMPTY_A = '#1e293b';
const EMPTY_B = '#1a2438';
const GRID_LINE = 'rgba(148,163,184,0.05)';

/* -------------------------------------------------------
   Speed settings (ms delay per step)
   ------------------------------------------------------- */
const SPEED_MAP = {
  1: 80,   // very slow
  2: 30,
  3: 12,
  4: 4,
  5: 0    // instant-ish (still uses rAF chunking)
};

const SPEED_LABELS = {
  1: 'Very Slow',
  2: 'Slow',
  3: 'Medium',
  4: 'Fast',
  5: 'Blazing'
};

/* -------------------------------------------------------
   GridRenderer — canvas drawing layer
   ------------------------------------------------------- */
class GridRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {GridModel} model
   */
  constructor(canvas, model) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.model  = model;
    this.cellSize = 0;
    this._dirty = new Set(); // cells needing repaint

    this._resize();
  }

  /* ---------- Setup ---------- */
  _resize() {
    // Sidebar is 280px, header ~50px, canvas-area padding 32px total
    const SIDEBAR  = 280;
    const HEADER   = 52;
    const PAD      = 64;   // 32px each side
    const HINT_BAR = 80;   // status bar + hint text

    const maxW = window.innerWidth  - SIDEBAR - PAD;
    const maxH = window.innerHeight - HEADER  - PAD - HINT_BAR;

    const rows = this.model.rows;
    const cols = this.model.cols;

    // Pick the largest integer cell size that fits in both dimensions
    this.cellSize = Math.max(8, Math.floor(Math.min(maxW / cols, maxH / rows)));

    const w = this.cellSize * cols;
    const h = this.cellSize * rows;

    this.canvas.width  = w;
    this.canvas.height = h;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  /** Full grid redraw. */
  drawAll() {
    const { ctx, model, cellSize } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let r = 0; r < model.rows; r++) {
      for (let c = 0; c < model.cols; c++) {
        this._drawCell(r, c);
      }
    }
  }

  /** Draw a single cell (by row/col). */
  _drawCell(row, col) {
    const { ctx, model, cellSize } = this;
    const state = model.getCell(row, col);
    const x = col * cellSize;
    const y = row * cellSize;
    const s = cellSize;

    // Background
    if (state === CellState.EMPTY) {
      ctx.fillStyle = (row + col) % 2 === 0 ? EMPTY_A : EMPTY_B;
    } else {
      ctx.fillStyle = COLORS[state] || EMPTY_A;
    }

    const pad   = state === CellState.EMPTY || state === CellState.WALL ? 0 : Math.max(1, s * 0.08);
    const inner = s - pad * 2;
    const radius = state === CellState.EMPTY || state === CellState.WALL
      ? 0
      : Math.max(2, s * 0.18);

    // Draw rounded rect for non-empty
    if (radius > 0) {
      ctx.beginPath();
      ctx.moveTo(x + pad + radius, y + pad);
      ctx.lineTo(x + pad + inner - radius, y + pad);
      ctx.quadraticCurveTo(x + pad + inner, y + pad, x + pad + inner, y + pad + radius);
      ctx.lineTo(x + pad + inner, y + pad + inner - radius);
      ctx.quadraticCurveTo(x + pad + inner, y + pad + inner, x + pad + inner - radius, y + pad + inner);
      ctx.lineTo(x + pad + radius, y + pad + inner);
      ctx.quadraticCurveTo(x + pad, y + pad + inner, x + pad, y + pad + inner - radius);
      ctx.lineTo(x + pad, y + pad + radius);
      ctx.quadraticCurveTo(x + pad, y + pad, x + pad + radius, y + pad);
      ctx.closePath();

      // Glow effect for special states
      if (GLOW[state] && cellSize >= 10) {
        ctx.shadowColor = GLOW[state];
        ctx.shadowBlur  = Math.min(12, s * 0.6);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillRect(x, y, s, s);
    }

    // Grid line
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);

    // Icons for start / end
    if (state === CellState.START && cellSize >= 14) {
      this._drawIcon(ctx, x + s/2, y + s/2, '▶', s * 0.45, '#fff');
    } else if (state === CellState.END && cellSize >= 14) {
      this._drawIcon(ctx, x + s/2, y + s/2, '★', s * 0.45, '#fff');
    }

    // g-cost label for path cells (only if large enough)
    // (omitted in favour of clean look — can be re-enabled)
  }

  _drawIcon(ctx, cx, cy, icon, size, color) {
    ctx.font         = `${size}px serif`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 0;
    ctx.fillText(icon, cx, cy);
  }

  /** Update a single cell (efficient partial repaint). */
  updateCell(row, col) {
    this._drawCell(row, col);
  }
}

/* -------------------------------------------------------
   Animator — orchestrates step-by-step A* playback
   ------------------------------------------------------- */
class Animator {
  constructor(renderer, model) {
    this.renderer = renderer;
    this.model    = model;

    this._animId   = null;  // requestAnimationFrame id
    this._timerId  = null;  // setTimeout id
    this.running   = false;
    this.onDone    = null;  // callback(result)
    this.onStep    = null;  // callback(phase, idx)
  }

  /**
   * Start the animation.
   * @param {object} result  — return value of runAstar(...)
   * @param {number} speedLevel — 1..5
   */
  play(result, speedLevel = 3) {
    this.stop();
    this.running = true;

    const delay   = SPEED_MAP[speedLevel] ?? 12;
    const { explored, path } = result;

    let exploredIdx = 0;
    let pathIdx     = 0;
    let phase       = 'explore'; // 'explore' | 'path' | 'done'

    // Chunk size per frame (larger = faster visual)
    const chunkSize = speedLevel >= 5 ? 50 : speedLevel >= 4 ? 8 : 1;

    const step = () => {
      if (!this.running) return;

      if (phase === 'explore') {
        // Paint a chunk of explored nodes
        let painted = 0;
        while (exploredIdx < explored.length && painted < chunkSize) {
          const { row, col } = explored[exploredIdx++];
          const cur = this.model.getCell(row, col);
          if (cur !== CellState.START && cur !== CellState.END) {
            this.model.cells[row][col] = CellState.CLOSED;
            this.renderer.updateCell(row, col);
          }
          painted++;
          if (this.onStep) this.onStep('explore', exploredIdx);
        }

        if (exploredIdx >= explored.length) {
          phase = 'path';
        }
      } else if (phase === 'path') {
        if (path.length === 0) {
          phase = 'done';
        } else {
          let painted = 0;
          while (pathIdx < path.length && painted < Math.max(1, chunkSize / 2)) {
            const { row, col } = path[pathIdx++];
            const cur = this.model.getCell(row, col);
            if (cur !== CellState.START && cur !== CellState.END) {
              this.model.cells[row][col] = CellState.PATH;
              this.renderer.updateCell(row, col);
            }
            painted++;
          }
          if (pathIdx >= path.length) phase = 'done';
        }
      }

      if (phase === 'done') {
        this.running = false;
        if (this.onDone) this.onDone(result);
        return;
      }

      if (delay === 0) {
        // Use rAF for frame-rate limited "instant"
        this._animId = requestAnimationFrame(step);
      } else {
        this._timerId = setTimeout(step, delay);
      }
    };

    // Kick off
    if (delay === 0) {
      this._animId = requestAnimationFrame(step);
    } else {
      this._timerId = setTimeout(step, delay);
    }
  }

  /** Stop / cancel current animation. */
  stop() {
    this.running = false;
    if (this._animId)  { cancelAnimationFrame(this._animId);  this._animId  = null; }
    if (this._timerId) { clearTimeout(this._timerId);          this._timerId = null; }
  }
}

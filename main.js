/**
 * main.js — Application Controller
 *
 * Wires together:
 *   - GridModel (state)
 *   - GridRenderer (canvas)
 *   - Animator (step-by-step playback)
 *   - UI controls (sidebar events)
 *   - Mouse interaction (draw walls, set start/end)
 */

"use strict";

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  /* -------------------------------------------------------
     DOM refs
     ------------------------------------------------------- */
  const canvas         = document.getElementById('grid-canvas');
  const gridSizeSlider = document.getElementById('grid-size');
  const gridSizeVal    = document.getElementById('grid-size-val');
  const speedSlider    = document.getElementById('speed');
  const speedVal       = document.getElementById('speed-val');
  const diagonalToggle = document.getElementById('diagonal-toggle');
  const heuristicSel   = document.getElementById('heuristic');
  const btnStartAlgo   = document.getElementById('btn-start-algo');
  const btnMaze        = document.getElementById('btn-maze');
  const btnReset       = document.getElementById('btn-reset');
  const btnClearPath   = document.getElementById('btn-clear-path');
  const modeButtons    = document.querySelectorAll('.mode-btn');

  const metricNodes    = document.getElementById('metric-nodes');
  const metricPath     = document.getElementById('metric-path');
  const metricCost     = document.getElementById('metric-cost');
  const metricTime     = document.getElementById('metric-time');
  const statusText     = document.getElementById('status-text');
  const statusIcon     = document.getElementById('status-icon');
  const toastEl        = document.getElementById('toast');
  const toastMsg       = document.getElementById('toast-msg');

  /* -------------------------------------------------------
     State
     ------------------------------------------------------- */
  let gridSize   = 20;
  let mode       = 'wall';    // 'wall' | 'start' | 'end' | 'erase'
  let speedLevel = 3;
  let isRunning  = false;
  let isDragging = false;
  let dragMode   = null;   // what are we painting on drag?

  /* -------------------------------------------------------
     Core objects
     ------------------------------------------------------- */
  let model    = new GridModel(gridSize, gridSize);
  let renderer = new GridRenderer(canvas, model);
  let animator = new Animator(renderer, model);

  renderer.drawAll();

  /* -------------------------------------------------------
     Utility: update slider background gradient
     ------------------------------------------------------- */
  function updateSliderGradient(slider) {
    const min = +slider.min, max = +slider.max, val = +slider.value;
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.background =
      `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(99,102,241,0.2) ${pct}%, rgba(99,102,241,0.2) 100%)`;
  }

  updateSliderGradient(gridSizeSlider);
  updateSliderGradient(speedSlider);

  /* -------------------------------------------------------
     Status helpers
     ------------------------------------------------------- */
  function setStatus(icon, text) {
    statusIcon.textContent = icon;
    statusText.textContent = text;
  }

  function showToast(msg, isError = true) {
    toastMsg.textContent = msg;
    toastEl.style.borderColor = isError
      ? 'rgba(239,68,68,0.4)'
      : 'rgba(34,197,94,0.4)';
    toastEl.style.color = isError ? '#fca5a5' : '#86efac';
    toastEl.querySelector('.toast-icon').textContent = isError ? '⚠️' : '✅';
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 3000);
  }

  function popMetric(el) {
    el.classList.remove('pop');
    void el.offsetWidth; // reflow
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 400);
  }

  function updateMetrics(nodes, pathLen, cost, timeMs) {
    metricNodes.textContent = nodes !== null ? nodes : '—';
    metricPath.textContent  = pathLen !== null ? pathLen : '—';
    metricCost.textContent  = cost !== null ? cost.toFixed(1) : '—';
    metricTime.textContent  = timeMs !== null ? timeMs.toFixed(1) : '—';
    [metricNodes, metricPath, metricCost, metricTime].forEach(popMetric);
  }

  /* -------------------------------------------------------
     Mode selection
     ------------------------------------------------------- */
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRunning) return;
      mode = btn.dataset.mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setStatus('✏️', `Mode: ${btn.textContent.trim()}`);
    });
  });

  /* -------------------------------------------------------
     Grid size slider
     ------------------------------------------------------- */
  gridSizeSlider.addEventListener('input', () => {
    if (isRunning) return;
    gridSize = +gridSizeSlider.value;
    gridSizeVal.textContent = `${gridSize} × ${gridSize}`;
    updateSliderGradient(gridSizeSlider);
    model.resize(gridSize, gridSize);
    renderer = new GridRenderer(canvas, model);
    animator = new Animator(renderer, model);
    renderer.drawAll();
    updateMetrics(null, null, null, null);
    setStatus('⬜', 'Grid resized — ready');
  });

  /* -------------------------------------------------------
     Speed slider
     ------------------------------------------------------- */
  speedSlider.addEventListener('input', () => {
    speedLevel = +speedSlider.value;
    speedVal.textContent = SPEED_LABELS[speedLevel];
    updateSliderGradient(speedSlider);
  });

  /* -------------------------------------------------------
     Reset button
     ------------------------------------------------------- */
  btnReset.addEventListener('click', () => {
    if (isRunning) { animator.stop(); isRunning = false; }
    model.reset();
    renderer.drawAll();
    updateMetrics(null, null, null, null);
    setStatus('⬜', 'Grid reset — ready');
    btnStartAlgo.disabled = false;
  });

  /* -------------------------------------------------------
     Clear Path button
     ------------------------------------------------------- */
  btnClearPath.addEventListener('click', () => {
    if (isRunning) { animator.stop(); isRunning = false; }
    model.clearPath();
    renderer.drawAll();
    updateMetrics(null, null, null, null);
    setStatus('⬜', 'Path cleared — ready');
    btnStartAlgo.disabled = false;
  });

  /* -------------------------------------------------------
     Maze Generator button
     ------------------------------------------------------- */
  btnMaze.addEventListener('click', () => {
    if (isRunning) { animator.stop(); isRunning = false; }
    model.generateMaze();
    renderer.drawAll();
    updateMetrics(null, null, null, null);
    setStatus('🎲', 'Maze ready — click ▶ Start Pathfinding');
    btnStartAlgo.disabled = false;
  });

  /* -------------------------------------------------------
     Start Pathfinding button
     ------------------------------------------------------- */
  btnStartAlgo.addEventListener('click', () => {
    if (isRunning) return;

    if (!model.startCell) { showToast('Place a start node first (🟢 mode)!'); return; }
    if (!model.endCell)   { showToast('Place a goal node first (🔴 mode)!'); return; }

    // Clear previous path visualization
    model.clearPath();
    renderer.drawAll();
    updateMetrics(null, null, null, null);

    isRunning = true;
    btnStartAlgo.disabled = true;
    setStatus('⚙️', 'Running A* algorithm…');

    // Run algorithm
    const wallMap = model.buildWallMap();
    const opts    = {
      diagonal:  diagonalToggle.checked,
      heuristic: heuristicSel.value
    };

    const t0     = performance.now();
    const result = runAstar(wallMap, model.startCell, model.endCell, opts);
    const elapsed = performance.now() - t0;

    // Update time metric right away (algo time, not anim time)
    metricTime.textContent = elapsed.toFixed(2);
    popMetric(metricTime);

    // Animate
    animator.onStep = (phase, idx) => {
      if (phase === 'explore') {
        metricNodes.textContent = idx;
      }
    };

    animator.onDone = (res) => {
      isRunning = false;
      btnStartAlgo.disabled = false;

      if (res.path.length > 0) {
        updateMetrics(res.nodesExplored, res.path.length, res.cost, elapsed);
        setStatus('✅', `Path found! Length: ${res.path.length} · Cost: ${res.cost.toFixed(1)}`);
        showToast(`Path found! ${res.path.length} steps, cost ${res.cost.toFixed(1)}`, false);
      } else {
        updateMetrics(res.nodesExplored, 0, 0, elapsed);
        setStatus('❌', 'No path found — try removing some walls');
        showToast('No path found! The goal is unreachable.');
      }
    };

    animator.play(result, speedLevel);
  });

  /* -------------------------------------------------------
     Canvas Mouse / Touch Interaction
     ------------------------------------------------------- */
  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    const col = Math.floor(x / renderer.cellSize);
    const row = Math.floor(y / renderer.cellSize);
    return { row, col };
  }

  function applyMode(row, col, currentMode) {
    if (row < 0 || row >= model.rows || col < 0 || col >= model.cols) return;
    if (isRunning && currentMode !== 'erase') return;

    const current = model.getCell(row, col);

    if (currentMode === 'wall') {
      if (current === CellState.START || current === CellState.END) return;
      model.setCell(row, col, CellState.WALL);
    } else if (currentMode === 'start') {
      if (current === CellState.WALL) return;
      model.setCell(row, col, CellState.START);
    } else if (currentMode === 'end') {
      if (current === CellState.WALL) return;
      model.setCell(row, col, CellState.END);
    } else if (currentMode === 'erase') {
      if (current === CellState.START || current === CellState.END) return;
      model.setCell(row, col, CellState.EMPTY);
    }

    renderer.drawAll(); // Fast enough for grid sizes up to 40x40
  }

  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    isDragging = true;
    const { row, col } = cellFromEvent(e);

    // Right-click always erases
    if (e.button === 2) {
      dragMode = 'erase';
    } else {
      dragMode = mode;
    }
    applyMode(row, col, dragMode);
  });

  canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const { row, col } = cellFromEvent(e);
    applyMode(row, col, dragMode);
  });

  canvas.addEventListener('mouseup', () => { isDragging = false; dragMode = null; });
  canvas.addEventListener('mouseleave', () => { isDragging = false; dragMode = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Touch support
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    isDragging = true;
    dragMode = mode;
    const touch = e.touches[0];
    const { row, col } = cellFromEvent(touch);
    applyMode(row, col, dragMode);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!isDragging) return;
    const touch = e.touches[0];
    const { row, col } = cellFromEvent(touch);
    applyMode(row, col, dragMode);
  }, { passive: false });

  canvas.addEventListener('touchend', () => { isDragging = false; });

  /* -------------------------------------------------------
     Window resize — re-layout canvas
     ------------------------------------------------------- */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isRunning) return;
      renderer._resize();
      renderer.drawAll();
    }, 150);
  });

  /* -------------------------------------------------------
     Initial status
     ------------------------------------------------------- */
  setStatus('⬜', 'Ready — click the grid to place walls, then ▶ Start');
  speedVal.textContent = SPEED_LABELS[speedLevel];

  /* -------------------------------------------------------
     Keyboard shortcuts
     ------------------------------------------------------- */
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key.toLowerCase()) {
      case 'w': setModeUI('wall');  break;
      case 's': setModeUI('start'); break;
      case 'g': setModeUI('end');   break;
      case 'e': setModeUI('erase'); break;
      case 'r': btnReset.click();   break;
      case 'm': btnMaze.click();    break;
      case ' ':
        e.preventDefault();
        btnStartAlgo.click();
        break;
    }
  });

  function setModeUI(m) {
    if (isRunning) return;
    mode = m;
    modeButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    const activeBtn = document.querySelector(`[data-mode="${m}"]`);
    setStatus('✏️', `Mode: ${activeBtn?.textContent?.trim()}`);
  }

  /* -------------------------------------------------------
     Canvas hint: hide after first interaction
     ------------------------------------------------------- */
  const hint = document.getElementById('canvas-hint');
  canvas.addEventListener('mousedown', () => {
    hint.style.opacity = '0';
    hint.style.transition = 'opacity 0.4s';
  }, { once: true });

}); // end DOMContentLoaded

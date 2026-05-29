'use strict';

// App State
const state = { seed: 'labyrinth-2026', rng: null, maze: null, solution: [], stats: null, showSolution: false, lastError: '' };

// Constants and Presets
const difficultyPresets = {
  veryEasy: { label: 'Very Easy', gridSize: 10, deadEndFactor: 0.25, branchFactor: 0.25, extraConnections: 0.22, pathComplexity: 0.25, minSolutionLength: 8, corridorWidthStyle: 'wide' },
  easy: { label: 'Easy', gridSize: 16, deadEndFactor: 0.4, branchFactor: 0.35, extraConnections: 0.14, pathComplexity: 0.4, minSolutionLength: 14, corridorWidthStyle: 'wide' },
  medium: { label: 'Medium', gridSize: 24, deadEndFactor: 0.6, branchFactor: 0.55, extraConnections: 0.08, pathComplexity: 0.6, minSolutionLength: 24, corridorWidthStyle: 'normal' },
  hard: { label: 'Hard', gridSize: 34, deadEndFactor: 0.78, branchFactor: 0.75, extraConnections: 0.04, pathComplexity: 0.8, minSolutionLength: 40, corridorWidthStyle: 'tight' },
  expert: { label: 'Expert', gridSize: 46, deadEndFactor: 0.95, branchFactor: 0.92, extraConnections: 0.02, pathComplexity: 1, minSolutionLength: 64, corridorWidthStyle: 'tight' }
};
const mazeModePresets = {
  classic: { label: 'Classic', extraConnectionsDelta: 0, preferLongest: false, minLengthBoost: 1, marginBoost: 1, wallBoost: 1 },
  kidsEasy: { label: 'Kids Easy', extraConnectionsDelta: 0.18, preferLongest: false, minLengthBoost: 0.55, marginBoost: 1.15, wallBoost: 1.25 },
  puzzle: { label: 'Puzzle', extraConnectionsDelta: -0.035, preferLongest: false, minLengthBoost: 1.25, marginBoost: 1, wallBoost: 1 },
  longPath: { label: 'Long Path', extraConnectionsDelta: -0.02, preferLongest: true, minLengthBoost: 1.65, marginBoost: 1, wallBoost: 1 },
  printClean: { label: 'Print Clean', extraConnectionsDelta: 0.04, preferLongest: false, minLengthBoost: 0.9, marginBoost: 1.35, wallBoost: 1.15 }
};
const agePresets = {
  custom: { label: 'Custom / manual' },
  age45: { label: '4–5 years', difficulty: 'veryEasy', mode: 'kidsEasy', width: 8, height: 8, wallThickness: 5, cellSize: 42, startFinish: 'leftRight' },
  age67: { label: '6–7 years', difficulty: 'easy', mode: 'kidsEasy', width: 12, height: 10, wallThickness: 4, cellSize: 36, startFinish: 'corners' },
  age89: { label: '8–9 years', difficulty: 'medium', mode: 'classic', width: 18, height: 14, wallThickness: 3, cellSize: 30, startFinish: 'leftRight' },
  age10: { label: '10+ years', difficulty: 'hard', mode: 'puzzle', width: 26, height: 20, wallThickness: 3, cellSize: 24, startFinish: 'randomEdges' },
  adults: { label: 'Adults', difficulty: 'expert', mode: 'puzzle', width: 36, height: 28, wallThickness: 2, cellSize: 20, startFinish: 'longestPath' }
};
const typeLabels = { rect: 'Rectangular Maze', circle: 'Circular Maze', hex: 'Hex Maze', room: 'Room / Island Maze', shape: 'Shape Maze' };
const positionLabels = { corners: 'corners', leftRight: 'left-to-right', topBottom: 'top-to-bottom', randomEdges: 'random edges', longestPath: 'longest path' };

// Seeded Random
function hashSeed(seed) { let h = 2166136261 >>> 0; String(seed).split('').forEach(ch => { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }); return h >>> 0; }
function mulberry32(a) { return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function setSeed(seed) { state.seed = String(seed || 'maze'); state.rng = mulberry32(hashSeed(state.seed)); }
function randomSeed() { return 'seed-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36); }
function randInt(max) { return Math.floor(state.rng() * max); }
function pick(items) { return items[randInt(items.length)]; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, Number.isFinite(n) ? n : a)); }

// Maze Data Model
function makeMaze(kind, width, height, meta = {}) { return { kind, width, height, cells: [], cellMap: new Map(), start: null, finish: null, meta, render: { width: 900, height: 700, margin: 56 } }; }
function addCell(maze, cell) { cell.links = new Set(); maze.cells.push(cell); maze.cellMap.set(cell.id, cell); return cell; }
function linkCells(a, b) { if (a && b && a.id !== b.id) { a.links.add(b.id); b.links.add(a.id); } }
function gridId(x, y) { return x + ',' + y; }
function validCell(maze, x, y) { return maze.cellMap.get(gridId(x, y)); }
function cellPoint(maze, cell) { if ('x' in cell) return { x: cell.x, y: cell.y }; return { x: cell.seg, y: cell.ring }; }

// Maze Generation Core
function buildGenerationProfile(options) {
  const difficulty = difficultyPresets[options.difficulty] || difficultyPresets.medium;
  const mode = mazeModePresets[options.mode] || mazeModePresets.classic;
  const width = clamp(parseInt(options.width || difficulty.gridSize, 10), 6, 80);
  const height = clamp(parseInt(options.height || Math.round(difficulty.gridSize * 0.75), 10), 6, 80);
  return {
    ...difficulty,
    modeLabel: mode.label,
    width,
    height,
    extraConnections: clamp(difficulty.extraConnections + mode.extraConnectionsDelta, 0, 0.45),
    minSolutionLength: Math.round(difficulty.minSolutionLength * mode.minLengthBoost),
    preferLongest: mode.preferLongest || options.startFinish === 'longestPath',
    marginBoost: mode.marginBoost,
    wallBoost: mode.wallBoost,
    cellSize: clamp(parseInt(options.cellSize || 28, 10), 12, 60)
  };
}
function dfsCarve(maze, neighborFn, profile) {
  const start = maze.start || maze.cells[0];
  const visited = new Set([start.id]);
  const stack = [start];
  while (stack.length) {
    const current = stack[stack.length - 1];
    let choices = neighborFn(current).filter(n => n && !visited.has(n.id));
    // Higher branchFactor adds mild randomness, lower values prefer longer straight corridors.
    if (choices.length > 1 && state.rng() > profile.branchFactor) choices.sort((a, b) => straightScore(current, a) - straightScore(current, b));
    if (!choices.length) { stack.pop(); continue; }
    const next = choices[randInt(choices.length)];
    linkCells(current, next); visited.add(next.id); stack.push(next);
  }
}
function straightScore(a, b) { return Math.abs((a.x || a.seg || 0) - (b.x || b.seg || 0)) + Math.abs((a.y || a.ring || 0) - (b.y || b.ring || 0)); }
function addExtraPassages(maze, neighborFn, chance) { maze.cells.forEach(cell => neighborFn(cell).forEach(n => { if (n && !cell.links.has(n.id) && state.rng() < chance) linkCells(cell, n); })); }
function applyRenderSettings(maze, options, profile) {
  const margin = Math.round(44 * profile.marginBoost);
  if (maze.kind === 'circle') { const size = Math.max(640, Math.min(1200, maze.width * profile.cellSize + margin * 2)); maze.render = { width: size, height: size, margin }; return; }
  maze.render = { width: Math.round(maze.width * profile.cellSize + margin * 2), height: Math.round(maze.height * profile.cellSize + margin * 2), margin };
}
function chooseStartFinish(maze, position) {
  const pos = position || 'corners';
  if (pos === 'longestPath') return setLongestPathEndpoints(maze);
  const groups = boundaryGroups(maze);
  if (pos === 'leftRight') { maze.start = nearestCell(groups.left, 0); maze.finish = nearestCell(groups.right, maze.height - 1); return; }
  if (pos === 'topBottom') { maze.start = nearestCell(groups.top, 0); maze.finish = nearestCell(groups.bottom, maze.width - 1); return; }
  if (pos === 'randomEdges') {
    const names = Object.keys(groups).filter(k => groups[k].length); const a = pick(names); let b = pick(names.filter(n => n !== a));
    maze.start = pick(groups[a]); maze.finish = pick(groups[b]); return;
  }
  maze.start = nearestCorner(maze, 'topLeft'); maze.finish = nearestCorner(maze, 'bottomRight');
}
function boundaryGroups(maze) {
  if (maze.kind === 'circle') return { left: maze.cells.filter(c => c.ring === maze.meta.rings - 1 && c.seg < maze.meta.segments / 2), right: maze.cells.filter(c => c.ring === maze.meta.rings - 1 && c.seg >= maze.meta.segments / 2), top: maze.cells.filter(c => c.ring === maze.meta.rings - 1), bottom: maze.cells.filter(c => c.ring === 0) };
  const xs = maze.cells.map(c => c.x), ys = maze.cells.map(c => c.y), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { left: maze.cells.filter(c => c.x === minX), right: maze.cells.filter(c => c.x === maxX), top: maze.cells.filter(c => c.y === minY), bottom: maze.cells.filter(c => c.y === maxY) };
}
function nearestCell(cells, target) { return cells.reduce((best, c) => !best || Math.abs((c.y ?? c.ring) - target) < Math.abs((best.y ?? best.ring) - target) ? c : best, cells[0]); }
function nearestCorner(maze, corner) { const tx = corner === 'topLeft' ? 0 : maze.width - 1, ty = corner === 'topLeft' ? 0 : maze.height - 1; return maze.cells.reduce((best, c) => { const p = cellPoint(maze, c), bp = best ? cellPoint(maze, best) : null; return !best || Math.hypot(p.x - tx, p.y - ty) < Math.hypot(bp.x - tx, bp.y - ty) ? c : best; }, null); }
function bfsDistances(maze, start) { const q = [start.id], dist = new Map([[start.id, 0]]), prev = new Map([[start.id, null]]); while (q.length) { const id = q.shift(); maze.cellMap.get(id).links.forEach(nid => { if (!dist.has(nid)) { dist.set(nid, dist.get(id) + 1); prev.set(nid, id); q.push(nid); } }); } return { dist, prev }; }
function farthestFrom(maze, start) { const { dist } = bfsDistances(maze, start); return maze.cells.reduce((best, c) => (dist.get(c.id) || 0) > (dist.get(best.id) || 0) ? c : best, start); }
function setLongestPathEndpoints(maze) { const a = farthestFrom(maze, maze.cells[0]); const b = farthestFrom(maze, a); maze.start = a; maze.finish = b; }
function ensureMinimumPath(maze, profile) { const sol = solveMaze(maze); if (sol.length < profile.minSolutionLength || profile.preferLongest) setLongestPathEndpoints(maze); }
function generateMaze(type, options) {
  let lastValidation = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    setSeed(`${options.seed || 'maze'}|${type}|${attempt}`);
    const profile = buildGenerationProfile(options);
    const map = { rect: generateRectMaze, circle: generateCircleMaze, hex: generateHexMaze, room: generateRoomMaze, shape: generateShapeMaze };
    const maze = (map[type] || generateRectMaze)(options, profile);
    maze.meta = { ...maze.meta, typeLabel: typeLabels[maze.kind] || typeLabels[type], difficulty: options.difficulty, difficultyLabel: profile.label, mode: options.mode, modeLabel: profile.modeLabel, agePreset: options.agePreset, ageLabel: (agePresets[options.agePreset] || agePresets.custom).label, seed: options.seed, startFinish: options.startFinish, wallThickness: options.wallThickness, cellSize: profile.cellSize };
    applyRenderSettings(maze, options, profile); ensureMinimumPath(maze, profile);
    const validation = validateMaze(maze); lastValidation = validation;
    if (validation.valid) { state.seed = String(options.seed || 'maze'); return maze; }
  }
  throw new Error('Не удалось создать корректный лабиринт после 10 попыток: ' + (lastValidation ? lastValidation.errors.join('; ') : 'unknown error'));
}

// Rectangular Maze
function generateRectMaze(options, profile) {
  const maze = makeMaze('rect', profile.width, profile.height, { typeLabel: typeLabels.rect });
  for (let y = 0; y < profile.height; y++) for (let x = 0; x < profile.width; x++) addCell(maze, { id: gridId(x, y), x, y, shape: 'rect' });
  chooseStartFinish(maze, options.startFinish); const neighbors = c => [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => validCell(maze, c.x + dx, c.y + dy));
  dfsCarve(maze, neighbors, profile); addExtraPassages(maze, neighbors, profile.extraConnections); chooseStartFinish(maze, options.startFinish); return maze;
}

// Circular Maze
function generateCircleMaze(options, profile) {
  const rings = clamp(Math.round(profile.width / 3), 4, 20), segments = clamp(Math.round(profile.width * 1.45), 12, 76);
  const maze = makeMaze('circle', segments, rings, { typeLabel: typeLabels.circle, rings, segments });
  for (let r = 0; r < rings; r++) for (let s = 0; s < segments; s++) addCell(maze, { id: r + ',' + s, ring: r, seg: s, shape: 'circle' });
  const get = (r, s) => maze.cellMap.get(r + ',' + ((s + segments) % segments));
  maze.start = get(rings - 1, 0); maze.finish = get(0, Math.floor(segments / 2));
  const neighbors = c => [get(c.ring, c.seg - 1), get(c.ring, c.seg + 1), c.ring > 0 ? get(c.ring - 1, c.seg) : null, c.ring < rings - 1 ? get(c.ring + 1, c.seg) : null];
  dfsCarve(maze, neighbors, profile); addExtraPassages(maze, neighbors, profile.extraConnections * 0.7); chooseStartFinish(maze, options.startFinish); return maze;
}

// Hex Maze
function generateHexMaze(options, profile) {
  const w = clamp(Math.round(profile.width * 0.9), 6, 48), h = clamp(Math.round(profile.height * 0.9), 6, 48);
  const maze = makeMaze('hex', w, h, { typeLabel: typeLabels.hex });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) addCell(maze, { id: gridId(x, y), x, y, shape: 'hex' });
  chooseStartFinish(maze, options.startFinish); const neighbors = c => hexNeighborCoords(c.x, c.y).map(([x, y]) => validCell(maze, x, y));
  dfsCarve(maze, neighbors, profile); addExtraPassages(maze, neighbors, profile.extraConnections * 0.85); chooseStartFinish(maze, options.startFinish); return maze;
}
function hexNeighborCoords(x, y) { const odd = y & 1; return odd ? [[x+1,y],[x,y+1],[x-1,y+1],[x-1,y],[x-1,y-1],[x,y-1]] : [[x+1,y],[x+1,y+1],[x,y+1],[x-1,y],[x,y-1],[x+1,y-1]]; }

// Room Maze
function generateRoomMaze(options, profile) {
  const maze = generateRectMaze(options, profile); maze.kind = 'room'; maze.meta.typeLabel = typeLabels.room;
  const neighbors = c => [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => validCell(maze, c.x + dx, c.y + dy));
  const roomCount = Math.max(2, Math.round(profile.branchFactor * 7));
  for (let i = 0; i < roomCount; i++) {
    const rw = 2 + randInt(4), rh = 2 + randInt(4), rx = randInt(Math.max(1, maze.width - rw)), ry = randInt(Math.max(1, maze.height - rh));
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) neighbors(validCell(maze, x, y)).forEach(n => n && n.x >= rx && n.x < rx + rw && n.y >= ry && n.y < ry + rh && linkCells(validCell(maze, x, y), n));
  }
  chooseStartFinish(maze, options.startFinish); return maze;
}

// Shape Maze
function generateShapeMaze(options, profile) {
  const size = clamp(Math.max(profile.width, profile.height), 12, 62); const maze = makeMaze('shape', size, size, { typeLabel: typeLabels.shape, shapeType: options.shapeType || 'circle' });
  const cx = (size - 1) / 2, cy = (size - 1) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (insideShape((x - cx) / cx, (y - cy) / cy, maze.meta.shapeType)) addCell(maze, { id: gridId(x, y), x, y, shape: 'rect' });
  keepLargestConnectedMask(maze); chooseStartFinish(maze, options.startFinish);
  const neighbors = c => [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => validCell(maze, c.x + dx, c.y + dy));
  dfsCarve(maze, neighbors, profile); addExtraPassages(maze, neighbors, profile.extraConnections); chooseStartFinish(maze, options.startFinish); return maze;
}
function insideShape(x, y, type) { if (type === 'heart') { const X = x, Y = -y * 1.08 + 0.18; return Math.pow(X*X + Y*Y - 0.55, 3) - X*X*Y*Y*Y <= 0; } if (type === 'star') { const a = Math.atan2(y, x), r = Math.hypot(x, y), limit = 0.62 + 0.25 * Math.cos(5 * a); return r <= limit; } return Math.hypot(x, y) <= 0.92; }
function keepLargestConnectedMask(maze) {
  const seen = new Set(), comps = [];
  maze.cells.forEach(c => { if (seen.has(c.id)) return; const q = [c], ids = new Set([c.id]); seen.add(c.id); while (q.length) { const cur = q.shift(); [[0,-1],[1,0],[0,1],[-1,0]].forEach(([dx,dy]) => { const n = validCell(maze, cur.x + dx, cur.y + dy); if (n && !seen.has(n.id)) { seen.add(n.id); ids.add(n.id); q.push(n); } }); } comps.push(ids); });
  const keep = comps.sort((a, b) => b.size - a.size)[0] || new Set(); maze.cells = maze.cells.filter(c => keep.has(c.id)); maze.cellMap = new Map(maze.cells.map(c => [c.id, c]));
}

// Maze Solver
function solveMaze(maze) { if (!maze || !maze.start || !maze.finish) return []; const q = [maze.start.id], prev = new Map([[maze.start.id, null]]); while (q.length) { const id = q.shift(); if (id === maze.finish.id) break; maze.cellMap.get(id).links.forEach(nid => { if (!prev.has(nid)) { prev.set(nid, id); q.push(nid); } }); } if (!prev.has(maze.finish.id)) return []; const path = []; for (let id = maze.finish.id; id; id = prev.get(id)) path.push(maze.cellMap.get(id)); return path.reverse(); }

// Maze Validation
function validateMaze(maze) {
  const errors = []; if (!maze) errors.push('maze is missing'); if (!maze || !maze.start) errors.push('start is missing'); if (!maze || !maze.finish) errors.push('finish is missing'); if (maze && maze.start && maze.finish && maze.start.id === maze.finish.id) errors.push('start and finish are the same');
  const solution = solveMaze(maze); if (!solution.length) errors.push('solution is empty');
  if (maze && maze.cells.some(c => c.links.size === 0 && maze.cells.length > 1)) errors.push('isolated active cell found');
  const walls = maze ? renderWalls(maze) : ''; if (!walls.trim()) errors.push('wall SVG is empty'); if ((walls.match(/<(line|path|circle)/g) || []).length === 0) errors.push('wall count is zero');
  return { valid: errors.length === 0, errors, solution, wallCount: (walls.match(/<(line|path|circle)/g) || []).length };
}

// Maze Statistics
function solutionPointForStats(cell, maze) {
  if (maze) return centerOf(maze, cell);
  if ('x' in cell && 'y' in cell) return [cell.x, cell.y];
  return [cell.seg || 0, cell.ring || 0];
}
function getSolutionStats(solution, maze) {
  const solutionLength = solution ? solution.length : 0; let turnsCount = 0;
  for (let i = 2; i < solutionLength; i++) { const a = solutionPointForStats(solution[i-2], maze), b = solutionPointForStats(solution[i-1], maze), c = solutionPointForStats(solution[i], maze); const v1 = [Math.sign(b[0]-a[0]), Math.sign(b[1]-a[1])], v2 = [Math.sign(c[0]-b[0]), Math.sign(c[1]-b[1])]; if (v1[0] !== v2[0] || v1[1] !== v2[1]) turnsCount++; }
  const deadEndsCount = maze ? maze.cells.filter(c => c.links.size === 1 && c.id !== maze.start.id && c.id !== maze.finish.id).length : 0;
  const estimatedDifficultyScore = Math.round(solutionLength * 0.8 + turnsCount * 1.4 + deadEndsCount * 1.1);
  return { solutionLength, turnsCount, deadEndsCount, estimatedDifficultyScore };
}

// SVG Rendering
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m])); }
function renderMazeToSVG(maze, options = {}) {
  const modeBoost = (mazeModePresets[maze.meta.mode] || mazeModePresets.classic).wallBoost;
  const wall = clamp(parseFloat(options.wallThickness || maze.meta.wallThickness || 3) * modeBoost, 1, 12); const includeSolution = !!options.includeSolution; const w = maze.render.width, h = maze.render.height;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(maze.meta.typeLabel)}">`, `<g id="maze-background"><rect width="100%" height="100%" fill="#ffffff"/></g>`, `<g id="maze-frame" fill="none" stroke="#e5e7eb" stroke-width="1"><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="8"/></g>`, `<g id="maze-walls" fill="none" stroke="#111827" stroke-width="${wall}" stroke-linecap="round" stroke-linejoin="round">`, renderWalls(maze), '</g>', `<g id="maze-start-finish" fill="#2563eb" stroke="none">${renderStartFinish(maze)}</g>`, `<g id="maze-solution" fill="none" stroke="#dc2626" stroke-width="${Math.max(2, wall * 1.35)}" stroke-linecap="round" stroke-linejoin="round">`];
  if (includeSolution) parts.push(renderSolutionToSVG(options.solution || solveMaze(maze), { maze }));
  parts.push('</g>', `<g id="maze-labels" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#2563eb">${renderLabels(maze)}</g>`, '</svg>'); return parts.join('\n');
}
function renderWalls(maze) { if (maze.kind === 'circle') return renderCircleWalls(maze); if (maze.kind === 'hex') return renderHexWalls(maze); return renderRectWalls(maze); }
function rectGeom(maze) { const m = maze.render.margin, cw = (maze.render.width - 2*m) / maze.width, ch = (maze.render.height - 2*m) / maze.height; return { m, cw, ch }; }
function centerOf(maze, cell) { if (maze.kind === 'circle') { const cx = maze.render.width/2, cy = maze.render.height/2, maxR = maze.render.width/2 - maze.render.margin, dr = maxR / maze.meta.rings, r = (cell.ring + .5) * dr, a = (cell.seg + .5) * Math.PI * 2 / maze.meta.segments; return [cx + Math.cos(a)*r, cy + Math.sin(a)*r]; } if (maze.kind === 'hex') { const s = Math.min((maze.render.width - 100) / (maze.width * 1.55 + .5), (maze.render.height - 100) / (maze.height * 1.35 + .5)); return [60 + s + cell.x * 1.5 * s + ((cell.y & 1) ? .75*s : 0), 60 + s + cell.y * Math.sqrt(3) * .5 * s]; } const g = rectGeom(maze); return [g.m + (cell.x + .5) * g.cw, g.m + (cell.y + .5) * g.ch]; }
function renderRectWalls(maze) { const g = rectGeom(maze), out = []; maze.cells.forEach(c => { const x = g.m + c.x*g.cw, y = g.m + c.y*g.ch, e = validCell(maze,c.x+1,c.y), s = validCell(maze,c.x,c.y+1), n = validCell(maze,c.x,c.y-1), w = validCell(maze,c.x-1,c.y); if (!n || !c.links.has(n.id)) out.push(`<line x1="${x}" y1="${y}" x2="${x+g.cw}" y2="${y}"/>`); if ((!e || !c.links.has(e.id)) && c.id !== maze.finish.id) out.push(`<line x1="${x+g.cw}" y1="${y}" x2="${x+g.cw}" y2="${y+g.ch}"/>`); if (!s || !c.links.has(s.id)) out.push(`<line x1="${x+g.cw}" y1="${y+g.ch}" x2="${x}" y2="${y+g.ch}"/>`); if ((!w || !c.links.has(w.id)) && c.id !== maze.start.id) out.push(`<line x1="${x}" y1="${y+g.ch}" x2="${x}" y2="${y}"/>`); }); return out.join('\n'); }
function arcPath(cx, cy, r, a1, a2) { const p1=[cx+Math.cos(a1)*r,cy+Math.sin(a1)*r], p2=[cx+Math.cos(a2)*r,cy+Math.sin(a2)*r]; return `M ${p1[0]} ${p1[1]} A ${r} ${r} 0 ${a2-a1>Math.PI?1:0} 1 ${p2[0]} ${p2[1]}`; }
function renderCircleWalls(maze) { const cx=maze.render.width/2, cy=maze.render.height/2, maxR=cx-maze.render.margin, dr=maxR/maze.meta.rings, da=Math.PI*2/maze.meta.segments, out=[]; maze.cells.forEach(c => { const inner=c.ring*dr, outer=(c.ring+1)*dr, a1=c.seg*da, a2=(c.seg+1)*da, inward=maze.cellMap.get((c.ring-1)+','+c.seg), outward=maze.cellMap.get((c.ring+1)+','+c.seg), cw=maze.cellMap.get(c.ring+','+((c.seg+1)%maze.meta.segments)); if (c.ring===0 && c.seg===0) out.push(`<circle cx="${cx}" cy="${cy}" r="${inner+1}"/>`); if ((!outward || !c.links.has(outward.id)) && c.id !== maze.start.id) out.push(`<path d="${arcPath(cx,cy,outer,a1,a2)}"/>`); if (c.ring>0 && (!inward || !c.links.has(inward.id))) out.push(`<path d="${arcPath(cx,cy,inner,a1,a2)}"/>`); if (!c.links.has(cw.id)) out.push(`<line x1="${cx+Math.cos(a2)*inner}" y1="${cy+Math.sin(a2)*inner}" x2="${cx+Math.cos(a2)*outer}" y2="${cy+Math.sin(a2)*outer}"/>`); }); return out.join('\n'); }
function hexCorners(cx, cy, s) { return Array.from({length:6}, (_,i) => { const a = Math.PI/180*(60*i); return [cx + s*Math.cos(a), cy + s*Math.sin(a)]; }); }
function renderHexWalls(maze) { const s = Math.min((maze.render.width - 100) / (maze.width * 1.55 + .5), (maze.render.height - 100) / (maze.height * 1.35 + .5)), out=[]; maze.cells.forEach(c => { const pts=hexCorners(...centerOf(maze,c), s*.48), ns=hexNeighborCoords(c.x,c.y); for(let i=0;i<6;i++){ const n=validCell(maze, ns[i][0], ns[i][1]); const isEntranceSide = c.id === maze.start.id && i === 3; const isExitSide = c.id === maze.finish.id && i === 0; if((!n || !c.links.has(n.id)) && !isEntranceSide && !isExitSide) out.push(`<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[(i+1)%6][0]}" y2="${pts[(i+1)%6][1]}"/>`); } }); return out.join('\n'); }
function renderSolutionToSVG(solution, options = {}) { if (!solution || !solution.length || !options.maze) return ''; const d = solution.map((c, i) => `${i ? 'L' : 'M'} ${centerOf(options.maze, c).join(' ')}`).join(' '); return `<path class="solution-path" d="${d}"/>`; }
function renderStartFinish(maze) { const [sx,sy]=centerOf(maze, maze.start), [fx,fy]=centerOf(maze, maze.finish); return `<circle cx="${sx}" cy="${sy}" r="5"/><circle cx="${fx}" cy="${fy}" r="5" fill="#16a34a"/>`; }
function renderLabels(maze) { const [sx,sy]=centerOf(maze, maze.start), [fx,fy]=centerOf(maze, maze.finish); return `<text x="${sx}" y="${sy-12}" text-anchor="middle">START</text>\n<text x="${fx}" y="${fy+24}" text-anchor="middle">FINISH</text>`; }

// SVG Export
function downloadSVG(svgString, filename) { const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function assertCleanSVG(svg) { return svg && !/(<image|foreignObject|base64|\.png|\.jpg|\.jpeg)/i.test(svg); }

// UI Controls
function $(id) { return document.getElementById(id); }
function readOptions() { return { type: $('mazeType').value, shapeType: $('shapeType').value, mode: $('mazeMode').value, agePreset: $('agePreset').value, difficulty: $('difficulty').value, startFinish: $('startFinish').value, width: $('mazeWidth').value, height: $('mazeHeight').value, wallThickness: $('wallThickness').value, cellSize: $('cellSize').value, seed: $('seedInput').value }; }
function applyAgePreset(value) { const p = agePresets[value]; if (!p || value === 'custom') return; $('difficulty').value = p.difficulty; $('mazeMode').value = p.mode; $('mazeWidth').value = p.width; $('mazeHeight').value = p.height; $('wallThickness').value = p.wallThickness; $('cellSize').value = p.cellSize; $('startFinish').value = p.startFinish; }
function setError(message) { state.lastError = message || ''; $('errorBox').hidden = !message; $('errorBox').textContent = message || ''; }
function regenerate() { try { setError(''); const o = readOptions(); state.maze = generateMaze(o.type, o); state.solution = solveMaze(state.maze); state.stats = getSolutionStats(state.solution, state.maze); state.showSolution = false; paint(); } catch (err) { setError(err.message); console.error(err); } }
function paint() { if (!state.maze) return; const svg = renderMazeToSVG(state.maze, { wallThickness: readOptions().wallThickness, includeSolution: state.showSolution, solution: state.solution }); if (!assertCleanSVG(svg)) { setError('SVG не прошёл проверку чистого вектора.'); return; } $('svgPreview').innerHTML = svg; updateInfo(svg); }
function updateInfo(svg) { const m=state.maze, s=state.stats || getSolutionStats(state.solution, m); $('mazeInfo').innerHTML = [`Type: ${m.meta.typeLabel}${m.meta.shapeType ? ' ('+m.meta.shapeType+')' : ''}`, `Mode: ${m.meta.modeLabel}`, `Age Preset: ${m.meta.ageLabel}`, `Difficulty: ${m.meta.difficultyLabel}`, `Width x Height: ${m.width} × ${m.height}`, `Seed: ${m.meta.seed}`, `Solution Length: ${s.solutionLength}`, `Turns Count: ${s.turnsCount}`, `Estimated Difficulty Score: ${s.estimatedDifficultyScore}`, `SVG Size: ${m.render.width} × ${m.render.height}`].map(x => `<span>${esc(x)}</span>`).join(''); }
function syncShapeRow() { $('shapeRow').style.display = $('mazeType').value === 'shape' ? 'flex' : 'none'; }

// Event Listeners
function wireUI() { syncShapeRow(); $('mazeType').addEventListener('change', syncShapeRow); $('agePreset').addEventListener('change', e => applyAgePreset(e.target.value)); $('generateBtn').addEventListener('click', regenerate); $('randomSeedBtn').addEventListener('click', () => { $('seedInput').value = randomSeed(); regenerate(); }); $('showSolutionBtn').addEventListener('click', () => { state.showSolution = true; paint(); }); $('hideSolutionBtn').addEventListener('click', () => { state.showSolution = false; paint(); }); $('downloadBtn').addEventListener('click', () => downloadSVG(renderMazeToSVG(state.maze, { wallThickness: readOptions().wallThickness, includeSolution: false }), `maze-${state.maze.kind}-${state.seed}.svg`)); $('downloadSolutionBtn').addEventListener('click', () => downloadSVG(renderMazeToSVG(state.maze, { wallThickness: readOptions().wallThickness, includeSolution: true, solution: state.solution }), `maze-${state.maze.kind}-${state.seed}-solution.svg`)); regenerate(); }
if (typeof window !== 'undefined') { window.generateMaze = generateMaze; window.generateRectMaze = generateRectMaze; window.generateCircleMaze = generateCircleMaze; window.generateHexMaze = generateHexMaze; window.generateRoomMaze = generateRoomMaze; window.generateShapeMaze = generateShapeMaze; window.solveMaze = solveMaze; window.validateMaze = validateMaze; window.getSolutionStats = getSolutionStats; window.renderMazeToSVG = renderMazeToSVG; window.renderSolutionToSVG = renderSolutionToSVG; window.downloadSVG = downloadSVG; window.setSeed = setSeed; window.randomSeed = randomSeed; window.addEventListener('DOMContentLoaded', wireUI); }

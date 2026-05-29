'use strict';

// State
const state = { seed: 'labyrinth-2026', rng: null, maze: null, solution: [], showSolution: false };
const DIFFICULTIES = {
  veryEasy: { label: 'Very Easy', size: 10, braid: 0.02, room: 2 },
  easy: { label: 'Easy', size: 16, braid: 0.05, room: 3 },
  medium: { label: 'Medium', size: 24, braid: 0.09, room: 4 },
  hard: { label: 'Hard', size: 34, braid: 0.13, room: 5 },
  expert: { label: 'Expert', size: 46, braid: 0.18, room: 7 }
};

// Seeded random
function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  String(seed).split('').forEach(ch => { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); });
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function setSeed(seed) { state.seed = String(seed || 'maze'); state.rng = mulberry32(hashSeed(state.seed)); }
function randomSeed() { return 'seed-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36); }
function randInt(max) { return Math.floor(state.rng() * max); }
function shuffle(items) { for (let i = items.length - 1; i > 0; i--) { const j = randInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; } return items; }

// Maze data structures
function makeMaze(kind, width, height, meta = {}) {
  return { kind, width, height, cells: [], cellMap: new Map(), start: null, finish: null, meta, render: { width: 900, height: 700, margin: 48 } };
}
function addCell(maze, cell) { cell.links = new Set(); maze.cells.push(cell); maze.cellMap.set(cell.id, cell); return cell; }
function linkCells(a, b) { if (a && b) { a.links.add(b.id); b.links.add(a.id); } }
function gridId(x, y) { return x + ',' + y; }
function validCell(maze, x, y) { return maze.cellMap.get(gridId(x, y)); }
function difficultyOptions(options) {
  const d = DIFFICULTIES[options.difficulty] || DIFFICULTIES.medium;
  const w = clamp(parseInt(options.width || d.size, 10), 6, 80);
  const h = clamp(parseInt(options.height || Math.round(d.size * 0.75), 10), 6, 80);
  return { profile: d, width: w, height: h };
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, Number.isFinite(n) ? n : a)); }
function dfsCarve(maze, neighborFn) {
  const start = maze.start || maze.cells[0];
  const visited = new Set([start.id]);
  const stack = [start];
  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = neighborFn(current).filter(n => n && !visited.has(n.id));
    if (!choices.length) { stack.pop(); continue; }
    const next = choices[randInt(choices.length)];
    linkCells(current, next);
    visited.add(next.id);
    stack.push(next);
  }
}
function addExtraPassages(maze, neighborFn, chance) {
  maze.cells.forEach(cell => neighborFn(cell).forEach(n => { if (n && !cell.links.has(n.id) && state.rng() < chance) linkCells(cell, n); }));
}

// Rectangular maze generator
function generateRectMaze(options) {
  const d = difficultyOptions(options);
  const maze = makeMaze('rect', d.width, d.height, { typeLabel: 'Rectangular Maze' });
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) addCell(maze, { id: gridId(x, y), x, y, shape: 'rect' });
  maze.start = validCell(maze, 0, 0); maze.finish = validCell(maze, d.width - 1, d.height - 1);
  const neighbors = c => [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => validCell(maze, c.x + dx, c.y + dy));
  dfsCarve(maze, neighbors); addExtraPassages(maze, neighbors, d.profile.braid * 0.55);
  return maze;
}

// Circular maze generator
function generateCircleMaze(options) {
  const d = difficultyOptions(options); const rings = clamp(Math.round(d.width / 3), 4, 18); const segments = clamp(Math.round(d.width * 1.5), 12, 72);
  const maze = makeMaze('circle', segments, rings, { typeLabel: 'Circular Maze', rings, segments });
  for (let r = 0; r < rings; r++) for (let s = 0; s < segments; s++) addCell(maze, { id: r + ',' + s, ring: r, seg: s, shape: 'circle' });
  const get = (r, s) => maze.cellMap.get(r + ',' + ((s + segments) % segments));
  maze.start = get(rings - 1, 0); maze.finish = get(0, Math.floor(segments / 2));
  const neighbors = c => [get(c.ring, c.seg - 1), get(c.ring, c.seg + 1), c.ring > 0 ? get(c.ring - 1, c.seg) : null, c.ring < rings - 1 ? get(c.ring + 1, c.seg) : null];
  dfsCarve(maze, neighbors); addExtraPassages(maze, neighbors, d.profile.braid * 0.35);
  maze.render = { width: 820, height: 820, margin: 56 };
  return maze;
}

// Hex maze generator
function generateHexMaze(options) {
  const d = difficultyOptions(options); const w = clamp(Math.round(d.width * 0.9), 6, 42); const h = clamp(Math.round(d.height * 0.9), 6, 42);
  const maze = makeMaze('hex', w, h, { typeLabel: 'Hex Maze' });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) addCell(maze, { id: gridId(x, y), x, y, shape: 'hex' });
  maze.start = validCell(maze, 0, 0); maze.finish = validCell(maze, w - 1, h - 1);
  const neighbors = c => hexNeighborCoords(c.x, c.y).map(([x, y]) => validCell(maze, x, y));
  dfsCarve(maze, neighbors); addExtraPassages(maze, neighbors, d.profile.braid * 0.45);
  return maze;
}
function hexNeighborCoords(x, y) { const odd = y & 1; return odd ? [[x+1,y],[x,y+1],[x-1,y+1],[x-1,y],[x-1,y-1],[x,y-1]] : [[x+1,y],[x+1,y+1],[x,y+1],[x-1,y],[x,y-1],[x+1,y-1]]; }

// Room maze generator
function generateRoomMaze(options) {
  const maze = generateRectMaze(options); maze.kind = 'room'; maze.meta.typeLabel = 'Room / Island Maze';
  const d = difficultyOptions(options); const neighbors = c => [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => validCell(maze, c.x + dx, c.y + dy));
  for (let i = 0; i < d.profile.room; i++) {
    const rw = 2 + randInt(4), rh = 2 + randInt(4), rx = randInt(Math.max(1, maze.width - rw)), ry = randInt(Math.max(1, maze.height - rh));
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) neighbors(validCell(maze, x, y)).forEach(n => n && n.x >= rx && n.x < rx + rw && n.y >= ry && n.y < ry + rh && linkCells(validCell(maze, x, y), n));
  }
  addExtraPassages(maze, neighbors, d.profile.braid * 0.9);
  return maze;
}

// Shape maze generator
function generateShapeMaze(options) {
  const d = difficultyOptions(options); const size = clamp(Math.max(d.width, d.height), 12, 60); const maze = makeMaze('shape', size, size, { typeLabel: 'Shape Maze', shapeType: options.shapeType || 'circle' });
  const cx = (size - 1) / 2, cy = (size - 1) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (insideShape((x - cx) / cx, (y - cy) / cy, maze.meta.shapeType)) addCell(maze, { id: gridId(x, y), x, y, shape: 'rect' });
  maze.start = maze.cells.reduce((a, c) => !a || c.x < a.x ? c : a, null); maze.finish = maze.cells.reduce((a, c) => !a || c.x > a.x ? c : a, null);
  const neighbors = c => [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => validCell(maze, c.x + dx, c.y + dy));
  dfsCarve(maze, neighbors); addExtraPassages(maze, neighbors, d.profile.braid * 0.5);
  return maze;
}
function insideShape(x, y, type) {
  if (type === 'heart') { const X = x, Y = -y * 1.08 + 0.18; return Math.pow(X*X + Y*Y - 0.55, 3) - X*X*Y*Y*Y <= 0; }
  if (type === 'star') { const a = Math.atan2(y, x), r = Math.hypot(x, y), limit = 0.62 + 0.25 * Math.cos(5 * a); return r <= limit; }
  return Math.hypot(x, y) <= 0.92;
}
function generateMaze(type, options) {
  setSeed(options.seed);
  const map = { rect: generateRectMaze, circle: generateCircleMaze, hex: generateHexMaze, room: generateRoomMaze, shape: generateShapeMaze };
  const maze = (map[type] || generateRectMaze)(options); maze.meta.difficulty = options.difficulty; maze.meta.seed = state.seed; maze.meta.wallThickness = options.wallThickness;
  const solution = solveMaze(maze); if (!maze.start || !maze.finish || !solution.length) throw new Error('Maze quality check failed: start, finish, or solution is missing.');
  return maze;
}

// Maze solver
function solveMaze(maze) {
  if (!maze || !maze.start || !maze.finish) return [];
  const queue = [maze.start.id], prev = new Map([[maze.start.id, null]]);
  while (queue.length) {
    const id = queue.shift(); if (id === maze.finish.id) break;
    const cell = maze.cellMap.get(id); cell.links.forEach(nid => { if (!prev.has(nid)) { prev.set(nid, id); queue.push(nid); } });
  }
  if (!prev.has(maze.finish.id)) return [];
  const path = []; for (let id = maze.finish.id; id; id = prev.get(id)) path.push(maze.cellMap.get(id));
  return path.reverse();
}

// SVG renderer
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m])); }
function renderMazeToSVG(maze, options = {}) {
  const wall = clamp(parseFloat(options.wallThickness || maze.meta.wallThickness || 3), 1, 12); const includeSolution = !!options.includeSolution;
  const w = maze.render.width, h = maze.render.height;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(maze.meta.typeLabel)}">`, `<rect width="100%" height="100%" fill="#ffffff"/>`, `<g id="maze-walls" fill="none" stroke="#111827" stroke-width="${wall}" stroke-linecap="round" stroke-linejoin="round">`];
  parts.push(renderWalls(maze)); parts.push('</g>'); parts.push(`<g id="maze-solution" fill="none" stroke="#dc2626" stroke-width="${Math.max(2, wall * 1.35)}" stroke-linecap="round" stroke-linejoin="round">`);
  if (includeSolution) parts.push(renderSolutionToSVG(options.solution || solveMaze(maze), { maze }));
  parts.push('</g>'); parts.push(`<g id="maze-labels" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#2563eb">${renderLabels(maze)}</g>`); parts.push('</svg>');
  return parts.join('\n');
}
function renderWalls(maze) { if (maze.kind === 'circle') return renderCircleWalls(maze); if (maze.kind === 'hex') return renderHexWalls(maze); return renderRectWalls(maze); }
function rectGeom(maze) { const m = maze.render.margin, cw = (maze.render.width - 2*m) / maze.width, ch = (maze.render.height - 2*m) / maze.height; return { m, cw, ch }; }
function centerOf(maze, cell) {
  if (maze.kind === 'circle') { const cx = maze.render.width/2, cy = maze.render.height/2, maxR = maze.render.width/2 - maze.render.margin, dr = maxR / maze.meta.rings, r = (cell.ring + .5) * dr, a = (cell.seg + .5) * Math.PI * 2 / maze.meta.segments; return [cx + Math.cos(a)*r, cy + Math.sin(a)*r]; }
  if (maze.kind === 'hex') { const s = Math.min((maze.render.width - 100) / (maze.width * 1.55 + .5), (maze.render.height - 100) / (maze.height * 1.35 + .5)); return [60 + s + cell.x * 1.5 * s + ((cell.y & 1) ? .75*s : 0), 60 + s + cell.y * Math.sqrt(3) * .5 * s]; }
  const g = rectGeom(maze); return [g.m + (cell.x + .5) * g.cw, g.m + (cell.y + .5) * g.ch];
}
function renderRectWalls(maze) {
  const g = rectGeom(maze), out = [];
  maze.cells.forEach(c => { const x = g.m + c.x*g.cw, y = g.m + c.y*g.ch, e = validCell(maze,c.x+1,c.y), s = validCell(maze,c.x,c.y+1), n = validCell(maze,c.x,c.y-1), w = validCell(maze,c.x-1,c.y);
    if (!n || !c.links.has(n.id)) out.push(`<line x1="${x}" y1="${y}" x2="${x+g.cw}" y2="${y}"/>`);
    if ((!e || !c.links.has(e.id)) && c.id !== maze.finish.id) out.push(`<line x1="${x+g.cw}" y1="${y}" x2="${x+g.cw}" y2="${y+g.ch}"/>`);
    if (!s || !c.links.has(s.id)) out.push(`<line x1="${x+g.cw}" y1="${y+g.ch}" x2="${x}" y2="${y+g.ch}"/>`);
    if ((!w || !c.links.has(w.id)) && c.id !== maze.start.id) out.push(`<line x1="${x}" y1="${y+g.ch}" x2="${x}" y2="${y}"/>`);
  }); return out.join('\n');
}
function arcPath(cx, cy, r, a1, a2) { const p1=[cx+Math.cos(a1)*r,cy+Math.sin(a1)*r], p2=[cx+Math.cos(a2)*r,cy+Math.sin(a2)*r]; return `M ${p1[0]} ${p1[1]} A ${r} ${r} 0 ${a2-a1>Math.PI?1:0} 1 ${p2[0]} ${p2[1]}`; }
function renderCircleWalls(maze) { const cx=maze.render.width/2, cy=maze.render.height/2, maxR=cx-maze.render.margin, dr=maxR/maze.meta.rings, da=Math.PI*2/maze.meta.segments, out=[];
  maze.cells.forEach(c => { const inner=c.ring*dr, outer=(c.ring+1)*dr, a1=c.seg*da, a2=(c.seg+1)*da, inward=maze.cellMap.get((c.ring-1)+','+c.seg), outward=maze.cellMap.get((c.ring+1)+','+c.seg), cw=maze.cellMap.get(c.ring+','+((c.seg+1)%maze.meta.segments));
    if (c.ring===0 && c.seg===0) out.push(`<circle cx="${cx}" cy="${cy}" r="${inner+1}"/>`);
    if ((!outward || !c.links.has(outward.id)) && c.id !== maze.start.id) out.push(`<path d="${arcPath(cx,cy,outer,a1,a2)}"/>`);
    if (c.ring>0 && (!inward || !c.links.has(inward.id))) out.push(`<path d="${arcPath(cx,cy,inner,a1,a2)}"/>`);
    if (!c.links.has(cw.id)) out.push(`<line x1="${cx+Math.cos(a2)*inner}" y1="${cy+Math.sin(a2)*inner}" x2="${cx+Math.cos(a2)*outer}" y2="${cy+Math.sin(a2)*outer}"/>`);
  }); return out.join('\n'); }
function hexCorners(cx, cy, s) { return Array.from({length:6}, (_,i) => { const a = Math.PI/180*(60*i); return [cx + s*Math.cos(a), cy + s*Math.sin(a)]; }); }
function renderHexWalls(maze) { const s = Math.min((maze.render.width - 100) / (maze.width * 1.55 + .5), (maze.render.height - 100) / (maze.height * 1.35 + .5)), out=[];
  maze.cells.forEach(c => { const pts=hexCorners(...centerOf(maze,c), s*.48), ns=hexNeighborCoords(c.x,c.y); for(let i=0;i<6;i++){ const n=validCell(maze, ns[i][0], ns[i][1]); const isEntranceSide = c.id === maze.start.id && i === 3; const isExitSide = c.id === maze.finish.id && i === 0; if((!n || !c.links.has(n.id)) && !isEntranceSide && !isExitSide) out.push(`<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[(i+1)%6][0]}" y2="${pts[(i+1)%6][1]}"/>`); } }); return out.join('\n'); }
function renderSolutionToSVG(solution, options = {}) { if (!solution || !solution.length || !options.maze) return ''; const d = solution.map((c, i) => `${i ? 'L' : 'M'} ${centerOf(options.maze, c).join(' ')}`).join(' '); return `<path class="solution-path" d="${d}"/>`; }
function renderLabels(maze) { const [sx,sy]=centerOf(maze, maze.start), [fx,fy]=centerOf(maze, maze.finish); return `<text x="${sx}" y="${sy-12}" text-anchor="middle">START</text>\n<text x="${fx}" y="${fy+24}" text-anchor="middle">FINISH</text>`; }

// Export functions
function downloadSVG(svgString, filename) { const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function assertCleanSVG(svg) { return svg && !/(<image|foreignObject|base64|\.png|\.jpg|\.jpeg)/i.test(svg); }

// UI events
function readOptions() { return { type: document.getElementById('mazeType').value, difficulty: document.getElementById('difficulty').value, width: document.getElementById('mazeWidth').value, height: document.getElementById('mazeHeight').value, wallThickness: document.getElementById('wallThickness').value, seed: document.getElementById('seedInput').value, shapeType: document.getElementById('shapeType').value }; }
function regenerate() { const o = readOptions(); state.maze = generateMaze(o.type, o); state.solution = solveMaze(state.maze); state.showSolution = false; paint(); }
function paint() { const svg = renderMazeToSVG(state.maze, { wallThickness: readOptions().wallThickness, includeSolution: state.showSolution, solution: state.solution }); if (!assertCleanSVG(svg)) throw new Error('SVG quality check failed.'); document.getElementById('svgPreview').innerHTML = svg; updateInfo(); }
function updateInfo() { const m=state.maze, d=DIFFICULTIES[m.meta.difficulty] || DIFFICULTIES.medium; document.getElementById('mazeInfo').textContent = `Тип: ${m.meta.typeLabel}${m.meta.shapeType ? ' ('+m.meta.shapeType+')' : ''} | Сложность: ${d.label} | Seed: ${m.meta.seed} | Размер: ${m.width} × ${m.height} | Длина решения: ${state.solution.length}`; }
function syncShapeRow() { document.getElementById('shapeRow').style.display = document.getElementById('mazeType').value === 'shape' ? 'flex' : 'none'; }
function wireUI() { syncShapeRow(); document.getElementById('mazeType').addEventListener('change', syncShapeRow); document.getElementById('generateBtn').addEventListener('click', regenerate); document.getElementById('randomSeedBtn').addEventListener('click', () => { document.getElementById('seedInput').value = randomSeed(); regenerate(); }); document.getElementById('showSolutionBtn').addEventListener('click', () => { state.showSolution = true; paint(); }); document.getElementById('hideSolutionBtn').addEventListener('click', () => { state.showSolution = false; paint(); }); document.getElementById('downloadBtn').addEventListener('click', () => downloadSVG(renderMazeToSVG(state.maze, { wallThickness: readOptions().wallThickness, includeSolution: false }), `maze-${state.maze.kind}-${state.seed}.svg`)); document.getElementById('downloadSolutionBtn').addEventListener('click', () => downloadSVG(renderMazeToSVG(state.maze, { wallThickness: readOptions().wallThickness, includeSolution: true, solution: state.solution }), `maze-${state.maze.kind}-${state.seed}-solution.svg`)); regenerate(); }
if (typeof window !== 'undefined') { window.generateMaze = generateMaze; window.generateRectMaze = generateRectMaze; window.generateCircleMaze = generateCircleMaze; window.generateHexMaze = generateHexMaze; window.generateRoomMaze = generateRoomMaze; window.generateShapeMaze = generateShapeMaze; window.solveMaze = solveMaze; window.renderMazeToSVG = renderMazeToSVG; window.renderSolutionToSVG = renderSolutionToSVG; window.downloadSVG = downloadSVG; window.setSeed = setSeed; window.randomSeed = randomSeed; window.addEventListener('DOMContentLoaded', wireUI); }

/* GoMaster AI (heuristic + Monte Carlo)
   - API chính (gắn lên window.GoAI):
     GoAI.configure(opts)
     GoAI.suggestMove(state, options)
     GoAI.analyzeQuick(state, options)
     GoAI.analyzeDeep(state, options)
     GoAI.joseki(size)

   - State đầu vào (tối thiểu):
     {
       size: 9|13|19,
       board: string[][] | number[][] // board[y][x] với giá trị: 0,'.' rỗng; 'B'|'W' hoặc 1|-1
       toPlay: 'B'|'W' | 1|-1,
       komi: number,
       ruleSet: 'chinese'|'japanese',       // chỉ ảnh hưởng điểm (area vs territory heuristic)
       ko?: {x:number,y:number}|null,       // tuân thủ simple-ko nếu có
       lastMove?: {x:number,y:number,pass?:boolean}|null,
       historyHashes?: string[]             // tùy chọn, để check ko phức tạp
     }

   - Kết quả:
     suggestMove -> { move:{x,y,pass}, winrate:number, meanScore:number, level, candidates:[...], pv:[...], timeMs }
     analyzeQuick/Deep -> { winrate, meanScore, candidates:[...], ownership:number[][], pv, timeMs }

   Ghi chú:
   - AI này không phải KataGo, chỉ là heuristic + Monte Carlo nhẹ nên nhanh/trực quan cho client.
   - Với Pro, dùng nhiều playouts hơn và chọn top-K ứng viên rộng hơn.
*/
(function () {
  'use strict';

  const VERSION = '1.0.1'; // Cập nhật version sau fix

  // PRNG để tái lập kết quả (seedable)
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Tiện ích
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = -1;

  function toColor(c) {
    if (c === BLACK || c === WHITE) return c;
    if (c === 'B') return BLACK;
    if (c === 'W') return WHITE;
    if (c === 1 || c === -1) return c;
    throw new Error('Invalid color: ' + c);
  }
  function opp(color) {
    return color === BLACK ? WHITE : BLACK;
  }
  function inBounds(x, y, size) {
    return x >= 0 && y >= 0 && x < size && y < size;
  }
  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }
  function boardFromAny(anyBoard) {
    const size = anyBoard.length;
    const out = Array.from({ length: size }, () => Array(size).fill(EMPTY));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = anyBoard[y][x];
        if (v === '.' || v === 0 || v === EMPTY || v === null) out[y][x] = EMPTY;
        else if (v === 'B' || v === BLACK || v === 1) out[y][x] = BLACK;
        else if (v === 'W' || v === WHITE || v === -1) out[y][x] = WHITE;
        else out[y][x] = EMPTY;
      }
    }
    return out;
  }
  function countStones(board) {
    const size = board.length;
    let b = 0, w = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = board[y][x];
        if (s === BLACK) b++;
        else if (s === WHITE) w++;
      }
    }
    return { b, w, total: b + w };
  }
  function neighbors(x, y, size) {
    return [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].filter(([nx, ny]) => inBounds(nx, ny, size));
  }
  function diagNeighbors(x, y, size) {
    return [
      [x + 1, y + 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x - 1, y - 1],
    ].filter(([nx, ny]) => inBounds(nx, ny, size));
  }

  // Group + Liberties (sửa dùng BFS để tránh stack overflow)
  function getGroup(board, x, y) {
    const size = board.length;
    const color = board[y][x];
    if (color === EMPTY) return null;
    const queue = [[x, y]]; // BFS
    const visited = new Set();
    const stones = [];
    const liberties = new Set();

    while (queue.length) {
      const [cx, cy] = queue.shift();
      const key = cx + ',' + cy;
      if (visited.has(key)) continue;
      visited.add(key);
      stones.push([cx, cy]);
      for (const [nx, ny] of neighbors(cx, cy, size)) {
        const v = board[ny][nx];
        if (v === EMPTY) {
          liberties.add(nx + ',' + ny);
        } else if (v === color) {
          const nkey = nx + ',' + ny;
          if (!visited.has(nkey)) queue.push([nx, ny]);
        }
      }
    }
    return { color, stones, liberties };
  }

  function isSelfAtariAfter(board, x, y, color) {
    const size = board.length;
    if (board[y][x] !== EMPTY) return false;
    const b2 = cloneBoard(board);
    b2[y][x] = color;

    let captured = 0;
    for (const [nx, ny] of neighbors(x, y, size)) {
      if (b2[ny][nx] === opp(color)) {
        const g = getGroup(b2, nx, ny);
        if (g && g.liberties.size === 0) {
          for (const [sx, sy] of g.stones) {
            b2[sy][sx] = EMPTY;
            captured++;
          }
        }
      }
    }
    const gSelf = getGroup(b2, x, y);
    if (!gSelf) return false;
    if (captured > 0) return false;
    return gSelf.liberties.size <= 1;
  }

  function wouldCapture(board, x, y, color) {
    const size = board.length;
    if (board[y][x] !== EMPTY) return 0;
    let cap = 0;
    const visited = new Set();
    for (const [nx, ny] of neighbors(x, y, size)) {
      if (board[ny][nx] === opp(color)) {
        const key = nx + ',' + ny;
        if (visited.has(key)) continue;
        const g = getGroup(board, nx, ny);
        g.stones.forEach(([sx, sy]) => visited.add(sx + ',' + sy));
        if (g.liberties.size === 1 && g.liberties.has(x + ',' + y)) {
          cap += g.stones.length;
        }
      }
    }
    return cap;
  }

  function isAtari(board, x, y) {
    const g = getGroup(board, x, y);
    if (!g) return false;
    return g.liberties.size === 1;
  }

  function connectCount(board, x, y, color) {
    const size = board.length;
    const groups = new Map();
    for (const [nx, ny] of neighbors(x, y, size)) {
      if (board[ny][nx] === color) {
        const g = getGroup(board, nx, ny);
        if (g) groups.set(g.stones[0][0] + ',' + g.stones[0][1], g);
      }
    }
    return groups.size;
  }

  function isSimpleEye(board, x, y, color) {
    const size = board.length;
    if (board[y][x] !== EMPTY) return false;
    const neigh = neighbors(x, y, size);
    if (neigh.length < 3) return false;
    if (!neigh.every(([nx, ny]) => board[ny][nx] === color)) return false;
    const diags = diagNeighbors(x, y, size);
    let oppOrEdgeCount = 0;
    for (const [dx, dy] of diags) {
      const v = board[dy][dx];
      if (v === opp(color)) oppOrEdgeCount++;
    }
    return oppOrEdgeCount <= 1;
  }

  function isLegal(board, x, y, color, state) {
    const size = board.length;
    if (x == null || y == null) return true; // pass
    if (!inBounds(x, y, size)) return false;
    if (board[y][x] !== EMPTY) return false;
    if (state && state.ko && state.ko.x === x && state.ko.y === y) return false;

    const b2 = cloneBoard(board);
    b2[y][x] = color;

    for (const [nx, ny] of neighbors(x, y, size)) {
      if (b2[ny][nx] === opp(color)) {
        const g = getGroup(b2, nx, ny);
        if (g && g.liberties.size === 0) {
          for (const [sx, sy] of g.stones) b2[sy][sx] = EMPTY;
        }
      }
    }

    const gSelf = getGroup(b2, x, y);
    if (!gSelf || gSelf.liberties.size === 0) return false;

    // TODO: Nếu có historyHashes, check superko (bỏ qua để đơn giản)
    return true;
  }

  function applyMove(board, move, color, state) {
    if (move.pass) return { board, captured: 0, newKo: null };
    const { x, y } = move;
    const size = board.length;
    const b2 = cloneBoard(board);
    b2[y][x] = color;

    let captured = 0;
    let newKo = null;
    for (const [nx, ny] of neighbors(x, y, size)) {
      if (b2[ny][nx] === opp(color)) {
        const g = getGroup(b2, nx, ny);
        if (g && g.liberties.size === 0) {
          for (const [sx, sy] of g.stones) {
            b2[sy][sx] = EMPTY;
            captured++;
          }
          // Nếu bắt đúng 1 quân, set ko tại vị trí bắt
          if (g.stones.length === 1) newKo = { x: g.stones[0][0], y: g.stones[0][1] };
        }
      }
    }
    const gSelf = getGroup(b2, x, y);
    if (!gSelf || gSelf.liberties.size === 0) {
      return { board, captured: 0, newKo: null }; // invalid
    }
    return { board: b2, captured, newKo };
  }

  // Ước lượng điểm (sửa cho Japanese)
  function scoreBoard(board, komi, ruleSet) {
    const size = board.length;
    let areaB = 0, areaW = 0, territoryB = 0, territoryW = 0;

    // Đếm quân
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (board[y][x] === BLACK) areaB++;
        else if (board[y][x] === WHITE) areaW++;
      }
    }

    // Flood-fill vùng trống
    const visited = Array.from({ length: size }, () => Array(size).fill(false));
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (board[y][x] !== EMPTY || visited[y][x]) continue;
        const queue = [[x, y]];
        visited[y][x] = true;
        const region = [[x, y]];
        const adjColors = new Set();
        while (queue.length) {
          const [cx, cy] = queue.shift();
          for (const [dx, dy] of dirs) {
            const nx = cx + dx, ny = cy + dy;
            if (!inBounds(nx, ny, size)) continue;
            const v = board[ny][nx];
            if (v === EMPTY && !visited[ny][nx]) {
              visited[ny][nx] = true;
              queue.push([nx, ny]);
              region.push([nx, ny]);
            } else if (v === BLACK || v === WHITE) {
              adjColors.add(v);
            }
          }
        }
        if (adjColors.size === 1) {
          const owner = [...adjColors][0];
          if (owner === BLACK) {
            areaB += region.length;
            territoryB += region.length;
          } else {
            areaW += region.length;
            territoryW += region.length;
          }
        }
      }
    }

    // Điều chỉnh cho Japanese: territory + captures (heuristic, trừ dead if liberties=0)
    if (ruleSet === 'japanese') {
      let deadB = 0, deadW = 0;
      const visitedGroups = new Set();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const color = board[y][x];
          if (color === EMPTY || visitedGroups.has(x + ',' + y)) continue;
          const g = getGroup(board, x, y);
          if (g) {
            g.stones.forEach(([sx, sy]) => visitedGroups.add(sx + ',' + sy));
            if (g.liberties.size === 0) {
              if (g.color === BLACK) deadB += g.stones.length;
              else deadW += g.stones.length;
            }
          }
        }
      }
      const score = territoryB + deadW - (territoryW + deadB) + (areaB - areaW) / 2 - komi; // Heuristic mix
      return score;
    } else {
      return areaB - (areaW + komi);
    }
  }

  function winrateFromScore(score, size) {
    const scale = size >= 19 ? 12 : size >= 13 ? 8 : 5; // Giảm scale để winrate nhạy cảm hơn
    const wr = 1 / (1 + Math.exp(-score / scale));
    return wr;
  }

  // Chính sách (policy) heuristic: trả về prior P cho từng nước (sửa sum=0)
  function policyPrior(state, moves) {
    const { size, board: b0, toPlay, lastMove } = state;
    const board = boardFromAny(b0);
    const color = toColor(toPlay);

    const counts = countStones(board);
    const moveCount = counts.total;
    const opening = moveCount < (size === 19 ? 30 : size === 13 ? 18 : 10);
    const midgame = !opening && moveCount < (size === 19 ? 160 : size === 13 ? 90 : 45);
    const endgame = !opening && !midgame;

    const priors = new Map();
    const small = 1e-6;

    function distToCenter(x, y) {
      const c = (size - 1) / 2;
      const dx = x - c, dy = y - c;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function isCornerRegion(x, y) {
      const t = Math.min(x, y, size - 1 - x, size - 1 - y);
      return t <= 3;
    }
    function isSideRegion(x, y) {
      const t = Math.min(x, y, size - 1 - x, size - 1 - y);
      return t <= 1;
    }
    function dist(a, b) {
      if (!a || !b || a.pass || b.pass) return 9e9;
      const dx = a.x - b.x, dy = a.y - b.y;
      return Math.abs(dx) + Math.abs(dy);
    }

    for (const m of moves) {
      if (m.pass) {
        const base = endgame ? 0.25 : 0.01;
        priors.set(keyOf(m), base);
        continue;
      }
      const { x, y } = m;

      const cap = wouldCapture(board, x, y, color);
      const selfAtari = isSelfAtariAfter(board, x, y, color);
      const conn = connectCount(board, x, y, color);
      const atariSave = neighbors(x, y, size).some(([nx, ny]) => board[ny][nx] === color && isAtari(board, nx, ny));
      const atariThreat = neighbors(x, y, size).some(([nx, ny]) => board[ny][nx] === opp(color) && isAtari(board, nx, ny));
      const eyeOwn = isSimpleEye(board, x, y, color);
      const eyeOpp = isSimpleEye(board, x, y, opp(color));
      const dCenter = distToCenter(x, y);
      const nearLast = lastMove ? dist(m, lastMove) : 9e9;

      let s = 0;

      s += cap * 3.0;
      if (atariThreat) s += 1.2;
      if (atariSave) s += 1.4;
      s += Math.max(0, conn - 1) * 0.8;
      if (selfAtari) s -= 3.0;
      if (eyeOwn) s -= opening ? 1.5 : 0.5;
      if (eyeOpp) s += 0.6;

      if (opening) {
        if (isCornerRegion(x, y)) s += 0.9;
        else if (isSideRegion(x, y)) s += 0.5;
        s += Math.max(0, 4 - dCenter) * 0.1;
        if (nearLast <= 4) s += 0.2;
      } else if (midgame) {
        if (nearLast <= 3) s += 0.3;
        s += 0.1;
      } else {
        s += 0.05;
      }

      const b2 = applyMove(board, { x, y }, color, state).board;
      const g = getGroup(b2, x, y);
      if (g) s += Math.min(4, g.liberties.size) * 0.1;

      priors.set(keyOf(m), Math.max(small, s));
    }

    // Chuẩn hóa softmax (sửa nếu sum=0)
    const values = [...priors.values()];
    const maxv = Math.max(...values, 0); // Tránh NaN
    let sum = 0;
    const expMap = new Map();
    for (const [k, v] of priors) {
      const ev = Math.exp(v - maxv);
      expMap.set(k, ev);
      sum += ev;
    }
    const out = new Map();
    if (sum === 0) sum = 1; // Fallback uniform
    for (const [k, ev] of expMap) {
      out.set(k, ev / sum);
    }
    return out;
  }

  function keyOf(m) { return m.pass ? 'P' : m.x + ',' + m.y; }
  function parseKey(k) {
    if (k === 'P') return { pass: true };
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  }

  function listLegalMoves(state) {
    const { size, board: b0, toPlay } = state;
    const board = boardFromAny(b0);
    const color = toColor(toPlay);
    const moves = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (board[y][x] !== EMPTY) continue;
        if (isLegal(board, x, y, color, state)) {
          moves.push({ x, y });
        }
      }
    }
    moves.push({ pass: true });
    return moves;
  }

  // Random chọn theo trọng số
  function weightedChoice(rng, items, weights) {
    const r = rng();
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      acc += weights[i];
      if (r <= acc) return items[i];
    }
    return items[items.length - 1];
  }

  function rollout(state, rng, maxMoves = 200) {
    const { size, komi, ruleSet } = state;
    let board = boardFromAny(state.board);
    let toPlay = toColor(state.toPlay);
    let ko = state.ko; // Sửa: theo dõi ko trong rollout
    let passCount = 0;
    let steps = 0;

    while (passCount < 2 && steps < maxMoves) {
      const sNow = {
        ...state,
        board,
        toPlay,
        ko, // Truyền ko hiện tại
      };
      const moves = listLegalMoves(sNow);
      if (moves.length === 0) return scoreBoard(board, komi, ruleSet);

      const pri = policyPrior(sNow, moves);
      const keys = moves.map(keyOf);
      const ws = keys.map((k) => pri.get(k) || 1e-6);
      const m = weightedChoice(rng, moves, normalizeWeights(ws));

      if (m.pass) passCount++;
      else {
        passCount = 0;
        const { board: b2, newKo } = applyMove(board, m, toPlay, sNow);
        board = b2;
        ko = newKo; // Cập nhật ko mới
      }
      toPlay = opp(toPlay);
      steps++;
    }
    return scoreBoard(board, komi, ruleSet);
  }

  function normalizeWeights(ws) {
    let s = ws.reduce((a, b) => a + b, 0);
    if (!s) s = 1;
    return ws.map((w) => w / s);
  }

  // Đánh giá ứng viên bằng nhiều playouts
  function evaluateCandidatesByPlayouts(state, candidates, playoutsPerMove, rng, options = {}) {
    const { size, komi, ruleSet } = state;
    const color = toColor(state.toPlay);
    const results = [];
    const maxMoves = options.maxMoves || (size === 19 ? 360 : size === 13 ? 200 : 120);

    for (const cand of candidates) {
      let sumScore = 0;
      let wins = 0;
      for (let i = 0; i < playoutsPerMove; i++) {
        let board = boardFromAny(state.board);
        let toPlay = color;
        let sNow = { ...state, board, toPlay };

        let firstMove = cand;
        if (!firstMove.pass) {
          const { board: b2 } = applyMove(board, firstMove, toPlay, sNow);
          board = b2;
        }
        toPlay = opp(toPlay);
        sNow = { ...state, board, toPlay };

        const finalScore = rollout(sNow, rng, maxMoves);
        sumScore += finalScore;
        const blackWin = finalScore > 0 ? 1 : finalScore < 0 ? 0 : 0.5;
        wins += blackWin;
      }
      const meanScore = sumScore / Math.max(1, playoutsPerMove);
      let wrBlack = wins / Math.max(1, playoutsPerMove);
      const wrForToPlay = color === BLACK ? wrBlack : 1 - wrBlack;

      results.push({
        move: cand,
        meanScore,
        winrate: wrForToPlay,
      });
    }
    results.sort((a, b) => b.winrate - a.winrate || b.meanScore - a.meanScore);
    return results;
  }

  // Ownership map (sửa để bao gồm territory)
  function ownershipEstimate(state, rng, samples = 64) {
    const size = state.size;
    const acc = Array.from({ length: size }, () => Array(size).fill(0));
    for (let s = 0; s < samples; s++) {
      const final = rolloutWithFinalBoard(state, rng, size === 19 ? 180 : 100);
      const fb = final.board;
      // Sử dụng scoreBoard để ước lượng owner cho EMPTY
      const visited = Array.from({ length: size }, () => Array(size).fill(false));
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (fb[y][x] === BLACK) acc[y][x] += 1;
          else if (fb[y][x] === WHITE) acc[y][x] -= 1;
          else if (visited[y][x]) continue;
          // Flood-fill cho EMPTY
          const queue = [[x, y]];
          visited[y][x] = true;
          const region = [];
          const adjColors = new Set();
          while (queue.length) {
            const [cx, cy] = queue.shift();
            region.push([cx, cy]);
            for (const [dx, dy] of dirs) {
              const nx = cx + dx, ny = cy + dy;
              if (!inBounds(nx, ny, size) || visited[ny][nx]) continue;
              const v = fb[ny][nx];
              if (v === EMPTY) {
                visited[ny][nx] = true;
                queue.push([nx, ny]);
              } else {
                adjColors.add(v);
              }
            }
          }
          if (adjColors.size === 1) {
            const owner = [...adjColors][0];
            const val = owner === BLACK ? 1 : -1;
            region.forEach(([rx, ry]) => acc[ry][rx] += val);
          }
        }
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        acc[y][x] = Math.max(-1, Math.min(1, acc[y][x] / Math.max(1, samples)));
      }
    }
    return acc;
  }

  function rolloutWithFinalBoard(state, rng, maxMoves = 200) {
    let board = boardFromAny(state.board);
    let toPlay = toColor(state.toPlay);
    let ko = state.ko; // Sửa: theo dõi ko
    const { komi, ruleSet } = state;
    let passCount = 0, steps = 0;

    while (passCount < 2 && steps < maxMoves) {
      const sNow = { ...state, board, toPlay, ko };
      const moves = listLegalMoves(sNow);
      if (moves.length === 0) break;

      const pri = policyPrior(sNow, moves);
      const keys = moves.map(keyOf);
      const ws = keys.map((k) => pri.get(k) || 1e-6);
      const m = weightedChoice(rng, moves, normalizeWeights(ws));
      if (m.pass) passCount++;
      else {
        passCount = 0;
        const { board: b2, newKo } = applyMove(board, m, toPlay, sNow);
        board = b2;
        ko = newKo;
      }
      toPlay = opp(toPlay);
      steps++;
    }
    const score = scoreBoard(board, komi, ruleSet);
    return { board, score };
  }

  // Chọn K ứng viên tốt nhất theo prior
  function topKByPrior(state, moves, K, rng) {
    const pri = policyPrior(state, moves);
    const scored = moves.map((m) => ({ move: m, p: pri.get(keyOf(m)) || 1e-6 }));
    scored.sort((a, b) => b.p - a.p);
    const top = scored.slice(0, Math.min(K, scored.length)).map((s) => s.move);
    if (!top.length) return [{ pass: true }];
    return top;
  }

  // Mức độ AI
  const LEVELS = {
    easy:   { K: 12, playouts: 0 },
    normal: { K: 12, playouts: 16 },
    hard:   { K: 16, playouts: 48 },
    pro:    { K: 20, playouts: 120 },
  };

  // Gợi ý nước đi chính
  function suggestMove(stateInput, options = {}) {
    const t0 = performance.now();
    const state = normalizeState(stateInput);
    const level = options.level || 'normal';
    const seed = options.seed || 12345;
    const rng = mulberry32(seed);

    const moves = listLegalMoves(state);
    if (moves.length === 0) {
      return {
        move: { pass: true },
        winrate: 0.5,
        meanScore: 0,
        level,
        candidates: [],
        pv: [{ pass: true }],
        timeMs: Math.round(performance.now() - t0),
      };
    }

    const params = LEVELS[level] || LEVELS.normal;
    let best, candidates;

    if (params.playouts <= 0) {
      const pri = policyPrior(state, moves);
      const keys = moves.map(keyOf);
      const ws = keys.map((k) => pri.get(k) || 1e-6);
      const m = weightedChoice(rng, moves, normalizeWeights(ws));
      best = { move: m, winrate: 0.5, meanScore: 0 };
      candidates = keys.map((k, i) => {
        const mv = parseKey(k);
        return { move: mv, winrate: 0.5, meanScore: 0, prior: ws[i] };
      }).sort((a, b) => (b.prior || 0) - (a.prior || 0)).slice(0, 10);
    } else {
      const top = topKByPrior(state, moves, params.K, rng);
      const evals = evaluateCandidatesByPlayouts(state, top, params.playouts, rng, options);
      best = evals[0] || { move: { pass: true }, winrate: 0.5, meanScore: 0 };
      candidates = evals;
    }

    const pv = principalVariation(state, best.move, rng, level);

    const t1 = performance.now();
    return {
      move: best.move,
      winrate: round2(best.winrate),
      meanScore: round2(best.meanScore),
      level,
      candidates: candidates.map(c => ({
        move: c.move,
        winrate: round2(c.winrate),
        meanScore: round2(c.meanScore),
      })),
      pv,
      timeMs: Math.round(t1 - t0),
    };
  }

  function principalVariation(state, firstMove, rng, level) {
    const steps = 6;
    const seq = [];
    let s = { ...state, board: boardFromAny(state.board), toPlay: toColor(state.toPlay), ko: state.ko };
    if (firstMove && !firstMove.pass) {
      const { board: b2, newKo } = applyMove(s.board, firstMove, s.toPlay, s);
      s.board = b2; s.toPlay = opp(s.toPlay); s.ko = newKo;
      seq.push(firstMove);
    } else if (firstMove && firstMove.pass) {
      seq.push(firstMove);
      s.toPlay = opp(s.toPlay);
    }
    const params = LEVELS[level] || LEVELS.normal;
    for (let i = seq.length; i < steps; i++) {
      const moves = listLegalMoves(s);
      if (!moves.length) break;
      if (params.playouts <= 0) {
        const pri = policyPrior(s, moves);
        const keys = moves.map(keyOf);
        const ws = normalizeWeights(keys.map(k => pri.get(k) || 1e-6));
        const m = weightedChoice(rng, moves, ws); // Sửa: dùng cùng rng
        seq.push(m);
        if (!m.pass) {
          const { board: b2, newKo } = applyMove(s.board, m, s.toPlay, s);
          s.board = b2; s.ko = newKo;
        }
        s.toPlay = opp(s.toPlay);
      } else {
        const top = topKByPrior(s, moves, Math.min(8, params.K), rng);
        const evals = evaluateCandidatesByPlayouts(s, top, Math.max(4, Math.floor(params.playouts / 4)), rng);
        const m = evals[0]?.move || { pass: true };
        seq.push(m);
        if (!m.pass) {
          const { board: b2, newKo } = applyMove(s.board, m, s.toPlay, s);
          s.board = b2; s.ko = newKo;
        }
        s.toPlay = opp(s.toPlay);
      }
    }
    return seq;
  }

  // Phân tích nhanh
  function analyzeQuick(stateInput, options = {}) {
    const t0 = performance.now();
    const state = normalizeState(stateInput);
    const seed = options.seed || 9999;
    const rng = mulberry32(seed);

    const moves = listLegalMoves(state);
    const top = topKByPrior(state, moves, 12, rng);
    const evals = evaluateCandidatesByPlayouts(state, top, 10, rng, options);
    const best = evals[0] || { move: { pass: true }, winrate: 0.5, meanScore: 0 };

    const pv = principalVariation(state, best.move, rng, 'normal');

    const t1 = performance.now();
    return {
      winrate: round2(best.winrate),
      meanScore: round2(best.meanScore),
      candidates: evals.map(c => ({ move: c.move, winrate: round2(c.winrate), meanScore: round2(c.meanScore) })),
      ownership: null,
      pv,
      timeMs: Math.round(t1 - t0),
    };
  }

  // Phân tích sâu
  function analyzeDeep(stateInput, options = {}) {
    const t0 = performance.now();
    const state = normalizeState(stateInput);
    const seed = options.seed || 424242;
    const rng = mulberry32(seed);

    const moves = listLegalMoves(state);
    const top = topKByPrior(state, moves, 20, rng);
    const evals = evaluateCandidatesByPlayouts(state, top, 64, rng, { maxMoves: options.maxMoves });
    const best = evals[0] || { move: { pass: true }, winrate: 0.5, meanScore: 0 };

    const ownership = ownershipEstimate(state, rng, options.ownershipSamples || 96);

    const pv = principalVariation(state, best.move, rng, 'pro');

    const t1 = performance.now();
    return {
      winrate: round2(best.winrate),
      meanScore: round2(best.meanScore),
      candidates: evals.map(c => ({ move: c.move, winrate: round2(c.winrate), meanScore: round2(c.meanScore) })),
      ownership,
      pv,
      timeMs: Math.round(t1 - t0),
    };
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  function normalizeState(s) {
    if (!s) throw new Error('state required');
    const size = s.size;
    if (![9, 13, 19].includes(size)) throw new Error('size must be 9/13/19');
    const board = boardFromAny(s.board);
    const toPlay = toColor(s.toPlay);
    const komi = typeof s.komi === 'number' ? s.komi : 6.5;
    const ruleSet = s.ruleSet === 'japanese' ? 'japanese' : 'chinese';
    return {
      size,
      board,
      toPlay,
      komi,
      ruleSet,
      ko: s.ko || null,
      lastMove: s.lastMove || null,
      historyHashes: s.historyHashes || null,
    };
  }

  // Joseki/Fuseki cơ bản (demo, thêm mirror đơn giản)
  function joseki(size = 19) {
    const star = size === 19 ? 3 : size === 13 ? 3 : 2;
    const komoku = size === 19 ? 3 : 2;
    const hoshi = size === 19 ? 3 : 2;

    const patterns = [
      {
        name: 'Hoshi approach (4-4, low approach)',
        seq: [
          { x: hoshi, y: hoshi },
          { x: hoshi + 2, y: hoshi },
          { x: hoshi, y: hoshi + 2 },
          { x: hoshi + 1, y: hoshi + 1 },
        ],
      },
      // Thêm mirror ví dụ
      {
        name: 'Mirror Hoshi (bottom right)',
        seq: [
          { x: size - 1 - hoshi, y: size - 1 - hoshi },
          { x: size - 1 - hoshi - 2, y: size - 1 - hoshi },
          { x: size - 1 - hoshi, y: size - 1 - hoshi - 2 },
          { x: size - 1 - hoshi - 1, y: size - 1 - hoshi - 1 },
        ],
      },
      // ... (giữ nguyên các pattern khác)
    ];
    return patterns;
  }

  function configure(opts = {}) {
    return { version: VERSION, ok: true, opts };
  }

  // Public API
  const GoAI = {
    version: VERSION,
    configure,
    suggestMove,
    analyzeQuick,
    analyzeDeep,
    joseki,
  };

  if (typeof window !== 'undefined') window.GoAI = GoAI;
  if (typeof globalThis !== 'undefined') globalThis.GoAI = GoAI;
})();

// ai.js (sửa để tích hợp với GoAI)
function getAIMove(board, size, color, level) {
  const state = {
    size,
    board, // Giả sử board[y][x] như GoAI
    toPlay: color === 1 ? 'B' : 'W', // 1=BLACK, -1=WHITE
    komi: 6.5,
    ruleSet: 'chinese',
  };
  const res = GoAI.suggestMove(state, { level });
  return res.move; // Trả về {x, y} hoặc {pass: true}
}

function isLegalMove(x, y, color, board, size) {
  const state = {
    size,
    board,
    toPlay: color === 1 ? 'B' : 'W',
  };
  return isLegal(board, x, y, toColor(state.toPlay), state); // Reuse from GoAI
}

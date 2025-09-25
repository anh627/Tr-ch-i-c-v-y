// game.js – core logic Cờ Vây + vẽ bàn + SGF + storage helpers
(function () {
  const GM = {};

  // ---------- Storage & Profile ----------
  const DEFAULT_STATE = {
    profile: { name: "", country: "VN", bio: "" },
    rating: 1200,
    history: [], // ranked history
    stats: { games: 0, wins: 0, losses: 0, captures: 0, puzzlesSolved: 0 },
    achievements: {}
  };
  const KEY = "gomaster";
  GM.getState = () => Security.safeLocalGet(KEY, DEFAULT_STATE);
  GM.setState = (s) => Security.safeLocalSet(KEY, s);
  GM.updateState = (patch) => {
    const s = GM.getState();
    const out = { ...s, ...patch, profile: { ...s.profile, ...(patch.profile || {}) },
      stats: { ...s.stats, ...(patch.stats || {}) },
      achievements: { ...s.achievements, ...(patch.achievements || {}) },
    };
    GM.setState(out);
    return out;
  };

  GM.rankFromRating = (r) => {
    // Sơ đồ quy đổi đơn giản: 500 -> 25k ... 2100 -> 9d
    if (r < 500) r = 500;
    if (r > 2600) r = 2600;
    const bands = [
      { min: 500, max: 1000, from: 25, to: 10, type: "k" },   // 25k -> 10k
      { min: 1000, max: 1600, from: 9, to: 1, type: "k" },    // 9k -> 1k
      { min: 1600, max: 2600, from: 1, to: 9, type: "d" }     // 1d -> 9d
    ];
    for (const b of bands) {
      if (r <= b.max) {
        const t = (r - b.min) / (b.max - b.min);
        const rankVal = Math.round(b.from + t * (b.to - b.from));
        return b.type === "k" ? `${rankVal}k` : `${rankVal}d`;
      }
    }
    return "—";
  };

  GM.updateRankingAfterGame = (result, meta) => {
    // result: "B+R", "W+5.5"...
    const s = GM.getState();
    const youWon = result.startsWith("B+") || result.startsWith("W+")
      ? (meta.youAreBlack ? result.startsWith("B+") : result.startsWith("W+"))
      : false;
    const K = 32;
    // AI rating by level
    const AI_R = { easy: 900, normal: 1200, hard: 1500, pro: 1800 }[meta.aiLevel || "normal"];
    const expected = 1 / (1 + Math.pow(10, ((AI_R - s.rating) / 400)));
    const score = youWon ? 1 : 0;
    const delta = Math.round(K * (score - expected));
    const newRating = Math.max(300, s.rating + delta);
    const histItem = {
      date: new Date().toISOString(),
      size: meta.size,
      mode: meta.ranked ? "Ranked" : "Casual",
      opp: meta.opponent,
      result,
      delta
    };
    const newStats = {
      ...s.stats,
      games: s.stats.games + 1,
      wins: s.stats.wins + (youWon ? 1 : 0),
      losses: s.stats.losses + (youWon ? 0 : 1)
    };
    GM.setState({ ...s, rating: newRating, history: [histItem, ...s.history].slice(0, 200), stats: newStats });
    return { newRating, delta, rank: GM.rankFromRating(newRating) };
  };

  // ---------- Go Core ----------
  const BLACK = 1, WHITE = 2, EMPTY = 0;
  const OTHER = (c) => (c === BLACK ? WHITE : BLACK);

  class Game {
    constructor(size = 19, ruleSet = "chinese", komi = 6.5) {
      this.size = size;
      this.ruleSet = ruleSet;
      this.komi = komi;
      this.board = new Uint8Array(size * size);
      this.toMove = BLACK;
      this.history = []; // {x,y,color,captured:[idx], koPoint, pass}
      this.koPoint = -1; // idx
      this.ended = false;
      this.lastMove = null; // {x,y}
      this.captures = { [BLACK]: 0, [WHITE]: 0 };
    }
    clone() {
      const g = new Game(this.size, this.ruleSet, this.komi);
      g.board = new Uint8Array(this.board);
      g.toMove = this.toMove;
      g.history = this.history.map(m => ({...m, captured: m.captured?.slice()}));
      g.koPoint = this.koPoint;
      g.ended = this.ended;
      g.lastMove = this.lastMove ? {...this.lastMove} : null;
      g.captures = { ...this.captures };
      return g;
    }
    idx(x, y) { return y * this.size + x; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
    get(x, y) { return this.board[this.idx(x, y)]; }
    set(x, y, v) { this.board[this.idx(x, y)] = v; }

    neighbors(x, y) {
      const n = [];
      if (x > 0) n.push([x - 1, y]);
      if (x < this.size - 1) n.push([x + 1, y]);
      if (y > 0) n.push([x, y - 1]);
      if (y < this.size - 1) n.push([x, y + 1]);
      return n;
    }
    groupAt(x, y) {
      const color = this.get(x, y);
      if (!color) return { stones: [], liberties: new Set() };
      const stones = [];
      const liberties = new Set();
      const seen = new Set([this.idx(x, y)]);
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        stones.push([cx, cy]);
        for (const [nx, ny] of this.neighbors(cx, cy)) {
          const v = this.get(nx, ny);
          const id = this.idx(nx, ny);
          if (v === EMPTY) liberties.add(id);
          else if (v === color && !seen.has(id)) { seen.add(id); stack.push([nx, ny]); }
        }
      }
      return { stones, liberties };
    }
    place(x, y, color = this.toMove) {
      if (this.ended) return { ok: false, reason: "ended" };
      if (!this.inBounds(x, y)) return { ok: false, reason: "oob" };
      const id = this.idx(x, y);
      if (this.board[id] !== EMPTY) return { ok: false, reason: "occupied" };
      if (id === this.koPoint) return { ok: false, reason: "ko" };

      // Tentative
      this.board[id] = color;

      let totalCaptured = 0;
      const captured = [];
      for (const [nx, ny] of this.neighbors(x, y)) {
        if (this.get(nx, ny) === OTHER(color)) {
          const grp = this.groupAt(nx, ny);
          if (grp.liberties.size === 0) {
            // capture
            for (const [sx, sy] of grp.stones) {
              this.set(sx, sy, EMPTY);
              captured.push(this.idx(sx, sy));
              totalCaptured++;
            }
          }
        }
      }
      // Check self-capture (suicide)
      const g = this.groupAt(x, y);
      if (g.liberties.size === 0 && totalCaptured === 0) {
        // illegal
        this.board[id] = EMPTY;
        return { ok: false, reason: "suicide" };
      }

      // Ko point detection
      let nextKo = -1;
      if (totalCaptured === 1 && g.stones.length === 1) {
        // classic ko
        nextKo = captured[0];
      }

      this.history.push({ x, y, color, captured: captured.slice(), koPoint: this.koPoint, pass: false });
      this.captures[color] += totalCaptured;
      this.koPoint = nextKo;
      this.lastMove = { x, y };
      this.toMove = OTHER(color);
      return { ok: true, captured: totalCaptured };
    }
    pass() {
      if (this.ended) return;
      this.history.push({ pass: true, color: this.toMove, koPoint: this.koPoint, captured: [] });
      this.koPoint = -1;
      this.lastMove = null;
      if (this.history.length >= 2) {
        const len = this.history.length;
        if (this.history[len - 1].pass && this.history[len - 2].pass) {
          this.ended = true;
        }
      }
      this.toMove = OTHER(this.toMove);
    }
    resign() {
      this.ended = true;
    }
    undo() {
      if (!this.history.length) return;
      const m = this.history.pop();
      this.koPoint = m.koPoint;
      if (m.pass) {
        this.toMove = OTHER(m.color);
        this.lastMove = null;
        return;
      }
      // Remove the last placed stone
      if (this.inBounds(m.x, m.y) && this.get(m.x, m.y) !== EMPTY) {
        this.set(m.x, m.y, EMPTY);
      }
      // Restore captured stones
      const opp = OTHER(m.color);
      for (const cid of m.captured) this.board[cid] = opp;
      this.captures[m.color] -= (m.captured?.length || 0);
      this.toMove = m.color;
      this.lastMove = null;
      this.ended = false;
    }
    listLegalMoves(color = this.toMove) {
      const moves = [];
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          if (this.get(x, y) !== EMPTY) continue;
          if (this.idx(x, y) === this.koPoint) continue;
          // Quick legality check (no suicide unless capture)
          // simulate minimal
          const tmp = this.get(x, y);
          this.set(x, y, color);
          let cap = 0;
          for (const [nx, ny] of this.neighbors(x, y)) {
            if (this.get(nx, ny) === OTHER(color)) {
              const grp = this.groupAt(nx, ny);
              if (grp.liberties.size === 0) cap += grp.stones.length;
            }
          }
          const g = this.groupAt(x, y);
          const ok = (g.liberties.size > 0) || cap > 0;
          this.set(x, y, tmp);
          if (ok) moves.push([x, y]);
        }
      }
      return moves;
    }

    score() {
      // Flood-fill empty regions: single-color borders -> territory
      const N = this.size;
      const seen = new Set();
      let terrB = 0, terrW = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const id = this.idx(x, y);
          if (this.board[id] !== EMPTY || seen.has(id)) continue;
          const q = [[x, y]];
          seen.add(id);
          const region = [[x, y]];
          const borders = new Set();
          while (q.length) {
            const [cx, cy] = q.pop();
            for (const [nx, ny] of this.neighbors(cx, cy)) {
              const nid = this.idx(nx, ny);
              const v = this.board[nid];
              if (v === EMPTY) {
                if (!seen.has(nid)) { seen.add(nid); q.push([nx, ny]); region.push([nx, ny]); }
              } else {
                borders.add(v);
              }
            }
          }
          if (borders.size === 1) {
            const owner = [...borders][0];
            if (owner === BLACK) terrB += region.length;
            if (owner === WHITE) terrW += region.length;
          }
        }
      }
      const stonesB = this.board.filter(v => v === BLACK).length;
      const stonesW = this.board.filter(v => v === WHITE).length;
      // Chinese: area (stones + territory)
      const areaB = stonesB + terrB;
      const areaW = stonesW + terrW + this.komi;

      // Japanese (naive): territory only + captures + komi (ko-seki ignored)
      const japB = terrB + this.captures[BLACK];
      const japW = terrW + this.captures[WHITE] + this.komi;

      return {
        chinese: { B: areaB, W: areaW, diff: areaB - areaW },
        japanese: { B: japB, W: japW, diff: japB - japW },
      };
    }
  }
  GM.Game = Game;
  GM.BLACK = BLACK;
  GM.WHITE = WHITE;
  GM.OTHER = OTHER;

  // ---------- Drawing ----------
  function lettersFor(size) {
    const letters = [];
    let code = "A".charCodeAt(0);
    while (letters.length < size) {
      const ch = String.fromCharCode(code++);
      if (ch === "I") continue; // skip I
      letters.push(ch);
    }
    return letters;
  }
  function hoshi(size) {
    if (size === 19) {
      const pts = [3, 9, 15];
      const res = [];
      for (const a of pts) for (const b of pts) res.push([a, b]);
      return res;
    }
    if (size === 13) {
      const pts = [3, 6, 9];
      const res = [[6,6]];
      for (const a of [3,9]) for (const b of [3,9]) res.push([a,b]);
      return res;
    }
    if (size === 9) return [[4,4],[2,2],[2,6],[6,2],[6,6]];
    return [];
  }

  GM.drawBoard = function drawBoard(canvas, game, opts = {}) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    const N = game.size;
    const pad = Math.round(Math.min(W, H) * 0.06) + 10;
    const gap = (Math.min(W, H) - pad * 2) / (N - 1);
    const startX = (W - (gap * (N - 1))) / 2;
    const startY = (H - (gap * (N - 1))) / 2;
    const themeDark = document.documentElement.getAttribute("data-theme") === "dark";

    // Grid
    ctx.strokeStyle = themeDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    for (let i=0;i<N;i++) {
      const x = startX + i * gap;
      const y0 = startY, y1 = startY + (N - 1) * gap;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      const y = startY + i * gap;
      const x0 = startX, x1 = startX + (N - 1) * gap;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    // Hoshi
    ctx.fillStyle = themeDark ? "rgba(8,8,8,0.9)" : "rgba(0,0,0,0.8)";
    for (const [hx, hy] of hoshi(N)) {
      const cx = startX + hx * gap;
      const cy = startY + hy * gap;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, gap * 0.06), 0, Math.PI*2);
      ctx.fill();
    }
    // Coordinates
    if (opts.showCoords) {
      const letters = lettersFor(N);
      ctx.fillStyle = themeDark ? "#e2e8f0" : "#0f172a";
      ctx.font = `${Math.floor(gap*0.26)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i=0;i<N;i++) {
        const x = startX + i*gap;
        const yTop = startY - gap*0.6;
        const yBot = startY + (N - 1)*gap + gap*0.6;
        ctx.fillText(letters[i], x, yTop);
        ctx.fillText(letters[i], x, yBot);
      }
      for (let i=0;i<N;i++) {
        const y = startY + i*gap;
        const xLeft = startX - gap*0.6;
        const xRight = startX + (N - 1)*gap + gap*0.6;
        const label = `${N - i}`;
        ctx.fillText(label, xLeft, y);
        ctx.fillText(label, xRight, y);
      }
    }

    // Stones
    const libCache = new Map();
    function drawStone(x, y, color) {
      const cx = startX + x * gap;
      const cy = startY + y * gap;
      const r = gap * 0.45;
      const grad = ctx.createRadialGradient(cx - r*0.35, cy - r*0.35, r*0.2, cx, cy, r);
      if (color === BLACK) {
        grad.addColorStop(0, themeDark ? "#4b5563" : "#374151");
        grad.addColorStop(1, themeDark ? "#111827" : "#0f172a");
      } else {
        grad.addColorStop(0, themeDark ? "#ffffff" : "#ffffff");
        grad.addColorStop(1, themeDark ? "#cbd5e1" : "#cbd5e1");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
      // Last move dot
      if (opts.lastMove && opts.lastMove.x === x && opts.lastMove.y === y) {
        ctx.fillStyle = color === BLACK ? "#fff" : "#111";
        ctx.beginPath(); ctx.arc(cx, cy, r*0.2, 0, Math.PI*2); ctx.fill();
      }
    }

    for (let y=0;y<N;y++) for (let x=0;x<N;x++) {
      const v = game.get(x,y);
      if (v !== EMPTY) drawStone(x,y,v);
    }

    // Liberties overlay (simple number per stone group)
    if (opts.showLiberties) {
      ctx.fillStyle = "#111";
      ctx.font = `${Math.floor(gap*0.35)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let y=0;y<N;y++) for (let x=0;x<N;x++) {
        const v = game.get(x,y);
        if (v === EMPTY) continue;
        const key = `${x},${y}`;
        if (!libCache.has(key)) {
          const grp = game.groupAt(x,y);
          const libs = grp.liberties.size;
          for (const [sx, sy] of grp.stones) libCache.set(`${sx},${sy}`, libs);
        }
        const cx = startX + x * gap, cy = startY + y * gap;
        const libs = libCache.get(key);
        ctx.fillStyle = (v === BLACK ? "white" : "black");
        ctx.fillText(String(libs), cx, cy);
      }
    }

    // Hint highlight
    if (opts.hint) {
      const [hx, hy] = opts.hint;
      const cx = startX + hx * gap, cy = startY + hy * gap;
      ctx.strokeStyle = "rgba(14,165,233,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, gap*0.5, 0, Math.PI*2);
      ctx.stroke();
    }

    return {
      toCanvasXY(x, y) { return [startX + x*gap, startY + y*gap]; },
      fromClient(evt) {
        const rect = canvas.getBoundingClientRect();
        const px = evt.clientX - rect.left;
        const py = evt.clientY - rect.top;
        // Find nearest grid
        let nx = Math.round((px - startX) / gap);
        let ny = Math.round((py - startY) / gap);
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) return null;
        // Snap distance threshold
        const [gx, gy] = [startX + nx*gap, startY + ny*gap];
        const dist = Math.hypot(px - gx, py - gy);
        if (dist > gap * 0.48) return null;
        return [nx, ny];
      }
    };
  };

  // ---------- SGF Parser (basic) ----------
  GM.parseSGF = function parseSGF(text) {
    // Basic linear parser: size (SZ), moves (;B[aa];W[bb]...)
    // Return {size, moves: [{c:1/2,x,y}]}
    const clean = text.replace(/\s+/g, " ");
    const SZm = clean.match(/SZ```math
(\d+)```/i);
    const size = SZm ? parseInt(SZm[1],10) : 19;
    const moves = [];
    const re = /;([BW])```math
(..)?```/g;
    let m;
    while ((m = re.exec(clean))) {
      const c = m[1] === "B" ? BLACK : WHITE;
      const coord = (m[2] || "").trim();
      if (coord.length === 2) {
        const x = coord.codePointAt(0) - 97;
        const y = coord.codePointAt(1) - 97;
        if (x>=0 && y>=0) moves.push({ c, x, y });
      } else {
        // pass
        moves.push({ c, pass: true });
      }
    }
    return { size, moves };
  };

  // ---------- Puzzles (simple one-step captures) ----------
  GM.puzzles = [
    {
      id: "p1", name: "Atari đơn giản", size: 9,
      position: [
        ".........",
        ".........",
        "...oo....",
        "..o.xo...",
        "...oo....",
        ".........",
        ".........",
        ".........",
        "........."
      ],
      // x=Black, o=White; goal: B to play capture atari point
      solution: [4,3],
      hint: "Tìm điểm khiến nhóm trắng hết khí ngay."
    },
    {
      id: "p2", name: "Bịt mắt 2", size: 9,
      position: [
        ".........",
        "..xxx....",
        "..o.o....",
        "..xxx....",
        ".........",
        ".........",
        ".........",
        ".........",
        "........."
      ],
      solution: [3,2],
      hint: "Đánh vào mắt còn lại."
    },
    {
      id: "p3", name: "Bắt 2 quân", size: 9,
      position: [
        ".........",
        "...oo....",
        "..x..o...",
        "...oo....",
        ".........",
        ".........",
        ".........",
        ".........",
        "........."
      ],
      solution: [3,2],
      hint: "Nước nối khiến 2 quân trắng chết."
    }
  ];

  // ---------- Helpers ----------
  GM.coordToLabel = function (x, y, size) {
    const letters = lettersFor(size);
    return `${letters[x]}${size - y}`;
  };

  GM.sfx = function sfx(kind) {
    try {
      if (kind === "place") document.getElementById("sfxPlace")?.play();
      if (kind === "capture") document.getElementById("sfxCapture")?.play();
    } catch {}
  };

  window.GM = GM;
})();

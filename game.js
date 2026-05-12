const size = 15;
const storageKey = "gomoku-state-v4";
const statsKey = "gomoku-stats-v1";
const moveTimeLimit = 15;
const modes = {
  normal: "普通模式：双方轮流落子，先连成五子获胜。",
  obstacle: "障碍棋盘：开局生成 12 个障碍点，障碍点不可落子。",
  timed: "限时快棋：每手 15 秒，超时自动判负。",
  random: "随机开局：开局自动落下黑白各两手，每局局面不同。",
};
const themes = {
  classic: ["#e8bf78", "#d4a05b", "#bd7d3f"],
  simple: ["#f0d69a", "#ddb76f", "#c79349"],
  dark: ["#8b6b46", "#6e5132", "#4c3624"],
};

const canvas = document.querySelector("#board");
const ctx = canvas.getContext("2d");
const statusText = document.querySelector("#status");
const undoBtn = document.querySelector("#undoBtn");
const restartBtn = document.querySelector("#restartBtn");
const moveCount = document.querySelector("#moveCount");
const timerBadge = document.querySelector("#timerBadge");
const blackPanel = document.querySelector("#blackPanel");
const whitePanel = document.querySelector("#whitePanel");
const ruleSelect = document.querySelector("#ruleSelect");
const modeSelect = document.querySelector("#modeSelect");
const themeSelect = document.querySelector("#themeSelect");
const modeTip = document.querySelector("#modeTip");
const moveList = document.querySelector("#moveList");
const exportBtn = document.querySelector("#exportBtn");
const importBtn = document.querySelector("#importBtn");
const importFile = document.querySelector("#importFile");
const clearStatsBtn = document.querySelector("#clearStatsBtn");
const blackWins = document.querySelector("#blackWins");
const whiteWins = document.querySelector("#whiteWins");
const draws = document.querySelector("#draws");
const totalGames = document.querySelector("#totalGames");
const resultDialog = document.querySelector("#resultDialog");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");
const closeDialogBtn = document.querySelector("#closeDialogBtn");
const newGameBtn = document.querySelector("#newGameBtn");
const createRoomBtn = document.querySelector("#createRoomBtn");
const joinRoomBtn = document.querySelector("#joinRoomBtn");
const leaveRoomBtn = document.querySelector("#leaveRoomBtn");
const roomInput = document.querySelector("#roomInput");
const onlineStatus = document.querySelector("#onlineStatus");

const state = {
  board: createBoard(),
  obstacles: [],
  current: 1,
  moves: [],
  winner: 0,
  hover: null,
  winLine: null,
  rule: "free",
  mode: "normal",
  theme: "classic",
  timeLeft: moveTimeLimit,
  scored: false,
};

let stats = { black: 0, white: 0, draw: 0 };
let metrics = getMetrics();
let timerId = null;
let networkTimerId = null;
const network = {
  enabled: false,
  roomId: "",
  player: 0,
  seq: 0,
  syncing: false,
};

function createBoard() {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function getMetrics() {
  const width = canvas.width;
  const padding = width * 0.065;
  const gap = (width - padding * 2) / (size - 1);
  return { width, padding, gap, radius: gap * 0.38 };
}

function draw() {
  metrics = getMetrics();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawObstacles();
  drawHover();
  drawStones();
  drawWinLine();
}

function drawBoard() {
  const { width, padding, gap } = metrics;
  const colors = themes[state.theme] || themes.classic;
  const gradient = ctx.createLinearGradient(0, 0, width, width);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.48, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, width);

  ctx.strokeStyle = state.theme === "dark" ? "rgba(250, 236, 208, 0.44)" : "rgba(64, 38, 16, 0.68)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < size; i += 1) {
    const pos = padding + i * gap;
    ctx.moveTo(padding, pos);
    ctx.lineTo(width - padding, pos);
    ctx.moveTo(pos, padding);
    ctx.lineTo(pos, width - padding);
  }
  ctx.stroke();

  const starPoints = [
    [3, 3],
    [11, 3],
    [7, 7],
    [3, 11],
    [11, 11],
  ];
  ctx.fillStyle = state.theme === "dark" ? "rgba(255, 245, 224, 0.76)" : "rgba(49, 29, 13, 0.78)";
  for (const [x, y] of starPoints) {
    drawCircle(pointToPixel(x), pointToPixel(y), gap * 0.09);
  }
}

function drawObstacles() {
  for (const obstacle of state.obstacles) {
    const x = pointToPixel(obstacle.col);
    const y = pointToPixel(obstacle.row);
    const radius = metrics.radius * 0.82;
    ctx.save();
    ctx.fillStyle = state.theme === "dark" ? "rgba(246, 204, 128, 0.72)" : "rgba(76, 50, 27, 0.68)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(x - radius * 0.72, y - radius * 0.72, radius * 1.44, radius * 1.44);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawHover() {
  if (!state.hover || state.winner) return;
  const { row, col } = state.hover;
  if (state.board[row][col] || isObstacle(row, col)) return;
  ctx.save();
  ctx.globalAlpha = 0.34;
  drawStone(row, col, state.current);
  ctx.restore();
}

function drawStones() {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const piece = state.board[row][col];
      if (piece) drawStone(row, col, piece);
    }
  }

  const last = state.moves.at(-1);
  if (last) {
    ctx.strokeStyle = "#d93025";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pointToPixel(last.col), pointToPixel(last.row), metrics.radius * 0.45, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawWinLine() {
  if (!state.winLine) return;
  const [start, end] = state.winLine;
  const startX = pointToPixel(start.col);
  const startY = pointToPixel(start.row);
  const endX = pointToPixel(end.col);
  const endY = pointToPixel(end.row);

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(255, 215, 115, 0.32)";
  ctx.lineWidth = Math.max(18, metrics.gap * 0.38);
  ctx.shadowColor = "rgba(255, 206, 84, 0.58)";
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 239, 164, 0.94)";
  ctx.lineWidth = Math.max(5, metrics.gap * 0.11);
  ctx.shadowColor = "rgba(255, 232, 150, 0.88)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawStone(row, col, piece) {
  const x = pointToPixel(col);
  const y = pointToPixel(row);
  const radius = metrics.radius;
  const gradient = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.45,
    radius * 0.12,
    x,
    y,
    radius,
  );

  if (piece === 1) {
    gradient.addColorStop(0, "#696762");
    gradient.addColorStop(0.55, "#1c1b18");
    gradient.addColorStop(1, "#050504");
  } else {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.62, "#eee9dd");
    gradient.addColorStop(1, "#afa797");
  }

  ctx.save();
  ctx.shadowColor = "rgba(33, 21, 10, 0.38)";
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = gradient;
  drawCircle(x, y, radius);
  ctx.restore();

  if (piece === 2) {
    ctx.strokeStyle = "rgba(43, 33, 21, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCircle(x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function pointToPixel(index) {
  return metrics.padding + index * metrics.gap;
}

function eventToCell(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  if (clientX === undefined || clientY === undefined) return null;

  const x = (clientX - rect.left) * scale;
  const y = (clientY - rect.top) * scale;
  const col = Math.round((x - metrics.padding) / metrics.gap);
  const row = Math.round((y - metrics.padding) / metrics.gap);
  if (row < 0 || row >= size || col < 0 || col >= size) return null;

  const px = pointToPixel(col);
  const py = pointToPixel(row);
  const distance = Math.hypot(x - px, y - py);
  return distance <= metrics.gap * 0.62 ? { row, col } : null;
}

function placeStone(row, col, setup = false) {
  if (network.enabled && !setup && state.current !== network.player) {
    statusText.textContent = `联机中，你执${network.player === 1 ? "黑棋" : "白棋"}，请等待对方落子`;
    return false;
  }

  if (state.winner || state.board[row][col] || isObstacle(row, col)) return false;

  state.board[row][col] = state.current;
  state.moves.push({ row, col, piece: state.current, setup });

  const overlineForbidden = !setup && state.rule === "standard" && state.current === 1 && isOverline(row, col);
  if (overlineForbidden) {
    state.winner = 2;
    state.winLine = null;
    afterStateChange(true, "黑棋长连禁手，白棋获胜");
    if (!setup) syncRoom();
    return true;
  }

  const winLine = findWinLine(row, col, state.current);
  if (winLine) {
    state.winner = state.current;
    state.winLine = winLine;
    afterStateChange(!setup);
    if (!setup) syncRoom();
    return true;
  }

  const forbidden = !setup ? getForbiddenReason(row, col, state.current) : "";
  if (forbidden) {
    state.winner = 2;
    state.winLine = null;
    afterStateChange(true, `黑棋${forbidden}禁手，白棋获胜`);
    if (!setup) syncRoom();
    return true;
  }

  if (state.moves.length + state.obstacles.length === size * size) {
    state.winner = 3;
    afterStateChange(!setup);
    if (!setup) syncRoom();
    return true;
  }

  state.current = state.current === 1 ? 2 : 1;
  if (!setup) state.timeLeft = moveTimeLimit;
  afterStateChange(false);
  if (!setup) syncRoom();
  return true;
}

function getForbiddenReason(row, col, piece) {
  if (state.rule !== "standard" || piece !== 1) return "";
  if (isDoubleFour(row, col)) return "四四";
  if (isDoubleThree(row, col)) return "三三";
  return "";
}

function findWinLine(row, col, piece) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    const line = [
      ...collectLine(row, col, -dr, -dc, piece).reverse(),
      { row, col },
      ...collectLine(row, col, dr, dc, piece),
    ];
    if (line.length >= 5) return [line[0], line[line.length - 1]];
  }

  return null;
}

function isOverline(row, col) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  return directions.some(([dr, dc]) => {
    const count = 1 + collectLine(row, col, dr, dc, 1).length + collectLine(row, col, -dr, -dc, 1).length;
    return count > 5;
  });
}

function isDoubleFour(row, col) {
  return countDirections(row, col, isFourInDirection) >= 2;
}

function isDoubleThree(row, col) {
  return countDirections(row, col, isOpenThreeInDirection) >= 2;
}

function countDirections(row, col, tester) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  return directions.filter(([dr, dc]) => tester(row, col, dr, dc)).length;
}

function isFourInDirection(row, col, dr, dc) {
  const line = getDirectionalLine(row, col, dr, dc, 5);
  const patterns = ["XXXX.", ".XXXX", "XXX.X", "XX.XX", "X.XXX"];
  return patterns.some((pattern) => patternTouchesCenter(line, pattern));
}

function isOpenThreeInDirection(row, col, dr, dc) {
  if (isFourInDirection(row, col, dr, dc)) return false;
  const line = getDirectionalLine(row, col, dr, dc, 5);
  const patterns = [".XXX.", ".XX.X.", ".X.XX."];
  return patterns.some((pattern) => patternTouchesCenter(line, pattern));
}

function patternTouchesCenter(line, pattern) {
  const center = Math.floor(line.length / 2);
  for (let i = 0; i <= line.length - pattern.length; i += 1) {
    if (line.slice(i, i + pattern.length) === pattern && center >= i && center < i + pattern.length) {
      return true;
    }
  }
  return false;
}

function getDirectionalLine(row, col, dr, dc, radius) {
  let line = "";
  for (let offset = -radius; offset <= radius; offset += 1) {
    const r = row + dr * offset;
    const c = col + dc * offset;
    line += cellCode(r, c);
  }
  return line;
}

function cellCode(row, col) {
  if (row < 0 || row >= size || col < 0 || col >= size || isObstacle(row, col)) return "O";
  if (state.board[row][col] === 1) return "X";
  if (state.board[row][col] === 2) return "O";
  return ".";
}

function collectLine(row, col, dr, dc, piece) {
  const line = [];
  let nextRow = row + dr;
  let nextCol = col + dc;

  while (
    nextRow >= 0 &&
    nextRow < size &&
    nextCol >= 0 &&
    nextCol < size &&
    state.board[nextRow][nextCol] === piece
  ) {
    line.push({ row: nextRow, col: nextCol });
    nextRow += dr;
    nextCol += dc;
  }

  return line;
}

function isObstacle(row, col) {
  return state.obstacles.some((item) => item.row === row && item.col === col);
}

function afterStateChange(showResult, customMessage = "") {
  if (state.winner && !state.scored) {
    updateStats(state.winner);
    state.scored = true;
  }
  saveGame();
  updateStatus(customMessage);
  renderMoveList();
  renderStats();
  renderTimer();
  draw();
  syncTimer();
  if (showResult && state.winner) showResultDialog(customMessage);
}

function updateStatus(customMessage = "") {
  blackPanel.classList.toggle("active", state.current === 1 && !state.winner);
  whitePanel.classList.toggle("active", state.current === 2 && !state.winner);
  moveCount.textContent = `${state.moves.length} 手`;
  undoBtn.disabled = state.moves.length === 0;

  if (customMessage) {
    statusText.textContent = customMessage;
  } else if (state.winner === 1) {
    statusText.textContent = "黑棋获胜，点击重开再来一局";
  } else if (state.winner === 2) {
    statusText.textContent = "白棋获胜，点击重开再来一局";
  } else if (state.winner === 3) {
    statusText.textContent = "棋盘已满，平局";
  } else {
    statusText.textContent = state.current === 1 ? "黑棋回合" : "白棋回合";
  }
}

function renderMoveList() {
  moveList.innerHTML = "";
  for (const move of state.moves) {
    const item = document.createElement("li");
    const player = move.piece === 1 ? "黑" : "白";
    const prefix = move.setup ? "开局 " : "";
    item.textContent = `${prefix}${player} ${move.col + 1}, ${move.row + 1}`;
    moveList.appendChild(item);
  }
}

function showResultDialog(customMessage = "") {
  const titleMap = {
    1: "黑棋获胜",
    2: "白棋获胜",
    3: "平局",
  };
  resultTitle.textContent = titleMap[state.winner] || "对局结束";
  resultText.textContent = customMessage || `本局共 ${state.moves.length} 手。`;
  if (typeof resultDialog.showModal === "function") resultDialog.showModal();
}

function undo() {
  if (network.enabled && state.moves.at(-1)?.piece !== network.player) {
    statusText.textContent = "联机中只能在自己刚落子后悔棋";
    return;
  }
  if (state.scored && state.winner) {
    rollbackStats(state.winner);
  }
  const steps = Math.min(2, state.moves.length);
  for (let i = 0; i < steps; i += 1) {
    const last = state.moves.pop();
    state.board[last.row][last.col] = 0;
    state.current = last.piece;
  }
  state.winner = 0;
  state.winLine = null;
  state.scored = false;
  state.timeLeft = moveTimeLimit;
  afterStateChange(false);
  syncRoom();
}

function restart() {
  if (network.enabled && network.player !== 1) {
    statusText.textContent = "联机中只有黑棋可以重开或更换模式";
    syncControls();
    return;
  }
  clearTimer();
  const nextRule = ruleSelect.value;
  const nextMode = modeSelect.value;
  const nextTheme = themeSelect.value;
  state.board = createBoard();
  state.obstacles = [];
  state.current = 1;
  state.moves = [];
  state.winner = 0;
  state.hover = null;
  state.winLine = null;
  state.rule = nextRule;
  state.mode = nextMode;
  state.theme = nextTheme;
  state.timeLeft = moveTimeLimit;
  state.scored = false;
  if (state.mode === "obstacle") createObstacles();
  if (state.mode === "random") createRandomOpening();
  localStorage.removeItem(storageKey);
  if (resultDialog.open) resultDialog.close();
  syncControls();
  afterStateChange(false);
  syncRoom();
}

function createObstacles() {
  const protectedCells = new Set(["7,7", "7,6", "6,7", "7,8", "8,7"]);
  while (state.obstacles.length < 12) {
    const row = randomInt(1, size - 2);
    const col = randomInt(1, size - 2);
    const key = `${row},${col}`;
    if (protectedCells.has(key) || isObstacle(row, col)) continue;
    state.obstacles.push({ row, col });
  }
}

function createRandomOpening() {
  const candidates = [];
  for (let row = 4; row <= 10; row += 1) {
    for (let col = 4; col <= 10; col += 1) {
      if (row === 7 && col === 7) continue;
      candidates.push({ row, col });
    }
  }
  shuffle(candidates);
  for (let i = 0; i < 4; i += 1) {
    const cell = i === 0 ? { row: 7, col: 7 } : candidates.pop();
    placeStone(cell.row, cell.col, true);
    if (state.winner) break;
  }
  state.current = 1;
  state.timeLeft = moveTimeLimit;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function updateStats(winner) {
  if (winner === 1) stats.black += 1;
  if (winner === 2) stats.white += 1;
  if (winner === 3) stats.draw += 1;
  localStorage.setItem(statsKey, JSON.stringify(stats));
}

function rollbackStats(winner) {
  if (winner === 1) stats.black = Math.max(0, stats.black - 1);
  if (winner === 2) stats.white = Math.max(0, stats.white - 1);
  if (winner === 3) stats.draw = Math.max(0, stats.draw - 1);
  localStorage.setItem(statsKey, JSON.stringify(stats));
}

function renderStats() {
  blackWins.textContent = stats.black;
  whiteWins.textContent = stats.white;
  draws.textContent = stats.draw;
  totalGames.textContent = stats.black + stats.white + stats.draw;
}

function clearStats() {
  stats = { black: 0, white: 0, draw: 0 };
  localStorage.setItem(statsKey, JSON.stringify(stats));
  renderStats();
}

function renderTimer() {
  timerBadge.hidden = state.mode !== "timed";
  timerBadge.textContent = `${state.timeLeft} 秒`;
  timerBadge.classList.toggle("danger", state.timeLeft <= 5);
}

function syncTimer() {
  clearTimer();
  if (state.mode !== "timed" || state.winner) return;
  timerId = window.setInterval(() => {
    state.timeLeft -= 1;
    renderTimer();
    saveGame();
    if (state.timeLeft <= 0) {
      const loser = state.current;
      state.winner = loser === 1 ? 2 : 1;
      afterStateChange(true, `${loser === 1 ? "黑棋" : "白棋"}超时，${state.winner === 1 ? "黑棋" : "白棋"}获胜`);
    }
  }, 1000);
}

function clearTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function saveGame() {
  const data = {
    version: 4,
    board: state.board,
    obstacles: state.obstacles,
    current: state.current,
    moves: state.moves,
    winner: state.winner,
    winLine: state.winLine,
    rule: state.rule,
    mode: state.mode,
    theme: state.theme,
    timeLeft: state.timeLeft,
    scored: state.scored,
  };
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!isValidSave(saved)) return;
    state.board = saved.board;
    state.obstacles = saved.obstacles;
    state.current = saved.current;
    state.moves = saved.moves;
    state.winner = saved.winner;
    state.winLine = saved.winLine;
    state.rule = saved.rule;
    state.mode = saved.mode;
    state.theme = saved.theme;
    state.timeLeft = saved.timeLeft;
    state.scored = Boolean(saved.scored);
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(statsKey));
    if (!saved) return;
    stats = {
      black: Number(saved.black) || 0,
      white: Number(saved.white) || 0,
      draw: Number(saved.draw) || 0,
    };
  } catch {
    localStorage.removeItem(statsKey);
  }
}

function isValidSave(saved) {
  if (!saved || saved.version !== 4) return false;
  if (!["free", "standard"].includes(saved.rule)) return false;
  if (!Object.hasOwn(modes, saved.mode)) return false;
  if (!Object.hasOwn(themes, saved.theme)) return false;
  if (![0, 1, 2, 3].includes(saved.winner)) return false;
  if (![1, 2].includes(saved.current)) return false;
  if (!Number.isInteger(saved.timeLeft) || saved.timeLeft < 0 || saved.timeLeft > moveTimeLimit) return false;
  if (!Array.isArray(saved.moves) || !Array.isArray(saved.board) || saved.board.length !== size) return false;
  if (!Array.isArray(saved.obstacles)) return false;
  const validBoard = saved.board.every((row) =>
    Array.isArray(row) && row.length === size && row.every((cell) => [0, 1, 2].includes(cell)),
  );
  const validObstacles = saved.obstacles.every((cell) => isValidCell(cell));
  return validBoard && validObstacles;
}

function isValidCell(cell) {
  return (
    cell &&
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.row < size &&
    cell.col >= 0 &&
    cell.col < size
  );
}

function exportGame() {
  const data = {
    exportedAt: new Date().toISOString(),
    game: {
      version: 4,
      board: state.board,
      obstacles: state.obstacles,
      current: state.current,
      moves: state.moves,
      winner: state.winner,
      winLine: state.winLine,
      rule: state.rule,
      mode: state.mode,
      theme: state.theme,
      timeLeft: state.timeLeft,
      scored: state.scored,
    },
    stats,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `gomoku-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importGame(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const data = JSON.parse(reader.result);
      const game = data.game || data;
      if (!isValidSave(game)) throw new Error("invalid save");
      state.board = game.board;
      state.obstacles = game.obstacles;
      state.current = game.current;
      state.moves = game.moves;
      state.winner = game.winner;
      state.winLine = game.winLine;
      state.rule = game.rule;
      state.mode = game.mode;
      state.theme = game.theme;
      state.timeLeft = game.timeLeft;
      state.scored = Boolean(game.scored);
      if (data.stats) {
        stats = {
          black: Number(data.stats.black) || 0,
          white: Number(data.stats.white) || 0,
          draw: Number(data.stats.draw) || 0,
        };
        localStorage.setItem(statsKey, JSON.stringify(stats));
      }
      syncControls();
      afterStateChange(false);
    } catch {
      statusText.textContent = "导入失败，请选择有效的棋局 JSON 文件";
    }
  });
  reader.readAsText(file);
}

function syncControls() {
  ruleSelect.value = state.rule;
  modeSelect.value = state.mode;
  themeSelect.value = state.theme;
  modeTip.textContent = modes[state.mode];
  document.body.dataset.theme = state.theme;
}

function getGameSnapshot() {
  return {
    version: 4,
    board: state.board,
    obstacles: state.obstacles,
    current: state.current,
    moves: state.moves,
    winner: state.winner,
    winLine: state.winLine,
    rule: state.rule,
    mode: state.mode,
    theme: state.theme,
    timeLeft: state.timeLeft,
    scored: state.scored,
  };
}

function applyGameSnapshot(game) {
  if (!isValidSave(game)) return false;
  state.board = game.board;
  state.obstacles = game.obstacles;
  state.current = game.current;
  state.moves = game.moves;
  state.winner = game.winner;
  state.winLine = game.winLine;
  state.rule = game.rule;
  state.mode = game.mode;
  state.theme = game.theme;
  state.timeLeft = game.timeLeft;
  state.scored = Boolean(game.scored);
  syncControls();
  updateStatus();
  renderMoveList();
  renderStats();
  renderTimer();
  draw();
  syncTimer();
  return true;
}

async function createRoom() {
  if (!isLanServicePage()) {
    onlineStatus.textContent = "请先在一台设备运行 node server.js，再用显示的 http 地址打开本页";
    return;
  }
  restart();
  const data = await apiRequest("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ game: getGameSnapshot() }),
  });
  enterRoom(data.roomId, data.player, data.seq);
}

async function joinRoom() {
  if (!isLanServicePage()) {
    onlineStatus.textContent = "请先用主机显示的 http 局域网地址打开本页";
    return;
  }
  const roomId = roomInput.value.trim().toUpperCase();
  if (!roomId) {
    onlineStatus.textContent = "请输入房间码";
    return;
  }
  const data = await apiRequest(`/api/rooms/${roomId}/join`, { method: "POST" });
  applyGameSnapshot(data.game);
  enterRoom(data.roomId, data.player, data.seq);
}

function enterRoom(roomId, player, seq) {
  network.enabled = true;
  network.roomId = roomId;
  network.player = player;
  network.seq = seq;
  roomInput.value = roomId;
  createRoomBtn.hidden = true;
  joinRoomBtn.hidden = true;
  leaveRoomBtn.hidden = false;
  onlineStatus.textContent = `房间 ${roomId}：你执${player === 1 ? "黑棋" : "白棋"}`;
  startRoomPolling();
}

function leaveRoom() {
  network.enabled = false;
  network.roomId = "";
  network.player = 0;
  network.seq = 0;
  clearRoomPolling();
  createRoomBtn.hidden = false;
  joinRoomBtn.hidden = false;
  leaveRoomBtn.hidden = true;
  updateOnlineAvailability();
}

async function syncRoom() {
  if (!network.enabled || network.syncing) return;
  network.syncing = true;
  try {
    const data = await apiRequest(`/api/rooms/${network.roomId}/sync`, {
      method: "POST",
      body: JSON.stringify({ game: getGameSnapshot() }),
    });
    network.seq = data.seq;
  } catch (error) {
    onlineStatus.textContent = `同步失败：${error.message}`;
  } finally {
    network.syncing = false;
  }
}

function startRoomPolling() {
  clearRoomPolling();
  networkTimerId = window.setInterval(pollRoom, 900);
}

function clearRoomPolling() {
  if (networkTimerId) {
    window.clearInterval(networkTimerId);
    networkTimerId = null;
  }
}

async function pollRoom() {
  if (!network.enabled || network.syncing) return;
  try {
    const data = await apiRequest(`/api/rooms/${network.roomId}`);
    if (data.seq > network.seq) {
      network.seq = data.seq;
      applyGameSnapshot(data.game);
    }
  } catch (error) {
    onlineStatus.textContent = `联机中断：${error.message}`;
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function isLanServicePage() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function updateOnlineAvailability() {
  if (network.enabled) return;
  if (isLanServicePage()) {
    onlineStatus.textContent = `联机可用：其他设备打开 ${location.origin}`;
  } else {
    onlineStatus.textContent = "离线：直接打开文件只能本机对弈，局域网需先启动 Node 服务";
  }
}

canvas.addEventListener("click", (event) => {
  const cell = eventToCell(event);
  if (cell) placeStone(cell.row, cell.col);
});

canvas.addEventListener("mousemove", (event) => {
  state.hover = eventToCell(event);
  draw();
});

canvas.addEventListener("mouseleave", () => {
  state.hover = null;
  draw();
});

canvas.addEventListener(
  "touchstart",
  (event) => {
    event.preventDefault();
    const cell = eventToCell(event);
    if (cell) placeStone(cell.row, cell.col);
  },
  { passive: false },
);

undoBtn.addEventListener("click", undo);
restartBtn.addEventListener("click", restart);
newGameBtn.addEventListener("click", restart);
closeDialogBtn.addEventListener("click", () => resultDialog.close());
clearStatsBtn.addEventListener("click", clearStats);
exportBtn.addEventListener("click", exportGame);
importBtn.addEventListener("click", () => importFile.click());
createRoomBtn.addEventListener("click", () => {
  createRoom().catch((error) => {
    onlineStatus.textContent = `创建失败：${error.message}`;
  });
});
joinRoomBtn.addEventListener("click", () => {
  joinRoom().catch((error) => {
    onlineStatus.textContent = `加入失败：${error.message}`;
  });
});
leaveRoomBtn.addEventListener("click", leaveRoom);
importFile.addEventListener("change", () => {
  const [file] = importFile.files;
  if (file) importGame(file);
  importFile.value = "";
});
ruleSelect.addEventListener("change", () => {
  if (network.enabled && network.player !== 1) {
    statusText.textContent = "联机中只有黑棋可以更改规则";
    syncControls();
    return;
  }
  state.rule = ruleSelect.value;
  saveGame();
  syncRoom();
});
modeSelect.addEventListener("change", restart);
themeSelect.addEventListener("change", () => {
  state.theme = themeSelect.value;
  document.body.dataset.theme = state.theme;
  saveGame();
  draw();
  syncRoom();
});
window.addEventListener("resize", draw);
window.addEventListener("beforeunload", () => {
  clearTimer();
  clearRoomPolling();
});

loadStats();
loadGame();
syncControls();
updateStatus();
updateOnlineAvailability();
renderMoveList();
renderStats();
renderTimer();
draw();
syncTimer();

export function newState() {
  return {
    board: [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""]
    ],
    nextTurn: "X",
    status: "playing", // playing | win | draw
    winner: null,
    lastMove: null, // { player, row, col }
    players: { X: null, O: null } // connection ids (logical)
  };
}

export function isValidCell(row, col) {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < 3 && col >= 0 && col < 3;
}

export function checkWin(board) {
  const lines = [
    [[0,0],[0,1],[0,2]],
    [[1,0],[1,1],[1,2]],
    [[2,0],[2,1],[2,2]],
    [[0,0],[1,0],[2,0]],
    [[0,1],[1,1],[2,1]],
    [[0,2],[1,2],[2,2]],
    [[0,0],[1,1],[2,2]],
    [[0,2],[1,1],[2,0]]
  ];

  for (const line of lines) {
    const [a,b,c] = line;
    const va = board[a[0]][a[1]];
    if (!va) continue;
    const vb = board[b[0]][b[1]];
    const vc = board[c[0]][c[1]];
    if (va === vb && vb === vc) return va;
  }
  return null;
}

export function checkDraw(board) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!board[r][c]) return false;
  return true;
}

import WebSocket from "ws";
import readline from "readline";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node client.js ws://localhost:3001");
  process.exit(1);
}

const ws = new WebSocket(url);

let mySymbol = null;
let state = {
  board: [["","",""],["","",""],["","",""]],
  nextTurn: "X",
  status: "playing",
  winner: null,
  lastMove: null
};

function renderBoard(board) {
  const cell = (v) => (v && v.length ? v : " ");
  const row = (r) => ` ${cell(board[r][0])} | ${cell(board[r][1])} | ${cell(board[r][2])} `;
  console.log("");
  console.log("   0   1   2");
  console.log("0" + row(0));
  console.log("  ---+---+---");
  console.log("1" + row(1));
  console.log("  ---+---+---");
  console.log("2" + row(2));
  console.log("");
}

function renderStatus() {
  if (state.status === "win") {
    console.log(`🏁 Winner: ${state.winner}`);
  } else if (state.status === "draw") {
    console.log("🤝 Draw!");
  } else {
    console.log(`Next turn: ${state.nextTurn} ${mySymbol ? `(you are ${mySymbol})` : "(spectator)"}`);
    if (mySymbol && state.nextTurn === mySymbol) {
      console.log("Your move: type row col (e.g., 1 2)");
    }
  }
}

function send(obj) {
  ws.send(JSON.stringify(obj));
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed === "join") {
    send({ type: "join" });
    return;
  }
  if (trimmed === "reset") {
    send({ type: "reset" });
    return;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 2) {
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    send({ type: "move", row, col });
    return;
  }

  console.log("Commands: join | reset | <row col>");
});

ws.on("open", () => {
  console.log(`Connected to ${url}`);
  console.log("Type 'join' to become a player (X or O), or watch as spectator.");
});

ws.on("message", (buf) => {
  const msg = JSON.parse(buf.toString());

  if (msg.type === "info") {
    console.log(`ℹ️  ${msg.message}`);
    if (msg.message?.startsWith("You are player ")) {
      mySymbol = msg.message.split(" ").pop();
    }
    return;
  }

  if (msg.type === "error") {
    console.log(`❌ ${msg.message}`);
    return;
  }

  if (msg.type === "update") {
    state = {
      board: msg.board,
      nextTurn: msg.nextTurn,
      status: msg.status,
      winner: msg.winner,
      lastMove: msg.lastMove
    };
    console.clear?.();
    renderBoard(state.board);
    if (state.lastMove) console.log(`Last move: ${state.lastMove.player} -> (${state.lastMove.row}, ${state.lastMove.col})`);
    renderStatus();
    return;
  }

  if (msg.type === "win") {
    console.log(`🏆 WIN: ${msg.winner}`);
    return;
  }

  if (msg.type === "draw") {
    console.log("🤝 DRAW");
    return;
  }

  if (msg.type === "reset") {
    console.log(`🔄 ${msg.message ?? "Game reset"}`);
    return;
  }
});

ws.on("close", () => {
  console.log("Disconnected.");
  process.exit(0);
});

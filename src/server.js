import { WebSocketServer } from "ws";
import { MsgType, safeJsonParse, send } from "./protocol.js";
import { checkDraw, checkWin, isValidCell } from "./game.js";
import {
  createRedisClients,
  getChannel,
  initIfMissing,
  readState,
  writeState,
  assignPlayerAtomic,
  releasePlayerAtomic
} from "./redisStore.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { id: "A", port: 3001, redisUrl: "redis://localhost:6379" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--id") out.id = args[++i];
    else if (a === "--port") out.port = Number(args[++i]);
    else if (a === "--redis") out.redisUrl = args[++i];
  }
  return out;
}

const { id: SERVER_ID, port: PORT, redisUrl } = parseArgs();

const { pub, sub, client } = createRedisClients(redisUrl);
await initIfMissing(client);

const wss = new WebSocketServer({ port: PORT });
const localClients = new Map(); // ws -> { connId, symbol }

function broadcastLocal(obj) {
  for (const ws of localClients.keys()) {
    if (ws.readyState === ws.OPEN) send(ws, obj);
  }
}

await sub.subscribe(getChannel());
sub.on("message", (_channel, message) => {
  const evt = safeJsonParse(message);
  if (!evt) return;
  broadcastLocal(evt);
});

async function publish(evt) {
  await pub.publish(getChannel(), JSON.stringify(evt));
}

async function sendFullState(ws) {
  const state = await readState(client);
  send(ws, { type: MsgType.UPDATE, board: state.board, nextTurn: state.nextTurn, status: state.status, winner: state.winner, lastMove: state.lastMove });
}

async function tryMoveAtomic(player, row, col) {
  while (true) {
    await client.watch("tictactoe:state");
    const state = await readState(client);
    if (!state) {
      await client.unwatch();
      return { ok: false, error: "State missing" };
    }

    if (state.status !== "playing") {
      await client.unwatch();
      return { ok: false, error: "Game is not in playing state. Wait for reset." };
    }

    if (state.nextTurn !== player) {
      await client.unwatch();
      return { ok: false, error: `Not your turn. Next turn: ${state.nextTurn}` };
    }

    if (!isValidCell(row, col)) {
      await client.unwatch();
      return { ok: false, error: "Invalid cell. Use row/col in 0..2" };
    }

    if (state.board[row][col]) {
      await client.unwatch();
      return { ok: false, error: "Cell already occupied" };
    }

    const next = structuredClone(state);
    next.board[row][col] = player;
    next.lastMove = { player, row, col };

    const winner = checkWin(next.board);
    if (winner) {
      next.status = "win";
      next.winner = winner;
    } else if (checkDraw(next.board)) {
      next.status = "draw";
      next.winner = null;
    } else {
      next.nextTurn = player === "X" ? "O" : "X";
    }

    const multi = client.multi();
    multi.set("tictactoe:state", JSON.stringify(next));
    const res = await multi.exec();
    if (res === null) continue;

    await client.unwatch();
    return { ok: true, state: next };
  }
}

wss.on("connection", async (ws) => {
  const connId = `${SERVER_ID}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localClients.set(ws, { connId, symbol: null });

  send(ws, { type: MsgType.INFO, message: `Connected to Server ${SERVER_ID} on port ${PORT}` });
  await sendFullState(ws);
  send(ws, { type: MsgType.INFO, message: `Send {"type":"join"} then moves: {"type":"move","row":0,"col":2}` });

  ws.on("message", async (buf) => {
    const msg = safeJsonParse(buf.toString());
    if (!msg || !msg.type) {
      send(ws, { type: MsgType.ERROR, message: "Invalid JSON message" });
      return;
    }

    const meta = localClients.get(ws);
    if (!meta) return;

    if (msg.type === MsgType.JOIN) {
      const assigned = await assignPlayerAtomic(client, meta.connId);
      if (!assigned.symbol) {
        send(ws, { type: MsgType.ERROR, message: "Game is full (2 players already). You are a spectator." });
        meta.symbol = null;
      } else {
        meta.symbol = assigned.symbol;
        send(ws, { type: MsgType.INFO, message: `You are player ${meta.symbol}` });
      }
      await sendFullState(ws);
      await publish({ type: MsgType.INFO, message: `Player ${assigned.symbol ?? "spectator"} joined via Server ${SERVER_ID}` });
      return;
    }

    if (msg.type === MsgType.MOVE) {
      if (!meta.symbol) {
        send(ws, { type: MsgType.ERROR, message: "You are not assigned a player (spectator). Type join first (if slots free)." });
        return;
      }

      const row = Number(msg.row);
      const col = Number(msg.col);

      const result = await tryMoveAtomic(meta.symbol, row, col);
      if (!result.ok) {
        send(ws, { type: MsgType.ERROR, message: result.error });
        return;
      }

      const s = result.state;
      await publish({
        type: MsgType.UPDATE,
        board: s.board,
        nextTurn: s.nextTurn,
        status: s.status,
        winner: s.winner,
        lastMove: s.lastMove
      });

      if (s.status === "win") {
        await publish({ type: MsgType.WIN, winner: s.winner });
      } else if (s.status === "draw") {
        await publish({ type: MsgType.DRAW });
      }
      return;
    }

    if (msg.type === MsgType.RESET) {
      const current = await readState(client);
      const resetState = {
        board: [["","",""],["","",""],["","",""]],
        nextTurn: "X",
        status: "playing",
        winner: null,
        lastMove: null,
        players: current?.players ?? { X: null, O: null }
      };
      await writeState(client, resetState);
      await publish({ type: MsgType.RESET, message: "Game reset" });
      await publish({ type: MsgType.UPDATE, ...resetState });
      return;
    }

    send(ws, { type: MsgType.ERROR, message: `Unknown type: ${msg.type}` });
  });

  ws.on("close", async () => {
    const meta = localClients.get(ws);
    localClients.delete(ws);
    if (!meta) return;

    const { reset } = await releasePlayerAtomic(client, meta.connId);
    await publish({ type: MsgType.RESET, message: "A player disconnected. Game reset." });
    await publish({
      type: MsgType.UPDATE,
      board: reset.board,
      nextTurn: reset.nextTurn,
      status: reset.status,
      winner: reset.winner,
      lastMove: reset.lastMove
    });
  });
});

console.log(`Server ${SERVER_ID} listening on ws://localhost:${PORT} (Redis: ${redisUrl})`);

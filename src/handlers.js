import { MsgType, safeJsonParse, send } from "./protocol.js";
import { tryMoveAtomic } from "./moves.js";
import {
  readState,
  writeState,
  assignPlayerAtomic,
  releasePlayerAtomic,
} from "./redisStore.js";

/**
 * Send full current state to a single WS client
 */
async function sendFullState(ws, client) {
  const state = await readState(client);
  send(ws, {
    type: MsgType.UPDATE,
    board: state.board,
    nextTurn: state.nextTurn,
    status: state.status,
    winner: state.winner,
    lastMove: state.lastMove,
  });
}

async function handleJoin({ ws, meta, client, publish, serverId }) {
  const assigned = await assignPlayerAtomic(client, meta.connId);

  if (!assigned.symbol) {
    send(ws, {
      type: MsgType.ERROR,
      message: "Game is full (2 players already). You are a spectator.",
    });
    meta.symbol = null;
  } else {
    meta.symbol = assigned.symbol;
    send(ws, { type: MsgType.INFO, message: `You are player ${meta.symbol}` });
  }

  await sendFullState(ws, client);
  await publish({
    type: MsgType.INFO,
    message: `Player ${
      assigned.symbol ?? "spectator"
    } joined via Server ${serverId}`,
  });
}

async function handleMove({ ws, msg, meta, client, publish }) {
  if (!meta.symbol) {
    send(ws, {
      type: MsgType.ERROR,
      message:
        "You are not assigned a player (spectator). Type join first (if slots free).",
    });
    return;
  }

  const row = Number(msg.row);
  const col = Number(msg.col);

  const result = await tryMoveAtomic(client, meta.symbol, row, col);
  if (!result.ok) {
    send(ws, { type: MsgType.ERROR, message: result.error });
    return;
  }

  const s = result.state;

  // Broadcast state update to all servers/clients
  await publish({
    type: MsgType.UPDATE,
    board: s.board,
    nextTurn: s.nextTurn,
    status: s.status,
    winner: s.winner,
    lastMove: s.lastMove,
  });

  if (s.status === "win") {
    await publish({ type: MsgType.WIN, winner: s.winner });
  } else if (s.status === "draw") {
    await publish({ type: MsgType.DRAW });
  }
}

async function handleReset({ client, publish }) {
  const current = await readState(client);

  const resetState = {
    board: [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ],
    nextTurn: "X",
    status: "playing",
    winner: null,
    lastMove: null,
    players: current?.players ?? { X: null, O: null },
  };

  await writeState(client, resetState);
  await publish({ type: MsgType.RESET, message: "Game reset" });
  await publish({ type: MsgType.UPDATE, ...resetState });
}

async function handleClose({ meta, client, publish }) {
  // Release player assignment and reset game to avoid inconsistent mid-game state
  const { reset } = await releasePlayerAtomic(client, meta.connId);

  await publish({
    type: MsgType.RESET,
    message: "A player disconnected. Game reset.",
  });
  await publish({
    type: MsgType.UPDATE,
    board: reset.board,
    nextTurn: reset.nextTurn,
    status: reset.status,
    winner: reset.winner,
    lastMove: reset.lastMove,
  });
}

/**
 * Attaches all WS handlers to a connection
 * Keeping server.js as "wiring" only.
 */
export function attachClientHandlers({
  ws,
  serverId,
  port,
  client,
  publish,
  localClients,
}) {
  const meta = localClients.get(ws);

  // Friendly intro + initial state snapshot
  send(ws, {
    type: MsgType.INFO,
    message: `Connected to Server ${serverId} on port ${port}`,
  });
  sendFullState(ws, client);
  send(ws, {
    type: MsgType.INFO,
    message: `Send {"type":"join"} then moves: {"type":"move","row":0,"col":2}`,
  });

  ws.on("message", async (buf) => {
    const msg = safeJsonParse(buf.toString());
    if (!msg || !msg.type) {
      send(ws, { type: MsgType.ERROR, message: "Invalid JSON message" });
      return;
    }

    const latestMeta = localClients.get(ws);
    if (!latestMeta) return;

    if (msg.type === MsgType.JOIN) {
      await handleJoin({ ws, meta: latestMeta, client, publish, serverId });
      return;
    }

    if (msg.type === MsgType.MOVE) {
      await handleMove({ ws, msg, meta: latestMeta, client, publish });
      return;
    }

    if (msg.type === MsgType.RESET) {
      await handleReset({ client, publish });
      return;
    }

    send(ws, { type: MsgType.ERROR, message: `Unknown type: ${msg.type}` });
  });

  ws.on("close", async () => {
    const latestMeta = localClients.get(ws);
    localClients.delete(ws);
    if (!latestMeta) return;

    await handleClose({ meta: latestMeta, client, publish });
  });
}

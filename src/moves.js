import { checkDraw, checkWin, isValidCell } from "./game.js";
import { readState } from "./redisStore.js";

/**
 * Apply a move atomically using Redis WATCH/MULTI/EXEC.
 * This prevents race conditions when two servers attempt moves at the same time.
 */
export async function tryMoveAtomic(client, player, row, col) {
  while (true) {
    await client.watch("tictactoe:state");
    const state = await readState(client);

    if (!state) {
      await client.unwatch();
      return { ok: false, error: "State missing" };
    }

    // Game must be active
    if (state.status !== "playing") {
      await client.unwatch();
      return {
        ok: false,
        error: "Game is not in playing state. Wait for reset.",
      };
    }

    // Must play on your turn
    if (state.nextTurn !== player) {
      await client.unwatch();
      return {
        ok: false,
        error: `Not your turn. Next turn: ${state.nextTurn}`,
      };
    }

    // Must be in bounds
    if (!isValidCell(row, col)) {
      await client.unwatch();
      return { ok: false, error: "Invalid cell. Use row/col in 0..2" };
    }

    // Must be empty
    if (state.board[row][col]) {
      await client.unwatch();
      return { ok: false, error: "Cell already occupied" };
    }

    // Apply move
    const next = structuredClone(state);
    next.board[row][col] = player;
    next.lastMove = { player, row, col };

    // Determine next state
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

    // Atomic commit
    const multi = client.multi();
    multi.set("tictactoe:state", JSON.stringify(next));
    const res = await multi.exec();

    // Conflict => state changed => retry
    if (res === null) continue;

    await client.unwatch();
    return { ok: true, state: next };
  }
}

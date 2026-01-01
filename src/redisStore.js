import Redis from "ioredis";
import { newState } from "./game.js";

const STATE_KEY = "tictactoe:state";
const PLAYERS_KEY = "tictactoe:players";
const CHANNEL = "tictactoe:pubsub";

export function createRedisClients(redisUrl = "redis://localhost:6379") {
  const pub = new Redis(redisUrl);
  const sub = new Redis(redisUrl);
  const client = new Redis(redisUrl);
  return { pub, sub, client };
}

export function getChannel() {
  return CHANNEL;
}

export async function initIfMissing(client) {
  const exists = await client.exists(STATE_KEY);
  if (!exists) {
    const s = newState();
    await client.set(STATE_KEY, JSON.stringify(s));
    await client.del(PLAYERS_KEY);
  }
}

export async function readState(client) {
  const raw = await client.get(STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function writeState(client, state) {
  await client.set(STATE_KEY, JSON.stringify(state));
}

export async function assignPlayerAtomic(client, connId) {
  while (true) {
    await client.watch(PLAYERS_KEY, STATE_KEY);
    const [px, po] = await client.hmget(PLAYERS_KEY, "X", "O");
    const rawState = await client.get(STATE_KEY);
    const state = rawState ? JSON.parse(rawState) : null;

    let symbol = null;
    if (!px) symbol = "X";
    else if (!po) symbol = "O";

    const multi = client.multi();
    if (symbol) {
      multi.hset(PLAYERS_KEY, symbol, connId);

      const nextState = structuredClone(state);
      nextState.players[symbol] = connId;
      multi.set(STATE_KEY, JSON.stringify(nextState));
    }

    const res = await multi.exec();
    if (res === null) continue;
    await client.unwatch();

    const finalState = await readState(client);
    return { symbol, state: finalState };
  }
}

export async function releasePlayerAtomic(client, connId) {
  while (true) {
    await client.watch(PLAYERS_KEY, STATE_KEY);
    const players = await client.hgetall(PLAYERS_KEY);
    const rawState = await client.get(STATE_KEY);
    const state = rawState ? JSON.parse(rawState) : null;

    const toDelete = [];
    if (players.X === connId) toDelete.push("X");
    if (players.O === connId) toDelete.push("O");

    const multi = client.multi();
    if (toDelete.length) multi.hdel(PLAYERS_KEY, ...toDelete);

    const reset = newState();
    if (players.X && players.X !== connId) reset.players.X = players.X;
    if (players.O && players.O !== connId) reset.players.O = players.O;

    multi.set(STATE_KEY, JSON.stringify(reset));

    const res = await multi.exec();
    if (res === null) continue;
    await client.unwatch();
    return { reset };
  }
}

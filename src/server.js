import { WebSocketServer } from "ws";
import { safeJsonParse, send, MsgType } from "./protocol.js";
import { createRedisClients, getChannel, initIfMissing } from "./redisStore.js";
import { attachClientHandlers } from "./handlers.js";

/**
 * Parse CLI args:
 * --id A|B
 * --port 3001|3002
 * --redis redis://localhost:6379
 */
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

/**
 * Redis clients:
 * - pub/sub for cross-server fanout
 * - client for state reads/writes + transactions
 */
const { pub, sub, client } = createRedisClients(redisUrl);
await initIfMissing(client);

/**
 * WebSocket server (clients connect here)
 */
const wss = new WebSocketServer({ port: PORT });

/**
 * Track clients connected to THIS server instance only.
 * Game state is shared via Redis.
 */
const localClients = new Map(); // ws -> { connId, symbol }

/**
 * Fanout event to local WS clients
 */
function broadcastLocal(obj) {
  for (const ws of localClients.keys()) {
    if (ws.readyState === ws.OPEN) send(ws, obj);
  }
}

/**
 * Subscribe to cross-server events.
 * Any server publishes updates; every server rebroadcasts locally.
 */
await sub.subscribe(getChannel());
sub.on("message", (_channel, message) => {
  const evt = safeJsonParse(message);
  if (!evt) return;
  broadcastLocal(evt);
});

/**
 * Publish an event to all servers via Redis pub/sub
 */
async function publish(evt) {
  await pub.publish(getChannel(), JSON.stringify(evt));
}

/**
 * New client connection
 */
wss.on("connection", (ws) => {
  const connId = `${SERVER_ID}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

  localClients.set(ws, { connId, symbol: null });

  // Wire up handlers (join/move/reset/close)
  attachClientHandlers({
    ws,
    serverId: SERVER_ID,
    port: PORT,
    client, // redis state client
    publish, // cross-server publish
    localClients, // access per-connection meta
  });

  send(ws, { type: MsgType.INFO, message: "Connected" });
});

console.log(
  `Server ${SERVER_ID} listening on ws://localhost:${PORT} (Redis: ${redisUrl})`
);

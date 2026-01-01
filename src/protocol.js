export const MsgType = Object.freeze({
  JOIN: "join",
  MOVE: "move",
  UPDATE: "update",
  WIN: "win",
  DRAW: "draw",
  ERROR: "error",
  RESET: "reset",
  INFO: "info"
});

export function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

export function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

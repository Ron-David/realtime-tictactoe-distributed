# 🧪 Real-Time Tic-Tac-Toe (Two Servers, WebSocket)

This project implements a real-time multiplayer Tic-Tac-Toe game using Node.js and WebSockets.  
Two players can connect to different backend servers and still see each other’s moves instantly.

---

## 🎯 What This Solves

- Two independent WebSocket servers (A & B)
- Clients can connect to either server
- Game state stays consistent across servers
- Moves are reflected in real time
- Full validation (turn order, bounds, occupied cells, win/draw)

---

## 🧱 Architecture

- WebSocket for client ↔ server communication
- Redis used as:
  - Shared game state store
  - Pub/Sub channel for server ↔ server sync
- Servers are stateless; Redis is the source of truth
- Moves are applied atomically using Redis `WATCH / MULTI / EXEC`

---

## 🔌 Communication Protocol

### Client → Server

```json
{ "type": "join" }
{ "type": "move", "row": 1, "col": 2 }
{ "type": "reset" }
```

### Server → Client

```json
{
  "type": "update",
  "board": [
    ["X", "", ""],
    ["", "O", ""],
    ["", "", ""]
  ],
  "nextTurn": "X",
  "status": "playing",
  "winner": null,
  "lastMove": { "player": "O", "row": 1, "col": 1 }
}
```

---

## 🖥 CLI Client

- Terminal-based (no browser)
- Renders an ASCII board
- Accepts moves as `row col`
- Shows opponent moves in real time

Commands:

- `join`
- `row col` (example: `1 2`)
- `reset`

---

## ▶️ How to Run

### 1. Start Redis

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start both servers (two terminals)

```bash
npm run server:a
npm run server:b
```

### 4. Start two clients (two terminals)

```bash
npm run client:a
npm run client:b
```

### 5. Play

In each client:

```
join
```

Then make moves:

```
0 0
1 1
```

Clients may connect to different servers and remain fully synchronized.

---

## 🤖 AI Usage

AI tools (**ChatGPT** and **Gemini**) were used throughout the entire development of this project.

I relied on AI to:

- Generate the initial end-to-end solution (servers, client, Redis sync)
- Explore and compare architectural approaches
- Draft the WebSocket protocol and core game logic
- Quickly iterate on implementation details

My role focused on:

- Reviewing and understanding the generated code
- Refactoring for clarity and structure (splitting files, improving readability)
- Fixing bugs discovered during real execution (e.g. reset behavior, duplicate events)
- Verifying correctness through manual testing across two servers
- Refining edge cases and improving developer / user experience

## 🎥 Demo

Demo video showing gameplay across two servers:  
[Watch demo video](./demo.mov)

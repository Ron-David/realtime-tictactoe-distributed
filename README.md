# AI Mission: Real-Time Tic-Tac-Toe (Distributed Systems)

Duration: ~1 Hour  
Role: AI Engineer

Mission
Build a real-time multiplayer Tic-Tac-Toe game where two independent backend servers stay perfectly synchronized using Redis and WebSockets — no shared memory.

This project demonstrates distributed state management, atomic updates, and cross-server event propagation in a minimal, production-style setup.

---

Tech Highlights

- Two independent Node.js backend servers
- WebSocket-based real-time clients
- Redis as the single source of truth
- Atomic state updates (WATCH / MULTI / EXEC)
- Redis Pub/Sub for cross-server sync

---

AI Usage

AI tools (ChatGPT, Gemini) were used to accelerate scaffolding, explore architecture, and draft code. Final design, correctness, and validation were handled manually.

---

Run

1. Start Redis  
   docker compose up -d

2. Install  
   npm install

3. Start servers (two terminals)  
   npm run server:a  
   npm run server:b

4. Start clients (two terminals)  
   npm run client:a  
   npm run client:b

---

Play

- join
- First player: X, second: O
- Move: row col (0..2)
- reset (optional)

---

Sync Design

- Game state stored in Redis
- Moves validated and committed atomically
- Updates broadcast via Redis Pub/Sub
- All servers forward updates to their clients

Result: consistent real-time gameplay across servers.

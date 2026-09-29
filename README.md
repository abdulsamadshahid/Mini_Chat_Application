# MiniChat 🚀
### Production-Grade Real-Time Chat Application for DevOps & Kubernetes Portfolio

MiniChat is an intentionally scoped, horizontally scalable real-time messaging application designed as a developer handoff for **DevOps / SRE / Kubernetes** deployment.

While the product feature set is clean and concise (focused on 1-to-3 participant chat rooms), the underlying architecture is built with real distributed systems patterns: stateless backend instances, relational data persistence in **PostgreSQL**, distributed event broadcasting via **Redis Pub/Sub**, authenticated WebSockets, and explicit Kubernetes liveness/readiness probes.

---

## 1. System Architecture

MiniChat decouples permanent state storage from transient real-time event dissemination.

```
                         [ Clients / Browsers ]
                         /         |         \
                  WebSocket    WebSocket    WebSocket
                        /          |          \
                       v           v           v
           [ Kubernetes Service / Ingress / Load Balancer ]
                       /           |           \
                      v            v            v
              +---------------+  +---------------+  +---------------+
              |   Backend 1   |  |   Backend 2   |  |   Backend 3   |
              | (Express/WS)  |  | (Express/WS)  |  | (Express/WS)  |
              +---------------+  +---------------+  +---------------+
                     |   \            |   /            |   /
        Read/Write   |    \ Pub/Sub   |  /  Pub/Sub    |  /  Pub/Sub
        Persisted    |     \ Sync     | /   Sync       | /   Sync
        Data         |      \         |/               |/
                     v       v        v                v
            +----------------+       +------------------------+
            |   PostgreSQL   |       |      Redis 7.x         |
            | (Source of     |       | (Pub/Sub Adapter &     |
            |  Truth)        |       |  Ephemeral Presence)   |
            +----------------+       +------------------------+
```

### Why PostgreSQL for Messages vs. Redis for Coordination?

* **PostgreSQL (Durability & ACID Compliance):**
  Permanent messages, room ownership, memberships, and user credentials demand relational integrity, foreign key cascading (`ON DELETE CASCADE`), transactional consistency, and non-volatile disk persistence. PostgreSQL serves as the **sole source of truth**.
* **Redis (Sub-millisecond Transient Coordination):**
  When multiple backend instances run behind a Kubernetes Horizontal Pod Autoscaler (HPA), Client A may be connected to Pod 1 while Client B is connected to Pod 2.
  Storing chat history in Redis would risk memory bloat and eventual data loss on cache evictions. Instead, Redis is used strictly as a **distributed message broker (Pub/Sub)** and for **ephemeral presence** (`minichat:presence:<userId>` with TTL).

---

## 2. Real-Time Redis Pub/Sub Flow

When User A sends a message in a chat room:

```
[User A on Pod 1]
       │
       │ 1. WebSocket Event: "send_message" { roomId, content }
       ▼
 [Backend Pod 1]
       │
       ├─► 2. Authenticate JWT & Validate Room Membership
       │
       ├─► 3. INSERT INTO messages (...)  ──► [PostgreSQL Database]
       │                                     (Saved permanently)
       │
       └─► 4. Redis Adapter Publish  ────────► [Redis Pub/Sub Channel]
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           ▼                                                       ▼
                    [Backend Pod 1]                                         [Backend Pod 2]
                           │                                                       │
                           ▼                                                       ▼
                 Deliver to connected                                    Deliver to connected
                 Room Members on Pod 1                                   Room Members on Pod 2
                           │                                                       │
                           ▼                                                       ▼
                     [User A Screen]                                         [User B Screen]
```

1. **Client emits `send_message`** with room ID and content over WebSocket.
2. **Backend Pod 1** validates the JWT token and queries PostgreSQL to ensure the user is an authorized member of the room.
3. **Backend Pod 1** persists the message to PostgreSQL.
4. **Backend Pod 1** emits `new_message` to `room:<roomId>`.
5. The **`@socket.io/redis-adapter`** publishes the event payload to Redis.
6. **Backend Pod 2** (and any other running replicas) receives the event over Redis Sub and delivers it to connected clients in that room immediately.

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, Lucide | Responsive, component-driven client with zero bloat |
| **Frontend Web Server** | Nginx Alpine | Serves production static assets with SPA fallback and WebSocket reverse proxy |
| **Backend** | Node.js 22, Express, TypeScript | High-concurrency asynchronous runtime |
| **Real-Time** | Socket.IO + `@socket.io/redis-adapter` | Resilient WebSocket engine with built-in multi-replica synchronization |
| **Database** | PostgreSQL 16 | Relational consistency, foreign keys, indexed message history |
| **Cache & Pub/Sub** | Redis 7 | Distributed pub/sub bus, ephemeral presence tracking with TTL |
| **Authentication** | JWT (jsonwebtoken) & bcryptjs | Stateless authorization suitable for horizontally scaled pods |

---

## 4. Key Application Rules

* **Maximum 3 Users per Room:** Chat rooms are strictly restricted to a maximum of 3 participants. This boundary condition is enforced at both the API and database validation layers.
* **Ephemeral Presence:** User online/offline state is tracked in Redis memory using keys with automatic TTL expiration. If a pod crashes, presence state naturally expires without polluting the database.
* **Strict Room Authorization:** Users cannot read messages or join WebSocket channels of rooms they have not been explicitly invited to.

---

## 5. Kubernetes & Health Probes

MiniChat strictly separates process liveness from dependency readiness:

| Endpoint | Probe Type | Behavior | Kubernetes Config |
|---|---|---|---|
| `GET /health` | **Liveness Probe** | Returns HTTP 200 `{ status: "ok" }` when the Node.js process event loop is alive. **Does not depend on external services.** | `livenessProbe.httpGet.path: /health` |
| `GET /ready` | **Readiness Probe** | Queries PostgreSQL (`SELECT 1`) and pings Redis (`PING`). Returns HTTP 200 when ready or HTTP 503 if downstream dependencies are unreachable. | `readinessProbe.httpGet.path: /ready` |

### Graceful Shutdown
The backend intercepts `SIGTERM` and `SIGINT` signals emitted by the Kubernetes kubelet during pod termination:
1. Stops accepting incoming HTTP requests (`server.close()`).
2. Closes active WebSocket connections.
3. Disconnects Redis pub/sub clients.
4. Drains the PostgreSQL connection pool.
5. Exits cleanly with status code `0`.

---

## 6. Project Structure

```
minichat/
│
├── frontend/                     # Frontend Application
│   ├── src/                      # React source code
│   ├── Dockerfile                # Multi-stage build (Node build -> Nginx Alpine)
│   ├── nginx.conf                # Nginx reverse proxy & SPA configuration
│   └── package.json              # Frontend manifest
│
├── backend/                      # Backend Application
│   ├── src/
│   │   ├── app.ts                # Express application factory
│   │   ├── config.ts             # Configuration loader from environment
│   │   ├── index.ts              # Standalone production server runner
│   │   ├── database/             # PostgreSQL connection pool & schema
│   │   │   ├── db.ts             # Query pool & migration runner
│   │   │   └── schema.sql        # Database table definitions & indexes
│   │   ├── middleware/           # JWT authentication middleware
│   │   │   └── auth.ts
│   │   ├── routes/               # REST API endpoints
│   │   │   ├── auth.ts           # /api/auth/register, /login, /me
│   │   │   ├── rooms.ts          # /api/rooms, /members, /messages
│   │   │   └── health.ts         # /health, /ready probes
│   │   ├── services/             # Redis client & presence manager
│   │   │   └── redis.ts
│   │   └── websocket/            # Socket.IO setup & Redis adapter
│   │       └── socket.ts
│   ├── Dockerfile                # Multi-stage backend build (Node Alpine, non-root user)
│   ├── tsconfig.json             # Backend TypeScript config
│   └── package.json              # Backend dependencies
│
├── docker-compose.yml            # Local testing orchestrator (PG + Redis + App)
├── .env.example                  # Environment variable reference
├── .gitignore
└── README.md
```

---

## 7. Environment Variables

Reference template from `.env.example`:

```bash
# Server Port
PORT=3000
NODE_ENV=production

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/minichat
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=minichat

# Redis
REDIS_URL=redis://redis:6379

# Authentication
JWT_SECRET=your-32-character-secret-key-goes-here
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

---

## 8. Local Setup & Docker Compose

### Running with Docker Compose

To test the entire containerized environment locally (Frontend, Backend, PostgreSQL, Redis):

```bash
# 1. Clone repository
git clone <your-repo-url>
cd minichat

# 2. Start all services
docker compose up --build
```

Access the application in your browser:
* **Frontend:** `http://localhost:8080`
* **Backend Direct API:** `http://localhost:3000`
* **Liveness Probe:** `http://localhost:3000/health`
* **Readiness Probe:** `http://localhost:3000/ready`

### Testing Multi-Backend Horizontal Scaling

To simulate multiple backend instances communicating via Redis Pub/Sub:

```bash
docker compose up --scale backend=2
```

Both backend instances will connect to Redis, and messages sent to one instance will be delivered to clients connected to the other instance in real time!

---

## 9. REST API Specification

### Authentication

* `POST /api/auth/register`
  * Body: `{ "name": "Alice", "email": "alice@minichat.dev", "password": "password123" }`
  * Response: HTTP 201 `{ "token": "...", "user": { ... } }`
* `POST /api/auth/login`
  * Body: `{ "email": "alice@minichat.dev", "password": "password123" }`
  * Response: HTTP 200 `{ "token": "...", "user": { ... } }`
* `GET /api/auth/me`
  * Headers: `Authorization: Bearer <token>`
  * Response: HTTP 200 `{ "user": { ... } }`

### Chat Rooms

* `POST /api/rooms`
  * Headers: `Authorization: Bearer <token>`
  * Body: `{ "name": "DevOps Discussion" }`
  * Response: HTTP 201 `{ "room": { "id": "...", "name": "..." } }`
* `GET /api/rooms`
  * Headers: `Authorization: Bearer <token>`
  * Response: HTTP 200 `{ "rooms": [ ... ] }`
* `GET /api/rooms/:id`
  * Headers: `Authorization: Bearer <token>`
  * Response: HTTP 200 `{ "room": { "id": "...", "members": [ ... ] } }`
* `POST /api/rooms/:id/members`
  * Headers: `Authorization: Bearer <token>`
  * Body: `{ "email": "bob@minichat.dev" }`
  * Response: HTTP 201 `{ "member": { ... } }`
  * Error if >= 3 users: HTTP 400 `{ "error": "Room capacity reached. A room can contain a maximum of 3 users." }`
* `GET /api/rooms/:id/messages`
  * Headers: `Authorization: Bearer <token>`
  * Response: HTTP 200 `{ "messages": [ ... ] }`

### Health & Monitoring

* `GET /health` -> HTTP 200 `{ "status": "ok", "uptime": 45.2, "timestamp": "..." }`
* `GET /ready` -> HTTP 200 `{ "status": "ready", "checks": { "database": "connected", "redis": "connected" } }`

---

## 10. WebSocket Events Reference

Handshake requires: `{ auth: { token: "<jwt>" } }`

* `join_room` -> `{ roomId: string }`
* `leave_room` -> `{ roomId: string }`
* `send_message` -> `{ roomId: string, content: string }`
* `new_message` (incoming) -> `{ id, room_id, user_id, content, created_at, user_name, user_email }`
* `user_presence` (incoming) -> `{ userId, status: "online" | "offline" }`

# Real-Time Deployment Verification (Phase 12)

Scope: testing deployment — backend on Render (`https://real-estate-project-p237.onrender.com`),
frontend static SPA on Vercel (`frontend/vercel.json` rewrite only). Sockets connect directly
from browser → Render; no Vercel proxy involved. Single instance; no scaling infrastructure.

## 1. Environment contract

| Variable | Where | Required value |
|---|---|---|
| `CLIENT_ORIGIN` (or `CLIENT_URL` fallback) | Render backend env | Production Vercel frontend origin (e.g. `https://<app>.vercel.app`). Dev: `http://localhost:5173` (already in `backend/.env:5`). Documented in `backend/.env.example`. |
| `VITE_API_URL` | Vercel build env (frontend) | `https://real-estate-project-p237.onrender.com/api`. The socket URL derives from it by stripping `/api` (`services/socket.js:getSocketUrl`), so `wss://` follows automatically from `https://`. |
| `JWT_SECRET`, `MONGO_URI` | Render backend env | Unchanged from REST deployment. |

No new ports, no additional services, no proxy rules. `server.js` listens on one port for
both REST and Socket.IO (`http.createServer` + `httpServer.listen`).

## 2. Verified locally (against the real `server.js` boot)

| Check | Method | Result |
|---|---|---|
| Boot + REST health with sockets attached | Boot vs in-memory Mongo, `GET /api/health` | **200**, unchanged body |
| Socket handshake, same port | `GET /socket.io/?EIO=4&transport=polling` | **200**, `sid` issued, `upgrades:["websocket"]` offered |
| Pure-websocket transport | Client with `transports:['websocket']`, valid JWT | **CONNECTED** (upgrade path works, no polling fallback needed) |
| Authenticated cross-origin handshake | `Origin: <CLIENT_ORIGIN>`, valid JWT | **CONNECTED**, `ACAO` reflects configured origin |
| Restart recovery | Kill server → reboot same port + DB → client `reconnection:true` reconnects; REST resync returns authoritative unread (`1`) and history contains the post-restart message | **CONNECTED**, state converges |
| Unset `CLIENT_ORIGIN`/`CLIENT_URL` | Boot with both empty | Server boots; socket.io CORS permissive — acceptable for dev, **must set in production** (see §3) |
| Full suite + checks | `node --test tests/*.test.js`, `check:notifications`, `vite build` | **108 pass / 0 fail**, checks OK, build success |

## 3. CORS posture (measured, not assumed)

With `CLIENT_ORIGIN=http://allowed.test`, requests from `http://evil.test` (and no-origin)
to **both** REST and the socket.io handshake return **200** with
`Access-Control-Allow-Origin: http://allowed.test`. This is the `cors`-package default
(reflect configured origin, never 403) and matches REST's long-standing behavior exactly —
**no regression, no new hole**: browsers still block evil origins from reading responses,
and the enforced authentication boundary is the JWT handshake (rejection verified in
Phases 3 and 11), not the origin header (spoofable by non-browser clients by design).

Optional production hardening (NOT implemented — out of scope for the testing stage):
a custom `allowRequest` origin check on the Socket.IO server. Revisit only if a threat
model requires server-side origin rejection beyond what REST enforces.

## 4. Human dashboard steps (cannot be verified from this repo)

1. Render backend env: set `CLIENT_ORIGIN` to the production Vercel URL.
2. Vercel frontend build env: set `VITE_API_URL` to `https://real-estate-project-p237.onrender.com/api`.
3. Redeploy backend, then in a production browser: confirm `wss://` connection in
   DevTools Network (101 Switching Protocols), badge/message liveness across two users,
   and recovery after a Render restart/sleep (resync covers it by design — see Phase 11).
4. Render supports WebSocket upgrade on Node services by default; no extra proxy config.

## 5. Rollback

If realtime ever misbehaves in testing: the app is fully usable over REST with sockets
down (verified Phase 11 §7). No kill-switch needed beyond not connecting — the client
only connects when a token exists, and all reads/writes have REST paths.

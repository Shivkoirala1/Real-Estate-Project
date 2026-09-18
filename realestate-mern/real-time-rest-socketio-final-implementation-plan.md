# Real-Time Architecture: Final Implementation Plan (REST + Socket.IO)

> Status: **PLAN — not implemented.** This document is detailed enough to execute phase-by-phase without rediscovering the architecture.
> Context: combines (1) the original REST + Socket.IO repository audit and (2) the Open-Question Decisions report. Both are treated as authoritative; nothing below re-audits from scratch.
> Project stage: **testing-only deployment, not live to end users** — prioritize clean and correct over migration-safe. No feature flags, no zero-downtime machinery, no Redis.

Legend: **[FACT]** = verified against the current repo · **[DECISION]** = already approved · **[RECOMMENDATION]** = proposed implementation detail · **[APPROVAL]** = still needs a human yes.

---

## 1. Executive summary

Add Socket.IO as a **server→client delivery layer** on top of the unchanged REST API. Client→server mutations stay REST-only. Three badge/message event families (`v1.notification.unread`, `v1.conversation.unread`, `v1.conversation.message`) plus a lightweight `v1.conversation.status` close/reopen event replace the two polling loops (20 s notification badge, 30 s conversation badge) and close the "open thread never updates" gap. Single Express instance, no Redis, no schema changes, no SSE/GraphQL. Work is split into 12 small reviewable phases; the old polling loops are deleted only after socket delivery + REST resync are verified on the testing deployment.

## 2. Current architecture findings **[FACT]**

- Backend: single Express 4.19 app (`backend/server.js:106`), `app.listen(PORT)` (`:153-156`), no `http.createServer`, no cluster/PM2/workers. Scripts `start: node server.js` (`backend/package.json:8`). Node runtime on dev machine: v24.21.0.
- Middleware order (`server.js:108-151`): `cors → json → urlencoded → morgan(dev) → /uploads static → /api/health → 20 route mounts → notFound → errorHandler`.
- CORS (`server.js:108`): `cors({ origin: process.env.CLIENT_ORIGIN || process.env.CLIENT_URL })` — single string, no `credentials:true`. Dev value `CLIENT_ORIGIN=http://localhost:5173` (`backend/.env:5`); production origin not in repo.
- Auth: JWT `{ id, role }`, `expiresIn = JWT_EXPIRE || '7d'` (`utils/generateToken.js:3-7`); verified in `middleware/auth.js:17,50`; `protect` = Bearer-header-only + `User.findById` + `isActive` 403 (`:5-33`). No refresh endpoint, no cookies, no blacklist. Token in `localStorage || sessionStorage` (`frontend/src/utils/axios.js:8`, `AuthContext.jsx:30,57-72`); 401 wipes both (`axios.js:19-24`); logout is client-side wipe (`AuthContext.jsx:19-26`).
- Conversations: schema (`models/Conversation.js`) with required `inquirer`/`owner`, `messages[] {sender, senderName, side, body, createdAt}`, `isActive`, `lastReadAt.{inquirer,owner}`. Auth matrix verified per-op (see §8). `addMessage` (`controllers/conversationController.js:384-497`) has **no `isActive` guard** — the inconsistency Q1 resolves.
- Notifications: all writes via `notify()/notifyMany()` (`utils/notify.js:11-57`, ~50 call sites); `notify()` returns doc or `null`, never throws; some EMI calls are fire-and-forget (`emiPlanController.js:237,246,780,…` without `await`); cron dedup happens *before* `notify()` (`emiReminders.js`, `leadFollowupReminders.js`).
- Frontend: 2 genuine polling loops (`NotificationContext.jsx:13,90-91` 20 s; `ConversationContext.jsx:7,34-35` 30 s); everything else is debounce/toast/cooldown (must be preserved). Counts in `useState(0)`; `StrictMode` on (`main.jsx:15`); no React Query/SWR/socket deps.
- Deployment: backend on Render, frontend on Vercel (`frontend/vercel.json` SPA rewrite only); no `render.yaml/Dockerfile/nginx` in repo; WS `Upgrade` passthrough unverified — must be tested in Phase 12.

## 3. Current polling and stale-data findings **[FACT]**

| Flow | Location | Interval | Verdict |
|---|---|---|---|
| Notification badge `GET /notifications/unread-count` | `NotificationContext.jsx:36-44,82-94` | 20 s + immediate | Genuine polling → replace (Phase 7, delete Phase 10) |
| Conversation badge `GET /conversations/unread-count` | `ConversationContext.jsx:14-38` | 30 s + immediate | Genuine polling → replace (Phase 8, delete Phase 10) |
| Open thread `GET /:id`, `PATCH /:id/messages` | `Conversations.jsx:217-264` | none (manual refetch) | Stale-while-open gap → live delivery (Phase 5) |
| Bell dropdown `GET /notifications?filter&limit=30` on open; list loads on mount/filter | `NotificationBell.jsx:315-317`, etc. | event-driven | Keep REST |
| Toast/cooldown/debounce timers (7 sites) | `ToastContext`, `VerifyEmail`, 4× search debounce | single-shot | Keep — do not touch |

Badge payloads are tiny vs. change rate (a few notifications/day vs. ~300 req/hr/user combined) — the classic wasteful-polling signature.

## 4. Recommended architecture **[DECISION]**

```
Browser (socket.io-client, one connection/session)
  │  auth: { token } ──► Express + Socket.IO (same port, same process)
  │  join user:<myId> (auto) · join conversation:<id> (authorized)
  ▼
REST (authoritative, unchanged) ──persist──► realtime publisher ──emit──► rooms
```

- REST remains the **only** client→server mutation path (sending messages, read-state, CRUD, history, pagination, search).
- Socket.IO carries **server→client only**: connection/auth/room join-leave + 4 events (§5).
- Single instance; `http.createServer(app)` + `new Server(httpServer, { cors })`; no Redis adapter, no sticky-session work in this phase.

## 5. Why REST remains authoritative / 6. Why Socket.IO (no SSE/Redis/GraphQL)

- REST already encodes every authorization rule (participant triple, admin overrides, `maskOwnerIdentity`, recipient-scoped notifications) with tests around it — re-implementing writes over sockets would duplicate and drift from that logic.
- Socket.IO (not SSE) because Phase 5+ needs per-room fan-out with server-side join authorization and a single library covering badges + rooms + reconnect; SSE would add a second mechanism for no benefit at this stage. Native `ws` is rejected: no rooms, no auth middleware, no reconnect — Socket.IO's rooms + `socket.data` + automatic reconnect directly serve §§8–9.
- No Redis: single testing instance; in-process cron already assumes one event loop. Revisit only with a second backend instance.

## 7. Authentication design **[DECISION + RECOMMENDATION]**

Reuse existing JWT; no refresh tokens; never trust client-supplied id/role.

- Client (`frontend/src/services/socket.js`, new): `io(API_BASE, { auth: { token: getStoredToken() }, reconnection: true, reconnectionAttempts: Infinity, timeout: 10000 })`, reading the same `localStorage || sessionStorage` key axios uses. On fresh login/logout, tear down and rebuild the socket so the handshake always carries the current token.
- Server (`backend/middleware/socketAuth.js`, new; wired as `io.use(...)` in `backend/realtime/io.js`): read `socket.handshake.auth.token` → `jwt.verify(token, JWT_SECRET)` (same secret/options as `protect`; reuse `verifyToken` from `utils/generateToken.js:9-16`) → `User.findById(decoded.id)` → reject if missing or `!isActive` → attach `socket.data.user = { _id: String(user._id), role: user.role }`.
- Failures: `next(new Error('UNAUTHORIZED'))` / `ACCOUNT_DISABLED`; client maps `connect_error` → if 401-like, run the existing axios 401 wipe + redirect to login (reuse, don't duplicate). Reconnects re-send `auth` automatically; additionally refresh `socket.data.user` from DB on each `reconnect` (role could have changed) — cheapest correct option: re-run the same lookup in the `io.use` middleware, which Socket.IO invokes on every (re)connect.
- Logout (`AuthContext.jsx:19-26` + Phase 9): `socket.disconnect()` + `socket.auth.token = null` before clearing storage; login reverses it. No second auth system; tokens never logged (log `userId` only).

## 8. Authorization and room design **[DECISION]**

Rooms: `user:<userId>` (auto-join on connect from `socket.data.user._id` — no client input) for `v1.notification.unread` + `v1.conversation.unread`; `conversation:<conversationId>` for `v1.conversation.message` + `v1.conversation.status`, joined **only via an explicit `join-conversation` request the server authorizes**.

- Join handler (`backend/realtime/rooms.js`, new): client emits `join-conversation { conversationId }` → server `Conversation.findById` → allow iff `isInquirer || isOwner || role==='admin'` — the exact triple from `getConversationById` (`conversationController.js:353-362`), reusing `sideForUser` (`:38-47`). Reject otherwise with `join-error { conversationId, reason }`; never `socket.join()` before the check. Re-check on every join (including post-reconnect re-joins); leave via `leave-conversation` and automatically on disconnect (Socket.IO cleans up) plus explicit leave when the thread view unmounts.
- Closed threads: **join allowed** (read history + status events; matches readable `GET /:id`), sends blocked at REST (Q1 guard) so no message events can originate there.
- Admins may join any thread (mirrors read access); non-participant admins don't affect `lastReadAt` (as in REST `:366-371`).

## 9. Event catalog (all `v1.*`, server→client only)

### 9.1 `v1.notification.unread` → `user:<recipientId>`
- When: after `notify()` persists a doc (via publisher, §14). Never on `null`/failure/dedup-skip.
- Payload: `{ unreadCount: number }` — recomputed `countDocuments({ recipient, isRead: false })` (same query as `getUnreadCount`, `notificationController.js:37-40`).
- Client: `setUnreadCount(unreadCount)` in `NotificationContext`; treat as hint (resync on reconnect, §11).

### 9.2 `v1.conversation.unread` → `user:<recipientId>`
- When: after any notification with a `conversation` ref persists (covers `conversation_message`/`conversation_followup`), and after `addMessage`/`getConversationById`-stamping affects counts — publisher calls shared `countUnreadConversations(userId)` (extracted from `getUnreadCount`, `conversationController.js:307-321`, into `backend/realtime/unreadCounts.js` reused by both REST and emitter).
- Payload: `{ unreadCount: number }`. Client: `setUnreadCount` in `ConversationContext`.

### 9.3 `v1.conversation.message` → `conversation:<id>` room (recipient-aware)
- When: end of `addMessage` after `conversation.save()` (`:444`) **and** after the new Q1 `isActive` guard passes. Never on 400/403/404/409.
- Payload:
  ```js
  { conversationId: String, message: { _id, sender?, senderName, side, body, createdAt }, isActive: true }
  ```
  Masking (Q2): extract `maskSingleMessage(msg, viewerIsAdmin)` from `maskOwnerIdentity` (`:19-32`); server emits the **admin variant** (with `sender`) to admin sockets and the **masked variant** (`sender` stripped on `side==='owner'`) to non-admin sockets in the room — simplest implementation: iterate `io.in(room).fetchSockets()`, group by `socket.data.user.role`, emit each variant to the matching user rooms, or emit per-`user:<id>` directly. `senderName`/`side`/`body` identical for all (matches REST).
- Client: if `conversationId === activeId`, append iff `message._id` not already present (covers sender's own REST response + event race); else bump list row + badge via resync. Never log `body`.

### 9.4 `v1.conversation.status` → `conversation:<id>` room + affected user rooms
- When: end of `closeConversation` after `save()` (`:536`) and `reopenConversation` after `save()` (`:569`). Never on failure.
- Payload: `{ conversationId, isActive: boolean }`. Client: patch `active.isActive` + list row; reply box appears/disappears per existing `Conversations.jsx:527` logic.

## 10. Unread-count consistency strategy **[DECISION]**

Authoritative counts, never deltas. Socket events are hints; REST (`GET /notifications/unread-count`, `GET /conversations/unread-count`) is truth. Rules: mark-read paths (`markAsRead`, `markAllAsRead`, thread-open stamping) keep their existing optimistic update + REST resync; on `connect`/`reconnect`/`join-error`, client re-fetches both counts + open-thread history. Multi-tab: independent sockets, last-write-wins via REST — no cross-tab coordination in this phase.

## 11. Live message delivery strategy (message flow **[DECISION]**)

1. Client sends via `PATCH /:id/messages` (unchanged `addMessageToConversation`).
2. Server runs existing checks **plus new `isActive` guard** (403 closed).
3. Message persisted (`conversation.save()`), lead activity synced as today.
4. Server builds Q2 recipient-aware payload from the persisted subdoc (uses DB `_id`/`createdAt` — no client echo).
5. Server emits `v1.conversation.message` to the room (admin/masked variants).
6. Open-thread clients append with `_id` dedupe; sender's own REST response and event converge (dedupe key = `_id`); no optimistic UI is introduced (current code does full-thread replace — keep it; event path only appends when IDs are new).
7. List-view clients update row preview + refetch counts; closed/deleted threads handled by status flow / 404 on next REST fetch.

## 12. Reconnection and REST resynchronization

On `connect` (first or re-): re-fetch both unread counts; re-emit `join-conversation` for the currently open thread (if any) and re-fetch its history (`GET /:id`) to cover missed messages; surface `join-error` via toast + fall back to REST polling view (read-only live). On `disconnect`: keep UI interactive (all actions are REST); show a subtle offline indicator; queue nothing client-side. JWT expiry mid-session → `connect_error UNAUTHORIZED` → existing 401 wipe + login redirect.

## 13. Frontend state-management design

New `frontend/src/services/socket.js` singleton (create/disconnect/get, StrictMode-safe: module-level instance + refcount, effects always cleanup). Wire into existing contexts, no new state library, no new provider unless needed:
- `AuthContext.jsx`: own the socket lifecycle (connect on `user` set, disconnect on logout) — it already owns token storage.
- `NotificationContext.jsx`: subscribe `v1.notification.unread` → setter; remove 20 s interval (Phase 10).
- `ConversationContext.jsx`: subscribe `v1.conversation.unread` → setter; remove 30 s interval (Phase 10).
- `Conversations.jsx` + `LeadConversationThread.jsx`: join/leave room on `activeId`/thread mount; `v1.conversation.message` append w/ dedupe; `v1.conversation.status` patch.
- `NotificationBell.jsx`/pages: unchanged (they already fetch-on-open).

## 14. Backend integration design

- `backend/realtime/io.js` (new): `init(httpServer)` creates `Server` with `cors: { origin: CLIENT_ORIGIN || CLIENT_URL }` (same single-string rule as REST), registers auth middleware + room handlers; exports `getIO()` returning `null` before init / after close (callers no-op).
- `backend/realtime/rooms.js` (new): join/leave handlers with the §8 authorization.
- `backend/realtime/unreadCounts.js` (new): `countUnreadNotifications(recipientId)`, `countUnreadConversations(userId)` (moved logic, REST imports them — no duplication).
- `backend/realtime/notifyPublisher.js` (new): `publishNotificationUnread(doc)` — called from inside `notify()` after create; lazy `getIO()`; wraps everything in try/catch so emit failures never break persistence (mirrors `notify()`'s never-throw contract).
- Controller touch points (emit-after-save only): `addMessage` (message + conversation-unread), `close/reopenConversation` (status), `getConversationById` (no emit — read path), `notify()` (notification-unread + conditional conversation-unread). REST response shapes unchanged.

## 15. Deployment implications

- Code: `server.js` switches to `http.createServer(app)` + `init(httpServer)` + `httpServer.listen(PORT)`; CORS `origin` value must include the Vercel testing URL (add to Render env `CLIENT_ORIGIN`); Socket.IO needs no extra port (same HTTP server → same `Upgrade` path).
- Verify on testing deployment: WS handshake 101 through Render, Vercel→Render CORS allowlist, `https`/`wss` scheme, reconnect after Render sleep/restart. No proxy config in repo to change; if Render free-tier sleeps, sockets simply reconnect (covered by §12) — document, don't engineer around it.
- Env: no new required vars; optional `SOCKET_CORS_ORIGIN` only if diverging from REST CORS is ever needed (not in this phase).

## 16. Security risks

Handshake JWT verified + DB user lookup + `isActive` check; no client-supplied identity; room join re-authorizes per conversation (no arbitrary `join(id)`); per-recipient masking prevents owner-identity leak; `isActive` guard prevents writes to closed threads; rate-limit note: REST already the only mutation path — existing validation/express rate posture unchanged; add light per-socket join-rate guard (e.g. max N joins/10 s) in `rooms.js`; log ids only, never tokens/bodies; CORS stays single-origin allowlist.

## 17. Testing strategy

- Backend (extend `backend/tests/` + manual): handshake with valid/invalid/expired JWT, inactive user → reject; participant joins ok, stranger 403, admin ok, closed-thread join ok; message persists then event received by both variants with correct masking; blocked closed-send → 403 + no event; `notify()` failure/`null` → no event; fire-and-forget EMI notify still emits; counts equal REST after each emit.
- Frontend (manual + existing suite): one connection per session (StrictMode double-mount safe), cleanup on logout/unmount, badge updates, live append without duplicates (send + receive race), reconnect resyncs counts + history, socket-down app fully usable via REST, unrelated timers intact.
- Matrix: customer↔agent, admin↔agent, multi-thread, mark-read paths, close/reopen live, network kill, backend restart, expired token, Render/Vercel WS upgrade.

## 18. Phased implementation plan

### Phase 1 — Contracts & Helpers (no runtime behavior change)
- Objective: lock the event contract + extract reusable pure helpers.
- Files: create `backend/realtime/unreadCounts.js` (move `countUnreadConversations` logic; `getUnreadCount` imports it); extract `maskSingleMessage` next to `maskOwnerIdentity` (`conversationController.js:19-32`); create `backend/realtime/events.js` exporting `V1 = { NOTIF_UNREAD:'v1.notification.unread', CONV_UNREAD:'v1.conversation.unread', CONV_MESSAGE:'v1.conversation.message', CONV_STATUS:'v1.conversation.status' }` + payload typedefs.
- Acceptance: `npm run check:notifications` + existing tests pass; REST responses byte-identical.

### Phase 2 — Backend foundation
- Objective: Socket.IO attached to the same HTTP server.
- Files: modify `backend/server.js:106,153-156` (`http.createServer`, `init(httpServer)`, `httpServer.listen`); modify `backend/package.json` (`npm i socket.io@^4` — pairs with Node 24 / Express 4); create `backend/realtime/io.js` (`init`/`getIO`/`close`, CORS mirroring REST).
- Security/error: init failure must not crash REST boot (log + continue degraded); `getIO()` null-safe.
- Acceptance: `/api/health` unchanged; fresh `io` accepts unauthenticated TCP (auth lands Phase 3).

### Phase 3 — JWT authentication
- Objective: verified `socket.data.user` on every connection.
- Files: create `backend/middleware/socketAuth.js`; wire `io.use()` in `realtime/io.js`.
- Steps: `auth.token` → `verifyToken` → `User.findById` → `isActive` → attach `{_id, role}`; `UNAUTHORIZED`/`ACCOUNT_DISABLED` errors; reconnect re-verifies.
- Acceptance: valid token connects with `user:<id>` auto-join; invalid/expired/inactive rejected; no token in logs.

### Phase 4 — Rooms & join authorization
- Objective: `user:<id>` auto-join + authorized `conversation:<id>` joins.
- Files: create `backend/realtime/rooms.js` (`join-conversation`/`leave-conversation` + join-rate guard); reuse `sideForUser` + the `:353-362` triple.
- Acceptance: participant/admin join ok; stranger gets `join-error`; closed thread join ok; arbitrary IDs rejected.

### Phase 5 — Live conversation messages
- Objective: §11 flow end-to-end.
- Files: modify `conversationController.js addMessage` (Q1 `isActive` 403 guard + emit masked variants after `:444`); frontend `Conversations.jsx` + `LeadConversationThread.jsx` (join/leave, append w/ `_id` dedupe).
- Acceptance: two-browser message appears <1 s, no duplicates, sender view consistent, closed-send 403 + silent (no event).

### Phase 6 — Conversation status events
- Objective: close/reopen reflected live.
- Files: `closeConversation` (`:535-536`+) and `reopenConversation` (`:568-569`+) emit `v1.conversation.status`; frontend patches `active.isActive` + row badge (existing `:527` branching reused).
- Acceptance: close on admin browser flips reply box off on participant browser without reload; failed close emits nothing.

### Phase 7 — Notification unread events
- Objective: §Q3 publisher + badge live.
- Files: create `backend/realtime/notifyPublisher.js`; modify `utils/notify.js` (3-line call after `Notification.create`); frontend `NotificationContext.jsx` subscribes; **keep 20 s poll running**.
- Acceptance: any of the ~50 flows bumps the bell live; `notify()` `null` path emits nothing; socket-down still persists + poll covers.

### Phase 8 — Conversation unread events
- Objective: badge parity for threads.
- Files: publisher calls `countUnreadConversations` when `doc.conversation` set (covers both `conversation_message` and `conversation_followup` fan-outs); `ConversationContext.jsx` subscribes; **keep 30 s poll running**.
- Acceptance: reply from other side bumps thread badge live; opening thread (REST stamping) clears it as today.

### Phase 9 — Frontend lifecycle & resync
- Objective: §12 + §13 wiring solid.
- Files: create `frontend/src/services/socket.js` (+ `npm i socket.io-client@^4` in `frontend/`); modify `AuthContext.jsx` (lifecycle), both unread contexts (subscribe/resync), thread views (re-join + history refetch on `connect`).
- Acceptance: one connection/session, clean logout/disconnect, reconnect resyncs counts + open history, socket-down app fully usable.

### Phase 10 — Remove polling
- Objective: delete the two loops only.
- Files: `NotificationContext.jsx:13,90-91`, `ConversationContext.jsx:7,34-35` (intervals + `pollRef`); leave every debounce/toast/cooldown untouched.
- Acceptance: zero `setInterval` API polling in `src/`; badges update via events; resync paths cover gaps. **Only after Phases 7–9 verified on testing deployment.**

### Phase 11 — Testing
- Objective: §17 matrix green (backend tests + two-browser manual + failure injection).

### Phase 12 — Testing-deployment verification
- Objective: Render/Vercel WS upgrade, CORS, `wss`, sleep/restart reconnect proven; `CLIENT_ORIGIN` set; document results. No scaling infra.

## 19. Migration and rollback

No production migration (testing-only stage): implement phases 1–9 with polling intact, verify on the testing deployment, then delete polling (Phase 10). Rollback per phase = revert its files; global kill-switch = skip `init(httpServer)` (pure REST, polling restored by reverting Phase 10 only). Monitor via existing logs + `connect_error`/`join-error` counters.

## 20. Open questions → resolved

Q1 closed-send → 403 guard (**fixes inconsistency; approving this plan approves the guard**). Q2 masking → per-recipient variants (or masked-only fallback). Q3 emission → inside `notify()`. Q4 counts → authoritative recompute. Q5 auth → handshake JWT, no refresh.

## 21. Acceptance criteria

The 20 items from the brief, verifiable: (1) REST authoritative (no socket mutations exist) · (2) mutations REST-only · (3) server→client delivery live · (4)(5) badges without polling · (6) open thread live · (7) closed-send 403 · (8) closed readable · (9) JWT handshake · (10) room auth enforced · (11) payload parity w/ REST masking · (12) emit-after-persist only · (13) counts not deltas · (14) reconnect resyncs via REST · (15) socket-down REST intact · (16) no schema change · (17) no Redis · (18) UI timers intact · (19) testable on current deployment · (20) simple/single-process.

## 22. File-by-file change inventory

### Modify

| File | Change | Reason | Phase |
|---|---|---|---|
| `backend/server.js` | `http.createServer` + `init(httpServer)` + `httpServer.listen` | attach Socket.IO same port | 2 |
| `backend/package.json` | add `socket.io@^4` | server realtime dep | 2 |
| `backend/controllers/conversationController.js` | extract `maskSingleMessage`; add `isActive` 403 in `addMessage`; emit message/status events | Q1/Q2/§11/§9.4 | 1, 5, 6 |
| `backend/utils/notify.js` | call publisher after `create` | Q3 centralized emit | 7 |
| `backend/middleware/socketAuth.js` | **create** (listed here as modify-target of auth surface) | handshake JWT | 3 |
| `frontend/package.json` | add `socket.io-client@^4` | client realtime dep | 9 |
| `frontend/src/services/socket.js` | **create** singleton | lifecycle | 9 |
| `frontend/src/context/AuthContext.jsx` | own socket connect/disconnect | lifecycle/logout | 9 |
| `frontend/src/context/NotificationContext.jsx` | subscribe + resync; delete 20 s poll | Phase 7 → 10 | 7, 9, 10 |
| `frontend/src/context/ConversationContext.jsx` | subscribe + resync; delete 30 s poll | Phase 8 → 10 | 8, 9, 10 |
| `frontend/src/pages/user/Conversations.jsx` | room join/leave, live append/dedupe, status patch | Phase 5/6 | 5, 6, 9 |
| `frontend/src/components/LeadManagement/LeadConversationThread.jsx` | same per-thread | Phase 5/6 | 5, 6, 9 |

### Create

| File | Reason | Phase |
|---|---|---|
| `backend/realtime/io.js` | init/getIO/close | 2 |
| `backend/middleware/socketAuth.js` | JWT handshake | 3 |
| `backend/realtime/rooms.js` | authorized joins | 4 |
| `backend/realtime/events.js` | `v1.*` contract | 1 |
| `backend/realtime/unreadCounts.js` | shared count queries | 1 |
| `backend/realtime/notifyPublisher.js` | emit-after-persist | 7 |
| `frontend/src/services/socket.js` | singleton manager | 9 |

### Remain unchanged

Schemas/models, route paths, REST response shapes, `protect/authorize`, `notify()` signature/contract, all debounce/toast/cooldown timers, cron schedules, `vercel.json`, notification type enum + `check:notifications` script.

---

## Before Implementation

- [ ] Approve the new `addMessage` 403-on-closed guard (tightens the API to match the UI).
- [ ] Approve masked-only fallback vs. per-recipient emit if Phase 5 implementation favors simplicity.
- [ ] Confirm testing-deploy `CLIENT_ORIGIN` value for CORS/WS verification (Phase 12).
- [ ] Approve install commands: `npm i socket.io@^4` (backend) + `npm i socket.io-client@^4` (frontend) — [FACT] versions chosen for Express 4 / Node 24 / React 18 compatibility; pin exact minors at install time.

**No remaining architectural blockers identified.**

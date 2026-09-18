# Client-Facing Polling Audit: Notifications, Conversations & Time-Sensitive Flows

> Scope: React frontend → Express API only. Backend-to-backend (cron, Brevo email, SMS stub) excluded per brief. **No code modified — report only.**

## Summary Table

| # | Flow | Current interval | Recommendation | Effort | Priority |
|---|------|------------------|----------------|--------|----------|
| F1 | Notification bell badge — `GET /notifications/unread-count` | 20s `setInterval` | **Migrate to SSE** (unified badge stream) | Small | **P1 — quick win** |
| F2 | Conversations badge — `GET /conversations/unread-count` | 30s `setInterval` | **Migrate to SSE** (same stream as F1) | Small | **P1 — quick win** |
| F3 | Open conversation thread — `GET /:id`, `PATCH /:id/messages` | **No polling — manual refetch only (stale while open)** | **Hybrid: WS (Socket.IO) for live delivery + REST for history** | Medium–Large | P2 — bigger architectural bet |
| F4 | Notification list / bell dropdown — `GET /notifications?filter&limit=30` | Event-driven (on open / filter change), no timer | **Keep REST/polling** | — | Not a migration target |
| F5 | Conversation list + lead-thread bodies — `GET /conversations*`, `GET /:id` per thread | Event-driven (mount / filter / send / close), no timer | **Keep REST** | — | Not a migration target |
| F6 | Debounces, cooldowns, toasts (`setTimeout`/`setInterval`) | 0–350ms single-shot / 1s countdown, no API loop | **Keep as-is (not polling)** | — | No action |

**Bottom line:** only **2 true polling loops** exist (F1, F2). Both are textbook server-push-shaped one-way badge counters and collapse into a single SSE stream — a small, low-risk quick win. The larger latency problem is F3: the open chat thread has **zero live update** (not even polling), so a reply from the other party is invisible until manual reload — that requires a bidirectional WebSocket bet, justified separately.

---

## Inventory & Evidence (what was actually found)

### Search completeness

- `setInterval|setTimeout|refetchInterval|pollingInterval|...` over `frontend/`: **8 hits in 7 files.** Only 2 are API polling (F1, F2); the rest are debounces/countdowns/toasts (F6).
- `React Query / SWR / RTK Query`: **absent.** `frontend/package.json` has `axios`, `react`, `react-router-dom`, `vite`, `tailwindcss` — no `@tanstack/react-query`, `swr`, `@reduxjs/toolkit`. Zero hits for `useQuery/useSWR/refetchInterval/pollingInterval/usePolling/useInterval`.
- `Socket.IO / ws / EventSource / text/event-stream`: **zero app-code hits.** Only transitive `streamsearch/streamx` strings in `backend/package-lock.json`. `backend/package.json` deps: `express, mongoose, jsonwebtoken, node-cron, nodemailer, ...` — no `socket.io`, `ws`, `eventsource`. `frontend/package.json` — no `socket.io-client`. `backend/server.js:106-156` is plain `express()` + `app.listen()` — no `http.createServer`, `new Server()`, `io.on()`.
- `visibilitychange / window focus / online-offline refetch`: **zero hits.** Only `mousedown` outside-click and `Escape` key handlers. No `refetchOnWindowFocus` equivalent.
- Custom hooks: `src/hooks/` contains only `useDismissableMenu.js` and `useLogoutHandler.js` — no `usePolling`/`useInterval`.

### F1 — Notification badge polling (CONFIRMED)

- **File:** `frontend/src/context/NotificationContext.jsx:13,36-44,82-94`
  - `const POLL_INTERVAL = 20000; // 20s - keeps the bell fresh without needing a websocket` (`:13`)
  - `refreshUnreadCount` → `getUnreadCount()` → `api.get("/notifications/unread-count")` (`:36-44`, service at `frontend/src/services/notificationService.js:22-25`)
  - `useEffect([user])`: immediate call + `setInterval(refreshUnreadCount, POLL_INTERVAL)`, cleared on logout/unmount (`:82-94`)
- **Trigger:** auth-user mount only; gated on `user` truthy; silent fail.
- **Frequency:** 1 immediate + 1 per 20s ⇒ **~180 req/hr per active logged-in session**, plus one `GET /notifications?filter&limit=30` each time `NotificationBell.jsx:315-317` dropdown opens (`if (open) fetchNotifications('all')` — event-driven, not polled).

### F2 — Conversation badge polling (CONFIRMED)

- **File:** `frontend/src/context/ConversationContext.jsx:7,14-38`
  - `const POLL_INTERVAL = 30000; // 30s` (`:7`)
  - `api.get('/conversations/unread-count')` (`:20`), `setInterval(refreshUnreadCount, POLL_INTERVAL)` (`:35`), same `[user]`-gated immediate+interval pattern.
- **Frequency:** **~120 req/hr per active session.** Combined F1+F2: **~300 req/hr/user of pure badge polling.**

### F3 — Open thread has NO live update (staleness gap, not polling)

- `frontend/src/pages/user/Conversations.jsx:217-230` (`openThread`), `:249-264` (`sendReply`): thread loads via `GET /conversations/:id` on click; refreshes only after **own** send/close/reopen (`refreshUnreadCount(); loadList();`). **No timer re-fetches the open `active.messages`.** A counterparty reply while the thread is open is invisible until the user clicks the thread again or sends a message.
- Same in `frontend/src/components/LeadManagement/LeadConversationThread.jsx:31-69`: bodies load per `threadIdsKey` change (mount + `onChange()` after own reply/start/close). No interval.
- Backend already fans out the server-side event: `backend/controllers/conversationController.js:465,478` (`await notify / notifyMany` on `addMessage`), plus `lead/visit/contact-form/emi/sale/rental` controllers all `notify()` into the `Notification` collection. The server **knows** the instant new data exists — the client just isn't listening.

### F4/F5 — Event-driven REST (correctly not polling)

- Notification list: `NotificationBell.jsx:315-317` (on dropdown open), `pages/user/Notifications.jsx:66-69` (on `filter` change). Conversation list: `Conversations.jsx:176-178` (on `loadList` deps: page/filter/search). All client-pull-shaped (user asked for a view), so REST is correct.

### F6 — Non-polling timers (explicitly excluded)

`ToastContext.jsx:11-13` (3.5s toast dismiss), `VerifyEmail.jsx:22-26` (1s cooldown tick, one-shot `POST /auth/resend-verification` on click only), `Conversations.jsx:192`, `ManageAgents.jsx:116`, `ManagementDashboard.jsx:102`, `EmiPlans.jsx:61` (250–350ms search debounces). No repeated API calls — no action.

### Backend endpoints hit by polling (payload profile)

- `GET /api/notifications/unread-count` (`backend/controllers/notificationController.js:37-40`): single `countDocuments({recipient, isRead:false})` → `{success, unreadCount}`. **Tiny (~30 bytes JSON), cheap query.** Comment at `:34` literally says `"cheap, for polling the bell badge"`.
- `GET /api/conversations/unread-count` (`backend/controllers/conversationController.js:307-321`): loads participant active threads with `.select('inquirer owner messages.side lastMessageAt lastReadAt')` then reduces in JS. **Small but heavier than F1** (full thread-header scan per poll per user; cost grows with thread count, not message count).
- Underlying data change rate: notifications/messages arrive **a few times per day per user at most** (inquiry, reply, verification, EMI reminder via `node-cron` daily jobs) vs. polled **180+120 times/hr** — change-to-poll ratio is roughly **1:1,000+**. Classic wasteful-polling signature.

---

## Per-Flow Breakdown

### F1 — Notification badge (20s)

- **Classification:** Server-push-shaped (server creates the `Notification` via `notify()`; client just waits). One-way (server→client; mark-read/delete stay REST). Latency sensitivity: **medium** — a 0–20s stale bell (avg ~10s) delays discovery of inquiry replies, verification decisions, EMI/visit alerts; not data loss (list refetches on open) but erodes trust in "real-time" notifications.
- **Recommendation: Migrate to SSE.** One-way counter push needs no client→server messages; SSE is simpler than WS, works over plain HTTP/existing Express stack, and `EventSource` gives native auto-reconnect. Send `{type:"notifications.unread", unreadCount}` only when the count actually changes (hook the existing `notify()` call sites).
- **Impact:** eliminates ~180 req/hr/user (~100% of this endpoint's traffic). At 100 concurrent logged-in users: ~18,000 req/hr → ~100 SSE connections. Badge latency 0–20s → <1s push. Mobile: removes a 20s radio-wakeup cycle.
- **Complexity/risks (MERN-specific):** net-new infra (nothing to extend). `EventSource` cannot set `Authorization` headers — current auth is `Bearer` via axios interceptor (`frontend/src/utils/axios.js:7-14`, verified `backend/middleware/auth.js:8`) — so SSE needs token-in-query (`GET /api/events?token=...`, validate once at handshake, use short-lived token) or cookie. Reverse-proxy: `proxy_buffering off; X-Accel-Buffering: no`, heartbeat comments every ~25s, connection limits (~1 per user, fine). Rollout: keep 20s poll as fallback behind a flag until SSE proves stable.
- **Effort: Small.**

### F2 — Conversation badge (30s)

- **Classification:** Same as F1: server-push-shaped (server knows at `addMessage` time), one-way, **medium-high** staleness cost (stale "unread" dot misleads agents/users about waiting replies). Payload slightly heavier (thread-header scan) but still small.
- **Recommendation: Migrate to SSE on the SAME stream as F1.** Do not build two streams — one `GET /api/events` multiplexing `{type:"notifications.unread"}` and `{type:"conversations.unread"}` halves connection cost. Same justification as F1.
- **Impact:** eliminates ~120 req/hr/user; combined F1+F2 migration removes **~300 req/hr/user (~30k req/hr at 100 concurrent users)** replacing it with ~100 idle connections. Heaviest per-request winner (kills the per-poll thread scan). Latency 0–30s (avg ~15s) → <1s.
- **Complexity/risks:** identical to F1 (shared infra, shared auth/proxy notes). Marginal extra cost over F1 is just emitting a second event type from `addMessage`/`closeConversation`.
- **Effort: Small (incremental on F1).**

### F3 — Live thread delivery (the actual chat gap)

- **Classification:** **Bidirectional** (send message + receive counterparty messages + future typing indicators / read receipts) and **high frequency while a thread is open**. Latency sensitivity: **high** — currently unbounded staleness (minutes–hours until manual reload), the worst UX gap in the audit despite not being "polling."
- **Recommendation: Hybrid — WebSocket (Socket.IO) for live message delivery + REST for history.** Keep `GET /:id` (paginated history), `PATCH /:id/messages` (send, authoritative write), and `GET /my-conversations` (list) as REST; push `conversation.message` events over Socket.IO rooms (`room=conversation:<id>`, join on `openThread`, leave on close) for instant append. This is the standard MERN pattern the codebase's own comment anticipates ("without needing a websocket" — NotificationContext.jsx:13).
- **Impact:** latency unbounded → ~100–300ms; request volume impact is modest today (no poll to remove) but **prevents the naive fix** (e.g., 5s thread polling = 720 req/hr per open thread, far worse than F1+F2). Also unlocks typing indicators/read receipts later.
- **Complexity/risks:** the only **medium–large** item. Needs a WS layer (`socket.io` + `http.createServer(app)` in `server.js`, currently bare `app.listen`). Implications: sticky sessions or Redis adapter (`@socket.io/redis-adapter`) when scaling past one Node instance; JWT in `socket.handshake.auth` (not headers); re-auth on reconnect; room authorization must re-check participant-or-admin (mirror `getConversationById` logic); fallback to current manual-refetch behavior when socket drops. Rollout risk is contained by shipping F1/F2 SSE first and adding WS only for the thread view.
- **Effort: Medium–Large.**

### F4/F5 — Lists, history, detail pages (keep REST)

- **Justification:** client-pull-shaped (user opened a view / changed a filter / paginated), low frequency, payloads large and cacheable (30-item lists, full message histories with `populate`). Push would add connection cost with zero latency benefit. Simplicity wins; revisit only if dashboards add auto-refresh requirements.
- **Effort: — (no change).**

---

## Prioritized List

**Quick wins (do first, together):**

1. **F1+F2 → single SSE badge stream** (`GET /api/events`, emit on `notify()`/`addMessage`). Highest request-volume reduction per unit effort (~300 req/hr/user eliminated), small diff, incremental rollout with polling fallback. Fixes both badges' 10–15s average staleness in one change.

**Bigger architectural bets (after SSE lands):**

2. **F3 → Socket.IO hybrid for open threads.** Largest user-facing latency win (unbounded → sub-second) but requires net-new WS infra, scaling story (sticky sessions/Redis adapter), and handshake-auth work. Do not poll the thread as a stopgap — that would add more load than F1+F2 combined.

**Explicitly out of scope (confirmed, no action):** `node-cron` daily EMI/lead/archival/retention jobs (`backend/server.js:47-100`), Brevo HTTPS email (`backend/utils/sendEmail.js:28`), stubbed SMS — all backend-to-backend/provider, not client polling.

---

## Migration Notes (applicability to this stack)

- **No existing WS/SSE to extend** — `server.js` needs `http.createServer` + either an SSE route (F1/F2) or `socket.io` (F3); `frontend` needs `EventSource` / `socket.io-client` (both currently absent from `package.json`).
- **Auth:** REST uses `Bearer` per-request headers; SSE/EventSource and WS handshakes cannot — plan token-in-query (short-lived, validated at connect) or cookie migration, plus per-room authz checks mirroring `protect`/`authorize`.
- **Proxy/scale:** SSE requires buffering disabled and heartbeats; Socket.IO multi-instance requires stickiness or the Redis adapter. Both support incremental rollout: ship SSE with the 20s/30s `setInterval` retained as a disconnected-fallback, then add WS rooms behind the thread view only.

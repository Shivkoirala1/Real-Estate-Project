> **STATUS (2026-09-18): partially implemented — verify before acting.**
> B1 core trims landed and are enforced by `backend/tests/b1-contract.test.js` /
> `b1-matrix.js` (roster projection, `tempPassword` removal, notification
> no-populate, bounded sale/rental lead pop). B5 dead-code removal is **not**
> done (`propertyManagementRoutes` still mounted in `server.js:131`). B2/B4/B6
> status was not re-verified — treat their sections as proposal, not record.

## 1. Executive Summary

The audit is substantially accurate. Verification against `backend/controllers/*.js`, `backend/models/*.js`, `backend/server.js`, `backend/scripts/`, and `frontend/src/**` confirms:

- No DTO layer; Mongoose docs + `populate()` are the contract. One `lean()` (`emiPlanController.js:290`). `select()` never whitelists a list.
- 5 unscoped populates confirmed: `favorites` (auth+property), `contactForm.respond→user`, `sale/rental detail→lead`, `lead detail→conversationThreads→messages[]`. Plus `COMMISSION_POPULATE` missing `rental`.
- Highest-traffic over-fetch: `GET /api/properties` list (full docs × 12/page), `favorites`/`me.favorites`, raw `User` roster, `GET /api/visits` in-memory full-load, sale/rental full-lead detail.
- 4 confirmed exposures + 1 hygiene issue: raw Users, sale/rental full-lead, contact-respond full-User, `updateVisit` unsanitized echo, `tempPassword` in body (admin-only but logged).
- Good patterns to keep: `LEAD_POPULATE` selects, EMI `LIST vs DETAIL_POPULATE` + `sanitizeForAgent` + `eligible-sales` lean DTO, `sanitizeVisitForViewer`, `maskOwnerIdentity`, `select(-data)` archives, dashboard/analytics aggregates, existing `pagination/countsByStatus/summary/metrics`.

Working decisions from the prompt are adopted as product rules (see §2). The plan is organized B1–B6, security-first, additive-before-removal, lockstep only where the frontend reads the removed path.

---

## 2. Confirmed Open-Question Decisions

| # | Decision | Implementation consequence |
|---|---|---|
| 1 | Anonymous/public buyers get NO commission figures (`effectiveCommissionPercentage`, `estimatedCommissionAmount`) | Formalize existing `applyCommissionVisibility` (`propertyController.js:50`) as rule: public list strips both + `commissionPercentage` + `propertyType.defaultCommissionPercentage`. Only `agent/admin` receive computed fields. `PropertyCard.jsx` conditional block already null-guarded — safe. |
| 2 | No `listedBy.email/phone` on public property **list** | List populates `listedBy{name}` (+`_id` implicit) only. Detail keeps `listedBy{name,email,phone,selfiePhoto,verificationStatus,createdAt}` with documented gate (owner/agent/admin/authenticated-contact — product default: authenticated detail may show contact, anonymous detail shows `name/selfie/verification/createdAt` only; final gate is B4 task). |
| 3 | Keep `GET /agents` for assignment dropdowns, minimal roster projection | Default assignment shape `{_id,name}` (+`email` only if proven). Full `toSafeObject+performance` moves to `GET /agents/:id` / admin view. Consumers verified: `LeadList/LeadDetail/LeadDashboard/ManageVisits/Visits/ConvertToLeadModal/ManagementDashboard/AssignAgentModal` all read only `_id,name`. |
| 4 | No plaintext `tempPassword` in API response | B1: `POST /api/users/:id/reset-password` returns `{success,message}` only. Replace with single-use reset token/link, expiry, `AuditLog` retained. `ManageUsers.jsx:86` toast must migrate to "reset link sent" flow. Do not redesign login/session. |
| 5 | Prefer unified commission `source{kind,ref}` but do not force breaking migration | B4: first add additive `rental{_id,...}` populate symmetric to `sale`. Then evaluate `source` discriminator behind additive alias. If migration risk outweighs benefit, keep `sale/rental` pair + document. No silent shape change. |
| 6 | Verify scripts/jobs/ETL before removing any field | `backend/scripts/` = only `check-notification-types.js`. Cron = EMI reminders + archival/retention (no contract reads). `utils/seeder.js`, `utils/migrate*.js`, `utils/reportGenerator` (analytics CSV/PDF) must be grep-checked in B1. Legacy `inquiryService` is NOT dead (see §12). Absence of React usage ≠ safe removal. |

---

## 3. Verified Current Architecture

Confirmed from code (no structural change proposed):

- `routes/*.js → controllers/*.js → models/*.js`, `asyncHandler`, inline `authorize/requireVerified/canManage` gates. No service layer — preserved.
- Auth: `protect`/`optionalAuth` load full `User.findById` (no select) on every request (`middleware/auth.js:5-60`); `authorize`, `requireVerified` (admin bypass). `optionalAuth` on `GET /api/properties`, contact-form create.
- Response: inline `res.json({success:true,...})` except blogs (`{message,blog}`, `{blogs,pagination}`, bare `blog`). No shared `sendSuccess`/DTO except `User.toSafeObject()` (strips only `password`).
- Population is shaping; `select()` only for lookups/dashboard recents/`unread-count`; `lean()` once (eligible-sales).
- Frontend: JSX only, `utils/axios.js` singleton, 21 per-module `services/*.js`, `useState/useEffect` + `Auth/Notification/Conversation/Lead/Toast` contexts. No Query/Redux. Direct `api.*` outside services limited to: `ConversationContext` unread-count, `Profile` phone-OTP, `Commissions/MyCommissions/AgentDashboard` commissions reads.
- **Discrepancies vs audit (verified):**
  1. `ManageProperties.jsx` does NOT read commission fields — only `PropertyCard.jsx` does. Audit §4 wording conflated card vs admin table.
  2. `CreateLeadModal.jsx:28` calls `getUsers({role:'admin'})`, not agent roster. `RevampedInquiries.jsx:338` calls `getUsers({role:'admin'})`. Agent-roster claim for those two is wrong.
  3. `MyAssignedVisits.jsx` is a 0-byte empty file — dead route; real agent view is `VisitManagement.jsx`.
  4. `inquiryService.js` (`/inquiries*`) is NOT dead — imported by `Inquiries.jsx` + `RevampedInquiries.jsx`. `routes/inquiryRoutes.js` (empty placeholder at `/api`) is dead, but the legacy UI + service are live against a removed/legacy path — needs B5 trace, not blind delete.
  5. `GET /api/conversations` (admin-only) correctly skips masking; `my-conversations`/detail mask. Not an inconsistency.
  6. `sanitizeVisitForViewer` strips only `internalNotes`; `requestedBy` contact remains — buyer projection must additionally drop `requestedBy/convertedLead`.
  7. `lead.visit{requestedSlot,status}` and `lead.user{name,_id}` ARE read in `LeadDetail.jsx` — list trim must keep `_id` links; detail keeps selected populate.

---

## 4. Contract Change Inventory

| Module | Endpoint | Current issue | Target design | Risk | Batch |
|---|---|---|---|---|---|
| Users | `GET /api/users`, `/:id`, `/verifications/pending` | Raw User (ID photos, xp/ycCoin, referral, favorites) | Roster DTO (8 fields); verification-detail DTO (+photos/note); self stays `toSafe` | Potentially breaking (hidden admin tooling) | B1 |
| Users | `POST /api/users/:id/reset-password` | `tempPassword` plaintext in body | `{success,message}` + single-use token/link | Potentially breaking (toast reads `tempPassword`) | B1 |
| Sales | `GET /api/sales/:id` | `populate('lead')` no select (notes/activities/contact) | `lead{_id,name,email,phone,stage,assignedAgent{name}}` | Potentially breaking | B1/B3 |
| Rentals | `GET /api/rentals/:id` | Same as sales | Same selected lead | Potentially breaking | B1/B3 |
| ContactForms | `PATCH /api/contact-forms/:id/respond` | `populate('user')` full-User | `select('name email')` or drop populate | Non-breaking | B1 |
| Visits | `PATCH /api/visits/:id` | Raw echo bypasses sanitizer | Apply `sanitizeVisitForViewer(req.user)` | Non-breaking (removes field from wrong role only) | B1 |
| Properties | `GET /api/properties` | Full docs + `listedBy{email,phone}` + commission to anon | Card DTO; `listedBy{_id,name}`; commission agent/admin only | Potentially breaking | B2 |
| Properties | `GET /api/properties/my/favorites`, `GET /api/auth/me` | Full Property docs in favorites + session | Favorites → card DTO; `me` → `favoriteIds`/`favoritesCount` | Definitely breaking for `me.favorites[0].title` readers | B2 |
| Sales | `GET /api/sales` | Full docs + `lead{name,email,phone}` + `buyer.user` obj + activities | Trimmed list (no lead obj, `buyer{registered}`, no activities/remarks) | Potentially breaking | B2 |
| Rentals | `GET /api/rentals` | Same | Symmetric trimmed list | Potentially breaking | B2 |
| Leads | `GET /api/leads`, `/my-leads`, `/by-stage/:stage` | 5 populates; `contactForm/visit/user` unread in tables | Base + `property+assignedAgent` only; others → `_id` | Potentially breaking | B2 |
| Visits | `GET /api/visits` | In-memory full-load + uniform rich shape | DB `sort/skip/limit/count` + buyer-minimal vs staff-full | Definitely breaking (pagination + fields) | B2 |
| Notifications | `GET /api/notifications` | `property{title,slug,coverImage}` never rendered, 20s poll | 7 scalars `{_id,type,title,message,link,isRead,createdAt}` | Non-breaking (verified no renderer) | B2 |
| Commissions | `GET /api/commissions` | `sale{agreedPrice,paymentType}` unread; `rental` bare ObjectId | Drop `sale{}` subfields (B2/B4); add `rental{_id}` additive (B4) | Non-breaking if additive | B2+B4 |
| Leads | `GET /api/leads/:id` | Full `conversationThreads[].messages[]` | Thread summaries `[{_id,property{title},lastMessageAt,isActive}]`; messages via conversations | Definitely breaking | B3 |
| EMI | `GET /api/emi-plans` | Full `installments[].verification{slipUrl,notes}` in list | List `installments[{n,dueDate,status,verification:{status}}]` + computeds | Potentially breaking | B3 |
| Visits | `GET /api/visits/my-visits`, `/:id` | Buyer sees `requestedBy/convertedLead` shape | Buyer-minimal (7 fields); staff-full documented | Potentially breaking | B3 |
| Blogs | All `/api/blogs*` | Bare doc / `{message,blog}` / no `success` | Additive `{success:true,blog\|blogs}`; keep keys | Potentially breaking (strict parsers) | B4 |
| Commissions | `GET /api/commissions` rental | Missing populate | Additive `rental{_id,monthlyRent?,durationInMonths?}` → evaluate `source{kind,ref}` | Non-breaking | B4 |
| Conversations | `GET /api/conversations` | Dead `$or name regex` on ObjectIds; client-side filter | Server `?search=&page&limit` via `$lookup` or documented removal | Potentially breaking | B4 |
| Envelope | Properties `{total,page,pages}` vs `{pagination}` | Key drift | Additive alias first; removal in B6 | Potentially breaking if renamed silently | B4→B6 |
| Dead code | `propertyManagement*`, `siteVisitRoutes`, `inquiry*` | Unmounted/broken/legacy | Verify then isolated delete | Non-breaking if verified | B5 |
| Envelope | Legacy key removal | — | Remove legacy keys after migration | Definitely breaking | B6 |

---

## 5. Dependency Graph / Recommended Batch Order

```text
B1 (security/exposure) ──→ B2 (list diets) ──→ B3 (detail trims) ──→ B4 (normalization) ──→ B6 (legacy-key removal)
  │                          │                     │                      │
  │                          └─ visits pagination ─┘                      └─ needs B2+B3 frontend migrated
  └─ tempPassword isolated, no dependency ─→ can ship alone

B5 (dead-code delete) — independent, runs LAST, isolated commit. Requires B1 script/ETL grep first.
```

Audit order is retained with two refinements: (a) `updateVisit` sanitizer + contact-respond select move into B1 (one-line, zero-dependency); (b) visits DB-pagination is B2 (blocks all visit dashboards) while buyer/staff projection split is B3 (needs B2 pagination stable first). Commission `rental` populate is B4 (additive, no dependency on B2 trim).

---

## 6. Detailed Batch Plans

### B1 — Security / exposure

**1. Objective:** Close confirmed field-exposure without changing list weight or envelopes.

**2. Backend scope:** `controllers/userController.js:19-172,99-143`, `models/User.js:185-190`, `controllers/saleController.js:323-360`, `controllers/rentalController.js:294-330`, `controllers/contactFormController.js:276-...`, `controllers/visitController.js:397-400,87-92`, `middleware/auth.js` (no change, reference), `models/AuditLog.js` (retain write).

**3. Frontend scope:** `ManageUsers.jsx`, `VerifyUsers.jsx`, `VerificationQueue.jsx`, `MySales.jsx` (DealDetailModal), `RespondToContactModal.jsx`, `ManageVisits.jsx`/`VisitManagement.jsx`, `ManageUsers.jsx:86` reset toast.

**4. Current contract:** Roster/detail/verification-pending return raw `User.find()` (ID photos, xp/ycCoin, referral, favorites, loginStreak). Sale/rental detail embeds full `lead`. Respond embeds full `user`. `updateVisit` echoes `internalNotes` to any caller. Reset returns `{success,message,tempPassword}` (`crypto.randomBytes(4).hex`).

**5. Target contract:**

```json
// GET /api/users → roster
{"success":true,"count":1,"users":[{"_id":"...","name":"...","email":"...","phone":"...","role":"agent","verificationStatus":"verified","isActive":true,"createdAt":"..."}]}
// GET /api/users/verifications/pending → roster + {"selfiePhoto":"...","citizenshipPhotoFront":"...","citizenshipPhotoBack":"...","verificationNote":"..."}
// GET /api/sales/:id → {"success":true,"sale":{..., "lead":{"_id":"...","name":"...","email":"...","phone":"...","stage":"...","assignedAgent":{"_id":"...","name":"..."}}}}
{"success":true,"message":"Password reset initiated"}
```

**6. Query/population:** `User.find(...).select('_id name email phone role verificationStatus isActive createdAt')` (+ photos/note only on verification route); `populate('lead','_id name email phone stage assignedAgent')` + nested `populate('lead.assignedAgent','_id name')`; contact-respond `select('name email')` or drop populate and use scalar `contactForm.email`; `updateVisit` → `sanitizeVisitForViewer(visit, req.user)` before `res.json`. No `lean()` — docs are mutated/saved; hydration needed.

**7. Auth/security:** Row auth unchanged (admin-only users/reset; sale/rental gate `canManage`-equivalent; visits admin/agent). Column change: roster strips ID docs from non-verification callers; verification photos stay admin-only; lead notes/activities never leave lead workspace; `internalNotes` staff-only. Distinguish row (who sees the row) from field (which keys).

**8. Frontend migration:** ManageUsers/VerifyUsers read only allow-listed fields — no change except verify no `u.xp/u.referralCode/u.favorites` reads (none found). Reset toast `data.tempPassword` → "reset link sent / check secure channel". Sale modal: replace any `sale.lead.notes` (none found) with link to lead workspace.

**9. Breaking:** Potentially breaking (admin tooling/scripts may read `xp/referral`; `tempPassword` reader breaks by design). All else non-breaking (removes unread paths).

**10. Migration:** Lockstep per endpoint (backend+frontend same release). tempPassword behind flag/isolated PR. Rollback = restore populate/select (frontend tolerates extras).

**11. Tests:** Role-matrix: anon/buyer/agent/admin × each endpoint assert `not.toHaveProperty('selfiePhoto'|'citizenshipPhotoFront'|'notes'|'activities'|'internalNotes'|'tempPassword')`; verification-queue approve/reject E2E; contact-reply delivery; visit edit as agent vs buyer view.

### B2 — High-impact list response trimming

**1. Objective:** Cut payload × traffic on most-hit lists; fix visits pagination perf bug.

**2. Backend:** `propertyController.js:70-146,532+`, `authController.js:361+`, `saleController.js:219-315`, `rentalController.js:221-...`, `leadController.js:195-342`, `notificationController.js:7-30`, `commissionController.js:59-98`, `visitController.js:242-320`.

**3. Frontend:** `Home.jsx`, `PropertyListing.jsx` (+`SearchFilterBar`), `PropertyCard.jsx`, `Favorites.jsx`, `Profile.jsx`, `AuthContext.jsx`, `ManageProperties.jsx`, `VerificationQueue.jsx`, `MySales.jsx`, `LeadList/Kanban/MyLeads/AgentDashboard`, `NotificationContext/Bell/Notifications.jsx`, `Commissions/MyCommissions`, visit dashboards.

**4. Current:** Full docs everywhere; properties `{success,count,total,page,pages,properties[]}`; sales/rentals `{success,count,sales|rentals[],pagination,countsByStatus}` + `lead` obj + `buyer.user` obj + activities; leads 5-pop; visits in-memory sort+slice when no `?status`; notifications + property pop on 20s poll.

**5. Target:** Property card DTO (~12 scalars + `propertyType{name}` + `city/district{name}` + `municipality`):

```json
{
  "success": true, "count": 12, "total": 120, "page": 1, "pages": 10,
  "properties": [
    { "_id": "...", "slug": "...", "title": "...", "price": 0, "currency": "NPR",
      "negotiable": false, "status": "available", "saleType": "sale",
      "media": { "coverImage": "..." },
      "location": { "city": { "_id": "...", "name": "..." }, "district": { "_id": "...", "name": "..." }, "municipality": "..." },
      "details": { "bedrooms": 3, "bathrooms": 2, "landArea": 0, "landAreaUnit": "..." },
      "propertyType": { "_id": "...", "name": "..." } }
  ]
}
```

Favorites same card DTO; `me` → `{..., favoriteIds:[], favoritesCount:n}` (keep `favorites` one release with deprecation, then remove); sales/rentals list `{_id,status,property{_id,title,slug,price,status,media{coverImage}},agent{_id,name},buyer|tenant{name,phone,email,registered},agreedPrice|monthlyRent(+durationInMonths,securityDeposit),submittedAt,reviewedBy{name}?,reviewedAt?}`; leads list base + `property+assignedAgent` only; notifications 7 scalars; visits DB pagination `{success,count,pagination,visits[]}`.

**6. Query/population:** Add `select()` whitelists per list (copy `similarProperties` select + `select(-data)` archives pattern as template); `listedBy` list → `select('_id name')`; drop `notifications→property` populate; drop `sale{agreedPrice,paymentType}` from commission list OR document; visits: replace full-load branch with `sort/skip/limit+countDocuments` for all branches. `lean()` not required (virtuals/getters in use); use only where `eligible-sales` pattern proves safe (pickers). Computed `countsByStatus/countsByStage/totals/summary/registered/nextDue/outstanding/overdueCount` stay server-computed.

**7. Auth/security:** Commission stripping (B1 rule) enforced in list mapper; `listedBy` contact stripped for all list roles; visits agent force-scope `assignedAgent/query.agent` retained; notifications `recipient=` retained.

**8. Frontend migration:** PropertyCard: remove commission block for anon (already guarded; make role-aware via `AuthContext`). ManageProperties: fix `p.listedBy._id` unsafe access → `p.listedBy?._id` (currently crashes if unpopulated — required before trimming). Favorites → list endpoint; Profile → count. Queues: `normalize()` drops `lead`/`buyer.user` paths → use `registered` boolean + `_id` links. Bell/list: drop `notification.property` (none read). Commission tables: no change (never read `sale{}`).

**9. Breaking:** Medium-high; visits pagination + `me.favorites` shape are definitely breaking; rest potentially breaking.

**10. Migration:** Backend-first safe where new shape is strict subset (frontend ignores extras) — EXCEPT `me.favorites`, visits pagination, envelope keys → lockstep. Keep `_id/slug` stable. Single-app lockstep preferred.

**11. Tests:** Contract snapshot (list keys ⊆ allow-list); pagination (`page/limit/total/totalPages` consistency); filter/sort parity (server `sort` vs old client sort in `ManageProperties` user branch, `AgentDashboard:61-72` slice); payload-size budgets/Lighthouse; queue tab counters; bell 20s poll regression.

### B3 — Detail response trimming

**1. Objective:** Bound detail payloads; break workspace-coupling (sale↔lead, lead↔messages, EMI list↔slips).

**2. Backend:** `saleController.js:323-360`, `rentalController.js:294-330`, `leadController.js:360-397`, `emiPlanController.js:344-493,496+`, `visitController.js:332-386` (`my-visits`, `:id`).

**3. Frontend:** `MySales` DealDetailModal, `EmiPlans` InitEmiModal/SalePicker, `LeadDetail/LeadConversationThread/LeadActivityTimeline`, `EmiPlanDetail/EMISales/MyEMI`, `MyVisits/ManageVisits`.

**4. Current:** Sale/rental detail = full lead; lead detail = full `conversationThreads[].messages[]`; EMI list = full `verification{slipUrl,notes}` per installment; visits buyer gets staff shape.

**5. Target:** Sale/rental detail = B1 selected lead + `remarks/activities/rejectionReason` (stays). Lead detail threads → `[{_id,property{title},lastMessageAt,isActive}]`; messages via `GET /api/conversations/:id`. EMI list `installments[{installmentNumber,dueDate,status,verification:{status}}]` + `nextDue/outstanding/overdueCount/totalPaid`; detail keeps full `DETAIL_POPULATE` + slips/notes + `canManage`. Visits buyer `{_id,visitType,property{_id,title,slug,coverImage},requestedSlot,status,assignedAgent{name,phone},buyerNotes}`; staff adds `requestedBy{name,phone},internalNotes,convertedLead{_id,stage}`.

**6. Query/population:** Threaded populate → two-level select only for summaries; EMI list mapper (reuse `sanitizeForAgent` + eligible-sales lean idiom); visit branch on `req.user.role` + existing sanitizer. No new routes.

**7. Auth/security:** Lead messages gated by conversation participation (not lead gate alone); EMI slips admin/buyer-owner only (agent schedule-only proven by `EMISales.jsx`); visit `internalNotes` staff-only.

**8. Frontend migration:** `LeadDetail:253-256` `lead.visit.requestedSlot|status` → keep `_id` link + fetch if needed; `lead.user.name/_id` (thread-start gate) → detail must retain `user{_id,name}` select; `LeadConversationThread` already re-fetches — switch to conversation endpoint explicitly. EMI tables: verify no tooltip reads `slipUrl/notes` (only `EmiPlanDetail` preview does). MySales modal: link to lead workspace instead of inline notes.

**9. Breaking:** Medium; thread `messages[]` removal definitely breaking for any direct reader (only separate thread component reads — safe with migration).

**10. Migration:** Lockstep per resource (detail + its modal together). Rollback = restore populate.

**11. Tests:** Modal E2E (sale→EMI init, visit→lead convert); thread open/scroll/send/pagination; EMI verification multipart + progress math; `canManage` gates; slip-URL-in-detail-only assertion.

### B4 — Contract normalization

**1. Objective:** Fix envelopes + missing `rental` + dead search without renaming keys silently.

**2. Backend:** `blogController.js:7-296`, `commissionController.js:43`, `conversationController.js:187-220`, envelope keys (`propertyController` `total/page/pages` vs `pagination`).

**3. Frontend:** `BlogList/BlogDetail/ManageBlogs/BlogForm/Blog.jsx`, `Commissions` tables, `Conversations.jsx:207-215` search.

**4. Current:** Blogs bare/`{message}`; commission rental bare ObjectId; conversation search `$or` on names (dead on ObjectIds) + client filter; envelope drift.

**5. Target:** `{success:true,blog}` / `{success:true,blogs,pagination}` (additive `success`, keep `blog(s)` keys); `+rental{_id,monthlyRent?,durationInMonths?}` additive, then evaluate `source{kind:'sale'|'rental',ref}` behind alias; conversations server `?search=&page&limit` via `$lookup` on populated names or documented removal + server pagination; envelope: add `pagination` alias alongside `total/page/pages` first.

**6. Query/population:** Additive populate only; search rewrite isolated; no `lean()` mandate.

**7. Auth/security:** Blog draft preview (`verifyToken` path) unchanged; rental populate respects existing commission row scope (admin all / agent self).

**8. Frontend migration:** Blog readers accept both (`data.blog ?? data`, `data.blogs ?? data.data`) first, then backend adds `success`. Conversations: remove client filter after server search lands.

**9. Breaking:** Low if additive; envelope renames deferred to B6.

**10. Migration:** Additive → migrate → remove (B6). Rental-commission fixture: create rental→verify→assert populated.

**11. Tests:** Envelope assertions; search parity; rental-commission populate test; public slug SEO + admin draft preview; unread-count stability.

### B5 — Dead-code cleanup (verify, then delete)

**1. Objective:** Remove unreachable code only after proof of no consumers.

**2. Backend scope:** `routes/propertyManagementRoutes.js` + `controllers/propertyManagementController.js` (884 lines, never mounted — confirmed dead); `routes/siteVisitRoutes.js` (requires nonexistent `siteVisitController.js`, never mounted — dead/broken); `routes/inquiryRoutes.js` (empty placeholder, mounted at `/api` — harmless); `controllers/inquiryController.js`, `models/PropertyManagementRequest.js`, legacy `Inquiry` refs in `Notification.js` (`inquiry` field).

**3. Frontend scope:** `services/inquiryService.js`, `Inquiries.jsx`, `RevampedInquiries.jsx`, `PropertyManagement/ManagementDashboard.jsx`, `AssignAgentModal.jsx`, `visitService.js:140` dead `getAgents` export (`GET /users/agents`).

**4. Current:** Unmounted/broken/legacy files coexist with live legacy UI (`inquiryService` + 2 pages hitting `/inquiries*`).

**5. Target:** Deleted dead files + documented decision on legacy inquiry UI (migrate to contact-form/conversation routes or retain with mounted compat route).

**6. Query/population:** n/a.

**7. Auth/security:** Ensure no auth-gated dead route becomes reachable by accident during cleanup.

**8. Frontend migration:** Caution — `inquiryService` is LIVE (2 importers). Trace whether `/inquiries*` 404s before deleting anything.

**9. Breaking:** Non-breaking if verified; rollback = git revert.

**10. Migration:** Isolated delete commit after B1–B4 + `grep -r propertyManagement|siteVisit|/inquiries` + `grep app.use` + `backend/scripts/` + `vercel.json`/proxy check. Never mix with shape changes.

**11. Tests:** Route-list snapshot boot test + frontend build + grep-zero verification.

### B6 — Legacy response-key removal

**1. Objective:** Remove deprecated keys only after migration verified.

**2. Scope:** `me.favorites` full docs (keep `favoriteIds/count`), legacy `total/page/pages` if `pagination` adopted, deprecated `sale{agreedPrice,paymentType}` subfields if dropped, bare-doc blog compat.

**3–11. (per-batch fields):** Consumers = all migrated B2–B4 readers. Strategy: codemod + full regression + release note. Breaking by definition. Rollback = revert. Deploy last.

---

## 7. Endpoint-Level Target Contract Matrix

| Method | Endpoint | Auth/Role | Representation | Key fields | Population | Pagination | Breaking risk |
|---|---|---|---|---|---|---|---|
| GET | `/api/properties` | public/anon→admin (`optionalAuth`) | list-card | 12 card fields + `_id/slug`; commission agent/admin only | `propertyType{name},city{name},district{name},listedBy{_id,name}` | `{count,total,page,pages}` (+`pagination` alias B4) | Potentially |
| GET | `/api/properties/:id` | public/optional | detail-full | full doc + `similar[4 minimal]`; contact gated | `+listedBy{name,email?,phone?,selfie,verification,createdAt}` | n/a | Non |
| GET | `/api/properties/my/favorites` | buyer+ | list-card | card DTO | same as list | `{count}` | Potentially |
| GET | `/api/auth/me` | any authed | session | `toSafe + favoriteIds + favoritesCount` | `favorites:_id` only | n/a | Definitely |
| GET | `/api/users` | admin | roster | 8 roster fields | none | `{count}` | Potentially |
| GET | `/api/users/verifications/pending` | admin | verification-detail | roster + photos + note | none | `{count}` | Potentially |
| POST | `/api/users/:id/reset-password` | admin | message-only | `{success,message}` | n/a | n/a | Potentially |
| GET | `/api/sales` | agent(own)/admin | queue-row | trimmed; `lead:_id`; `buyer{registered}` | `property{min},agent{name},reviewedBy{name}` | `{pagination,countsByStatus}` | Potentially |
| GET | `/api/sales/:id` | filing/lead-agent/admin | detail | + selected lead + remarks/activities | `lead{selected}` | n/a | Potentially |
| GET | `/api/rentals*` | same | symmetric to sales | `tenant{registered}`, `monthlyRent/duration/securityDeposit` | same | same | Potentially |
| GET | `/api/leads*` (3 lists) | agent(scoped)/admin | table-row | base + `property+assignedAgent`; others `_id` | 2-pop | `{pagination[,countsByStage]}` | Potentially |
| GET | `/api/leads/:id` | `canManage` | workspace | full base + 5-pop selected + thread summaries | no `messages[]` | n/a | Definitely |
| GET | `/api/visits` | agent/admin | staff-list | staff-full | 4-pop trimmed | DB `{pagination}` (fix) | Definitely |
| GET | `/api/visits/my-visits` | buyer | buyer-list | buyer-minimal (7) | `property{min},assignedAgent{name,phone}` | DB `{pagination}` | Potentially |
| PATCH | `/api/visits/:id` | agent/admin | sanitized echo | `sanitizeVisitForViewer` | same | n/a | Non |
| GET | `/api/emi-plans` | admin/agent/user(scoped) | schedule-row | trimmed installments + computeds; agent sanitized | `LIST_POPULATE` | `{pagination,summary}` | Potentially |
| GET | `/api/emi-plans/:id` | gated | detail-full | full + slips/notes + `canManage` | `DETAIL_POPULATE` | n/a | Non |
| GET | `/api/commissions` | agent(self)/admin | ledger-row | amounts + `property+agent`; `+rental` (B4) | 3-pop (+rental) | `{pagination,totals}` | Non |
| GET | `/api/notifications` | owner | inbox-row | 7 scalars | none | `{pagination,unreadCount}` | Non |
| GET | `/api/conversations*` | participant/admin | header/thread | keep + masked; server search (B4) | minimal + `messages.sender{name}` | `{pagination}` (+server search) | Potentially |
| * | `/api/blogs*` | mixed | same weight + envelope | unchanged fields + `success` | `author{name(,email admin)}` | `{pagination}` | Potentially |
| GET | `/api/agents` | agent/admin | assignment-roster | `{_id,name[,email]}` + `pagination` | none (drop performance in list) | `{pagination}` | Potentially |
| GET | `/api/agents/:id` | admin | performance-detail | `toSafe-selected + performance` | aggregates | n/a | Non |

Unlisted endpoints (reviews, rewards, categories, dashboard, analytics, archives, contact-forms list/detail, auth login/register) keep current shapes — all appropriate.

---

## 8. Frontend Migration Matrix

| Endpoint | Consumer | Current dependency | Required change | Batch |
|---|---|---|---|---|
| `GET /properties` | `PropertyCard.jsx` | `effectiveCommissionPercentage/estimatedCommissionAmount` | Role-aware render (anon hides); null-guards retained | B2 |
| `GET /properties` | `ManageProperties.jsx` | `p.listedBy._id` unsafe, `description` client filter | `?.` fix (pre-req); move filter to server `?keyword` | B2 |
| `GET /properties` | `Home/Listing/Favorites` | `properties/total/pages/page` passthrough | No change (subset-safe) | B2 |
| `GET /auth/me` | `AuthContext/Profile` | `favorites[].length`, session user | Switch to `favoriteIds/count` + `/my/favorites` for cards | B2 |
| `GET /sales\|rentals` | `VerificationQueue.normalize` | `lead{name,email,phone}`, `buyer.user{name}` | Use `lead:_id` link + `buyer{registered}` | B2 |
| `GET /sales/:id` | `MySales` modal, `EmiPlans` InitEmi | `buyer/property/agent` scalars | Link to lead workspace for notes (none inline today) | B3 |
| `GET /leads` lists | `LeadList/Kanban/MyLeads/AgentDashboard` | `property.title, assignedAgent._id/name` | No change; drop `contactForm/visit/user` objs (unread) | B2 |
| `GET /leads/:id` | `LeadDetail/Thread` | `visit{requestedSlot,status}`, `user{name,_id}`, `contactForm._id`, `threads[].messages` | Keep selected `visit/user` in detail; threads→summaries + conversation fetch | B3 |
| `GET /visits*` | `ManageVisits/VisitManagement/MyVisits` | buyer/staff field sets | Buyer drops `requestedBy/internalNotes/convertedLead`; staff keeps | B2+B3 |
| `GET /notifications` | `Context/Bell/page` | `title/message/type/link/isRead` | Drop `property` (unread) — no change | B2 |
| `GET /commissions` | `Commissions/MyCommissions` | amounts + `property/agent` | No change; ignore added `rental` until UI needs it | B2+B4 |
| `GET /emi-plans` | `EmiPlans/EMISales/MyEMI` tables | `verification.status` counts only | No change; slips stay detail-only | B3 |
| `*blogs*` | `Blog*/ManageBlogs/BlogForm` | `data` vs `data.blog(s)` | Accept both during B4 | B4 |
| `GET /agents` | 7 roster consumers | `a._id/name` only | No change; `Commissions.jsx` migrates `GET /users?role=agent` → `GET /agents` roster | B2/B4 |
| `POST users/:id/reset-password` | `ManageUsers.jsx:86` | `data.tempPassword` toast | "Reset link sent" flow | B1 |
| `PATCH contact-forms/:id/respond` | `RespondToContactModal` | `contactForm` fields only | No change | B1 |

---

## 9. Security / Authorization Matrix

| Endpoint | Public | Buyer | Agent | Admin | Sensitive fields |
|---|---|---|---|---|---|
| `GET /properties` | card, no commission/contact | card, no commission (verify: teaser vs nothing) | card + commission | card + commission | `commission*, listedBy.email/phone` stripped in list |
| `GET /properties/:id` | full minus contact (default) | full; contact per B4 gate | full + commission | full | `listedBy.phone/email` gated |
| `GET /users*` | — | — | — | roster / verification-detail only | ID photos, gamification, referral, favorites stripped from roster |
| `reset-password` | — | — | — | message-only + token/link | no secret in body |
| `GET /sales\|rentals` | — | — | own rows, trimmed | all rows, trimmed | `lead` obj → `_id`; notes/activities stay in lead workspace |
| `GET /leads*` | — | — | assigned rows | all rows | row scope, single shape |
| `GET /visits*` | — | own, minimal, no `internalNotes` | assigned + staff fields | all + staff fields | `internalNotes/requestedBy/convertedLead` staff-only |
| `GET /emi-plans*` | — | own amounts+slips | schedule-only (`sanitizeForAgent`) | full | money/slips gated |
| `GET /commissions*` | — | — | self (+summary) | all + `agent` col | amounts scoped |
| `GET /conversations*` | — | masked participant | masked participant | full + `sender` | `maskOwnerIdentity` retained |
| `GET /notifications` | — | own 7 scalars | own 7 scalars | own 7 scalars | `recipient=` enforced |

Row authorization (which rows) is unchanged everywhere; B1–B3 change only field projection (which keys), except visits pagination (perf fix, same rows).

---

## 10. Testing Strategy

- **Unit/controller:** `applyCommissionVisibility` role matrix; `sanitizeVisitForViewer` (buyer strips, admin/assigned-agent keeps); `sanitizeForAgent` money-strip; `maskOwnerIdentity` sender-strip; `toSafeObject` never leaks `password`.
- **API contract:** allow-list snapshot per list (`expect(keys).subsetOf(allowList)`); `me` has `favoriteIds` not full docs; sale/rental detail `lead` has no `notes/activities`; lead detail has no `messages[]`; EMI list installments have only `{n,dueDate,status,verification:{status}}`; notifications have no `property`; blogs have `success`.
- **Authorization/security:** anon/buyer/agent/admin × properties (commission/contact absent/present), users roster (no photos), verification queue (photos present for admin), visits (`internalNotes` absent for buyer incl. `updateVisit`), reset (no `tempPassword`), rental-commission populated for both kinds.
- **Integration/regression:** verification-queue approve/reject + commission creation (incl. manual rental amount + `leaseValue` math); EMI init picker (`eligible-sales` gate `verified+emi`); visit→lead convert; contact respond→lead convert; conversation thread send/close/reopen + unread counts; 20s/30s poll stability.
- **Frontend regression:** card/list/favorites render with trimmed payloads; `ManageProperties` with `listedBy=null`; kanban drag-stage counts; `AgentDashboard` urgent-5 after server pagination; `EmiPlanDetail` slip preview (detail-only); blog slug/draft-preview; `ManageUsers` reset toast new flow.

---

## 11. Migration / Deployment Strategy

- **Lockstep (backend+frontend same release):** `me.favorites`, visits pagination + buyer/staff split, lead threads→summaries, EMI list trim, blog envelope, `tempPassword` removal, user roster select. Reason: frontend reads the exact removed path or shape.
- **Backend-first safe:** property list card DTO (frontend ignores extras — but ship `ManageProperties ?. ` fix first), sales/rentals list trim, notifications drop-populate, contact-respond select, `updateVisit` sanitizer, additive `rental` populate + `success` alias + `pagination` alias.
- **Additive → migrate → remove:** blogs (`success` added, readers accept both, then require); `me` (`favoriteIds` added alongside `favorites` + deprecation, then remove); envelope keys (`pagination` alongside `total/page/pages`, removal in B6); commission `source` (if adopted: `source` alongside `sale/rental`, then deprecate).
- **Isolated:** B5 deletes (own commit after grep + boot + build); tempPassword flow (own PR behind product sign-off). Never mix shape changes with deletes.
- **Rollback:** restore `select/populate` (frontend tolerates extras); thread/EMI rollback = restore populate/mapper. No DB migration in any batch (projection-only; `source` discriminator, if pursued, needs separate data-migration plan — explicitly out of scope here).

---

## 12. Remaining Unknowns

1. Property-detail `listedBy.phone/email` gate for anonymous vs authenticated non-owner (product/legal sign-off needed; code currently sends to all detail callers).
2. Whether buyers see a commission teaser vs nothing on cards (cards currently render figures when present; B1 strips for anon — confirm no sales-copy dependency).
3. Whether agent-visible `GET /agents` roster needs `email` (all verified dropdowns need only `_id,name`; `Commissions.jsx` filter uses `GET /users?role=agent` — confirm canonical roster endpoint before migrating).
4. Reset delivery channel (email/SMS/admin-handoff) and token TTL — determines B1 reset-link implementation; existing `AuditLog` write retained regardless.
5. Unified commission `source{kind,ref}` vs symmetric `sale/rental` pair — pending inspection of analytics/report-generator (`utils/reportGenerator`) and any ETL reads of `commission.sale.*`.
6. `backend/utils/seeder.js` / `migrate*.js` / analytics export field reliance on full User/Sale shapes — requires `grep` in B1 before roster/list selects ship.

No other unknowns — everything else is resolved from audit + code.

---

## 13. Implementation Readiness Assessment

- **Implement immediately (no blocker):** `updateVisit` sanitizer; contact-respond `user` select; notifications drop-populate; commission `sale{}` subfield decision (drop — verified unread); `ManageProperties listedBy?.` null-fix; contract-comment freeze (§3 inventory as baseline).
- **Requires lockstep:** property list DTO + `me.favorites` + visits pagination/projection + lead threads + EMI trim + user roster + blog envelope + reset flow. Each is a paired backend+frontend PR per resource.
- **Requires product clarification:** detail contact gate (§12.1), commission teaser (§12.2), agent roster `email` (§12.3), reset channel/TTL (§12.4), `source` vs pair (§12.5).
- **Explicitly do NOT change yet:** DB schemas; `lean()` rollout beyond pickers; shared DTO/serializer abstraction (use `select()` + existing sanitizers); envelope key renames (additive aliases only); B5 deletes (after verification); analytics/dashboard/aggregates, reviews, rewards, categories, archives — all appropriate, preserve as templates.

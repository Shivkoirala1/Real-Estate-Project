# System User Flow Audit — realestate-mern

> READ-ONLY audit. No source code was modified. Every conclusion is traced to an actual execution path (route → middleware → controller → model → side effect). Labels used throughout: **CURRENT IMPLEMENTATION** (what the code does today), **INTENDED BEHAVIOR** (what docs/comments/naming suggest), **GAP** (difference).
>
> **Update (2026-09-18):** follow-up sessions have since resolved or decided most open items. Each affected section below carries an **UPDATE** note with the outcome and the implementing commit. Policy decisions of record now live in `release-policy-notes.md`; KPI definitions in `analytics-kpi-reference.md`.

- Repo root: `/home/ashish/projects/Real-Estate-Project/realestate-mern`
- Backend entry: `backend/server.js:40-134`
- Frontend router: `frontend/src/App.jsx:78-605`
- Guards: `backend/middleware/auth.js:5-94`, `frontend/src/components/ProtectedRoute.jsx:5-25`, `frontend/src/components/PostGate.jsx:18-37`
- API base: `frontend/src/utils/axios.js:2-24`

---

## 1. Executive Summary

**What the system is today:** a 3-role (user/agent/admin) Nepal-focused (NPR-only, kitta/mukh, province/district/city) property marketplace with a unified lead pipeline (contact-form + visit → lead → sale/rental → commission + optional EMI), a separate property-management-request module, reviews, blogs, rewards wallet (XP/YC coin), notifications, archives/retention cron jobs, and admin/agent analytics.

**Roles actually enforced:** `user | agent | admin` (`backend/models/User.js:31-35`). There is **no `owner` role** — property-owner/seller/landlord is `role='user'` + `verificationStatus='verified'` + listings owned via `Property.listedBy`. One user has exactly one role (mutually exclusive, immutable via API).

**Anonymous visitor:** browse/search/filter/sort listings, view detail (incl. price, images, location, reviews, related), read published blogs, use land converter, submit contact form (public via `optionalAuth`), request password reset. Cannot book visit, favorite, inquire-as-user, post property, or see private contact data without login.

**Customer/buyer (`user`):** register → verify email (gate login) → verify identity (gate posting) → search/favorite/share → contact-form inquiry → book visit (property/office) → cancel own visit → conversations → reviews (if eligible) → EMI verification-request (if buyer on verified EMI sale) → rewards wallet → management-request filing (as owner).

**Property owner (`user` + listings):** same as customer plus: create property (sale/rent/management, `requireVerified`), edit own, status forward-only (`available→reserved→sold`), end-tenancy (`rented→available`), delete own, view own listings/inquiries (via legacy inquiries page — broken, see §28), file management-request (`POST /property-management` or `/with-property`), request termination, activity timeline.

**Agent:** agent record is a `User` with `role='agent'` + `agentProfile{licenseNumber,employeeId,joinedAt}` (`User.js:38-42`); CRUD via `/api/agents` (admin-only except list). Agent can: view assigned/my leads, move stages (except `pending_verification` and `closed` — system-only), file Sale/Rental against a lead (locks `dealType`, moves lead → `pending_verification`, property → `reserved`), manage own visits (only `completed/cancelled` + notes, cannot confirm/reassign), view own sales/rentals/commissions/EMI, view agent analytics/export, conversations (own + admin-visible).

**Admin:** full control plane: dashboard (`GET /dashboard/admin`), user list/verify/activate/deactivate/reset-password/delete (role change blocked), agent CRUD, property list/status/end-tenancy/delete, verification queue (sale/rental verify/reject), lead assign/reassign/delete/convert contact-form & visit, visit full update + convert-to-lead, conversation monitor/close/reopen/delete, management accept/decline/terminate/approve-termination, services CRUD, EMI create/update/installment/verification-review, commission mark-paid, blog CRUD, review reply/visibility, category CRUD, archives/restore/run jobs, analytics/export.

**Complete lifecycles (current):**
- Property: `available → reserved → sold` (forward-only, manual or deal-driven); rental occupancy `available ↔ rented` only via `verifyRental` (→rented) and `end-tenancy` (→available). `sold` blocks new inquiries/visits; `reserved` stays open by design (`canReceiveInquiries(): Property.js:129-131`).
- Lead: `new → contacted → site_visit_scheduled → negotiation → pending_verification → closed | lost` (`Lead.js:30-38`). Entry only via auto-convert (contact/visit) or manual create; exit to `pending_verification` only via Sale/Rental filing; exit to `closed` only via Sale/Rental verification (or admin manual close).
- Visit: `pending_agent_review → confirmed | rejected; confirmed → completed | cancelled` (`Visit.js:43-53`). Buyer creates; admin confirms/rejects/reschedules/assigns; agent only completes/cancels; buyer only cancels own.
- Management-request: `pending → active | declined; active → termination_pending → terminated; active → terminated (direct)` (`PropertyManagementRequest.js:3-13`). Matches intended machine exactly.
- Sale/Rental: `pending_review → verified | rejected` (`Sale.js:17`, `Rental.js:10`). Filing reserves property + parks lead; verify closes lead + freezes commission (+ EMI-pending alert if EMI sale); reject releases property + returns lead to `negotiation`.
- EMI: plan `active → completed | defaulted | cancelled`; installment `pending → paid | waived` (overdue computed); verification `none → pending → approved (→paid) | rejected` (`EMIPlan.js:23-26`). Admin-only writes; buyer-only verification-request.
- Commission: no status enum — `isPaid Boolean` (`CommissionRecord.js:38`). Created frozen on Sale/Rental verify; paid via admin mark-paid.
- Reward: append-only ledger (`RewardTransaction.js`) + `User.xp/ycCoin` increment, deduped per `(user,action,refId|key)` (`rewards.js:20-43`).
- Blog: `draft ↔ published` (`BlogPost.js:41-45`); public only sees `published`.

**Connected modules:** contact-form → lead → conversation → visit → sale/rental → commission → EMI → reward → notification fan-out is fully wired (see §23). Property-manual-sold path also awards buy/sell rewards. Reviews→rewards→notifications wired.

**Incomplete / contradictory / obsolete:** legacy `/inquiries` frontend service with no backend route (dead); blog `GET /:id` shadows `GET /slug/:slug`; city find-or-create open to any authed user while district equivalent is admin-only; XP=YC×2 contradicts 1:1 comment; agent cannot confirm visits despite UI language; rental flow has no applications/agreements/payments beyond EMI-for-sale; no buyer-facing checkout/agreement; `isApproved/isFeatured/isArchived` fields exist but no approval workflow (default approved).

---

## 2. Roles

### 2.1 Canonical role list (from code, not docs)

| # | Code term | Product map | Stored | AuthN | AuthZ (backend) | Frontend access |
|---|-----------|-------------|--------|-------|-----------------|-----------------|
| 0 | guest (no token) | Anonymous/Public visitor | n/a | `optionalAuth` (`auth.js:41-60`) recognizes token but never blocks | public routes only | `App.jsx:80-92` public routes |
| 1 | `user` | Customer/Buyer AND Property-Owner/Seller/Landlord (same role, distinguished by ownership + `verificationStatus`) | `User.role='user'` (`User.js:31-35`, default) | JWT `protect` (`auth.js:5-33`) + `isActive` check | `authorize('user')` only on EMI verification-request; otherwise generic `protect`; `requireVerified` gates posting | `/profile, /notifications, /my-properties*, /my-emi, /my-visits, /my-conversations, /wallet, /favorites` |
| 2 | `agent` | Agent (agency staff) | `User.role='agent'` + `agentProfile{licenseNumber,employeeId,joinedAt}` (`User.js:38-42`) | same | `authorize('admin','agent')` on leads/sales/rentals/commissions-read/visits-queue/agents-list/analytics-agent | `/dashboard/agent*`, `/my-leads`, `/favorites`, shared Conversations |
| 3 | `admin` | Admin | `User.role='admin'` | same (bypasses `requireVerified`: `auth.js:81`) | `authorize('admin')` on users/archives/blogs/management/EMI-writes/sale-verify/agent-writes/analytics-admin/reviews-mod | `/dashboard/admin*`, lead-management, verification-queue, etc. |

**Evidence:**
- Frontend: `ProtectedRoute.jsx:5-25` (redirect `!user→/login`, wrong role→`/`), `PostGate.jsx:18-37` (only `admin` or `verificationStatus==='verified'` may post), `Sidebar.jsx:23-207` (separate `adminNavGroups` vs `agentNavGroups`, role from storage `:239-243`), `accountNav.js:5-44` (menu mirror), `permissions.js:3-23` (`isAdmin/isAgent/isVerified/canPostProperty/getPropertyPostPath`).
- Backend: `protect:auth.js:5-33` (Bearer JWT → `User.findById`, 401 no token/gone, 403 `!isActive`), `authorize:64-74` (403 role mismatch), `requireVerified:77-94` (admin bypass else `verificationStatus==='verified'`; enforced on `propertyRoutes.js:36-40` writes and `propertyManagementRoutes.js:7-8` create).
- No multi-role: `userController.js:updateUser:60-98` rejects role change (400 + `AuditLog role_change_attempt`); roles mutually exclusive.

### 2.2 Verification sub-states (orthogonal to role)

Three independent tracks (`User.js:52-124`):
1. **Email** (gate login): `isEmailVerified` + code hash/expiry. `register:authController.js:28-85` creates `pending + isEmailVerified=false` + sends code, no token. `verifyEmail:90-139` flips false→true + awards `ACCOUNT_REGISTER+EMAIL_VERIFY+REFERRAL_ACCOUNT`. `login:264-294` blocks `!isActive` then `!isEmailVerified` (403 `requiresVerification`), then `applyLoginRewards` (daily/streak/birthday).
2. **Phone** (optional): `isPhoneVerified`. `sendPhoneOtp:161-182`, `verifyPhone:187-212` →true + `PHONE_VERIFY`. Profile phone change resets `isPhoneVerified=false: updateProfile:378-413:390`.
3. **Identity** (gate posting): `selfiePhoto/citizenshipFront/Back + verificationStatus pending|verified|rejected + verificationNote + verifiedAt`. `getPendingVerifications` + `verifyUser pending→verified|rejected + verifiedAt iff verified: userController.js:180-205` (route `userRoutes.js:15-25` all `protect+authorize('admin')`). New docs reset `verificationStatus=pending: updateProfile:400-402`. First phone → `PROFILE_COMPLETE:407-408`.

### 2.3 Agent onboarding (current)

**CURRENT IMPLEMENTATION:** no self-serve agent application flow. Agents are created by admin via `POST /agents` (`agentRoutes.js:7-24`, `authorize('admin')`), backed by `User` with `role='agent'`. Admin can list (`GET /` allows `admin,agent`), view summary (`GET /:id/summary`), update (`PUT /:id`), status toggle (`PATCH /:id/status` → `isActive`), delete (`DELETE /:id`). Frontend `ManageAgents.jsx:9`. No separate agent verification queue — agent activation = `isActive` + email-verified login like any user.

---

## 3. Role Capability Matrix

`YES` = reachable end-to-end (UI + API + DB). `CONDITIONAL` = allowed only under stated condition. `NO` = blocked on both layers (or layer missing).

| Capability | Public | Customer (`user`, no listings) | Owner (`user` + own listings) | Agent | Admin |
|---|---|---|---|---|---|
| Browse/search/filter/sort properties | YES | YES | YES | YES | YES |
| View property detail (price/images/location/reviews/related) | YES | YES | YES | YES | YES |
| View owner/agent contact info on detail | CONDITIONAL — see §24 (public contact-form path; direct phone/email exposure must be verified per response serializer) | YES (via conversation/contact) | YES | YES | YES |
| Register / verify email / login / forgot+reset / logout | YES | YES | YES | YES | YES |
| Phone OTP verify | NO (needs auth) | YES | YES | YES | YES |
| Identity verification submit (selfie/citizenship) | NO | YES (via profile) | YES | YES | YES |
| Edit profile / avatar / change password | NO | YES (`PUT /auth/profile`, `PUT /auth/change-password`: `authService.js:111,129`) | YES | YES | YES |
| Favorite / unfavorite property | NO (API `protect`) | YES (`POST /properties/:id/favorite`: `propertyService.js:40`) | YES | YES (`roles user,agent` on `/favorites`) | CONDITIONAL (API allows any authed; no UI route) |
| Share property (counts + reward) | YES (view) / NO (reward needs auth) | YES (`POST /properties/:id/share`:115) | YES | YES | YES via API |
| Submit general/property contact form | YES (`POST /contact-forms` `optionalAuth`: `contactFormRoutes.js:9`) | YES (linked to account) | YES | YES | YES |
| Book property/office visit | NO (API `protect`) | YES (`POST /visits`: `visitService.js:88`) | YES (blocked self-visit: `visitController.js:149-154`) | YES (but self-visit guard applies) | YES |
| Cancel own visit | NO | YES (`PATCH /visits/:id/cancel`:132) | YES | YES (own) | YES |
| Confirm/reject/reschedule/reassign visit | NO | NO | NO | CONDITIONAL — only `completed/cancelled` + notes on own visits (`visitController.js:464-489`); cannot approve/reassign | YES (full: `PATCH /visits/:id`) |
| Create property (sale/rent/management) | NO | CONDITIONAL — only if `verificationStatus==='verified'` (`PostGate` + `requireVerified`) | YES (same condition) | YES (same condition; agent UI at `/dashboard/agent/properties/new`) | YES (bypass) |
| Edit own property (not status) | NO | CONDITIONAL (own + verified) | YES | YES (own) | YES (any) |
| Change property status `available→reserved→sold` | NO | CONDITIONAL (own + verified; forward-only) | YES | YES (own) | YES (any) |
| End tenancy `rented→available` | NO | CONDITIONAL (own + verified) | YES | YES (own) | YES |
| Delete own property | NO | CONDITIONAL (own + verified) | YES | YES (own) | YES (any) |
| Submit management request (with or without new property) | NO | CONDITIONAL (verified) | YES (`POST /property-management`, `/with-property`) | CONDITIONAL (verified; no owner UI) | YES (on behalf: `propertyManagementController.js:129-135`) |
| Request termination of own active management | NO | n/a | YES (`PATCH /:id/request-termination`) | NO | NO (admin acts) |
| Accept/decline/terminate/approve-termination management | NO | NO | NO | NO | YES |
| Manage management-service catalogue | YES (public read: `GET /management-services` via `optionalAuth`; mutations admin-only) | read (+ catalogue CRUD for admin) | read | read | YES (CRUD + status) |
| Create lead manually | NO | NO | NO | YES (`POST /leads`) | YES |
| View leads | NO | NO | NO (no owner lead view; owner sees inquiries/conversations instead) | YES (own: `GET /leads/my-leads`; pipeline metrics) | YES (all: `GET /leads`) |
| Move lead stage | NO | NO | NO | CONDITIONAL — own/assigned; cannot set `pending_verification` (400) or `closed` (403) | YES (incl. manual close) |
| Assign/reassign lead | NO | NO | NO | NO | YES |
| Delete lead | NO | NO | NO | NO | YES |
| Convert contact-form → lead | NO | NO | NO | NO | YES (`POST /contact-forms/:id/convert-to-lead`) |
| Convert visit → lead (approve) | NO | NO | NO | NO | YES (`POST /visits/:id/convert-to-lead`) |
| Conversations: create/message | NO (needs auth) | YES (own) | YES (own threads) | YES | YES (any + monitor) |
| Conversations: close | NO | CONDITIONAL (owner-side: `conversationController.js:504-543`) | YES | CONDITIONAL (owner-side only) | YES |
| Conversations: reopen/delete, list all | NO | NO | NO | NO | YES |
| File Sale / Rental against lead | NO | NO | NO | YES (assigned/lead-owner-agent) | YES |
| Verify/reject Sale/Rental | NO | NO | NO | NO | YES |
| View sales/rentals | NO | NO (buyer has no sale view; EMI view instead) | NO | YES (own/agent-scoped) | YES (all) |
| EMI: create plan / edit / mark installment / review verification | NO | NO | NO | NO (read eligible + own plans) | YES |
| EMI: request verification (submit payment proof) | NO | CONDITIONAL — linked buyer with `role='user'` only (`emiPlanRoutes.js:25` + `1062-1068`) | CONDITIONAL (if buyer) | NO | NO |
| EMI: view plans | NO | YES (own: `GET /emi-plans` role-branched) | YES (if buyer) | YES (own/agent) | YES (all + `eligible-sales`) |
| Commissions: view | NO | NO | NO | YES (own + summary) | YES (all + summary) |
| Commissions: mark-paid | NO | NO | NO | NO | YES |
| Rewards wallet/transactions view | NO | YES (`GET /rewards/wallet|/transactions`) | YES | YES (same endpoint; earns via actions) | YES via API (no admin UI) |
| Reviews: write/delete own | NO (needs auth) | YES (if eligible: `GET /reviews/eligibility/:propertyId`) | YES | YES | YES |
| Reviews: reply/visibility/moderate | NO | NO | NO | NO | YES |
| Blogs: read published | YES | YES | YES | YES | YES |
| Blogs: create/edit/delete/publish | NO | NO | NO | NO | YES |
| Users: list/search/view/toggle/reset-pw/delete/verify-identity | NO | NO | NO | NO | YES |
| Agents: CRUD/status | NO | NO | NO | CONDITIONAL — list only | YES |
| Categories (property-type/district/city) read | YES (`GET /property-types|/districts|/cities` public) | YES | YES | YES | YES |
| Categories write | NO | NO | NO (except city find-or-create — see §27 conflict) | NO (same exception) | YES |
| Dashboard metrics | NO | CONDITIONAL (`GET /dashboard/my`) | YES | YES (agent dashboard + analytics) | YES (admin dashboard + analytics + export) |
| Archives/restore/run jobs | NO | NO | NO | NO | YES |
| Notifications read/mark/delete | NO (needs auth) | YES (own scope) | YES | YES | YES |

---

## 4. Public User Flows

### 4.1 Discovery: Landing → Listing → Search/Filter/Sort → Card → Detail

```
Entry: / (Home.jsx:3-4), /properties (PropertyListing.jsx:3)
  ↓ GET /api/properties (propertyService.js:18,22; optionalAuth so logged-in favorites resolve)
  ↓ SearchFilterBar.jsx:3 → GET /categories/property-types|districts|cities (categoryService.js:8,18,26; public: categoryRoutes.js:22-24)
  ↓ PropertyCard.jsx → /properties/:id
  ↓ GET /api/properties/:id (propertyService.js:31; controller getProperty:196-197 bumps views+=1)
```

**CURRENT IMPLEMENTATION:** filters/sort/search reach the backend (not client-only). Slug stable (only regenerated on title change: `Property.js:109-119`, fixing old every-save rewrite bug). `views+=1` on every detail fetch. **GAP:** management-purpose properties carry no price (`validatePropertyInput` + `price required iff saleType!=='management': Property.js:15`) — listing UI must handle priceless cards (verify).

### 4.2 Property detail (public data)

```
GET /properties/:id → PropertyDetail.jsx:7-14
  → GET /reviews/property/:id (public: reviewRoutes.js) + GET /reviews/eligibility/:propertyId (auth)
  → POST /contact-forms (public, optionalAuth) | POST /visits (auth-only → login wall)
```

**CURRENT:** pricing, images, location, availability (`status`), sale-vs-rent (`saleType`), related/similar, reviews visible publicly. Inquiry allowed anonymously; visit booking forces login. `canReceiveInquiries()` blocks only `sold` — `reserved` stays bookable by design (`Property.js:127-131`); visit creation additionally blocks `sold` (`visitController.js:141-147`) but not `reserved`.

### 4.3 Auth entry points (where anonymous is forced to login)

- Visit booking (`POST /visits` behind `protect`: `visitRoutes.js`), favorites (`propertyRoutes.js:43-44`), share-reward, reviews write, EMI, wallet, visits/conversations lists — all redirect via `ProtectedRoute → /login`.
- Posting (`/my-properties/new`, `/:id/edit`) double-gated: login + `PostGate` verified-or-admin.
- Contact form is the exception: stays public (lead capture), linked to account when token present.

### 4.4 Public auth flows

```
Register.jsx → POST /auth/register (authService.js:11) → pending + email code, NO token (authController.js:77-84)
  ↓ VerifyEmail.jsx → POST /auth/verify-email (:25) → isEmailVerified=true + ACCOUNT_REGISTER+EMAIL_VERIFY+REFERRAL_ACCOUNT rewards
  ↓ Login.jsx → POST /auth/login (:50) → blocked if !isActive / !isEmailVerified (403 requiresVerification) → JWT (local vs session by rememberMe: AuthContext.jsx:57-72)
Forgot → POST /auth/forgot-password (:63) → Reset → POST /auth/reset-password (:79)
```

---

## 5. Customer/Buyer Flows

### 5.1 Account

```
Register → Email verification → Login → Profile → Logout
Frontend: Register.jsx, VerifyEmail.jsx, Login.jsx, Profile.jsx:5-6
API: POST /auth/register|verify-email|resend-verification|login|forgot-password|reset-password (public: authRoutes.js:26-37)
     GET /auth/me (:93), PUT /auth/profile (multipart:111), PUT /auth/change-password (:129), POST /auth/logout (:143), POST /auth/send-phone-otp|verify-phone (auth)
Backend: authController.js (register 28-85, verify 90-139, resend 144-156, phone 161-212, login 264-294, profile 378-413)
Model: User.js
Side effects: referral code gen (pre-save:158-172), rewards on verify/phone/profile-complete, phone change resets isPhoneVerified, doc re-upload resets verificationStatus→pending
```

### 5.2 Discovery → Inquiry → Visit

```
Search → View → POST /contact-forms (createContactForm) → ContactForm(status=new) → notifyMany(admins, contact_form_received) → ensureLeadFromContactForm (dedupe/link, seed Conversation, lead_assigned)
       → POST /visits (createVisit: visitController.js:98-227) → pending_agent_review → notifyMany(admins, visit_requested); links active lead WITHOUT stage change (174-202)
Frontend: PropertyDetail.jsx:7-14, Contact.jsx:2
```

### 5.3 Inquiry / Lead (who owns each stage)

Customer owns: inquiry submit, visit request, conversation replies, payment-proof upload. Agent owns: `new→contacted→site_visit_scheduled→negotiation` moves + follow-ups + Sale/Rental filing. System owns: `→pending_verification` (on filing), `→closed` (on verify). Admin owns: assign/reassign, manual close, convert actions, verify/reject deals. Full guards in §12.

### 5.4 Visit lifecycle (buyer view)

```
Book (MyVisits.jsx:49 POST /visits) → pending_agent_review
  → admin confirm (visit_confirmed + PROPERTY_VISIT_BOOK reward) | reject (visit_rejected + lead→lost sync)
  → buyer cancel own (PATCH /:id/cancel: visitController.js:715-759; blocked if completed|cancelled) → visit_cancelled to admins
  → admin/agent complete (visit_completed + PROPERTY_VISIT_COMPLETE 300XP) → ensureLeadFromVisit (new site_visit_scheduled or link+stage sync)
  → admin convert-to-lead (pending→confirmed + same chain: 779-875)
```

### 5.5 Rental flow (verified — thin)

**CURRENT:** no rental applications, tenant screening, agreements, or rent payments in code. Rental = agent files `Rental` (property `saleType==='rent'`, tenant name/phone/email/user) → admin verify → property `rented + rentedFrom/rentedUntil/tenant` → lead closed → commission (manual amount) → end-tenancy releases. All rental-specific fields live on `Rental{tenant,startDate,monthlyRent,durationInMonths,securityDeposit}` + `Property{rentedFrom,rentedUntil,tenant}`. EMI is sale-only.

### 5.6 Purchase/sale flow (buyer view)

**CURRENT:** buyer has no checkout. Purchase happens off-platform; agent files `Sale{buyer,agreedPrice,downPaymentAmount,paymentType}` → admin verifies → property `sold+soldTo/soldAt`, lead `closed`, commission frozen, rewards (`PROPERTY_BUY 10000` if buyer registered). Buyer sees result indirectly (property unavailable, EMI view if EMI sale, rewards wallet).

### 5.7 Rewards (buyer-visible)

Actions & amounts (`rewardLevels.js:39-56`): REGISTER 100, PROFILE_COMPLETE 50, EMAIL_VERIFY 50, PHONE_VERIFY 50, SAVE 10, SHARE 20, VISIT_BOOK 100, VISIT_COMPLETE 300, BUY 10000, SELL 8000, REFERRAL_ACCOUNT 200, REFERRAL_SALE 5000, REVIEW 100, DAILY_LOGIN 5, STREAK_7DAY 100, BIRTHDAY 500. Levels Bronze→Diamond (`8-14`). Deduped per ref (`rewards.js:20-43`); ledger `RewardTransaction.js:33-35`; wallet `rewardController.js:10-48`; UI `Wallet.jsx:19-24` via `rewardService.js:6,13,25-34`.

---

## 6. Property Owner Flows

### 6.1 Creation (sale / rent / management)

```
Entry: /my-properties/new (ProtectedRoute + PostGate) → AddEditProperty.jsx:13-15
  → GET /categories/* + GET /management-services (catalogue pick for management)
  → POST /properties (multipart: propertyService.js:67) [or POST /property-management/with-property (atomic property+request: propertyManagementService.js:18)]
  → protect + requireVerified (propertyRoutes.js:36; propertyManagementRoutes.js:7-8)
  → createProperty:219-277 (any verified user) → Property(listedBy=me, isApproved=true default, status=available)
  → management path: saleType=management (no price) + request(status=pending) + notifyMany(admins, management_request_submitted)
Validation: validatePropertyInput (price required iff not management; images 10MB: upload.js:25-34,53-62,80-89)
```

**CURRENT:** no approval queue — `isApproved default true` (`Property.js:88`), listing visible immediately. Sale vs rent vs management is a single `saleType` enum chosen at create; management properties are priceless.

### 6.2 Management of own properties

- View: `GET /properties/my/listings` (`propertyService.js:58`) at `/my-properties` (ManageProperties with `showHeader=false`).
- Edit: `PUT /properties/:id` (owner/admin check; `status` stripped — must use status endpoint: `propertyController.js:297`).
- Status: `PATCH /properties/:id/status` (forward-only `available→reserved→sold`; regression 400; optional `buyerEmail→soldTo/soldAt`; on sold: notify admins + buy/sell/referral rewards).
- End tenancy: `PATCH /properties/:id/end-tenancy` (`rented→available` only; clears snapshot; appends `Rental.activities.updated`).
- Delete: `DELETE /properties/:id` (owner/admin).
- Leads/visits/inquiries on own properties: via `RevampedInquiries.jsx` (BROKEN — §28), `MyVisits` (own bookings only), shared `Conversations` (own threads).

### 6.3 Management-service flow (owner side)

```
Owner → create management property → select services (snapshot strings validated vs active catalogue: propertyManagementController.js:106-115)
  → submit (pending:159) → 409 if live request exists (145-153; partial unique index guards pending|active|termination_pending)
  → admin accept → active | decline (reason required) → declined
  → owner request-termination (active→termination_pending, owner-only:571-575) + notify admins
  → admin approve-termination → terminated | admin direct terminate (active→terminated, reason required; rejects termination_pending:465-470)
Activities: GET|POST /:id/activities (owner|admin); detail pages MyManagementRequestDetail.jsx (owner) / ManagementRequestDetail.jsx (admin)
```

Matches intended machine exactly (see §10).

---

## 7. Agent Flows

### 7.1 Property work

Agent lists via `/dashboard/agent/properties` (same `ManageProperties.jsx`), creates via `/dashboard/agent/properties/new` (`AddEditProperty.jsx`, still `requireVerified` — agent must also be identity-verified unless admin). No separate verification/edit-others permission: agent edits own listings only (controller owner/admin check).

### 7.2 Leads

```
Lead assigned (lead_assigned notify: leadController.js:169-176) → MyLeads.jsx:4-6 (GET /leads/my-leads)
  → review → contact → PATCH /:id/stage (contacted|site_visit_scheduled|negotiation|lost) + follow-up/notes/activities
  → SubmitSaleModal.jsx:104 (POST /sales) | SubmitRentalModel.jsx:81 (POST /rentals) → lead→pending_verification (system)
  → verify (admin) → closed + commission | reject → negotiation
Guards: createLead:88-195 (admin/agent, stage=new, dealType from saleType, notify assignee+admins); updateLeadStage:487-559 (admin|assigned-agent; 400 on *→pending_verification; 403 agent→closed); assign/reassign + delete admin-only (routes leadRoutes.js:22-23, DELETE)
```

Duplicate route: `/my-leads` and `/dashboard/agent/leads` render same `MyLeads` (`App.jsx:292-311`).

### 7.3 Visits

```
GET /visits (admin,agent queue) → VisitManagement.jsx:64 → PATCH /:id (agent scoped: own visit, only completed|cancelled|notes, no assign/reschedule: 464-489)
Approve requires assigned agent (511-530; 400 requiresAgent; pull from lead). confirmed→site_visit_scheduled, completed→negotiation, rejected|cancelled→lost (stageForVisitStatus:44-56), never regressing pending_verification|closed|lost (UNRECOVERABLE:23-27 + 563-586)
```

**GAP:** agent cannot confirm/reject — only admin can (despite "pending_agent_review" naming and agent visit-management UI).

### 7.4 Conversations

Agent sees own threads (`GET /my-conversations`) + lead-linked threads (`LeadConversationThread.jsx:2,148`); sends as owner-side; close if owner-side; cannot reopen/delete/list-all (admin-only). Unread via `lastReadAt` stamps (`conversationController.js:54-64,312-321,367-371`) + 30s poll (`ConversationContext.jsx:7,35`) + Sidebar badge (`Sidebar.jsx:350-357`).

### 7.5 Commissions

**CURRENT:** fully scaffolded AND wired (not stub): created automatically on Sale/Rental verify with frozen pct/amount (`saleController.js:404-449`, `rentalController.js:415-430` via `effectiveCommissionPercentage: commission.js:6-9` = property override ?? type default ?? 0); readown (`GET /commissions|/summary` agent-scoped); paid by admin (`PATCH /:id/mark-paid` + `commission_paid` notify). Agent UI `MyCommissions.jsx` via `commissionService.js` (rerouted `efb55b5`). No dispute/adjustment flow.

---

## 8. Admin Flows

### 8.1 Dashboard

`AdminDashboard.jsx:3-4 → GET /dashboard/admin (dashboardRoutes.js:6 protect+authorize('admin')) + GET /leads/pipeline/metrics`. Metrics source: `dashboardController` aggregations (users/properties/visits/leads/sales) — verify per-field against controller when extending.

### 8.2 User management

`ManageUsers.jsx:8 → GET|PUT|PATCH /users[/:id][/status|reset-password] + DELETE /:id + GET /verifications/pending + PATCH /:id/verify` (`userRoutes.js:15-25` all admin). Toggle `isActive` (`toggleUserStatus:103-119`), admin-initiated password-reset email (`resetPassword:124-155`), role immutable (400 + audit).

### 8.3 Registration verification

Pending queue (`getPendingVerifications:180-205`, `VerifyUsers.jsx:2,38`) → `verifyUser pending→verified|rejected + verifiedAt iff verified` → unblocks `requireVerified` posting. Email gate (login) vs identity gate (posting) are independent — email verified ≠ allowed to post.

### 8.4 Property / agent management

- Properties: `ManageProperties.jsx:9 → GET /properties (filterable), PATCH /:id/status|end-tenancy, DELETE /:id`. Admin bypasses ownership + verified checks.
- Agents: `ManageAgents.jsx:9 → GET|POST|PUT|PATCH|DELETE /agents` (admin-only except list).

### 8.5 Leads / visits / conversations

- Leads: `LeadDashboard.jsx:10 → GET /leads, PATCH /:id/stage|assign, pipeline/metrics, GET /agents`; detail `LeadDetail.jsx:55` (stage/priority/notes/follow-up/activities + submit sale/rental + conversation thread); contact-forms inbox + `ContactFormDetail.jsx:3` (respond/status/delete/convert).
- Visits: `Visits.jsx:3,5 → GET /visits, PATCH /:id, GET /agents` + `ConvertToLeadModal → POST /visits/:id/convert-to-lead` (admin-only unified accept). (Orphan `ManageVisits.jsx` unused — App uses `Visits.jsx`: `App.jsx:543-552`.)
- Conversations: shared `Conversations.jsx` (admin branch `GET /conversations`) + close/reopen/delete.

### 8.6 Sales verification / commissions / EMI / rewards / blogs / analytics

- Queue: `VerificationQueue.jsx:3-4 → GET /sales|/rentals + PATCH /:id/verify|reject` (reason required on reject).
- Commissions: `Commissions.jsx → GET /commissions + PATCH /:id/mark-paid` via `commissionService.js` (rerouted `efb55b5`).
- EMI: `EmiPlans.jsx:4-5,518,575 → GET /emi-plans|eligible-sales + POST /emi-plans (+GET /sales/:id)`; `EmiPlanDetail.jsx:504,591,616 → GET /:id + PATCH /:id|installments/:n|verification-request`.
- Rewards: no admin UI; ledger readable via user wallet endpoints only.
- Blogs: `ManageBlogs.jsx:3 + BlogForm.jsx:4,119 → GET /blogs + DELETE + POST|PATCH /:id (multipart) + GET /:id`.
- Analytics: `Analytics.jsx:3 + AgentAnalytics.jsx:2 → GET /analytics/admin|agent + GET /analytics/export?type&format (blob)`.

---

## 9. Property Lifecycle

```
Entity: Property (backend/models/Property.js)
States: available | reserved | sold | rented (+ flags isApproved default true, isFeatured, isArchived)
Initial: available (Property.js:82-86)
```

| Transition | Trigger (API) | Who | Frontend | Side effects |
|---|---|---|---|---|
| create → available | `POST /properties` (`createProperty:219-277`) | verified user/agent (admin bypass) | `AddEditProperty.jsx` via `propertyService.js:67` | `listedBy=me`, slug gen, `isApproved=true` (no queue) |
| available → reserved | `PATCH /:id/status` (`updatePropertyStatus:384-455`, STATUS_RANK:379 forward-only) OR Sale/Rental filing (txn: `property=reserved`) | owner/admin (manual) or filing agent (deal) | `ManageProperties.jsx:210` or Submit modals | deal path also `lead→pending_verification` + `sale|_submitted` notify |
| reserved → sold | same status endpoint OR `verifySale` | owner/admin or admin verify | same | manual sold: `property_sold` to admins + BUY/SELL/REFERRAL_SALE rewards (if buyerEmail resolves); deal verify: `soldTo/soldAt`, `lead→closed`, CommissionRecord, `sale_verified` to agent (+`emi_plan_pending` if EMI) |
| reserved → available | `rejectSale|rejectRental` | admin | `VerificationQueue.jsx` | `lead→negotiation` + rejected notify |
| * → rented | `verifyRental` only (`rentalController.js:397-402`) | admin | VerificationQueue | `rentedFrom/rentedUntil/tenant` snapshot + `lead→closed` + commission (manual amount) + `rental_verified` |
| rented → available | `PATCH /:id/end-tenancy` only (`endTenancy:465-505`) | owner/admin + verified | ManageProperties | clears snapshot; appends `Rental.activities.updated` (Rental stays verified) |
| any → deleted | `DELETE /:id` | owner/admin | ManageProperties | hard delete (archives job handles cold storage separately) |

**Enforcement:** regression rejected (`400-405`); `sold` blocks inquiries/visits; `reserved` open by design. Invalid: `sold→*`, `rented→sold` via status endpoint (must use deal/end-tenancy paths), `available→sold` skipping reserved ALLOWED manually (forward-only permits jump) — **GAP:** manual path can skip `reserved`/deal entirely.

---

## 10. Property Management Lifecycle

```
Entity: PropertyManagementRequest (backend/models/PropertyManagementRequest.js:7-13)
States: pending → active | declined; active → termination_pending → terminated; active → terminated (direct)
Initial: pending. Terminal: declined, terminated (never transition; new filing allowed after).
```

| Transition | API (`propertyManagementController.js`) | Who | Frontend | Notify |
|---|---|---|---|---|
| submit → pending | `createManagementRequest:90-203` / `createWithProperty:714-811` | verified owner (admin on behalf:129-135) | `propertyManagementService.js:18,31` | `management_request_submitted` → admins |
| pending → active | `accept:352-391` | admin | `ManagementRequestDetail.jsx:227` (`accept:66`) | `management_request_accepted` → owner |
| pending → declined | `decline:399-443` (reason required:401) | admin | same (`decline:75`) | `management_request_declined` |
| active → termination_pending | `requestTermination:563-618` (owner-only:571-575) | owner | `MyManagementRequestDetail.jsx` (`request-termination:104`) | `management_termination_requested` → admins |
| termination_pending → terminated | `approveTermination:510-553` | admin | admin detail (`approve-termination:95`) | `management_terminated` |
| active → terminated (direct) | `terminateManagement:454-502` (reason required; rejects termination_pending:465-470) | admin | admin detail (`terminate:84`) | `management_terminated` |

Dedupe: 409 if live exists (`145-153`) + partial unique index `(property,status)` for live states (`72-75`). Catalogue: `ManagementService{name unique,description,isActive}` (`ManagementService.js:8-18`); request stores snapshot strings validated vs active catalogue. **Matches INTENDED machine verbatim — no discrepancy.**

---

## 11. Lead Lifecycle

```
Entity: Lead (backend/models/Lead.js:30-41)
States: new → contacted → site_visit_scheduled → negotiation → pending_verification → closed | lost
Sources: contact_form | property_visit | office_visit | manual_create (Lead.js:41)
dealType: null → sale | rental (locked: lockDealType:195-199; rental-locked + sale filing → must create new lead)
```

| Transition | Trigger | Who |
|---|---|---|
| * → new | `createLead:88-195` (manual) / `ensureLeadFromContactForm:203-308` (auto) | admin/agent (manual); system (auto) |
| new → contacted / site_visit_scheduled / negotiation / lost | `updateLeadStage:487-559` + visit sync (`stageForVisitStatus`) | admin or assigned-agent (`canManage:79-81`) |
| * → pending_verification | `createSale` / `createRental` only (txn) | filing agent (lead-owner) / admin |
| pending_verification → closed | `verifySale` / `verifyRental` (txn) | admin |
| pending_verification → negotiation | `rejectSale` / `rejectRental` | admin |
| any → closed (manual edge) | `updateLeadStage` | admin only (agent→closed 403) |
| → pending_verification (manual) | blocked 400 for everyone | — |

Auto-convert (`leadAutoConversion.js`): dedupes active stages (`new..negotiation`:33) by user/email/phone (`46-55,352-365`); new lead stage `new` (contact) vs `site_visit_scheduled` (visit:418-420); `dealType` from `property.saleType`; seeds `Conversation` (`86-146`) + `conversation_message` to owner + `lead_assigned` to assignee. Visit link without stage bump on plain booking; stage sync on confirm/complete/reject/cancel. `isActive` excludes `closed,lost,pending_verification` (`137-139`).

---

## 12. Visit Lifecycle

```
Entity: Visit (backend/models/Visit.js:5-53)
visitType: property (needs property ref) | office. status: pending_agent_review → confirmed | rejected; confirmed → completed | cancelled
Initial: pending_agent_review (createVisit:157-164: visitController.js:98-227)
```

| Transition | API (`visitController.js`) | Who | Side effects |
|---|---|---|---|
| book → pending_agent_review | `POST /visits` (blocks sold:141-147, self-visit:149-154) | any authed | link active lead (no stage change) + `visit_requested` → admins |
| pending → confirmed | `updateVisit:444-710` (approve requires assignedAgent:511-530) + `convertVisitToLead:779-875` (pending→confirmed:817-819) | admin only (agent cannot) | `ensureLeadFromVisit:551-560` + `visit_confirmed` → buyer + `PROPERTY_VISIT_BOOK` (598-605) |
| pending/confirmed → rejected | `updateVisit` | admin only | `visit_rejected` + lead→lost sync (guarded by UNRECOVERABLE:23-27) |
| confirmed → completed | `updateVisit` (agent allowed: own + completed/cancelled/notes only:464-489) | admin (full) / assigned agent (scoped) | `visit_completed` + `PROPERTY_VISIT_COMPLETE` (614-621) + lead→negotiation sync |
| any (not completed/cancelled) → cancelled | `updateVisit` (agent scoped) or `cancelMyVisit:715-759` (requester only:730-737) | admin/agent(requester-scoped)/buyer-self | `visit_cancelled` → admins (buyer path) or `visit_*` branch (:664-672); reschedule-only → `visit_rescheduled` (:686-696) |

Frontend: `visitService.js:27,52,70,88,117,132`; `Visits.jsx` (admin), `VisitManagement.jsx:64,94,143` (agent), `MyVisits.jsx:49,85` (buyer + cancel).

---

## 13. Conversation Lifecycle

```
Entity: Conversation (backend/models/Conversation.js:3-49)
No status enum — isActive Boolean (default true) + messages[].side inquirer|owner (:32) + lastReadAt.{inquirer,owner} (:45-48)
Unread = other-side message newer than stamp (conversationController.js:54-64,312-321)
```

| Action | API (`conversationController.js`) | Who |
|---|---|---|
| create (optionally linked to lead: `lead.conversationThreads + recordActivity:164-173`) | `createConversation:71-187` | any authed |
| message (admin sends as `owner`:429; syncs `Lead.activities`:447-458) | `addMessage:384-497` | inquirer / owner / admin |
| close (`isActive=false:535`) | `close:504-543` | admin or owner-side |
| reopen (`true:568`) | `reopen:550-576` | admin only |
| delete | `delete:583-597` | admin only |
| list all | `GET /` | admin only |
| own threads | `GET /my-conversations`, `GET /:id` (stamps viewer `lastReadAt:367-371`) | any authed |

Notify: owner-side message → `conversation_message` to inquirer; inquirer-side → `conversation_followup` to admins (`465-489`). Routes: `conversationRoutes.js:6-21`. Frontend: `conversationService.js:14,23,32,41,50,58,63`; `Conversations.jsx:161,276,289`; `LeadConversationThread.jsx:148`.

---

## 14. Sale Lifecycle

```
Entity: Sale (backend/models/Sale.js:17-18)
STATUSES: pending_review → verified | rejected. PAYMENT_TYPES: full_payment | emi | bank_loan. Partial unique {lead} where pending_review (:117).
```

```
Agent (lead-owner:47-54) → POST /sales (createSale:33-217: saleService.js:27)
  guards: needs lead.property(:56), lockDealType('sale')(:65), not pending_verification(:75), not closed|lost(:81),
          property saleType==='sale'(:126), not sold(:129), reserved only if pending sale exists(:132-141),
          EMI needs buyer.user(:112-118, auto-link by email:104-111)
  txn: sale=pending_review(:161) + property=reserved(:179) + lead=pending_verification(:182-189)
  → notifyMany(admins, sale_submitted:194-205)
Admin → PATCH /sales/:id/verify (verifySale:378-495) [only pending_review:383]
  txn: sale→verified(:410) + property→sold+soldTo/soldAt(:421-423) + lead→closed(:426-434)
       + CommissionRecord.create(frozen pct/amount via effectiveCommissionPercentage:404,436-449)
  → notify agent sale_verified(:456-464); if emi → notify admins emi_plan_pending(:469-482)
Admin → PATCH /sales/:id/reject (rejectSale:502-572, reason required)
  → sale→rejected(:530) + property→available(:544) + lead→negotiation(:548-554) + sale_rejected(:557-565)
Routes: saleRoutes.js:9-15 (POST,GET / admin,agent; GET :id any-auth + controller filing/lead-agent check; verify|reject admin).
Frontend: VerificationQueue.jsx:19,56,151; SubmitSaleModal.jsx:104.
```

---

## 15. Rental Lifecycle

Mirror of sale (`Rental.js:10`, `rentalController.js:30-517`, `rentalService.js:24,46,57,72,84`):

```
Agent → POST /rentals (needs saleType==='rent':126; rented→409; reserved guard:135-145; lead→pending_verification:185)
  → notifyMany(admins, rental_submitted:179-207)
Admin → PATCH /rentals/:id/verify (requires manual commissionAmount:357-369)
  → property→rented + rentedFrom/rentedUntil/tenant(:397-402) + lead→closed(:405)
  + CommissionRecord (rental ref + back-computed pct:415-430) + rental_verified(:433-441)
Admin → PATCH /rentals/:id/reject → available + negotiation + rental_rejected(:476-510)
Release: end-tenancy (rented→available) — only exit; Rental doc stays verified as history.
```

**INTENDED vs CURRENT:** no applications, screening, agreements, or rent collection — rental is a single verified transaction + occupancy snapshot.

---

## 16. EMI Lifecycle

```
Entity: EMIPlan (backend/models/EMIPlan.js:23-26)
PLAN: active → completed | defaulted | cancelled. INSTALLMENT: pending → paid | waived (overdue computed:131-138). VERIFICATION: none → pending → approved (→paid) | rejected (never auto-marks paid: header 14-19).
Unique: one plan per sale.
```

| Action | API (`emiPlanController.js`) | Who | Frontend |
|---|---|---|---|
| create (only `sale.verified + paymentType=emi:146-155`, needs `buyer.user:170`, flat schedule:180-190, status active:219) | `createEmiPlan:113-262` | admin (`emiPlanRoutes.js:9`) | `EmiPlans.jsx:631` (`emiService.js:22`) + `eligible-sales:35` |
| edit plan (completed only if all settled:886-894; reschedule only active:908-910) | `updateEmiPlan:859-1039` | admin | `EmiPlanDetail.jsx:591` |
| mark installment (paid sets paidDate/Amount:642-644 + auto-approves pending verification:658-665; pending clears:668-682; waived clears:691-696; paid guards:588-611) | `updateInstallment:549-852` (buyer 403:566-571) | admin | `EmiPlanDetail.jsx:561,577` |
| submit proof (only pending installment:1075, no dup pending:1082) | `requestVerification:1049-1165` | linked buyer `role='user'` (`emiPlanRoutes.js:24-29` + `1062-1068`) | `MyEMI.jsx:349` (`emiService.js:112-113`, multipart slip) |
| approve (→paid+approved:1240-1247, overridable) / reject (reason required:1207-1213) | `reviewVerification:1175-1295` | admin | `EmiPlanDetail.jsx` |
| reminders (daily 08:00 EMI cron: `server.js`; due-soon today..+3d + overdue; per-recipient-type-plan-per-day dedupe: `emiReminders.js:51-57`) | `runEmiReminders:29-134` | system | — |
| lead follow-up reminders (daily 09:00 cron, added after audit: `leadFollowupReminders.js`) | `runLeadFollowupReminders` | system | — |

Notify: `emi_plan_created` (buyer+agent), `emi_plan_pending` (admins), `emi_installment_updated` / `emi_plan_status_changed`, `emi_verification_requested|approved|rejected`, `emi_installment_due|overdue`. Read: `GET /emi-plans` (`admin,agent,user`:16) + `GET /:id` (role-branched controller); agent views `EMISales.jsx:212`, buyer `MyEMI.jsx`.

---

## 17. Commission Lifecycle

```
Entity: CommissionRecord (backend/models/CommissionRecord.js:17-43)
No status enum — isPaid Boolean + paidAt/paidNote (:38). Refs sale|rental, property, agent; frozen transactionAmount|commissionPercentage|commissionAmount.
```

```
Sale/Rental verify → CommissionRecord.create (saleController.js:436-449; rentalController.js:415-430)
  pct = effectiveCommissionPercentage(property, propertyType) = property.commissionPercentage ?? type.defaultCommissionPercentage ?? 0 (commission.js:6-9)
Admin → PATCH /commissions/:id/mark-paid (markCommissionPaid:168-201, admin: commissionRoutes.js:9)
  → isPaid=true + paidAt(:179-181) + notify agent commission_paid(:186-194)
Read: GET /|/summary (admin,agent; agent scoped own: commissionController.js:17-18)
Frontend: `commissionService.js` used by commission pages (rerouted `efb55b5`; `AgentDashboard.jsx:47` still calls directly — minor, not drift-critical).
```

**CURRENT:** calculation + approval(paid flag) implemented; no tiers, splits, disputes, or payout integration.

---

## 18. Reward Lifecycle

```
Ledger: RewardTransaction{action,label,xp,yc,refId,refModel,key} (RewardTransaction.js:9-30, indexes 33-35)
State: User{xp lifetime, ycCoin spendable} (User.js:133-136) + levelForXp (rewardLevels.js:8-14 Bronze/Silver/Gold/Platinum/Diamond)
Engine: awardReward(userId,actionKey,{refId,refModel,key}) (rewards.js:20-43) — findOne dedupe on (user,action,refId) or (user,action,key) → create txn + $inc xp,ycCoin. notify.js swallows errors (12-51) so rewards never break primary request.
Catalog: rewardLevels.js:39-56 (REGISTER 100, PROFILE_COMPLETE 50, EMAIL_VERIFY 50, PHONE_VERIFY 50, SAVE 10, SHARE 20, VISIT_BOOK 100, VISIT_COMPLETE 300, BUY 10000, SELL 8000, REFERRAL_ACCOUNT 200, REFERRAL_SALE 5000, REVIEW_WRITE 100, DAILY_LOGIN 5, STREAK_7DAY 100, BIRTHDAY 500)
Triggers: authController (register/verify/referral/phone/login-streak/birthday), propertyController (save/share/sold), visitController (confirm/complete), reviewController (write, unique per property: Review.js:37)
Read: GET /rewards/wallet|/transactions (rewardController.js:10-48, protect) → rewardService.js:6,13,25-34 → Wallet.jsx:19-24
```

**Conflict:** code awards `xp = yc*2` (`rewards.js:35`) vs comment "XP mirrors YC 1:1" (`rewardLevels.js:36-38`).

---

## 19. Blog Lifecycle

```
Entity: BlogPost{title,slug,coverImage,body,author,tags,status draft|published (:41-45), publishedAt} (BlogPost.js)
createBlog:7-72 (status||draft:51, publishedAt=now iff published:53-56)
updateBlog:235-297 (publish stamps publishedAt once, draft clears null:266-276)
getBlogs:76-133 (admin filterable); getPublished:136-185 (public status=published); getBySlug:208-232 (admin sees draft+published:217 else published only)
Routes: blogRoutes.js:19-46 — POST,GET /,PATCH,DELETE :id = protect+admin; GET /published, /:id, /slug/:slug public
Frontend: blogService.js:5,13,21,27,40,55,63; ManageBlogs.jsx:93,194,200; BlogForm.jsx:119; BlogList.jsx:234,266,279; BlogDetail.jsx:61,70
Flow: admin create draft → edit → publish → public visibility (/blogs, /blogs/:slug) → update/unpublish/delete
```

**Bug:** `GET /:id` (`:44`) registered before `GET /slug/:slug` (`:46`) shadows slug route for non-ObjectId-safe matching — slug-by-ID collision risk.

---

## 20. Notification Flows

Infra: `notify()` swallows errors (`notify.js:12-51`), `notifyMany()` dedupes recipients (`54-57`); types enum `Notification.js:7-55` (~40 + 4 legacy `inquiry_*`); controller scoped `recipient=req.user._id` (`notificationController.js:7-81`); frontend `notificationService.js:12,23,32,41,50` + `NotificationContext.jsx:15-112` (30-item fetch, unread-count, 20s poll) + `NotificationBell.jsx:376` + `Notifications.jsx:3`.

| Event | Recipient | Type | Implemented? |
|---|---|---|---|
| Contact form submitted | admins | `contact_form_received` | YES (`contactFormController.js:74-117`) |
| Admin replies contact form | sender | `contact_form_responded` | YES (`:300-319`, status→responded) |
| Conversation message (owner-side) | inquirer | `conversation_message` | YES (`conversationController.js:465-474`) |
| Conversation reply (inquirer-side) | admins | `conversation_followup` | YES (`:478-489`) |
| Visit requested | admins | `visit_requested` | YES (`visitController.js:210-220`) |
| Visit confirmed | buyer | `visit_confirmed` | YES (`61-84`, `824-831`) |
| Visit rejected/cancelled/completed/rescheduled | buyer/admins | `visit_rejected\|visit_cancelled\|visit_completed\|visit_rescheduled` | YES (`628-636,664-696,737`) |
| Lead assigned / created / stage changed | assignee / admins | `lead_assigned\|lead_created\|lead_stage_changed` | YES (`leadController.js:169-188,544-551`; auto-convert path too) |
| Lead follow-up overdue | assigned agent (or all admins if unassigned) | `lead_followup_due` | YES — generator added: daily 09:00 cron (`server.js`), `runLeadFollowupReminders` (`utils/leadFollowupReminders.js`), per-recipient-per-day dedupe. **UPDATE: GAP closed (`59dce10`).** |
| Lead manually closed (admin) | assigned agent | `lead_closed` | YES — dedicated event on admin close; generic `lead_stage_changed` suppressed on closes to avoid duplicates. **UPDATE: added after audit (`bd014fe`, refined `01e8818`).** |
| Lead marked lost (agent) | admins | `lead_stage_changed` ("Agent marked a lead lost") | YES — assigned agents cannot close (403); `lost` is their terminal outcome and notifies all admins. Never emits `lead_closed`. **UPDATE: added `01e8818`.** |
| Property manually marked sold | admins | `property_sold` | YES (`propertyController.js:428-451`) |
| Sale/Rental submitted | admins | `sale_submitted\|rental_submitted` | YES |
| Sale/Rental verified/rejected | agent | `sale_verified\|rejected\|rental_verified\|rejected` | YES |
| Management submitted/accepted/declined/terminated/termination-requested | admins/owner | `management_request_submitted\|management_request_accepted\|management_request_declined\|management_terminated\|management_termination_requested` | YES (all five) |
| Commission paid | agent | `commission_paid` | YES |
| EMI plan created/pending/updated/status/verification-req/approved/rejected/due/overdue | buyer+agent / admins | `emi_plan_created\|emi_plan_pending\|emi_installment_updated\|emi_plan_status_changed\|emi_verification_requested\|emi_verification_approved\|emi_verification_rejected\|emi_installment_due\|emi_installment_overdue` | YES (all nine) |
| Review posted / replied | lister / author | `review_posted\|review_reply` | YES (`reviewController.js:163-171,238-245`) |
| Legacy inquiry_* (received/read/responded/followup) | — | `inquiry_*` | TYPE EXISTS, **no generator — OBSOLETE** (inquiry module replaced by contact-forms+conversations) |
| `system` generic | — | `system` | RESERVED, unused |

---

## 21. Authorization Matrix

| Operation | Frontend guard | Backend enforcement | Match? |
|---|---|---|---|
| Public property/blog reads | none | `optionalAuth` / public | ✅ |
| Contact-form submit | none | `optionalAuth` (public) | ✅ |
| Visit book | ProtectedRoute (any auth) | `protect` (any auth) | ✅ |
| Visit cancel own | MyVisits (user) | `protect` + requester check (`cancelMyVisit`) | ✅ |
| Visit confirm/reject/assign/reschedule | agent UI exists (VisitManagement) | admin-only in controller (agent scoped to complete/cancel) | ✅ DECIDED — admin-only triage is intended; UI labels already read "Pending Review", so no rename/migration (`bd014fe` report §1) |
| Lead stage → pending_verification / closed (agent) | role-scoped dropdowns (`ADMIN/AGENT_MANUAL_STAGES`) | 400 / 403 guards | ✅ FIXED — UI no longer offers forbidden targets (`01e8818`) |
| Post property | ProtectedRoute + PostGate (verified/admin) | `protect + requireVerified` | ✅ |
| Edit/status/delete property | owner UI (ManageProperties) | owner/admin check in controller | ✅ |
| Management create | ProtectedRoute (any) | `protect + requireVerified` | ⚠️ UI allows unverified attempt; API 403 (PostGate not applied to management routes — verify) |
| Management admin actions | admin routes | `authorize('admin')` | ✅ |
| Sale/Rental file | agent UI (LeadDetail modals) | `authorize('admin','agent')` + lead-owner check | ✅ |
| Sale/Rental verify/reject | admin queue | `authorize('admin')` | ✅ |
| EMI writes | admin pages | `authorize('admin')` | ✅ |
| EMI verification-request | buyer page (user) | `authorize('user')` + linked-buyer check | ✅ (strictest — agent/admin cannot submit even if buyer) |
| Commissions mark-paid | admin page | `authorize('admin')` | ✅ |
| Users/agents/archives/blogs/categories-write/analytics-admin | admin routes | `authorize('admin')` | ✅ |
| City find-or-create | category picker (AddEditProperty) | `protect + authorize('admin')` (locked to match districts, `e998850`; owner wizard surfaces 403 via existing `addCityError` path) | ✅ FIXED |
| Favorites/share | auth pages | `protect` | ✅ |
| Owner inquiries (`RevampedInquiries`) | owner route (`/my-properties/inquiries`) | rebuilt on `GET /contact-forms/sent` + `GET /conversations/my-conversations`; dead `inquiryService.js` deleted | ✅ FIXED (`4142053`) |
| Analytics export `type=admin` (agent caller) | agent analytics page (requests `type=agent`) | 403 for non-admin `type=admin` (`exportAnalytics`, `9c22e66`); agent export self-scoped, unchanged | ✅ FIXED |

---

## 22. API ↔ Frontend Flow Map

Conventions: page → service (`frontend/src/services/*`) → `METHOD /api/...` → `backend/routes/*` → `backend/controllers/*` → `backend/models/*`. Base `axios.js:2-5`, 401 clears auth (`:19-24`).

**Public:** `Home.jsx:3-4 → getProperties + getPropertyTypes → GET /properties, /categories/property-types`; `PropertyListing.jsx:3 → GET /properties`; `PropertyDetail.jsx:7-14 → GET /properties/:id + POST /contact-forms + POST /visits + GET|POST /reviews[/property/:id|eligibility]`; `Contact.jsx:2 → POST /contact-forms`; `BlogList.jsx:4 → GET /blogs/published`; `BlogDetail.jsx:3 → GET /blogs/slug/:slug`; auth pages → `AuthContext.jsx:57-101 → POST /auth/*`.

**User:** `Profile.jsx:5-6 → GET /properties/my/favorites|my/listings + PUT /auth/profile|change-password`; `Favorites.jsx:3 → GET /my/favorites (+POST /:id/favorite via PropertyCard)`; `Notifications.jsx:3 → NotificationContext → GET /notifications|unread-count + PATCH read|read-all + DELETE`; `MyVisits.jsx:49,85 → GET /visits/my-visits + PATCH /:id/cancel`; `Conversations.jsx:161 → GET /my-conversations|/conversations + GET|PATCH /:id[/messages|close|reopen]`; `Wallet.jsx:44 → GET /rewards/wallet|transactions`; `MyEMI.jsx:349 → GET /emi-plans + POST verification-request`; `MyManagementRequests.jsx:3 → GET /my-requests`; `MyManagementRequestDetail.jsx:8 → GET /:id + activities + request-termination`; `my-properties/* → ManageProperties.jsx:9 (GET /properties + PATCH status|end-tenancy + DELETE), AddEditProperty.jsx:13-15 (POST|PUT /properties + categories + management-services + POST /property-management/with-property), RevampedInquiries.jsx (rebuilt `4142053`: sent contact-forms via `GET /contact-forms/sent` + own threads via `GET /conversations/my-conversations`; legacy inquiry Kanban removed)`.

**Agent:** `AgentDashboard.jsx:47 → GET /leads/my-leads + GET /commissions/summary (direct api — last remaining bypass, harmless)`; `MyLeads.jsx:30 → GET /my-leads + PATCH stage|follow-up-done`; `VisitManagement.jsx:64,94,143 → GET /visits + PATCH /:id`; `MySales.jsx:14,50 → GET /sales|rentals + GET /:id`; `EMISales.jsx:212 → GET /emi-plans`; `MyCommissions.jsx → GET /commissions|summary` via `commissionService.js` (`efb55b5`); `AgentAnalytics.jsx:2 → GET /analytics/agent + export`.

**Admin:** `AdminDashboard.jsx:3-4 → GET /dashboard/admin + pipeline/metrics`; `VerifyUsers.jsx:2,38 → GET /verifications/pending + PATCH /:id/verify`; `ManageUsers.jsx:8 → /users CRUD+status+reset+delete`; `ManageAgents.jsx:9 → /agents CRUD+status`; `ManageProperties.jsx → /properties + status|end-tenancy|delete`; `VerificationQueue.jsx:19,56,151,321,329 → GET /sales|rentals + verify|reject`; `Commissions.jsx:57,122 → GET + mark-paid (direct)`; `EmiPlans.jsx:518,575 → GET /emi-plans|eligible-sales + POST + GET /sales/:id`; `EmiPlanDetail.jsx:504,591,616 → GET|PATCH /:id|installments|verification`; `Visits.jsx:3,125 → GET /visits + PATCH + GET /agents + convert-to-lead`; `LeadDashboard.jsx:10 → GET /leads + stage|assign + metrics + agents`; `LeadDetail.jsx:55,272 → GET|PATCH /:id + activities + POST /sales|rentals + conversation thread`; `ContactFormDetail.jsx:3 → GET /:id + respond|status|delete|convert`; `ManagementDashboard.jsx:4-5 → GET /property-management + services`; `ManagementRequestDetail.jsx:227,286-287 → GET /:id + accept|decline|terminate|approve + activities`; `ManageServices.jsx:7 → /management-services CRUD+status`; `Analytics.jsx:3 → GET /analytics/admin + export`; `ManageBlogs.jsx:93,194,200 + BlogForm.jsx:119 → GET /blogs + DELETE + POST|PATCH|GET /:id`; `ManageCategories.jsx:11 → /categories CRUD`; `DataArchives.jsx:10 → /admin/archives + restore + jobs/history|run`; `ReviewManagement.jsx:8 → GET /reviews/admin + reply|visibility`.

**Orphan/unmounted (UPDATE `efb55b5` + earlier):** `ManageVisits.jsx` deleted (App uses `Visits.jsx`); `MyAssignedVisits.jsx` already absent; commission pages now go through `commissionService.js` (no more direct-`api` drift); lead sub-views (`LeadList:41, LeadKanban:39, LeadStats:3, ContactFormsInbox:7, CreateLeadModal:2, ConvertToLeadModal:3-4, RespondToContactModal:2`) embedded only; `LeadContext.jsx:9-95` local reducer, no API.

---

## 23. Cross-Module Dependencies

```
ContactForm --auto-convert--> Lead --seed--> Conversation --notify--> owner/agent
Visit --link/sync--> Lead --ensure--> Lead+Conversation --reward--> buyer (BOOK/COMPLETE)
Lead --file--> Sale|Rental (property→reserved, lead→pending_verification) --verify--> Property(sold|rented) + Lead(closed) + CommissionRecord --notify--> agent (+emi_plan_pending if EMI)
Sale(manual status path) --sold--> Property --reward--> buyer/seller/referrer + notify admins
EMI sale(verified) --create--> EMIPlan --installment/verification--> paid/waived --remind(cron)--> buyer+agent
Conversation message --sync--> Lead.activities + notify
ManagementRequest --accept/decline/terminate--> notify owner/admins + activities
Review --write--> reward + notify lister; --reply--> notify author
Auth --verify/login/profile--> rewards (register/email/phone/profile/login/streak/birthday/referral)
Favorite/share --action--> rewards (dedupe per property)
Archival/retention (cron) --move/delete--> Property|Sale|Rental|EMIPlan|ContactForm|Conversation (admin API dry-run + restore for archives)
```

Most connected hub: **Lead** (touched by contact-form, visit, conversation, sale, rental, commission-indirect, notification, reward-indirect). Second: **Property** (listing, visit guard, deal reserve/sold/rented, management link, review scope, favorite/share/view counters).

---

## 24. Public vs Private Data

**Method:** response serializers not fully re-audited per controller here — verify before exposing. Known boundaries:

- **Public:** property listing/detail core (title/price/media/location/status/saleType/details/views), published blogs, property reviews, category lists. Contact-form submit accepts anonymous.
- **Authenticated-user:** own profile (incl. verification docs status), own favorites/listings, own visits/conversations/EMI/wallet/notifications — all scoped by `req.user._id` (notification controller, `my-*` endpoints, EMI `GET /:id` role-branch, conversation `getById` ownership).
- **Owner-only:** own property edit/status/delete (controller owner/admin check), own management-request detail/activities/termination-request (controller ownership check).
- **Agent-only:** assigned leads/visits/sales/commissions (scoped queries: `my-leads`, commission agent-scope, sale `GET /:id` filing/assigned check, visit agent-scope).
- **Admin-only:** user docs (`selfie/citizenship`), verification queue, all leads/visits/conversations/sales/EMI, archives, analytics.

**Flags (UPDATE 2026-09-18 — all four verified/resolved in the Release Flags Audit):**
1. Property detail `listedBy/soldTo/tenant` — verified: contact gated to authed callers on detail, `name`-only on lists, `soldTo`/`tenant` never populated via property routes, `password` never exposed. No change needed.
2. Visit/lead/reason/commission/EMI/verification-docs exposure — verified role-correct across all endpoints (sanitizers applied consistently). No change needed.
3. `GET /management-services` — made public per product decision (`optionalAuth` catalogue read; mutations stay admin-only).
4. `/uploads` static serving kept; stale seed placeholders replaced with schema defaults; runtime uploads are Cloudinary-only.

---

## 25. Missing Functionality

1. **No owner role** — owner/seller/landlord is implicit (INTENDED product term missing in code; all owner flows rely on `listedBy` ownership, not a role).
2. **No buyer checkout/agreement/payment** — purchase/rent consummated off-platform; buyer has no sale/rental detail view, no agreement signing, no payment ledger (EMI is post-verification schedule only, sale-side).
3. **No rental applications/screening/agreements/rent collection** — Rental is a single admin-verified record.
4. **No property approval queue** — `isApproved` defaults true; admin cannot approve/reject listings (only status/delete).
5. **No agent application/approval flow** — admin creates agents directly.
6. **~~No `lead_followup_due` generator~~ RESOLVED** — daily 09:00 cron + `runLeadFollowupReminders` (`59dce10`).
7. **No admin rewards controls** (adjust/revoke) — append-only ledger + wallet read only. (Kept out of scope by product decision.)
8. **~~No public management-service catalogue~~ RESOLVED** — public read shipped.
9. **No buyer sale/rental history page** (only EMI + visits + conversations).
10. **No commission dispute/adjust/split** — single frozen record + paid flag.

---

## 26. Partial Functionality (UPDATE 2026-09-18 — status per item)

1. **Visit assignment — DECIDED, no change:** admin-only confirm is intended; UI already reads "Pending Review"; no rename, no migration.
2. **Lead stages — FIXED (`bd014fe` → `01e8818`):** agents blocked from `closed` (backend 403 authoritative); role-scoped dropdowns (`ADMIN/AGENT_MANUAL_STAGES`); agent→`lost` notifies all admins; admin→`closed` notifies the agent via dedicated `lead_closed`; no duplicates.
3. **EMI verification — SCOPE SATISFIED**, verified intact, not expanded.
4. **Reviews — SCOPE SATISFIED**, verified intact, no owner responses.
5. **Archives/retention — informational summary delivered**, system untouched.
6. **Analytics/export — KPI reference created (`analytics-kpi-reference.md`); export auth gap FIXED (`9c22e66`: non-admin `type=admin` → 403).**
7. **Referrals — FIXED (`bd014fe`):** root cause was legacy accounts lacking codes (pre-save hook is create-only); backfilled lazily on `GET /auth/me` via `ensureReferralCode`. Attribution, dual rewards, wallet untouched.

---

## 27. Conflicting Functionality (UPDATE 2026-09-18)

1. **City vs district find-or-create — FIXED (`e998850`):** both now `protect+authorize('admin')`; owner wizard surfaces 403 via existing error path.
2. **XP ratio — DECIDED 2:1 (`98bb717`):** `xp = yc*2` is canonical; stale 1:1 comment corrected; thresholds untouched.
3. **Agent visit powers — DECIDED:** admin-only triage intended; UI copy already neutral. No scope change.
4. **Manual sold vs deal sold — GATED (`3d1c360`):** manual jump keeps status + attribution + strengthened oversight alert, but grants no rewards and creates no commission; revenue effects are deal-path-only. Past manual-sold rewards explicitly never clawed back (see `release-policy-notes.md`).
5. **`isActive` vs `verificationStatus` vs `isEmailVerified`:** three independent gates (login vs posting vs access) with overlapping error copy — document which gate blocks what; `requireVerified` ignores email/phone state (admin bypasses all). (Unchanged — documentation-level.)

---

## 28. Obsolete / Dead Functionality (UPDATE 2026-09-18)

1. **Legacy inquiries module — REMOVED/REBUILT:** backend inquiry routes deleted (`8b64f3d`); `inquiryService.js` deleted and `RevampedInquiries.jsx` rebuilt on `GET /contact-forms/sent` + `GET /conversations/my-conversations` (`4142053`). Legacy `inquiry_*` notification types remain generator-less but harmless (never written; enum-only).
2. **Orphan pages — CLEANED (`efb55b5`):** `ManageVisits.jsx` deleted (App uses `Visits.jsx`); `MyAssignedVisits.jsx` was already absent.
3. **Embedded-only components** (not dead, but unrouted by design): lead kanban/list/stats, contact inbox, create/convert/respond modals — all composed inside `LeadDashboard`/`Visits`.
4. **`LeadContext`** — local UI reducer only, no API; easily confused with `leadService` (server state). Consider rename.
5. **`isApproved/isFeatured`** — stored, never transitioned by any controller found (featured presumably set via generic update; approval unused since default true).

---

## 29. Unclear / Requires Product Decision (UPDATE 2026-09-18 — decided items struck)

1. ~~Should `reserved` remain bookable~~ — DECIDED: yes, intentional policy (`release-policy-notes.md` R6).
2. ~~Should manual `available→sold` remain~~ — DECIDED: yes with R2 gating (status + attribution + oversight alert, no revenue effects); past rewards never clawed back (`release-policy-notes.md` R6 + R2 addendum).
3. ~~Should agents confirm/reject visits~~ — DECIDED: admin-only triage intended; no rename.
4. ~~Should city find-or-create be admin-only~~ — DECIDED/FIXED: yes (`e998850`).
5. ~~XP:YC = 2:1 or 1:1?~~ — DECIDED: 2:1 canonical (`98bb717`).
6. ~~Should management-service catalogue be public~~ — DECIDED/FIXED: yes, public read.
7. Rental scope: applications/agreements/payments in or out? EMI for rentals in or out (currently sale-only)? — DECIDED: out of scope this release (`release-policy-notes.md` R7).
8. ~~Buyer sale/rental history page~~ — DECIDED: out of scope; EMI + visits + conversations suffice (`release-policy-notes.md` R7).
9. ~~`lead_followup_due` notifications~~ — DECIDED/SHIPPED: daily job (`59dce10`).
10. Verification-docs retention + `/uploads` access control — open: runtime uploads are Cloudinary-only and seed placeholders fixed, but no retention policy documented. Still open.
11. ~~Delete semantics~~ — DECIDED and recorded (`release-policy-notes.md` R10): hard delete outside archive coverage, restore within it, no backfill.
12. Multi-role users — DECIDED: not allowed, and verified to have zero footprint. `User.role` is a single enum string (`user|admin|agent`); role changes via API are rejected with 400 + audit log; agent creation refuses existing emails (409), so no upgrade/dual-hat path exists; seed data contains only single-role accounts. Locked in by B1.18 + live role-change rejection tests. Nothing to remove — no instances can exist by schema.

---

## 30. Critical Findings (UPDATE 2026-09-18 — resolution per row)

| # | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | HIGH | Owner inquiries page was dead (`/inquiries` backend missing) | `RevampedInquiries.jsx`, `server.js` mounts | ✅ FIXED `4142053` (rebuilt on live endpoints) |
| 2 | HIGH | Manual-sold path bypassed commission + verification | `propertyController.js` vs `saleController.js` verify | ✅ GATED `3d1c360` (no revenue effects; oversight alert) |
| 3 | MEDIUM | City find-or-create open to any authed user | `categoryRoutes.js:30-31` | ✅ FIXED `e998850` |
| 4 | MEDIUM | Blog slug route shadowed by `/:id` | `blogRoutes.js:44-46` | ✅ FIXED `e998850` (order swap) |
| 5 | MEDIUM | Agent visit-confirm impossible despite UI/naming | `visitController.js`, `VisitManagement.jsx` | ✅ DECIDED — admin-only intended, labels neutral |
| 6 | MEDIUM | XP≠YC comment/code mismatch | `rewards.js:35` vs `rewardLevels.js` | ✅ DECIDED 2:1, comment fixed `98bb717` |
| 7 | MEDIUM | Public/private population boundary unverified | property/visit/lead populates, `/uploads` | ✅ VERIFIED correct (Release Flags Audit, no change) |
| 8 | LOW | `lead_followup_due` without generator; legacy `inquiry_*` obsolete | `Notification.js` | ✅ PARTLY — generator shipped `59dce10`; `inquiry_*` types remain enum-only/harmless |
| 9 | LOW | Orphans + service-bypass direct `api` calls | `ManageVisits`, commissions pages | ✅ CLEANED `efb55b5` (`AgentDashboard` summary call still direct — harmless) |
| 10 | LOW | EMI verification never auto-marks paid — admin review SLA | `EMIPlan.js`, `emiPlanController.js` | Open — operational SOP, not code |

---

## 31. Recommended Next Audit / Implementation Order (UPDATE 2026-09-18)

Original order with outcomes — items 1–6, 9 (partially) done; remainder is product/SOP territory:

1. ~~Dual-sold-path policy + PII boundary~~ — DONE (R2 gating `3d1c360`; PII verified, no change).
2. ~~Dead inquiries page~~ — DONE (`4142053`).
3. ~~City lock + blog route order~~ — DONE (`e998850`).
4. ~~Agent visit scope~~ — DECIDED (admin-only, no change).
5. ~~XP:YC ratio~~ — DECIDED 2:1 (`98bb717`).
6. ~~`lead_followup_due`~~ — DONE (`59dce10`).
7. Owner lead/visit visibility — partly covered (conversations + rebuilt inquiries); scoped owner-lead inbox still a product decision if wanted.
8. ~~Rental scope + buyer history~~ — DECIDED out of scope (`release-policy-notes.md` R7).
9. ~~Catalogue visibility + docs-upload access~~ — catalogue public; docs-upload retention still open (§29.10).
10. ~~Cleanup pass~~ — DONE (`efb55b5`); `LeadContext` rename deliberately skipped (local-only, harmless).

---

### Appendix — Key file index (evidence anchors)

- Auth/mounts: `backend/server.js:40-134`, `backend/middleware/auth.js:5-94`, `backend/middleware/upload.js:25-89`, `backend/middleware/errorHandler.js:27-34`
- Models: `User.js:31-35,47-151`, `Property.js:11,15-16,22-27,49-52,68-72,82-104,109-131`, `Lead.js:30-41,61-139`, `ContactForm.js:18-29`, `Conversation.js:32-48`, `Visit.js:5-53`, `Sale.js:17-18,117`, `Rental.js:10,63-68`, `CommissionRecord.js:17-43`, `EMIPlan.js:23-26,131-138`, `Review.js:13-37`, `BlogPost.js:41-50`, `Notification.js:7-83`, `PropertyManagementRequest.js:7-85`, `ManagementService.js:8-18`, `RewardTransaction.js:9-35`, `Category.js:9`, `AuditLog.js:10`, `Archive.js:21`, `DataOpsLog.js:12-30`
- Routes: `authRoutes.js:26-37`, `propertyRoutes.js:27-44`, `userRoutes.js:15-25`, `categoryRoutes.js:22-44`, `dashboardRoutes.js:6-7`, `notificationRoutes.js:13-20`, `visitRoutes.js:17-41`, `propertyManagementRoutes.js:6-18`, `managementServiceRoutes.js:6-10`, `blogRoutes.js:19-46`, `leadRoutes.js:9-32`, `contactFormRoutes.js:9-23`, `conversationRoutes.js:6-21`, `saleRoutes.js:9-15`, `rentalRoutes.js:8-15`, `commissionRoutes.js:7-9`, `emiPlanRoutes.js:7-35`, `agentRoutes.js:7-24`, `analyticsRoutes.js:7-10`, `rewardRoutes.js:6-7`, `reviewRoutes.js:16-24`, `archiveRoutes.js:6-13`
- Controllers/utils: `authController.js:28-413`, `propertyController.js:196-603`, `visitController.js:30-875`, `leadController.js:79-1035`, `contactFormController.js:74-467`, `conversationController.js:54-597`, `saleController.js:33-572`, `rentalController.js:30-517`, `emiPlanController.js:113-1295`, `commissionController.js:17-201`, `propertyManagementController.js:90-811`, `userController.js:60-205`, `blogController.js:7-297`, `notificationController.js:7-81`, `rewardController.js:10-48`, `rewards.js:20-43`, `rewardLevels.js:8-56`, `commission.js:6-12`, `emiReminders.js:29-134`, `leadFollowupReminders.js` (added after audit), `leadAutoConversion.js:33-466`, `notify.js:12-57`
- Docs added after audit: `analytics-kpi-reference.md` (KPI definitions), `release-policy-notes.md` (R6/R7/R10/R2 policy of record)
- Frontend: `App.jsx:78-605`, `ProtectedRoute.jsx:5-25`, `PostGate.jsx:18-37`, `DashboardLayout.jsx`, `MyPropertiesLayout.jsx:9-24`, `Sidebar.jsx:23-357`, `accountNav.js:5-44`, `permissions.js:3-23`, `axios.js:2-24`, contexts `AuthContext.jsx:14-131`, `NotificationContext.jsx:15-124`, `ConversationContext.jsx:9-47`, `LeadContext.jsx:9-95`; services `authService.js:11-143`, `propertyService.js:18-125`, `visitService.js:27-134`, `leadService.js:17-173`, `conversationService.js:14-63`, `saleService.js:27-77`, `rentalService.js:24-84`, `emiService.js:22-128`, `commissionService.js:23-45`, `rewardService.js:6-34`, `propertyManagementService.js:18-124`, `managementService.js:13-40`, `contactFormService.js:13-67`, `inquiryService.js:12-63` (dead), `blogService.js:5-63`, `categoryService.js:8-94`, `reviewService.js:5-72`, `userService.js:12-95`, `agentService.js:18-80`, `dashboardService.js:8`, `analyticsService.js:20-47`, `notificationService.js:12-50`, `archiveService.js:14-54`

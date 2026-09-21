# API Contract & Response Schema Audit

> **STATUS (2026-09-18): point-in-time audit — "Current Shape" sections (§§3–5) are
> SUPERSEDED.** B1–B4 trims landed (roster selects, `tempPassword` removal, bounded
> lead populates, DB-pagination for visits, `{success}` blog envelopes). Do not quote
> §§3–5 as current behavior. Preserved for §7 role projections and §13 breaking-change
> analysis (per-endpoint removed/retained + rollback notes), which were not carried
> forward elsewhere — verify against code before acting. Living contract:
> `BATCHED-API-CONTRACT-IMPLEMENTATION-PLAN.md` + `backend/tests/b1-*.js`.

> Scope: `realestate-mern/` — Express + Mongoose backend (`backend/`) and React frontend (`frontend/src/`).
> Method: route → controller → Mongoose query/populate/select → `res.json` → frontend service → component/hook/store field reads.
> Phase: AUDIT AND DESIGN ONLY. No code was changed to produce this report.

---

## 1. Executive Summary

**Current contract state (confirmed):**

- There is **no dedicated DTO / serializer / transformer layer**. Every controller constructs responses inline as `res.json({ success: true, ...doc })`. The only shared backend helpers are `utils/asyncHandler.js:2` (promise → `next()`), `utils/generateToken.js`, `utils/notify.js`, `utils/commission.js`, `utils/rewards.js`. Ad-hoc sanitizers exist in only four places (not shared DTOs).
- **Mongoose documents are the de facto API contract.** `Model.find / findOne / findById` results are returned directly, with `populate()` doing most of the shaping. `select()` is used only for small lookups or dashboard `recentListings`; it is never used to whitelist a list response. `lean()` appears **once** in the entire codebase (`controllers/emiPlanController.js:290`, `getEligibleEmiSales`).
- **Population is generally field-selected, but with material exceptions.** The well-scoped pattern is e.g. `populate('property','title slug media.coverImage price status saleType')` (lead populates include `saleType` to drive the sale/rental filing switch). The bad pattern is `populate('lead')` / `populate('user')` / `populate('favorites')` with no select, plus one deep chain (`Lead → conversationThreads → messages[]`).
- Frontend is plain JSX (zero `.ts/.tsx` files), `utils/axios.js` singleton + `useState/useEffect` + 5 Contexts (`Auth, Notification, Conversation, Lead, Toast/Confirm`). No React Query / SWR / Redux / Zustand. All entity shapes are implicit; the closest to types are `utils/leadConstants.js` enums. This makes “unused field” analysis rely on direct field-access search, plus spread / pass-through / table-row / filter-sort tracking.

**Major confirmed over-fetching areas:**

1. `GET /api/properties` list returns full Property docs; cards use ~12 scalar fields. **Confirmed, High impact.**
2. Favorites (`GET /api/properties/my/favorites` + `GET /api/auth/me` → `populate('favorites')`) returns full Property docs; UI needs card fields / counts. **Confirmed, High impact.**
3. `GET /api/users`, `GET /api/users/:id`, `GET /api/users/verifications/pending` return raw User docs (ID photos, gamification, referral). Tables use 5–6 fields. **Confirmed, High impact + security.**
4. `GET /api/sales` / `GET /api/rentals` lists return full docs + 5 populates; `VerificationQueue.jsx` / `MySales.jsx` immediately `normalize()` to ~10 fields. **Confirmed, Medium–High.**
5. `GET /api/leads` family returns full Lead + 5 well-scoped populates, but `contactForm / visit / user` sub-docs are unread in list tables. **Strong evidence, Medium.**
6. `GET /api/visits` (no `?status`) loads the whole collection into memory then slices in JS, and returns the same rich shape to buyer/agent/admin. **Confirmed, High (perf + contract).**
7. `GET /api/notifications` populates `property{title,slug,coverImage}` that `Notifications.jsx / NotificationBell.jsx` never render; polled every 20 s. **Confirmed, Medium.**
8. `GET /api/emi-plans` list returns full `installments[]` with `verification{slipUrl,notes,...}`; table needs `verification.status` + computed `nextDue / outstanding / overdueCount`. **Strong evidence, Medium.** The EMI module is otherwise the best-designed (list vs detail populates + agent sanitizer).

**Major population-chain issues:**

- `Sale → lead` (no select) and `Rental → lead` (no select) in detail endpoints — leaks `notes, activities, phone, email`. **Confirmed.**
- `Lead → conversationThreads → messages[].sender` — full threads including all `messages[]`; detail page only needs link/existence plus a separate thread component. **Confirmed deep population.**
- `Auth.me → favorites` (no select) and `getFavorites` top-level full docs — unnecessary population. **Confirmed.**
- `ContactForm.respond → populate("user")` (no select) — unnecessary population. **Confirmed.**
- `Commission → sale` populated but never displayed; `Commission → rental` **missing entirely** (rental-origin rows return bare ObjectId). **Confirmed inconsistency, not a leak.**
- `Property → listedBy` scope differs correctly between list (`name,email,phone`) and detail (`+ selfiePhoto, verificationStatus, createdAt`) — but list still sends contact info cards don’t need. **Strong evidence, needs product verification.**

**Confirmed security / data-exposure concerns:**

- Raw User responses (see §8). **Confirmed.**
- Sale/rental detail full-lead exposure. **Confirmed.**
- `respondToContactForm` full-User load + save. **Confirmed.**
- `updateVisit` returns unsanitized full doc (bypasses `sanitizeVisitForViewer`). **Confirmed.**
- `POST /api/users/:id/reset-password` returns `tempPassword` in plaintext JSON. **Confirmed behavior; severity needs verification (admin-only route).**

**Needs verification (not stated as vulnerabilities):**

- `commissionPercentage / effectiveCommissionPercentage / estimatedCommissionAmount` visibility to public/buyer roles (`applyCommissionVisibility` exists but logic needs product sign-off).
- Public `listedBy.email / phone` on `GET /api/properties` list vs detail contact requirement.
- `GET /api/agents` roster readable by `role:agent` (agents can list other agents).

**Contract inconsistencies (confirmed):**

- Blogs: `GET /:id` and `GET /slug/:slug` return **bare documents** (`res.json(blog)`); create/update return `{ message, blog }` (no `success`); every other module returns `{ success: true, ... }`. **Confirmed.**
- Commissions: `sale` populated, `rental` never populated. **Confirmed.**
- Visits: `getMyVisits / getVisitById / cancelMyVisit` sanitize `internalNotes` for buyers; `updateVisit` does not. **Confirmed.**
- Envelopes drift: most lists return `{ success, count, pagination, items }`; blogs return `{ blogs, pagination }`; EMI eligible-sales returns lean DTO `{ success, count, sales[] }`. **Confirmed.**

**Already appropriately designed (do not “fix”):**

- `GET /api/commissions/summary` — pure aggregates `{ success, summary }`. Model to copy.
- `GET /api/emi-plans/eligible-sales` — only `.lean()` + manual DTO mapping in codebase. Model to copy.
- `GET /api/dashboard/admin|my` — `countDocuments` + `select(title price status media.coverImage)` for `recentListings`. Appropriate.
- `GET /api/analytics/*` — pure `aggregate()` + `User.find({_id:$in}).select(name email)`. Appropriate.
- `GET /api/admin/archives` list — `select(-data)` excluding heavy snapshot. Appropriate (only list that excludes a heavy field).
- Lead’s 5-way `LEAD_POPULATE` selects and EMI `LIST_POPULATE` vs `DETAIL_POPULATE` split + `sanitizeForAgent` — fundamentally sound, needs trimming not redesign.
- `maskOwnerIdentity` (conversations), `sanitizeVisitForViewer`, `sanitizeForAgent` (EMI) — correct idea, need consistent application, not removal.

---

## 2. Current API Architecture

### 2.1 Express router / controller structure

- Mount map (`backend/server.js:100-124`): `/api/auth`, `/api/properties`, `/api/users` (all `protect+authorize('admin')` via `routes/userRoutes.js:15`), `/api/categories`, `/api` (empty compat `routes/inquiryRoutes.js`), `/api/dashboard`, `/api/notifications`, `/api/visits` (`router.use(protect)`), `/api/blogs`, `/api/leads`, `/api/contact-forms`, `/api/conversations`, `/api/sales`, `/api/rentals`, `/api/commissions`, `/api/emi-plans` (`router.use(protect)`), `/api/agents`, `/api/analytics`, `/api/rewards`, `/api/reviews`, `/api/admin/archives`.
- Pattern is uniformly `routes/*.js → controllers/*.js → models/*.js`, wrapped in `utils/asyncHandler.js:2`. No service layer; authorization inline (`authorize(...roles)`, `requireVerified`, plus per-handler checks like `canManage` in `leadController.js:72`, filing/lead-agent checks in `saleController.js:329`).
- Auth middleware (`middleware/auth.js`): `protect:5-33` does `User.findById(decoded.id)` with **no select** (full doc on every authenticated request); `optionalAuth:41-60` same but non-blocking (used `propertyRoutes:27,33`, `contactFormRoutes:9`); `authorize:64-74`; `requireVerified:77-94` (admin bypass).
- Uploads (`middleware/upload.js`): `upload` (property 10 MB images), `upload.verification` (2 MB ID docs), `upload.paymentSlip` (5 MB EMI slips), Cloudinary-backed.
- Errors (`middleware/errorHandler.js:2-56`): `{ success:false, message, stack? }`.

### 2.2 Mongoose query / response pattern

- Typical list: `Model.find(query).populate(...).sort().skip().limit()` + `countDocuments` + optional `aggregate $group` for tab counters → `res.json({ success:true, count, items, pagination, countsByX })`. Examples: `propertyController.js:124-145`, `saleController.js:278-315`, `leadController.js:229-250`.
- Typical detail/mutation: `findById → mutate → save → populate(...) → res.json({ success:true, item })`. Examples: `leadController.js:401+`, `emiPlanController.js:534+`.
- **No centralized `sendSuccess` / `ApiResponse` / DTO.** Verified by search: no `DTO`, `serializer`, `transformer`, `presenter`, `toJSON` overrides except `User.toSafeObject()` (`models/User.js:185-190`, deletes only `password`, adds `level`).
- Ad-hoc sanitizers (not shared): `propertyController.js:50 applyCommissionVisibility`, `visitController.js:87 sanitizeVisitForViewer` (strips `internalNotes` for buyers), `conversationController.js:12 maskOwnerIdentity` (strips `messages.sender` for non-admin), `emiPlanController.js:77 sanitizeForAgent` (strips money fields for agents).

### 2.3 `lean()` usage

- Exactly one call: `emiPlanController.js:290` in `getEligibleEmiSales`: `Sale.find({...}).populate(...).sort().lean()` then manual `map/filter/slice` to a DTO-shaped `{ success, count, sales[] }`. Everything else returns hydrated Mongoose documents (with virtuals, getters) directly.

### 2.4 `select()` usage

- Used for: small existence checks (`Property.findById().select('title listedBy status')` in `visitController.js:131`, `contactFormController.js:45`); `_id/title/category` lookups; dashboard `recentListings` (`dashboardController.js:14,74`: `select('title price status media.coverImage createdAt')` with `limit(5)`); `getUnreadCount` (`conversationController.js:295`: `select(inquirer owner messages.side lastMessageAt lastReadAt)`).
- **Never used to whitelist a list response.** Full-schema projection is the default.

### 2.5 `populate()` usage

- Dominant shaping mechanism. Well-scoped examples:
  - `leadController.js:52-66` (`populateLead` / `LEAD_POPULATE`): `assignedAgent:name,email,phone | property:title,slug,media.coverImage,price,status | contactForm:name,email,subject,status,createdAt | visit:visitType,requestedSlot,status | user:name,email`.
  - `saleController.js:279-285`: `property:title,slug,price,status,media.coverImage | lead:name,email,phone | agent:name,email | reviewedBy:name | buyer.user:name,email`.
  - `commissionController.js:43-47` (`COMMISSION_POPULATE`): `property:title,slug,media.coverImage,status | agent:name,email | sale:agreedPrice,paymentType,submittedAt`.
  - `emiPlanController.js:46-53` (`LIST_POPULATE` vs `DETAIL_POPULATE` + phone/buyer-object delta).
- Unscoped exceptions (see §5): `populate('favorites')` (auth + property), `populate('user')` (contactForm respond), `populate({path:'lead'})` no select (sale/rental detail), `populate(conversationThreads)` full threads.

### 2.6 Response envelope patterns

- Standard: `{ success: true, count?, total?, page?, pages?, pagination?, <items|item>, countsByX?, summary?, metrics? }`.
- Bare-doc outliers: `blogController.js:195,222` (`res.status(200).json(blog)`).
- No-`success` outliers: `blogController.js:59,114,165,281` (`{ message, blog }`, `{ blogs, pagination }`).
- File download: `analyticsController.js:705 exportAnalytics` (PDF/CSV via `utils/reportGenerator`), not JSON.

### 2.7 Frontend consumption architecture

- `frontend/src/utils/axios.js`: `baseURL = VITE_API_URL || 'http://localhost:5000/api'`, Bearer from localStorage/sessionStorage, 401 clears auth.
- One service per module (`frontend/src/services/*.js`): `propertyService, saleService, rentalService, leadService, visitService, conversationService, reviewService, commissionService, emiService, userService, agentService, dashboardService, analyticsService, notificationService, rewardService, blogService, categoryService, contactFormService, inquiryService, authService, archiveService`, plus direct `api.get('/commissions')`, `api.get('/conversations/unread-count')`, `api.post('/auth/send-phone-otp|verify-phone')` in components.
- State: `useState/useEffect` per page + Contexts: `AuthContext.jsx` (user/token, wraps authService), `NotificationContext.jsx` (notifications/unread, 20 s poll), `ConversationContext.jsx` (unread, 30 s poll), `LeadContext.jsx` (leads/selectedLead/metrics/filters reducer), `Toast/ConfirmContext.jsx` (UI).
- No TypeScript (0 `*.ts/*.tsx/*.d.ts` files), no React Query / SWR / Redux / Zustand. Field requirements inferred from direct access + spread / child-prop / table-row / filter-sort / conditional / URL / mutation-payload usage (tracked per endpoint in §4).

### 2.8 Layer distinction used throughout this report

1. **Schema** — fields in `backend/models/*.js`.
2. **Projection** — what Mongoose retrieves (`select`, always full here unless noted).
3. **Population** — joined docs (`populate` chains in §5).
4. **Contract** — what `res.json` sends (the actual API promise).
5. **Consumption** — what `frontend/src` reads (evidence in each §4 entry).

A full database document must not automatically become the API response.

---

## 3. Endpoint Inventory

Primary live inventory. `Current Shape` = envelope + whether full docs are sent. `Risk` = over-fetch / exposure risk assessed from consumption evidence (not a score).

| Method | Endpoint | Module | Consumer | Current Shape | Risk |
|---|---|---|---|---|---|
| POST | /api/auth/register | Auth | Register.jsx | `{success,requiresVerification,email,message}` — no doc | Low |
| POST | /api/auth/verify-email | Auth | VerifyEmail.jsx, AuthContext | `{success,token,user:toSafe}` | Low |
| POST | /api/auth/resend-verification | Auth | VerifyEmail.jsx | `{success,message}` | Low |
| POST | /api/auth/send-phone-otp | Auth | Profile.jsx (direct api) | `{success,message}` | Low |
| POST | /api/auth/verify-phone | Auth | Profile.jsx (direct api) | `{success,user:toSafe}` | Low |
| POST | /api/auth/login | Auth | Login.jsx, AuthContext | `{success,token,user:toSafe}` | Low |
| GET | /api/auth/me | Auth | AuthContext, Profile.jsx | `{success,user:toSafe+favorites FULL}` | **High (C/D)** |
| PUT | /api/auth/profile | Auth | Profile.jsx | `{success,user:toSafe}` | Low |
| PUT | /api/auth/change-password | Auth | Profile.jsx | `{success,message}` | Low |
| POST | /api/auth/forgot-password | Auth | ForgotPassword.jsx | `{success,message}` | Low |
| POST | /api/auth/reset-password | Auth | ResetPassword.jsx | `{success,message}` | Low |
| POST | /api/auth/logout | Auth | AuthContext | `{success,message}` | Low |
| GET | /api/properties?... | Property | Home.jsx, PropertyListing.jsx, ManageProperties.jsx, CreateLeadModal.jsx | `{success,count,total,page,pages,properties[] FULL+commission}` | **High (C)** |
| GET | /api/properties/:id | Property | PropertyDetail.jsx, AddEditProperty.jsx | `{success,property FULL,similarProperties[]}` | Medium (detail justified, list-fields in similar) |
| POST | /api/properties | Property | AddEditProperty.jsx | `201 {success,property FULL}` | Low (echo of write) |
| PUT | /api/properties/:id | Property | AddEditProperty.jsx | `{success,property FULL}` | Low |
| PATCH | /api/properties/:id/status | Property | ManageProperties.jsx | `{success,property FULL}` | Low |
| PATCH | /api/properties/:id/end-tenancy | Property | ManageProperties.jsx | `{success,property}` | Low |
| DELETE | /api/properties/:id | Property | ManageProperties.jsx | `{success,message}` | Low |
| POST | /api/properties/:id/favorite | Property | PropertyDetail.jsx | `{success,favorited}` | Low |
| GET | /api/properties/my/favorites | Property | Favorites.jsx, Profile.jsx(count) | `{success,favorites[] FULL}` | **High (C)** |
| GET | /api/properties/my/listings | Property | Profile.jsx(count), ManageProperties.jsx | `{success,count,properties[] FULL}` | **High (C)** |
| POST | /api/properties/:id/share | Property | PropertyDetail.jsx | `{success,shares}` | Low |
| GET | /api/users | Users | ManageUsers.jsx, RevampedInquiries.jsx, Commissions.jsx | `{success,count,users[] RAW}` | **High (C+G)** |
| GET | /api/users/verifications/pending | Users | VerifyUsers.jsx | `{success,count,users[] RAW}` | **High (C+G)** |
| GET | /api/users/:id | Users | ManageUsers.jsx detail | `{success,user RAW}` | **High (G)** |
| PUT/PATCH | /api/users/:id | Users | ManageUsers.jsx | `{success,user:toSafe}` | Medium (toSafe still broad) |
| PATCH | /api/users/:id/status | Users | ManageUsers.jsx | `{success,user:toSafe}` | Medium |
| PATCH | /api/users/:id/verify | Users | VerifyUsers.jsx | `{success,user:toSafe}` | Medium |
| POST | /api/users/:id/reset-password | Users | ManageUsers.jsx | `{success,message,tempPassword PLAINTEXT}` | **High (G)** |
| DELETE | /api/users/:id | Users | ManageUsers.jsx | `{success,message}` | Low |
| GET | /api/categories/property-types | Category | Home, SearchFilterBar, PropertyCategories, AddEditProperty | `{success,propertyTypes[] FULL}` | Low (small docs) |
| GET | /api/categories/districts | Category | Home, SearchFilterBar | `{success,districts[]}` | Low |
| GET | /api/categories/cities | Category | SearchFilterBar, AddEditProperty | `{success,cities[]+district:name}` | Low |
| POST | /api/leads | Leads | CreateLeadModal.jsx | `201 {success,message,lead FULL+pop}` | Low |
| GET | /api/leads | Leads | LeadList.jsx, LeadKanban.jsx | `{success,count,countsByStage?,pagination,leads[] FULL+pop}` | **Medium (C)** |
| GET | /api/leads/my-leads | Leads | MyLeads.jsx, AgentDashboard.jsx(limit:100) | Same as above, scoped | **Medium (C)** |
| GET | /api/leads/by-stage/:stage | Leads | LeadKanban.jsx | Same, stage-filtered | Medium |
| GET | /api/leads/pipeline/metrics | Leads | LeadStats.jsx, AdminDashboard.jsx | `{success,metrics aggregates}` | Low (exemplary) |
| GET | /api/leads/:id | Leads | LeadDetail.jsx | `{success,lead FULL+pop+threads FULL}` | **High (D/E)** |
| PATCH | /api/leads/:id (+stage/assign/reassign/priority/notes/follow-up*) | Leads | LeadDetail.jsx, LeadList.jsx, MyLeads.jsx | `{success,message,lead FULL+pop}` | Medium (echo) |
| GET | /api/leads/:id/suggested-action | Leads | LeadDetail.jsx | `{success,action,reason}` | Low |
| GET/POST | /api/leads/:id/activities | Leads | LeadActivityTimeline.jsx | `{success,activities[]}` / `201` | Low |
| DELETE | /api/leads/:id | Leads | LeadDetail.jsx, LeadList.jsx | `{success,message}` | Low |
| POST | /api/sales | Sales | SubmitSaleModal.jsx | `201 {success,message,sale+pop(title,name)}` | Low |
| GET | /api/sales | Sales | VerificationQueue.jsx, MySales.jsx | `{success,count,sales[] FULL+5pop,pagination,countsByStatus}` | **High (C)** |
| GET | /api/sales/:id | Sales | MySales.jsx modal, EmiPlans.jsx InitEmiModal | `{success,sale FULL+lead FULL}` | **High (D+G)** |
| PATCH | /api/sales/:id/verify | Sales | VerificationQueue.jsx | `{success,message,sale,commission{%,amount,requiresEmiPlan}}` | Medium |
| PATCH | /api/sales/:id/reject | Sales | VerificationQueue.jsx | `{success,message,sale}` | Low |
| POST | /api/rentals | Rentals | SubmitRentalModel.jsx | `201 {success,message,rental}` | Low |
| GET | /api/rentals | Rentals | VerificationQueue.jsx, MySales.jsx | `{success,count,rentals[] FULL+5pop,pagination,countsByStatus}` | **High (C)** |
| GET | /api/rentals/:id | Rentals | MySales.jsx modal | `{success,rental FULL+lead FULL}` | **High (D+G)** |
| PATCH | /api/rentals/:id/verify | Rentals | VerificationQueue.jsx | `{success,message,rental,commission{% manual,amount,leaseValue}}` | Medium |
| PATCH | /api/rentals/:id/reject | Rentals | VerificationQueue.jsx | `{success,message,rental}` | Low |
| POST | /api/visits | Visits | PropertyDetail.jsx (book visit) | `201 {success,message,visit}` no pop | Low |
| GET | /api/visits | Visits | ManageVisits.jsx, VisitManagement.jsx, MyAssignedVisits.jsx | `{success,count,pagination,visits[] FULL+4pop}` in-memory sort when no status | **High (C+H)** |
| GET | /api/visits/my-visits | Visits | MyVisits.jsx | Same envelope, sanitized | Medium (needs buyer trim) |
| GET | /api/visits/:id | Visits | ManageVisits.jsx detail | `{success,visit sanitized}` | Medium |
| PATCH | /api/visits/:id | Visits | ManageVisits.jsx, VisitManagement.jsx | `{success,message,visit UNSANITIZED}` | **Medium (G)** |
| PATCH | /api/visits/:id/cancel | Visits | MyVisits.jsx | `{success,message,visit sanitized}` | Low |
| POST | /api/visits/:id/convert-to-lead | Visits | ManageVisits.jsx | `{success,message,lead+pop,deduped,approved}` | Low |
| POST | /api/conversations | Conversations | Conversations.jsx, LeadConversationThread.jsx | `201 {success,message,conversation masked}` | Low |
| GET | /api/conversations | Conversations | Conversations.jsx (admin) | `{success,count,pagination,conversations[]}` | Medium (dead search filter) |
| GET | /api/conversations/my-conversations | Conversations | Conversations.jsx (all roles) | Same + `unread` + masked | Medium |
| GET | /api/conversations/unread-count | Conversations | ConversationContext.jsx (30 s poll) | `{success,unreadCount}` select-only | Low (exemplary) |
| GET | /api/conversations/:id | Conversations | Conversations.jsx thread | `{success,conversation masked+full messages}` | Medium (thread justified) |
| PATCH | /api/conversations/:id/messages | Conversations | Conversations.jsx, LeadConversationThread | `{success,message,conversation masked}` | Low |
| PATCH | /api/conversations/:id/close|reopen | Conversations | Conversations.jsx | `{success,message,conversation FULL}` | Low |
| DELETE | /api/conversations/:id | Conversations | Conversations.jsx (admin) | `{success,message}` | Low |
| POST | /api/contact-forms | ContactForms | Contact.jsx, PropertyDetail.jsx | `201 {success,message,contactForm}` | Low |
| GET | /api/contact-forms | ContactForms | ContactFormsInbox.jsx | `{success,count,pagination,contactForms[]+pop}` | Medium |
| GET | /api/contact-forms/sent | ContactForms | (sender history) | Same, scoped | Low |
| GET | /api/contact-forms/:id | ContactForms | ContactFormDetail.jsx | `{success,contactForm FULL+pop}` | Medium |
| PATCH | /api/contact-forms/:id/status | ContactForms | ContactFormsInbox.jsx | `{success,message,contactForm}` | Low |
| PATCH | /api/contact-forms/:id/respond | ContactForms | RespondToContactModal.jsx | `{success,message,contactForm}` + full user load | **Medium (D)** |
| POST | /api/contact-forms/:id/convert-to-lead | ContactForms | ConvertToLeadModal.jsx | `{success,message,lead,conversation}` | Low |
| DELETE | /api/contact-forms/:id | ContactForms | ContactFormsInbox.jsx | `{success,message}` | Low |
| GET | /api/reviews/property/:propertyId | Reviews | PropertyDetail.jsx | `{success,reviews[],count,avgRating}` + user(name,selfie) | Low (scoped) |
| POST | /api/reviews | Reviews | PropertyDetail.jsx | `201 {success,review+user}` | Low |
| GET | /api/reviews/eligibility/:propertyId | Reviews | PropertyDetail.jsx | `{success,eligible,reason,alreadyReviewed?,hidden?}` | Low |
| GET | /api/reviews/admin | Reviews | ReviewManagement.jsx | `{success,reviews[],pagination}` + user+property+repliedBy | Medium |
| POST | /api/reviews/:id/reply | Reviews | ReviewManagement.jsx | `{success,review}` | Low |
| PATCH | /api/reviews/:id/visibility | Reviews | ReviewManagement.jsx | `{success,review FULL}` | Low |
| DELETE | /api/reviews/:id | Reviews | PropertyDetail.jsx, ReviewManagement.jsx | `{success,message}` | Low |
| GET | /api/commissions | Commissions | Commissions.jsx, MyCommissions.jsx | `{success,commissions[] FULL+3pop,pagination,totals}` | Medium (F) |
| GET | /api/commissions/summary | Commissions | MyCommissions.jsx, AgentDashboard.jsx | `{success,summary aggregates}` self-scoped | Low (exemplary) |
| PATCH | /api/commissions/:id/mark-paid | Commissions | Commissions.jsx | `{success,message,commission}` | Low |
| POST | /api/emi-plans | EMI | EmiPlans.jsx | `201 {success,message,plan DETAIL}` | Low |
| GET | /api/emi-plans/eligible-sales | EMI | EmiPlans.jsx picker | `{success,count,sales[] LEAN DTO}` | Low (exemplary) |
| GET | /api/emi-plans | EMI | EmiPlans.jsx, EMISales.jsx, MyEMI.jsx | `{success,count,pagination,summary,plans[] FULL+LISTpop}` sanitized for agent | Medium (B) |
| GET | /api/emi-plans/:id | EMI | EmiPlanDetail.jsx, EMISales.jsx, MyEMI.jsx | `{success,plan DETAIL,sanitized?,canManage}` | Medium (detail justified) |
| PATCH | /api/emi-plans/:id (+installments/:n, verification-request/review) | EMI | EmiPlanDetail.jsx, MyEMI.jsx | `{success,message,plan[,progress]}` | Low |
| GET | /api/rewards/wallet | Rewards | Wallet.jsx | `{success?,wallet{xp,ycCoin,level,nextLevel}}` | Low |
| GET | /api/rewards/transactions | Rewards | Wallet.jsx | `{success?,transactions[]}` | Low |
| GET | /api/notifications | Notifications | NotificationContext(20 s), Bell, Notifications.jsx | `{success,notifications[] FULL+property,pagination,unreadCount}` | **Medium (D)** |
| GET | /api/notifications/unread-count | Notifications | NotificationContext | `{success,unreadCount}` | Low |
| PATCH | /api/notifications/* | Notifications | Bell, Notifications.jsx | `{success,...}` | Low |
| DELETE | /api/notifications/* | Notifications | Notifications.jsx | `{success,message}` | Low |
| GET | /api/blogs | Blogs | ManageBlogs.jsx | `{blogs,pagination}` no success | Medium (F) |
| GET | /api/blogs/published | Blogs | BlogList.jsx | Same, author:name | Low |
| GET | /api/blogs/:id | Blogs | BlogForm.jsx | bare `blog` doc | **Medium (F)** |
| GET | /api/blogs/slug/:slug | Blogs | BlogDetail.jsx, Blog.jsx | bare `blog` doc | **Medium (F)** |
| POST/PATCH/DELETE | /api/blogs... | Blogs | ManageBlogs.jsx, BlogForm.jsx | `{message,blog}` / `{message}` | Low |
| GET | /api/dashboard/admin | Dashboard | AdminDashboard.jsx | `{success,stats{14 counts},recentListings[5 selected]}` | Low (exemplary) |
| GET | /api/dashboard/my | Dashboard | (agent/user stats) | Same pattern, scoped | Low |
| GET | /api/analytics/admin | Analytics | Analytics.jsx | `{success,analytics aggregates}` | Low |
| GET | /api/analytics/agent | Analytics | AgentAnalytics.jsx | Same, scoped | Low |
| GET | /api/analytics/export | Analytics | Analytics.jsx, AgentAnalytics.jsx | file download (csv/pdf) | Low |
| GET | /api/agents | Agents | ManageAgents.jsx + agent roster | `{success,count,agents[toSafe+performance],pagination}` | Medium (role scope) |
| POST | /api/agents | Agents | ManageAgents.jsx | `201 {success,agent:toSafe}` | Low |
| GET | /api/agents/:id (+/summary) | Agents | ManageAgents.jsx | `{success,agent\|summary+aggregates}` | Low |
| PUT/PATCH/DELETE | /api/agents/:id... | Agents | ManageAgents.jsx | `{success,agent}` / `{success,message}` | Low |
| GET | /api/admin/archives (+:id, jobs/history) | Archives | DataArchives.jsx | list `select(-data)`; detail full `data` | Low (exemplary list) |
| POST | /api/admin/archives/:id/restore, /jobs/:job/run | Archives | DataArchives.jsx | `{success,...}` via DataOpsLog | Low |

See Appendix B for dead/legacy routes excluded above.

---

## 4. Detailed Endpoint Audit

Conventions: **Classification** uses A Appropriate, B Minor, C Significant, D Unnecessary population, E Deep chain, F Inconsistency, G Security/exposure, H Architectural redesign, I Cannot determine. **Recommended target** uses only real schema fields.

### GET /api/properties

**Purpose:** Public paginated property search/filter/sort (keyword, type, city/district, price, bedrooms/bathrooms, status, saleType, featured).

**Authentication / roles:** `optionalAuth` (`propertyRoutes.js:27`). Commission fields visibility varies by `req.user?.role` via `applyCommissionVisibility`.

**Known consumers:** `pages/public/Home.jsx` (`{featured:true,limit:3}`, `{limit:6}`), `pages/public/PropertyListing.jsx` (full `searchParams`), `pages/admin/ManageProperties.jsx` (`{page,limit:10,keyword,status,sort}`), `CreateLeadModal.jsx` (property picker).

**Backend query:** `propertyController.js:124-134`: `Property.find({isArchived:false,isApproved:true,...}).populate(propertyType name,defaultCommissionPercentage).populate(location.city name).populate(location.district name).populate(listedBy name,email,phone).sort.skip.limit` + `countDocuments`. No `select`, no `lean`. Then `properties.map(applyCommissionVisibility)`.

**Populate chain:** `propertyType{name,defaultCommissionPercentage}` ✓; `location.city{name}`, `location.district{name}` ✓; `listedBy{name,email,phone}` — contact info on every list row.

**Current response shape:** `{ success, count, total, page, pages, properties: FullProperty[] }` where FullProperty = all `Property.js` fields (`title,slug,description,propertyType,saleType,price,currency,negotiable,commissionPercentage,location{...12 fields},details{...17 fields},media{coverImage,images[],video},status,isApproved,isFeatured,isArchived,views,shares,listedBy,soldTo,soldAt,rentedFrom,rentedUntil,tenant,timestamps` + computed `effectiveCommissionPercentage,estimatedCommissionAmount` for agent/admin).

**Fields returned:** All of the above.

**Fields actually consumed:** `PropertyCard.jsx / Home.jsx / PropertyListing.jsx / Favorites.jsx`: `_id|slug,status,saleType,media.coverImage,title,price,currency,negotiable,location.city.name|municipality,location.district.name,details.bedrooms|bathrooms|landArea|landAreaUnit,effectiveCommissionPercentage?,estimatedCommissionAmount?`. `ManageProperties.jsx` table: `_id,title,slug,price,currency,media.coverImage,status,listedBy._id,createdAt`. `AdminDashboard.jsx` recent: `_id,title,price,media.coverImage,status`.

**Unconsumed fields:** In list context: `description, media.images, media.video, listedBy (except _id for ownership check), details.* except 4 fields, location.streetAddress|wardNumber|province|mapLocation|country, views, shares, soldTo/soldAt/tenant/*, isArchived/isApproved, timestamps (except createdAt in admin sort)`.

**Nested documents returned:** `propertyType, city, district, listedBy` (all appropriately selected except listedBy scope).

**Nested fields actually consumed:** `propertyType.name` (filter chip), `city.name/district.name` (subtitle). `listedBy.email/phone` never rendered in cards.

**Over-fetching classification:** **C — Significant over-fetching.** List returns detail-weight docs; each of 12-per-page rows carries `description + images[] + full details + full location`.

**Security/exposure classification:** No secret leak, but public list exposes `listedBy.email/phone` and commission internals to anonymous callers — **needs verification** (see §8).

**Contract concerns:** **F/H** — list shape == detail shape (minus detail-only `similarProperties`); no lightweight list representation.

**Evidence:**
- Backend `backend/controllers/propertyController.js:124-145`.
- Frontend `frontend/src/components/PropertyCard.jsx` (reads coverImage/title/price/city/district/bedrooms/bathrooms/landArea), `frontend/src/pages/public/PropertyListing.jsx` (sort `newest|oldest|price_low|price_high` + page), `frontend/src/pages/admin/ManageProperties.jsx` (table fields + client filter on `title/description/status`).

**Recommended target representation:**
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
Detail `GET /:id` keeps full doc + `listedBy{_id,name,selfiePhoto,verificationStatus,createdAt,phone?,email?}` + `similarProperties[]` in list shape.

---

### GET /api/properties/:id

**Purpose:** Public detail by id-or-slug + 4 similar + view-count increment.

**Authentication / roles:** `optionalAuth`.

**Known consumers:** `PropertyDetail.jsx` (full render + inquiry/visit forms + reviews), `AddEditProperty.jsx` (`data.property` form init).

**Backend query:** `propertyController.js:156-...`: `findOne({_id|slug})`, `views+=1;save()`, `Property.find({_id:$ne,propertyType}).limit(4).select(title price media.coverImage location status slug)`; populates `propertyType{name,category,defaultCommissionPercentage} | city{name} | district{name} | listedBy{name,email,phone,selfiePhoto,verificationStatus,createdAt}`.

**Populate chain:** Appropriate for detail; similar-properties select is already list-minimal (good pattern).

**Current response shape:** `{ success, property: FullProperty+listedByDetail, similarProperties: MinimalProperty[4] }`.

**Fields actually consumed:** All major groups: `description, details.{landArea,builtUpArea,bedrooms,bathrooms,floors,parkingSpaces,facingDirection,roadAccess,roadFrontage,furnishedStatus,constructionYear,waterSupply,electricity,internetAvailability}, location.{streetAddress,municipality,wardNumber,city.name,district.name,province,mapLocation}, media.{coverImage,images,video}, listedBy.{_id,name,selfiePhoto,verificationStatus,createdAt,phone,email}, similarProperties→PropertyCard`.

**Classification:** **A — Appropriate.** Detail weight is justified. Minor note: `listedBy.phone/email` conditional on ownership/role should be confirmed (see §7).

**Evidence:** Backend `propertyController.js:151-...`; frontend `PropertyDetail.jsx` (conditional `status==='sold'|'reserved'`, `isOwnListing(listedBy._id)`, `negotiable`, `MapView lat/lng`, `ImageGallery coverImage/images`).

**Recommended target:** Keep current shape; only formalize `listedBy` contact visibility rule.

---

### GET /api/properties/my/favorites + GET /api/auth/me (favorites)

**Purpose:** Buyer’s saved-properties list; `me` bootstraps session + favorites.

**Authentication / roles:** `protect` (any logged-in user).

**Known consumers:** `Favorites.jsx` (cards), `Profile.jsx` (`favorites.length` count only), `AuthContext.jsx` (session user).

**Backend query:** `propertyController.js:533-537`: `User.findById.populate({path:'favorites',populate:[propertyType select name]})` — top-level favorites **full docs**; `authController.js:362`: `User.findById.populate('favorites')` — full docs incl `commissionPercentage, listedBy`.

**Populate chain:** `favorites[]` unselected (D); nested `propertyType:name` selected but irrelevant when parent is full.

**Current response shape:** `{ success, favorites: FullProperty[] }`; `me`: `{ success, user: toSafe+favorites:FullProperty[] }`.

**Fields actually consumed:** Card fields only (same 12 as §GET /properties) + count.

**Unconsumed fields:** Same as property list + `description, images, listedBy full, details full`.

**Classification:** **C + D — Significant + Unnecessary population.**

**Security:** Favorites leak `commissionPercentage` and `listedBy` contact to any buyer. Needs verification but low sensitivity.

**Evidence:** Backend `propertyController.js:533-536`, `authController.js:361-362`; frontend `Favorites.jsx`, `Profile.jsx:78-85` (`favorites→length`).

**Recommended target:** Return list-shape properties (same DTO as §GET /properties target); `me` should return `favorites: [ObjectId]` or count, with full cards only from `/my/favorites`.

---

### GET /api/users, GET /api/users/:id, GET /api/users/verifications/pending

**Purpose:** Admin user roster, single user, ID-verification queue.

**Authentication / roles:** `protect+authorize('admin')` (`userRoutes.js:15`).

**Known consumers:** `ManageUsers.jsx` (`_id,name,email,role,verificationStatus,isActive`), `VerifyUsers.jsx` (+ `selfiePhoto,citizenshipPhotoFront|Back,verificationNote`), `RevampedInquiries.jsx` / `CreateLeadModal.jsx` / `ManageVisits.jsx` (agent dropdowns), `Commissions.jsx` (`GET /users?role=agent` direct).

**Backend query:** `userController.js:36`: `User.find({role, $or name/email regex}).sort` — no select; `:44`: `findById` — no select; `:165`: `find({verificationStatus:pending})` — no select. Responses `res.json({success,count,users})` / `{success,user}` **raw** (not `toSafeObject`). Mutations (`updateUser, toggleStatus, verifyUser`) do return `toSafeObject()`.

**Current response shape:** Full User: `name,email,phone,role,agentProfile{licenseNumber,employeeId,joinedAt},avatar,isActive,isEmailVerified,selfiePhoto,citizenshipPhotoFront|citizenshipPhotoBack,verificationStatus,verificationNote,verifiedAt,favorites[],xp,ycCoin,referralCode,referredBy,lastLoginDate,loginStreak,...timestamps` (password excluded by `select:false`, but verification hashes are `select:false` yet still loaded on `findById` without select in some paths — must audit).

**Fields actually consumed:** Roster: 6 fields. Verification queue additionally needs ID photos + note. Nothing needs `xp,ycCoin,referralCode,referredBy,loginStreak,favorites,emailVerification*`.

**Classification:** **C — Significant; G — Security/exposure (confirmed).** Admin-only scope mitigates external risk but violates least-privilege (support/admin sees gamification, referral graph, ID docs outside verification flow) and conditions frontend to depend on full docs.

**Evidence:** Backend `userController.js:19-45,164-172`; `models/User.js:5-...`; frontend `ManageUsers.jsx`, `VerifyUsers.jsx`.

**Recommended target:**
```json
{ "success": true, "count": 1, "users": [{ "_id": "...", "name": "...", "email": "...", "phone": "...", "role": "agent", "verificationStatus": "verified", "isActive": true, "createdAt": "..." }] }
```
Verification-pending detail adds `selfiePhoto, citizenshipPhotoFront, citizenshipPhotoBack, verificationNote`. Full `toSafeObject` only for self-profile / single-agent performance view.

---

### POST /api/users/:id/reset-password

**Purpose:** Admin password reset.

**Backend:** `userController.js:120-124` returns `{ success, message, tempPassword }` in plaintext JSON.

**Consumers:** `ManageUsers.jsx`.

**Classification:** **G — Confirmed behavior.** Admin-only route, but temp credential in response body is logged/cached by intermediaries; requires out-of-band review (see §8).

**Recommended target:** Return `{ success, message }` only; deliver credential via existing secure channel or force-reset flow; audit `AuditLog` entry already emitted.

---

### GET /api/sales + GET /api/sales/:id

**Purpose:** Verification queue (admin) + filing-agent deal list; detail modal + EMI-init prefill.

**Authentication / roles:** List `auth+admin,agent` with agent force-scope `query.agent=req.user._id` (`saleController.js:224-233`); detail `auth` + filing/lead-agent-or-admin gate (`:329-337`).

**Known consumers:** `VerificationQueue.jsx:29-52 normalize()` → `{_id,status,property,agent,headline,subLines}`, reads `property{title,price},agent{name},submittedAt,reviewedBy{name},reviewedAt,rejectionReason,remarks,buyer{name,phone,email,user},agreedPrice,paymentType,downPaymentAmount,commission.requiresEmiPlan`; `MySales.jsx:27-45 normalize()` + detail modal (+ `activities[{message,type,byName,createdAt}]`); `EmiPlans.jsx InitEmiModal` (`sale._id,property.title,buyer{name,email},agent.name,agreedPrice,downPaymentAmount,status,paymentType`).

**Backend query (list):** `saleController.js:278-294`: `Sale.find(query).populate(property title,slug,price,status,media.coverImage).populate(lead name,email,phone).populate(agent name,email).populate(reviewedBy name).populate(buyer.user name,email).sort.skip.limit` + `count` + `aggregate $group status`. Full Sale docs otherwise (`lead,property,agent,buyer{name,phone,email,user},agreedPrice,paymentType,downPaymentAmount,status,submittedBy,submittedAt,reviewedBy,reviewedAt,rejectionReason,remarks,activities[],timestamps`).

**Backend query (detail):** `:324` gate `populate('lead','assignedAgent')`, then `:346+` second populate `[{property:select...},{path:'lead'} NO SELECT,{agent:name,email},{reviewedBy:name},{buyer.user:name,email,phone}]` → full Lead embedded.

**Fields actually consumed:** See consumers above. `sale.lead` full object never rendered in tables; `buyer.user` only for “Registered” chip; `commission.sale{agreedPrice,paymentType}`-style transient post-verify only.

**Classification:** List **C** (large docs × queue polling), Detail **D + G** (unnecessary + sensitive full-lead).

**Evidence:** Backend `saleController.js:219-360`; frontend `VerificationQueue.jsx`, `MySales.jsx`, `EmiPlans.jsx`.

**Recommended target (list):** `{ _id,status,property{_id,title,slug,price,status,media{coverImage}},agent{_id,name},buyer{name,phone,email,registered:boolean},agreedPrice,paymentType,downPaymentAmount,submittedAt,reviewedBy{name}?,reviewedAt?,countsByStatus,pagination }` — drop `lead` object (keep `lead:_id`), drop `buyer.user` object (keep boolean), drop `activities/remarks/rejectionReason` from list (detail only). **Detail:** same + `lead{_id,name,email,phone,stage,assignedAgent{name}}` selected + `remarks,activities,rejectionReason`.

---

### GET /api/rentals + GET /api/rentals/:id

Mirrors sales. Consumers identical files + `SubmitRentalModel.jsx`. Reads: `_id,status,property.title,agent.name,submittedAt,reviewedBy,reviewedAt,rejectionReason,remarks,tenant{name,phone,email,user},monthlyRent,durationInMonths,securityDeposit`, computed `monthlyRent*duration`. Detail `rentalController.js:310-316` populates `{path:'lead'}` with no select — same **D+G**. List **C**. Target: list `{_id,status,property,agent,tenant{name,phone,email,registered},monthlyRent,durationInMonths,securityDeposit,submittedAt,...}` without `lead` object/`activities`; detail adds selected lead + `activities`.

---

### GET /api/leads, /my-leads, /by-stage/:stage + GET /api/leads/:id

**Purpose:** Pipeline tables/kanban (admin+agent) + full lead workspace.

**Authentication / roles:** Lists `auth+admin,agent` with `scopeQueryForRole`; detail `auth` + `canManage` (`leadController.js:72`).

**Known consumers:** `LeadList.jsx` table (`_id,name,email,source,property.title,stage,priority,assignedAgent._id|name,nextFollowUp,lastActivity|updatedAt`), `LeadCard.jsx` (+`phone,dealType`), `LeadDetail.jsx` (`_id,name,stage,dealType,source,email,phone,user.name,property{title,saleType},createdAt,closedAt,contactForm._id,visit{requestedSlot,status},assignedAgent._id,priority,category,notes,nextFollowUp,activities,suggestion{reason}`), `AgentDashboard.jsx/MyLeads.jsx` (subset), `LeadStats.jsx/AdminDashboard.jsx` (`metrics{totalLeads,activeLeads,conversionRate,overdueFollowUps,newThisWeek,topAgent}`).

**Backend query:** `leadController.js:229-250`: `Lead.find(buildLeadQuery+scopeQueryForRole).sort.skip.limit` + `count` + optional `aggregate $group stage`. `populateLead:52-58` / `LEAD_POPULATE:60-66` — all five populates field-selected (good). Detail `:361-371`: `findById.populate(LEAD_POPULATE).populate({path:conversationThreads,populate:[inquirer:name,email|owner:name,email|property:title|messages.sender:name]})` — threads **full docs incl `messages[]`**; response adds `activities desc`.

**Fields actually consumed vs returned:** List tables ignore `contactForm{name,email,subject,status},visit{visitType,requestedSlot,status},user{name,email}` except as existence/link; they dominate payload × pagination. Detail ignores full `messages[]` (separate `LeadConversationThread` fetches via conversation endpoints).

**Classification:** List **B/C (minor–significant)** — base Lead doc itself is needed (stage/priority/notes/followUp), sub-docs are the excess. Detail **E (deep chain)** for threads.

**Evidence:** Backend `leadController.js:40-75,195-371,756-...`; frontend `LeadList.jsx`, `LeadDetail.jsx:391-408` (`<LeadActivityTimeline lead> <LeadConversationThread lead> <SubmitSaleModal lead property>` pass-through), `AgentDashboard.jsx:61-72` (client sort 100 leads for urgent 5).

**Recommended target:** List: `Lead` base + `property{title,slug,price,status,coverImage?} + assignedAgent{_id,name}` only; `contactForm,visit,user` → `_id` links (detail resolves). Detail: full base + selected 5-pop + `conversationThreads:[{_id,property{title},lastMessageAt,isActive}]` (no `messages[]`); messages via `GET /conversations/:id`.

---

### GET /api/visits, /my-visits, /:id, PATCH /:id

**Purpose:** Visit scheduling lifecycle across buyer/agent/admin.

**Authentication / roles:** `router.use(protect)`; list `authorize(admin,agent)` with agent force-scope; `my-visits` own; `:id` requester/agent/admin; `PATCH :id` admin/agent; `cancel` requester; `convert-to-lead` admin.

**Known consumers:** `ManageVisits.jsx` (admin: `_id,requestedBy{name,email,phone},visitType,property.title,buyerNotes,requestedSlot,assignedAgent.name|_id,status,convertedLead{_id,name,stage},internalNotes`), `VisitManagement.jsx/MyAssignedVisits.jsx` (agent: same minus assign + `property.slug|_id,internalNotes` edit), `MyVisits.jsx` (buyer: `_id,visitType,property{title,slug,_id,coverImage},status,requestedSlot,assignedAgent{name,phone,email},buyerNotes`), `LeadDetail.jsx` (`lead.visit.requestedSlot|status`), `PropertyDetail.jsx` (`createVisit`).

**Backend query:** `visitController.js:282-304`: `find(query).populate(VISIT_POPULATE=[property:title,slug,media.coverImage,address,district|requestedBy:name,email,phone|assignedAgent:name,email|convertedLead:name,stage])`. **If no `?status`, loads ALL then in-JS priority sort + slice** (not DB pagination). `getMyVisits:332` same shape + `sanitizeVisitForViewer(false)` (strips `internalNotes`); `getVisitById:358` adds `property.listedBy`, `requestedBy/assignedAgent phone`; `updateVisit:400` returns full doc **unsanitized**.

**Classification:** **C + H** — same rich shape to three roles with different needs + in-memory pagination is architectural. `updateVisit` sanitize gap is **G**.

**Evidence:** Backend `visitController.js:87,97-400,662-729+`; frontend `ManageVisits.jsx`, `VisitManagement.jsx`, `MyVisits.jsx`.

**Recommended target:** Buyer list/detail: `{_id,visitType,property{_id,title,slug,coverImage},requestedSlot,status,assignedAgent{name,phone},buyerNotes}` (no `requestedBy,internalNotes,convertedLead`). Agent/admin list: + `requestedBy{name,phone},internalNotes,convertedLead{_id,stage}`. Fix pagination: DB `sort/skip/limit` + `count` for all branches (remove in-JS full-load). `updateVisit` must apply `sanitizeVisitForViewer(req.user)` before `res.json`.

---

### GET /api/conversations, /my-conversations, /:id (+messages/close/reopen)

**Purpose:** Buyer↔owner threads, incl lead-linked threads.

**Authentication / roles:** `auth`; list-all `admin`; `my-conversations` any; `:id` participant-or-admin; `close` owner/admin; `reopen/delete` admin.

**Known consumers:** `Conversations.jsx`: list (`_id,inquirer{_id,name},owner.name,property{title,coverImage},lastMessageAt,isActive,unread`); thread (`_id,property.title,inquirer.name,owner.name,isActive,messages[{_id,side,senderName,body,createdAt}]` + `viewerSide`); client search on `property.title|otherPartyName` for non-admin. `LeadConversationThread.jsx`: `lead.conversation|messages,startConversation/addMessage/close`.

**Backend query:** `conversationController.js:210-220`: `find({isActive?,$or inquirer.name/owner.name regex — dead on ObjectIds}).populate(inquirer:name,email|owner:name,email|property:title)`; `my:253` + `property media.coverImage` + masked + `unread`; `:314` + `property slug,coverImage | messages.sender:name` + `lastReadAt[side]` stamp; `addMessage:379` re-populates; `close/reopen:490/535` return full doc; `maskOwnerIdentity:12` strips `messages.sender` for non-admin (correct).

**Classification:** **B + H/F** — populates are minimal and masking is correct; issues are dead search filter (F) + client-side filtering of full pages for agent/user (H) + full-doc close/reopen echo (B).

**Evidence:** Backend `conversationController.js:12-568`; frontend `Conversations.jsx:207-215,404-407`, `LeadConversationThread.jsx`.

**Recommended target:** Keep shapes; fix search to query populated fields via aggregate/`$lookup` or remove; add server `?search=` + pagination for non-admin (remove client filter); `close/reopen` return masked shape consistent with detail.

---

### GET /api/commissions, /summary

**Purpose:** Payout queue (admin: all agents + totals + mark-paid) + agent wallet cards.

**Authentication / roles:** `protect+admin,agent`; summary always self-scoped `me=req.user._id:122`.

**Known consumers:** `Commissions.jsx` (admin) + `MyCommissions.jsx` (agent): `_id,property{title,slug,coverImage},agent{name,email} (admin only),transactionAmount,commissionPercentage,commissionAmount,isPaid,paidAt,paidNote,pagination,totals{totalPaidAmount,pendingAmount,paidCount,pendingCount},summary{thisMonthEarned,thisMonthPaid,pending,pendingCount,lifetimePaid,lifetimePaidCount}`; `AgentDashboard.jsx` repeats 3 summary fields.

**Backend query:** `commissionController.js:74-98`: `find(filter).populate(COMMISSION_POPULATE).sort.skip.limit` + `count` + `aggregate $group paid/pending`. `COMMISSION_POPULATE:43-47` = `property:title,slug,media.coverImage,status|agent:name,email|sale:agreedPrice,paymentType,submittedAt` — **no `rental` entry**, so rental-origin rows serialize `rental:ObjectId`.

**Classification:** **B + F** — minor over-fetch (`sale{agreedPrice,paymentType}` never displayed in tables) + missing rental population (incomplete, not leak). Summary endpoint is **A**.

**Evidence:** Backend `commissionController.js:43-164`; frontend `Commissions.jsx`, `MyCommissions.jsx`, `AgentDashboard.jsx`.

**Recommended target:** List keeps `property+agent(selected)` + amounts + `paid*`; populate `rental{_id}` or `rental{monthlyRent,durationInMonths}` symmetric to sale, or explicitly document `source:{kind:'sale'|'rental',ref}`. Drop `sale{agreedPrice,paymentType}` from list unless queue table adds a column (detail can keep).

---

### GET /api/emi-plans, /:id, /eligible-sales

**Purpose:** Installment lifecycle across admin (full mgmt), agent (schedule-only), buyer (own plan + slip upload).

**Authentication / roles:** `router.use(protect)`; create/update/installment/review `admin`; `eligible-sales` `admin`; list `admin,agent,user` with role branch; `:id` admin/agent/buyer gates; `verification-request` `user`.

**Known consumers:** `EmiPlans.jsx` table (`_id,buyer.name,property.title,nextDueInstallment{dueDate,amount},outstandingBalance,status,overdueCount,installments[].verification.status,summary{activePlans,dueThisMonth,overdueInstallments,totalOutstanding,pendingVerifications}`); `EmiPlanDetail.jsx` (admin full: `principalAmount,tenureMonths,installmentAmount,startDate,totalPaid,outstandingBalance,status,buyer{name,email},agent.name,property.title,installments[{installmentNumber,dueDate,amount,status,paidDate,paidAmount,remarks,verification{status,requestedAmount,requestedDate,note,paymentSlipUrl,reviewNote,submittedAt}}],canManage`); `EMISales.jsx` (agent schedule-only: `property.title,buyer.name,nextDue.dueDate,status,overdueCount,installments[{installmentNumber,dueDate,status,paidDate,verification.status}]` — never reads amounts); `MyEMI.jsx` (buyer: admin-minus-mgmt + `principalAmount,totalPaid,progress,inst.amount|paidAmount|note|reviewNote`).

**Backend query:** `LIST_POPULATE:46=[property:title,slug,coverImage|buyer:name,email|agent:name,email|sale:agreedPrice,paymentType]`, `DETAIL_POPULATE:53` same + `phone` + buyer object on sale. `getEligibleEmiSales:277-...`: `EMIPlan.distinct(sale)` + `Sale.find({status:verified,paymentType:emi,...}).populate(...).sort().lean()` + manual map/filter/slice → DTO. `getEmiPlans:416`: `find(query+$elemMatch installments).populate(LIST).sort.skip.limit` + `count` + `aggregate $facet` summary; agent branch `sanitizeForAgent:77` strips money. `getEmiPlanById:496` `findById.populate(DETAIL)` + `canManage`.

**Classification:** **B — Minor; architecture A.** List/detail split + role sanitizer + lean DTO already exist; only excess is full `installments[].verification` objects in list.

**Evidence:** Backend `emiPlanController.js:46-1164`; frontend `EmiPlans.jsx`, `EmiPlanDetail.jsx`, `EMISales.jsx`, `MyEMI.jsx`.

**Recommended target:** List `installments` → `[{installmentNumber,dueDate,status,verification:{status}}]` (+ computed `nextDue,outstanding,overdueCount,totalPaid`); detail keeps full `DETAIL_POPULATE` + `verification{...slipUrl,notes}` + `activities`. Copy `eligible-sales` lean pattern to other pickers.

---

### GET /api/notifications (+unread-count, read, delete)

**Purpose:** Recipient-scoped inbox + bell badge.

**Authentication / roles:** `protect`, always `recipient=req.user._id`.

**Known consumers:** `NotificationContext.jsx` (`fetchNotifications({filter,limit:30})`, 20 s poll), `NotificationBell.jsx:294` (`recent=slice(0,6)`), `Notifications.jsx` (group by day). Render: `_id,type,title,message,isRead,createdAt,link`; `type` → icon/tint map only.

**Backend query:** `notificationController.js:7-25`: `find({recipient,isRead?}).populate(property title,slug,media.coverImage).sort.skip.limit` + `count` + unread count. Full Notification docs otherwise (`recipient,type,title,message,inquiry,contactForm,lead,conversation,visit,property,sale,rental,commissionRecord,emiPlan,link,isRead,readAt,timestamps`).

**Classification:** **D — Unnecessary population.** `property{...}` never rendered; all `*_id` link fields unread (navigation uses `link` string).

**Evidence:** Backend `notificationController.js:7-77`; `models/Notification.js:3`; frontend `NotificationContext.jsx`, `NotificationBell.jsx`, `Notifications.jsx`.

**Recommended target:** `{ _id,type,title,message,link,isRead,createdAt }` only; drop `populate(property)`; keep `unreadCount+pagination`. Deep-link needs resolve via `link`, not embedded docs.

---

### Blogs (GET /api/blogs, /published, /:id, /slug/:slug, POST/PATCH/DELETE)

**Purpose:** Admin CMS + public reader.

**Authentication / roles:** Mutations + `GET /` `protect+admin`; `/published`, `/:id`, `/slug/:slug` public (`getBlogBySlug` manually checks token to reveal drafts to admin).

**Known consumers:** `BlogList.jsx/BlogDetail.jsx` (public: `_id,title,slug,body(excerpt),coverImage,tags[],status,author.name,publishedAt,pagination`), `ManageBlogs.jsx/BlogForm.jsx` (admin: same + `author.email` on list/detail), `Blog.jsx` component.

**Backend query:** `blogController.js:103`: `find({status?,title regex}).populate(author name,email).sort.skip.limit` + `count` → `{ blogs, pagination }` (no `success`); `:154` same with `author name`; `:187` `findById.populate(author name,email)` → `res.status(200).json(blog)` bare; `:212` `findOne({slug,status}).populate(author name)` → bare; create/update → `{ message, blog }`.

**Classification:** **F — Contract inconsistency** (only bare-doc returns in codebase). Payload itself is appropriate (blog body is the resource).

**Evidence:** Backend `blogController.js:7-296`; frontend `BlogList.jsx`, `BlogDetail.jsx`, `ManageBlogs.jsx`, `BlogForm.jsx`.

**Recommended target:** `{ success:true, blog }` / `{ success:true, blogs, pagination }` (additive `success` flag; keep `blog` shape). Breaking only for strict `response.blogs`-vs-`response`-shape parsers — coordinate one frontend pass.

---

### Dashboard / Analytics (GET /api/dashboard/admin|my, GET /api/analytics/admin|agent|export)

**Purpose:** Ops counters + charts + CSV/PDF export.

**Authentication / roles:** Dashboard admin `protect+admin`, `my` `protect`; analytics admin `protect+admin`, agent `protect+admin,agent` with scope.

**Known consumers:** `AdminDashboard.jsx` (`stats{total,available,reserved,sold,rented,totalUsers,newInquiries,pendingSaleVerifications,pendingRentalVerifications,agentCount,pendingVerifications}, recentListings[]{_id,title,price,media.coverImage,status}`), `Analytics.jsx` (`salesOverTime[{month,count,value}],rentalsOverTime,commissions{earnedTotal,paidAmount,paidCount,pendingAmount,pendingCount},emiPortfolio{totalOutstanding,activePlans,overdueInstallments},agentLeaderboard[{agentId,name,email,salesCount,salesValue,...}],pipeline{countsByStage,...}`), `AgentAnalytics.jsx` (scoped performance/commissions/EMI/series).

**Backend query:** `dashboardController.js:13-74`: 14× `countDocuments` + `Property.find().sort.limit(5).select(title price status media.coverImage createdAt)`; `analyticsController.js:259,642,656-705`: pure `aggregate()` + `User.find({_id:$in}).select(name email)`; export via `utils/reportGenerator`.

**Classification:** **A — Appropriate.** Aggregate/summary responses, no domain-doc dumps. Preserve as pattern for future summary endpoints.

**Evidence:** Backend `dashboardController.js`, `analyticsController.js`; frontend `AdminDashboard.jsx`, `Analytics.jsx`, `AgentAnalytics.jsx`.

---

### Other materially relevant endpoints

- **Reviews** (`reviewController.js:90-273`): `getPropertyReviews:104` (`find({property,isVisible:true}).populate(user name,selfiePhoto).populate(adminReply.repliedBy name)` + JS `avgRating`) — consumed fully by `PropertyDetail.jsx` (`_id,user{_id,name,selfiePhoto},rating,comment,adminReply{text,repliedBy.name},avgRating,count,eligibility`) and `ReviewManagement.jsx` (+`user.email,property{title,slug,_id},isVisible,createdAt`). **A.** `getAdminReviews:195` adds `user email + property title,slug` — justified. **A.**
- **Rewards** (`rewardController.js:10-29`): `getWallet` → `wallet{xp,ycCoin,level,nextLevel}`, `getTransactions` → `[{_id,action,label,createdAt,yc}]`; `Wallet.jsx:getWalletData` (Promise.all) + `user.referralCode`. **A.**
- **Categories** (`categoryController.js`): small docs (`PropertyType{name,description,category,defaultCommissionPercentage},District{name,province},City{name,district:name}`); `getCities:145` + `findOrCreateCity:137` populate `district:name`. Full-doc returns are harmless (tiny). **A/B borderline — leave alone.**
- **ContactForms list/detail/respond** (`contactFormController.js:125-473`): `getContactForms:137` populates `property:title,slug|user:name,email|respondedBy:name|convertedLead:stage` — `ContactFormsInbox.jsx` renders `_id,name,email,phone,subject,message,property,status,response,createdAt`; `user`/`convertedLead` objects only for link. **B.** `respond:286` does `findById.populate("user")` full-User then saves returned doc — **D** (see §8). `convert-to-lead:346` populates `user name,email + agent name,email + property title,saleType` then `lead.populate([assignedAgent|property:title|contactForm:subject,status])` — well-scoped. **A.**
- **Agents** (`agentController.js:117-417`): `getAgents:144` `User.find({role:agent})` + `buildPerformanceForAgents` (3× aggregate) → `{agents:[toSafeObject+performance{salesCount,salesValue,rentalCount,rentalValue,dealsClosed,commissionEarned,commissionPaid}],pagination}`; `ManageAgents.jsx` reads exactly those + `agentProfile{licenseNumber,employeeId,joinedAt},phone,isActive`. **A/B** — `toSafeObject` still carries ID photos/gamification; trim to roster fields. Note agents can list roster (`agentRoutes.js:7`) — verify intent (see §8).
- **Archives** (`archiveController.js:12-103`): list `select(-data)` (only list excluding heavy field — exemplary); detail full `data` snapshot justified; `DataArchives.jsx` reads `items[],snapshot,jobs`. **A.**
- **Auth login/register/verify** (`authController.js:28-448`): register returns no doc; login/verify return `{token,user:toSafeObject}`; `updateProfile` same; `getMe` is the only outlier (favorites). **A except favorites.**

---

## 5. Population Chain Audit

> Principle: population itself is not bad. Flagged only where data is unconsumed, sensitive, deeply nested, or missing.

### Sale → property → lead → agent → buyer.user

- `saleController.js:279-285` (list) + `:346+` (detail).
- `property{title,slug,price,status,media.coverImage}` — **appropriately scoped**; all five fields rendered in queue tables and EMI prefill.
- `lead{name,email,phone}` (list) — **unnecessary fields** (tables never render lead contact; `lead._id` link suffices). `lead` (detail, no select) — **unnecessary population + exposure**: full `notes,activities,phone,email,assignedAgent,...`. Only `lead{_id,name,stage,assignedAgent{name}}` needed for workspace link.
- `agent{name,email}` — **appropriately scoped** (`agent.name` in every row; email for admin contact).
- `reviewedBy{name}` — **appropriately scoped**.
- `buyer.user{name,email(,phone)}` — **role-dependent / marginal**: only used for “Registered” chip (`MySales.jsx`). Replace object with `buyer{...,registered:boolean}` in list; keep selected populate in detail if chip needs name.

### Lead → property → assignedAgent → contactForm → visit → user → conversationThreads → messages.sender

- `leadController.js:52-66`.
- `property{title,slug,media.coverImage,price,status}` — **appropriately scoped** (title rendered everywhere; slug/cover for links; price/status for context).
- `assignedAgent{name,email,phone}` — **appropriately scoped** (name everywhere, `_id` for reassignment, contact for admin).
- `contactForm{name,email,subject,status,createdAt}` — **unnecessary in list** (tables show `source` enum, not contact detail; detail `LeadDetail.jsx` only links `contactForm._id`). Keep for `getLeadById` or trim to `{_id,subject,status}`.
- `visit{visitType,requestedSlot,status}` — **unnecessary in list** (same reason); detail needs `requestedSlot|status` (`LeadDetail.jsx`). Trim list to `_id` link.
- `user{name,email}` — **unnecessary in list** (only `user.name` in detail header; tables show lead `name/email` scalars, not linked user). Trim list.
- `conversationThreads[]` (full docs) → `messages.sender{name}` — **deep population**: `getLeadById:363-371` embeds entire threads with all `messages[]`; UI uses existence + separate `LeadConversationThread` (which re-fetches via conversation endpoints). Whether field selection suffices: **no** — contract should change to thread summaries `[{_id,property{title},lastMessageAt,isActive}]` (see §11).

### Property → listedBy → propertyType → city → district

- `propertyController.js:126-129` (list) vs detail populate.
- `propertyType{name,defaultCommissionPercentage}` (list) / `{name,category,defaultCommissionPercentage}` (detail) — **appropriately scoped** (filter chips + form `category`).
- `city{name}, district{name}` — **appropriately scoped**.
- `listedBy{name,email,phone}` (list) — **unnecessary fields**: cards/admin tables need `_id` (ownership) + `name` at most; email/phone unread in lists. Detail `listedBy{name,email,phone,selfiePhoto,verificationStatus,createdAt}` — **role-dependent**: public detail renders `name,selfiePhoto,verificationStatus,createdAt`; `phone/email` only for owner/admin/agent contact — confirm rule, then select accordingly (see §7).

### Visit → property → requestedBy → assignedAgent → convertedLead

- `visitController.js:282+` (`VISIT_POPULATE`), `:332`, `:358`.
- `property{title,slug,media.coverImage,address,(district|city|listedBy per branch)}` — **appropriately scoped** (buyer cards need title/slug/cover; admin needs address/district; detail needs `listedBy` for ownership).
- `requestedBy{name,email,phone}` — **role-dependent**: admin/agent need contact; buyer (`my-visits`) is the requester — never needs it. Strip for buyer projection.
- `assignedAgent{name,email(,phone)}` — **appropriately scoped** (buyer needs `name,phone`; admin needs `_id` for assignment).
- `convertedLead{name,stage}` — **role-dependent**: admin workflow needs link; buyer never renders it. Strip for buyer projection.

### Commission → property → agent → sale / rental

- `commissionController.js:43-47`.
- `property{title,slug,media.coverImage,status}` — **appropriately scoped** (both tables render title/cover link).
- `agent{name,email}` — **appropriately scoped** (admin column; agent self-scope harmless).
- `sale{agreedPrice,paymentType,submittedAt}` — **unnecessary fields**: neither `Commissions.jsx` nor `MyCommissions.jsx` nor `AgentDashboard.jsx` displays them. Drop from list or document reason.
- `rental` — **missing population**: no entry in `COMMISSION_POPULATE`; rental-origin commissions return bare ObjectId. Field selection is insufficient — contract must add `rental{_id,monthlyRent?,durationInMonths?}` symmetric to sale or a unified `source` discriminator (see §9).

### EMI → property → buyer → agent → sale

- `emiPlanController.js:46-53`.
- `property{title,slug,media.coverImage}`, `buyer{name,email(+phone in detail)}`, `agent{name,email}`, `sale{agreedPrice,paymentType(+buyer object in detail)}` — **appropriately scoped** for detail/admin/buyer contexts.
- Agent branch relies on `sanitizeForAgent` (strips money) rather than different populate — **correct defense-in-depth** (`EMISales.jsx` intentionally ignores amounts). List excess is `installments[].verification` depth (see §6), not these four chains.

### Other chains (brief)

- `Conversation: inquirer|owner{name,email} + property{title(,slug,coverImage)} + messages.sender{name}` — appropriately scoped + masked (`maskOwnerIdentity`). No change except pagination/search (see §6).
- `Notification: property{title,slug,coverImage}` — **unnecessary population** (never rendered).
- `ContactForm: property{title,slug(,coverImage)} | user{name,email} | respondedBy{name} | convertedLead{stage(,name)}` — property/respondedBy scoped; `user` full-load in `respond` is unnecessary (see §8).
- `Review: user{name,selfiePhoto(,email admin)} | property{title,slug} | adminReply.repliedBy{name}` — appropriately scoped per surface.
- `Blog: author{name(,email admin)}` — appropriately scoped.

---

## 6. List vs Detail Contract Audit

| Resource | List today | Detail today | Consumer reality | Verdict |
|---|---|---|---|---|
| Properties | Full docs (`getProperties:138`) | Full + `listedBy` detail + `similarProperties[4 minimal]` | Cards need 12 fields; detail needs all | **Split needed.** List → card DTO (§4); detail unchanged. `similarProperties` already minimal — copy that select to list. |
| Sales | Full docs + 5 pop (`getSales:304`) | Full + full-lead (`getSaleById`) | Tables `normalize()` to 10 fields; modal needs remarks/activities | **Split needed.** List drops `lead obj/activities/remarks/buyer.user obj`; detail keeps selected lead + full history. |
| Rentals | Same as sales (`getRentals:281`) | Same (`getRentalById`) | Same | **Split needed**, symmetric to sales. |
| Leads | Full base + 5 selected pop (`getLeads:250`) | + full threads (`getLeadById`) | Tables ignore 3/5 pop; detail ignores `messages[]` | **Split needed.** List: base + `property+assignedAgent` only; detail: full base + selected 5-pop + thread summaries (no messages). |
| Visits | Same rich shape all roles + in-memory pagination (`getVisits:304`) | Sanitized detail (`getVisitById`) | Buyer needs 7 fields; admin needs 12 | **Split + role projection needed** + DB pagination fix. `my-visits` is the natural buyer-list contract already — trim it. |
| EMI plans | Full `installments[]+verification` + LIST pop (`getEmiPlans:476`) | Full + DETAIL pop (`getEmiPlanById`) | Table needs `verification.status` + computeds | **Trim list `installments` depth**; keep existing LIST vs DETAIL pop split (good). |
| Commissions | Full + 3 pop (`getCommissions:98`) | N/A (no detail route; `mark-paid` returns record) | Tables ignore `sale{}` fields | **Trim list**, add missing `rental` (see §9). Summary already aggregate-only (good). |
| Notifications | Full + property pop, 20 s poll (`getNotifications:25`) | N/A | Bell/list need 7 scalars | **Trim list** (drop property pop + link-ids). `unread-count` already minimal (good). |
| Conversations | Minimal pop + masked (`getConversations:220`) | + full messages (`getConversationById`) | List needs headers; thread needs messages | **Already good split.** Only fix search/pagination, not shapes. |
| Reviews | Scoped + `avgRating` (`getPropertyReviews:113`) | N/A (single-property scope) | Fully consumed | **Already good.** Keep. |
| Blogs | `{blogs,pagination}` (good) | Bare doc (inconsistent) | Fully consumed | **Normalize envelope only**, not weight. |
| Dashboard/Analytics | Aggregates + 5 selected recents | N/A | Fully consumed | **Already good — template for new summary endpoints.** |
| Users | Raw full docs | Raw full doc | 6 fields | **Split needed**: roster DTO vs verification-detail DTO vs self-profile. |
| Archives | `select(-data)` list (good) | Full `data` snapshot (justified) | Fully consumed | **Already good — template.** |
| EMI eligible-sales | Lean DTO (good) | N/A (picker) | Fully consumed | **Already good — template for pickers.** |

---

## 7. Role-Based Response Audit

Same endpoint, different roles — where representation genuinely differs vs where one shape suffices.

- **Properties `GET /` and `/:id` (public | user | agent | admin, `optionalAuth`).** Genuinely differs on: `commissionPercentage / effectiveCommissionPercentage / estimatedCommissionAmount` (buyers see teaser or nothing; agents/admin see figures — `applyCommissionVisibility` implements but needs product sign-off); `listedBy.email/phone` (public cards: no; detail contact or owner/admin: yes). Recommendation: formalize two projections (public-list, authenticated-detail) rather than three role DTOs; admin table reuses list + `listedBy._id`.
- **Visits (`getVisits` agent/admin vs `my-visits` buyer).** Genuinely differs on: `internalNotes` (agent/admin only — `sanitizeVisitForViewer` already strips for buyer; `updateVisit` bypass must be closed), `requestedBy` contact (admin/agent only), `convertedLead` link (admin workflow only), `property.listedBy` (detail ownership only). Recommendation: two list projections (buyer-minimal, staff-full) — the routes already exist, only the field sets need tightening.
- **Sales/Rentals (agent sees own; admin sees all).** Same fields suffice; scoping is by row filter (`query.agent`), not column projection — **no role DTO needed**. Only exception is detail `lead` contact (agent assigned to lead vs filing agent vs admin — keep selected subset for all; full notes/activities stay in lead workspace, not sale payload).
- **Leads (agent scoped to assigned; admin all).** Same fields suffice; scoping by `scopeQueryForRole` — **no role DTO needed**. `internalNotes`-equivalent is `notes` (needed by both assigned agent and admin).
- **EMI (admin full amounts vs agent schedule-only vs buyer own).** Already role-aware via `sanitizeForAgent` + route gates — **keep, formalize**: admin `{amounts,slips,notes}`, agent `{schedule+status}`, buyer `{own amounts+slips}`. `EMISales.jsx` proves agent UI needs no amounts.
- **Commissions (admin all + `agent{name,email}` column vs agent self).** Column difference only; summary always self-scoped. **No separate DTO** — omit `agent` object when `role!==admin` or keep harmless self-ref.
- **Conversations (`maskOwnerIdentity`).** Already role-aware (non-admin sees masked `sender`). **Keep.**
- **Users/Agents.** Genuinely differs: public/self (`Profile.jsx`: own doc + referral + verification docs), agent roster (name/contact + performance), admin verification queue (ID photos + note). **Needs three projections** (roster, verification-detail, self) — currently one raw shape.
- **Reviews/Blogs/Categories/Rewards/Notifications/Dashboard.** No role-column differences (row scoping suffices: own wallet, own notifications, admin review `email`, admin blog drafts). **No role DTOs.**
- **Sensitive groups disposition:** `internalNotes` (visits) → staff-only ✓ already; `commission` internals → list-strip + detail-gate (verify); `verification` ID photos → verification-queue + self only (fix roster); `financial` (EMI/commission amounts) → admin + owner roles only (EMI ✓, commissions ✓ via scope); `user identity` (phone/email) → contact-minimal in lists; `lead notes/activities` → lead workspace, never embedded in sale/visit payloads; `agent performance` → admin + self.

---

## 8. Security / Data Exposure Audit

### Confirmed exposure concerns

1. **Raw User list/detail (`userController.js:19-45,164-172`).** `GET /users`, `GET /users/:id`, `GET /verifications/pending` return unsanitized docs: `selfiePhoto, citizenshipPhotoFront/Back, xp, ycCoin, referralCode, referredBy, loginStreak, lastLoginDate, favorites[], verificationNote`. Consumers need 6 roster fields (queue additionally needs ID photos + note). Admin-only scope limits blast radius but any admin token / log / proxy captures ID docs and gamification graph. Fix: roster select + verification-detail select + `toSafeObject`-strict (see §14 B1).
2. **Sale/rental detail full-lead (`saleController.js:346`, `rentalController.js:310`).** `populate({path:'lead'})` with no select embeds `notes, activities[], phone, email, assignedAgent, contactForm, visit, user`. The sale workspace (`MySales.jsx` modal) renders none of `notes/activities`; lead workspace is a separate route with its own gate. Fix: selected lead (`_id,name,email,phone,stage,assignedAgent{name}`).
3. **Contact-form respond full-User (`contactFormController.js:286`).** `findById.populate("user")` loads full User (incl `selfiePhoto, citizenship*, xp, ycCoin, referral*`) then saves and returns the doc. `RespondToContactModal.jsx` needs `contactForm` fields only. Fix: `select('name email')` or drop populate (use scalar `email` for reply).
4. **`updateVisit` unsanitized echo (`visitController.js:400`).** All other buyer-visible visit reads apply `sanitizeVisitForViewer`; `updateVisit` returns raw `visit` (incl `internalNotes`) to admin/agent caller — and any buyer-adjacent error path that surfaces it. Fix: apply sanitizer before `res.json` (one line).
5. **`resetPassword` temp credential in body (`userController.js:120-124`).** Returns `{ success, message, tempPassword }` plaintext. Route is admin-only and the behavior is intentional for handoff, but secrets in JSON are logged by proxies/browsers. Fix (review, not silent change): return `{ success, message }` + out-of-band delivery or single-use force-reset; keep `AuditLog` write.

### Needs verification (do not treat as vulnerabilities yet)

1. **Commission visibility on public property surfaces.** `applyCommissionVisibility (propertyController.js:50)` computes/strips `effectiveCommissionPercentage/estimatedCommissionAmount` by role. Cards read these fields (`PropertyCard.jsx`). Confirm with product: should anonymous buyers see any commission figure, or only agents/admins? Code suggests partial stripping; contract should document the rule per role.
2. **Public `listedBy.email/phone` on `GET /properties` list.** Backend sends both on every card; no card renders them. Detail contact may be legitimate (buyer→lister), but list-wide broadcast to anonymous callers needs product/legal sign-off. Likely fix: list strips contact, detail gates by auth/ownership.
3. **Agent roster readable by agents (`agentRoutes.js:7 router.all('*',protect)` + `getAgents:117` allows `admin,agent`).** Agents can enumerate other agents (`name,email,phone,performance`). May be intentional (assignment dropdowns in `ManageVisits.jsx`, `CreateLeadModal.jsx`) — confirm whether agent-visible roster should be contact-minimal (`_id,name`) vs full.

---

## 9. Contract Inconsistencies

1. **Blog bare-document vs success envelope.** Current: `getBlogById:195` / `getBlogBySlug:222` → `res.json(blog)`; create/update → `{ message, blog }`; lists → `{ blogs, pagination }`. Rest of API → `{ success:true, ... }`. Consumers: `BlogDetail.jsx/Blog.jsx` (`response.data` as doc) vs `ManageBlogs.jsx/BlogForm.jsx`. Why inconsistent: blog controller predates envelope convention; no `success` flag. Breaking? **Yes, mildly** — frontend checks `data.blog ?? data` in places; adding `success` + nesting under `blog` requires one coordinated frontend pass. Low risk (few consumers).
2. **Commission `rental` vs `sale` representation.** Current: `COMMISSION_POPULATE` populates `sale{...}`; `rental` stays a bare ObjectId even for rental-origin commissions. Consumers: `Commissions.jsx/MyCommissions.jsx` ignore both (display property + amounts). Why inconsistent: rental commissions added after sale flow; populate entry never added. Breaking? **No if additive** — adding `rental{_id,...}` (or unified `source`) is backward-compatible; removing `sale{}` subfields later would be breaking.
3. **Visit sanitization asymmetry.** Current: `getMyVisits/getVisitById/cancelMyVisit` → `sanitizeVisitForViewer`; `updateVisit` → raw. Consumers: `ManageVisits.jsx/VisitManagement.jsx` (staff) vs `MyVisits.jsx` (buyer). Why inconsistent: sanitizer added after update path. Breaking? **No** — applying sanitizer only removes `internalNotes` from roles that shouldn’t see it; staff paths keep it via role param.
4. **Envelope key drift.** Lists mostly `{ success, count, pagination, items }`, but: properties uses `{ total, page, pages }` instead of `pagination{}`; blogs omit `success`; EMI eligible-sales is flat DTO; dashboard/analytics use `{ stats }` / `{ analytics }`. Why: per-controller evolution, no shared helper. Breaking? **Renaming keys is breaking** — normalize only via additive aliases + frontend migration per batch (see §13); do not rename silently.
5. **Lead mutation echo vs list shape.** Mutations return full populated lead; `suggested-action` returns `{ action, reason }`; `activities` returns array-only. Consumers handle each shape separately (`LeadDetail.jsx`). Not a bug, but documents why a shared lead-DTO pair (list/detail) is needed before trimming.

---

## 10. Highest-Impact Findings

- **Properties list full-doc — Impact High, Confidence Confirmed.** Every public search (12/page, plus Home 3+6) ships `description + images[] + full details/location + listedBy contact`. Affects most-trafficked endpoints and all card consumers. Risk is payload × traffic, not security. Fix is projection-only (safe, additive-compatible if frontend uses documented card fields).
- **Favorites / `me.favorites` full-doc — Impact High, Confidence Confirmed.** Same weight as properties on a per-user route; `Profile.jsx` needs only a count. Compounds `me` bootstrap cost on every session load.
- **Users raw docs — Impact High, Confidence Confirmed.** Combines payload (roster × full User) with ID-doc and gamification exposure. Admin-only today, but any token leak or log capture is sensitive. Fix requires projection + verification-detail split.
- **Visits unpaginated full-load + uniform rich shape — Impact High, Confidence Confirmed.** `getVisits` without `?status` loads entire collection into Node memory (functional perf risk, not just bytes) and serves buyer-unneeded `internalNotes/requestedBy/convertedLead`. Affects three dashboards.
- **Sale/rental detail full-lead — Impact High, Confidence Confirmed.** Single `populate('lead')` without select dominates detail payload and leaks `notes/activities/contact`. High coupling (sale ↔ lead workspaces) + security. Fix is one `select` per controller.
- **Sale/rental list full-doc + immediate `normalize()` — Impact Medium, Confidence Confirmed.** Queue tables discard >50% of fields on receipt (`VerificationQueue.jsx:29-87`, `MySales.jsx:27-82`). High consumer count (admin + all agents) but no secrets; fix is list projection.
- **Lead list sub-docs + detail thread depth — Impact Medium, Confidence Strong evidence.** List carries 3 unread sub-docs × pagination; detail embeds full `messages[]`. Payload significant; no secrets beyond lead contact (already gated). Fix needs contract split (thread summaries), hence medium implementation risk.
- **Notifications property populate on 20 s poll — Impact Medium, Confidence Confirmed.** Small per-row waste × high frequency × every logged-in user. Trivial fix (drop populate).
- **EMI list `installments[].verification` depth — Impact Medium, Confidence Strong evidence.** Table needs `status` + computeds; slips/notes are detail-only. Module already has list/detail split, so risk is low.
- **Blog envelope + commission rental + visit sanitize + resetPassword — Impact Low–Medium, Confidence Confirmed (behavior) / Needs verification (severity for tempPassword).** Inconsistencies and hygiene; small consumer sets; fixes are isolated but require coordinated deploys where shapes change.
- **Dashboard/analytics aggregates — Impact Low (positive), Confidence Confirmed.** Already appropriate; no action except using them as templates. Listed to prevent false “optimize” work.

---

## 11. Proposed API Contract Direction

Design only — current vs target clearly separated. Aggressive direction (lightweight lists + rich details, with frontend updates) per approved scope.

- **Explicit list representations.** Every collection route returns a documented minimal projection using real fields (see §4 targets). Rule: list contains only fields rendered in tables/cards + `_id/slug` links + `pagination/counts`. Full `description, images[], details.*, location.*` stay in detail. Copy the existing `similarProperties` select (`propertyController.js`) and `eligible-sales` lean DTO (`emiPlanController.js:290`) as templates. Current: full docs; Target: `select()`-projected + populated-ID-or-minimal chains.
- **Explicit detail representations.** Detail routes (`/:id`, `/slug/:slug`, lead workspace, EMI detail) keep rich shapes but with bounded populates: every `populate()` carries a `select`, and no detail embeds another workspace’s history (sale detail does not embed `lead.activities`; lead detail does not embed `messages[]`). Current: unbounded `populate('lead')` / threads; Target: selected sub-docs + summary links.
- **Controlled `populate()`.** Lint rule: no `populate(path)` without `select`; no top-level `populate('favorites'|'user')` without field list; deep chains (>1 level) require contract review (only approved deep chain is none — threads become summaries). Current: 5 unselected populates (§5); Target: zero.
- **Field projections.** Prefer Mongoose `select()` at query time over post-hoc deletion (saves DB → Node transfer, not just wire bytes). For computed role fields (`effectiveCommissionPercentage`, `canManage`, `registered`, `nextDue/outstanding/overdueCount`) keep server computation but document per-role visibility. Current: in-JS mapping after full fetch; Target: `select` + `lean()` where virtuals allow, else documented hydration.
- **Role-aware representations where justified (not everywhere).** Only where §7 proves column differences: property list/detail contact + commission visibility; visits buyer vs staff; EMI admin/agent/buyer; users roster vs verification vs self; conversations masking (keep). Sales/rentals/leads stay single-shape with row scoping. Current: ad-hoc sanitizers inconsistently applied; Target: named projections (e.g. `propertyCard`, `propertyDetail(public|owner)`, `visitBuyer`, `visitStaff`, `emiAdmin|emiAgent|emiBuyer`) backed by the existing sanitizer functions, not new abstraction for its own sake.
- **Dashboard aggregate responses.** New summary needs become `aggregate()` endpoints returning `{ success, summary|stats|metrics }` (copy `commission/summary`, `dashboard/admin`, `analytics/*`, `pipeline/metrics`), never filtered domain-doc dumps. Client-side `sort/filter/slice(0,5)` over 100-row fetches (`AgentDashboard.jsx:61-72`, `ManageProperties.jsx` user branch, `Conversations.jsx:207-215`) moves to server query params.
- **Stop accidental document-as-contract.** `res.json(doc)` only for intentional detail echoes (create/update) and even then through a documented shape; lists never return bindings to schema evolution. `toSafeObject()`-style helpers become explicit per-role allow-lists rather than denylists.

---

## 12. Migration Strategy

- **Phase 1 — Document current contracts.** Scope: freeze §3 inventory + §4 shapes as the baseline; add contract comments to controllers. Consumers: none (docs only). Risk: none. Testing: report review. Deploy: docs commit alone. (This report is Phase 1 output.)
- **Phase 2 — Security / exposure fixes.** Scope: §14 B1 (users select, sale/rental lead select, contactForm user select, visit sanitize, tempPassword review). Consumers: ManageUsers, VerifyUsers, VerificationQueue, MySales, ContactFormsInbox, ManageVisits. Risk: low–medium (field removal can break hidden consumers — see §13). Testing: role-matrix tests (admin/agent/buyer/anon × endpoint asserting absent fields) + manual verification-queue pass. Deploy: backend + frontend lockstep per endpoint (frontend must not read removed paths).
- **Phase 3 — High-impact list diets.** Scope: §14 B2 (properties, favorites/me, sales/rentals lists, visits pagination, notifications). Consumers: Home, Listing, Favorites, Profile, queues, all visit dashboards, bell. Risk: medium (payload shape change, high traffic). Testing: contract snapshot tests (assert list keys ⊆ allow-list), pagination tests, Lighthouse/payload-size checks. Deploy: backend-first with additive aliases if needed, then frontend trim, then alias removal — or lockstep (single app, preferred).
- **Phase 4 — Detail + deep-population trims.** Scope: §14 B3 (sale/rental lead select, lead threads → summaries + separate fetch, EMI list installments trim). Consumers: MySales modal, EmiPlans picker, LeadDetail + LeadConversationThread, EmiPlanDetail. Risk: medium (interaction-heavy modals). Testing: modal/picker E2E, thread pagination tests. Deploy: lockstep per resource.
- **Phase 5 — Normalize list/detail + role contracts.** Scope: §14 B4 + §7 formalization (blog envelope, commission rental, conversation search/pagination, property contact rule, EMI/visit role projections documented). Consumers: blogs, commissions, conversations, property detail contact. Risk: low–medium (envelope renames are breaking — use additive `success` first). Testing: envelope assertion tests, search regression. Deploy: additive → migrate → remove.
- **Phase 6 — Cleanup dead code + residual inconsistencies.** Scope: §14 B5 (propertyManagement, siteVisit, inquiry placeholder) + envelope key drift (`total/page/pages` vs `pagination`). Consumers: none (dead) + all lists (drift). Risk: low (dead) / medium (drift). Testing: dependency verification (no imports, no mounts, no frontend service hits), then delete; drift via codemod + full regression. Deploy: delete commit isolated; drift lockstep.

---

## 13. Breaking Change Analysis

Rule: **removing or renaming any field is breaking**, even if the inspected UI doesn’t read it — other consumers (scripts in `backend/scripts/`, exports, future screens, cached clients) may. Additive changes (new `success` flag, new `rental` object, new summary keys) are safe.

- **Properties list → card DTO.** Current: full docs + `listedBy{email,phone}` + commission fields. Target: §4 card shape. Removed: `description,images,video,details.*(most),location.*(most),listedBy{email,phone},views,shares,...`. Retained: card 12 + links. Renamed: none. Frontend: Home/Listing/Favorites/ManageProperties/AdminDashboard verify card fields + ownership via `_id`; AddEditProperty untouched (uses detail). Backend: add `select()` + trim `listedBy` to `name` (detail keeps contact). Coordination: lockstep (single deployPair preferred); rollback: revert select (frontend tolerates extra fields). Compat: frontend already ignores extras, so backend-first is safe; frontend-first is no-op.
- **Favorites / `me` → card DTO + id-list.** Current: full properties in both. Target: `/my/favorites` card DTO; `me` → `favorites:[ObjectId]` or count. Removed: full fav docs from `me`. Consumers: Favorites.jsx (migrate to list endpoint), Profile.jsx (count), AuthContext (session). Breaking: yes for any code reading `me.favorites[0].title` — search shows only count usage, but third-party caches may. Migration: backend adds `favoriteIds` + keeps `favorites` one release with deprecation note, then removes.
- **Users roster → roster DTO; verification → verification DTO.** Current: raw docs. Target: §4 shapes. Removed: `xp,ycCoin,referral*,loginStreak,favorites,hashes` from roster; `favorites/gamification` from verification. Retained: roster 8 + verification +photos/note. Consumers: ManageUsers/VerifyUsers/dropdowns. Breaking: yes (any admin tool reading `xp/referral`). Migration: audit `backend/scripts/` + admin extensions first; lockstep.
- **Sales/rentals list → trimmed; detail lead → selected.** Current: full + full-lead detail. Target: §4. Removed from list: `lead obj→_id, buyer.user obj→registered, activities/remarks`. Removed from detail: `lead.notes/activities`. Consumers: VerificationQueue/MySales/EmiPlans. Breaking: moderate (modal may link to lead workspace instead of inline notes — intended). Migration: backend select + frontend workspace-link; rollback restores populate.
- **Leads list → base+2pop; detail threads → summaries.** Current: 5-pop list + full-thread detail. Target: §4. Removed: `contactForm/visit/user` objects from list; `messages[]` from detail. Consumers: LeadList/Kanban/MyLeads/AgentDashboard (list), LeadDetail/Thread (detail). Breaking: yes for any view rendering `lead.contactForm.email` inline — currently only `_id` link used. Migration: keep `_id` links; thread view fetches `GET /conversations/:id`.
- **Visits pagination + buyer/staff split.** Current: in-memory slice + uniform shape. Target: DB pagination + two projections. Removed for buyer: `requestedBy,internalNotes,convertedLead`. Consumers: all visit dashboards. Breaking: yes for buyer code reading those (none found, but verify). Migration: add `?status` server handling + `my-visits` trim; load-test large collections.
- **Notifications drop property populate.** Current: +`property{}`. Target: 7 scalars. Removed: `property` object + link-ids. Consumers: bell/list (use `link`). Breaking: low (no renderer found); additive-safe to remove after link audit.
- **Blogs add `success` envelope.** Current: bare/`{message}`. Target: `{success,blog|blogs}`. Removed: none. Consumers: Blog*/ManageBlogs. Breaking: only if parsers assert exact keys — migrate frontend readers first (accept both), then backend.
- **Commissions add `rental`.** Additive, non-breaking. Later removal of unused `sale{}` subfields would be breaking — defer.
- **EMI list installments trim.** Removed: `verification.slipUrl/notes` from list (detail keeps). Consumers: EmiPlans table (status only). Breaking: low; verify no table tooltip reads notes.
- **Dead-code deletion (B5).** Current: unmounted files exist. Target: deleted. Consumers: none live (verify). Breaking: none if verification passes; rollback is git revert. Order last.

---

## 14. Recommended Implementation Plan

PLAN ONLY — do not execute yet. Batches are independently testable, ordered by risk/dependency. Aggressive list/detail direction assumed.

### B1 — Security / exposure

- **Endpoints/files:** `GET /users,/:id,/verifications/pending` (`userController.js:19-172`); `GET /sales/:id` (`saleController.js:323-360`), `GET /rentals/:id` (`rentalController.js:294-330`); `PATCH /contact-forms/:id/respond` (`contactFormController.js:276-...`); `PATCH /visits/:id` (`visitController.js:397-...`); `POST /users/:id/reset-password` (`userController.js:99-143`).
- **Current → target:** raw full-User → roster/verification selects; `populate('lead')` → `select('_id name email phone stage assignedAgent')`; `populate('user')` → `select('name email')` or drop; `updateVisit` raw → `sanitizeVisitForViewer`; `tempPassword` in body → message-only + out-of-band.
- **Frontend consumers:** ManageUsers, VerifyUsers, VerificationQueue, MySales, RespondToContactModal, ManageVisits/VisitManagement.
- **Backend changes:** add `select()` per query; thread `select` through second populates; call sanitizer; split tempPassword flow (product decision).
- **Tests:** role-matrix exposure tests asserting absence (`expect(user).not.toHaveProperty('selfiePhoto')` on roster; `expect(sale.lead).not.toHaveProperty('notes')`); login-as-each-role E2E on queues.
- **Regression:** verification-queue approve/reject, lead workspace links, contact reply delivery, visit edit as agent vs buyer view.
- **Breaking risk:** medium (hidden admin tooling). **Deploy order:** backend + frontend lockstep per endpoint; tempPassword isolated behind flag.

### B2 — List response diets

- **Endpoints/files:** `GET /properties` (`propertyController.js:70-146`); `GET /my/favorites` + `GET /auth/me` (`propertyController.js:532+`, `authController.js:361+`); `GET /sales|/rentals` (`saleController.js:219`, `rentalController.js:221`); `GET /leads|/my-leads|/by-stage` (`leadController.js:195-342`); `GET /notifications` (`notificationController.js:7`); `GET /commissions` (`commissionController.js:59`); `GET /visits` pagination (`visitController.js:242-320`).
- **Current → target:** §4 list DTOs (card/queue/row shapes); visits DB `skip/limit/count`.
- **Frontend consumers:** Home, PropertyListing, Favorites, Profile, VerificationQueue, MySales, LeadList/Kanban/MyLeads/AgentDashboard, Bell/Notifications, Commissions/MyCommissions, all visit dashboards.
- **Backend changes:** `select()` whitelists + trimmed populates; remove `notifications property` populate; commission drop/keep `sale{}` decision; visits rewrite no-status branch.
- **Tests:** contract snapshot (allow-list keys), pagination (page/limit/total consistency), payload-size budgets, filter/sort parity (server vs old client behavior).
- **Regression:** search/filter/sort on listings, kanban drag-stage counts, queue tab counters (`countsByStatus/Stage`), bell polling, agent dashboards.
- **Breaking risk:** medium-high (most-trafficked). **Deploy order:** backend-first safe (frontend ignores extras) only if new shape is strict subset documented; otherwise lockstep. Keep `_id` links stable.

### B3 — Detail response trimming

- **Endpoints/files:** `GET /sales/:id|/rentals/:id`; `GET /leads/:id` threads (`leadController.js:360-397`); `GET /emi-plans` list depth (`emiPlanController.js:344-493`); `GET /visits/my-visits|/:id` role projection.
- **Current → target:** selected lead; thread summaries + `GET /conversations/:id` for messages; EMI list `installments[{n,dueDate,status,verification:{status}}]`; buyer vs staff visit shapes.
- **Frontend consumers:** MySales modal, EmiPlans picker, LeadDetail/LeadConversationThread/LeadActivityTimeline, EmiPlanDetail/EMISales/MyEMI, MyVisits/ManageVisits.
- **Backend changes:** populate selects; new/ documented thread-summary shape (no new route needed — reuse conversation detail); EMI list mapper; visit projection branch.
- **Tests:** modal E2E (sale→EMI init, visit→lead convert), thread open/scroll/send, EMI verification-request multipart, installment progress math.
- **Regression:** activities timelines, `canManage` gates, slip URLs in detail only.
- **Breaking risk:** medium. **Deploy order:** lockstep per resource (detail + its modal together).

### B4 — Contract normalization

- **Endpoints/files:** blogs (`blogController.js:7-296`); commissions rental (`commissionController.js:43`); conversations search (`conversationController.js:187-220`); envelope keys (properties `total/page/pages` vs `pagination`).
- **Current → target:** `{success,blog|blogs}`; `+rental{_id}` additive; search via `$lookup` or documented removal + server `?search=&page&limit`; envelope aliases (add `pagination` alongside legacy keys first).
- **Frontend consumers:** BlogList/Detail/ManageBlogs/BlogForm; Commissions tables; Conversations search; all paginated lists.
- **Backend changes:** envelope wrapper change (additive), populate addition, search rewrite.
- **Tests:** envelope assertions, search-result parity, rental-commission fixture (create rental→verify→assert populated).
- **Regression:** public blog SEO/slug routes, admin draft preview (`verifyToken` path), conversation unread counts.
- **Breaking risk:** low (additive) except envelope renames (defer removal). **Deploy order:** backend additive → frontend migrate → remove legacy keys in B6.

### B5 — Dead code cleanup (verify, then delete — NOT in this phase)

- **Candidates:** `routes/propertyManagementRoutes.js` + `controllers/propertyManagementController.js` (884 lines, 13 endpoints, never `app.use`d — **confirmed dead**); `routes/siteVisitRoutes.js` (4 endpoints requiring non-existent `controllers/siteVisitController.js` — **confirmed dead/broken**); `routes/inquiryRoutes.js` (empty compat placeholder mounted at `/api` — **likely dead**, requires verification against `inquiryService.js` legacy `/inquiries` hits and `RevampedInquiries.jsx`); `controllers/inquiryController.js` (verify imports before delete).
- **Dependency verification required before any delete:** `grep app.use` in `server.js` (done — absent); `grep -r propertyManagement|siteVisit|/inquiries` across `backend/` + `frontend/src/services` + `frontend/src/pages`; check `backend/scripts/`; confirm no `vercel.json`/proxy rewrites.
- **Tests:** full `grep` + boot test (`node server.js` / route-list snapshot) + frontend build.
- **Breaking risk:** none if verification passes. **Deploy order:** isolated delete commit after B1–B4, never mixed with shape changes.

---

## 15. Open Questions

1. Should anonymous buyers see any commission figures (`effectiveCommissionPercentage/estimatedCommissionAmount`) on property cards, or are those agent/admin-only? (Code strips by role; product rule undocumented.)
2. Is `listedBy.email/phone` on the public property list required for any contact flow, or is detail-only (or authenticated-only) contact sufficient?
3. Is the agent-visible agent roster (`GET /agents` with `role:agent`) intentional for assignment dropdowns, and if so should it be contact-minimal (`_id,name`) rather than full `toSafeObject` + performance?
4. For `resetPassword` temp credentials: is in-body delivery an accepted admin-handoff workflow, or must it move to an out-of-band / single-use reset link? (Determines B1 fix shape.)
5. For rental-origin commissions: should the API expose `rental{monthlyRent,durationInMonths}` symmetric to `sale{}`, or a unified `source{kind,ref}` discriminator? (Determines B4 contract.)
6. Are `backend/scripts/` or external ETL/export jobs consuming raw list shapes (especially users/properties/sales) outside the inspected React UI? (Determines whether “unused in UI” is safe to remove.)

---

## Appendix A — Endpoint inventory details

Covered in §3 (live) + §4 (per-endpoint evidence). Key cross-cutting notes:

- Pagination: properties uses `{total,page,pages}`; sales/rentals/leads/visits/conversations/contactForms/commissions/EMI/blogs use `{pagination:{page,limit,total,totalPages}}`; dashboard/analytics use aggregates. Do not unify key names without additive migration (§13).
- Counts/counters: `countsByStatus` (sales/rentals), `countsByStage` (leads), `totals` (commissions), `summary` (EMI/commissions), `metrics` (pipeline) — all server-computed, all consumed. Keep.
- Sorting: `PropertyListing.jsx` and `ManageProperties.jsx` sort client-side after fetch in user branch; server already supports `sort` — migrate to server params during B2.
- No endpoint returns Lawrence-style HATEOAS links; navigation uses `_id/slug` + frontend routes and notification `link` strings. Preserve.

## Appendix B — Dead / legacy routes

- **Confirmed dead — `routes/propertyManagementRoutes.js` (13 endpoints) + `controllers/propertyManagementController.js` (884 lines).** Never mounted in `server.js:100-124`. Internal `REQUEST_POPULATE=[property:title,slug,price,status,coverImage|owner:name,email,phone|assignedAgent:name,email]` is well-scoped but unreachable. Action: verify no imports (`grep -r propertyManagement backend frontend`), then delete in B5.
- **Confirmed dead/broken — `routes/siteVisitRoutes.js` (4 endpoints).** Never mounted; requires `controllers/siteVisitController.js` which does not exist (boot would throw if mounted). Action: delete in B5 after grep.
- **Likely dead — `routes/inquiryRoutes.js` (mounted at `/api`, empty compat placeholder, no endpoints).** Frontend `services/inquiryService.js` targets legacy `POST /inquiries` and `pages/admin/RevampedInquiries.jsx` + `Inquiries.jsx` exist — verify whether these hit live conversation/contact-form routes or a removed `/inquiries` API before deleting placeholder. Action: trace + decide in B5; do not delete blindly.
- **Requires dependency verification — `controllers/inquiryController.js`, `models/PropertyManagementRequest.js`, `models/Inquiry` legacy refs in `models/Notification.js` (`inquiry` field).** Notification `inquiry` refs are legacy-compat; leave until B5 audit of scripts/migrations.

## Appendix C — Evidence references

**Backend (representative line anchors):**

- `server.js:96-124` mounts; `middleware/auth.js:5-94` protect/optional/authorize/requireVerified; `middleware/upload.js` upload variants; `middleware/errorHandler.js:2-56`.
- `controllers/propertyController.js:50` visibility, `:70-146` list, `:151+` detail, `:188-244` create/update, `:345-499` status/tenancy/delete/favorite, `:489-544` my/favorites/share.
- `controllers/authController.js:28-448` incl `:361-362 me+favorites`; `models/User.js:5-192` incl `:185 toSafeObject`.
- `controllers/userController.js:19-172` roster/detail/verify/reset (`:120 tempPassword`); `controllers/agentController.js:117-417`.
- `controllers/leadController.js:40-75` query/pop/gate, `:81-250` create/list, `:269-342` my/by-stage, `:360-478` detail/stage, `:604-756` assign/priority/notes/follow-up, `:756-1047` metrics/suggested/activities/delete.
- `controllers/saleController.js:33-120` create, `:219-360` list/detail, `:360-562` verify/reject; `controllers/rentalController.js:30-443` mirror.
- `controllers/visitController.js:87-729` sanitizer + full lifecycle; `controllers/conversationController.js:12-568`; `controllers/contactFormController.js:17-473`.
- `controllers/commissionController.js:43-164`; `controllers/emiPlanController.js:46-1164` incl `:272 eligible-sales lean`; `controllers/reviewController.js:90-273`; `controllers/notificationController.js:7-77`; `controllers/rewardController.js:10-29`; `controllers/blogController.js:7-296`; `controllers/categoryController.js:6-...`; `controllers/dashboardController.js:13-...`; `controllers/analyticsController.js:259-705`; `controllers/archiveController.js:12-103`.
- `models/Property.js:4`, `Sale.js:20`, `Rental.js:12`, `Lead.js:43`, `Visit.js:3`, `Conversation.js:3`, `Review.js:3`, `CommissionRecord.js:17`, `EMIPlan.js:28`, `RewardTransaction.js:8`, `Notification.js:3`, `BlogPost.js:3`, `Category.js`, `ContactForm.js`, `Archive.js`, `AuditLog.js`, `DataOpsLog.js`.

**Frontend (representative consumption):**

- `utils/axios.js` baseURL/auth; `context/AuthContext.jsx`, `NotificationContext.jsx` (20 s), `ConversationContext.jsx` (30 s, direct `/conversations/unread-count`), `LeadContext.jsx`, `utils/permissions.js`, `utils/accountNav.js`, `utils/format.js`, `utils/timeConverter.js`, `utils/leadConstants.js`.
- `services/*.js` (21 files, §2.7) mapping each function → endpoint.
- `components/PropertyCard.jsx`, `pages/public/Home.jsx`, `PropertyListing.jsx`, `PropertyDetail.jsx`, `pages/user/Favorites.jsx`, `Profile.jsx:78-85`, `pages/admin/ManageProperties.jsx`, `AddEditProperty.jsx`, `AdminDashboard.jsx`.
- `pages/admin/VerificationQueue.jsx:29-87`, `pages/agent/MySales.jsx:27-82`, `components/LeadManagement/SubmitSaleModal.jsx`, `SubmitRentalModel.jsx`.
- `pages/admin/LeadManagement/LeadList.jsx`, `LeadKanban.jsx`, `LeadDetail.jsx:391-408`, `LeadStats.jsx`, `LeadDashboard.jsx`, `components/LeadManagement/LeadCard.jsx`, `LeadActivityTimeline.jsx`, `LeadConversationThread.jsx`, `pages/agent/MyLeads.jsx`, `AgentDashboard.jsx:61-72`.
- `pages/admin/ManageVisits.jsx`, `Visits.jsx`, `pages/agent/VisitManagement.jsx`, `MyAssignedVisits.jsx`, `pages/user/MyVisits.jsx`.
- `pages/user/Conversations.jsx:207-407`, `pages/admin/ReviewManagement.jsx`, `pages/admin/Commissions.jsx`, `pages/agent/MyCommissions.jsx`, `AgentDashboard.jsx`, `pages/admin/EmiPlans.jsx`, `EmiPlanDetail.jsx`, `pages/agent/EMISales.jsx`, `pages/user/MyEMI.jsx`, `pages/admin/Analytics.jsx`, `pages/agent/AgentAnalytics.jsx`, `components/NotificationBell.jsx:294`, `pages/user/Notifications.jsx`, `pages/user/Wallet.jsx`, `pages/public/BlogList.jsx`, `BlogDetail.jsx`, `pages/admin/ManageBlogs.jsx`, `BlogForm.jsx`, `components/Blog.jsx`, `components/SearchFilterBar.jsx`, `PropertyCategories.jsx`, `pages/admin/ManageCategories.jsx`, `pages/public/Contact.jsx`, `pages/admin/LeadManagement/ContactFormsInbox.jsx`, `ContactFormDetail.jsx`, `RespondToContactModal.jsx`, `ConvertToLeadModal.jsx`, `CreateLeadModal.jsx`, `pages/admin/RevampedInquiries.jsx`, `Inquiries.jsx`, `pages/admin/ManageUsers.jsx`, `VerifyUsers.jsx`, `ManageAgents.jsx`, `pages/admin/DataArchives.jsx`.

# Implementation Plan — Rental, Lead, and Cross-Module Fixes

This plan implements the 13 decisions finalized in the Development Decision Audit, exactly as decided, against the actual current codebase (every reference below was re-verified against the live files, not assumed). It does not reopen any decision. Where a decision left an implementation detail unspecified, that detail is filled in using the smallest change consistent with the decision and with the codebase's existing patterns, and is called out explicitly as "**Implementation detail (not re-litigating the decision):**".

## Quick-Reference: Decisions Being Implemented

| # | Decision (as finalized) |
|---|---|
| Q1 | Lead gets a locked `dealType` (`sale`/`rental`); `Lead.stage` uses one generic `pending_verification` value instead of a per-type stage. A lead wanting a different deal type needs a new Lead. |
| Q2 | Sale/Rental keep full rejection history; only one `pending_review` submission per lead at a time, enforced via a **partial** unique index (matching `PropertyManagementRequest`'s existing pattern). |
| Q3 | `Notification.type` stays a strict enum; a CI/pre-commit guardrail is added so a missing value is caught immediately instead of silently swallowed. |
| Q4 | `Rental` and `PropertyManagementRequest` stay fully independent modules; no cross-linking now. Rental's unused `paymentFrequency`/`advanceMonths` are removed. |
| Q5 | `Rental` is a one-time transaction: agent files it, admin verifies it, **admin manually enters the commission amount** (no automatic calculation), rental is then closed. No ongoing rent-payment tracking. |
| Q6 | `Property.status` reverts from `rented` to `available` only via an explicit, manual "end tenancy" action — never automatically. |
| Q7 | A tenant becomes review-eligible immediately once their `Rental` is verified (mirrors `Sale`'s `'purchase'` eligibility exactly). |
| Q8 | Sale and Rental volume metrics stay **separate**; a combined **"Deals Closed"** total is added; agent ranking is primarily by **total commission earned** (sale + rental combined). |
| Q9 | Office (non-property) visits earn the same completion reward as property visits, with no property reference attached. |
| Q10 | `Conversation.inquirer` becomes a required field. |
| Q11 | Deleting a `PropertyType`/`District`/`City` is blocked while any `Property` still references it. |
| Q12 | Admin dashboard counters and the archival/retention jobs are extended to include `Rental` now, in this same pass. |
| Q13 | `CommissionRecord.saleAmount` is renamed to `transactionAmount` now. |

---

## 1. Module: Lead

### Current State
- `models/Lead.js`: `LEAD_STAGES = ['new','contacted','site_visit_scheduled','negotiation','pending_sale_verification','closed','lost']`. No `dealType` field exists.
- `isActive` virtual excludes `['closed','lost','pending_sale_verification']`.
- `Lead.normalizeStage()` maps legacy capitalized values to current enum values.
- `controllers/leadController.js:496` blocks manual transition into `pending_sale_verification` with a fixed message referencing "sale verification."
- `controllers/rentalController.js` sets `lead.stage = 'pending_rental_verification'` — **not a valid enum value**, this is the confirmed P0 crash from the original audit.
- `controllers/saleController.js` correctly sets `lead.stage = 'pending_sale_verification'`.
- `controllers/visitController.js:23`, `UNRECOVERABLE_LEAD_STAGES`, includes the literal string `"pending_sale_verification"`.
- Frontend: `utils/leadConstants.js` (`STAGES`, `STAGE_META`, `stageMeta()`) hardcodes `pending_sale_verification`; the **single** consumer of `stageMeta()` is `components/LeadManagement/LeadStatusBadge.jsx`, rendered from 4 call sites (`LeadCard.jsx`, `LeadDetail.jsx`, `AgentDashboard.jsx`, `MyLeads.jsx`).
- `getSuggestedAction` in `leadController.js` has no case for the verification stage at all — falls through to the generic `review_lead` default.
- Leads are created from three places: `leadController.createLead` (manual), `contactFormController.js` (`convertToLead`-style path), and `utils/leadAutoConversion.js` (visit → lead).

### Broken/Inconsistent
- The Rental-filing crash (root cause of the original P0).
- No concept of "this lead is locked to one deal type" exists anywhere — nothing currently prevents (in theory) both a Sale and a Rental being filed against the same Lead.

### Dependencies/Consumers
`controllers/rentalController.js`, `controllers/saleController.js`, `controllers/visitController.js`, `controllers/leadController.js`, `utils/leadAutoConversion.js`, `contactFormController.js`, `frontend/utils/leadConstants.js`, `frontend/components/LeadManagement/LeadStatusBadge.jsx` and its 4 call sites.

### Target State
- `Lead.dealType: 'sale' | 'rental' | null` — set once, automatically, and never changed after that except by the rule below.
- `Lead.stage` uses one generic `pending_verification` value for both deal types.
- A Sale/Rental filing attempt against a Lead whose `dealType` is already locked to the *other* type is rejected with a clear error telling the caller to create a new Lead.

### Required Changes

**Schema (`models/Lead.js`) — Bug fix + Schema change:**
- Add `dealType: { type: String, enum: ['sale', 'rental'], default: null }`.
- Change `LEAD_STAGES` to replace `'pending_sale_verification'` with `'pending_verification'`.
- Update the `isActive` virtual to reference `'pending_verification'`.
- Update `normalizeStage()`'s legacy-value map to also map the *old* stored value `'pending_sale_verification'` → `'pending_verification'` (this is existing **data**, not just an old code path — see §5 Migration).
- Add `'rental_submitted'`, `'rental_verified'`, `'rental_rejected'` to `activities.type` enum (needed regardless of the stage rename — these are per-event audit tags, not the stage field itself; `sale_submitted/verified/rejected` stay as-is for the same reason).

**Business rule enforcement (new, small helper) — Business-rule change:**
- Add a `Lead.lockDealType(type)` instance method (or a small exported helper in `leadController.js`) that: if `dealType` is `null`, sets it to `type` and returns `true`; if `dealType` already equals `type`, returns `true` (no-op, e.g. a resubmission after rejection); if `dealType` is the other type, returns `false`.

**Lead creation call sites — Bug fix (fills a previously-unset field):**
- `leadController.createLead`, `contactFormController.js`'s lead-creation path, and `utils/leadAutoConversion.js` (`ensureLeadFromVisit`/equivalent): when a `property` is known at creation time, set `dealType` immediately from `property.saleType` (`'rent'` → `'rental'`, `'sale'` → `'sale'`). When no property is known (e.g. general/office-visit-derived or account/billing-category leads), leave `dealType: null` — it gets locked in later, the first time a Sale or Rental is actually filed.

**`controllers/leadController.js` — Bug fix:**
- Line 496: change the guarded stage literal from `'pending_sale_verification'` to `'pending_verification'`; generalize the message to not say "sale" specifically (e.g. "Leads move to verification automatically when a Sale or Rental record is submitted. Use the relevant \"Submit\" action on this lead instead.").
- `getSuggestedAction`: add a `case 'pending_verification':` that reads `lead.dealType` and returns a dealType-aware reason (e.g. `"Awaiting rental verification — no action needed until admin verifies."` vs the sale equivalent), instead of falling through to the generic default.

**`controllers/saleController.js` / `controllers/rentalController.js` — Bug fix:**
- Both `createSale`/`createRental` now: (1) call the `dealType` lock check above; if it fails, return `400` with a message directing the caller to create a new Lead for the other deal type; (2) if it succeeds, set `lead.stage = 'pending_verification'` (was `'pending_sale_verification'` / the invalid `'pending_rental_verification'`).

**`controllers/visitController.js` — Bug fix:**
- `UNRECOVERABLE_LEAD_STAGES` (line 23): replace `"pending_sale_verification"` with `"pending_verification"`.

**Frontend (`utils/leadConstants.js`) — Bug fix:**
- Replace the `pending_sale_verification` entry in `STAGES`/`STAGE_META` with `pending_verification`, generic label (e.g. "Pending Verification"), generic description, one representative color.

**Frontend (`components/LeadManagement/LeadStatusBadge.jsx`) — Small feature addition (needed to keep the UI meaningful after the stage becomes generic):**
- Accept an optional `dealType` prop. When `stage === 'pending_verification'` and `dealType` is provided, append `· Sale` or `· Rental` to the rendered label (e.g. "Pending Verification · Rental"). No visual change for any other stage.
- Update all 4 call sites to also pass `dealType={lead.dealType}`: `LeadCard.jsx:50`, `LeadDetail.jsx:155`, `AgentDashboard.jsx:155`, `MyLeads.jsx:137`.

**Frontend (`LeadDetail.jsx`) — Bug fix (found while inspecting this file for the above change):**
- Line 181's conditional banner check (`lead.stage === 'pending_sale_verification'`) → `lead.stage === 'pending_verification'`, with dealType-aware copy.
- **Separate, pre-existing bug found in the same file, fixed alongside it since it's the same lines being touched:** both `SubmitSaleModal` and `SubmitRentalModal`'s `onSuccess` handlers only close the modal (`onSuccess={() => { setSaleModalOpen(false); /* refetch lead */ }}`) — the `/* refetch lead */` comment was never implemented. Wire both to actually re-fetch/re-set the lead after a successful submission, so the "pending verification" banner and stage badge update immediately instead of requiring a manual page reload.

### Cross-Module Impact
- **Sale / Rental:** both `createSale`/`createRental` gain the dealType-lock check and the stage-string fix (see their own sections below).
- **Visit:** `UNRECOVERABLE_LEAD_STAGES` fix only; no behavior change beyond the string match now working correctly.
- **Analytics / Agent Performance:** unaffected by this section directly (they read `Sale`/`Rental` collections, not `Lead.stage`), but benefit from `Lead.dealType` becoming available as a reporting dimension later if ever needed (not required now).

---

## 2. Module: Sale & Rental — Resubmission/History Model

### Current State
Both `models/Sale.js` and `models/Rental.js` use the identical index: `{ lead: 1, status: 1 }, { unique: true, sparse: true }`, intended to enforce "one live filing per lead." Because the index is on `(lead, status)` rather than only on the *pending* state, a **second** rejection on the same lead collides with the first rejected document's still-existing `(lead, 'rejected')` index entry, throwing a duplicate-key error. `models/PropertyManagementRequest.js` already solves the equivalent problem correctly, with a **partial index**: `{ property: 1 }, { unique: true, partialFilterExpression: { status: { $in: [...live statuses...] } } }`.

### Broken/Inconsistent
Confirmed bug: a lead rejected twice for the same deal type cannot be re-filed a third time — the second rejection's own save throws `E11000 duplicate key`.

### Target State
A lead may accumulate any number of historical `Sale`/`Rental` documents (rejected ones kept permanently for audit/history), but at most **one** may be in `pending_review` at any time, for the currently-locked `dealType`.

### Required Changes

**`models/Sale.js` and `models/Rental.js` — Schema/index fix:**
- Replace the `{ lead: 1, status: 1 }` unique+sparse index on both models with:
  ```js
  { lead: 1 }, { unique: true, partialFilterExpression: { status: 'pending_review' } }
  ```
  This allows unlimited rejected/verified historical documents per lead, while still guaranteeing at most one `pending_review` document per lead at a time — same mechanism already proven in `PropertyManagementRequest.js`.

**`controllers/saleController.js` / `controllers/rentalController.js` — No logic change needed:**
Both controllers already check `lead.stage === 'pending_verification'` (post-Q1 rename) before allowing a new filing, which already prevents two *simultaneously pending* filings at the application layer — the index change is the safety net for the database layer, and it's what actually fixes the repeat-rejection bug. No controller code needs to change here beyond what's already covered in the Lead section above.

### Cross-Module Impact
None beyond Sale/Rental themselves — this is purely a database-constraint correction.

---

## 3. Module: Notification

### Current State
`models/Notification.js`'s `type` enum is missing exactly **13** values that are actively used in `notify()`/`notifyMany()` calls today (verified via a full scan of every call site's arguments, not a naive string search):

| Missing value | Used in |
|---|---|
| `emi_plan_pending` | `saleController.js` |
| `rental_submitted`, `rental_verified`, `rental_rejected` | `rentalController.js` |
| `management_request_submitted`, `management_request_approved`, `management_request_rejected`, `management_agent_assigned`, `management_status_changed`, `management_terminated`, `management_termination_requested` | `propertyManagementController.js` |
| `visit_completed`, `visit_rescheduled` | `visitController.js` |

Because `utils/notify.js` deliberately swallows all errors (so a notification failure never blocks the primary action), every one of these currently fails **silently** — no crash, no log a normal developer would notice, just a notification that never gets created.

**Notable finding:** the frontend's `components/NotificationBell.jsx` `iconTint` map **already** has entries for `emi_plan_pending`, `visit_completed`, and `visit_rescheduled` — the frontend was built correctly in anticipation of these; only the backend enum and the `rental_*`/`management_*` frontend icons are missing.

**Second confirmed discrepancy, found during implementation:** `utils/notify.js`'s field-whitelist (the object destructuring that decides which fields actually reach `Notification.create()`) has no `rental` key — only `sale`. `models/Notification.js` itself has a `sale` ref field but no `rental` ref field. `rentalController.js` passes `rental: rental._id` on all three rental notify calls, and it is silently dropped **before** it ever reaches Mongoose (at the `notify.js` helper layer, not the schema layer) — a different point of failure than the `type` enum issue above, but the same class of "silently missing," and on the exact same three notify calls this section already fixes. Since `title`/`message`/`property`/`lead`/`link` all pass through correctly, the notifications themselves will display and deep-link correctly once the `type` enum is fixed — only the notification document's own `rental` reference field will be silently absent, which matters if anything ever queries notifications by their linked rental (e.g. a future "show me all notifications about this rental" view).

### Target State
The enum stays a strict allow-list (Option A), extended to cover every value actually in use, plus a lightweight guardrail so this specific failure mode (a new `notify()` call using a type nobody added to the enum) is caught before merge, not discovered by a future audit. Additionally, the `rental` reference is wired through the same way `sale` already is, so a rental notification carries the same structural completeness a sale notification does.

### Required Changes

**`models/Notification.js` — Bug fix (schema):**
- Add all 13 missing values to the `type` enum.
- **Add a `rental` ref field**, mirroring the existing `sale` field exactly: `rental: { type: mongoose.Schema.Types.ObjectId, ref: 'Rental', default: null }`.

**`utils/notify.js` — Bug fix:**
- **Add `rental` to the field whitelist** that `notify()`/`notifyMany()` pass through to `Notification.create()`, mirroring how `sale` is already handled there.

**Frontend (`components/NotificationBell.jsx`, `pages/user/Notifications.jsx`) — Bug fix:**
- Add `iconTint` (and any matching label/icon lookup in `Notifications.jsx`) entries for the 7 `management_*` values and the 3 `rental_*` values. (`emi_plan_pending`, `visit_completed`, `visit_rescheduled` already have entries — no change needed for those three.)

**New: a guardrail script — New tooling, directly required by Q3's decision (not new architecture):**
- Add a small Node script (e.g. `scripts/check-notification-types.js`) that: greps every `controllers/*.js` file for `type:\s*['"]([a-zA-Z_]+)['"]` occurring inside a `notify(`/`notifyMany(` call (the same paren-depth-matching approach used to produce the table above), and asserts every value found is present in `Notification.schema.path('type').enumValues`.
- **Implementation detail, confirmed during implementation:** this repo has no existing test runner, `tests/` directory, lint config, or CI workflow (`.github/workflows/` absent) — there is no `pretest`/`lint` convention to hook into. Wire the script in as its **own** npm script instead: `"check:notifications": "node scripts/check-notification-types.js"`, run manually for now. Do not introduce a test framework or CI pipeline to host it — that's a separate decision outside this plan's scope; if the team wants ongoing enforcement rather than a manually-run check, that's a follow-up decision to raise separately, not something to solve unilaterally here.

### Cross-Module Impact
Rental, Property Management, Sale (the one `emi_plan_pending` call), Visit — all four modules' notifications start actually firing once the enum is fixed; no controller code changes needed in any of them for this specific issue.

---

## 4. Module: Rental

### Current State (from the original audit + fresh re-verification)
- `models/Rental.js`: `durationInMonths`, `monthlyRent`, `securityDeposit`, `remarks`, `tenant.{name,phone,email,user}`, `agent`, `property`, `lead`, `status` (`pending_review`/`verified`/`rejected`), review fields, `activities[]`. **No** `paymentFrequency`, `advanceMonths` — **and, corrected from this plan's original draft, no `startDate` field either**, even though `createRental` destructures `startDate` from the request body and the frontend form collects one.
- **Confirmed discrepancy, found during implementation (not in the original draft of this plan):** `controllers/rentalController.js::createRental` has the `startDate: start` typo (`start` is never declared — `ReferenceError` on every call). Fixing that typo alone is **not sufficient** — even corrected to `startDate: startDate`, Mongoose's default strict mode would silently drop the value on save, since the schema has no `startDate` path at all. This is the exact same failure mode already documented for `paymentFrequency`/`advanceMonths`, just missed for this field in the original draft. It also explains why `verifyRental`'s `property.rentedFrom = rental.startDate` (line ~350) would read back `undefined`, and `rentedUntil`'s date-math off it would produce an `Invalid Date` — i.e., §7's Property snapshot fields would have been silently populated with garbage even after every other fix in this plan landed. **`startDate` must be added to the `Rental` schema — see Required Changes below.**
- `controllers/rentalController.js::createRental` also sets `lead.stage`/`recordActivity` to values not in `Lead`'s enums (fixed in §1 above).
- `controllers/rentalController.js::verifyRental`: currently auto-calculates commission via `effectiveCommissionPercentage(property, propertyType)` and `leaseValue = monthlyRent × durationInMonths` — same pattern as `Sale`. Also sets `property.rentedFrom`/`rentedUntil`/`tenant`, none of which exist on the `Property` schema (silently dropped).
- Frontend `components/LeadManagement/SubmitRentalModel.jsx` calls `createRental(lead._id, payload)` — a two-argument call against a one-argument service function (`rentalService.createRental(payload)`), so `lead._id` is dropped and the wrong "payload" (a bare string) is sent; every submission fails before reaching the backend at all. The modal's form also collects `paymentFrequency` and `advanceMonths`.
- `pages/admin/VerificationQueue.jsx`: a clean, `DEAL_TYPES`-config-driven admin queue that already correctly lists/verifies/rejects both Sale and Rental; verification currently goes through a plain yes/no `confirm()` dialog with no input field — there's an existing reject-reason modal (local `rejectTarget`/`rejectReason` state) in the same file that's the right pattern to copy for a new "enter commission amount" step.

### Broken/Inconsistent
All P0/P1 items from the original audit (frontend arg mismatch, `start` typo, invalid Lead enum values, missing `Notification` types, missing `Property`/`Rental` schema fields, no transaction on create, index collision on repeat rejection) — all addressed by this plan (this section, §1, §2, §3, §7).

### Target State
Rental is a one-time transaction record, structurally and behaviorally symmetric with Sale **except** for one deliberate difference: commission is entered by the admin at verification time, not calculated.

1. Agent submits a rental deal against a Lead (locking its `dealType` to `'rental'`).
2. Admin verifies it, entering a commission amount by hand; a `CommissionRecord` is generated from that amount.
3. Rental is closed (`status: 'verified'`, terminal) — no ongoing rent-payment tracking exists or is planned.
4. `Property.status` becomes `'rented'` on verification, with a cached snapshot (`rentedFrom`/`rentedUntil`/`tenant`) for display; that cache is cleared only by the new, explicit "end tenancy" action (§7).

### Required Changes

**`models/Rental.js` — Schema fix (add the missing required field) + bug fix (remove dead fields, per Q4/Q5 "unused attributes should be removed"):**
- **Add `startDate: { type: Date, required: true }`** — required, not defaulted to `null`; it's already a mandatory input on every real rental filing (the frontend form collects it, `createRental` has always destructured it), the schema was simply never updated to match. Corrects a discrepancy in this plan's original draft, found during implementation.
- Confirm `paymentFrequency`/`advanceMonths` were never added to the schema (they weren't) — no schema change needed for those two, just ensure the controller (below) stops trying to set them.
- Replace the `{ lead: 1, status: 1 }` unique+sparse index per §2.

**`controllers/rentalController.js::createRental` — Bug fixes + business-rule change:**
- Remove `paymentFrequency`/`advanceMonths` from the destructured request body and from the `Rental.create({...})` call.
- Fix the `startDate: start` typo → `startDate: startDate` (now that the schema actually has the field to receive it).
- Add the `Lead.dealType` lock check from §1 before proceeding; on lock failure, return `400`.
- Set `lead.stage = 'pending_verification'` (was the invalid `'pending_rental_verification'`).
- Use the valid `Lead.activities.type` value `'rental_submitted'` (now valid per §1's enum addition — no code change needed here beyond what's already written, since the literal string was already correct, only the enum was missing it).
- Wrap the whole `Rental.create` → `property.save()` → `lead.save()` sequence in `runWithTransaction` (the same helper `verifySale`/`verifyRental`/`rejectSale`/`rejectRental` already use), matching the "createSale/createRental should ideally use it too" note from the original audit — this is a **new use of an existing, already-adopted pattern**, not new architecture.

**`controllers/rentalController.js::verifyRental` — Business-rule change (implements Q5's manual-commission decision):**
- Change the endpoint's accepted body from nothing-required to requiring `commissionAmount` (a non-negative number). Return `400` if missing, non-numeric, or negative.
- Remove the `effectiveCommissionPercentage(property, propertyType)` auto-calculation call.
- **Implementation detail (not re-litigating the decision):** `CommissionRecord.commissionPercentage` is a required field on the existing schema (kept unchanged, per "prefer existing patterns / avoid unnecessary schema changes" — see §11's CommissionRecord note). Since the admin enters an amount, not a percentage, back-compute a percentage purely for that existing required field and for reporting consistency with Sale-originated records: `commissionPercentage = leaseValue > 0 ? round2((commissionAmount / leaseValue) * 100) : 0`. This value is **derived and informational only** — `commissionAmount` remains the sole authoritative, admin-entered number; the derived percentage is never used to recompute or validate the amount.
- Set `property.status = 'rented'`, `property.rentedFrom = rental.startDate`, `property.rentedUntil = startDate + durationInMonths (months)`, `property.tenant = rental.tenant.user` — now persistable once the `Property` schema fields exist (§ Property module below).
- Everything else (transaction wrapping, notification calls, `CommissionRecord.create`, lead stage/activity updates) stays as-is except the stage/activity-type strings fixed in §1 and the `Notification.type` values fixed in §3.

**`controllers/rentalController.js::rejectRental` — No functional change** beyond the stage/activity string fixes already covered in §1.

**`controllers/rentalController.js::getRentals` — Bug fix:**
- Remove the `paymentFrequency` filter parameter (it filtered on a field that was never actually stored).

**Frontend (`services/rentalService.js`) — Bug fix + API contract change:**
- Fix `createRental` to be called with the correct single-argument shape used everywhere else in this file (`leadId` folded into the payload object, matching how the backend's `req.body.leadId` is read) — i.e. the fix is on the **caller** (below), but confirm the JSDoc here drops `paymentFrequency`/`advanceMonths` from its documented payload shape (they were already flagged there as "reserved for future use" and never actually sent — now formally removed).
- `verifyRental(id)` → `verifyRental(id, commissionAmount)`, sending `{ commissionAmount }` in the request body.

**Frontend (`components/LeadManagement/SubmitRentalModel.jsx`) — Bug fix + UI change:**
- Fix the call to `createRental(payload)` where `payload` includes `leadId: lead._id` (matching the shape `rentalController.createRental` reads `req.body.leadId` from) — this is the fix for the P0 "entire Rental filing UI is broken" bug.
- Remove the `paymentFrequency` select and `advanceMonths` input fields and the `PAYMENT_FREQUENCIES` constant.
- Update the "commission is calculated on this amount" hint text (no longer accurate) to something like: "Total lease value: NPR {leaseValue.toLocaleString()} — the admin will set the commission when verifying this filing."
- Wire `onSuccess` to actually re-fetch the lead (see §1's `LeadDetail.jsx` fix — same underlying change, done once).

**Frontend (`pages/admin/VerificationQueue.jsx`) — UI change (implements Q5's manual-commission entry point):**
- For `type === 'rental'` only: before calling `confirm()` → `service.verify(id)`, open a small modal (reuse the existing reject-reason modal's local-state pattern: a new `verifyRentalTarget`/`commissionInput`/`commissionError` trio) asking the admin to enter a commission amount. Pre-fill the input with a **suggested** value computed client-side or server-side from the property/property-type's default commission % applied to the rental's lease value (`monthlyRent × durationInMonths`) — purely a convenience default; the admin can change it freely, and the backend does not fall back to this value if the field is left blank (it returns `400`, per the contract above). Only after a valid amount is entered does the existing `confirm()` dialog show a final "Verify this rental with a commission of NPR X?" message, then call `service.verify(id, commissionAmount)`.
- Sale's verify flow is **not** touched — it keeps going straight to `confirm()` → `service.verify(id)` with no extra step.

### Cross-Module Impact
- **Lead:** dealType lock, stage rename (§1).
- **Property:** new schema fields, "end tenancy" action (§7).
- **CommissionRecord:** every Rental-originated record now carries an admin-entered `commissionAmount` and a derived `commissionPercentage`, plus the renamed `transactionAmount` field (§10).
- **Notification:** `rental_submitted/verified/rejected` now actually fire (§3).
- **Review:** verified rentals become a review-eligibility trigger (§5).
- **Agent performance / Analytics:** verified rentals are now correctly counted in the agent's rental-deal volume and roll into the combined "Deals Closed" and commission-earned totals (§6).
- **Archive/Dashboard:** Rental now has archival coverage and a dashboard pending-count (§8).

---

## 5. Module: Review

### Current State
`models/Review.js`: `eligibility` enum is `['visit', 'purchase']`. `controllers/reviewController.js::getReviewEligibility(user, property)` checks, in order, a completed `Visit` and a verified `Sale` for the given user/property pair, returning `{ eligible, reason }`.

### Target State
A verified `Rental` (tenant matches the reviewer) grants review eligibility immediately, exactly like a verified `Sale` does — no waiting for the lease term to end (Q7, Option A).

### Required Changes

**`models/Review.js` — Schema change:**
- Add `'rental'` to the `eligibility` enum.

**`controllers/reviewController.js::getReviewEligibility` — Business-rule addition (small, mirrors the existing `Sale` check exactly):**
- Import `Rental`.
- Add a check: `const verifiedRental = await Rental.findOne({ property: property._id, 'tenant.user': user._id, status: 'verified' });` → if found, return `{ eligible: true, reason: 'rental' }`, at the same point in the function the `Sale` check currently sits (order relative to the `Visit` check doesn't matter functionally, since the first match wins and either is sufficient).

### Cross-Module Impact
None beyond Review/Rental — the review submission, moderation, and reward-on-review logic downstream of `getReviewEligibility` already handles the `reason` generically and needs no further changes.

---

## 6. Module: Analytics & Agent Performance

### Current State
- `controllers/analyticsController.js`: `salesOverTime`, the agent leaderboard (`salesByAgentAgg`), and per-agent "Performance" cards are built **only** from the `Sale` collection. `commissionByAgentAgg` (and every commission total) already correctly sums `CommissionRecord` regardless of whether it originated from a `Sale` or a `Rental`. The leaderboard is built by iterating `salesByAgentAgg`'s results and merging commission data in — an agent with **zero** `Sale` records (rental-only) never appears on the leaderboard at all, even with real commission earned.
- `controllers/agentController.js::buildPerformanceForAgents`: same Sale-only pattern for `salesCount`/`salesValue`, merged with `commissionByAgentAgg`. **This file's roster sort already orders by `commissionEarned` descending** — that part of Q8's decision is already true here and needs no change.

### Target State (Q8, refined)
- Sale and Rental volume metrics stay visually and numerically **separate** (`salesCount`/`salesValue` vs. new `rentalCount`/`rentalValue`) — never merged into one blended "sales" number.
- A new **`dealsClosed`** field (`salesCount + rentalCount`) is shown as a supporting combined total.
- Every ranking (the Analytics leaderboard, the agent roster) is primarily ordered by **total commission earned** (already unified correctly across Sale+Rental via `CommissionRecord`).
- No agent with real commission (from either deal type) is ever missing from a leaderboard.

### Required Changes

**`controllers/analyticsController.js::buildAdminAnalytics` — Bug fix + feature addition:**
- Add a `Rental.aggregate([...])` parallel to the existing `salesOverTimeAgg` and `salesByAgentAgg` — same shape, but `$sum` on `{$multiply:['$monthlyRent','$durationInMonths']}` instead of `agreedPrice`, filtered to `status: 'verified'`.
- Build the leaderboard's agent list from the **union** of agent IDs present in `salesByAgentAgg`, the new `rentalsByAgentAgg`, and `commissionByAgentAgg` — not just `salesByAgentAgg` — so a rental-only agent is no longer invisible. This is the concrete bug fix for the "rental-only agent invisible" issue.
- Add `rentalCount`/`rentalValue` fields to each leaderboard row, and a computed `dealsClosed = salesCount + rentalCount`.
- Change the leaderboard's sort from `salesValue` descending to `commissionEarned` descending.
- Add a `rentalsOverTime` series alongside the existing `salesOverTime` series in the monthly chart data (kept as two separate series, not merged, per the decision), plus a computed `dealsOverTime` (element-wise sum of the two) for the combined-total chart.
- Add `pendingRentalVerifications` to whatever pipeline-snapshot object already reports `pendingSaleVerifications` here (keeps Analytics' own "pending work" view consistent with §8's Dashboard change).

**`controllers/analyticsController.js::buildAgentAnalytics` (single-agent detail view) — Same shape of change, scoped to one agent:**
- Add the Rental-side equivalents of whatever Sale-side monthly/this-month/previous-month figures already exist, and a `dealsClosed` total, without removing or merging the existing Sale-only figures.

**`controllers/agentController.js::buildPerformanceForAgents` — Feature addition:**
- Add a `Rental.aggregate` parallel to the existing `Sale`/`CommissionRecord` aggregates (grouped by `agent`, `status: 'verified'`, summing count and lease value).
- Merge into the same per-agent map already built here.
- In `performanceFor(id)` (or equivalent), add `dealsClosed = salesCount + rentalCount` to the returned object. No change needed to the existing sort (already by `commissionEarned`).

**Frontend — feature addition, following whatever chart/table components already render the current Sale-only figures:**
- Agent dashboard / admin analytics pages that currently show "Sales" counts/charts: add the new `rentalCount`/`rentalValue` and `dealsClosed` fields alongside (not replacing) the existing sales-only figures, and re-verify the leaderboard's sort column now reads `commissionEarned`.

### Cross-Module Impact
- **Rental:** verified rentals now actually show up in reporting for the first time.
- **CommissionRecord:** the rename in §10 must land *before* or *together with* this section, since these aggregations read commission fields directly.

---

## 7. Module: Property

### Current State
`models/Property.js`: `status` enum is `['available', 'reserved', 'sold', 'rented']`; only `available`/`reserved`/`sold` are reachable through the existing `PATCH /:id/status` endpoint (`updatePropertyStatus`, which explicitly excludes `'rented'` from its allow-list and uses a one-way `STATUS_RANK` that has no entry for `'rented'`). `soldTo`/`soldAt` exist for the Sale flow; **no equivalent fields exist for Rental** (`rentedFrom`/`rentedUntil`/`tenant`), even though `rentalController.js::verifyRental` already tries to set all three (silently dropped today).

### Target State
- `Property` gains the Rental-equivalent of `soldTo`/`soldAt`: `rentedFrom`, `rentedUntil`, `tenant` — a **cached, current-occupancy snapshot**, not the source of truth (the source of truth for the historical transaction is the `Rental` document itself, per the finalized source-of-truth statement).
- `Property.status` becomes `'rented'` when a `Rental` is verified (already-planned behavior, just needs the schema fields to actually persist it).
- `Property.status` reverts from `'rented'` to `'available'` **only** via a new, explicit "end tenancy" action — never automatically (Q6).

### Required Changes

**`models/Property.js` — Schema change:**
- Add:
  ```js
  rentedFrom: { type: Date, default: null },
  rentedUntil: { type: Date, default: null },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ```

**New endpoint — `PATCH /api/properties/:id/end-tenancy` — New functionality, directly required by Q6:**
- **Implementation detail (not re-litigating the decision):** implemented as a **new, separate** endpoint rather than folded into the existing `PATCH /:id/status`, because that endpoint's `STATUS_RANK`-based one-way-progression logic (`available → reserved → sold`) has no notion of `'rented'` at all, and mixing a bidirectional `rented ⇄ available` transition into a schema built around one-way ranking would be a larger, riskier change to an endpoint that currently works correctly for its existing purpose.
- Authorization: `admin` or the property's `listedBy` owner — same check already used in `updatePropertyStatus` (`property.listedBy.toString() === req.user._id.toString()`).
- Precondition: `property.status === 'rented'`, else `400` ("Property is not currently marked as rented.").
- Effect: `property.status = 'available'`; `property.rentedFrom = null`; `property.rentedUntil = null`; `property.tenant = null`; save.
- **Also**, append an activity entry to the underlying `Rental` document (`{ type: 'updated', message: 'Tenancy ended — property returned to available', by: req.user._id, byName: req.user.name }`, using the already-valid `'updated'` activity type — no schema change needed) so the permanent Rental record reflects when the tenancy actually ended, distinct from when it was verified. Find the relevant `Rental` via `Rental.findOne({ property: property._id, status: 'verified' })`.
- Route registration: add to `routes/propertyRoutes.js` alongside the existing `/:id/status` route, same middleware stack (`protect`, `requireVerified`).

**Frontend (`services/propertyService.js`) — API addition:**
- Add an `endTenancy(id)` function calling the new endpoint, following the existing pattern of `updatePropertyStatus(id, status)` in the same file.

**Frontend (`pages/admin/ManageProperties.jsx`) — UI addition:**
- **Note found during inspection:** this page has its **own** duplicated `STATUS_RANK = { available: 0, reserved: 1, sold: 2 }` constant, separate from the backend's — flagged in §11 as a duplicated-business-rule risk. **Correction, found during Phase 2 implementation:** this plan's original draft assumed the dropdown "already correctly excludes `'rented'` from its sale-progression dropdown" because `'rented'` has no `STATUS_RANK` entry — that assumption was wrong. With no `'rented'` key, the dropdown's enable/disable logic evaluated as unconditionally enabled on a blank comparison, meaning a `rented → available` transition could actually be selected and submitted through this dropdown, bypassing the new `end-tenancy` action entirely (no occupancy-field clear, no rental activity log entry). Fixed with a one-condition change (disable the status dropdown specifically for `'rented'` rows, with a "use End Tenancy instead" affordance) — `STATUS_RANK` itself was correctly left untouched, since the fix is about disabling the control for that one status, not about extending the ranking logic to understand `'rented'`.
- Add a small "End Tenancy" action button, shown only when `p.status === 'rented'`, calling the new `endTenancy(id)` service function and refreshing the row on success — same interaction pattern already used for the existing status-change buttons in this file.
- Add a `'rented'` badge/label wherever property status badges are rendered on this page (if not already present as a fallback style).

### Cross-Module Impact
- **Rental:** `verifyRental` now successfully persists these fields (§4).
- **Property search/listing:** no change needed — `saleType: 'rent'` properties already filter correctly by `status`; `'rented'` already excludes them from "available for rent" results the same way `'sold'` excludes sale properties, since search filters presumably already filter on `status === 'available'` (verify this assumption holds by checking the property search/listing query during implementation — flagged as a verification task, not assumed fixed).

---

## 8. Module: Dashboard & Archive/Retention

### Current State
- `controllers/dashboardController.js::getAdminStats`: computes `pendingSaleVerifications` via `Sale.countDocuments({status:'pending_review'})`; no Rental equivalent.
- `models/Archive.js`: `TYPES = ['property', 'sale', 'emiPlan']`. `utils/archival.js`: `archiveSales()`/`archiveProperties()`/`archiveEmiPlans()`, wired together in `runArchivalPass()`, itself called from a scheduled job in `server.js`. `archiveProperties()` guards against archiving a property that still has a live `Sale` reference; it does **not** check for a live `Rental` reference.

### Target State (Q12, Option A — fold into this same pass)
Rental gets the same dashboard visibility and archival coverage Sale already has.

### Required Changes

**`controllers/dashboardController.js::getAdminStats` — Feature addition:**
- Add `pendingRentalVerifications: Rental.countDocuments({ status: 'pending_review' })` alongside the existing `pendingSaleVerifications` (same `Promise.all` batch it's already part of).
- Add `rentedProperties: Property.countDocuments({ status: 'rented' })` alongside the existing `soldProperties` count, for symmetry.

**`models/Archive.js` — Schema change:**
- Add `'rental'` to `TYPES`.

**`utils/archival.js` — Feature addition (mirrors `archiveSales` exactly):**
- Add `archiveRentals()`, same shape/age-threshold/`Archive` document creation as `archiveSales()`, operating on `Rental` documents with a terminal status (`verified`/`rejected`) past the retention window.
- Update `archiveProperties()`'s pre-archive guard to also check `Rental.exists({ property: property._id })`, mirroring the existing `Sale.exists(...)` guard, so a property with rental history isn't archived out from under it.
- Add `archiveRentals` to `runArchivalPass()`'s sequence and to the `MODEL_BY_TYPE`/`JOBS` lookups used by the retention/restore tooling.

### Cross-Module Impact
None beyond Rental itself — purely additive, mirrors existing Sale-side code paths one-for-one.

---

## 9. Module: Visit (Office-Visit Reward Fix)

### Current State
`controllers/visitController.js::updateVisit`, at the two points where a visit transitions to `confirmed` or `completed`, calls `awardReward(visit.requestedBy, 'PROPERTY_VISIT_BOOK' | 'PROPERTY_VISIT_COMPLETE', { refId: visit.property._id, refModel: 'Property' })`. For `visitType: 'office'` visits, `visit.property` is `null` by design, so `visit.property._id` throws a `TypeError`, which (unlike the equivalent line in `convertVisitToLead`, which is wrapped in try/catch) is **not** caught here — the request 500s even though the visit's status change already saved successfully.

### Target State (Q9, Option A)
Office visits earn the same reward as property visits; the reward simply has no property reference attached.

### Required Changes

**`controllers/visitController.js::updateVisit` — Bug fix (both call sites, lines ~550 and ~559):**
- Change `refId: visit.property._id` to `refId: visit.property?._id ?? null`, and `refModel: 'Property'` stays only when `visit.property` exists — pass `refModel: visit.property ? 'Property' : undefined` (or however `awardReward`/`RewardTransaction` already represents a ref-less reward elsewhere; check `RewardTransaction`'s schema for how `refModel` is declared — likely already optional given other reward types don't always have a ref — and match that exact convention rather than inventing a new one).
- Wrap both calls in the same try/catch pattern already used at the third call site (`convertVisitToLead`, line ~757), so a future problem in the reward-awarding step can never fail the whole request again — this defensive fix applies regardless of the null-guard, since it's good practice already established elsewhere in this exact file.

### Cross-Module Impact
None — this is an isolated, contained fix to `visitController.js`.

---

## 10. Module: CommissionRecord (Field Rename)

### Current State
`models/CommissionRecord.js::saleAmount` is populated from either `Sale.agreedPrice` or Rental's `leaseValue`, with a comment already flagging the misleading name. Read by: `controllers/analyticsController.js`, `controllers/commissionController.js`, `controllers/saleController.js`/`controllers/rentalController.js` (writers), and exactly two frontend files (`pages/.../Commissions.jsx:271` and `pages/agent/MyCommissions.jsx:176`).

### Target State
Renamed to `transactionAmount` everywhere, before Analytics (§6) or any future deal type adds more readers of the old name.

### Required Changes

**`models/CommissionRecord.js` — Schema change:**
- Rename field `saleAmount` → `transactionAmount`.

**`controllers/saleController.js`, `controllers/rentalController.js` — Bug fix (mechanical rename at the write sites):**
- Update the `CommissionRecord.create({...})` calls to use `transactionAmount` instead of `saleAmount`.

**`controllers/analyticsController.js`, `controllers/commissionController.js` — Bug fix (mechanical rename at read sites):**
- Update every reference to `.saleAmount` on a `CommissionRecord`/aggregation pipeline field to `.transactionAmount` (including any `$group`/`$project` stage field names in aggregations).

**Frontend (`Commissions.jsx`, `MyCommissions.jsx`) — Bug fix:**
- `c.saleAmount` → `c.transactionAmount` at both locations; update any column header currently labeled in a sale-specific way if it renders a Rental-originated record.

### Cross-Module Impact
Analytics (§6) reads this field — sequence the rename before or together with the Analytics changes so nothing briefly reads a nonexistent field mid-rollout (see §5 Implementation Order).

---

## 11. Module: Conversation

### Current State
`models/Conversation.js::inquirer` is optional (`default: null`). `controllers/conversationController.js::createConversation` doesn't require it at the API-validation level either (`if (!owner || !initialMessage)`). Access sites `getConversationById`/`addMessage` dereference `conversation.inquirer._id` without a null guard.

**Verified reachability (every `Conversation.create()` call site in the codebase):**
- `conversationController.js::createConversation` (general admin endpoint) — allows `inquirer` to be omitted at the API layer, but its **only** frontend caller, `components/LeadManagement/LeadConversationThread.jsx`, explicitly checks `if (!lead.user) { ...return; }` first and always passes `inquirer: lead.user._id || lead.user` — so this path never actually omits it in practice today.
- `contactFormController.js` — already guards with `if (contactForm.user) { Conversation.create({ inquirer: contactForm.user._id, ... }) }` — a Conversation is simply never created for anonymous/guest contact-form submissions.
- `utils/leadAutoConversion.js` — always supplies a real inquirer (tied to the visit's requester).
- `utils/migrateInquiriesToLeads.js` — a one-time, manually-run (`npm run migrate:leads`) historical migration script; sets `inquirer: inquiry.user || null`, meaning it **may have already created** legacy `Conversation` documents with `inquirer: null` if it was run in the past against inquiries submitted by guests.

### Target State
`Conversation.inquirer` is a required field — the null case is made unrepresentable rather than guarded against, since no live, reachable code path in the app needs the flexibility.

### Required Changes

**Sequencing correction, made during implementation:** the original draft of this plan sequenced the `required: true` schema flip and its pre-deploy data check within the same Phase 0 step. In practice, the data check (`Conversation.countDocuments({ inquirer: null })`) can only be run against the real database, which the implementer does not have access to — so this decision is **split into a safe-now half and a blocked-pending-data-check half**:

**Do now (no data dependency):**
- `controllers/conversationController.js::createConversation` — add `if (!inquirer) return res.status(400).json({ success:false, message:'inquirer is required' });` alongside the existing `owner`/`initialMessage` check. Safe immediately: only affects *new* writes through this one endpoint, regardless of what legacy data exists.
- `controllers/conversationController.js::getConversationById` / `addMessage` — add a narrow guard now, ahead of schedule, rather than waiting to see whether legacy null-inquirer rows exist: if `!conversation.inquirer`, return a clear `409`/`400` ("This is a legacy conversation without an inquirer and can no longer be replied to.") instead of letting a null-dereference or a future validation error surface as a raw 500. This is cheap, harmless whether or not any such rows actually exist, and means this file only needs to be touched once rather than revisited after the count check comes back.
- `utils/migrateInquiriesToLeads.js` — add the same `if (inquiry.user) { ...create conversation... }` guard `contactFormController.js` already uses, so it never creates a *new* null-inquirer conversation again if re-run against remaining un-migrated records.

**Blocked, pending a data check the codebase itself cannot answer:**
- `models/Conversation.js` — the actual `inquirer: required: true` schema flip. **Before this lands, run `Conversation.countDocuments({ inquirer: null })` against the real (staging or production) database.** If zero: flip the schema field in a follow-up patch, no further action needed. If non-zero: the flip can still proceed (the `addMessage`/`getConversationById` guards above already make those legacy rows safe to keep around read-only), but confirm the count and roughly how old those rows are before flipping, purely so it's a confirmed decision rather than an assumption.

### Cross-Module Impact
None beyond Conversation itself, other than the data-compatibility step in §12.

---

## 12. Module: Category (PropertyType / District / City)

### Current State
`controllers/categoryController.js::deletePropertyType`/`deleteDistrict`/`deleteCity` perform a bare `findByIdAndDelete` with no check for properties still referencing the record.

### Target State
Deletion is blocked (with a clear count-based error) while any `Property` still references the category being deleted.

### Required Changes

**`controllers/categoryController.js` — Bug fix (same shape, three call sites):**
- Before each delete, run the matching count query — `Property.countDocuments({ propertyType: id })` / `{ 'location.district': id }` / `{ 'location.city': id }` (verify exact field paths against `Property.js`'s actual location sub-schema during implementation) — and if greater than zero, return `409` with a message like `"Cannot delete: N propert(y/ies) still use this <type>. Reassign them first."`.

### Cross-Module Impact
None — purely defensive, additive to the three existing delete handlers.

---

# Cross-Module Impact Summary

| Module | Depends on / affected by |
|---|---|
| **Lead** | Root of the dealType/stage change (§1); consumed by Sale, Rental, Visit (`UNRECOVERABLE_LEAD_STAGES`) |
| **Sale** | Index fix (§2); stage-string fix only (§1) — commission logic **unchanged** |
| **Rental** | The central module of this plan (§4); depends on §1 (Lead), §2 (index), §3 (Notification), §7 (Property schema) |
| **Property** | New schema fields + end-tenancy endpoint (§7); read by Rental (§4), search/listing (verify unaffected) |
| **Property Management** | Unaffected by this plan except gaining working notifications once §3 lands; deliberately not integrated with Rental (Q4) |
| **Commission (CommissionRecord)** | Field rename (§10); written by Sale (unchanged) and Rental (§4, now with manual amount); read by Analytics (§6), Commission pages |
| **Analytics / Agent Performance** | §6; depends on §4 (Rental working) and §10 (rename) landing first |
| **EMI Plan** | Not modified by this plan — confirmed no decision touches it; only its `emi_plan_pending` notification type gets fixed (§3) |
| **Review** | §5; depends on §4 (Rental) and §7 (Property `rentedUntil`, though Q7 doesn't gate on it since eligibility is immediate, not lease-end-based) |
| **Notification** | §3; unblocks Rental, Property Management, Sale/EMI, Visit notifications |
| **Conversation** | §11; independent of the Rental work, can be done any time |
| **Category** | §12; fully independent |
| **Dashboard / Archive** | §8; depends on Rental (§4) existing and working before the counts/archival are meaningful |
| **Authentication/authorization** | No changes anywhere in this plan touch auth — every new/changed endpoint reuses an existing authorization pattern already present in its file (owner-or-admin for Property, admin-only for verify/reject, etc.) |

---

# Implementation Order (Phases)

**Phase 0 — Foundational schema & index changes (no behavior change yet, safe to deploy alone)**
1. `Lead.js`: add `dealType`, rename stage enum value, extend `activities.type` enum, update the header doc-comment (still names `pending_sale_verification`).
2. `Sale.js`/`Rental.js`: swap to the partial unique index.
3. `Notification.js`: add the 13 missing enum values, add the `rental` ref field.
4. `Property.js`: add `rentedFrom`/`rentedUntil`/`tenant`.
5. `Review.js`: add `'rental'` to eligibility enum.
6. `Conversation.js`: **split** — do the `createConversation`/`addMessage`/`getConversationById` guards and the `migrateInquiriesToLeads.js` guard now; the `required: true` schema flip itself is **blocked** pending a `Conversation.countDocuments({ inquirer: null })` check against real data (see §Data & Migration) — implement everything else in this item, flip the schema field in a follow-up once that count comes back.
7. `CommissionRecord.js`: rename `saleAmount` → `transactionAmount`.
8. `Archive.js`: add `'rental'` to `TYPES`.
9. **`Rental.js`: add `startDate: { type: Date, required: true }`** — a gap in this plan's original draft found during implementation; without it, the `startDate: start` typo fix in §4 is not sufficient on its own (Mongoose strict mode would still silently drop the value), and `verifyRental`'s `rentedFrom`/`rentedUntil` computation would silently produce `undefined`/`Invalid Date`.
10. **`utils/notify.js`: add `rental` to the field whitelist** passed through to `Notification.create()` — found alongside item 3 above; without it, the `rental` ref on rental-related notifications is silently dropped one layer before Mongoose ever sees it, even after item 3's schema fix.

*These can all be done in parallel/independently — they touch different files and none depends on another within this phase, with the one noted exception in item 6.*

**Phase 1 — Backend controller logic (depends on Phase 0's schema being in place)**
1. `leadController.js`: stage-guard rename, `getSuggestedAction` case, dealType-lock helper.
2. `saleController.js`, `rentalController.js`: wire the dealType-lock check, fix stage strings, fix the `start` typo, remove `paymentFrequency`/`advanceMonths`, wrap `createSale`/`createRental` in `runWithTransaction`, rewrite `verifyRental`'s commission logic to require and use the admin-entered amount, persist the new `Property` fields, fix `getRentals`' dead filter.
3. `visitController.js`: fix the office-visit reward crash (null-guard + try/catch); fix `UNRECOVERABLE_LEAD_STAGES` string.
4. `reviewController.js`: add the Rental eligibility check.
5. `categoryController.js`: add the three reference-count guards.
6. `conversationController.js`: add the explicit `inquirer` validation.
7. `propertyController.js`/`propertyRoutes.js`: add the new `end-tenancy` endpoint.
8. `analyticsController.js`, `agentController.js`: add Rental-side aggregations, fix the leaderboard's agent-union bug, add `dealsClosed`, re-sort by commission.
9. `commissionController.js`, `saleController.js`, `rentalController.js`: mechanical `saleAmount` → `transactionAmount` renames.
10. `dashboardController.js`, `utils/archival.js`: add Rental counters and `archiveRentals`.
11. Add the `Notification.type` guardrail script.

*Within Phase 1, items 1–2 must land before 8–10 (Analytics/Dashboard read Rental data that only becomes correct once Rental itself works); items 3–7, 9, 11 are independent of each other and of 1–2/8–10, and can proceed in parallel.*

**Phase 2 — Frontend (depends on the corresponding backend endpoint/contract from Phase 1)**
1. `rentalService.js`, `SubmitRentalModel.jsx`: fix the argument mismatch, remove the two dead fields, fix `onSuccess` refetch — depends on Phase 1's `rentalController.js` fixes.
2. `leadConstants.js`, `LeadStatusBadge.jsx` + its 4 call sites, `LeadDetail.jsx`'s banner — depends on Phase 0's `Lead.dealType`/stage rename.
3. `VerificationQueue.jsx`: add the commission-entry modal for Rental verification only — depends on Phase 1's `verifyRental` contract change.
4. `NotificationBell.jsx`/`Notifications.jsx`: add the missing `rental_*`/`management_*` icon entries — depends on Phase 0's enum addition (so the values actually appear) but is otherwise independent.
5. `propertyService.js`, `ManageProperties.jsx`: add `endTenancy` call + "End Tenancy" button — depends on Phase 1's new endpoint.
6. `Commissions.jsx`, `MyCommissions.jsx`: `saleAmount` → `transactionAmount` — depends on Phase 0's rename.
7. Agent/Analytics dashboard pages: render the new `rentalCount`/`rentalValue`/`dealsClosed` fields — depends on Phase 1 item 8.

*All Phase 2 items are independent of each other (different files/pages); each only needs its own specific Phase 0/1 prerequisite, not the whole phase.*

**Phase 3 — Data migration & cleanup (can start any time after Phase 0's schema lands; must complete before enforcing the strictest constraints)**
See the Data & Migration Plan below — must run before/alongside deploying the `Conversation.inquirer` `required: true` change and the `Lead.stage` rename, specifically.

---

# Detailed Task Checklist

## Backend
- [ ] `models/Lead.js`: add `dealType` field; rename `pending_sale_verification` → `pending_verification` in `LEAD_STAGES` and the `isActive` virtual; extend `normalizeStage()`'s map; add `rental_submitted`/`rental_verified`/`rental_rejected` to `activities.type` enum; update the header doc-comment.
- [ ] `models/Sale.js`: replace `{lead,status}` unique+sparse index with the partial-index pattern.
- [ ] `models/Rental.js`: same index replacement; **add `startDate: { type: Date, required: true }`** (gap found during implementation — required for the `start`→`startDate` typo fix below to actually persist anything, and for `verifyRental`'s `rentedFrom`/`rentedUntil` computation to be valid).
- [ ] `models/Notification.js`: add the 13 missing `type` enum values; **add a `rental` ref field** mirroring the existing `sale` field (found during implementation).
- [ ] `models/Property.js`: add `rentedFrom`, `rentedUntil`, `tenant`.
- [ ] `models/Review.js`: add `'rental'` to `eligibility` enum.
- [ ] `models/Conversation.js`: the `inquirer: required: true` flip is **blocked pending a data check** — `Conversation.countDocuments({ inquirer: null })` must be run against real data first (no DB access during implementation); do the controller-level guards below now regardless.
- [ ] `models/CommissionRecord.js`: rename `saleAmount` → `transactionAmount`.
- [ ] `models/Archive.js`: add `'rental'` to `TYPES`.
- [ ] `utils/notify.js`: **add `rental` to the field whitelist** passed to `Notification.create()`, mirroring the existing `sale` handling (found during implementation — without this the schema-level `rental` ref above is still silently dropped one layer earlier).
- [ ] `controllers/leadController.js`: rename the guarded stage literal (line ~496); add `getSuggestedAction`'s `pending_verification` case; add the dealType-lock helper (or add it as a `Lead` instance method instead — pick one, don't duplicate).
- [ ] `controllers/saleController.js`: call the dealType-lock check in `createSale`; fix the stage-string write; rename `saleAmount` → `transactionAmount` in the `CommissionRecord.create` call.
- [ ] `controllers/rentalController.js`: remove `paymentFrequency`/`advanceMonths` handling; fix the `start` → `startDate` typo (now that the schema has the field to receive it); call the dealType-lock check; fix the stage-string write; wrap `createRental` in `runWithTransaction`; rewrite `verifyRental` to require and use `commissionAmount`, back-compute `commissionPercentage`, and persist the new `Property` fields; remove the dead `paymentFrequency` filter in `getRentals`; rename `saleAmount` → `transactionAmount` in the `CommissionRecord.create` call.
- [ ] `controllers/visitController.js`: null-guard + try/catch both `awardReward` calls in `updateVisit`; fix `UNRECOVERABLE_LEAD_STAGES`'s stage string.
- [ ] `controllers/reviewController.js`: add the `Rental`-based eligibility check to `getReviewEligibility`.
- [ ] `controllers/categoryController.js`: add reference-count guards to `deletePropertyType`/`deleteDistrict`/`deleteCity`.
- [ ] `controllers/conversationController.js`: add explicit `inquirer` validation in `createConversation`; add the legacy-null-inquirer guard to `getConversationById`/`addMessage` (do this now, ahead of the schema flip, per the sequencing correction in §11).
- [ ] `controllers/propertyController.js`: add `endTenancy` handler.
- [ ] `routes/propertyRoutes.js`: register `PATCH /:id/end-tenancy`.
- [ ] `controllers/analyticsController.js`: add Rental-side aggregations to `buildAdminAnalytics`/`buildAgentAnalytics`; fix the agent-union bug in the leaderboard; add `dealsClosed`; re-sort by `commissionEarned`; rename `saleAmount` references.
- [ ] `controllers/agentController.js`: add Rental aggregate to `buildPerformanceForAgents`; add `dealsClosed`.
- [ ] `controllers/commissionController.js`: rename `saleAmount` references.
- [ ] `controllers/dashboardController.js`: add `pendingRentalVerifications`, `rentedProperties`.
- [ ] `utils/archival.js`: add `archiveRentals()`; add the `Rental.exists()` guard to `archiveProperties()`; register in `runArchivalPass()`/`MODEL_BY_TYPE`/`JOBS`.
- [ ] `utils/migrateInquiriesToLeads.js`: add the `if (inquiry.user)` guard (low priority — only if this script may run again).
- [ ] New: `scripts/check-notification-types.js` guardrail. **No test/lint/CI convention exists in this repo** (confirmed during implementation — no test runner, no `tests/` dir, no lint config, no `.github/workflows/`); wire it in as its own npm script, `"check:notifications"`, run manually. Do not introduce a test framework or CI pipeline to host it as part of this plan.
- [ ] `controllers/leadController.js`/wherever Lead-creation happens in `contactFormController.js` and `utils/leadAutoConversion.js`: set `dealType` from `property.saleType` at creation when a property is known.

## Frontend
- [ ] `services/rentalService.js`: confirm/adjust `createRental`'s documented payload (drop the two dead fields); update `verifyRental(id, commissionAmount)`.
- [ ] `components/LeadManagement/SubmitRentalModel.jsx`: fix the `createRental` call's payload shape; remove `paymentFrequency`/`advanceMonths` fields and the `PAYMENT_FREQUENCIES` constant; update the commission hint copy; wire `onSuccess` to refetch.
- [ ] `pages/admin/LeadManagement/LeadDetail.jsx`: fix the `SubmitSaleModal` `onSuccess` refetch too (same bug, same fix); update the stage-check line to `pending_verification` with dealType-aware copy.
- [ ] `utils/leadConstants.js`: rename the stage entry.
- [ ] `components/LeadManagement/LeadStatusBadge.jsx`: accept and use a `dealType` prop.
- [ ] Update all 4 `<LeadStatusBadge>` call sites (`LeadCard.jsx`, `LeadDetail.jsx`, `AgentDashboard.jsx`, `MyLeads.jsx`) to pass `dealType`.
- [ ] `pages/admin/VerificationQueue.jsx`: add the commission-amount modal for Rental verification, reusing the existing reject-modal state pattern.
- [ ] `components/NotificationBell.jsx`, `pages/user/Notifications.jsx`: add icon/label entries for the 7 `management_*` and 3 `rental_*` types.
- [ ] `services/propertyService.js`: add `endTenancy(id)`.
- [ ] `pages/admin/ManageProperties.jsx`: add the "End Tenancy" button/badge for `status === 'rented'` rows.
- [ ] `pages/.../Commissions.jsx`, `pages/agent/MyCommissions.jsx`: `saleAmount` → `transactionAmount`.
- [ ] Agent dashboard / admin analytics pages: render `rentalCount`/`rentalValue`/`dealsClosed` alongside existing sales figures; verify leaderboard sort column reflects `commissionEarned`.

---

# Data & Migration Plan

**Do not assume the database is empty. The following existing-data situations must be handled:**

1. **`Lead` documents with `stage: 'pending_sale_verification'`.**
   Run a one-time migration: `Lead.updateMany({ stage: 'pending_sale_verification' }, { $set: { stage: 'pending_verification', dealType: 'sale' } })`. Safe and unambiguous — every existing document in this state is, by definition, a sale-verification-pending lead.

2. **`Lead` documents with an existing verified/rejected `Sale` or `Rental`, but no `dealType` set (all leads created before this change).**
   Backfill: for every `Lead`, if a `Sale` exists referencing it, set `dealType: 'sale'`; if a `Rental` exists referencing it (there shouldn't be any real ones yet, since Rental doesn't work today, but check anyway given any manual/test data), set `dealType: 'rental'`. Leads with neither stay `dealType: null` — this is the correct, intended state for a lead that hasn't reached a filing yet, not a gap to fill.

3. **Existing `Sale`/`Rental` documents and the new partial index.**
   Before applying the new `{ lead: 1 }` partial-unique index (scoped to `status: 'pending_review'`), check for any *existing* violation: `Sale.aggregate([{$match:{status:'pending_review'}}, {$group:{_id:'$lead', count:{$sum:1}}}, {$match:{count:{$gt:1}}}])` (and the same for `Rental`). If any lead currently has more than one `pending_review` document (shouldn't be possible under the current, buggy index, but confirm rather than assume), resolve manually before the index build, or it will fail to create.

4. **`Rental` documents already in the database with `paymentFrequency`/`advanceMonths` present.**
   These were never actually persisted (Mongoose strict mode silently dropped them) — confirm via `Rental.find({}).lean()` that no live document actually has these keys before removing the (already-nonexistent) schema paths; this should be a no-op cleanup, not a real migration.

5. **`Property` documents that should already be `'rented'` but aren't (because `verifyRental` couldn't persist the status/fields before this fix).**
   If any real Rental verifications happened despite the bugs (unlikely, since verification crashes as documented, but check), backfill: for each `Rental` with `status: 'verified'`, ensure the referenced `Property.status === 'rented'` and its `rentedFrom`/`rentedUntil`/`tenant` are populated from the Rental document. If none exist, this step is a no-op.

6. **`Conversation` documents with `inquirer: null`.**
   **This check must be run by whoever has database access — the implementer did not, and correctly flagged this as blocking rather than guessing.** Run `Conversation.countDocuments({ inquirer: null })` **before** deploying the `required: true` schema change (this is now the *only* remaining blocker on that specific schema change — the controller-level validation and the `addMessage`/`getConversationById` legacy guards are implemented ahead of time regardless of the count, per §11's sequencing correction). If any are found (most likely originating from a past run of `migrateInquiriesToLeads.js` against guest-submitted inquiries):
   - These documents will still load fine (`find`/`findById` are unaffected by schema validation), but any future `.save()` on one of them (e.g., a new message added to that thread) will fail validation once `inquirer` is required — which is exactly why the `addMessage` guard above already exists independent of this count.
   - Recommended handling: leave them as read-only historical records (most are old inquiries) — no further action needed once the guard is in place; report the count back so it's a confirmed decision, not an assumption, before flipping the schema field.

7. **`CommissionRecord.saleAmount` → `transactionAmount` rename on existing documents.**
   This is a real data migration, not just a schema change — existing documents have data under the old key. Run: `CommissionRecord.updateMany({}, { $rename: { saleAmount: 'transactionAmount' } })` **before** deploying the code that reads `transactionAmount`, so there's no window where the new code reads a field that doesn't exist yet on old documents. Sequence: migrate data → deploy code that reads the new name → (schema change removing the old path is implicit once no document/code references it).

8. **`Archive.TYPES` / existing `Archive` documents.**
   Purely additive — no existing `Archive` document needs modification; `'rental'` is simply a new, previously-impossible value going forward.

9. **`Rental` documents already in the database with no `startDate` value.** *(Gap in this plan's original draft, corrected during implementation.)*
   Since `startDate` was never actually persisted before this fix (silently dropped, same as `paymentFrequency`/`advanceMonths`), any existing `Rental` document — realistically none, since the creation flow has been broken end-to-end until this plan's fixes land — would be missing it. Before adding `required: true` on this field, run `Rental.countDocuments({ startDate: { $exists: false } })`; if non-zero, either backfill a best-guess date (e.g. the document's `createdAt`) or relax the new field to optional for pre-existing documents only. Given the module has been non-functional, this is expected to be a no-op, but confirm rather than assume, consistent with how every other "assume real data might exist" item in this plan is handled.

---

# API Contract Changes

| Endpoint | Change | Request | Response | Auth | Frontend consumers to update |
|---|---|---|---|---|---|
| `POST /api/rentals` | Bug fix only — contract unchanged, payload shape simplified | Drop `paymentFrequency`/`advanceMonths` from the documented body (never worked); `leadId` must actually be included by the caller (it always was expected, just never sent correctly) | Unchanged | Unchanged (agent/admin) | `SubmitRentalModel.jsx` |
| `PATCH /api/rentals/:id/verify` | **Contract change** | **New required field:** `{ commissionAmount: number }` (non-negative). Request without it now returns `400` (previously required nothing and auto-calculated) | Unchanged shape, but `commissionPercentage`/`commissionAmount` in the response now reflect the admin-entered value and its derived percentage, not an auto-calculated one | Admin only (unchanged) | `VerificationQueue.jsx`, `rentalService.js` |
| `PATCH /api/properties/:id/end-tenancy` | **New endpoint** | No body required | `{ success: true, property }` (property now `status: 'available'`, occupancy fields cleared) | Admin or property's `listedBy` owner | `propertyService.js`, `ManageProperties.jsx` |
| `DELETE /api/categories/property-types/:id` (and district/city equivalents) | **Contract change** | Unchanged | Now returns `409` with a count-based message if properties still reference the category (previously always `200`) | Admin only (unchanged) | Category admin management page (verify exact page name during implementation) |
| `POST /api/conversations` | **Contract change (stricter validation)** | `inquirer` is now required in the body — omitting it now returns a clean `400` instead of either succeeding (creating an inquirer-less conversation) or, previously, being allowed through | Unchanged | Unchanged | `LeadConversationThread.jsx` (already always sends it — no change needed) |
| `GET /api/analytics/admin`, `/api/analytics/agent/:id` | **Response shape addition** (non-breaking, additive fields) | Unchanged | Adds `rentalCount`/`rentalValue`/`dealsClosed` fields per leaderboard row and per agent; adds a `rentalsOverTime`/`dealsOverTime` series | Unchanged | Admin analytics dashboard, agent dashboard |
| `GET /api/agents` (roster) | **Response shape addition** | Unchanged | Adds `rentalCount`/`rentalValue`/`dealsClosed` to each agent's performance block | Unchanged | Agent roster page |
| `GET /api/dashboard/admin-stats` | **Response shape addition** | Unchanged | Adds `pendingRentalVerifications`, `rentedProperties` | Unchanged | Admin dashboard home |
| `GET /api/commissions`, `/api/commissions/mine` | **Response field rename** | Unchanged | `saleAmount` → `transactionAmount` in every returned commission record | Unchanged | `Commissions.jsx`, `MyCommissions.jsx` — **must update at the same time the backend deploys**, or these pages break (undefined field) |

---

# State & Workflow Rules (Explicit)

## `Lead.stage`
`new → contacted → site_visit_scheduled → negotiation → pending_verification → closed` (or `→ lost` from any non-terminal stage).
- `pending_verification` can only be **entered** automatically, by `createSale`/`createRental` (never set directly via `PATCH /leads/:id/stage` — already guarded, message updated in §1).
- `pending_verification` can only be **exited** automatically, by `verifySale`/`rejectSale`/`verifyRental`/`rejectRental` (verify → `closed`; reject → reverts to the lead's prior working stage, per whatever `rejectSale`/`rejectRental` already do today — unchanged).
- `Lead.dealType`: set once (`null → 'sale'` or `null → 'rental'`), then **immutable** for the life of that Lead. Enforced by the dealType-lock check in `createSale`/`createRental`.

## `Sale.status` / `Rental.status`
`pending_review → verified` (terminal) or `pending_review → rejected` (terminal, but re-fileable — a **new** `Sale`/`Rental` document may then be created against the same Lead, itself starting at `pending_review`).
- Only an admin can trigger `verified`/`rejected` (unchanged).
- Only an agent (or admin) can trigger the initial `pending_review` creation (unchanged).
- No transition is reversible once verified or rejected — a "resubmission" is always a **new document**, never a mutation of an old one (per Q2).

## `Property.status`
`available → reserved → sold` (one-way, `updatePropertyStatus`, unchanged) **or** `available → rented` (via `Rental` verification) `→ available` (via the new, explicit `end-tenancy` action only).
- `rented → available` is the **only** backward transition possible anywhere in `Property.status`, and it is **always manual** (Q6) — never triggered by a date, a cron job, or any other automatic process.
- Source of truth: `Rental` (the historical transaction, immutable once verified/rejected) vs. `Property.status`/`rentedFrom`/`rentedUntil`/`tenant` (a **derived, current-state cache**, safely clearable/resettable without affecting the underlying `Rental` record).

## `CommissionRecord`
Created once, at `Sale`/`Rental` verification, and never modified afterward (frozen `commissionAmount`/`commissionPercentage`, unaffected by later changes to a property's or property type's live commission rate) — this was already true and correct before this plan, and nothing here changes it, only extends who's allowed to *set* the amount (admin, manually, for Rental only).

## `Conversation`
No new transitions — `inquirer` simply becomes a fixed, required attribute set once at creation, never changed afterward (already true in every real usage; now enforced).

---

# Testing and Verification

## Unit / Service-level
- `Lead.normalizeStage()` maps the legacy `'pending_sale_verification'` value correctly.
- Dealtype-lock helper: `null → 'sale'` succeeds; `'sale' → 'sale'` succeeds (no-op, resubmission case); `'sale' → 'rental'` fails.
- `verifyRental`'s commission-percentage back-calculation: `commissionAmount=0` → `0%`; `leaseValue=0` (shouldn't happen given required fields, but test the guard) → doesn't divide by zero.
- `effectiveCommissionPercentage`/`estimatedCommissionAmount` remain used **only** for the Rental verify UI's suggested-default, never for the persisted `Sale`-side calculation (confirm `Sale`'s logic is untouched).

## Controller / API
- `POST /api/rentals`: full happy path (with the argument-shape fix) creates a `Rental`, sets `Lead.dealType='rental'` and `stage='pending_verification'`, does **not** attempt to persist `paymentFrequency`/`advanceMonths`.
- `POST /api/rentals` against a Lead already locked to `'sale'` → `400`.
- `POST /api/sales` against a Lead already locked to `'rental'` → `400`.
- `PATCH /api/rentals/:id/verify` without `commissionAmount` → `400`; with a valid amount → `Rental.status='verified'`, `CommissionRecord` created with the exact entered `transactionAmount`/derived `commissionPercentage`, `Property.status='rented'` with the three new fields populated, all three `rental_*` notifications actually persisted (not silently dropped).
- `PATCH /api/rentals/:id/reject` twice in a row (reject → resubmit → reject again) on the same Lead succeeds without a duplicate-key error (the core §2 regression test).
- `PATCH /api/properties/:id/end-tenancy`: only works when `status==='rented'`; correctly resets all three fields; correctly appends the Rental activity entry; rejected with `400` on a property that's `available`/`reserved`/`sold`.
- `DELETE` on a `PropertyType`/`District`/`City` still referenced by a `Property` → `409` with a non-zero count in the message; succeeds once zero properties reference it.
- `POST /api/conversations` without `inquirer` → `400`.
- `GET /api/reviews/eligibility/:propertyId` for a user with a verified `Rental` on that property (no completed visit, no sale) → `{eligible:true, reason:'rental'}`.
- Analytics/agent-performance endpoints: an agent with only verified `Rental`s (no `Sale`s) appears in the leaderboard with correct `commissionEarned`, `rentalCount`/`rentalValue`, and `dealsClosed`; sort order is by `commissionEarned`, not `salesValue`.
- Notification guardrail script: run it against the current (post-fix) codebase and confirm zero violations reported; temporarily introduce a fake unregistered `type:` string in a test branch and confirm the script fails.

## Frontend
- Submitting the Rental modal actually reaches the backend with the correct `leadId` + payload (verify via network inspection, not just "no error shown").
- After a successful Rental (or Sale) submission, the Lead detail page's stage badge and banner update **without a manual reload**.
- The Rental verify flow in `VerificationQueue.jsx` cannot be completed without entering a commission amount; the Sale verify flow is completely unaffected (still one click).
- `LeadStatusBadge` shows "Pending Verification · Rental" vs "· Sale" correctly across all 4 render locations.
- Notification bell renders a real icon/label (not a generic fallback) for a `rental_verified` and a `management_request_submitted` notification.
- "End Tenancy" button appears only for `status==='rented'` rows in `ManageProperties.jsx` and correctly returns the property to `available` in the UI without a page reload.
- Commission pages render `transactionAmount` correctly for both Sale- and Rental-originated records.

## Integration / Cross-module
- Full path: Visit → auto-converted Lead (property `saleType:'rent'`) → `dealType` auto-set to `'rental'` at creation → agent submits Rental → admin verifies with a manual commission → `CommissionRecord` created → Property shows `rented` with correct dates → tenant can immediately leave a review → admin later ends tenancy → property becomes `available` again → Rental document itself is untouched throughout (still shows `status:'verified'` and its original dates) → Analytics leaderboard reflects the agent's commission and rental count.
- Full path for Sale, confirming **zero regression**: existing Sale creation, verification (still auto-calculated, unaffected), commission creation, and analytics all behave exactly as before this plan, just with the renamed `transactionAmount` field and the generalized `pending_verification` stage.

## Regression
- Every existing Sale flow (create/verify/reject, commission auto-calculation, notifications, analytics) must produce **identical** outcomes to before this plan, other than the renamed field and the generalized stage name.
- Existing `Visit` confirm/complete flows for **property** visits (not office) must be completely unaffected by the office-visit reward fix.
- Existing Conversations created before the `inquirer` change must still be readable (`GET`/list views) even if a legacy one has `inquirer: null`.

## Edge Cases / Invalid Transitions
- Attempting to verify a Rental that's already `verified` or `rejected` → still blocked exactly as today (unchanged logic, just confirm it still holds after the commission-field change).
- Attempting `end-tenancy` on a property with `status: 'sold'` → `400`, not silently accepted.
- A Lead with `dealType: null` that never gets a Sale or Rental filed against it → stays fully functional through every other stage (no regression to leads that are, e.g., lost or closed via a path other than verification).
- `commissionAmount: 0` on Rental verification (a legitimate, if rare, "no commission this time" case) → accepted, not rejected as falsy/invalid (careful with `!commissionAmount` vs. an explicit `typeof`/`isFinite` check in validation).

---

# Risks and Implementation Cautions

- **Duplicated business rules across files (flagged, not touched unless necessary):**
  - `propertyController.js`'s `STATUS_RANK` and `pages/admin/ManageProperties.jsx`'s own, separately-declared `STATUS_RANK` constant encode the same one-way sale-progression rule in two places. **This risk materialized, not just a theoretical one:** the frontend copy's lack of a `'rented'` entry did not, in fact, safely exclude it by default (corrected in the Property module section above) — it took an explicit, separate one-line guard to actually prevent a `rented → available` dropdown selection from bypassing `end-tenancy`. The general lesson stands and is now confirmed rather than assumed: a future change to the backend's allowed statuses **will not automatically apply** to this frontend copy, and must be updated in both places, verified against actual behavior rather than inferred from the absence of an enum entry.
  - The `{lead:1,status:1}` → partial-index fix is applied identically to both `Sale` and `Rental` — if a third deal type is ever added, remember to apply the same partial-index pattern to it too, rather than reintroducing the old blunt index.
- **`verifyRental`'s commission change is a genuine behavior divergence from `verifySale`** — a developer skimming both functions side-by-side in the future may assume they're still symmetric and "fix" `verifyRental` back to auto-calculating out of a desire for consistency. Leave a clear code comment at the top of `verifyRental` explaining this is a deliberate, decided difference, not an oversight.
- **The `Conversation.inquirer` required-field change is the riskiest single schema change in this plan** in terms of potential for a surprise legacy-data failure — it's the only change in this plan where "no live code path needs the old flexibility" was established by inspection rather than by a guarantee, since a historical migration script *may* have already created null-inquirer documents outside of normal application flow. Run the count check in the Migration Plan **before** deploying this specific schema change, not after.
- **Sequencing the `CommissionRecord.saleAmount` rename incorrectly will break the Commissions pages immediately** — the data migration (`$rename`), the backend code change, and the frontend code change must all land together (or data-migration-first, then code, in the same deploy window), not the backend/frontend code first with the data migration "to follow later."
- **The Analytics leaderboard fix (union of agent IDs) is easy to under-scope** — if only `rentalsByAgentAgg` is added but the leaderboard-building loop still iterates `salesByAgentAgg` as its primary list (rather than a proper union of all three aggregates' agent IDs), the original "rental-only agent invisible" bug will persist in a slightly different disguise. Verify with a test agent that has rentals but zero sales.
- **`awardReward`'s `refModel` handling for a null `refId`** — confirm how `RewardTransaction`'s schema and any other `awardReward` call sites in the codebase (not just the two being fixed) already represent a reward with no reference, and match that exact convention, rather than introducing a new "empty ref" shape specific to this one fix.
- **This plan's original draft had two gaps in the Rental/Notification sections, found and corrected during implementation — worth noting as a pattern, not just fixing the instances:** `Rental.startDate` was missing from the schema description entirely, and `notify.js`'s field whitelist / `Notification.js`'s ref fields were missing a `rental` counterpart to the existing `sale` one. Both were caught only because the implementer cross-checked the plan against the actual schema/helper code rather than trusting the plan's Current State summary at face value — the same "verify against the actual code" discipline this plan asked for throughout should be assumed to still be necessary even for the plan's own foundational descriptions, not just for the "verify during implementation" callouts explicitly marked as uncertain.
- **`Conversation.inquirer`'s schema flip has an external dependency this plan cannot resolve on its own** — it requires a database count check that only someone with data access can run. Treat it as genuinely blocked, not as a task to estimate or work around; the controller-level guards implemented ahead of it are sufficient to ship safely in the meantime.

---

# Phase 2A — Implementation Notes (completed, findings carried forward)

Phase 2A's frontend fixes (rental filing arg mismatch, admin commission-entry step, Commissions/MyCommissions field rename, stage-label generalization) are implemented and verified — build passes, and an API-contract script confirmed every fixed component now sends/expects the exact shapes the backend actually implements.

**Two bugs found and fixed along the way, not in this plan's original draft — both were blocking the exact flows Phase 2A was fixing, so fixing them in the same pass was correct, not scope creep:**
1. `LeadDetail.jsx` referenced an undeclared `property` variable (`const isRentalProperty = property?.saleType...` with no `property` in scope) — a `ReferenceError` that crashed the entire page, which is a strictly worse failure mode than the stage-label bug this plan was already fixing there. Derived it from `lead.property` with a guard instead.
2. The "Submit Sale" button on the negotiation stage set a `showSubmitSale` state variable that nothing read — the modals actually gate on `saleModalOpen` — so the button could never open anything. Wired to the state the modals actually use; removed the dead variable.

**Open item — needs confirmation before this is considered fully closed:** whether the Phase 0 data migration for existing `Lead` documents (`stage: 'pending_sale_verification'` → `'pending_verification'` + `dealType` backfill, per the Data & Migration Plan's item 1) has actually been run against the target database. A `stageMeta` legacy alias was added on the frontend so an unmigrated row renders correctly rather than falling back to a generic label — this is good defensive parity with the backend's own `normalizeStage` pattern regardless of the answer, but if the migration hasn't run yet, it needs to be added to the same deploy checklist as the stale-index and `CommissionRecord` rename items from Phase 1A, not left indefinitely masked by this alias.

**Resolved in Phase 3:** the stage rename itself was confirmed complete (zero old-stage rows); the `dealType` backfill was confirmed **not** run through Phase 2B and was actioned in Phase 3 (see below).

---

# Phase 2B — Implementation Notes (completed, findings carried forward)

Phase 2B (notification icons/labels, end-tenancy UI, agent/analytics dashboards) — the last sub-batch of Phase 2 — is implemented and verified: 46/46 live API-contract checks, `npx vite build` clean.

**Both loose ends carried over from Phase 2A are now closed:**
- The `Lead.dealType` backfill (Data & Migration Plan §2) was confirmed not run through Phase 2B, and was actioned in Phase 3: the 3 leads with `Sale` references → `'sale'`; no lead with a live `Rental` reference existed (the single pending rental points at a deleted lead row — pre-existing test debris, flagged not fixed); the remaining 5 leads with no filings stayed `null` — correct, not a gap.
- The `Conversation.inquirer: required: true` schema flip (blocked since Phase 1A) was applied in Phase 3, once both of its conditions were met: the legacy-row count was known (2) and the fallback 409 guards were proven working. Post-flip re-verification passed: both legacy rows still list normally, and message writes to them return the clean 409 (not a raw validation error).

**Correction to this plan's own prior assumption, found during implementation** (see the corrected text in the Property module section and the Risks section above): the original draft assumed `ManageProperties.jsx`'s status dropdown "already correctly excludes `'rented'`" simply because that status had no entry in the page's own `STATUS_RANK` constant. It did not — the missing entry meant the dropdown was left unconditionally enabled for `'rented'` rows, allowing a `rented → available` transition that bypassed `end-tenancy` entirely (no occupancy-field clear, no rental-activity log entry). Fixed with a single added condition; `STATUS_RANK` itself was correctly left untouched. **This is the second time in this plan a "current state" claim turned out to be wrong on inspection** — the first being `Rental.startDate` in Phase 1A. Both were caught only because the implementer verified against the actual code rather than trusting the plan's summary at face value; every "this should already be fine" statement anywhere in this document should be read the same way — as a claim to verify, not a fact to build on.

**Other deviations, approved:**
- Two pre-existing dead links (an "awaiting verification" link on the Analytics and Admin Dashboard pages pointing at a route that doesn't exist) were retargeted to the actual verification-queue route, found on the exact lines already being edited for this phase's leaderboard/dashboard additions.
- Rental counter cards were added to the admin dashboard home even though not explicitly itemized for this phase — Phase 1B's `pendingRentalVerifications`/`rentedProperties` counters otherwise had no surface to render on. Small, symmetric addition matching the existing sold/pending-sale cards.

**Found, correctly left out of scope:** the Notifications page has no label/icon treatment at all for `visit_*`, `contact_form_*`, `lead_*`, or `review_*` notification types — they render via a generic fallback badge. Same class of gap this phase closed for `rental_*`/`management_*`, but pre-existing and unrelated to this plan's scope; worth a future pass, not this one.

---

# Phase 1A — Implementation Notes (completed, findings carried forward)

Phase 1A (items 1–7, 9, 11 of the backend checklist — everything except Analytics/Agent-performance and Dashboard/Archive) is implemented and verified end-to-end against a live database. The following findings from that work are **deploy-relevant** and must not be lost between now and whenever this reaches staging/production, since they were discovered only by running against real data rather than by static review:

1. **Stale indexes.** The live database had the *old* `{lead:1,status:1}` unique index still present on both `sales` and `rentals` collections (it caused a real `E11000` during testing), plus a leftover plain `{lead:1}` index blocking the new partial index from being created. Both were dropped and the correct partial-unique index built in the environment this was tested against. **Every other environment (staging, production) needs the same two `dropIndex` calls before the new index can be created — Mongoose's `autoIndex` does not clean up or replace a differently-shaped existing index of the same field(s) on its own.**
2. **`CommissionRecord` migration.** Resolved in the test environment (see above — run before Phase 1B started). Still pending on any other environment: run the `$rename` migration in the same deploy window as this code ships, not after.
3. **2 legacy `Conversation` documents with `inquirer: null`** confirmed to exist in the test data. Per the plan's sequencing (§11), the `required: true` schema flip stayed blocked through Phase 1A/1B/2A; **it was applied in Phase 3**, once the count was known and the fallback 409 guards were proven working (post-flip re-verified: rows still list, writes return the clean 409). No further action needed unless the count differs materially on another environment (re-run the count there too before applying the same flip, don't assume it matches).
4. **No test runner/CI exists in this repo** (confirmed, as anticipated in §3/§4) — Phase 1A's verification was done via throwaway scripts outside the committed codebase. This remains true for Phase 1B; continue verifying the same way.
5. **Guardrail limitation, not a bug:** the notification-type guardrail script cannot statically resolve a template-literal `type` value (`` `visit_${status}` ``-shaped) — it correctly flags this as a manual-check note rather than silently passing or failing on it. Confirm the resolvable values by hand (see Phase 1B kickoff) and document that confirmation in the script's own comments; do not attempt to make the guardrail parse runtime string interpolation.

**Deviations approved, applied retroactively to this plan's own record (not new decisions — mechanical implementation choices the plan left open):**
- The dealType-lock mechanism is implemented as `Lead.lockDealType()` (instance method) plus a small `Lead.dealTypeForSaleType()` static helper, rather than a standalone controller function — the plan allowed either location; this avoids duplicating the `rent → rental` mapping in more than one place.
- The lock check runs *before* the existing `pending_verification`-stage guard in `createSale`/`createRental`, so a cross-type filing attempt gets the "create a new Lead" message even while another filing is already pending on that lead — a slightly stricter, more correct ordering than the plan specified at that level of detail.
- The office-visit reward null-guard was applied to all **three** `awardReward` call sites (`updateVisit` ×2 **and** `convertVisitToLead` ×1), not just the two that previously crashed — the third already had try/catch per the original audit, but lacked the null-guard itself; extending it there too makes Q9's "office visits earn the same reward" hold uniformly across every path, not just the two that happened to be broken.
- Explicit `startDate` presence/format validation was added to `createRental`, consistent with the field now being `required: true` on the schema.

---

# Phase 3 — Implementation Notes (final phase, closing pass)

**Data items closed:**
- `Lead.dealType` backfill run against the live database: 3 `Sale`-linked leads `null → 'sale'`; 0 `Rental`-linked leads eligible (the lone pending rental references a deleted lead row — orphaned test debris from an earlier phase, left in place and flagged, not silently removed); 5 filing-less leads correctly left `null`. Before: 8/8 null. After: 3 sale / 0 rental / 5 null.
- `Conversation.inquirer: required: true` applied. Post-flip: both legacy null-inquirer rows still list (29/29 via `?isActive=all`), message writes to each return the existing 409 guard (not a Mongoose validation error). `required` only validates on write, so reads are unaffected by construction.

**Full regression: 32/32 live checks pass** (throwaway script, all test documents removed, collection counts back to baseline): sale file → auto-calc verify (5% of 10M = 500,000) → `transactionAmount` record → sold/closed side-effects → both sale notifications → leaderboard figures; rental file → lock/pending → manual-amount verify → rented with dates → lease-value commission → all three rental notification types (via a reject→resubmit→reject cycle that also proves the duplicate-key fix, 2 rejected filings kept) → cross-type lock 400s both ways → tenant `{eligible:true, reason:'rental'}` → review submitted → rental-only agent on leaderboard and roster, commission-sorted → end-tenancy restores and clears with the rental document's own history intact (plus one appended activity) → end-tenancy on a sold property 400s; office visit confirm+complete with both rewards; category 409s on all three types and 200 on an unreferenced type; guardrail clean; dashboard rental counters present; archival re-check (old rental archived, live-rental property skipped).

**Debris found, not created this phase (left for the deployer to decide):** 1 orphan `pending_review` rental pointing at a deleted lead; 20 historical conversations with deleted lead references; 4 conversations with deleted inquirer-user references. None block any flow; none were introduced by this phase's tests (verified by timestamp + tag sweep, leftover count zero).

**Plan-record correction:** the Phase 2A/2B/1A notes above previously stated the backfill "has since been run" and the flip "applied in Phase 2B" — both were verified false against the live database at the start of this phase (third and fourth instances of this plan's own "verify, don't trust" rule) and have been corrected to Phase 3 above.

---

# Definition of Done

- [ ] Filing a Rental end-to-end (agent submits → admin verifies with a manually-entered commission → property shows `rented` with correct dates → commission record created → all three rental notifications actually delivered) works with **zero** manual database intervention, on a fresh test Lead.
- [ ] A Lead can be rejected on the same deal type twice in a row without a duplicate-key error, and both rejected filings remain visible in that Lead's history.
- [ ] A Lead locked to `dealType: 'sale'` cannot have a Rental filed against it (and vice versa); the error message correctly directs the user to create a new Lead.
- [ ] The Notification guardrail script runs clean against the final codebase and is wired into the project's existing CI/lint step.
- [ ] A tenant with a verified Rental (and no Sale, no completed Visit) can successfully submit a review immediately.
- [ ] The agent leaderboard and roster both show a test agent with rentals-only activity, correctly ranked by commission earned, with `dealsClosed` reflecting the combined count.
- [ ] Confirming or completing an **office** visit no longer 500s, and the requester still receives their visit-completion reward.
- [ ] Deleting a `PropertyType`/`District`/`City` still referenced by any property is blocked with a clear message; deleting one with zero references still succeeds.
- [ ] Every existing Sale flow (creation, auto-calculated verification, notifications, analytics, commission reporting) behaves identically to before this plan, verified by re-running the original audit's Sale-related test cases.
- [ ] `Commissions.jsx` and `MyCommissions.jsx` render correctly for both Sale- and Rental-originated commission records, with no undefined/blank amount fields.
- [ ] The `end-tenancy` action correctly returns a rented property to `available`, is blocked on non-rented properties, and leaves the originating `Rental` document's own historical record completely unchanged.
- [ ] No `Conversation` created after this deploy can ever have a null `inquirer`; the pre-existing legacy-data check has been run and any null-inquirer documents found are handled per the migration plan (not left to fail unpredictably on next write).
- [ ] The admin dashboard shows `pendingRentalVerifications` and `rentedProperties`; the weekly archival job successfully archives a test terminal-status Rental without erroring, and does not archive a property that still has rental history.

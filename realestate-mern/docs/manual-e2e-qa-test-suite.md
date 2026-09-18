# End-to-End Manual QA Test Suite — Real-Estate MERN Application

## 1. Purpose

This document is a manual, human-executable end-to-end QA test suite for the real-estate application in this repository (`realestate-mern`). It is written for a QA tester who does not need to understand implementation details. Every test describes observable browser behavior only.

Rules followed during authoring:

- No application source code was modified.
- No functionality, roles, or expected results were invented. All flows were derived from actual frontend routes, backend routes/controllers/middleware, Socket.IO implementation, and existing docs (`README.md`, `system-user-flow-audit.md`, `real-time-*.md`).
- REST is authoritative; Socket.IO events are hints that must be verified against REST state after reconnect.
- Do not record real secrets, JWTs, passwords, or connection strings in test evidence. Use placeholder test accounts.

## 2. Scope

In scope: all user-facing browser flows — authentication, profile/KYC, properties, search/filter, property detail (inquiry/visit/favorite/review/share), visits, leads, conversations/chat, notifications/unread, realtime, uploads, sales/rentals verification, EMI plans, commissions, reviews, contact forms, property-management requests/services, hero slides (admin management + homepage carousel), admin management (users, agents, categories, blogs, archives, analytics, dashboard), wallet/rewards, navigation/refresh, session lifecycle, deployment verification (Vercel frontend → Render backend), and functional security checks.

Out of scope: automated tests, penetration testing, destructive security testing, load testing, source-code fixes.

## 3. Application Overview

- **Stack:** React 18 + React Router 7 SPA (Vite, Tailwind) + Express REST API + MongoDB + Socket.IO + Cloudinary uploads.
- **Deployment under test:** Frontend on Vercel (SPA with rewrite `/* → /index.html`); Backend + realtime on single Render instance (`https://real-estate-project-p237.onrender.com`, API base `…/api`, health `GET /api/health`); Socket connects browser → Render directly (polling + websocket transports).
- **Key concepts:**
  - Guest = not logged in. Can browse properties/blogs, use land converter, submit public contact form.
  - `user` = default role. A verified `user` who lists a property acts as that property's owner. There is no separate `owner` role in code.
  - `agent` = sales staff. Works assigned leads/visits, files sales/rentals, sees own commissions.
  - `admin` = full control (users, agents, verifications, sales/rental verification, EMI, commissions payout, blogs, categories, archives, analytics).
  - Two orthogonal gates: `isEmailVerified` (blocks login until email code verified) and `verificationStatus` (`pending | verified | rejected`, from KYC identity docs; blocks property posting and management requests unless `admin`).
  - Property lifecycle: `available → reserved → sold` (sale) or `available → rented → available` (rent, via end-tenancy). Status moves forward only.
  - Lead lifecycle: `new → contacted → site_visit_scheduled → negotiation → pending_verification → closed`, with `lost` as terminal non-close. `pending_verification` and `closed` have filing/role restrictions.
  - Conversations are per (inquirer, owner/property/lead) thread with `isActive` open/closed flag. Only `admin` can reopen.
  - Hero slides are admin-only content (`draft | published` + schedule window + numeric order) feeding the homepage carousel. Public feed shows only published, in-schedule slides whose linked property (if any) is still promotable; derived states are Draft/Scheduled/Active/Expired. Desktop overlays the carousel on the static hero's bottom-right; mobile replaces the static hero; empty/error falls back to the static hero.
  - Realtime events (server → client only): `v1.notification.unread`, `v1.conversation.unread`, `v1.conversation.message`, `v1.conversation.status`. All mutations go over REST; sockets only deliver hints + live message/status fan-out to joined rooms.

## 4. Test Environment

- Frontend URL (Vercel deployment): `____________________`
- Backend API base (Render): `https://real-estate-project-p237.onrender.com/api`
- Backend health: `https://real-estate-project-p237.onrender.com/api/health`
- Browsers required: Chrome + one of Firefox/Edge. Test multi-user flows with two separate browsers (or normal + incognito) to isolate sessions.
- Network tools: browser DevTools (Console + Network + Application/Storage) for evidence only. Do not hand-craft API calls except where the test explicitly says "via UI".
- Socket check: DevTools Network → WS filter; expect WebSocket `101 Switching Protocols` to Render host on login.

## 5. Test Accounts / Test Data

Create these accounts once (do not use real personal data). Record only usernames/roles, never passwords, in results.

| Label | Role | State | Purpose |
|---|---|---|---|
| QA-USER-A | user, verified | email verified, KYC verified | customer / property owner |
| QA-USER-B | user, verified | email verified, KYC verified | second customer / message peer |
| QA-USER-UNVERIFIED | user | email verified, KYC pending | PostGate negative tests |
| QA-USER-NEW | — | not yet registered | registration tests |
| QA-AGENT | agent | active | assigned leads/visits/sales |
| QA-ADMIN | admin | active | management/verification flows |

Test data needed:

- Property with cover + multiple images; property with minimum required fields; land-category vs building-category property.
- Property with no reviews; property with reviews.
- Sold property; rented property; reserved property (created during suite execution).
- Valid image files (JPG/PNG/WEBP, small), one oversized file (>10 MB for property, >2 MB for KYC, >5 MB for EMI slip), one non-image file (e.g. PDF/TXT).
- Hero media: one image (<10 MB), one video MP4/WebM (<50 MB), one thumbnail image, one oversized video (>50 MB) for negative tests.
- Future date/time slot for visits; past date/time for negative test.
- KYC pack: selfie (webcam capture) + citizenship front + citizenship back images.

## 6. Roles and Permissions

Derived from `backend/middleware/auth.js`, `routes/*.js`, `utils/permissions.js`, `ProtectedRoute.jsx`, `PostGate.jsx`.

| Capability | Guest | User (unverified KYC) | User (verified) = owner when listing | Agent | Admin |
|---|---|---|---|---|---|
| Browse properties, property detail, blogs, about/contact, land converter | ✓ | ✓ | ✓ | ✓ | ✓ |
| Register / login / verify email / forgot+reset password | ✓ | ✓ | ✓ | — | — |
| Submit public contact form | ✓ | ✓ | ✓ | ✓ | ✓ |
| Post property (`POST /properties`) | — | — (blocked by PostGate + `requireVerified`) | ✓ | ✓ (own listings) | ✓ (bypass) |
| Edit own listing / change status / end tenancy / delete own | — | — | ✓ own only | ✓ own only | ✓ any |
| Favorite / share property | — | ✓ | ✓ | ✓ | ✓ |
| Book visit / cancel own visit | — | ✓ | ✓ | — (works assigned) | ✓ |
| Review property (if eligible) | — | ✓ | ✓ (not own) | ✓ (not own) | — (replies/moderates) |
| Inquiry conversation (inquirer side) | — | ✓ | ✓ | ✓ | ✓ |
| Close own conversation | — | ✓ (owner side or admin) | ✓ | ✓ (owner side) | ✓ |
| Reopen conversation | — | — | — | — | ✓ only |
| View/update assigned leads, file sale/rental | — | — | — | ✓ assigned only | ✓ all |
| Assign/reassign lead, delete lead, close lead (`closed`) | — | — | — | — | ✓ only |
| Verify/reject sale/rental | — | — | — | — | ✓ only |
| EMI plan create/update, review slip | — | — | — | read-only (amounts stripped) | ✓ |
| EMI slip verification request | — | — (buyer user only) | ✓ (linked buyer only) | — | — |
| Mark commission paid | — | — | — | — | ✓ only |
| Manage users (status, verify KYC, reset pwd, delete) | — | — | — | — | ✓ only |
| Manage agents CRUD | — | — | — | list only | ✓ |
| Manage categories / blogs / services | — | — | — | — | ✓ only |
| Manage hero slides (CRUD, schedule, order) | — | — | — | — | ✓ only |
| Verification queues, archives/restore/jobs, analytics/admin, dashboard/admin | — | — | — | agent analytics only | ✓ |
| Convert contact form → lead, respond to contact | — | — | — | — | ✓ only |

Notes: `isActive=false` blocks login and socket for any role. `isEmailVerified=false` blocks login with `requiresVerification`. No API allows changing `role` (attempt returns 400 + audit log).

## 7. Test Execution Rules

1. Execute tests in order within a section where noted (many build on created data).
2. For every test fill: **Actual Result**, **Status** (`PASS / FAIL / BLOCKED / NOT TESTED`), **Evidence** (screenshot/video + console/network errors).
3. `BLOCKED` = cannot execute due to prior failure or environment outage; cite blocking test/bug ID.
4. After each mutation: navigate away → refresh → return, and confirm persistence (Phase 6 rule).
5. For realtime tests use two authenticated sessions (User A + User B) on separate browsers.
6. Log every failure with the bug template in §28.
7. Priorities: **P0** critical/core, **P1** important business flow, **P2** secondary/edge.

---

## 8. Authentication Test Suite

### AUTH-001
**Test Name:** Register new user with valid data + all KYC photos
**Priority:** P0
**Preconditions:** Logged out; registration email unused.
**Test Data:** name, new email, phone, password ≥6 chars, selfie (webcam), citizenship front + back images (≤2 MB each).
**Steps:**
1. Open `/register`.
2. Complete step 1 (name, email, phone, password + confirm, optional referral code).
3. Complete step 2 (capture selfie via camera, upload citizenship front + back).
4. Submit.
**Expected Result:** Success message; redirected to `/verify-email`; no auto-login (login blocked until email verified).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-002
**Test Name:** Register missing KYC photo is rejected
**Priority:** P1
**Preconditions:** Logged out, on `/register`.
**Test Data:** valid account fields but omit one of the three ID photos.
**Steps:**
1. Fill step 1 validly.
2. In step 2 attach only 2 of 3 required photos.
3. Submit.
**Expected Result:** Submission blocked with clear error (server requires all 3 photos, 400); no account created / no redirect to verify page.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-003
**Test Name:** Register duplicate email is rejected
**Priority:** P1
**Preconditions:** Logged out; email already registered.
**Test Data:** existing account email.
**Steps:**
1. Open `/register`.
2. Enter already-registered email with otherwise valid data + photos.
3. Submit.
**Expected Result:** Error stating email already in use (400); stays on register; no duplicate account.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-004
**Test Name:** Verify email with valid 6-digit code then login succeeds
**Priority:** P0
**Preconditions:** Freshly registered account; has verification code (from test mailbox).
**Test Data:** email + valid code (within 15 min).
**Steps:**
1. Open `/verify-email`.
2. Enter email + code.
3. Submit, then open `/login` and login with email + password.
**Expected Result:** Verification success; login succeeds and lands on role-appropriate page (user → home/account nav); JWT stored per remember-me choice.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-005
**Test Name:** Verify email with wrong/expired code fails
**Priority:** P1
**Preconditions:** Unverified account.
**Test Data:** wrong code; (if practical) expired code >15 min.
**Steps:**
1. Open `/verify-email`.
2. Enter email + wrong code, submit.
3. Use resend option, then verify login still blocked.
**Expected Result:** Invalid/expired code error; account remains unverified; login still returns `requiresVerification` (403).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-006
**Test Name:** Login blocked before email verification
**Priority:** P0
**Preconditions:** Registered but email-unverified account.
**Test Data:** correct email + password.
**Steps:**
1. Open `/login`.
2. Enter credentials of unverified account.
3. Submit.
**Expected Result:** Login rejected with verification-required message; no authenticated nav; protected route still redirects to `/login`.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-007
**Test Name:** Login with valid credentials (remember-me variants)
**Priority:** P0
**Preconditions:** Verified account; logged out.
**Test Data:** valid email + password.
**Steps:**
1. Open `/login`, enter valid credentials, check Remember me ON, submit.
2. Logout, login again with Remember me OFF.
3. Refresh browser each time.
**Expected Result:** Both logins succeed with role-appropriate redirect; session persists across refresh; token stored in localStorage (remember) vs sessionStorage (not remembered).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-008
**Test Name:** Login invalid credentials and validation
**Priority:** P0
**Preconditions:** Logged out.
**Test Data:** wrong password; malformed email; empty fields.
**Steps:**
1. Submit empty form.
2. Submit malformed email.
3. Submit valid email + wrong password.
**Expected Result:** Each rejected with clear inline error (401 for bad credentials); no login; submit button loading state resets and form stays usable.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-009
**Test Name:** Disabled account cannot login
**Priority:** P1
**Preconditions:** Admin has set target user `isActive=false`; tester has that user's credentials.
**Test Data:** disabled user credentials.
**Steps:**
1. Open `/login`.
2. Login as disabled user.
**Expected Result:** Login rejected with account-disabled message (403); no session created.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-010
**Test Name:** Forgot-password + reset-password happy path
**Priority:** P0
**Preconditions:** Verified account with access to test mailbox; logged out.
**Test Data:** account email; reset code; new password ≥6 chars.
**Steps:**
1. Open `/forgot-password`, submit email.
2. Open `/reset-password`, enter email + code + new password + confirm.
3. Login with new password.
**Expected Result:** Forgot step shows generic success (anti-enumeration); reset succeeds; login with new password works, old password fails.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-011
**Test Name:** Reset-password negative cases
**Priority:** P1
**Preconditions:** Logged out.
**Test Data:** wrong code, mismatched passwords, short password (<6).
**Steps:**
1. Submit reset with wrong code.
2. Submit with mismatched confirm.
3. Submit with short password.
**Expected Result:** Each rejected with clear error; password unchanged (old password still works).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-012
**Test Name:** Change password from profile
**Priority:** P1
**Preconditions:** Logged in as QA-USER-A.
**Test Data:** current password, new password, confirm.
**Steps:**
1. Open `/profile`.
2. Submit change-password with wrong current password (expect fail).
3. Submit with correct current + matching new passwords.
4. Logout and login with new password.
**Expected Result:** Wrong-current rejected (401); correct change succeeds; new password works, old fails.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTH-013
**Test Name:** Logout clears session and socket
**Priority:** P0
**Preconditions:** Logged in.
**Test Data:** authenticated user.
**Steps:**
1. Confirm authenticated nav visible.
2. Logout (confirm dialog if shown).
3. Try to open `/profile` and refresh.
4. Check DevTools WS closed.
**Expected Result:** Redirect to login/public; protected page not shown; refresh stays logged out; socket disconnected.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 9. User / Profile Test Suite

### PROF-001
**Test Name:** View profile and verification status
**Priority:** P0
**Preconditions:** Logged in as QA-USER-A.
**Steps:**
1. Open `/profile`.
2. Observe name, email, phone, verification status, referral info, documents section.
**Expected Result:** Profile data shown; verification status (`pending/verified/rejected`) and email-verified state clearly displayed.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROF-002
**Test Name:** Edit profile name/phone persists
**Priority:** P1
**Preconditions:** Logged in.
**Test Data:** new name, valid phone.
**Steps:**
1. Open `/profile`, edit name/phone, save.
2. Navigate away, refresh, return to `/profile`.
**Expected Result:** Success toast; updated values persist after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROF-003
**Test Name:** Replacing KYC documents resets verification to pending
**Priority:** P1
**Preconditions:** Logged in as verified user.
**Test Data:** replacement citizenship image.
**Steps:**
1. Open `/profile`.
2. Upload replacement ID photo, save.
3. Observe verification status; try to open `/my-properties/new`.
**Expected Result:** Status returns to `pending` with explanatory copy; PostGate blocks new property posting until re-verified.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROF-004
**Test Name:** Unverified user blocked from posting property (PostGate)
**Priority:** P0
**Preconditions:** Logged in as QA-USER-UNVERIFIED (KYC pending).
**Steps:**
1. Open `/my-properties/new` directly.
2. Observe gate message; follow link to `/profile`.
**Expected Result:** Posting form not shown; pending/rejected message with link to profile shown instead.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROF-005
**Test Name:** Favorites list add/remove persists
**Priority:** P1
**Preconditions:** Logged in as verified user; at least one available property.
**Steps:**
1. Open `/properties/:id`, add to favorites.
2. Open `/favorites`, verify entry.
3. Remove favorite, refresh `/favorites`.
4. Reopen property detail and check favorite state.
**Expected Result:** Favorite appears then disappears consistently; state persists after refresh in both list and detail.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROF-006
**Test Name:** My visits list shows booked visits
**Priority:** P1
**Preconditions:** Logged in; user has booked at least one visit (see VISIT-001).
**Steps:**
1. Open `/my-visits`.
2. Filter by status chips; open a visit.
**Expected Result:** Own visits listed with property, slot, status; filters work; non-own visits never shown.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROF-007
**Test Name:** Wallet and referral info loads
**Priority:** P2
**Preconditions:** Logged in as user.
**Steps:**
1. Open `/wallet`.
2. Observe balance/transactions/referral code; paginate transactions if present.
**Expected Result:** Wallet loads (empty state `No rewards yet` if none); no crash when no data.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROF-008
**Test Name:** My EMI plans visible to buyer
**Priority:** P1
**Preconditions:** Logged in as buyer user linked to an EMI sale (or no plans).
**Steps:**
1. Open `/my-emi`.
2. If plan exists, open it; if none, observe empty state.
**Expected Result:** Own plans shown (or `No EMI plans`-style empty state); other users' plans never shown.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 10. Property Test Suite

### PROP-001
**Test Name:** Create sale property with valid data + images
**Priority:** P0
**Preconditions:** Logged in as verified QA-USER-A (or agent/admin); categories exist.
**Test Data:** title ≥10 chars, description ≥30 chars, building type, price >0, district+city, map lat/lng, landArea, beds/baths, cover image + 2 extra images.
**Steps:**
1. Open new-property page (`/my-properties/new` or `/dashboard/agent/properties/new` or `/dashboard/admin/properties/new`).
2. Fill all required fields, pick map location, upload cover + images.
3. Submit.
4. Open property detail and list; refresh and re-check.
**Expected Result:** Creation succeeds; detail shows all data + gallery + map; listing includes new property; persists after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-002
**Test Name:** Create land-category property (land-specific fields)
**Priority:** P1
**Preconditions:** Logged in verified user.
**Test Data:** land property type, landArea >0, landType, roadFrontage.
**Steps:**
1. Create property with land type.
2. Submit and view detail.
**Expected Result:** Land validation applied (no beds/baths/floors required); property created and viewable.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-003
**Test Name:** Property form validation (required/ boundary)
**Priority:** P1
**Preconditions:** Logged in verified user on new-property page.
**Test Data:** short title (<10), short description (<30), price 0/negative, missing district/city/map, invalid commission (>100).
**Steps:**
1. Submit empty form.
2. Submit short title/description.
3. Submit invalid price and commission >100.
4. Submit without cover image.
**Expected Result:** Each case blocked with field-level or form error; no property created; cover image required for listing.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-004
**Test Name:** Edit own property persists
**Priority:** P0
**Preconditions:** Logged in as property owner; property exists (PROP-001).
**Test Data:** edited title, price, description.
**Steps:**
1. Open `/my-properties/:id/edit`.
2. Change title/price/description, save.
3. Navigate away, refresh, reopen detail + edit form.
**Expected Result:** Changes saved and persist; list/detail reflect new values.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-005
**Test Name:** Status change available → reserved → sold (forward only)
**Priority:** P0
**Preconditions:** Logged in owner; property `available`.
**Steps:**
1. In Manage Properties change status to `reserved`.
2. Change `reserved` → `sold` (enter buyer email if prompted).
3. Try to move `sold` → `available` (expect block).
4. Refresh and verify final status.
**Expected Result:** Forward transitions succeed; backward transition rejected (400); final status persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-006
**Test Name:** End tenancy rented → available
**Priority:** P1
**Preconditions:** Rented property owned by tester (created via rental verification) or admin.
**Steps:**
1. Use End Tenancy action on rented property.
2. Refresh and verify status `available`; try End Tenancy on non-rented property.
**Expected Result:** Rented → available succeeds; non-rented rejected; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-007
**Test Name:** Delete own property
**Priority:** P1
**Preconditions:** Logged in owner; disposable property exists.
**Steps:**
1. Delete property (confirm dialog).
2. Refresh list; open old detail URL.
**Expected Result:** Removed from list; detail URL shows not-found/error; stays deleted after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-008
**Test Name:** Property detail shows gallery, map, similar, views
**Priority:** P1
**Preconditions:** Property with images exists; logged out + logged in checks.
**Steps:**
1. Open `/properties/:id` as guest.
2. Click gallery prev/next; check map; scroll to similar properties.
3. Login and reopen (contact info should now appear).
**Expected Result:** Gallery navigates; map renders; up to 4 similar shown; contact email/phone hidden for guest, visible when logged in.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-009
**Test Name:** Share property increments count
**Priority:** P2
**Preconditions:** Logged in; property detail open.
**Steps:**
1. Use Share action.
2. Refresh detail.
**Expected Result:** Share acknowledged; shares count persists/increments.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### PROP-010
**Test Name:** Management-type property hidden from public list
**Priority:** P1
**Preconditions:** Property with `saleType=management` exists (admin/owner).
**Steps:**
1. As guest open `/properties` and search for it.
2. As non-owner open its detail URL.
**Expected Result:** Excluded from public list; detail returns 404 for non-owner/non-admin.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 11. Search / Filter / List Test Suite

### SEARCH-001
**Test Name:** Listing initial load + pagination
**Priority:** P0
**Preconditions:** Properties exist.
**Steps:**
1. Open `/properties`.
2. Observe loading state then results; go to next/prev page.
**Expected Result:** Loading indicator then cards with `Page X of Y`; paging works without crash.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SEARCH-002
**Test Name:** Keyword search + no-results empty state
**Priority:** P0
**Preconditions:** On `/properties`.
**Test Data:** existing keyword; nonsense keyword with no matches.
**Steps:**
1. Search existing keyword.
2. Search nonsense keyword.
3. Clear search.
**Expected Result:** Matching results shown; no-match shows `No properties match` empty state; clearing restores results.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SEARCH-003
**Test Name:** Filters (type, location, price, beds/baths, status, sale type)
**Priority:** P0
**Preconditions:** On `/properties`.
**Steps:**
1. Apply saleType filter.
2. Add district → city (dependent) filter.
3. Add price range + bedrooms.
4. Apply multiple filters together, then Clear all.
**Expected Result:** Each filter narrows correctly; combined filters intersect; Clear all resets to full list.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SEARCH-004
**Test Name:** Sort newest/oldest/price low-high
**Priority:** P1
**Preconditions:** Multiple properties with different prices/dates.
**Steps:**
1. Sort newest, oldest, price_low, price_high.
**Expected Result:** Order visibly changes per sort; persists in URL params.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SEARCH-005
**Test Name:** Detail → back to list preserves filters; refresh keeps search
**Priority:** P1
**Preconditions:** Filtered `/properties` list.
**Steps:**
1. Apply filters, open a property, press Back.
2. Refresh the filtered list URL directly.
**Expected Result:** Filters preserved on back; refresh of nested URL does not 404 (SPA rewrite) and shows same filtered list.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SEARCH-006
**Test Name:** Admin Manage Properties search + status filter
**Priority:** P1
**Preconditions:** Logged in admin; on Manage Properties.
**Steps:**
1. Search by title; filter by status; clear.
**Expected Result:** Server-filtered results; empty search shows `No properties match search`.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 12. Visit Test Suite

### VISIT-001
**Test Name:** Book property visit with future slot
**Priority:** P0
**Preconditions:** Logged in user; available property not owned by tester.
**Test Data:** future date/time, buyer notes.
**Steps:**
1. On `/properties/:id` submit Schedule Visit with future slot + notes.
2. Open `/my-visits` and verify.
**Expected Result:** Booking succeeds; visit appears as `pending_agent_review`; persists after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### VISIT-002
**Test Name:** Visit negative cases (past slot, own property, sold property)
**Priority:** P1
**Preconditions:** Logged in user.
**Steps:**
1. Try past date slot.
2. Try to book own listing.
3. Try to book sold property (if available).
**Expected Result:** Each blocked with clear error; no visit created.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### VISIT-003
**Test Name:** Buyer cancels own visit
**Priority:** P1
**Preconditions:** Logged in buyer; own visit in non-terminal status.
**Steps:**
1. Open `/my-visits`, cancel visit (confirm).
2. Refresh; try to cancel again.
**Expected Result:** Status → `cancelled`; persists; second cancel rejected/hidden.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### VISIT-004
**Test Name:** Admin confirms visit → lead auto-created; agent completes visit
**Priority:** P0
**Preconditions:** Admin + agent accounts; pending visit exists.
**Steps:**
1. As admin open Visits, confirm/assign agent.
2. As agent open assigned visit, mark completed with notes.
3. Check Lead list for auto-created lead (`site_visit_scheduled`/`negotiation`).
**Expected Result:** Status transitions succeed; lead auto-created without blocking; agent sees only assigned visits.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### VISIT-005
**Test Name:** Agent cannot confirm/reassign, only complete/cancel own
**Priority:** P1
**Preconditions:** Logged in agent; assigned + unassigned visits exist.
**Steps:**
1. Try to confirm or reassign as agent (expect no control or error).
2. Complete own assigned visit.
**Expected Result:** Confirm/reassign unavailable to agent; complete/cancel own works.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 13. Lead Test Suite

### LEAD-001
**Test Name:** Agent creates manual lead
**Priority:** P0
**Preconditions:** Logged in agent (or admin).
**Test Data:** name, email, phone, category, priority, source `manual_create`.
**Steps:**
1. Open My Leads / Lead Management → Create Lead.
2. Fill and submit; open lead detail; refresh.
**Expected Result:** Lead created in `new` stage; detail shows activities; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### LEAD-002
**Test Name:** Lead list filters + kanban drag + search
**Priority:** P1
**Preconditions:** Logged in agent/admin with multiple leads.
**Steps:**
1. Filter by stage/priority/agent/follow-up; search by name.
2. As admin drag (or stage-change) a lead to next stage.
3. Refresh and verify stage.
**Expected Result:** Filters narrow correctly; stage change persists; empty filter shows `No leads match`.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### LEAD-003
**Test Name:** Blocked stage transitions (manual pending_verification, agent close)
**Priority:** P1
**Preconditions:** Logged in agent; lead in `negotiation`.
**Steps:**
1. Try to set stage to `pending_verification` manually.
2. Try to set stage to `closed` as agent.
**Expected Result:** `pending_verification` rejected (must file Sale/Rental); agent `closed` rejected (403, use `lost`); stage unchanged.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### LEAD-004
**Test Name:** Admin assigns/reassigns lead to agent; agent sees it
**Priority:** P0
**Preconditions:** Admin + agent logged in (two browsers); unassigned lead exists.
**Steps:**
1. As admin assign lead to QA-AGENT.
2. As agent open My Leads and verify; check notification.
3. As admin reassign to another/no agent.
**Expected Result:** Assignment succeeds; agent sees lead + `lead_assigned` notification; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### LEAD-005
**Test Name:** Update priority, notes, follow-up and complete it
**Priority:** P1
**Preconditions:** Agent owns lead (or admin).
**Test Data:** priority high, note text, future follow-up date.
**Steps:**
1. Open lead detail; set priority, add note, set follow-up.
2. Mark follow-up done; refresh.
3. Check activities timeline + suggested action.
**Expected Result:** All updates persist; activities logged; overdue logic/suggested action updates.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### LEAD-006
**Test Name:** Admin deletes lead; agent cannot
**Priority:** P1
**Preconditions:** Disposable lead exists; agent + admin sessions.
**Steps:**
1. As agent try delete (expect no control/error).
2. As admin delete (confirm); refresh list.
**Expected Result:** Agent blocked; admin delete removes lead persistently.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 14. Conversation / Chat Test Suite

### CHAT-001
**Test Name:** Submit property inquiry creates conversation thread
**Priority:** P0
**Preconditions:** Logged in QA-USER-A; property not owned by tester, inquiry-eligible.
**Test Data:** name, email, phone, message.
**Steps:**
1. On `/properties/:id` submit inquiry.
2. Open `/my-conversations` (or agent/admin equivalent) and verify thread.
3. Refresh and verify message persists.
**Expected Result:** Inquiry succeeds; conversation thread with initial message appears; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### CHAT-002
**Test Name:** Two-user live message exchange without refresh
**Priority:** P0
**Preconditions:** Conversation exists between QA-USER-A (inquirer) and owner; both logged in on two browsers; thread open.
**Steps:**
1. A sends message in open thread.
2. Observe B's open thread (no refresh).
3. B replies; observe A.
**Expected Result:** Each message arrives live via `v1.conversation.message` in correct thread, no duplicates; history matches REST after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### CHAT-003
**Test Name:** Closed conversation blocks sending; admin reopens
**Priority:** P0
**Preconditions:** Open conversation; owner + admin sessions.
**Steps:**
1. As owner close conversation (confirm).
2. As inquirer try to send (expect 403 block).
3. As admin reopen; send again.
**Expected Result:** Close succeeds with status event; sends blocked while closed; admin reopen restores sending; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### CHAT-004
**Test Name:** Non-admin cannot reopen; non-participant cannot open thread
**Priority:** P1
**Preconditions:** Closed conversation; inquirer + stranger sessions.
**Steps:**
1. As inquirer try Reopen (expect unavailable/error).
2. As unrelated user try to open thread URL directly.
**Expected Result:** Reopen admin-only; stranger gets 403/forbidden view; no messages leaked (owner identity masked for non-admins).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### CHAT-005
**Test Name:** Conversation search + load-more history
**Priority:** P2
**Preconditions:** User with several conversations + long thread.
**Steps:**
1. In Conversations search by name/property.
2. Open long thread, use Load more.
**Expected Result:** Search filters client-side (admin server search); older messages load without duplicates.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 15. Notification Test Suite

### NOTIF-001
**Test Name:** Trigger → receive → view notification
**Priority:** P0
**Preconditions:** QA-USER-A and QA-ADMIN/agent logged in on two browsers; notifications page clean.
**Steps:**
1. As A submit inquiry (or book visit).
2. As recipient observe bell badge + dropdown without refresh.
3. Open `/notifications` and open the item.
**Expected Result:** Notification arrives live (`v1.notification.unread` bump); list shows correct type/link; opening marks context.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### NOTIF-002
**Test Name:** Mark single read, mark all read, delete, clear
**Priority:** P1
**Preconditions:** Logged in user with ≥2 unread notifications.
**Steps:**
1. Filter All/Unread.
2. Mark one read; mark all read; delete one; (if available) clear all.
3. Refresh and verify counts.
**Expected Result:** Counts decrement correctly and persist; filters work; empty state `You're all caught up` when none.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### NOTIF-003
**Test Name:** Unread count authoritative after reconnect
**Priority:** P1
**Preconditions:** Two users; recipient offline (logged out or network off); sender acts.
**Steps:**
1. While B offline, A triggers 2 notifications to B.
2. B logs back in / restores network.
3. Compare bell count vs `/notifications` list.
**Expected Result:** On reconnect count resyncs from REST (`GET /notifications/unread-count`); no stuck badge.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 16. Realtime Test Suite

Prerequisite for all RT tests: login establishes socket (WS 101 to Render); logout disconnects. REST is truth; socket events are hints.

### RT-001
**Test Name:** Login connects socket; logout disconnects; invalid token does not retry forever
**Priority:** P0
**Preconditions:** Logged out; DevTools Network WS filter open.
**Steps:**
1. Login; observe WS connect to Render.
2. Logout; observe WS close.
3. (If practical) set invalid token in storage and reload; observe `connect_error` then disconnect without infinite retry storm.
**Expected Result:** Connect on login, clean disconnect on logout; auth failure stops retrying.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### RT-002
**Test Name:** Live message to open thread (no refresh, no duplicate)
**Priority:** P0
**Preconditions:** A↔B thread open on both browsers.
**Steps:**
1. A sends message.
2. Observe B.
3. Refresh B and compare history.
**Expected Result:** B receives `v1.conversation.message` once in correct thread; REST history identical; no duplicate `_id`.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### RT-003
**Test Name:** Unread increments when thread closed; clears on open
**Priority:** P0
**Preconditions:** A + B logged in; B's thread closed (list view).
**Steps:**
1. A sends message to B.
2. Observe B's conversation badge + list.
3. B opens the thread.
**Expected Result:** `v1.conversation.unread` bumps B's count; opening thread marks read and count returns to expected value; persists after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### RT-004
**Test Name:** Status event reaches list + open thread + both users
**Priority:** P1
**Preconditions:** Thread open for owner; list view for inquirer.
**Steps:**
1. Owner closes conversation.
2. Observe both sessions without refresh.
**Expected Result:** `v1.conversation.status {isActive:false}` updates open thread + list rows for both participants.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### RT-005
**Test Name:** Multi-tab same account converges
**Priority:** P1
**Preconditions:** Same user logged in on two tabs; peer user on second browser.
**Steps:**
1. Peer sends message.
2. Observe both tabs' badges.
3. Open thread in tab 1; observe tab 2.
**Expected Result:** Both tabs bump; reading in one tab converges the other after resync; no duplicates.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### RT-006
**Test Name:** Network interrupt → reconnect resyncs missed state
**Priority:** P0
**Preconditions:** A + B connected; B DevTools offline simulation ready.
**Steps:**
1. Take B offline.
2. A sends 2 messages + triggers notification.
3. Bring B online, wait for reconnect.
**Expected Result:** Socket reconnects + rejoins rooms; missed messages/history and unread counts match REST; live delivery resumes.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### RT-007
**Test Name:** App usable with realtime unavailable (REST fallback)
**Priority:** P1
**Preconditions:** Logged in; block WebSocket (e.g. offline WS or stop socket via DevTools blocking) while keeping HTTPS.
**Steps:**
1. Send message, mark notification read, change lead stage via UI.
2. Refresh.
**Expected Result:** REST actions succeed and persist; only live push missing (peer must refresh); no crash; live resumes when socket restored.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 17. File / Image Upload Test Suite

### UPLOAD-001
**Test Name:** Property valid multi-image upload + preview persists
**Priority:** P0
**Preconditions:** Verified user on new-property page.
**Test Data:** cover + 3 valid images (JPG/PNG/WEBP, each <10 MB).
**Steps:**
1. Select cover + multiple images; verify previews.
2. Remove one, submit.
3. Refresh detail; navigate away and back.
**Expected Result:** Previews shown; removal honored; uploaded images render in gallery after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### UPLOAD-002
**Test Name:** Property rejects non-image and oversized files
**Priority:** P1
**Preconditions:** On new-property page.
**Test Data:** PDF/TXT file; image >10 MB.
**Steps:**
1. Try to attach non-image as photo.
2. Try oversized image.
3. Submit valid remainder.
**Expected Result:** Friendly 400 error; invalid files rejected; valid submit still works.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### UPLOAD-003
**Test Name:** KYC uploads accept images ≤2 MB, webcam selfie only
**Priority:** P0
**Preconditions:** On `/register` step 2 or `/profile` docs.
**Test Data:** valid citizenship JPGs; oversized image; non-image.
**Steps:**
1. Attach valid front/back + capture selfie.
2. Try non-image and oversized (expect reject).
3. Submit.
**Expected Result:** Valid pack accepted; invalid rejected with message; selfie requires camera capture (no file fallback).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### UPLOAD-004
**Test Name:** Blog cover upload (admin)
**Priority:** P2
**Preconditions:** Admin on blog create/edit.
**Test Data:** valid cover image; non-image.
**Steps:**
1. Attach valid cover, publish, view public blog.
2. Try non-image cover.
**Expected Result:** Cover renders publicly; invalid rejected.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### UPLOAD-005
**Test Name:** EMI payment slip upload (JPG/PNG/WEBP ≤5 MB)
**Priority:** P0
**Preconditions:** Buyer user with EMI plan + unpaid installment (see EMI-003).
**Test Data:** valid slip; oversized; PDF.
**Steps:**
1. Request verification with valid slip.
2. Try oversized/PDF.
**Expected Result:** Valid request sets verification `pending` (never auto-pays); invalid rejected; slip viewable by admin.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### UPLOAD-006
**Test Name:** Video is URL only, not file upload
**Priority:** P2
**Preconditions:** Verified user on property form.
**Steps:**
1. Enter video URL field; look for video file picker.
2. Save and view detail.
**Expected Result:** No video file upload exists; URL saved and playable/linked on detail.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### UPLOAD-007
**Test Name:** Edit property replace/remove images persists
**Priority:** P1
**Preconditions:** Property with images; owner session.
**Steps:**
1. Edit: remove one existing image, add one new.
2. Save, refresh detail + edit form.
**Expected Result:** Final image set persists (removed stays removed, added present).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 18. Sale / Rental Verification (Deal) Test Suite

### DEAL-001
**Test Name:** Agent files sale for assigned lead (property → reserved, lead → pending_verification)
**Priority:** P0
**Preconditions:** Agent with assigned lead linked to `sale`-type available property.
**Test Data:** buyer name, agreedPrice >0, paymentType.
**Steps:**
1. As agent open lead → Submit Sale, fill and submit.
2. Check property status + lead stage; refresh.
**Expected Result:** Sale `pending_review`; property `reserved`; lead `pending_verification`; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEAL-002
**Test Name:** Admin verifies sale (property → sold, lead → closed, commission created)
**Priority:** P0
**Preconditions:** Pending sale exists; admin session.
**Steps:**
1. As admin open Verification Queue → verify sale.
2. Check property (`sold`), lead (`closed`), commissions list, agent notification.
**Expected Result:** All side effects occur; commission frozen (price × effective %); persists after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEAL-003
**Test Name:** Admin rejects sale with reason (property → available, lead → negotiation)
**Priority:** P1
**Preconditions:** Pending sale exists.
**Steps:**
1. As admin reject with reason.
2. Refresh property + lead.
**Expected Result:** Rejection requires reason; property back to `available`; lead to `negotiation`; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEAL-004
**Test Name:** Agent files rental; admin verifies (property → rented)
**Priority:** P0
**Preconditions:** Agent lead linked to `rent`-type available property.
**Test Data:** tenant name, startDate, monthlyRent, duration ≥1.
**Steps:**
1. Submit Rental as agent.
2. Verify as admin with commission amount ≥0.
3. Refresh property + lead.
**Expected Result:** Rental verified; property `rented` with dates/tenant; lead `closed`; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEAL-005
**Test Name:** Deal negative cases (duplicate pending, wrong saleType, terminal re-verify)
**Priority:** P1
**Preconditions:** Various deal states.
**Steps:**
1. File second pending sale for same lead (expect 409).
2. File sale for `rent` property (expect reject).
3. Re-verify already verified/rejected deal (expect 409).
**Expected Result:** Each blocked with clear error; state unchanged.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 19. EMI Test Suite

### EMI-001
**Test Name:** Admin creates EMI plan for verified EMI sale
**Priority:** P0
**Preconditions:** Admin; verified sale with `paymentType=emi` and registered buyer; no existing plan for sale.
**Test Data:** principal, tenure, installment, start date.
**Steps:**
1. Open EMI Plans → create for eligible sale.
2. Open plan detail; refresh.
**Expected Result:** Plan created with flat installment schedule; buyer/agent notified appropriately; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### EMI-002
**Test Name:** EMI create negative (non-EMI sale, duplicate plan)
**Priority:** P1
**Preconditions:** Admin.
**Steps:**
1. Try plan for `full_payment` sale.
2. Try second plan for same sale.
**Expected Result:** Both rejected (including 409 duplicate); no extra plan.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### EMI-003
**Test Name:** Buyer requests installment verification; admin approves → paid
**Priority:** P0
**Preconditions:** Buyer session + admin session; EMI plan with pending installment.
**Steps:**
1. As buyer open My EMI → request verification with slip (UPLOAD-005).
2. As admin review → approve.
3. Refresh buyer + admin views.
**Expected Result:** Request sets `pending`; approve sets installment `paid` with date/amount; balances update; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### EMI-004
**Test Name:** Admin rejects slip → pending + note; cannot complete plan with unpaid installments
**Priority:** P1
**Preconditions:** Admin; installment with pending verification.
**Steps:**
1. Reject with note.
2. Try to set plan `completed` while installments unpaid.
**Expected Result:** Rejection returns to `pending` + note; premature `completed` blocked.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 20. Commission, Review, Contact, Management Test Suites

### COMM-001
**Test Name:** Agent sees own commissions; admin sees all + summary
**Priority:** P1
**Preconditions:** Verified sale/rental exists; agent + admin sessions.
**Steps:**
1. As agent open Commissions + summary; filter paid/unpaid.
2. As admin open Commissions; filter by agent.
**Expected Result:** Agent sees only own; admin sees all; filters work.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### COMM-002
**Test Name:** Admin marks commission paid once
**Priority:** P1
**Preconditions:** Admin; unpaid commission exists.
**Steps:**
1. Mark paid with note.
2. Try to mark again; refresh; check agent notification.
**Expected Result:** First succeeds with `paidAt`; second rejected (400); persists; agent notified `commission_paid`.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### REV-001
**Test Name:** Eligible user posts review; duplicate/own/self blocked
**Priority:** P1
**Preconditions:** User with completed visit or verified purchase/rental for property; owner session.
**Test Data:** rating 1–5, comment ≤1000 chars.
**Steps:**
1. Submit review as eligible user; refresh detail.
2. Try second review same property (expect block).
3. As owner try to review own listing (expect block).
**Expected Result:** First review shows + average updates; duplicate/own rejected.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### REV-002
**Test Name:** Admin replies, hides, deletes review
**Priority:** P2
**Preconditions:** Admin; review exists.
**Steps:**
1. Reply to review; hide it; refresh public detail.
2. Delete review; refresh.
**Expected Result:** Reply shown; hidden review excluded from public/average; delete removes persistently.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### CONTACT-001
**Test Name:** Guest submits contact form; validation
**Priority:** P0
**Preconditions:** Logged out; on `/contact`.
**Test Data:** name, valid email, 10-digit phone, message; then invalid email + 9-digit phone + empty message.
**Steps:**
1. Submit valid (confirm dialog).
2. Submit each invalid variant.
3. As admin check inbox for the valid one.
**Expected Result:** Valid succeeds + appears in admin inbox with notification; invalid blocked with errors.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### CONTACT-002
**Test Name:** Admin responds, changes status, converts to lead, deletes
**Priority:** P0
**Preconditions:** Admin; new contact form exists.
**Steps:**
1. Respond; change status; convert to lead (ConvertToLeadModal).
2. Verify lead created + form `converted`; try convert again (expect 400).
3. Delete disposable form.
**Expected Result:** Each step persists; double-convert blocked; converted lead linked.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### MGMT-001
**Test Name:** Verified user creates property-management request (with + without new property)
**Priority:** P1
**Preconditions:** Verified user; active service catalogue exists.
**Test Data:** services selection, note ≤2000 chars.
**Steps:**
1. Open My Management Requests → create for existing property.
2. Create with-property (property + request atomically).
3. Refresh list.
**Expected Result:** Requests created (`pending`); with-property creates both; persists; unverified user blocked.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### MGMT-002
**Test Name:** Admin accepts/declines; owner requests termination; admin terminates
**Priority:** P1
**Preconditions:** Pending + active management requests exist; owner + admin sessions.
**Steps:**
1. As admin accept one (→`active`), decline another with reason (→`declined`).
2. As owner request termination (→`termination_pending`).
3. As admin approve termination (→`terminated`); try further transition (expect block).
**Expected Result:** Each transition persists with activity timeline entries; terminal states immutable.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### MGMT-003
**Test Name:** Admin manages service catalogue
**Priority:** P2
**Preconditions:** Admin on Manage Services.
**Steps:**
1. Create service; toggle active/inactive; edit.
2. As user verify inactive service unavailable for new requests.
**Expected Result:** Catalogue changes persist and gate user choices.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 21. Admin / Management Test Suite

### ADMIN-001
**Test Name:** Admin user list search/sort; toggle active; verify KYC; reset password; delete
**Priority:** P0
**Preconditions:** Admin; test users exist (unverified + disposable).
**Steps:**
1. Search/sort users.
2. Toggle disposable user inactive → try login as them (expect 403) → reactivate.
3. Approve KYC (`verified`) for pending user; reject another with note.
4. Reset password for test user; delete disposable user (confirm).
5. Refresh each view.
**Expected Result:** All actions persist; verified user can now post; deleted user gone; audit logged (not visible to QA, but state consistent).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ADMIN-002
**Test Name:** Role change attempt rejected
**Priority:** P1
**Preconditions:** Admin editing a user.
**Steps:**
1. Attempt to change `role` field via edit form/API-driven UI if exposed.
**Expected Result:** Rejected with 400; role unchanged after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ADMIN-003
**Test Name:** Agent CRUD + status
**Priority:** P1
**Preconditions:** Admin on Manage Agents.
**Steps:**
1. Create agent; edit; toggle status; delete disposable agent.
2. As deactivated agent try login (expect block).
**Expected Result:** CRUD persists; status gates login; agent list visible to agents (read-only, docs stripped).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ADMIN-004
**Test Name:** Categories (types/districts/cities) CRUD + guards
**Priority:** P1
**Preconditions:** Admin on Manage Categories.
**Steps:**
1. Create property type (with commission 0–100), district, city under district.
2. Try commission >100 (expect reject); try delete type in use (expect 409).
3. Verify new district→city appears in property form.
**Expected Result:** Valid creates persist and appear in forms; invalid/in-use blocked.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ADMIN-005
**Test Name:** Blog create/publish/edit/delete + public view
**Priority:** P2
**Preconditions:** Admin + guest sessions.
**Steps:**
1. As admin create draft with cover, publish, search/filter list.
2. As guest open `/blogs` + `/blogs/:slug`.
3. As admin edit then delete (confirm); refresh public list.
**Expected Result:** Published post publicly visible; edits persist; deleted gone.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ADMIN-006
**Test Name:** Archives view, restore, run job dry-run
**Priority:** P2
**Preconditions:** Admin on Data Archives.
**Steps:**
1. Filter by type; open archive detail.
2. Run a job with dryRun; restore a disposable record.
3. Refresh.
**Expected Result:** Archives listed; dry-run affects nothing; restore returns record; job history logged.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ADMIN-007
**Test Name:** Dashboards + analytics + CSV export load
**Priority:** P2
**Preconditions:** Admin + agent sessions.
**Steps:**
1. Open Admin Dashboard stats; Agent Dashboard; Analytics pages.
2. Export CSV (admin + agent).
**Expected Result:** Stats render (empty states where no data, never crash); CSV downloads.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### MISC-001
**Test Name:** Public pages (home, about, blogs, land converter) load
**Priority:** P1
**Preconditions:** Logged out.
**Steps:**
1. Open `/`, `/about`, `/blogs`, `/land-converter`.
2. On converter convert ropani/aana ↔ sqm/sqft both directions.
**Expected Result:** All pages load; converter math consistent; no crash on empty blog list.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 22. Hero Slides Test Suite

Admin-managed homepage carousel (`/dashboard/admin/hero-slides`; public feed drives the homepage hero). Slides carry title/subtitle/description, one image or video file (+ optional thumbnail image), an optional CTA (property link, external URL, or none), an optional schedule window, a numeric display order, a per-slide duration (3–60s, default 5), and draft/published status. The public feed shows only published, in-schedule slides whose linked property (if any) is still promotable — sold, rented, archived, or deleted listings drop the slide automatically. Derived states shown in the admin list: Draft, Scheduled, Active, Expired.

### HERO-001
**Test Name:** Admin creates + publishes image slide; appears on homepage
**Priority:** P0
**Preconditions:** Logged in as QA-ADMIN; no published slides (or note existing ones).
**Test Data:** title, subtitle, valid image (<10 MB), CTA label + available property.
**Steps:**
1. Open `/dashboard/admin/hero-slides` → Add Hero Slide.
2. Fill content, upload image, enable property CTA and pick an available listing, Publish.
3. As guest open `/` on desktop and on mobile width; refresh.
**Expected Result:** Row appears with Active state; homepage shows carousel (desktop: card overlaid bottom-right of static hero; mobile: carousel replaces static hero); persists after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-002
**Test Name:** Video slide plays muted inline with thumbnail
**Priority:** P0
**Preconditions:** Logged in as QA-ADMIN.
**Test Data:** MP4/WebM file (<50 MB), thumbnail image.
**Steps:**
1. Add slide with media type Video, upload video + thumbnail, Publish.
2. Open `/` and observe; check with sound on.
**Expected Result:** Video autoplays muted, loops, plays inline; thumbnail shows as poster while loading; no audio; no layout shift.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-003
**Test Name:** Draft / scheduled / expired visibility rules
**Priority:** P0
**Preconditions:** Logged in as QA-ADMIN; homepage open as guest in second browser.
**Steps:**
1. Create slide as Draft → check homepage (expect absent) and admin state (Draft).
2. Edit → Publish with start = tomorrow → admin shows Scheduled, homepage absent.
3. Edit → start = yesterday, end = yesterday → admin shows Expired, homepage absent.
4. Edit → clear schedule, Publish → admin Active, homepage shows it.
**Expected Result:** Each state transition reflected in admin badge and homepage presence after refresh.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-004
**Test Name:** CTA destinations (property / URL / none)
**Priority:** P0
**Preconditions:** Three published slides (or one slide edited three times).
**Steps:**
1. Property CTA → click button on homepage.
2. URL CTA → click button.
3. CTA disabled/none → observe slide.
**Expected Result:** Property navigates to `/properties/:id`; URL opens external address (new tab); none shows no button.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-005
**Test Name:** Sold/removed property drops slide from homepage
**Priority:** P0
**Preconditions:** Published slide linked to an available property; admin session.
**Steps:**
1. Verify slide visible on homepage.
2. Move linked property to sold (or delete it).
3. Refresh homepage; check admin list.
**Expected Result:** Slide disappears from homepage feed without errors; admin can still see/edit the slide.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-006
**Test Name:** Edit slide + replace media persists
**Priority:** P1
**Preconditions:** Slide from HERO-001; admin session.
**Steps:**
1. Edit title/duration/order, replace image with a new file, save.
2. Navigate away, refresh list + homepage.
**Expected Result:** New content and media persist; old image no longer referenced (check Cloudinary folder for orphans if accessible).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-007
**Test Name:** Numeric reorder updates homepage order
**Priority:** P1
**Preconditions:** ≥2 published slides; admin on Hero Slides list.
**Steps:**
1. Swap the Order numbers, Save order.
2. Refresh list + homepage; observe first slide.
**Expected Result:** Positions normalize gapless; homepage rotation order matches; persists.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-008
**Test Name:** Delete slide removes it everywhere
**Priority:** P1
**Preconditions:** Disposable published slide; admin session.
**Steps:**
1. Delete (confirm dialog), refresh list + homepage.
**Expected Result:** Row gone; homepage no longer shows it (falls back to static hero if none left); stays deleted.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-009
**Test Name:** Form validation (media, CTA, schedule, duration)
**Priority:** P1
**Preconditions:** Admin on new-slide form.
**Steps:**
1. Submit empty (expect title + media errors).
2. Enable CTA without label; choose URL with `not-a-url`; choose property without selecting.
3. Set end before start; set duration 120.
**Expected Result:** Each blocked with a clear message; nothing created; valid retry succeeds.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-010
**Test Name:** Non-admin cannot manage slides
**Priority:** P0
**Preconditions:** User, agent, and guest sessions.
**Steps:**
1. As user open `/dashboard/admin/hero-slides` (expect redirect to `/`).
2. As agent open the same URLs.
3. As guest confirm homepage carousel renders but no management UI exists.
**Expected Result:** All management URLs blocked for non-admins; public carousel visible to everyone.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-011
**Test Name:** Carousel interaction (rotate, arrows, dots, pause, keyboard)
**Priority:** P1
**Preconditions:** ≥2 published slides with different durations; guest on `/`.
**Steps:**
1. Wait through two rotations (timing follows each slide's duration).
2. Click next/previous arrows; click a dot.
3. Hover the carousel (expect pause); Tab through controls and activate via keyboard.
**Expected Result:** Rotation, arrows, and dots all work without duplicates or jumps; hover pauses; all controls keyboard-operable with visible focus.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-012
**Test Name:** Empty feed and API failure fall back to static hero
**Priority:** P1
**Preconditions:** Guest on `/`.
**Steps:**
1. With zero published slides, load homepage (desktop + mobile).
2. With slides present, block the hero API (DevTools) or stop backend, reload.
**Expected Result:** Classic static hero renders identically to before the module existed; rest of homepage unaffected; no blank or broken hero area.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-013
**Test Name:** Upload rejections (wrong type, oversized image/video)
**Priority:** P2
**Preconditions:** Admin on new-slide form.
**Test Data:** PDF/TXT file; image >10 MB; video >50 MB.
**Steps:**
1. Attach non-image/non-video as media (expect 400).
2. Attach oversized image (expect rejection).
3. Attach oversized video (expect rejection); submit valid remainder.
**Expected Result:** Friendly errors; invalid files never produce a slide; valid submit works.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### HERO-014
**Test Name:** Single slide hides navigation chrome
**Priority:** P2
**Preconditions:** Exactly one published slide.
**Steps:**
1. Open `/` and observe carousel chrome.
**Expected Result:** Slide renders; arrows and dots hidden (nothing to navigate); no auto-rotation timer errors.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 23. Authorization Test Suite

### AUTHZ-001
**Test Name:** Protected routes redirect when logged out
**Priority:** P0
**Preconditions:** Logged out.
**Test Data:** `/profile`, `/favorites`, `/my-visits`, `/my-properties`, `/dashboard/admin`, `/dashboard/agent`.
**Steps:**
1. Open each URL directly.
**Expected Result:** Each redirects to `/login`; no protected data shown.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTHZ-002
**Test Name:** Role mismatch redirects (user→admin/agent, agent→admin)
**Priority:** P0
**Preconditions:** Logged in as user; then as agent.
**Steps:**
1. As user open `/dashboard/admin` and `/dashboard/agent`.
2. As agent open `/dashboard/admin`.
**Expected Result:** Redirect to `/` (ProtectedRoute role guard); no admin/agent data visible.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTHZ-003
**Test Name:** User cannot edit/delete another user's property via URL
**Priority:** P0
**Preconditions:** User A owns property; User B logged in.
**Steps:**
1. As B open A's `/my-properties/:id/edit` URL and try save/delete/status change.
**Expected Result:** Blocked (error or redirect); A's property unchanged (verify as A + refresh).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTHZ-004
**Test Name:** Agent sees only assigned leads/visits/commissions
**Priority:** P0
**Preconditions:** Two agents (or agent + admin data); leads assigned to agent 1.
**Steps:**
1. As QA-AGENT open My Leads, visits, commissions.
2. Try to open unassigned lead detail URL directly.
**Expected Result:** Only assigned items shown; direct URL to others rejected; no data leak.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### AUTHZ-005
**Test Name:** Logged-out user cannot use authenticated actions from cache/back button
**Priority:** P1
**Preconditions:** Logged in, then logout.
**Steps:**
1. Logout, press Back, try favorite/visit/inquiry submit.
2. Refresh.
**Expected Result:** Actions blocked with login prompt; no mutation occurs.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 24. Error Handling Test Suite

### ERR-001
**Test Name:** Nonexistent property / blog / lead URLs show not-found
**Priority:** P1
**Preconditions:** Logged in + logged out checks.
**Steps:**
1. Open `/properties/000000000000000000000000` (valid ObjectId, nonexistent).
2. Open `/blogs/no-such-slug`, unknown lead ID (as agent/admin).
3. Open `*` unknown route.
**Expected Result:** Friendly not-found/error state (`NotFound` page or inline error), no crash or blank page.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ERR-002
**Test Name:** Server/validation errors shown via toast/inline, form stays usable
**Priority:** P1
**Preconditions:** Logged in user.
**Steps:**
1. Submit invalid property/lead/contact forms (see PROP-003, CONTACT-001).
2. Observe error display; retry with valid data.
**Expected Result:** Understandable message; form not stuck in loading; retry succeeds.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ERR-003
**Test Name:** Duplicate submit prevention (double-click)
**Priority:** P2
**Preconditions:** Logged in; on inquiry/visit/lead form.
**Steps:**
1. Double-click submit rapidly.
**Expected Result:** Button enters loading/disabled state; single record created (no duplicates).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### ERR-004
**Test Name:** Network drop during request is recoverable
**Priority:** P1
**Preconditions:** Logged in; DevTools offline ready.
**Steps:**
1. Go offline, submit a form (expect fail with message).
2. Go online, retry.
3. Refresh and verify no corrupted/partial record.
**Expected Result:** Clear failure message; retry works; no duplicate or corrupt data.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 25. Navigation / Refresh Test Suite

### NAV-001
**Test Name:** Refresh nested SPA route does not 404
**Priority:** P0
**Preconditions:** Deployed Vercel frontend.
**Test Data:** `/properties/:id`, `/blogs/:slug`, `/dashboard/admin/users`, `/my-properties`.
**Steps:**
1. Open each URL, refresh.
**Expected Result:** Page reloads correctly (Vercel rewrite to `index.html`); no server 404.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### NAV-002
**Test Name:** Back/forward between list → detail → list
**Priority:** P1
**Preconditions:** Filtered property list.
**Steps:**
1. List → detail → Back → Forward.
**Expected Result:** Navigation works; list state sensible; no stale error.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### NAV-003
**Test Name:** Loading and empty states on key pages
**Priority:** P1
**Preconditions:** Throttled network (if practical) + fresh/empty accounts.
**Steps:**
1. Observe loading text/skeleton on properties, conversations, notifications, visits.
2. Open empty lists (new user favorites, no notifications, no leads in stage).
**Expected Result:** Loading shown briefly; empty states (`No … yet`, `You're all caught up`) shown, never blank/broken UI.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 26. Session Lifecycle Test Suite

### SESS-001
**Test Name:** Full lifecycle: login → refresh → navigate → close/reopen → logout → protected blocked → login again
**Priority:** P0
**Preconditions:** Verified account.
**Steps:**
1. Login, refresh, navigate profile/favorites/properties.
2. Close and reopen browser (if practical) per remember-me.
3. Logout, try `/profile`.
4. Login again.
**Expected Result:** Session survives refresh/navigation (and reopen iff Remember me); post-logout protected blocked; re-login works.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SESS-002
**Test Name:** Expired/invalid token handled gracefully
**Priority:** P1
**Preconditions:** Logged in (if practical, use expired token scenario by waiting or clearing).
**Steps:**
1. Corrupt/remove token in storage, refresh a protected page.
2. Observe behavior; login again.
**Expected Result:** Redirect to login with clear message; no crash; token wiped; fresh login establishes new session + socket.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 27. Deployment Verification Test Suite

### DEPLOY-001
**Test Name:** Frontend loads + assets + SPA refresh
**Priority:** P0
**Preconditions:** Vercel URL.
**Steps:**
1. Open app; check no missing assets (DevTools Network, no 404 on JS/CSS/images).
2. Refresh `/properties/:id`.
**Expected Result:** App loads fast; no asset 404; nested refresh works.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEPLOY-002
**Test Name:** Backend health + API reachability from frontend
**Priority:** P0
**Preconditions:** Render backend up.
**Steps:**
1. Open `GET /api/health` (expect 200).
2. In app, browse properties (API via Render) with DevTools Network.
**Expected Result:** Health 200; app API calls reach `…onrender.com/api` with CORS success (no CORS errors).
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEPLOY-003
**Test Name:** Auth works against deployed backend
**Priority:** P0
**Preconditions:** Test account.
**Steps:**
1. Login via Vercel frontend; open `/profile` (me endpoint).
**Expected Result:** Login + profile load; token flow works cross-origin.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEPLOY-004
**Test Name:** Socket.IO connects to Render (polling + websocket upgrade, auth, reconnect)
**Priority:** P0
**Preconditions:** Logged in via Vercel.
**Steps:**
1. Observe WS handshake to Render host + `101` upgrade.
2. Reload; observe reconnect + resync (unread counts correct).
**Expected Result:** Authenticated socket connects; transports upgrade; reconnect works.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### DEPLOY-005
**Test Name:** Cold-start behavior (Render free-tier spin-up)
**Priority:** P1
**Preconditions:** Backend idle (first request after inactivity).
**Steps:**
1. Load app cold; observe loading states.
2. Retry if first request slow/fails.
**Expected Result:** App shows loading (not crash); succeeds on retry after backend wakes. Document spin-up delay as note, not fail, unless persistent.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 28. Security-Oriented Functional Tests

Functional checks only. No penetration/destructive testing.

### SEC-001
**Test Name:** No protected UI/data for guests; no sensitive fields in wrong views
**Priority:** P0
**Preconditions:** Logged out.
**Steps:**
1. Verify nav shows only public links; try direct protected URLs.
2. On property detail confirm contact hidden; on agent EMI view (as agent) confirm amounts stripped per app rule.
**Expected Result:** No protected pages/data; contact/commission/amount gating holds.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SEC-002
**Test Name:** Cross-user private resources not reachable by URL guessing
**Priority:** P0
**Preconditions:** Private IDs known (other user's conversation, lead, EMI plan, management request).
**Steps:**
1. As unrelated user open those URLs.
**Expected Result:** 403/forbidden or redirect; no messages, amounts, or docs leaked.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

### SEC-003
**Test Name:** Post-logout session cannot be reused
**Priority:** P0
**Preconditions:** Just logged out.
**Steps:**
1. Press Back, refresh protected page, try an authenticated action.
**Expected Result:** All blocked; login required; old session/socket dead.
**Actual Result:** _
**Status:** PASS / FAIL / BLOCKED / NOT TESTED
**Evidence:** _

---

## 29. Cross-Module End-to-End User Journeys

Execute each scenario end-to-end with real accounts; verify persistence + realtime + notifications at each handoff.

### SCN-A — Customer discovers property, inquires, chats with owner/agent (P0)
1. Register QA-USER-A → verify email → login.
2. Search `/properties`, apply filters + sort.
3. Open property, review gallery/map/details/reviews.
4. Submit inquiry → confirm thread in `/my-conversations`.
5. Owner/agent receives lead/notification → opens lead → replies in conversation.
6. Customer receives live message + unread bump → opens thread → read clears.
7. Book visit → confirm → complete; verify lead stages + review eligibility.
8. Refresh at each step; verify persistence.

### SCN-B — Owner lists and manages property (P0)
1. Verified user login → create property + images + map.
2. Verify in list/search/detail.
3. Edit, change status forward, share/favorite from second account.
4. Delete (or end-tenancy if rented); verify list/detail consistency.

### SCN-C — Agent works lead to verified sale + commission payout (P0)
1. Customer inquiry/visit auto-creates lead → admin assigns to agent.
2. Agent contacts, schedules visit, moves stages, files sale.
3. Admin verifies → property sold, lead closed, commission created.
4. Admin marks commission paid; agent sees paid status + notification.

### SCN-D — Rental + EMI flow (P1)
1. Agent files rental → admin verifies with commission → property rented.
2. End tenancy → available (or keep rented for EMI variant on sale side).
3. For EMI sale: admin creates EMI plan → buyer requests slip verification → admin approves → installments paid.

### SCN-E — Admin governance (P1)
1. New user registers → admin verifies KYC → user posts property.
2. Contact form submitted → admin responds → converts to lead → assigns → closes.
3. Blog/category/service created → visible publicly → archived/restored.

### SCN-F — Failure and recovery (P1)
1. Two users chatting live; take one offline.
2. Peer sends messages + notifications; offline user misses them.
3. Restore network; verify reconnect, history resync, unread correctness; continue chatting.

### SCN-G — Admin publishes hero campaign, guest converts, listing sells (P0)
1. Admin creates image slide with property CTA → Publish → guest sees carousel.
2. Guest clicks CTA → property detail → submits inquiry.
3. Property sells → slide drops from homepage automatically.
4. Admin deletes expired slide; homepage falls back cleanly.

---

## 30. Regression Checklist

Run on every release. All P0 plus:

- [ ] AUTH-001, AUTH-004, AUTH-006, AUTH-007, AUTH-008, AUTH-010, AUTH-013
- [ ] PROF-004 (PostGate), PROP-001, PROP-004, PROP-005
- [ ] SEARCH-001–003, VISIT-001, LEAD-001, LEAD-004
- [ ] CHAT-001–003, NOTIF-001, RT-001–003, RT-006
- [ ] UPLOAD-001, DEAL-001, DEAL-002, DEAL-004, EMI-003
- [ ] CONTACT-001–002, AUTHZ-001–004, NAV-001, SESS-001
- [ ] HERO-001–005, HERO-010 (hero publish/visibility/CTA/auth)
- [ ] DEPLOY-001–004, SEC-001–003
- [ ] SCN-A, SCN-B, SCN-C, SCN-G

## 31. Traceability Matrix

| System Area | Test IDs | Covered |
|---|---|---|
| Authentication (register/verify/login/reset/logout/disabled) | AUTH-001…AUTH-013 | Yes |
| Profile/KYC/PostGate/favorites/wallet/EMI-mine | PROF-001…PROF-008 | Yes |
| Properties CRUD/status/end-tenancy/delete/detail/share | PROP-001…PROP-010 | Yes |
| Search/filter/sort/pagination/list persistence | SEARCH-001…SEARCH-006 | Yes |
| Visits book/cancel/confirm/complete/convert | VISIT-001…VISIT-005 | Yes |
| Leads create/filter/stage/assign/notes/follow-up/delete | LEAD-001…LEAD-006 | Yes |
| Conversations inquiry/live/close/reopen/search | CHAT-001…CHAT-005 | Yes |
| Notifications trigger/read/unread/resync | NOTIF-001…NOTIF-003 | Yes |
| Realtime connect/unread/status/multi-tab/reconnect/fallback | RT-001…RT-007 | Yes |
| Uploads property/KYC/blog/EMI-slip/video-URL/edit | UPLOAD-001…UPLOAD-007 | Yes |
| Sales/rentals file/verify/reject/negatives | DEAL-001…DEAL-005 | Yes |
| EMI plans/installments/verification | EMI-001…EMI-004 | Yes |
| Commissions/review/contact/management-requests/services | COMM-001…MGMT-003 | Yes |
| Admin users/agents/categories/blogs/archives/analytics | ADMIN-001…ADMIN-007, MISC-001 | Yes |
| Hero slides manage/publish/schedule/order/carousel/CTA/fallback | HERO-001…HERO-014 | Yes |
| Authorization | AUTHZ-001…AUTHZ-005 | Yes |
| Error handling | ERR-001…ERR-004 | Yes |
| Navigation/refresh/loading/empty | NAV-001…NAV-003 | Yes |
| Session lifecycle | SESS-001…SESS-002 | Yes |
| Deployment (Vercel/Render/socket/CORS/cold-start) | DEPLOY-001…DEPLOY-005 | Yes |
| Functional security | SEC-001…SEC-003 | Yes |
| E2E journeys | SCN-A…SCN-G | Yes |

## 32. Bug Reporting Template

```text
Bug ID:
Test Case: (e.g. PROP-005)
Environment: (Vercel URL + Render backend + browser/version)
Role: (guest / user / agent / admin + verification state)
Severity: (Critical / High / Medium / Low)
Priority: (P0 / P1 / P2)
Title:

Preconditions:

Steps to reproduce:
1.
2.
3.

Expected:

Actual:

Frequency: (always / sometimes / once)

Browser/device:

Console errors: (paste)

Network errors: (endpoint + status + message)

Screenshot/video: (attach)

Additional notes:
```

Severity guide: Critical = core flow blocked or data loss/leak (login, property create, lead close, auth bypass); High = major feature broken with no workaround; Medium = feature impaired but workaround exists; Low = cosmetic/edge. Do not default everything to Critical.

## 33. Test Execution Summary

```text
Execution date:
Environment: (frontend build/URL, backend Render deploy SHA/date)
Tester:

Total tests:
Passed:
Failed:
Blocked:
Not tested:

P0 results: (passed/total)
P1 results:
P2 results:

Critical issues: (bug IDs)
High issues:
Medium issues:
Low issues:

Overall release blockers:

Known limitations:

Final QA notes:
```

## Appendix A — Ambiguities and Manual-Test Limits

- Phone OTP (`send-phone-otp`/`verify-phone`) exists in API but no dedicated UI flow was found; SMS is stubbed. Mark phone-verification UI as NOT TESTED if absent, and note as limitation.
- Email/SMS delivery depends on Brevo/stub config; code expiry is 15 min per code — expired-code test needs waiting or backend assistance.
- JWT expiry (`JWT_EXPIRE 7d`) cannot be waited out manually; SESS-002 uses token tampering instead.
- Cron jobs (EMI reminders 08:00, lead follow-up 09:00, archival Sunday 02:00, retention 03:00) and 30/90/365-day retention/archival rules cannot be verified within a session; verify via job history screens only.
- Reward XP/levels ledger is background-applied; verify wallet changes opportunistically, not as strict asserts.
- Exact commission percentages fall back `property → property-type default → 0`; QA should assert visibility gating (agents/admins see, others stripped) rather than exact arithmetic.
- `ManageBlogs` uses native `window.confirm` while all other deletes use the app Confirm dialog — note inconsistency, not failure.
- Typo `SubmitRentalModel.jsx` (Model vs Modal) is code-level only; no user impact.
- Hero video uploads (≤50 MB, MP4/WebM/MOV) need live Cloudinary credentials to verify end-to-end; API-level validation is covered by automated tests, but the first real video upload should be watched in the Cloudinary dashboard for orphans.

## Appendix B — Count and Conventions

- Test IDs are unique across the suite. Prefix map: AUTH, PROF, PROP, SEARCH, VISIT, LEAD, CHAT, NOTIF, RT, UPLOAD, DEAL, EMI, COMM, REV, CONTACT, MGMT, ADMIN, MISC, HERO, AUTHZ, ERR, NAV, SESS, DEPLOY, SEC, SCN.
- No secrets, JWTs, passwords, or connection strings are included in this document.

# Release Policy Notes (policy of record)

Decisions confirmed during the R1–R10 follow-ups. Each item cites its code
anchor. These are deliberate, permanent policies — not temporary gaps. No
code change accompanies this document.

## R6 — Listing availability and manual status jumps

- `reserved` properties remain bookable: `canReceiveInquiries()`
  (`backend/models/Property.js`) blocks only `sold`, and visit creation
  (`backend/controllers/visitController.js`) blocks only `sold`.
- The manual `available → reserved → sold` jump
  (`PATCH /api/properties/:id/status`,
  `backend/controllers/propertyController.js#updatePropertyStatus`) remains
  available to owners/admins, including direct `available → sold`.
- Post-R2, the manual jump carries status + `soldTo`/`soldAt` attribution +
  a strengthened `property_sold` oversight alert only. It generates no
  rewards and no commission records; those flow exclusively through verified
  Sale (`backend/controllers/saleController.js#verifySale`).

## R7 — Rental scope and buyer history (out of scope for this release)

- Rental applications, tenant screening, rental agreements, and rent
  collection are out of scope. A rental stays a single admin-verified
  `Rental` record plus the property occupancy snapshot
  (`rentedFrom`/`rentedUntil`/`tenant`).
- No dedicated buyer sale/rental history page. EMI plans, visits, and
  conversations serve as the buyer's history surface.

## R10 — Delete semantics

- Hard delete: properties, leads, contact forms, conversations (controller
  `deleteOne`/`deleteMany` paths). Deleted records are not recoverable.
- Snapshot-archive + restore: property, sale, rental, EMI plan only, via the
  existing archives module (`backend/utils/archival.js`,
  `backend/routes/archiveRoutes.js`, `DataArchives.jsx`). No backfill of
  historically deleted records.
- Restore fidelity limit (known): restoring one record does not repair
  references to still-archived records; restore oldest-dependency-first
  (EMI plan → sale/rental → property).

## R2 addendum — No clawback of past manual-sold rewards

- Rewards (`PROPERTY_BUY`, `PROPERTY_SELL`, `REFERRAL_SALE`) already granted
  through past manual status changes to `sold` are left untouched. There is
  no historical backfill, no clawback, and no retroactive commission
  creation. This is a deliberate, permanent decision — not deferred work.
  Any future dispute about a specific past sale is an ops/support matter,
  not a code migration.

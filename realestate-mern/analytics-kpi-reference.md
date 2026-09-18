# Analytics KPI Reference

Source of truth: `backend/controllers/analyticsController.js` (plus
`leadController.js#getPipelineMetrics` where noted). Read this before quoting
any number externally. Formulas below are the implementation, not the ideal.

Shared mechanics used by every monthly series:

- Window: last 12 calendar months including the current month, keys `YYYY-MM`.
- Bucketing: MongoDB `$year`/`$month` on the date field, which bucket in **UTC**;
  JS fills missing months with zeros.
- Money: NPR throughout, rounded to 2 decimals (`round2`).
- JSON (`GET /api/analytics/admin`, `GET /api/analytics/agent`) and CSV/PDF
  export (`GET /api/analytics/export?type=admin|agent&format=csv|pdf`) reuse the
  exact same builders, so exported numbers match the dashboards by construction.

Auth: `/admin` is admin-only. `/agent` and `/export` accept admin **and**
agent. Note the export-scope finding in §5.

---

## 1. Admin report (`buildAdminAnalytics`)

| Metric | Definition | Formula / source | Population / window | Filters / exclusions |
|---|---|---|---|---|
| `salesOverTime[]` | Verified sales per month | `count` = records; `value` = Σ `agreedPrice`. Source: `Sale`, date field `reviewedAt` | Last 12 months (UTC) | `status = verified` only; rows with null `reviewedAt` dropped |
| `rentalsOverTime[]` | Verified rentals per month | `count` = records; `value` = Σ (`monthlyRent × durationInMonths`) = lease value. Source: `Rental`, date field `reviewedAt` | Last 12 months (UTC) | `status = verified` only; null `reviewedAt` dropped |
| `dealsOverTime[]` | Combined deals per month | Element-wise `sales + rentals` of the two series above | Same | Same |
| `commissions.earnedTotal` | Lifetime commission earned | Σ `commissionAmount` over **all** `CommissionRecord`s | All time, no window | None - includes unpaid |
| `commissions.paidAmount` / `paidCount` | Settled commission | Σ / count where `isPaid = true` | All time | - |
| `commissions.pendingAmount` / `pendingCount` | Unsettled commission | Σ / count where `isPaid = false` | All time | - |
| `commissionOverTime[]` | Earned vs paid per month | `earned` = Σ `commissionAmount` grouped by **`createdAt`**; `paid` = Σ grouped by **`paidAt`** where `isPaid = true` | Last 12 months (UTC) | See ambiguity A |
| `emiPortfolio.activePlans` / `completedPlans` / `defaultedPlans` | Plan counts by status | Counts over all `EMIPlan`s | All time (no window) | Cancelled plans are **not** reported in any bucket |
| `emiPortfolio.overdueInstallments` | Overdue installment count | Installments with `status = pending` and `dueDate < today 00:00` (any plan status) | Point in time | - |
| `emiPortfolio.totalOutstanding` | Portfolio outstanding | Σ over **active** plans of `max(principalAmount − Σ(paidAmount ?? amount of paid installments), 0)` | Active plans only | Non-active plans excluded from the money total but counted in status buckets |
| `agentLeaderboard[]` | Top 10 agents | Union of agent IDs across verified sales, verified rentals, all commission records; ranked by `commissionEarned` desc, sliced to 10. `salesValue` = Σ verified `agreedPrice`; `rentalValue` = Σ lease value; `dealsClosed` = `salesCount + rentalCount`; `commissionEarned` = Σ `commissionAmount` | All time | Unverified deals excluded from counts/values but the agent can still appear via commission records |
| `pipeline.countsByStage` | Leads per stage | Group count over all `Lead`s, zero-initialized per known stage | All time | No date filter |
| `pipeline.pendingSaleVerifications` | Sale queue depth | `Sale.countDocuments({ status: 'pending_review' })` | Point in time | - |
| `pipeline.pendingRentalVerifications` | Rental queue depth | Same for `Rental` | Point in time | - |

## 2. Agent report (`buildAgentAnalytics`)

Same formulas scoped to one agent (`agent = self`; admin may pass
`?agent=<id>`). Differences:

| Metric | Definition |
|---|---|
| `performance.thisMonth` / `previousMonth` | Verified sales with `reviewedAt` in the current / previous **calendar month** (server-local timezone - see ambiguity B) |
| `performance.delta` | `thisMonth − previousMonth` (count and value) |
| `performance.rentalsThisMonth` / `rentalsPreviousMonth` / `rentalsDelta` | Same, rentals with lease value |
| `performance.dealsClosedThisMonth` / `dealsClosedPreviousMonth` | `salesCount + rentalCount` per month |
| `commissions.thisMonthEarned` | Σ `commissionAmount` with `createdAt` this month (any paid state) |
| `commissions.thisMonthPaid` | Σ where `isPaid = true` and `paidAt` this month |
| `commissions.pending` / `pendingCount` | Unpaid totals, all time |
| `commissions.lifetimePaid` / `lifetimePaidCount` | Paid totals, all time |
| `emiPortfolio`, `salesOverTime`, `rentalsOverTime`, `dealsOverTime` | Same as admin, agent-scoped |

## 3. Adjacent: lead pipeline metrics (`GET /api/leads/pipeline/metrics`)

Not part of the analytics export, but externally quoted - documented here so
the denominator is never misread:

- `conversionRate` = `closed / (closed + lost)` × 100, rounded. **Denominator
  is finished leads only** - active pipeline leads are excluded. A growing
  pipeline does not dilute the rate; a 100% rate with 2 finished leads is
  possible. `closed` here counts leads whose `closedAt` is set (verified
  closings), not every `stage = closed` row.
- `avgDaysToClose` = mean (`closedAt − createdAt`) in days over closed leads,
  rounded to whole days.
- `overdueFollowUps` = count of `nextFollowUp < now` with stage not in
  (`closed`, `lost`).
- `newThisWeek` = `createdAt ≥ 7 days ago`. `activeLeads` = stages new +
  contacted + site_visit_scheduled + negotiation.

## 4. Ambiguities (documentation issues, not code bugs)

- **A. Commission "earned" month uses `createdAt`.** The code comment asserts
  creation == verification/earning moment. True for system-created records;
  if records are ever backfilled or imported, earned months shift. Do not
  relabel without verifying record-creation practice.
- **B. Agent month boundaries are server-local** (`new Date(y, m, 1)`), while
  the 12-month series are UTC. Near month boundaries the two can disagree by
  a day. Only matters for `performance.*` month splits.
- **C. Leaderboard rank key includes unpaid commission** (`commissionEarned`
  sums all records). Rank = earning power, not cash collected.
- **D. `pipeline.countsByStage` passes through unknown stage keys** (legacy
  values add keys beyond the zero-initialized set). Consumers must tolerate
  extra keys.
- **E. Cancelled EMI plans are invisible** in the portfolio status buckets
  (only active/completed/defaulted reported).
- **F. `dealsClosed` counts deal records**, not unique properties or buyers.

## 5. Discrepancy requiring a product decision

- **Export scope:** `GET /api/analytics/export?type=admin` is reachable by any
  authenticated **agent** (`authorize('admin','agent')` on `/export`;
  `resolveAgentScope` only constrains `type=agent`). An agent can today
  download the platform-wide report including every agent's name and email.
  Either gate `type=admin` to admins or confirm cross-agent visibility is
  intended. Code deliberately left unchanged pending that decision.

## 6. Recommended documentation structure (for external reporting)

Every externally shared figure should carry: metric name, this file as
definition source, formula, date field used (`reviewedAt` vs `createdAt` vs
`paidAt`), window (12-month UTC / calendar month local / all-time / point in
time), and population (`verified` only vs all records). The table in §1-§2 is
that structure - copy the row, don't paraphrase the formula.

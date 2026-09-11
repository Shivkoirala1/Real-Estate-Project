import React, { useEffect, useState } from "react";
import { getEmiPlans } from "../../services/emiService";

// Read-only view for agents: schedule and status of the EMI plans on sales
// they manage. Amounts are never shown here - the backend already strips
// them from the response for agent requests, but we also never reference
// any amount field in this component, defense in depth.

const PLAN_BADGE = {
  active: "bg-brass/15 text-brass-dark",
  completed: "bg-sage-light text-sage",
  defaulted: "bg-brick-light text-brick",
  cancelled: "bg-navy/10 text-slate-muted",
};

const PLAN_LABEL = {
  active: "Active",
  completed: "Completed",
  defaulted: "Defaulted",
  cancelled: "Cancelled",
};

const INSTALLMENT_BADGE = {
  paid: "bg-sage-light text-sage",
  waived: "bg-navy/10 text-slate-muted",
  overdue: "bg-brick-light text-brick",
  pending: "bg-brass/15 text-brass-dark",
};

const INSTALLMENT_LABEL = {
  paid: "Paid",
  waived: "Waived",
  overdue: "Overdue",
  pending: "Pending",
};

const VERIFICATION_BADGE = {
  pending: "bg-navy/10 text-navy",
  approved: "bg-sage-light text-sage",
  rejected: "bg-brick-light text-brick",
};

const VERIFICATION_LABEL = {
  pending: "Buyer submitted proof - awaiting admin review",
  approved: "Payment verified",
  rejected: "Verification rejected",
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "defaulted", label: "Defaulted" },
  { value: "cancelled", label: "Cancelled" },
];

// Stored status is paid/pending/waived; 'overdue' is computed client-side
const displayStatus = (inst) => {
  if (inst.status === "paid" || inst.status === "waived") return inst.status;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return inst.dueDate && new Date(inst.dueDate) < today ? "overdue" : "pending";
};

const chipClass = (active) =>
  `text-xs font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-sm border transition-colors ${
    active
      ? "bg-navy text-ivory border-navy"
      : "bg-white text-slate-muted border-navy/15 hover:border-navy/40"
  }`;

const PlanCard = ({ plan }) => {
  const [expanded, setExpanded] = useState(false);
  const installments = plan.installments || [];
  const totalCount = installments.length;
  const paidCount = installments.filter((i) => i.status === "paid" || i.status === "waived").length;
  const progressPct = totalCount ? Math.round((paidCount / totalCount) * 100) : 0;
  const nextDue = plan.nextDueInstallment;

  return (
    <div className="bg-white border border-navy/10 rounded-sm shadow-card mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-parchment/40 transition-colors"
      >
        <div className="min-w-0">
          <p className="font-medium text-navy truncate">{plan.property?.title || "Property"}</p>
          <p className="text-xs text-slate-muted mt-0.5">
            Buyer: {plan.buyer?.name || "—"} · {paidCount} of {totalCount} installments settled
            {nextDue && <> · Next due {new Date(nextDue.dueDate).toLocaleDateString()}</>}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`status-badge ${PLAN_BADGE[plan.status] || "bg-navy/10 text-slate-muted"}`}>
            {PLAN_LABEL[plan.status] || plan.status}
          </span>
          {plan.overdueCount > 0 && (
            <span className="status-badge bg-brick-light text-brick">{plan.overdueCount} overdue</span>
          )}
          <span className="text-xs text-navy font-medium">{expanded ? "Hide schedule ▲" : "View schedule ▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-navy/10 p-5">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5 gap-3">
              <p className="text-xs uppercase tracking-wide text-slate-muted">Progress</p>
              <p className="text-sm font-medium text-navy">{paidCount} of {totalCount} settled</p>
            </div>
            <div className="h-1.5 bg-parchment rounded-full overflow-hidden">
              <div className="h-full bg-brass transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Desktop table - status/schedule only, no amount column */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Due Date</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Paid Date</th>
                  <th className="py-2 pr-4">Verification</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst) => {
                  const st = displayStatus(inst);
                  const verification = inst.verification;
                  return (
                    <tr key={inst.installmentNumber} className="border-b border-navy/5 last:border-0">
                      <td className="py-3 pr-4 font-medium text-navy">{inst.installmentNumber}</td>
                      <td className="py-3 pr-4 text-slate-ink">{new Date(inst.dueDate).toLocaleDateString()}</td>
                      <td className="py-3 pr-4">
                        <span className={`status-badge ${INSTALLMENT_BADGE[st]}`}>{INSTALLMENT_LABEL[st]}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-muted">
                        {inst.paidDate ? new Date(inst.paidDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        {verification && verification.status !== "none" ? (
                          <span className={`status-badge ${VERIFICATION_BADGE[verification.status]}`}>
                            {VERIFICATION_LABEL[verification.status]}
                          </span>
                        ) : (
                          <span className="text-slate-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3">
            {installments.map((inst) => {
              const st = displayStatus(inst);
              const verification = inst.verification;
              return (
                <div key={inst.installmentNumber} className="border border-navy/10 rounded-sm p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-medium text-navy">Installment {inst.installmentNumber}</p>
                    <span className={`status-badge ${INSTALLMENT_BADGE[st]}`}>{INSTALLMENT_LABEL[st]}</span>
                  </div>
                  <div className="text-xs text-slate-muted space-y-1">
                    <div className="flex justify-between gap-4">
                      <span>Due date</span>
                      <span className="text-slate-ink">{new Date(inst.dueDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Paid date</span>
                      <span className="text-slate-ink">{inst.paidDate ? new Date(inst.paidDate).toLocaleDateString() : "—"}</span>
                    </div>
                    {verification && verification.status !== "none" && (
                      <div className="flex justify-between gap-4">
                        <span>Verification</span>
                        <span className={`status-badge ${VERIFICATION_BADGE[verification.status]}`}>
                          {VERIFICATION_LABEL[verification.status]}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const EMISales = () => {
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState({
    activePlans: 0,
    dueThisMonth: 0,
    overdueInstallments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getEmiPlans({
        limit: 100,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setPlans(data.plans || []);
      if (data.summary) setSummary(data.summary);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load EMI schedules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div>
      <p className="eyebrow mb-2">Agent</p>
      <h1 className="text-3xl mb-2">EMI Sales</h1>
      <p className="text-sm text-slate-muted mb-8">
        Installment schedule and status for the EMI sales you manage. Amount details are handled by admin.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Active Plans</p>
          <p className="text-3xl font-display text-navy">{summary.activePlans}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Due This Month</p>
          <p className="text-3xl font-display text-navy">{summary.dueThisMonth}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Overdue Installments</p>
          <p className={`text-3xl font-display ${summary.overdueInstallments > 0 ? "text-brick" : "text-navy"}`}>
            {summary.overdueInstallments}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={chipClass(statusFilter === f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && !loading && (
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-4 mb-6 text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-muted">Loading EMI schedules...</p>
      ) : plans.length === 0 && !error ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 px-6 text-center">
          <p className="text-slate-muted">No EMI sales under your management yet.</p>
        </div>
      ) : (
        plans.map((plan) => <PlanCard key={plan._id} plan={plan} />)
      )}
    </div>
  );
};

export default EMISales;

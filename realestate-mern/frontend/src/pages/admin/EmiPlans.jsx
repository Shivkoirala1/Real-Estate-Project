import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import { createEmiPlan, getEmiPlans } from "../../services/emiService";
import { getSaleById } from "../../services/saleService";

const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "defaulted", label: "Defaulted" },
  { value: "cancelled", label: "Cancelled" },
];

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

const npr = (x) => `NPR ${Number(x || 0).toLocaleString()}`;

// Local-timezone yyyy-mm-dd for <input type="date">
const toDateInput = (value) => {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const chipClass = (active) =>
  `text-xs font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-sm border transition-colors ${
    active
      ? "bg-navy text-ivory border-navy"
      : "bg-white text-slate-muted border-navy/15 hover:border-navy/40"
  }`;

// 'Initialize EMI Plan' modal - opened via /dashboard/agent/emi-plans?new=<saleId>
const InitEmiModal = ({
  sale,
  saleLoading,
  saleError,
  submitting,
  onClose,
  onSubmit,
}) => {
  const [principal, setPrincipal] = useState("");
  const [tenure, setTenure] = useState("");
  const [installment, setInstallment] = useState("");
  const [startDate, setStartDate] = useState(toDateInput());
  const [touched, setTouched] = useState(false); // agent manually edited the installment field
  const [error, setError] = useState("");

  // Prefill the principal from the sale once it loads (agreed price minus down payment)
  useEffect(() => {
    if (!sale) return;
    const p = Math.max(
      Number(sale.agreedPrice || 0) - Number(sale.downPaymentAmount || 0),
      0,
    );
    setPrincipal(p ? String(p) : "");
  }, [sale]);

  // Equal-split calculator convenience - stays in sync until the agent edits it
  useEffect(() => {
    if (touched) return;
    const p = Number(principal);
    const t = Number(tenure);
    if (p > 0 && Number.isInteger(t) && t > 0) {
      setInstallment(String(Math.round(p / t)));
    }
  }, [principal, tenure, touched]);

  const eligible =
    sale && sale.status === "verified" && sale.paymentType === "emi";
  const ineligibilityReason =
    sale && !eligible
      ? sale.status !== "verified"
        ? "This sale is not verified yet. EMI plans can only be initialized from a verified sale."
        : `This sale's payment type is "${sale.paymentType}". EMI plans apply only to sales with payment type EMI.`
      : "";

  const handleSubmit = (e) => {
    e.preventDefault();
    const p = Number(principal);
    const t = Number(tenure);
    const inst = Number(installment);

    if (!sale) return setError("Sale context is still loading.");
    if (!Number.isFinite(p) || p <= 0)
      return setError("Principal amount must be greater than 0.");
    if (!Number.isInteger(t) || t < 1 || t > 360)
      return setError(
        "Tenure must be a whole number between 1 and 360 months.",
      );
    if (!Number.isFinite(inst) || inst <= 0)
      return setError("Installment amount must be greater than 0.");
    if (!startDate) return setError("Start date is required.");

    setError("");
    onSubmit({
      principalAmount: p,
      tenureMonths: t,
      installmentAmount: inst,
      startDate,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="init-emi-title"
    >
      <div className="absolute inset-0 bg-navy-dark/60" onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-lifted w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="eyebrow mb-1">New Plan</p>
            <h2 id="init-emi-title" className="font-display text-xl text-navy">
              Initialize EMI Plan
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-muted hover:text-navy text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {saleError ? (
          <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-3 text-sm mb-5">
            {saleError}
          </div>
        ) : saleLoading ? (
          <p className="text-sm text-slate-muted mb-5">Loading sale...</p>
        ) : (
          sale && (
            <div className="bg-parchment/60 border border-navy/10 rounded-sm p-4 mb-5">
              <p className="font-medium text-navy">
                {sale.property?.title || "Property"}
              </p>
              <p className="text-xs text-slate-muted mt-0.5">
                Buyer: {sale.buyer?.name || "—"}
                {sale.buyer?.email ? ` · ${sale.buyer.email}` : ""}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-slate-muted">
                <span>
                  Agreed price:{" "}
                  <span className="font-medium text-navy">
                    {npr(sale.agreedPrice)}
                  </span>
                </span>
                <span>
                  Down payment:{" "}
                  <span className="font-medium text-navy">
                    {sale.downPaymentAmount ? npr(sale.downPaymentAmount) : "—"}
                  </span>
                </span>
              </div>
            </div>
          )
        )}

        {sale && !saleError && !saleLoading && !eligible && (
          <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-3 text-sm mb-5">
            {ineligibilityReason}
          </div>
        )}

        {sale && eligible && (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-3 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label-field" htmlFor="emi-principal">
                  Principal Amount (NPR) *
                </label>
                <input
                  id="emi-principal"
                  type="number"
                  min="0"
                  step="any"
                  className="input-field"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="Amount to be repaid in installments"
                  required
                />
              </div>

              <div>
                <label className="label-field" htmlFor="emi-tenure">
                  Tenure (months) *
                </label>
                <input
                  id="emi-tenure"
                  type="number"
                  min="1"
                  max="360"
                  step="1"
                  className="input-field"
                  value={tenure}
                  onChange={(e) => setTenure(e.target.value)}
                  placeholder="e.g. 120"
                  required
                />
              </div>

              <div>
                <label className="label-field" htmlFor="emi-installment">
                  Installment Amount (NPR) *
                </label>
                <input
                  id="emi-installment"
                  type="number"
                  min="0"
                  step="any"
                  className="input-field"
                  value={installment}
                  onChange={(e) => {
                    setTouched(true);
                    setInstallment(e.target.value);
                  }}
                  placeholder="Flat amount per installment"
                  required
                />
                <p className="text-[11px] text-slate-muted mt-1.5 leading-relaxed">
                  Flat amount per installment — negotiate freely; no
                  auto-amortization is imposed.
                </p>
                {touched && Number(principal) > 0 && Number(tenure) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTouched(false);
                      setInstallment(
                        String(Math.round(Number(principal) / Number(tenure))),
                      );
                    }}
                    className="text-xs text-brass hover:underline mt-1"
                  >
                    Reset to equal split (principal ÷ {tenure})
                  </button>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="label-field" htmlFor="emi-start">
                  Start Date *
                </label>
                <input
                  id="emi-start"
                  type="date"
                  className="input-field"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                <p className="text-[11px] text-slate-muted mt-1.5">
                  Pending installments fall due monthly from this date.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary text-sm px-4 py-2"
                disabled={submitting}
              >
                {submitting ? "Creating..." : "Initialize Plan"}
              </button>
            </div>
          </form>
        )}

        {(!sale || !eligible) && (
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-sm px-4 py-2"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const EmiPlans = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const saleId = searchParams.get("new");

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState({
    activePlans: 0,
    dueThisMonth: 0,
    overdueInstallments: 0,
    totalOutstanding: 0,
  });

  const [statusFilter, setStatusFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Init-flow state
  const [sale, setSale] = useState(null);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load EMI plans with filters + pagination
  const load = async () => {
    setLoading(true);

    try {
      const data = await getEmiPlans({
        page,
        limit: PAGE_SIZE,
        status: statusFilter !== "all" ? statusFilter : undefined,
        overdue: overdueOnly ? "true" : undefined,
      });

      setPlans(data.plans || []);

      if (data.summary) {
        setSummary(data.summary);
      }

      const pag = data.pagination || {};

      setPagination({
        page: pag.page ?? pag.currentPage ?? page,
        total: pag.total ?? (data.plans || []).length,
        totalPages: pag.totalPages ?? pag.pages ?? 1,
      });

      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load EMI plans");
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, overdueOnly]);

  // Init flow: ?new=<saleId> arrives from My Sales
  useEffect(() => {
    if (!saleId) {
      setSale(null);
      setSaleError("");
      setSaleLoading(false);
      return;
    }

    let cancelled = false;

    setSale(null);
    setSaleError("");
    setSaleLoading(true);

    (async () => {
      try {
        const res = await getSaleById(saleId);

        if (!cancelled) {
          setSale(res.data.sale || null);
        }
      } catch (err) {
        if (!cancelled) {
          setSaleError(
            err.response?.data?.message || "Failed to load the sale.",
          );
        }
      } finally {
        if (!cancelled) {
          setSaleLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const closeInit = () => {
    if (searchParams.has("new")) {
      const next = new URLSearchParams(searchParams);

      next.delete("new");

      setSearchParams(next, { replace: true });
    }
  };

  const handleCreatePlan = async (payload) => {
    setSubmitting(true);

    try {
      await createEmiPlan({
        saleId,
        ...payload,
      });

      showToast("EMI plan created", "success");

      closeInit();
      setPage(1);
      await load();
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to create EMI plan",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const goToPage = (nextPage) => {
    if (nextPage >= 1 && nextPage <= pagination.totalPages) setPage(nextPage);
  };

  const openPlan = (plan) => navigate(`/dashboard/admin/emi-plans/${plan._id}`);

  const nextDueText = (plan) =>
    plan.nextDueInstallment
      ? `${new Date(plan.nextDueInstallment.dueDate).toLocaleDateString()} · ${npr(plan.nextDueInstallment.amount)}`
      : "All settled";

  const statusCell = (plan) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className={`status-badge ${PLAN_BADGE[plan.status] || "bg-navy/10 text-slate-muted"}`}
      >
        {PLAN_LABEL[plan.status] || plan.status}
      </span>
      {plan.overdueCount > 0 && (
        <span className="status-badge bg-brick-light text-brick">
          {plan.overdueCount} overdue
        </span>
      )}
    </div>
  );

  return (
    <div>
      {/* Admin name */}    
      <p className="eyebrow mb-2">Admin</p>
      <h1 className="text-3xl mb-8">EMI Plans</h1>

      {/* Summary cards - global totals, not narrowed by the list filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">
            Active Plans
          </p>
          <p className="text-3xl font-display text-navy">
            {initialLoaded ? summary.activePlans : "—"}
          </p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">
            Due This Month
          </p>
          <p className="text-3xl font-display text-navy">
            {initialLoaded ? summary.dueThisMonth : "—"}
          </p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">
            Overdue Installments
          </p>
          <p
            className={`text-3xl font-display ${summary.overdueInstallments > 0 ? "text-brick" : "text-navy"}`}
          >
            {initialLoaded ? summary.overdueInstallments : "—"}
          </p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">
            Total Outstanding
          </p>
          <p className="text-2xl font-display text-navy break-words">
            {initialLoaded ? npr(summary.totalOutstanding) : "—"}
          </p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
            className={chipClass(statusFilter === f.value)}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setOverdueOnly((v) => !v);
            setPage(1);
          }}
          className={`text-xs font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-sm border transition-colors ${
            overdueOnly
              ? "bg-brick text-ivory border-brick"
              : "bg-white text-slate-muted border-navy/15 hover:border-brick/50"
          }`}
        >
          Overdue only
        </button>
      </div>

      {error && !loading && (
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-muted">Loading EMI plans...</p>
      ) : plans.length === 0 && !error ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 px-6 text-center">
          <p className="text-slate-muted">
            No EMI plans yet. Plans are initialized from a verified sale with
            payment type EMI.
          </p>
        </div>
      ) : plans.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-navy/10 rounded-sm overflow-x-auto shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3">Buyer</th>
                  <th className="px-5 py-3">Property</th>
                  <th className="px-5 py-3">Next due</th>
                  <th className="px-5 py-3">Outstanding</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan._id}
                    onClick={() => openPlan(plan)}
                    className="border-b border-navy/5 last:border-0 hover:bg-parchment/40 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4 font-medium text-navy">
                      {plan.buyer?.name || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-ink">
                      {plan.property?.title || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-ink">
                      {plan.nextDueInstallment ? (
                        nextDueText(plan)
                      ) : (
                        <span className="text-sage font-medium">
                          All settled
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-medium text-navy">
                      {npr(plan.outstandingBalance)}
                    </td>
                    <td className="px-5 py-4">{statusCell(plan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3">
            {plans.map((plan) => (
              <div
                key={plan._id}
                onClick={() => openPlan(plan)}
                className="bg-white border border-navy/10 rounded-sm p-4 shadow-card cursor-pointer hover:bg-parchment/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="font-medium text-navy">
                    {plan.buyer?.name || "—"}
                  </p>
                  {statusCell(plan)}
                </div>
                <p className="text-sm text-slate-ink mb-2">
                  {plan.property?.title || "—"}
                </p>
                <div className="flex items-center justify-between gap-3 text-xs text-slate-muted">
                  <span>
                    Next due:{" "}
                    {plan.nextDueInstallment ? (
                      <span className="text-slate-ink">
                        {nextDueText(plan)}
                      </span>
                    ) : (
                      <span className="text-sage font-medium">All settled</span>
                    )}
                  </span>
                  <span>
                    Outstanding:{" "}
                    <span className="text-navy font-medium">
                      {npr(plan.outstandingBalance)}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-5">
            <p className="text-xs text-slate-muted">
              Showing{" "}
              {pagination.total === 0
                ? 0
                : (pagination.page - 1) * PAGE_SIZE + 1}
              –{Math.min(pagination.page * PAGE_SIZE, pagination.total)} of{" "}
              {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-navy px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}

      {saleId && (
        <InitEmiModal
          key={saleId}
          sale={sale}
          saleLoading={saleLoading}
          saleError={saleError}
          submitting={submitting}
          onClose={closeInit}
          onSubmit={handleCreatePlan}
        />
      )}
    </div>
  );
};

export default EmiPlans;

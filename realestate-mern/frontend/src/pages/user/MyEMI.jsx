import React, { useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { formatPrice } from "../../utils/format";
import {
  getEmiPlans,
  requestInstallmentVerification,
} from "../../services/emiService";

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
  pending: "Verification pending review",
  approved: "Verified",
  rejected: "Verification rejected",
};

// Stored status is paid/pending/waived; 'overdue' is computed client-side
// (pending + dueDate before today at midnight) and never sent to the API.
const displayStatus = (inst) => {
  if (inst.status === "paid" || inst.status === "waived") return inst.status;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return inst.dueDate && new Date(inst.dueDate) < today ? "overdue" : "pending";
};

// Local-timezone yyyy-mm-dd for <input type="date">
const toDateInput = (value) => {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const RequestVerificationModal = ({ inst, busy, onClose, onSubmit }) => {
  const [paidAmount, setPaidAmount] = useState(String(inst.amount ?? ""));
  const [paidDate, setPaidDate] = useState(toDateInput());
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  const wasRejected = inst.verification?.status === "rejected";

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return setFile(null);
    if (!f.type.startsWith("image/")) {
      setError("Please attach an image file (JPG, PNG or WEBP).");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB.");
      return;
    }
    setError("");
    setFile(f);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return setError("Amount must be a number of at least 0.");
    }
    if (!paidDate) return setError("Paid date is required.");
    setError("");
    onSubmit({ paidAmount: amount, paidDate, note: note.trim(), paymentSlip: file });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-navy-dark/60" onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-lifted w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="eyebrow mb-1">Installment {inst.installmentNumber}</p>
            <h2 className="font-display text-xl text-navy">
              {wasRejected ? "Resubmit Payment" : "Request Payment Verification"}
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

        {wasRejected && inst.verification?.reviewNote && (
          <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-3 text-sm mb-4">
            Previous request was rejected: {inst.verification.reviewNote}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-3 text-sm mb-4">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="label-field" htmlFor="req-amount">Amount Paid (NPR)</label>
              <input
                id="req-amount"
                type="number"
                min="0"
                step="any"
                className="input-field"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                required
              />
              <p className="text-[11px] text-slate-muted mt-1.5">
                Scheduled amount is {formatPrice(inst.amount)} — enter what you actually paid.
              </p>
            </div>
            <div>
              <label className="label-field" htmlFor="req-date">Date Paid</label>
              <input
                id="req-date"
                type="date"
                className="input-field"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label-field" htmlFor="req-slip">Payment Slip (optional)</label>
              <input
                id="req-slip"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-muted file:mr-3 file:py-2 file:px-3 file:rounded-sm file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:bg-navy file:text-ivory hover:file:bg-navy-dark"
              />
              <p className="text-[11px] text-slate-muted mt-1.5">
                A photo of your receipt or bank transfer slip helps admin verify faster. JPG, PNG or WEBP, up to 5MB.
              </p>
              {file && <p className="text-xs text-sage mt-1.5">Selected: {file.name}</p>}
            </div>
            <div>
              <label className="label-field" htmlFor="req-note">Note (optional)</label>
              <textarea
                id="req-note"
                rows="2"
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. paid via eSewa, transaction ref #..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-sm px-4 py-2" disabled={busy}>
              {busy ? "Submitting..." : "Submit for Verification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PlanCard = ({ plan, defaultExpanded, onRequestVerification }) => {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const installments = plan.installments || [];
  const totalCount = installments.length;
  const paidCount = installments.filter((i) => i.status === "paid" || i.status === "waived").length;
  const progressPct = totalCount ? Math.round((paidCount / totalCount) * 100) : 0;

  return (
    <div className="bg-white border border-navy/10 rounded-sm shadow-card mb-5 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-parchment/40 transition-colors"
      >
        <div className="min-w-0">
          <p className="font-medium text-navy truncate">{plan.property?.title || "Property"}</p>
          <p className="text-xs text-slate-muted mt-0.5">
            {paidCount} of {totalCount} installments paid
            {plan.nextDueInstallment && (
              <>
                {" · "}Next due {new Date(plan.nextDueInstallment.dueDate).toLocaleDateString()} · {formatPrice(plan.nextDueInstallment.amount)}
              </>
            )}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Principal</p>
              <p className="text-lg font-display text-navy break-words">{formatPrice(plan.principalAmount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Outstanding</p>
              <p className="text-lg font-display text-navy break-words">{formatPrice(plan.outstandingBalance)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Total Paid</p>
              <p className="text-lg font-display text-sage break-words">{formatPrice(plan.totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Progress</p>
              <div className="h-1.5 bg-parchment rounded-full overflow-hidden mt-3">
                <div className="h-full bg-brass transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {installments.map((inst) => {
              const st = displayStatus(inst);
              const verification = inst.verification;
              const hasPendingVerification = verification && verification.status === "pending";
              const canRequest = (st === "pending" || st === "overdue") && !hasPendingVerification;

              return (
                <div key={inst.installmentNumber} className="border border-navy/10 rounded-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="font-medium text-navy">Installment {inst.installmentNumber}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`status-badge ${INSTALLMENT_BADGE[st]}`}>{INSTALLMENT_LABEL[st]}</span>
                      {verification && verification.status !== "none" && (
                        <span className={`status-badge ${VERIFICATION_BADGE[verification.status]}`}>
                          {VERIFICATION_LABEL[verification.status]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-muted mb-2">
                    <span>Due: <span className="text-slate-ink">{new Date(inst.dueDate).toLocaleDateString()}</span></span>
                    <span>Amount: <span className="text-slate-ink">{formatPrice(inst.amount)}</span></span>
                    {inst.paidDate && (
                      <span>Paid: <span className="text-slate-ink">{new Date(inst.paidDate).toLocaleDateString()} ({formatPrice(inst.paidAmount)})</span></span>
                    )}
                  </div>
                  {verification && verification.status === "rejected" && verification.reviewNote && (
                    <p className="text-xs text-brick mb-2">Reason: {verification.reviewNote}</p>
                  )}
                  {hasPendingVerification && (
                    <p className="text-xs text-slate-muted mb-2">
                      Submitted {verification.submittedAt ? new Date(verification.submittedAt).toLocaleDateString() : ""} — awaiting admin review.
                    </p>
                  )}
                  {(canRequest || (verification && verification.status === "rejected")) && (
                    <button
                      type="button"
                      onClick={() => onRequestVerification(plan, inst)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      {verification && verification.status === "rejected" ? "Resubmit Payment" : "Request Verification"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default function MyEMI() {
  const { showToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalCtx, setModalCtx] = useState(null); // { plan, inst }
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getEmiPlans({ limit: 50 });
      setPlans(data.plans || []);
      setSummary(data.summary || null);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load your EMI plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmitVerification = async (payload) => {
    if (!modalCtx) return;
    setBusy(true);
    try {
      await requestInstallmentVerification(modalCtx.plan._id, modalCtx.inst.installmentNumber, payload);
      showToast("Payment verification request submitted", "success");
      setModalCtx(null);
      await load();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to submit verification request", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-10">
      <p className="eyebrow mb-2">My Account</p>
      <h1 className="text-3xl mb-8">My EMI</h1>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Active Plans</p>
            <p className="text-2xl font-display text-navy">{summary.activePlans}</p>
          </div>
          <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Due This Month</p>
            <p className="text-2xl font-display text-navy">{summary.dueThisMonth}</p>
          </div>
          <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Overdue</p>
            <p className={`text-2xl font-display ${summary.overdueInstallments > 0 ? "text-brick" : "text-navy"}`}>
              {summary.overdueInstallments}
            </p>
          </div>
          <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Total Outstanding</p>
            <p className="text-xl font-display text-navy break-words">{formatPrice(summary.totalOutstanding)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-muted">Loading your EMI plans...</p>
      ) : error ? (
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-4 text-sm">{error}</div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 px-6 text-center">
          <p className="text-slate-muted">
            You don't have any EMI plans yet. Once a purchase with EMI payment is verified, its schedule will appear here.
          </p>
        </div>
      ) : (
        plans.map((plan, idx) => (
          <PlanCard
            key={plan._id}
            plan={plan}
            defaultExpanded={plans.length === 1 || idx === 0}
            onRequestVerification={(p, inst) => setModalCtx({ plan: p, inst })}
          />
        ))
      )}

      {modalCtx && (
        <RequestVerificationModal
          key={`${modalCtx.plan._id}-${modalCtx.inst.installmentNumber}`}
          inst={modalCtx.inst}
          busy={busy}
          onClose={() => setModalCtx(null)}
          onSubmit={handleSubmitVerification}
        />
      )}
    </div>
  );
}

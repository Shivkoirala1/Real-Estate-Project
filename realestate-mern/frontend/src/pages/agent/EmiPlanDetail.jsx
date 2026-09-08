import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../utils/axios';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const PLAN_BADGE = {
  active: 'bg-brass/15 text-brass-dark',
  completed: 'bg-sage-light text-sage',
  defaulted: 'bg-brick-light text-brick',
  cancelled: 'bg-navy/10 text-slate-muted',
};

const PLAN_LABEL = {
  active: 'Active',
  completed: 'Completed',
  defaulted: 'Defaulted',
  cancelled: 'Cancelled',
};

const INSTALLMENT_BADGE = {
  paid: 'bg-sage-light text-sage',
  waived: 'bg-navy/10 text-slate-muted',
  overdue: 'bg-brick-light text-brick',
  pending: 'bg-brass/15 text-brass-dark',
};

const INSTALLMENT_LABEL = {
  paid: 'Paid',
  waived: 'Waived',
  overdue: 'Overdue',
  pending: 'Pending',
};

const npr = (x) => `NPR ${Number(x || 0).toLocaleString()}`;

// Local-timezone yyyy-mm-dd for <input type="date">
const toDateInput = (value) => {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Stored status is paid/pending/waived; 'overdue' is computed client-side
// (pending + dueDate before today at midnight) and never sent to the API.
const displayStatus = (inst) => {
  if (inst.status === 'paid' || inst.status === 'waived') return inst.status;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return inst.dueDate && new Date(inst.dueDate) < today ? 'overdue' : 'pending';
};

// ---- Modals ----

const ModalShell = ({ title, eyebrow, onClose, children }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" role="dialog" aria-modal="true">
    <div className="absolute inset-0 bg-navy-dark/60" onClick={onClose} />
    <div className="relative bg-white rounded-sm shadow-lifted w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h2 className="font-display text-xl text-navy">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-slate-muted hover:text-navy text-2xl leading-none">×</button>
      </div>
      {children}
    </div>
  </div>
);

const ErrorNote = ({ children }) => (
  <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-3 text-sm mb-4">{children}</div>
);

// Pending/overdue rows -> record the payment
const MarkPaidModal = ({ inst, busy, onClose, onSubmit }) => {
  const [paidAmount, setPaidAmount] = useState(String(inst.amount ?? ''));
  const [paidDate, setPaidDate] = useState(toDateInput());
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) return setError('Paid amount must be a number of at least 0.');
    if (!paidDate) return setError('Paid date is required.');
    setError('');
    onSubmit({ status: 'paid', paidAmount: amount, paidDate, remarks: remarks.trim() });
  };

  return (
    <ModalShell eyebrow={`Installment ${inst.installmentNumber}`} title="Mark Paid" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="space-y-4">
          <div>
            <label className="label-field" htmlFor="paid-amount">Paid Amount (NPR)</label>
            <input
              id="paid-amount"
              type="number"
              min="0"
              step="any"
              className="input-field"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              required
            />
            <p className="text-[11px] text-slate-muted mt-1.5">
              Scheduled amount is {npr(inst.amount)} — record partial or extra payments as they actually happened.
            </p>
          </div>
          <div>
            <label className="label-field" htmlFor="paid-date">Paid Date</label>
            <input
              id="paid-date"
              type="date"
              className="input-field"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label-field" htmlFor="paid-remarks">Remarks (optional)</label>
            <textarea
              id="paid-remarks"
              rows="2"
              className="input-field"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. paid in cash at the office"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          <button type="submit" className="btn-primary text-sm px-4 py-2" disabled={busy}>
            {busy ? 'Saving...' : 'Mark Paid'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

// Pending rows -> reschedule due date / amount / remarks (changed fields only)
const EditPendingModal = ({ inst, busy, onClose, onSubmit }) => {
  const [dueDate, setDueDate] = useState(toDateInput(inst.dueDate));
  const [amount, setAmount] = useState(String(inst.amount ?? ''));
  const [remarks, setRemarks] = useState(inst.remarks || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dueDate) return setError('Due date is required.');
    const payload = {};
    if (dueDate !== toDateInput(inst.dueDate)) payload.dueDate = dueDate;
    const nextAmount = Number(amount);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) return setError('Amount must be a number of at least 0.');
    if (nextAmount !== Number(inst.amount)) payload.amount = nextAmount;
    if ((remarks || '').trim() !== (inst.remarks || '')) payload.remarks = (remarks || '').trim();
    if (Object.keys(payload).length === 0) return setError('No changes to save.');
    setError('');
    onSubmit(payload);
  };

  return (
    <ModalShell eyebrow={`Installment ${inst.installmentNumber}`} title="Edit Installment" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="space-y-4">
          <div>
            <label className="label-field" htmlFor="edit-due">Due Date</label>
            <input
              id="edit-due"
              type="date"
              className="input-field"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label-field" htmlFor="edit-amount">Amount (NPR)</label>
            <input
              id="edit-amount"
              type="number"
              min="0"
              step="any"
              className="input-field"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label-field" htmlFor="edit-remarks">Remarks (optional)</label>
            <textarea
              id="edit-remarks"
              rows="2"
              className="input-field"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. buyer deferred one month"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          <button type="submit" className="btn-primary text-sm px-4 py-2" disabled={busy}>
            {busy ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

// Paid/waived rows -> remarks only (the server blocks amount/due-date edits once paid)
const EditRemarksModal = ({ inst, busy, onClose, onSubmit }) => {
  const [remarks, setRemarks] = useState(inst.remarks || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((remarks || '').trim() === (inst.remarks || '')) return setError('No changes to save.');
    setError('');
    onSubmit({ remarks: (remarks || '').trim() });
  };

  return (
    <ModalShell eyebrow={`Installment ${inst.installmentNumber}`} title="Edit Remarks" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div>
          <label className="label-field" htmlFor="row-remarks">Remarks</label>
          <textarea
            id="row-remarks"
            rows="3"
            className="input-field"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. bank transfer received, ref #12345"
          />
          <p className="text-[11px] text-slate-muted mt-1.5">
            Settled installments are locked for amount changes — revert to pending first if the payment itself was recorded wrong.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          <button type="submit" className="btn-primary text-sm px-4 py-2" disabled={busy}>
            {busy ? 'Saving...' : 'Save Remarks'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

// Plan-level: recompute pending due dates monthly from a new start date
const RescheduleModal = ({ busy, onClose, onSubmit }) => {
  const [startDate, setStartDate] = useState(toDateInput());
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!startDate) return setError('Start date is required.');
    const payload = { startDate };
    if (amount !== '') {
      const a = Number(amount);
      if (!Number.isFinite(a) || a <= 0) return setError('New installment amount must be greater than 0.');
      payload.installmentAmount = a;
    }
    setError('');
    onSubmit(payload);
  };

  return (
    <ModalShell eyebrow="Plan" title="Reschedule Remaining" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="space-y-4">
          <div>
            <label className="label-field" htmlFor="resched-start">Start Date *</label>
            <input
              id="resched-start"
              type="date"
              className="input-field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <p className="text-[11px] text-slate-muted mt-1.5">
              All pending installments are recomputed monthly from this date; already-settled installments are untouched.
            </p>
          </div>
          <div>
            <label className="label-field" htmlFor="resched-amount">New Installment Amount (NPR, optional)</label>
            <input
              id="resched-amount"
              type="number"
              min="0"
              step="any"
              className="input-field"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Leave blank to keep current amounts"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          <button type="submit" className="btn-primary text-sm px-4 py-2" disabled={busy}>
            {busy ? 'Saving...' : 'Reschedule'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const EmiPlanDetail = () => {
  const { id } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [plan, setPlan] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusBusy, setStatusBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null); // { mode: 'markPaid' | 'editPending' | 'editRemarks', inst }
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await api.get(`/emi-plans/${id}`);
        if (cancelled) return;
        setPlan(res.data.plan || null);
        setCanManage(Boolean(res.data.canManage));
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load EMI plan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div>
        <Link to="/dashboard/agent/emi-plans" className="text-sm text-brass hover:underline">← EMI Plans</Link>
        <p className="text-slate-muted mt-6">Loading EMI plan...</p>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div>
        <Link to="/dashboard/agent/emi-plans" className="text-sm text-brass hover:underline">← EMI Plans</Link>
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-6 mt-6 text-sm">
          {error || 'EMI plan not found.'}
        </div>
      </div>
    );
  }

  const installments = plan.installments || [];
  const totalCount = installments.length;
  const paidCount = installments.filter((i) => i.status === 'paid' || i.status === 'waived').length;
  const allPaid = totalCount > 0 && paidCount === totalCount;
  const overdueCount = installments.filter((i) => displayStatus(i) === 'overdue').length;
  const progressPct = totalCount ? Math.round((paidCount / totalCount) * 100) : 0;

  // ---- actions (all gated on canManage - buyers are read-only) ----

  const applyStatus = async (nextStatus) => {
    if (!nextStatus || nextStatus === plan.status) return;
    if (nextStatus === 'cancelled' || nextStatus === 'defaulted') {
      const confirmed = await confirm({
        title: nextStatus === 'cancelled' ? 'Cancel this EMI plan?' : 'Mark this plan as defaulted?',
        message: 'The schedule and its history are kept, but the plan will be flagged accordingly for both agent and buyer.',
        confirmLabel: 'Yes, continue',
        cancelLabel: 'No, keep current',
      });
      if (!confirmed) return;
    }
    setStatusBusy(true);
    try {
      const res = await api.patch(`/emi-plans/${id}`, { status: nextStatus });
      setPlan(res.data.plan);
      showToast(res.data.message || 'Plan status updated', 'success');
    } catch (err) {
      // the select is bound to plan.status, so it snaps back to the stored value
      showToast(err.response?.data?.message || 'Failed to update plan status', 'error');
    } finally {
      setStatusBusy(false);
    }
  };

  const markCompleted = () => applyStatus('completed');

  const applyReschedule = async (payload) => {
    setBusy(true);
    try {
      const res = await api.patch(`/emi-plans/${id}`, { reschedule: payload });
      setPlan(res.data.plan);
      setRescheduleOpen(false);
      showToast(res.data.message || 'Remaining installments rescheduled', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to reschedule the plan', 'error');
    } finally {
      setBusy(false);
    }
  };

  const patchInstallment = async (inst, payload) => {
    setBusy(true);
    try {
      const res = await api.patch(`/emi-plans/${id}/installments/${inst.installmentNumber}`, payload);
      setPlan(res.data.plan);
      setEditor(null);
      showToast(res.data.message || 'Installment updated', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update the installment', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async (inst) => {
    const confirmed = await confirm({
      title: `Revert installment ${inst.installmentNumber} to pending?`,
      message: 'The recorded payment (date and amount) will be cleared and the installment returns to the schedule.',
      confirmLabel: 'Yes, revert it',
      cancelLabel: 'No, cancel',
    });
    if (!confirmed) return;
    patchInstallment(inst, { status: 'pending' });
  };

  const rowActions = (inst) => {
    const st = displayStatus(inst);
    if (st === 'pending' || st === 'overdue') {
      return (
        <>
          <button
            type="button"
            onClick={() => setEditor({ mode: 'markPaid', inst })}
            className="btn-primary text-xs px-3 py-1.5"
          >
            Mark Paid
          </button>
          <button
            type="button"
            onClick={() => setEditor({ mode: 'editPending', inst })}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Edit
          </button>
        </>
      );
    }
    // paid / waived: revert + remarks only (server blocks amount edits on settled rows)
    return (
      <>
        <button
          type="button"
          onClick={() => handleRevert(inst)}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={() => setEditor({ mode: 'editRemarks', inst })}
          className="text-xs px-3 py-1.5 rounded-sm border border-navy/15 text-slate-muted hover:border-navy/30 transition-colors"
        >
          Remarks
        </button>
      </>
    );
  };

  return (
    <div>
      <Link to="/dashboard/agent/emi-plans" className="text-sm text-brass hover:underline">← EMI Plans</Link>

      {/* Header */}
      <div className="mt-6 mb-8">
        <p className="eyebrow mb-2">Agent</p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl mb-2 break-words">{plan.property?.title || 'EMI Plan'}</h1>
            <p className="text-sm text-slate-muted">
              Buyer: <span className="font-medium text-navy">{plan.buyer?.name || '—'}</span>
              {plan.buyer?.email ? ` · ${plan.buyer.email}` : ''}
              {plan.agent?.name ? ` · Agent: ${plan.agent.name}` : ''}
            </p>
          </div>
          <span className={`status-badge ${PLAN_BADGE[plan.status] || 'bg-navy/10 text-slate-muted'}`}>
            {PLAN_LABEL[plan.status] || plan.status}
          </span>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Principal</p>
          <p className="text-xl font-display text-navy break-words">{npr(plan.principalAmount)}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Tenure</p>
          <p className="text-xl font-display text-navy">{plan.tenureMonths} months</p>
          <p className="text-xs text-slate-muted mt-1">× {npr(plan.installmentAmount)} / month</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Start Date</p>
          <p className="text-xl font-display text-navy">{new Date(plan.startDate).toLocaleDateString()}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Total Paid</p>
          <p className="text-xl font-display text-sage break-words">{npr(plan.totalPaid)}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Outstanding</p>
          <p className="text-xl font-display text-navy break-words">{npr(plan.outstandingBalance)}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Overdue</p>
          <p className={`text-3xl font-display ${overdueCount > 0 ? 'text-brick' : 'text-navy'}`}>{overdueCount}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card mb-8">
        <div className="flex items-center justify-between mb-2 gap-3">
          <p className="text-xs uppercase tracking-wide text-slate-muted">Progress</p>
          <p className="text-sm font-medium text-navy">
            {paidCount} of {totalCount} installments paid
          </p>
        </div>
        <div className="h-1.5 bg-parchment rounded-full overflow-hidden">
          <div className="h-full bg-brass transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* All-settled banner */}
      {allPaid && plan.status === 'active' && (
        <div className="bg-sage-light border border-sage/30 rounded-sm p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-sage">
            All installments settled — mark the plan as completed.
          </p>
          {canManage && (
            <button type="button" onClick={markCompleted} className="btn-primary text-sm" disabled={statusBusy}>
              {statusBusy ? 'Updating...' : 'Mark as Completed'}
            </button>
          )}
        </div>
      )}

      {/* Plan-level controls */}
      {canManage && (
        <div className="flex flex-wrap items-end gap-4 mb-8">
          <div>
            <label className="label-field" htmlFor="plan-status">Plan Status</label>
            <select
              id="plan-status"
              value={plan.status}
              onChange={(e) => applyStatus(e.target.value)}
              disabled={statusBusy}
              className="text-sm border border-navy/15 rounded-sm px-3 py-2 bg-white font-medium disabled:opacity-60"
            >
              {['active', 'completed', 'defaulted', 'cancelled'].map((s) => (
                <option key={s} value={s}>{PLAN_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setRescheduleOpen(true)}
            className="btn-secondary text-sm"
            disabled={plan.status !== 'active'}
            title={plan.status !== 'active' ? 'Only active plans can be rescheduled' : 'Recompute pending due dates from a new start date'}
          >
            Reschedule remaining
          </button>
        </div>
      )}

      {/* Installments - desktop table */}
      <div className="hidden md:block bg-white border border-navy/10 rounded-sm overflow-x-auto shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
              <th className="px-5 py-3">#</th>
              <th className="px-5 py-3">Due Date</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Paid Date</th>
              <th className="px-5 py-3">Paid Amount</th>
              <th className="px-5 py-3">Remarks</th>
              {canManage && <th className="px-5 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {installments.map((inst) => {
              const st = displayStatus(inst);
              return (
                <tr key={inst.installmentNumber} className="border-b border-navy/5 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy">{inst.installmentNumber}</td>
                  <td className="px-5 py-3 text-slate-ink">{new Date(inst.dueDate).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-slate-ink">{npr(inst.amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${INSTALLMENT_BADGE[st]}`}>{INSTALLMENT_LABEL[st]}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-muted">{inst.paidDate ? new Date(inst.paidDate).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3 text-slate-muted">{inst.paidAmount != null ? npr(inst.paidAmount) : '—'}</td>
                  <td className="px-5 py-3 text-slate-muted max-w-[220px] break-words">{inst.remarks || '—'}</td>
                  {canManage && (
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">{rowActions(inst)}</div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Installments - mobile stacked cards */}
      <div className="md:hidden space-y-3">
        {installments.map((inst) => {
          const st = displayStatus(inst);
          return (
            <div key={inst.installmentNumber} className="bg-white border border-navy/10 rounded-sm p-4 shadow-card">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-medium text-navy">Installment {inst.installmentNumber}</p>
                <span className={`status-badge ${INSTALLMENT_BADGE[st]}`}>{INSTALLMENT_LABEL[st]}</span>
              </div>
              <div className="text-xs text-slate-muted space-y-1 mb-3">
                <div className="flex justify-between gap-4">
                  <span>Due date</span>
                  <span className="text-slate-ink">{new Date(inst.dueDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Amount</span>
                  <span className="text-slate-ink">{npr(inst.amount)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Paid date</span>
                  <span className="text-slate-ink">{inst.paidDate ? new Date(inst.paidDate).toLocaleDateString() : '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Paid amount</span>
                  <span className="text-slate-ink">{inst.paidAmount != null ? npr(inst.paidAmount) : '—'}</span>
                </div>
                {inst.remarks && (
                  <div className="flex justify-between gap-4">
                    <span>Remarks</span>
                    <span className="text-slate-ink text-right break-words">{inst.remarks}</span>
                  </div>
                )}
              </div>
              {canManage && <div className="flex gap-2 flex-wrap">{rowActions(inst)}</div>}
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {canManage && editor?.mode === 'markPaid' && (
        <MarkPaidModal
          key={`mark-paid-${editor.inst.installmentNumber}`}
          inst={editor.inst}
          busy={busy}
          onClose={() => setEditor(null)}
          onSubmit={(payload) => patchInstallment(editor.inst, payload)}
        />
      )}
      {canManage && editor?.mode === 'editPending' && (
        <EditPendingModal
          key={`edit-pending-${editor.inst.installmentNumber}`}
          inst={editor.inst}
          busy={busy}
          onClose={() => setEditor(null)}
          onSubmit={(payload) => patchInstallment(editor.inst, payload)}
        />
      )}
      {canManage && editor?.mode === 'editRemarks' && (
        <EditRemarksModal
          key={`edit-remarks-${editor.inst.installmentNumber}`}
          inst={editor.inst}
          busy={busy}
          onClose={() => setEditor(null)}
          onSubmit={(payload) => patchInstallment(editor.inst, payload)}
        />
      )}
      {canManage && rescheduleOpen && (
        <RescheduleModal
          busy={busy}
          onClose={() => setRescheduleOpen(false)}
          onSubmit={applyReschedule}
        />
      )}
    </div>
  );
};

export default EmiPlanDetail;

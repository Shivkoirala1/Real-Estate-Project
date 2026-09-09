import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getContactForms,
  updateContactFormStatus,
  deleteContactForm,
} from '../../../services/contactFormService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import RespondToContactModal from './RespondToContactModal';
import ConvertToLeadModal from './ConvertToLeadModal';
import { timeAgo } from '../../../utils/format';

const FORM_STATUS_STYLES = {
  new: { label: 'New', bg: '#A64B421A', color: '#A64B42' },
  read: { label: 'Read', bg: '#B8863B1A', color: '#8F6D3B' },
  responded: { label: 'Responded', bg: '#6B8F711A', color: '#6B8F71' },
  converted: { label: 'Converted', bg: '#1F2A441A', color: '#1F2A44' },
};

// Admin inbox for public contact form submissions. Respond inline, mark as
// read, or convert a submission into a pipeline lead in one click.
const ContactFormsInbox = ({ onConverted }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [forms, setForms] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, currentPage: 1 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [respondTarget, setRespondTarget] = useState(null);
  const [convertTarget, setConvertTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (statusFilter) params.status = statusFilter;
      const result = await getContactForms(params);
      setForms(result.contactForms || []);
      setPagination(result.pagination || { total: 0, pages: 1, currentPage: 1 });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load inbox', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const markRead = async (form) => {
    if (form.status !== 'new') return;
    try {
      await updateContactFormStatus(form._id, 'read');
      setForms((prev) => prev.map((f) => (f._id === form._id ? { ...f, status: 'read' } : f)));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  const handleDelete = async (form) => {
    const ok = await confirm({
      title: 'Delete this submission?',
      message: `The contact form from "${form.name}" will be permanently removed.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    try {
      await deleteContactForm(form._id);
      showToast('Submission deleted');
      loadForms();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete', 'error');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-muted">
          Public contact page submissions. Submissions can be responded to inline, marked as read, or
          converted into a pipeline lead (repeat senders are merged into their
          existing lead) with a conversation thread seeded — reply, or adjust the
          lead manually when needed.
        </p>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field text-sm py-2 w-auto"
        >
          <option value="">All statuses</option>
          {Object.entries(FORM_STATUS_STYLES).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-navy/10 rounded-sm divide-y divide-navy/5">
        {loading ? (
          <p className="p-8 text-center text-slate-muted">Loading inbox...</p>
        ) : forms.length === 0 ? (
          <p className="p-8 text-center text-slate-muted">No submissions match this filter.</p>
        ) : (
          forms.map((form) => {
            const status = FORM_STATUS_STYLES[form.status] || FORM_STATUS_STYLES.new;
            const expanded = expandedId === form._id;
            return (
              <div key={form._id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    className="flex-1 min-w-[240px] text-left"
                    onClick={() => {
                      setExpandedId(expanded ? null : form._id);
                      markRead(form);
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-navy">{form.name}</p>
                      <span
                        className="status-badge"
                        style={{ backgroundColor: status.bg, color: status.color }}
                      >
                        {status.label}
                      </span>
                      {!expanded && (
                        <span className="text-sm text-slate-muted truncate max-w-md">
                          {form.subject}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-muted mt-0.5">
                      {form.email}
                      {form.phone ? ` · ${form.phone}` : ''} · {timeAgo(form.createdAt)}
                      {form.property && (
                        <>
                          {' · '}re: <span className="text-slate-ink">{form.property.title}</span>
                        </>
                      )}
                    </p>
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    {form.status === 'converted' && form.convertedLead && (
                      <Link
                        to={`/dashboard/lead-management/leads/${form.convertedLead._id || form.convertedLead}`}
                        className="text-xs text-navy hover:underline"
                      >
                        View lead →
                      </Link>
                    )}
                    {form.status !== 'converted' && (
                      <button
                        onClick={() => setConvertTarget(form)}
                        className="btn-gold text-xs px-3 py-1.5"
                      >
                        Convert to Lead
                      </button>
                    )}
                    {/* <button
                      onClick={() => setRespondTarget(form)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      Respond
                    </button> */}
                    <button
                      onClick={() => handleDelete(form)}
                      className="text-xs text-slate-muted hover:text-brick"
                      title="Delete submission"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 bg-parchment/60 border border-navy/10 rounded-sm p-4 text-sm">
                    <p className="font-semibold text-navy mb-1">{form.subject}</p>
                    <p className="text-slate-ink whitespace-pre-wrap">{form.message}</p>
                    {form.response && (
                      <div className="mt-3 pt-3 border-t border-navy/10">
                        <p className="text-xs uppercase tracking-wider text-slate-muted mb-1">
                          Response
                          {form.respondedAt ? ` · ${timeAgo(form.respondedAt)}` : ''}
                        </p>
                        <p className="text-slate-ink whitespace-pre-wrap">{form.response}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-muted">
            Page {pagination.currentPage} of {pagination.pages} · {pagination.total} submissions
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.currentPage <= 1}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={pagination.currentPage >= pagination.pages}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* {respondTarget && (
        <RespondToContactModal
          contactForm={respondTarget}
          onClose={() => setRespondTarget(null)}
          onResponded={loadForms}
        />
      )} */}

      {convertTarget && (
        <ConvertToLeadModal
          sourceType="contact_form"
          source={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConverted={() => {
            loadForms();
            onConverted && onConverted();
          }}
        />
      )}
    </div>
  );
};

export default ContactFormsInbox;

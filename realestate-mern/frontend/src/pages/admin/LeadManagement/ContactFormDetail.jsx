import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getContactFormById, deleteContactForm } from '../../../services/contactFormService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import RespondToContactModal from './RespondToContactModal';
import ConvertToLeadModal from './ConvertToLeadModal';
import { timeAgo } from '../../../utils/format';

// Full-page detail view of a single contact form submission (deep-linked from
// notifications or the inbox).
const ContactFormDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRespond, setShowRespond] = useState(false);
  const [showConvert, setShowConvert] = useState(false);

  const loadForm = useCallback(async () => {
    try {
      const result = await getContactFormById(id);
      setForm(result.contactForm);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load submission', 'error');
      setForm(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleDelete = async () => {
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
      navigate('/dashboard/admin/lead-management');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete', 'error');
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-muted">Loading submission...</div>;
  }

  if (!form) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-muted mb-4">Submission not found.</p>
        <Link to="/dashboard/admin/lead-management" className="btn-secondary text-sm">
          ← Back to pipeline
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/dashboard/admin/lead-management" className="text-xs text-brass hover:underline">
            ← Lead Pipeline
          </Link>
          <h1 className="text-2xl mt-2">{form.subject}</h1>
          <p className="text-sm text-slate-muted mt-1">
            From {form.name} · {form.email}
            {form.phone ? ` · ${form.phone}` : ''} · {timeAgo(form.createdAt)}
          </p>
        </div>
        <button onClick={handleDelete} className="text-sm text-brick hover:underline">
          Delete
        </button>
      </div>

      <div className="bg-white border border-navy/10 rounded-sm p-6 mb-6">
        <p className="text-sm text-slate-ink whitespace-pre-wrap leading-relaxed">{form.message}</p>
        {form.property && (
          <p className="mt-4 pt-4 border-t border-navy/10 text-sm">
            <span className="text-slate-muted">Regarding property: </span>
            <span className="text-navy font-medium">{form.property.title}</span>
          </p>
        )}
      </div>

      {form.response && (
        <div className="bg-parchment/60 border border-navy/10 rounded-sm p-6 mb-6">
          <p className="text-xs uppercase tracking-wider text-slate-muted mb-2">
            Response sent {form.respondedAt ? `· ${timeAgo(form.respondedAt)}` : ''}
          </p>
          <p className="text-sm text-slate-ink whitespace-pre-wrap">{form.response}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button onClick={() => setShowRespond(true)} className="btn-secondary text-sm">
          {form.response ? 'Update response' : 'Respond'}
        </button>
        {form.status !== 'converted' ? (
          <button onClick={() => setShowConvert(true)} className="btn-gold text-sm">
            Convert to Lead
          </button>
        ) : (
          <Link
            to={`/dashboard/lead-management/leads/${form.convertedLead?._id || form.convertedLead}`}
            className="btn-gold text-sm"
          >
            View converted lead →
          </Link>
        )}
      </div>

      {showRespond && (
        <RespondToContactModal
          contactForm={form}
          onClose={() => setShowRespond(false)}
          onResponded={loadForm}
        />
      )}

      {showConvert && (
        <ConvertToLeadModal
          sourceType="contact_form"
          source={form}
          onClose={() => setShowConvert(false)}
          onConverted={loadForm}
        />
      )}
    </div>
  );
};

export default ContactFormDetail;

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import InnovationForm from '../../components/InnovationForm';
import { getAdminInnovations, updateInnovation } from '../../services/innovationService';
import { useToast } from '../../context/ToastContext';

// Admin edit wrapper around the shared InnovationForm. The record is located
// through the admin list endpoint (bounded scan) — there is intentionally no
// GET /:id endpoint. No ownership restrictions client-side; the backend
// permits the admin bypass. Visibility stays on the list page, never here.
const MAX_EDIT_SCAN_PAGES = 20;

const AdminInnovationForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [initialIdea, setInitialIdea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        let found = null;
        for (let p = 1; p <= MAX_EDIT_SCAN_PAGES && !found; p += 1) {
          // eslint-disable-next-line no-await-in-loop
          const data = await getAdminInnovations({ page: p, limit: 50 });
          found = (data.innovations ?? []).find((idea) => String(idea._id) === String(id)) || null;
          if ((data.pagination?.pages ?? data.pagination?.totalPages ?? 1) <= p) break;
        }
        if (cancelled) return;
        if (!found) {
          setLoadError('We could not find that idea.');
        } else {
          setInitialIdea(found);
        }
      } catch (err) {
        console.error('Failed to load innovation for editing:', err);
        if (!cancelled) setLoadError('Could not load this idea. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (payload) => {
    await updateInnovation(id, payload);
    showToast('Innovation updated', 'success');
    navigate('/dashboard/admin/innovations');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <p className="eyebrow mb-2">Community</p>
      <h1 className="text-3xl mb-3">Edit innovation idea</h1>
      <p className="text-sm text-slate-muted leading-relaxed mb-8">
        {initialIdea?.submittedBy?.name ? `Submitted by ${initialIdea.submittedBy.name}. ` : ''}
        Changes are visible to everyone right away. To hide the idea instead, use Hide on the list page.
      </p>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-navy/5 rounded-sm" />
          <div className="h-10 bg-navy/5 rounded-sm" />
          <div className="h-40 bg-navy/5 rounded-sm" />
          <div className="h-24 bg-navy/5 rounded-sm" />
        </div>
      ) : loadError ? (
        <div className="bg-white border border-navy/10 rounded-sm py-14 px-6 text-center">
          <p className="text-brick mb-5">{loadError}</p>
          <Link to="/dashboard/admin/innovations" className="btn-gold px-5 py-2.5 text-sm inline-block">
            Back to ideas
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-navy/10 rounded-sm p-6 sm:p-8">
          <InnovationForm initialIdea={initialIdea} onSubmit={handleSubmit} submitLabel="Save changes" />
        </div>
      )}
    </div>
  );
};

export default AdminInnovationForm;

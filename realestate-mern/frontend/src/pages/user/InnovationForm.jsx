import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import InnovationForm from '../../components/InnovationForm';
import { createInnovation, getMyInnovations, updateInnovation } from '../../services/innovationService';
import { useToast } from '../../context/ToastContext';

// Route wrapper around the shared InnovationForm for both /new and /:id/edit
// (same arrangement as AddEditProperty). Edit loads the record from the
// owner's own listing — there is intentionally no GET /:id endpoint, so all
// pages are walked (bounded) until the id is found; ownership is enforced
// again server-side on update.
const MAX_EDIT_SCAN_PAGES = 20;

const InnovationFormPage = () => {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [initialIdea, setInitialIdea] = useState(isEditing ? null : undefined);
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        let found = null;
        for (let p = 1; p <= MAX_EDIT_SCAN_PAGES && !found; p += 1) {
          // eslint-disable-next-line no-await-in-loop
          const data = await getMyInnovations({ page: p, limit: 50 });
          found = (data.innovations ?? []).find((idea) => String(idea._id) === String(id)) || null;
          if ((data.pagination?.pages ?? 1) <= p) break;
        }
        if (cancelled) return;
        if (!found) {
          setLoadError('We could not find that idea in your submissions.');
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
  }, [isEditing, id]);

  const handleSubmit = async (payload) => {
    if (isEditing) {
      await updateInnovation(id, payload);
      showToast('Innovation updated', 'success');
    } else {
      await createInnovation(payload);
      showToast('Idea shared — it is now visible to everyone', 'success');
    }
    navigate('/my-innovations');
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <p className="eyebrow mb-2">Community</p>
      <h1 className="text-3xl sm:text-4xl font-medium text-navy leading-tight mb-3">
        {isEditing ? 'Edit innovation idea' : 'Share an innovation idea'}
      </h1>
      <p className="text-sm sm:text-base text-slate-muted leading-relaxed mb-8">
        {isEditing
          ? 'Update your idea below. Your changes are visible to everyone right away.'
          : 'Describe a problem and your idea to solve it. Your idea will be visible to everyone immediately after sharing.'}
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
          <Link to="/my-innovations" className="btn-gold px-5 py-2.5 text-sm inline-block">
            Back to my ideas
          </Link>
        </div>
      ) : (
        <InnovationForm
          initialIdea={isEditing ? initialIdea : null}
          onSubmit={handleSubmit}
          submitLabel={isEditing ? 'Save changes' : 'Share idea'}
        />
      )}
    </main>
  );
};

export default InnovationFormPage;

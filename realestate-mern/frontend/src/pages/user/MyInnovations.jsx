import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InnovationCard from '../../components/InnovationCard';
import InnovationDetailModal from '../../components/InnovationDetailModal';
import { deleteInnovation, getMyInnovations } from '../../services/innovationService';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';

const PAGE_SIZE = 9;

// Owner's own ideas (visible + hidden). Card opens the view-only modal;
// Edit/Delete live beside the card so the reusable card stays free of
// ownership logic. Search/pagination follow the BlogList interaction.
const MyInnovations = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [ideas, setIdeas] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMyInnovations({
        page,
        limit: PAGE_SIZE,
        q: submittedSearch || undefined,
      });
      setIdeas(data.innovations ?? []);
      // Backend pagination is { total, pages, currentPage, limit } — normalize
      // to the local { page, totalPages } shape (public/admin pages do the same).
      const raw = data.pagination ?? {};
      const totalPages = raw.pages ?? raw.totalPages ?? 1;
      const current = raw.currentPage ?? raw.page ?? page;
      setPagination({
        page: current,
        totalPages,
        hasNextPage: current < totalPages,
        hasPreviousPage: current > 1,
      });
    } catch (err) {
      console.error('Failed to load innovations:', err);
      setIdeas([]);
      setError('Could not load your ideas. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, submittedSearch]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const handleSearch = () => {
    setPage(1);
    setSubmittedSearch(search.trim());
  };

  const handleClearSearch = () => {
    setSearch('');
    setSubmittedSearch('');
    setPage(1);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id, title) => {
    const ok = await confirm({
      title: `Delete "${title}"?`,
      message: 'This will permanently remove the idea and its uploaded media. This can\'t be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await deleteInnovation(id);
      showToast('Innovation deleted', 'success');
      if (selected && String(selected._id) === String(id)) setSelected(null);
      if (ideas.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchIdeas();
      }
    } catch (err) {
      console.error('Failed to delete innovation:', err);
      showToast(err?.response?.data?.message || 'Failed to delete innovation', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <header className="mb-10">
        <p className="eyebrow mb-2">Community</p>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-medium text-navy leading-tight">My Innovation Ideas</h1>
            <p className="mt-3 text-sm sm:text-base text-slate-muted leading-relaxed">
              Ideas you have shared with the community. New ideas are visible to everyone right away.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search your ideas..."
                className="input-field w-full pr-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {search && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-muted hover:text-navy transition-colors"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <button type="button" onClick={handleSearch} className="btn-gold px-5 py-2.5 text-sm whitespace-nowrap">
              Search
            </button>
            <Link to="/my-innovations/new" className="btn-gold px-5 py-2.5 text-sm whitespace-nowrap text-center">
              + New Idea
            </Link>
          </div>
        </div>
        {submittedSearch && (
          <p className="mt-2 text-xs text-slate-muted">
            Showing results for <span className="text-navy font-medium">“{submittedSearch}”</span>
          </p>
        )}
      </header>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="bg-white border border-navy/10 rounded-sm overflow-hidden animate-pulse">
              <div className="h-52 bg-navy/5" />
              <div className="p-4">
                <div className="h-5 w-4/5 bg-navy/5 rounded mb-3" />
                <div className="h-3 w-full bg-navy/5 rounded mb-2" />
                <div className="h-3 w-3/4 bg-navy/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 px-6 text-center">
          <p className="text-brick mb-4">{error}</p>
          <button type="button" onClick={fetchIdeas} className="btn-gold px-5 py-2.5 text-sm">
            Try again
          </button>
        </div>
      ) : ideas.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 sm:py-20 px-6 text-center">
          <div className="max-w-md mx-auto">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-muted mb-3">No ideas yet</p>
            <h2 className="text-xl sm:text-2xl text-navy font-medium">
              {submittedSearch ? 'No ideas found' : "You haven't submitted any innovation ideas yet"}
            </h2>
            <p className="text-sm text-slate-muted mt-3 leading-relaxed">
              {submittedSearch
                ? `We couldn't find any of your ideas matching "${submittedSearch}".`
                : 'Share your first idea with the community.'}
            </p>
            {submittedSearch ? (
              <button onClick={handleClearSearch} className="btn-gold mt-6 px-5 py-2.5 text-sm">
                View all my ideas
              </button>
            ) : (
              <Link to="/my-innovations/new" className="btn-gold mt-6 px-5 py-2.5 text-sm inline-block">
                Share your first idea
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {ideas.map((idea) => (
              <div key={idea._id} className="flex flex-col">
                <InnovationCard innovation={idea} onClick={() => setSelected(idea)} />
                <div className="flex items-center gap-2 mt-2">
                  {!idea.isVisible && (
                    <span className="bg-navy/10 text-slate-muted text-xs font-medium px-2.5 py-1 rounded-sm">
                      Hidden
                    </span>
                  )}
                  <span className="flex-1" />
                  <Link
                    to={`/my-innovations/${idea._id}/edit`}
                    className="text-xs font-medium text-brass-dark hover:underline px-2 py-1"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(idea._id, idea.title)}
                    disabled={deletingId === idea._id}
                    className="text-xs font-medium text-brick hover:underline px-2 py-1 disabled:opacity-50"
                  >
                    {deletingId === idea._id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <nav className="flex items-center justify-between sm:justify-center gap-3 mt-10" aria-label="My innovations pagination">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="text-sm px-3 sm:px-4 py-2 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← <span className="hidden sm:inline">Previous</span>
              </button>
              <span className="text-sm text-navy px-2 whitespace-nowrap">
                Page {pagination.currentPage || page} <span className="text-slate-muted">of {pagination.totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pagination.totalPages}
                className="text-sm px-3 sm:px-4 py-2 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="hidden sm:inline">Next</span> →
              </button>
            </nav>
          )}
        </>
      )}

      <InnovationDetailModal innovation={selected} onClose={() => setSelected(null)} />
    </main>
  );
};

export default MyInnovations;

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getAdminInnovations,
  deleteInnovation,
  toggleInnovationVisibility,
} from "../../services/innovationService";
import InnovationCard from "../../components/InnovationCard";
import InnovationDetailModal from "../../components/InnovationDetailModal";
import { formatInnovationCategory } from "../../services/innovationService";
import { timeAgo } from "../../utils/format";
import { useConfirm } from "../../context/ConfirmContext";
import { useToast } from "../../context/ToastContext";

const PAGE_SIZE = 20;

const VISIBILITY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
];

// Admin moderation inbox: all ideas (visible + hidden) with search,
// visibility filter, view/edit/hide-show/delete. Structure follows
// ManageHeroSlides (fetch/search/pagination/delete-with-step-back); the
// visibility toggle follows the ReviewManagement idiom. No approval
// workflow exists — hiding is a display control, not a status.
const ManageInnovations = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [ideas, setIdeas] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminInnovations({
        page,
        limit: PAGE_SIZE,
        q: submittedSearch || undefined,
        visibility: visibilityFilter,
      });
      setIdeas(data.innovations ?? []);
      const raw = data.pagination ?? {};
      const totalPages = raw.pages ?? raw.totalPages ?? 1;
      const current = raw.currentPage ?? raw.page ?? page;
      setPagination({ page: current, totalPages, total: raw.total ?? 0 });
    } catch (err) {
      console.error("Failed to load innovations:", err);
      showToast(err?.response?.data?.message || "Failed to load innovations", "error");
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  }, [page, submittedSearch, visibilityFilter, showToast]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  // Reset to page 1 whenever search or filter changes.
  const handleSearch = () => {
    setPage(1);
    setSubmittedSearch(search.trim());
  };

  const handleClearSearch = () => {
    setSearch("");
    setSubmittedSearch("");
    setPage(1);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleFilterChange = (value) => {
    setVisibilityFilter(value);
    setPage(1);
  };

  const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
  };

  const handleToggleVisibility = async (idea) => {
    setBusyId(idea._id);
    try {
      const data = await toggleInnovationVisibility(idea._id, !idea.isVisible);
      const updated = data.innovation ?? { ...idea, isVisible: !idea.isVisible };
      setIdeas((prev) => prev.map((i) => (String(i._id) === String(idea._id) ? { ...i, ...updated } : i)));
      if (selected && String(selected._id) === String(idea._id)) {
        setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      showToast(updated.isVisible ? "Innovation is now visible to the public" : "Innovation hidden from the public");
    } catch (err) {
      console.error("Failed to update visibility:", err);
      showToast(err?.response?.data?.message || "Failed to update visibility", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id, title) => {
    const ok = await confirm({
      title: `Delete "${title}"?`,
      message: "The idea and its uploaded media will be permanently removed. This can't be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteInnovation(id);
      showToast("Innovation deleted", "success");
      if (selected && String(selected._id) === String(id)) setSelected(null);
      if (ideas.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchIdeas();
      }
    } catch (err) {
      console.error("Failed to delete innovation:", err);
      showToast(err?.response?.data?.message || "Failed to delete innovation", "error");
    }
  };

  return (
    <div>
      <p className="eyebrow mb-2">Community</p>
      <h1 className="text-3xl mb-2">Innovation Ideas</h1>
      <p className="text-sm text-slate-muted mb-6 leading-relaxed">
        Community-submitted ideas. Ideas go public immediately — use Hide to remove one from public
        discovery without deleting it.
      </p>

      {/* Search + visibility filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search by title..."
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
        <select
          value={visibilityFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="input-field sm:w-auto"
          aria-label="Filter by visibility"
        >
          {VISIBILITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {submittedSearch && (
        <p className="mb-4 text-xs text-slate-muted">
          Showing results for <span className="text-navy font-medium">“{submittedSearch}”</span>
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
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
      ) : ideas.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 px-6 text-center">
          <div className="max-w-md mx-auto">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-muted mb-3">No results</p>
            <h2 className="text-xl text-navy font-medium">
              {submittedSearch
                ? "No ideas match your search"
                : visibilityFilter === "hidden"
                  ? "No hidden ideas"
                  : "No innovation ideas have been submitted yet"}
            </h2>
            <p className="text-sm text-slate-muted mt-3 leading-relaxed">
              {submittedSearch
                ? `We couldn't find any ideas matching "${submittedSearch}".`
                : visibilityFilter === "hidden"
                  ? "Every submitted idea is currently visible to the public."
                  : "New community submissions will appear here."}
            </p>
            {submittedSearch && (
              <button onClick={handleClearSearch} className="btn-gold mt-6 px-5 py-2.5 text-sm">
                View all ideas
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-muted mb-4">
            Showing {ideas.length} of {pagination.total ?? ideas.length} idea{(pagination.total ?? ideas.length) === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {ideas.map((idea) => (
              <div key={idea._id} className="flex flex-col">
                <InnovationCard innovation={idea} onClick={() => setSelected(idea)} />
                <div className="bg-white border border-t-0 border-navy/10 rounded-b-sm px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-muted mb-2">
                    <span className={`font-medium px-2 py-0.5 rounded-sm ${idea.isVisible ? "bg-sage-light text-sage" : "bg-navy/10 text-slate-muted"}`}>
                      {idea.isVisible ? "Visible" : "Hidden"}
                    </span>
                    <span className="truncate">{idea.submittedBy?.name || "Community member"}</span>
                    <span className="flex-shrink-0">· {formatInnovationCategory(idea.category)}</span>
                    {idea.createdAt && <span className="flex-shrink-0">· {timeAgo(idea.createdAt)}</span>}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setSelected(idea)}
                      className="text-navy hover:underline px-2 py-1"
                    >
                      View
                    </button>
                    <Link
                      to={`/dashboard/admin/innovations/${idea._id}/edit`}
                      className="text-brass-dark hover:underline px-2 py-1"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(idea)}
                      disabled={busyId === idea._id}
                      className="text-slate-ink hover:underline px-2 py-1 disabled:opacity-50"
                    >
                      {busyId === idea._id ? "Saving…" : idea.isVisible ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idea._id, idea.title)}
                      className="text-brick hover:underline px-2 py-1"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <nav className="flex items-center justify-between sm:justify-center gap-3 mt-10" aria-label="Innovations pagination">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="text-sm px-3 sm:px-4 py-2 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← <span className="hidden sm:inline">Previous</span>
              </button>
              <span className="text-sm text-navy px-2 whitespace-nowrap">
                Page {pagination.page} <span className="text-slate-muted">of {pagination.totalPages}</span>
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
    </div>
  );
};

export default ManageInnovations;

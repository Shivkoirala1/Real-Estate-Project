import { useState, useEffect, useCallback } from "react";
import { getPublicInnovations } from "../services/innovationService";
import InnovationCard from "../components/InnovationCard";
import InnovationDetailModal from "../components/InnovationDetailModal";

const PAGE_SIZE = 9;

// Public discovery: visible ideas only (the backend is the source of truth
// for visibility — no client-side isVisible filtering). No auth required.
// Search/pagination follow the BlogList interaction; cards open the
// view-only modal with the already-loaded object (no detail endpoint).
const Innovations = () => {
  const [ideas, setIdeas] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getPublicInnovations({
        page,
        q: submittedSearch || undefined,
        limit: PAGE_SIZE,
      });

      setIdeas(data.innovations ?? []);

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
      console.error("Failed to load innovations:", err);
      setIdeas([]);
      setError("Could not load innovation ideas. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, submittedSearch]);

  useEffect(() => {
    fetchIdeas();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [fetchIdeas]);

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
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;

    setPage(p);
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">

      {/* Header */}
      <header className="mb-10 sm:mb-12 lg:mb-14">
        <p className="eyebrow mb-2">
          Community
        </p>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-medium text-navy leading-tight">
              Innovation Ideas
            </h1>

            <p className="mt-3 text-sm sm:text-base text-slate-muted leading-relaxed">
              Community-submitted ideas for improving housing, construction,
              sustainability, smart homes, financing, and related areas.
            </p>
          </div>

          {/* Search */}
          <div className="w-full lg:w-auto">
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
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

              <button
                type="button"
                onClick={handleSearch}
                className="btn-gold px-5 py-2.5 text-sm whitespace-nowrap"
              >
                Search
              </button>
            </div>

            {submittedSearch && (
              <p className="mt-2 text-xs text-slate-muted">
                Showing results for{" "}
                <span className="text-navy font-medium">
                  “{submittedSearch}”
                </span>
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Loading */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, index) => (
            <div
              key={index}
              className="bg-white border border-navy/10 rounded-sm overflow-hidden animate-pulse"
            >
              <div className="h-52 bg-navy/5" />

              <div className="p-4">
                <div className="h-5 w-4/5 bg-navy/5 rounded mb-3" />
                <div className="h-3 w-full bg-navy/5 rounded mb-2" />
                <div className="h-3 w-3/4 bg-navy/5 rounded mb-6" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        /* Error state */
        <div className="bg-white border border-navy/10 rounded-sm py-16 sm:py-20 px-6 text-center">
          <div className="max-w-md mx-auto">
            <p className="text-brick mb-4">{error}</p>
            <button
              type="button"
              onClick={fetchIdeas}
              className="btn-gold px-5 py-2.5 text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      ) : ideas.length === 0 ? (
        /* Empty state */
        <div className="bg-white border border-navy/10 rounded-sm py-16 sm:py-20 px-6 text-center">
          <div className="max-w-md mx-auto">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-muted mb-3">
              No Results
            </p>

            <h2 className="text-xl sm:text-2xl text-navy font-medium">
              {submittedSearch
                ? "No ideas found"
                : "No innovation ideas yet"}
            </h2>

            <p className="text-sm text-slate-muted mt-3 leading-relaxed">
              {submittedSearch
                ? `We couldn't find any ideas matching "${submittedSearch}".`
                : "Check back soon for new community ideas."}
            </p>

            {submittedSearch && (
              <button
                onClick={handleClearSearch}
                className="btn-gold mt-6 px-5 py-2.5 text-sm"
              >
                View All Ideas
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Card grid — view-only, no management actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {ideas.map((idea) => (
              <InnovationCard
                key={idea._id}
                innovation={idea}
                onClick={() => setSelected(idea)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <nav
              className="flex items-center justify-between sm:justify-center gap-3 mt-10 sm:mt-12"
              aria-label="Innovations pagination"
            >
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={!pagination.hasPreviousPage}
                className="text-sm px-3 sm:px-4 py-2 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← <span className="hidden sm:inline">Previous</span>
              </button>

              <span className="text-sm text-navy px-2 whitespace-nowrap">
                Page {pagination.page}{" "}
                <span className="text-slate-muted">
                  of {pagination.totalPages}
                </span>
              </span>

              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={!pagination.hasNextPage}
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

export default Innovations;

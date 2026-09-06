
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { getPublishedBlogs } from "../services/blogService";

const PAGE_SIZE = 9;

const formatDate = (dateStr) => {
  if (!dateStr) return "";

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Strip HTML tags and trim to a short excerpt for the card
const excerptFrom = (html, length = 110) => {
  if (!html) return "";

  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > length
    ? `${text.slice(0, length).trim()}…`
    : text;
};

const BlogList = () => {
  const [blogs, setBlogs] = useState([]);
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

  const fetchBlogs = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getPublishedBlogs({
        page,
        search: submittedSearch || undefined,
        limit: PAGE_SIZE,
      });

      setBlogs(data.blogs ?? []);

      setPagination(
        data.pagination ?? {
          page: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }
      );
    } catch (err) {
      console.error("Failed to load blogs:", err);
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, submittedSearch]);

  useEffect(() => {
    fetchBlogs();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [fetchBlogs]);

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
          Blog
        </p>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-medium text-navy leading-tight">
              Latest Articles
            </h1>

            <p className="mt-3 text-sm sm:text-base text-slate-muted leading-relaxed">
              Insights, guides and useful information to help you make
              better decisions.
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
              <div className="aspect-[16/10] bg-navy/5" />

              <div className="p-5">
                <div className="h-3 w-32 bg-navy/5 rounded mb-4" />
                <div className="h-5 w-4/5 bg-navy/5 rounded mb-3" />
                <div className="h-3 w-full bg-navy/5 rounded mb-2" />
                <div className="h-3 w-3/4 bg-navy/5 rounded mb-6" />
                <div className="h-9 w-24 bg-navy/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : blogs.length === 0 ? (
        /* Empty state */
        <div className="bg-white border border-navy/10 rounded-sm py-16 sm:py-20 px-6 text-center">
          <div className="max-w-md mx-auto">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-muted mb-3">
              No Results
            </p>

            <h2 className="text-xl sm:text-2xl text-navy font-medium">
              {submittedSearch
                ? "No articles found"
                : "No articles published yet"}
            </h2>

            <p className="text-sm text-slate-muted mt-3 leading-relaxed">
              {submittedSearch
                ? `We couldn't find any articles matching "${submittedSearch}".`
                : "Check back soon for new articles and updates."}
            </p>

            {submittedSearch && (
              <button
                onClick={handleClearSearch}
                className="btn-gold mt-6 px-5 py-2.5 text-sm"
              >
                View All Articles
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Blog Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {blogs.map((blog) => (
              <article
                key={blog._id}
                className="group bg-white border border-navy/10 rounded-sm overflow-hidden flex flex-col transition-all duration-200 hover:border-navy/20 hover:-translate-y-0.5"
              >
                {/* Image */}
                <Link
                  to={`/blogs/${blog.slug}`}
                  className="block aspect-[16/10] bg-navy/5 overflow-hidden"
                >
                  {blog.coverImage ? (
                    <img
                      src={blog.coverImage}
                      alt={blog.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-muted text-xs uppercase tracking-wide">
                      No Image
                    </div>
                  )}
                </Link>

                {/* Content */}
                <div className="p-5 sm:p-6 flex flex-col flex-1">
                  {/* Meta */}
                  <p className="text-xs text-slate-muted mb-3">
                    {formatDate(blog.publishedAt)}

                    {blog.author?.name && (
                      <>
                        <span className="mx-1.5">·</span>
                        {blog.author.name}
                      </>
                    )}
                  </p>

                  {/* Title */}
                  <Link to={`/blogs/${blog.slug}`}>
                    <h2 className="text-lg sm:text-xl font-medium text-navy leading-snug mb-3 group-hover:underline underline-offset-4">
                      {blog.title}
                    </h2>
                  </Link>

                  {/* Excerpt */}
                  <p className="text-sm text-slate-muted leading-relaxed mb-6 flex-1">
                    {excerptFrom(blog.body)}
                  </p>

                  {/* Action */}
                  <Link
                    to={`/blogs/${blog.slug}`}
                    className="btn-gold text-sm py-2 px-4 self-start"
                  >
                    Read More
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <nav
              className="flex items-center justify-between sm:justify-center gap-3 mt-10 sm:mt-12"
              aria-label="Blog pagination"
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
    </main>
  );
};

export default BlogList;


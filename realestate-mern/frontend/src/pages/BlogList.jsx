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

// strip HTML tags and trim to a short excerpt for the card
const excerptFrom = (html, length = 110) => {
  if (!html) return "";
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
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
  const [loading, setLoading] = useState(true);

  const fetchBlogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPublishedBlogs({ page, limit: PAGE_SIZE });
      setBlogs(data.blogs ?? []);
      setPagination(data.pagination ?? { page: 1, totalPages: 1 });
    } catch (err) {
      console.error("Failed to load blogs:", err);
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchBlogs();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [fetchBlogs]);

  const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="mb-12">
        <p className="eyebrow mb-2">Blog</p>
        <h1 className="text-3xl">Latest Articles</h1>
      </div>

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : blogs.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-20 text-center">
          <p className="text-slate-muted">No articles published yet — check back soon.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogs.map((b) => (
              <article
                key={b._id}
                className="bg-white border border-navy/10 rounded-sm overflow-hidden flex flex-col"
              >
                <div className="aspect-[16/10] bg-navy/5 overflow-hidden">
                  {b.coverImage ? (
                    <img
                      src={b.coverImage}
                      alt={b.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-muted text-xs uppercase tracking-wide">
                      No Image
                    </div>
                  )}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <p className="text-xs text-slate-muted mb-2">
                    {formatDate(b.publishedAt)}
                    {b.author?.name ? ` · ${b.author.name}` : ""}
                  </p>
                  <h2 className="text-lg font-medium text-navy mb-2 leading-snug">
                    {b.title}
                  </h2>
                  <p className="text-sm text-slate-muted mb-5 flex-1">
                    {excerptFrom(b.body)}
                  </p>
                  <Link
                    to={`/blog/${b.slug}`}
                    className="btn-gold text-sm py-2 px-4 self-start"
                  >
                    Read More
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-12">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={!pagination.hasPreviousPage}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-navy px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={!pagination.hasNextPage}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BlogList;
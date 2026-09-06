import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { getAllBlogs, deleteBlog } from "../../services/blogService";
import { imageUrl } from "../../utils/format";

const statusBadge = {
  published: "bg-sage-light text-sage",
  draft: "bg-brick-light text-brick",
};

const PAGE_SIZE = 10;

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const BlogManagement = () => {
  const [blogs, setBlogs] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [orderBy, setOrderBy] = useState(1); // 1 = date descending, 2 = date ascending

  const fetchBlogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllBlogs({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        orderBy: orderBy || undefined,
      });
      setBlogs(data.blogs ?? []);
      setPagination(data.pagination ?? { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      console.error("Failed to load blogs:", err);
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, orderBy, search, statusFilter]);

  useEffect(() => {
    fetchBlogs();
  }, [fetchBlogs]);

  // reset to page 1 whenever search or filter changes
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await deleteBlog(id);
      // if we deleted the last item on this page, step back a page
      if (blogs.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchBlogs();
      }
    } catch (err) {
      console.error("Failed to delete blog:", err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-2">Admin</p>
          <h1 className="text-3xl">Manage Blogs</h1>
        </div>
        <Link to="/dashboard/admin/blogs/create" className="btn-gold text-sm py-2.5 px-4">
          + Create Blog
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          placeholder="Search by title..."
          className="input-field max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          {["all", "published", "draft"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-sm px-3 py-1.5 rounded-sm border capitalize transition-colors ${
                statusFilter === s
                  ? "border-brass text-brass bg-brass/5"
                  : "border-navy/10 text-slate-muted hover:border-navy/20"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setOrderBy(1)}
            className={`text-sm px-3 py-1.5 rounded-sm border transition-colors ${
              orderBy === 1
                ? "border-brass text-brass bg-brass/5"
                : "border-navy/10 text-slate-muted hover:border-navy/20"
            }`}
          >
            Newest
          </button>
          <button
            onClick={() => setOrderBy(2)}
            className={`text-sm px-3 py-1.5 rounded-sm border transition-colors ${
              orderBy === 2
                ? "border-brass text-brass bg-brass/5"
                : "border-navy/10 text-slate-muted hover:border-navy/20"
            }`}
          >
            Oldest
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : blogs.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center">
          <p className="text-slate-muted">No blogs match your search yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3">Blog</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Published</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {blogs.map((b) => {
                  const blogImage = b.coverImage || b.image || b.media?.coverImage;
                  return (
                    <tr key={b._id} className="border-b border-navy/5 last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {blogImage ? (
                            <img
                              src={imageUrl(blogImage)}
                              className="w-12 h-12 rounded-sm object-cover border border-navy/10 flex-shrink-0"
                              alt={b.title}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-sm bg-navy/5 border border-navy/10 flex items-center justify-center text-slate-muted flex-shrink-0">
                              <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <span className="font-medium text-navy">{b.title}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`status-badge ${statusBadge[b.status] ?? statusBadge.draft}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-muted">{formatDate(b.publishedAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-3">
                          <Link
                            to={`/blogs/${b.slug}`}
                            className="text-white hover:underline bg-green-600 px-3 py-1.5 rounded-sm text-sm"
                          >
                            View
                          </Link>
                          <Link
                            to={`/dashboard/admin/blogs/${b._id}/edit`}
                            className="text-white hover:underline bg-blue-600 px-3 py-1.5 rounded-sm text-sm"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(b._id, b.title)}
                            className="text-white hover:underline bg-red-600 px-3 py-1.5 rounded-sm text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-5">
            <p className="text-xs text-slate-muted">
              Showing {(pagination.page - 1) * PAGE_SIZE + 1}–
              {Math.min(pagination.page * PAGE_SIZE, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
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
          </div>
        </>
      )}
    </div>
  );
};

export default BlogManagement;
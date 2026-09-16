import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getAdminReviews,
  replyToReview,
  setReviewVisibility,
  deleteReview,
} from "../../services/reviewService";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";

const PAGE_SIZE = 10;

const eligibilityLabel = {
  visit: "Completed visit",
  purchase: "Verified purchase",
};

const Stars = ({ rating }) => (
  <span className="text-brass text-sm">
    {"★".repeat(rating)}
    {"☆".repeat(5 - rating)}
  </span>
);

const ReviewManagement = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [pagination, setPagination] = useState({
    page: 1,
    pages: 1,
    total: 0,
    limit: PAGE_SIZE,
  });
  const [page, setPage] = useState(1);

  const [filters, setFilters] = useState({ rating: "", isVisible: "" });
  const [replyTarget, setReplyTarget] = useState(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminReviews({
        page,
        limit: PAGE_SIZE,
        rating: filters.rating || undefined,
        isVisible: filters.isVisible || undefined,
      });
      setReviews(data.reviews ?? []);
      setPagination(
        data.pagination ?? { page: 1, pages: 1, total: 0, limit: PAGE_SIZE },
      );
    } catch (err) {
      console.error("Failed to load reviews:", err);
      showToast(
        err.response?.data?.message ||
          "Failed to load reviews. Please try again.",
        "error",
      );
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters, showToast]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    setPage(1);
  }, [filters.rating, filters.isVisible]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleVisibility = async (review) => {
    setBusyId(review._id);
    try {
      const updated = await setReviewVisibility(
        review._id,
        !review.isVisible,
      );
      setReviews((prev) =>
        prev.map((r) => (r._id === review._id ? { ...r, ...updated } : r)),
      );
      showToast(
        updated.isVisible
          ? "Review is now visible to the public"
          : "Review hidden from the public",
      );
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to update visibility",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (review) => {
    const confirmed = await confirm({
      title: "Delete this review?",
      message:
        "This permanently removes the review and any admin reply attached to it. This cannot be undone.",
      confirmLabel: "Yes, delete it",
      cancelLabel: "No, go back",
    });
    if (!confirmed) return;

    setBusyId(review._id);
    try {
      await deleteReview(review._id);
      showToast("Review deleted");
      await fetchReviews();
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to delete review",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReplySaved = (updated) => {
    setReviews((prev) =>
      prev.map((r) => (r._id === updated._id ? { ...r, ...updated } : r)),
    );
    setReplyTarget(null);
    showToast("Reply posted");
  };

  const goToPage = (newPage) => {
    if (newPage < 1 || newPage > pagination.pages) return;
    setPage(newPage);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-2">Admin</p>
          <h1 className="text-3xl">Review Dashboard</h1>
          <p className="text-sm text-slate-muted mt-1">
            View every review, reply on behalf of the platform, and toggle
            what's shown publicly.
          </p>
        </div>
        <div className="text-sm text-slate-muted">
          {pagination.total} total reviews
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <select
          value={filters.rating}
          onChange={(e) => handleFilterChange("rating", e.target.value)}
          className="input-field lg:max-w-xs"
        >
          <option value="">All Ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} star{r !== 1 ? "s" : ""}
            </option>
          ))}
        </select>

        <select
          value={filters.isVisible}
          onChange={(e) => handleFilterChange("isVisible", e.target.value)}
          className="input-field lg:max-w-xs"
        >
          <option value="">All Visibility</option>
          <option value="true">Visible</option>
          <option value="false">Hidden</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted py-10 text-center">
          Loading reviews...
        </p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-slate-muted py-10 text-center">
          No reviews match these filters.
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {reviews.map((r) => (
              <div
                key={r._id}
                className="border border-navy/10 rounded-sm p-5 bg-white"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-navy">
                      {r.user?.name || "Anonymous"}{" "}
                      <span className="text-xs font-normal text-slate-muted">
                        {r.user?.email}
                      </span>
                    </p>
                    <p className="text-xs text-slate-muted mt-0.5">
                      on{" "}
                      {r.property ? (
                        <Link
                          to={`/properties/${r.property.slug || r.property._id}`}
                          target="_blank"
                          className="text-navy underline"
                        >
                          {r.property.title}
                        </Link>
                      ) : (
                        "a deleted property"
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Stars rating={r.rating} />
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        r.isVisible
                          ? "bg-sage-light text-sage"
                          : "bg-slate-muted/10 text-slate-muted"
                      }`}
                    >
                      {r.isVisible ? "Visible" : "Hidden"}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-ink leading-relaxed mb-2">
                  {r.comment}
                </p>

                <p className="text-[11px] text-slate-muted mb-3">
                  Eligible via{" "}
                  {eligibilityLabel[r.eligibility] || r.eligibility} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString()}
                </p>

                {r.adminReply?.text && (
                  <div className="mb-3 ml-4 pl-4 border-l-2 border-brass/40">
                    <p className="text-xs font-semibold text-navy mb-1">
                      Reply from {r.adminReply.repliedBy?.name || "Admin"}
                    </p>
                    <p className="text-sm text-slate-ink leading-relaxed">
                      {r.adminReply.text}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReplyTarget(r)}
                    disabled={busyId === r._id}
                    className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-navy hover:border-navy/20 disabled:opacity-40"
                  >
                    {r.adminReply?.text ? "Edit reply" : "Reply"}
                  </button>

                  <button
                    onClick={() => handleToggleVisibility(r)}
                    disabled={busyId === r._id}
                    className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-navy hover:border-navy/20 disabled:opacity-40"
                  >
                    {r.isVisible ? "Hide" : "Unhide"}
                  </button>

                  <button
                    onClick={() => handleDelete(r)}
                    disabled={busyId === r._id}
                    className="text-sm px-3 py-1.5 rounded-sm border border-brick/20 text-brick hover:border-brick/40 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <p className="text-xs text-slate-muted">
              Showing{" "}
              {pagination.total === 0
                ? 0
                : (pagination.page - 1) * PAGE_SIZE + 1}
              –{Math.min(pagination.page * PAGE_SIZE, pagination.total)} of{" "}
              {pagination.total}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-navy px-2">
                {pagination.page} / {pagination.pages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= pagination.pages}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {replyTarget && (
        <ReplyModal
          review={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSaved={handleReplySaved}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Reply Modal                                                                 */
/* -------------------------------------------------------------------------- */

const ReplyModal = ({ review, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [text, setText] = useState(review.adminReply?.text || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const updated = await replyToReview(review._id, text.trim());
      onSaved(updated);
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to post reply",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-sm border border-navy/10 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy/10">
          <h2 className="text-lg text-navy font-medium">Reply to review</h2>
          <button
            onClick={onClose}
            className="text-slate-muted hover:text-navy text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5">
          <p className="text-sm text-slate-ink leading-relaxed mb-4 bg-parchment/40 border border-navy/10 rounded-sm p-3">
            "{review.comment}"
          </p>

          <label className="block text-xs uppercase tracking-wide text-slate-muted mb-2">
            Your reply
          </label>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a public reply..."
            className="input-field w-full resize-none"
            maxLength={1000}
          />

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !text.trim()}
              className="btn-gold text-sm py-1.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Posting..." : "Post Reply"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReviewManagement;

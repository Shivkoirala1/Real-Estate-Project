import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getAdminHeroSlides,
  deleteHeroSlide,
  reorderHeroSlides,
} from "../../services/heroSlideService";
import { useConfirm } from "../../context/ConfirmContext";
import { useToast } from "../../context/ToastContext";

const stateBadge = {
  active: "bg-sage-light text-sage",
  scheduled: "bg-brass/15 text-brass-dark",
  expired: "bg-navy/10 text-slate-muted",
  draft: "bg-brick-light text-brick",
};

const PAGE_SIZE = 20;

const ManageHeroSlides = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [slides, setSlides] = useState([]);
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
  // Numeric ordering (locked decision 3): edited inline, saved in one batch.
  const [orders, setOrders] = useState({});
  const [savingOrder, setSavingOrder] = useState(false);

  const fetchSlides = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminHeroSlides({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setSlides(data.slides ?? []);
      setPagination(data.pagination ?? { page: 1, totalPages: 1, total: 0 });
      setOrders({});
    } catch (err) {
      console.error("Failed to load hero slides:", err);
      showToast(err?.response?.data?.message || "Failed to load hero slides", "error");
      setSlides([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, showToast]);

  useEffect(() => {
    fetchSlides();
  }, [fetchSlides]);

  // reset to page 1 whenever search or filter changes
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
  };

  const handleDelete = async (id, title) => {
    const ok = await confirm({
      title: `Delete "${title}"?`,
      message: "The slide and its uploaded media will be permanently removed. This can't be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteHeroSlide(id);
      showToast("Hero slide deleted", "success");
      if (slides.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchSlides();
      }
    } catch (err) {
      console.error("Failed to delete hero slide:", err);
      showToast(err?.response?.data?.message || "Failed to delete hero slide", "error");
    }
  };

  const handleSaveOrder = async () => {
    const entries = Object.entries(orders);
    if (entries.length === 0) {
      showToast("No order changes to save", "error");
      return;
    }
    setSavingOrder(true);
    try {
      await reorderHeroSlides(
        entries.map(([id, displayOrder]) => ({ id, displayOrder: Number(displayOrder) }))
      );
      showToast("Display order updated", "success");
      fetchSlides();
    } catch (err) {
      console.error("Failed to reorder hero slides:", err);
      showToast(err?.response?.data?.message || "Failed to update display order", "error");
    } finally {
      setSavingOrder(false);
    }
  };

  const orderDirty = Object.keys(orders).length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-2">Admin</p>
          <h1 className="text-3xl">Hero Slides</h1>
        </div>
        <Link to="/dashboard/admin/hero-slides/new" className="btn-gold text-sm py-2.5 px-4">
          + Add Hero Slide
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
      </div>

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : slides.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center">
          <p className="text-slate-muted">No hero slides yet. Add the first slide for the homepage carousel.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3">Preview</th>
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Media</th>
                  <th className="px-5 py-3">State</th>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slides.map((slide) => {
                  const thumb = slide.media?.thumbnailUrl || (slide.media?.type === "image" ? slide.media?.url : null);
                  return (
                    <tr key={slide._id} className="border-b border-navy/5 last:border-0">
                      <td className="px-5 py-3">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={slide.media?.altText || slide.title}
                            className="w-20 h-12 rounded-sm object-cover border border-navy/10"
                          />
                        ) : (
                          <div className="w-20 h-12 rounded-sm bg-navy/5 border border-navy/10 flex items-center justify-center text-slate-muted text-xs">
                            Video
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-navy">{slide.title}</span>
                        {slide.subtitle && (
                          <p className="text-xs text-slate-muted truncate max-w-56">{slide.subtitle}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-muted capitalize">{slide.media?.type}</td>
                      <td className="px-5 py-3">
                        <span className={`status-badge ${stateBadge[slide.effectiveState] ?? stateBadge.draft}`}>
                          {slide.effectiveState}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="number"
                          min="0"
                          className="input-field w-20"
                          value={orders[slide._id] ?? slide.displayOrder}
                          onChange={(e) =>
                            setOrders((prev) => ({ ...prev, [slide._id]: e.target.value }))
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-3">
                          <Link
                            to={`/dashboard/admin/hero-slides/${slide._id}/edit`}
                            className="text-white hover:underline bg-blue-600 px-3 py-1.5 rounded-sm text-sm"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(slide._id, slide.title)}
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

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-5">
            <p className="text-xs text-slate-muted">
              Showing {(pagination.page - 1) * PAGE_SIZE + 1}–
              {Math.min(pagination.page * PAGE_SIZE, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2 sm:ml-auto">
              <button
                onClick={handleSaveOrder}
                disabled={!orderDirty || savingOrder}
                className="btn-gold text-sm px-4 py-1.5 disabled:opacity-50"
              >
                {savingOrder ? "Saving..." : "Save order"}
              </button>
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

export default ManageHeroSlides;

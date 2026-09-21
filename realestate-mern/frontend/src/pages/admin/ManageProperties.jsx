import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  getProperties,
  getMyListings,
  updatePropertyStatus,
  endTenancy,
  requestEndTenancy,
  approveEndTenancy,
  declineEndTenancy,
  deleteProperty,
} from "../../services/propertyService";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import { formatPrice, statusStyles, imageUrl } from "../../utils/format";
import SearchFilterBar from "../../components/SearchFilterBar";

const statusLabels = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};
const STATUS_RANK = { available: 0, reserved: 1, sold: 2 };
const PAGE_SIZE = 10;
// This screen is for staff only — buyers manage nothing here.
const ALLOWED_ROLES = ["admin", "agent", "user"];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "all" },
  { value: "available", label: "available" },
  { value: "reserved", label: "reserved" },
  { value: "sold", label: "sold" },
];

const LISTING_FILTERS = {
  admin: [
    "propertyType",
    "province",
    "district",
    "minPrice",
    "maxPrice",
    "bedrooms",
    "bathrooms",
    "status",
    // "saleType",
  ],
  agent: [
    "propertyType",
    "province",
    "district",
    "minPrice",
    "maxPrice",
    "bedrooms",
    "bathrooms",
    "status",
    // "saleType",
  ],
  user: [],
};

const SORT_OPTIONS = [
  { value: "availability", label: "Availability" },
  { value: 1, label: "Newest" },
  { value: 2, label: "Oldest" },
];
// Rank for availability-first ordering (mirrors the backend `availability`
// sort: status ascending, then title A–Z).
const AVAILABILITY_RANK = { available: 0, reserved: 1, rented: 2, sold: 3 };

const ManageProperties = ({ showHeader = true }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter, sort, and pagination state matching ManageBlogs
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Default view: availability first (available on top), alphabetical
  // within each status.
  const [orderBy, setOrderBy] = useState("availability");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
    page: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const isAdmin = user?.role === "admin";
  const isAllowed = ALLOWED_ROLES.includes(user?.role);

  const load = async () => {
    if (!isAllowed) return;
    setLoading(true);
    try {
      if (isAdmin || user?.role === "agent") {
        const sortParam =
          orderBy === 2 || orderBy === "2"
            ? "oldest"
            : orderBy === "availability"
              ? "availability"
              : undefined; // 1 / "1" = newest (server default)
        const params = {
          page,
          limit: PAGE_SIZE,
          keyword: search.trim() || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          sort: sortParam,
        };

        const data = await getProperties(params);
        const fetchedProps = data.properties || [];
        // Canonical pagination envelope (B6: legacy flat total/pages/page removed).
        const pag = data.pagination || {};
        const totalDocs = pag.total ?? fetchedProps.length;
        const totalPagesCount =
          pag.totalPages ?? Math.ceil(totalDocs / PAGE_SIZE) ?? 1;

        setProperties(fetchedProps);
        setPagination({
          total: totalDocs,
          totalPages: totalPagesCount,
          page: pag.page || page,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPagesCount,
        });
      } else if (user?.role === "user") {
        // User: only their own listings.
        const data = await getMyListings();
        let rawList = Array.isArray(data) ? data : data.properties || [];

        if (search.trim()) {
          const q = search.toLowerCase();
          rawList = rawList.filter(
            (p) =>
              p.title?.toLowerCase().includes(q) ||
              p.description?.toLowerCase().includes(q),
          );
        }

        if (statusFilter !== "all") {
          rawList = rawList.filter((p) => p.status === statusFilter);
        }

        rawList.sort((a, b) => {
          if (orderBy === "availability") {
            const rankA = AVAILABILITY_RANK[a.status] ?? 4;
            const rankB = AVAILABILITY_RANK[b.status] ?? 4;
            if (rankA !== rankB) return rankA - rankB;
            return (a.title || "").localeCompare(b.title || "", "en", {
              sensitivity: "base",
            });
          }
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || 0);
          return orderBy === 2 || orderBy === "2" ? dateA - dateB : dateB - dateA;
        });

        const totalDocs = rawList.length;
        const totalPagesCount = Math.max(1, Math.ceil(totalDocs / PAGE_SIZE));
        const currentPage = Math.min(page, totalPagesCount);
        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const paginatedItems = rawList.slice(startIdx, startIdx + PAGE_SIZE);

        setProperties(paginatedItems);
        setPagination({
          total: totalDocs,
          totalPages: totalPagesCount,
          page: currentPage,
          hasPreviousPage: currentPage > 1,
          hasNextPage: currentPage < totalPagesCount,
        });
      }
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to fetch properties",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isAllowed, search, statusFilter, orderBy, page]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilterChange = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleOrderChange = (order) => {
    setOrderBy(order);
    setPage(1);
  };

  const handleFilterBarChange = (key, value) => {
    if (key === "keyword") handleSearchChange(value);
    else if (key === "status") handleStatusFilterChange(value);
    else if (key === "sort") handleOrderChange(value);
  };

  const goToPage = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  };

  const handleStatusChange = async (property, newStatus) => {
    if (newStatus === property.status) return;

    const confirmed = await confirm({
      title: "Update property status?",
      message: `Change "${property.title}" from ${statusLabels[property.status]} to ${statusLabels[newStatus]}? Once saved, buyers will immediately see the new status.`,
      confirmLabel: "Yes, update status",
      cancelLabel: "No, keep as is",
    });
    if (!confirmed) return;

    try {
      await updatePropertyStatus(property._id, newStatus);
      showToast("Property status updated");
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to update status",
        "error",
      );
    }
  };

  const handleEndTenancy = async (property) => {
    const confirmed = await confirm({
      title: "End tenancy?",
      message: `"${property.title}" will return to available and its current-occupancy details will be cleared. The verified rental record itself is kept as history.`,
      confirmLabel: "Yes, end tenancy",
      cancelLabel: "No, keep as is",
    });
    if (!confirmed) return;

    try {
      await endTenancy(property._id);
      showToast("Tenancy ended — property is available again");
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to end tenancy",
        "error",
      );
    }
  };

  // Owner-requested end of tenancy (admin approval). Reason is collected in
  // a small modal: optional when requesting, optional when declining.
  const [tenancyModal, setTenancyModal] = useState(null); // { mode: 'request'|'decline', property }
  const [tenancyReason, setTenancyReason] = useState("");
  const [tenancyBusy, setTenancyBusy] = useState(false);

  const openTenancyModal = (mode, property) => {
    setTenancyModal({ mode, property });
    setTenancyReason("");
  };

  const submitTenancyModal = async () => {
    if (!tenancyModal || tenancyBusy) return;
    const { mode, property } = tenancyModal;
    if (mode === "request") {
      const confirmed = await confirm({
        title: "Request end of tenancy?",
        message: `Your request is sent to the admin, who makes the final decision. Once submitted, you cannot reverse this request.`,
        confirmLabel: "Yes, send it",
        cancelLabel: "No, keep as is",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    setTenancyBusy(true);
    try {
      if (mode === "request") {
        await requestEndTenancy(property._id, tenancyReason.trim() || undefined);
        showToast("End-of-tenancy request sent to the admin");
      } else {
        await declineEndTenancy(property._id, tenancyReason.trim() || undefined);
        showToast("End-of-tenancy request declined — property stays rented");
      }
      setTenancyModal(null);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to submit — please try again",
        "error",
      );
    } finally {
      setTenancyBusy(false);
    }
  };

  const handleApproveEndTenancy = async (property) => {
    const confirmed = await confirm({
      title: "Approve end of tenancy?",
      message: `"${property.title}" will return to available and its current-occupancy details will be cleared. The verified rental record itself is kept as history.`,
      confirmLabel: "Yes, end tenancy",
      cancelLabel: "No, keep as is",
    });
    if (!confirmed) return;

    try {
      await approveEndTenancy(property._id);
      showToast("Tenancy ended — property is available again");
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to approve — please try again",
        "error",
      );
    }
  };

  const handleDelete = async (property) => {
    const confirmed = await confirm({
      title: "Delete this property?",
      message: `"${property.title}" will be permanently removed and this can't be undone.`,
      confirmLabel: "Yes, delete it",
      cancelLabel: "No, cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      await deleteProperty(property._id);
      showToast("Property deleted");
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to delete property",
        "error",
      );
    }
  };

  // Staff-only screen: bounce anyone else straight back out.
  if (!isAllowed) {
    return <Navigate to="/" replace />;
  }

  const newPath = isAdmin
    ? "/dashboard/admin/properties/new"
    : "/my-properties/new";
  const editPath = (id) =>
    isAdmin
      ? `/dashboard/admin/properties/${id}/edit`
      : `/my-properties/${id}/edit`;

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="eyebrow mb-2">Manage</p>
            <h1 className="text-3xl">
              {isAdmin || user?.role === "agent"
                ? "All Properties"
                : "My Properties"}
            </h1>
          </div>
          <Link to={newPath} className="btn-gold text-sm py-2.5 px-4">
            + Add Property
          </Link>
        </div>
      )}

      {/* Search, status, and sort — delegated to the shared filter bar in
          controlled mode so this page just owns plain state. */}
      <SearchFilterBar
        bare
        mode="controlled"
        className="mb-6"
        filters={
          user.role === "admin"
            ? LISTING_FILTERS.admin
            : user.role === "agent"
              ? LISTING_FILTERS.agent
              : LISTING_FILTERS.user
        }
        showKeyword
        keywordPlacement="toolbar"
        keywordPlaceholder="Search by title..."
        values={{ keyword: search, status: statusFilter, sort: orderBy }}
        onChange={handleFilterBarChange}
        statusOptions={STATUS_FILTER_OPTIONS}
        statusVariant="buttons"
        sortOptions={SORT_OPTIONS}
        sortVariant="buttons"
        showSubmitButton={false}
      />

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : properties.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center">
          <p className="text-slate-muted">
            No properties match your search yet.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3">Property</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr
                    key={p._id}
                    className="border-b border-navy/5 last:border-0"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={imageUrl(p.media?.coverImage)}
                          className="w-12 h-12 rounded-sm object-cover"
                          alt={p.title}
                        />
                        <span className="font-medium text-navy">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-medium text-navy">
                      {formatPrice(p.price, p.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {/* Reserved/sold chips carry help text - reserved means a
                            sale is filed and waiting for admin verification. */}
                        {(p.status === "reserved" || p.status === "sold") && (
                          <span
                            className={`status-badge whitespace-nowrap ${
                              p.status === "reserved"
                                ? "bg-brass/10 text-brass-dark"
                                : "bg-brick-light text-brick"
                            }`}
                            title={
                              p.status === "reserved"
                                ? "Reserved — sale pending verification"
                                : "Sold"
                            }
                          >
                            {statusLabels[p.status]}
                          </span>
                        )}
                        {p.status === "rented" && (
                          <span
                            className="status-badge whitespace-nowrap bg-navy/10 text-navy"
                            title="Rented — tenancy active. Only End Tenancy returns it to available."
                          >
                            Rented
                          </span>
                        )}
                        <select
                          value={p.status}
                          onChange={(e) => handleStatusChange(p, e.target.value)}
                          disabled={p.status === "sold" || p.status === "rented" || (user?.role === "agent" && p.listedBy?._id !== user._id)}
                          title={
                            p.status === "sold"
                              ? "Sold is final and cannot be changed"
                              : p.status === "rented"
                                ? "Rented — use End Tenancy to return it to available"
                                : p.status === "reserved"
                                  ? "Reserved — sale pending verification"
                                  : "Update status"
                          }
                          className="text-xs border border-navy/15 rounded-sm px-2 py-1.5 bg-white disabled:opacity-60 disabled:cursor-not-allowed font-medium"
                          style={{ color: statusStyles[p.status]?.bg }}
                        >
                          {Object.keys(statusLabels).map((key) => (
                            <option
                              key={key}
                              value={key}
                              disabled={STATUS_RANK[key] < STATUS_RANK[p.status]}
                            >
                              {statusLabels[key]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-3">
                        <Link
                          to={`/properties/${p.slug || p._id}`}
                          className="text-white hover:underline bg-green-600 px-3 py-1.5 rounded-sm text-sm"
                        >
                          View
                        </Link>
                        <Link
                          to={editPath(p._id)}
                          onClick={(e) => {
                            const cannotEdit =
                              p.status === "sold" ||
                              (user?.role === "agent" &&
                                p.listedBy?._id !== user._id);
                            if (cannotEdit) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          className={`text-white px-3 py-1.5 rounded-sm text-sm ${
                            p.status === "sold" ||
                            (user?.role === "agent" && p.listedBy?._id !== user._id)
                              ? "bg-blue-300 cursor-not-allowed"
                              : "bg-blue-600 hover:underline"
                          }`}
                        >
                          Edit
                        </Link>

                        <button
                          disabled={
                            p.status === "sold" ||
                            (user?.role === "agent" && p.listedBy?._id !== user._id)
                          }
                          onClick={() => handleDelete(p)}
                          className={`text-white px-3 py-1.5 rounded-sm text-sm ${
                            p.status === "sold" ||
                            (user?.role === "agent" && p.listedBy?._id !== user._id)
                              ? "bg-red-300 cursor-not-allowed"
                              : "bg-red-600 hover:underline"
                          }`}
                        >
                          Delete
                        </button>
                        {p.status === "rented" &&
                          (isAdmin ||
                            String(p.listedBy?._id || p.listedBy) === String(user?._id)) && (
                            <>
                              {p.tenancyEndRequestedAt ? (
                                <span
                                  className="status-badge whitespace-nowrap bg-brass/10 text-brass-dark"
                                  title={p.tenancyEndReason ? `Owner reason: ${p.tenancyEndReason}` : "End of tenancy requested — awaiting admin review"}
                                >
                                  End requested
                                </span>
                              ) : (
                                !isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => openTenancyModal("request", p)}
                                    className="btn-secondary text-sm px-3 py-1.5 whitespace-nowrap"
                                    title="Ask the admin to end this tenancy"
                                  >
                                    Request End of Tenancy
                                  </button>
                                )
                              )}
                              {isAdmin && p.tenancyEndRequestedAt && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveEndTenancy(p)}
                                    className="btn-gold text-sm px-3 py-1.5 whitespace-nowrap"
                                    title="Approve the owner's request and return this property to available"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openTenancyModal("decline", p)}
                                    className="text-sm px-3 py-1.5 whitespace-nowrap text-brick hover:underline"
                                    title="Decline the owner's request — the property stays rented"
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => handleEndTenancy(p)}
                                className="btn-gold text-sm px-3 py-1.5 whitespace-nowrap"
                                title="Return this property to available and clear its occupancy details"
                              >
                                End Tenancy
                              </button>
                            </>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-5">
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

      {tenancyModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/60" onClick={() => !tenancyBusy && setTenancyModal(null)} />
          <div className="relative bg-white rounded-sm shadow-lifted max-w-md w-full p-6">
            <h2 className="font-display text-xl text-navy mb-2">
              {tenancyModal.mode === "request" ? "Request end of tenancy?" : "Decline this request?"}
            </h2>
            <p className="text-sm text-slate-muted mb-4">
              {tenancyModal.mode === "request"
                ? "An optional note for the admin. Once submitted, you cannot reverse this request."
                : "An optional note for the owner. The property stays rented."}
            </p>
            <label className="label-field" htmlFor="tenancy-reason">Reason (optional)</label>
            <textarea
              id="tenancy-reason"
              rows={3}
              value={tenancyReason}
              onChange={(e) => setTenancyReason(e.target.value)}
              placeholder={tenancyModal.mode === "request" ? "Why should this tenancy end?" : "Why is this request being declined?"}
              className="input-field w-full resize-none"
              maxLength={1000}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setTenancyModal(null)}
                disabled={tenancyBusy}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTenancyModal}
                disabled={tenancyBusy}
                className="btn-gold text-sm py-1.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {tenancyBusy
                  ? "Sending..."
                  : tenancyModal.mode === "request"
                    ? "Send request"
                    : "Decline request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageProperties;

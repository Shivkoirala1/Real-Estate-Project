import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  getProperties,
  getMyListings,
  updatePropertyStatus,
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
    "city",
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
    "city",
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
  { value: 1, label: "Newest" },
  { value: 2, label: "Oldest" },
];

const ManageProperties = ({ showHeader = true }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter, sort, and pagination state matching ManageBlogs
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderBy, setOrderBy] = useState(1); // 1 = Newest, 2 = Oldest
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
        const params = {
          page,
          limit: PAGE_SIZE,
          keyword: search.trim() || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          sort: orderBy === 2 ? "oldest" : undefined,
        };

        const data = await getProperties(params);
        const fetchedProps = data.properties || [];
        const totalDocs = data.total ?? fetchedProps.length;
        const totalPagesCount =
          data.pages ?? Math.ceil(totalDocs / PAGE_SIZE) ?? 1;

        setProperties(fetchedProps);
        setPagination({
          total: totalDocs,
          totalPages: totalPagesCount,
          page: data.page || page,
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
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || 0);
          return orderBy === 1 ? dateB - dateA : dateA - dateB;
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
    else if (key === "sort") handleOrderChange(Number(value));
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
                        <select
                          value={p.status}
                          onChange={(e) => handleStatusChange(p, e.target.value)}
                          disabled={p.status === "sold" || (user?.role === "agent" && p.listedBy._id !== user._id)}
                          title={
                            p.status === "sold"
                              ? "Sold is final and cannot be changed"
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
                                p.listedBy._id !== user._id);
                            if (cannotEdit) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          className={`text-white px-3 py-1.5 rounded-sm text-sm ${
                            p.status === "sold" ||
                            (user?.role === "agent" && p.listedBy._id !== user._id)
                              ? "bg-blue-300 cursor-not-allowed"
                              : "bg-blue-600 hover:underline"
                          }`}
                        >
                          Edit
                        </Link>

                        <button
                          disabled={
                            p.status === "sold" ||
                            (user?.role === "agent" && p.listedBy._id !== user._id)
                          }
                          onClick={() => handleDelete(p)}
className={`text-white px-3 py-1.5 rounded-sm text-sm ${
                            p.status === "sold" ||
                            (user?.role === "agent" && p.listedBy._id !== user._id)
                              ? "bg-red-300 cursor-not-allowed"
                              : "bg-red-600 hover:underline"
                          }`}
                        >                        
                          Delete
                        </button>
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
    </div>
  );
};

export default ManageProperties;

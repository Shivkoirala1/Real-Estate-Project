
import { useState, useEffect, useCallback } from "react";
import {
  getVisits,
  updateVisit,
} from "../../services/visitService";

import {getUsers} from "../../services/userService";

const PAGE_SIZE = 10;

const statusBadge = {
  pending_agent_review: "bg-brass/10 text-brass",
  confirmed: "bg-sage-light text-sage",
  rejected: "bg-brick-light text-brick",
  completed: "bg-sage-light text-sage",
  cancelled: "bg-slate-muted/10 text-slate-muted",
};

const statusLabel = {
  pending_agent_review: "Pending Review",
  confirmed: "Confirmed",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
};

const formatDate = (dateStr) => {
  if (!dateStr) return "—";

  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const Visits = () => {
  const [visits, setVisits] = useState([]);
 
  const [agents, setAgents] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    pages: 1,
    total: 0,
    limit: PAGE_SIZE,
  });

  const [filters, setFilters] = useState({
    status: "",
    assignedAgent: "",
    visitType: "",
  });

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [activeVisit, setActiveVisit] = useState(null);
  const [modal, setModal] = useState(null);

  const fetchVisits = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getVisits({
        page,
        limit: PAGE_SIZE,
        status: filters.status || undefined,
        assignedAgent: filters.assignedAgent || undefined,
        visitType: filters.visitType || undefined,
      });

      setVisits(data.visits ?? []);
      setPagination(
        data.pagination ?? {
          page: 1,
          pages: 1,
          total: 0,
          limit: PAGE_SIZE,
        }
      );
    } catch (err) {
      console.error("Failed to load visits:", err);
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await getUsers({ role: "agent" });
      setAgents(data.users ??[]);
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  }, []);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.assignedAgent, filters.visitType]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleUpdate = async (id, payload) => {
    try {
      await updateVisit(id, payload);

      closeModal();
      await fetchVisits();
    } catch (err) {
      console.error("Failed to update visit:", err);
    }
  };

  const handleApprove = async (visit) => {
    await handleUpdate(visit._id, {
      status: "confirmed",
    });
  };

  const handleReject = async (visit) => {
    if (
      !window.confirm(
        "Reject this visit request? The buyer will be notified."
      )
    ) {
      return;
    }

    await handleUpdate(visit._id, {
      status: "rejected",
    });
  };

  const handleAssign = async (agentId) => {
    if (!activeVisit) return;

    await handleUpdate(activeVisit._id, {
      assignedAgent: agentId,
    });
  };

  const handleReschedule = async (requestedSlot) => {
    if (!activeVisit) return;

    await handleUpdate(activeVisit._id, {
      requestedSlot,
    });
  };

  const handleNotes = async (internalNotes) => {
    if (!activeVisit) return;

    await handleUpdate(activeVisit._id, {
      internalNotes,
    });
  };

  const openModal = (type, visit) => {
    setActiveVisit(visit);
    setModal(type);
  };

  const closeModal = () => {
    setActiveVisit(null);
    setModal(null);
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

          <h1 className="text-3xl">
            Visit Queue
          </h1>

          <p className="text-sm text-slate-muted mt-1">
            Review, assign and coordinate buyer visits.
          </p>
        </div>

        <div className="text-sm text-slate-muted">
          {pagination.total} total requests
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) =>
            handleFilterChange("status", e.target.value)
          }
          className="input-field lg:max-w-xs"
        >
          <option value="">All Statuses</option>

          <option value="pending_agent_review">
            Pending Review
          </option>

          <option value="confirmed">
            Confirmed
          </option>

          <option value="rejected">
            Rejected
          </option>

          <option value="completed">
            Completed
          </option>

          <option value="cancelled">
            Cancelled
          </option>
        </select>

        {/* Visit Type */}
        <select
          value={filters.visitType}
          onChange={(e) =>
            handleFilterChange("visitType", e.target.value)
          }
          className="input-field lg:max-w-xs"
        >
          <option value="">All Visit Types</option>

          <option value="property">
            Property Site Visit
          </option>

          <option value="office">
            Office Consultation
          </option>
        </select>

        {/* Agent */}
        <select
          value={filters.assignedAgent}
          onChange={(e) =>
            handleFilterChange(
              "assignedAgent",
              e.target.value
            )
          }
          className="input-field lg:max-w-xs"
        >
          <option value="">All Agents</option>

          {agents.map((agent) => (
            <option key={agent._id} value={agent._id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-slate-muted">
          Loading visits...
        </p>
      ) : visits.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center">
          <p className="text-slate-muted">
            No visit requests match your filters.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3">
                    Buyer
                  </th>

                  <th className="px-5 py-3">
                    Visit
                  </th>

                  <th className="px-5 py-3">
                    Requested Slot
                  </th>

                  <th className="px-5 py-3">
                    Agent
                  </th>

                  <th className="px-5 py-3">
                    Status
                  </th>

                  <th className="px-5 py-3">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {visits.map((visit) => (
                  <tr
                    key={visit._id}
                    className="border-b border-navy/5 last:border-0"
                  >
                    {/* Buyer */}
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-navy">
                          {visit.requestedBy?.name ||
                            "Unknown Buyer"}
                        </p>

                        <p className="text-xs text-slate-muted mt-0.5">
                          {visit.requestedBy?.email || "—"}
                        </p>
                      </div>
                    </td>

                    {/* Visit */}
                    <td className="px-5 py-4">
                      <div className="max-w-xs">
                        <p className="font-medium text-navy">
                          {visit.visitType === "office"
                            ? "Office Consultation"
                            : "Property Site Visit"}
                        </p>

                        {visit.property ? (
                          <p className="text-xs text-slate-muted mt-1 truncate">
                            {visit.property.title}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-muted mt-1">
                            General office consultation
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Slot */}
                    <td className="px-5 py-4 text-slate-muted whitespace-nowrap">
                      {formatDate(
                        visit.requestedSlot
                      )}
                    </td>

                    {/* Agent */}
                    <td className="px-5 py-4">
                      {visit.assignedAgent ? (
                        <span className="text-navy">
                          {visit.assignedAgent.name}
                        </span>
                      ) : (
                        <span className="text-slate-muted">
                          Unassigned
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <span
                        className={`status-badge ${
                          statusBadge[visit.status] ??
                          "bg-navy/5 text-slate-muted"
                        }`}
                      >
                        {statusLabel[visit.status] ??
                          visit.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2 min-w-[280px]">
                        {visit.status ===
                          "pending_agent_review" && (
                          <>
                            <button
                              onClick={() =>
                                handleApprove(visit)
                              }
                              className="text-white bg-sage hover:opacity-90 px-3 py-1.5 rounded-sm text-xs transition-opacity"
                            >
                              Approve
                            </button>

                            <button
                              onClick={() =>
                                handleReject(visit)
                              }
                              className="text-white bg-brick hover:opacity-90 px-3 py-1.5 rounded-sm text-xs transition-opacity"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        <button
                        disabled={visit.status === "completed" || visit.status === "cancelled"}
                          onClick={() =>
                            openModal("assign", visit)
                          }
                          className="disabled:opacity-40 disabled:cursor-not-allowed text-navy border border-navy/10 hover:border-brass hover:text-brass px-3 py-1.5 rounded-sm text-xs transition-colors"
                        >
                          Assign Agent
                        </button>

                        <button
                          disabled={visit.status === "completed" || visit.status === "cancelled"}
                          onClick={() =>
                            openModal(
                              "reschedule",
                              visit
                            )
                          }
                          className="disabled:opacity-40 disabled:cursor-not-allowed text-navy border border-navy/10 hover:border-brass hover:text-brass px-3 py-1.5 rounded-sm text-xs transition-colors"
                        >
                          Reschedule
                        </button>

                        <button
                            disabled={visit.status === "completed" || visit.status === "cancelled"}
                          onClick={() =>
                            openModal("notes", visit)
                          }
                          className="disabled:opacity-40 disabled:cursor-not-allowed text-navy border border-navy/10 hover:border-brass hover:text-brass px-3 py-1.5 rounded-sm text-xs transition-colors"
                        >
                          Notes
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
                : (pagination.page - 1) *
                    PAGE_SIZE +
                  1}
              –
              {Math.min(
                pagination.page * PAGE_SIZE,
                pagination.total
              )}{" "}
              of {pagination.total}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  goToPage(page - 1)
                }
                disabled={page <= 1}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <span className="text-sm text-navy px-2">
                {pagination.page} /{" "}
                {pagination.pages}
              </span>

              <button
                onClick={() =>
                  goToPage(page + 1)
                }
                disabled={
                  page >= pagination.pages
                }
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Assign Agent Modal */}
      {modal === "assign" && (
        <AssignAgentModal
          visit={activeVisit}
          agents={agents}
          onClose={closeModal}
          onAssign={handleAssign}
        />
      )}

      {/* Reschedule Modal */}
      {modal === "reschedule" && (
        <RescheduleModal
          visit={activeVisit}
          onClose={closeModal}
          onReschedule={handleReschedule}
        />
      )}

      {/* Internal Notes Modal */}
      {modal === "notes" && (
        <InternalNotesModal
          visit={activeVisit}
          onClose={closeModal}
          onSave={handleNotes}
        />
      )}
    </div>
  );
};


/* -------------------------------------------------------------------------- */
/* Assign Agent Modal                                                         */
/* -------------------------------------------------------------------------- */

const AssignAgentModal = ({
  visit,
  agents,
  onClose,
  onAssign,
}) => {
  const [agentId, setAgentId] = useState(
    visit?.assignedAgent?._id || ""
  );

  return (
    <Modal
      title="Assign Agent"
      onClose={onClose}
    >
      <p className="text-sm text-slate-muted mb-4">
        Select an agent to handle this visit.
      </p>

      <select
        value={agentId}
        onChange={(e) =>
          setAgentId(e.target.value)
        }
        className="input-field w-full"
      >
        <option value="">
          Select an agent
        </option>

        {agents.map((agent) => (
          <option
            key={agent._id}
            value={agent._id}
          >
            {agent.name}
          </option>
        ))}
      </select>

      <ModalActions
        onClose={onClose}
        onSubmit={() => onAssign(agentId)}
        submitText="Assign Agent"
        disabled={!agentId}
      />
    </Modal>
  );
};


/* -------------------------------------------------------------------------- */
/* Reschedule Modal                                                           */
/* -------------------------------------------------------------------------- */

const RescheduleModal = ({
  visit,
  onClose,
  onReschedule,
}) => {
  const [slot, setSlot] = useState(() => {
    if (!visit?.requestedSlot) return "";

    const date = new Date(
      visit.requestedSlot
    );

    const offset =
      date.getTimezoneOffset() * 60000;

    return new Date(
      date.getTime() - offset
    )
      .toISOString()
      .slice(0, 16);
  });

  return (
    <Modal
      title="Reschedule Visit"
      onClose={onClose}
    >
      <p className="text-sm text-slate-muted mb-4">
        Choose a new date and time for this
        {visit?.visitType === "office"
          ? " consultation."
          : " site visit."}
      </p>

      <label className="block text-xs uppercase tracking-wide text-slate-muted mb-2">
        New Date & Time
      </label>

      <input
        type="datetime-local"
        value={slot}
        min={new Date()
          .toISOString()
          .slice(0, 16)}
        onChange={(e) =>
          setSlot(e.target.value)
        }
        className="input-field w-full"
      />

      <ModalActions
        onClose={onClose}
        onSubmit={() => onReschedule(slot)}
        submitText="Reschedule"
        disabled={!slot}
      />
    </Modal>
  );
};


/* -------------------------------------------------------------------------- */
/* Internal Notes Modal                                                       */
/* -------------------------------------------------------------------------- */

const InternalNotesModal = ({
  visit,
  onClose,
  onSave,
}) => {
  const [notes, setNotes] = useState(
    visit?.internalNotes || ""
  );

  return (
    <Modal
      title="Internal Notes"
      onClose={onClose}
    >
      <div className="bg-brick-light/50 border border-brick/10 rounded-sm p-3 mb-4">
        <p className="text-xs text-brick">
          These notes are internal and will not be
          shown to the buyer.
        </p>
      </div>

      <label className="block text-xs uppercase tracking-wide text-slate-muted mb-2">
        Notes
      </label>

      <textarea
        rows={6}
        value={notes}
        onChange={(e) =>
          setNotes(e.target.value)
        }
        placeholder="Add coordination notes for admins and agents..."
        className="input-field w-full resize-none"
      />

      <ModalActions
        onClose={onClose}
        onSubmit={() => onSave(notes)}
        submitText="Save Notes"
      />
    </Modal>
  );
};


/* -------------------------------------------------------------------------- */
/* Generic Modal                                                              */
/* -------------------------------------------------------------------------- */

const Modal = ({
  title,
  children,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-sm border border-navy/10 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy/10">
          <h2 className="text-lg text-navy font-medium">
            {title}
          </h2>

          <button
            onClick={onClose}
            className="text-slate-muted hover:text-navy text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5">
          {children}
        </div>
      </div>
    </div>
  );
};


/* -------------------------------------------------------------------------- */
/* Modal Actions                                                              */
/* -------------------------------------------------------------------------- */

const ModalActions = ({
  onClose,
  onSubmit,
  submitText,
  disabled = false,
}) => {
  return (
    <div className="flex justify-end gap-2 mt-6">
      <button
        onClick={onClose}
        className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20"
      >
        Cancel
      </button>

      <button
        onClick={onSubmit}
        disabled={disabled}
        className="btn-gold text-sm py-1.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitText}
      </button>
    </div>
  );
};

export default Visits;

import api from "../utils/axios";

// Backend-supported categories (InnovationIdea.category enum). No category
// filtering in V1 — this list only feeds the submit form + card labels.
export const INNOVATION_CATEGORIES = [
  "housing",
  "construction",
  "sustainability",
  "smart-home",
  "financing",
  "community",
  "other",
];

// smart-home -> Smart Home
export const formatInnovationCategory = (value) => {
  if (!value) return "";
  return String(value)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

// GET /api/innovations/public?q=&page=&limit=  (public — visible only)
export const getPublicInnovations = async ({ q, page = 1, limit = 12 } = {}) => {
  const { data } = await api.get("/innovations/public", {
    params: { q, page, limit },
  });
  return data; // { innovations, pagination }
};

// GET /api/innovations/mine?q=&page=&limit=  (owner — visible + hidden)
export const getMyInnovations = async ({ q, page = 1, limit = 12 } = {}) => {
  const { data } = await api.get("/innovations/mine", {
    params: { q, page, limit },
  });
  return data; // { innovations, pagination }
};

// GET /api/innovations/admin?q=&visibility=&page=&limit=  (admin — all)
export const getAdminInnovations = async ({ q, visibility = "all", page = 1, limit = 20 } = {}) => {
  const { data } = await api.get("/innovations/admin", {
    params: { q, visibility, page, limit },
  });
  return data; // { innovations, pagination }
};

// POST /api/innovations
// Direct flow only (JSON, no bytes): media arrives as authorized uploadIds
// from the innovation upload session. Never isVisible/submittedBy — the
// backend owns both.
export const createInnovation = async ({
  title,
  category,
  description,
  uploadSessionId,
  imageUploadIds,
  videoUploadId,
}) => {
  const { data } = await api.post("/innovations", {
    title,
    category,
    description,
    uploadSessionId,
    imageUploadIds,
    videoUploadId,
  });
  return data; // { message, innovation }
};

// PUT /api/innovations/:id
// Keep-list semantics: keepImageUrls (retained existing URLs) +
// imageUploadIds (new uploads) + videoUploadId (replacement) / removeVideo.
export const updateInnovation = async (
  id,
  {
    title,
    category,
    description,
    uploadSessionId,
    imageUploadIds,
    videoUploadId,
    keepImageUrls,
    keepVideoUrl,
    removeVideo,
  }
) => {
  const { data } = await api.put(`/innovations/${id}`, {
    title,
    category,
    description,
    uploadSessionId,
    imageUploadIds,
    videoUploadId,
    keepImageUrls,
    keepVideoUrl,
    removeVideo,
  });
  return data; // { message, innovation }
};

// DELETE /api/innovations/:id
export const deleteInnovation = async (id) => {
  const { data } = await api.delete(`/innovations/${id}`);
  return data; // { message }
};

// PATCH /api/innovations/:id/visibility  (admin — hide/show)
export const toggleInnovationVisibility = async (id, isVisible) => {
  const { data } = await api.patch(`/innovations/${id}/visibility`, {
    isVisible,
  });
  return data; // { message, innovation }
};

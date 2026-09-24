import api, { multipartConfig } from "../utils/axios";

// Public carousel feed — only currently eligible slides, display order.
// GET /api/hero-slides
export const getHeroSlides = async () => {
  const { data } = await api.get("/hero-slides");
  return data; // { slides, count }
};

// GET /api/hero-slides/admin?page=&limit=&status=&search= (admin)
export const getAdminHeroSlides = async ({ page = 1, limit = 20, status, search } = {}) => {
  const { data } = await api.get("/hero-slides/admin", {
    params: { page, limit, status, search },
  });
  return data; // { slides, pagination }
};

// GET /api/hero-slides/:id (admin)
export const getHeroSlideById = async (id) => {
  const { data } = await api.get(`/hero-slides/${id}`);
  return data; // { slide }
};

// POST /api/hero-slides
// - Object with File media/thumbnail (or FormData): legacy flow via Cloudinary middleware
// - Object with uploadIds: direct flow (JSON, no bytes)
export const createHeroSlide = async (body) => {
  if (body instanceof FormData) {
    const { data } = await api.post("/hero-slides", body, multipartConfig());
    return data; // { message, slide }
  }
  if (body.media instanceof File || body.thumbnail instanceof File) {
    const formData = new FormData();
    formData.append("title", body.title);
    if (body.subtitle !== undefined) formData.append("subtitle", body.subtitle ?? "");
    if (body.description !== undefined) formData.append("description", body.description ?? "");
    if (body.altText !== undefined) formData.append("altText", body.altText ?? "");
    if (body.mediaType) formData.append("mediaType", body.mediaType);
    if (body.media) formData.append("media", body.media);
    if (body.thumbnail) formData.append("thumbnail", body.thumbnail);
    if (body.ctaEnabled !== undefined) formData.append("ctaEnabled", String(body.ctaEnabled));
    if (body.ctaLabel !== undefined) formData.append("ctaLabel", body.ctaLabel ?? "");
    if (body.ctaActionType) formData.append("ctaActionType", body.ctaActionType);
    if (body.ctaActionValue !== undefined) formData.append("ctaActionValue", body.ctaActionValue ?? "");
    if (body.startAt !== undefined) formData.append("startAt", body.startAt ?? "");
    if (body.endAt !== undefined) formData.append("endAt", body.endAt ?? "");
    if (body.displayOrder !== undefined && body.displayOrder !== "") formData.append("displayOrder", body.displayOrder);
    if (body.duration !== undefined && body.duration !== "") formData.append("duration", body.duration);
    formData.append("status", body.status || "draft");
    const { data } = await api.post("/hero-slides", formData, multipartConfig());
    return data; // { message, slide }
  }
  const {
    title,
    subtitle,
    description,
    altText,
    mediaType,
    mediaUploadId,
    thumbnailUploadId,
    uploadSessionId,
    clientStats,
    ctaEnabled,
    ctaLabel,
    ctaActionType,
    ctaActionValue,
    startAt,
    endAt,
    displayOrder,
    duration,
    status,
  } = body;
  const { data } = await api.post("/hero-slides", {
    title,
    subtitle,
    description,
    altText,
    mediaType,
    mediaUploadId,
    thumbnailUploadId,
    uploadSessionId,
    clientStats,
    ctaEnabled,
    ctaLabel,
    ctaActionType,
    ctaActionValue,
    startAt,
    endAt,
    displayOrder,
    duration,
    status,
  });
  return data; // { message, slide }
};

// PUT /api/hero-slides/:id
// - Object with File media/thumbnail (or FormData): legacy flow (files only when changed)
// - Object with uploadIds/scalars: direct flow (JSON, no bytes)
export const updateHeroSlide = async (id, fields = {}) => {
  if (fields instanceof FormData) {
    const { data } = await api.put(`/hero-slides/${id}`, fields, multipartConfig());
    return data; // { message, slide }
  }
  if (fields.media instanceof File || fields.thumbnail instanceof File) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      if ((key === "media" || key === "thumbnail") && !(value instanceof File)) continue;
      formData.append(key, value instanceof File ? value : String(value));
    }
    const { data } = await api.put(`/hero-slides/${id}`, formData, multipartConfig());
    return data; // { message, slide }
  }
  const { data } = await api.put(`/hero-slides/${id}`, fields);
  return data; // { message, slide }
};

// PUT /api/hero-slides/reorder { order: [{ id, displayOrder }] } (admin)
export const reorderHeroSlides = async (order) => {
  const { data } = await api.put("/hero-slides/reorder", { order });
  return data; // { message, slides }
};

// DELETE /api/hero-slides/:id (admin)
export const deleteHeroSlide = async (id) => {
  const { data } = await api.delete(`/hero-slides/${id}`);
  return data; // { message }
};

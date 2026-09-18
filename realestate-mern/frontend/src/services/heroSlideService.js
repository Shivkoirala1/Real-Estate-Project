import api from "../utils/axios";

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

// POST /api/hero-slides (multipart — media/thumbnail go through Cloudinary middleware)
export const createHeroSlide = async ({
  title,
  subtitle,
  description,
  altText,
  mediaType,
  media,
  thumbnail,
  ctaEnabled,
  ctaLabel,
  ctaActionType,
  ctaActionValue,
  startAt,
  endAt,
  displayOrder,
  duration,
  status,
}) => {
  const formData = new FormData();
  formData.append("title", title);
  if (subtitle !== undefined) formData.append("subtitle", subtitle ?? "");
  if (description !== undefined) formData.append("description", description ?? "");
  if (altText !== undefined) formData.append("altText", altText ?? "");
  if (mediaType) formData.append("mediaType", mediaType);
  if (media) formData.append("media", media);
  if (thumbnail) formData.append("thumbnail", thumbnail);
  if (ctaEnabled !== undefined) formData.append("ctaEnabled", String(ctaEnabled));
  if (ctaLabel !== undefined) formData.append("ctaLabel", ctaLabel ?? "");
  if (ctaActionType) formData.append("ctaActionType", ctaActionType);
  if (ctaActionValue !== undefined) formData.append("ctaActionValue", ctaActionValue ?? "");
  if (startAt !== undefined) formData.append("startAt", startAt ?? "");
  if (endAt !== undefined) formData.append("endAt", endAt ?? "");
  if (displayOrder !== undefined && displayOrder !== "") formData.append("displayOrder", displayOrder);
  if (duration !== undefined && duration !== "") formData.append("duration", duration);
  formData.append("status", status || "draft");

  const { data } = await api.post("/hero-slides", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { message, slide }
};

// PUT /api/hero-slides/:id (multipart — only send media/thumbnail if changed)
export const updateHeroSlide = async (id, fields = {}) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if ((key === "media" || key === "thumbnail") && !(value instanceof File)) continue;
    formData.append(key, value instanceof File ? value : String(value));
  }

  const { data } = await api.put(`/hero-slides/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
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

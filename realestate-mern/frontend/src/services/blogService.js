import api, { multipartConfig } from "../utils/axios";

// GET /api/blogs?page=&limit=&status=&search=  (admin — all blogs, any status)
export const getAllBlogs = async ({ page = 1, limit = 10, status, search, orderBy } = {}) => {
  const { data } = await api.get("/blogs", {
    params: { page, limit, status, search, orderBy },
  });
  return data; // { blogs, pagination }
};

// GET /api/blogs/published?page=&limit=  (public — published only)
export const getPublishedBlogs = async ({ page = 1, search, limit = 9 } = {}) => {
  const { data } = await api.get("/blogs/published", {
    params: { search, page, limit },
  });
  return data; // { blogs, pagination }
};

// GET /api/blogs/slug/:slug  
export const getBlogBySlug = async (slug) => {
  const { data } = await api.get(`/blogs/slug/${slug}`);
  return data; // blog
};

// GET /api/blogs/:id
export const getBlogById = async (id) => {
  const { data } = await api.get(`/blogs/${id}`);
  return data; // blog
};

// POST /api/blogs
// - coverImage as File: legacy flow (multipart via Cloudinary middleware)
// - coverUploadId: direct flow (JSON, no bytes)
export const createBlog = async ({ title, body, tags, status, coverImage, coverUploadId, uploadSessionId, clientStats }) => {
  if (coverImage instanceof File) {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("body", body);
    formData.append("status", status || "draft");
    if (tags) formData.append("tags", JSON.stringify(tags));
    if (coverImage) formData.append("coverImage", coverImage);

    const { data } = await api.post("/blogs", formData, multipartConfig());
    return data; // { message, blog }
  }
  const { data } = await api.post("/blogs", {
    title,
    body,
    status: status || "draft",
    tags,
    coverUploadId,
    uploadSessionId,
    clientStats,
  });
  return data; // { message, blog }
};

// PATCH /api/blogs/:id
// - coverImage as File: legacy flow (multipart, only when changed)
// - coverUploadId: direct flow (JSON, no bytes)
export const updateBlog = async (id, { title, body, tags, status, coverImage, coverUploadId, uploadSessionId, clientStats }) => {
  if (coverImage instanceof File) {
    const formData = new FormData();
    if (title !== undefined) formData.append("title", title);
    if (body !== undefined) formData.append("body", body);
    if (status !== undefined) formData.append("status", status);
    if (tags !== undefined) formData.append("tags", JSON.stringify(tags));
    if (coverImage) formData.append("coverImage", coverImage);

    const { data } = await api.patch(`/blogs/${id}`, formData, multipartConfig());
    return data; // { message, blog }
  }
  const { data } = await api.patch(`/blogs/${id}`, {
    title,
    body,
    status,
    tags,
    coverUploadId,
    uploadSessionId,
    clientStats,
  });
  return data; // { message, blog }
};

// DELETE /api/blogs/:id
export const deleteBlog = async (id) => {
  const { data } = await api.delete(`/blogs/${id}`);
  return data; // { message }
};
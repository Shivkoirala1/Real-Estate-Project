import api from "../api/axios";

// GET /api/blogs?page=&limit=&status=&search=  (admin — all blogs, any status)
export const getAllBlogs = async ({ page = 1, limit = 10, status, search } = {}) => {
  const { data } = await api.get("/blogs", {
    params: { page, limit, status, search },
  });
  return data; // { blogs, pagination }
};

// GET /api/blogs/published?page=&limit=  (public — published only)
export const getPublishedBlogs = async ({ page = 1, limit = 9 } = {}) => {
  const { data } = await api.get("/blogs/published", {
    params: { page, limit },
  });
  return data; // { blogs, pagination }
};

// GET /api/blogs/slug/:slug  (adjust path to match your route)
export const getBlogBySlug = async (slug) => {
  const { data } = await api.get(`/blogs/slug/${slug}`);
  return data; // blog
};

// GET /api/blogs/:id
export const getBlogById = async (id) => {
  const { data } = await api.get(`/blogs/${id}`);
  return data; // blog
};

// POST /api/blogs  (multipart — coverImage goes through Cloudinary middleware)
export const createBlog = async ({ title, body, tags, status, coverImage }) => {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("body", body);
  formData.append("status", status || "draft");
  if (tags) formData.append("tags", JSON.stringify(tags));
  if (coverImage) formData.append("coverImage", coverImage);

  const { data } = await api.post("/blogs", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { message, blog }
};

// PATCH /api/blogs/:id  (multipart — only send coverImage if it changed)
export const updateBlog = async (id, { title, body, tags, status, coverImage }) => {
  const formData = new FormData();
  if (title !== undefined) formData.append("title", title);
  if (body !== undefined) formData.append("body", body);
  if (status !== undefined) formData.append("status", status);
  if (tags !== undefined) formData.append("tags", JSON.stringify(tags));
  if (coverImage) formData.append("coverImage", coverImage);

  const { data } = await api.patch(`/blogs/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { message, blog }
};

// DELETE /api/blogs/:id
export const deleteBlog = async (id) => {
  const { data } = await api.delete(`/blogs/${id}`);
  return data; // { message }
};
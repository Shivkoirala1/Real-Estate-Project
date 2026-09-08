import api from "../utils/axios";

/**
 * Get properties
 * GET /api/properties
 *
 * Accepts either:
 * - an object of query params (e.g. { featured: true, limit: 6, page: 1 })
 * - a pre-built query string (e.g. "propertyType=abc&sort=price_low")
 *
 * Supported query parameters:
 * - keyword, saleType, propertyType, district, city
 * - minPrice, maxPrice, bedrooms, bathrooms
 * - featured, sort, page, limit
 */
export const getProperties = async (params = {}) => {
  if (typeof params === "string") {
    const { data } = await api.get(params ? `/properties?${params}` : "/properties");
    return data; // { properties, total, page, pages }
  }

  const { data } = await api.get("/properties", { params });
  return data; // { properties, total, page, pages }
};

/**
 * Get a single property with its similar listings
 * GET /api/properties/:id
 */
export const getPropertyById = async (id) => {
  const { data } = await api.get(`/properties/${id}`);
  return data; // { property, similarProperties }
};

/**
 * Toggle the authenticated user's favorite flag on a property
 * POST /api/properties/:id/favorite
 */
export const toggleFavorite = async (propertyId) => {
  const { data } = await api.post(`/properties/${propertyId}/favorite`);
  return data;
};

/**
 * Get the authenticated user's favorite properties
 * GET /api/properties/my/favorites
 */
export const getMyFavorites = async () => {
  const { data } = await api.get("/properties/my/favorites");
  return data; // { favorites }
};

/**
 * Get properties listed by the authenticated user
 * GET /api/properties/my/listings
 */
export const getMyListings = async () => {
  const { data } = await api.get("/properties/my/listings");
  return data; // { count, properties }
};

/**
 * Create a property listing
 * POST /api/properties  (multipart — coverImage/images go through Cloudinary middleware)
 */
export const createProperty = async (formData) => {
  const { data } = await api.post("/properties", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

/**
 * Update a property listing
 * PUT /api/properties/:id  (multipart — only send coverImage/images that changed)
 */
export const updateProperty = async (id, formData) => {
  const { data } = await api.put(`/properties/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

/**
 * Update a property's sale status
 * PATCH /api/properties/:id/status
 *
 * status:
 * - available
 * - reserved
 * - sold
 */
export const updatePropertyStatus = async (id, status) => {
  const { data } = await api.patch(`/properties/${id}/status`, { status });
  return data;
};

/**
 * Delete a property listing
 * DELETE /api/properties/:id
 */
export const deleteProperty = async (id) => {
  const { data } = await api.delete(`/properties/${id}`);
  return data; // { message }
};

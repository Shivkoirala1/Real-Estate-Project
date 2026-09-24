import api, { multipartConfig } from "../utils/axios";

/**
 * Get properties
 * GET /api/properties
 *
 * Accepts either:
 * - an object of query params (e.g. { featured: true, limit: 6, page: 1 })
 * - a pre-built query string (e.g. "propertyType=abc&sort=price_low")
 *
 * Supported query parameters:
 * - keyword, saleType, propertyType, province, district, municipality
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
export const getPropertyByIdorSlug = async (id) => {
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
 * POST /api/properties
 * - FormData: legacy flow (coverImage/images bytes via Cloudinary middleware)
 * - Object: direct flow (coverUploadId/galleryUploadIds JSON, no bytes)
 */
export const createProperty = async (body) => {
  if (body instanceof FormData) {
    const { data } = await api.post("/properties", body, multipartConfig());
    return data;
  }
  const { data } = await api.post("/properties", body);
  return data;
};

/**
 * Update a property listing
 * PUT /api/properties/:id
 * - FormData: legacy flow (only send coverImage/images that changed)
 * - Object: direct flow (uploadIds + existingImages JSON, no bytes)
 */
export const updateProperty = async (id, body) => {
  if (body instanceof FormData) {
    const { data } = await api.put(`/properties/${id}`, body, multipartConfig());
    return data;
  }
  const { data } = await api.put(`/properties/${id}`, body);
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
 * End the current tenancy: rented -> available (the ONLY way back).
 * PATCH /api/properties/:id/end-tenancy (no body)
 * response: { success, property }
 */
export const endTenancy = async (id) => {
  const { data } = await api.patch(`/properties/${id}/end-tenancy`);
  return data;
};

/**
 * Owner requests an end of the current tenancy (admin approval required).
 * PATCH /api/properties/:id/request-end-tenancy { reason? }
 * response: { success, property }
 */
export const requestEndTenancy = async (id, reason) => {
  const { data } = await api.patch(`/properties/${id}/request-end-tenancy`, { reason });
  return data;
};

/**
 * Admin approves a pending end-of-tenancy request (runs the end-tenancy effect).
 * PATCH /api/properties/:id/approve-end-tenancy (no body)
 * response: { success, property }
 */
export const approveEndTenancy = async (id) => {
  const { data } = await api.patch(`/properties/${id}/approve-end-tenancy`);
  return data;
};

/**
 * Admin declines a pending end-of-tenancy request (property stays rented).
 * PATCH /api/properties/:id/decline-end-tenancy { reason? }
 * response: { success, property }
 */
export const declineEndTenancy = async (id, reason) => {
  const { data } = await api.patch(`/properties/${id}/decline-end-tenancy`, { reason });
  return data;
};

/**
 * Share a property with a friend
 * POST /api/properties/:id/share
 *
 * @param {*} propertyId 
 * @returns 
 */
export const shareProperty = async (propertyId) => {
  const { data } = await api.post(`/properties/${propertyId}/share`);
  return data; // { message }
}

/**
 * Delete a property listing
 * DELETE /api/properties/:id
 */
export const deleteProperty = async (id) => {
  const { data } = await api.delete(`/properties/${id}`);
  return data; // { message }
};

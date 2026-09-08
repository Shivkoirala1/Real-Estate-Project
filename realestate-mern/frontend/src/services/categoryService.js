import api from "../utils/axios";

/**
 * Get all property types (House, Land, Apartment, ...)
 * GET /api/categories/property-types
 */
export const getPropertyTypes = async () => {
  const { data } = await api.get("/categories/property-types");
  return data; // { propertyTypes }
};

/**
 * Get all districts (Nepal dataset)
 * GET /api/categories/districts
 */
export const getDistricts = async () => {
  const { data } = await api.get("/categories/districts");
  return data; // { districts }
};

/**
 * Get cities, optionally scoped to one district
 * GET /api/categories/cities?district=:districtId
 */
export const getCities = async (district) => {
  const { data } = await api.get("/categories/cities", {
    params: district ? { district } : {},
  });
  return data; // { cities }
};

/**
 * Create a property type
 * POST /api/categories/property-types
 */
export const createPropertyType = async (name) => {
  const { data } = await api.post("/categories/property-types", { name });
  return data;
};

/**
 * Update a property type (admin)
 * PUT /api/categories/property-types/:id
 *
 * payload: e.g. { defaultCommissionPercentage } — 0-100 number
 */
export const updatePropertyType = async (id, payload) => {
  const { data } = await api.put(`/categories/property-types/${id}`, payload);
  return data; // { propertyType }
};

/**
 * Create a district
 * POST /api/categories/districts
 */
export const createDistrict = async (name) => {
  const { data } = await api.post("/categories/districts", { name });
  return data;
};

/**
 * Create a city within a district
 * POST /api/categories/cities
 *
 * payload: { name, district }
 */
export const createCity = async (payload) => {
  const { data } = await api.post("/categories/cities", payload);
  return data;
};

/**
 * Find an existing city by name+district or create it if missing.
 * Used by the listing form's inline "add city" flow.
 * POST /api/categories/cities/find-or-create
 *
 * payload: { name, district }
 */
export const findOrCreateCity = async (payload) => {
  const { data } = await api.post("/categories/cities/find-or-create", payload);
  return data;
};

/**
 * Delete a category item
 * DELETE /api/categories/:type/:id
 *
 * type:
 * - property-types
 * - districts
 * - cities
 */
export const deleteCategory = async (type, id) => {
  const { data } = await api.delete(`/categories/${type}/${id}`);
  return data; // { message }
};

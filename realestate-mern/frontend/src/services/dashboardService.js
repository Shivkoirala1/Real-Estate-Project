import api from "../utils/axios";

/**
 * Get the admin dashboard aggregate stats + recent listings
 * GET /api/dashboard/admin
 */
export const getAdminDashboard = async () => {
  const { data } = await api.get("/dashboard/admin");
  return data; // { stats, recentListings }
};

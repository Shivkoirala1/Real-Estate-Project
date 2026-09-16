import api from "../utils/axios";

// Get all (publicly visible) reviews for a property
export const getPropertyReviews = async (propertyId) => {
  const response = await api.get(`/reviews/property/${propertyId}`);

  return {
    reviews: response.data.reviews,
    count: response.data.count,
    avgRating: response.data.avgRating,
  };
};

// Check whether the logged-in user is allowed to review a property, and why
// not if they aren't (already reviewed / hidden by an admin / no completed
// visit or purchase yet).
export const getReviewEligibility = async (propertyId) => {
  const response = await api.get(`/reviews/eligibility/${propertyId}`);

  return {
    eligible: response.data.eligible,
    reason: response.data.reason,
    alreadyReviewed: !!response.data.alreadyReviewed,
    hidden: !!response.data.hidden,
  };
};

// Create a review for a property
export const createReview = async ({ propertyId, rating, comment }) => {
  const response = await api.post("/reviews", {
    propertyId,
    rating,
    comment,
  });

  return response.data.review;
};

// Delete a review
export const deleteReview = async (reviewId) => {
  const response = await api.delete(`/reviews/${reviewId}`);

  return response.data;
};

// --- Admin dashboard ---------------------------------------------------

// Get a paginated, filterable list of reviews for moderation
export const getAdminReviews = async ({
  property,
  rating,
  isVisible,
  page = 1,
  limit = 10,
} = {}) => {
  const { data } = await api.get("/reviews/admin", {
    params: { property, rating, isVisible, page, limit },
  });

  return data;
};

// Reply to a review (creates or overwrites the single admin reply)
export const replyToReview = async (reviewId, text) => {
  const response = await api.post(`/reviews/${reviewId}/reply`, { text });

  return response.data.review;
};

// Toggle (or explicitly set) a review's public visibility
export const setReviewVisibility = async (reviewId, isVisible) => {
  const response = await api.patch(`/reviews/${reviewId}/visibility`, {
    isVisible,
  });

  return response.data.review;
};

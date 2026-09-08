import api from "../utils/axios";

// Get all reviews for a property
export const getPropertyReviews = async (propertyId) => {
  const response = await api.get(`/reviews/property/${propertyId}`);

  return {
    reviews: response.data.reviews,
    count: response.data.count,
    avgRating: response.data.avgRating,
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
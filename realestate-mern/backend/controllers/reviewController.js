const Review = require('../models/Review');
const Property = require('../models/Property');
const asyncHandler = require('../utils/asyncHandler');
const { awardReward } = require('../utils/rewards');
const { notifyMany } = require('../utils/notify');

// @desc    Get all reviews for a property (public)
// @route   GET /api/reviews/property/:propertyId
// @access  Public
const getPropertyReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ property: req.params.propertyId })
    .populate('user', 'name selfiePhoto')
    .sort({ createdAt: -1 });

  const avgRating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  res.json({ success: true, reviews, count: reviews.length, avgRating });
});

// @desc    Write a review for a property (one per user per property)
// @route   POST /api/reviews
// @access  Private
const createReview = asyncHandler(async (req, res) => {
  const { propertyId, rating, comment } = req.body;

  if (!propertyId || !rating || !comment) {
    return res.status(400).json({ success: false, message: 'Property, rating, and comment are required' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
  }

  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const existing = await Review.findOne({ property: propertyId, user: req.user._id });
  if (existing) {
    return res.status(400).json({ success: false, message: "You've already reviewed this property" });
  }

  const review = await Review.create({
    property: propertyId,
    user: req.user._id,
    rating,
    comment,
  });

  await awardReward(req.user._id, 'REVIEW_WRITE', { refId: review._id, refModel: 'Review' });

  await notifyMany([property.listedBy], {
    type: 'review_posted',
    title: 'New review on your property',
    message: `${req.user.name} left a ${rating}-star review on "${property.title}"`,
    property: property._id,
    link: `/properties/${property.slug || property._id}`,
  });

  const populated = await review.populate('user', 'name selfiePhoto');
  res.status(201).json({ success: true, review: populated });
});

// @desc    Delete a review (its own author, or an admin)
// @route   DELETE /api/reviews/:id
// @access  Private (author or admin)
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) {
    return res.status(404).json({ success: false, message: 'Review not found' });
  }

  const isAuthor = review.user.toString() === req.user._id.toString();
  if (req.user.role !== 'admin' && !isAuthor) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  await review.deleteOne();
  res.json({ success: true, message: 'Review deleted' });
});

module.exports = { getPropertyReviews, createReview, deleteReview };

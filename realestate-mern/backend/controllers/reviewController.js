const Review = require('../models/Review');
const Property = require('../models/Property');
const Visit = require('../models/Visit');
const Sale = require('../models/Sale');
const Rental = require('../models/Rental');
const asyncHandler = require('../utils/asyncHandler');
const { awardReward } = require('../utils/rewards');
const { notify, notifyMany } = require('../utils/notify');

// Roles allowed to ever write a review. Admins moderate reviews, they don't
// author them.
const REVIEWABLE_ROLES = ['user', 'agent'];

/**
 * Works out whether a user is allowed to review a property, and why.
 *
 * A review is only allowed when the user (role 'user' or 'agent'):
 *   - has a visit on that property marked 'completed', OR
 *   - has a 'verified' Sale record on that property with their account
 *     linked as the buyer (i.e. they purchased it), OR
 *   - has a 'verified' Rental record on that property with their account
 *     linked as the tenant (i.e. they rent it - eligible immediately, no
 *     need to wait for the lease term to end).
 *
 * Returns { eligible, reason, alreadyReviewed, hidden } where `reason` is
 * either the human-readable block reason, or ('visit' | 'purchase' | 'rental')
 * when eligible - the latter is stored on the review itself for the audit trail.
 * `hidden` is set when the existing review is the reason for the block *and*
 * an admin has hidden it, so the UI can explain that instead of implying the
 * review never went through.
 */
const getReviewEligibility = async (user, property) => {
  if (!REVIEWABLE_ROLES.includes(user.role)) {
    return { eligible: false, reason: 'Only buyers and agents can write reviews' };
  }

  if (property.listedBy?.toString() === user._id.toString()) {
    return { eligible: false, reason: 'You cannot review your own listing' };
  }

  const existing = await Review.findOne({ property: property._id, user: user._id });
  if (existing) {
    if (!existing.isVisible) {
      return {
        eligible: false,
        alreadyReviewed: true,
        hidden: true,
        reason: 'Your review on this property was hidden by an admin, so you can\'t submit a new one.',
      };
    }
    return { eligible: false, alreadyReviewed: true, reason: "You've already reviewed this property" };
  }

  const completedVisit = await Visit.findOne({
    property: property._id,
    requestedBy: user._id,
    status: 'completed',
  });
  if (completedVisit) {
    return { eligible: true, reason: 'visit' };
  }

  const verifiedSale = await Sale.findOne({
    property: property._id,
    'buyer.user': user._id,
    status: 'verified',
  });
  if (verifiedSale) {
    return { eligible: true, reason: 'purchase' };
  }

  const verifiedRental = await Rental.findOne({
    property: property._id,
    'tenant.user': user._id,
    status: 'verified',
  });
  if (verifiedRental) {
    return { eligible: true, reason: 'rental' };
  }

  return {
    eligible: false,
    reason: 'You can review a property only after a completed visit, a verified purchase, or a verified rental',
  };
};

// @desc    Check whether the logged-in user can review a property (and why not)
// @route   GET /api/reviews/eligibility/:propertyId
// @access  Private
const checkEligibility = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.propertyId);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const result = await getReviewEligibility(req.user, property);
  res.json({ success: true, ...result });
});

// @desc    Get all visible reviews for a property (public)
// @route   GET /api/reviews/property/:propertyId
// @access  Public
const getPropertyReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ property: req.params.propertyId, isVisible: true })
    .populate('user', 'name selfiePhoto')
    .populate('adminReply.repliedBy', 'name')
    .sort({ createdAt: -1 });

  const avgRating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  res.json({ success: true, reviews, count: reviews.length, avgRating });
});

// @desc    Write a review for a property - only allowed for a user/agent who
//          completed a visit to the property, or who purchased it
// @route   POST /api/reviews
// @access  Private (user, agent)
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

  const eligibility = await getReviewEligibility(req.user, property);
  if (!eligibility.eligible) {
    return res.status(403).json({
      success: false,
      message: eligibility.reason,
      alreadyReviewed: !!eligibility.alreadyReviewed,
      hidden: !!eligibility.hidden,
    });
  }

  let review;
  try {
    review = await Review.create({
      property: propertyId,
      user: req.user._id,
      rating,
      comment,
      eligibility: eligibility.reason,
    });
  } catch (err) {
    // Race condition guard - the unique (property, user) index is the source
    // of truth if two requests slip past the findOne check above together.
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: "You've already reviewed this property" });
    }
    throw err;
  }

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

// @desc    Admin: list/search reviews for moderation (all visibilities)
// @route   GET /api/reviews/admin
// @access  Private (admin)
const getAdminReviews = asyncHandler(async (req, res) => {
  const { property, rating, isVisible, page = 1, limit = 10 } = req.query;

  const query = {};
  if (property) query.property = property;
  if (rating) query.rating = Number(rating);
  if (isVisible === 'true') query.isVisible = true;
  if (isVisible === 'false') query.isVisible = false;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, parseInt(limit, 10));
  const startIndex = (pageNum - 1) * limitNum;

  const [total, reviews] = await Promise.all([
    Review.countDocuments(query),
    Review.find(query)
      .populate('user', 'name email selfiePhoto')
      .populate('property', 'title slug')
      .populate('adminReply.repliedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limitNum),
  ]);

  res.json({
    success: true,
    reviews,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    },
  });
});

// @desc    Admin: reply to a review (creates or overwrites the single admin reply)
// @route   POST /api/reviews/:id/reply
// @access  Private (admin)
const replyToReview = asyncHandler(async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Reply text is required' });
  }

  const review = await Review.findById(req.params.id).populate('property', 'title slug');
  if (!review) {
    return res.status(404).json({ success: false, message: 'Review not found' });
  }

  review.adminReply = {
    text: text.trim(),
    repliedBy: req.user._id,
    repliedAt: new Date(),
  };
  await review.save();

  await notify({
    recipient: review.user,
    type: 'review_reply',
    title: 'The admin replied to your review',
    message: `You got a reply to your review on "${review.property?.title || 'a property'}"`,
    property: review.property?._id,
    link: `/properties/${review.property?.slug || review.property?._id}`,
  });

  const populated = await review.populate([
    { path: 'user', select: 'name selfiePhoto' },
    { path: 'adminReply.repliedBy', select: 'name' },
  ]);

  res.json({ success: true, review: populated });
});

// @desc    Admin: toggle (or explicitly set) a review's public visibility
// @route   PATCH /api/reviews/:id/visibility
// @access  Private (admin)
const toggleReviewVisibility = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) {
    return res.status(404).json({ success: false, message: 'Review not found' });
  }

  review.isVisible = typeof req.body.isVisible === 'boolean' ? req.body.isVisible : !review.isVisible;
  await review.save();

  res.json({ success: true, review });
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

module.exports = {
  checkEligibility,
  getPropertyReviews,
  createReview,
  getAdminReviews,
  replyToReview,
  toggleReviewVisibility,
  deleteReview,
};

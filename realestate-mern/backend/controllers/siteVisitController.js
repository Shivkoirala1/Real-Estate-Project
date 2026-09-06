const SiteVisit = require('../models/SiteVisit');
const Property = require('../models/Property');
const asyncHandler = require('../utils/asyncHandler');
const { awardReward } = require('../utils/rewards');
const { notifyMany } = require('../utils/notify');

// @desc    Book a site visit for a property
// @route   POST /api/site-visits
// @access  Private
const bookVisit = asyncHandler(async (req, res) => {
  const { propertyId, preferredDate, note } = req.body;

  if (!propertyId || !preferredDate) {
    return res.status(400).json({ success: false, message: 'Property and preferred date are required' });
  }

  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  if (property.listedBy.toString() === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: "You can't book a visit for your own listing" });
  }

  const visit = await SiteVisit.create({
    property: property._id,
    visitor: req.user._id,
    preferredDate,
    note: note || '',
  });

  // Rewarded per booking (a genuine new booking each time), refId is the
  // visit itself so a second, separate booking can still earn again.
  await awardReward(req.user._id, 'PROPERTY_VISIT_BOOK', { refId: visit._id, refModel: 'SiteVisit' });

  await notifyMany([property.listedBy], {
    type: 'site_visit_requested',
    title: 'New site visit request',
    message: `${req.user.name} requested a site visit for "${property.title}"`,
    property: property._id,
    link: '/my-properties/visits',
  });

  res.status(201).json({ success: true, visit });
});

// @desc    Get the logged-in user's own booked visits (as a visitor)
// @route   GET /api/site-visits/my
// @access  Private
const getMyVisits = asyncHandler(async (req, res) => {
  const visits = await SiteVisit.find({ visitor: req.user._id })
    .populate('property', 'title slug media.coverImage status')
    .sort({ createdAt: -1 });
  res.json({ success: true, visits });
});

// @desc    Get visit requests for properties the logged-in user owns
//          (admins see every visit request)
// @route   GET /api/site-visits/received
// @access  Private
const getReceivedVisits = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const propertyFilter = isAdmin ? {} : { listedBy: req.user._id };
  const myPropertyIds = isAdmin ? null : (await Property.find(propertyFilter).select('_id')).map((p) => p._id);

  const visits = await SiteVisit.find(isAdmin ? {} : { property: { $in: myPropertyIds } })
    .populate('property', 'title slug media.coverImage listedBy')
    .populate('visitor', 'name email phone')
    .sort({ createdAt: -1 });

  res.json({ success: true, visits });
});

// @desc    Update a visit's status (confirm / complete / cancel) - the
//          property owner or an admin only
// @route   PATCH /api/site-visits/:id/status
// @access  Private (owner or admin)
const updateVisitStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }

  const visit = await SiteVisit.findById(req.params.id).populate('property');
  if (!visit) {
    return res.status(404).json({ success: false, message: 'Visit not found' });
  }

  const isOwner = visit.property.listedBy.toString() === req.user._id.toString();
  if (req.user.role !== 'admin' && !isOwner) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  const wasAlreadyCompleted = visit.status === 'completed';
  visit.status = status;
  await visit.save();

  // The larger "site visit completed" reward only fires the moment it
  // transitions into completed, not on every save.
  if (status === 'completed' && !wasAlreadyCompleted) {
    await awardReward(visit.visitor, 'SITE_VISIT_COMPLETE', { refId: visit._id, refModel: 'SiteVisit' });
  }

  await notifyMany([visit.visitor], {
    type: 'site_visit_status',
    title: 'Site visit update',
    message: `Your visit request for "${visit.property.title}" is now ${status}`,
    property: visit.property._id,
    link: '/wallet',
  });

  res.json({ success: true, visit });
});

module.exports = { bookVisit, getMyVisits, getReceivedVisits, updateVisitStatus };

const Property = require('../models/Property');
const User = require('../models/User');
const { PropertyType } = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const { validatePropertyInput } = require('../utils/validateProperty');
const { notifyMany } = require('../utils/notify');
const { effectiveCommissionPercentage, estimatedCommissionAmount } = require('../utils/commission');

// Empty-string values for ObjectId-ref fields (e.g. a poster leaving the
// district/city dropdown unselected) previously crashed property creation
// with a Mongoose CastError. This strips them out so the field is simply
// omitted instead of sent as an invalid value.
const sanitizeLocation = (location) => {
  if (!location || typeof location !== 'object') return location;
  const cleaned = { ...location };
  if (cleaned.district === '') delete cleaned.district;
  if (cleaned.city === '') delete cleaned.city;
  if (cleaned.mapLocation) {
    const { lat, lng } = cleaned.mapLocation;
    if (lat === '' || lat === undefined || lat === null || lng === '' || lng === undefined || lng === null) {
      delete cleaned.mapLocation;
    } else {
      cleaned.mapLocation = { lat: Number(lat), lng: Number(lng) };
    }
  }
  return cleaned;
};

// Spec v2 (Feature 2): normalize the optional per-listing commission
// override. Accepts a number 0-100 (plain number or numeric string - the
// multipart form sends strings); empty string / null / the literal string
// 'null' all mean "clear the override" so the property type default applies
// again. Absent (undefined) means "don't touch it" on updates.
//   { ok: false }                    -> invalid, caller responds 400
//   { ok: true, present, value }     -> value is a number 0-100 or null
const parseCommissionPercentage = (raw) => {
  if (raw === undefined) return { ok: true, present: false, value: undefined };
  if (raw === null || raw === '' || raw === 'null') return { ok: true, present: true, value: null };
  const pct = Number(raw);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) return { ok: false };
  return { ok: true, present: true, value: pct };
};

// Agents/admins get the effective commission figure attached; everyone else
// gets the raw commission fields stripped entirely (closes a prior exposure
// where `propertyType.defaultCommissionPercentage` leaked to anonymous
// visitors via the public property endpoints).
const applyCommissionVisibility = (propertyDoc, viewerRole) => {
  const plain = propertyDoc.toObject ? propertyDoc.toObject() : propertyDoc;
  const canSeeCommission = viewerRole === 'agent' || viewerRole === 'admin';

  if (canSeeCommission) {
    const pct = effectiveCommissionPercentage(plain, plain.propertyType);
    plain.effectiveCommissionPercentage = pct;
    plain.estimatedCommissionAmount = estimatedCommissionAmount(plain.price, pct);
  } else {
    delete plain.commissionPercentage;
    if (plain.propertyType && typeof plain.propertyType === 'object') {
      delete plain.propertyType.defaultCommissionPercentage;
    }
  }
  return plain;
};

// @desc    Get all properties with search, filter, sort, pagination
// @route   GET /api/properties
// @access  Public
const getProperties = asyncHandler(async (req, res) => {
  const {
    keyword,
    propertyType,
    city,
    district,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    status,
    saleType,
    sort,
    page = 1,
    limit = 12,
    featured,
  } = req.query;

  const query = { isArchived: false, isApproved: true };

  if (keyword) {
    // Case-insensitive partial match on title/description. This is more
    // forgiving than a MongoDB $text search (which requires a text index to
    // already be built and only matches whole, stemmed words) - a partial
    // word typed by a buyer would otherwise silently return zero results.
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    query.$or = [{ title: regex }, { description: regex }];
  }
  if (propertyType) query.propertyType = propertyType;
  if (city) query['location.city'] = city;
  if (district) query['location.district'] = district;
  if (status) query.status = status;
  if (saleType) query.saleType = saleType;
  if (featured) query.isFeatured = featured === 'true';

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  if (bedrooms) query['details.bedrooms'] = { $gte: Number(bedrooms) };
  if (bathrooms) query['details.bathrooms'] = { $gte: Number(bathrooms) };

  let sortOption = { createdAt: -1 }; // newest first (default)
  if (sort === 'oldest') sortOption = { createdAt: 1 };
  if (sort === 'price_low') sortOption = { price: 1 };
  if (sort === 'price_high') sortOption = { price: -1 };

  const pageNum = Math.max(Number(page), 1);
  const limitNum = Math.max(Number(limit), 1);
  const skip = (pageNum - 1) * limitNum;

  const [properties, total] = await Promise.all([
    Property.find(query)
      .populate('propertyType', 'name defaultCommissionPercentage')
      .populate('location.city', 'name')
      .populate('location.district', 'name')
      .populate('listedBy', 'name email phone')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum),
    Property.countDocuments(query),
  ]);

  const visibleProperties = properties.map((p) => applyCommissionVisibility(p, req.user?.role));

  res.json({
    success: true,
    count: visibleProperties.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    properties: visibleProperties,
  });
});

// @desc    Get single property by id or slug + similar properties
// @route   GET /api/properties/:id
// @access  Public
const getProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);

  const query = isObjectId ? { _id: id } : { slug: id };
  const property = await Property.findOne(query)
    .populate('propertyType', 'name category defaultCommissionPercentage')
    .populate('location.city', 'name')
    .populate('location.district', 'name')
    .populate('listedBy', 'name email phone selfiePhoto verificationStatus createdAt');

  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  property.views += 1;
  await property.save();

  const similarProperties = await Property.find({
    _id: { $ne: property._id },
    propertyType: property.propertyType,
    isArchived: false,
    isApproved: true,
  })
    .limit(4)
    .select('title price media.coverImage location status slug');

  res.json({
    success: true,
    property: applyCommissionVisibility(property, req.user?.role),
    similarProperties,
  });
});

// @desc    Create new property listing
// @route   POST /api/properties
// @access  Private (any verified user, admin)
const createProperty = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // location and details may arrive as JSON strings via multipart/form-data
  if (typeof body.location === 'string') {
    try { body.location = JSON.parse(body.location); }
    catch (e) { return res.status(400).json({ success: false, message: 'Invalid location data submitted' }); }
  }
  if (typeof body.details === 'string') {
    try { body.details = JSON.parse(body.details); }
    catch (e) { return res.status(400).json({ success: false, message: 'Invalid property details submitted' }); }
  }
  body.location = sanitizeLocation(body.location);

  // Currency is fixed to NPR platform-wide - never trust whatever the
  // client submits here, even if the form field were somehow tampered with.
  body.currency = 'NPR';

  // Optional commission override - reject out-of-range/non-numeric input
  // here (with a friendly 400) instead of letting the model validator throw
  // a generic 500 further down.
  const commission = parseCommissionPercentage(body.commissionPercentage);
  if (!commission.ok) {
    return res.status(400).json({ success: false, message: 'Commission percentage must be between 0 and 100' });
  }
  // On create, an untouched field simply means "no override" (null default).
  body.commissionPercentage = commission.value === undefined ? null : commission.value;

  const files = req.files || {};
  // Cloudinary storage puts the real, permanent image URL on `.path` -
  // `.filename` is just an internal Cloudinary id, not a usable link.
  const images = files.images ? files.images.map((f) => f.path) : [];
  const coverImage = files.coverImage ? files.coverImage[0].path : (images[0] || '');

  // The Land vs House/Apartment/etc. posting forms ask for different
  // required fields - look up which one this listing's type maps to so
  // the same rule is enforced server-side, not just in the UI.
  const propertyTypeDoc = body.propertyType ? await PropertyType.findById(body.propertyType).select('category') : null;
  const category = propertyTypeDoc?.category || 'building';

  const validationErrors = validatePropertyInput(body, category);
  if (!coverImage) validationErrors.push('A cover image is required');
  if (validationErrors.length > 0) {
    return res.status(400).json({ success: false, message: validationErrors[0], errors: validationErrors });
  }

  const property = await Property.create({
    ...body,
    media: { coverImage, images, video: body.video || '' },
    listedBy: req.user._id,
  });

  res.status(201).json({ success: true, property });
});

// @desc    Update property (owner or admin)
// @route   PUT /api/properties/:id
// @access  Private (owner or admin)
const updateProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const isOwner = property.listedBy.toString() === req.user._id.toString();
  if (req.user.role !== 'admin' && !isOwner) {
    return res.status(403).json({ success: false, message: 'Not authorized to edit this property' });
  }

  const body = { ...req.body };
  // Status changes must go through PATCH /:id/status, which enforces the
  // one-way Available -> Reserved -> Sold rule - stripped here so it can't
  // be slipped past that check through the general edit form instead.
  delete body.status;
  if (typeof body.location === 'string') {
    try { body.location = JSON.parse(body.location); }
    catch (e) { return res.status(400).json({ success: false, message: 'Invalid location data submitted' }); }
  }
  if (typeof body.details === 'string') {
    try { body.details = JSON.parse(body.details); }
    catch (e) { return res.status(400).json({ success: false, message: 'Invalid property details submitted' }); }
  }
  if (body.location) body.location = sanitizeLocation(body.location);

  // Currency is fixed to NPR platform-wide, same as on creation.
  body.currency = 'NPR';

  // Optional commission override - same normalization as on create, but the
  // field is only applied when the request actually included it, so partial
  // edits don't wipe an existing override. Clearing (null/''/'null') is
  // still explicit, and authorization was already checked above, so only
  // the owner/admin can change commission settings.
  const commission = parseCommissionPercentage(body.commissionPercentage);
  if (!commission.ok) {
    return res.status(400).json({ success: false, message: 'Commission percentage must be between 0 and 100' });
  }
  if (commission.present) body.commissionPercentage = commission.value;
  else delete body.commissionPercentage;

  const currentMedia = property.media.toObject ? property.media.toObject() : property.media;
  const files = req.files || {};

  // Which of the property's existing "additional images" should be kept -
  // the client sends the full list of URLs it wants to retain (letting
  // users actually remove photos, not just add more).
  let keptExisting = currentMedia.images || [];
  if (typeof body.existingImages === 'string') {
    try {
      const parsed = JSON.parse(body.existingImages);
      if (Array.isArray(parsed)) keptExisting = parsed;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid existing images data submitted' });
    }
  }

  // Cloudinary storage puts the real, permanent image URL on `.path` -
  // `.filename` is just an internal Cloudinary id, not a usable link.
  const newImages = files.images ? files.images.map((f) => f.path) : [];
  const finalImages = [...keptExisting, ...newImages];

  const newCoverImage = files.coverImage ? files.coverImage[0].path : currentMedia.coverImage;

  body.media = {
    coverImage: newCoverImage || finalImages[0] || '',
    images: finalImages,
    video: body.video !== undefined ? body.video : currentMedia.video,
  };
  delete body.existingImages;

  // Validate the *effective* result of this update - existing property
  // fields merged with whatever the request is changing - so a partial
  // update can't slip an invalid value into a field it didn't touch.
  const currentPlain = property.toObject();
  const merged = {
    ...currentPlain,
    ...body,
    location: { ...currentPlain.location, ...(body.location || {}) },
    details: { ...currentPlain.details, ...(body.details || {}) },
  };
  const propertyTypeDoc = await PropertyType.findById(merged.propertyType).select('category');
  const propertyTypeCategory = propertyTypeDoc?.category || 'building';
  const validationErrors = validatePropertyInput(merged, propertyTypeCategory);
  if (!body.media.coverImage) validationErrors.push('A cover image is required');
  if (validationErrors.length > 0) {
    return res.status(400).json({ success: false, message: validationErrors[0], errors: validationErrors });
  }

  Object.assign(property, body);
  await property.save();

  res.json({ success: true, property });
});

// Status only ever moves forward: Available -> Reserved -> Sold. It can
// never be reverted to an earlier stage (e.g. Sold back to Reserved or
// Available), whether that's an accidental click or an intentional change.
const STATUS_RANK = { available: 0, reserved: 1, sold: 2 };

// @desc    Update only property status (Available/Reserved/Sold)
// @route   PATCH /api/properties/:id/status
// @access  Private (owner or admin)
const updatePropertyStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['available', 'reserved', 'sold'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }

  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const isOwner = property.listedBy.toString() === req.user._id.toString();
  if (req.user.role !== 'admin' && !isOwner) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (STATUS_RANK[status] < STATUS_RANK[property.status]) {
    return res.status(400).json({
      success: false,
      message: `Status can't be reverted from "${property.status}" back to "${status}". Once a property moves to a later stage, it can only move forward.`,
    });
  }

  const wasAlreadySold = property.status === 'sold';

  property.status = status;
  await property.save();

  // Alert admins whenever a property newly becomes sold - not on a repeat
  // no-op update, and regardless of whether the owner or an admin made the change.
  if (status === 'sold' && !wasAlreadySold) {
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'property_sold',
        title: 'Property marked as sold',
        message: `"${property.title}" was marked as sold by ${req.user.name}`,
        property: property._id,
        link: '/dashboard/admin/properties',
      }
    );
  }

  res.json({ success: true, property });
});

// @desc    Delete property
// @route   DELETE /api/properties/:id
// @access  Private (owner or admin)
const deleteProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const isOwner = property.listedBy.toString() === req.user._id.toString();
  if (req.user.role !== 'admin' && !isOwner) {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this property' });
  }

  await property.deleteOne();
  res.json({ success: true, message: 'Property deleted successfully' });
});

// @desc    Get properties listed by the currently logged in user
// @route   GET /api/properties/my/listings
// @access  Private (any verified user, admin)
const getMyProperties = asyncHandler(async (req, res) => {
  const properties = await Property.find({ listedBy: req.user._id })
    .populate('propertyType', 'name')
    .sort({ createdAt: -1 });
  res.json({ success: true, count: properties.length, properties });
});

// @desc    Toggle favorite property for logged in user
// @route   POST /api/properties/:id/favorite
// @access  Private
const toggleFavorite = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const user = await User.findById(req.user._id);
  const index = user.favorites.findIndex((fav) => fav.toString() === property._id.toString());

  let favorited;
  if (index > -1) {
    user.favorites.splice(index, 1);
    favorited = false;
  } else {
    user.favorites.push(property._id);
    favorited = true;
  }

  await user.save();
  res.json({ success: true, favorited });
});

// @desc    Get logged in user's favorite properties
// @route   GET /api/properties/my/favorites
// @access  Private
const getFavorites = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'favorites',
    populate: [{ path: 'propertyType', select: 'name' }],
  });
  res.json({ success: true, favorites: user.favorites });
});

module.exports = {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  updatePropertyStatus,
  deleteProperty,
  getMyProperties,
  toggleFavorite,
  getFavorites,
};
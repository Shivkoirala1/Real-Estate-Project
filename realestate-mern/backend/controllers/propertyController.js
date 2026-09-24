const Property = require('../models/Property');
const Rental = require('../models/Rental');
const User = require('../models/User');
const { PropertyType } = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const { validatePropertyInput } = require('../utils/validateProperty');
const { notify, notifyMany } = require('../utils/notify');
const { effectiveCommissionPercentage, estimatedCommissionAmount } = require('../utils/commission');
const { awardReward } = require('../utils/rewards');
// Phase 2 direct-upload: property media may arrive as authorized uploadIds
// (browser → Cloudinary) instead of multipart bytes (browser → Render).
// Legacy req.files handling stays intact behind PROPERTY_DIRECT_UPLOAD_ENABLED.
const {
  resolvePropertyUploads,
  commitUploads,
  retireRemovedEntityUploads,
  closeSession,
} = require('../services/uploadService');
const { recordPropertySubmit } = require('../utils/uploadMetrics');

const isPropertyDirectEnabled = () => process.env.PROPERTY_DIRECT_UPLOAD_ENABLED !== 'false';

// Normalizes incoming location payloads (which may arrive as JSON strings
// via multipart/form-data) to the canonical shape
// (Province -> District -> Municipality + flexible detail fields).
// Trims string fields; drops an incomplete map pin (only one axis) so a
// half-filled picker can't save a misleading coordinate.
const sanitizeLocation = (location) => {
  if (!location || typeof location !== 'object') return location;
  const cleaned = { ...location };
  ['province', 'district', 'municipality', 'wardNumber', 'locality', 'streetAddress', 'nearbyLandmark', 'mapLink'].forEach(
    (field) => {
      if (typeof cleaned[field] === 'string') cleaned[field] = cleaned[field].trim();
    }
  );
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
    province,
    district,
    municipality,
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

  // Management-purpose properties are owner/admin-only and never publicly
  // listed - this default exclusion applies to every public query surface.
  // isApproved is always true in practice (no approval workflow exists);
  // the predicate stays as a guard so a future workflow can use the field.
  const query = { isArchived: false, isApproved: true, saleType: { $in: ['sale', 'rent'] } };

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
  // Canonical admin-area filters are plain names (case-insensitive exact
  // match). Locality/street text is deliberately NOT an exact filter — it
  // stays in the free-text keyword search.
  const exactName = (value) => ({ $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' });
  if (province) query['location.province'] = exactName(province);
  if (district) query['location.district'] = exactName(district);
  if (municipality) query['location.municipality'] = exactName(municipality);
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
  // Availability-first (status ascending puts `available` first, then
  // alphabetical by title within each status; case-insensitive via the
  // collation on the query below).
  if (sort === 'availability') sortOption = { status: 1, title: 1 };

  const pageNum = Math.max(Number(page), 1);
  const limitNum = Math.max(Number(limit), 1);
  const skip = (pageNum - 1) * limitNum;

  // Card DTO: whitelist only list-rendered fields (description, images[],
  // full details/location, views/shares stay in the detail endpoint).
  // Keyword search still matches title+description at the DB level.
  // Location fields are plain strings now (no District/City populates).
  const CARD_SELECT = '_id slug title price currency negotiable status saleType commissionPercentage media.coverImage location.province location.district location.municipality location.locality details.bedrooms details.bathrooms details.landArea details.landAreaUnit propertyType createdAt tenancyEndRequestedAt tenancyEndReason';

  const [properties, total] = await Promise.all([
    Property.find(query)
      .select(CARD_SELECT)
      .populate('propertyType', 'name defaultCommissionPercentage')
      .populate('listedBy', 'name')
      .collation({ locale: 'en', strength: 2 })
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum),
    Property.countDocuments(query),
  ]);

  const visibleProperties = properties.map((p) => applyCommissionVisibility(p, req.user?.role));

  res.json({
    success: true,
    count: visibleProperties.length,
    // Canonical pagination envelope (B6: legacy flat total/page/pages removed;
    // consumers read `pagination` — see PropertyListing/ManageProperties).
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
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
  // Contact info (phone/email) is disclosed to authenticated callers only.
  // Anonymous viewers get identity fields; the detail UI falls back to
  // "Not provided — use the form below" (B1 approved default).
  const listedBySelect = req.user
    ? 'name email phone selfiePhoto verificationStatus createdAt'
    : 'name selfiePhoto verificationStatus createdAt';
  const property = await Property.findOne(query)
    .populate('propertyType', 'name category defaultCommissionPercentage')
    .populate('listedBy', listedBySelect);

  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  // Management-purpose properties are owner/admin-only. Anyone else gets a
  // 404 (indistinguishable from a missing listing) on the public surface.
  if (property.saleType === 'management') {
    const viewer = req.user;
    const listedById = property.listedBy?._id || property.listedBy;
    const isOwner = viewer && listedById && String(listedById) === String(viewer._id);
    if (!viewer || (viewer.role !== 'admin' && !isOwner)) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
  }

  property.views += 1;
  await property.save();

  const similarProperties = await Property.find({
    _id: { $ne: property._id },
    propertyType: property.propertyType,
    isArchived: false,
    isApproved: true,
    saleType: { $in: ['sale', 'rent'] },
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
  const startedAt = Date.now();
  const body = { ...req.body };
  const clientStats = body.clientStats && typeof body.clientStats === 'object' ? body.clientStats : {};
  // Never persist upload-plumbing fields on the property document.
  delete body.coverUploadId;
  delete body.galleryUploadIds;
  delete body.uploadSessionId;
  delete body.clientStats;

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
// Direct flow: media arrives as authorized uploadIds (no bytes through
// Render). Legacy flow: multer already streamed req.files to Cloudinary.
const directRequested =
  req.body.coverUploadId !== undefined || req.body.galleryUploadIds !== undefined;
let direct = null;
if (directRequested) {
  if (!isPropertyDirectEnabled()) {
    recordPropertySubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'error', clientStats });
    return res.status(400).json({ success: false, message: 'Direct photo upload is disabled — please use the standard photo upload' });
  }
  try {
    direct = await resolvePropertyUploads({
      actor: req.user,
      sessionId: req.body.uploadSessionId,
      coverUploadId: req.body.coverUploadId,
      galleryUploadIds: req.body.galleryUploadIds,
    });
  } catch (err) {
    recordPropertySubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'validation', clientStats });
    throw err;
  }
}
const images = direct ? direct.galleryUrls : files.images ? files.images.map((f) => f.path) : [];
const coverImage = direct
  ? direct.coverUrl || direct.galleryUrls[0] || ''
  : files.coverImage ? files.coverImage[0].path : (images[0] || '');

  // The Land vs House/Apartment/etc. posting forms ask for different
  // required fields - look up which one this listing's type maps to so
  // the same rule is enforced server-side, not just in the UI.
  const propertyTypeDoc = body.propertyType ? await PropertyType.findById(body.propertyType).select('category') : null;
  const category = propertyTypeDoc?.category || 'building';

  // Exactly one purpose: sale | rent | management. Management properties
  // skip marketing-only requirements (asking price, cover image).
  if (body.saleType !== undefined && !['sale', 'rent', 'management'].includes(body.saleType)) {
    return res.status(400).json({ success: false, message: 'Invalid saleType value' });
  }
  const purpose = body.saleType === 'management' ? 'management' : 'listing';

  const validationErrors = validatePropertyInput(body, category, purpose);
  if (!coverImage && purpose !== 'management') validationErrors.push('A cover image is required');
  if (validationErrors.length > 0) {
    // Uploads stay `completed` — the client resubmits with the same ids,
    // no re-upload needed.
    recordPropertySubmit(direct ? 'direct' : 'legacy', {
      durationMs: Date.now() - startedAt,
      fileCount: images.length + (coverImage ? 1 : 0),
      bytes: direct ? direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0) : 0,
      outcome: 'validation',
      clientStats,
    });
    return res.status(400).json({ success: false, message: validationErrors[0], errors: validationErrors });
  }

  const property = await Property.create({
    ...body,
    media: { coverImage, images, video: body.video || '' },
    listedBy: req.user._id,
  });

  if (direct && direct.uploads.length > 0) {
    // Commit AFTER create (the entity must exist first). On commit failure
    // the just-created property is removed again so no half-attached
    // listing survives — Cloudinary itself stays outside any transaction,
    // the sweeper covers that boundary.
    try {
      await commitUploads({
        actor: req.user,
        sessionId: req.body.uploadSessionId,
        uploadIds: direct.uploads.map((u) => String(u._id)),
        entityType: 'property',
        entityId: String(property._id),
      });
    } catch (err) {
      await Property.deleteOne({ _id: property._id });
      recordPropertySubmit('direct', {
        durationMs: Date.now() - startedAt,
        fileCount: images.length + (coverImage ? 1 : 0),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'error',
        clientStats,
      });
      throw err;
    }
    await closeSession(req.body.uploadSessionId, req.user);
  }

  recordPropertySubmit(direct ? 'direct' : 'legacy', {
    durationMs: Date.now() - startedAt,
    fileCount: images.length + (coverImage ? 1 : 0),
    bytes: direct
      ? direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0)
      : (files.images || []).reduce((s, f) => s + (f.size || f.bytes || 0), 0) +
        (files.coverImage ? files.coverImage.reduce((s, f) => s + (f.size || f.bytes || 0), 0) : 0),
    outcome: 'success',
    clientStats,
  });

  res.status(201).json({ success: true, property });
});

// @desc    Update property (owner or admin)
// @route   PUT /api/properties/:id
// @access  Private (owner or admin)
const updateProperty = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const isOwner = property.listedBy.toString() === req.user._id.toString();
  if (req.user.role !== 'admin' && !isOwner) {
    return res.status(403).json({ success: false, message: 'Not authorized to edit this property' });
  }

  const body = { ...req.body };
  const clientStats = body.clientStats && typeof body.clientStats === 'object' ? body.clientStats : {};
  delete body.coverUploadId;
  delete body.galleryUploadIds;
  delete body.uploadSessionId;
  delete body.clientStats;
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

  // existingImages arrives as a JSON string on legacy multipart, or a real
  // array on direct JSON submits — accept both.
  let keptExisting = currentMedia.images || [];
  if (typeof body.existingImages === 'string') {
    try {
      const parsed = JSON.parse(body.existingImages);
      if (Array.isArray(parsed)) keptExisting = parsed;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid existing images data submitted' });
    }
  } else if (Array.isArray(body.existingImages)) {
    keptExisting = body.existingImages;
  }

  const directRequested =
    req.body.coverUploadId !== undefined || req.body.galleryUploadIds !== undefined;
  let direct = null;
  if (directRequested) {
    if (!isPropertyDirectEnabled()) {
      recordPropertySubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'error', clientStats });
      return res.status(400).json({ success: false, message: 'Direct photo upload is disabled — please use the standard photo upload' });
    }
    try {
      direct = await resolvePropertyUploads({
        actor: req.user,
        sessionId: req.body.uploadSessionId,
        coverUploadId: req.body.coverUploadId,
        galleryUploadIds: req.body.galleryUploadIds,
        forEntityId: property._id,
      });
    } catch (err) {
      recordPropertySubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'validation', clientStats });
      throw err;
    }
  }

  const newImages = direct ? direct.galleryUrls : files.images ? files.images.map((f) => f.path) : [];
  const finalImages = [...keptExisting, ...newImages];

  const newCoverImage = direct
    ? direct.coverUrl || currentMedia.coverImage
    : files.coverImage ? files.coverImage[0].path : currentMedia.coverImage;

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
  const mergedPurpose = merged.saleType === 'management' ? 'management' : 'listing';
  const validationErrors = validatePropertyInput(merged, propertyTypeCategory, mergedPurpose);
  if (!body.media.coverImage && mergedPurpose !== 'management') validationErrors.push('A cover image is required');
  if (validationErrors.length > 0) {
    // New uploads stay `completed` — resubmit reuses them, no re-upload.
    recordPropertySubmit(direct ? 'direct' : 'legacy', {
      durationMs: Date.now() - startedAt,
      fileCount: newImages.length + (direct && direct.coverUrl ? 1 : 0),
      bytes: direct ? direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0) : 0,
      outcome: 'validation',
      clientStats,
    });
    return res.status(400).json({ success: false, message: validationErrors[0], errors: validationErrors });
  }

  if (direct && direct.uploads.length > 0) {
    // Commit BEFORE save here (the entity already exists, so its id is
    // known). A save failure afterwards leaves committed rows pointing at
    // valid Cloudinary bytes — the next update's retire pass reconciles.
    try {
      await commitUploads({
        actor: req.user,
        sessionId: req.body.uploadSessionId,
        uploadIds: direct.uploads.map((u) => String(u._id)),
        entityType: 'property',
        entityId: String(property._id),
      });
    } catch (err) {
      recordPropertySubmit('direct', {
        durationMs: Date.now() - startedAt,
        fileCount: newImages.length + (direct.coverUrl ? 1 : 0),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'error',
        clientStats,
      });
      throw err;
    }
  }

  Object.assign(property, body);
  await property.save();

  // Deferred cleanup of replaced/removed direct-upload assets (legacy URLs
  // with no Upload row are ignored — ownership unprovable). Never fails
  // the response.
  await retireRemovedEntityUploads({
    entityType: 'property',
    entityId: property._id,
    keepUrls: [body.media.coverImage, ...body.media.images],
  });
  if (direct) await closeSession(req.body.uploadSessionId, req.user);

  recordPropertySubmit(direct ? 'direct' : 'legacy', {
    durationMs: Date.now() - startedAt,
    fileCount: newImages.length + (direct && direct.coverUrl ? 1 : 0),
    bytes: direct
      ? direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0)
      : (files.images || []).reduce((s, f) => s + (f.size || f.bytes || 0), 0),
    outcome: 'success',
    clientStats,
  });

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

  // When a property newly becomes sold, the owner can optionally attribute
  // the sale to a specific buyer (e.g. someone who inquired or booked a site
  // visit). This is attribution only: revenue effects (purchase/sale rewards,
  // referral bonuses, commission records, lead closure) happen exclusively
  // on the verified-Sale path, never here.
  let buyer = null;
  if (status === 'sold' && !wasAlreadySold && req.body.buyerEmail) {
    buyer = await User.findOne({ email: req.body.buyerEmail.trim().toLowerCase() });
    if (buyer) {
      property.soldTo = buyer._id;
      property.soldAt = new Date();
    }
  }

  await property.save();

  // Alert admins whenever a property newly becomes sold - not on a repeat
  // no-op update, and regardless of whether the owner or an admin made the change.
  // This is an oversight flag, not a routine notification: a manual status
  // change generates no commission and no rewards, so an off-platform sale
  // recorded here bypasses the verified-Sale revenue path by design.
  if (status === 'sold' && !wasAlreadySold) {
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'property_sold',
        title: 'Property marked as sold (manual status change)',
        message: `"${property.title}" was manually marked as sold by ${req.user.name} - no commission generated`,
        property: property._id,
        link: '/dashboard/admin/properties',
      }
    );
  }

  res.json({ success: true, property });
});

// @desc    End the current tenancy: return a rented property to available
// @route   PATCH /api/properties/:id/end-tenancy
// @access  Private (owner or admin)
//
// This is the ONLY way a property moves from 'rented' back to 'available' -
// never automatically (no date/cron trigger). The underlying verified Rental
// document is left untouched as the permanent historical record; only the
// property's current-occupancy snapshot is cleared.
const endTenancy = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  const isOwner = property.listedBy.toString() === req.user._id.toString();
  if (req.user.role !== 'admin' && !isOwner) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (property.status !== 'rented') {
    return res.status(400).json({
      success: false,
      message: 'Property is not currently marked as rented.',
    });
  }

  property.status = 'available';
  property.rentedFrom = null;
  property.rentedUntil = null;
  property.tenant = null;
  await property.save();

  // Record when the tenancy actually ended on the permanent Rental record,
  // distinct from when it was verified.
  const rental = await Rental.findOne({ property: property._id, status: 'verified' }).sort({
    createdAt: -1,
  });
  if (rental) {
    rental.recordActivity({
      type: 'updated',
      message: 'Tenancy ended — property returned to available',
      by: req.user._id,
      byName: req.user.name,
    });
    await rental.save();
  }

  res.json({ success: true, property });
});

// @desc    Property owner requests an end of the current tenancy (admin approval required)
// @route   PATCH /api/properties/:id/request-end-tenancy
// @access  Private (owner only - admins use /end-tenancy or /approve-end-tenancy)
//
// The property stays 'rented' while the request is pending. Once submitted
// the owner cannot reverse it - only an admin resolves it via approve/decline.
const requestEndTenancy = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }
  if (String(property.listedBy) !== String(req.user._id)) {
    return res
      .status(403)
      .json({ success: false, message: 'Only the property owner can request an end of tenancy' });
  }
  if (property.status !== 'rented') {
    return res.status(409).json({
      success: false,
      message: `An end of tenancy can only be requested while the property is rented (current status: ${property.status}).`,
    });
  }
  if (property.tenancyEndRequestedAt) {
    return res.status(409).json({
      success: false,
      message: 'An end-of-tenancy request is already pending review.',
    });
  }

  property.tenancyEndRequestedAt = new Date();
  property.tenancyEndReason = trimmedReason;
  property.tenancyEndRequestedBy = req.user._id;
  await property.save();

  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'tenancy_end_requested',
      title: 'End of tenancy requested',
      message: `${req.user.name} requested to end the tenancy for "${property.title}".`,
      property: property._id,
      link: `/dashboard/admin/properties`,
    }
  );

  res.json({ success: true, property });
});

// Shared effect for both tenancy-end paths (owner-requested approval and the
// direct admin action): clear the occupancy snapshot and stamp the history.
const applyEndTenancy = async (property, actor) => {
  property.status = 'available';
  property.rentedFrom = null;
  property.rentedUntil = null;
  property.tenant = null;
  property.tenancyEndRequestedAt = null;
  property.tenancyEndReason = '';
  property.tenancyEndRequestedBy = null;
  await property.save();

  const rental = await Rental.findOne({ property: property._id, status: 'verified' }).sort({
    createdAt: -1,
  });
  if (rental) {
    rental.recordActivity({
      type: 'updated',
      message: 'Tenancy ended — property returned to available',
      by: actor._id,
      byName: actor.name,
    });
    await rental.save();
  }
};

// @desc    Admin approves an owner-requested end of tenancy
// @route   PATCH /api/properties/:id/approve-end-tenancy
// @access  Private (admin)
const approveEndTenancy = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }
  if (!property.tenancyEndRequestedAt) {
    return res.status(409).json({
      success: false,
      message: 'There is no pending end-of-tenancy request to approve.',
    });
  }

  await applyEndTenancy(property, req.user);

  await notify({
    recipient: property.listedBy,
    type: 'tenancy_end_approved',
    title: 'End of tenancy approved',
    message: `The tenancy for "${property.title}" has been ended. The property is available again.`,
    property: property._id,
    link: '/my-properties',
  });

  res.json({ success: true, property });
});

// @desc    Admin declines an owner-requested end of tenancy (property stays rented)
// @route   PATCH /api/properties/:id/decline-end-tenancy
// @access  Private (admin)
const declineEndTenancy = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }
  if (!property.tenancyEndRequestedAt) {
    return res.status(409).json({
      success: false,
      message: 'There is no pending end-of-tenancy request to decline.',
    });
  }

  property.tenancyEndRequestedAt = null;
  property.tenancyEndReason = '';
  property.tenancyEndRequestedBy = null;
  await property.save();

  await notify({
    recipient: property.listedBy,
    type: 'tenancy_end_declined',
    title: 'End of tenancy declined',
    message: `Your request to end the tenancy for "${property.title}" was declined${trimmedReason ? `: ${trimmedReason}` : '.'}`,
    property: property._id,
    link: '/my-properties',
  });

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

  // Rewarded once per property - unfavoriting and re-favoriting the same
  // property again won't pay out a second time (awardReward dedupes on
  // user + action + refId).
  if (favorited) {
    await awardReward(user._id, 'PROPERTY_SAVE', { refId: property._id, refModel: 'Property' });
  }

  res.json({ success: true, favorited });
});

// @desc    Get logged in user's favorite properties
// @route   GET /api/properties/my/favorites
// @access  Private
const getFavorites = asyncHandler(async (req, res) => {
  // Card DTO (same projection as the property list): favorites render as
  // cards, never as full documents.
  const user = await User.findById(req.user._id).populate({
    path: 'favorites',
    select: '_id slug title price currency negotiable status saleType media.coverImage location.province location.district location.municipality location.locality details.bedrooms details.bathrooms details.landArea details.landAreaUnit propertyType createdAt',
    populate: [
      { path: 'propertyType', select: 'name' },
      { path: 'listedBy', select: 'name' },
    ],
  });
  res.json({ success: true, favorites: user.favorites });
});

// @desc    Log that the logged-in user shared a property (e.g. tapped the
//          share button), rewarding YC/XP the first time per property
// @route   POST /api/properties/:id/share
// @access  Private
const shareProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  property.shares += 1;
  await property.save();

  await awardReward(req.user._id, 'PROPERTY_SHARE', { refId: property._id, refModel: 'Property' });

  res.json({ success: true, shares: property.shares });
});

module.exports = {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  updatePropertyStatus,
  endTenancy,
  requestEndTenancy,
  approveEndTenancy,
  declineEndTenancy,
  deleteProperty,
  getMyProperties,
  toggleFavorite,
  getFavorites,
  shareProperty,
};

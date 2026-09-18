const ManagementService = require('../models/ManagementService');
const asyncHandler = require('../utils/asyncHandler');

// Seed values matching the pre-CRUD static list, created lazily so a fresh
// database offers the same catalogue owners saw before admin management.
const DEFAULT_SERVICES = [
  { name: 'tenant_management', description: 'Tenant sourcing, screening and day-to-day tenant relations' },
  { name: 'rent_collection', description: 'Monthly rent collection and follow-up' },
  { name: 'property_inspection', description: 'Scheduled condition inspections with reports' },
  { name: 'maintenance_coordination', description: 'Repairs and maintenance coordination' },
  { name: 'lease_management', description: 'Lease drafting, renewal and record-keeping' },
  { name: 'property_marketing', description: 'Listing and marketing vacant property' },
  { name: 'utility_management', description: 'Utility accounts and bill handling' },
  { name: 'general_supervision', description: 'General oversight of the property' },
];

// @desc    List services (public sees active only; admins may include inactive)
// @route   GET /api/management-services?includeInactive=true (admin only)
// @access  Public
// Idempotent lazy-seed used by both the catalogue read and request
// creation paths, so request validation never fails on a fresh database
// just because nobody has opened the services page yet.
const seedDefaultsIfEmpty = async () => {
  const existing = await ManagementService.estimatedDocumentCount();
  if (existing === 0) {
    try {
      await ManagementService.insertMany(DEFAULT_SERVICES, { ordered: false });
    } catch (err) {
      if (!err || !String(err.message || '').includes('duplicate')) throw err;
    }
  }
};

const getManagementServices = asyncHandler(async (req, res) => {
  await seedDefaultsIfEmpty();
  const includeInactive = req.user?.role === 'admin' && req.query.includeInactive === 'true';
  const services = await ManagementService.find(includeInactive ? {} : { isActive: true })
    .sort({ name: 1 })
    .lean();
  res.json({ success: true, count: services.length, services });
});

// @desc    Admin creates a service
// @route   POST /api/management-services
// @access  Private (admin)
const createManagementService = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: 'Service name is required' });
  }
  try {
    const service = await ManagementService.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
    });
    res.status(201).json({ success: true, service });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A service with this name already exists' });
    }
    throw err;
  }
});

// @desc    Admin edits a service (name/description). Historical requests keep
//          their snapshotted names - renaming here never rewrites them.
// @route   PATCH /api/management-services/:id
// @access  Private (admin)
const updateManagementService = asyncHandler(async (req, res) => {
  const service = await ManagementService.findById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, message: 'Service not found' });
  }
  const { name, description } = req.body;
  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Service name cannot be empty' });
    }
    service.name = String(name).trim();
  }
  if (description !== undefined) service.description = String(description).trim();
  try {
    await service.save();
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A service with this name already exists' });
    }
    throw err;
  }
  res.json({ success: true, service });
});

// @desc    Admin deactivates (or reactivates) a service - soft change only
// @route   PATCH /api/management-services/:id/status { isActive }
// @access  Private (admin)
const setManagementServiceStatus = asyncHandler(async (req, res) => {
  const service = await ManagementService.findById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, message: 'Service not found' });
  }
  service.isActive = req.body.isActive !== false;
  await service.save();
  res.json({ success: true, service });
});

module.exports = {
  DEFAULT_SERVICES,
  seedDefaultsIfEmpty,
  getManagementServices,
  createManagementService,
  updateManagementService,
  setManagementServiceStatus,
};

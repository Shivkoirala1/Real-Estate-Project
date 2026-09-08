const { PropertyType, District, City } = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');

// ---------- Property Types ----------
const getPropertyTypes = asyncHandler(async (req, res) => {
  const types = await PropertyType.find().sort({ name: 1 });
  res.json({ success: true, propertyTypes: types });
});

// Spec v2 (Feature 2): shared range guard for the default flat commission %.
// Returns the sanitized number, or null when the input is invalid so the
// caller can reject the request with a 400.
const sanitizeCommissionPercentage = (raw) => {
  if (raw === undefined || raw === null || raw === '') return 0;
  const pct = Number(raw);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) return null;
  return pct;
};

const createPropertyType = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const defaultCommissionPercentage = sanitizeCommissionPercentage(req.body.defaultCommissionPercentage);
  if (defaultCommissionPercentage === null) {
    return res.status(400).json({ success: false, message: 'Commission percentage must be between 0 and 100' });
  }
  const type = await PropertyType.create({ name, description, defaultCommissionPercentage });
  res.status(201).json({ success: true, propertyType: type });
});

const updatePropertyType = asyncHandler(async (req, res) => {
  // Explicit whitelist instead of the old raw `req.body` passthrough - a
  // bare passthrough let a client write arbitrary fields into the document
  // and gave no place to validate the new defaultCommissionPercentage.
  const updates = {};
  ['name', 'description', 'category'].forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  if (req.body.defaultCommissionPercentage !== undefined) {
    const pct = sanitizeCommissionPercentage(req.body.defaultCommissionPercentage);
    if (pct === null) {
      return res.status(400).json({ success: false, message: 'Commission percentage must be between 0 and 100' });
    }
    // Numbers 0-100 only - no null reset (a type's default is always a rate).
    updates.defaultCommissionPercentage = pct;
  }
  const type = await PropertyType.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!type) return res.status(404).json({ success: false, message: 'Property type not found' });
  res.json({ success: true, propertyType: type });
});

const deletePropertyType = asyncHandler(async (req, res) => {
  const type = await PropertyType.findByIdAndDelete(req.params.id);
  if (!type) return res.status(404).json({ success: false, message: 'Property type not found' });
  res.json({ success: true, message: 'Property type deleted' });
});

// ---------- Districts ----------
const getDistricts = asyncHandler(async (req, res) => {
  const districts = await District.find().sort({ name: 1 });
  res.json({ success: true, districts });
});

const createDistrict = asyncHandler(async (req, res) => {
  const { name, province } = req.body;
  const district = await District.create({ name, province });
  res.status(201).json({ success: true, district });
});

const updateDistrict = asyncHandler(async (req, res) => {
  const district = await District.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!district) return res.status(404).json({ success: false, message: 'District not found' });
  res.json({ success: true, district });
});

const deleteDistrict = asyncHandler(async (req, res) => {
  const district = await District.findByIdAndDelete(req.params.id);
  if (!district) return res.status(404).json({ success: false, message: 'District not found' });
  res.json({ success: true, message: 'District deleted' });
});

// Lets any registered user add a district that isn't in the list yet
// (e.g. while posting a property) instead of only admins being able to.
// Matches case-insensitively on name first so two users typing "kathmandu"
// and "Kathmandu" don't create two separate entries - whichever is created
// becomes available to every user afterwards, same as admin-seeded ones.
const findOrCreateDistrict = asyncHandler(async (req, res) => {
  const { name, province } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'District name is required' });
  }
  const trimmed = name.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let district = await District.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
  let created = false;
  if (!district) {
    district = await District.create({ name: trimmed, province: province ? province.trim() : '' });
    created = true;
  }
  res.status(created ? 201 : 200).json({ success: true, district, created });
});

// Same idea for cities, scoped to a district (a city name can repeat across
// different districts, so the match is name + district together).
const findOrCreateCity = asyncHandler(async (req, res) => {
  const { name, district } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'City name is required' });
  }
  if (!district) {
    return res.status(400).json({ success: false, message: 'Please select or add a district first' });
  }
  const trimmed = name.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let city = await City.findOne({ name: new RegExp(`^${escaped}$`, 'i'), district });
  let created = false;
  if (!city) {
    city = await City.create({ name: trimmed, district });
    created = true;
  }
  city = await city.populate('district', 'name');
  res.status(created ? 201 : 200).json({ success: true, city, created });
});

// ---------- Cities ----------
const getCities = asyncHandler(async (req, res) => {
  const { district } = req.query;
  const query = district ? { district } : {};
  const cities = await City.find(query).populate('district', 'name').sort({ name: 1 });
  res.json({ success: true, cities });
});

const createCity = asyncHandler(async (req, res) => {
  const { name, district } = req.body;
  const city = await City.create({ name, district });
  res.status(201).json({ success: true, city });
});

const updateCity = asyncHandler(async (req, res) => {
  const city = await City.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!city) return res.status(404).json({ success: false, message: 'City not found' });
  res.json({ success: true, city });
});

const deleteCity = asyncHandler(async (req, res) => {
  const city = await City.findByIdAndDelete(req.params.id);
  if (!city) return res.status(404).json({ success: false, message: 'City not found' });
  res.json({ success: true, message: 'City deleted' });
});

module.exports = {
  getPropertyTypes,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  getDistricts,
  createDistrict,
  updateDistrict,
  deleteDistrict,
  findOrCreateDistrict,
  getCities,
  createCity,
  updateCity,
  deleteCity,
  findOrCreateCity,
};

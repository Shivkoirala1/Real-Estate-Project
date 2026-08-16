const { PropertyType, District, City } = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');

// ---------- Property Types ----------
const getPropertyTypes = asyncHandler(async (req, res) => {
  const types = await PropertyType.find().sort({ name: 1 });
  res.json({ success: true, propertyTypes: types });
});

const createPropertyType = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const type = await PropertyType.create({ name, description });
  res.status(201).json({ success: true, propertyType: type });
});

const updatePropertyType = asyncHandler(async (req, res) => {
  const type = await PropertyType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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

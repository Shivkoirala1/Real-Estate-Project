// Centralized Nepal geography validation for property locations.
//
// Strictly validated (against canonical reference data in
// `backend/data/nepalGeography.js`):
//   - Province must be one of the 7 official provinces.
//   - District must exist AND belong to the given province.
//   - Municipality must be in the district's verified municipality list —
//     but ONLY for districts that have one. Districts with an empty list
//     (no verified data yet) accept any non-empty municipality string, so
//     valid real-world addresses are never blocked by gaps in the dataset.
//
// Flexible (NOT validated against reference data):
//   - Municipality: validated against the district's verified municipality
//     list ONLY when that list is non-empty. Every district currently ships
//     with an empty list (no verified municipality dataset yet), so any
//     non-empty municipality string is accepted for now. Once verified names
//     are added to `DISTRICTS[district].municipalities`, unknown values for
//     that district will be rejected automatically.
//   - Ward, locality/tole, street address, nearby landmark: free-text, never
//     validated beyond being strings.
//   - Map coordinates: optional; when present, range-checked
//     (lat -90..90, lng -180..180).

const { PROVINCES, DISTRICTS } = require('../data/nepalGeography');

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

const getAllProvinces = () => PROVINCES.map((p) => ({ ...p }));

const getDistrictsByProvince = (province) => {
  const name = normalize(province);
  if (!name) return [];
  return Object.entries(DISTRICTS)
    .filter(([, info]) => info.province === name)
    .map(([district]) => district)
    .sort((a, b) => a.localeCompare(b));
};

const getMunicipalitiesByDistrict = (district) => {
  const name = normalize(district);
  const info = DISTRICTS[name];
  if (!info) return [];
  return [...(info.municipalities || [])].sort((a, b) => a.localeCompare(b));
};

// True when the district ships verified municipality data (i.e. the
// reference list is non-empty). Only then is municipality strictly validated.
const hasVerifiedMunicipalities = (district) => getMunicipalitiesByDistrict(district).length > 0;

const isValidProvince = (province) => {
  const name = normalize(province);
  return !!name && PROVINCES.some((p) => p.name === name);
};

const isValidDistrict = (province, district) => {
  const provinceName = normalize(province);
  const districtName = normalize(district);
  if (!provinceName || !districtName) return false;
  const info = DISTRICTS[districtName];
  return !!info && info.province === provinceName;
};

const isValidMunicipality = (district, municipality) => {
  const municipalityName = normalize(municipality);
  // Empty municipality is always acceptable (field is optional).
  if (!municipalityName) return true;
  // Without a verified reference list for this district, any value is
  // accepted — rejecting it would block valid real-world addresses.
  // With a verified list, the value must match it (case-insensitively).
  if (!hasVerifiedMunicipalities(district)) return true;
  const allowed = getMunicipalitiesByDistrict(district).map((m) => m.toLowerCase());
  return allowed.includes(municipalityName.toLowerCase());
};

const isValidMapLocation = (mapLocation) => {
  // Absent coordinates are valid (map pin is optional).
  if (mapLocation === undefined || mapLocation === null) return true;
  const { lat, lng } = mapLocation;
  if (lat === undefined || lat === null || lat === '' || lng === undefined || lng === null || lng === '') {
    return true;
  }
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  return latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
};

// Full location-object check. Returns an array of error messages (empty =
// valid). `options.requireMap` preserves the pre-refactor product rule that
// sale/rent listings must carry a map pin; pass false where a pin is
// genuinely optional.
const isValidLocation = (location, options = {}) => {
  const errors = [];
  const { requireMap = false } = options;
  const loc = location && typeof location === 'object' ? location : {};

  if (!normalize(loc.province)) {
    errors.push('Province is required');
  } else if (!isValidProvince(loc.province)) {
    errors.push(`Unknown province: "${normalize(loc.province)}"`);
  }

  if (!normalize(loc.district)) {
    errors.push('District is required');
  } else if (normalize(loc.province) && !isValidDistrict(loc.province, loc.district)) {
    errors.push(`District "${normalize(loc.district)}" does not belong to province "${normalize(loc.province)}"`);
  }

  if (!isValidMunicipality(loc.district, loc.municipality)) {
    errors.push(
      `Municipality "${normalize(loc.municipality)}" is not a verified municipality of district "${normalize(loc.district)}"`
    );
  }

  const hasMap =
    loc.mapLocation &&
    loc.mapLocation.lat !== undefined &&
    loc.mapLocation.lat !== null &&
    loc.mapLocation.lat !== '' &&
    loc.mapLocation.lng !== undefined &&
    loc.mapLocation.lng !== null &&
    loc.mapLocation.lng !== '';
  if (requireMap && !hasMap) {
    errors.push('A map location (latitude/longitude) is required');
  } else if (hasMap && !isValidMapLocation(loc.mapLocation)) {
    errors.push('Map location coordinates are out of range');
  }

  return errors;
};

module.exports = {
  getAllProvinces,
  getDistrictsByProvince,
  getMunicipalitiesByDistrict,
  hasVerifiedMunicipalities,
  isValidProvince,
  isValidDistrict,
  isValidMunicipality,
  isValidMapLocation,
  isValidLocation,
};

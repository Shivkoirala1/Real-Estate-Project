// Backward-compatibility shim. The canonical geography dataset now lives in
// `backend/data/nepalGeography.js` (Province -> District -> Municipality
// structure); validation helpers live in `backend/utils/nepalGeography.js`.
// This module is kept so any legacy `require('./nepalGeoData')` keeps
// working — it re-exports the canonical data unchanged.
//
// NOTE: the pre-refactor `DISTRICTS[district].cities` shape is gone. Use
// `LEGACY_CITIES_BY_DISTRICT` (seed-only, non-authoritative) where the old
// city lists are genuinely needed (e.g. seeding the legacy City collection).

const {
  PROVINCES,
  DISTRICTS,
  LEGACY_CITIES_BY_DISTRICT,
} = require('../data/nepalGeography');

module.exports = { PROVINCES, DISTRICTS, LEGACY_CITIES_BY_DISTRICT };

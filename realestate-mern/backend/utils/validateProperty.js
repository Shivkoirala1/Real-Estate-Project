const CURRENT_YEAR = new Date().getFullYear();

// Server-side mirror of the practical validation rules enforced on the
// Add/Edit Property form. The frontend checks these first for a good user
// experience, but the API must never trust the client alone - anyone can
// call these endpoints directly (Postman, curl, a modified frontend), so
// the same rules are re-checked here before anything is saved.
//
// `data` should be the *effective* property state - i.e. for updates, the
// existing property merged with whatever the request is changing - so
// partial updates are still validated with full context.
//
// `category` is 'land' or 'building' (looked up from the selected
// PropertyType) - the two posting forms ask for genuinely different
// information, so what's required differs too: a land listing has no
// bedrooms to validate, and a house listing needs more than just an area.
const validatePropertyInput = (data, category = 'building') => {
  const errors = [];
  const title = (data.title || '').trim();
  const description = (data.description || '').trim();
  const details = data.details || {};
  const location = data.location || {};
  const isLand = category === 'land';

  if (!title) errors.push('Property title is required');
  else if (title.length < 10) errors.push('Title should be at least 10 characters');
  else if (title.length > 120) errors.push('Title must be under 120 characters');

  if (!description) errors.push('Property description is required');
  else if (description.length < 30) errors.push('Description should be at least 30 characters');

  if (!data.propertyType) errors.push('Property type is required');

  if (data.price === undefined || data.price === null || data.price === '') {
    errors.push('Price is required');
  } else if (Number(data.price) <= 0) {
    errors.push('Price must be greater than 0');
  } else if (Number(data.price) > 100_000_000_000) {
    errors.push('Price is unrealistically high - please double-check it');
  }

  if (!location.district) errors.push('District is required');
  if (!location.city) errors.push('City is required');
  if (!location.mapLocation || location.mapLocation.lat === undefined || location.mapLocation.lng === undefined) {
    errors.push('A map location (latitude/longitude) is required');
  } else {
    const { lat, lng } = location.mapLocation;
    if (Number(lat) < -90 || Number(lat) > 90 || Number(lng) < -180 || Number(lng) > 180) {
      errors.push('Map location coordinates are out of range');
    }
  }

  // ---- Land area: required for every listing (a house sits on land too),
  // but for a Land listing it's the single most important number. ----
  if (details.landArea === undefined || details.landArea === null || details.landArea === '') {
    errors.push('Land area is required');
  } else if (Number(details.landArea) <= 0) {
    errors.push('Land area must be greater than 0');
  }

  if (details.roadFrontage !== undefined && details.roadFrontage !== '' && Number(details.roadFrontage) < 0) {
    errors.push('Road frontage (mukh) cannot be negative');
  }

  if (isLand) {
    // ---- Land-only practical fields ----
    if (details.landType && !['residential', 'commercial', 'agricultural', 'industrial', 'other'].includes(details.landType)) {
      errors.push('Invalid land type selected');
    }
  } else {
    // ---- Building-only requirements: a house/apartment/villa/commercial
    // space listing without a built-up area or room counts isn't practically
    // useful to a buyer, so these are required (unlike for bare land). ----
    if (details.builtUpArea === undefined || details.builtUpArea === null || details.builtUpArea === '') {
      errors.push('Built-up area is required');
    } else if (Number(details.builtUpArea) <= 0) {
      errors.push('Built-up area must be greater than 0');
    }

    if (details.bedrooms === undefined || details.bedrooms === null || details.bedrooms === '') {
      errors.push('Number of bedrooms is required');
    } else if (Number(details.bedrooms) < 0 || !Number.isInteger(Number(details.bedrooms)) || Number(details.bedrooms) > 50) {
      errors.push('Bedrooms must be a whole number between 0 and 50');
    }

    if (details.bathrooms === undefined || details.bathrooms === null || details.bathrooms === '') {
      errors.push('Number of bathrooms is required');
    } else if (Number(details.bathrooms) < 0 || !Number.isInteger(Number(details.bathrooms)) || Number(details.bathrooms) > 50) {
      errors.push('Bathrooms must be a whole number between 0 and 50');
    }

    if (details.floors === undefined || details.floors === null || details.floors === '') {
      errors.push('Number of floors is required');
    } else if (Number(details.floors) < 1 || !Number.isInteger(Number(details.floors)) || Number(details.floors) > 100) {
      errors.push('Floors must be a whole number, at least 1');
    }

    if (details.parkingSpaces !== undefined && details.parkingSpaces !== '' && (Number(details.parkingSpaces) < 0 || Number(details.parkingSpaces) > 50)) {
      errors.push('Parking spaces must be between 0 and 50');
    }

    if (details.constructionYear !== undefined && details.constructionYear !== '' && details.constructionYear !== null) {
      const year = Number(details.constructionYear);
      if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR) {
        errors.push(`Construction year must be between 1900 and ${CURRENT_YEAR}`);
      }
    }
  }

  return errors;
};

module.exports = { validatePropertyInput };

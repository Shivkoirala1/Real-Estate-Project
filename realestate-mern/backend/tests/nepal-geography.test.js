// Nepal geography refactor tests (no DB required).
// Run: node --test tests/nepal-geography.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PROVINCES, DISTRICTS, LEGACY_CITIES_BY_DISTRICT } = require('../data/nepalGeography');
const geo = require('../utils/nepalGeography');
const { validatePropertyInput } = require('../utils/validateProperty');
const Property = require('../models/Property');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Minimal otherwise-valid building listing; tests override `location`.
const baseListing = (location) => ({
  title: 'Spacious family house for sale here',
  description: 'A wonderful family home near the main road with a garden and parking.',
  propertyType: '507f1f77bcf86cd799439011',
  price: 1000000,
  location,
  details: { landArea: 5, builtUpArea: 2000, bedrooms: 3, bathrooms: 2, floors: 2 },
});

describe('canonical geography data', () => {
  it('has 7 provinces and 77 districts', () => {
    assert.equal(PROVINCES.length, 7);
    assert.equal(Object.keys(DISTRICTS).length, 77);
  });

  it('uses municipalities (not cities) as the canonical district field', () => {
    for (const [name, info] of Object.entries(DISTRICTS)) {
      assert.ok(info.province, `${name} is missing a province`);
      assert.ok(Array.isArray(info.municipalities), `${name} is missing a municipalities array`);
      assert.ok(!('cities' in info), `${name} still uses the legacy cities field as canonical data`);
    }
  });

  it('keeps the legacy city lists explicitly deprecated and separate', () => {
    assert.ok(LEGACY_CITIES_BY_DISTRICT.Kathmandu.includes('Kathmandu'));
  });
});

describe('province -> district validation', () => {
  it('accepts a valid hierarchy (Bagmati Province -> Kathmandu)', () => {
    assert.equal(geo.isValidProvince('Bagmati Province'), true);
    assert.equal(geo.isValidDistrict('Bagmati Province', 'Kathmandu'), true);
    assert.deepEqual(geo.isValidLocation({ province: 'Bagmati Province', district: 'Kathmandu' }), []);
  });

  it('rejects an invalid hierarchy (Bagmati Province -> Jhapa)', () => {
    assert.equal(geo.isValidDistrict('Bagmati Province', 'Jhapa'), false);
    const errors = geo.isValidLocation({ province: 'Bagmati Province', district: 'Jhapa' });
    assert.ok(errors.some((e) => e.includes('does not belong')), `expected hierarchy error, got: ${errors}`);
  });

  it('rejects unknown provinces and missing fields', () => {
    assert.equal(geo.isValidProvince('Atlantis'), false);
    assert.ok(geo.isValidLocation({ province: '', district: '' }).length >= 2);
    assert.ok(geo.isValidLocation({ province: 'Bagmati Province', district: '' }).includes('District is required'));
  });

  it('lists districts scoped to a province', () => {
    const bagmati = geo.getDistrictsByProvince('Bagmati Province');
    assert.ok(bagmati.includes('Kathmandu') && bagmati.includes('Lalitpur'));
    assert.ok(!bagmati.includes('Jhapa'));
  });
});

describe('municipality validation', () => {
  it('enforces the verified list where one exists (Kathmandu)', () => {
    assert.equal(geo.hasVerifiedMunicipalities('Kathmandu'), true);
    assert.equal(geo.isValidMunicipality('Kathmandu', 'Kirtipur'), true);
    assert.equal(geo.isValidMunicipality('Kathmandu', 'kathmandu'), true); // case-insensitive
    assert.equal(geo.isValidMunicipality('Kathmandu', 'Not A Real Place'), false);
    assert.equal(geo.isValidMunicipality('Kathmandu', ''), true); // optional field
    assert.deepEqual(
      geo.isValidLocation({ province: 'Bagmati Province', district: 'Kathmandu', municipality: 'Kirtipur' }),
      []
    );
    const errors = geo.isValidLocation({
      province: 'Bagmati Province',
      district: 'Kathmandu',
      municipality: 'Not A Real Place',
    });
    assert.ok(errors.some((e) => e.includes('not a verified municipality')), `expected municipality error, got: ${errors}`);
  });

  it('accepts any municipality where no verified list exists yet (Rasuwa)', () => {
    assert.equal(geo.hasVerifiedMunicipalities('Rasuwa'), false);
    assert.equal(geo.isValidMunicipality('Rasuwa', 'Anything Goes Here'), true);
    assert.deepEqual(
      geo.isValidLocation({ province: 'Bagmati Province', district: 'Rasuwa', municipality: 'Anything Goes Here' }),
      []
    );
  });

  it('enforces the reference list as soon as data is added (expansion path)', () => {
    DISTRICTS.Rasuwa.municipalities.push('Uttargaya');
    try {
      assert.equal(geo.hasVerifiedMunicipalities('Rasuwa'), true);
      assert.equal(geo.isValidMunicipality('Rasuwa', 'Uttargaya'), true);
      assert.equal(geo.isValidMunicipality('Rasuwa', 'Not A Real Place'), false);
    } finally {
      DISTRICTS.Rasuwa.municipalities.pop();
    }
  });
});

describe('flexible property-location fields', () => {
  it('accepts a full real-world location with no city field', () => {
    const errors = validatePropertyInput(
      baseListing({
        province: 'Bagmati Province',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        wardNumber: '16',
        locality: 'Balaju',
        streetAddress: 'Ring Road',
        nearbyLandmark: 'Near Bhatbhateni',
      })
    );
    assert.deepEqual(errors, []);
  });

  it('has no city field at all', () => {
    const errors = validatePropertyInput(baseListing({ province: 'Bagmati Province', district: 'Kathmandu' }));
    assert.ok(!errors.some((e) => e.toLowerCase().includes('city')), `city should be gone, got: ${errors}`);
    assert.equal(Property.schema.path('location.city'), undefined);
  });

  it('rejects mismatched province/district through the property validator', () => {
    const errors = validatePropertyInput(baseListing({ province: 'Bagmati Province', district: 'Jhapa' }));
    assert.ok(errors.some((e) => e.includes('does not belong')), `expected hierarchy error, got: ${errors}`);
  });
});

describe('map coordinates', () => {
  it('accepts a valid Kathmandu pin', () => {
    assert.equal(geo.isValidMapLocation({ lat: 27.7172, lng: 85.324 }), true);
    const errors = validatePropertyInput(
      baseListing({ province: 'Bagmati Province', district: 'Kathmandu', mapLocation: { lat: 27.7172, lng: 85.324 } })
    );
    assert.deepEqual(errors, []);
  });

  it('treats missing coordinates as valid (optional)', () => {
    assert.equal(geo.isValidMapLocation(undefined), true);
    assert.equal(geo.isValidMapLocation({}), true);
    assert.deepEqual(validatePropertyInput(baseListing({ province: 'Bagmati Province', district: 'Kathmandu' })), []);
  });

  it('rejects out-of-range coordinates', () => {
    assert.equal(geo.isValidMapLocation({ lat: 200, lng: 85.324 }), false);
    const errors = validatePropertyInput(
      baseListing({ province: 'Bagmati Province', district: 'Kathmandu', mapLocation: { lat: 200, lng: 85.324 } })
    );
    assert.ok(errors.some((e) => e.includes('out of range')), `expected range error, got: ${errors}`);
  });

  it('rejects a half-pinned location', () => {
    const errors = validatePropertyInput(
      baseListing({ province: 'Bagmati Province', district: 'Kathmandu', mapLocation: { lat: 27.7172, lng: '' } })
    );
    assert.ok(errors.some((e) => e.includes('Both latitude and longitude')), `expected partial-pin error, got: ${errors}`);
  });
});

describe('Property schema location shape', () => {
  it('stores province/district as required strings with flexible detail fields', () => {
    const locationPath = (name) => Property.schema.path(`location.${name}`);
    assert.equal(locationPath('province').instance, 'String');
    assert.equal(locationPath('district').instance, 'String');
    assert.ok(locationPath('province').isRequired);
    assert.ok(locationPath('district').isRequired);
    for (const field of ['municipality', 'wardNumber', 'locality', 'streetAddress', 'nearbyLandmark']) {
      assert.equal(locationPath(field).instance, 'String', `${field} should be a String`);
      assert.ok(!locationPath(field).isRequired, `${field} should be optional`);
    }
    assert.equal(locationPath('mapLocation.lat').instance, 'Number');
    assert.equal(locationPath('mapLocation.lng').instance, 'Number');
  });

  it('no longer references District/City collections from the location', () => {
    const src = read('models/Property.js');
    assert.ok(!src.includes("ref: 'District'"), 'Property still references the District collection');
    assert.ok(!src.includes("ref: 'City'"), 'Property still references the City collection');
  });
});

describe('API layer uses the new canonical fields', () => {
  it('filters by province/district/municipality names with no location populates or city field', () => {
    const src = read('controllers/propertyController.js');
    assert.match(src, /location\.province/);
    assert.match(src, /location\.district/);
    assert.match(src, /location\.municipality/);
    assert.ok(!src.includes('location.city'), 'city field reference remains in propertyController');
    assert.ok(!src.includes(".populate('location.city'"), 'stale City populate remains');
    assert.ok(!src.includes(".populate('location.district'"), 'stale District populate remains');
  });

  it('keeps the District/City collections (backward compat) with name-based delete guards', () => {
    const categorySrc = read('models/Category.js');
    assert.match(categorySrc, /mongoose\.model\('District'/);
    assert.match(categorySrc, /mongoose\.model\('City'/);
    const controllerSrc = read('controllers/categoryController.js');
    assert.match(controllerSrc, /location\.district/);
    assert.match(controllerSrc, /location\.city/);
  });
});

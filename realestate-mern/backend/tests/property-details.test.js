// Property details tests (no DB required).
// Run: node --test tests/property-details.test.js
// Covers the optional roadType enum and the optional mapLink URL.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validatePropertyInput } = require('../utils/validateProperty');
const Property = require('../models/Property');

const baseListing = (details = {}, location = {}) => ({
  title: 'Spacious family house for sale here',
  description: 'A wonderful family home near the main road with a garden and parking.',
  propertyType: '507f1f77bcf86cd799439011',
  price: 1000000,
  location: { province: 'Bagmati Province', district: 'Kathmandu', municipality: 'Kathmandu', ...location },
  details: {
    landArea: 5, builtUpArea: 2000, bedrooms: 3, bathrooms: 2, floors: 2,
    ...details,
  },
});

describe('roadType', () => {
  it('is optional — missing or empty passes', () => {
    assert.deepEqual(validatePropertyInput(baseListing()), []);
    assert.deepEqual(validatePropertyInput(baseListing({ roadType: '' })), []);
  });

  it('accepts each known surface type', () => {
    for (const roadType of ['pitched', 'gravel', 'interlocked-tiles']) {
      assert.deepEqual(validatePropertyInput(baseListing({ roadType })), [], `rejected ${roadType}`);
    }
  });

  it('rejects unknown values', () => {
    const errors = validatePropertyInput(baseListing({ roadType: 'cobblestone' }));
    assert.ok(errors.includes('Invalid road type selected'), `got: ${errors}`);
  });

  it('schema constrains details.roadType to the enum with empty default', () => {
    const pathType = Property.schema.path('details.roadType');
    assert.ok(pathType, 'details.roadType missing from schema');
    assert.deepEqual([...pathType.enumValues].sort(), ['', 'gravel', 'interlocked-tiles', 'pitched']);
    assert.equal(pathType.options.default, '');
    assert.ok(!pathType.isRequired, 'roadType must be optional');
  });
});

describe('mapLink', () => {
  it('is optional — missing or empty passes', () => {
    assert.deepEqual(validatePropertyInput(baseListing()), []);
    assert.deepEqual(validatePropertyInput(baseListing({}, { mapLink: '' })), []);
  });

  it('accepts Google Maps share links', () => {
    for (const mapLink of [
      'https://maps.app.goo.gl/abc123',
      'https://www.google.com/maps/place/Kathmandu',
      'http://maps.google.com/?q=27.7,85.3',
    ]) {
      assert.deepEqual(validatePropertyInput(baseListing({}, { mapLink })), [], `rejected ${mapLink}`);
    }
  });

  it('rejects non-URL strings', () => {
    const errors = validatePropertyInput(baseListing({}, { mapLink: 'not a link' }));
    assert.ok(errors.includes('Map link must be a valid URL starting with http(s)://'), `got: ${errors}`);
  });

  it('schema carries an optional trimmed mapLink string', () => {
    const pathType = Property.schema.path('location.mapLink');
    assert.ok(pathType, 'location.mapLink missing from schema');
    assert.equal(pathType.instance, 'String');
    assert.ok(!pathType.isRequired, 'mapLink must be optional');
  });
});

const mongoose = require('mongoose');
const slugify = require('slugify');

const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Property title is required'], trim: true },
    slug: { type: String, unique: true },
    description: { type: String, required: [true, 'Property description is required'] },

    propertyType: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyType', required: true },
    saleType: { type: String, enum: ['sale', 'rent', 'management'], default: 'sale' }, // exactly one purpose: sale | rent | management

    // Management-purpose properties carry no asking price (validatePropertyInput
    // enforces the same rule above schema level with friendlier errors).
    price: { type: Number, required: [function () { return this.saleType !== 'management'; }, 'Price is required'] },
    currency: { type: String, default: 'NPR', enum: ['NPR'] }, // platform is NPR-only by design
    negotiable: { type: Boolean, default: false },
    // Spec v2 (Feature 2): optional commission override % for this specific
    // listing. When set, it takes precedence over the parent PropertyType's
    // defaultCommissionPercentage (e.g. a distressed sale the owner wants
    // to move faster). Left null, the property type default applies.
    commissionPercentage: {
      type: Number,
      min: [0, 'Commission percentage cannot be negative'],
      max: [100, 'Commission percentage cannot exceed 100'],
      default: null,
    },

    // Canonical location: Province -> District -> Municipality, with
    // flexible per-property detail (ward / locality-tole / street /
    // landmark / map pin). Province, district and (where verified data
    // exists) municipality are controlled reference data (see
    // backend/data/nepalGeography.js); everything below is free-text
    // describing this specific property.
    location: {
      country: { type: String, default: 'Nepal' },
      province: { type: String, required: [true, 'Province is required'], trim: true },
      district: { type: String, required: [true, 'District is required'], trim: true },
      municipality: { type: String, default: '', trim: true },
      wardNumber: { type: String, default: '', trim: true },
      locality: { type: String, default: '', trim: true },
      streetAddress: { type: String, default: '', trim: true },
      nearbyLandmark: { type: String, default: '', trim: true },
      mapLocation: {
        lat: { type: Number, min: -90, max: 90 },
        lng: { type: Number, min: -180, max: 180 },
      },
      // Optional Google Maps share link (e.g. https://maps.app.goo.gl/…),
      // kept alongside the embedded Leaflet pin for one-tap directions.
      mapLink: { type: String, default: '', trim: true },
    },

    details: {
      landArea: { type: Number, default: 0 },
      landAreaUnit: { type: String, default: 'sq. ft.' },
      // Land-specific: the plot/parcel number from the land record ("kitta
      // number" in Nepal) and how the land is currently classified for use.
      kittaNumber: { type: String, default: '' },
      landType: {
        type: String,
        enum: ['', 'residential', 'commercial', 'agricultural', 'industrial', 'other'],
        default: '',
      },
      builtUpArea: { type: Number, default: 0 },
      bedrooms: { type: Number, default: 0 },
      bathrooms: { type: Number, default: 0 },
      floors: { type: Number, default: 0 },
      parkingSpaces: { type: Number, default: 0 },
      facingDirection: { type: String, default: '' },
      roadAccess: { type: String, default: '' },
      // Surface material of the access road (optional). Kept separate from
      // the free-text roadAccess ("13 ft blacktopped") so it stays
      // filterable; roadAccess keeps width/condition detail.
      roadType: {
        type: String,
        enum: ['', 'pitched', 'gravel', 'interlocked-tiles'],
        default: '',
      },
      // "Mukh" - the width of the land facing the road, a detail Nepali land
      // buyers routinely ask about (e.g. "20 feet mukh").
      roadFrontage: { type: Number, default: 0 },
      roadFrontageUnit: { type: String, enum: ['ft', 'm'], default: 'ft' },
      waterSupply: { type: Boolean, default: false },
      electricity: { type: Boolean, default: false },
      internetAvailability: { type: Boolean, default: false },
      furnishedStatus: {
        type: String,
        enum: ['unfurnished', 'semi-furnished', 'fully-furnished'],
        default: 'unfurnished',
      },
      constructionYear: { type: Number },
    },

    media: {
      coverImage: { type: String, default: '' },
      images: [{ type: String }],
      video: { type: String, default: '' },
    },

status: {
  type: String,
  enum: ['available', 'reserved', 'sold', 'rented'],
  default: 'available',
},

    // Policy of record: there is currently no approval workflow -
    // listings go live immediately (isApproved defaults true and no
    // controller ever clears it). isFeatured is a manual marketing flag
    // (filterable on list); isArchived feeds the cold-storage archival job.
    isApproved: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },

    views: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },

    listedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    soldAt: { type: Date, default: null },
    // Current-occupancy snapshot for the rental flow (set on Rental
    // verification, cleared only by the explicit end-tenancy action). The
    // verified Rental document remains the source of truth for the
    // historical transaction.
    rentedFrom: { type: Date, default: null },
    rentedUntil: { type: Date, default: null },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

propertySchema.pre('validate', function (next) {
  // Only (re)generate the slug when the property is being created or its
  // title has actually changed. Previously this ran on *every* save
  // (including the view-count bump on each detail-page visit), which
  // silently rewrote the slug with a new timestamp each time - breaking
  // any link that had already been shared or cached with the old slug.
  if (this.title && (this.isNew || this.isModified('title'))) {
    this.slug = slugify(this.title, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-6);
  }
  next();
});

propertySchema.index({ title: 'text', description: 'text' });
propertySchema.index({ price: 1 });
propertySchema.index({ status: 1 });
// Cold-storage job scans exactly this shape (soft-archived listings past their age cutoff)
propertySchema.index({ isArchived: 1, updatedAt: 1 });

// Single source of truth for whether a listing still accepts new inquiries
// and visit requests. Only 'sold' blocks - 'reserved' stays open by design.
propertySchema.methods.canReceiveInquiries = function () {
  return this.status !== 'sold';
};

module.exports = mongoose.model('Property', propertySchema);

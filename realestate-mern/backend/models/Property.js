const mongoose = require('mongoose');
const slugify = require('slugify');

const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Property title is required'], trim: true },
    slug: { type: String, unique: true },
    description: { type: String, required: [true, 'Property description is required'] },

    propertyType: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyType', required: true },
    saleType: { type: String, enum: ['sale', 'rent'], default: 'sale' },

    price: { type: Number, required: [true, 'Price is required'] },
    currency: { type: String, default: 'NPR', enum: ['NPR'] }, // platform is NPR-only by design
    negotiable: { type: Boolean, default: false },

    location: {
      country: { type: String, default: 'Nepal' },
      province: { type: String, default: '' },
      district: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
      city: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
      municipality: { type: String, default: '' },
      wardNumber: { type: String, default: '' },
      streetAddress: { type: String, default: '' },
      mapLocation: {
        lat: { type: Number },
        lng: { type: Number },
      },
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
      enum: ['available', 'reserved', 'sold'],
      default: 'available',
    },

    isApproved: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },

    views: { type: Number, default: 0 },

    listedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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

module.exports = mongoose.model('Property', propertySchema);

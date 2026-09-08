const mongoose = require('mongoose');

const propertyTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    // Drives which of the two posting forms (Land vs House/Apartment/etc.)
    // applies to this type, and which fields are required for it.
    category: { type: String, enum: ['land', 'building'], default: 'building' },
    // Spec v2 (Feature 2): default flat commission % of sale price for sales
    // of this property type (e.g. Land = 2%, Apartment = 1.5%). Overridable
    // per-property via Property.commissionPercentage.
    defaultCommissionPercentage: {
      type: Number,
      min: [0, 'Commission percentage cannot be negative'],
      max: [100, 'Commission percentage cannot exceed 100'],
      default: 0,
    },
  },
  { timestamps: true }
);

const districtSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    province: { type: String, default: '' },
  },
  { timestamps: true }
);

const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    district: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
  },
  { timestamps: true }
);

const PropertyType = mongoose.model('PropertyType', propertyTypeSchema);
const District = mongoose.model('District', districtSchema);
const City = mongoose.model('City', citySchema);

module.exports = { PropertyType, District, City };

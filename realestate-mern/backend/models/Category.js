const mongoose = require('mongoose');

const propertyTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    // Drives which of the two posting forms (Land vs House/Apartment/etc.)
    // applies to this type, and which fields are required for it.
    category: { type: String, enum: ['land', 'building'], default: 'building' },
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

const mongoose = require('mongoose');

// Singleton site configuration (key === 'site'): office contact/location
// and public social links, editable by admins through the admin portal.
// Display-only v1: powers the footer, office map pin and social rail.
// Nothing backend-facing reads these (contact forms notify in-app).
const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site' },
    office: {
      address: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true, lowercase: true },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    socials: {
      facebook: { type: String, default: '', trim: true },
      tiktok: { type: String, default: '', trim: true },
      instagram: { type: String, default: '', trim: true },
      youtube: { type: String, default: '', trim: true },
      whatsapp: { type: String, default: '', trim: true },
    },
    // Listing terms & policies text (admin-editable). Every new property
    // listing requires the creator's acceptance of the published text.
    policies: { type: String, default: '' },
    policiesUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSetting', siteSettingSchema);

const mongoose = require('mongoose');

// Admin-managed catalogue of management services. Requests snapshot
// service *names* as plain strings at submission time, so deactivating or
// renaming a service here never alters what a historical request displays.
const managementServiceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      unique: true,
      trim: true,
      maxlength: [80, 'Service name must be under 80 characters'],
    },
    description: { type: String, default: '', trim: true, maxlength: [500, 'Description must be under 500 characters'] },
    // Soft-deactivate: hidden from owner selection, historical requests keep
    // displaying the snapshotted name.
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ManagementService', managementServiceSchema);

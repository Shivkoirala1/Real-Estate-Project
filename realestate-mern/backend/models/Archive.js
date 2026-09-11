const mongoose = require('mongoose');

/**
 * Archive - generic cold storage for records moved out of their hot
 * collection (Property, Sale, EMIPlan, ...).
 *
 * Why one generic collection instead of `archivedproperties`,
 * `archivedsales`, etc.: the source schemas change over time, and a
 * mirrored schema per archive collection means every model migration has
 * to be duplicated forever. Storing the original document as `data`
 * (Mixed) means archiving code needs zero schema maintenance - it's a
 * faithful snapshot, not a re-typed copy. The trade-off is you lose
 * Mongoose-level querying *inside* `data` (no `.find({ 'data.status':
 * 'sold' })` with validation) - acceptable here because archives are
 * looked up by id, not queried by business fields.
 *
 * One document per archived record. `entityType` + `originalId` is
 * unique - a record can only be archived once at a time (it must be
 * restored before it can be archived again).
 */
const ARCHIVABLE_TYPES = ['property', 'sale', 'emiPlan'];

const archiveSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ARCHIVABLE_TYPES, required: true },
    originalId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Faithful snapshot of the original document (result of .toObject()
    // at archive time), plus a couple of denormalized fields so the admin
    // archive browser can render a list without rehydrating every payload.
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    summary: {
      title: { type: String, default: '' }, // property title / a short label
      relatedIds: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { buyer, agent, property }
    },

    archivedAt: { type: Date, default: Date.now },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system job
    reason: { type: String, default: '' },

    restoredAt: { type: Date, default: null },
    restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Restored records are kept (restoredAt set) rather than deleted, so the
// unique index only applies to the *currently archived* copy of a record.
archiveSchema.index(
  { entityType: 1, originalId: 1 },
  { unique: true, partialFilterExpression: { restoredAt: null } }
);
archiveSchema.index({ entityType: 1, archivedAt: -1 });

archiveSchema.statics.TYPES = ARCHIVABLE_TYPES;

module.exports = mongoose.model('Archive', archiveSchema);

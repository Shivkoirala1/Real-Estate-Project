const mongoose = require('mongoose');

// Upload resource / ownership record (direct-upload migration, decision
// §14.3). Each server-authorized direct upload gets exactly one row. Entity
// writes reference uploadIds — never bare URLs — and the backend commits
// only rows it can prove were authorized for (user, purpose, session).
const uploadSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadSession', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: {
      type: String,
      enum: [
        'property-image',
        'property-cover',
        'hero-media',
        'hero-thumbnail',
        'blog-cover',
        'avatar',
        'verification-document',
        'emi-slip',
        'innovation-image',
        'innovation-video',
      ],
      required: true,
    },
    // Server-generated, unique per sign — the client can neither choose nor
    // guess another user's namespace.
    publicId: { type: String, required: true, unique: true },
    folder: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video'], default: 'image' },
    // Public delivery (type:upload) vs restricted (type:private). Private
    // assets are viewed only via backend-minted short-lived URLs.
    deliveryType: { type: String, enum: ['public', 'private'], default: 'public' },
    status: {
      type: String,
      enum: ['pending', 'completed', 'committed', 'deleted'],
      default: 'pending',
      index: true,
    },
    // Advisory client-reported metadata from the complete call (plausibility
    // checked, never authoritative — see services/uploadService.js).
    clientMeta: {
      bytes: { type: Number, default: null },
      format: { type: String, default: '' },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
      duration: { type: Number, default: null },
    },
    // Snapshot of the purpose policy at sign time (for audit + sweeper).
    maxBytes: { type: Number, required: true },
    // Optional server-set binding for purposes tied to a specific business
    // record (Phase 4: emi-slip binds planId at sign time so commit can
    // prove the upload belongs to the same plan being submitted — the
    // client can neither choose nor alter it).
    context: {
      planId: { type: mongoose.Schema.Types.ObjectId, ref: 'EMIPlan', default: null },
      label: { type: String, default: '' },
    },
    // Set at commit time.
    committedTo: {
      entityType: { type: String, default: '' },
      entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    // Deferred-destroy queue (decision §14.3): entity updates never wait on
    // Cloudinary; failures stay queued for the sweeper.
    destroyQueued: { type: Boolean, default: false },
    destroyAttempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Sweeper + ownership lookups. Deliberately NO TTL index: uncommitted rows
// must trigger Cloudinary destroy first (a storage-engine delete can't).
uploadSchema.index({ status: 1, expiresAt: 1 });
uploadSchema.index({ userId: 1, status: 1 });
uploadSchema.index({ destroyQueued: 1, destroyAttempts: 1 });

module.exports = mongoose.model('Upload', uploadSchema);

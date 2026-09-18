const mongoose = require('mongoose');

// HeroSlide: admin-managed homepage carousel content.
//
// Content (title/media/CTA/schedule/order) lives here; the carousel UI and
// the homepage only present it. Publication state is `draft | published`
// and the *effective* display state (scheduled/active/expired) is derived
// from startAt/endAt at read time — never stored.
const heroSlideSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Slide title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    subtitle: {
      type: String,
      trim: true,
      maxlength: [160, 'Subtitle cannot exceed 160 characters'],
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },

    media: {
      type: {
        type: String,
        enum: ['image', 'video'],
        required: [true, 'Media type is required'],
      },
      url: {
        type: String,
        required: [true, 'Media URL is required'],
      },
      // Cloudinary identifiers for replacement/deletion. Never exposed
      // through the public endpoint.
      publicId: { type: String, default: null },
      thumbnailUrl: { type: String, default: null },
      thumbnailPublicId: { type: String, default: null },
      altText: {
        type: String,
        trim: true,
        maxlength: [160, 'Alt text cannot exceed 160 characters'],
        default: '',
      },
    },

    cta: {
      enabled: { type: Boolean, default: false },
      label: {
        type: String,
        trim: true,
        maxlength: [40, 'CTA label cannot exceed 40 characters'],
        default: '',
      },
      actionType: {
        type: String,
        enum: ['property', 'url', 'none'],
        default: 'none',
      },
      // Property ObjectId (as string) when actionType is 'property',
      // external URL when 'url', empty when 'none'.
      actionValue: { type: String, trim: true, default: '' },
    },

    // Optional promoted property. Eligibility (exists, approved,
    // not archived, saleable status) is enforced in the controller —
    // a slide whose property stops being promotable is excluded from
    // the public feed rather than linking somewhere stale.
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },

    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    displayOrder: {
      type: Number,
      default: 0,
      min: [0, 'Display order cannot be negative'],
    },
    duration: {
      type: Number,
      default: 5,
      min: [3, 'Duration must be at least 3 seconds'],
      max: [60, 'Duration cannot exceed 60 seconds'],
    },

    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// A slide with both bounds must have start strictly before end.
heroSlideSchema.pre('validate', function (next) {
  if (this.startAt && this.endAt && this.startAt >= this.endAt) {
    this.invalidate('endAt', 'End date must be after the start date');
  }
  next();
});

// Primary public query: published + schedule-eligible, ordered for display.
heroSlideSchema.index({ status: 1, startAt: 1, endAt: 1, displayOrder: 1 });

module.exports = mongoose.model('HeroSlide', heroSlideSchema);

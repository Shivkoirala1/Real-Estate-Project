const mongoose = require('mongoose');

// InnovationIdea - user-submitted community innovation ideas.
//
// V1 is simple CRUD + visibility moderation: verified users submit ideas
// that are immediately public (isVisible defaults to true). Admins can
// later hide/show or delete. There is no approval workflow, no featured
// curation, and no engagement (likes/comments) in V1.
//
// Media lifecycle (uploads, commit, cleanup) is owned by the existing
// direct-upload infrastructure - this model stores only the committed
// Cloudinary URLs, never upload-session metadata.
const innovationIdeaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'housing',
        'construction',
        'sustainability',
        'smart-home',
        'financing',
        'community',
        'other',
      ],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [20, 'Description must be at least 20 characters'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },

    // Committed Cloudinary image URLs. At most 5 per idea (V1 limit).
    // images[0] is treated as the cover image - no separate cover field.
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length <= 5,
        message: 'An idea can have at most 5 images',
      },
    },

    // Single committed Cloudinary video URL (V1 limit: 1 video).
    videoUrl: { type: String, default: null },

    // Cloudinary-derived poster/thumbnail for the video. Never uploaded
    // as a separate asset in V1.
    videoThumbnail: { type: String, default: null },

    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Submitted by is required'],
    },

    // Admin moderation - hidden ideas stay in the DB but are excluded
    // from the public listing, homepage section, and single-read for
    // anyone except the owner and admins. The controller must force
    // new submissions to true (no approval workflow in V1).
    isVisible: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

// Public latest-ideas queries: visible ideas, newest first.
innovationIdeaSchema.index({ isVisible: 1, createdAt: -1 });
// Owner management queries: a user's own ideas, newest first.
innovationIdeaSchema.index({ submittedBy: 1, createdAt: -1 });

module.exports = mongoose.model('InnovationIdea', innovationIdeaSchema);

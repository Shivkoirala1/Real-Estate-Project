const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary using your .env / Render environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Property photos storage (cover image + gallery)
const propertyStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'shram-sewa/properties', // folder name inside your Cloudinary account
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  },
});

// Property photos (cover image + gallery). Images only - video for a
// listing is handled as a separate URL field (e.g. a YouTube link), never
// as an uploaded file, so there is no legitimate reason to accept a video
// file here.
const propertyImageFileFilter = (req, file, cb) => {
  const isImageMime = file.mimetype.startsWith('image/');
  if (isImageMime) {
    cb(null, true);
  } else {
    const err = new Error('Only photo files (JPG, PNG, WEBP, GIF) are allowed - videos are not supported here');
    err.statusCode = 400;
    cb(err, false);
  }
};

const upload = multer({
  storage: propertyStorage,
  fileFilter: propertyImageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file - property photos
});

// Identity documents storage (selfie + citizenship front/back)
const verificationStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'shram-sewa/verification',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

// Identity documents are capped much smaller and restricted to images only -
// there's no legitimate reason for an ID photo to be a 10MB file.
const verificationFileFilter = (req, file, cb) => {
  const isImage = file.mimetype.startsWith('image/');
  if (isImage) {
    cb(null, true);
  } else {
    const err = new Error('Only PNG, JPG, or WEBP image files are allowed for identity documents');
    err.statusCode = 400;
    cb(err, false);
  }
};

const uploadVerification = multer({
  storage: verificationStorage,
  fileFilter: verificationFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB per file
});

// EMI payment-slip photos (buyer's proof of payment for a single installment)
const paymentSlipStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'shram-sewa/emi-payment-slips',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

// Images only, capped small - this is a single receipt/slip photo, not a gallery.
const paymentSlipFileFilter = (req, file, cb) => {
  const isImage = file.mimetype.startsWith('image/');
  if (isImage) {
    cb(null, true);
  } else {
    const err = new Error('Only PNG, JPG, or WEBP image files are allowed for payment slips');
    err.statusCode = 400;
    cb(err, false);
  }
};

const uploadPaymentSlip = multer({
  storage: paymentSlipStorage,
  fileFilter: paymentSlipFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
});

// Hero-slide media (admin-managed homepage carousel).
//
// Images reuse the property-style image pipeline. Videos need an explicit
// `resource_type: 'video'` store — the default CloudinaryStorage is
// image-only, which is why no existing upload path accepts video files.
// A single storage with per-file params routes thumbnails/images to the
// image pipeline and video files to the video pipeline.
const heroStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    if (file.fieldname === 'thumbnail' || file.mimetype.startsWith('image/')) {
      return {
        folder: 'shram-sewa/hero-slides/images',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      };
    }
    return {
      folder: 'shram-sewa/hero-slides/videos',
      resource_type: 'video',
      allowed_formats: ['mp4', 'webm', 'mov'],
    };
  },
});

// `media` accepts one image or one video; `thumbnail` accepts one image
// (loading/poster frame, recommended for video slides).
const heroFileFilter = (req, file, cb) => {
  if (file.fieldname === 'thumbnail') {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    const err = new Error('Only PNG, JPG, WEBP or GIF image files are allowed for thumbnails');
    err.statusCode = 400;
    return cb(err, false);
  }
  if (file.fieldname === 'media') {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      return cb(null, true);
    }
    const err = new Error('Only image (JPG, PNG, WEBP, GIF) or video (MP4, WebM, MOV) files are allowed for hero media');
    err.statusCode = 400;
    return cb(err, false);
  }
  const err = new Error(`Unexpected file field: ${file.fieldname}`);
  err.statusCode = 400;
  return cb(err, false);
};

// 50MB cap covers video; images are additionally capped to 10MB in the
// controller (consistent with property photos) with best-effort cleanup.
const uploadHero = multer({
  storage: heroStorage,
  fileFilter: heroFileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

module.exports = upload;
module.exports.verification = uploadVerification;
module.exports.paymentSlip = uploadPaymentSlip;
module.exports.hero = uploadHero;
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

module.exports = upload;
module.exports.verification = uploadVerification;
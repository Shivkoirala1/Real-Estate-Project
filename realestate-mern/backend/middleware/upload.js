const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// Property photos (cover image + gallery). Images only - video for a
// listing is handled as a separate URL field (e.g. a YouTube link), never
// as an uploaded file, so there is no legitimate reason to accept a video
// file here. Both extension AND mimetype are checked so a renamed file
// (e.g. clip.mp4 renamed to clip.jpg) is still caught.
const propertyImageFileFilter = (req, file, cb) => {
  const allowedExt = /jpeg|jpg|png|webp|gif/;
  const isImageExt = allowedExt.test(path.extname(file.originalname).toLowerCase());
  const isImageMime = file.mimetype.startsWith('image/');

  if (isImageExt && isImageMime) {
    cb(null, true);
  } else {
    const err = new Error('Only photo files (JPG, PNG, WEBP, GIF) are allowed - videos are not supported here');
    err.statusCode = 400;
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter: propertyImageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file - property photos
});

// Identity documents (selfie + citizenship front/back) are capped much
// smaller and restricted to images only - there's no legitimate reason for
// an ID photo to be a 10MB file, and it keeps the uploads folder in check.
const verificationFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const isImage = allowedTypes.test(path.extname(file.originalname).toLowerCase()) && file.mimetype.startsWith('image/');
  if (isImage) {
    cb(null, true);
  } else {
    const err = new Error('Only PNG, JPG, or WEBP image files are allowed for identity documents');
    err.statusCode = 400;
    cb(err, false);
  }
};

const uploadVerification = multer({
  storage,
  fileFilter: verificationFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB per file
});

module.exports = upload;
module.exports.verification = uploadVerification;

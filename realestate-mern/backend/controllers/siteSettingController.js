const SiteSetting = require('../models/SiteSetting');
const asyncHandler = require('../utils/asyncHandler');

// Seed = the values previously hardcoded in the frontend (Footer OFFICE +
// footer/rail social links), so deploying this changes nothing visually
// until an admin saves new values. WhatsApp stays empty (icon hidden).
const DEFAULT_SETTINGS = {
  office: {
    address: 'Itahari Ward No. 6, Itahari, Koshi Province',
    phone: '+977 982-6031844',
    email: 'youthrealestate6@gmail.com',
    lat: 26.6637,
    lng: 87.2779,
  },
  socials: {
    facebook: 'https://www.facebook.com/share/1Er4dykkTo/',
    tiktok: 'https://www.tiktok.com/@youth_real_estate_5?_r=1&_t=ZS-99gxZruylGi',
    instagram: '',
    youtube: '',
    whatsapp: '',
  },
};

const SOCIAL_KEYS = ['facebook', 'tiktok', 'instagram', 'youtube', 'whatsapp'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getOrSeed = async () => {
  let doc = await SiteSetting.findOne({ key: 'site' });
  if (!doc) {
    doc = await SiteSetting.create({ key: 'site', ...DEFAULT_SETTINGS });
  }
  return doc;
};

// @desc    Public site contact/location/social details
// @route   GET /api/site-settings
// @access  Public
const getSiteSettings = asyncHandler(async (req, res) => {
  const doc = await getOrSeed();
  res.json({ success: true, settings: doc });
});

// @desc    Update site contact/location/social details
// @route   PUT /api/site-settings
// @access  Private (admin)
const updateSiteSettings = asyncHandler(async (req, res) => {
  const { office = {}, socials = {} } = req.body || {};

  if (office.email !== undefined && office.email !== '' && !EMAIL_RE.test(String(office.email))) {
    return res.status(400).json({ success: false, message: 'Office email must be a valid email address.' });
  }
  for (const key of ['lat', 'lng']) {
    if (office[key] !== undefined && office[key] !== null && office[key] !== '') {
      const num = Number(office[key]);
      const range = key === 'lat' ? [-90, 90] : [-180, 180];
      if (!Number.isFinite(num) || num < range[0] || num > range[1]) {
        return res.status(400).json({ success: false, message: `Office ${key} must be between ${range[0]} and ${range[1]}.` });
      }
    }
  }
  for (const key of SOCIAL_KEYS) {
    const url = socials[key];
    if (url !== undefined && url !== '' && !/^https:\/\/.+\..+/.test(String(url).trim())) {
      return res.status(400).json({ success: false, message: `Social link "${key}" must be empty or a valid https:// URL.` });
    }
  }

  const doc = await getOrSeed();
  for (const key of ['address', 'phone', 'email']) {
    if (office[key] !== undefined) doc.office[key] = String(office[key]).trim();
  }
  for (const key of ['lat', 'lng']) {
    if (office[key] !== undefined) {
      doc.office[key] = office[key] === '' || office[key] === null ? null : Number(office[key]);
    }
  }
  for (const key of SOCIAL_KEYS) {
    if (socials[key] !== undefined) doc.socials[key] = String(socials[key]).trim();
  }
  await doc.save();

  res.json({ success: true, message: 'Site settings updated', settings: doc });
});

module.exports = { getSiteSettings, updateSiteSettings, DEFAULT_SETTINGS };

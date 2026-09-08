const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { levelForXp } = require('../utils/rewardLevels');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'agent'],
      default: 'user',
    },
    // Spec v2 (Phase 4): small profile for role='agent'. No commission-rate
    // field here on purpose - commission lives on Property/PropertyType.
    agentProfile: {
      licenseNumber: { type: String, default: '', trim: true }, // e.g. real-estate broker license
      employeeId: { type: String, default: '', trim: true }, // internal staff/employee ID
      joinedAt: { type: Date, default: null }, // date the agent joined the agency
    },
    avatar: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Email verification - required before a user can log in at all
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationCodeHash: {
      type: String,
      select: false,
      default: null,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    // Forgot-password flow
    passwordResetCodeHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // Phone verification - optional (unlike email, phone is not required to
    // use the account), rewarded separately once confirmed.
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerificationCodeHash: {
      type: String,
      select: false,
      default: null,
    },
    phoneVerificationExpires: {
      type: Date,
      select: false,
    },

    // Birthday - optional, used only for the annual birthday coin bonus
    dateOfBirth: {
      type: Date,
      default: null,
    },

    // Identity verification - required before a user is allowed to post a property
    selfiePhoto: {
      type: String, // captured live via device camera at registration
      default: '',
    },
    citizenshipPhotoFront: {
      type: String, // photo/scan of the front of the citizenship / national ID document
      default: '',
    },
    citizenshipPhotoBack: {
      type: String, // photo/scan of the back of the citizenship / national ID document
      default: '',
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    verificationNote: {
      type: String, // optional reason, mainly used on rejection
      default: '',
    },
    verifiedAt: {
      type: Date,
    },

    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
      },
    ],

    // Youth Rewards - XP is lifetime/cumulative and never decreases (it
    // determines level). ycCoin is the spendable Youth Coin balance.
    xp: { type: Number, default: 0 },
    ycCoin: { type: Number, default: 0 },

    // Referrals - every user gets a unique code (generated below) they can
    // share; referredBy is set at registration time if the new user signed
    // up with someone else's code.
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Daily login streak tracking
    lastLoginDate: { type: Date, default: null }, // start of day (UTC) of the most recent login
    loginStreak: { type: Number, default: 0 },
    lastStreakMilestone: { type: Number, default: 0 }, // highest streak-of-7 multiple already rewarded

    // Which year's birthday bonus has already been paid out, so it's only
    // ever awarded once per calendar year.
    lastBirthdayBonusYear: { type: Number, default: null },
  },
  { timestamps: true }
);

// Generates a short, human-shareable referral code the first time a user is
// created, e.g. "RAM4F82". Retries on the rare collision.
userSchema.pre('save', async function (next) {
  if (this.referralCode || !this.isNew) return next();
  const base = (this.name || 'YRE').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const candidate = `${base}${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await mongoose.models.User.findOne({ referralCode: candidate });
    if (!exists) {
      this.referralCode = candidate;
      break;
    }
  }
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  obj.level = levelForXp(obj.xp || 0);
  return obj;
};

module.exports = mongoose.model('User', userSchema);

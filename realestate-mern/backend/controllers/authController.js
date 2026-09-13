const User = require('../models/User');
const generateToken = require('../utils/generateToken').generateToken;
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/sendEmail');
const sendSMS = require('../utils/sendSMS');
const { generateCode, hashCode, CODE_TTL_MS } = require('../utils/otp');
const { awardReward } = require('../utils/rewards');

const normalizeEmail = (email = '') => email.toLowerCase().trim();

const sendVerificationEmail = async (user) => {
  const { code, hash } = generateCode();
  user.emailVerificationCodeHash = hash;
  user.emailVerificationExpires = new Date(Date.now() + CODE_TTL_MS);
  await user.save();

  await sendEmail({
    to: user.email,
    subject: 'Verify your Youth Real Estate email address',
    text: `Your verification code is ${code}. It expires in 15 minutes.`,
    html: `<p>Hi ${user.name},</p><p>Your Youth Real Estate email verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 15 minutes. If you didn't create this account, you can ignore this email.</p>`,
  });
};

// @desc    Register a new user (public - requires selfie + citizenship photo for verification)
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, referralCode } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required' });
  }

  const files = req.files || {};
  const selfiePhoto = files.selfiePhoto ? files.selfiePhoto[0].path : '';
  const citizenshipPhotoFront = files.citizenshipPhotoFront ? files.citizenshipPhotoFront[0].path : '';
  const citizenshipPhotoBack = files.citizenshipPhotoBack ? files.citizenshipPhotoBack[0].path : '';

  if (!selfiePhoto || !citizenshipPhotoFront || !citizenshipPhotoBack) {
    return res.status(400).json({
      success: false,
      message: 'A live camera selfie and both sides (front and back) of your citizenship/ID photo are required to register',
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists' });
  }

  // Referral code is optional. An invalid/unknown code is silently ignored
  // rather than blocking registration - referral rewards just won't apply.
  let referredBy = null;
  if (referralCode && referralCode.trim()) {
    const referrer = await User.findOne({ referralCode: referralCode.trim().toUpperCase() });
    if (referrer) referredBy = referrer._id;
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    phone: phone || '',
    role: 'user',
    selfiePhoto,
    citizenshipPhotoFront,
    citizenshipPhotoBack,
    verificationStatus: 'pending',
    isEmailVerified: false,
    referredBy,
  });

  await sendVerificationEmail(user);

  // Deliberately no token/user returned here - the account can't be used to
  // sign in until the emailed code is confirmed via /auth/verify-email.
  res.status(201).json({
    success: true,
    requiresVerification: true,
    email: user.email,
    message: 'Registration submitted. Check your email for a 6-digit verification code to activate your account.',
  });
});

// @desc    Confirm the emailed 6-digit code and activate the account
// @route   POST /api/auth/verify-email
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and code are required' });
  }

  const user = await User.findOne({ email: normalizeEmail(email) }).select(
    '+emailVerificationCodeHash +emailVerificationExpires'
  );
  if (!user) return res.status(404).json({ success: false, message: 'No account found for this email' });

  if (user.isEmailVerified) {
    return res.status(400).json({ success: false, message: 'This email is already verified. Please sign in.' });
  }

  if (!user.emailVerificationCodeHash || !user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    return res.status(400).json({ success: false, message: 'This code has expired. Please request a new one.' });
  }

  if (hashCode(code) !== user.emailVerificationCodeHash) {
    return res.status(400).json({ success: false, message: 'Incorrect verification code' });
  }

  user.isEmailVerified = true;
  user.emailVerificationCodeHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  // Account registration only counts once the email is confirmed (an
  // unverified account isn't a "real" account yet), so both the
  // registration and the verification reward are granted at this point.
  await awardReward(user._id, 'ACCOUNT_REGISTER');
  await awardReward(user._id, 'EMAIL_VERIFY');

  // If this account was referred, the referrer earns their reward now too -
  // once the referred friend's account is actually real (email verified).
  if (user.referredBy) {
    await awardReward(user.referredBy, 'REFERRAL_ACCOUNT', { refId: user._id, refModel: 'User' });
  }

  const rewardedUser = await User.findById(user._id);

  const token = generateToken(user._id, user.role);
  res.json({
    success: true,
    token,
    user: rewardedUser.toSafeObject(),
    message: 'Email verified successfully. Welcome to Youth Real Estate!',
  });
});

// @desc    Resend the email verification code (e.g. it expired or the email was lost)
// @route   POST /api/auth/resend-verification
// @access  Public
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) return res.status(404).json({ success: false, message: 'No account found for this email' });
  if (user.isEmailVerified) {
    return res.status(400).json({ success: false, message: 'This email is already verified. Please sign in.' });
  }

  await sendVerificationEmail(user);
  res.json({ success: true, message: 'A new verification code has been sent to your email' });
});

// @desc    Send a 6-digit code to the logged-in user's phone number to verify it
// @route   POST /api/auth/send-phone-otp
// @access  Private
const sendPhoneOtp = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user.phone) {
    return res.status(400).json({ success: false, message: 'Add a phone number to your profile first' });
  }
  if (user.isPhoneVerified) {
    return res.status(400).json({ success: false, message: 'Your phone number is already verified' });
  }

  const { code, hash } = generateCode();
  user.phoneVerificationCodeHash = hash;
  user.phoneVerificationExpires = new Date(Date.now() + CODE_TTL_MS);
  await user.save();

  await sendSMS({
    to: user.phone,
    message: `Your Youth Real Estate phone verification code is ${code}. It expires in 15 minutes.`,
  });

  res.json({ success: true, message: 'A verification code has been sent to your phone' });
});

// @desc    Confirm the SMS'd 6-digit code and mark the phone as verified
// @route   POST /api/auth/verify-phone
// @access  Private
const verifyPhone = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'Code is required' });

  const user = await User.findById(req.user._id).select('+phoneVerificationCodeHash +phoneVerificationExpires');

  if (user.isPhoneVerified) {
    return res.status(400).json({ success: false, message: 'Your phone number is already verified' });
  }
  if (!user.phoneVerificationCodeHash || !user.phoneVerificationExpires || user.phoneVerificationExpires < new Date()) {
    return res.status(400).json({ success: false, message: 'This code has expired. Please request a new one.' });
  }
  if (hashCode(code) !== user.phoneVerificationCodeHash) {
    return res.status(400).json({ success: false, message: 'Incorrect verification code' });
  }

  user.isPhoneVerified = true;
  user.phoneVerificationCodeHash = undefined;
  user.phoneVerificationExpires = undefined;
  await user.save();

  await awardReward(user._id, 'PHONE_VERIFY');
  const rewardedUser = await User.findById(user._id);

  res.json({ success: true, user: rewardedUser.toSafeObject(), message: 'Phone number verified successfully' });
});

// Start-of-day (UTC) for a given date - used to compare login dates without
// time-of-day noise.
const startOfDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// Applies daily-login, 7-day-streak, and birthday-bonus rewards for a
// successful login. Mutates and saves the streak/date fields on `user`
// directly (cheap, always-on bookkeeping); reward payouts go through
// awardReward (which handles its own dedupe), so this is safe to call on
// every single login.
const applyLoginRewards = async (user) => {
  const todayStart = startOfDay(new Date());
  const todayKey = todayStart.toISOString().slice(0, 10);
  const isNewLoginDay = !user.lastLoginDate || startOfDay(user.lastLoginDate).getTime() !== todayStart.getTime();

  if (isNewLoginDay) {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const isConsecutiveDay =
      user.lastLoginDate && todayStart.getTime() - startOfDay(user.lastLoginDate).getTime() === oneDayMs;
    user.loginStreak = isConsecutiveDay ? user.loginStreak + 1 : 1;
    user.lastLoginDate = todayStart;
    await user.save();

    await awardReward(user._id, 'DAILY_LOGIN', { key: `daily-${todayKey}` });

    if (user.loginStreak % 7 === 0 && user.loginStreak > user.lastStreakMilestone) {
      await awardReward(user._id, 'LOGIN_STREAK_7DAY', { key: `streak-${user.loginStreak}` });
      user.lastStreakMilestone = user.loginStreak;
      await user.save();
    }
  }

  if (user.dateOfBirth) {
    const now = new Date();
    const dob = new Date(user.dateOfBirth);
    const isBirthdayToday = now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() === dob.getUTCDate();
    if (isBirthdayToday && user.lastBirthdayBonusYear !== now.getUTCFullYear()) {
      await awardReward(user._id, 'BIRTHDAY_BONUS', { key: `birthday-${now.getUTCFullYear()}` });
      user.lastBirthdayBonusYear = now.getUTCFullYear();
      await user.save();
    }
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: normalizeEmail(email) }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
  }

  if (!user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      requiresVerification: true,
      email: user.email,
      message: 'Please verify your email address before signing in.',
    });
  }

  await applyLoginRewards(user);
  const rewardedUser = await User.findById(user._id);

  const token = generateToken(user._id, user.role);
  res.json({ success: true, token, user: rewardedUser.toSafeObject() });
});

// @desc    Request a password reset code by email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  const user = await User.findOne({ email: normalizeEmail(email) });

  // Always respond the same way whether or not the account exists, so this
  // endpoint can't be used to check which emails are registered.
  const genericResponse = { success: true, message: 'If an account exists for this email, a reset code has been sent.' };

  if (!user) return res.json(genericResponse);

  const { code, hash } = generateCode();
  user.passwordResetCodeHash = hash;
  user.passwordResetExpires = new Date(Date.now() + CODE_TTL_MS);
  await user.save();

  await sendEmail({
    to: user.email,
    subject: 'Reset your Youth Real Estate password',
    text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Hi ${user.name},</p><p>Your password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>`,
  });

  res.json(genericResponse);
});

// @desc    Reset password using the emailed code
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) {
    return res.status(400).json({ success: false, message: 'Email, code and new password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const user = await User.findOne({ email: normalizeEmail(email) }).select(
    '+passwordResetCodeHash +passwordResetExpires'
  );

  if (!user || !user.passwordResetCodeHash || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    return res.status(400).json({ success: false, message: 'This reset code is invalid or has expired. Please request a new one.' });
  }

  if (hashCode(code) !== user.passwordResetCodeHash) {
    return res.status(400).json({ success: false, message: 'Incorrect reset code' });
  }

  user.password = password; // re-hashed by the pre-save hook on the User model
  user.passwordResetCodeHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({ success: true, message: 'Password reset successfully. You can now sign in with your new password.' });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('favorites');
  res.json({ success: true, user: user ? user.toSafeObject() : null });
});

// @desc    Update own profile (name, phone, avatar, verification documents)
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, avatar, dateOfBirth } = req.body;
  const user = await User.findById(req.user._id);

  // "Profile complete" = phone number on file. Name, selfie, and citizenship
  // photos are already required at registration, so phone is the one
  // optional field left to fill in - checked before it's overwritten below.
  const completingProfileNow = !user.phone && phone;

  if (name) user.name = name;
  if (phone !== undefined) {
    // Changing the phone number invalidates any existing verification
    if (phone !== user.phone) user.isPhoneVerified = false;
    user.phone = phone;
  }
  if (avatar !== undefined) user.avatar = avatar;
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth || null;

    const files = req.files || {};
  if (files.selfiePhoto) user.selfiePhoto = files.selfiePhoto[0].path;
  if (files.citizenshipPhotoFront) user.citizenshipPhotoFront = files.citizenshipPhotoFront[0].path;
  if (files.citizenshipPhotoBack) user.citizenshipPhotoBack = files.citizenshipPhotoBack[0].path;
  if (files.selfiePhoto || files.citizenshipPhotoFront || files.citizenshipPhotoBack) {
    user.verificationStatus = 'pending';
  }

  await user.save();

  let rewardedUser = user;
  if (completingProfileNow) {
    await awardReward(user._id, 'PROFILE_COMPLETE');
    rewardedUser = await User.findById(user._id);
  }

  res.json({ success: true, user: rewardedUser.toSafeObject() });
});

// @desc    Change own password - requires the current password to match,
//          and the new password to be confirmed, before it is applied
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password, new password, and confirmation are all required',
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ success: false, message: 'New password and confirmation do not match' });
  }

  const user = await User.findById(req.user._id).select('+password');

  const matches = await user.matchPassword(currentPassword);
  if (!matches) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  if (newPassword === currentPassword) {
    return res.status(400).json({ success: false, message: 'New password must be different from your current password' });
  }

  user.password = newPassword; // re-hashed by the pre-save hook on the User model
  await user.save();

  res.json({ success: true, message: 'Password changed successfully' });
});

// @desc    Logout (client-side token discard; endpoint provided for completeness)
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = {
  updateProfile,
  register,
  verifyEmail,
  resendVerification,
  sendPhoneOtp,
  verifyPhone,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  changePassword,
  logout,
};

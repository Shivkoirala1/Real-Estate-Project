const crypto = require('crypto');

// Generates a 6-digit numeric code plus its SHA-256 hash. We only ever store
// the hash on the user document (same idea as a password) so that a leaked
// database dump can't be used to read out anyone's active verification or
// password-reset code.
const generateCode = () => {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 100000-999999
  const hash = hashCode(code);
  return { code, hash };
};

const hashCode = (code) => crypto.createHash('sha256').update(String(code).trim()).digest('hex');

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

module.exports = { generateCode, hashCode, CODE_TTL_MS };

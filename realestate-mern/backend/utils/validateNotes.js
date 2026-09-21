/**
 * Shared minimum-length rule for all free-text notes / inquiry / message forms.
 * Requirement: at least 10 letters (characters) after stripping
 * leading/trailing whitespace.
 */
const MIN_NOTE_LENGTH = 10;

const trimmedLength = (value) => String(value ?? '').trim().length;

/**
 * Required free-text field: must trim to >= MIN_NOTE_LENGTH.
 */
const isValidRequiredNote = (value) => trimmedLength(value) >= MIN_NOTE_LENGTH;

/**
 * Optional free-text field: empty (after trim) is allowed (clear/unset),
 * otherwise must trim to >= MIN_NOTE_LENGTH.
 */
const isValidOptionalNote = (value) => {
  if (value === undefined || value === null) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  return trimmed.length >= MIN_NOTE_LENGTH;
};

const requiredNoteMessage = (label = 'Message') =>
  `${label} must be at least ${MIN_NOTE_LENGTH} characters after removing extra spaces`;

const optionalNoteMessage = (label = 'Notes') =>
  `${label} must be at least ${MIN_NOTE_LENGTH} characters after removing extra spaces, or left empty`;

module.exports = {
  MIN_NOTE_LENGTH,
  trimmedLength,
  isValidRequiredNote,
  isValidOptionalNote,
  requiredNoteMessage,
  optionalNoteMessage,
};

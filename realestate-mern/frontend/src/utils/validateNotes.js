// Shared minimum-length rule for all free-text notes / inquiry / message forms.
// Requirement: at least 10 characters after stripping leading/trailing whitespace.
export const MIN_NOTE_LENGTH = 10;

export const trimmedLength = (value) => String(value ?? '').trim().length;

export const isValidRequiredNote = (value) => trimmedLength(value) >= MIN_NOTE_LENGTH;

export const isValidOptionalNote = (value) => {
  if (value === undefined || value === null) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  return trimmed.length >= MIN_NOTE_LENGTH;
};

export const requiredNoteMessage = (label = 'Message') =>
  `${label} must be at least ${MIN_NOTE_LENGTH} characters`;

export const optionalNoteMessage = (label = 'Notes') =>
  `${label} must be at least ${MIN_NOTE_LENGTH} characters, or left empty`;

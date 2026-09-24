import React, { useRef, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useToast } from '../../../../context/ToastContext';
import { updateProfile } from '../../../../services/authService';
import { validateIdPhoto, ID_PHOTO_HINT } from '../utils/profileValidation';
import { initialOf } from '../utils/profileDisplay';
import { FILE_STATES, useDirectUpload } from '../../../../hooks/useDirectUpload';

// Profile photo: avatar display + change flow in one place. Uploads only
// the `avatar` field (cosmetic — never touches verification status) and
// falls back to the identity selfie, then initials, when no avatar is set.
// `preview` is a just-captured, unsaved identity selfie shown while it is
// the freshest image; it clears on save/retake in IdentityVerification.
const ProfilePhoto = ({ preview }) => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Phase 4 direct-upload: the photo uploads immediately (browser →
  // Cloudinary) and the profile update carries only the uploadId.
  // Kill-switch: VITE_AVATAR_DIRECT_UPLOAD=false restores legacy multipart.
  const directAvatar = import.meta.env.VITE_AVATAR_DIRECT_UPLOAD !== 'false';
  const avatarUp = useDirectUpload({ scope: 'avatar', concurrency: 1 });
  const [avatarClientId, setAvatarClientId] = useState(null);
  const avatarEntry = avatarUp.files.find((f) => f.clientId === avatarClientId) || null;
  const avatarBusy = avatarUp.files.some((f) =>
    [FILE_STATES.QUEUED, FILE_STATES.SIGNING, FILE_STATES.UPLOADING, FILE_STATES.COMPLETING].includes(f.status)
  );

  const src = preview || user?.avatar || user?.selfiePhoto;

  // Waits for one entry, then persists its reference. Separated so the
  // inline Retry button can re-run it after hook.retry().
  const persistAvatar = async (clientId, startedAt) => {
    setUploading(true);
    try {
      const { uploadId, sessionId } = await avatarUp.waitFor(clientId);
      const data = await updateProfile({
        avatarUploadId: uploadId,
        uploadSessionId: sessionId,
        clientStats: { uploadDurationMs: Date.now() - startedAt, retries: 0, failures: 0, timeouts: 0 },
      });
      updateUser(data.user);
      showToast('Profile photo updated');
      setAvatarClientId(null);
    } catch (err) {
      if (err?.name === 'AbortError') {
        setAvatarClientId(null);
      } else {
        setError(err.response?.data?.message || err?.message || 'Upload failed');
        // Keep the entry referenced so Retry stays available.
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRetryAvatar = () => {
    if (!avatarClientId) return;
    setError('');
    avatarUp.retry(avatarClientId);
    persistAvatar(avatarClientId, Date.now());
  };

  const handleSelectDirect = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const validationError = validateIdPhoto(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    if (avatarClientId) {
      try {
        await avatarUp.cancel(avatarClientId);
      } catch {
        // Already gone — continue with the new pick.
      }
    }
    const startedAt = Date.now();
    const [clientId] = avatarUp.addFiles([file], { purpose: 'avatar' });
    setAvatarClientId(clientId || null);
    // Wait for this entry, then persist the reference. A failure leaves
    // the old avatar intact with Retry available inline.
    persistAvatar(clientId, startedAt);
  };

  const handleSelect = async (e) => {
    if (directAvatar) return handleSelectDirect(e);
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const validationError = validateIdPhoto(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const data = await updateProfile(fd);
      updateUser(data.user);
      showToast('Profile photo updated');
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-shrink-0">
      <div className="relative w-24 h-24">
        <div className="w-24 h-24 rounded-full bg-brass text-navy flex items-center justify-center font-display text-4xl overflow-hidden ring-4 ring-white/10">
          {src ? (
            <img src={src} alt={user?.name} className="w-full h-full object-cover" />
          ) : (
            initialOf(user?.name)
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={user?.avatar ? 'Change profile photo' : 'Add profile photo'}
          title={user?.avatar ? 'Change profile photo' : 'Add profile photo'}
          className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-ivory text-navy text-sm flex items-center justify-center shadow-card hover:bg-brass hover:text-ivory transition-colors disabled:opacity-50"
        >
          {uploading ? '…' : '✎'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleSelect}
          aria-describedby="profile-photo-hint"
        />
      </div>
      <p id="profile-photo-hint" className="sr-only">{ID_PHOTO_HINT}</p>
      {uploading && <p className="text-ivory/60 text-xs mt-1.5">Uploading...</p>}
      {directAvatar && avatarEntry && avatarEntry.status !== FILE_STATES.SUCCESS && (
        <div className="mt-1.5 max-w-28">
          <div className="h-1 bg-ivory/20 rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-brass transition-all"
              style={{ width: `${Math.round((avatarEntry.progress || 0) * 100)}%` }}
            />
          </div>
          <div className="flex gap-2">
            {avatarEntry.status === FILE_STATES.FAILED ? (
              <button
                type="button"
                onClick={handleRetryAvatar}
                className="text-brass-light text-xs hover:underline"
              >
                Retry
              </button>
            ) : (
              <button
                type="button"
                onClick={() => avatarUp.cancel(avatarEntry.clientId).catch(() => {})}
                className="text-ivory/60 text-xs hover:underline"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-brick-light text-xs mt-1.5 max-w-28" role="alert">{error}</p>}
    </div>
  );
};

export default ProfilePhoto;

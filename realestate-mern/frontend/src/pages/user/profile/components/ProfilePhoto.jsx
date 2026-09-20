import React, { useRef, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useToast } from '../../../../context/ToastContext';
import { updateProfile } from '../../../../services/authService';
import { validateIdPhoto, ID_PHOTO_HINT } from '../utils/profileValidation';
import { initialOf } from '../utils/profileDisplay';

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

  const src = preview || user?.avatar || user?.selfiePhoto;

  const handleSelect = async (e) => {
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
      {error && <p className="text-brick-light text-xs mt-1.5 max-w-28" role="alert">{error}</p>}
    </div>
  );
};

export default ProfilePhoto;

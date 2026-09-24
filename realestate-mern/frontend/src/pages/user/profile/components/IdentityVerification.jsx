import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useToast } from '../../../../context/ToastContext';
import { updateProfile } from '../../../../services/authService';
import CameraCapture from '../../../../components/CameraCapture';
import { validateIdPhoto, ID_PHOTO_HINT } from '../utils/profileValidation';

const fileInputClass =
  'input-field file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:bg-navy file:text-ivory file:text-xs file:font-medium file:cursor-pointer cursor-pointer';

// Identity verification as its own upload flow, separate from the personal
// details save. Uploading any document sends the account back to pending
// review (server behavior) — the copy below says so upfront.
// `onSelfiePreview` lifts the just-captured (unsaved) selfie to the page
// header avatar; null clears it.
const IdentityVerification = ({ onSelfiePreview }) => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [citizenshipFront, setCitizenshipFront] = useState(null);
  const [citizenshipBack, setCitizenshipBack] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // Bumps to remount file inputs after a successful save (file inputs are
  // uncontrolled and can't be cleared programmatically).
  const [inputKey, setInputKey] = useState(0);

  const handleFile = (field) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateIdPhoto(file);
    if (err) {
      setErrors((prev) => ({ ...prev, [field]: err }));
      e.target.value = '';
      return;
    }
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (field === 'citizenshipFront') setCitizenshipFront(file);
    else setCitizenshipBack(file);
  };

  // Blobs minted by CameraCapture leak unless revoked — the component hands
  // us the URL, so ownership of cleanup lives here.
  const previewsRef = React.useRef(null);
  useEffect(() => {
    previewsRef.current = selfiePreview;
  });
  useEffect(() => () => {
    if (previewsRef.current && previewsRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(previewsRef.current);
    }
  }, []);
  const clearSelfiePreview = () => {
    if (selfiePreview && selfiePreview.startsWith('blob:')) URL.revokeObjectURL(selfiePreview);
  };

  const handleSelfieCapture = (file, previewUrl) => {
    clearSelfiePreview();
    setSelfieFile(file);
    setSelfiePreview(previewUrl);
    onSelfiePreview?.(previewUrl);
  };

  const handleSelfieRetake = () => {
    clearSelfiePreview();
    setSelfieFile(null);
    setSelfiePreview(null);
    onSelfiePreview?.(null);
  };

  const hasSelection = selfieFile || citizenshipFront || citizenshipBack;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasSelection) return;
    setSaving(true);
    try {
      const fd = new FormData();
      if (selfieFile) fd.append('selfiePhoto', selfieFile);
      if (citizenshipFront) fd.append('citizenshipPhotoFront', citizenshipFront);
      if (citizenshipBack) fd.append('citizenshipPhotoBack', citizenshipBack);
      const data = await updateProfile(fd);
      updateUser(data.user);
      setSelfieFile(null);
      clearSelfiePreview();
      setSelfiePreview(null);
      onSelfiePreview?.(null);
      setCitizenshipFront(null);
      setCitizenshipBack(null);
      setErrors({});
      setInputKey((k) => k + 1);
      showToast('Documents submitted — your account is pending review');
    } catch (err) {
      showToast(err.response?.data?.message || 'Upload failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const docStatus = (selectedFile, savedUrl) => {
    if (selectedFile) return <p className="text-xs text-brass mt-1.5">Selected: {selectedFile.name} (not saved yet)</p>;
    if (savedUrl) return <p className="text-xs text-sage mt-1.5">✓ Already uploaded</p>;
    return <p className="text-xs text-slate-muted mt-1.5">No document uploaded yet</p>;
  };

  return (
    <section id="identity-verification" className="bg-white border border-navy/10 rounded-sm shadow-card p-6 md:p-8" aria-labelledby="identity-heading">
      <p className="eyebrow mb-1">Identity Verification</p>
      <h3 id="identity-heading" className="text-xl mb-2">Verification documents</h3>
      <p className="text-sm text-slate-muted mb-6 leading-relaxed">
        Required before you can post a property. Both documents are reviewed by our team and kept private.
        Submitting new documents sends your account back to pending review.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          <div>
            <span className="label-field" id="selfie-label">1. Live selfie (camera)</span>
            <div role="group" aria-labelledby="selfie-label">
              <CameraCapture
                onCapture={handleSelfieCapture}
                capturedImage={selfiePreview}
                onRetake={handleSelfieRetake}
              />
            </div>
            {selfieFile
              ? <p className="text-xs text-brass mt-1.5">Selected: new selfie captured (not saved yet)</p>
              : user?.selfiePhoto && !selfiePreview
                ? <p className="text-xs text-sage mt-1.5">✓ Already uploaded</p>
                : <p className="text-xs text-slate-muted mt-1.5">No selfie uploaded yet</p>}
          </div>
          <div>
            <label htmlFor="id-front" className="label-field">2. Citizenship / National ID — front side</label>
            <input
              key={`front-${inputKey}`}
              id="id-front"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={fileInputClass}
              onChange={handleFile('citizenshipFront')}
              aria-describedby="id-front-hint"
            />
            <p id="id-front-hint" className="text-xs text-slate-muted mt-1.5">{ID_PHOTO_HINT}</p>
            {errors.citizenshipFront && <p className="text-xs text-brick mt-1" role="alert">{errors.citizenshipFront}</p>}
            {docStatus(citizenshipFront, user?.citizenshipPhotoFront)}
          </div>
          <div>
            <label htmlFor="id-back" className="label-field">3. Citizenship / National ID — back side</label>
            <input
              key={`back-${inputKey}`}
              id="id-back"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={fileInputClass}
              onChange={handleFile('citizenshipBack')}
              aria-describedby="id-back-hint"
            />
            <p id="id-back-hint" className="text-xs text-slate-muted mt-1.5">{ID_PHOTO_HINT}</p>
            {errors.citizenshipBack && <p className="text-xs text-brick mt-1" role="alert">{errors.citizenshipBack}</p>}
            {docStatus(citizenshipBack, user?.citizenshipPhotoBack)}
          </div>
        </div>
        <div className="flex items-center justify-end mt-6 pt-6 border-t border-navy/10">
          <button type="submit" disabled={saving || !hasSelection} className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
            {saving ? 'Uploading...' : 'Save verification documents'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default IdentityVerification;

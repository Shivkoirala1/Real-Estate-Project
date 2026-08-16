import React, { useRef } from 'react';
import { useToast } from '../context/ToastContext';

// A file input that ACCUMULATES selections instead of replacing them - the
// browser's native <input type="file" multiple> replaces the whole selection
// every time you open the picker again, which makes "attach a few more photos
// later" impossible. This wraps it so users can click "Add photos" repeatedly
// and build up one list, with per-photo remove buttons and existing (already
// uploaded) images shown alongside anything newly picked.
const MultiImageUpload = ({ files, onFilesChange, existingImages = [], onRemoveExisting, label = 'Photos' }) => {
  const inputRef = useRef(null);
  const { showToast } = useToast();

  const handlePick = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const imagesOnly = picked.filter((f) => f.type.startsWith('image/'));
    if (imagesOnly.length < picked.length) {
      showToast('Only photo files are allowed here - any video files you selected were skipped.', 'error');
    }
    if (imagesOnly.length === 0) return;
    onFilesChange([...files, ...imagesOnly]);
    // reset the input so selecting the same file again still fires onChange
    e.target.value = '';
  };

  const removeFile = (index) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="label-field">{label}</label>

      {(existingImages.length > 0 || files.length > 0) && (
        <div className="flex flex-wrap gap-3 mb-3">
          {existingImages.map((img, i) => (
            <div key={`existing-${i}`} className="relative w-24 h-24 rounded-sm overflow-hidden border border-navy/15 group">
              <img src={img} alt="" className="w-full h-full object-cover" />
              {onRemoveExisting && (
                <button
                  type="button"
                  onClick={() => onRemoveExisting(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brick text-white text-xs leading-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {files.map((file, i) => (
            <div key={`new-${i}`} className="relative w-24 h-24 rounded-sm overflow-hidden border border-brass group">
              <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brick text-white text-xs leading-5 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                ×
              </button>
              <span className="absolute bottom-0 inset-x-0 bg-brass/90 text-navy text-[10px] text-center font-semibold py-0.5">New</span>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePick}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary text-sm py-2 px-4">
        + Add photos
      </button>
      <span className="text-xs text-slate-muted ml-3">You can click this multiple times to add more photos</span>
    </div>
  );
};

export default MultiImageUpload;

import React, { useRef, useState } from 'react';
import { FILE_STATES, useDirectUpload } from '../hooks/useDirectUpload';
import {
  CLIENT_UPLOAD_LIMITS,
  downscaleImage,
  formatBytes,
  useObjectPreview,
  validateImageFile,
} from '../utils/imageUpload';
import { INNOVATION_CATEGORIES, formatInnovationCategory } from '../services/innovationService';

const MAX_IMAGES = 5;
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];
const BUSY_STATES = [FILE_STATES.QUEUED, FILE_STATES.SIGNING, FILE_STATES.UPLOADING, FILE_STATES.COMPLETING];

// Shared create/edit form (owner pages + admin edit reuse the same component
// and endpoint). Media uploads immediately browser → Cloudinary through one
// innovation session; submit carries only uploadIds + keep-lists, never
// bytes or Cloudinary credentials. isVisible/submittedBy are never sent.
const InnovationForm = ({ initialIdea = null, onSubmit, submitLabel }) => {
  const isEditing = Boolean(initialIdea);

  const [title, setTitle] = useState(initialIdea?.title ?? '');
  const [category, setCategory] = useState(initialIdea?.category ?? '');
  const [description, setDescription] = useState(initialIdea?.description ?? '');
  const [existingImages, setExistingImages] = useState(initialIdea?.images ?? []);
  const [videoRemoved, setVideoRemoved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const innovUp = useDirectUpload({ scope: 'innovation', concurrency: 3 });
  const [videoClientId, setVideoClientId] = useState(null);

  const imageEntries = innovUp.files.filter((f) => f.purpose === 'innovation-image');
  const activeImageEntries = imageEntries.filter((f) => f.status !== FILE_STATES.CANCELLED);
  const videoEntry = innovUp.files.find((f) => f.clientId === videoClientId) || null;
  const mediaBusy = innovUp.files.some((f) => BUSY_STATES.includes(f.status));
  const totalImages = existingImages.length + activeImageEntries.length;

  const existingVideoUrl = !videoRemoved && !videoEntry ? initialIdea?.videoUrl || null : null;

  const handlePickImages = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;
    const imagesOnly = picked.filter((f) => f.type.startsWith('image/'));
    if (imagesOnly.length < picked.length) {
      setError('Only photo files are allowed — any non-photo files were skipped.');
      if (imagesOnly.length === 0) return;
    } else {
      setError('');
    }
    const room = MAX_IMAGES - (existingImages.length + activeImageEntries.length);
    if (room <= 0) {
      setError(`An idea holds at most ${MAX_IMAGES} photos — remove one to add another.`);
      return;
    }
    const accepted = [];
    for (const file of imagesOnly.slice(0, room)) {
      // Fail fast in the browser (backend 10 MB cap is authoritative).
      const err = validateImageFile(file, { maxBytes: CLIENT_UPLOAD_LIMITS.innovationImage, label: file.name || 'Photo' });
      if (err) {
        setError(err);
        continue;
      }
      // Marketing-photo downscale (property/blog convention); never throws.
      // eslint-disable-next-line no-await-in-loop
      accepted.push(await downscaleImage(file));
    }
    if (imagesOnly.length > room) {
      setError(`Only ${room} more photo${room === 1 ? '' : 's'} fit — an idea holds at most ${MAX_IMAGES}.`);
    }
    if (accepted.length === 0) return;
    innovUp.addFiles(accepted, { purpose: 'innovation-image' });
  };

  const handlePickVideo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = (file.name?.split('.').pop() || '').toLowerCase();
    if (!file.type.startsWith('video/') || !VIDEO_EXTENSIONS.includes(ext)) {
      setError('Video must be an MP4, WebM or MOV file.');
      return;
    }
    if (file.size > CLIENT_UPLOAD_LIMITS.innovationVideo) {
      setError(`Video is too large (${formatBytes(file.size)}) — maximum is 50 MB.`);
      return;
    }
    setError('');
    // Single video: a new pick replaces any pending upload.
    if (videoClientId) innovUp.cancel(videoClientId).catch(() => {});
    const [clientId] = innovUp.addFiles([file], { purpose: 'innovation-video' });
    setVideoClientId(clientId || null);
  };

  const removeVideoPick = () => {
    if (videoClientId) innovUp.cancel(videoClientId).catch(() => {});
    setVideoClientId(null);
  };

  const validate = () => {
    if (title.trim().length < 5) return 'Title is required (at least 5 characters).';
    if (title.trim().length > 120) return 'Title cannot exceed 120 characters.';
    if (!INNOVATION_CATEGORIES.includes(category)) return 'Please choose a category.';
    if (description.trim().length < 20) return 'Description is required (at least 20 characters).';
    if (description.trim().length > 5000) return 'Description cannot exceed 5000 characters.';
    if (totalImages > MAX_IMAGES) return `An idea holds at most ${MAX_IMAGES} photos.`;
    if (videoEntry?.status === FILE_STATES.FAILED) return 'Video upload failed — retry it or pick another file.';
    const failedImages = activeImageEntries.filter((f) => f.status === FILE_STATES.FAILED).length;
    if (failedImages > 0 && activeImageEntries.every((f) => f.status === FILE_STATES.FAILED) && existingImages.length === 0) {
      return 'Photo upload failed — retry it or pick another photo.';
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (mediaBusy) {
      setError('Media is still uploading — please wait for it to finish before saving.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const imageUploadIds = activeImageEntries
        .filter((f) => f.status === FILE_STATES.SUCCESS && f.uploadId)
        .map((f) => f.uploadId);
      const videoUploadId = videoEntry?.status === FILE_STATES.SUCCESS ? videoEntry.uploadId : undefined;
      const hasNewMedia = imageUploadIds.length > 0 || videoUploadId !== undefined;

      const payload = { title: title.trim(), category, description: description.trim() };
      if (isEditing) {
        payload.keepImageUrls = existingImages;
        // Video keep is the backend default (omit to keep); only replacement
        // or explicit removal is sent.
        if (videoUploadId === undefined && videoRemoved) payload.removeVideo = true;
      }
      if (hasNewMedia) {
        if (imageUploadIds.length > 0) payload.imageUploadIds = imageUploadIds;
        if (videoUploadId !== undefined) payload.videoUploadId = videoUploadId;
        payload.uploadSessionId = innovUp.sessionId;
      }
      await onSubmit(payload);
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 429) {
        const secs = Number(data?.retryAfterSec) || 0;
        const when = secs >= 3600 ? `about ${Math.ceil(secs / 3600)} hour(s)` : `about ${Math.max(Math.ceil(secs / 60), 1)} minute(s)`;
        setError(`${data?.message || 'Submission limit reached.'} Please try again in ${when}.`);
      } else {
        setError(data?.message || 'Failed to save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm">{error}</div>}

      <div>
        <label className="block mb-2 font-medium text-navy">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-field w-full"
          placeholder="A short, clear name for the idea"
          maxLength={120}
        />
        <p className="text-xs text-slate-muted mt-1">{title.trim().length}/120 · minimum 5 characters</p>
      </div>

      <div>
        <label className="block mb-2 font-medium text-navy">Category *</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field w-full">
          <option value="">Select a category</option>
          {INNOVATION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {formatInnovationCategory(c)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block mb-2 font-medium text-navy">Description *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field w-full"
          rows={6}
          maxLength={5000}
          placeholder="What problem does it solve? What is the idea? What impact would it have?"
        />
        <p className="text-xs text-slate-muted mt-1">{description.trim().length}/5000 · minimum 20 characters</p>
      </div>

      <div>
        <label className="label-field">Photos ({totalImages}/{MAX_IMAGES})</label>
        {(existingImages.length > 0 || activeImageEntries.length > 0) && (
          <div className="flex flex-wrap gap-3 mb-3">
            {existingImages.map((img) => (
              <div key={`existing-${img}`} className="relative w-24 h-24 rounded-sm overflow-hidden border border-navy/15 group">
                <img src={img} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setExistingImages((prev) => prev.filter((u) => u !== img))}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brick text-white text-xs leading-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
            {activeImageEntries.map((entry) => (
              <NewImageThumb key={entry.clientId} entry={entry} onRemove={() => innovUp.cancel(entry.clientId).catch(() => {})} onRetry={() => innovUp.retry(entry.clientId)} />
            ))}
          </div>
        )}
        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePickImages} />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={totalImages >= MAX_IMAGES}
          className="btn-secondary text-sm py-2 px-4 disabled:opacity-50"
        >
          + Add photos
        </button>
        <span className="text-xs text-slate-muted ml-3">JPG, PNG, WEBP, GIF · up to 10 MB each</span>
      </div>

      <div>
        <label className="label-field">Video (optional, max 1)</label>
        {existingVideoUrl && (
          <div className="mb-3 max-w-xs">
            <video src={existingVideoUrl} poster={initialIdea?.videoThumbnail || undefined} controls playsInline preload="metadata" className="w-full rounded-sm bg-navy-dark" />
            <button type="button" onClick={() => setVideoRemoved(true)} className="text-xs text-brick hover:underline mt-1">
              Remove video
            </button>
          </div>
        )}
        {!existingVideoUrl && !videoEntry && (
          <p className="text-xs text-slate-muted mb-2">{isEditing && initialIdea?.videoUrl ? 'Video removed — pick a new one or save to confirm removal.' : 'No video attached.'}</p>
        )}
        {videoEntry && (
          <VideoPickRow entry={videoEntry} onRemove={removeVideoPick} onRetry={() => innovUp.retry(videoEntry.clientId)} />
        )}
        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handlePickVideo} />
        {!videoEntry && (
          <button type="button" onClick={() => videoInputRef.current?.click()} className="btn-secondary text-sm py-2 px-4">
            {existingVideoUrl || initialIdea?.videoUrl ? 'Replace video' : '+ Add video'}
          </button>
        )}
        <span className="text-xs text-slate-muted ml-3">MP4, WebM, MOV · up to 50 MB</span>
      </div>

      <button type="submit" disabled={saving} className="btn-gold disabled:opacity-50">
        {saving ? 'Saving…' : submitLabel || (isEditing ? 'Save changes' : 'Share idea')}
      </button>
    </form>
  );
};

// Thumbnail for a freshly picked image with live progress / retry states.
const NewImageThumb = ({ entry, onRemove, onRetry }) => {
  const preview = useObjectPreview(entry.file);
  const pct = Math.round((entry.progress || 0) * 100);
  return (
    <div className="relative w-24 h-24 rounded-sm overflow-hidden border border-brass group">
      {preview && <img src={preview} alt="" className="w-full h-full object-cover" />}
      {BUSY_STATES.includes(entry.status) && (
        <span className="absolute bottom-0 inset-x-0 bg-navy/80 text-ivory text-[10px] text-center py-0.5">{pct}%</span>
      )}
      {entry.status === FILE_STATES.SUCCESS && (
        <span className="absolute bottom-0 inset-x-0 bg-sage/90 text-white text-[10px] text-center font-semibold py-0.5">Uploaded</span>
      )}
      {entry.status === FILE_STATES.FAILED && (
        <button type="button" onClick={onRetry} className="absolute bottom-0 inset-x-0 bg-brick/90 text-white text-[10px] text-center font-semibold py-0.5">
          Retry
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brick text-white text-xs leading-5 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove photo"
      >
        ×
      </button>
    </div>
  );
};

// Single picked-video row with progress / error / retry states.
const VideoPickRow = ({ entry, onRemove, onRetry }) => {
  const preview = useObjectPreview(entry.file);
  const pct = Math.round((entry.progress || 0) * 100);
  return (
    <div className="mb-3 max-w-xs">
      {preview && <video src={preview} controls playsInline preload="metadata" className="w-full rounded-sm bg-navy-dark" />}
      <div className="flex items-center gap-3 mt-1.5">
        <p className="text-xs text-slate-muted truncate flex-1">{entry.file?.name}</p>
        {BUSY_STATES.includes(entry.status) && <span className="text-xs text-slate-muted">{pct}%</span>}
        {entry.status === FILE_STATES.SUCCESS && <span className="text-xs text-sage font-semibold">Uploaded</span>}
        {entry.status === FILE_STATES.FAILED && (
          <button type="button" onClick={onRetry} className="text-xs text-brass hover:underline">
            Retry
          </button>
        )}
        <button type="button" onClick={onRemove} className="text-xs text-brick hover:underline">
          Remove
        </button>
      </div>
      {entry.status === FILE_STATES.FAILED && entry.error && (
        <p className="text-xs text-brick mt-1">{entry.error}</p>
      )}
    </div>
  );
};

export default InnovationForm;

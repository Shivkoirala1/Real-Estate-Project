import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  createHeroSlide,
  getHeroSlideById,
  updateHeroSlide,
} from "../../services/heroSlideService";
import { getProperties, getPropertyByIdorSlug } from "../../services/propertyService";
import { nepaliInputToUTC, utcToNepaliInputLocal } from "../../utils/timeConverter";
import { CLIENT_UPLOAD_LIMITS, useObjectPreview, validateImageFile } from "../../utils/imageUpload";
import { FILE_STATES, useDirectUpload } from "../../hooks/useDirectUpload";

// Blob preview owned by this component (revoked on replace/unmount).
const DirectPreview = ({ file, alt = "", className = "w-full h-full object-cover" }) => {
  const preview = useObjectPreview(file);
  if (!preview) return null;
  return <img src={preview} alt={alt} className={className} />;
};

// Stored instants are UTC; the datetime-local inputs show and accept Nepal
// wall time. Converting on both ends (instead of passing the raw input
// value through) keeps "start now" meaning now rather than 5:45 in the
// future on a UTC server.
const toInputDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return utcToNepaliInputLocal(d);
};

export default function HeroSlideForm() {
  const params = useParams();
  const navigate = useNavigate();
  // if params.id exists, we are editing an existing slide, otherwise creating
  const isEditing = !!params.id;

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    description: "",
    altText: "",
    mediaType: "image",
    ctaEnabled: false,
    ctaLabel: "",
    ctaActionType: "none",
    ctaActionValue: "",
    startAt: "",
    endAt: "",
    displayOrder: "",
    duration: 5,
    status: "draft",
  });
  const [mediaFile, setMediaFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [existingMedia, setExistingMedia] = useState(null);
  const [propertyTitle, setPropertyTitle] = useState("");
  const [propertySearch, setPropertySearch] = useState("");
  const [propertyResults, setPropertyResults] = useState([]);
  const [propertySearching, setPropertySearching] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const searchTimer = useRef(null);

  // Phase 3 direct-upload: media + thumbnail go browser → Cloudinary through
  // one shared hero session (at most 2 files — no batching complexity).
  // Kill-switch: VITE_HERO_DIRECT_UPLOAD=false restores pure legacy.
  const directMedia = import.meta.env.VITE_HERO_DIRECT_UPLOAD !== "false";
  const heroUp = useDirectUpload({ scope: "hero", concurrency: 2 });
  const [mediaClientId, setMediaClientId] = useState(null);
  const [thumbClientId, setThumbClientId] = useState(null);
  const mediaStartRef = useRef(null);
  const markMediaStart = () => {
    if (!mediaStartRef.current) mediaStartRef.current = Date.now();
  };
  const mediaEntry = heroUp.files.find((f) => f.clientId === mediaClientId) || null;
  const thumbEntry = heroUp.files.find((f) => f.clientId === thumbClientId) || null;
  const mediaBusy = heroUp.files.some((f) =>
    [FILE_STATES.QUEUED, FILE_STATES.SIGNING, FILE_STATES.UPLOADING, FILE_STATES.COMPLETING].includes(f.status)
  );
  const mediaUploadId = mediaEntry && mediaEntry.status === FILE_STATES.SUCCESS ? mediaEntry.uploadId : null;
  const thumbnailUploadId = thumbEntry && thumbEntry.status === FILE_STATES.SUCCESS ? thumbEntry.uploadId : null;

  // hooks must always run in the same order, so effects are unconditional —
  // only the fetch logic inside is gated on isEditing
  useEffect(() => {
    if (!isEditing) return;
    let isMounted = true;
    const fetchSlide = async () => {
      setLoading(true);
      try {
        const data = await getHeroSlideById(params.id);
        if (!isMounted) return;
        const doc = data.slide ?? data;
        setForm({
          title: doc.title ?? "",
          subtitle: doc.subtitle ?? "",
          description: doc.description ?? "",
          altText: doc.media?.altText ?? "",
          mediaType: doc.media?.type ?? "image",
          ctaEnabled: Boolean(doc.cta?.enabled),
          ctaLabel: doc.cta?.label ?? "",
          ctaActionType: doc.cta?.actionType ?? "none",
          ctaActionValue: doc.cta?.actionValue ?? "",
          startAt: toInputDateTime(doc.startAt),
          endAt: toInputDateTime(doc.endAt),
          displayOrder: doc.displayOrder ?? "",
          duration: doc.duration ?? 5,
          status: doc.status ?? "draft",
        });
        setExistingMedia(doc.media ?? null);
        if (doc.cta?.actionType === "property" && doc.cta?.actionValue) {
          try {
            const prop = await getPropertyByIdorSlug(doc.cta.actionValue);
            if (isMounted) setPropertyTitle(prop.property?.title ?? doc.cta.actionValue);
          } catch {
            if (isMounted) setPropertyTitle(doc.cta.actionValue);
          }
        }
      } catch (err) {
        console.error("Failed to load hero slide:", err);
        if (isMounted) setError("Couldn't load this slide. Please go back and try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchSlide();
    return () => {
      isMounted = false;
    };
  }, [isEditing, params.id]);

  // debounced property search for the property CTA picker
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!propertySearch.trim()) {
      setPropertyResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setPropertySearching(true);
      try {
        const data = await getProperties({ keyword: propertySearch.trim(), limit: 6 });
        setPropertyResults(data.properties ?? []);
      } catch {
        setPropertyResults([]);
      } finally {
        setPropertySearching(false);
      }
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [propertySearch]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // Direct flow: a picked media file is bound to its type at pick time
    // (purpose + signed params). Switching type invalidates it — drop with
    // an explanation rather than submitting a guaranteed 400.
    if (directMedia && name === "mediaType" && value !== form.mediaType && mediaClientId) {
      heroUp.cancel(mediaClientId).catch(() => {});
      setMediaClientId(null);
      setError("Media type changed — the previously selected file was removed. Please pick a matching file.");
    }
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      // switching destination type invalidates the previous value
      ...(name === "ctaActionType" ? { ctaActionValue: "" } : {}),
    }));
    if (name === "ctaActionType") setPropertyTitle("");
  };

  // Direct flow picks upload immediately (browser → Cloudinary); submit
  // carries only uploadIds. Purpose/mediaKind come from the actual file —
  // the client never controls folders, sizes or formats.
  const handleDirectMedia = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const wantVideo = form.mediaType === "video";
    if (wantVideo ? !file.type.startsWith("video/") : !file.type.startsWith("image/")) {
      setError(wantVideo ? "Media must be a video file (MP4, WebM, MOV)." : "Media must be an image file (JPG, PNG, WEBP, GIF).");
      return;
    }
    const cap = wantVideo ? CLIENT_UPLOAD_LIMITS.heroVideo : CLIENT_UPLOAD_LIMITS.heroImage;
    if (file.size > cap) {
      setError(wantVideo ? "Video is too large — maximum is 50 MB." : "Image is too large — maximum is 10 MB.");
      return;
    }
    setError(null);
    if (mediaClientId) heroUp.cancel(mediaClientId).catch(() => {});
    markMediaStart();
    const [clientId] = heroUp.addFiles([file], { purpose: "hero-media", refs: { mediaKind: wantVideo ? "video" : "image" } });
    setMediaClientId(clientId || null);
  };

  const handleDirectThumb = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const err = validateImageFile(file, { maxBytes: CLIENT_UPLOAD_LIMITS.heroImage, label: "Thumbnail" });
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (thumbClientId) heroUp.cancel(thumbClientId).catch(() => {});
    markMediaStart();
    const [clientId] = heroUp.addFiles([file], { purpose: "hero-thumbnail" });
    setThumbClientId(clientId || null);
  };

  const directClientStats = () => ({
    uploadDurationMs: mediaStartRef.current ? Date.now() - mediaStartRef.current : 0,
    retries: heroUp.files.reduce((s, f) => s + (f.attempts || 0), 0),
    failures: heroUp.files.filter((f) => f.status === FILE_STATES.FAILED).length,
    timeouts: 0, // XHR direct uploads run without a client timeout; progress is visible instead
  });

  const validate = () => {
    if (!form.title.trim()) return "Slide title is required.";
    if (directMedia) {
      // Upload bytes (when any) are pre-validated at pick time; here we
      // only gate on presence/state. Backend remains authoritative.
      if (!isEditing && !mediaUploadId) {
        if (mediaEntry && mediaEntry.status === FILE_STATES.FAILED) {
          return "Media upload failed — retry it or pick another file.";
        }
        return "A media file is required.";
      }
      if (mediaEntry && mediaEntry.status === FILE_STATES.FAILED && !existingMedia?.url) {
        return "Media upload failed — retry it or pick another file.";
      }
    } else {
      if (!isEditing && !mediaFile) return "A media file is required.";
      if (mediaFile) {
        const isVideo = mediaFile.type.startsWith("video/");
        const isImage = mediaFile.type.startsWith("image/");
        if (!isVideo && !isImage) return "Media must be an image or a video file.";
        if ((form.mediaType === "video") !== isVideo) {
          return "Media type does not match the selected file.";
        }
        // Fail fast in the browser (backend caps are authoritative: 10 MB
        // images in the controller, 50 MB files in multer).
        const cap = isVideo ? CLIENT_UPLOAD_LIMITS.heroVideo : CLIENT_UPLOAD_LIMITS.heroImage;
        if (mediaFile.size > cap) {
          return isVideo
            ? "Video is too large — maximum is 50 MB."
            : "Image is too large — maximum is 10 MB.";
        }
      }
    }
    if (thumbnailFile) {
      if (!thumbnailFile.type.startsWith("image/")) return "Thumbnail must be an image file.";
      if (thumbnailFile.size > CLIENT_UPLOAD_LIMITS.heroImage) {
        return "Thumbnail is too large — maximum is 10 MB.";
      }
    }
    if (form.ctaEnabled) {
      if (!form.ctaLabel.trim()) return "CTA label is required when the CTA is enabled.";
      if (form.ctaActionType === "none") return "Choose a CTA destination (property or URL) or disable the CTA.";
      if (form.ctaActionType === "property" && !form.ctaActionValue) {
        return "Select a property for the CTA.";
      }
      if (form.ctaActionType === "url" && !/^https?:\/\/.+/i.test(form.ctaActionValue.trim())) {
        return "CTA URL must be a valid http(s) URL.";
      }
    }
    if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) {
      return "End date must be after the start date.";
    }
    const duration = Number(form.duration);
    if (!Number.isInteger(duration) || duration < 3 || duration > 60) {
      return "Duration must be between 3 and 60 seconds.";
    }
    return null;
  };

  const handleSubmit = async (status) => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    // Direct flow: media already lives on Cloudinary — submit authorized
    // uploadIds, never bytes. A failed media blocks (unless existing media
    // is kept); a failed thumbnail is excluded, never fatal. Completed
    // uploads survive validation failures, so resubmits reuse the ids.
    if (directMedia) {
      if (mediaBusy) {
        setSubmitting(false);
        setError("Media is still uploading — please wait for it to finish before saving.");
        return;
      }
      try {
        const payload = {
          title: form.title.trim(),
          subtitle: form.subtitle,
          description: form.description,
          altText: form.altText,
          mediaType: form.mediaType,
          mediaUploadId: mediaUploadId || undefined,
          thumbnailUploadId: thumbnailUploadId || undefined,
          uploadSessionId: heroUp.sessionId,
          clientStats: directClientStats(),
          ctaEnabled: form.ctaEnabled,
          ctaLabel: form.ctaLabel,
          ctaActionType: form.ctaActionType,
          ctaActionValue: form.ctaEnabled ? form.ctaActionValue : "",
          startAt: form.startAt ? nepaliInputToUTC(form.startAt) : "",
          endAt: form.endAt ? nepaliInputToUTC(form.endAt) : "",
          displayOrder: form.displayOrder === "" ? undefined : form.displayOrder,
          duration: form.duration,
          status,
        };
        if (isEditing) {
          await updateHeroSlide(params.id, payload);
        } else {
          await createHeroSlide(payload);
        }
        navigate("/dashboard/admin/hero-slides");
      } catch (err) {
        console.error("Failed to save hero slide:", err);
        setError(err?.response?.data?.message || "Failed to save hero slide. Please try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle,
      description: form.description,
      altText: form.altText,
      mediaType: form.mediaType,
      media: mediaFile instanceof File ? mediaFile : undefined,
      thumbnail: thumbnailFile instanceof File ? thumbnailFile : undefined,
      ctaEnabled: form.ctaEnabled,
      ctaLabel: form.ctaLabel,
      ctaActionType: form.ctaActionType,
      ctaActionValue: form.ctaEnabled ? form.ctaActionValue : "",
      startAt: form.startAt ? nepaliInputToUTC(form.startAt) : "",
      endAt: form.endAt ? nepaliInputToUTC(form.endAt) : "",
      displayOrder: form.displayOrder === "" ? undefined : form.displayOrder,
      duration: form.duration,
      status,
    };
    try {
      if (isEditing) {
        await updateHeroSlide(params.id, payload);
      } else {
        await createHeroSlide(payload);
      }
      navigate("/dashboard/admin/hero-slides");
    } catch (err) {
      console.error("Failed to save hero slide:", err);
      setError(err?.response?.data?.message || "Failed to save hero slide. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-slate-muted max-w-3xl mx-auto">Loading...</p>;
  }

  // Memoized blob previews with cleanup (previously minted inline during
  // render, leaking a URL per render and never revoking). In direct mode the
  // preview comes from the hook entry's File; otherwise the legacy state.
  const effMediaFile = directMedia ? mediaEntry?.file ?? null : mediaFile;
  const effThumbFile = directMedia ? thumbEntry?.file ?? null : thumbnailFile;
  const previewUrl = useMemo(() => {
    if (!effMediaFile) return null;
    return URL.createObjectURL(effMediaFile);
  }, [effMediaFile]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const previewThumb = useMemo(() => {
    if (!effThumbFile) return null;
    return URL.createObjectURL(effThumbFile);
  }, [effThumbFile]);
  useEffect(() => () => {
    if (previewThumb) URL.revokeObjectURL(previewThumb);
  }, [previewThumb]);

  const resolvedPreviewUrl =
    previewUrl || (form.mediaType === "image" ? existingMedia?.url : null);
  const resolvedPreviewThumb =
    previewThumb || existingMedia?.thumbnailUrl || resolvedPreviewUrl;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(form.status);
      }}
      className="max-w-3xl mx-auto space-y-8"
    >
      <div>
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-3xl">{isEditing ? "Edit Hero Slide" : "Add Hero Slide"}</h1>
      </div>

      {error && (
        <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      {/* Live preview */}
      <section className="bg-navy-dark rounded-sm overflow-hidden">
        <div className="relative h-48">
          {form.mediaType === "video" ? (
            <video
              key={previewUrl || existingMedia?.url}
              src={previewUrl || existingMedia?.url}
              poster={resolvedPreviewThumb || undefined}
              muted
              loop
              playsInline
              controls={!!(mediaFile || existingMedia?.url)}
              className="w-full h-full object-cover"
            />
          ) : resolvedPreviewUrl ? (
            <img src={resolvedPreviewUrl} alt={form.altText || form.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ivory/40 text-sm">
              Media preview appears here
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy-dark/80 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4">
            <p className="text-ivory font-display text-xl leading-tight">
              {form.title || "Slide title"}
            </p>
            {form.subtitle && <p className="text-ivory/70 text-sm">{form.subtitle}</p>}
            {form.ctaEnabled && form.ctaLabel && (
              <span className="inline-block mt-2 btn-gold text-xs py-1.5 px-3">{form.ctaLabel}</span>
            )}
          </div>
        </div>
      </section>

      {/* A. Content */}
      <section className="space-y-4">
        <h2 className="font-display text-xl text-navy">Content</h2>
        <div>
          <label className="block mb-2 font-medium text-navy">Title *</label>
          <input
            type="text"
            name="title"
            value={form.title}
            onChange={handleChange}
            className="input-field w-full"
            placeholder="Find your dream home"
            required
            maxLength={120}
          />
        </div>
        <div>
          <label className="block mb-2 font-medium text-navy">Subtitle</label>
          <input
            type="text"
            name="subtitle"
            value={form.subtitle}
            onChange={handleChange}
            className="input-field w-full"
            placeholder="Premium properties across Nepal"
            maxLength={160}
          />
        </div>
        <div>
          <label className="block mb-2 font-medium text-navy">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            className="input-field w-full"
            rows={3}
            maxLength={500}
            placeholder="Supporting text shown on the slide"
          />
        </div>
      </section>

      {/* B. Media */}
      <section className="space-y-4">
        <h2 className="font-display text-xl text-navy">Media</h2>
        <div className="flex gap-4">
          {["image", "video"].map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-navy capitalize">
              <input
                type="radio"
                name="mediaType"
                value={t}
                checked={form.mediaType === t}
                onChange={handleChange}
              />
              {t}
            </label>
          ))}
        </div>
        <div>
          <label className="block mb-2 font-medium text-navy">
            {form.mediaType === "video" ? "Upload Video (MP4, WebM, MOV)" : "Upload Image (JPG, PNG, WEBP, GIF)"}
            {!isEditing && " *"}
          </label>
          {directMedia ? (
            <div>
              {mediaEntry ? (
                <div className="mb-2 max-w-xs">
                  <div className="relative rounded-sm overflow-hidden border border-navy/15 mb-2 bg-navy/5">
                    {mediaEntry.file.type.startsWith("image/") ? (
                      <DirectPreview file={mediaEntry.file} alt={form.altText || form.title} />
                    ) : (
                      <p className="text-xs text-slate-muted px-3 py-6 text-center truncate">{mediaEntry.file.name}</p>
                    )}
                    {mediaEntry.status === FILE_STATES.SUCCESS && (
                      <button
                        type="button"
                        onClick={() => { heroUp.cancel(mediaEntry.clientId).catch(() => {}); setMediaClientId(null); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brick text-white text-xs leading-5"
                        aria-label="Remove media"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {mediaEntry.status !== FILE_STATES.SUCCESS && (
                    <div>
                      <div className="h-1.5 bg-navy/10 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-brass transition-all"
                          style={{ width: `${Math.round((mediaEntry.progress || 0) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-muted">
                        {mediaEntry.status === FILE_STATES.FAILED
                          ? `Upload failed — ${mediaEntry.error || "please retry."}`
                          : `Uploading… ${Math.round((mediaEntry.progress || 0) * 100)}%`}
                      </p>
                      <div className="flex gap-2 mt-1">
                        {mediaEntry.status === FILE_STATES.FAILED && (
                          <button type="button" onClick={() => heroUp.retry(mediaEntry.clientId)} className="text-xs font-medium text-brass hover:underline">
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { heroUp.cancel(mediaEntry.clientId).catch(() => {}); setMediaClientId(null); }}
                          className="text-xs text-slate-muted hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                isEditing && existingMedia?.url && (
                  <p className="text-xs text-slate-muted mt-1 mb-2">Current file kept unless you select a new one.</p>
                )
              )}
              <input
                type="file"
                accept={form.mediaType === "video" ? "video/*" : "image/*"}
                onChange={handleDirectMedia}
                className="text-sm text-slate-muted"
              />
              <p className="text-xs text-slate-muted mt-1">Uploads straight to media storage with progress — the 50 MB video cap still applies.</p>
            </div>
          ) : (
            <>
              <input
                type="file"
                accept={form.mediaType === "video" ? "video/*" : "image/*"}
                onChange={(e) => setMediaFile(e.target.files[0] ?? null)}
                className="text-sm text-slate-muted"
              />
              {mediaFile && <p className="text-xs text-slate-muted mt-1">Selected: {mediaFile.name}</p>}
              {isEditing && existingMedia?.url && !mediaFile && (
                <p className="text-xs text-slate-muted mt-1">Current file kept unless you select a new one.</p>
              )}
            </>
          )}
        </div>
        <div>
          <label className="block mb-2 font-medium text-navy">
            Thumbnail {form.mediaType === "video" ? "(recommended for videos)" : "(optional)"}
          </label>
          {directMedia ? (
            <div>
              {thumbEntry ? (
                <div className="mb-2 max-w-xs">
                  <div className="relative w-40 h-28 rounded-sm overflow-hidden border border-navy/15 mb-2">
                    <DirectPreview file={thumbEntry.file} alt="Thumbnail preview" />
                    {thumbEntry.status === FILE_STATES.SUCCESS && (
                      <button
                        type="button"
                        onClick={() => { heroUp.cancel(thumbEntry.clientId).catch(() => {}); setThumbClientId(null); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brick text-white text-xs leading-5"
                        aria-label="Remove thumbnail"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {thumbEntry.status !== FILE_STATES.SUCCESS && (
                    <div>
                      <div className="h-1.5 bg-navy/10 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-brass transition-all"
                          style={{ width: `${Math.round((thumbEntry.progress || 0) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-muted">
                        {thumbEntry.status === FILE_STATES.FAILED
                          ? `Upload failed — ${thumbEntry.error || "please retry."} A failed thumbnail never blocks the media.`
                          : `Uploading… ${Math.round((thumbEntry.progress || 0) * 100)}%`}
                      </p>
                      <div className="flex gap-2 mt-1">
                        {thumbEntry.status === FILE_STATES.FAILED && (
                          <button type="button" onClick={() => heroUp.retry(thumbEntry.clientId)} className="text-xs font-medium text-brass hover:underline">
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { heroUp.cancel(thumbEntry.clientId).catch(() => {}); setThumbClientId(null); }}
                          className="text-xs text-slate-muted hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                isEditing && existingMedia?.thumbnailUrl && (
                  <p className="text-xs text-slate-muted mt-1 mb-2">Current thumbnail kept unless you select a new one.</p>
                )
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleDirectThumb}
                className="text-sm text-slate-muted"
              />
            </div>
          ) : (
            <>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setThumbnailFile(e.target.files[0] ?? null)}
                className="text-sm text-slate-muted"
              />
              {thumbnailFile && <p className="text-xs text-slate-muted mt-1">Selected: {thumbnailFile.name}</p>}
            </>
          )}
        </div>
        <div>
          <label className="block mb-2 font-medium text-navy">Alt text (accessibility)</label>
          <input
            type="text"
            name="altText"
            value={form.altText}
            onChange={handleChange}
            className="input-field w-full"
            placeholder="Describe the media for screen readers"
            maxLength={160}
          />
        </div>
      </section>

      {/* C. CTA */}
      <section className="space-y-4">
        <h2 className="font-display text-xl text-navy">Call to Action</h2>
        <label className="flex items-center gap-2 text-sm text-navy">
          <input
            type="checkbox"
            name="ctaEnabled"
            checked={form.ctaEnabled}
            onChange={handleChange}
          />
          Enable CTA button
        </label>
        {form.ctaEnabled && (
          <>
            <div>
              <label className="block mb-2 font-medium text-navy">Button label *</label>
              <input
                type="text"
                name="ctaLabel"
                value={form.ctaLabel}
                onChange={handleChange}
                className="input-field w-full"
                placeholder="View Property"
                maxLength={40}
              />
            </div>
            <div className="flex gap-4">
              {[
                { value: "property", label: "Property" },
                { value: "url", label: "External URL" },
                { value: "none", label: "None" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-navy">
                  <input
                    type="radio"
                    name="ctaActionType"
                    value={opt.value}
                    checked={form.ctaActionType === opt.value}
                    onChange={handleChange}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {form.ctaActionType === "property" && (
              <div>
                <label className="block mb-2 font-medium text-navy">Linked property *</label>
                {form.ctaActionValue ? (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-navy flex-1 truncate">
                      {propertyTitle || form.ctaActionValue}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, ctaActionValue: "" }));
                        setPropertyTitle("");
                      }}
                      className="text-sm text-brick hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={propertySearch}
                      onChange={(e) => setPropertySearch(e.target.value)}
                      className="input-field w-full"
                      placeholder="Search properties by title..."
                    />
                    {propertySearching && <p className="text-xs text-slate-muted mt-1">Searching...</p>}
                    {propertyResults.length > 0 && (
                      <ul className="mt-2 border border-navy/10 rounded-sm divide-y divide-navy/5 bg-white">
                        {propertyResults.map((p) => (
                          <li key={p._id}>
                            <button
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({ ...prev, ctaActionValue: p._id }));
                                setPropertyTitle(p.title);
                                setPropertyResults([]);
                                setPropertySearch("");
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-navy/5"
                            >
                              <span className="text-navy">{p.title}</span>
                              <span className="text-slate-muted text-xs ml-2 capitalize">{p.status}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <p className="text-xs text-slate-muted mt-1">
                  Only available properties can be promoted. Sold or removed listings are hidden from the homepage automatically.
                </p>
              </div>
            )}
            {form.ctaActionType === "url" && (
              <div>
                <label className="block mb-2 font-medium text-navy">URL *</label>
                <input
                  type="url"
                  name="ctaActionValue"
                  value={form.ctaActionValue}
                  onChange={handleChange}
                  className="input-field w-full"
                  placeholder="https://example.com/offer"
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* D. Schedule */}
      <section className="space-y-4">
        <h2 className="font-display text-xl text-navy">Schedule</h2>
        <p className="text-sm text-slate-muted -mt-2">Times are Nepal time (NPT). Leave blank for no bound.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block mb-2 font-medium text-navy">Start date/time (optional)</label>
            <input
              type="datetime-local"
              name="startAt"
              value={form.startAt}
              onChange={handleChange}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block mb-2 font-medium text-navy">End date/time (optional)</label>
            <input
              type="datetime-local"
              name="endAt"
              value={form.endAt}
              onChange={handleChange}
              className="input-field w-full"
            />
          </div>
        </div>
      </section>

      {/* E. Display */}
      <section className="space-y-4">
        <h2 className="font-display text-xl text-navy">Display</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block mb-2 font-medium text-navy">Display order</label>
            <input
              type="number"
              name="displayOrder"
              min="0"
              value={form.displayOrder}
              onChange={handleChange}
              className="input-field w-full"
              placeholder="Auto (last)"
            />
          </div>
          <div>
            <label className="block mb-2 font-medium text-navy">Duration (seconds, 3–60)</label>
            <input
              type="number"
              name="duration"
              min="3"
              max="60"
              value={form.duration}
              onChange={handleChange}
              className="input-field w-full"
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          disabled={submitting || (directMedia && mediaBusy)}
          onClick={() => handleSubmit("draft")}
          className="btn-secondary text-sm py-2.5 px-6 disabled:opacity-50"
        >
          {submitting ? "Saving..." : directMedia && mediaBusy ? "Uploading…" : "Save Draft"}
        </button>
        <button
          type="button"
          disabled={submitting || (directMedia && mediaBusy)}
          onClick={() => handleSubmit("published")}
          className="btn-gold text-sm py-2.5 px-6 disabled:opacity-50"
        >
          {submitting ? "Saving..." : directMedia && mediaBusy ? "Uploading…" : isEditing ? "Save & Publish" : "Publish"}
        </button>
        <Link to="/dashboard/admin/hero-slides" className="text-sm text-slate-muted hover:underline self-center">
          Cancel
        </Link>
      </div>
    </form>
  );
}

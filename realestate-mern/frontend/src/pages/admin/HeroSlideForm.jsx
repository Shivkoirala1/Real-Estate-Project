import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  createHeroSlide,
  getHeroSlideById,
  updateHeroSlide,
} from "../../services/heroSlideService";
import { getProperties, getPropertyByIdorSlug } from "../../services/propertyService";

const toInputDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
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
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      // switching destination type invalidates the previous value
      ...(name === "ctaActionType" ? { ctaActionValue: "" } : {}),
    }));
    if (name === "ctaActionType") setPropertyTitle("");
  };

  const validate = () => {
    if (!form.title.trim()) return "Slide title is required.";
    if (!isEditing && !mediaFile) return "A media file is required.";
    if (mediaFile) {
      const isVideo = mediaFile.type.startsWith("video/");
      const isImage = mediaFile.type.startsWith("image/");
      if (!isVideo && !isImage) return "Media must be an image or a video file.";
      if ((form.mediaType === "video") !== isVideo) {
        return "Media type does not match the selected file.";
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
      startAt: form.startAt || "",
      endAt: form.endAt || "",
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

  const previewUrl = mediaFile
    ? URL.createObjectURL(mediaFile)
    : form.mediaType === "image"
      ? existingMedia?.url
      : null;
  const previewThumb = thumbnailFile
    ? URL.createObjectURL(thumbnailFile)
    : existingMedia?.thumbnailUrl || previewUrl;

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
              key={mediaFile ? previewUrl : existingMedia?.url}
              src={mediaFile ? previewUrl : existingMedia?.url}
              poster={previewThumb || undefined}
              muted
              loop
              playsInline
              controls={!!(mediaFile || existingMedia?.url)}
              className="w-full h-full object-cover"
            />
          ) : previewUrl ? (
            <img src={previewUrl} alt={form.altText || form.title} className="w-full h-full object-cover" />
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
        </div>
        <div>
          <label className="block mb-2 font-medium text-navy">
            Thumbnail {form.mediaType === "video" ? "(recommended for videos)" : "(optional)"}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setThumbnailFile(e.target.files[0] ?? null)}
            className="text-sm text-slate-muted"
          />
          {thumbnailFile && <p className="text-xs text-slate-muted mt-1">Selected: {thumbnailFile.name}</p>}
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
          disabled={submitting}
          onClick={() => handleSubmit("draft")}
          className="btn-secondary text-sm py-2.5 px-6 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save Draft"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleSubmit("published")}
          className="btn-gold text-sm py-2.5 px-6 disabled:opacity-50"
        >
          {submitting ? "Saving..." : isEditing ? "Save & Publish" : "Publish"}
        </button>
        <Link to="/dashboard/admin/hero-slides" className="text-sm text-slate-muted hover:underline self-center">
          Cancel
        </Link>
      </div>
    </form>
  );
}

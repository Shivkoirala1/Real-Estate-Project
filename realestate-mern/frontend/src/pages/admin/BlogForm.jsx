import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactQuill from "react-quill";
import { createBlog, getBlogById, updateBlog } from "../../services/blogService";
import { CLIENT_UPLOAD_LIMITS, downscaleImage, useObjectPreview, validateImageFile } from "../../utils/imageUpload";
import { FILE_STATES, useDirectUpload } from "../../hooks/useDirectUpload";

// Blob preview owned by this component (revoked on replace/unmount).
const CoverPreview = ({ file }) => {
  const preview = useObjectPreview(file);
  if (!preview) return null;
  return (
    <div className="mb-3 w-48 h-32 overflow-hidden rounded-sm bg-navy/5">
      <img src={preview} alt="New cover" className="w-full h-full object-cover" />
    </div>
  );
};

// keep the toolbar simple and practical — no image embedding here since
// coverImage already covers that; embedding images in Quill would bloat
// the body field with base64 data
const quillModules = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "link"],
    ["clean"],
  ],
};

export default function BlogForm() {
  const params = useParams();
  const navigate = useNavigate();
  // if params.id exists, we are editing an existing blog, otherwise we are creating a new one
  const isEditing = !!params.id;

  const [form, setForm] = useState({
    title: "",
    body: "",
    tags: "",
    status: "draft",
  });
  const [coverImage, setCoverImage] = useState(null);
  const [existingCoverUrl, setExistingCoverUrl] = useState(null);
  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Phase 4 direct-upload: cover goes browser → Cloudinary through a blog
  // session; submit carries only the uploadId. Legacy File state above
  // stays for the flag-off path.
  // Kill-switch: VITE_BLOG_DIRECT_UPLOAD=false restores pure legacy.
  const directCover = import.meta.env.VITE_BLOG_DIRECT_UPLOAD !== "false";
  const coverUp = useDirectUpload({ scope: "blog", concurrency: 1 });
  const [coverClientId, setCoverClientId] = useState(null);
  const coverStartRef = useRef(null);
  const coverEntry = coverUp.files.find((f) => f.clientId === coverClientId) || null;
  const coverBusy = coverUp.files.some((f) =>
    [FILE_STATES.QUEUED, FILE_STATES.SIGNING, FILE_STATES.UPLOADING, FILE_STATES.COMPLETING].includes(f.status)
  );
  const coverUploadId = coverEntry && coverEntry.status === FILE_STATES.SUCCESS ? coverEntry.uploadId : null;

  // hooks must always run in the same order, so the effect itself is
  // unconditional — only the fetch logic inside is gated on isEditing
  useEffect(() => {
    if (!isEditing) return;

    let isMounted = true;

    const fetchBlogData = async () => {
      setLoading(true);
      try {
        const data = await getBlogById(params.id);
        if (!isMounted) return;

        // Envelope-compatible: detail endpoint nests under `blog`.
        const doc = data.blog ?? data;

        // convert tags array to comma-separated string for the form input
        
        let tagString = Array.isArray(doc.tags)
  ? doc.tags.join(", ")
  : "";

        setForm({
          title: doc.title ?? "",
          body: doc.body ?? "",
          tags: (tagString ?? ""),
          status: doc.status ?? "draft",
        });
        
        if (doc.coverImage) {
          setExistingCoverUrl(doc.coverImage);
        }
      } catch (err) {
        console.error("Failed to load blog:", err);
        if (isMounted) setError("Couldn't load this blog. Please go back and try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchBlogData();
    return () => {
      isMounted = false;
    };
  }, [isEditing, params.id]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleBodyChange = (content) => {
    setForm({ ...form, body: content });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      // Direct flow: cover already lives on Cloudinary — submit the
      // authorized uploadId, never bytes. Failed covers block (unless an
      // existing cover is kept); completed uploads survive validation
      // failures, so resubmits reuse the id.
      if (directCover) {
        if (coverBusy) {
          setSubmitting(false);
          setError("Cover photo is still uploading — please wait before saving.");
          return;
        }
        if (coverEntry && coverEntry.status === FILE_STATES.FAILED && !existingCoverUrl) {
          setSubmitting(false);
          setError("Cover photo upload failed — retry it or pick another photo.");
          return;
        }
        const payload = {
          title: form.title,
          body: form.body,
          tags,
          status: form.status,
          // Explicit null (not dropped) so the backend takes the direct
          // path even when no cover was picked — cover is optional.
          coverUploadId: coverUploadId || null,
          uploadSessionId: coverUp.sessionId,
          clientStats: {
            uploadDurationMs: coverStartRef.current ? Date.now() - coverStartRef.current : 0,
            retries: coverUp.files.reduce((s, f) => s + (f.attempts || 0), 0),
            failures: coverUp.files.filter((f) => f.status === FILE_STATES.FAILED).length,
            timeouts: 0,
          },
        };
        if (isEditing) {
          await updateBlog(params.id, payload);
        } else {
          await createBlog(payload);
        }
        navigate("/dashboard/admin/blogs");
        return;
      }
      if (isEditing) {
        await updateBlog(params.id, {
          title: form.title,
          body: form.body,
          tags,
          status: form.status,
          coverImage: coverImage instanceof File ? coverImage : null, // only send if a new file was picked
        });
      } else {
        await createBlog({
          title: form.title,
          body: form.body,
          tags,
          status: form.status,
          coverImage,
        });
      }
      navigate("/dashboard/admin/blogs");
    } catch (err) {
      console.error("Failed to save blog:", err);
      setError(err?.response?.data?.message || "Failed to save blog. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-slate-muted max-w-3xl mx-auto">Loading...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-3xl">{isEditing ? "Edit Blog" : "Create Blog"}</h1>
      </div>

      {error && (
        <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block mb-2 font-medium text-navy">Title</label>
        <input
          type="text"
          name="title"
          value={form.title}
          onChange={handleChange}
          className="input-field w-full"
          placeholder="Enter blog title"
          required
        />
      </div>

      <div>
        <label className="block mb-2 font-medium text-navy">Cover Image</label>
        {directCover ? (
          <div>
            {coverEntry ? (
              <div className="mb-2">
                {coverEntry.file && <CoverPreview file={coverEntry.file} />}
                {coverEntry.status !== FILE_STATES.SUCCESS ? (
                  <div className="max-w-xs">
                    <div className="h-1.5 bg-navy/10 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full bg-brass transition-all"
                        style={{ width: `${Math.round((coverEntry.progress || 0) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-muted">
                      {coverEntry.status === FILE_STATES.FAILED
                        ? `Upload failed — ${coverEntry.error || "please retry."}`
                        : `Uploading… ${Math.round((coverEntry.progress || 0) * 100)}%`}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {coverEntry.status === FILE_STATES.FAILED && (
                        <button type="button" onClick={() => coverUp.retry(coverEntry.clientId)} className="text-xs font-medium text-brass hover:underline">
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { coverUp.cancel(coverEntry.clientId).catch(() => {}); setCoverClientId(null); }}
                        className="text-xs text-slate-muted hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  coverEntry.status === FILE_STATES.SUCCESS && (
                    <button
                      type="button"
                      onClick={() => { coverUp.cancel(coverEntry.clientId).catch(() => {}); setCoverClientId(null); }}
                      className="text-xs text-slate-muted hover:underline mb-2"
                    >
                      Remove new cover
                    </button>
                  )
                )}
              </div>
            ) : (
              existingCoverUrl && (
                <div className="mb-3 w-48 h-32 overflow-hidden rounded-sm bg-navy/5">
                  <img src={existingCoverUrl} alt="Current cover" className="w-full h-full object-cover" />
                </div>
              )
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files[0] ?? null;
                e.target.value = "";
                if (!file) return;
                const err = validateImageFile(file, { maxBytes: CLIENT_UPLOAD_LIMITS.blogCover, label: "Cover image" });
                if (err) {
                  setError(err);
                  return;
                }
                setError(null);
                if (coverClientId) {
                  try {
                    await coverUp.cancel(coverClientId);
                  } catch {
                    // Already gone — continue with the new pick.
                  }
                }
                if (!coverStartRef.current) coverStartRef.current = Date.now();
                const [clientId] = coverUp.addFiles([file], { purpose: "blog-cover" });
                setCoverClientId(clientId || null);
              }}
              className="text-sm text-slate-muted"
            />
            <p className="text-xs text-slate-muted mt-1">Optional. Uploads immediately with progress — submit carries only a reference.</p>
          </div>
        ) : (
          <>
            {existingCoverUrl && !coverImage && (
              <div className="mb-3 w-48 h-32 overflow-hidden rounded-sm bg-navy/5">
                <img
                  src={existingCoverUrl}
                  alt="Current cover"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files[0] ?? null;
                if (!file) {
                  setCoverImage(null);
                  return;
                }
                // Fail fast in the browser (backend 10 MB cap is authoritative).
                const err = validateImageFile(file, { maxBytes: CLIENT_UPLOAD_LIMITS.blogCover, label: 'Cover image' });
                if (err) {
                  setError(err);
                  e.target.value = '';
                  return;
                }
                setError(null);
                setCoverImage(await downscaleImage(file));
              }}
              className="text-sm text-slate-muted"
            />
          </>
        )}
      </div>

      <div>
        <label className="block mb-2 font-medium text-navy">Content</label>
        <ReactQuill
          theme="snow"
          value={form.body}
          onChange={handleBodyChange}
          modules={quillModules}
          className="bg-white rounded-sm [&_.ql-container]:rounded-b-sm [&_.ql-toolbar]:rounded-t-sm"
          placeholder="Write your blog content..."
        />
      </div>

      <div>
        <label className="block mb-2 font-medium text-navy">Tags</label>
        <input
          type="text"
          name="tags"
          value={form.tags}
          onChange={handleChange}
          className="input-field w-full"
          placeholder="market trends, buying guide, car parts"
        />
      </div>

      <div>
        <label className="block mb-2 font-medium text-navy">Status</label>
        <select
          name="status"
          value={form.status}
          onChange={handleChange}
          className="input-field w-full"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      <button type="submit" disabled={submitting || (directCover && coverBusy)} className="btn-gold text-sm py-2.5 px-6 disabled:opacity-50">
        {submitting ? "Saving..." : directCover && coverBusy ? "Uploading…" : "Save Blog"}
      </button>
    </form>
  );
}
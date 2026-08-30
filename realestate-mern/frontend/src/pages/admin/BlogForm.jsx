import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactQuill from "react-quill";
import { createBlog, getBlogById, updateBlog } from "../../services/blogService";

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

        // convert tags array to comma-separated string for the form input
        
        let tagString = Array.isArray(data.tags)
  ? data.tags.join(", ")
  : "";

        setForm({
          title: data.title ?? "",
          body: data.body ?? "",
          tags: (tagString ?? ""),
          status: data.status ?? "draft",
        });
        
        if (data.coverImage) {
          setExistingCoverUrl(data.coverImage);
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
          onChange={(e) => setCoverImage(e.target.files[0] ?? null)}
          className="text-sm text-slate-muted"
        />
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

      <button type="submit" disabled={submitting} className="btn-gold text-sm py-2.5 px-6 disabled:opacity-50">
        {submitting ? "Saving..." : "Save Blog"}
      </button>
    </form>
  );
}
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { createBlog, getBlogById, deleteBlog, updateBlog } from "../../services/blogService"; 
export default function BlogForm() {

const params = useParams();
// if params.id exists, we are editing an existing blog, otherwise we are creating a new one
const isEditing = !!params.id;
  const [form, setForm] = useState({
    title: "",
    body: "",
    tags: "",
    status: "draft",
  });

  const [coverImage, setCoverImage] = useState(null);

  if (isEditing) {
    useEffect(() => {
      const fetchBlogData = async () => {
        const data = await getBlogById(params.id);
        setForm({
          title: data.title,
          body: data.body,
          tags: data.tags.join(", "),
          status: data.status,
        });
        if (data.coverImage) {
          setCoverImage(data.coverImage);
        }
      };

      fetchBlogData();
    }, [params.id]);
  }

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    console.log("Submitting form:", form);
    e.preventDefault();
    if (isEditing) {
        console.log("Editing blog with ID:", params.id);
        let newImage = coverImage instanceof File ? coverImage : null; // Only send if it's a new file
        const data = await updateBlog(params.id, {
            title: form.title,
            body: form.body,
            tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            status: form.status,
            coverImage: newImage,
        });
    } else {
    const data = await createBlog({
      title: form.title,
      body: form.body,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      status: form.status,
      coverImage: coverImage,
    });

  };
}

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto space-y-6"
    >
      <div>
        <label className="block mb-2 font-medium">
          Title
        </label>

        <input
          type="text"
          name="title"
          value={form.title}
          onChange={handleChange}
          className="w-full rounded-lg border px-4 py-2"
          placeholder="Enter blog title"
        />
      </div>

      <div>
        <label className="block mb-2 font-medium">
          Cover Image
        </label>
        {isEditing && coverImage && (
          <div className="mb-2 w-48 h-32 overflow-hidden">
            <img src={coverImage} alt="Cover" className="object-cover rounded-lg" />
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) =>
            setCoverImage(e.target.files[0])
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="block mb-2 font-medium">
          Content
        </label>

        <textarea
          name="body"
          value={form.body}
          onChange={handleChange}
          rows={12}
          className="w-full rounded-lg border px-4 py-2"
          placeholder="Write your blog content..."
        />
      </div>

      <div>
        <label className="block mb-2 font-medium">
          Tags
        </label>

        <input
          type="text"
          name="tags"
          value={form.tags}
          onChange={handleChange}
          className="w-full rounded-lg border px-4 py-2"
          placeholder="market trends, buying guide, car parts"
        />
      </div>

      <div>
        <label className="block mb-2 font-medium">
          Status
        </label>

        <select
          name="status"
          value={form.status}
          onChange={handleChange}
          className="w-full rounded-lg border px-4 py-2"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
      >
        Save Blog
      </button>
    </form>
  );
}
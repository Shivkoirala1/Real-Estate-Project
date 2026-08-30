import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getBlogBySlug } from "../services/blogService"; 

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const BlogDetail = () => {
  const { slug } = useParams();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchBlog = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await getBlogBySlug(slug);
        if (isMounted) setBlog(data);
      } catch (err) {
        if (isMounted) setNotFound(true);
        console.error("Failed to load blog:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchBlog();
    window.scrollTo({ top: 0, behavior: "smooth" });

    return () => {
      isMounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-slate-muted">Loading...</p>
      </div>
    );
  }

  if (notFound || !blog) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <p className="eyebrow mb-2">Blog</p>
        <h1 className="text-3xl mb-4">Article not found</h1>
        <p className="text-slate-muted mb-8">
          This article may have been unpublished or moved.
        </p>
        <Link to="/blogs" className="btn-gold text-sm py-2.5 px-4">
          Back to Articles
        </Link>
      </div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/blogs" className="text-sm text-brass hover:underline">
        ← Back to Articles
      </Link>

      <p className="eyebrow mt-8 mb-2">Blog</p>
      <h1 className="text-4xl leading-tight mb-4">{blog.title}</h1>

      <p className="text-sm text-slate-muted mb-8">
        {formatDate(blog.publishedAt)}
        {blog.author?.name ? ` · ${blog.author.name}` : ""}
      </p>

      {blog.coverImage && (
        <div className="rounded-sm overflow-hidden mb-10 bg-navy/5">
          <img
            src={blog.coverImage}
            alt={blog.title}
            className="w-full h-auto object-cover"
          />
        </div>
      )}

      {/* body is stored as HTML from the editor — render it directly */}
    <div
  className="
    prose
    prose-navy
    max-w-none
    text-navy

    prose-h2:text-3xl
    prose-h2:font-medium
    prose-h2:text-navy

    prose-h3:text-xl
    prose-h3:font-medium
    prose-h3:text-navy

    prose-p:text-slate-muted
    prose-p:leading-7

    prose-ol:list-decimal
    prose-ul:list-disc
    prose-li:text-slate-muted
  "
  dangerouslySetInnerHTML={{ __html: blog.body }}
/>

      {Array.isArray(blog.tags) && blog.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-10 pt-8 border-t border-navy/10">
          {blog.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs uppercase tracking-wide text-slate-muted bg-navy/5 px-3 py-1 rounded-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};

export default BlogDetail;
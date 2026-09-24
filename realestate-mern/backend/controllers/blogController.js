const BlogPost = require("../models/BlogPost");
const createSlug = require("../utils/slugify");
const verifyToken = require('../utils/generateToken').verifyToken;
// Phase 4 direct-upload: blog covers may arrive as an authorized uploadId
// (browser → Cloudinary) instead of multipart bytes. Legacy req.file stays
// intact behind BLOG_DIRECT_UPLOAD_ENABLED.
const {
  resolveBlogCover,
  commitUploads,
  retireRemovedEntityUploads,
  publicDeliveryUrl,
  closeSession,
} = require("../services/uploadService");
const { recordSingleSubmit } = require("../utils/uploadMetrics");

const isBlogDirectEnabled = () => process.env.BLOG_DIRECT_UPLOAD_ENABLED !== 'false';

// Tags arrive as a JSON string on legacy multipart, or a real array on
// direct JSON submits. Invalid legacy strings fall back to [] (preserved).
const parseBlogTags = (tags) => {
  if (tags === undefined || tags === null) return [];
  if (Array.isArray(tags)) return tags.filter((t) => typeof t === 'string');
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};


// Create Blog
const createBlog = async (req, res) => {
  const startedAt = Date.now();
  const clientStats = req.body.clientStats && typeof req.body.clientStats === 'object' ? req.body.clientStats : {};
  try {
    const {
      title,
      body,
      tags,
      status,
    } = req.body;

    const directRequested = req.body.coverUploadId !== undefined;
    let direct = null;
    if (directRequested) {
      if (!isBlogDirectEnabled()) {
        recordSingleSubmit('blog-cover', 'direct', { durationMs: Date.now() - startedAt, outcome: 'error', clientStats });
        return res.status(400).json({
          message: "Direct cover upload is disabled — please use the standard cover upload",
        });
      }
      try {
        const row = await resolveBlogCover({
          actor: req.user,
          sessionId: req.body.uploadSessionId,
          coverUploadId: req.body.coverUploadId,
        });
        direct = row ? { url: publicDeliveryUrl(row), upload: row } : null;
      } catch (err) {
        recordSingleSubmit('blog-cover', 'direct', { durationMs: Date.now() - startedAt, outcome: 'validation', clientStats });
        return res.status(err.statusCode || 500).json({ message: err.message || "Failed to create blog" });
      }
    }

    const coverImage = direct ? direct.url : req.file
    ? req.file.path
    : null;

    if (!title || !body) {
      // Direct uploads stay `completed` — resubmit reuses the id.
      if (direct) {
        recordSingleSubmit('blog-cover', 'direct', {
          durationMs: Date.now() - startedAt, hasFile: true,
          bytes: direct.upload.clientMeta.bytes || 0, outcome: 'validation', clientStats,
        });
      }
      return res.status(400).json({
        message: "Title and body are required",
      });
    }
    
    const slug = createSlug(title);
    const existingBlog = await BlogPost.findOne({ slug });

    if (existingBlog) {
      if (direct) {
        recordSingleSubmit('blog-cover', 'direct', {
          durationMs: Date.now() - startedAt, hasFile: true,
          bytes: direct.upload.clientMeta.bytes || 0, outcome: 'validation', clientStats,
        });
      }
      return res.status(409).json({
        message: "A blog with this title already exists",
      });
    }

    const parsedTags = parseBlogTags(tags);

    const blog = await BlogPost.create({
      title,
      slug,
      body,
      author: req.user._id,
      tags: parsedTags,
      status: status || "draft",
      coverImage: coverImage,
      publishedAt:
        status === "published"
          ? new Date()
          : null,
    });

    if (direct) {
      try {
        await commitUploads({
          actor: req.user,
          sessionId: req.body.uploadSessionId,
          uploadIds: [String(direct.upload._id)],
          entityType: 'blog',
          entityId: String(blog._id),
        });
      } catch (err) {
        await BlogPost.deleteOne({ _id: blog._id });
        recordSingleSubmit('blog-cover', 'direct', {
          durationMs: Date.now() - startedAt, hasFile: true,
          bytes: direct.upload.clientMeta.bytes || 0, outcome: 'error', clientStats,
        });
        return res.status(err.statusCode || 500).json({ message: err.message || "Failed to create blog" });
      }
      await closeSession(req.body.uploadSessionId, req.user);
      recordSingleSubmit('blog-cover', 'direct', {
        durationMs: Date.now() - startedAt, hasFile: true,
        bytes: direct.upload.clientMeta.bytes || 0, outcome: 'success', clientStats,
      });
    } else {
      recordSingleSubmit('blog-cover', 'legacy', {
        durationMs: Date.now() - startedAt, hasFile: Boolean(req.file),
        bytes: (req.file && (req.file.size || req.file.bytes)) || 0, outcome: 'success',
      });
    }

    res.status(201).json({
      success: true,
      message: "Blog created successfully",
      blog,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to create blog",
      error: error.message,
    });
  }
};

// Get all blogs with pagination + optional status/search filters
// GET /api/blogs?page=1&limit=10&status=published&search=ev&sort=createdAt
const getBlogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 10, 1),
      100
    );

    const skip = (page - 1) * limit;

    const { status, search, orderBy } = req.query;
 
  const sort = {
  createdAt: orderBy === "2" ? 1 : -1,
  _id: -1, // secondary sort by _id to ensure consistent ordering
};

    const filter = {};

    if (status && ["draft", "published"].includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const [blogs, total] = await Promise.all([
      BlogPost.find(filter)
        .populate("author", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limit),

      BlogPost.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch blogs",
      error: error.message,
    });
  }
};

// Get all published blogs with pagination GET /api/blogs/published?page=2&limit=10
const getPublishedBlogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 9, 1),
      50
    );
    const search = req.query.search || "";

    const skip = (page - 1) * limit;

    const filter = {
      status: "published",
    };

    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const [blogs, total] = await Promise.all([
      BlogPost.find(filter)
        .populate("author", "name")
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit),

      BlogPost.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch published blogs",
      error: error.message,
    });
  }
};

// Get a single blog by ID
const getBlogById = async (req, res) => {
  try {
    const blog = await BlogPost.findById(req.params.id).populate("author", "name email");

    if (!blog) {
      return res.status(404).json({
        message: "Blog not found",
      });
    }

    res.status(200).json({ success: true, blog });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
};

// Get a single blog by slug
const getBlogBySlug = async (req, res) => {
  try {
    let userRole = "user";
    if (req.headers.authorization) {
      let validToken = verifyToken(req.headers.authorization?.split(" ")[1]);
      userRole = validToken.role; 
    }
    const blog = await BlogPost.findOne({
      slug: req.params.slug,
      status: userRole === "admin" ? { $in: ["published", "draft"] } : "published",
    }).populate("author", "name");

    if (!blog) {
      return res.status(404).json({
        message: "Blog not found",
      });
    }
    res.status(200).json({ success: true, blog });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
};

// Update a blog by ID
const updateBlog = async (req, res) => {
  const startedAt = Date.now();
  const clientStats = req.body.clientStats && typeof req.body.clientStats === 'object' ? req.body.clientStats : {};
  try {
    const { title, body, tags, status } = req.body;

    const blog = await BlogPost.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        message: "Blog not found",
      });
    }

    const directRequested = req.body.coverUploadId !== undefined;
    let direct = null;
    if (directRequested) {
      if (!isBlogDirectEnabled()) {
        recordSingleSubmit('blog-cover', 'direct', { durationMs: Date.now() - startedAt, outcome: 'error', clientStats });
        return res.status(400).json({
          message: "Direct cover upload is disabled — please use the standard cover upload",
        });
      }
      try {
        const row = await resolveBlogCover({
          actor: req.user,
          sessionId: req.body.uploadSessionId,
          coverUploadId: req.body.coverUploadId,
          forEntityId: blog._id,
        });
        direct = row ? { url: publicDeliveryUrl(row), upload: row } : null;
      } catch (err) {
        recordSingleSubmit('blog-cover', 'direct', { durationMs: Date.now() - startedAt, outcome: 'validation', clientStats });
        return res.status(err.statusCode || 500).json({ message: err.message || "Failed to update blog" });
      }
    }

    if (title) {
      blog.title = title;
      blog.slug = createSlug(title);
    }

    if (body !== undefined) {
      blog.body = body;
    }

    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        blog.tags = tags.filter((t) => typeof t === 'string');
      } else {
        try {
          blog.tags = JSON.parse(tags);
        } catch (error) {
          return res.status(400).json({
            message: "Invalid tags format",
          });
        }
      }
    }

    if (status !== undefined) {
      blog.status = status;

      if (status === "published" && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }

      if (status === "draft") {
        blog.publishedAt = null;
      }
    }

    if (direct) {
      // Commit BEFORE save (the blog already exists). A save failure leaves
      // committed rows pointing at valid bytes — the next update retires
      // them if replaced; the working cover is untouched.
      try {
        await commitUploads({
          actor: req.user,
          sessionId: req.body.uploadSessionId,
          uploadIds: [String(direct.upload._id)],
          entityType: 'blog',
          entityId: String(blog._id),
        });
      } catch (err) {
        recordSingleSubmit('blog-cover', 'direct', {
          durationMs: Date.now() - startedAt, hasFile: true,
          bytes: direct.upload.clientMeta.bytes || 0, outcome: 'error', clientStats,
        });
        return res.status(err.statusCode || 500).json({ message: err.message || "Failed to update blog" });
      }
      blog.coverImage = direct.url;
    } else if (req.file) {
        blog.coverImage = req.file.path;
    }

    await blog.save();

    if (direct) {
      // Deferred retirement of the replaced direct cover (legacy covers
      // with no Upload row are left alone — ownership unprovable).
      await retireRemovedEntityUploads({
        entityType: 'blog',
        entityId: blog._id,
        keepUrls: [blog.coverImage],
      });
      await closeSession(req.body.uploadSessionId, req.user);
      recordSingleSubmit('blog-cover', 'direct', {
        durationMs: Date.now() - startedAt, hasFile: true,
        bytes: direct.upload.clientMeta.bytes || 0, outcome: 'success', clientStats,
      });
    } else {
      recordSingleSubmit('blog-cover', 'legacy', {
        durationMs: Date.now() - startedAt, hasFile: Boolean(req.file),
        bytes: (req.file && (req.file.size || req.file.bytes)) || 0, outcome: 'success',
      });
    }

    res.status(200).json({
      success: true,
      message: "Blog updated successfully",
      blog,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update blog",
      error: error.message,
    });
  }
};

// Delete a blog by ID
const deleteBlog = async (req, res) => {
  try {
    const blog = await BlogPost.findByIdAndDelete(req.params.id);

    if (!blog) {
      return res.status(404).json({
        message: "Blog not found",
      });
    }

    // Retire direct-upload covers (destroys bytes best-effort + marks
    // rows). Legacy covers were never cleaned — preserved behavior.
    await retireRemovedEntityUploads({ entityType: 'blog', entityId: blog._id, keepUrls: [] });

    res.status(200).json({
      message: "Blog deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete blog",
      error: error.message,
    });
  }
};

module.exports = {
  createBlog,
  getBlogs,
  getPublishedBlogs,
  getBlogById,
  getBlogBySlug,
  updateBlog,
  deleteBlog,
};
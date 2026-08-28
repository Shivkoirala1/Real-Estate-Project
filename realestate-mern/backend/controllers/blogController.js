const BlogPost = require("../models/BlogPost");
const slugify = require("slugify");

// Create Blog
const createBlog = async (req, res) => {
  try {
    const {
      title,
      body,
      tags,
      status,
    } = req.body;

    const coverImage = req.file
    ? req.file.path
    : null;

    if (!title || !body) {
      return res.status(400).json({
        message: "Title and body are required",
      });
    }

    const slug = slugify(title, {
      lower: true,
      strict: true,
      trim: true,
    });

    const existingBlog = await BlogPost.findOne({ slug });

    if (existingBlog) {
      return res.status(409).json({
        message: "A blog with this title already exists",
      });
    }

    let parsedTags = [];

    if (tags) {
    try {
        parsedTags = JSON.parse(tags);
    } catch {
        parsedTags = [];
    }
    }

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

    res.status(201).json({
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
// GET /api/blogs?page=1&limit=10&status=published&search=ev
const getBlogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 10, 1),
      100
    );

    const skip = (page - 1) * limit;

    const { status, search } = req.query;

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
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      BlogPost.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
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

    const skip = (page - 1) * limit;

    const filter = {
      status: "published",
    };

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

    res.status(200).json(blog);
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
    const blog = await BlogPost.findOne({
      slug: req.params.slug,
      status: "published",
    }).populate("author", "name");

    if (!blog) {
      return res.status(404).json({
        message: "Blog not found",
      });
    }

    res.status(200).json(blog);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
};

// Update a blog by ID
const updateBlog = async (req, res) => {
  try {
    const { title, body, tags, status } = req.body;

    const blog = await BlogPost.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        message: "Blog not found",
      });
    }

    if (title) {
      blog.title = title;

      blog.slug = slugify(title, {
        lower: true,
        strict: true,
        trim: true,
      });
    }

    if (body !== undefined) {
      blog.body = body;
    }

    if (tags !== undefined) {
      blog.tags = tags;
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

    if (req.file) {
        blog.coverImage = req.file.path;
    }

    await blog.save();

    res.status(200).json({
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
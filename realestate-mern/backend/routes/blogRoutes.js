const express = require("express");

const {
  createBlog,
  getBlogs,
  getPublishedBlogs,
  getBlogById,
  getBlogBySlug,
  updateBlog,
  deleteBlog,
} = require("../controllers/blogController");

const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// Admin — auth runs BEFORE the upload middleware so unauthenticated bytes
// never reach Cloudinary (previously upload.single ran first).
router.post(
  "/",
  protect,
  authorize("admin"),
  upload.single("coverImage"),
  createBlog
);

router.get("/",   protect,
  authorize("admin"), getBlogs);

router.patch(
  "/:id",
  protect,
  authorize("admin"),
  upload.single("coverImage"),
  updateBlog
);

router.delete("/:id",   protect,
  authorize("admin"), deleteBlog);

// Public
router.get("/published", getPublishedBlogs);

// NOTE: /slug/:slug must stay above /:id - otherwise a slug is swallowed
// by the id handler below.
router.get("/slug/:slug", getBlogBySlug);

router.get("/:id", getBlogById);

module.exports = router;
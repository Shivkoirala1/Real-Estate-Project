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

// Admin
router.post(
  "/",
  upload.single("coverImage"),
  protect,
  authorize("admin"),
  createBlog
);

router.get("/",   protect,
  authorize("admin"), getBlogs);

router.patch(
  "/:id",
  upload.single("coverImage"),
  protect,
  authorize("admin"),
  updateBlog
);

router.delete("/:id",   protect,
  authorize("admin"), deleteBlog);

// Public
router.get("/published", getPublishedBlogs);

router.get("/:id", getBlogById);

router.get("/slug/:slug", getBlogBySlug);

module.exports = router;
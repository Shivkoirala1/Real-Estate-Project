# Hero Slides Module — Implementation Plan

## Real Estate MERN Project

> **STATUS: IMPLEMENTED + MIGRATED (direct uploads, Phase 3).** The module below shipped as specified (admin carousel, image/video media, CTA, scheduling, ordering). Media upload has since moved from the multer flow described in §11 to direct browser → Cloudinary (`hero-media`/`hero-thumbnail` purposes, `uploadSessionId` + uploadIds JSON submit) behind `HERO_DIRECT_UPLOAD_ENABLED`; legacy multipart remains available. This document is now the as-built record for scope; see code (`heroSlideController.js`, `HeroSlideForm.jsx`) for current behavior.

> **Purpose:** Implement a reusable, admin-managed hero carousel that supports image/video media, configurable CTA actions, optional property promotion, scheduling, ordering, and responsive public display.

---

## 1. Module Goal

Build a **Hero Slides** module for the public homepage.

The module should allow an administrator to:

1. Create a hero slide.
2. Upload an image or video through the existing Cloudinary integration.
3. Add title, subtitle, and description.
4. Configure an optional CTA.
5. Link the CTA to a property or external URL.
6. Schedule when the slide becomes visible.
7. Configure display order and duration.
8. Save as draft or publish.
9. Edit, reorder, or delete slides.

The public homepage should:

1. Fetch only slides eligible for public display.
2. Render images and videos appropriately.
3. Automatically rotate slides.
4. Support previous/next controls.
5. Support indicators.
6. Support responsive/mobile layouts.
7. Navigate to the configured CTA destination.

---

# 2. Recommended Scope

## V1 — Implement Now

- `HeroSlide` entity
- Admin CRUD
- Image upload
- Video upload
- Video thumbnail
- Existing Cloudinary integration
- Draft/published state
- Start/end scheduling
- Display ordering
- Per-slide duration
- Property CTA
- External URL CTA
- No-CTA option
- Public hero-slide endpoint
- React carousel
- Responsive behavior
- Validation
- Authorization
- Loading/error/empty states
- Cloudinary cleanup on replacement/deletion

## Explicitly Not in V1

Do not turn this into a full advertising platform yet.

Exclude:

- impression tracking
- click analytics
- campaign management
- audience targeting
- multiple carousel placements
- A/B testing
- mobile-specific media
- advanced video analytics
- agent-created hero content
- AI-generated content

---

# 3. Architecture

```text
Frontend
  React
    ↓
heroSlideService
    ↓
REST API
    ↓
Express Routes
    ↓
Controller
    ↓
Service
    ↓
Mongoose Model
    ↓
MongoDB

Media:
Frontend
    ↓
Backend upload handling
    ↓
Cloudinary
    ↓
URL + publicId stored in HeroSlide
```

The database remains the source of truth for:

- slide content
- publication state
- scheduling
- ordering
- CTA configuration
- property relationships

---

# 4. Entity Design

## HeroSlide

Recommended document structure:

```js
{
  title: String,
  subtitle: String,
  description: String,

  media: {
    type: "image" | "video",
    url: String,
    publicId: String,
    thumbnailUrl: String,
    thumbnailPublicId: String,
    altText: String
  },

  cta: {
    enabled: Boolean,
    label: String,
    actionType: "property" | "url" | "none",
    actionValue: String
  },

  property: ObjectId | null,

  startAt: Date | null,
  endAt: Date | null,

  displayOrder: Number,
  duration: Number,

  status: "draft" | "published",

  createdBy: ObjectId,
  updatedBy: ObjectId,

  createdAt: Date,
  updatedAt: Date
}
```

---

# 5. Field Requirements

| Field | Required | Purpose |
|---|---|---|
| `title` | Yes | Main hero heading |
| `subtitle` | No | Supporting heading |
| `description` | No | Additional supporting text |
| `media.type` | Yes | Image/video renderer selection |
| `media.url` | Yes | Main Cloudinary media URL |
| `media.publicId` | Yes | Cloudinary cleanup |
| `media.thumbnailUrl` | Video: recommended | Video loading/fallback |
| `media.thumbnailPublicId` | No | Thumbnail cleanup |
| `media.altText` | Recommended | Accessibility |
| `cta.enabled` | Yes | Whether CTA is shown |
| `cta.label` | Conditional | Button text |
| `cta.actionType` | Yes | CTA destination type |
| `cta.actionValue` | Conditional | Property ID or URL |
| `property` | No | Optional promoted property |
| `startAt` | No | Publication start |
| `endAt` | No | Publication end |
| `displayOrder` | Yes | Carousel ordering |
| `duration` | Yes | Display duration |
| `status` | Yes | Draft/published |
| `createdBy` | Yes | Audit |
| `updatedBy` | Yes | Audit |

---

# 6. Publication State

Use only:

```text
draft
published
```

Derive the effective display state from scheduling.

```text
draft
    → Draft

published + startAt > now
    → Scheduled

published + current date is within schedule
    → Active

published + endAt < now
    → Expired
```

Do not combine a manual `isActive` flag with a larger status system unless a clear requirement emerges.

---

# 7. Scheduling Rules

A slide is publicly eligible when:

```text
status === "published"

AND

(startAt is null OR startAt <= now)

AND

(endAt is null OR endAt >= now)
```

If both dates exist:

```text
startAt must be before endAt
```

Filtering must happen on the backend.

Do not return drafts, future slides, or expired slides and filter them only in React.

---

# 8. CTA Rules

Supported CTA actions:

```text
property
url
none
```

### Property CTA

```text
actionType = property
actionValue = propertyId
```

The backend must verify that the property exists and is suitable for public navigation according to the existing property lifecycle.

### URL CTA

```text
actionType = url
actionValue = valid URL
```

Validate the URL before saving.

### None

No CTA destination is required.

---

# 9. Property Relationship

Keep the property relationship optional.

A HeroSlide can represent:

```text
Featured property
Service promotion
Company announcement
General marketing content
Seasonal campaign
```

Do not require every slide to reference a property.

---

# 10. Media Requirements

## Images

Recommended:

```text
Aspect ratio: 16:9
Recommended size: 1920 × 1080 or larger
```

Frontend media should preserve the layout using:

```css
object-fit: cover;
```

## Videos

Recommended support:

```text
MP4
WebM
16:9
```

Expected public behavior:

```text
autoplay
muted
loop
playsInline
```

Support a thumbnail for loading and fallback behavior.

---

# 11. Cloudinary Organization

Reuse the existing Cloudinary integration.

Recommended folder:

```text
shram-sewa/
    hero-slides/
```

Optional organization:

```text
shram-sewa/
    hero-slides/
        images/
        videos/
        thumbnails/
```

Store the Cloudinary `publicId` values in MongoDB for reliable replacement and deletion.

---

# 12. Media Replacement Lifecycle

When replacing existing media:

```text
Existing media
      ↓
Upload new media
      ↓
Upload succeeds?
      ↓
Update database
      ↓
Delete old Cloudinary asset
```

Never delete old media before confirming the new upload and database update succeed.

---

# 13. Delete Lifecycle

```text
Admin deletes HeroSlide
        ↓
Retrieve associated publicIds
        ↓
Delete Cloudinary assets
        ↓
Delete MongoDB document
```

Use an error-handling strategy consistent with the existing media service.

Avoid silently leaving orphaned media without logging or handling the failure.

---

# 14. Backend API

## Public

```http
GET /api/hero-slides
```

Returns only currently eligible slides.

Sort:

```text
displayOrder ASC
```

## Admin

```http
GET    /api/hero-slides/admin
GET    /api/hero-slides/:id
POST   /api/hero-slides
PUT    /api/hero-slides/:id
DELETE /api/hero-slides/:id
PATCH  /api/hero-slides/reorder
```

Optional, only if useful for the existing API style:

```http
PATCH /api/hero-slides/:id/publish
PATCH /api/hero-slides/:id/unpublish
```

Otherwise update `status` through the normal update endpoint.

---

# 15. Recommended Backend Structure

Adapt to the existing project structure rather than creating parallel architecture.

```text
server/
├── models/
│   └── HeroSlide.js
├── controllers/
│   └── heroSlideController.js
├── services/
│   └── heroSlideService.js
├── routes/
│   └── heroSlideRoutes.js
└── validators/
    └── heroSlideValidator.js
```

---

# 16. Backend Responsibilities

## Controller

- Parse requests
- Use middleware
- Call services
- Return HTTP responses

## Service

- Apply business rules
- Validate relationships
- Filter public slides
- Coordinate media lifecycle
- Manage ordering
- Perform database operations

## Model

- Schema
- Enums
- Defaults
- References
- Timestamps
- Basic constraints
- Appropriate indexes

---

# 17. Public Query Logic

Conceptually:

```js
HeroSlide.find({
  status: "published",
  $and: [
    {
      $or: [
        { startAt: null },
        { startAt: { $lte: now } }
      ]
    },
    {
      $or: [
        { endAt: null },
        { endAt: { $gte: now } }
      ]
    }
  ]
}).sort({ displayOrder: 1 });
```

Adapt this to existing project conventions rather than copying it blindly.

---

# 18. Indexing

Consider indexes supporting the primary public query:

```text
status
startAt
endAt
displayOrder
```

Do not over-index without evidence of a real need.

---

# 19. Admin User Flow

```text
Admin
  ↓
Admin Dashboard
  ↓
Content Management
  ↓
Hero Slides
  ↓
[Add Hero Slide]
  ↓
Choose Media Type
  ├── Image
  └── Video
  ↓
Upload Media
  ↓
Add Content
  ↓
Configure CTA
  ↓
Configure Schedule
  ↓
Configure Order + Duration
  ↓
Save Draft / Publish
  ↓
Preview on Public Homepage
```

---

# 20. Hero Slides Management Page

Suggested information:

```text
Hero Slides

[ + Add Hero Slide ]

----------------------------------------------------------
Preview | Title | Media | Effective State | Order | Actions
----------------------------------------------------------
Image   | Villa | Image | Active          | 1     | Edit/Delete
Image   | Apt   | Image | Scheduled       | 2     | Edit/Delete
Video   | Offer | Video | Draft           | 3     | Edit/Delete
----------------------------------------------------------
```

Useful actions:

- Preview
- Edit
- Delete
- Publish/Unpublish if implemented
- Reorder

---

# 21. Create/Edit Form

## A. Content

```text
Title *
Subtitle
Description
```

## B. Media

```text
Media Type
○ Image
○ Video
```

Image:

```text
Upload Image
Alt Text
Preview
```

Video:

```text
Upload Video
Upload Thumbnail
Preview
```

## C. CTA

```text
Enable CTA

Button Label

Action:
○ Property
○ External URL
○ None
```

Property action:

```text
Select Property
```

URL action:

```text
Enter URL
```

## D. Schedule

```text
Start Date/Time
End Date/Time
```

## E. Display

```text
Display Order
Duration in Seconds
```

Recommended initial limits:

```text
Default: 5 seconds
Minimum: 3 seconds
Maximum: 60 seconds
```

## F. Publication

```text
Draft
Published
```

Actions:

```text
[ Preview ] [ Save Draft ] [ Publish ]
```

---

# 22. Validation Rules

Frontend validation provides immediate feedback.

Backend validation is authoritative.

Required cases:

- media is missing
- image selected without image media
- video selected without video media
- invalid media type
- property CTA without a property
- URL CTA without a valid URL
- CTA enabled without required label/action data
- invalid start/end dates
- invalid duration
- invalid display order
- referenced property does not exist

---

# 23. Frontend Service

Create or follow the existing service location:

```text
src/services/heroSlideService.js
```

Suggested functions:

```js
getHeroSlides();
getAdminHeroSlides();
getHeroSlide(id);
createHeroSlide(data);
updateHeroSlide(id, data);
deleteHeroSlide(id);
reorderHeroSlides(data);
```

Reuse the existing axios instance.

Do not create a separate HTTP client for this module.

---

# 24. Public React Components

```text
src/components/hero/
├── HeroCarousel.jsx
├── HeroSlide.jsx
├── HeroMedia.jsx
├── HeroControls.jsx
└── HeroIndicators.jsx
```

If the relevant project area uses TypeScript, use `.tsx`.

---

# 25. Component Responsibilities

## HeroCarousel

Owns:

- active slide state
- automatic rotation
- previous/next behavior
- pause behavior
- duration handling

## HeroSlide

Owns:

- text layout
- CTA rendering
- slide content presentation

## HeroMedia

Chooses:

```text
image → <img>
video → <video>
```

## HeroControls

Provides:

```text
Previous
Next
```

## HeroIndicators

Provides:

```text
● ○ ○ ○
```

---

# 26. Public User Flow

```text
Visitor opens Homepage
        ↓
Fetch GET /api/hero-slides
        ↓
Slides available?
   ┌────┴────┐
   │         │
  Yes        No
   │         │
   ↓         ↓
Render       Show existing/default hero
Carousel
   ↓
Render active slide
   ├── Image
   └── Video
   ↓
User may:
   ├── Wait for auto-advance
   ├── Click previous
   ├── Click next
   ├── Select indicator
   └── Click CTA
```

CTA:

```text
Property → Navigate to property detail page
URL      → Navigate according to URL handling rules
None     → No CTA shown
```

---

# 27. Carousel Behavior

Required:

- automatic rotation
- previous/next controls
- indicators
- per-slide duration
- responsive design
- keyboard-accessible controls
- pause on desktop hover
- sensible focus behavior
- image loading/fallback behavior
- video loading/fallback behavior

Avoid excessive transitions that make text difficult to read.

---

# 28. Video Behavior

Initial approach:

```text
Use configured slide duration.
```

Do not initially require:

```text
advance exactly when video ends
```

Future extension could support:

```text
advanceMode:
  duration
  video-end
```

For V1, consistent duration handling is simpler and more reliable.

---

# 29. Loading, Empty, and Error States

## Loading

```text
Show hero placeholder/skeleton
```

## Empty

If no eligible slides exist:

```text
Do not render an empty carousel.
Show existing/default hero content.
```

## API Error

If fetching fails:

```text
Do not break the homepage.
Show the existing/default hero fallback.
```

Hero content should not prevent the rest of the homepage from functioning.

---

# 30. Mobile Requirements

Test explicitly:

```text
Mobile
Tablet
Desktop
Large desktop
```

Verify:

- text readability
- CTA size
- image cropping
- video sizing
- indicators
- controls
- overflow
- touch interaction

Do not add separate mobile media in V1 unless the design requires it.

---

# 31. Accessibility

Implement:

- meaningful alt text
- accessible control labels
- keyboard navigation
- visible focus states
- semantic headings
- adequate contrast
- no color-only information
- non-hover-only controls

The carousel must remain usable without a mouse.

---

# 32. Authorization

Initial permissions:

```text
Admin
  Create
  Edit
  Delete
  Publish
  Reorder

Agent
  Public viewing only

Customer
  Public viewing only
```

Do not allow agents to manage homepage content in V1.

---

# 33. Public Response Shape

Keep the public response lightweight.

Conceptually:

```js
[
  {
    id: "...",
    title: "Find Your Dream Home",
    subtitle: "Premium properties across Nepal",
    description: "...",

    media: {
      type: "image",
      url: "...",
      thumbnailUrl: null,
      altText: "Modern home"
    },

    cta: {
      enabled: true,
      label: "View Property",
      actionType: "property",
      actionValue: "..."
    },

    duration: 5,
    displayOrder: 1
  }
]
```

Do not expose admin audit data or unnecessary Cloudinary identifiers through the public endpoint.

---

# 34. Ordering Strategy

Use:

```text
displayOrder: Number
```

When creating a slide without an explicit order:

```text
current maximum + 1
```

For reordering:

```text
Frontend sends final order
        ↓
Backend validates IDs
        ↓
Backend normalizes positions
        ↓
Slides receive sequential displayOrder values
```

Example request:

```js
[
  { id: "slideA", displayOrder: 1 },
  { id: "slideC", displayOrder: 2 },
  { id: "slideB", displayOrder: 3 }
]
```

---

# 35. Recommended Implementation Phases

## Phase 1 — Audit Existing Architecture

Before coding, inspect:

- Property model and public lifecycle
- User/Admin authorization
- Cloudinary integration
- Upload middleware
- Controller/service conventions
- Validation approach
- API response conventions
- Axios/service conventions
- Existing homepage hero
- Admin navigation/components
- Existing date/time handling

**Reuse existing infrastructure. Do not create parallel implementations.**

---

## Phase 2 — Backend Model

Implement:

```text
HeroSlide model
```

Add:

- schema
- enums
- defaults
- timestamps
- references
- validation
- justified indexes

Test basic creation and validation.

---

## Phase 3 — Media Integration

Reuse the current Cloudinary flow.

Verify:

- image upload
- video upload
- thumbnail upload
- URL storage
- publicId storage
- replacement
- deletion

---

## Phase 4 — Service Layer

Implement:

```text
createHeroSlide
getHeroSlides
getAdminHeroSlides
getHeroSlide
updateHeroSlide
deleteHeroSlide
reorderHeroSlides
```

Centralize business rules in this layer.

---

## Phase 5 — Controllers and Routes

Implement:

```text
Public route
Admin listing route
Admin CRUD
Reorder route
```

Apply existing authentication and role middleware.

Test API behavior before building the UI.

---

## Phase 6 — Backend Testing

### Creation

- valid image
- valid video
- missing media
- invalid CTA
- invalid property
- invalid URL
- invalid dates
- invalid duration

### Public Listing

- draft excluded
- future slide excluded
- expired slide excluded
- active slide included
- correct ordering

### Authorization

- customer denied
- agent denied
- admin allowed

### Media Lifecycle

- replacement
- deletion
- upload failure

---

## Phase 7 — Admin Frontend

Build:

```text
Hero Slides List
Create Hero Slide
Edit Hero Slide
Delete Confirmation
Preview
Reordering
```

Reuse existing:

- forms
- modals
- upload components
- toasts
- error handling
- table/list UI

---

## Phase 8 — Public Carousel

Build:

```text
HeroCarousel
HeroSlide
HeroMedia
HeroControls
HeroIndicators
```

Connect:

```text
heroSlideService.getHeroSlides()
```

Test:

- multiple slides
- one slide
- image slide
- video slide
- CTA
- no CTA
- no slides
- API error
- mobile
- desktop

---

## Phase 9 — Homepage Integration

Integrate the dynamic carousel into the existing homepage.

Do not rewrite unrelated homepage sections.

Verify:

- navigation
- property links
- responsive behavior
- page loading
- homepage performance
- existing functionality

---

## Phase 10 — Final QA

### Admin

- create
- edit
- delete
- draft
- publish
- schedule
- expiration
- reorder
- image upload
- video upload
- thumbnail upload

### Public

- correct slides appear
- correct order
- auto rotation
- controls
- indicators
- property CTA
- external URL CTA
- video playback
- mobile layout

### Failure Cases

- Cloudinary failure
- invalid media
- deleted referenced property
- expired slide
- no active slides
- API failure
- malformed CTA

---

# 36. Development Milestones

## Milestone 1 — Data and API

```text
[ ] Audit existing architecture
[ ] HeroSlide model
[ ] Validation
[ ] Cloudinary integration
[ ] Service layer
[ ] Controller
[ ] Routes
[ ] Authorization
[ ] Public endpoint
[ ] Admin endpoints
```

## Milestone 2 — Admin Management

```text
[ ] Hero slide list
[ ] Create form
[ ] Edit form
[ ] Media upload
[ ] Preview
[ ] Delete
[ ] Draft/publish
[ ] Scheduling
[ ] Ordering
```

## Milestone 3 — Public Experience

```text
[ ] HeroCarousel
[ ] Image support
[ ] Video support
[ ] CTA support
[ ] Auto rotation
[ ] Controls
[ ] Indicators
[ ] Responsive design
[ ] Loading state
[ ] Error fallback
[ ] Empty-state fallback
```

## Milestone 4 — QA and Cleanup

```text
[ ] API tests
[ ] Validation tests
[ ] Authorization tests
[ ] Responsive tests
[ ] Media lifecycle verification
[ ] Cloudinary cleanup verification
[ ] Homepage integration verification
[ ] Code cleanup
```

---

# 37. Definition of Done

The module is complete when:

- [ ] Admin can create a hero slide.
- [ ] Admin can upload images.
- [ ] Admin can upload videos.
- [ ] Video thumbnails are supported.
- [ ] Admin can edit slides.
- [ ] Admin can delete slides.
- [ ] Admin can save drafts.
- [ ] Admin can publish slides.
- [ ] Scheduling works correctly.
- [ ] Display ordering works.
- [ ] CTA supports property navigation.
- [ ] CTA supports external URLs.
- [ ] CTA can be disabled.
- [ ] Public API returns only eligible slides.
- [ ] Homepage renders the carousel.
- [ ] Image slides render correctly.
- [ ] Video slides use muted inline autoplay behavior.
- [ ] Automatic rotation works.
- [ ] Manual navigation works.
- [ ] Indicators work.
- [ ] Responsive behavior works.
- [ ] API failure does not break the homepage.
- [ ] Empty results do not produce broken UI.
- [ ] Only admins can manage slides.
- [ ] Media cleanup is handled appropriately.
- [ ] Existing homepage and property functionality remain intact.

---

# 38. Future Extension Points

The module can later evolve into:

```text
HeroSlide
    ├── impressions
    ├── clicks
    ├── CTR
    ├── campaigns
    ├── audience targeting
    ├── mobile-specific media
    ├── A/B testing
    ├── additional CTA types
    └── multiple display placements
```

Do not implement these until there is a concrete requirement.

---

# 39. Final Recommended Decisions

| Decision | Recommendation |
|---|---|
| Entity name | `HeroSlide` |
| Media | Image + Video |
| Storage | Existing Cloudinary integration |
| Media metadata | Type, URL, publicId, thumbnail, alt text |
| CTA | Configurable |
| CTA types | Property / URL / None |
| Property reference | Optional |
| Publication | Draft / Published |
| Effective state | Derived from schedule |
| Scheduling | `startAt` + `endAt` |
| Ordering | `displayOrder` |
| Duration | Per slide, default 5 seconds |
| Management | Admin only |
| Public filtering | Backend |
| Video | Muted, autoplay, loop, playsInline |
| Analytics | Future |
| Campaign system | Future |
| Multiple placements | Future |
| Mobile-specific media | Future |

---

# 40. Core Implementation Principle

Implement this as a **content-management module**, not as a hard-coded homepage feature.

```text
HeroSlide
    ↓
Content and business data

HeroCarousel
    ↓
Presentation and interaction

Homepage
    ↓
Consumes HeroCarousel
```

This keeps the content model, carousel behavior, and homepage composition separate.

Before implementation, audit the current codebase and reuse existing authentication, Cloudinary, upload middleware, axios services, property navigation, admin UI, validation, notification, and error-handling patterns.

Avoid unrelated refactoring while implementing this module.

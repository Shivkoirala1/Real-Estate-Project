# Ashland Estates — Real Estate Management System (MERN Stack)

A full-stack MVP real estate platform built with MongoDB, Express, React, and Node.js, based on the
provided project specification. It supports visitors browsing/searching properties, registered users
saving favorites, staff/agents managing their own listings, and an administrator with full system control.

## Project Structure

```
realestate-mern/
├── backend/            Express + MongoDB REST API
│   ├── config/         Database connection
│   ├── controllers/    Route logic (auth, properties, users, categories, inquiries, dashboard)
│   ├── middleware/     JWT auth, role authorization, error handling, file uploads
│   ├── models/         Mongoose schemas (User, Property, PropertyType, District, City, Inquiry)
│   ├── routes/         Express route definitions
│   ├── utils/          Token generation, async handler, DB seeder
│   ├── uploads/         Uploaded property images are stored here
│   └── server.js       App entry point
└── frontend/           React (Vite) + Tailwind CSS client
    └── src/
        ├── api/         Axios instance with JWT interceptor
        ├── context/      Auth + Toast notification providers
        ├── components/   Navbar, Footer, PropertyCard, SearchFilterBar, dashboard widgets, etc.
        └── pages/        Public pages + role-based dashboard pages
```

## Features Implemented

- **Everyone can browse**: search/filter properties, view details, submit contact & property inquiries — no account required
- **Registration & Identity Verification**: anyone can register, but must submit a **live camera selfie** (captured via `getUserMedia`, not a file upload) plus a **citizenship/ID photo**. New accounts start in `pending` status.
- **Admin Verification Queue**: admins review each registration side-by-side (selfie vs. ID photo) and approve or reject, with an optional note shown to the user.
- **Open Posting**: once verified, *any* registered user can post, edit, delete, and update the status (Available/Reserved/Sold) of their own property listings — like a Facebook-style feed, everyone sees every listing on the public `/properties` page.
- **Favorites**: any registered user can save/view favorite properties.
- **Administrator**: full dashboard (totals, recent listings, pending-verification alert), manage all properties, manage users (activate/deactivate, reset password, remove, promote to admin), manage categories (property types, districts, cities), view all inquiries.
- **Auth**: JWT-based authentication, bcrypt password hashing, verification-gated route protection.
- **Search & Filter**: keyword, property type, district, price range, bedrooms, sort by price/date.
- **Responsive UI** built with Tailwind CSS.

### Roles & Permissions

| Role | Can browse | Can post/edit/delete own listings | Full admin control |
|---|---|---|---|
| Guest (not logged in) | ✅ | ❌ | ❌ |
| Registered, unverified | ✅ | ❌ (blocked until admin approval) | ❌ |
| Registered, verified | ✅ | ✅ | ❌ |
| Admin | ✅ | ✅ (any listing) | ✅ |

## Prerequisites

- Node.js 18+
- MongoDB running locally (or a MongoDB Atlas connection string)

## Setup — Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit .env with your MongoDB URI and a strong JWT_SECRET
npm run seed               # creates admin + sample verified user, starter categories, and 10 sample listings
npm run dev                 # starts the API on http://localhost:5000
```

Seeded accounts (change the passwords after first login):
- Admin: `admin@realestate.com` / `Admin@123`
- Verified sample user (can post immediately): `user@realestate.com` / `User@123`

New self-registrations will need to go through Admin → **Verify Registrations** before they can post.

## Setup — Frontend

```bash
cd frontend
npm install
npm run dev                 # starts the client on http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` requests to `http://localhost:5000`, so no extra
configuration is needed in development. For production, update the proxy target or serve both behind
the same domain / reverse proxy.

## Building for Production

```bash
cd frontend
npm run build                # outputs static files to frontend/dist
```

Serve the `dist` folder with any static host (Nginx, Vercel, Netlify, etc.), and deploy the `backend`
folder to a Node host (Render, Railway, EC2, etc.) with your production `.env` values.

## Recent Fixes & New Features

**New features added:**
- **Interactive map** (Leaflet + OpenStreetMap, no API key needed): posters click to pin the exact property location; buyers see that pin on the property detail page.
- **Photo carousel**: property photos now display in a proper sliding gallery with prev/next arrows, a counter, and keyboard arrow-key navigation, on the detail page.
- **Incremental photo attachment**: the "Add Property" form now lets you click "+ Add photos" multiple times to build up a list (with individual remove buttons), instead of the native file picker replacing your whole selection every time you open it.
- **Prominent contact info**: the property detail page now shows the poster's phone number as a tappable `tel:` link and email, clearly separated from the inquiry form.
- Editing a property now lets you remove individual existing photos, not just add new ones.

**Bugs fixed:**
- **Property detail showing "not found" incorrectly** — the page previously showed a generic "not found" message for *any* failure (network errors, server errors), not just genuinely missing properties, which masked real problems. Errors are now distinguished and shown clearly.
- **Property creation could silently crash** — leaving the district/city dropdowns unselected when posting a property caused a database error (an empty string isn't a valid reference ID) that aborted the whole save. This is now handled gracefully — those fields are simply omitted if left blank.
- **Search filters silently failing** — if a backend request failed for any reason, the property listing and homepage silently showed "no results" instead of an error, making broken filters indistinguishable from "no matches." Both pages now surface real errors.
- **Keyword search reliability** — switched from MongoDB's `$text` search (needs a pre-built index, only matches whole stemmed words) to a case-insensitive partial match, so partial titles/keywords reliably return results.
- **City filter was missing entirely** — the search bar only had a District dropdown even though the data model supports filtering by city; added a cascading City dropdown plus the price range and bathroom filters (the fields already existed in code but weren't wired to any input).
- **Admin sidebar bug**: clicking "Add Property" highlighted *both* "Add Property" and "All Properties" in orange, because "All Properties" was matching as a URL prefix. Fixed with exact route matching.
- **Duplicate photo in gallery**: when a cover image wasn't explicitly chosen (falling back to the first uploaded photo), that same photo could appear twice in the gallery. Fixed with de-duplication.
- **Missing cover image bug**: a property could be saved with no cover image at all, making it appear blank in listings. A cover image is now required when posting.

## Notes & Next Steps

- **Camera access requires a secure context.** Browsers only allow `getUserMedia` (the live selfie capture)
  on `localhost` or over HTTPS. This works out of the box in local development; when you deploy, make sure
  the frontend is served over HTTPS or the registration camera step will fail.
- Property and identity images are currently stored on local disk under `backend/uploads`. For production,
  swap the multer disk storage in `backend/middleware/upload.js` for a cloud storage driver (S3, Cloudinary,
  etc.) as noted in the spec's "Cloud Storage Support" requirement.
- Email/SMS notifications, property approval workflow, payment gateway, and the other "Future Enhancements"
  listed in the spec are intentionally out of scope for this MVP and are not implemented.
- Update `JWT_SECRET` and seeded account passwords before deploying to production.

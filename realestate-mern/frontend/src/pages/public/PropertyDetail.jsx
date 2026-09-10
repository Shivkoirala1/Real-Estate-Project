import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getPropertyById,
  toggleFavorite,
} from "../../services/propertyService";
import { createContactForm } from "../../services/contactFormService";
import { createVisit } from "../../services/visitService";
import ImageGallery from "../../components/ImageGallery";
import MapView from "../../components/MapView";
import PropertyCard from "../../components/PropertyCard";
import StatusBadge from "../../components/StatusBadge";
import { formatPrice } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import {nepaliInputToUTC} from "../../utils/timeConverter";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

// Returns an array of [label, value] pairs for the property specifications table
const specRows = (property) => {
  const d = property.details || {};
  return [
    ["Land Area", d.landArea ? `${d.landArea} ${d.landAreaUnit || ""}` : "—"],
    ["Built-up Area", d.builtUpArea ? `${d.builtUpArea} sq. ft.` : "—"],
    ["Bedrooms", d.bedrooms || "—"],
    ["Bathrooms", d.bathrooms || "—"],
    ["Floors", d.floors || "—"],
    ["Parking Spaces", d.parkingSpaces || "—"],
    ["Facing Direction", d.facingDirection || "—"],
    ["Road Access", d.roadAccess || "—"],
    [
      "Mukh (Road Frontage)",
      d.roadFrontage ? `${d.roadFrontage} ${d.roadFrontageUnit || "ft"}` : "—",
    ],
    ["Furnished Status", d.furnishedStatus || "—"],
    ["Construction Year", d.constructionYear || "—"],
    ["Water Supply", d.waterSupply ? "Yes" : "No"],
    ["Electricity", d.electricity ? "Yes" : "No"],
    ["Internet", d.internetAvailability ? "Yes" : "No"],
  ];
};

// Returns the minimum value usable in a datetime-local input (now, rounded to the minute)
const minDateTimeLocal = () => {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

// Main component for displaying property details
const PropertyDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [property, setProperty] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    message: "",
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  // Toggle between the inquiry form and the schedule-a-visit form
  const [contactMode, setContactMode] = useState("inquiry"); // 'inquiry' | 'visit'
  const [visitForm, setVisitForm] = useState({
    requestedSlot: "",
    buyerNotes: "",
  });
  const [visitErrors, setVisitErrors] = useState({});
  const [schedulingVisit, setSchedulingVisit] = useState(false);
  const [visitRequested, setVisitRequested] = useState(false);

  // Pre-fill form fields with user info if available

  // Reviews
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: f.name || user.name || "",
        email: f.email || user.email || "",
        phone: f.phone || user.phone || "",
      }));
    }
  }, [user]);

  // Load property details and similar properties when the component mounts or the ID changes
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError("");
      try {
        const data = await getPropertyById(id);
        setProperty(data.property);
        setSimilar(data.similarProperties);
      } catch (err) {
        setProperty(null);
        // Distinguish "this property genuinely doesn't exist" (404) from a
        // real server/network error - showing "not found" for every kind of
        // failure was hiding real bugs behind a generic message.
        if (err.response?.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(
            err.response?.data?.message ||
              "Something went wrong loading this property. Please try again.",
          );
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const data = await getPropertyReviews(id);
        setReviews(data.reviews);
        setAvgRating(data.avgRating);
      } catch (err) {
        // Non-critical - the rest of the page still works without reviews
      }
    };
    loadReviews();
  }, [id]);

  const handleFavorite = async () => {
    if (!user) return showToast("Please sign in to save properties", "error");
    try {
      await toggleFavorite(property._id);
      showToast("Saved to your favorites");
    } catch (err) {
      showToast("Something went wrong", "error");
    }
  };

  // Validate the inquiry form fields before submission
  const validateInquiry = () => {
    const next = {};
    if (!form.name.trim()) next.name = "Please enter your name";
    if (!form.email.trim()) next.email = "Please enter your email address";
    else if (!EMAIL_REGEX.test(form.email.trim()))
      next.email = "Please enter a valid email address";
    if (!form.phone.trim()) next.phone = "Please enter your phone number";
    else if (!PHONE_REGEX.test(form.phone.trim()))
      next.phone = "Phone number must be exactly 10 digits";
    if (!form.message.trim()) next.message = "Please enter a message";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Handle changes to form fields and clear any existing errors for that field
  const handleFormChange = (field, value) => {
    setForm({ ...form, [field]: value });
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  // Handle the submission of the inquiry form
  const handleInquiry = async (e) => {
    e.preventDefault();
    if (!validateInquiry()) return;

    // Confirm with the user before sending the inquiry
    const confirmed = await confirm({
      title: "Send this inquiry?",
      message: `Do you want to send this message to the agent about "${property.title}"?`,
      confirmLabel: "Yes, send it",
      cancelLabel: "No, go back",
    });
    if (!confirmed) return;

    setSending(true);
    try {
      const data = await createContactForm({
        ...form,
        subject: `Inquiry about ${property.title}`,
        property: property._id,
      });
      showToast("Your inquiry has been sent to the agent");
      setForm({ name: "", email: "", phone: "", message: "" });
      setErrors({});
      // Keep the created inquiry's id around so a follow-up visit request gets linked to it
      if (data?.inquiry?._id) {
        setVisitForm((v) => ({ ...v, inquiryId: data.inquiry._id }));
      }
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to send inquiry",
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  // Validate the schedule-a-visit form fields before submission
  const validateVisit = () => {
    const next = {};
    if (!visitForm.requestedSlot) {
      next.requestedSlot = "Please choose a date and time";
    } else {
      const slotDate = new Date(visitForm.requestedSlot);
      if (isNaN(slotDate.getTime()) || slotDate < new Date()) {
        next.requestedSlot = "Please choose a future date and time";
      }
    }
    setVisitErrors(next);
    return Object.keys(next).length === 0;
  };

  // Handle changes to visit form fields and clear any existing errors for that field
  const handleVisitFormChange = (field, value) => {
    setVisitForm({ ...visitForm, [field]: value });
    if (visitErrors[field])
      setVisitErrors({ ...visitErrors, [field]: undefined });
  };

  // Handle the submission of the schedule-a-visit form
  const handleScheduleVisit = async (e) => {
    e.preventDefault();
    if (!user) return showToast("Please sign in to schedule a visit", "error");
    if (!validateVisit()) return;

    const confirmed = await confirm({
      title: "Schedule this visit?",
      message: `Request a site visit for "${property.title}" on ${new Date(visitForm.requestedSlot).toLocaleString()}?`,
      confirmLabel: "Yes, request it",
      cancelLabel: "No, go back",
    });
    if (!confirmed) return;

    setSchedulingVisit(true);
    try {
      await createVisit({
        property: property._id,
        visitType: "property",
        requestedSlot: nepaliInputToUTC(visitForm.requestedSlot),
        buyerNotes: visitForm.buyerNotes,
        inquiryId: visitForm.inquiryId,
      });
      showToast("Your visit request has been sent to the agent");
      setVisitForm({ requestedSlot: "", buyerNotes: "" });
      setVisitErrors({});
      setVisitRequested(true);
    } catch (err) {
      showToast(
        err.response?.data?.message || "Failed to schedule visit",
        "error",
      );
    } finally {
      setSchedulingVisit(false);
    }
  };

  // Handle sharing the property link by copying it to the clipboard
  const handleShare = async () => {
    navigator.clipboard.writeText(window.location.href);
    showToast("Link copied to clipboard");
    if (user) {
      try {
        await api.post(`/properties/${property._id}/share`);
      } catch (err) {
        // Non-critical - the link was still copied either way
      }
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!user) return showToast("Please sign in to write a review", "error");
    setReviewError("");
    setReviewSending(true);
    try {
      const { data } = await api.post("/reviews", {
        propertyId: property._id,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      });
      setReviews((prev) => [data.review, ...prev]);
      setAvgRating((prevAvg) => {
        const total = prevAvg * reviews.length + reviewForm.rating;
        return Math.round((total / (reviews.length + 1)) * 10) / 10;
      });
      setReviewForm({ rating: 5, comment: "" });
      showToast("Review posted! You earned 100 YC 🎉");
    } catch (err) {
      setReviewError(err.response?.data?.message || "Failed to post review");
    } finally {
      setReviewSending(false);
    }
  };

  if (loading)
    return (
      <p className="text-center py-24 text-slate-muted">Loading property...</p>
    );

  if (notFound)
    return (
      <div className="text-center py-24">
        <p className="font-display text-2xl mb-3">Property not found</p>
        <p className="text-slate-muted text-sm mb-4">
          This listing may have been removed or the link is incorrect.
        </p>
        <Link to="/properties" className="text-brass hover:underline">
          Back to listings
        </Link>
      </div>
    );

  if (loadError)
    return (
      <div className="text-center py-24">
        <p className="font-display text-2xl mb-3 text-brick">
          Couldn't load this property
        </p>
        <p className="text-slate-muted text-sm mb-4">{loadError}</p>
        <Link to="/properties" className="text-brass hover:underline">
          Back to listings
        </Link>
      </div>
    );

  if (!property) return null;

  const lat = property.location?.mapLocation?.lat;
  const lng = property.location?.mapLocation?.lng;
  const isOwnListing = user && property.listedBy?._id === user._id;
  const isSold = property.status === "sold";

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="flex items-center gap-2 text-sm text-slate-muted mb-6">
        <Link to="/" className="hover:text-brass">
          Home
        </Link>{" "}
        /
        <Link to="/properties" className="hover:text-brass">
          Properties
        </Link>{" "}
        /<span className="text-navy">{property.title}</span>
      </div>

      {/* Read-only status banners — only rendered once the property is loaded */}
      {property.status === "reserved" && (
        <div className="bg-brass/10 border border-brass/30 text-brass-dark px-5 py-3 rounded-sm mb-6 text-sm font-medium">
          Reserved — a sale for this property has been submitted and is awaiting
          verification.
        </div>
      )}
      {property.status === "sold" && (
        <div className="bg-brick-light border border-brick/30 text-brick px-5 py-3 rounded-sm mb-6 text-sm font-medium">
          Sold — this property is no longer available.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <ImageGallery
            coverImage={property.media?.coverImage}
            images={property.media?.images}
          />

          <div className="flex items-start justify-between mt-8 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge type="status" value={property.status} />
                <StatusBadge type="saleType" value={property.saleType} />
              </div>
              <h1 className="text-3xl mt-3">{property.title}</h1>
              <p className="text-slate-muted mt-1">
                {property.location?.streetAddress
                  ? `${property.location.streetAddress}, `
                  : ""}
                {property.location?.municipality
                  ? `${property.location.municipality}, `
                  : ""}
                {property.location?.city?.name || ""}
                {property.location?.district?.name
                  ? `, ${property.location.district.name}`
                  : ""}
              </p>
            </div>
            <div className="mx-2 grid sm:flex gap-2 flex-shrink-0">
              {property.media?.video && (
                <a
                  href={property.media.video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-sm"
                >
                  Watch video tour ↗
                </a>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleFavorite}
                  className="btn-secondary text-sm px-3 py-2"
                >
                  ♥ Save
                </button>

                <button
                  onClick={handleShare}
                  className="btn-secondary text-sm px-3 py-2"
                >
                  Share
                </button>
              </div>
            </div>
          </div>

          <p className="text-2xl font-display text-brass mb-8">
            {formatPrice(property.price, property.currency)}
            {property.negotiable && (
              <span className="text-sm text-slate-muted font-body ml-2">
                (Negotiable)
              </span>
            )}
          </p>

          {property.estimatedCommissionAmount != null && (
            <div className="inline-block bg-brass/10 text-brass-dark text-sm font-medium px-3 py-1.5 rounded-sm -mt-6 mb-8">
              Agent view — est. commission: NPR{" "}
              {property.estimatedCommissionAmount.toLocaleString()} (
              {property.effectiveCommissionPercentage}%)
            </div>
          )}

          <h2 className="text-xl mb-3">Description</h2>
          <p className="text-slate-ink leading-relaxed mb-10 whitespace-pre-line">
            {property.description}
          </p>

          <h2 className="text-xl mb-4">Property Specifications</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 mb-10 border border-navy/10 rounded-sm p-6">
            {specRows(property).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
                  {label}
                </p>
                <p className="text-sm font-medium text-navy">{value}</p>
              </div>
            ))}
          </div>

          {property.media?.video && (
            <>
              <h2 className="text-xl mb-4">Video Tour</h2>
              <div className="mb-10">
                <a
                  href={property.media.video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-flex text-sm"
                >
                  Watch video tour ↗
                </a>
              </div>
            </>
          )}

          <h2 className="text-xl mb-4">Location</h2>
          <div className="mb-10">
            <p className="text-sm text-slate-ink mb-3">
              {[
                property.location?.streetAddress,
                property.location?.municipality,
                property.location?.wardNumber
                  ? `Ward ${property.location.wardNumber}`
                  : null,
                property.location?.city?.name,
                property.location?.district?.name,
                property.location?.province,
              ]
                .filter(Boolean)
                .join(", ") || "Location details not provided"}
            </p>
            {lat !== undefined && lat !== null && lat !== "" ? (
              <MapView lat={lat} lng={lng} title={property.title} />
            ) : (
              <div className="h-32 rounded-sm border border-dashed border-navy/20 bg-parchment/50 flex items-center justify-center text-sm text-slate-muted">
                The poster hasn't pinned an exact location on the map for this
                listing yet.
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: contact + agent */}
        <div className="bg-white border border-navy/10 rounded-sm p-6 shadow-card sticky top-24">
          <p className="eyebrow mb-3">Listed by</p>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-full bg-brass text-navy flex items-center justify-center font-display text-xl overflow-hidden flex-shrink-0">
              {property.listedBy?.selfiePhoto ? (
                <img
                  src={property.listedBy.selfiePhoto}
                  alt={property.listedBy.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                property.listedBy?.name?.charAt(0).toUpperCase() || "A"
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-display text-lg text-navy leading-tight">
                  {property.listedBy?.name || "Youth Real Estate"}
                </p>
                {property.listedBy?.verificationStatus === "verified" && (
                  <span title="Identity verified" className="text-sage text-sm">
                    ✓
                  </span>
                )}
              </div>
              {property.listedBy?.createdAt && (
                <p className="text-xs text-slate-muted">
                  Member since{" "}
                  {new Date(property.listedBy.createdAt).toLocaleDateString(
                    "en-US",
                    { month: "short", year: "numeric" },
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="bg-parchment rounded-sm px-4 py-3 mb-6">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
              Contact Number
            </p>
            {property.listedBy?.phone ? (
              <a
                href={`tel:${property.listedBy.phone}`}
                className="font-semibold text-navy hover:text-brass transition-colors"
              >
                {property.listedBy.phone}
              </a>
            ) : (
              <p className="text-sm text-slate-muted">
                Not provided — use the form below
              </p>
            )}
            {property.listedBy?.email && (
              <p className="text-sm text-slate-muted mt-1">
                {property.listedBy.email}
              </p>
            )}
          </div>

          {isOwnListing ? (
            <div className="bg-parchment/60 border border-dashed border-navy/20 rounded-sm px-4 py-4 text-sm text-slate-muted">
              This is your own listing, so there's nothing to inquire about
              here. Manage it from{" "}
              <Link
                to="/my-properties"
                className="text-brass hover:underline font-medium"
              >
                My Properties
              </Link>
              .
            </div>
          ) : isSold ? (
            <div className="bg-brick-light/40 border border-dashed border-brick/30 rounded-sm px-4 py-4 text-sm text-slate-ink">
              This property has been sold and is no longer accepting inquiries
              or visit requests.
            </div>
          ) : (
            <>
              {/* Toggle between sending an inquiry and scheduling a visit */}
              <div className="grid grid-cols-2 gap-1 bg-parchment rounded-sm p-1 mb-4">
                <button
                  type="button"
                  onClick={() => setContactMode("inquiry")}
                  className={`text-sm font-medium py-2 rounded-sm transition-colors ${
                    contactMode === "inquiry"
                      ? "bg-white text-navy shadow-sm"
                      : "text-slate-muted hover:text-navy"
                  }`}
                >
                  Send an Inquiry
                </button>
                <button
                  type="button"
                  onClick={() => setContactMode("visit")}
                  className={`text-sm font-medium py-2 rounded-sm transition-colors ${
                    contactMode === "visit"
                      ? "bg-white text-navy shadow-sm"
                      : "text-slate-muted hover:text-navy"
                  }`}
                >
                  Schedule a Visit
                </button>
              </div>

              {contactMode === "inquiry" ? (
                <form onSubmit={handleInquiry} noValidate className="space-y-3">
                  <div>
                    <input
                      placeholder="Your name"
                      className={`input-field ${errors.name ? "border-brick focus:border-brick focus:ring-brick" : ""}`}
                      value={form.name}
                      onChange={(e) => handleFormChange("name", e.target.value)}
                    />
                    {errors.name && (
                      <p className="text-xs text-brick mt-1">{errors.name}</p>
                    )}
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="Email address"
                      className={`input-field ${errors.email ? "border-brick focus:border-brick focus:ring-brick" : ""}`}
                      value={form.email}
                      onChange={(e) =>
                        handleFormChange("email", e.target.value)
                      }
                    />
                    {errors.email && (
                      <p className="text-xs text-brick mt-1">{errors.email}</p>
                    )}
                  </div>
                  <div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="Phone number (98XXXXXXXX)"
                      className={`input-field ${errors.phone ? "border-brick focus:border-brick focus:ring-brick" : ""}`}
                      value={form.phone}
                      onChange={(e) =>
                        handleFormChange(
                          "phone",
                          e.target.value.replace(/\D/g, ""),
                        )
                      }
                    />
                    {errors.phone && (
                      <p className="text-xs text-brick mt-1">{errors.phone}</p>
                    )}
                  </div>
                  <div>
                    <textarea
                      rows={4}
                      placeholder="I'm interested in this property..."
                      className={`input-field ${errors.message ? "border-brick focus:border-brick focus:ring-brick" : ""}`}
                      value={form.message}
                      onChange={(e) =>
                        handleFormChange("message", e.target.value)
                      }
                    />
                    {errors.message && (
                      <p className="text-xs text-brick mt-1">
                        {errors.message}
                      </p>
                    )}
                  </div>
                  <button
                    disabled={sending}
                    type="submit"
                    className="btn-primary w-full"
                  >
                    {sending ? "Sending..." : "Send Inquiry"}
                  </button>
                </form>
              ) : !user ? (
                <div className="bg-parchment/60 border border-dashed border-navy/20 rounded-sm px-4 py-4 text-sm text-slate-muted">
                  Please{" "}
                  <Link
                    to="/login"
                    className="text-brass hover:underline font-medium"
                  >
                    sign in
                  </Link>{" "}
                  to schedule a visit.
                </div>
              ) : visitRequested ? (
                <div className="bg-sage/10 border border-sage/30 rounded-sm px-4 py-4 text-sm text-navy">
                  Your visit request has been sent. The agent will confirm the
                  slot shortly. You can track it from{" "}
                  <Link
                    to="/my-visits"
                    className="text-brass hover:underline font-medium"
                  >
                    My Visits
                  </Link>
                  .
                </div>
              ) : (
                <form
                  onSubmit={handleScheduleVisit}
                  noValidate
                  className="space-y-3"
                >
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-muted mb-1 block">
                      Preferred date &amp; time
                    </label>
                    <input
                      type="datetime-local"
                      min={minDateTimeLocal()}
                      className={`input-field ${visitErrors.requestedSlot ? "border-brick focus:border-brick focus:ring-brick" : ""}`}
                      value={visitForm.requestedSlot}
                      onChange={(e) =>
                        handleVisitFormChange("requestedSlot", e.target.value)
                      }
                    />
                    {visitErrors.requestedSlot && (
                      <p className="text-xs text-brick mt-1">
                        {visitErrors.requestedSlot}
                      </p>
                    )}
                  </div>
                  <div>
                    <textarea
                      rows={3}
                      placeholder="Anything the agent should know before the visit? (optional)"
                      className="input-field"
                      value={visitForm.buyerNotes}
                      onChange={(e) =>
                        handleVisitFormChange("buyerNotes", e.target.value)
                      }
                    />
                  </div>
                  <button
                    disabled={schedulingVisit}
                    type="submit"
                    className="btn-primary w-full"
                  >
                    {schedulingVisit ? "Requesting..." : "Request Visit"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reviews */}
      <div className="mt-16">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-2xl">Reviews</h2>
          {reviews.length > 0 && (
            <span className="text-sm text-slate-muted">
              ★ {avgRating} · {reviews.length} review
              {reviews.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {user &&
          property.listedBy?._id !== user._id &&
          !reviews.some((r) => r.user?._id === user._id) && (
            <form
              onSubmit={handleReviewSubmit}
              className="border border-navy/10 rounded-sm p-6 mb-8 bg-parchment/40"
            >
              <p className="font-semibold text-navy mb-3">
                Write a review{" "}
                <span className="text-xs font-normal text-brass">
                  (earn 100 YC)
                </span>
              </p>
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() =>
                      setReviewForm({ ...reviewForm, rating: star })
                    }
                    className={`text-2xl leading-none ${star <= reviewForm.rating ? "text-brass" : "text-navy/15"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                placeholder="Share your experience with this property or the lister..."
                className="input-field mb-3"
                value={reviewForm.comment}
                onChange={(e) =>
                  setReviewForm({ ...reviewForm, comment: e.target.value })
                }
              />
              {reviewError && (
                <p className="text-xs text-brick mb-2">{reviewError}</p>
              )}
              <button
                disabled={reviewSending}
                type="submit"
                className="btn-primary text-sm px-5 py-2.5"
              >
                {reviewSending ? "Posting..." : "Post review"}
              </button>
            </form>
          )}

        {reviews.length === 0 ? (
          <p className="text-slate-muted text-sm">
            No reviews yet — be the first to share your experience.
          </p>
        ) : (
          <div className="space-y-5">
            {reviews.map((r) => (
              <div key={r._id} className="border-b border-navy/10 pb-5">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-9 h-9 rounded-full bg-brass text-navy flex items-center justify-center font-display text-sm overflow-hidden flex-shrink-0">
                    {r.user?.selfiePhoto ? (
                      <img
                        src={r.user.selfiePhoto}
                        alt={r.user.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      r.user?.name?.charAt(0).toUpperCase() || "?"
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-navy">
                      {r.user?.name || "Anonymous"}
                    </p>
                    <p className="text-xs text-brass">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-ink leading-relaxed">
                  {r.comment}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {similar.length > 0 && (
        <div className="mt-20">
          <h2 className="text-2xl mb-6">Similar Properties</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {similar.map((p) => (
              <PropertyCard key={p._id} property={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyDetail;

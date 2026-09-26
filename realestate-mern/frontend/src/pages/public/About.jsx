import React from 'react';
import { Link } from 'react-router-dom';
import { FiSearch, FiHome, FiCalendar, FiCheckCircle, FiCreditCard, FiSettings } from 'react-icons/fi';
import { openContactModal } from '../../utils/contactModal';

// Services actually offered by the platform (see Home, PropertyListing,
// MyVisits, VerificationQueue, EmiPlans, ManagementDashboard, reviews/blogs).
const services = [
  {
    icon: FiSearch,
    title: 'Browse & compare',
    text: 'Search houses, land, apartments, and commercial spaces across Nepal by location, price, and size — all priced in Nepalese Rupees.',
  },
  {
    icon: FiHome,
    title: 'List your property',
    text: 'Owners with a verified identity can publish a listing under the platform\u2019s listing terms, with photos, map location, and full specifications.',
  },
  {
    icon: FiCalendar,
    title: 'Book site visits',
    text: 'Request a visit on any listing and track it from review to confirmation, completion, or cancellation — with a clear record for both sides.',
  },
  {
    icon: FiCheckCircle,
    title: 'Verified sales & rentals',
    text: 'Agents file each sale or rental against a lead, and our team verifies it before the property status moves. Status only ever moves forward.',
  },
  {
    icon: FiCreditCard,
    title: 'EMI on verified sales',
    text: 'For eligible verified purchases, structured installment plans with payment slips and admin confirmation keep every payment documented.',
  },
  {
    icon: FiSettings,
    title: 'Management & support',
    text: 'Request property management services, leave and read property reviews, follow guides and community ideas, or reach the team any time.',
  },
];

// Trust mechanics that exist in the product (identity queue, forward-only
// status, verification queue, listing terms + moderation). Worded plainly;
// nothing here claims pre-approved listings or statistics we don't have.
const trustPoints = [
  {
    title: 'Identities are checked before posting',
    text: 'Anyone who lists a property completes identity verification first — selfie and citizenship review by our team — so anonymous postings can\u2019t slip through.',
  },
  {
    title: 'Every listing agrees to written terms',
    text: 'Publishing requires accepting the listing Terms & Policies, which our team maintains and can enforce through moderation.',
  },
  {
    title: 'Status history can\u2019t be rewritten',
    text: 'A property moves available \u2192 reserved \u2192 sold, never backwards. Sold listings stop taking inquiries and visits automatically.',
  },
  {
    title: 'Money moments get a second pair of eyes',
    text: 'Sales, rentals, commissions, and EMI payments pass through verification and confirmation steps — not just a status dropdown.',
  },
];

const promiseValues = [
  { value: 'Trust', text: 'Identity checks, written terms, and moderation on every listing.' },
  { value: 'Transparency', text: 'Full specifications, clear status, and documented payments.' },
  { value: 'Responsibility', text: 'Verification before a sale or rental counts.' },
  { value: 'Innovation', text: 'A community ideas space that shapes what we build next.' },
  { value: 'Customer Success', text: 'Guidance before the decision — and support after it.' },
];

// `featured` drives the hierarchy: the founder renders as the prominent
// card, supporters as compact cards. Content unchanged — layout only.
const leadership = [
  {
    name: 'Yam Kumar Karki',
    initials: 'YK',
    role: 'Founder & CEO',
    tag: 'Real Estate Entrepreneur',
    featured: true,
    bio: [
      "Yam Kumar Karki is the Founder & CEO of Youth Real Estate Pvt. Ltd., a growing real estate venture focused on building a more trusted, transparent, and customer-focused property ecosystem in Nepal.",
      'With a strong interest in real estate, construction, property development, and entrepreneurship, he is working to bring a more modern approach to the traditional real estate industry.',
      'His vision goes beyond buying and selling properties — he aims to create an ecosystem where people can discover property opportunities, receive professional guidance, access property-related services, and make important real estate decisions with greater confidence. As an entrepreneur, he is particularly focused on creating opportunities for young people and middle-income families to participate in real estate through practical, transparent, and accessible solutions.',
    ],
    quote: 'To make real estate more trusted, accessible, and opportunity-driven for the next generation.',
  },
  {
    name: 'Chudaraj Basnet',
    initials: 'CB',
    role: 'Developer, Investor & Strategic Supporter',
    tag: 'Youth Real Estate',
    featured: false,
    bio: [
      'Chudaraj Basnet is associated with Youth Real Estate as a Developer, Investor, and Strategic Supporter.',
      'He contributes to the growth and development of the company by supporting its projects, business opportunities, and long-term vision. His involvement represents a shared commitment to building sustainable opportunities and contributing to the growth of Youth Real Estate.',
    ],
  },
];

const About = () => {
  const [founder, ...supporters] = leadership;

  return (
    <div>
      {/* Hero / intro */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 pt-16 pb-4">
        <p className="eyebrow mb-2">About us</p>
        <h1 className="text-4xl md:text-5xl mb-4">About Youth Real Estate</h1>
        <p className="text-brass font-display italic text-lg md:text-xl mb-8">
          Building Trust. Creating Opportunities. Shaping Better Property Decisions.
        </p>
        <p className="text-slate-ink leading-relaxed mb-6 text-lg">
          Youth Real Estate is Nepal&rsquo;s ghar-jagga marketplace for buying, selling, and renting property —
          with agents, financing support, and property management in one place.
        </p>
        <p className="text-slate-ink leading-relaxed mb-6">
          It serves three groups: <strong className="font-semibold">buyers</strong> comparing homes, land, and
          commercial spaces; <strong className="font-semibold">owners</strong> listing and managing their
          property; and <strong className="font-semibold">agents</strong> guiding visits, filings, and closings
          under the team&rsquo;s verification. Whether it&rsquo;s your first ghar or your next investment, the
          goal is the same — a decision made with clear information, not pressure.
        </p>
      </section>

      {/* What you can do here */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16">
        <p className="eyebrow mb-2">What the platform does</p>
        <h2 className="text-3xl mb-3">One place for the whole property journey</h2>
        <p className="text-slate-muted leading-relaxed mb-8 max-w-3xl">
          From first search to final paperwork — and the everyday management that follows.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-white border border-navy/10 rounded-sm p-6 shadow-card hover:border-brass/50 hover:shadow-lifted transition-all">
              <div className="w-10 h-10 rounded-full bg-sage-light flex items-center justify-center text-sage mb-4">
                <Icon size={18} aria-hidden="true" />
              </div>
              <p className="font-semibold text-navy mb-1.5">{title}</p>
              <p className="text-sm text-slate-muted leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How trust works */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16">
        <p className="eyebrow mb-2">How trust works here</p>
        <h2 className="text-3xl mb-3">Protections you can actually check</h2>
        <p className="text-slate-muted leading-relaxed mb-8 max-w-3xl">
          No fine print promises — these are mechanics built into the product, visible on every listing and request.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {trustPoints.map((point) => (
            <div key={point.title} className="border border-navy/10 rounded-sm p-6 md:p-7 bg-white shadow-card">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 w-6 h-6 rounded-full bg-sage-light text-sage flex items-center justify-center text-sm font-bold flex-shrink-0">✓</span>
                <div>
                  <p className="font-semibold text-navy mb-1.5">{point.title}</p>
                  <p className="text-sm text-slate-muted leading-relaxed">{point.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-muted leading-relaxed mt-6 max-w-3xl">
          Good to know: listings publish immediately once the listing terms are accepted, and stay subject to
          moderation. EMI plans are created only for verified purchases, and tenancies end only through an
          explicit, recorded action — never silently.
        </p>
      </section>

      {/* Approach */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16">
        <p className="eyebrow mb-2">Our approach</p>
        <h2 className="text-3xl mb-5">A decision, not just a transaction</h2>
        <p className="text-slate-ink leading-relaxed mb-4 max-w-3xl">
          A property decision should never rest on price or promises alone. We start from your needs, budget,
          and plans — then match them against documented listings, scheduled visits, and verified records.
        </p>
        <p className="text-slate-ink leading-relaxed max-w-3xl font-medium">
          Our role isn&rsquo;t simply to sell a property. Our role is to help you make a better property decision.
        </p>
      </section>

      {/* Vision & Mission */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-navy/10 rounded-sm p-8 bg-sage-light/40">
          <p className="font-display text-xl text-navy mb-3">Our Vision</p>
          <p className="text-sm text-slate-ink leading-relaxed">
            A Nepal where buying, selling, or renting property is straightforward and fair — where every listing
            carries clear information, every payment leaves a record, and every family can decide with confidence.
          </p>
        </div>
        <div className="border border-navy/10 rounded-sm p-8 bg-brick-light/40">
          <p className="font-display text-xl text-navy mb-3">Our Mission</p>
          <ul className="text-sm text-slate-ink leading-relaxed space-y-1.5 list-disc list-inside">
            <li>Keep listing standards clear and enforce them consistently.</li>
            <li>Verify sales and rentals before they count.</li>
            <li>Document visits, payments, and tenancies end to end.</li>
            <li>Support owners with management services after the deal.</li>
            <li>Share guides and community ideas that help buyers learn.</li>
          </ul>
        </div>
      </section>

      {/* Our Promise */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16">
        <p className="eyebrow mb-2">Our promise</p>
        <h2 className="text-3xl mb-3">What we hold ourselves to</h2>
        <p className="text-slate-muted leading-relaxed mb-8 max-w-3xl">
          Five values, each tied to something concrete on this platform.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {promiseValues.map(({ value, text }) => (
            <div key={value} className="border border-navy/10 rounded-sm p-5 text-center hover:border-brass hover:shadow-card transition-all">
              <p className="font-display text-base text-navy mb-1.5">{value}</p>
              <p className="text-xs text-slate-muted leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Leadership — hierarchical: featured founder, compact supporters */}
      <section className="bg-parchment/60 py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <p className="eyebrow mb-2">The people behind it</p>
          <h2 className="text-3xl mb-4">Leadership</h2>
          <p className="text-slate-ink leading-relaxed mb-10 max-w-2xl">
            A small team combining entrepreneurship, investment, and development — accountable for the
            standards described above.
          </p>

          <div className="bg-navy rounded-sm shadow-card p-8 md:p-10 flex flex-col md:flex-row gap-8 mb-6">
            <div className="flex-shrink-0">
              <div className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-brass flex items-center justify-center">
                <span className="font-display text-3xl md:text-4xl text-navy">{founder.initials}</span>
              </div>
            </div>
            <div className="min-w-0">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-widest text-brass-light border border-brass/40 rounded-sm px-2.5 py-1 mb-3">
                {founder.role}
              </span>
              <p className="font-display text-2xl md:text-3xl text-ivory leading-snug">{founder.name}</p>
              <p className="text-sm text-ivory/60 mt-1 mb-4">{founder.tag}</p>
              {founder.bio.map((para, i) => (
                <p key={i} className="text-sm text-ivory/80 leading-relaxed mb-3 last:mb-0">{para}</p>
              ))}
              {founder.quote && (
                <blockquote className="border-l-2 border-brass pl-4 mt-5 italic text-ivory font-display text-lg leading-snug">
                  “{founder.quote}”
                </blockquote>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {supporters.map((person) => (
              <div key={person.name} className="bg-white border border-navy/10 rounded-sm shadow-card p-6 md:p-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center flex-shrink-0">
                    <span className="font-display text-xl text-brass-light">{person.initials}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xl text-navy leading-snug">{person.name}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brass mt-0.5">{person.role}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-muted mb-3">{person.tag}</p>
                {person.bio.map((para, i) => (
                  <p key={i} className="text-sm text-slate-ink leading-relaxed mb-3 last:mb-0">{para}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 py-16 text-center">
        <p className="font-display text-2xl text-navy mb-3">Ready to make your next move?</p>
        <p className="text-slate-muted mb-6 max-w-xl mx-auto">
          Browse current listings across Nepal, or talk to the team about buying, selling, or managing property.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/properties" className="btn-gold w-full sm:w-auto">Browse properties</Link>
          <button type="button" onClick={openContactModal} className="text-sm font-medium text-brass hover:underline">Contact us →</button>
        </div>
      </section>
    </div>
  );
};

export default About;

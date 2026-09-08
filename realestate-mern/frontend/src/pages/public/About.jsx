import React from 'react';
import { Link } from 'react-router-dom';

const journeySteps = ['Discover', 'Compare', 'Verify', 'Finance', 'Buy', 'Build', 'Manage', 'Grow'];

const promiseValues = ['Trust', 'Transparency', 'Responsibility', 'Innovation', 'Customer Success'];

const leadership = [
  {
    name: 'Yam Kumar Karki',
    initials: 'YK',
    role: 'Founder & CEO',
    tag: 'Real Estate Entrepreneur',
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
    bio: [
      'Chudaraj Basnet is associated with Youth Real Estate as a Developer, Investor, and Strategic Supporter.',
      'He contributes to the growth and development of the company by supporting its projects, business opportunities, and long-term vision. His involvement represents a shared commitment to building sustainable opportunities and contributing to the growth of Youth Real Estate.',
    ],
  },
];

const About = () => {
  return (
    <div>
      {/* Hero / intro */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 pt-16 pb-4">
        <p className="eyebrow mb-2">Our story</p>
        <h1 className="text-4xl md:text-5xl mb-4">About Youth Real Estate</h1>
        <p className="text-brass font-display italic text-lg md:text-xl mb-8">
          Building Trust. Creating Opportunities. Shaping Better Property Decisions.
        </p>
        <p className="text-slate-ink leading-relaxed mb-6 text-lg">
          Youth Real Estate is a modern real estate company built with a simple belief: property ownership
          should be safe, transparent, informed, and achievable for everyone.
        </p>
        <p className="text-slate-ink leading-relaxed mb-6">
          We are more than a property-selling company. We are building a complete real estate ecosystem that
          connects people with the right property, the right information, the right financial planning, and
          the right services — under one trusted platform. From buying and selling property to construction,
          property management, home services, investment solutions, and digital property services, our goal is
          to simplify every step of the property journey.
        </p>
      </section>

      {/* Journey strip */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-14">
        <div className="bg-navy rounded-sm px-6 py-6 md:px-10 md:py-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
          {journeySteps.map((step, i) => (
            <React.Fragment key={step}>
              <span className="text-ivory font-display text-sm md:text-base tracking-wide">{step}</span>
              {i < journeySteps.length - 1 && <span className="text-brass-light">→</span>}
            </React.Fragment>
          ))}
        </div>
        <p className="text-center text-sm text-slate-muted italic mt-4">
          Because for us, the relationship doesn't end when a property is purchased — it begins there.
        </p>
      </section>

      {/* Approach */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16">
        <p className="eyebrow mb-2">Our approach</p>
        <h2 className="text-3xl mb-5">A decision, not just a transaction</h2>
        <p className="text-slate-ink leading-relaxed mb-4 max-w-3xl">
          We believe that a property decision should never be based only on price or promises. We focus on
          understanding our customers' needs, budgets, goals, and future plans before recommending a property —
          emphasizing transparent information, responsible guidance, proper documentation, and a customer-first
          experience.
        </p>
        <p className="text-slate-ink leading-relaxed max-w-3xl font-medium">
          Our role isn't simply to sell a property. Our role is to help you make a better property decision.
        </p>
      </section>

      {/* Vision & Mission */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-navy/10 rounded-sm p-8 bg-sage-light/40">
          <p className="font-display text-xl text-navy mb-3">Our Vision</p>
          <p className="text-sm text-slate-ink leading-relaxed">
            To become Nepal's most trusted and technology-driven real estate ecosystem, making property
            ownership simpler, more transparent, and more accessible for individuals, families, investors, and
            businesses.
          </p>
        </div>
        <div className="border border-navy/10 rounded-sm p-8 bg-brick-light/40">
          <p className="font-display text-xl text-navy mb-3">Our Mission</p>
          <ul className="text-sm text-slate-ink leading-relaxed space-y-1.5 list-disc list-inside">
            <li>Promote transparent and responsible real estate practices.</li>
            <li>Help customers make informed property decisions.</li>
            <li>Connect buyers, sellers, builders, investors, and service providers through one ecosystem.</li>
            <li>Make property ownership more achievable through structured, practical solutions.</li>
            <li>Use technology and data to create a simpler, better real estate experience.</li>
            <li>Build long-term relationships — not one-time transactions.</li>
          </ul>
        </div>
      </section>

      {/* Our Promise */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 mb-20">
        <p className="eyebrow mb-2">Our promise</p>
        <h2 className="text-3xl mb-8">We believe in doing real estate differently</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {promiseValues.map((value) => (
            <div key={value} className="border border-navy/10 rounded-sm p-5 text-center hover:border-brass hover:shadow-card transition-all">
              <p className="font-display text-base text-navy">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Leadership */}
      <section className="bg-parchment/60 py-20">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <p className="eyebrow mb-2">The people behind it</p>
          <h2 className="text-3xl mb-4">Leadership</h2>
          <p className="text-slate-ink leading-relaxed mb-12 max-w-2xl">
            Youth Real Estate is led by a small team combining entrepreneurship, investment, development, and
            innovation to create a stronger, more customer-focused real estate ecosystem.
          </p>

          <div className="space-y-8">
            {leadership.map((person) => (
              <div key={person.name} className="bg-white border border-navy/10 rounded-sm shadow-card p-8 md:p-10 flex flex-col md:flex-row gap-8">
                <div className="flex-shrink-0 flex md:flex-col items-center md:items-start gap-4">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-navy flex items-center justify-center flex-shrink-0">
                    <span className="font-display text-2xl md:text-3xl text-brass-light">{person.initials}</span>
                  </div>
                </div>
                <div>
                  <p className="font-display text-2xl text-navy leading-snug">{person.name}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brass mb-1">{person.role}</p>
                  <p className="text-sm text-slate-muted mb-4">{person.tag}</p>
                  {person.bio.map((para, i) => (
                    <p key={i} className="text-sm text-slate-ink leading-relaxed mb-3 last:mb-0">{para}</p>
                  ))}
                  {person.quote && (
                    <blockquote className="border-l-2 border-brass pl-4 mt-5 italic text-navy font-display text-lg leading-snug">
                      “{person.quote}”
                    </blockquote>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 py-16 text-center">
        <p className="font-display text-2xl text-navy mb-3">Ready to make your next move?</p>
        <p className="text-slate-muted mb-6 max-w-xl mx-auto">
          Explore verified listings or get in touch with our team — we're here to help you make a better
          property decision.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/properties" className="btn-gold">Browse properties</Link>
          <Link to="/contact" className="text-sm font-medium text-brass hover:underline">Contact us →</Link>
        </div>
      </section>
    </div>
  );
};

export default About;

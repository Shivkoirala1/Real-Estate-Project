import React from 'react';

const MISSION_ITEMS = [
  'To promote transparent and responsible real estate practices.',
  'To help customers make informed property decisions.',
  'To connect buyers, sellers, builders, investors, and service providers through one ecosystem.',
  'To make property ownership more achievable through structured and practical solutions.',
  'To use technology and data to create a simpler and better real estate experience.',
  'To build long-term relationships - not one-time transactions.',
];

const LIFECYCLE_STEPS = ['Discover', 'Compare', 'Verify', 'Finance', 'Buy', 'Build', 'Manage', 'Grow'];

const REWARDS_LEVEL_STEPS = ['Explore', 'Earn XP', 'Level Up', 'Earn YC', 'Unlock Benefits'];

const PROMISE_LINES = ['Every property.', 'Every customer.', 'Every transaction.', 'Every relationship.'];

const REWARD_CARDS = [
  {
    title: 'XP',
    subtitle: 'Experience Points',
    body: 'Earn XP by engaging with the Youth Real Estate ecosystem - exploring properties, completing activities, referring others, and interacting with our services. XP helps you grow your level and unlock new benefits.',
  },
  {
    title: 'YC',
    subtitle: 'Youth Coin',
    body: 'YC Coin is our customer rewards system. Members can earn YC Coins through eligible activities and use them for selected discounts, rewards, and benefits across the Youth Real Estate ecosystem.',
  },
  {
    title: 'LVL',
    subtitle: 'Level System',
    body: 'As your XP increases, your Youth Level increases. Higher levels can unlock exclusive rewards, privileges, offers, and community benefits.',
  },
];

// A small, tasteful stand-in for a headshot when no photo is available yet -
// initials on a solid navy circle, in the site's own display typeface.
const InitialsAvatar = ({ initials }) => (
  <div className="w-20 h-20 rounded-full bg-navy text-ivory flex items-center justify-center font-display text-2xl flex-shrink-0">
    {initials}
  </div>
);

const FlowSteps = ({ steps }) => (
  <div className="flex flex-wrap items-center gap-2">
    {steps.map((step, i) => (
      <React.Fragment key={step}>
        <span className="text-xs font-semibold uppercase tracking-wide text-navy border border-brass/40 rounded-full px-3 py-1.5 whitespace-nowrap">
          {step}
        </span>
        {i < steps.length - 1 && <span className="text-brass/60">&rarr;</span>}
      </React.Fragment>
    ))}
  </div>
);

const SectionHeading = ({ eyebrow, title }) => (
  <>
    {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
    <h2 className="text-2xl md:text-3xl mb-5">{title}</h2>
  </>
);

const PullQuote = ({ children }) => (
  <blockquote className="border-l-4 border-brass pl-5 md:pl-6 py-1 my-6 text-lg md:text-xl font-display text-navy leading-snug">
    {children}
  </blockquote>
);

const About = () => {
  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-16">
      {/* Header */}
      <p className="eyebrow mb-2">Our story</p>
      <h1 className="text-4xl md:text-5xl mb-3">About Youth Real Estate Pvt. Ltd.</h1>
      <p className="text-brass font-display text-lg md:text-xl italic mb-8">
        Building Trust. Creating Opportunities. Shaping Better Property Decisions.
      </p>

      <p className="text-slate-ink leading-relaxed mb-5">
        <strong className="text-navy">Youth Real Estate</strong> is a modern real estate company built with a
        simple belief: <strong className="text-navy">property ownership should be safe, transparent, informed,
        and achievable for everyone.</strong>
      </p>
      <p className="text-slate-ink leading-relaxed mb-5">
        We are more than a property-selling company. We are building a{' '}
        <strong className="text-navy">complete real estate ecosystem</strong> that connects people with the right
        property, the right information, the right financial planning, and the right services - under one
        trusted platform.
      </p>
      <p className="text-slate-ink leading-relaxed mb-16">
        From <strong className="text-navy">buying and selling property to construction, property management,
        home services, investment solutions, and digital property services</strong>, our goal is to simplify
        every step of the property journey.
      </p>

      {/* Our Approach */}
      <section className="mb-16 pt-16 border-t border-navy/10">
        <SectionHeading eyebrow="How we work" title="Our Approach" />
        <p className="text-slate-ink leading-relaxed mb-4">
          We believe that a property decision should never be based only on price or promises.
        </p>
        <p className="text-slate-ink leading-relaxed">
          We focus on understanding our customers' needs, budgets, goals, and future plans before recommending a
          property. We emphasize <strong className="text-navy">transparent information, responsible guidance,
          proper documentation, and a customer-first experience.</strong>
        </p>
        <PullQuote>Our role is not simply to sell a property. Our role is to help you make a better property decision.</PullQuote>
      </section>

      {/* Our Vision */}
      <section className="mb-16 pt-16 border-t border-navy/10">
        <SectionHeading eyebrow="Where we're headed" title="Our Vision" />
        <p className="text-slate-ink leading-relaxed">
          To become <strong className="text-navy">Nepal's most trusted and technology-driven real estate
          ecosystem</strong>, making property ownership simpler, more transparent, and more accessible for
          individuals, families, investors, and businesses.
        </p>
      </section>

      {/* Our Mission */}
      <section className="mb-16 pt-16 border-t border-navy/10">
        <SectionHeading eyebrow="What drives us" title="Our Mission" />
        <ul className="space-y-3">
          {MISSION_ITEMS.map((item) => (
            <li key={item} className="flex items-start gap-3 text-slate-ink leading-relaxed">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brass flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* More Than Real Estate */}
      <section className="mb-16 pt-16 border-t border-navy/10">
        <SectionHeading eyebrow="The full picture" title="More Than Real Estate" />
        <p className="text-slate-ink leading-relaxed mb-6">
          At Youth Real Estate Pvt. Ltd, we are building for the <strong className="text-navy">entire property
          lifecycle</strong>.
        </p>
        <div className="bg-parchment/60 border border-navy/10 rounded-sm p-6 mb-6">
          <FlowSteps steps={LIFECYCLE_STEPS} />
        </div>
        <p className="text-slate-ink leading-relaxed">
          Because for us, the relationship does not end when a property is purchased.
        </p>
        <PullQuote>It begins there.</PullQuote>
      </section>

      {/* Our Promise */}
      <section className="mb-16 pt-16 border-t border-navy/10">
        <SectionHeading eyebrow="What we stand for" title="Our Promise" />
        <p className="text-slate-ink leading-relaxed mb-6">
          We are committed to building our business around{' '}
          <strong className="text-navy">Trust, Transparency, Responsibility, Innovation, and Customer
          Success.</strong>
        </p>
        <div className="flex flex-wrap gap-x-8 gap-y-1 mb-6">
          {PROMISE_LINES.map((line) => (
            <p key={line} className="font-display text-lg text-navy">{line}</p>
          ))}
        </div>
        <p className="text-brass font-display text-xl italic">We believe in doing real estate differently.</p>
      </section>

      {/* Youth Rewards & Level System */}
      <section className="mb-16 pt-16 border-t border-navy/10">
        <SectionHeading eyebrow="Member benefits" title="Youth Rewards & Level System" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          {REWARD_CARDS.map((card) => (
            <div key={card.title} className="border border-navy/10 rounded-sm p-6">
              <div className="w-11 h-11 rounded-full bg-navy text-ivory flex items-center justify-center font-display text-sm mb-4">
                {card.title}
              </div>
              <p className="font-display text-lg mb-2">{card.subtitle}</p>
              <p className="text-sm text-slate-muted leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
        <div className="bg-parchment/60 border border-navy/10 rounded-sm p-6">
          <FlowSteps steps={REWARDS_LEVEL_STEPS} />
        </div>
      </section>

      {/* Leadership */}
      <section className="pt-16 border-t border-navy/10">
        <p className="eyebrow mb-2">The people behind it</p>
        <h2 className="text-3xl mb-10">Leadership</h2>

        <div className="space-y-10">
          {/* Yam Kumar Karki */}
          <div className="bg-white border border-navy/10 rounded-sm p-6 md:p-8">
            <div className="flex items-start gap-5 mb-6">
              <InitialsAvatar initials="YK" />
              <div>
                <h3 className="text-2xl mb-1">Yam Kumar Karki</h3>
                <p className="text-xs font-semibold uppercase tracking-wide text-brass">
                  Founder &amp; CEO | Real Estate Entrepreneur
                </p>
              </div>
            </div>

            <div className="space-y-4 text-slate-ink leading-relaxed">
              <p>
                Pawan Karki is the Founder &amp; CEO of <strong className="text-navy">Youth Real Estate Pvt.
                Ltd.</strong>, a growing real estate venture focused on building a more trusted, transparent, and
                customer-focused property ecosystem in Nepal.
              </p>
              <p>
                With a strong interest in real estate, construction, property development, and entrepreneurship,
                Pawan is working to bring a more modern approach to the traditional real estate industry.
              </p>
              <p>
                His vision goes beyond buying and selling properties. He aims to create an ecosystem where people
                can discover property opportunities, receive professional guidance, access property-related
                services, and make important real estate decisions with greater confidence.
              </p>
              <p>
                As an entrepreneur, he is particularly focused on creating opportunities for young people and
                middle-income families to participate in real estate through practical, transparent, and
                accessible solutions.
              </p>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted mb-2">His Vision</p>
              <PullQuote>
                &ldquo;To make real estate more trusted, accessible, and opportunity-driven for the next
                generation.&rdquo;
              </PullQuote>
            </div>

            <div className="space-y-4 text-slate-ink leading-relaxed">
              <p>
                Pawan believes that real estate should not be built only around transactions. It should be built
                around <strong className="text-navy">trust, relationships, transparency, and long-term
                value.</strong>
              </p>
              <p>
                Through Youth Real Estate, his long-term vision is to develop a complete real estate ecosystem
                that connects <strong className="text-navy">buyers, sellers, investors, agents, builders,
                homeowners, and property service providers</strong> through technology and professional services.
              </p>
              <p>
                From property marketplace and construction services to property management, home services,
                investment opportunities, and digital solutions, Pawan is working toward building a broader real
                estate platform designed for the changing needs of Nepal's next generation.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-navy/10 text-sm">
              <p className="font-semibold text-navy">Yam Kumar Karki</p>
              <p className="font-semibold text-navy">Founder &amp; CEO</p>
              <p className="font-semibold text-navy">Youth Real Estate Pvt. Ltd.</p>
            </div>
          </div>

          {/* Chudaraj Basnet */}
          <div className="bg-white border border-navy/10 rounded-sm p-6 md:p-8">
            <div className="flex items-start gap-5 mb-6">
              <InitialsAvatar initials="CB" />
              <div>
                <h3 className="text-2xl mb-1">Chudaraj Basnet</h3>
                <p className="text-xs font-semibold uppercase tracking-wide text-brass">
                  Developer, Investor &amp; Strategic Supporter
                </p>
              </div>
            </div>

            <div className="space-y-4 text-slate-ink leading-relaxed">
              <p>
                Chudaraj Basnet is associated with Youth Real Estate as a Developer, Investor, and Strategic
                Supporter.
              </p>
              <p>
                He contributes to the growth and development of the company by supporting its projects, business
                opportunities, and long-term vision. His involvement represents a shared commitment to building
                sustainable opportunities and contributing to the growth of Youth Real Estate.
              </p>
            </div>
          </div>
        </div>

        <p className="text-slate-ink leading-relaxed mt-10 max-w-2xl">
          Together, the leadership aims to combine entrepreneurship, investment, development, and innovation to
          create a stronger and more customer-focused real estate ecosystem.
        </p>
      </section>
    </div>
  );
};

export default About;

import React from 'react';

const About = () => {
  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-16">
      <p className="eyebrow mb-2">Our story</p>
      <h1 className="text-4xl mb-6">About Ashland Estates</h1>
      <p className="text-slate-ink leading-relaxed mb-6">
        Ashland Estates is a real estate management platform built to connect property buyers with verified
        listings and trusted agents. Our mission is to make browsing, listing, and managing properties simple,
        transparent, and secure for everyone involved.
      </p>
      <p className="text-slate-ink leading-relaxed mb-10">
        From individual buyers looking for their next home to property agents managing dozens of active
        listings, our platform is designed to serve every step of the process — from search and discovery to
        inquiry and follow-up.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {[
          ['Simplicity', 'A clean, focused experience for browsing and listing properties.'],
          ['Security', 'Every seller is identity-verified by our team before they can post a listing.'],
          ['Scalability', 'Built to grow from a single office to a multi-branch operation.'],
        ].map(([title, desc]) => (
          <div key={title} className="border border-navy/10 rounded-sm p-6">
            <p className="font-display text-xl mb-2">{title}</p>
            <p className="text-sm text-slate-muted leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Meet the team */}
      <div>
        <p className="eyebrow mb-2">The people behind it</p>
        <h2 className="text-3xl mb-4">Meet the team</h2>
        <p className="text-slate-ink leading-relaxed mb-10 max-w-2xl">
          Ashland Estates is built and maintained by Prasad InfoTech, a software team dedicated to building
          reliable, thoughtful platforms for real businesses. Here's who's behind this one.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              image: '/images/team/ceo-prasad.jpg',
              role: 'Founder & CEO',
              org: 'Prasad InfoTech',
              bio: "Leads the company's vision for building dependable, well-crafted software for real-world businesses, and set the direction and quality bar for this platform from day one.",
            },
            {
              image: '/images/team/supervisor.jpg',
              role: 'Project Supervisor',
              org: 'Prasad InfoTech',
              bio: 'Coordinated the project from planning through delivery, keeping the team aligned on priorities, timelines, and the requirements that shaped this platform.',
            },
            {
              image: '/images/team/backend-developer.jpg',
              role: 'Backend Developer',
              org: 'Prasad InfoTech',
              bio: 'Designed and built the server-side architecture behind the platform - the database models, APIs, authentication, and business logic that keep everything running smoothly.',
            },
            {
              image: '/images/team/fullstack-developer.jpg',
              role: 'Systems Developer',
              org: 'PRASAD INFOTECH',
              bio: 'A true allrounder across the MERN stack - equally at home in the frontend interface, backend services, or infrastructure, stepping in wherever the project needed it most.',
            },
          ].map((member) => (
            <div key={member.role} className="border border-navy/10 rounded-sm overflow-hidden bg-white">
              <img src={member.image} alt={member.role} className="w-full h-56 object-cover object-top" />
              <div className="p-5">
                <p className="font-display text-lg leading-snug">{member.role}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-brass mb-2">{member.org}</p>
                <p className="text-sm text-slate-muted leading-relaxed">{member.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default About;

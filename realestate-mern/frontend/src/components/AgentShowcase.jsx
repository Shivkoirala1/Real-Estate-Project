import React, { useEffect, useState } from 'react';
import { getShowcasedAgents } from '../services/agentService';

const AgentShowcase = () => {
  // Agents the admin chose to spotlight (public endpoint, safe fields
  // only). The section hides entirely when none are showcased.
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getShowcasedAgents()
      .then((data) => {
        if (active) setAgents(data.agents || []);
      })
      .catch(() => {
        if (active) setAgents([]);
      })
      .finally(() => {
        if (active) setAgentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (agentsLoading || agents.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-5 md:px-8 mt-20">
      <p className="eyebrow mb-2">Talk to a human</p>
      <h2 className="text-3xl mb-4">Meet our agents</h2>
      <p className="text-slate-ink leading-relaxed mb-10 max-w-2xl">
        Our licensed agents help you discover, verify, and close the right property deal.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div
            key={agent._id}
            className="bg-white border border-navy/10 rounded-sm shadow-card p-3 hover:border-brass/50 hover:shadow-lifted transition-all"
          >
            <div className="border border-navy/10 rounded-sm bg-parchment/60 shadow-[inset_0_2px_8px_rgba(27,42,65,0.08)] px-6 py-8 text-center">
              <div className="w-20 h-20 rounded-full p-1 bg-white ring-1 ring-brass/40 shadow-inner mx-auto mb-4">
                <div className="w-full h-full rounded-full bg-navy text-brass-light flex items-center justify-center font-display text-2xl overflow-hidden">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    (agent.name || '?').charAt(0).toUpperCase()
                  )}
                </div>
              </div>
              <p className="font-display text-lg text-navy leading-snug">{agent.name}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AgentShowcase;

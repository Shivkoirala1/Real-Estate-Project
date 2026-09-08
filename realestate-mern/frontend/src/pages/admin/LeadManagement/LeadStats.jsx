import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPipelineMetrics } from '../../../services/leadService';
import StatCard from '../../../components/layout/StatCard';

// Lead pipeline stat bar for the top of the Lead Management dashboard.
const LeadStats = ({ reloadKey = 0 }) => {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getPipelineMetrics()
      .then((data) => {
        setMetrics(data.metrics);
        setError(false);
      })
      .catch(() => setError(true));
  }, [reloadKey]);

  if (error) return null;
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-navy/5 rounded-sm" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Leads" value={metrics.totalLeads} accent="#1F2A44" />
        <StatCard label="Active Pipeline" value={metrics.activeLeads} accent="#4C6FA0" />
        <StatCard
          label="Conversion Rate"
          value={`${metrics.conversionRate}%`}
          accent="#6B8F71"
        />
        <StatCard
          label="Overdue Follow-ups"
          value={metrics.overdueFollowUps}
          accent={metrics.overdueFollowUps > 0 ? '#A64B42' : '#8A8A82'}
        />
      </div>

      {(metrics.overdueFollowUps > 0 || metrics.newThisWeek > 0) && (
        <div className="flex flex-wrap gap-3 mb-6 text-sm">
          {metrics.overdueFollowUps > 0 && (
            <Link
              to="/dashboard/admin/lead-management?followUp=overdue"
              className="bg-brick/10 border border-brick/40 text-brick rounded-sm px-4 py-2 hover:bg-brick/15 transition-colors"
            >
              {metrics.overdueFollowUps} lead{metrics.overdueFollowUps === 1 ? '' : 's'} overdue for follow-up — review now →
            </Link>
          )}
          {metrics.newThisWeek > 0 && (
            <span className="bg-sage-light text-sage rounded-sm px-4 py-2">
              {metrics.newThisWeek} new lead{metrics.newThisWeek === 1 ? '' : 's'} this week
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default LeadStats;

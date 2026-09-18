/**
 * Lead follow-up overdue reminder job.
 *
 * Run daily by the node-cron scheduler in server.js:
 *   - "overdue": leads whose nextFollowUp is in the past and whose stage is
 *     neither closed nor lost (the same overdue definition used by the
 *     Lead.isOverdue virtual, pipeline metrics, and suggested-action).
 *
 * The assigned agent gets the reminder; leads with no assignee alert all
 * admins instead so nothing slips through. Dedup is manual (the notify
 * helper doesn't dedup): at most one notification per (recipient, lead) per
 * calendar day, so re-runs and retries never spam the bell.
 *
 * The whole run is wrapped in try/catch and never throws - a failed reminder
 * sweep must never take the process down.
 */

const Lead = require('../models/Lead');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { notify, notifyMany } = require('./notify');

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDate = (value) => new Date(value).toISOString().slice(0, 10);

const runLeadFollowupReminders = async () => {
  try {
    const now = new Date();
    const today = startOfToday();

    const overdueLeads = await Lead.find({
      nextFollowUp: { $ne: null, $lt: now },
      stage: { $nin: ['closed', 'lost'] },
    }).select('_id name email stage priority nextFollowUp assignedAgent property');

    let created = 0;

    // One notification per (recipient, lead) per day - Notification.exists
    // is the dedup gate so re-running the job never creates duplicates.
    const alreadySentToday = async (recipient, leadId) =>
      Notification.exists({
        recipient,
        type: 'lead_followup_due',
        lead: leadId,
        createdAt: { $gte: today },
      });

    const remind = async (lead, recipients) => {
      const message =
        `Follow-up for lead "${lead.name}" was due ${formatDate(lead.nextFollowUp)} - reach out now.`;
      const link = `/dashboard/lead-management/leads/${lead._id}`;
      for (const recipient of recipients) {
        if (!recipient) continue; // eslint-disable-line no-continue
        if (await alreadySentToday(recipient, lead._id)) continue; // eslint-disable-line no-continue
        const doc = await notify({
          recipient,
          type: 'lead_followup_due',
          title: 'Lead follow-up overdue',
          message,
          lead: lead._id,
          property: lead.property || null,
          link,
        });
        if (doc) created += 1;
      }
    };

    const admins = await User.find({ role: 'admin' }).select('_id');
    const adminIds = admins.map((a) => a._id);

    for (const lead of overdueLeads) {
      if (lead.assignedAgent) {
        await remind(lead, [lead.assignedAgent]);
      } else if (adminIds.length > 0) {
        const fresh = [];
        for (const adminId of adminIds) {
          if (!(await alreadySentToday(adminId, lead._id))) fresh.push(adminId);
        }
        if (fresh.length > 0) {
          const docs = await notifyMany(fresh, {
            type: 'lead_followup_due',
            title: 'Lead follow-up overdue',
            message:
              `Follow-up for unassigned lead "${lead.name}" was due ${formatDate(lead.nextFollowUp)} - assign an agent or reach out now.`,
            lead: lead._id,
            property: lead.property || null,
            link: `/dashboard/lead-management/leads/${lead._id}`,
          });
          created += docs.filter(Boolean).length;
        }
      }
    }

    return {
      overdueLeads: overdueLeads.length,
      notificationsCreated: created,
    };
  } catch (err) {
    // Never throw - the scheduler only logs
    console.error('Lead follow-up reminder job failed:', err.message);
    return null;
  }
};

module.exports = { runLeadFollowupReminders };

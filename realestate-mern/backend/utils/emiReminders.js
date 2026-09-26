/**
 * EMI reminder job (Spec v2 - Feature 3)
 *
 * Run daily by the node-cron scheduler in server.js:
 *   - "due soon": pending installments due today .. today+3 days, buyer +
 *     managing agent only (unchanged).
 *   - "overdue":  pending installments 1-7 days past due, buyer +
 *     managing agent + every admin. Day 7 adds one FINAL escalation for
 *     admins only; day 8+ goes silent for everyone (badges still show
 *     overdue in-app; verification/status flows unaffected).
 *
 * For every matching installment each recipient gets a notification. Dedup
 * is manual (the notify helper doesn't dedup): at most one notification per
 * (recipient, type, plan) per calendar day, so re-runs and retries never
 * spam the bell. The FINAL escalation carries its own title and a
 * title-scoped dedup guard so it never collides with the admin daily.
 *
 * The whole run is wrapped in try/catch and never throws - a failed reminder
 * sweep must never take the process down.
 */

const EMIPlan = require('../models/EMIPlan');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { notify } = require('./notify');

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDate = (value) => new Date(value).toISOString().slice(0, 10);

const runEmiReminders = async () => {
  try {
    const today = startOfToday();
    const in3DaysEnd = new Date(today);
    in3DaysEnd.setDate(in3DaysEnd.getDate() + 3);
    in3DaysEnd.setHours(23, 59, 59, 999);

    // Overdue dailies are capped at 7 days past due - older rows go silent
    // (day 7 additionally escalates once to admins, see below).
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [dueSoonPlans, overduePlans] = await Promise.all([
      EMIPlan.find({
        status: 'active',
        installments: { $elemMatch: { status: 'pending', dueDate: { $gte: today, $lte: in3DaysEnd } } },
      }).populate('property', 'title'),
      EMIPlan.find({
        status: 'active',
        installments: { $elemMatch: { status: 'pending', dueDate: { $gte: weekAgo, $lt: today } } },
      }).populate('property', 'title'),
    ]);

    let created = 0;

    // One notification per (recipient, type, plan) per day - Notification.exists
    // is the dedup gate so re-running the job never creates duplicates.
    const alreadySentToday = async (recipient, type, planId) =>
      Notification.exists({
        recipient,
        type,
        emiPlan: planId,
        createdAt: { $gte: today },
      });

    // Overdue alerts fan out to every admin (amount included, like the
    // buyer's copy); pre-due stays buyer + agent only. Resolved once per run.
    // A failed admin lookup must not block buyer/agent reminders - fall back
    // to an empty list and let the per-recipient loop proceed.
    let adminIds = [];
    try {
      adminIds = (await User.find({ role: 'admin' }).select('_id').lean()).map((a) => a._id);
    } catch (err) {
      console.error('EMI reminder admin lookup failed:', err.message);
    }

    const remind = async ({ plan, installment, kind }) => {
      const isDue = kind === 'due';
      const propertyTitle = plan.property && plan.property.title ? plan.property.title : 'your property';
      // Buyer's copy includes the amount (it's their money); the agent's
      // copy never does - agents get schedule/status only, never amounts.
      // Admin overdue copies carry the amount for follow-up.
      const buyerMessage = isDue
        ? `Installment ${installment.installmentNumber} of NPR ${Number(installment.amount).toLocaleString()} for "${propertyTitle}" is due on ${formatDate(installment.dueDate)}.`
        : `Installment ${installment.installmentNumber} of NPR ${Number(installment.amount).toLocaleString()} for "${propertyTitle}" was due on ${formatDate(installment.dueDate)}.`;
      const agentMessage = isDue
        ? `Installment ${installment.installmentNumber} for "${propertyTitle}" is due on ${formatDate(installment.dueDate)}.`
        : `Installment ${installment.installmentNumber} for "${propertyTitle}" was due on ${formatDate(installment.dueDate)}.`;
      const type = isDue ? 'emi_installment_due' : 'emi_installment_overdue';
      const propertyId = plan.property && plan.property._id ? plan.property._id : plan.property;

      const recipients = [
        // Buyer is a normal user - no agent dashboard link; bell opens the buyer's own EMI page
        {
          recipient: plan.buyer,
          title: isDue ? 'Your EMI installment is due soon' : 'Your EMI installment is overdue',
          message: buyerMessage,
          link: '/my-emi',
        },
        {
          recipient: plan.agent,
          title: isDue ? 'EMI installment due soon' : 'EMI installment overdue',
          message: agentMessage,
          link: '/dashboard/agent/emi-sales',
        },
      ];

      if (!isDue) {
        for (const adminId of adminIds) {
          recipients.push({
            recipient: adminId,
            title: 'EMI installment overdue',
            message: `Installment ${installment.installmentNumber} of NPR ${Number(installment.amount).toLocaleString()} for "${propertyTitle}" was due on ${formatDate(installment.dueDate)} (buyer follow-up needed).`,
            link: `/dashboard/admin/emi-plans/${plan._id}`,
          });
        }
      }

      for (const { recipient, title, message, link } of recipients) {
        if (!recipient) continue; // eslint-disable-line no-continue
        if (await alreadySentToday(recipient, type, plan._id)) continue; // eslint-disable-line no-continue
        const doc = await notify({
          recipient,
          type,
          title,
          message,
          emiPlan: plan._id,
          property: propertyId,
          link,
        });
        if (doc) created += 1;
      }
    };

    // FINAL escalation guard: same type as the admin daily, so dedup is
    // scoped by the FINAL title - otherwise the already-sent daily would
    // swallow the escalation (or vice versa on re-runs).
    const escalationSentToday = async (recipient, planId) =>
      Notification.exists({
        recipient,
        type: 'emi_installment_overdue',
        emiPlan: planId,
        title: /^FINAL:/,
        createdAt: { $gte: today },
      });

    const escalate = async ({ plan, installment }) => {
      const propertyTitle = plan.property && plan.property.title ? plan.property.title : 'your property';
      const propertyId = plan.property && plan.property._id ? plan.property._id : plan.property;
      for (const adminId of adminIds) {
        if (!adminId) continue; // eslint-disable-line no-continue
        if (await escalationSentToday(adminId, plan._id)) continue; // eslint-disable-line no-continue
        const doc = await notify({
          recipient: adminId,
          type: 'emi_installment_overdue',
          title: `FINAL: installment ${installment.installmentNumber} 7 days overdue`,
          message: `Installment ${installment.installmentNumber} of NPR ${Number(installment.amount).toLocaleString()} for "${propertyTitle}" is 7 days overdue (was due ${formatDate(installment.dueDate)}) - requires action.`,
          emiPlan: plan._id,
          property: propertyId,
          link: `/dashboard/admin/emi-plans/${plan._id}`,
        });
        if (doc) created += 1;
      }
    };

    for (const plan of dueSoonPlans) {
      for (const installment of plan.installments || []) {
        if (installment.status !== 'pending' || !installment.dueDate) continue; // eslint-disable-line no-continue
        const due = new Date(installment.dueDate);
        if (due >= today && due <= in3DaysEnd) {
          await remind({ plan, installment, kind: 'due' });
        }
      }
    }

    for (const plan of overduePlans) {
      for (const installment of plan.installments || []) {
        if (installment.status !== 'pending' || !installment.dueDate) continue; // eslint-disable-line no-continue
        const due = new Date(installment.dueDate);
        if (due >= weekAgo && due < today) {
          await remind({ plan, installment, kind: 'overdue' });
          // Day-7 FINAL escalation, admins only: fires on exactly the 7th
          // calendar day overdue (later days are silent, so at most one
          // escalation day exists). Title-scoped dedup keeps it distinct
          // from the admin daily, which shares the same type.
          const dueDay = new Date(due);
          dueDay.setHours(0, 0, 0, 0);
          const daysOverdue = Math.round((today - dueDay) / 86400000);
          if (daysOverdue === 7) {
            await escalate({ plan, installment });
          }
        }
      }
    }

    return {
      dueSoonPlans: dueSoonPlans.length,
      overduePlans: overduePlans.length,
      notificationsCreated: created,
    };
  } catch (err) {
    // Never throw - the scheduler only logs
    console.error('EMI reminder job failed:', err.message);
    return null;
  }
};

module.exports = { runEmiReminders };

/**
 * EMI reminder job (Spec v2 - Feature 3)
 *
 * Run daily by the node-cron scheduler in server.js:
 *   - "due soon": pending installments due today .. today+3 days
 *   - "overdue":  pending installments whose dueDate is before today
 *
 * For every matching installment BOTH the buyer and the managing agent get a
 * notification. Dedup is manual (the notify helper doesn't dedup): at most one
 * notification per (recipient, type, plan) per calendar day, so re-runs and
 * retries never spam the bell.
 *
 * The whole run is wrapped in try/catch and never throws - a failed reminder
 * sweep must never take the process down.
 */

const EMIPlan = require('../models/EMIPlan');
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

    const [dueSoonPlans, overduePlans] = await Promise.all([
      EMIPlan.find({
        status: 'active',
        installments: { $elemMatch: { status: 'pending', dueDate: { $gte: today, $lte: in3DaysEnd } } },
      }).populate('property', 'title'),
      EMIPlan.find({
        status: 'active',
        installments: { $elemMatch: { status: 'pending', dueDate: { $lt: today } } },
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

    const remind = async ({ plan, installment, kind }) => {
      const isDue = kind === 'due';
      const propertyTitle = plan.property && plan.property.title ? plan.property.title : 'your property';
      const message = isDue
        ? `Installment ${installment.installmentNumber} of NPR ${Number(installment.amount).toLocaleString()} for "${propertyTitle}" is due on ${formatDate(installment.dueDate)}.`
        : `Installment ${installment.installmentNumber} of NPR ${Number(installment.amount).toLocaleString()} for "${propertyTitle}" was due on ${formatDate(installment.dueDate)}.`;
      const type = isDue ? 'emi_installment_due' : 'emi_installment_overdue';
      const propertyId = plan.property && plan.property._id ? plan.property._id : plan.property;

      const recipients = [
        // Buyer is a normal user - no agent dashboard link; bell opens nothing special
        { recipient: plan.buyer, title: isDue ? 'Your EMI installment is due soon' : 'Your EMI installment is overdue', link: '' },
        { recipient: plan.agent, title: isDue ? 'EMI installment due soon' : 'EMI installment overdue', link: '/dashboard/agent/emi-plans' },
      ];

      for (const { recipient, title, link } of recipients) {
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
        if (new Date(installment.dueDate) < today) {
          await remind({ plan, installment, kind: 'overdue' });
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

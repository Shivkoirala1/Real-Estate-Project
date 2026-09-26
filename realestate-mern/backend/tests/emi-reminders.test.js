// EMI reminder job: 3-day pre-due stays buyer+agent; overdue fans out to
// buyer+agent+admins with daily dedup.
// Run: node --test tests/emi-reminders.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Property = require('../models/Property');
const EMIPlan = require('../models/EMIPlan');
const Notification = require('../models/Notification');
const { PropertyType } = require('../models/Category');
const { runEmiReminders } = require('../utils/emiReminders');

describe('EMI reminder job', () => {
  let mongod;
  let admin;
  let agent;
  let buyer;
  let property;

  const daysFromNow = (n, h = 12) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    d.setHours(h, 0, 0, 0);
    return d;
  };

  let seq = 0;
  const mkPlan = (dueOffsetDays, over = {}) => {
    seq += 1;
    return EMIPlan.create({
      sale: new mongoose.Types.ObjectId(),
      property: property._id,
      buyer: buyer._id,
      agent: agent._id,
      principalAmount: 900000,
      tenureMonths: 9,
      installmentAmount: 100000,
      startDate: new Date(),
      status: 'active',
      installments: [
        {
          installmentNumber: 1,
          dueDate: daysFromNow(dueOffsetDays),
          amount: 100000,
          status: 'pending',
        },
      ],
      ...over,
    });
  };
  const notesFor = (planId, type) => Notification.find({ emiPlan: planId, type });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    [admin, agent, buyer] = await Promise.all([
      User.create({ name: 'ER Admin', email: 'er-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'ER Agent', email: 'er-agent@test.com', password: 'password1', role: 'agent' }),
      User.create({ name: 'ER Buyer', email: `er-buyer-${Date.now()}@test.com`, password: 'password1', role: 'user' }),
    ]);
    const ptype = await PropertyType.create({ name: 'ER House', category: 'building' });
    property = await Property.create({
      title: 'ER House', description: 'Reminder fixture.', propertyType: ptype._id,
      price: 5000000, saleType: 'sale',
      location: { province: 'Bagmati', district: 'Kathmandu' }, listedBy: admin._id,
    });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('pre-due (2 days) notifies buyer+agent only - no admin', async () => {
    const plan = await mkPlan(2);
    const out = await runEmiReminders();
    assert.ok(out && out.notificationsCreated >= 2);

    const dues = await notesFor(plan._id, 'emi_installment_due');
    const recipients = dues.map((n) => String(n.recipient));
    assert.ok(recipients.includes(String(buyer._id)), 'buyer missing');
    assert.ok(recipients.includes(String(agent._id)), 'agent missing');
    assert.ok(!recipients.includes(String(admin._id)), 'admin must not get pre-due');

    const agentNote = dues.find((n) => String(n.recipient) === String(agent._id));
    assert.ok(!/100,000/.test(agentNote.message), 'agent copy leaks amount');
  });

  it('due in 6+ days notifies nobody', async () => {
    const plan = await mkPlan(6);
    await runEmiReminders();
    assert.equal((await notesFor(plan._id, 'emi_installment_due')).length, 0);
    assert.equal((await notesFor(plan._id, 'emi_installment_overdue')).length, 0);
  });

  it('overdue notifies buyer+agent+admin with correct copies', async () => {
    const plan = await mkPlan(-1);
    await runEmiReminders();

    const overdues = await notesFor(plan._id, 'emi_installment_overdue');
    const byRecipient = new Map(overdues.map((n) => [String(n.recipient), n]));
    assert.ok(byRecipient.has(String(buyer._id)), 'buyer missing');
    assert.ok(byRecipient.has(String(agent._id)), 'agent missing');
    assert.ok(byRecipient.has(String(admin._id)), 'admin missing');

    assert.ok(/100,000/.test(byRecipient.get(String(buyer._id)).message), 'buyer copy needs amount');
    assert.ok(!/100,000/.test(byRecipient.get(String(agent._id)).message), 'agent copy leaks amount');
    const adminNote = byRecipient.get(String(admin._id));
    assert.ok(/100,000/.test(adminNote.message), 'admin copy needs amount');
    assert.equal(adminNote.link, `/dashboard/admin/emi-plans/${plan._id}`);
  });

  it('day-6 overdue sends dailies with no escalation', async () => {
    const plan = await mkPlan(-6);
    await runEmiReminders();
    const overdues = await notesFor(plan._id, 'emi_installment_overdue');
    assert.equal(overdues.length, 3);
    assert.ok(!overdues.some((n) => /^FINAL:/.test(n.title)), 'no FINAL before day 7');
  });

  it('day-7 overdue sends dailies plus one admin FINAL escalation', async () => {
    const plan = await mkPlan(-7);
    await runEmiReminders();
    const overdues = await notesFor(plan._id, 'emi_installment_overdue');
    assert.equal(overdues.length, 4);
    const finals = overdues.filter((n) => /^FINAL:/.test(n.title));
    assert.equal(finals.length, 1);
    assert.equal(String(finals[0].recipient), String(admin._id));
    assert.ok(/requires action/.test(finals[0].message));
  });

  it('day-8+ overdue goes silent (cap)', async () => {
    const plan = await mkPlan(-8);
    const out = await runEmiReminders();
    assert.equal((await notesFor(plan._id, 'emi_installment_overdue')).length, 0);
    assert.ok(out);
  });

  it('escalation never repeats on re-runs', async () => {
    const plan = await mkPlan(-7);
    await runEmiReminders();
    await runEmiReminders();
    const finals = (await notesFor(plan._id, 'emi_installment_overdue')).filter((n) => /^FINAL:/.test(n.title));
    assert.equal(finals.length, 1);
  });

  it('paid installments and inactive plans are skipped', async () => {
    const paid = await mkPlan(-5, {
      installments: [{ installmentNumber: 1, dueDate: daysFromNow(-5), amount: 100000, status: 'paid', paidDate: new Date() }],
    });
    const inactive = await mkPlan(-5, { status: 'defaulted' });
    await runEmiReminders();
    assert.equal((await notesFor(paid._id, 'emi_installment_overdue')).length, 0);
    assert.equal((await notesFor(inactive._id, 'emi_installment_overdue')).length, 0);
  });

  it('re-running same day creates nothing (dedup)', async () => {
    const plan = await mkPlan(-2);
    await runEmiReminders();
    const first = await notesFor(plan._id, 'emi_installment_overdue');
    assert.equal(first.length, 3);
    const out = await runEmiReminders();
    assert.equal(out.notificationsCreated, 0);
    assert.equal((await notesFor(plan._id, 'emi_installment_overdue')).length, 3);
  });
});

// One-time data migration: moves the legacy inquiry-based system onto the
// unified lead management module.
//
// What it does:
//   1. Copies every document in the legacy `inquiries` collection into
//      - a ContactForm (raw submission record),
//      - a Lead (pipeline record, source: 'contact_form'),
//      - a Conversation (when the inquiry had reply messages).
//      All three are cross-linked (lead.contactForm / contactForm.convertedLead /
//      lead.conversationThreads).
//   2. Normalizes any existing Lead documents that still carry the legacy
//      capitalized stage values ('New', 'Site Visit Scheduled', ...) onto the
//      canonical lowercase pipeline stages.
//
// The script is idempotent: inquiries that were already migrated are skipped
// (matched by email + createdAt), and legacy stage values only exist once.
//
// Usage:  npm run migrate:leads       (or: node utils/migrateInquiriesToLeads.js)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Lead = require('../models/Lead');
const ContactForm = require('../models/ContactForm');
const Conversation = require('../models/Conversation');

// Minimal stand-in for the retired Inquiry model - just enough to read the
// legacy collection without resurrecting the old code.
const legacyInquirySchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    subject: String,
    message: String,
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: String,
    stage: String,
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    response: String,
    respondedAt: Date,
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
    messages: [
      {
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        senderName: String,
        side: String,
        body: String,
        createdAt: Date,
      },
    ],
  },
  { collection: 'inquiries', strict: false }
);
const LegacyInquiry = mongoose.models.LegacyInquiry || mongoose.model('LegacyInquiry', legacyInquirySchema);

// Legacy status -> canonical pipeline stage (matches the migration strategy doc)
const mapStatusToStage = (status) => {
  const mapping = {
    new: 'new',
    read: 'contacted',
    responded: 'contacted',
  };
  return mapping[status] || 'new';
};

const migrateInquiries = async () => {
  const inquiries = await LegacyInquiry.find().lean();
  console.log(`Found ${inquiries.length} legacy inquiry document(s).`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const inquiry of inquiries) {
    try {
      // Skip anything already converted (re-runs / partial failures)
      const alreadyMigrated = await Lead.findOne({
        email: (inquiry.email || '').toLowerCase(),
        createdAt: inquiry.createdAt,
        source: 'contact_form',
      });
      if (alreadyMigrated) {
        skipped += 1;
        continue;
      }

      // 1) ContactForm record
      const contactForm = await ContactForm.create({
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone || '',
        subject: inquiry.subject || 'General Inquiry',
        message: inquiry.message,
        property: inquiry.property || null,
        user: inquiry.user || null,
        status: 'converted',
        response: inquiry.response || '',
        respondedAt: inquiry.respondedAt || null,
        respondedBy: inquiry.respondedBy || null,
        createdAt: inquiry.createdAt,
        updatedAt: inquiry.updatedAt,
      });

      // 2) Lead record
      const lead = new Lead({
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone || '',
        source: 'contact_form',
        contactForm: contactForm._id,
        visit: inquiry.visitId || null,
        property: inquiry.property || null,
        user: inquiry.user || null,
        stage: mapStatusToStage(inquiry.status),
        category: 'property',
        priority: 'medium',
        assignedAgent: inquiry.respondedBy || inquiry.assignedAgent || null,
        notes: `Migrated from legacy inquiry. Original status: ${inquiry.status || 'new'}.`,
        createdAt: inquiry.createdAt,
        updatedAt: inquiry.updatedAt,
      });
      lead.recordActivity({
        type: 'created',
        message: 'Migrated from legacy inquiry system',
        byName: 'Migration',
      });
      await lead.save();

      contactForm.convertedLead = lead._id;
      await contactForm.save();

      // 3) Conversation thread from reply history
      if (Array.isArray(inquiry.messages) && inquiry.messages.length > 0) {
        const conversation = await Conversation.create({
          lead: lead._id,
          inquirer: inquiry.user || null,
          owner: inquiry.respondedBy || inquiry.assignedAgent || inquiry.respondedBy,
          property: inquiry.property || null,
          messages: inquiry.messages.map((m) => ({
            sender: m.sender || null,
            senderName: m.senderName || inquiry.name,
            side: m.side === 'owner' ? 'owner' : 'inquirer',
            body: m.body,
            createdAt: m.createdAt || new Date(),
          })),
          lastMessageAt:
            inquiry.messages.length > 0
              ? new Date(Math.max(...inquiry.messages.map((m) => new Date(m.createdAt || 0).getTime())))
              : inquiry.updatedAt,
          isActive: true,
          createdAt: inquiry.createdAt,
          updatedAt: inquiry.updatedAt,
        });

        lead.conversationThreads.push(conversation._id);
        await lead.save();
      }

      migrated += 1;
      console.log(`  ✓ Migrated inquiry ${inquiry._id}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ Failed to migrate inquiry ${inquiry._id}: ${err.message}`);
    }
  }

  console.log('--------------------------------------------------');
  console.log(`Inquiry migration done: ${migrated} migrated, ${skipped} skipped (already done), ${failed} failed.`);
};

// 2) Normalize legacy capitalized stages on existing leads
const normalizeLeadStages = async () => {
  const legacyMap = [
    { from: 'New', to: 'new' },
    { from: 'Contacted', to: 'contacted' },
    { from: 'Site Visit Scheduled', to: 'site_visit_scheduled' },
    { from: 'Office Visit Scheduled', to: 'site_visit_scheduled' },
    { from: 'Negotiation', to: 'negotiation' },
    { from: 'Closed', to: 'closed' },
    { from: 'Lost', to: 'lost' },
  ];

  let total = 0;
  for (const { from, to } of legacyMap) {
    const result = await Lead.updateMany({ stage: from }, { $set: { stage: to } });
    total += result.modifiedCount;
  }
  console.log(`Normalized ${total} lead document(s) from legacy stage values.`);
};

const run = async () => {
  await connectDB();
  await normalizeLeadStages();
  await migrateInquiries();
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

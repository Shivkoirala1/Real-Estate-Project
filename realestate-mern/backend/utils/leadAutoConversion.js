const Lead = require('../models/Lead');
const Conversation = require('../models/Conversation');
const Property = require('../models/Property');
const User = require('../models/User');
const { notify } = require('./notify');

/**
 * Smart lead auto-conversion service
 * ==================================
 * Shared by three entry points so conversion behaves identically everywhere:
 *
 *   1. createContactForm            (automatic, on every public submission)
 *   2. createVisit                  (automatic, on every visit request)
 *   3. convertContactFormToLead /   (manual one-click, with admin overrides)
 *      convertVisitToLead
 *
 * Guarantees:
 *   - Every contact form submission and visit request ends up represented in
 *     the unified lead pipeline - no lead is ever lost in an inbox.
 *   - Smart de-duplication: if an ACTIVE lead (not closed/lost) already exists
 *     for the same person (matched by email, phone, or registered account),
 *     the new submission/visit is LINKED onto that lead and its unified
 *     conversation thread instead of creating a duplicate.
 *   - A unified Conversation thread is seeded automatically with the original
 *     message whenever the person is a registered user, so admins/agents can
 *     simply open the lead and reply.
 *   - Conversion failures never break the primary flow (callers wrap in
 *     try/catch - a contact form must always save even if conversion hiccups).
 */

// Stages that count as "still in play" for de-duplication. Leads that were
// closed or lost are excluded so a returning customer starts fresh.
const ACTIVE_STAGES = ['new', 'contacted', 'site_visit_scheduled', 'negotiation'];

const preview = (text, max = 100) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
};

const idOf = (doc) => (doc && doc._id ? doc._id : doc || null);

/**
 * Find the active lead that already represents this person.
 * Match priority: registered account > email > phone.
 */
const findActiveLeadForContact = async ({ email, phone, userId }) => {
  const or = [];
  const uid = idOf(userId);
  if (uid) or.push({ user: uid });
  if (email) or.push({ email: String(email).trim().toLowerCase() });
  if (phone) or.push({ phone: String(phone).trim() });
  if (!or.length) return null;

  return Lead.findOne({ $or: or, stage: { $in: ACTIVE_STAGES } }).sort({ lastActivity: -1 });
};

/**
 * Resolve who should own the conversation thread on the company side.
 * Priority: explicitly assigned agent > property listing owner > first admin.
 * Candidates that match `excludeUserId` (the inquirer) are skipped - nobody
 * should be handed a conversation with themselves.
 * Returns null when no candidate user exists (thread is then skipped).
 */
const resolveThreadOwner = async ({ assignedAgent, propertyDoc, excludeUserId }) => {
  const excluded = String(idOf(excludeUserId) || '');
  const isExcluded = (candidate) => excluded && String(candidate) === excluded;

  const candidates = [idOf(assignedAgent), idOf(propertyDoc && propertyDoc.listedBy)].filter(
    (c) => c && !isExcluded(c)
  );

  for (const candidate of candidates) {
    const user = await User.findById(candidate).select('_id name role');
    if (user) return user;
  }

  const admin = await User.findOne({ role: 'admin' }).select('_id name role').sort({ createdAt: 1 });
  return admin && !isExcluded(admin._id) ? admin : null;
};

/**
 * Open a unified conversation thread for a lead and seed it with the original
 * message. Only possible when the person is a registered user (the thread
 * needs an inquirer account to deliver to).
 */
const seedLeadConversation = async ({
  lead,
  inquirerUser,
  ownerUserId,
  propertyId,
  propertyDoc,
  messageBody,
  senderName,
  messageCreatedAt,
  sourceLabel,
  actor = null,
}) => {
  const inquirerId = idOf(inquirerUser);
  if (!inquirerId || !messageBody) return null;

  const owner = await resolveThreadOwner({
    assignedAgent: ownerUserId,
    propertyDoc,
    excludeUserId: inquirerId,
  });
  if (!owner) return null;

  const conversation = await Conversation.create({
    lead: lead._id,
    inquirer: inquirerId,
    owner: owner._id,
    property: idOf(propertyId) || null,
    messages: [
      {
        sender: inquirerId,
        senderName: senderName || lead.name,
        side: 'inquirer',
        body: messageBody,
      },
    ],
    lastMessageAt: messageCreatedAt || new Date(),
    isActive: true,
  });

  lead.conversationThreads.addToSet(conversation._id);
  lead.recordActivity({
    type: 'conversation_message',
    message: `Unified conversation thread opened and seeded with the original ${sourceLabel}`,
    by: actor ? actor._id : null,
    byName: actor ? actor.name : 'Auto-conversion',
  });
  await lead.save();

  // Give the thread owner a heads-up that a conversation is waiting
  await notify({
    recipient: owner._id,
    type: 'conversation_message',
    title: 'New lead conversation started',
    message: `${senderName || lead.name}: "${preview(messageBody, 80)}"`,
    lead: lead._id,
    conversation: conversation._id,
    link: '/dashboard/agent/leads',
  });

  return conversation;
};

/**
 * Append a new inbound message (repeat submission / visit notes) onto the
 * lead's most recent active thread, keeping ONE unified thread per lead.
 */
const appendToLeadThread = async (lead, { senderUserId, senderName, body, createdAt }) => {
  const senderId = idOf(senderUserId);
  if (!senderId || !body || !lead.conversationThreads || lead.conversationThreads.length === 0) {
    return null;
  }

  const conversation = await Conversation.findOne({
    _id: { $in: lead.conversationThreads },
    isActive: true,
  }).sort({ lastMessageAt: -1 });

  if (!conversation) return null;

  conversation.messages.push({
    sender: senderId,
    senderName: senderName || lead.name,
    side: 'inquirer',
    body,
  });
  conversation.lastMessageAt = createdAt || new Date();
  await conversation.save();

  lead.recordActivity({
    type: 'conversation_message',
    message: `Message added to unified thread: "${preview(body, 80)}"`,
    byName: 'Auto-conversion',
  });
  await lead.save();

  return conversation;
};

/**
 * Mark a contact form as converted and cross-link it with its lead.
 */
const markContactFormConverted = async (contactForm, leadId) => {
  contactForm.status = 'converted';
  contactForm.convertedLead = leadId;
  await contactForm.save();
};

/**
 * Ensure a contact form submission is represented in the pipeline.
 *
 * @param {Object}  params
 * @param {Object}  params.contactForm  the ContactForm document (required)
 * @param {Object}  params.actor        acting User (admin) or null for system/auto
 * @param {Object}  params.overrides    manual conversion options:
 *     { category, priority, assignedAgent, notes, property }
 * @returns {{ lead, conversation|null, created, deduped }}
 */
const ensureLeadFromContactForm = async ({ contactForm, actor = null, overrides = {} }) => {
  // Already converted earlier - return the existing lead untouched.
  if (contactForm.convertedLead) {
    const existing = await Lead.findById(contactForm.convertedLead);
    if (existing) {
      return { lead: existing, conversation: null, created: false, deduped: true };
    }
  }

  const propertyId = overrides.property || idOf(contactForm.property) || null;
  let propertyDoc = null;
  if (propertyId) {
    propertyDoc = await Property.findById(propertyId).select('title listedBy');
  }

  const actorName = actor ? actor.name : 'Auto-conversion';

  // ---------- SMART DEDUP: link repeat submissions onto the active lead ----------
  const existingLead = await findActiveLeadForContact({
    email: contactForm.email,
    phone: contactForm.phone,
    userId: contactForm.user,
  });

  if (existingLead) {
    if (!existingLead.contactForm) existingLead.contactForm = contactForm._id;
    if (!existingLead.user && contactForm.user) existingLead.user = idOf(contactForm.user);
    if (!existingLead.property && propertyId) existingLead.property = propertyId;
    existingLead.recordActivity({
      type: 'updated',
      message: `Repeat contact form "${contactForm.subject}" auto-linked: "${preview(contactForm.message)}"`,
      by: actor ? actor._id : null,
      byName: actorName,
    });
    await existingLead.save();

    await markContactFormConverted(contactForm, existingLead._id);

    const conversation = await appendToLeadThread(existingLead, {
      senderUserId: idOf(contactForm.user),
      senderName: contactForm.name,
      body: contactForm.message,
      createdAt: contactForm.createdAt,
    });

    return { lead: existingLead, conversation, created: false, deduped: true };
  }

  // ---------- NEW LEAD ----------
  const lead = new Lead({
    name: contactForm.name,
    email: contactForm.email,
    phone: contactForm.phone || '',
    source: 'contact_form',
    contactForm: contactForm._id,
    user: idOf(contactForm.user) || null,
    property: propertyId,
    assignedAgent: overrides.assignedAgent || null,
    category: overrides.category || 'property',
    priority: overrides.priority || 'medium',
    stage: 'new',
    notes: overrides.notes
      ? `Converted from contact form: ${overrides.notes}`
      : `Converted from contact form: "${contactForm.subject}"`,
  });
  lead.recordActivity({
    type: 'converted',
    message: `Lead ${overrides._manual ? 'created' : 'auto-created'} from contact form "${contactForm.subject}"`,
    by: actor ? actor._id : null,
    byName: actorName,
  });
  await lead.save();

  await markContactFormConverted(contactForm, lead._id);

  // Seed the unified conversation thread (registered senders only)
  const conversation = await seedLeadConversation({
    lead,
    inquirerUser: contactForm.user,
    ownerUserId: lead.assignedAgent,
    propertyId,
    propertyDoc,
    messageBody: contactForm.message,
    senderName: contactForm.name,
    messageCreatedAt: contactForm.createdAt,
    sourceLabel: 'contact form message',
    actor,
  });

  // Notify the assigned agent (if any) that they own this lead now
  if (lead.assignedAgent) {
    await notify({
      recipient: lead.assignedAgent,
      type: 'lead_assigned',
      title: 'New Lead Assigned to You',
      message: `Lead "${lead.name}" (from a contact form) has been assigned to you`,
      lead: lead._id,
      link: '/dashboard/agent/leads',
    });
  }

  return { lead, conversation, created: true, deduped: false };
};

/**
 * Ensure a visit request is represented in the pipeline.
 *
 * @param {Object}  params
 * @param {Object}  params.visit    the Visit document (requestedBy/property may
 *                                      be raw ObjectIds - they get populated)
 * @param {Object}  params.actor    acting User (admin) or null for system/auto
 * @param {Object}  params.overrides manual conversion options:
 *     { category, priority, assignedAgent, notes, stage }
 * @returns {{ lead, conversation|null, created, deduped }}
 */
const ensureLeadFromVisit = async ({ visit, actor = null, overrides = {} }) => {
  // Already converted earlier - return the existing lead untouched.
  const alreadyConverted = visit.convertedLead || (await Lead.findOne({ visit: visit._id }).select('_id'));
  if (alreadyConverted) {
    const existing = await Lead.findById(idOf(alreadyConverted));
    if (existing) {
      if (!visit.convertedLead) {
        visit.convertedLead = existing._id;
        await visit.save();
      }
      return { lead: existing, conversation: null, created: false, deduped: true };
    }
  }

  // Make sure we have the requester's contact details and the property title
  if (!visit.populated('requestedBy')) await visit.populate('requestedBy', 'name email phone');
  let propertyDoc = null;
  if (visit.property) {
    if (!visit.populated('property')) await visit.populate('property', 'title listedBy');
    propertyDoc = visit.property;
  }

  const requester = visit.requestedBy;
  const actorName = actor ? actor.name : 'Auto-conversion';
  const visitLabel = visit.visitType === 'office' ? 'office consultation' : 'site visit';
  const slotLabel = new Date(visit.requestedSlot).toLocaleString();

  // ---------- SMART DEDUP: prefer this buyer's lead for the same property ----------
  let existingLead = null;
  if (visit.property && requester) {
    existingLead = await Lead.findOne({
      user: idOf(requester),
      property: idOf(visit.property),
      stage: { $in: ACTIVE_STAGES },
    }).sort({ lastActivity: -1 });
  }
  if (!existingLead && requester) {
    existingLead = await findActiveLeadForContact({
      email: requester.email,
      phone: requester.phone,
      userId: idOf(requester),
    });
  }

  if (existingLead) {
    existingLead.visit = visit._id;
    if (!existingLead.property && visit.property) existingLead.property = idOf(visit.property);
    if (['new', 'contacted'].includes(existingLead.stage)) {
      existingLead.stage = 'site_visit_scheduled';
    }
    existingLead.recordActivity({
      type: 'stage_changed',
      message: `${visitLabel.charAt(0).toUpperCase() + visitLabel.slice(1)} auto-linked - scheduled for ${slotLabel}`,
      by: actor ? actor._id : null,
      byName: actorName,
    });
    await existingLead.save();

    visit.convertedLead = existingLead._id;
    await visit.save();

    const conversation = await appendToLeadThread(existingLead, {
      senderUserId: idOf(requester),
      senderName: requester ? requester.name : undefined,
      body:
        visit.buyerNotes ||
        `${requester ? requester.name : 'The buyer'} requested a ${visitLabel} for ${slotLabel}${
          propertyDoc ? ` at "${propertyDoc.title}"` : ''
        }.`,
      createdAt: visit.createdAt,
    });

    return { lead: existingLead, conversation, created: false, deduped: true };
  }

  // ---------- NEW LEAD ----------
  const source = visit.visitType === 'office' ? 'office_visit' : 'property_visit';
  const assignedAgent = overrides.assignedAgent || idOf(visit.assignedAgent) || null;

  const lead = new Lead({
    name: requester ? requester.name : 'Unknown visitor',
    email: requester ? requester.email : 'unknown@visit.local',
    phone: requester ? requester.phone || '' : '',
    source,
    visit: visit._id,
    property: idOf(visit.property) || null,
    user: idOf(requester) || null,
    assignedAgent,
    category: overrides.category || 'property',
    priority: overrides.priority || 'high',
    stage: overrides.stage
      ? Lead.normalizeStage(overrides.stage) || 'site_visit_scheduled'
      : 'site_visit_scheduled',
    notes: overrides.notes
      ? `Converted from ${visitLabel}: ${overrides.notes}`
      : `Auto-created from ${visitLabel} scheduled for ${slotLabel}`,
  });
  lead.recordActivity({
    type: 'converted',
    message: `Lead ${overrides._manual ? 'created' : 'auto-created'} from ${visitLabel} scheduled for ${slotLabel}`,
    by: actor ? actor._id : null,
    byName: actorName,
  });
  await lead.save();

  visit.convertedLead = lead._id;
  await visit.save();

  // Seed the unified conversation thread with the visit request summary
  const conversation = await seedLeadConversation({
    lead,
    inquirerUser: requester,
    ownerUserId: assignedAgent,
    propertyId: idOf(visit.property),
    propertyDoc,
    messageBody:
      visit.buyerNotes ||
      `${requester ? requester.name : 'The buyer'} requested a ${visitLabel} for ${slotLabel}${
        propertyDoc ? ` at "${propertyDoc.title}"` : ''
      }.`,
    senderName: requester ? requester.name : undefined,
    messageCreatedAt: visit.createdAt,
    sourceLabel: `${visitLabel} request`,
    actor,
  });

  if (assignedAgent) {
    await notify({
      recipient: assignedAgent,
      type: 'lead_assigned',
      title: 'New Lead Assigned to You',
      message: `Lead "${lead.name}" (from a ${visitLabel} request) has been assigned to you`,
      lead: lead._id,
      link: '/dashboard/agent/leads',
    });
  }

  return { lead, conversation, created: true, deduped: false };
};

module.exports = {
  ensureLeadFromContactForm,
  ensureLeadFromVisit,
  findActiveLeadForContact,
  resolveThreadOwner,
};

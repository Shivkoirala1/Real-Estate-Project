const Lead = require('../models/Lead');
const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');

const LEAD_STAGES = Lead.STAGES;
const LEAD_SOURCES = Lead.SOURCES;

// ---------- helpers ----------

// Agents only ever see leads assigned to them; admins see everything.
const scopeQueryForRole = (query, user) => {
  if (user.role !== 'admin') {
    query.assignedAgent = user._id;
  }
  return query;
};

const buildLeadQuery = ({ stage, category, assignedAgent, priority, source, search, nextFollowUp }) => {
  const query = {};

  if (stage) {
    const normalized = Lead.normalizeStage(stage);
    if (!normalized) return { invalid: true };
    query.stage = normalized;
  }
  if (category) query.category = category;
  if (priority) query.priority = priority;
  if (source) {
    if (!LEAD_SOURCES.includes(source)) return { invalid: true };
    query.source = source;
  }
  if (assignedAgent) {
    // Support the explicit 'unassigned' pool (leads nobody owns yet)
    query.assignedAgent = assignedAgent === 'unassigned' ? null : assignedAgent;
  }
  if (nextFollowUp === 'overdue') {
    query.nextFollowUp = { $ne: null, $lt: new Date() };
    query.stage = query.stage || { $nin: ['closed', 'lost'] };
  }
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }
  return { query };
};

const populateLead = (query) =>
  query
    .populate('assignedAgent', 'name email phone')
    .populate('property', 'title slug media.coverImage price status')
    .populate('contactForm', 'name email subject status createdAt')
    .populate('visit', 'visitType requestedSlot status')
    .populate('user', 'name email');

const LEAD_POPULATE = [
  { path: 'assignedAgent', select: 'name email phone' },
  { path: 'property', select: 'title slug media.coverImage price status' },
  { path: 'contactForm', select: 'name email subject status createdAt' },
  { path: 'visit', select: 'visitType requestedSlot status' },
  { path: 'user', select: 'name email' },
];

// Authorization: admins and the assigned agent may touch a lead.
// NOTE: assignedAgent may be a populated Document OR a raw ObjectId depending
// on the query - compare the _id in both cases (String() on a populated doc
// returns the whole JSON object, not the id, which broke agent access).
const canManage = (lead, user) =>
  user.role === 'admin' ||
  Boolean(lead.assignedAgent && String(lead.assignedAgent._id ?? lead.assignedAgent) === String(user._id));

/**
 * @desc    Create a lead (manual creation by admin/agent team)
 * @route   POST /api/leads
 * @access  Private (admin/agent)
 */
const createLead = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    category,
    property,
    assignedAgent,
    notes,
    priority,
    nextFollowUp,
    source = 'manual_create',
  } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: 'Name and email are required',
    });
  }

  if (category && !['property', 'account', 'billing', 'technical'].includes(category)) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  if (priority && !['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ success: false, message: 'Invalid priority' });
  }

  if (!LEAD_SOURCES.includes(source)) {
    return res.status(400).json({ success: false, message: 'Invalid lead source' });
  }

  // Verify agent exists if one was chosen (leads can also sit unassigned)
  let agentDoc = null;
  if (assignedAgent) {
    agentDoc = await User.findById(assignedAgent);
    if (!agentDoc) {
      return res.status(404).json({ success: false, message: 'Assigned agent not found' });
    }
  }

  // Verify property exists if provided
  let propertyDoc = null;
  if (property) {
    propertyDoc = await Property.findById(property).select('title');
    if (!propertyDoc) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
  }

  const lead = new Lead({
    name,
    email,
    phone: phone || '',
    category: category || 'property',
    property: property || null,
    assignedAgent: assignedAgent || null,
    notes: notes || '',
    priority: priority || 'medium',
    nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
    source,
    stage: 'new',
  });
  lead.recordActivity({
    type: 'created',
    message: agentDoc
      ? `Lead created manually and assigned to ${agentDoc.name}`
      : 'Lead created manually (unassigned)',
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();

  await lead.populate(LEAD_POPULATE);

  // Notify the assigned agent (if any) and other admins
  if (agentDoc) {
    await notify({
      recipient: agentDoc._id,
      type: 'lead_assigned',
      title: 'New Lead Assigned to You',
      message: `A new lead "${lead.name}" has been assigned to you`,
      lead: lead._id,
      link: '/dashboard/agent/leads',
    });
  }
  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'lead_created',
      title: 'New lead in pipeline',
      message: `${req.user.name} created lead "${lead.name}"`,
      lead: lead._id,
      link: '/dashboard/admin/lead-management',
    }
  );

  res.status(201).json({
    success: true,
    message: 'Lead created successfully',
    lead,
  });
});

/**
 * @desc    Get leads with filtering, search, pagination (+ stage counts)
 * @route   GET /api/leads
 * @access  Private (admin sees all, agent sees own)
 */
const getLeads = asyncHandler(async (req, res) => {
  const {
    stage,
    category,
    assignedAgent,
    priority,
    source,
    search,
    nextFollowUp,
    includeCounts,
    page = 1,
    limit = 10,
    sort = 'newest',
  } = req.query;

  const { query, invalid } = buildLeadQuery({ stage, category, assignedAgent, priority, source, search, nextFollowUp });
  if (invalid) {
    return res.status(400).json({ success: false, message: 'Invalid filter value' });
  }
  scopeQueryForRole(query, req.user);

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10)), 500);
  const skip = (pageNum - 1) * limitNum;

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    priority: { priority: -1, createdAt: -1 }, // high -> medium -> low alphabetically reversed
    follow_up: { nextFollowUp: 1 },
    activity: { lastActivity: -1 },
  };

  const [leads, total, stageCounts] = await Promise.all([
    populateLead(Lead.find(query))
      .sort(sortMap[sort] || sortMap.newest)
      .skip(skip)
      .limit(limitNum),
    Lead.countDocuments(query),
    includeCounts === 'true'
      ? Lead.aggregate([
          { $match: req.user.role === 'admin' ? {} : { assignedAgent: req.user._id } },
          { $group: { _id: '$stage', count: { $sum: 1 } } },
        ])
      : Promise.resolve(null),
  ]);

  const countsByStage = {};
  LEAD_STAGES.forEach((s) => (countsByStage[s] = 0));
  if (stageCounts) {
    stageCounts.forEach(({ _id, count }) => {
      countsByStage[_id] = count;
    });
  }

  res.json({
    success: true,
    count: leads.length,
    countsByStage: stageCounts ? countsByStage : undefined,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
    leads,
  });
});

/**
 * @desc    Get leads assigned to the current agent
 * @route   GET /api/leads/my-leads
 * @access  Private (agent)
 */
const getMyLeads = asyncHandler(async (req, res) => {
  const { stage, priority, page = 1, limit = 10 } = req.query;

  const query = { assignedAgent: req.user._id };
  if (stage) {
    const normalized = Lead.normalizeStage(stage);
    if (!normalized) {
      return res.status(400).json({ success: false, message: 'Invalid stage' });
    }
    query.stage = normalized;
  }
  if (priority) query.priority = priority;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10)), 200);
  const skip = (pageNum - 1) * limitNum;

  const [leads, total] = await Promise.all([
    populateLead(Lead.find(query))
      .sort({ nextFollowUp: 1, updatedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Lead.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: leads.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
    leads,
  });
});

/**
 * @desc    Get leads grouped by pipeline stage (kanban convenience)
 * @route   GET /api/leads/by-stage/:stage
 * @access  Private (admin/agent, agent scoped to own)
 */
const getLeadsByStage = asyncHandler(async (req, res) => {
  const stage = Lead.normalizeStage(req.params.stage);
  if (!stage) {
    return res.status(400).json({ success: false, message: 'Invalid pipeline stage' });
  }

  const { page = 1, limit = 50, priority, source, search } = req.query;
  const query = { stage };
  if (priority) query.priority = priority;
  if (source) query.source = source;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  scopeQueryForRole(query, req.user);

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10)), 200);
  const skip = (pageNum - 1) * limitNum;

  const [leads, total] = await Promise.all([
    populateLead(Lead.find(query))
      .sort({ priority: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Lead.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: leads.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
    leads,
  });
});

/**
 * @desc    Get a single lead (with timeline + conversation threads)
 * @route   GET /api/leads/:id
 * @access  Private (admin or assigned agent)
 */
const getLeadById = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id)
    .populate(LEAD_POPULATE)
    .populate({
      path: 'conversationThreads',
      populate: [
        { path: 'inquirer', select: 'name email' },
        { path: 'owner', select: 'name email' },
        { path: 'property', select: 'title' },
        { path: 'messages.sender', select: 'name' },
      ],
    });

  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  if (!canManage(lead, req.user)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to view this lead',
    });
  }

  // Newest timeline entries first for the UI
  const plain = lead.toObject();
  plain.activities = [...(plain.activities || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  res.json({ success: true, lead: plain });
});

/**
 * @desc    Update lead details (contact info, category, priority, notes, follow-up)
 * @route   PATCH /api/leads/:id
 * @access  Private (admin or assigned agent)
 */
const updateLead = asyncHandler(async (req, res) => {
  const { name, email, phone, category, priority, notes, nextFollowUp, property } = req.body;

  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to update this lead' });
  }

  const changes = [];
  if (name !== undefined && name !== lead.name) { lead.name = name; changes.push('name'); }
  if (email !== undefined && email !== lead.email) { lead.email = email; changes.push('email'); }
  if (phone !== undefined && phone !== lead.phone) { lead.phone = phone; changes.push('phone'); }
  if (category !== undefined && category !== lead.category) {
    if (!['property', 'account', 'billing', 'technical'].includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    lead.category = category;
    changes.push('category');
  }
  if (priority !== undefined && priority !== lead.priority) {
    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }
    lead.priority = priority;
    changes.push('priority');
  }
  if (notes !== undefined && notes !== lead.notes) {
    lead.notes = notes;
    changes.push('notes');
  }
  if (nextFollowUp !== undefined) {
    lead.nextFollowUp = nextFollowUp ? new Date(nextFollowUp) : null;
    if (nextFollowUp) {
      lead.recordActivity({
        type: 'follow_up_set',
        message: `Follow-up scheduled for ${new Date(nextFollowUp).toLocaleString()}`,
        by: req.user._id,
        byName: req.user.name,
      });
    }
    changes.push('nextFollowUp');
  }
  if (property !== undefined) {
    if (property) {
      const propertyDoc = await Property.findById(property).select('title');
      if (!propertyDoc) {
        return res.status(404).json({ success: false, message: 'Property not found' });
      }
    }
    lead.property = property || null;
    changes.push('property');
  }

  if (changes.length > 0 && !changes.includes('nextFollowUp')) {
    lead.recordActivity({
      type: 'updated',
      message: `Lead details updated (${changes.join(', ')})`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  await lead.save();
  await lead.populate(LEAD_POPULATE);

  res.json({
    success: true,
    message: 'Lead updated successfully',
    lead,
  });
});

/**
 * @desc    Move a lead to a different pipeline stage (kanban drag / stage select)
 * @route   PATCH /api/leads/:id/stage
 * @access  Private (admin or assigned agent)
 */
const updateLeadStage = asyncHandler(async (req, res) => {
  const { stage } = req.body;

  const newStage = Lead.normalizeStage(stage);
  if (!newStage) {
    return res.status(400).json({ success: false, message: 'Invalid pipeline stage' });
  }

  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to update this lead' });
  }

  // Spec v2 (Feature 1) role-based stage guards: the verification stage is
  // entered only by submitting a Sale, and agents can no longer close a lead
  // by hand - the lead closes automatically once a sale is verified. Admins
  // keep manual close/reopen for edge cases.
  const isAdmin = req.user.role === 'admin';
  if (newStage === 'pending_sale_verification') {
    return res.status(400).json({ success: false, message: 'Leads move to sale verification automatically when a Sale record is submitted. Use the "Submit Sale" action on this lead instead.' });
  }
  if (newStage === 'closed' && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Agents cannot close a lead directly. Submit a Sale for verification — the lead closes automatically once the sale is verified.' });
  }

  const previousStage = lead.stage;
  if (previousStage === newStage) {
    await lead.populate(LEAD_POPULATE);
    return res.json({
      success: true,
      message: 'Lead stage unchanged',
      lead,
    });
  }

  lead.stage = newStage;
  if (newStage === 'closed') lead.closedAt = lead.closedAt || new Date();
  if (['new', 'contacted', 'site_visit_scheduled', 'negotiation', 'lost'].includes(newStage)) {
    lead.closedAt = null;
  }
  lead.recordActivity({
    type: 'stage_changed',
    message: `Stage moved from "${previousStage.replace(/_/g, ' ')}" to "${newStage.replace(/_/g, ' ')}"`,
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();
  await lead.populate(LEAD_POPULATE);

  // Notify the assigned agent when someone else moves their lead
  if (
    lead.assignedAgent &&
    String(lead.assignedAgent._id || lead.assignedAgent) !== String(req.user._id)
  ) {
    await notify({
      recipient: lead.assignedAgent._id || lead.assignedAgent,
      type: 'lead_stage_changed',
      title: 'Lead Stage Updated',
      message: `"${lead.name}" moved to ${newStage.replace(/_/g, ' ')}`,
      lead: lead._id,
      link: '/dashboard/agent/leads',
    });
  }

  res.json({
    success: true,
    message: 'Lead stage updated',
    lead,
  });
});

// Shared implementation for assign + reassign
const performAssignment = async (req, res, { verb }) => {
  const { assignedAgent } = req.body;

  if (!assignedAgent) {
    return res.status(400).json({ success: false, message: 'New agent is required' });
  }

  const newAgent = await User.findById(assignedAgent).select('name email role');
  if (!newAgent) {
    return res.status(404).json({ success: false, message: 'New agent not found' });
  }

  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  const previousAgentId = lead.assignedAgent ? String(lead.assignedAgent) : null;
  lead.assignedAgent = assignedAgent;
  lead.recordActivity({
    type: 'assigned',
    message: previousAgentId
      ? `Lead reassigned to ${newAgent.name}`
      : `Lead assigned to ${newAgent.name}`,
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();
  await lead.populate(LEAD_POPULATE);

  await notify({
    recipient: assignedAgent,
    type: 'lead_assigned',
    title: previousAgentId ? 'New Lead Assigned' : 'Lead Assigned to You',
    message: `Lead "${lead.name}" has been assigned to you`,
    lead: lead._id,
    link: '/dashboard/agent/leads',
  });

  res.json({
    success: true,
    message: previousAgentId ? 'Lead reassigned successfully' : 'Lead assigned successfully',
    lead,
  });
};

/**
 * @desc    Assign an unassigned lead to an agent
 * @route   PATCH /api/leads/:id/assign
 * @access  Private (admin only)
 */
const assignLeadToAgent = asyncHandler(async (req, res) => performAssignment(req, res, { verb: 'assign' }));

/**
 * @desc    Reassign a lead to a different agent
 * @route   PATCH /api/leads/:id/reassign
 * @access  Private (admin only)
 */
const reassignLead = asyncHandler(async (req, res) => performAssignment(req, res, { verb: 'reassign' }));

/**
 * @desc    Update lead priority only
 * @route   PATCH /api/leads/:id/priority
 * @access  Private (admin or assigned agent)
 */
const updateLeadPriority = asyncHandler(async (req, res) => {
  const { priority } = req.body;

  if (!['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ success: false, message: 'Invalid priority' });
  }

  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to update this lead' });
  }

  lead.priority = priority;
  lead.recordActivity({
    type: 'updated',
    message: `Priority set to ${priority}`,
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();
  await lead.populate(LEAD_POPULATE);

  res.json({ success: true, message: 'Lead priority updated', lead });
});

/**
 * @desc    Update internal notes only
 * @route   PATCH /api/leads/:id/notes
 * @access  Private (admin or assigned agent)
 */
const updateLeadNotes = asyncHandler(async (req, res) => {
  const { notes } = req.body;

  if (notes === undefined || typeof notes !== 'string') {
    return res.status(400).json({ success: false, message: 'Notes are required' });
  }

  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to update this lead' });
  }

  lead.notes = notes;
  lead.recordActivity({
    type: 'note_added',
    message: notes.trim() ? 'Internal notes updated' : 'Internal notes cleared',
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();
  await lead.populate(LEAD_POPULATE);

  res.json({ success: true, message: 'Lead notes updated', lead });
});

/**
 * @desc    Set the next follow-up date
 * @route   PATCH /api/leads/:id/follow-up
 * @access  Private (admin or assigned agent)
 */
const setFollowUpDate = asyncHandler(async (req, res) => {
  const { nextFollowUp } = req.body;

  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to update this lead' });
  }

  if (nextFollowUp) {
    const date = new Date(nextFollowUp);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid follow-up date' });
    }
    lead.nextFollowUp = date;
    lead.recordActivity({
      type: 'follow_up_set',
      message: `Follow-up scheduled for ${date.toLocaleString()}`,
      by: req.user._id,
      byName: req.user.name,
    });
  } else {
    lead.nextFollowUp = null;
    lead.recordActivity({
      type: 'follow_up_done',
      message: 'Follow-up cleared',
      by: req.user._id,
      byName: req.user.name,
    });
  }

  await lead.save();
  await lead.populate(LEAD_POPULATE);

  res.json({ success: true, message: 'Follow-up updated', lead });
});

/**
 * @desc    Mark the pending follow-up as done (clears the date)
 * @route   PATCH /api/leads/:id/follow-up-done
 * @access  Private (admin or assigned agent)
 */
const markFollowUpDone = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to update this lead' });
  }

  const hadFollowUp = Boolean(lead.nextFollowUp);
  lead.nextFollowUp = null;
  lead.recordActivity({
    type: 'follow_up_done',
    message: hadFollowUp ? 'Follow-up completed' : 'Follow-up marked done (none was scheduled)',
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();
  await lead.populate(LEAD_POPULATE);

  res.json({ success: true, message: 'Follow-up marked as done', lead });
});

/**
 * @desc    Pipeline analytics: stage/source/agent breakdowns, conversion, close time
 * @route   GET /api/leads/pipeline/metrics
 * @access  Private (admin full view, agent scoped to own leads)
 */
const getPipelineMetrics = asyncHandler(async (req, res) => {
  const matchStage =
    req.user.role === 'admin' ? {} : { assignedAgent: req.user._id };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    byStageAgg,
    bySourceAgg,
    byAgentAgg,
    closedAgg,
    overdueCount,
    newThisWeek,
    totalCount,
  ] = await Promise.all([
    Lead.aggregate([
      { $match: matchStage },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: matchStage },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { ...matchStage, assignedAgent: { $ne: null } } },
      {
        $group: {
          _id: '$assignedAgent',
          total: { $sum: 1 },
          closed: { $sum: { $cond: [{ $eq: ['$stage', 'closed'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$stage', 'lost'] }, 1, 0] } },
          active: { $sum: { $cond: [{ $nin: ['$stage', ['closed', 'lost']] }, 1, 0] } },
        },
      },
      { $sort: { closed: -1, total: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'agent',
        },
      },
      { $unwind: '$agent' },
      {
        $project: {
          _id: 1,
          total: 1,
          closed: 1,
          lost: 1,
          active: 1,
          name: '$agent.name',
          email: '$agent.email',
        },
      },
    ]),
    Lead.aggregate([
      { $match: { ...matchStage, stage: 'closed', closedAt: { $ne: null } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgDaysToClose: {
            $avg: {
              $divide: [
                { $subtract: ['$closedAt', '$createdAt'] },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        },
      },
    ]),
    Lead.countDocuments({
      ...matchStage,
      nextFollowUp: { $ne: null, $lt: new Date() },
      stage: { $nin: ['closed', 'lost'] },
    }),
    Lead.countDocuments({ ...matchStage, createdAt: { $gte: weekAgo } }),
    Lead.countDocuments(matchStage),
  ]);

  const byStage = {};
  LEAD_STAGES.forEach((s) => (byStage[s] = 0));
  byStageAgg.forEach(({ _id, count }) => {
    byStage[_id] = count;
  });

  const bySource = {};
  LEAD_SOURCES.forEach((s) => (bySource[s] = 0));
  bySourceAgg.forEach(({ _id, count }) => {
    bySource[_id] = count;
  });

  const closedLeads = closedAgg[0]?.count || 0;
  const lostLeads = byStage.lost || 0;
  const finishedLeads = closedLeads + lostLeads;
  const conversionRate =
    finishedLeads > 0 ? Math.round((closedLeads / finishedLeads) * 100) : 0;

  res.json({
    success: true,
    metrics: {
      totalLeads: totalCount,
      activeLeads:
        (byStage.new || 0) +
        (byStage.contacted || 0) +
        (byStage.site_visit_scheduled || 0) +
        (byStage.negotiation || 0),
      closedLeads,
      lostLeads,
      conversionRate,
      avgDaysToClose: closedAgg[0]?.avgDaysToClose
        ? Math.round(closedAgg[0].avgDaysToClose)
        : null,
      newThisWeek,
      overdueFollowUps: overdueCount,
      byStage,
      bySource,
      byAgent: byAgentAgg,
      topAgent: byAgentAgg[0]
        ? { name: byAgentAgg[0].name, leads: byAgentAgg[0].closed }
        : null,
    },
  });
});

/**
 * @desc    Suggest the next best action for a lead (based on stage/state)
 * @route   GET /api/leads/:id/suggested-action
 * @access  Private (admin or assigned agent)
 */
const getSuggestedAction = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view this lead' });
  }

  let action = 'review_lead';
  let reason = 'Review the lead and decide the next step.';

  if (!lead.assignedAgent) {
    action = 'assign_agent';
    reason = 'This lead has no owner yet - assign an agent so it gets followed up.';
  } else if (
    lead.nextFollowUp &&
    lead.nextFollowUp < new Date() &&
    !['closed', 'lost'].includes(lead.stage)
  ) {
    action = 'overdue_follow_up';
    reason = `Follow-up was due ${lead.nextFollowUp.toLocaleDateString()} - reach out now.`;
  } else {
    switch (lead.stage) {
      case 'new':
        action = 'initial_outreach';
        reason = 'New lead - make the first contact within 24 hours.';
        break;
      case 'contacted':
        action = 'schedule_site_visit';
        reason = 'Initial contact made - propose a site visit or office meeting.';
        break;
      case 'site_visit_scheduled':
        action = 'post_visit_follow_up';
        reason = 'Visit stage - confirm attendance and gather feedback afterwards.';
        break;
      case 'negotiation':
        action = 'prepare_quote';
        reason = 'Active negotiation - share pricing, terms, and close the deal.';
        break;
      case 'closed':
        action = 'archive_lead';
        reason = 'Deal closed - archive notes and hand over to the operations team.';
        break;
      case 'lost':
        action = 'review_lost_reason';
        reason = 'Lost lead - record the reason to improve future conversion.';
        break;
      default:
        break;
    }
  }

  res.json({ success: true, action, reason });
});

/**
 * @desc    Add a manual note entry to the lead's activity timeline
 * @route   POST /api/leads/:id/activities
 * @access  Private (admin or assigned agent)
 */
const addLeadActivity = asyncHandler(async (req, res) => {
  const { message, type = 'note_added' } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Activity message is required' });
  }

  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to update this lead' });
  }

  lead.recordActivity({
    type: ['note_added', 'updated', 'conversation_message'].includes(type) ? type : 'note_added',
    message: message.trim(),
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();

  res.status(201).json({
    success: true,
    message: 'Activity added',
    activities: [...lead.activities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  });
});

/**
 * @desc    Get the lead's activity timeline
 * @route   GET /api/leads/:id/activities
 * @access  Private (admin or assigned agent)
 */
const getLeadActivities = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id).select('assignedAgent activities');
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
  if (!canManage(lead, req.user)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view this lead' });
  }

  const activities = [...(lead.activities || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  res.json({ success: true, activities });
});

/**
 * @desc    Delete a lead
 * @route   DELETE /api/leads/:id
 * @access  Private (admin only)
 */
const deleteLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findByIdAndDelete(req.params.id);

  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  res.json({
    success: true,
    message: 'Lead deleted successfully',
  });
});

module.exports = {
  createLead,
  getLeads,
  getMyLeads,
  getLeadsByStage,
  getLeadById,
  updateLead,
  updateLeadStage,
  assignLeadToAgent,
  reassignLead,
  updateLeadPriority,
  updateLeadNotes,
  setFollowUpDate,
  markFollowUpDone,
  getPipelineMetrics,
  getSuggestedAction,
  addLeadActivity,
  getLeadActivities,
  deleteLead,
};

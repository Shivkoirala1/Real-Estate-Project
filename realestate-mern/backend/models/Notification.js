const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: {
      type: String,
      enum: [
        'inquiry_received',        // legacy: someone sent an inquiry on your property
        'inquiry_read',            // legacy: the person you inquired to viewed your inquiry
        'inquiry_responded',       // legacy: the person you inquired to replied
        'inquiry_followup',        // legacy: new message on an existing inquiry thread
        'contact_form_received',   // unified: new contact form submission (admin alert)
        'contact_form_responded',  // unified: admin replied to a user's contact form
        'conversation_message',    // unified: new message in a lead conversation
        'conversation_followup',   // unified: inquirer replied in a conversation
        'visit_requested',         // a user has requested a visit
        'visit_confirmed',         // a visit has been confirmed
        'visit_rejected',          // a visit has been rejected
        'visit_cancelled',         // a buyer cancelled a visit
        'visit_completed',         // a visit was marked completed (reward awarded)
        'visit_rescheduled',       // a visit's schedule was changed
        'lead_assigned',           // a lead has been assigned to an agent
        'lead_created',            // a new lead entered the pipeline (admin alert)
        'lead_stage_changed',      // a lead moved to a different pipeline stage
        'lead_closed',             // a lead was manually closed (agent close alerts admins, admin close alerts the agent)
        'lead_followup_due',       // a lead follow-up is overdue (admin/agent alert)
        'property_sold',           // a property's status was changed to sold - admin alert
        'sale_submitted',          // Spec v2: agent filed a sale - admin alert (verification queue)
        'sale_verified',           // Spec v2: admin verified the agent's sale
        'sale_rejected',           // Spec v2: admin rejected the agent's sale (reason attached)
        'rental_submitted',        // agent filed a rental - admin alert (verification queue)
        'rental_verified',         // admin verified the agent's rental
        'rental_rejected',         // admin rejected the agent's rental (reason attached)
        'management_request_submitted',     // owner requested property management - admin alert
        'management_request_accepted',      // admin accepted a management request
        'management_request_declined',      // admin declined a management request
        'management_terminated',            // a management agreement was terminated (either path)
        'management_termination_requested', // termination was requested on a management agreement
        'tenancy_end_requested',   // owner requested an end of tenancy - admin alert
        'tenancy_end_approved',    // admin approved the end of tenancy - owner alert
        'tenancy_end_declined',    // admin declined the end of tenancy - owner alert
        'commission_paid',         // Spec v2: admin marked the agent's commission as paid
        'emi_installment_due',     // Spec v2: reminder a few days before an installment's dueDate
        'emi_installment_overdue', // Spec v2: an installment is past its due date
        'emi_plan_created',        // Spec v3: an EMI plan was initialized for a sale
        'emi_plan_pending',        // Spec v3: verified EMI sale has no plan yet - admin alert
        'emi_installment_updated', // Spec v3: admin changed an installment's status/schedule
        'emi_plan_status_changed', // Spec v3: plan-level status changed (e.g. defaulted, completed)
        'emi_verification_requested', // Spec v3: buyer submitted proof of payment - admin/agent alert
        'emi_verification_approved',  // Spec v3: admin confirmed the buyer's payment
        'emi_verification_rejected',  // Spec v3: admin rejected the buyer's proof of payment
        'review_posted',           // someone left a review on your property - lister alert
        'review_reply',            // an admin replied to your review
        'system',                  // generic/system notification, reserved for future use
      ],
      required: true,
    },

    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // Related records - used by the frontend to render context and deep links
    contactForm: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactForm', default: null },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
    // Spec v2: sale / rental / commission / EMI related notifications
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    rental: { type: mongoose.Schema.Types.ObjectId, ref: 'Rental', default: null },
    commissionRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'CommissionRecord', default: null },
    emiPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'EMIPlan', default: null },
    propertyManagementRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyManagementRequest', default: null },

    // Where the bell/notification card should take the user when clicked
    link: { type: String, default: '' },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

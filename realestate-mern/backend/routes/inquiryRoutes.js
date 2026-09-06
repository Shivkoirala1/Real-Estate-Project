// Compatibility placeholder.
//
// The old inquiry-based system has been fully refactored into the unified
// lead management module. The former mixed router (contact-forms + leads +
// conversations all mounted under '/api') has been replaced by three
// dedicated routers mounted explicitly in server.js:
//
//   app.use('/api/leads',           require('./routes/leadRoutes'));
//   app.use('/api/contact-forms',   require('./routes/contactFormRoutes'));
//   app.use('/api/conversations',   require('./routes/conversationRoutes'));
//
// This empty router keeps the historic `app.use('/api', inquiryRoutes)`
// mounting in server.js harmless while preserving the import path.
const express = require('express');
const router = express.Router();

module.exports = router;

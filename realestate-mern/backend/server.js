const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const inquiryRoutes = require('./routes/inquiryRoutes'); // compat placeholder (see file)
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const blogRoutes = require('./routes/blogRoutes');
const visitRoutes = require('./routes/visitRoutes');

// Unified lead management module
const leadRoutes = require('./routes/leadRoutes');
const contactFormRoutes = require('./routes/contactFormRoutes');
const conversationRoutes = require('./routes/conversationRoutes');

// Spec v2: sales / commissions / EMI plans / agents / analytics
const saleRoutes = require('./routes/saleRoutes');
const commissionRoutes = require('./routes/commissionRoutes');
const emiPlanRoutes = require('./routes/emiPlanRoutes');
const agentRoutes = require('./routes/agentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const rewardRoutes = require('./routes/rewardRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const archiveRoutes = require('./routes/archiveRoutes');

connectDB();

// Spec v2 (Feature 3): daily 08:00 EMI installment due-soon + overdue reminders.
// Kept defensive - a missing optional dependency or EMI_REMINDERS_ENABLED=false
// must never crash boot.
try {
  if (process.env.EMI_REMINDERS_ENABLED !== 'false') {
    const cron = require('node-cron');
    const { runEmiReminders } = require('./utils/emiReminders');
    cron.schedule('0 8 * * *', () => {
      runEmiReminders().catch((err) => console.error('EMI reminder job failed:', err.message));
    });
  }
} catch (err) {
  console.error('EMI reminder scheduler not started:', err.message);
}

// Data lifecycle: cold-storage archival (weekly) and hard-delete retention
// (nightly) for old/settled records. Both are dry-run-tested via the admin
// API before relying on the schedule; see utils/archival.js and
// utils/dataRetention.js for eligibility rules. Same defensive pattern as
// the reminder job above - never crash boot over a scheduler problem.
try {
  if (process.env.DATA_LIFECYCLE_JOBS_ENABLED !== 'false') {
    const cron = require('node-cron');
    const { runArchivalPass } = require('./utils/archival');
    const { runRetentionPass } = require('./utils/dataRetention');

    // Weekly, Sunday 02:00 - move old settled EMI plans / sales / soft-archived
    // properties to cold storage.
    cron.schedule('0 2 * * 0', () => {
      runArchivalPass().catch((err) => console.error('Archival job failed:', err.message));
    });

    // Nightly, 03:00 - hard-delete closed conversations and unconverted
    // contact form submissions past their retention window.
    cron.schedule('0 3 * * *', () => {
      runRetentionPass().catch((err) => console.error('Data retention job failed:', err.message));
    });
  }
} catch (err) {
  console.error('Data lifecycle schedulers not started:', err.message);
}

const app = express();

// Allow-list based CORS. Always includes the standard local Vite dev port as
// a safety net, plus whatever CLIENT_ORIGIN/CLIENT_URL is set to in .env
// (comma-separate multiple origins if you ever need more than one, e.g. a
// deployed frontend AND a local one).
const envOrigins = [process.env.CLIENT_ORIGIN, process.env.CLIENT_URL]
  .filter(Boolean)
  .flatMap((v) => v.split(','))
  .map((o) => o.trim().replace(/\/$/, ''));

const allowedOrigins = Array.from(new Set([...envOrigins, 'http://localhost:5173']));
console.log('CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header at all = same-origin or a non-browser client
    // (curl/Postman/server-to-server) - always allow those.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    console.warn(`CORS blocked a request from origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Serve uploaded property images/videos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Real Estate API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api', inquiryRoutes); // legacy placeholder - kept last among specific mounts
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/blogs', blogRoutes);

// Unified lead management module
app.use('/api/leads', leadRoutes);
app.use('/api/contact-forms', contactFormRoutes);
app.use('/api/conversations', conversationRoutes);

// Spec v2: sales / commissions / EMI plans / agents / analytics
app.use('/api/sales', saleRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/emi-plans', emiPlanRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin/archives', archiveRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
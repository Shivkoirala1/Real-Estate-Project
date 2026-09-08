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

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || process.env.CLIENT_URL }));
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

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

const nodemailer = require('nodemailer');

const isConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465 (SSL), false for 587/others (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Sends an email via SMTP when it's configured in .env. If it isn't (e.g.
// during local development before real credentials are set up), the message
// is printed to the server console instead so the verification/reset flows
// can still be tested end-to-end without a real mail provider.
const sendEmail = async ({ to, subject, html, text }) => {
  if (!transporter) {
    console.log('\n================ EMAIL (SMTP not configured in .env) ================');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('');
    console.log(text || html);
    console.log('=======================================================================\n');
    return { delivered: false };
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
  return { delivered: true };
};

module.exports = sendEmail;

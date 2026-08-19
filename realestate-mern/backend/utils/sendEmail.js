const axios = require('axios');

const isConfigured = Boolean(process.env.BREVO_API_KEY);

// Sends an email via Brevo's HTTPS API when configured in .env. If it isn't
// (e.g. during local development before real credentials are set up), the
// message is printed to the server console instead so the verification/reset
// flows can still be tested end-to-end without a real mail provider.
//
// This uses Brevo's REST API (regular HTTPS) instead of raw SMTP sockets --
// SMTP connections are unreliable/blocked on many free hosting tiers
// (including Render's free plan), while a normal HTTPS request works exactly
// like any other API call your backend already makes.
const sendEmail = async ({ to, subject, html, text }) => {
  if (!isConfigured) {
    console.log('\n================ EMAIL (BREVO_API_KEY not configured in .env) ================');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('');
    console.log(text || html);
    console.log('=======================================================================\n');
    return { delivered: false };
  }

  const fromEmail = process.env.EMAIL_FROM_ADDRESS || 'no-reply@example.com';
  const fromName = process.env.EMAIL_FROM_NAME || 'Ashland Estates';

  await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    },
    {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  return { delivered: true };
};

module.exports = sendEmail;
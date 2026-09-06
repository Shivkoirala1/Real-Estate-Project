// Sends an SMS via a gateway (e.g. Sparrow SMS, Twilio) when one is
// configured in .env. If it isn't (e.g. during local development, or before
// the client has picked an SMS provider), the message is printed to the
// server console instead - same fallback pattern as sendEmail.js - so the
// phone verification flow can still be tested end-to-end without a real
// SMS account.
//
// To go live: sign up with an SMS gateway that supports Nepali numbers
// (Sparrow SMS is a common choice for Nepal), set SMS_API_KEY (and any other
// required env vars) in .env, and fill in the real HTTP call below.
const isConfigured = Boolean(process.env.SMS_API_KEY);

const sendSMS = async ({ to, message }) => {
  if (!isConfigured) {
    console.log('\n================ SMS (gateway not configured in .env) ================');
    console.log(`To: ${to}`);
    console.log(message);
    console.log('=========================================================================\n');
    return { delivered: false };
  }

  // TODO: wire up the real SMS gateway call here once SMS_API_KEY is set,
  // e.g.:
  // await axios.post('https://api.sparrowsms.com/v2/sms/', {
  //   token: process.env.SMS_API_KEY,
  //   from: process.env.SMS_SENDER_ID,
  //   to,
  //   text: message,
  // });
  return { delivered: true };
};

module.exports = sendSMS;

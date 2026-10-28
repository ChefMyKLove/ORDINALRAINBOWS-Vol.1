// Sends an owner alert (email + SMS-via-carrier-gateway) through Resend's REST API.
// Never throws — an alert failure must not break the webhook/payout flow reporting it.
const fetch = require('node-fetch');

const RECIPIENTS = [
  'michael@chefmyklove.com',
  '2508164254@msg.telus.com', // Telus SMS gateway — ponytail: single carrier, add more gateway addresses here if the number changes carriers
];

async function sendAlert(subject, body) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('[alert] RESEND_API_KEY not set, skipping:', subject); return; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ORDINAL RAINBOWS <onboarding@resend.dev>',
        to: RECIPIENTS,
        subject,
        text: body,
      }),
    });
    if (!r.ok) console.error('[alert] Resend send failed:', r.status, await r.text());
  } catch (e) {
    console.error('[alert] send error:', e.message);
  }
}

module.exports = { sendAlert };

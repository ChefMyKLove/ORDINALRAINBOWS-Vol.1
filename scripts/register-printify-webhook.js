/*
  register-printify-webhook.js
  Subscribes the live site to Printify shipping events for the ORDINALRAINBOWS Pop-Up Store.
  Run once, after the site (with api/printify-webhook.js) is deployed.

  Usage: node --env-file=.env.local scripts/register-printify-webhook.js https://ordinalrainbows.com
  Requires PRINTIFY_API_TOKEN (webhooks.read + webhooks.write) and PRINTIFY_WEBHOOK_KEY.

  Only adds or lists our own subscription; never touches Printify's storefront webhooks.
*/

const SHOP_ID = 25429970;
const TOPIC = 'order:shipment:created';

async function api(path, options = {}) {
  const r = await fetch(`https://api.printify.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_TOKEN}`, 'User-Agent': 'ordinalrainbows-site', 'Content-Type': 'application/json' },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const base = process.argv[2];
  if (!/^https:\/\//.test(base || '')) { console.error('Usage: register-printify-webhook.js https://your-site'); process.exit(1); }
  if (!process.env.PRINTIFY_WEBHOOK_KEY) throw new Error('PRINTIFY_WEBHOOK_KEY not set');

  const url = `${base.replace(/\/$/, '')}/api/printify-webhook?key=${encodeURIComponent(process.env.PRINTIFY_WEBHOOK_KEY)}`;
  const existing = await api(`/shops/${SHOP_ID}/webhooks.json`);
  const ours = existing.find(w => w.topic === TOPIC && w.url.startsWith(`${base.replace(/\/$/, '')}/api/printify-webhook`));
  if (ours) { console.log('Already registered:', TOPIC, '(id', ours.id + ')'); return; }

  const created = await api(`/shops/${SHOP_ID}/webhooks.json`, { method: 'POST', body: JSON.stringify({ topic: TOPIC, url }) });
  console.log('Registered', TOPIC, '(id', created.id + ')');
}

main().catch(e => { console.error(e.message); process.exit(1); });

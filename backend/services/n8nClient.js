/**
 * Lightweight n8n Webhook client
 * Uses native fetch (Node >=18) and supports optional header/basic auth.
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.N8N_GLOBAL_TIMEOUT_MS || 45000);

function mockReply(payload) {
  try {
    const input = payload || {};
    const msg = String(input.message || '').trim();
    const m = msg.toLowerCase();
    const suggest = '\n\nYou can try:\n• "Categorize recent transactions"\n• "Generate monthly report for August"\n• "Upload receipts"';

    const isGreeting = /\b(hi|hello|hey|yo|sup)\b/i.test(msg);
    const hasIntent = /(what\s+is|explain|how\s+does|categor|report|summary|monthly|statement|upload|receipt|invoice|excel|csv|file|cash\s*(vs|and)?\s*accrual|accrual\s*(vs|and)?\s*cash|ebitda|cogs|cost of goods|gross\s*(margin|profit)|net\s*(profit|income)|accounts\s*(receivable|payable)|a\s*r\b|a\s*p\b|depreciation|amortization)/i.test(m);

    if (isGreeting && !hasIntent) {
      return 'Hi! I’m your AI Bookkeeper via n8n (mock). I can categorize transactions, extract data from receipts, and generate quick reports.' + suggest;
    }
    if (/(what\s+is|explain|how\s+does).*(ai|bookkeep)/i.test(msg) || /ai\s*bookkeep/i.test(m)) {
      if (/bookkeep/i.test(m)) {
        return 'AI bookkeeping uses automation to extract data from receipts/invoices, auto‑categorize transactions, and build summaries so you spend less time on manual entry. Upload files in “Upload Process” and I’ll handle extraction; then ask me to categorize or report.';
      }
      return 'AI helps read receipts, categorize transactions, and generate summaries. Ask me to categorize or generate a monthly report.';
    }
    if (/categor/i.test(m)) {
      return 'Categorization: after uploads, I group by vendor/keywords and map to categories like Office Supplies or Utilities. Say “categorize recent transactions”.';
    }
    if (/(report|summary|monthly|statement)/i.test(m)) {
      return 'Reporting: tell me the period, e.g., “Generate monthly report for August 2025”.';
    }
    if (/(upload|receipt|invoice|excel|csv|file)/i.test(m)) {
      return 'Upload receipts (PDF/images) or CSV/XLSX in Upload Process. I’ll extract totals, dates, and line items.';
    }
    if (/(cash\s*(vs|and)?\s*accrual|accrual\s*(vs|and)?\s*cash)/i.test(m)) {
      return 'Cash vs Accrual — Cash records when money moves; Accrual records when earned/incurred. Accrual is better for invoices/inventory.';
    }
    if (/ebitda/i.test(m)) return 'EBITDA = Net Income + Interest + Taxes + Depreciation + Amortization.';
    if (/(cogs|cost of goods)/i.test(m)) return 'COGS are direct costs to produce/sell goods: Beg Inv + Purchases − End Inv.';
    if (/(gross\s*(margin|profit)|net\s*(profit|income))/i.test(m)) return 'Gross profit = Revenue − COGS; Net profit = Revenue − (COGS + Opex + Interest + Taxes).';
    if (/(accounts\s*receivable|a\s*r\b)/i.test(m)) return 'AR: invoices issued, not yet collected.';
    if (/(accounts\s*payable|a\s*p\b)/i.test(m)) return 'AP: bills received, not yet paid.';
    if (/(depreciation|amortization)/i.test(m)) return 'Depreciation/amortization spread asset cost over useful life (non‑cash expense).';
    return 'I can help with categorization, uploads, and monthly reports.' + suggest;
  } catch (_) {
    return 'Assistant is warming up. Please try again in a moment.';
  }
}

function buildAuthHeaders() {
  const headers = {};
  const hdrName = process.env.N8N_WEBHOOK_HEADER_NAME;
  const hdrValue = process.env.N8N_WEBHOOK_HEADER_VALUE;
  if (hdrName && hdrValue) headers[hdrName] = hdrValue;

  const basicUser = process.env.N8N_WEBHOOK_BASIC_USER;
  const basicPass = process.env.N8N_WEBHOOK_BASIC_PASS;
  if (basicUser || basicPass) {
    const token = Buffer.from(`${basicUser || ''}:${basicPass || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  }
  return headers;
}

async function postToWebhook(name, payload, opts = {}) {
  const urlEnvName = opts.urlEnvName || 'N8N_WEBHOOK_URL';
  const url = opts.url || process.env[urlEnvName];
  const timeoutMs = Number(opts.timeoutMs || DEFAULT_TIMEOUT_MS);

  // Built-in mock mode to enable codeless behavior before a real n8n is running
  if (url && typeof url === 'string' && url.startsWith('mock:')) {
    const reply = mockReply(payload);
    return { ok: true, status: 200, data: { reply, source: 'n8n-mock' }, text: JSON.stringify({ reply }) };
  }

  if (!url) {
    return {
      ok: false,
      status: 0,
      error: `Missing ${urlEnvName}. Set it in backend/.env to enable the ${name} workflow.`
    };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'content-type': 'application/json',
    ...buildAuthHeaders(),
    ...(opts.headers || {}),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    clearTimeout(t);

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { text }; }

    return { ok: res.ok, status: res.status, data, text };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, error: String(err && err.message ? err.message : err) };
  }
}

module.exports = {
  postToWebhook,
};

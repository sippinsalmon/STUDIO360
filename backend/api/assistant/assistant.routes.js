/**
 * Assistant Routes (Chatbot-only)
 * Decoupled from OCR/Upload. Keeps simple in-memory sessions and forwards to n8n.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { postToWebhook } = require('../../services/n8nClient');
const { chatComplete, getConfig: getLLMConfig } = require('../../services/llmClient');

// --- Simple in-memory chat sessions (ephemeral; swap to Redis/DB later) ---
const chatSessions = new Map(); // sessionId -> { history: [{role, content, ts}], createdAt }
function getOrCreateSession(sessionId) {
  let id = sessionId || crypto.randomUUID();
  if (!chatSessions.has(id)) {
    chatSessions.set(id, { history: [], createdAt: Date.now() });
  }
  return { id, session: chatSessions.get(id) };
}

// Lightweight local assistant for offline fallback (pattern-based)
function localAssistantReply(input) {
  const msg = String(input || '').trim();
  const m = msg.toLowerCase();
  const suggest = '\n\nYou can try:\n• "Categorize recent transactions"\n• "Generate monthly report for August"\n• "Upload receipts"';

  // Prefer intent answers over greetings if the message contains more than a greeting
  const isGreeting = /\b(hi|hello|hey|yo|sup)\b/i.test(msg);
  const hasIntent = /(what\s+is|explain|how\s+does|categor|report|summary|monthly|statement|upload|receipt|invoice|excel|csv|file|cash\s*(vs|and)?\s*accrual|accrual\s*(vs|and)?\s*cash|ebitda|cogs|cost of goods|gross\s*(margin|profit)|net\s*(profit|income)|accounts\s*(receivable|payable)|a\s*r\b|a\s*p\b|depreciation|amortization)/i.test(m);
  if (isGreeting && !hasIntent) {
    return 'Hi! I’m your AI Bookkeeper. I can categorize transactions, extract data from receipts, and generate quick reports.' + suggest;
  }
  if (/(what\s+is|explain|how\s+does).*(ai|bookkeep)/i.test(msg) || /ai\s*bookkeep/i.test(m)) {
    if (/bookkeep/i.test(m)) {
      return 'AI bookkeeping uses automation to extract data from receipts/invoices, auto‑categorize transactions, and build summaries so you spend less time on manual entry. Upload files in “Upload Process” and I’ll handle extraction; then ask me to categorize or report.';
    }
    return 'AI helps read receipts, categorize transactions, and generate summaries. Ask me to categorize or generate a monthly report.';
  }
  if (/^\s*what\s+is\s+.+/i.test(msg)) {
    return 'I can help with general questions too. For the best answers, enable the LLM fallback (set LLM_API_KEY in backend/.env or use the advanced n8n workflow).';
  }
  if (/categor/i.test(m)) {
    return 'To categorize, upload receipts or a CSV/XLSX in Upload Process. Then ask “categorize recent transactions”.';
  }
  if (/(report|summary|monthly|statement)/i.test(m)) {
    return 'I can generate a monthly summary once your data is in. After uploading, ask “generate monthly report for <month>”.';
  }
  if (/(upload|receipt|invoice|excel|csv|file)/i.test(m)) {
    return 'Use the Upload Process to send receipts (PDF/images) or Excel/CSV files. I’ll extract totals, dates, and line items automatically.';
  }
  if (/(cash\s*(vs|and)?\s*accrual|accrual\s*(vs|and)?\s*cash)/i.test(m)) {
    return 'Cash vs Accrual — Cash: record when money moves. Accrual: record when earned/incurred. Accrual gives more accurate period reporting.';
  }
  if (/ebitda/i.test(m)) {
    return 'EBITDA = Net Income + Interest + Taxes + Depreciation + Amortization — a proxy for operating performance.';
  }
  if (/(cogs|cost of goods)/i.test(m)) {
    return 'COGS are direct costs to produce/sell goods: beginning inventory + purchases − ending inventory.';
  }
  if (/(gross\s*(margin|profit)|net\s*(profit|income))/i.test(m)) {
    return 'Gross profit = Revenue − COGS; Gross margin = Gross ÷ Revenue; Net profit = Revenue − (COGS + Opex + Interest + Taxes).';
  }
  if (/(accounts\s*receivable|a\s*r\b)/i.test(m)) {
    return 'Accounts Receivable (AR): invoices you’ve issued but not yet collected.';
  }
  if (/(accounts\s*payable|a\s*p\b)/i.test(m)) {
    return 'Accounts Payable (AP): bills you owe suppliers that you haven’t paid yet.';
  }
  if (/(depreciation|amortization)/i.test(m)) {
    return 'Depreciation (tangible) / amortization (intangible) spread asset cost over useful life — non‑cash expense per period.';
  }
  if (/^\s*(explain|tell\s+me\s+about)\b/i.test(msg)) {
    return 'I can explain bookkeeping concepts like cash vs accrual, EBITDA, COGS, margins, AR/AP, and financial statements.';
  }
  return (process.env.ASSISTANT_FALLBACK_MESSAGE || 'Assistant is warming up. Please try again in a moment.') + suggest;
}

/**
 * GET /api/assistant/health
 */
router.get('/health', (req, res) => {
  const url = process.env.N8N_WEBHOOK_URL || '';
  const configured = Boolean(url && (url.startsWith('http') || url.startsWith('mock:')));
  const masked = url ? url.replace(/:[^@/]+@/, ':***@') : null; // mask basic auth secret
  res.json({ success: true, data: { configured, url: masked } });
});

/**
 * POST /api/assistant/message
 */
router.post('/message', express.json(), async (req, res) => {
  try {
    const { message, sessionId, context } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const { id, session } = getOrCreateSession(sessionId);
    session.history.push({ role: 'user', content: message, ts: Date.now() });
    session.history = session.history.slice(-20);

    const payload = {
      type: 'ai_assistant_message',
      sessionId: id,
      message,
      history: session.history,
      context: { ...context, app: 'STUDIO360', page: 'ai-bookkeeper' },
    };

    // Routing strategy: if LLM is enabled and user asks a general question, use LLM first; else n8n
    const llmCfg = getLLMConfig();
    const isGeneralQA = /(what|why|how|who|where|explain|compare|summarize|translate|define|write|draft|code|fix|bug|regex|error)/i.test(message);

    if (llmCfg.apiKey && isGeneralQA) {
      try {
        const system = 'You are the STUDIO360 AI assistant. Be concise, accurate, and helpful. If the user asks about bookkeeping features, briefly guide them to upload receipts, categorize transactions, or generate reports.';
        const llmReply = await chatComplete({
          system,
          messages: [
            ...session.history.map(h => ({ role: h.role, content: String(h.content || '') })),
            { role: 'user', content: String(message) },
          ],
          temperature: 0.3,
          maxTokens: 500,
        });
        session.history.push({ role: 'assistant', content: llmReply, ts: Date.now() });
        return res.json({ success: true, data: { sessionId: id, reply: llmReply, source: 'llm' } });
      } catch (e) {
        console.warn('LLM primary error:', e.message || e);
        // fall through to n8n
      }
    }

    const resp = await postToWebhook('assistant', payload);
    if (!resp.ok) {
      // If LLM is available, use it as fallback for any request type
      try {
        if (llmCfg.apiKey) {
          const system = 'You are the STUDIO360 AI assistant. Be concise, accurate, and helpful.';
          const llmReply = await chatComplete({
            system,
            messages: [
              ...session.history.map(h => ({ role: h.role, content: String(h.content || '') })),
              { role: 'user', content: String(message) },
            ],
            temperature: 0.3,
            maxTokens: 500,
          });
          session.history.push({ role: 'assistant', content: llmReply, ts: Date.now() });
          return res.json({ success: true, data: { sessionId: id, reply: llmReply, source: 'llm' } });
        }
      } catch (e) {
        console.warn('LLM fallback error:', e.message || e);
      }

      const hint = localAssistantReply(message);
      if (resp.error) console.warn('n8n webhook error:', resp.error);
      session.history.push({ role: 'assistant', content: hint, ts: Date.now() });
      return res.json({ success: true, data: { sessionId: id, reply: hint, source: 'fallback' } });
    }

    const data = resp.data || {};
    const reply =
      (typeof data.reply === 'string' && data.reply) ||
      (Array.isArray(data.messages) && data.messages.find(m => m.role !== 'user')?.content) ||
      (typeof data.text === 'string' && data.text) ||
      'Okay.';

    session.history.push({ role: 'assistant', content: reply, ts: Date.now() });
    return res.json({ success: true, data: { sessionId: id, reply, raw: data } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

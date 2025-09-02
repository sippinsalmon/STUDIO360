/**
 * AI Routes
 * Handles AI bookkeeper endpoints
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { postToWebhook } = require('../../services/n8nClient');
const { chatComplete, getConfig: getLLMConfig } = require('../../services/llmClient');

// In-memory KPI stats (can be replaced with DB later)
function freshKPI() {
  return {
    processed: 0,
    accuracyRate: 0,
    timeSavedMinutes: 0,
    costSavings: 0,
    docsCount: 0,
    txCount: 0,
    transferred: 0,
    updatedAt: Date.now(),
  };
}
let kpiStats = freshKPI();

// In-memory processed invoice/receipt JSON store (ephemeral)
const processedStore = []; // { id, originalName, storedPath, size, mimetype, extractedAt, canonical }

function canonicalizeStructured({ rawText, structured, meta }) {
  const s = structured || {};

  // Basic scanners for optional fields in text
  const scanLine = (labels) => {
    if (!rawText) return null;
    const lines = String(rawText).split(/\r?\n/);
    for (const lbl of labels) {
      const re = new RegExp(`^\s*${lbl}\s*[:\-]?\s*(.+)$`, 'i');
      for (const ln of lines) {
        const m = ln.match(re);
        if (m && m[1]) return m[1].trim().slice(0, 200);
      }
    }
    return null;
  };

  const items = Array.isArray(s.items) ? s.items : [];
  const itemsSnake = items.map(it => ({
    no: it.no ?? null,
    product: it.product ?? null,
    variation: it.variation ?? null,
    product_price: it.productPrice ?? null,
    qty: it.qty ?? null,
    subtotal: it.subtotal ?? null,
  }));
  const itemsRequested = items.map(it => ({
    item_name: it.product ?? null,
    qty: it.qty ?? null,
    price: it.productPrice ?? null,
    subtotal: it.subtotal ?? null,
  }));

  const paymentBreakdown = {
    merchandiseSubtotal: s.merchandiseSubtotal ?? null,
    shippingFee: s.shippingFee ?? null,
    shippingDiscount: s.shippingDiscount ?? null,
    serviceCharge: s.serviceCharge ?? null,
    voucherDiscount: s.voucherDiscount ?? (s.platformVoucher ?? null),
    loyaltyPointsUsed: s.loyaltyPointsUsed ?? null,
    grandTotal: s.total ?? s.grandTotal ?? null,
  };

  return {
    schemaVersion: '1.1',
    extractedAt: Date.now(),
    source: {
      originalName: meta.originalName,
      storedPath: meta.storedPath,
  fileUrl: meta.fileUrl || null,
      mimetype: meta.mimetype,
      size: meta.size,
    },
    fields: {
      sellerName: s.supplier || null,
      sellerAddress: s.sellerAddress || null,
      buyerName: s.buyerName || null,
      buyerAddress: s.buyerAddress || null,
      // Flat access to keep backward compatible consumers happy
      orderSummaryNo: s.orderSummaryNo || s.invoiceNumber || null,
      invoiceNumber: s.invoiceNumber || null,
      orderId: s.orderId || null,
      dateIssued: s.dateIssued || s.date || null,
      orderPaidDate: s.orderPaidDate || null,
      paymentMethod: s.paymentMethod || null,
      currency: s.currency || null,
      amountInWords: s.amountInWords || null,
    },
    // New sections matching requested schema
    orderSummary: {
      orderSummaryNo: s.orderSummaryNo || s.invoiceNumber || null,
      dateIssued: s.dateIssued || s.date || null,
      orderId: s.orderId || null,
      orderPaidDate: s.orderPaidDate || null,
      paymentMethod: s.paymentMethod || null,
    },
    orderDetails: {
      items: itemsRequested,
      branchName: s.branchName ?? scanLine(['Branch Name', 'Branch']) ?? null,
      route: s.route ?? scanLine(['Route']) ?? null,
      driver: s.driver ?? s.deliveryRider ?? scanLine(['Driver', 'Delivery Rider']) ?? null,
    },
    paymentBreakdown,
    // Preserve previous groups for compatibility
    amounts: {
      ...paymentBreakdown,
      tax: s.tax ?? null,
    },
    items: items.map(it => ({
      no: it.no ?? null,
      product: it.product ?? null,
      variation: it.variation ?? null,
      productPrice: it.productPrice ?? null,
      qty: it.qty ?? null,
      subtotal: it.subtotal ?? null,
    })),
    order_details: itemsSnake,
    raw: {
      text: rawText,
      structured: s,
    }
  };
}

// Lightweight local assistant for offline fallback (pattern-based)
function localAssistantReply(input, stats) {
  const msg = String(input || '').trim();
  const m = msg.toLowerCase();
  const suggest = '\n\nYou can try:\n• "Categorize recent transactions"\n• "Generate monthly report for August"\n• "Upload receipts"';

  // Prefer intent answers over greetings if the message contains more than a greeting
  const isGreeting = /\b(hi|hello|hey|yo|sup)\b/i.test(msg);
  const hasIntent = /(what\s+is|explain|how\s+does|categor|report|summary|monthly|statement|upload|receipt|invoice|excel|csv|file|cash\s*(vs|and)?\s*accrual|accrual\s*(vs|and)?\s*cash|ebitda|cogs|cost of goods|gross\s*(margin|profit)|net\s*(profit|income)|accounts\s*(receivable|payable)|a\s*r\b|a\s*p\b|depreciation|amortization)/i.test(m);
  if (isGreeting && !hasIntent) {
    return 'Hi! I’m your AI Bookkeeper. I can categorize transactions, extract data from receipts, and generate quick reports.' + suggest;
  }
  // What is AI bookkeeping / explain
  if (/(what\s+is|explain|how\s+does).*(ai|bookkeep)/i.test(msg) || /ai\s*bookkeep/i.test(m)) {
    if (/bookkeep/i.test(m)) {
      return 'AI bookkeeping uses automation to extract data from receipts/invoices, auto‑categorize transactions, and build summaries so you spend less time on manual entry. Upload files in “Upload Process” and I’ll handle extraction; then ask me to categorize or report.';
    }
    // Generic AI explanation
    return 'AI (artificial intelligence) refers to software techniques that enable computers to perform tasks that typically require human intelligence—like understanding language, recognizing patterns, making predictions, and planning. In this app, AI helps read receipts, categorize transactions, and generate summaries.';
  }
  // Generic "what is ..." without AI — steer to LLM or provide guidance
  if (/^\s*what\s+is\s+.+/i.test(msg)) {
    return 'I can help with general questions too. For the best answers, enable the LLM fallback (set LLM_API_KEY in backend/.env or use the advanced n8n workflow). For bookkeeping, you can ask me to categorize or generate reports.';
  }
  // Categorization intent
  if (/categor/i.test(m)) {
    return 'To categorize, upload your receipts or a CSV/XLSX of transactions in Upload Process. I’ll group by vendor/keywords and map to categories (e.g., Office Supplies, Utilities). Then ask “categorize recent transactions”.';
  }
  // Report intent
  if (/(report|summary|monthly|statement)/i.test(m)) {
    return 'I can generate a monthly summary once your data is in. After uploading, ask “generate monthly report for <month>”.';
  }
  // Upload intent
  if (/(upload|receipt|invoice|excel|csv|file)/i.test(m)) {
    return 'Use the Upload Process screen to send receipts (PDF/images) or Excel/CSV files. I’ll extract totals, dates, and line items automatically.';
  }
  // Cash vs Accrual accounting
  if (/(cash\s*(vs|and)?\s*accrual|accrual\s*(vs|and)?\s*cash)/i.test(m)) {
    return [
      'Cash vs Accrual (simple):',
      '- Cash: record income when money is received and expenses when money is paid.',
      '- Accrual: record income when earned (invoice issued) and expenses when incurred (bill received), even if cash moves later.',
      'Use cash for simplicity/very small businesses; use accrual for inventory, invoices/credit terms, and more accurate period reporting.'
    ].join(' ');
  }
  // EBITDA
  if (/ebitda/i.test(m)) {
    return 'EBITDA = Earnings Before Interest, Taxes, Depreciation, and Amortization. It approximates operating performance by stripping capital structure, tax, and non‑cash charges. Rough formula: Net Income + Interest + Taxes + Depreciation + Amortization.';
  }
  // COGS
  if (/(cogs|cost of goods)/i.test(m)) {
    return 'COGS (Cost of Goods Sold) are direct costs to produce/sell goods: beginning inventory + purchases − ending inventory. It excludes operating expenses like marketing or rent.';
  }
  // Gross vs Net
  if (/(gross\s*(margin|profit)|net\s*(profit|income))/i.test(m)) {
    return 'Gross profit = Revenue − COGS (before operating expenses). Gross margin = Gross profit ÷ Revenue. Net profit = All revenue − (COGS + operating expenses + interest + taxes).';
  }
  // Financial statements differences
  if (/(balance\s*sheet).*?(income\s*statement|p&l)|((income\s*statement|p&l).*?balance\s*sheet)/i.test(m)) {
    return 'Balance sheet shows what you own/owe at a point in time (assets, liabilities, equity). Income statement (P&L) shows performance over a period (revenue, expenses, profit).';
  }
  // AR/AP
  if (/(accounts\s*receivable|a\s*r\b)/i.test(m)) {
    return 'Accounts Receivable (AR): money customers owe you for invoices you’ve issued but not yet collected.';
  }
  if (/(accounts\s*payable|a\s*p\b)/i.test(m)) {
    return 'Accounts Payable (AP): bills you owe suppliers that you’ve received but not yet paid.';
  }
  // Depreciation/amortization
  if (/(depreciation|amortization)/i.test(m)) {
    return 'Depreciation (tangible) and amortization (intangible) spread the cost of assets over their useful life, creating a non‑cash expense each period.';
  }
  // Generic explain prompts for common accounting topics
  if (/^\s*(explain|tell\s+me\s+about)\b/i.test(msg)) {
    return 'Here’s a simple take: I can explain bookkeeping concepts like cash vs accrual, EBITDA, COGS, margins, AR/AP, and financial statements. Ask any of those, or upload data and I’ll help categorize and report.';
  }
  // KPI intent
  if (/(stats|kpi|progress|how\s+much|processed)/i.test(m)) {
    const s = stats || {};
    return `Live stats — processed: ${s.processed || 0}, accuracy: ${s.accuracyRate || 0}%, time saved: ${s.timeSavedMinutes || 0} mins, cost savings: ₱${Number(s.costSavings || 0).toLocaleString()}.`;
  }
  // Default helpful message
  return (process.env.ASSISTANT_FALLBACK_MESSAGE || 'Assistant is warming up. Please try again in a moment.') + suggest;
}

// Attempt to resolve a working Python executable path on Windows/Unix
function resolvePythonExecutable() {
  // 1) Project venv (Windows layout)
  const venvWin = path.join(process.cwd(), 'python', '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvWin)) return venvWin;
  // 2) Project venv (POSIX layout)
  const venvPosix = path.join(process.cwd(), 'python', '.venv', 'bin', 'python');
  if (fs.existsSync(venvPosix)) return venvPosix;
  // 3) Explicit env override
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) return process.env.PYTHON_PATH;

  // 4) Common Windows install locations (Python 3.9 - 3.13)
  const vers = ['39','310','311','312','313','314'];
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Python'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Python'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Python'),
    'C:/',
  ].filter(Boolean);
  for (const root of roots) {
    for (const v of vers) {
      const p1 = path.join(root, `Python${v}`, 'python.exe');
      if (fs.existsSync(p1)) return p1;
      const p2 = path.join('C:/', `Python${v}`, 'python.exe');
      if (fs.existsSync(p2)) return p2;
    }
  }

  // 5) Fallback to PATH entry
  if (process.platform === 'win32') {
    // Try Windows Python launcher if available
    return process.env.PYTHON || 'py';
  }
  return process.env.PYTHON || 'python';
}

// Ensure uploads directory exists (relative to backend working dir)
const uploadsDir = path.join(process.cwd(), 'uploads');
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (e) {
  // no-op
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

/**
 * @route   GET /api/ai/stats
 * @desc    Get AI Bookkeeper KPI stats
 * @access  Private
 */
router.get('/stats', (req, res) => {
  return res.json({ success: true, data: kpiStats });
});

/**
 * @route   POST /api/ai/stats
 * @desc    Update AI Bookkeeper KPI stats (merge)
 * @access  Private
 */
router.post('/stats', express.json(), (req, res) => {
  try {
    const allowed = [
      'processed',
      'accuracyRate',
      'timeSavedMinutes',
      'costSavings',
      'docsCount',
      'txCount',
      'transferred',
      'updatedAt',
    ];
    const body = req.body || {};
    const accumulate = body.mode === 'accumulate';

    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const val = body[key];
      if (accumulate && key !== 'accuracyRate' && typeof val === 'number') {
        kpiStats[key] = (Number(kpiStats[key]) || 0) + Number(val);
      } else {
        kpiStats[key] = val;
      }
    }
    // ensure updatedAt
    kpiStats.updatedAt = Date.now();
    return res.json({ success: true, data: kpiStats });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

/**
 * @route   POST /api/ai/stats/reset
 * @desc    Reset KPI stats to initial zero state
 * @access  Private
 */
router.post('/stats/reset', (req, res) => {
  kpiStats = freshKPI();
  return res.json({ success: true, message: 'KPI stats reset', data: kpiStats });
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// --- Simple in-memory chat sessions (ephemeral; swap to Redis/DB later) ---
const chatSessions = new Map(); // sessionId -> { history: [{role, content, ts}], createdAt }
function getOrCreateSession(sessionId) {
  let id = sessionId || crypto.randomUUID();
  if (!chatSessions.has(id)) {
    chatSessions.set(id, { history: [], createdAt: Date.now() });
  }
  return { id, session: chatSessions.get(id) };
}

/**
 * @route   GET /api/ai/assistant/health
 * @desc    Check whether n8n webhook is configured
 */
router.get('/assistant/health', (req, res) => {
  const url = process.env.N8N_WEBHOOK_URL || '';
  const configured = Boolean(url && url.startsWith('http'));
  const masked = url ? url.replace(/:[^@/]+@/, ':***@') : null; // mask basic auth secret
  res.json({ success: true, data: { configured, url: masked } });
});

/**
 * @route   POST /api/ai/assistant/message
 * @desc    Send a user message to the n8n AI workflow and return the assistant reply
 * @body    { message: string, sessionId?: string, context?: object }
 */
router.post('/assistant/message', express.json(), async (req, res) => {
  try {
    const { message, sessionId, context } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const { id, session } = getOrCreateSession(sessionId);
    // push user message
    session.history.push({ role: 'user', content: message, ts: Date.now() });
    // keep last 20 messages
    session.history = session.history.slice(-20);

    const payload = {
      type: 'ai_assistant_message',
      sessionId: id,
      message,
      history: session.history,
      context: {
        ...context,
        app: 'STUDIO360',
        page: 'ai-bookkeeper',
      },
    };

    const resp = await postToWebhook('assistant', payload);
    if (!resp.ok) {
      // If a direct LLM is configured, use it as a powerful fallback
      try {
        const llmCfg = getLLMConfig();
        if (llmCfg.apiKey) {
          const system = 'You are the STUDIO360 AI Bookkeeper assistant. Be concise and helpful. If the user asks about bookkeeping tasks, guide them to upload receipts, categorize transactions, or generate reports.';
          const llmReply = await chatComplete({
            system,
            messages: [
              ...session.history.map(h => ({ role: h.role, content: String(h.content || '') })),
              { role: 'user', content: String(message) },
            ],
            temperature: 0.3,
            maxTokens: 400,
          });
          session.history.push({ role: 'assistant', content: llmReply, ts: Date.now() });
          return res.json({ success: true, data: { sessionId: id, reply: llmReply, source: 'llm' } });
        }
      } catch (e) {
        console.warn('LLM fallback error:', e.message || e);
      }

      // Otherwise, use the local heuristic reply
      const hint = localAssistantReply(message, kpiStats);
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

    // optionally adjust KPI stats if workflow returns deltas
    if (data.statsDelta && typeof data.statsDelta === 'object') {
      const d = data.statsDelta;
      kpiStats.processed = (kpiStats.processed || 0) + Number(d.processed || 0);
      if (typeof d.accuracyRate === 'number') kpiStats.accuracyRate = d.accuracyRate;
      kpiStats.timeSavedMinutes = (kpiStats.timeSavedMinutes || 0) + Number(d.timeSavedMinutes || 0);
      kpiStats.costSavings = (kpiStats.costSavings || 0) + Number(d.costSavings || 0);
      kpiStats.txCount = (kpiStats.txCount || 0) + Number(d.txCount || 0);
      kpiStats.docsCount = (kpiStats.docsCount || 0) + Number(d.docsCount || 0);
      kpiStats.updatedAt = Date.now();
    }

    // store assistant reply
    session.history.push({ role: 'assistant', content: reply, ts: Date.now() });

    return res.json({ success: true, data: { sessionId: id, reply, raw: data } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   POST /api/ai/upload
 * @desc    Upload a file for OCR/processing (images, PDFs, CSV/XLSX)
 * @access  Private
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Resolve Python path robustly (venv -> env -> common install paths -> PATH)
    const pythonPath = resolvePythonExecutable();
    const scriptPath = path.join(__dirname, '..', '..', 'python', 'process_file.py');
    const filePath = req.file.path;

    // Spawn Python processor
    const py = spawn(pythonPath, [scriptPath, filePath], {
      env: {
        ...process.env,
        // Allow overriding Tesseract/Poppler via env in backend process
        TESSERACT_PATH: process.env.TESSERACT_PATH || 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
        // Prefer bundled poppler if present; user can override via env
        POPPLER_PATH: process.env.POPPLER_PATH || path.join(__dirname, '..', '..', 'python', 'poppler')
      },
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let responded = false;
    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });
    const toAbsoluteUrl = (storedPath) => {
      try {
        const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http');
        const host = req.get('host');
        // storedPath already normalized like 'uploads/filename.ext'
        return `${proto}://${host}/${storedPath}`;
      } catch (_) {
        return `/${storedPath}`;
      }
    };

    py.on('error', (err) => {
      if (responded) return;
      responded = true;
      const storedPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
      const meta = {
        originalName: req.file.originalname,
        storedPath,
        fileUrl: toAbsoluteUrl(storedPath),
        size: req.file.size,
        mimetype: req.file.mimetype
      };
      const canonical = canonicalizeStructured({ rawText: '', structured: {}, meta });
      if (canonical && canonical.source) canonical.source.fileUrl = meta.fileUrl;
      return res.json({
        success: true,
        message: 'Processed with fallback (Python not available)',
        data: { id: crypto.randomUUID(), ...meta, text: '', structured: null, canonical, warnings: ['python_not_found', err.message] }
      });
    });

    py.on('close', (code) => {
      if (responded) return;
      try {
        const parsed = JSON.parse(stdout || '{}');
        const storedPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const meta = {
          originalName: req.file.originalname,
          storedPath,
          fileUrl: toAbsoluteUrl(storedPath),
          size: req.file.size,
          mimetype: req.file.mimetype
        };
        if (!parsed.success) {
          // Soft-fail: return canonical fallback with warnings rather than 500
          const canonical = canonicalizeStructured({ rawText: '', structured: {}, meta });
          if (canonical && canonical.source) canonical.source.fileUrl = meta.fileUrl;
          responded = true;
          return res.json({
            success: true,
            message: 'Processed with fallback (python reported failure)',
            data: { id: crypto.randomUUID(), ...meta, text: '', structured: null, canonical, warnings: ['python_success_false', parsed.error || 'unknown_error', stderr] }
          });
        }
        const canonical = canonicalizeStructured({
          rawText: parsed.text || '',
          structured: parsed.structured || {},
          meta
        });
        if (canonical && canonical.source) canonical.source.fileUrl = meta.fileUrl;
        const id = crypto.randomUUID();
        processedStore.push({ id, ...meta, extractedAt: canonical.extractedAt, canonical });
        responded = true;
        return res.json({
          success: true,
          message: 'File processed successfully',
          data: {
            id,
            ...meta,
            text: parsed.text,
            structured: parsed.structured || null,
            canonical,
            fileUrl: meta.fileUrl,
            warnings: parsed.warnings || []
          }
        });
      } catch (e) {
        responded = true;
        const storedPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const meta = {
          originalName: req.file.originalname,
          storedPath,
          fileUrl: toAbsoluteUrl(storedPath),
          size: req.file.size,
          mimetype: req.file.mimetype
        };
        const canonical = canonicalizeStructured({ rawText: '', structured: {}, meta });
        if (canonical && canonical.source) canonical.source.fileUrl = meta.fileUrl;
        return res.json({
          success: true,
          message: 'Processed with fallback (output parse failed)',
          data: { id: crypto.randomUUID(), ...meta, text: '', structured: null, canonical, warnings: ['parse_failed', String(e), stderr] }
        });
      }
    });
  } catch (err) {
    console.error('Upload processing error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   GET /api/ai/processed
 * @desc    List processed documents (metadata only)
 * @access  Private
 */
router.get('/processed', (req, res) => {
  const list = processedStore.map(p => ({
    id: p.id,
    originalName: p.originalName,
    storedPath: p.storedPath,
  fileUrl: p.canonical?.source?.fileUrl || `/${p.storedPath}`,
    size: p.size,
    mimetype: p.mimetype,
    extractedAt: p.extractedAt,
    currency: p.canonical.fields.currency,
    grandTotal: p.canonical.amounts.grandTotal,
  }));
  res.json({ success: true, data: { count: list.length, documents: list } });
});

/**
 * @route   GET /api/ai/processed/:id
 * @desc    Get full canonical JSON for a processed document
 * @access  Private
 */
router.get('/processed/:id', (req, res) => {
  const doc = processedStore.find(p => p.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  res.json({ success: true, data: doc.canonical });
});

/**
 * @route   GET /api/ai/file/:id
 * @desc    Stream the originally uploaded file by processed document ID
 * @access  Private
 */
router.get('/file/:id', (req, res) => {
  const doc = processedStore.find(p => p.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  const absPath = path.resolve(process.cwd(), doc.storedPath);
  if (!fs.existsSync(absPath)) return res.status(404).json({ success: false, message: 'File missing on server' });
  // Let the browser preview if possible
  res.setHeader('Content-Disposition', `inline; filename="${doc.originalName.replace(/"/g, '')}"`);
  return res.sendFile(absPath);
});

/**
 * @route   POST /api/ai/categorize
 * @desc    Categorize transactions
 * @access  Private
 */
router.post('/categorize', (req, res) => {
  // TODO: Implement transaction categorization
  res.json({
    success: true,
    message: 'Categorization endpoint - to be implemented',
    data: {
      categorizationId: 'cat_789012',
      transactions: [],
      summary: {
        totalTransactions: 0,
        categorizedCount: 0,
        uncategorizedCount: 0,
        averageConfidence: 0
      }
    }
  });
});

/**
 * @route   GET /api/ai/categories
 * @desc    Get available categories
 * @access  Private
 */
router.get('/categories', (req, res) => {
  // TODO: Implement categories retrieval
  res.json({
    success: true,
    message: 'Categories endpoint - to be implemented',
    data: {
      categories: [
        {
          id: 'office_supplies',
          name: 'Office Supplies',
          color: '#1976d2',
          icon: 'ic-office'
        },
        {
          id: 'travel',
          name: 'Travel',
          color: '#388e3c',
          icon: 'ic-travel'
        }
      ]
    }
  });
});

/**
 * @route   GET /api/ai/logs
 * @desc    Get categorization logs
 * @access  Private
 */
router.get('/logs', (req, res) => {
  // TODO: Implement logs retrieval
  res.json({
    success: true,
    message: 'Logs endpoint - to be implemented',
    data: {
      logs: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      }
    }
  });
});

module.exports = router; 
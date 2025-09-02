/**
 * Invoice Routes
 * Handles invoice management endpoints
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
const { extractRegexFields, deriveAmountsFromText, mapToExpected } = require('./parser.util');

// Multer storage for uploads
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const stamp = Date.now();
    cb(null, `${base}-${stamp}${ext}`);
  },
});

const allowedExt = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.csv', '.xlsx']);
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.has(ext)) {
      return cb(new Error(`Unsupported file type: ${ext}`));
    }
    cb(null, true);
  },
});

function getPythonExec() {
  return process.env.PYTHON_PATH || 'python'; // on Windows, ensure python is on PATH
}

/**
 * @route   POST /api/invoices/parse
 * @desc    Upload an invoice (PDF/Image/CSV/XLSX) and get structured JSON via OCR+parsing
 * @access  Private
 */
router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const filePath = req.file.path;
    const pythonFile = path.join(__dirname, '..', '..', 'python', 'process_file.py');

    const py = spawn(getPythonExec(), [pythonFile, filePath], {
      env: {
        ...process.env,
        // Optional: configure binaries if installed in custom paths
        // TESSERACT_PATH: 'C\\\\Program Files\\\\Tesseract-OCR\\\\tesseract.exe',
        // POPPLER_PATH: path.join(__dirname, '..', '..', 'python', 'poppler', 'extracted'),
      },
      windowsHide: true,
    });

    let out = '';
    let err = '';
    py.stdout.on('data', (d) => (out += d.toString()));
    py.stderr.on('data', (d) => (err += d.toString()));
  py.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ success: false, message: 'OCR process failed', error: err || out });
      }
      try {
    const parsed = JSON.parse(out);
    const text = parsed?.text || '';
    const structured = parsed?.structured || {};
    // Regex and proximity based extraction overlay
    const regexFields = extractRegexFields(text);
    const amountCandidates = deriveAmountsFromText(text);
    const extracted = mapToExpected(structured, regexFields, amountCandidates);
    return res.json({ success: true, data: { extracted, raw: parsed } });
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to parse OCR output', error: e.message, raw: out });
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
});

/**
 * @route   GET /api/invoices
 * @desc    Get all invoices
 * @access  Private
 */
router.get('/', (req, res) => {
  // TODO: Implement invoice listing
  res.json({
    success: true,
    message: 'Invoice listing endpoint - to be implemented',
    data: {
      invoices: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      }
    }
  });
});

/**
 * @route   POST /api/invoices
 * @desc    Create new invoice
 * @access  Private
 */
router.post('/', (req, res) => {
  // TODO: Implement invoice creation
  res.json({
    success: true,
    message: 'Invoice creation endpoint - to be implemented',
    data: {
      invoice: {
        id: 'inv_123',
        invoiceNumber: 'INV-2024-001',
        ...req.body
      }
    }
  });
});

/**
 * @route   GET /api/invoices/:id
 * @desc    Get invoice by ID
 * @access  Private
 */
router.get('/:id', (req, res) => {
  // TODO: Implement invoice retrieval
  res.json({
    success: true,
    message: 'Invoice retrieval endpoint - to be implemented',
    data: {
      invoice: {
        id: req.params.id,
        invoiceNumber: 'INV-2024-001',
        status: 'draft'
      }
    }
  });
});

/**
 * @route   PUT /api/invoices/:id
 * @desc    Update invoice
 * @access  Private
 */
router.put('/:id', (req, res) => {
  // TODO: Implement invoice update
  res.json({
    success: true,
    message: 'Invoice update endpoint - to be implemented',
    data: {
      invoice: {
        id: req.params.id,
        ...req.body,
        updatedAt: new Date().toISOString()
      }
    }
  });
});

/**
 * @route   DELETE /api/invoices/:id
 * @desc    Delete invoice
 * @access  Private
 */
router.delete('/:id', (req, res) => {
  // TODO: Implement invoice deletion
  res.json({
    success: true,
    message: 'Invoice deleted successfully'
  });
});

/**
 * @route   POST /api/invoices/:id/pdf
 * @desc    Generate PDF for invoice
 * @access  Private
 */
router.post('/:id/pdf', (req, res) => {
  // TODO: Implement PDF generation
  res.json({
    success: true,
    message: 'PDF generation endpoint - to be implemented',
    data: {
      pdfUrl: `/uploads/invoices/${req.params.id}.pdf`
    }
  });
});

module.exports = router; 
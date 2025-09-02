/**
 * Bookkeeping Routes (In-memory)
 * Provides endpoints for General Journal, Cash Receipts, Cash Disbursements, and General Ledger.
 * Shapes are aligned to the frontend pages under dashboard/bookkeeping/*.
 */

const express = require('express');
const router = express.Router();

// --- In-memory stores (ephemeral) ---
let journal = []; // { id, date, ref, entries: [{ account, description, type: 'debit'|'credit', amount }] }
let cashReceipts = []; // { id, date, invoiceNumber, description, netSales, feesAndCharges, cash, withholdingTax, ownersCapital, loansPayable }
let cashDisbursements = []; // { id, date, checkNo, payee, description, amount, account }
let ledger = []; // { id, date, description, ref, type: 'debit'|'credit', amount, balance }

// Utility to create incremental IDs
function nextId(list) { return (list.length ? list[list.length - 1].id : 0) + 1; }

// --- General Journal ---

/**
 * GET /api/bookkeeping/journal
 */
router.get('/journal', (req, res) => {
	return res.json({ success: true, data: { journal } });
});

/**
 * POST /api/bookkeeping/journal
 * Body: { date: 'YYYY-MM-DD', ref?: string, entries: [{ account, description, type, amount }] }
 */
router.post('/journal', express.json(), (req, res) => {
	try {
		const { date, ref = '', entries } = req.body || {};
		if (!date || !Array.isArray(entries) || entries.length < 2) {
			return res.status(400).json({ success: false, message: 'date and at least two entries are required' });
		}
		// Basic balance check
		const debit = entries.reduce((s, e) => s + (e.type === 'debit' ? Number(e.amount) || 0 : 0), 0);
		const credit = entries.reduce((s, e) => s + (e.type === 'credit' ? Number(e.amount) || 0 : 0), 0);
		if (Math.abs(debit - credit) > 0.001) {
			return res.status(400).json({ success: false, message: 'Journal entry must be balanced (debits = credits)' });
		}
		// Idempotency: same date+ref+lines
		const signature = JSON.stringify({ date, ref, entries: entries.map(e => ({ a: e.account, d: e.description, t: e.type, m: Number(e.amount) || 0 })) });
		const duplicate = journal.find(j => JSON.stringify({ date: j.date, ref: j.ref, entries: j.entries.map(e => ({ a: e.account, d: e.description, t: e.type, m: Number(e.amount) || 0 })) }) === signature);
		if (duplicate) return res.json({ success: true, message: 'duplicate_skipped', data: { entry: duplicate } });

		const entry = { id: nextId(journal), date, ref, entries: entries.map(e => ({
			account: String(e.account || ''),
			description: String(e.description || ''),
			type: e.type === 'credit' ? 'credit' : 'debit',
			amount: Number(e.amount) || 0,
		})) };
		journal.push(entry);
		return res.json({ success: true, data: { entry } });
	} catch (e) {
		return res.status(500).json({ success: false, message: e.message });
	}
});

// --- Cash Receipts ---

/**
 * GET /api/bookkeeping/cash-receipts
 */
router.get('/cash-receipts', (req, res) => {
	return res.json({ success: true, data: { receipts: cashReceipts } });
});

/**
 * POST /api/bookkeeping/cash-receipts
 * Body: { date, invoiceNumber, description, netSales, feesAndCharges, cash, withholdingTax, ownersCapital, loansPayable }
 */
router.post('/cash-receipts', express.json(), (req, res) => {
	try {
		const b = req.body || {};
		if (!b.date) return res.status(400).json({ success: false, message: 'date is required' });
		const entry = {
			id: nextId(cashReceipts),
			date: String(b.date),
			invoiceNumber: String(b.invoiceNumber || ''),
			description: String(b.description || ''),
			netSales: Number(b.netSales) || 0,
			feesAndCharges: Number(b.feesAndCharges) || 0,
			cash: Number(b.cash) || 0,
			withholdingTax: Number(b.withholdingTax) || 0,
			ownersCapital: Number(b.ownersCapital) || 0,
			loansPayable: Number(b.loansPayable) || 0,
		};
		cashReceipts.push(entry);
		return res.json({ success: true, data: { entry } });
	} catch (e) {
		return res.status(500).json({ success: false, message: e.message });
	}
});

// --- Cash Disbursements ---

/**
 * GET /api/bookkeeping/cash-disbursements
 */
router.get('/cash-disbursements', (req, res) => {
	return res.json({ success: true, data: { disbursements: cashDisbursements } });
});

/**
 * POST /api/bookkeeping/cash-disbursements
 * Body: { date, checkNo?, payee, description, amount, account }
 */
router.post('/cash-disbursements', express.json(), (req, res) => {
	try {
		const b = req.body || {};
		if (!b.date || !b.payee || !b.description) {
			return res.status(400).json({ success: false, message: 'date, payee, and description are required' });
		}
		const entry = {
			id: nextId(cashDisbursements),
			date: String(b.date),
			checkNo: String(b.checkNo || ''),
			payee: String(b.payee || ''),
			description: String(b.description || ''),
			amount: Number(b.amount) || 0,
			account: String(b.account || ''),
		};
		cashDisbursements.push(entry);
		return res.json({ success: true, data: { entry } });
	} catch (e) {
		return res.status(500).json({ success: false, message: e.message });
	}
});

// --- General Ledger ---

/**
 * GET /api/bookkeeping/ledger
 */
router.get('/ledger', (req, res) => {
	return res.json({ success: true, data: { ledger } });
});

/**
 * POST /api/bookkeeping/ledger
 * Body: { date, account?, description, type: 'debit'|'credit', amount }
 */
router.post('/ledger', express.json(), (req, res) => {
	try {
		const b = req.body || {};
		if (!b.date || !b.description || !b.type) {
			return res.status(400).json({ success: false, message: 'date, description, and type are required' });
		}
		const amount = Number(b.amount) || 0;
		const type = b.type === 'credit' ? 'credit' : 'debit';
		const prevBal = ledger.length ? Number(ledger[ledger.length - 1].balance) || 0 : 0;
		const balance = type === 'debit' ? prevBal + amount : prevBal - amount;
		const id = nextId(ledger);
		const ref = (type === 'credit' ? 'CR' : 'CD') + String(id).padStart(2, '0');
		const entry = {
			id,
			date: String(b.date),
			description: String(b.description || ''),
			ref,
			type,
			amount,
			balance,
		};
		ledger.push(entry);
		return res.json({ success: true, data: { entry } });
	} catch (e) {
		return res.status(500).json({ success: false, message: e.message });
	}
});

module.exports = router;


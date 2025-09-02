'use client';

import { useState, useEffect, useMemo } from 'react';
import axios from 'src/utils/axios';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import InputAdornment from '@mui/material/InputAdornment';

import { fNumber } from 'src/utils/format-number';

import { DashboardContent } from 'src/layouts/dashboard';
import { Iconify } from 'src/components/iconify';
import { Label } from 'src/components/label';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Chip, Tooltip } from '@mui/material';

// ----------------------------------------------------------------------

const MOCK_DISBURSEMENT_ENTRIES = [
  {
    id: 1,
    date: 'Aug 15, 2024',
    invoiceNumber: 'SI0876213',
    description: 'DTI Certificate',
    creditCash: 1030,
    debitEquipment: 0,
    debitFurnitureFixtures: 0,
    debitTaxesLicenses: 1030,
    debitOfficeSupplies: 0,
    debitInventory: 0,
    debitSalary: 0,
    debitFreightDelivery: 0,
    debitAdvertising: 0,
    debitProfessionalFee: 0,
    debitUtilities: 0,
    debitRent: 0,
    creditWithholdingTax: 0,
    debitBankLoan: 0,
    debitInterestExpense: 0,
    debitOwnersWithdrawal: 0,
    entity: 'DTI',
  },
  // ... other mock entries ...
];

// Helper to map a backend disbursement entry to the extended table schema (flat, full columns)
function mapDisbursementToRow(d) {
  return {
    id: d.id,
    date: d.date,
    referenceNo: d.referenceNo || d.checkNo || '',
    payee: d.payee || '',
    description: d.description || '',
    remarks: d.remarks || '',
    // CREDIT
    creditCash: Number(d.cashCredit || 0),
    // DEBITS (align with backend fields)
    debitPurchases: Number(d.purchasesDebit || 0), // Purchases – Materials
    debitSupplies: Number(d.suppliesDebit || 0), // Supplies Expense
    debitRent: Number(d.rentDebit || 0), // Rent Expense
    debitAdvertising: Number(d.advertisingDebit || 0), // Advertising/Marketing
    debitDelivery: Number(d.deliveryDebit || 0), // Delivery/Transportation
    debitTaxesLicenses: Number(d.taxesDebit || 0), // Taxes & Licenses
    debitMisc: Number(d.miscDebit || 0), // Miscellaneous Expense
  };
}

export default function CashDisbursementPage() {
  useEffect(() => {
    document.title = 'Bookkeeping - Cash Disbursement Journal | Kitsch Studio';
  }, []);
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [rows, setRows] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState('');
  // Import invoice dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null); // { extracted, raw }
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    checkNo: '',
    payee: '',
    description: '',
    amount: '',
    account: '',
  });

  const ACCEPT = '.pdf,.jpg,.jpeg,.png,.csv,.xlsx';
  const onImportFileChange = (e) => {
    setImportError('');
    const f = e.target.files?.[0];
    if (!f) return;
    const ok = ACCEPT.split(',').some((ext) => f.name.toLowerCase().endsWith(ext.trim()));
    if (!ok) {
      setImportError('Unsupported file type. Allowed: PDF, JPG, PNG, CSV, XLSX');
      setImportFile(null);
      return;
    }
    setImportFile(f);
  };
  const parseInvoice = async () => {
    setImportError('');
    if (!importFile) {
      setImportError('Please choose a file first');
      return;
    }
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const resp = await fetch(`${BACKEND_URL}/api/invoices/parse`, { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || data.error || 'Parse failed');
      }
      setImportResult(data.data);
    } catch (err) {
      setImportError(err.message || String(err));
    } finally {
      setImportLoading(false);
    }
  };
  const applyImportedToForm = () => {
    const extracted = importResult?.extracted || {};
    const isUnknown = (v) => v === undefined || v === null || v === '' || String(v).toLowerCase() === 'unknown';
    const amount = !isUnknown(extracted.grand_total)
      ? Number(extracted.grand_total)
      : !isUnknown(extracted.total)
      ? Number(extracted.total)
      : !isUnknown(extracted.subtotal)
      ? Number(extracted.subtotal)
      : '';
    const items = Array.isArray(extracted.items) ? extracted.items : [];
    const desc = items.length ? `Imported: ${items.slice(0, 2).map((i) => i.name).filter(Boolean).join(', ')}${items.length > 2 ? '…' : ''}` : 'Imported from invoice';
    setForm((f) => ({
      ...f,
      date: !isUnknown(extracted.order_date) ? extracted.order_date : f.date,
      checkNo: !isUnknown(extracted.order_number) ? String(extracted.order_number) : f.checkNo,
      payee: !isUnknown(extracted.seller_name) ? String(extracted.seller_name) : f.payee,
      description: desc,
      amount: amount,
      account: f.account,
    }));
    setImportOpen(false);
    setAddOpen(true);
  };

  // Load disbursements from backend and map to table rows
  useEffect(() => {
    const fetchDisbursements = async () => {
      try {
        const res = await axios.get('/api/bookkeeping/cash-disbursements');
        const list = res?.data?.data?.disbursements || [];
        const mapped = list.map(mapDisbursementToRow);
        setRows(mapped);
      } catch (err) {
        console.error('Failed to load cash disbursements:', err);
        // Do not fallback to mock so the UI reflects actual backend state
        // Leave rows as-is to avoid showing sample data
      }
    };
    fetchDisbursements();
  }, []);

  const TOTALS = useMemo(() => {
    const totals = {
      creditCash: 0,
      debitPurchases: 0,
      debitSupplies: 0,
      debitRent: 0,
      debitAdvertising: 0,
      debitDelivery: 0,
      debitTaxesLicenses: 0,
      debitMisc: 0,
    };
    rows.forEach((e) => {
      Object.keys(totals).forEach((k) => {
        totals[k] += Number(e[k] || 0);
      });
    });
    return totals;
  }, [rows]);

  return (
    <DashboardContent maxWidth="xl">
      {/* Header */}
      <Typography variant="h4" sx={{ mb: 1 }}>
        Cash Disbursement Book
      </Typography>
      
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        Dashboard / Bookkeeping / Cash Disbursement Book
      </Typography>

      {/* Overview Section */}
      <Card sx={{ p: 3, mb: 3, bgcolor: 'primary.lighter' }}>
        <Stack direction="row" alignItems="flex-start" spacing={2}>
          <Iconify icon="eva:info-fill" width={24} sx={{ color: 'primary.main', mt: 0.5 }} />
          <Box>
            <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
              Cash Disbursement Book Overview
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Track all cash payments and disbursements made by your business. Monitor expenses, 
              vendor payments, and cash outflows with detailed transaction records and payment history.
            </Typography>
          </Box>
        </Stack>
      </Card>

      {/* Filters & Actions */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Filters & Actions
        </Typography>
        
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            placeholder="Search disbursements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Iconify icon="eva:search-fill" />
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1 }}
          />
          
          <TextField
            select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="All">All</MenuItem>
            <MenuItem value="August">August</MenuItem>
            <MenuItem value="September">September</MenuItem>
            <MenuItem value="October">October</MenuItem>
          </TextField>
          
          <Button
            variant="contained"
            startIcon={<Iconify icon="eva:plus-fill" />}
            sx={{ minWidth: 140 }}
            onClick={() => { setAddError(''); setAddOpen(true); }}
          >
            + Add Entry
          </Button>
          <Button
            variant="outlined"
            startIcon={<Iconify icon="mdi:upload" />}
            sx={{ minWidth: 160 }}
            onClick={() => { setImportError(''); setImportResult(null); setImportFile(null); setImportOpen(true); }}
          >
            Import invoice
          </Button>
        </Stack>
      </Card>

      {/* Cash Disbursement Book Table */}
      <Card sx={{ p: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
              CASH DISBURSEMENT BOOK 
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {rows.length} transactions • August - September 2024
            </Typography>
          </Box>
          
          <Stack direction="row" spacing={1}>
            <IconButton sx={{ color: 'success.main' }}>
              <Iconify icon="logos:excel" />
            </IconButton>
            <IconButton sx={{ color: 'text.secondary' }}>
              <Iconify icon="eva:printer-fill" />
            </IconButton>
          </Stack>
        </Stack>

        <Box sx={{ 
          overflowX: 'auto',
          '&::-webkit-scrollbar': {
            height: 0,
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'transparent',
          },
          '&:hover': {
            '&::-webkit-scrollbar': {
              height: 8,
            },
            '&::-webkit-scrollbar-track': {
              background: '#f1f1f1',
              borderRadius: 4,
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#c1c1c1',
              borderRadius: 4,
              '&:hover': {
                background: '#a8a8a8',
              },
            },
          },
        }}>
          <TableContainer component={Paper} sx={{ 
            boxShadow: 'none', 
            border: `1px solid ${theme.palette.divider}`, 
            minWidth: 1600,
            overflow: 'hidden',
          }}>
            <Table sx={{ '& .MuiTableCell-root': { py: 1, px: 1.5, whiteSpace: 'nowrap' } }}>
              <TableHead>
                {/* Extended flat headers matching backend columns */}
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 120 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 160 }}>Voucher / Ref No.</TableCell>
                  <TableCell sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 240 }}>Payee / Particulars</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 180 }}>Cash / Bank / eWallet (Credit)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 200 }}>Purchases – Materials (Debit)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 180 }}>Supplies Expense (Debit)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 160 }}>Rent Expense (Debit)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 220 }}>Advertising / Marketing (Debit)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 220 }}>Delivery / Transportation (Debit)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 200 }}>Taxes & Licenses (Debit)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, borderRight: `1px solid ${theme.palette.divider}`, minWidth: 220 }}>Miscellaneous Expense (Debit)</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 240 }}>Remarks / Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((entry, index) => (
                  <TableRow 
                    key={entry.id} 
                    sx={{ 
                      '&:hover': { bgcolor: 'grey.50' },
                      bgcolor: index % 2 === 0 ? 'white' : 'grey.25',
                      borderBottom: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    <TableCell sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.date}</TableCell>
                    <TableCell sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.referenceNo}</Typography>
                    </TableCell>
                    <TableCell sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{entry.payee}</Typography>
                        {entry.description ? (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{entry.description}</Typography>
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.creditCash > 0 ? `₱${fNumber(entry.creditCash)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.debitPurchases > 0 ? `₱${fNumber(entry.debitPurchases)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.debitSupplies > 0 ? `₱${fNumber(entry.debitSupplies)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.debitRent > 0 ? `₱${fNumber(entry.debitRent)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.debitAdvertising > 0 ? `₱${fNumber(entry.debitAdvertising)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.debitDelivery > 0 ? `₱${fNumber(entry.debitDelivery)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.debitTaxesLicenses > 0 ? `₱${fNumber(entry.debitTaxesLicenses)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>{entry.debitMisc > 0 ? `₱${fNumber(entry.debitMisc)}` : '-'}</TableCell>
                    <TableCell>{entry.remarks || '-'}</TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow sx={{ 
                  bgcolor: '#E3F2FD', 
                  borderTop: `2px solid ${theme.palette.primary.main}`,
                }}>
                  <TableCell colSpan={3} sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      TOTAL
                    </Typography>
                  </TableCell>
                  {/* CREDIT totals */}
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.creditCash)}
                    </Typography>
                  </TableCell>
                  {/* DEBIT totals */}
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.debitPurchases)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.debitSupplies)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.debitRent)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.debitAdvertising)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.debitDelivery)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.debitTaxesLicenses)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ borderRight: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      ₱{fNumber(TOTALS.debitMisc)}
                    </Typography>
                  </TableCell>
                  {/* Remarks total cell (non-numeric) */}
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Card>

      {/* Add Entry Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Cash Disbursement Entry</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {addError ? <Alert severity="error">{addError}</Alert> : null}
            <TextField
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Check / Ref No. (optional)"
              value={form.checkNo}
              onChange={(e) => setForm((f) => ({ ...f, checkNo: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Payee / Entity"
              value={form.payee}
              onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Amount (₱)"
              type="number"
              inputProps={{ step: '0.01', min: '0' }}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Expense Account (e.g., Utilities, Rent, Office Supplies)"
              value={form.account}
              onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              setAddError('');
              const amountNum = Number(form.amount) || 0;
              const accountStr = (form.account || '').toLowerCase();
              // Map free-text account to backend debit field
              const acctMap = [
                { keys: ['purchase', 'material', 'inventory'], field: 'purchasesDebit' },
                { keys: ['suppl'], field: 'suppliesDebit' },
                { keys: ['rent'], field: 'rentDebit' },
                { keys: ['advert', 'marketing'], field: 'advertisingDebit' },
                { keys: ['deliver', 'freight', 'transport'], field: 'deliveryDebit' },
                { keys: ['tax', 'license'], field: 'taxesDebit' },
                { keys: ['misc', 'other'], field: 'miscDebit' },
              ];
              let debitField = 'purchasesDebit';
              for (const m of acctMap) {
                if (m.keys.some((k) => accountStr.includes(k))) { debitField = m.field; break; }
              }
              const payload = {
                date: form.date,
                referenceNo: form.checkNo || '',
                payee: form.payee?.trim(),
                remarks: form.description?.trim(),
                cashCredit: amountNum,
                // dynamic debit
                [debitField]: amountNum,
              };
              if (!payload.date || !payload.payee || !payload.remarks) {
                setAddError('Please provide date, payee, and description.');
                return;
              }
              try {
                const res = await axios.post('/api/bookkeeping/cash-disbursements', payload);
                const entry = res?.data?.data?.entry;
                if (entry) {
                  setRows((prev) => [...prev, mapDisbursementToRow(entry)]);
                  setAddOpen(false);
                  setForm({ date: new Date().toISOString().slice(0, 10), checkNo: '', payee: '', description: '', amount: '', account: '' });
                } else {
                  setAddError('Unexpected response from server.');
                }
              } catch (err) {
                setAddError(err?.response?.data?.message || err.message || 'Failed to add entry');
              }
            }}
          >
            Save Entry
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Invoice Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Invoice</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {importError ? <Alert severity="error">{importError}</Alert> : null}
            <Button variant="outlined" component="label">
              Choose file
              <input type="file" accept={ACCEPT} hidden onChange={onImportFileChange} />
            </Button>
            {importFile ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Selected: {importFile.name}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={parseInvoice} disabled={importLoading || !importFile}>
              {importLoading ? 'Processing…' : 'Parse Invoice'}
            </Button>
            {importResult ? (
              <Box sx={{ mt: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview</Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Order/Invoice: {importResult.extracted?.order_number}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Seller: {importResult.extracted?.seller_name}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Date: {importResult.extracted?.order_date}
                </Typography>
                {(() => {
                  const s = importResult?.raw?.structured || {};
                  const currency = s?.currency || '₱';
                  const amt = (importResult.extracted?.grand_total ?? importResult.extracted?.total ?? importResult.extracted?.subtotal);
                  const fmtAmt = (v) => (v === 0 || (v != null && !Number.isNaN(Number(v))))
                    ? `${currency}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '[N/A]';
                  const gtDetectedBold = s?.grandTotalDetectedByBold;
                  const gtSource = s?.grandTotalSource;
                  const gtConf = (typeof s?.grandTotalConfidence === 'number') ? s.grandTotalConfidence : null;
                  const gtVerified = s?.grandTotalVerifiedByBreakdown;
                  const gtDelta = (typeof s?.grandTotalVerifiedDelta === 'number') ? s.grandTotalVerifiedDelta : null;
                  const gtBoldText = s?.grandTotalBoldText || '';
                  const prettyDelta = (d) => `${currency}${Math.abs(Number(d) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  return (
                    <>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        Amount: {fmtAmt(amt)}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                        {gtVerified === true && (
                          <Chip size="small" color="success" label="Grand total verified" icon={<Iconify icon="eva:checkmark-circle-2-fill" />} />
                        )}
                        {gtVerified === false && (
                          <Chip size="small" color="warning" label={`Grand total mismatch Δ ${prettyDelta(gtDelta)}`} icon={<Iconify icon="eva:alert-triangle-fill" />} />
                        )}
                        {gtVerified == null && (
                          <Chip size="small" color="default" label="Verification unavailable" />
                        )}
                        {gtDetectedBold === true && (
                          gtBoldText ? (
                            <Tooltip title={<Box sx={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{gtBoldText}</Box>}>
                              <Chip size="small" color="info" label="Detected from bold text" />
                            </Tooltip>
                          ) : (
                            <Chip size="small" color="info" label="Detected from bold text" />
                          )
                        )}
                        {gtSource && (
                          <Chip size="small" variant="outlined" label={`Source: ${gtSource}`} />
                        )}
                        {typeof gtConf === 'number' && (
                          <Chip size="small" variant="outlined" label={`Confidence: ${Math.round(gtConf * 100)}%`} />
                        )}
                        {s?.amountInWords ? (
                          <Chip size="small" variant="outlined" label={`Amount in words: ${String(s.amountInWords)}`} />
                        ) : null}
                      </Stack>
                    </>
                  );
                })()}
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                  Items: {(importResult.extracted?.items || []).slice(0, 3).map((i) => i.name).filter(Boolean).join(', ')}
                </Typography>
              </Box>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Close</Button>
          <Button variant="contained" disabled={!importResult} onClick={applyImportedToForm}>Use in Add Entry</Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
} 
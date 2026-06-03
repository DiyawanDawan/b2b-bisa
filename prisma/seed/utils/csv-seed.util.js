import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SEED_DATA_DIR = path.join(__dirname, '..', 'data');

/** RFC 4180-ish CSV parser for seed files (handles quoted commas). */
export function parseCsv(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = (cols[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function splitCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cols.push(cur);
      cur = '';
      continue;
    }
    cur += char;
  }
  cols.push(cur);
  return cols;
}

/** Parse amount strings like "50,000.00", "1,000.00", or "-" (unlimited). */
export function parseAmount(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value === '-') return null;
  const normalized = value.replace(/,/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function readSeedCsv(filename) {
  const filePath = path.join(SEED_DATA_DIR, filename);
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

const PAYMENT_TYPE_TO_GROUP = {
  'BANK TRANSFER': 'BANK_TRANSFER',
  EWALLET: 'E_WALLET',
  'QR CODE': 'QRIS',
  CARDS: 'CREDIT_CARD',
  'CARDS INSTALLMENT': 'CREDIT_CARD',
  'OVER THE COUNTER': 'CASH',
  'ONLINE BANKING': 'BANK_TRANSFER',
  PAYLATER: null,
  CRYPTOCURRENCY: null,
};

export function mapPaymentTypeToGroup(xenditType) {
  return PAYMENT_TYPE_TO_GROUP[xenditType?.toUpperCase()] ?? null;
}

export function mapPayoutChannelType(raw) {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'bank') return 'Bank';
  if (normalized === 'e-wallet') return 'E-Wallet';
  return raw;
}

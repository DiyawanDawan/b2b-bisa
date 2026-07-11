/** Minimal RFC4180-ish CSV parser for bulk product import. */
export function parseCsvRows(buffer: Buffer): Array<Record<string, string>> {
  const text = buffer
    .toString('utf-8')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!text) return [];

  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length) lines.push(current);
  return lines;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export const PRODUCT_BULK_CSV_TEMPLATE = [
  'name,biomassaType,grade,pricePerUnit,stock,minOrder,unit,description,status',
  'Biochar Premium Grade A,BIOCHAR,A,15000,50,1,TON,Deskripsi produk,DRAFT',
  'Sekam Padi Kering,SEKAM_PADI,,1500,200,5,TON,Limbah organik,DRAFT',
].join('\n');

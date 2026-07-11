/** Parse one CSV line (supports quoted fields with commas). */
export const parseCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
};

/** Turn CSV rows into plain text suitable for RAG chunking. */
export const csvBufferToText = (buffer: Buffer): string => {
  const raw = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return '';

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, rowIdx) => {
    const cols = parseCsvLine(line);
    const pairs = headers
      .map((header, colIdx) => {
        const value = cols[colIdx]?.trim();
        if (!header || !value) return null;
        return `${header}: ${value}`;
      })
      .filter(Boolean);
    if (pairs.length === 0) return null;
    return `Baris ${rowIdx + 1}\n${pairs.join('\n')}`;
  });

  return rows.filter(Boolean).join('\n\n');
};

export const chunkText = (
  text: string,
  options: { maxChars?: number; overlap?: number } = {},
): string[] => {
  const maxChars = options.maxChars ?? 900;
  const overlap = options.overlap ?? 120;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buffer = '';

  const flush = () => {
    const piece = buffer.trim();
    if (piece.length >= 40) chunks.push(piece);
    buffer = '';
  };

  for (const para of paragraphs) {
    if ((buffer + '\n\n' + para).length <= maxChars) {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
      continue;
    }
    if (buffer) flush();
    if (para.length <= maxChars) {
      buffer = para;
      continue;
    }
    let start = 0;
    while (start < para.length) {
      const end = Math.min(start + maxChars, para.length);
      chunks.push(para.slice(start, end).trim());
      if (end >= para.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }
  flush();
  return chunks;
};

export const buildRagContext = (
  hits: Array<{ content: string; title?: string; source?: string }>,
): string => {
  if (hits.length === 0) return '';
  return hits
    .map((hit, i) => {
      const header = [hit.title, hit.source].filter(Boolean).join(' — ');
      return `[Sumber ${i + 1}${header ? `: ${header}` : ''}]\n${hit.content}`;
    })
    .join('\n\n---\n\n');
};

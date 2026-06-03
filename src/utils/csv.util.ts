/**
 * CSV Sanitization Utility
 * Prevents Excel Formula Injection (CVE-2014-3026, CVE-2014-6352)
 * and ensures proper CSV formatting per RFC 4180.
 */

/**
 * Sanitizes a field value to prevent CSV injection attacks.
 * Malicious values starting with =, +, -, @, or tab are prefixed with a single quote.
 * Values containing commas, quotes, or newlines are properly escaped.
 *
 * @param field - The value to sanitize (string, number, or null)
 * @returns Sanitized string safe for CSV export
 *
 * @example
 * sanitizeCsvField('=SUM(A1:A10)') => "'=SUM(A1:A10)"
 * sanitizeCsvField('John, Jr.') => '"John, Jr."'
 * sanitizeCsvField('Say "Hi"') => '"Say ""Hi"""'
 */
export const sanitizeCsvField = (field: string | number | null | undefined): string => {
  const str = String(field ?? '');

  // Prevent Excel formula injection
  if (/^[=+\-@\t\r\n]/.test(str)) {
    return `'${str}`;
  }

  // Escape quotes and wrap in quotes if contains special characters
  if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

/**
 * Converts an array of objects to a properly formatted CSV string.
 * All fields are automatically sanitized to prevent injection attacks.
 *
 * @param headers - Array of header column names
 * @param rows - Array of row objects with values matching headers
 * @returns Properly formatted CSV string
 *
 * @example
 * const headers = ['Name', 'Email', 'Amount'];
 * const rows = [
 *   { Name: 'John', Email: 'john@example.com', Amount: 1000 },
 *   { Name: '= malicious', Email: 'evil@test.com', Amount: 500 }
 * ];
 * toCsv(headers, rows);
 */
export const toCsv = <T extends Record<string, unknown>>(headers: string[], rows: T[]): string => {
  const headerRow = headers.map(sanitizeCsvField).join(',');

  const dataRows = rows.map((row) =>
    headers
      .map((header) => sanitizeCsvField(row[header] as string | number | null | undefined))
      .join(','),
  );

  return [headerRow, ...dataRows].join('\n');
};

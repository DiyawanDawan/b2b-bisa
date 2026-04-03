/**
 * Standard Timezone for business logic
 */
export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/**
 * Get current date/time adjusted to the standard timezone
 */
export const getNow = (): Date => {
  return new Date();
};

/**
 * Extract time parts (hours, minutes) in the standard timezone
 */
export const getTimeParts = (date: Date) => {
  const jakartaDate = new Date(date.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE }));
  const hour = jakartaDate.getHours();
  const minute = jakartaDate.getMinutes();

  return { hour, minute, totalMinutes: hour * 60 + minute };
};

/**
 * Get the day of week (0-6) in the standard timezone
 */
export const getDayOfWeek = (date: Date): number => {
  const jakartaDate = new Date(date.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE }));
  return jakartaDate.getDay();
};

/**
 * Parse a date string (ISO or simple YYYY-MM-DD HH:mm) in the target timezone
 */
export const parseInTimezone = (dateStr: string): Date => {
  if (!dateStr) return new Date();

  // If it already has a timezone indicator (Z or offset), let the native parser handle it
  if (dateStr.includes('Z') || dateStr.match(/[+-]\d{2}:?\d{2}$/)) {
    return new Date(dateStr);
  }

  // Otherwise, assume it's a local time string for Jakarta
  // Replace space with T if needed
  const normalized = dateStr.replace(' ', 'T');
  // If it's just a date (YYYY-MM-DD), add a default time
  const fullStr = normalized.length <= 10 ? `${normalized}T00:00:00` : normalized;

  return new Date(`${fullStr}+07:00`);
};

/**
 * Get Start and End of a specific date string in the target timezone
 */
export const getDayBoundaries = (dateStr: string) => {
  // Interpret dateStr as a date in Jakarta
  // We use the date string directly to avoid JS local timezone interpretaton issues
  const start = new Date(`${dateStr}T00:00:00.000+07:00`);
  const end = new Date(`${dateStr}T23:59:59.999+07:00`);
  return { start, end };
};

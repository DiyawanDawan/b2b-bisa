import { z } from 'zod';

/**
 * Uniform list contract for `/api/v1/admin/*`:
 * - `page`: integer >= 1, default 1
 * - `limit`: integer 1..max, with a module-specific default
 * - `search`: optional string
 * - enum filters use their domain field name (`status`, `role`, etc.)
 * - boolean filters are the strings `true` or `false`
 *
 * List responses use `paginatedResponse`: `data[]` plus
 * `pagination { page, limit, total, totalPages }`.
 */
export const queryPage = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
}, z.number().int().min(1).default(1));

export const queryLimit = (max: number, fallback: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Number(value);
  }, z.number().int().min(1).max(max).default(fallback));

export const queryBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

export const idParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
});

export const paginationQuerySchema = z.object({
  page: queryPage,
  limit: queryLimit(100, 10),
  search: z.string().optional(),
});

/**
 * Baseline permission Fase 0.
 *
 * BISA currently has one administrative role. This matrix is the source of truth
 * for which action families that role may perform; route authorization remains
 * centralized at `/api/v1/admin` via `requireAuth`, `isAdmin`, and
 * `adminActionLimiter`.
 */
export const ADMIN_ROLE = 'ADMIN' as const;

export const ADMIN_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'moderate',
  'approve',
  'export',
  'broadcast',
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export const ADMIN_PERMISSION_MATRIX = {
  dashboard: ['read'],
  users: ['read', 'update', 'moderate'],
  finance: ['read', 'create', 'update', 'delete', 'approve', 'export'],
  orders: ['read', 'update', 'moderate'],
  products: ['read', 'create', 'update', 'moderate', 'delete'],
  notifications: ['read', 'broadcast'],
  gis: ['read', 'create', 'update', 'delete'],
  analytics: ['read'],
  forum: ['read', 'create', 'update', 'delete', 'moderate'],
  policies: ['read', 'create', 'update'],
  platformSettings: ['read', 'update'],
  wallets: ['read', 'update'],
  market: ['read', 'create', 'update', 'delete'],
  chat: ['read', 'create'],
  crm: ['read', 'create', 'update'],
  iot: ['read'],
  vouchers: ['read', 'create', 'update', 'delete'],
  knowledge: ['read', 'create', 'update', 'delete'],
  support: ['read', 'create', 'update'],
  partnerships: ['read', 'approve', 'update'],
  bisaExpress: ['read', 'create', 'update', 'delete', 'export'],
  harvestLots: ['read', 'update', 'moderate'],
  productCollections: ['read', 'create', 'update', 'delete'],
  storeBanners: ['read', 'update', 'moderate', 'approve'],
  productQuestions: ['read', 'update', 'moderate'],
  rfqs: ['read', 'update', 'moderate'],
  bookings: ['read', 'update', 'moderate'],
  reviews: ['read', 'moderate', 'delete'],
  referrals: ['read', 'approve', 'update'],
  liveSessions: ['read', 'update', 'moderate'],
} as const satisfies Record<string, readonly AdminAction[]>;

export type AdminModule = keyof typeof ADMIN_PERMISSION_MATRIX;

export function adminCan(module: AdminModule, action: AdminAction): boolean {
  return (ADMIN_PERMISSION_MATRIX[module] as readonly AdminAction[]).includes(action);
}

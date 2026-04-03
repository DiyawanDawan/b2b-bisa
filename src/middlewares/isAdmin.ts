import { UserRole } from '#prisma';
import { requireRole } from '#middlewares/authMiddleware';

/**
 * Middleware spesifik untuk memvalidasi apakah user memiliki role ADMIN.
 * Ini adalah wrapper dari requireRole(UserRole.ADMIN) untuk pemanggilan yang lebih ringkas.
 */
export const isAdmin = requireRole(UserRole.ADMIN);

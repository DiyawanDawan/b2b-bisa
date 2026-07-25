import { requireAuth } from '#middlewares/authMiddleware';
import { isAdmin } from '#middlewares/isAdmin';
import { adminActionLimiter } from '#middlewares/rateLimiter';

/**
 * Applied once at the `/api/v1/admin` root so every current and future child
 * route receives authentication, ADMIN authorization, and mutation limiting.
 */
export const adminAccessMiddleware = [requireAuth, isAdmin, adminActionLimiter] as const;

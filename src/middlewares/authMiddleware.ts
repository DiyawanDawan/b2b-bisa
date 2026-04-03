import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '#config/prisma';
import { UserRole, AuthRequest, UserStatus, AuthUser } from '#types/index';
export { AuthRequest, AuthUser };
import { errorResponse } from '#utils/response.util';
import { JWT_SECRET } from '#utils/env.util';

interface DecodedToken {
  userId: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Middleware to require authentication via JWT
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      errorResponse(res, 'Authentication required. Missing or invalid Bearer token.', 401);
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT token
    let decoded: DecodedToken;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    } catch (_err) {
      errorResponse(res, 'Invalid or expired token.', 401);
      return;
    }

    // Fetch user from database to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        status: true,
        tier: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!user) {
      errorResponse(res, 'User no longer exists.', 401);
      return;
    }

    if (user.status !== UserStatus.ACTIVE) {
      errorResponse(res, 'Account is inactive. Please contact administrator.', 403);
      return;
    }

    // Attach user information to request object
    req.user = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      tier: user.tier,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware to restrict access based on user roles
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      errorResponse(res, 'Authentication required.', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      errorResponse(res, 'Forbidden. Insufficient permissions for this resource.', 403);
      return;
    }

    next();
  };
};

/**
 * Middleware to optionally authenticate via JWT
 * Does not block request if token is missing or invalid
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Guest mode
    }

    const token = authHeader.split(' ')[1];

    let decoded: DecodedToken;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    } catch (_err) {
      return next(); // Invalid token, treat as guest
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        status: true,
        tier: true,
        subscriptionExpiresAt: true,
      },
    });

    if (user && user.status === UserStatus.ACTIVE) {
      req.user = {
        id: user.id,
        role: user.role as UserRole,
        fullName: user.fullName,
        email: user.email,
        tier: user.tier,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
      };
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware to restrict access based on PRO tier subscription.
 */
export const requireTierPro = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    errorResponse(res, 'Authentication required.', 401);
    return;
  }

  // Admin bypass tier check
  if (req.user.role === 'ADMIN') {
    return next();
  }

  if (req.user.tier !== 'PRO') {
    errorResponse(
      res,
      'Akses ditolak. Fitur ini eksklusif bagi pengguna PRO. Silakan berlangganan untuk membuka fitur ini.',
      403,
    );
    return;
  }

  // Check if subscription has expired
  if (!req.user.subscriptionExpiresAt || req.user.subscriptionExpiresAt < new Date()) {
    errorResponse(
      res,
      'Langganan PRO Anda telah berakhir. Silakan perpanjang langganan Anda.',
      403,
    );
    return;
  }

  next();
};

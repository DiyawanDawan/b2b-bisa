import AppError from '#utils/appError';
import { UserRole } from '#prisma';

export type AccessRequester = { id: string; role: UserRole };

/** Owner or admin only — always 403 (do not leak existence via 404). */
export const assertOwnerOrAdmin = (requester: AccessRequester, ownerId: string): void => {
  if (requester.id !== ownerId && requester.role !== UserRole.ADMIN) {
    throw new AppError('Akses ditolak.', 403);
  }
};

export const isAdminRole = (role: UserRole): boolean => role === UserRole.ADMIN;

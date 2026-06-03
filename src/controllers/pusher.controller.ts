import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import AppError from '#utils/appError';
import pusher from '#config/pusher';
import prisma from '#config/prisma';
import { AuthRequest } from '#types/index';

/**
 * SEC-MOB-004: Pusher private channel authorization.
 *
 * Pola channel yang didukung:
 *   - `private-negotiation-{negotiationId}` → cek user = buyerId|sellerId.
 *   - `private-user-{userId}`               → cek user.id === userId (notifikasi pribadi).
 *
 * Untuk channel lain, default DENY agar tidak menjadi bypass.
 */
export const authorizeChannel = catchAsync(async (req: AuthRequest, res: Response) => {
  const socketId = (req.body?.socket_id ?? req.body?.socketId) as string | undefined;
  const channelName = (req.body?.channel_name ?? req.body?.channelName) as string | undefined;

  if (!socketId || !channelName) {
    throw new AppError('socket_id dan channel_name wajib diisi.', 400);
  }

  if (!channelName.startsWith('private-')) {
    throw new AppError('Channel harus berupa private channel.', 400);
  }

  const userId = req.user!.id;

  // Pattern: private-negotiation-{id}
  const negMatch = channelName.match(/^private-negotiation-([0-9a-fA-F-]{8,})$/);
  if (negMatch) {
    const negotiationId = negMatch[1];
    const negotiation = await prisma.negotiation.findUnique({
      where: { id: negotiationId },
      select: { buyerId: true, sellerId: true },
    });
    if (!negotiation) throw new AppError('Negosiasi tidak ditemukan.', 404);
    if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
      throw new AppError('Bukan participant negosiasi ini.', 403);
    }
    const auth = pusher.authorizeChannel(socketId, channelName);
    return res.json(auth);
  }

  // Pattern: private-user-{userId}
  const userMatch = channelName.match(/^private-user-([0-9a-fA-F-]{8,})$/);
  if (userMatch) {
    const targetUserId = userMatch[1];
    if (targetUserId !== userId) {
      throw new AppError('Akses ditolak.', 403);
    }
    const auth = pusher.authorizeChannel(socketId, channelName);
    return res.json(auth);
  }

  throw new AppError('Channel tidak dikenali.', 403);
});

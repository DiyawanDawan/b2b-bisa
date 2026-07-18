import prisma from '#config/prisma';
import AppError from '#utils/appError';
import pusher from '#config/pusher';
import { createNotification } from '#services/notification.service';
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  SupportMessageSenderType,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketSource,
  SupportTicketStatus,
  UserRole,
} from '#prisma';

const supportChannel = (ticketId: string) => `private-support-${ticketId}`;

const emitSupportEvent = (
  ticketId: string,
  event: 'message.created' | 'ticket.updated',
  payload: Record<string, unknown>,
) => {
  pusher.trigger(supportChannel(ticketId), event, payload).catch(() => {});
};

const activeStatuses: SupportTicketStatus[] = [
  SupportTicketStatus.OPEN,
  SupportTicketStatus.ASSIGNED,
  SupportTicketStatus.WAITING_USER,
];

const userSummarySelect = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  role: true,
};

const ticketInclude = {
  user: { select: userSummarySelect },
  assignedAdmin: { select: userSummarySelect },
  messages: {
    orderBy: { createdAt: 'asc' as const },
    include: { sender: { select: userSummarySelect } },
  },
};

const ensureUserTicket = async (ticketId: string, userId: string) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    include: ticketInclude,
  });
  if (!ticket) throw new AppError('Tiket dukungan tidak ditemukan.', 404);
  return ticket;
};

const ensureAdmin = async (adminId: string) => {
  const admin = await prisma.user.findFirst({
    where: { id: adminId, role: UserRole.ADMIN },
    select: { id: true },
  });
  if (!admin) throw new AppError('Admin CS tidak ditemukan.', 404);
};

export const getActiveTicket = async (userId: string) =>
  prisma.supportTicket.findFirst({
    where: { userId, status: { in: activeStatuses } },
    orderBy: { updatedAt: 'desc' },
    include: ticketInclude,
  });

export const assertAiAvailable = async (userId: string) => {
  const activeTicket = await prisma.supportTicket.findFirst({
    where: { userId, status: { in: activeStatuses } },
    select: { id: true },
  });
  if (activeTicket) {
    throw new AppError(
      'Sesi Customer Service masih aktif. Lanjutkan percakapan di tiket dukungan.',
      409,
      { code: 'SUPPORT_TICKET_ACTIVE' },
    );
  }
};

export const createTicket = async (
  userId: string,
  input: {
    subject: string;
    category?: SupportTicketCategory;
    source?: SupportTicketSource;
    initialMessage?: string;
    aiTranscript?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
) => {
  const existing = await getActiveTicket(userId);
  if (existing) {
    throw new AppError('Anda masih memiliki tiket CS aktif.', 409, {
      code: 'SUPPORT_TICKET_ACTIVE',
    });
  }

  const source = input.source ?? SupportTicketSource.HELP_CENTER;
  const nestedMessages: Prisma.SupportMessageCreateWithoutTicketInput[] = [
    {
      senderType: SupportMessageSenderType.SYSTEM,
      content: 'Anda terhubung ke Customer Service. AI tidak akan membalas selama tiket aktif.',
    },
  ];
  if (input.initialMessage) {
    nestedMessages.push({
      senderType: SupportMessageSenderType.USER,
      content: input.initialMessage,
      sender: { connect: { id: userId } },
    });
  }

  return prisma.supportTicket.create({
    data: {
      userId,
      subject: input.subject,
      category: input.category ?? SupportTicketCategory.OTHER,
      source,
      handoffAt: source === SupportTicketSource.AI_HANDOFF ? new Date() : null,
      aiTranscript: input.aiTranscript as Prisma.InputJsonValue | undefined,
      messages: { create: nestedMessages },
    },
    include: ticketInclude,
  });
};

export const listUserTickets = async (
  userId: string,
  page = 1,
  limit = 20,
  status?: SupportTicketStatus,
) => {
  const where: Prisma.SupportTicketWhereInput = { userId, ...(status && { status }) };
  const [tickets, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        assignedAdmin: { select: userSummarySelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { tickets, total, page, limit };
};

export const getUserTicket = ensureUserTicket;

export const addUserMessage = async (ticketId: string, userId: string, content: string) => {
  const ticket = await ensureUserTicket(ticketId, userId);
  if (!activeStatuses.includes(ticket.status)) {
    throw new AppError('Tiket sudah selesai dan tidak dapat menerima pesan baru.', 409);
  }

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderType: SupportMessageSenderType.USER,
        content,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: ticket.assignedAdminId ? SupportTicketStatus.ASSIGNED : SupportTicketStatus.OPEN,
      },
    }),
  ]);
  const updated = await ensureUserTicket(ticketId, userId);
  const latest = updated.messages[updated.messages.length - 1];
  if (latest) emitSupportEvent(ticketId, 'message.created', { message: latest });
  emitSupportEvent(ticketId, 'ticket.updated', { ticket: updated });
  return updated;
};

export const closeUserTicket = async (ticketId: string, userId: string) => {
  await ensureUserTicket(ticketId, userId);
  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: SupportTicketStatus.CLOSED, closedAt: new Date() },
    include: ticketInclude,
  });
  emitSupportEvent(ticketId, 'ticket.updated', { ticket: updated });
  return updated;
};

export const listAdminTickets = async (input: {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  assignedAdminId?: string;
  search?: string;
}) => {
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const where: Prisma.SupportTicketWhereInput = {
    ...(input.status && { status: input.status }),
    ...(input.category && { category: input.category }),
    ...(input.priority && { priority: input.priority }),
    ...(input.assignedAdminId && { assignedAdminId: input.assignedAdminId }),
    ...(input.search && {
      OR: [
        { subject: { contains: input.search } },
        { user: { fullName: { contains: input.search } } },
        { user: { email: { contains: input.search } } },
      ],
    }),
  };

  const [tickets, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: userSummarySelect },
        assignedAdmin: { select: userSummarySelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { tickets, total, page, limit };
};

export const getAdminTicket = async (ticketId: string) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketInclude,
  });
  if (!ticket) throw new AppError('Tiket dukungan tidak ditemukan.', 404);
  return ticket;
};

export const updateAdminTicket = async (
  ticketId: string,
  input: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    assignedAdminId?: string | null;
  },
) => {
  await getAdminTicket(ticketId);
  if (input.assignedAdminId) await ensureAdmin(input.assignedAdminId);

  const now = new Date();
  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      ...input,
      ...(input.status === SupportTicketStatus.RESOLVED && { resolvedAt: now }),
      ...(input.status === SupportTicketStatus.CLOSED && { closedAt: now }),
    },
    include: ticketInclude,
  });
  emitSupportEvent(ticketId, 'ticket.updated', { ticket: updated });
  return updated;
};

export const addAdminMessage = async (ticketId: string, adminId: string, content: string) => {
  const ticket = await getAdminTicket(ticketId);
  if (
    ticket.status === SupportTicketStatus.RESOLVED ||
    ticket.status === SupportTicketStatus.CLOSED
  ) {
    throw new AppError('Tiket sudah selesai dan tidak dapat menerima pesan baru.', 409);
  }

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: adminId,
        senderType: SupportMessageSenderType.ADMIN,
        content,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedAdminId: ticket.assignedAdminId ?? adminId,
        status: SupportTicketStatus.WAITING_USER,
      },
    }),
  ]);

  await createNotification({
    userId: ticket.userId,
    title: 'Balasan Customer Service',
    body: content.length > 120 ? `${content.slice(0, 117)}...` : content,
    type: NotificationType.SUPPORT,
    priority: NotificationPriority.HIGH,
    refId: ticketId,
  });
  const updated = await getAdminTicket(ticketId);
  const latest = updated.messages[updated.messages.length - 1];
  if (latest) emitSupportEvent(ticketId, 'message.created', { message: latest });
  emitSupportEvent(ticketId, 'ticket.updated', { ticket: updated });
  return updated;
};

export const resolveAdminTicket = async (
  ticketId: string,
  adminId: string,
  resolutionMessage?: string,
) => {
  const ticket = await getAdminTicket(ticketId);
  const now = new Date();
  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (resolutionMessage) {
    operations.push(
      prisma.supportMessage.create({
        data: {
          ticketId,
          senderId: adminId,
          senderType: SupportMessageSenderType.ADMIN,
          content: resolutionMessage,
        },
      }),
    );
  }
  operations.push(
    prisma.supportMessage.create({
      data: {
        ticketId,
        senderType: SupportMessageSenderType.SYSTEM,
        content: 'Tiket ditandai selesai oleh Customer Service.',
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedAdminId: ticket.assignedAdminId ?? adminId,
        status: SupportTicketStatus.RESOLVED,
        resolvedAt: now,
      },
    }),
  );
  await prisma.$transaction(operations);

  await createNotification({
    userId: ticket.userId,
    title: 'Tiket CS Selesai',
    body: resolutionMessage ?? 'Tiket dukungan Anda telah ditandai selesai.',
    type: NotificationType.SUPPORT,
    refId: ticketId,
  });
  const updated = await getAdminTicket(ticketId);
  emitSupportEvent(ticketId, 'message.created', {
    message: updated.messages[updated.messages.length - 1],
  });
  emitSupportEvent(ticketId, 'ticket.updated', { ticket: updated });
  return updated;
};

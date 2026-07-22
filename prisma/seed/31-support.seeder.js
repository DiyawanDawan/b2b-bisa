import logger from '../../src/config/logger.js';

export async function seedSupport(prisma, users) {
  logger.info('🌱 [31] Seeding support tickets...');

  await prisma.supportMessage.deleteMany({});
  await prisma.supportTicket.deleteMany({ where: { subject: { startsWith: '' } } });

  const buyer = users?.hendra ?? users?.allBuyers?.[0];
  const admin = users?.admin;
  if (!buyer) {
    logger.warn('⚠️ [31] Buyer tidak ditemukan.');
    return 0;
  }

  const tickets = [
    {
      subject: ' Kendala checkout pre-harvest',
      category: 'ORDER',
      status: 'OPEN',
      priority: 'NORMAL',
    },
    {
      subject: ' Verifikasi payout belum masuk',
      category: 'PAYMENT',
      status: 'ASSIGNED',
      priority: 'HIGH',
    },
    {
      subject: ' Update data KYC supplier',
      category: 'KYC',
      status: 'WAITING_USER',
      priority: 'NORMAL',
    },
    {
      subject: ' Pertanyaan fitur booking panen',
      category: 'OTHER',
      status: 'RESOLVED',
      priority: 'LOW',
    },
    {
      subject: ' Akun tidak bisa login',
      category: 'ACCOUNT',
      status: 'CLOSED',
      priority: 'NORMAL',
    },
  ];

  let created = 0;
  for (const t of tickets) {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: buyer.id,
        subject: t.subject,
        category: t.category,
        status: t.status,
        priority: t.priority,
        source: 'HELP_CENTER',
        assignedAdminId: t.status === 'ASSIGNED' ? admin?.id : null,
        resolvedAt: ['RESOLVED', 'CLOSED'].includes(t.status) ? new Date() : null,
        closedAt: t.status === 'CLOSED' ? new Date() : null,
      },
    });

    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: buyer.id,
        senderType: 'USER',
        content: 'Halo tim BISA, saya butuh bantuan terkait masalah ini (demo seed).',
      },
    });

    if (admin && ['ASSIGNED', 'RESOLVED', 'CLOSED'].includes(t.status)) {
      await prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: admin.id,
          senderType: 'ADMIN',
          content: 'Tim kami sedang meninjau laporan Anda. Demo seed response.',
        },
      });
    }

    created++;
  }

  logger.info(`✅ [31] ${created} support tickets seeded.`);
  return created;
}

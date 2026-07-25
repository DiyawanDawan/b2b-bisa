import logger from '../../src/config/logger.js';

export async function seedSupport(prisma, users) {
  logger.info('🌱 [31] Seeding support tickets...');

  await prisma.supportMessage.deleteMany({
    where: { ticket: { subject: { startsWith: '[SEED]' } } },
  });
  await prisma.supportTicket.deleteMany({
    where: { subject: { startsWith: '[SEED]' } },
  });

  const buyer = users?.hendra ?? users?.allBuyers?.[0];
  const supplier = users?.siti ?? users?.allSuppliers?.[0];
  const admin = users?.admin;
  if (!buyer) {
    logger.warn('⚠️ [31] Buyer tidak ditemukan.');
    return 0;
  }

  const tickets = [
    {
      userId: buyer.id,
      subject: '[SEED] Kendala checkout pre-harvest',
      category: 'ORDER',
      status: 'OPEN',
      priority: 'NORMAL',
      source: 'HELP_CENTER',
    },
    {
      userId: buyer.id,
      subject: '[SEED] Verifikasi payout belum masuk',
      category: 'PAYMENT',
      status: 'ASSIGNED',
      priority: 'HIGH',
      source: 'HELP_CENTER',
    },
    {
      userId: supplier?.id ?? buyer.id,
      subject: '[SEED] Update data KYC supplier',
      category: 'KYC',
      status: 'WAITING_USER',
      priority: 'NORMAL',
      source: 'HELP_CENTER',
    },
    {
      userId: buyer.id,
      subject: '[SEED] Pertanyaan fitur booking panen',
      category: 'OTHER',
      status: 'RESOLVED',
      priority: 'LOW',
      source: 'HELP_CENTER',
    },
    {
      userId: buyer.id,
      subject: '[SEED] Akun tidak bisa login',
      category: 'ACCOUNT',
      status: 'CLOSED',
      priority: 'NORMAL',
      source: 'HELP_CENTER',
    },
    {
      userId: buyer.id,
      subject: '[SEED] AI handoff — butuh agent manusia',
      category: 'OTHER',
      status: 'ASSIGNED',
      priority: 'HIGH',
      source: 'AI_HANDOFF',
      handoffAt: new Date(Date.now() - 2 * 3600000),
      aiTranscript: [
        { role: 'user', content: 'Saya bingung cara booking pre-harvest.' },
        { role: 'assistant', content: 'Anda bisa membuka halaman produk lalu pilih Booking.' },
        { role: 'user', content: 'Masih error, tolong hubungkan ke admin.' },
        { role: 'system', content: 'Handoff ke admin — confidence rendah.' },
      ],
    },
  ];

  let created = 0;
  for (const t of tickets) {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: t.userId,
        subject: t.subject,
        category: t.category,
        status: t.status,
        priority: t.priority,
        source: t.source,
        assignedAdminId: ['ASSIGNED', 'WAITING_USER'].includes(t.status) ? admin?.id : null,
        handoffAt: t.handoffAt ?? null,
        aiTranscript: t.aiTranscript ?? undefined,
        resolvedAt: ['RESOLVED', 'CLOSED'].includes(t.status) ? new Date() : null,
        closedAt: t.status === 'CLOSED' ? new Date() : null,
      },
    });

    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: t.userId,
        senderType: 'USER',
        content: 'Halo tim BISA, saya butuh bantuan terkait masalah ini (demo seed).',
      },
    });

    if (t.source === 'AI_HANDOFF') {
      await prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: null,
          senderType: 'SYSTEM',
          content: '[SEED] Percakapan AI di-handoff ke admin. Lihat aiTranscript pada ticket.',
        },
      });
    }

    if (admin && ['ASSIGNED', 'RESOLVED', 'CLOSED', 'WAITING_USER'].includes(t.status)) {
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

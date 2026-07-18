import logger from '../../src/config/logger.js';
import { loremFlickrDbPath } from '../../src/utils/loremFlickrMedia.util.ts';

const seedForumMedia = (keywords, lock) => [
  {
    url: loremFlickrDbPath(keywords, { lock }),
    type: 'image',
  },
];

/**
 * Konten postingan + komentar per grup (deterministik, cocok untuk QA mobile/web).
 * Key = slug grup dari 09-forum-groups.seeder.js
 */
const GROUP_POST_SEEDS = {
  'biochar-sulawesi-hub': [
    {
      title: 'Tips menjaga suhu kiln agar biochar tetap grade A',
      content:
        'Halo semua, kami lagi uji batch minggu ini. Suhu ideal kiln kami di kisaran 450–500°C. Kalau naik terlalu cepat, karbon jadi rapuh.\n\nAda yang punya checklist start-up kiln yang lebih rapi? Share dong #biochar #kiln',
      tags: ['biochar', 'kiln', 'grade-a'],
      authorEmail: 'siti.aminah@agritech.com',
      comments: [
        {
          authorEmail: 'hello@greenearth.co',
          content:
            'Setuju. Kami pakai ramp 5°C/menit sampai 480°C lalu hold 40 menit. Hasilnya lebih stabil.',
          replies: [
            {
              authorEmail: 'h.wijaya@surabayaindustrial.com',
              content: 'Boleh minta spesifikasi sensor yang dipakai? Kami masih sering spike.',
            },
          ],
        },
        {
          authorEmail: 'h.wijaya@surabayaindustrial.com',
          content: 'Buyer side: grade A yang konsisten mempercepat approval QC di gudang kami.',
        },
        {
          authorEmail: 'admin@bisaes.com',
          content: 'Bisa dokumentasikan SOP-nya di grup biar member baru ikut standar yang sama.',
        },
      ],
    },
    {
      title: 'QA checklist batch ekspor — butuh review komunitas',
      content:
        'Kami draft checklist QA sebelum packing: moisture <12%, ash content, particle size, dan foto batch.\n\nAda standar lain yang biasanya diminta buyer Eropa?',
      tags: ['qa', 'ekspor', 'biochar'],
      authorEmail: 'hello@greenearth.co',
      comments: [
        {
          authorEmail: 'siti.aminah@agritech.com',
          content: 'Tambah residual oil & heavy metal screening kalau target food-grade soil amendment.',
        },
        {
          authorEmail: 'h.wijaya@surabayaindustrial.com',
          content: 'Kami juga minta CoA + foto tungku pada hari produksi yang sama.',
          replies: [
            {
              authorEmail: 'hello@greenearth.co',
              content: 'Siap, nanti kami lampirkan CoA di thread berikutnya.',
            },
          ],
        },
      ],
    },
    {
      title: 'Troubleshooting asap berlebih di malam hari',
      content:
        'Malam tadi asap keluar lebih tebal dari biasanya padahal feed biomassa sama. Ada yang pernah alami?',
      tags: ['troubleshooting', 'asap'],
      authorEmail: 'h.wijaya@surabayaindustrial.com',
      comments: [
        {
          authorEmail: 'siti.aminah@agritech.com',
          content: 'Cek kadar air feedstock. Kalau >20% biasanya asap naik signifikan.',
        },
        {
          authorEmail: 'hello@greenearth.co',
          content: 'Vent secondary air kami sering tersumbat abu — coba bersihkan dulu.',
        },
      ],
    },
    {
      title: 'Jadwal batch mingguan Sulawesi — slot masih tersedia',
      content:
        'Untuk minggu depan masih ada kapasitas 8 ton. Prioritas member grup. Bisa chat lewat BISA kalau mau booking.',
      tags: ['produksi', 'jadwal'],
      authorEmail: 'siti.aminah@agritech.com',
      comments: [
        {
          authorEmail: 'admin@bisaes.com',
          content: 'Mantap. Nanti kami bantu amplify di kanal komunitas juga.',
        },
      ],
    },
  ],
  'komunitas-smart-farm-iot': [
    {
      title: 'Setup MAX6675 + ESP32 untuk alert suhu tungku',
      content:
        'Sharing wiring dasar MAX6675 ke ESP32 dan threshold alert di dashboard BISA.\n\nKalau suhu >520°C selama 3 menit, kirim notifikasi. Ada yang pakai hysteresis berbeda?',
      tags: ['iot', 'max6675', 'alert'],
      authorEmail: 'hello@greenearth.co',
      comments: [
        {
          authorEmail: 'siti.aminah@agritech.com',
          content: 'Kami pakai deadband ±8°C biar tidak spam notifikasi.',
          replies: [
            {
              authorEmail: 'hello@greenearth.co',
              content: 'Nice tip. Nanti kami update firmware minggu ini.',
            },
          ],
        },
        {
          authorEmail: 'h.wijaya@surabayaindustrial.com',
          content: 'Bisa share sample payload MQTT-nya? Biar tim IT kami sinkron.',
        },
      ],
    },
    {
      title: 'False alarm sensor — penyebab & mitigasi',
      content:
        'Kemarin ada false alarm karena ground loop. Setelah grounding diperbaiki, data jauh lebih bersih.',
      tags: ['sensor', 'false-alarm'],
      authorEmail: 'siti.aminah@agritech.com',
      comments: [
        {
          authorEmail: 'admin@bisaes.com',
          content: 'Tolong dokumentasikan langkah grounding-nya di sini ya.',
        },
        {
          authorEmail: 'hello@greenearth.co',
          content: 'Kami juga sarankan shielded cable untuk jarak >10m.',
        },
      ],
    },
    {
      title: 'Integrasi IoT BISA: polling interval berapa ideal?',
      content:
        'Sekarang kami polling setiap 15 detik. Battery pack cepat habis. Ada rekomendasi interval vs akurasi?',
      tags: ['iot', 'polling', 'baterai'],
      authorEmail: 'h.wijaya@surabayaindustrial.com',
      comments: [
        {
          authorEmail: 'hello@greenearth.co',
          content: 'Untuk produksi stabil, 30–60 detik sudah cukup. Naik ke 10 detik saat ramp-up saja.',
        },
        {
          authorEmail: 'siti.aminah@agritech.com',
          content: 'Setuju. Adaptive sampling hemat banget di lapangan.',
          replies: [
            {
              authorEmail: 'h.wijaya@surabayaindustrial.com',
              content: 'Makasih, kami coba adaptive dulu minggu ini.',
            },
          ],
        },
      ],
    },
    {
      title: 'Dashboard alert tidak masuk HP — checklist debug',
      content:
        'Device online di web, tapi push mobile tidak masuk. Sudah cek permission notifikasi. Ada checklist lain?',
      tags: ['notifikasi', 'debug'],
      authorEmail: 'admin@bisaes.com',
      comments: [
        {
          authorEmail: 'hello@greenearth.co',
          content: 'Cek token FCM masih valid dan timezone device.',
        },
      ],
    },
  ],
  'supply-chain-organik-indonesia': [
    {
      title: 'Koordinasi fulfillment batch organik minggu ini',
      content:
        'Buyer Surabaya butuh ETA jelas untuk 3 ton organik premium. Supplier, mohon update slot pickup & packing list.',
      tags: ['fulfillment', 'organik', 'logistik'],
      authorEmail: 'h.wijaya@surabayaindustrial.com',
      comments: [
        {
          authorEmail: 'siti.aminah@agritech.com',
          content: 'Slot Kamis pagi masih available. Packing list kami kirim malam ini.',
          replies: [
            {
              authorEmail: 'h.wijaya@surabayaindustrial.com',
              content: 'Perfect. Tim gudang kami siap terima Kamis siang.',
            },
          ],
        },
        {
          authorEmail: 'hello@greenearth.co',
          content: 'Kalau butuh backup 1 ton, kami bisa cover dari stock Serpong.',
        },
      ],
    },
    {
      title: 'Standar packing organik agar lolos QC retailer',
      content:
        'Beberapa batch kami sempat reject karena label lot tidak konsisten. Yuk samakan format label antar supplier.',
      tags: ['packing', 'qc', 'label'],
      authorEmail: 'admin@bisaes.com',
      comments: [
        {
          authorEmail: 'hello@greenearth.co',
          content: 'Kami pakai format: LOT-YYYYMMDD-SUPPLIERCODE. Bisa jadi standar grup.',
        },
        {
          authorEmail: 'siti.aminah@agritech.com',
          content: 'Setuju. Nanti kami update template print label.',
        },
      ],
    },
    {
      title: 'Negosiasi harga batch premium vs volume',
      content:
        'Untuk volume >5 ton/bulan, ada ruang diskus harga. Silakan share struktur harga transparan di thread ini.',
      tags: ['harga', 'negosiasi', 'premium'],
      authorEmail: 'siti.aminah@agritech.com',
      comments: [
        {
          authorEmail: 'h.wijaya@surabayaindustrial.com',
          content: 'Buyer kami siap komitmen 6 ton/bulan jika lead time <5 hari.',
          replies: [
            {
              authorEmail: 'siti.aminah@agritech.com',
              content: 'Lead time 4 hari feasible. Nego detail via room nego BISA ya.',
            },
          ],
        },
        {
          authorEmail: 'hello@greenearth.co',
          content: 'Kami bisa ikut skema volume pricing kalau ada PO framework.',
        },
      ],
    },
    {
      title: 'Rute logistik Jawa–Bali untuk produk organik',
      content:
        'Ada yang punya partner 3PL yang sudah terbiasa cold-chain ringan untuk organik? Share kontak internal grup saja.',
      tags: ['logistik', '3pl', 'organik'],
      authorEmail: 'hello@greenearth.co',
      comments: [
        {
          authorEmail: 'h.wijaya@surabayaindustrial.com',
          content: 'Kami pakai partner lokal Surabaya–Denpasar, on-time 92% bulan lalu.',
        },
        {
          authorEmail: 'admin@bisaes.com',
          content: 'Bisa buatkan shortlist 3PL di dokumen grup biar member baru cepat pilih.',
        },
      ],
    },
  ],
};

async function findUserIdByEmail(prisma, email) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, fullName: true },
  });
  return user ?? null;
}

/**
 * Hapus hanya postingan yang terikat grup (beserta komentar & vote-nya).
 */
async function clearGroupForumContent(prisma) {
  const groupPosts = await prisma.forumPost.findMany({
    where: { groupId: { not: null } },
    select: { id: true },
  });
  const postIds = groupPosts.map((p) => p.id);
  if (postIds.length === 0) return 0;

  await prisma.forumVote.deleteMany({
    where: {
      OR: [{ postId: { in: postIds } }, { comment: { postId: { in: postIds } } }],
    },
  });
  await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
  await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
  return postIds.length;
}

/**
 * Seed postingan + komentar (+ reply) untuk semua ForumGroup publik.
 * Aman dijalankan ulang: menghapus konten grup lama dulu, tidak menyentuh post global.
 */
export async function seedForumGroupPosts(prisma) {
  logger.info('🌱 [09-forum-group-posts] Seeding postingan & komentar per grup...');

  if (typeof prisma.forumPost?.create !== 'function') {
    logger.warn('⚠️ [09-forum-group-posts] ForumPost belum tersedia di Prisma Client.');
    return { posts: 0, comments: 0 };
  }

  const groups = await prisma.forumGroup.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, slug: true },
  });

  if (groups.length === 0) {
    logger.warn(
      '⚠️ [09-forum-group-posts] Belum ada grup. Jalankan seedForumGroups dulu (npm run seed:forum-groups).',
    );
    return { posts: 0, comments: 0 };
  }

  const removed = await clearGroupForumContent(prisma);
  if (removed > 0) {
    logger.info(`   ↺ Menghapus ${removed} postingan grup lama + komentarnya`);
  }

  const forumCat = await prisma.category.findFirst({ where: { categoryType: 'FORUM' } });

  let postCount = 0;
  let commentCount = 0;
  let lock = 9400;

  for (const group of groups) {
    const seeds = GROUP_POST_SEEDS[group.slug];
    if (!seeds?.length) {
      logger.warn(`   ⚠️ Tidak ada template post untuk slug "${group.slug}" — skip.`);
      continue;
    }

    const members = await prisma.forumGroupMember.findMany({
      where: { groupId: group.id },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    if (memberIds.length === 0) {
      logger.warn(`   ⚠️ Grup "${group.name}" tanpa anggota — skip.`);
      continue;
    }

    for (const seed of seeds) {
      const author =
        (await findUserIdByEmail(prisma, seed.authorEmail)) ??
        (await prisma.user.findUnique({
          where: { id: memberIds[0] },
          select: { id: true, email: true, fullName: true },
        }));
      if (!author || !memberIds.includes(author.id)) {
        logger.warn(
          `   ⚠️ Author ${seed.authorEmail} bukan member grup "${group.name}" — pakai member pertama.`,
        );
      }
      const authorId = author && memberIds.includes(author.id) ? author.id : memberIds[0];

      const post = await prisma.forumPost.create({
        data: {
          title: seed.title,
          content: seed.content,
          tags: seed.tags ?? [],
          categoryId: forumCat?.id,
          groupId: group.id,
          userId: authorId,
          mediaUrls: seedForumMedia(['forum', 'community', group.slug], lock++),
          status: 'PUBLISHED',
          upvotes: 3 + (postCount % 12),
          viewCount: 40 + postCount * 17,
        },
      });
      postCount += 1;

      // Vote post dari 1–2 member lain
      for (const voterId of memberIds.filter((id) => id !== authorId).slice(0, 2)) {
        await prisma.forumVote.upsert({
          where: { userId_postId: { userId: voterId, postId: post.id } },
          update: { type: 'UP' },
          create: { postId: post.id, userId: voterId, type: 'UP' },
        });
      }

      for (const commentSeed of seed.comments ?? []) {
        const commenter =
          (await findUserIdByEmail(prisma, commentSeed.authorEmail)) ?? null;
        const commenterId =
          commenter && memberIds.includes(commenter.id)
            ? commenter.id
            : memberIds.find((id) => id !== authorId) ?? memberIds[0];

        const comment = await prisma.forumComment.create({
          data: {
            postId: post.id,
            userId: commenterId,
            content: commentSeed.content,
            upvotes: 1 + (commentCount % 8),
          },
        });
        commentCount += 1;

        await prisma.forumVote.upsert({
          where: { userId_commentId: { userId: authorId, commentId: comment.id } },
          update: { type: 'UP' },
          create: { commentId: comment.id, userId: authorId, type: 'UP' },
        });

        for (const replySeed of commentSeed.replies ?? []) {
          const replyUser = await findUserIdByEmail(prisma, replySeed.authorEmail);
          const replyUserId =
            replyUser && memberIds.includes(replyUser.id)
              ? replyUser.id
              : memberIds[0];
          await prisma.forumComment.create({
            data: {
              postId: post.id,
              parentId: comment.id,
              userId: replyUserId,
              content: replySeed.content,
              upvotes: 1,
            },
          });
          commentCount += 1;
        }
      }
    }

    logger.info(`   ✓ Grup "${group.name}" — ${seeds.length} postingan + komentar`);
  }

  logger.info(
    `✅ [09-forum-group-posts] Selesai: ${postCount} postingan grup, ${commentCount} komentar/reply.`,
  );
  return { posts: postCount, comments: commentCount };
}

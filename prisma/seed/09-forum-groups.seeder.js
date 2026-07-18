import logger from '../../src/config/logger.js';
import { loremFlickrDbPath } from '../../src/utils/loremFlickrMedia.util.ts';

/**
 * Akun tetap dari 04-users.seeder.js — hanya lookup id, tidak buat user baru.
 */
const SEED_USER_EMAILS = {
  admin: 'admin@bisaes.com',
  siti: 'siti.aminah@agritech.com',
  green: 'hello@greenearth.co',
  hendra: 'h.wijaya@surabayaindustrial.com',
};

/**
 * Grup publik + anggota (OWNER / ADMIN / MEMBER) memakai user yang sudah ada di DB.
 */
const FORUM_GROUP_SEEDS = [
  {
    name: 'Biochar Sulawesi Hub',
    slug: 'biochar-sulawesi-hub',
    description:
      'Diskusi produksi biochar, kualitas grade A/B, dan troubleshooting kiln untuk supplier NTB & Sulawesi.',
    ownerEmail: SEED_USER_EMAILS.siti,
    adminEmails: [SEED_USER_EMAILS.green],
    memberEmails: [SEED_USER_EMAILS.hendra, SEED_USER_EMAILS.admin],
    keywords: ['biochar', 'kiln', 'biomass'],
  },
  {
    name: 'Komunitas Smart Farm IoT',
    slug: 'komunitas-smart-farm-iot',
    description:
      'Sharing setup sensor MAX6675, alert threshold suhu tungku, dan integrasi IoT monitoring BISA.',
    ownerEmail: SEED_USER_EMAILS.green,
    adminEmails: [SEED_USER_EMAILS.siti],
    memberEmails: [SEED_USER_EMAILS.hendra, SEED_USER_EMAILS.admin],
    keywords: ['iot', 'agriculture', 'technology'],
  },
  {
    name: 'Supply Chain Organik Indonesia',
    slug: 'supply-chain-organik-indonesia',
    description:
      'Koordinasi supplier–buyer organik: logistik, fulfillment, dan negosiasi batch premium.',
    ownerEmail: SEED_USER_EMAILS.hendra,
    adminEmails: [SEED_USER_EMAILS.admin],
    memberEmails: [SEED_USER_EMAILS.siti, SEED_USER_EMAILS.green],
    keywords: ['warehouse', 'truck', 'logistics'],
  },
];

async function findUserIdByEmail(prisma, email) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, fullName: true, email: true },
  });
  return user ?? null;
}

/**
 * Seed khusus ForumGroup + ForumGroupMember saja.
 * Postingan & komentar per grup: lihat 09-forum-group-posts.seeder.js
 * Runner lengkap: npm run seed:forum-groups
 *
 * @returns {Promise<Array<{ id: string, name: string, slug: string }>>}
 */
export async function seedForumGroups(prisma) {
  logger.info('🌱 [09-forum-groups] Seeding forum groups & members (existing users only)...');

  const hasForumGroups =
    typeof prisma.forumGroupMember?.deleteMany === 'function' &&
    typeof prisma.forumGroup?.deleteMany === 'function';

  if (!hasForumGroups) {
    logger.warn(
      '⚠️ [09-forum-groups] ForumGroup belum ada di Prisma Client. Jalankan: npx prisma migrate deploy && npx prisma generate',
    );
    return [];
  }

  await prisma.forumGroupMember.deleteMany({});
  await prisma.forumGroup.deleteMany({});

  const groups = [];

  for (const seed of FORUM_GROUP_SEEDS) {
    const owner = await findUserIdByEmail(prisma, seed.ownerEmail);
    if (!owner) {
      logger.warn(
        `⚠️ [09-forum-groups] Owner ${seed.ownerEmail} tidak ditemukan — skip grup "${seed.name}". Jalankan seed users (04) dulu.`,
      );
      continue;
    }

    const created = await prisma.forumGroup.create({
      data: {
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        avatarUrl: loremFlickrDbPath(seed.keywords, { lock: 800 + groups.length * 2 }),
        bannerUrl: loremFlickrDbPath(seed.keywords, { lock: 801 + groups.length * 2 }),
        ownerId: owner.id,
        isPublic: true,
        memberCount: 1,
      },
    });

    await prisma.forumGroupMember.create({
      data: {
        groupId: created.id,
        userId: owner.id,
        role: 'OWNER',
      },
    });

    const memberRoleByEmail = new Map();
    for (const email of seed.adminEmails ?? []) {
      if (email !== seed.ownerEmail) memberRoleByEmail.set(email, 'ADMIN');
    }
    for (const email of seed.memberEmails ?? []) {
      if (email !== seed.ownerEmail && !memberRoleByEmail.has(email)) {
        memberRoleByEmail.set(email, 'MEMBER');
      }
    }

    for (const [email, role] of memberRoleByEmail) {
      const member = await findUserIdByEmail(prisma, email);
      if (!member) {
        logger.warn(
          `⚠️ [09-forum-groups] Anggota ${email} tidak ditemukan — skip untuk grup "${seed.name}".`,
        );
        continue;
      }
      await prisma.forumGroupMember.create({
        data: {
          groupId: created.id,
          userId: member.id,
          role,
        },
      });
    }

    const memberCount = await prisma.forumGroupMember.count({
      where: { groupId: created.id },
    });
    await prisma.forumGroup.update({
      where: { id: created.id },
      data: { memberCount },
    });

    groups.push(created);
    logger.info(`   ✓ Grup "${seed.name}" — owner ${owner.fullName}, ${memberCount} anggota`);
  }

  logger.info(`✅ [09-forum-groups] ${groups.length} grup publik + anggota di-seed.`);
  return groups;
}

import logger from '../../src/config/logger.js';
import { TERMS_CONTENT, PRIVACY_CONTENT } from './data/policies.content.js';

const POLICIES = [
  {
    title: 'Syarat & Ketentuan',
    content: TERMS_CONTENT,
    version: '1.0.0',
    isActive: true,
  },
  {
    title: 'Kebijakan Privasi',
    content: PRIVACY_CONTENT,
    version: '1.0.0',
    isActive: true,
  },
];

/**
 * Pastikan setiap policy punya riwayat revisi minimal:
 * - draft awal 0.9.0 (belum dipublikasi)
 * - versi aktif saat ini (mengikuti policy.version, dipublikasi)
 * Idempotent: cek berdasarkan policyId + version sebelum membuat.
 */
async function ensurePolicyRevisions(prisma, policyRecord) {
  const revisions = [
    {
      version: '0.9.0',
      title: policyRecord.title,
      content: policyRecord.content,
      isPublished: false,
      note: 'Draft awal sebelum publikasi',
    },
    {
      version: policyRecord.version,
      title: policyRecord.title,
      content: policyRecord.content,
      isPublished: true,
      note: 'Versi aktif yang dipublikasikan',
    },
  ];

  for (const revision of revisions) {
    const existing = await prisma.policyRevision.findFirst({
      where: { policyId: policyRecord.id, version: revision.version },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.policyRevision.create({
      data: {
        policyId: policyRecord.id,
        version: revision.version,
        title: revision.title,
        content: revision.content,
        isPublished: revision.isPublished,
        note: revision.note,
      },
    });
    logger.info(`   ↳ revisi ${policyRecord.title} v${revision.version} dibuat`);
  }
}

export async function seedPolicies(prisma) {
  logger.info('🌱 [14] Seeding Legal Policies (Terms & Privacy)...');

  for (const policy of POLICIES) {
    const policyRecord = await prisma.policy.upsert({
      where: { title: policy.title },
      update: {
        content: policy.content,
        version: policy.version,
        isActive: policy.isActive,
      },
      create: policy,
    });
    logger.info(`   ✓ ${policy.title} v${policy.version}`);

    await ensurePolicyRevisions(prisma, policyRecord);
  }
}

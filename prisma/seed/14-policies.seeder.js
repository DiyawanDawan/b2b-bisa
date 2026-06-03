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

export async function seedPolicies(prisma) {
  logger.info('🌱 [14] Seeding Legal Policies (Terms & Privacy)...');

  for (const policy of POLICIES) {
    await prisma.policy.upsert({
      where: { title: policy.title },
      update: {
        content: policy.content,
        version: policy.version,
        isActive: policy.isActive,
      },
      create: policy,
    });
    logger.info(`   ✓ ${policy.title} v${policy.version}`);
  }
}

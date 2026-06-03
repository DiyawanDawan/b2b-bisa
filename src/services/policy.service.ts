import prisma from '#config/prisma';
import AppError from '#utils/appError';

/** Slug API → judul unik di tabel policies */
export const POLICY_KEYS = {
  terms: 'Syarat & Ketentuan',
  privacy: 'Kebijakan Privasi',
} as const;

export type PolicyKey = keyof typeof POLICY_KEYS;

export const getPolicyByKey = async (key: string) => {
  const title = POLICY_KEYS[key as PolicyKey];
  if (!title) {
    throw new AppError('Kebijakan tidak ditemukan', 404);
  }

  const policy = await prisma.policy.findFirst({
    where: { title, isActive: true },
    select: {
      id: true,
      title: true,
      content: true,
      version: true,
      updatedAt: true,
    },
  });

  if (!policy) {
    throw new AppError('Kebijakan belum tersedia. Jalankan seed policies.', 404);
  }

  return { ...policy, key };
};

export const listActivePolicies = async () => {
  const policies = await prisma.policy.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      version: true,
      updatedAt: true,
    },
    orderBy: { title: 'asc' },
  });

  return policies.map((p) => ({
    ...p,
    key: Object.entries(POLICY_KEYS).find(([, title]) => title === p.title)?.[0] ?? null,
  }));
};

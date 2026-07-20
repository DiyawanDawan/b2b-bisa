import prisma from '#config/prisma';

/**
 * Normalisasi kode wilayah BPS (province/regency/district).
 * Contoh: "33.74" → "3374", "3374" → "3374"
 */
export const normalizeWilayahCode = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const cleaned = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : null;
};

/**
 * Kode wilayah untuk AWB: prioritas kab/kota, fallback provinsi.
 */
export const resolveAwbWilayahCode = (params: {
  regencyCode?: string | null;
  provinceCode?: string | null;
}): string => {
  return (
    normalizeWilayahCode(params.regencyCode) || normalizeWilayahCode(params.provinceCode) || '0000'
  );
};

/**
 * Format: BEX-{ORIGIN}-{DEST}-{YYMMDD}-{SEQ4}
 *
 * ORIGIN/DEST = kode wilayah BPS dari Alamat Profil
 * (regency.code, fallback province.code)
 *
 * Contoh: BEX-3374-3171-260720-0001
 * Sequence reset harian per pasangan origin-dest.
 */
export const generateBisaExpressAwb = async (params: {
  originWilayahCode: string;
  destinationWilayahCode: string;
}): Promise<string> => {
  const origin = resolveAwbWilayahCode({ provinceCode: params.originWilayahCode });
  const dest = resolveAwbWilayahCode({ provinceCode: params.destinationWilayahCode });

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yy}${mm}${dd}`;
  const prefix = `BEX-${origin}-${dest}-${datePart}-`;

  const latest = await prisma.bisaExpressShipment.findFirst({
    where: { awbNumber: { startsWith: prefix } },
    orderBy: { awbNumber: 'desc' },
    select: { awbNumber: true },
  });

  let nextSeq = 1;
  if (latest?.awbNumber) {
    const seqStr = latest.awbNumber.slice(prefix.length);
    const parsed = Number.parseInt(seqStr, 10);
    if (Number.isFinite(parsed)) nextSeq = parsed + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
};

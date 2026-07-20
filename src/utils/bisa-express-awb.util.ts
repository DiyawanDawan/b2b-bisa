import prisma from '#config/prisma';

/**
 * Normalisasi kode wilayah BPS (province/regency/district).
 * Contoh: "33.74" → "3374", "337401" → "337401"
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
 * Segmen AWB per sisi: kecamatan → kab/kota → provinsi → 0000.
 * Kode kecamatan BPS sudah mencakup hierarki kab (mis. 337401 = Semarang Tengah).
 */
export const resolveAwbWilayahCode = (params: {
  districtCode?: string | null;
  regencyCode?: string | null;
  provinceCode?: string | null;
}): string => {
  return (
    normalizeWilayahCode(params.districtCode) ||
    normalizeWilayahCode(params.regencyCode) ||
    normalizeWilayahCode(params.provinceCode) ||
    '0000'
  );
};

export type AwbWilayahInput = {
  districtCode?: string | null;
  regencyCode?: string | null;
  provinceCode?: string | null;
};

/**
 * Format: BEX-{KEC_ASAL}-{KEC_TUJUAN}-{YYMMDD}-{SEQ4}
 *
 * Segmen asal/tujuan = kode BPS kecamatan (prioritas), fallback kab → prov → 0000.
 *
 * Contoh: BEX-337401-317401-260720-0001
 * Fallback kab: BEX-3374-3174-260720-0001
 * Sequence reset harian per pasangan asal–tujuan.
 */
export const generateBisaExpressAwb = async (params: {
  origin: AwbWilayahInput;
  destination: AwbWilayahInput;
}): Promise<string> => {
  const origin = resolveAwbWilayahCode(params.origin);
  const dest = resolveAwbWilayahCode(params.destination);

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

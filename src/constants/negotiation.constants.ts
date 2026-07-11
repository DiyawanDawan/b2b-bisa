import { NegotiationRoomType, Prisma } from '#prisma';

export type NegotiationChatPurpose = 'inquiry' | 'negotiation';

export const purposeToRoomType = (purpose: NegotiationChatPurpose): NegotiationRoomType =>
  purpose === 'inquiry' ? NegotiationRoomType.INQUIRY : NegotiationRoomType.NEGOTIATION;

const inquiryRoomWhere: Prisma.NegotiationWhereInput = {
  OR: [
    { roomType: NegotiationRoomType.INQUIRY },
    { specifications: { startsWith: 'PURPOSE:INQUIRY' } },
  ],
};

/** Filter ruang chat (termasuk data lama sebelum kolom room_type). */
export const negotiationPurposeWhere = (
  purpose: NegotiationChatPurpose,
): Prisma.NegotiationWhereInput =>
  purpose === 'inquiry' ? inquiryRoomWhere : { NOT: inquiryRoomWhere };

/** Spesifikasi teknis produk saat buka ruang (bukan jenis chat). */
export const buildTechnicalSpecifications = (technicalSpecLine?: string): string | null => {
  const base = technicalSpecLine?.trim() ?? '';
  return base.length > 0 ? base : null;
};

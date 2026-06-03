import * as storageService from '#services/storage.service';
import { attachProductMediaUrls } from '#utils/productMedia.util';
import { attachUserMediaUrls } from '#utils/userMedia.util';

const resolve = (url: string | null | undefined): string | null | undefined =>
  url ? (storageService.getPublicUrl(url) ?? url) : url;

type UserLike = { avatarUrl?: string | null; [key: string]: unknown };
type ProductLike = { thumbnailUrl?: string | null; images?: unknown; [key: string]: unknown };
type MessageLike = {
  attachmentUrl?: string | null;
  sender?: UserLike | null;
  [key: string]: unknown;
};

type NegotiationLike = {
  product?: ProductLike | null;
  buyer?: UserLike | null;
  seller?: UserLike | null;
  messages?: MessageLike[] | null;
  [key: string]: unknown;
};

const attachMessageMedia = <T extends MessageLike>(msg: T): T => {
  const next = { ...msg };
  if (next.attachmentUrl) {
    next.attachmentUrl = resolve(next.attachmentUrl) ?? next.attachmentUrl;
  }
  if (next.sender) {
    next.sender = attachUserMediaUrls({ ...next.sender });
  }
  return next;
};

/** Resolve product thumbnail, avatars, chat attachments on negotiation API payloads. */
export const attachNegotiationMediaUrls = <T extends NegotiationLike>(negotiation: T): T => {
  const next: NegotiationLike = { ...negotiation };

  if (next.product) {
    next.product = attachProductMediaUrls({ ...next.product });
  }
  if (next.buyer) {
    next.buyer = attachUserMediaUrls({ ...next.buyer });
  }
  if (next.seller) {
    next.seller = attachUserMediaUrls({ ...next.seller });
  }
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map((m) => attachMessageMedia({ ...m }));
  }

  return { ...negotiation, ...next } as T;
};

export const attachNegotiationMessageMedia = attachMessageMedia;

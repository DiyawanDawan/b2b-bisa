import * as storageService from '#services/storage.service';
import { attachProductMediaUrls } from '#utils/productMedia.util';
import { attachUserMediaUrls } from '#utils/userMedia.util';

/** Negotiation attachments are private — short-lived signed proxy (15 min). */
const SIGNED_ATTACHMENT_TTL_SEC = 900;

const resolveAttachment = (url: string | null | undefined): string | null | undefined => {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return storageService.getSignedProxyUrl(url, SIGNED_ATTACHMENT_TTL_SEC) ?? url;
};

type UserLike = { avatarUrl?: string | null; [key: string]: unknown };
type ProductLike = {
  thumbnailUrl?: string | null;
  images?: { url: string; [key: string]: unknown }[] | { select?: unknown } | null;
  [key: string]: unknown;
};
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
    next.attachmentUrl = resolveAttachment(next.attachmentUrl) ?? next.attachmentUrl;
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

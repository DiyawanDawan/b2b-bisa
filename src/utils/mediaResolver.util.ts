import * as storageService from '#services/storage.service';
import { attachProductMediaUrls } from '#utils/productMedia.util';
import { attachOrderMediaUrls } from '#utils/orderMedia.util';
import { attachUserMediaUrls } from '#utils/userMedia.util';
import {
  attachNegotiationMediaUrls,
  attachNegotiationMessageMedia,
} from '#utils/negotiationMedia.util';

export { attachProductMediaUrls, attachOrderMediaUrls, attachUserMediaUrls };
export { attachNegotiationMediaUrls, attachNegotiationMessageMedia };

/** Single field: DB path → public CDN URL. */
export const resolveMediaField = (path: string | null | undefined): string | null =>
  storageService.getPublicUrl(path ?? null);

type ForumMediaItem = { url: string; type: string };

type UserLike = { avatarUrl?: string | null; [key: string]: unknown };

type ForumCommentLike = {
  author?: UserLike | null;
  mediaUrls?: unknown[] | null;
  replies?: ForumCommentLike[] | null;
  user?: UserLike | null;
  [key: string]: unknown;
};

type ForumPostLike = {
  author?: UserLike | null;
  user?: UserLike | null;
  mediaUrls?: unknown[] | null;
  participants?: UserLike[] | null;
  comments?: ForumCommentLike[] | null;
  [key: string]: unknown;
};

const mapUser = <T extends UserLike>(u: T): T => attachUserMediaUrls({ ...u });

/** Forum media di DB bisa string path atau `{ url, type }` dari seed/mobile. */
const resolveForumMediaList = (
  media: unknown[] | null | undefined,
): ForumMediaItem[] | null | undefined => {
  if (!Array.isArray(media)) return media as ForumMediaItem[] | null | undefined;

  const resolved = media
    .map((item): ForumMediaItem | null => {
      if (typeof item === 'string') {
        const url = resolveMediaField(item) ?? item;
        return url ? { url, type: 'image' } : null;
      }
      if (item && typeof item === 'object') {
        const raw = item as { url?: unknown; type?: unknown };
        const path = typeof raw.url === 'string' ? raw.url : raw.url != null ? String(raw.url) : '';
        if (!path) return null;
        const url = resolveMediaField(path) ?? path;
        const type = raw.type === 'video' ? 'video' : 'image';
        return { url, type };
      }
      return null;
    })
    .filter((item): item is ForumMediaItem => item != null);

  return resolved.length > 0 ? resolved : [];
};

const attachForumComment = (c: ForumCommentLike): ForumCommentLike => {
  const comment: ForumCommentLike = { ...c };
  const author = comment.author ?? comment.user;
  if (author) {
    const mapped = mapUser({ ...author });
    if (comment.author) comment.author = mapped;
    if (comment.user) comment.user = mapped;
  }
  comment.mediaUrls = resolveForumMediaList(comment.mediaUrls) ?? comment.mediaUrls;
  if (Array.isArray(comment.replies)) {
    comment.replies = comment.replies.map((r) => attachForumComment({ ...r }));
  }
  return comment;
};

export const attachForumCommentMedia = attachForumComment;

export const attachForumMediaUrls = <T extends ForumPostLike>(post: T): T => {
  const next: ForumPostLike = { ...post };
  const author = next.author ?? next.user;
  if (author) {
    const mapped = mapUser({ ...author });
    if (next.author) next.author = mapped;
    if (next.user) next.user = mapped;
  }
  next.mediaUrls = resolveForumMediaList(next.mediaUrls) ?? next.mediaUrls;
  if (Array.isArray(next.participants)) {
    next.participants = next.participants.map((p) => mapUser({ ...p }));
  }
  if (Array.isArray(next.comments)) {
    next.comments = next.comments.map((c) => attachForumComment({ ...c }));
  }
  return { ...post, ...next } as T;
};

type ArticleLike = {
  imageUrl?: string | null;
  author?: UserLike | null;
  [key: string]: unknown;
};

export const attachArticleMediaUrls = <T extends ArticleLike>(article: T): T => {
  const next: ArticleLike = { ...article };
  if (next.imageUrl) {
    next.imageUrl = resolveMediaField(next.imageUrl) ?? next.imageUrl;
  }
  if (next.author) {
    next.author = mapUser({ ...next.author });
  }
  return { ...article, ...next } as T;
};

type ReviewLike = {
  imageUrl?: string | null;
  buyer?: UserLike | null;
  product?: { thumbnailUrl?: string | null; [key: string]: unknown } | null;
  [key: string]: unknown;
};

export const attachReviewMediaUrls = <T extends ReviewLike>(review: T): T => {
  const next: ReviewLike = { ...review };
  if (next.imageUrl) {
    next.imageUrl = resolveMediaField(next.imageUrl) ?? next.imageUrl;
  }
  if (next.buyer) next.buyer = mapUser({ ...next.buyer });
  if (next.product) {
    next.product = attachProductMediaUrls({ ...next.product });
  }
  return { ...review, ...next } as T;
};

type WishlistPayload = {
  products?: Array<{
    thumbnailUrl?: string | null;
    user?: UserLike | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export const attachWishlistMediaUrls = <T extends WishlistPayload>(payload: T): T => {
  if (!Array.isArray(payload.products)) return payload;
  return {
    ...payload,
    products: payload.products.map((p) => {
      const withProduct = attachProductMediaUrls({ ...p });
      if (withProduct.user) {
        withProduct.user = attachUserMediaUrls({ ...withProduct.user });
      }
      return withProduct;
    }),
  } as T;
};

type TransactionLike = {
  order?: Parameters<typeof attachOrderMediaUrls>[0] | null;
  [key: string]: unknown;
};

export const attachTransactionMediaUrls = <T extends TransactionLike>(tx: T): T => {
  if (!tx.order) return tx;
  return { ...tx, order: attachOrderMediaUrls({ ...tx.order }) } as T;
};

type ChatMessageLike = {
  attachmentUrl?: string | null;
  sender?: UserLike | null;
  [key: string]: unknown;
};

type AdminChatThreadLike = {
  messages?: ChatMessageLike[] | null;
  [key: string]: unknown;
};

/** Admin / supplier chat thread messages. */
export const attachAdminChatThreadMedia = <T extends AdminChatThreadLike>(data: T): T => {
  if (!Array.isArray(data.messages)) return data;
  return {
    ...data,
    messages: data.messages.map((m) => attachNegotiationMessageMedia({ ...m })),
  } as T;
};

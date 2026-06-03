import * as storageService from '#services/storage.service';
import { attachShipmentTrackingNumber } from '#utils/order-tracking.util';
import { attachUserMediaUrls } from '#utils/userMedia.util';

type UserLike = { avatarUrl?: string | null };

type OrderItemLike = {
  product?: {
    thumbnailUrl?: string | null;
    images?: Array<{ url?: string | null }>;
  } | null;
};

type OrderLike = {
  orderNumber?: string;
  buyer?: UserLike | null;
  seller?: UserLike | null;
  items?: OrderItemLike[] | null;
  shipment?: Record<string, unknown> | null;
};

const resolveStorageUrl = (path: string | null | undefined): string | null =>
  path ? storageService.getPublicUrl(path) : null;

const attachOrderItemMedia = <T extends OrderItemLike>(item: T): T => {
  if (!item.product) return item;
  const thumb = item.product.thumbnailUrl ?? item.product.images?.[0]?.url ?? null;
  const images = Array.isArray(item.product.images)
    ? item.product.images.map((img) => ({
        ...img,
        url: resolveStorageUrl(img.url ?? null) ?? img.url,
      }))
    : item.product.images;
  return {
    ...item,
    product: {
      ...item.product,
      thumbnailUrl: resolveStorageUrl(thumb),
      images,
    },
  };
};

/** Public CDN URLs for buyer/seller avatars and product thumbnails on order APIs. */
export const attachOrderMediaUrls = <T extends OrderLike>(order: T): T => {
  const next: OrderLike = { ...order };
  if (order.buyer) next.buyer = attachUserMediaUrls({ ...order.buyer });
  if (order.seller) next.seller = attachUserMediaUrls({ ...order.seller });
  if (order.items?.length) {
    next.items = order.items.map((item) => attachOrderItemMedia(item));
  }
  return attachShipmentTrackingNumber({ ...order, ...next } as T);
};

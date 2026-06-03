import * as storageService from '#services/storage.service';
import { attachUserMediaUrls } from '#utils/userMedia.util';

type ProductImageRow = { url: string; [key: string]: unknown };

type ProductUserRow = { avatarUrl?: string | null; [key: string]: unknown };

type ProductWithMedia = {
  thumbnailUrl?: string | null;
  images?: ProductImageRow[] | { select?: unknown } | null;
  user?: ProductUserRow | null;
  [key: string]: unknown;
};

const resolveMediaUrl = (url: string | null | undefined): string | null =>
  storageService.getPublicUrl(url ?? null);

/** Resolve path R2 / external/loremflickr → URL publik untuk response API. */
export const attachProductMediaUrls = <T extends ProductWithMedia>(product: T): T => {
  const images = Array.isArray(product.images) ? product.images : [];

  const mappedImages = images.map((img) => ({
    ...img,
    url: resolveMediaUrl(img.url) ?? img.url,
  }));

  const thumbFromDb = resolveMediaUrl(product.thumbnailUrl);
  const thumbFromGallery =
    mappedImages.find((img) => typeof img.url === 'string' && img.url.length > 0)?.url ?? null;

  const user =
    product.user && typeof product.user === 'object'
      ? attachUserMediaUrls({ ...product.user })
      : product.user;

  return {
    ...product,
    thumbnailUrl: thumbFromDb ?? thumbFromGallery,
    images: mappedImages,
    user,
  } as T;
};

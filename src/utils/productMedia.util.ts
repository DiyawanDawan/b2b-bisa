import * as storageService from '#services/storage.service';
import { attachUserMediaUrls } from '#utils/userMedia.util';

type ProductImageRow = { url: string; [key: string]: unknown };

type ProductVideoRow = {
  url: string;
  thumbnailUrl?: string | null;
  [key: string]: unknown;
};

type ProductUserRow = { avatarUrl?: string | null; [key: string]: unknown };

type ProductWithMedia = {
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  video?: ProductVideoRow | null;
  images?: ProductImageRow[] | { select?: unknown } | null;
  user?: ProductUserRow | null;
  [key: string]: unknown;
};

const resolveMediaPath = (url: string | null | undefined): string | null =>
  storageService.toMediaResponsePath(url ?? null);

const mapProductVideo = (video: ProductVideoRow | null | undefined) => {
  if (!video) return null;

  const url = resolveMediaPath(video.url) ?? video.url;
  const thumbnailUrl = resolveMediaPath(video.thumbnailUrl ?? null) ?? video.thumbnailUrl ?? null;

  return {
    ...video,
    url,
    thumbnailUrl,
  };
};

/** Resolve path R2 / external/loremflickr → storage key for API response (not full URL). */
export const attachProductMediaUrls = <T extends ProductWithMedia>(product: T): T => {
  const images = Array.isArray(product.images) ? product.images : [];

  const mappedImages = images.map((img) => ({
    ...img,
    url: resolveMediaPath(img.url) ?? img.url,
  }));

  const thumbFromDb = resolveMediaPath(product.thumbnailUrl);
  const thumbFromGallery =
    mappedImages.find((img) => typeof img.url === 'string' && img.url.length > 0)?.url ?? null;

  const user =
    product.user && typeof product.user === 'object'
      ? attachUserMediaUrls({ ...product.user })
      : product.user;

  const video = mapProductVideo(product.video ?? null);
  const videoUrl =
    video?.url ?? resolveMediaPath(product.videoUrl ?? null) ?? product.videoUrl ?? null;

  return {
    ...product,
    thumbnailUrl: thumbFromDb ?? thumbFromGallery,
    video,
    videoUrl,
    images: mappedImages,
    user,
  } as T;
};

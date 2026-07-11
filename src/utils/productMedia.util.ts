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

const resolveMediaUrl = (url: string | null | undefined): string | null =>
  storageService.getPublicUrl(url ?? null);

const mapProductVideo = (video: ProductVideoRow | null | undefined) => {
  if (!video) return null;

  const url = resolveMediaUrl(video.url) ?? video.url;
  const thumbnailUrl = resolveMediaUrl(video.thumbnailUrl ?? null) ?? video.thumbnailUrl ?? null;

  return {
    ...video,
    url,
    thumbnailUrl,
  };
};

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

  const video = mapProductVideo(product.video ?? null);
  const videoUrl =
    video?.url ?? resolveMediaUrl(product.videoUrl ?? null) ?? product.videoUrl ?? null;

  return {
    ...product,
    thumbnailUrl: thumbFromDb ?? thumbFromGallery,
    video,
    videoUrl,
    images: mappedImages,
    user,
  } as T;
};

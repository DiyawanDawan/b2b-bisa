import * as storageService from '#services/storage.service';

type UserWithProfile = {
  avatarUrl?: string | null;
};

/** Attach R2 storage keys for avatar on API responses (client resolves CDN). */
export const attachUserMediaUrls = <T extends UserWithProfile>(user: T): T => {
  if (!user.avatarUrl) return user;
  return {
    ...user,
    avatarUrl: storageService.toMediaResponsePath(user.avatarUrl) ?? user.avatarUrl,
  };
};

type AuthPayloadLike = {
  user?: UserWithProfile | null;
  [key: string]: unknown;
};

export const attachAuthResponseMedia = <T extends AuthPayloadLike>(payload: T): T => {
  if (!payload.user) return payload;
  return { ...payload, user: attachUserMediaUrls({ ...payload.user }) };
};

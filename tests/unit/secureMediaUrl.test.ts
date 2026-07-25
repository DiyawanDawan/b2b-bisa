import { isLocalMediaHost, toSecureMediaUrl } from '#utils/env.util';

describe('toSecureMediaUrl', () => {
  it('upgrades http to https for public hosts', () => {
    expect(toSecureMediaUrl('http://103.193.178.163/api/v1/storage/assets/store-banners/a.webp')).toBe(
      'https://103.193.178.163/api/v1/storage/assets/store-banners/a.webp',
    );
    expect(toSecureMediaUrl('http://cdn.bisaagri.com/products/a.webp')).toBe(
      'https://cdn.bisaagri.com/products/a.webp',
    );
  });

  it('keeps localhost and LAN hosts on http', () => {
    expect(toSecureMediaUrl('http://localhost:3000/api/v1/storage/assets/a.webp')).toBe(
      'http://localhost:3000/api/v1/storage/assets/a.webp',
    );
    expect(toSecureMediaUrl('http://192.168.1.10:3000/a.webp')).toBe(
      'http://192.168.1.10:3000/a.webp',
    );
  });

  it('leaves https and relative values untouched', () => {
    expect(toSecureMediaUrl('https://cdn.bisaagri.com/a.webp')).toBe(
      'https://cdn.bisaagri.com/a.webp',
    );
    expect(toSecureMediaUrl('store-banners/a.webp')).toBe('store-banners/a.webp');
  });
});

describe('isLocalMediaHost', () => {
  it.each(['localhost', '127.0.0.1', '10.0.2.2', '172.16.5.4', 'bisa.local'])(
    'treats %s as local',
    (host) => {
      expect(isLocalMediaHost(host)).toBe(true);
    },
  );

  it.each(['103.193.178.163', 'cdn.bisaagri.com', 'backend-dev-v1.bisaagri.com'])(
    'treats %s as public',
    (host) => {
      expect(isLocalMediaHost(host)).toBe(false);
    },
  );
});

describe('getMediaBaseUrl', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
  });

  const loadEnvUtil = async () => {
    jest.resetModules();
    return import('#utils/env.util');
  };

  it('prefers an https candidate over an insecure one', async () => {
    process.env.MEDIA_BASE_URL = 'http://103.193.178.163';
    process.env.API_PUBLIC_URL = 'https://backend-dev-v1.bisaagri.com';
    const { getMediaBaseUrl } = await loadEnvUtil();
    expect(getMediaBaseUrl()).toBe('https://backend-dev-v1.bisaagri.com');
  });

  it('upgrades the only candidate when every origin is http', async () => {
    process.env.MEDIA_BASE_URL = 'http://103.193.178.163/api/v1';
    process.env.API_PUBLIC_URL = '';
    process.env.API_URL = '';
    process.env.CDN_URL = '';
    process.env.NGROK_URL = '';
    const { getMediaBaseUrl, buildStorageAssetUrl } = await loadEnvUtil();
    expect(getMediaBaseUrl()).toBe('https://103.193.178.163');
    expect(buildStorageAssetUrl('store-banners/toko/banner-01.webp')).toBe(
      'https://103.193.178.163/api/v1/storage/assets/store-banners/toko/banner-01.webp',
    );
  });

  it('keeps local development origins on http', async () => {
    process.env.MEDIA_BASE_URL = 'http://localhost:3000';
    const { getMediaBaseUrl } = await loadEnvUtil();
    expect(getMediaBaseUrl()).toBe('http://localhost:3000');
  });
});

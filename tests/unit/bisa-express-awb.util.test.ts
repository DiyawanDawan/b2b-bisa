import {
  generateBisaExpressAwb,
  normalizeWilayahCode,
  resolveAwbWilayahCode,
} from '../../src/utils/bisa-express-awb.util';

jest.mock('../../src/config/prisma', () => ({
  __esModule: true,
  default: {
    bisaExpressShipment: {
      findFirst: jest.fn(),
    },
  },
}));

import prisma from '../../src/config/prisma';

const mockFindFirst = prisma.bisaExpressShipment.findFirst as jest.Mock;

describe('bisa-express-awb.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-20T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('normalizeWilayahCode', () => {
    it('menghapus titik dari kode BPS', () => {
      expect(normalizeWilayahCode('33.74')).toBe('3374');
      expect(normalizeWilayahCode('337401')).toBe('337401');
    });
  });

  describe('resolveAwbWilayahCode', () => {
    it('prioritas kecamatan → kab → prov → 0000', () => {
      expect(
        resolveAwbWilayahCode({
          districtCode: '337401',
          regencyCode: '3374',
          provinceCode: '33',
        }),
      ).toBe('337401');

      expect(
        resolveAwbWilayahCode({
          regencyCode: '3374',
          provinceCode: '33',
        }),
      ).toBe('3374');

      expect(resolveAwbWilayahCode({ provinceCode: '33' })).toBe('33');
      expect(resolveAwbWilayahCode({})).toBe('0000');
    });
  });

  describe('generateBisaExpressAwb', () => {
    it('format BEX-{asal}-{tujuan}-{YYMMDD}-{SEQ4}', async () => {
      const awb = await generateBisaExpressAwb({
        origin: { districtCode: '337401' },
        destination: { districtCode: '337402' },
      });
      expect(awb).toBe('BEX-337401-337402-260720-0001');
    });

    it('increment sequence dari AWB terakhir', async () => {
      mockFindFirst.mockResolvedValue({
        awbNumber: 'BEX-337401-337402-260720-0042',
      });

      const awb = await generateBisaExpressAwb({
        origin: { districtCode: '337401' },
        destination: { districtCode: '337402' },
      });
      expect(awb).toBe('BEX-337401-337402-260720-0043');
    });
  });
});

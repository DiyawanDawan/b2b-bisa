jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '#config/prisma';
import { adminAccessMiddleware } from '#middlewares/adminAccess';
import { requireAuth } from '#middlewares/authMiddleware';
import { isAdmin } from '#middlewares/isAdmin';
import validate from '#middlewares/validate';
import {
  ADMIN_ACTIONS,
  ADMIN_PERMISSION_MATRIX,
  ADMIN_ROLE,
  adminCan,
} from '#constants/admin-permissions.constants';
import {
  idParamSchema,
  paginationQuerySchema,
  queryBoolean,
  queryLimit,
} from '#validations/admin-query.validation';
import { JWT_SECRET } from '#utils/env.util';

const findUnique = prisma.user.findUnique as jest.Mock;

function responseMock() {
  const status = jest.fn();
  const json = jest.fn();
  const response = { status, json };
  status.mockReturnValue(response as never);
  json.mockReturnValue(response as never);
  return response;
}

describe('admin authentication and authorization baseline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = responseMock();
    const next = jest.fn();

    await requireAuth({ headers: {} } as never, response as never, next as never);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates an active ADMIN and allows the admin guard', async () => {
    findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@bisa.test',
      role: 'ADMIN',
      fullName: 'Admin BISA',
      status: 'ACTIVE',
      tier: 'PRO',
      subscriptionExpiresAt: null,
    });
    const token = jwt.sign({ userId: 'admin-1', role: 'ADMIN' }, JWT_SECRET);
    const request: { headers: { authorization: string }; user?: { role: string } } = {
      headers: { authorization: `Bearer ${token}` },
    };
    const response = responseMock();
    const authNext = jest.fn();

    await requireAuth(request as never, response as never, authNext as never);

    expect(authNext).toHaveBeenCalledTimes(1);
    expect(authNext).toHaveBeenCalledWith();
    expect(request.user?.role).toBe('ADMIN');

    const adminNext = jest.fn();
    isAdmin(request as never, response as never, adminNext as never);
    expect(response.status).not.toHaveBeenCalled();
    expect(adminNext).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for an authenticated non-admin', () => {
    const response = responseMock();
    const next = jest.fn();

    isAdmin({ user: { role: 'BUYER' } } as never, response as never, next as never);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('defines one root middleware chain for every admin child route', () => {
    expect(adminAccessMiddleware).toHaveLength(3);
    expect(adminAccessMiddleware[0]).toBe(requireAuth);
    expect(adminAccessMiddleware[1]).toBe(isAdmin);
  });
});

describe('admin permission/action baseline', () => {
  /** Modules currently mounted under `/api/v1/admin` in routes/admin/index.ts. */
  const MOUNTED_MODULES = [
    'dashboard',
    'users',
    'finance',
    'orders',
    'products',
    'notifications',
    'gis',
    'analytics',
    'forum',
    'policies',
    'platformSettings',
    'wallets',
    'market',
    'chat',
    'crm',
    'iot',
    'vouchers',
    'knowledge',
    'support',
    'partnerships',
    'bisaExpress',
  ];

  it('keeps a single ADMIN role', () => {
    expect(ADMIN_ROLE).toBe('ADMIN');
  });

  it('covers every mounted admin module', () => {
    const modules = Object.keys(ADMIN_PERMISSION_MATRIX);
    expect(modules).toEqual(expect.arrayContaining(MOUNTED_MODULES));
  });

  it('grants only known actions and always allows read', () => {
    for (const [module, actions] of Object.entries(ADMIN_PERMISSION_MATRIX)) {
      expect(actions.length).toBeGreaterThan(0);
      expect(actions).toContain('read');
      for (const action of actions) {
        expect(ADMIN_ACTIONS).toContain(action);
      }
      expect(new Set(actions).size).toBe(actions.length);
      expect(module).not.toHaveLength(0);
    }
  });

  it('resolves granted and denied actions', () => {
    expect(adminCan('users', 'moderate')).toBe(true);
    expect(adminCan('dashboard', 'delete')).toBe(false);
  });
});

describe('admin query and payload validation contract', () => {
  it('applies pagination defaults and coerces valid query strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 10 });
    expect(paginationQuerySchema.parse({ page: '2', limit: '25', search: 'biochar' })).toEqual({
      page: 2,
      limit: 25,
      search: 'biochar',
    });
  });

  it('rejects invalid pagination, boolean filters, and identifiers', () => {
    expect(() => paginationQuerySchema.parse({ page: 'zero' })).toThrow();
    expect(() => queryLimit(50, 20).parse('51')).toThrow();
    expect(() => queryBoolean.parse('yes')).toThrow();
    expect(() => idParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
  });

  it('strips unknown payload keys and returns the standard validation envelope', () => {
    const schema = z.object({ name: z.string().min(2) });
    const middleware = validate(schema);
    const validRequest = { body: { name: 'BISA', role: 'ADMIN' } };
    const next = jest.fn();

    middleware(validRequest as never, responseMock() as never, next as never);
    expect(validRequest.body).toEqual({ name: 'BISA' });
    expect(next).toHaveBeenCalledTimes(1);

    const invalidResponse = responseMock();
    middleware({ body: { name: '' } } as never, invalidResponse as never, jest.fn() as never);
    expect(invalidResponse.status).toHaveBeenCalledWith(400);
    expect(invalidResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ success: false, status: 400 }),
        data: expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
      }),
    );
  });
});

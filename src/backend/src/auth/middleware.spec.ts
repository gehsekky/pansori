// Role middleware — requireAdmin and requireCampaignRole control flow.
// The pg pool module is mocked: tests verify gate decisions (admin bypass,
// owner ⊃ editor hierarchy, non-member 403, missing param 400, query error
// 500), not SQL.

import type { CampaignAuthedRequest, CampaignRole } from './middleware.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin, requireCampaignRole } from './middleware.js';
import type { Request } from 'express';

const queryMock = vi.fn();
vi.mock('../db/pool.js', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

interface MockRes {
  statusCode: number | null;
  body: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => MockRes;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: null,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function makeReq(opts: {
  isAdmin?: boolean;
  userId?: string | null;
  campaignId?: string;
}): Request {
  return {
    user:
      opts.userId === null
        ? undefined
        : {
            id: opts.userId ?? 'u1',
            email: 'u@test',
            display_name: 'U',
            avatar_url: null,
            is_admin: !!opts.isAdmin,
          },
    params: opts.campaignId !== undefined ? { campaignId: opts.campaignId } : {},
  } as unknown as Request;
}

function memberRole(role: CampaignRole | null) {
  queryMock.mockResolvedValueOnce({ rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('requireAdmin', () => {
  it('passes admins through', () => {
    const next = vi.fn();
    const res = makeRes();
    requireAdmin(makeReq({ isAdmin: true }), res as never, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it('rejects non-admins with 403', () => {
    const next = vi.fn();
    const res = makeRes();
    requireAdmin(makeReq({ isAdmin: false }), res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe('requireCampaignRole', () => {
  it('lets an owner through an editor gate (owner ⊃ editor)', async () => {
    const next = vi.fn();
    const res = makeRes();
    const req = makeReq({ campaignId: 'malgovia' });
    memberRole('owner');
    await requireCampaignRole('editor')(req, res as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as CampaignAuthedRequest).campaign_role).toBe('owner');
  });

  it('lets an editor through an editor gate', async () => {
    const next = vi.fn();
    const res = makeRes();
    const req = makeReq({ campaignId: 'malgovia' });
    memberRole('editor');
    await requireCampaignRole('editor')(req, res as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as CampaignAuthedRequest).campaign_role).toBe('editor');
  });

  it('lets a player through a player gate but not an editor gate', async () => {
    const next = vi.fn();
    const res = makeRes();
    const req = makeReq({ campaignId: 'malgovia' });
    memberRole('player');
    await requireCampaignRole('player')(req, res as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as CampaignAuthedRequest).campaign_role).toBe('player');

    const blocked = makeRes();
    memberRole('player');
    await requireCampaignRole('editor')(
      makeReq({ campaignId: 'malgovia' }),
      blocked as never,
      vi.fn()
    );
    expect(blocked.statusCode).toBe(403);
  });

  it('blocks an editor from an owner gate with 403', async () => {
    const next = vi.fn();
    const res = makeRes();
    memberRole('editor');
    await requireCampaignRole('owner')(makeReq({ campaignId: 'malgovia' }), res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('blocks a non-member with 403', async () => {
    const next = vi.fn();
    const res = makeRes();
    memberRole(null);
    await requireCampaignRole('editor')(makeReq({ campaignId: 'malgovia' }), res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('bypasses membership for site admins (no query) and resolves role owner', async () => {
    const next = vi.fn();
    const res = makeRes();
    const req = makeReq({ isAdmin: true, campaignId: 'malgovia' });
    await requireCampaignRole('owner')(req, res as never, next);
    expect(next).toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
    expect((req as CampaignAuthedRequest).campaign_role).toBe('owner');
  });

  it('401s when unauthenticated and 400s on a missing campaign id', async () => {
    const noUser = makeRes();
    await requireCampaignRole('editor')(makeReq({ userId: null }), noUser as never, vi.fn());
    expect(noUser.statusCode).toBe(401);

    const noParam = makeRes();
    await requireCampaignRole('editor')(makeReq({}), noParam as never, vi.fn());
    expect(noParam.statusCode).toBe(400);
  });

  it('500s when the membership query throws', async () => {
    const next = vi.fn();
    const res = makeRes();
    queryMock.mockRejectedValueOnce(new Error('db down'));
    await requireCampaignRole('editor')(makeReq({ campaignId: 'malgovia' }), res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});

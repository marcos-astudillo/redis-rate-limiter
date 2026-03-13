import { Request } from 'express';
import { byApiKeyOrUser, byIp, byApiKey, byIpAndRoute } from '../../src/services/keyExtractor';

function mockReq(overrides: Partial<Request & { user?: { id: string } }> = {}): Request {
  return {
    headers:  {},
    ip:       '1.2.3.4',
    socket:   { remoteAddress: '1.2.3.4' },
    path:     '/v1/test',
    ...overrides,
  } as unknown as Request;
}

// ─── byApiKeyOrUser ───────────────────────────────────────────────────────────

describe('byApiKeyOrUser', () => {
  it('returns apikey: prefix when x-api-key header is present', () => {
    const req = mockReq({ headers: { 'x-api-key': 'secret-key' } });
    expect(byApiKeyOrUser(req)).toBe('apikey:secret-key');
  });

  it('handles array x-api-key header (picks first value)', () => {
    const req = mockReq({ headers: { 'x-api-key': ['key-a', 'key-b'] } });
    expect(byApiKeyOrUser(req)).toBe('apikey:key-a');
  });

  it('returns user: prefix when user is set on the request', () => {
    const req = mockReq({ user: { id: 'user-456' } });
    expect(byApiKeyOrUser(req)).toBe('user:user-456');
  });

  it('falls back to ip: when neither header nor user is present', () => {
    const req = mockReq({ ip: '10.0.0.5' });
    expect(byApiKeyOrUser(req)).toBe('ip:10.0.0.5');
  });

  it('prefers API key over user ID when both are present', () => {
    const req = mockReq({ headers: { 'x-api-key': 'key-1' }, user: { id: 'user-1' } });
    expect(byApiKeyOrUser(req)).toBe('apikey:key-1');
  });

  it('uses socket.remoteAddress when req.ip is falsy', () => {
    const req = mockReq({ ip: undefined, socket: { remoteAddress: '192.168.1.1' } } as any);
    expect(byApiKeyOrUser(req)).toBe('ip:192.168.1.1');
  });
});

// ─── byIp ─────────────────────────────────────────────────────────────────────

describe('byIp', () => {
  it('returns ip: prefix with req.ip', () => {
    expect(byIp(mockReq({ ip: '10.0.0.1' }))).toBe('ip:10.0.0.1');
  });

  it('respects the first IP in x-forwarded-for', () => {
    const req = mockReq({ headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } });
    expect(byIp(req)).toBe('ip:203.0.113.1');
  });

  it('trims whitespace from x-forwarded-for', () => {
    const req = mockReq({ headers: { 'x-forwarded-for': '  5.5.5.5  , 10.0.0.1' } });
    expect(byIp(req)).toBe('ip:5.5.5.5');
  });
});

// ─── byApiKey ─────────────────────────────────────────────────────────────────

describe('byApiKey', () => {
  it('returns apikey: when header is present', () => {
    const req = mockReq({ headers: { 'x-api-key': 'my-key' } });
    expect(byApiKey(req)).toBe('apikey:my-key');
  });

  it('falls back to ip: when no header', () => {
    expect(byApiKey(mockReq())).toBe('ip:1.2.3.4');
  });
});

// ─── byIpAndRoute ─────────────────────────────────────────────────────────────

describe('byIpAndRoute', () => {
  it('combines ip and path', () => {
    const req = mockReq({ ip: '5.6.7.8', path: '/v1/orders' });
    expect(byIpAndRoute(req)).toBe('ip:5.6.7.8|route:/v1/orders');
  });

  it('works with nested paths', () => {
    const req = mockReq({ ip: '1.1.1.1', path: '/v1/users/123/orders' });
    expect(byIpAndRoute(req)).toBe('ip:1.1.1.1|route:/v1/users/123/orders');
  });
});

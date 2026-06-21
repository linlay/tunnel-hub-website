import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('logs in with credentials and cookies', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ username: 'admin' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const response = await api.login('admin', 'secret');

    expect(response.username).toBe('admin');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ username: 'admin', password: 'secret' })
      })
    );
  });

  it('raises API errors with server messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(api.routes()).rejects.toEqual(new ApiError(401, 'authentication required'));
  });

  it('creates admin users', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '2',
          username: 'ops',
          status: 'active',
          createdAt: 'now',
          updatedAt: 'now'
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );

    const response = await api.createAdminUser({ username: 'ops', password: 'secret', status: 'active' });

    expect(response.username).toBe('ops');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ username: 'ops', password: 'secret', status: 'active' })
      })
    );
  });

  it('publishes managed services', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          publicHost: 'auditor.tunnel-hub.zenmind.cc',
          publicUrl: 'https://auditor.tunnel-hub.zenmind.cc',
          route: {
            id: 'route_1',
            publicHost: 'auditor.tunnel-hub.zenmind.cc',
            targetUrl: 'http://127.0.0.1:3000',
            active: true,
            createdAt: 'now',
            updatedAt: 'now'
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );

    const response = await api.publishService('auditor', {
      targetUrl: 'http://127.0.0.1:3000',
      tokenId: 'token_1',
      active: true
    });

    expect(response.publicHost).toBe('auditor.tunnel-hub.zenmind.cc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/services/auditor',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify({ targetUrl: 'http://127.0.0.1:3000', tokenId: 'token_1', active: true })
      })
    );
  });

  it('lists agent records', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            token: {
              id: 'token_1',
              name: 'mac-mini',
              tokenPrefix: 'zt_abc',
              active: true,
              createdAt: 'now'
            },
            online: true,
            sessionId: 'session_1',
            remoteAddr: '127.0.0.1:50000',
            connectedAt: 'now',
            routes: [],
            routeCount: 0
          }
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );

    const response = await api.agents();

    expect(response[0].token.name).toBe('mac-mini');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/agents', expect.objectContaining({ credentials: 'include' }));
  });

  it('reads console overview with a traffic range', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          range: 'day',
          desktopConnectionCount: 1,
          webAppCount: 2,
          totalTrafficBytes: 1234,
          resources: {
            totalDesktops: 1,
            onlineDesktops: 1,
            totalWebApps: 2,
            activeWebApps: 2,
            activeStreams: 0,
            totalStreams: 4
          },
          traffic: []
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );

    const response = await api.overview('day');

    expect(response.webAppCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/overview?range=day', expect.objectContaining({ credentials: 'include' }));
  });

  it('lists desktops and webapps from admin endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/admin/desktops') {
        return new Response(
          JSON.stringify([
            {
              deviceId: 'device_1',
              publicHost: 'desk.m.zenmind.cc',
              publicUrl: 'https://desk.m.zenmind.cc',
              tokenId: 'token_1',
              tokenActive: true,
              online: true,
              traffic: { requestCount: 0, bytesIn: 0, bytesOut: 0 },
              webAppCount: 1,
              createdAt: 'now',
              updatedAt: 'now'
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify([
          {
            id: 'webapp_1',
            name: 'app',
            routeId: 'route_1',
            publicHost: 'app.wa.zenmind.cc',
            publicUrl: 'https://app.wa.zenmind.cc',
            targetUrl: 'http://127.0.0.1:3000',
            active: true,
            online: true,
            route: {
              id: 'route_1',
              publicHost: 'app.wa.zenmind.cc',
              targetUrl: 'http://127.0.0.1:3000',
              active: true,
              createdAt: 'now',
              updatedAt: 'now'
            },
            requestCount: 0,
            traffic: { requestCount: 0, bytesIn: 0, bytesOut: 0 },
            createdAt: 'now',
            updatedAt: 'now'
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const desktops = await api.desktops();
    const webapps = await api.webapps();

    expect(desktops[0].publicHost).toBe('desk.m.zenmind.cc');
    expect(webapps[0].publicHost).toBe('app.wa.zenmind.cc');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/desktops', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/webapps', expect.objectContaining({ credentials: 'include' }));
  });

  it('filters activity and closes sessions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).startsWith('/api/admin/activity')) {
        return new Response(JSON.stringify({ items: [{ id: 'traffic-1', objectType: 'webapp', type: 'traffic.http', message: 'Webapp request', createdAt: 'now' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const activity = await api.activity('webapp', 'app');
    await api.closeSession('session_1');

    expect(activity[0].objectType).toBe('webapp');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/activity?objectType=webapp&q=app', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/sessions/session_1/close', expect.objectContaining({ method: 'POST' }));
  });
});

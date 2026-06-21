import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import {
  ActivityRecord,
  AdminUser,
  DesktopRecord,
  OverviewResponse,
  Route,
  WebAppRecord
} from './lib/api';

const now = new Date('2026-06-18T08:00:00.000Z').toISOString();

beforeEach(() => {
  installLocalStorage();
  window.localStorage.setItem('tunnel-hub-locale', 'zh-CN');
  window.history.replaceState({}, '', '/');
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows login when session is anonymous and submits credentials', async () => {
    const fetchMock = installFetchMock({ authenticated: false });

    render(<App />);

    await screen.findByRole('button', { name: /登录/i });
    await userEvent.clear(screen.getByLabelText(/密码/i));
    await userEvent.type(screen.getByLabelText(/密码/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /登录/i }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/login', expect.anything());
  });

  it('redirects the root route to overview and removes the token sidebar entry', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: /概览/i })).toHaveClass('active');
    expect(within(nav).getByRole('button', { name: /桌面智能体/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /网站应用/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /活动日志/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /令牌/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/创建桌面智能体令牌/i)).not.toBeInTheDocument();
  });

  it('supports direct subroutes, unknown fallback, and popstate navigation', async () => {
    window.history.replaceState({}, '', '/desktops');
    installFetchMock(dashboardFixture());

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: '桌面智能体' })).toBeInTheDocument();
    expect(screen.getByText('desk.m.zenmind.cc')).toBeInTheDocument();

    await act(async () => {
      window.history.pushState({}, '', '/activity');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: '活动日志' })).toBeInTheDocument();

    await act(async () => {
      window.history.pushState({}, '', '/unknown');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
    expect(screen.getByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('opens admin user management from the hidden user menu route', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    await screen.findByRole('heading', { name: '概览' });
    await userEvent.click(screen.getByRole('button', { name: /admin/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /管理员管理/i }));

    expect(window.location.pathname).toBe('/admins');
    expect(screen.getByRole('heading', { name: /管理员管理/i })).toBeInTheDocument();
    expect(screen.getByText('创建管理员')).toBeInTheDocument();
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
  });

  it('searches desktops and calls close/deactivate actions', async () => {
    window.history.replaceState({}, '', '/desktops');
    const fetchMock = installFetchMock(dashboardFixture());

    render(<App />);

    await screen.findByText('desk.m.zenmind.cc');
    await userEvent.type(screen.getByLabelText('搜索桌面智能体'), 'mac');
    expect(screen.getByText('desk.m.zenmind.cc')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('搜索桌面智能体'));
    await userEvent.type(screen.getByLabelText('搜索桌面智能体'), 'nobody');
    expect(screen.getByText('暂无桌面智能体')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('搜索桌面智能体'));
    await userEvent.type(screen.getByLabelText('搜索桌面智能体'), 'desk');
    await userEvent.click(screen.getByRole('button', { name: '关闭当前连接' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/sessions/session_1/close',
        expect.objectContaining({ method: 'POST' })
      )
    );

    await userEvent.click(screen.getByRole('button', { name: '停用设备' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/tokens/token_1',
        expect.objectContaining({ method: 'DELETE' })
      )
    );
  });

  it('searches webapps, keeps deployment editing, and never posts manual tokens', async () => {
    window.history.replaceState({}, '', '/webapps');
    const fetchMock = installFetchMock(dashboardFixture());

    render(<App />);

    expect(await screen.findByText('app.wa.zenmind.cc')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('搜索网站应用'), 'missing');
    expect(screen.getByText('暂无网站应用')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('搜索网站应用'));
    await userEvent.type(screen.getByLabelText('搜索网站应用'), 'app');
    expect(screen.getByText('app.wa.zenmind.cc')).toBeInTheDocument();
    expect(screen.getByDisplayValue('mac-mini')).toBeInTheDocument();
    expect(screen.queryByText(/创建桌面智能体令牌/i)).not.toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/tokens',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('filters activity by object type and keyword through the admin API', async () => {
    window.history.replaceState({}, '', '/activity');
    const fetchMock = installFetchMock(dashboardFixture());

    render(<App />);

    expect(await screen.findByText('Agent connected')).toBeInTheDocument();
    expect(screen.getByText('Webapp request')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /网站应用/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/activity?objectType=webapp',
        expect.objectContaining({ credentials: 'include' })
      )
    );
    expect(await screen.findByText('Webapp request')).toBeInTheDocument();
    expect(screen.queryByText('Agent connected')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('筛选活动'), 'app');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/activity?objectType=webapp&q=app',
        expect.objectContaining({ credentials: 'include' })
      )
    );
  });

  it('switches navigation to English from the user menu', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    await screen.findByRole('heading', { name: '概览' });
    await userEvent.click(screen.getByRole('button', { name: /admin/i }));
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByRole('button', { name: /Desktop Agent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Web Apps/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activity Log/i })).toBeInTheDocument();
  });

  it('switches between dark and light theme from the user menu', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    await screen.findByRole('heading', { name: '概览' });
    await userEvent.click(screen.getByRole('button', { name: /admin/i }));
    await userEvent.click(screen.getByRole('button', { name: /黑夜/i }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    await userEvent.click(screen.getByRole('button', { name: /白天/i }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});

function dashboardFixture(overrides: Partial<FetchFixture> = {}): FetchFixture {
  const route: Route = {
    id: 'route_1',
    publicHost: 'app.wa.zenmind.cc',
    targetUrl: 'http://127.0.0.1:3000',
    tokenId: 'token_1',
    active: true,
    createdAt: now,
    updatedAt: now
  };
  const desktop: DesktopRecord = {
    deviceId: 'device_1',
    deviceName: 'mac-mini',
    ownerEmail: 'lin@example.com',
    publicHost: 'desk.m.zenmind.cc',
    publicUrl: 'https://desk.m.zenmind.cc',
    tokenId: 'token_1',
    tokenName: 'mac-mini',
    tokenActive: true,
    online: true,
    sessionId: 'session_1',
    remoteAddr: '127.0.0.1:50000',
    connectedAt: now,
    lastConnectedAt: now,
    traffic: {
      requestCount: 2,
      bytesIn: 2048,
      bytesOut: 4096,
      lastAt: now
    },
    webAppCount: 1,
    createdAt: now,
    updatedAt: now
  };
  const webapp: WebAppRecord = {
    id: 'webapp_1',
    name: 'app',
    routeId: route.id,
    publicHost: route.publicHost,
    publicUrl: 'https://app.wa.zenmind.cc',
    targetUrl: route.targetUrl,
    tokenId: route.tokenId,
    deviceId: desktop.deviceId,
    deviceName: desktop.deviceName,
    active: true,
    online: true,
    route,
    requestCount: 4,
    lastAccessAt: now,
    traffic: {
      requestCount: 4,
      bytesIn: 1024,
      bytesOut: 8192,
      lastAt: now
    },
    createdAt: now,
    updatedAt: now
  };
  const activity: ActivityRecord[] = [
    {
      id: 'session-connected-session_1',
      objectType: 'desktop',
      type: 'agent.connected',
      message: 'Agent connected',
      details: '127.0.0.1:50000',
      tokenId: 'token_1',
      sessionId: 'session_1',
      createdAt: now
    },
    {
      id: 'traffic-1',
      objectType: 'webapp',
      type: 'traffic.http',
      message: 'Webapp request',
      details: 'app.wa.zenmind.cc/',
      publicHost: 'app.wa.zenmind.cc',
      routeId: 'route_1',
      tokenId: 'token_1',
      sessionId: 'session_1',
      statusCode: 200,
      bytesIn: 10,
      bytesOut: 99,
      createdAt: now
    }
  ];
  return {
    authenticated: true,
    overview: {
      range: 'hour',
      desktopConnectionCount: 1,
      webAppCount: 1,
      totalTrafficBytes: 15360,
      recentConnectionAt: now,
      recentIdentity: 'lin@example.com',
      recentDevice: 'mac-mini',
      resources: {
        totalDesktops: 1,
        onlineDesktops: 1,
        totalWebApps: 1,
        activeWebApps: 1,
        activeStreams: 1,
        totalStreams: 5
      },
      traffic: [
        {
          bucket: now,
          label: '08:00',
          bytesIn: 2048,
          bytesOut: 4096,
          totalBytes: 6144
        }
      ]
    },
    desktops: [desktop],
    webapps: [webapp],
    adminUsers: [
      {
        id: '1',
        username: 'admin',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      }
    ],
    activity,
    ...overrides
  };
}

type FetchFixture = {
  authenticated: boolean;
  overview: OverviewResponse;
  desktops: DesktopRecord[];
  webapps: WebAppRecord[];
  adminUsers: AdminUser[];
  activity: ActivityRecord[];
};

function installFetchMock(fixture: Partial<FetchFixture> = {}) {
  const state = dashboardFixture(fixture);
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    if (path === '/api/admin/me') {
      return state.authenticated
        ? json({ username: 'admin' })
        : json({ error: 'authentication required' }, 401);
    }
    if (path === '/api/admin/login') {
      state.authenticated = true;
      return json({ username: 'admin' });
    }
    if (path === '/api/admin/logout') {
      state.authenticated = false;
      return json({ ok: true });
    }
    if (path === '/api/admin/overview') {
      return json({ ...state.overview, range: url.searchParams.get('range') ?? state.overview.range });
    }
    if (path === '/api/admin/desktops') {
      return json(state.desktops);
    }
    if (path === '/api/admin/webapps') {
      return json(state.webapps);
    }
    if (path === '/api/admin/activity') {
      const objectType = url.searchParams.get('objectType') ?? 'all';
      const query = (url.searchParams.get('q') ?? '').toLowerCase();
      const items = state.activity.filter((item) => {
        const typeMatches = objectType === 'all' || item.objectType === objectType;
        const searchText = [item.message, item.details, item.publicHost, item.routeId, item.tokenId, item.sessionId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return typeMatches && (!query || searchText.includes(query));
      });
      return json({ items });
    }
    if (path === '/api/admin/users' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { username: string; status?: 'active' | 'disabled' };
      const user: AdminUser = {
        id: `user_${state.adminUsers.length + 1}`,
        username: body.username,
        status: body.status ?? 'active',
        createdAt: now,
        updatedAt: now
      };
      state.adminUsers = [...state.adminUsers, user];
      return json(user, 201);
    }
    if (path === '/api/admin/users') {
      return json({ items: state.adminUsers });
    }
    if (path === '/api/admin/tokens/token_1' && method === 'DELETE') {
      state.desktops = state.desktops.map((desktop) =>
        desktop.tokenId === 'token_1' ? { ...desktop, tokenActive: false } : desktop
      );
      return json({ ok: true });
    }
    if (path === '/api/admin/sessions/session_1/close' && method === 'POST') {
      state.desktops = state.desktops.map((desktop) =>
        desktop.sessionId === 'session_1' ? { ...desktop, online: false, sessionId: undefined } : desktop
      );
      return json({ ok: true });
    }
    if (path === '/api/admin/routes' && method === 'POST') {
      return json(state.webapps[0].route, 201);
    }
    if (path === '/api/admin/services/auditor' && method === 'PUT') {
      return json({ route: state.webapps[0].route, publicHost: state.webapps[0].publicHost, publicUrl: state.webapps[0].publicUrl });
    }
    if (path === '/api/admin/routes') {
      return json(state.webapps.map((webapp) => webapp.route));
    }
    return json({ ok: true });
  });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
}

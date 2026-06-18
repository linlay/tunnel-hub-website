import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AgentRecord, AgentSession, EventLog, Metrics, Route, TunnelToken } from './lib/api';

const now = new Date('2026-06-18T08:00:00.000Z').toISOString();

beforeEach(() => {
  installLocalStorage();
  window.localStorage.setItem('tunnel-hub-locale', 'zh-CN');
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

  it('renders the new navigation labels and route status for an authenticated session', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    expect(await screen.findByText('app.example.com')).toBeInTheDocument();
    expect(await screen.findByText('运行中')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: /桌面智能体/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /网站应用/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /活动日志/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^API Keys$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /连接历史/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^事件$/i })).not.toBeInTheDocument();
  });

  it('shows the agent connection command after creating a token', async () => {
    installFetchMock({ ...dashboardFixture(), tokens: [] });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /令牌/i }));
    await userEvent.click(screen.getByRole('button', { name: /创建/i }));

    expect(await screen.findByText(/AGENT_TOKEN=zt_secret/)).toBeInTheDocument();
    expect(await screen.findByText(/AGENT_RELAY_URL=ws:\/\/.*\/tunnel/)).toBeInTheDocument();
  });

  it('opens Admin API Keys from the user menu', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    await screen.findByText('app.example.com');
    await userEvent.click(screen.getByRole('button', { name: /admin/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Admin API Keys/i }));

    expect(screen.getByRole('heading', { name: /Admin API Keys/i })).toBeInTheDocument();
    expect(screen.getByText('创建 Admin API Key')).toBeInTheDocument();
  });

  it('combines sessions and events in activity log and filters connections', async () => {
    installFetchMock(
      dashboardFixture({
        sessions: [
          {
            id: 'session_1',
            tokenId: 'token_1',
            remoteAddr: '127.0.0.1:50000',
            connectedAt: now
          }
        ],
        events: [
          {
            id: 1,
            type: 'route.updated',
            message: 'Route updated',
            details: 'app.example.com',
            createdAt: now
          }
        ]
      })
    );

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /活动日志/i }));
    expect(screen.getByText(/127\.0\.0\.1:50000/)).toBeInTheDocument();
    expect(screen.getByText('Route updated')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /连接/i }));
    expect(screen.getByText(/127\.0\.0\.1:50000/)).toBeInTheDocument();
    expect(screen.queryByText('Route updated')).not.toBeInTheDocument();
  });

  it('switches navigation to English from the user menu', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    await screen.findByText('app.example.com');
    await userEvent.click(screen.getByRole('button', { name: /admin/i }));
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByRole('button', { name: /Desktop Agent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Web Apps/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activity Log/i })).toBeInTheDocument();
  });

  it('switches between dark and light theme from the user menu', async () => {
    installFetchMock(dashboardFixture());

    render(<App />);

    await screen.findByText('app.example.com');
    await userEvent.click(screen.getByRole('button', { name: /admin/i }));
    await userEvent.click(screen.getByRole('button', { name: /黑夜/i }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    await userEvent.click(screen.getByRole('button', { name: /白天/i }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});

function dashboardFixture(overrides: Partial<FetchFixture> = {}): FetchFixture {
  const token: TunnelToken = {
    id: 'token_1',
    name: 'mac-mini',
    tokenPrefix: 'zt_abc',
    active: true,
    createdAt: now
  };
  const route: Route = {
    id: 'route_1',
    publicHost: 'app.example.com',
    targetUrl: 'http://127.0.0.1:3000',
    tokenId: token.id,
    active: true,
    createdAt: now,
    updatedAt: now
  };
  const agent: AgentRecord = {
    token,
    online: true,
    sessionId: 'session_1',
    remoteAddr: '127.0.0.1:50000',
    connectedAt: now,
    routes: [],
    routeCount: 1
  };
  return {
    authenticated: true,
    routes: [route],
    tokens: [token],
    agents: [agent],
    apiKeys: [],
    sessions: [],
    events: [],
    metrics: {
      hasActiveAgent: true,
      activeAgentCount: 1,
      activeAgents: [],
      totalStreams: 3,
      activeStreams: 1
    },
    ...overrides
  };
}

type FetchFixture = {
  authenticated: boolean;
  routes: Route[];
  tokens: TunnelToken[];
  agents: AgentRecord[];
  apiKeys: unknown[];
  sessions: AgentSession[];
  events: EventLog[];
  metrics: Metrics;
};

function installFetchMock(fixture: Partial<FetchFixture> = {}) {
  const state = dashboardFixture(fixture);
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);
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
    if (path === '/api/admin/routes') {
      return json(state.routes);
    }
    if (path === '/api/admin/tokens' && method === 'POST') {
      return json(
        {
          token: {
            id: 'token_created',
            name: 'mac-mini-office',
            tokenPrefix: 'zt_secret',
            active: true,
            createdAt: now
          },
          secret: 'zt_secret'
        },
        201
      );
    }
    if (path === '/api/admin/tokens') {
      return json(state.tokens);
    }
    if (path === '/api/admin/agents') {
      return json(state.agents);
    }
    if (path === '/api/admin/api-keys') {
      return json(state.apiKeys);
    }
    if (path === '/api/admin/sessions') {
      return json(state.sessions);
    }
    if (path === '/api/admin/events') {
      return json(state.events);
    }
    if (path === '/api/admin/metrics') {
      return json(state.metrics);
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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows login when session is anonymous and submits credentials', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'authentication required' }, 401))
      .mockResolvedValueOnce(json({ username: 'admin' }))
      .mockResolvedValue(json([]));

    render(<App />);

    await screen.findByRole('button', { name: /登录/i });
    await userEvent.clear(screen.getByLabelText(/密码/i));
    await userEvent.type(screen.getByLabelText(/密码/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /登录/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/login', expect.anything()));
  });

  it('renders status and route data for an authenticated session', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ username: 'admin' }))
      .mockResolvedValueOnce(
        json([
          {
            id: 'route_1',
            publicHost: 'app.example.com',
            targetUrl: 'http://127.0.0.1:3000',
            tokenId: 'token_1',
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ])
      )
      .mockResolvedValueOnce(
        json([
          {
            id: 'token_1',
            name: 'mac-mini',
            tokenPrefix: 'zt_abc',
            active: true,
            createdAt: new Date().toISOString()
          }
        ])
      )
      .mockResolvedValueOnce(
        json([
          {
            token: {
              id: 'token_1',
              name: 'mac-mini',
              tokenPrefix: 'zt_abc',
              active: true,
              createdAt: new Date().toISOString()
            },
            online: true,
            sessionId: 'session_1',
            remoteAddr: '127.0.0.1:50000',
            connectedAt: new Date().toISOString(),
            routes: [],
            routeCount: 1
          }
        ])
      )
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(
        json({
          hasActiveAgent: true,
          activeAgentCount: 1,
          activeAgents: [],
          totalStreams: 3,
          activeStreams: 1
        })
      );

    render(<App />);

    expect(await screen.findByText('app.example.com')).toBeInTheDocument();
    expect(await screen.findByText('运行中')).toBeInTheDocument();
  });

  it('shows the agent connection command after creating a token', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ username: 'admin' }))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ hasActiveAgent: false, activeAgentCount: 0, activeAgents: [], totalStreams: 0, activeStreams: 0 }))
      .mockResolvedValueOnce(
        json({
          token: {
            id: 'token_1',
            name: 'mac-mini-office',
            tokenPrefix: 'zt_abc',
            active: true,
            createdAt: new Date().toISOString()
          },
          secret: 'zt_secret'
        }, 201)
      )
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ hasActiveAgent: false, activeAgentCount: 0, activeAgents: [], totalStreams: 0, activeStreams: 0 }));

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /令牌/i }));
    await userEvent.click(screen.getByRole('button', { name: /创建/i }));

    expect(await screen.findByText(/AGENT_TOKEN=zt_secret/)).toBeInTheDocument();
    expect(await screen.findByText(/AGENT_RELAY_URL=ws:\/\/.*\/tunnel/)).toBeInTheDocument();
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export type Route = {
  id: string;
  publicHost: string;
  targetUrl: string;
  tokenId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TunnelToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
};

export type AdminApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
};

export type AgentSession = {
  id: string;
  tokenId: string;
  remoteAddr: string;
  connectedAt: string;
  disconnectedAt?: string;
};

export type EventLog = {
  id: number;
  type: string;
  message: string;
  details: string;
  createdAt: string;
};

export type Metrics = {
  hasActiveAgent: boolean;
  sessionId?: string;
  tokenId?: string;
  totalStreams: number;
  activeStreams: number;
  activeAgentCount: number;
  activeAgents: ActiveAgentMetric[];
};

export type ActiveAgentMetric = {
  sessionId: string;
  tokenId: string;
  remoteAddr: string;
  connectedAt: string;
};

export type AgentRecord = {
  token: TunnelToken;
  online: boolean;
  sessionId?: string;
  remoteAddr?: string;
  connectedAt?: string;
  routes: Route[];
  routeCount: number;
};

export type LoginResponse = {
  username: string;
};

export type TokenCreateResponse = {
  token: TunnelToken;
  secret: string;
};

export type AdminApiKeyCreateResponse = {
  apiKey: AdminApiKey;
  secret: string;
};

export type ServicePublishResponse = {
  route: Route;
  publicHost: string;
  publicUrl: string;
};

export type RouteInput = {
  publicHost: string;
  targetUrl: string;
  tokenId: string;
  active: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, payload?.error ?? response.statusText);
  }
  return payload as T;
}

export const api = {
  login(username: string, password: string) {
    return request<LoginResponse>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  logout() {
    return request<{ ok: boolean }>('/api/admin/logout', { method: 'POST' });
  },
  me() {
    return request<LoginResponse>('/api/admin/me');
  },
  routes() {
    return request<Route[]>('/api/admin/routes');
  },
  createRoute(input: RouteInput) {
    return request<Route>('/api/admin/routes', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateRoute(id: string, input: RouteInput) {
    return request<Route>(`/api/admin/routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  },
  deleteRoute(id: string) {
    return request<{ ok: boolean }>(`/api/admin/routes/${id}`, { method: 'DELETE' });
  },
  tokens() {
    return request<TunnelToken[]>('/api/admin/tokens');
  },
  createToken(name: string) {
    return request<TokenCreateResponse>('/api/admin/tokens', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },
  deleteToken(id: string) {
    return request<{ ok: boolean }>(`/api/admin/tokens/${id}`, { method: 'DELETE' });
  },
  apiKeys() {
    return request<AdminApiKey[]>('/api/admin/api-keys');
  },
  createApiKey(name: string) {
    return request<AdminApiKeyCreateResponse>('/api/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },
  deleteApiKey(id: string) {
    return request<{ ok: boolean }>(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
  },
  service(name: string) {
    return request<ServicePublishResponse>(`/api/admin/services/${name}`);
  },
  publishService(name: string, input: Pick<RouteInput, 'targetUrl' | 'active' | 'tokenId'>) {
    return request<ServicePublishResponse>(`/api/admin/services/${name}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  },
  deleteService(name: string) {
    return request<{ ok: boolean; publicHost: string }>(`/api/admin/services/${name}`, {
      method: 'DELETE'
    });
  },
  sessions() {
    return request<AgentSession[]>('/api/admin/sessions');
  },
  agents() {
    return request<AgentRecord[]>('/api/admin/agents');
  },
  events() {
    return request<EventLog[]>('/api/admin/events');
  },
  metrics() {
    return request<Metrics>('/api/admin/metrics');
  }
};

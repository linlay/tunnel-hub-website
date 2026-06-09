import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Pencil,
  Plus,
  RefreshCcw,
  Route as RouteIcon,
  Save,
  Server,
  ShieldCheck,
  SquareTerminal,
  Trash2,
  Wifi
} from 'lucide-react';
import {
  AdminApiKey,
  AgentRecord,
  AgentSession,
  ApiError,
  EventLog,
  Metrics,
  Route,
  RouteInput,
  TunnelToken,
  api
} from './lib/api';

type LoadState = 'loading' | 'ready' | 'anonymous';
type View = 'overview' | 'agents' | 'routes' | 'tokens' | 'apiKeys' | 'sessions' | 'events';
type RouteMode = 'service' | 'host';

type RouteForm = {
  id?: string;
  mode: RouteMode;
  serviceName: string;
  publicHost: string;
  targetUrl: string;
  tokenId: string;
  active: boolean;
};

const emptyRoute = (tokenId = ''): RouteForm => ({
  mode: 'service',
  serviceName: '',
  publicHost: '',
  targetUrl: 'http://127.0.0.1:3000',
  tokenId,
  active: true
});

export function App() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [username, setUsername] = useState('');

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setUsername(me.username);
        setLoadState('ready');
      })
      .catch(() => setLoadState('anonymous'));
  }, []);

  if (loadState === 'loading') {
    return <div className="boot">Tunnel Hub</div>;
  }

  if (loadState === 'anonymous') {
    return (
      <Login
        onLogin={(name) => {
          setUsername(name);
          setLoadState('ready');
        }}
      />
    );
  }

  return (
    <Dashboard
      username={username}
      onLogout={() => {
        setUsername('');
        setLoadState('anonymous');
      }}
    />
  );
}

function Login({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await api.login(username, password);
      onLogin(response.username);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <div className="login-mark">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1>Tunnel Hub</h1>
          <p>管理入口</p>
        </div>
        <label>
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error-line">{error}</p> : null}
        <button className="primary wide" type="submit" disabled={busy}>
          <ShieldCheck size={16} />
          {busy ? '正在登录' : '登录'}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [view, setView] = useState<View>('overview');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [tokens, setTokens] = useState<TunnelToken[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [apiKeys, setApiKeys] = useState<AdminApiKey[]>([]);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    hasActiveAgent: false,
    activeAgentCount: 0,
    activeAgents: [],
    totalStreams: 0,
    activeStreams: 0
  });
  const [routeForm, setRouteForm] = useState<RouteForm>(emptyRoute());
  const [tokenName, setTokenName] = useState('mac-mini-office');
  const [apiKeyName, setApiKeyName] = useState('deploy-bot');
  const [newSecret, setNewSecret] = useState('');
  const [newApiKeySecret, setNewApiKeySecret] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextRoutes, nextTokens, nextAgents, nextApiKeys, nextSessions, nextEvents, nextMetrics] =
        await Promise.all([
          api.routes(),
          api.tokens(),
          api.agents(),
          api.apiKeys(),
          api.sessions(),
          api.events(),
          api.metrics()
        ]);
      setRoutes(nextRoutes ?? []);
      setTokens(nextTokens ?? []);
      setAgents(nextAgents ?? []);
      setApiKeys(nextApiKeys ?? []);
      setSessions(nextSessions ?? []);
      setEvents(nextEvents ?? []);
      setMetrics(nextMetrics);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const activeTokens = useMemo(() => tokens.filter((token) => token.active), [tokens]);
  const tokenById = useMemo(() => new Map(tokens.map((token) => [token.id, token])), [tokens]);
  const onlineTokenIds = useMemo(
    () => new Set(agents.filter((agent) => agent.online).map((agent) => agent.token.id)),
    [agents]
  );

  useEffect(() => {
    if (!routeForm.tokenId && activeTokens.length > 0) {
      setRouteForm((current) => ({ ...current, tokenId: activeTokens[0].id }));
    }
  }, [activeTokens, routeForm.tokenId]);

  const assignedRoutes = routes.filter((route) => route.tokenId);
  const activeRoutes = assignedRoutes.filter((route) => route.active).length;
  const unassignedRoutes = routes.length - assignedRoutes.length;
  const agentCommand = newSecret ? buildAgentCommand(newSecret) : '';

  async function saveRoute(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!routeForm.tokenId) {
        throw new Error('请选择 Agent');
      }
      const input: RouteInput = {
        publicHost: routeForm.publicHost.trim(),
        targetUrl: routeForm.targetUrl.trim(),
        tokenId: routeForm.tokenId,
        active: routeForm.active
      };
      if (routeForm.id) {
        await api.updateRoute(routeForm.id, input);
        setNotice('网站已保存');
      } else if (routeForm.mode === 'service') {
        if (!routeForm.serviceName.trim()) {
          throw new Error('请输入服务名');
        }
        await api.publishService(routeForm.serviceName.trim(), {
          targetUrl: routeForm.targetUrl.trim(),
          tokenId: routeForm.tokenId,
          active: routeForm.active
        });
        setNotice('网站已发布');
      } else {
        if (!routeForm.publicHost.trim()) {
          throw new Error('请输入完整域名');
        }
        await api.createRoute(input);
        setNotice('网站已添加');
      }
      setRouteForm(emptyRoute(activeTokens[0]?.id ?? routeForm.tokenId));
      setView('routes');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeRoute(route: Route) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.deleteRoute(route.id);
      setNotice('网站已删除');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function editRoute(route: Route) {
    setView('routes');
    setRouteForm({
      id: route.id,
      mode: 'host',
      serviceName: '',
      publicHost: route.publicHost,
      targetUrl: route.targetUrl,
      tokenId: route.tokenId ?? '',
      active: route.active
    });
  }

  async function createToken(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await api.createToken(tokenName.trim());
      setNewSecret(created.secret);
      setNotice('令牌已创建');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeToken(token: TunnelToken) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.deleteToken(token.id);
      setNotice('令牌已停用');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createApiKey(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await api.createApiKey(apiKeyName.trim());
      setNewApiKeySecret(created.secret);
      setNotice('API Key 已创建');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeApiKey(apiKey: AdminApiKey) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.deleteApiKey(apiKey.id);
      setNotice('API Key 已停用');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Wifi size={20} />
          </div>
          <div>
            <strong>Tunnel Hub</strong>
            <span>Relay 控制台</span>
          </div>
        </div>
        <nav>
          <NavButton active={view === 'overview'} icon={<LayoutDashboard size={16} />} onClick={() => setView('overview')}>
            概览
          </NavButton>
          <NavButton active={view === 'agents'} icon={<Server size={16} />} onClick={() => setView('agents')}>
            Agent
          </NavButton>
          <NavButton active={view === 'routes'} icon={<Globe2 size={16} />} onClick={() => setView('routes')}>
            网站
          </NavButton>
          <NavButton active={view === 'tokens'} icon={<KeyRound size={16} />} onClick={() => setView('tokens')}>
            令牌
          </NavButton>
          <NavButton active={view === 'apiKeys'} icon={<ShieldCheck size={16} />} onClick={() => setView('apiKeys')}>
            API Keys
          </NavButton>
          <NavButton active={view === 'sessions'} icon={<Clock3 size={16} />} onClick={() => setView('sessions')}>
            连接历史
          </NavButton>
          <NavButton active={view === 'events'} icon={<Activity size={16} />} onClick={() => setView('events')}>
            事件
          </NavButton>
        </nav>
        <button className="ghost sidebar-logout" onClick={logout}>
          <LogOut size={16} />
          退出
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view)}</h1>
            <span>{username}</span>
          </div>
          <button className="ghost" onClick={refresh} title="刷新">
            <RefreshCcw size={16} />
            刷新
          </button>
        </header>

        {error ? <div className="alert error">{error}</div> : null}
        {notice ? <div className="alert success">{notice}</div> : null}

        {view === 'overview' ? (
          <OverviewView
            metrics={metrics}
            activeRoutes={activeRoutes}
            unassignedRoutes={unassignedRoutes}
            routes={routes}
            agents={agents}
            events={events}
            onlineTokenIds={onlineTokenIds}
            tokenById={tokenById}
            onEditRoute={editRoute}
          />
        ) : null}

        {view === 'agents' ? <AgentsView agents={agents} /> : null}

        {view === 'routes' ? (
          <RoutesView
            routes={routes}
            routeForm={routeForm}
            setRouteForm={setRouteForm}
            activeTokens={activeTokens}
            tokenById={tokenById}
            onlineTokenIds={onlineTokenIds}
            busy={busy}
            onSave={saveRoute}
            onDelete={removeRoute}
            onEdit={editRoute}
          />
        ) : null}

        {view === 'tokens' ? (
          <TokensView
            tokens={tokens}
            tokenName={tokenName}
            setTokenName={setTokenName}
            newSecret={newSecret}
            agentCommand={agentCommand}
            busy={busy}
            onCreate={createToken}
            onDelete={removeToken}
          />
        ) : null}

        {view === 'apiKeys' ? (
          <ApiKeysView
            apiKeys={apiKeys}
            apiKeyName={apiKeyName}
            setApiKeyName={setApiKeyName}
            newApiKeySecret={newApiKeySecret}
            busy={busy}
            onCreate={createApiKey}
            onDelete={removeApiKey}
          />
        ) : null}

        {view === 'sessions' ? (
          <SessionsView sessions={sessions} tokenById={tokenById} />
        ) : null}

        {view === 'events' ? <EventsView events={events} /> : null}
      </section>
    </main>
  );
}

function OverviewView({
  metrics,
  activeRoutes,
  unassignedRoutes,
  routes,
  agents,
  events,
  onlineTokenIds,
  tokenById,
  onEditRoute
}: {
  metrics: Metrics;
  activeRoutes: number;
  unassignedRoutes: number;
  routes: Route[];
  agents: AgentRecord[];
  events: EventLog[];
  onlineTokenIds: Set<string>;
  tokenById: Map<string, TunnelToken>;
  onEditRoute: (route: Route) => void;
}) {
  return (
    <>
      <section className="status-grid" aria-label="Tunnel status">
        <MetricTile
          icon={metrics.activeAgentCount > 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          label="在线 Agent"
          value={metrics.activeAgentCount}
          tone={metrics.activeAgentCount > 0 ? 'good' : 'warn'}
        />
        <MetricTile icon={<Globe2 size={18} />} label="已部署网站" value={routes.filter((route) => route.tokenId).length} />
        <MetricTile icon={<RouteIcon size={18} />} label="启用路由" value={activeRoutes} />
        <MetricTile icon={<Activity size={18} />} label="活跃 Stream" value={metrics.activeStreams} />
        <MetricTile icon={<Server size={18} />} label="累计 Stream" value={metrics.totalStreams} />
        <MetricTile
          icon={unassignedRoutes > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          label="待分配"
          value={unassignedRoutes}
          tone={unassignedRoutes > 0 ? 'warn' : 'good'}
        />
      </section>

      <section className="grid-two">
        <section className="panel">
          <PanelTitle icon={<Server size={18} />} title="Agent 状态" />
          <div className="agent-list compact">
            {agents.length === 0 ? <span className="empty">暂无 Agent 令牌</span> : null}
            {agents.slice(0, 4).map((agent) => (
              <AgentSummary key={agent.token.id} agent={agent} />
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={<Activity size={18} />} title="最近事件" />
          <EventList events={events.slice(0, 6)} />
        </section>
      </section>

      <section className="panel">
        <PanelTitle icon={<Globe2 size={18} />} title="网站概览" />
        <RoutesTable
          routes={routes.slice(0, 8)}
          tokenById={tokenById}
          onlineTokenIds={onlineTokenIds}
          onEdit={onEditRoute}
          onDelete={() => undefined}
          readonlyDelete
        />
      </section>
    </>
  );
}

function AgentsView({ agents }: { agents: AgentRecord[] }) {
  return (
    <section className="agent-grid">
      {agents.length === 0 ? <div className="empty panel">暂无 Agent 令牌</div> : null}
      {agents.map((agent) => (
        <article className="agent-card" key={agent.token.id}>
          <div className="agent-head">
            <div>
              <span className="eyebrow">Agent</span>
              <h2>{agent.token.name}</h2>
            </div>
            <StatusPill label={agent.online ? '在线' : agent.token.active ? '离线' : '停用'} tone={agent.online ? 'good' : agent.token.active ? 'warn' : 'off'} />
          </div>
          <div className="agent-meta">
            <span>令牌前缀</span>
            <code>{agent.token.tokenPrefix}</code>
            <span>远端地址</span>
            <strong>{agent.remoteAddr ?? '未连接'}</strong>
            <span>连接时长</span>
            <strong>{agent.connectedAt ? formatDuration(agent.connectedAt) : '未连接'}</strong>
            <span>当前会话</span>
            <code>{agent.sessionId ? shortID(agent.sessionId) : '无'}</code>
          </div>
          <div className="route-chips">
            {agent.routes.length === 0 ? <span className="muted">未部署网站</span> : null}
            {agent.routes.map((route) => (
              <span className="chip" key={route.id}>
                {route.publicHost}
              </span>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function RoutesView({
  routes,
  routeForm,
  setRouteForm,
  activeTokens,
  tokenById,
  onlineTokenIds,
  busy,
  onSave,
  onDelete,
  onEdit
}: {
  routes: Route[];
  routeForm: RouteForm;
  setRouteForm: (updater: RouteForm | ((current: RouteForm) => RouteForm)) => void;
  activeTokens: TunnelToken[];
  tokenById: Map<string, TunnelToken>;
  onlineTokenIds: Set<string>;
  busy: boolean;
  onSave: (event: FormEvent) => void;
  onDelete: (route: Route) => void;
  onEdit: (route: Route) => void;
}) {
  return (
    <section className="stack">
      <section className="panel">
        <PanelTitle icon={<Plus size={18} />} title={routeForm.id ? '编辑网站' : '部署网站'} />
        <form className="deploy-form" onSubmit={onSave}>
          {!routeForm.id ? (
            <div className="segmented" role="group" aria-label="部署模式">
              <button
                type="button"
                className={routeForm.mode === 'service' ? 'active' : ''}
                onClick={() => setRouteForm((current) => ({ ...current, mode: 'service' }))}
              >
                服务名
              </button>
              <button
                type="button"
                className={routeForm.mode === 'host' ? 'active' : ''}
                onClick={() => setRouteForm((current) => ({ ...current, mode: 'host' }))}
              >
                完整域名
              </button>
            </div>
          ) : null}
          {routeForm.mode === 'service' && !routeForm.id ? (
            <label>
              服务名
              <input
                value={routeForm.serviceName}
                onChange={(event) =>
                  setRouteForm((current) => ({ ...current, serviceName: event.target.value }))
                }
                placeholder="auditor"
              />
            </label>
          ) : (
            <label>
              公开域名
              <input
                value={routeForm.publicHost}
                onChange={(event) =>
                  setRouteForm((current) => ({ ...current, publicHost: event.target.value }))
                }
                placeholder="app.example.com"
              />
            </label>
          )}
          <label>
            本地目标
            <input
              value={routeForm.targetUrl}
              onChange={(event) => setRouteForm((current) => ({ ...current, targetUrl: event.target.value }))}
              placeholder="http://127.0.0.1:3000"
            />
          </label>
          <label>
            Agent
            <select
              value={routeForm.tokenId}
              onChange={(event) => setRouteForm((current) => ({ ...current, tokenId: event.target.value }))}
            >
              <option value="">选择 Agent</option>
              {activeTokens.map((token) => (
                <option value={token.id} key={token.id}>
                  {token.name}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={routeForm.active}
              onChange={(event) => setRouteForm((current) => ({ ...current, active: event.target.checked }))}
            />
            启用
          </label>
          <button className="primary" disabled={busy || activeTokens.length === 0}>
            {routeForm.id ? <Save size={16} /> : <Plus size={16} />}
            {routeForm.id ? '保存' : '部署'}
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelTitle icon={<Globe2 size={18} />} title="网站列表" />
        <RoutesTable routes={routes} tokenById={tokenById} onlineTokenIds={onlineTokenIds} onEdit={onEdit} onDelete={onDelete} />
      </section>
    </section>
  );
}

function TokensView({
  tokens,
  tokenName,
  setTokenName,
  newSecret,
  agentCommand,
  busy,
  onCreate,
  onDelete
}: {
  tokens: TunnelToken[];
  tokenName: string;
  setTokenName: (value: string) => void;
  newSecret: string;
  agentCommand: string;
  busy: boolean;
  onCreate: (event: FormEvent) => void;
  onDelete: (token: TunnelToken) => void;
}) {
  return (
    <section className="grid-two">
      <section className="panel">
        <PanelTitle icon={<KeyRound size={18} />} title="创建 Agent 令牌" />
        <form className="inline-form" onSubmit={onCreate}>
          <input value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="mac-mini-office" />
          <button className="primary" disabled={busy}>
            <Plus size={16} />
            创建
          </button>
        </form>
        {newSecret ? (
          <div className="secret-stack">
            <SecretBox value={newSecret} title="令牌 Secret" />
            <div className="command-box">
              <div>
                <SquareTerminal size={16} />
                <span>连接命令</span>
              </div>
              <code>{agentCommand}</code>
              <button className="icon" title="复制连接命令" onClick={() => copyText(agentCommand)}>
                <Copy size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <PanelTitle icon={<KeyRound size={18} />} title="令牌列表" />
        <DataTable
          empty="暂无令牌"
          columns={['名称', '前缀', '最近使用', '状态', '']}
          rows={tokens.map((token) => [
            <strong className={token.active ? '' : 'muted'}>{token.name}</strong>,
            <code>{token.tokenPrefix}</code>,
            token.lastUsedAt ? formatTime(token.lastUsedAt) : <span className="muted">从未</span>,
            <StatusPill label={token.active ? '可用' : '停用'} tone={token.active ? 'good' : 'off'} />,
            token.active ? (
              <button className="icon danger" title="停用令牌" onClick={() => onDelete(token)}>
                <Trash2 size={15} />
              </button>
            ) : null
          ])}
        />
      </section>
    </section>
  );
}

function ApiKeysView({
  apiKeys,
  apiKeyName,
  setApiKeyName,
  newApiKeySecret,
  busy,
  onCreate,
  onDelete
}: {
  apiKeys: AdminApiKey[];
  apiKeyName: string;
  setApiKeyName: (value: string) => void;
  newApiKeySecret: string;
  busy: boolean;
  onCreate: (event: FormEvent) => void;
  onDelete: (apiKey: AdminApiKey) => void;
}) {
  return (
    <section className="grid-two">
      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title="创建 Admin API Key" />
        <form className="inline-form" onSubmit={onCreate}>
          <input value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} placeholder="deploy-bot" />
          <button className="primary" disabled={busy}>
            <Plus size={16} />
            创建
          </button>
        </form>
        {newApiKeySecret ? <SecretBox value={newApiKeySecret} title="API Key Secret" /> : null}
      </section>

      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title="API Key 列表" />
        <DataTable
          empty="暂无 API Key"
          columns={['名称', '前缀', '最近使用', '状态', '']}
          rows={apiKeys.map((apiKey) => [
            <strong className={apiKey.active ? '' : 'muted'}>{apiKey.name}</strong>,
            <code>{apiKey.keyPrefix}</code>,
            apiKey.lastUsedAt ? formatTime(apiKey.lastUsedAt) : <span className="muted">从未</span>,
            <StatusPill label={apiKey.active ? '可用' : '停用'} tone={apiKey.active ? 'good' : 'off'} />,
            apiKey.active ? (
              <button className="icon danger" title="停用 API Key" onClick={() => onDelete(apiKey)}>
                <Trash2 size={15} />
              </button>
            ) : null
          ])}
        />
      </section>
    </section>
  );
}

function SessionsView({ sessions, tokenById }: { sessions: AgentSession[]; tokenById: Map<string, TunnelToken> }) {
  return (
    <section className="panel">
      <PanelTitle icon={<Clock3 size={18} />} title="连接历史" />
      <DataTable
        empty="暂无连接历史"
        columns={['Agent', 'Session', '远端地址', '连接时间', '持续时间', '状态']}
        rows={sessions.map((session) => [
          <strong>{tokenById.get(session.tokenId)?.name ?? shortID(session.tokenId)}</strong>,
          <code>{shortID(session.id)}</code>,
          session.remoteAddr,
          formatTime(session.connectedAt),
          formatDuration(session.connectedAt, session.disconnectedAt),
          session.disconnectedAt ? (
            <StatusPill label="已断开" tone="off" />
          ) : (
            <StatusPill label="在线" tone="good" />
          )
        ])}
      />
    </section>
  );
}

function EventsView({ events }: { events: EventLog[] }) {
  return (
    <section className="panel">
      <PanelTitle icon={<Activity size={18} />} title="事件" />
      <EventList events={events} />
    </section>
  );
}

function RoutesTable({
  routes,
  tokenById,
  onlineTokenIds,
  onEdit,
  onDelete,
  readonlyDelete
}: {
  routes: Route[];
  tokenById: Map<string, TunnelToken>;
  onlineTokenIds: Set<string>;
  onEdit: (route: Route) => void;
  onDelete: (route: Route) => void;
  readonlyDelete?: boolean;
}) {
  return (
    <DataTable
      empty="暂无网站"
      columns={['网站', '本地目标', 'Agent', '状态', '']}
      rows={routes.map((route) => [
        <div className="host-cell">
          <strong>{route.publicHost}</strong>
          <button className="inline-icon" title="复制公开 URL" onClick={() => copyText(publicURL(route.publicHost))}>
            <Link2 size={14} />
          </button>
        </div>,
        <code>{route.targetUrl}</code>,
        route.tokenId ? tokenById.get(route.tokenId)?.name ?? shortID(route.tokenId) : <span className="muted">未分配</span>,
        routeStatus(route, onlineTokenIds),
        <div className="row-actions">
          <button className="icon" title="编辑网站" onClick={() => onEdit(route)}>
            <Pencil size={15} />
          </button>
          {readonlyDelete ? null : (
            <button className="icon danger" title="删除网站" onClick={() => onDelete(route)}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ])}
    />
  );
}

function AgentSummary({ agent }: { agent: AgentRecord }) {
  return (
    <div className="agent-summary">
      <div>
        <strong>{agent.token.name}</strong>
        <span>{agent.online ? agent.remoteAddr : '未连接'}</span>
      </div>
      <div>
        <StatusPill label={agent.online ? '在线' : agent.token.active ? '离线' : '停用'} tone={agent.online ? 'good' : agent.token.active ? 'warn' : 'off'} />
        <small>{agent.routeCount} 个网站</small>
      </div>
    </div>
  );
}

function EventList({ events }: { events: EventLog[] }) {
  return (
    <div className="event-list">
      {events.length === 0 ? <span className="empty">暂无事件</span> : null}
      {events.map((event) => (
        <div className="event-row" key={event.id}>
          <span>{event.type}</span>
          <strong>{event.message}</strong>
          <small>{event.details}</small>
          <time>{formatTime(event.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

function SecretBox({ value, title }: { value: string; title: string }) {
  return (
    <div className="secret-box">
      <span>{title}</span>
      <code>{value}</code>
      <button className="icon" title="复制" onClick={() => copyText(value)}>
        <Copy size={15} />
      </button>
    </div>
  );
}

function NavButton({
  active,
  icon,
  children,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

function MetricTile({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className={`metric ${tone ?? ''}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function DataTable({
  columns,
  rows,
  empty
}: {
  columns: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="empty">{empty}</div>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: 'good' | 'warn' | 'off' }) {
  return <span className={`pill ${tone}`}>{label}</span>;
}

function routeStatus(route: Route, onlineTokenIds: Set<string>) {
  if (!route.tokenId) {
    return <StatusPill label="需分配" tone="warn" />;
  }
  if (!route.active) {
    return <StatusPill label="停用" tone="off" />;
  }
  if (!onlineTokenIds.has(route.tokenId)) {
    return <StatusPill label="Agent 离线" tone="warn" />;
  }
  return <StatusPill label="运行中" tone="good" />;
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    overview: '概览',
    agents: 'Agent',
    routes: '网站',
    tokens: '令牌',
    apiKeys: 'API Keys',
    sessions: '连接历史',
    events: '事件'
  };
  return titles[view];
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDuration(start: string, end?: string) {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}天 ${hours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`;
  }
  if (minutes > 0) {
    return `${minutes}分钟`;
  }
  return `${seconds}秒`;
}

function shortID(value: string) {
  return value.length > 14 ? `${value.slice(0, 14)}...` : value;
}

function publicURL(host: string) {
  return `https://${host}`;
}

function buildAgentCommand(secret: string) {
  return `AGENT_TOKEN=${secret} AGENT_RELAY_URL=${relayTunnelURL()} go run ./cmd/agent`;
}

function relayTunnelURL() {
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const url = new URL('/tunnel', base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

function errorMessage(err: unknown) {
  if (err instanceof ApiError || err instanceof Error) {
    return err.message;
  }
  return '请求失败';
}

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Globe2,
  KeyRound,
  Languages,
  LayoutDashboard,
  Link2,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCcw,
  Route as RouteIcon,
  Save,
  Server,
  ShieldCheck,
  SquareTerminal,
  Sun,
  Trash2,
  UserRound,
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
import {
  ActivityFilter,
  Locale,
  ThemeMode,
  TranslationKey,
  Translator,
  isLocale,
  isThemeMode,
  makeTranslator
} from './lib/i18n';

type LoadState = 'loading' | 'ready' | 'anonymous';
type View = 'overview' | 'agents' | 'routes' | 'tokens' | 'apiKeys' | 'activity';
type RouteMode = 'service' | 'host';
type EffectiveTheme = 'light' | 'dark';

type RouteForm = {
  id?: string;
  mode: RouteMode;
  serviceName: string;
  publicHost: string;
  targetUrl: string;
  tokenId: string;
  active: boolean;
};

type ActivityItem = {
  id: string;
  category: ActivityFilter;
  sortTime: number;
  type: string;
  title: string;
  details: string;
  meta: string;
  status?: string;
  statusTone?: 'good' | 'warn' | 'off';
};

const localeStorageKey = 'tunnel-hub-locale';
const themeStorageKey = 'tunnel-hub-theme-mode';

const emptyRoute = (tokenId = ''): RouteForm => ({
  mode: 'service',
  serviceName: '',
  publicHost: '',
  targetUrl: 'http://127.0.0.1:3000',
  tokenId,
  active: true
});

export function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode);
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => resolveTheme(themeMode));
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [username, setUsername] = useState('');
  const t = useMemo(() => makeTranslator(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    writeStorage(localeStorageKey, locale);
  }, [locale]);

  useEffect(() => {
    writeStorage(themeStorageKey, themeMode);
    const applyTheme = () => {
      const nextTheme = resolveTheme(themeMode);
      setEffectiveTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.dataset.themeMode = themeMode;
    };
    applyTheme();

    if (themeMode !== 'system' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, [themeMode]);

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
    return <div className="boot">{t('appName')}</div>;
  }

  if (loadState === 'anonymous') {
    return (
      <Login
        t={t}
        onLogin={(name) => {
          setUsername(name);
          setLoadState('ready');
        }}
      />
    );
  }

  return (
    <Dashboard
      effectiveTheme={effectiveTheme}
      locale={locale}
      setLocale={setLocale}
      setThemeMode={setThemeMode}
      t={t}
      themeMode={themeMode}
      username={username}
      onLogout={() => {
        setUsername('');
        setLoadState('anonymous');
      }}
    />
  );
}

function Login({ t, onLogin }: { t: Translator; onLogin: (username: string) => void }) {
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
      setError(errorMessage(err, t));
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
          <h1>{t('appName')}</h1>
          <p>{t('managementEntry')}</p>
        </div>
        <label>
          {t('username')}
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          {t('password')}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error-line">{error}</p> : null}
        <button className="primary wide" type="submit" disabled={busy}>
          <ShieldCheck size={16} />
          {busy ? t('loggingIn') : t('login')}
        </button>
      </form>
    </main>
  );
}

function Dashboard({
  effectiveTheme,
  locale,
  setLocale,
  setThemeMode,
  t,
  themeMode,
  username,
  onLogout
}: {
  effectiveTheme: EffectiveTheme;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  t: Translator;
  themeMode: ThemeMode;
  username: string;
  onLogout: () => void;
}) {
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
      setError(errorMessage(err, t));
    }
  }, [t]);

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
        throw new Error(t('errorChooseDesktopAgent'));
      }
      const input: RouteInput = {
        publicHost: routeForm.publicHost.trim(),
        targetUrl: routeForm.targetUrl.trim(),
        tokenId: routeForm.tokenId,
        active: routeForm.active
      };
      if (routeForm.id) {
        await api.updateRoute(routeForm.id, input);
        setNotice(t('webAppSaved'));
      } else if (routeForm.mode === 'service') {
        if (!routeForm.serviceName.trim()) {
          throw new Error(t('errorEnterServiceName'));
        }
        await api.publishService(routeForm.serviceName.trim(), {
          targetUrl: routeForm.targetUrl.trim(),
          tokenId: routeForm.tokenId,
          active: routeForm.active
        });
        setNotice(t('webAppPublished'));
      } else {
        if (!routeForm.publicHost.trim()) {
          throw new Error(t('errorEnterPublicHost'));
        }
        await api.createRoute(input);
        setNotice(t('webAppAdded'));
      }
      setRouteForm(emptyRoute(activeTokens[0]?.id ?? routeForm.tokenId));
      setView('routes');
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
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
      setNotice(t('webAppDeleted'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
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
      setNotice(t('tokenCreated'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
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
      setNotice(t('tokenDeactivated'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
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
      setNotice(t('adminApiKeyCreated'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
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
      setNotice(t('adminApiKeyDeactivated'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <main className="app-shell" data-theme={effectiveTheme}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Wifi size={20} />
          </div>
          <div>
            <strong>{t('appName')}</strong>
            <span>{t('relayConsole')}</span>
          </div>
        </div>
        <nav aria-label="Main">
          <NavButton active={view === 'overview'} icon={<LayoutDashboard size={16} />} onClick={() => setView('overview')}>
            {t('navOverview')}
          </NavButton>
          <NavButton active={view === 'agents'} icon={<Server size={16} />} onClick={() => setView('agents')}>
            {t('navAgents')}
          </NavButton>
          <NavButton active={view === 'routes'} icon={<Globe2 size={16} />} onClick={() => setView('routes')}>
            {t('navRoutes')}
          </NavButton>
          <NavButton active={view === 'tokens'} icon={<KeyRound size={16} />} onClick={() => setView('tokens')}>
            {t('navTokens')}
          </NavButton>
          <NavButton active={view === 'activity'} icon={<Activity size={16} />} onClick={() => setView('activity')}>
            {t('navActivity')}
          </NavButton>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view, t)}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost" onClick={refresh} title={t('refresh')}>
              <RefreshCcw size={16} />
              {t('refresh')}
            </button>
            <UserMenu
              locale={locale}
              setLocale={setLocale}
              setThemeMode={setThemeMode}
              t={t}
              themeMode={themeMode}
              username={username}
              onApiKeys={() => setView('apiKeys')}
              onLogout={logout}
            />
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}
        {notice ? <div className="alert success">{notice}</div> : null}

        {view === 'overview' ? (
          <OverviewView
            agents={agents}
            activeRoutes={activeRoutes}
            events={events}
            locale={locale}
            metrics={metrics}
            onlineTokenIds={onlineTokenIds}
            routes={routes}
            t={t}
            tokenById={tokenById}
            unassignedRoutes={unassignedRoutes}
            onEditRoute={editRoute}
          />
        ) : null}

        {view === 'agents' ? <AgentsView agents={agents} locale={locale} t={t} /> : null}

        {view === 'routes' ? (
          <RoutesView
            activeTokens={activeTokens}
            busy={busy}
            onlineTokenIds={onlineTokenIds}
            routeForm={routeForm}
            routes={routes}
            setRouteForm={setRouteForm}
            t={t}
            tokenById={tokenById}
            onDelete={removeRoute}
            onEdit={editRoute}
            onSave={saveRoute}
          />
        ) : null}

        {view === 'tokens' ? (
          <TokensView
            agentCommand={agentCommand}
            busy={busy}
            locale={locale}
            newSecret={newSecret}
            setTokenName={setTokenName}
            t={t}
            tokenName={tokenName}
            tokens={tokens}
            onCreate={createToken}
            onDelete={removeToken}
          />
        ) : null}

        {view === 'apiKeys' ? (
          <ApiKeysView
            apiKeyName={apiKeyName}
            apiKeys={apiKeys}
            busy={busy}
            locale={locale}
            newApiKeySecret={newApiKeySecret}
            setApiKeyName={setApiKeyName}
            t={t}
            onCreate={createApiKey}
            onDelete={removeApiKey}
          />
        ) : null}

        {view === 'activity' ? (
          <ActivityView
            events={events}
            locale={locale}
            sessions={sessions}
            t={t}
            tokenById={tokenById}
          />
        ) : null}
      </section>
    </main>
  );
}

function UserMenu({
  locale,
  setLocale,
  setThemeMode,
  t,
  themeMode,
  username,
  onApiKeys,
  onLogout
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  t: Translator;
  themeMode: ThemeMode;
  username: string;
  onApiKeys: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="user-menu">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="user-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <UserRound size={16} />
        <span>{username}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="user-popover" role="menu">
          <button
            className="menu-command"
            role="menuitem"
            onClick={() => {
              onApiKeys();
              setOpen(false);
            }}
          >
            <ShieldCheck size={16} />
            {t('adminApiKeys')}
          </button>
          <div className="menu-group">
            <span>
              <Languages size={15} />
              {t('language')}
            </span>
            <div className="menu-segmented">
              <button className={locale === 'zh-CN' ? 'active' : ''} onClick={() => setLocale('zh-CN')}>
                中文
              </button>
              <button className={locale === 'en-US' ? 'active' : ''} onClick={() => setLocale('en-US')}>
                EN
              </button>
            </div>
          </div>
          <div className="menu-group">
            <span>
              {themeMode === 'dark' ? <Moon size={15} /> : themeMode === 'light' ? <Sun size={15} /> : <Monitor size={15} />}
              {t('theme')}
            </span>
            <div className="menu-segmented three">
              <button className={themeMode === 'light' ? 'active' : ''} onClick={() => setThemeMode('light')}>
                {t('light')}
              </button>
              <button className={themeMode === 'dark' ? 'active' : ''} onClick={() => setThemeMode('dark')}>
                {t('dark')}
              </button>
              <button className={themeMode === 'system' ? 'active' : ''} onClick={() => setThemeMode('system')}>
                {t('system')}
              </button>
            </div>
          </div>
          <button className="menu-command danger" role="menuitem" onClick={onLogout}>
            <LogOut size={16} />
            {t('logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OverviewView({
  agents,
  activeRoutes,
  events,
  locale,
  metrics,
  onlineTokenIds,
  routes,
  t,
  tokenById,
  unassignedRoutes,
  onEditRoute
}: {
  agents: AgentRecord[];
  activeRoutes: number;
  events: EventLog[];
  locale: Locale;
  metrics: Metrics;
  onlineTokenIds: Set<string>;
  routes: Route[];
  t: Translator;
  tokenById: Map<string, TunnelToken>;
  unassignedRoutes: number;
  onEditRoute: (route: Route) => void;
}) {
  return (
    <>
      <section className="status-grid" aria-label="Tunnel status">
        <MetricTile
          icon={metrics.activeAgentCount > 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          label={t('onlineDesktopAgents')}
          value={metrics.activeAgentCount}
          tone={metrics.activeAgentCount > 0 ? 'good' : 'warn'}
        />
        <MetricTile icon={<Globe2 size={18} />} label={t('deployedWebApps')} value={routes.filter((route) => route.tokenId).length} />
        <MetricTile icon={<RouteIcon size={18} />} label={t('activeRoutes')} value={activeRoutes} />
        <MetricTile icon={<Activity size={18} />} label={t('activeStreams')} value={metrics.activeStreams} />
        <MetricTile icon={<Server size={18} />} label={t('totalStreams')} value={metrics.totalStreams} />
        <MetricTile
          icon={unassignedRoutes > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          label={t('unassigned')}
          value={unassignedRoutes}
          tone={unassignedRoutes > 0 ? 'warn' : 'good'}
        />
      </section>

      <section className="grid-two">
        <section className="panel">
          <PanelTitle icon={<Server size={18} />} title={t('navAgents')} />
          <div className="agent-list compact">
            {agents.length === 0 ? <span className="empty">{t('noDesktopAgentTokens')}</span> : null}
            {agents.slice(0, 4).map((agent) => (
              <AgentSummary key={agent.token.id} agent={agent} t={t} />
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={<Activity size={18} />} title={t('recentActivity')} />
          <EventList events={events.slice(0, 6)} locale={locale} t={t} />
        </section>
      </section>

      <section className="panel">
        <PanelTitle icon={<Globe2 size={18} />} title={t('webAppOverview')} />
        <RoutesTable
          onlineTokenIds={onlineTokenIds}
          readonlyDelete
          routes={routes.slice(0, 8)}
          t={t}
          tokenById={tokenById}
          onDelete={() => undefined}
          onEdit={onEditRoute}
        />
      </section>
    </>
  );
}

function AgentsView({ agents, locale, t }: { agents: AgentRecord[]; locale: Locale; t: Translator }) {
  return (
    <section className="agent-grid">
      {agents.length === 0 ? <div className="empty panel">{t('noDesktopAgentTokens')}</div> : null}
      {agents.map((agent) => (
        <article className="agent-card" key={agent.token.id}>
          <div className="agent-head">
            <div>
              <span className="eyebrow">{t('navAgents')}</span>
              <h2>{agent.token.name}</h2>
            </div>
            <StatusPill label={agent.online ? t('online') : agent.token.active ? t('offline') : t('disabled')} tone={agent.online ? 'good' : agent.token.active ? 'warn' : 'off'} />
          </div>
          <div className="agent-meta">
            <span>{t('tokenPrefix')}</span>
            <code>{agent.token.tokenPrefix}</code>
            <span>{t('remoteAddress')}</span>
            <strong>{agent.remoteAddr ?? t('offline')}</strong>
            <span>{t('duration')}</span>
            <strong>{agent.connectedAt ? formatDuration(agent.connectedAt, undefined, locale) : t('offline')}</strong>
            <span>{t('currentSession')}</span>
            <code>{agent.sessionId ? shortID(agent.sessionId) : t('noSession')}</code>
          </div>
          <div className="route-chips">
            {agent.routes.length === 0 ? <span className="muted">{t('noWebApps')}</span> : null}
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
  activeTokens,
  busy,
  onlineTokenIds,
  routeForm,
  routes,
  setRouteForm,
  t,
  tokenById,
  onDelete,
  onEdit,
  onSave
}: {
  activeTokens: TunnelToken[];
  busy: boolean;
  onlineTokenIds: Set<string>;
  routeForm: RouteForm;
  routes: Route[];
  setRouteForm: (updater: RouteForm | ((current: RouteForm) => RouteForm)) => void;
  t: Translator;
  tokenById: Map<string, TunnelToken>;
  onDelete: (route: Route) => void;
  onEdit: (route: Route) => void;
  onSave: (event: FormEvent) => void;
}) {
  return (
    <section className="stack">
      <section className="panel">
        <PanelTitle icon={<Plus size={18} />} title={routeForm.id ? t('editWebApp') : t('deployWebApp')} />
        <form className="deploy-form" onSubmit={onSave}>
          {!routeForm.id ? (
            <div className="segmented" role="group" aria-label={t('deployWebApp')}>
              <button
                type="button"
                className={routeForm.mode === 'service' ? 'active' : ''}
                onClick={() => setRouteForm((current) => ({ ...current, mode: 'service' }))}
              >
                {t('serviceName')}
              </button>
              <button
                type="button"
                className={routeForm.mode === 'host' ? 'active' : ''}
                onClick={() => setRouteForm((current) => ({ ...current, mode: 'host' }))}
              >
                {t('fullDomain')}
              </button>
            </div>
          ) : null}
          {routeForm.mode === 'service' && !routeForm.id ? (
            <label>
              {t('serviceName')}
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
              {t('publicDomain')}
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
            {t('localTarget')}
            <input
              value={routeForm.targetUrl}
              onChange={(event) => setRouteForm((current) => ({ ...current, targetUrl: event.target.value }))}
              placeholder="http://127.0.0.1:3000"
            />
          </label>
          <label>
            {t('navAgents')}
            <select
              value={routeForm.tokenId}
              onChange={(event) => setRouteForm((current) => ({ ...current, tokenId: event.target.value }))}
            >
              <option value="">{t('selectDesktopAgent')}</option>
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
            {t('enabled')}
          </label>
          <button className="primary" disabled={busy || activeTokens.length === 0}>
            {routeForm.id ? <Save size={16} /> : <Plus size={16} />}
            {routeForm.id ? t('save') : t('deployWebApp')}
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelTitle icon={<Globe2 size={18} />} title={t('webAppList')} />
        <RoutesTable routes={routes} t={t} tokenById={tokenById} onlineTokenIds={onlineTokenIds} onEdit={onEdit} onDelete={onDelete} />
      </section>
    </section>
  );
}

function TokensView({
  agentCommand,
  busy,
  locale,
  newSecret,
  setTokenName,
  t,
  tokenName,
  tokens,
  onCreate,
  onDelete
}: {
  agentCommand: string;
  busy: boolean;
  locale: Locale;
  newSecret: string;
  setTokenName: (value: string) => void;
  t: Translator;
  tokenName: string;
  tokens: TunnelToken[];
  onCreate: (event: FormEvent) => void;
  onDelete: (token: TunnelToken) => void;
}) {
  return (
    <section className="grid-two">
      <section className="panel">
        <PanelTitle icon={<KeyRound size={18} />} title={t('createDesktopAgentToken')} />
        <form className="inline-form" onSubmit={onCreate}>
          <input value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="mac-mini-office" />
          <button className="primary" disabled={busy}>
            <Plus size={16} />
            {t('create')}
          </button>
        </form>
        {newSecret ? (
          <div className="secret-stack">
            <SecretBox value={newSecret} title={t('tokenSecret')} t={t} />
            <div className="command-box">
              <div>
                <SquareTerminal size={16} />
                <span>{t('command')}</span>
              </div>
              <code>{agentCommand}</code>
              <button className="icon" title={t('copyCommand')} onClick={() => copyText(agentCommand)}>
                <Copy size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <PanelTitle icon={<KeyRound size={18} />} title={t('tokenList')} />
        <DataTable
          empty={t('noTokens')}
          columns={[t('name'), t('prefix'), t('lastUsed'), t('status'), '']}
          rows={tokens.map((token) => [
            <strong className={token.active ? '' : 'muted'}>{token.name}</strong>,
            <code>{token.tokenPrefix}</code>,
            token.lastUsedAt ? formatTime(token.lastUsedAt, locale) : <span className="muted">{t('never')}</span>,
            <StatusPill label={token.active ? t('available') : t('disabled')} tone={token.active ? 'good' : 'off'} />,
            token.active ? (
              <button className="icon danger" title={t('stopToken')} onClick={() => onDelete(token)}>
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
  apiKeyName,
  apiKeys,
  busy,
  locale,
  newApiKeySecret,
  setApiKeyName,
  t,
  onCreate,
  onDelete
}: {
  apiKeyName: string;
  apiKeys: AdminApiKey[];
  busy: boolean;
  locale: Locale;
  newApiKeySecret: string;
  setApiKeyName: (value: string) => void;
  t: Translator;
  onCreate: (event: FormEvent) => void;
  onDelete: (apiKey: AdminApiKey) => void;
}) {
  return (
    <section className="grid-two">
      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title={t('createAdminApiKey')} />
        <form className="inline-form" onSubmit={onCreate}>
          <input value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} placeholder="deploy-bot" />
          <button className="primary" disabled={busy}>
            <Plus size={16} />
            {t('create')}
          </button>
        </form>
        {newApiKeySecret ? <SecretBox value={newApiKeySecret} title={t('adminApiKeySecret')} t={t} /> : null}
      </section>

      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title={t('adminApiKeyList')} />
        <DataTable
          empty={t('noApiKeys')}
          columns={[t('name'), t('prefix'), t('lastUsed'), t('status'), '']}
          rows={apiKeys.map((apiKey) => [
            <strong className={apiKey.active ? '' : 'muted'}>{apiKey.name}</strong>,
            <code>{apiKey.keyPrefix}</code>,
            apiKey.lastUsedAt ? formatTime(apiKey.lastUsedAt, locale) : <span className="muted">{t('never')}</span>,
            <StatusPill label={apiKey.active ? t('available') : t('disabled')} tone={apiKey.active ? 'good' : 'off'} />,
            apiKey.active ? (
              <button className="icon danger" title={t('stopApiKey')} onClick={() => onDelete(apiKey)}>
                <Trash2 size={15} />
              </button>
            ) : null
          ])}
        />
      </section>
    </section>
  );
}

function ActivityView({
  events,
  locale,
  sessions,
  t,
  tokenById
}: {
  events: EventLog[];
  locale: Locale;
  sessions: AgentSession[];
  t: Translator;
  tokenById: Map<string, TunnelToken>;
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const items = useMemo(() => buildActivityItems(sessions, events, tokenById, t, locale), [events, locale, sessions, t, tokenById]);
  const visibleItems = filter === 'all' ? items : items.filter((item) => item.category === filter);
  const filters: ActivityFilter[] = ['all', 'connections', 'webApps', 'tokens', 'apiKeys', 'system'];

  return (
    <section className="panel">
      <PanelTitle icon={<Activity size={18} />} title={t('activityLog')} />
      <div className="filter-tabs" role="tablist" aria-label={t('activityLog')}>
        {filters.map((item) => (
          <button
            key={item}
            className={filter === item ? 'active' : ''}
            role="tab"
            aria-selected={filter === item}
            onClick={() => setFilter(item)}
          >
            {activityFilterLabel(item, t)}
          </button>
        ))}
      </div>
      <ActivityList items={visibleItems} locale={locale} t={t} />
    </section>
  );
}

function ActivityList({ items, locale, t }: { items: ActivityItem[]; locale: Locale; t: Translator }) {
  if (items.length === 0) {
    return <div className="empty">{t('noActivity')}</div>;
  }
  return (
    <div className="activity-list">
      {items.map((item) => (
        <div className="activity-row" key={item.id}>
          <span className="activity-category">{activityFilterLabel(item.category, t)}</span>
          <div className="activity-main">
            <strong>{item.title}</strong>
            <small>{item.details}</small>
            <small>{item.meta}</small>
          </div>
          <code>{item.type}</code>
          {item.status && item.statusTone ? <StatusPill label={item.status} tone={item.statusTone} /> : <span />}
          <time>{formatTime(new Date(item.sortTime).toISOString(), locale)}</time>
        </div>
      ))}
    </div>
  );
}

function RoutesTable({
  onlineTokenIds,
  readonlyDelete,
  routes,
  t,
  tokenById,
  onDelete,
  onEdit
}: {
  onlineTokenIds: Set<string>;
  readonlyDelete?: boolean;
  routes: Route[];
  t: Translator;
  tokenById: Map<string, TunnelToken>;
  onDelete: (route: Route) => void;
  onEdit: (route: Route) => void;
}) {
  return (
    <DataTable
      empty={t('noWebApps')}
      columns={[t('webApp'), t('localTarget'), t('navAgents'), t('status'), '']}
      rows={routes.map((route) => [
        <div className="host-cell">
          <strong>{route.publicHost}</strong>
          <button className="inline-icon" title={t('copyPublicUrl')} onClick={() => copyText(publicURL(route.publicHost))}>
            <Link2 size={14} />
          </button>
        </div>,
        <code>{route.targetUrl}</code>,
        route.tokenId ? tokenById.get(route.tokenId)?.name ?? shortID(route.tokenId) : <span className="muted">{t('unassigned')}</span>,
        routeStatus(route, onlineTokenIds, t),
        <div className="row-actions">
          <button className="icon" title={t('editWebApp')} onClick={() => onEdit(route)}>
            <Pencil size={15} />
          </button>
          {readonlyDelete ? null : (
            <button className="icon danger" title={t('webAppDeleted')} onClick={() => onDelete(route)}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ])}
    />
  );
}

function EventList({ events, locale, t }: { events: EventLog[]; locale: Locale; t: Translator }) {
  return (
    <div className="event-list">
      {events.length === 0 ? <span className="empty">{t('noActivity')}</span> : null}
      {events.map((event) => (
        <div className="event-row" key={event.id}>
          <span>{event.type}</span>
          <strong>{event.message}</strong>
          <small>{event.details}</small>
          <time>{formatTime(event.createdAt, locale)}</time>
        </div>
      ))}
    </div>
  );
}

function SecretBox({ value, title, t }: { value: string; title: string; t: Translator }) {
  return (
    <div className="secret-box">
      <span>{title}</span>
      <code>{value}</code>
      <button className="icon" title={t('copy')} onClick={() => copyText(value)}>
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

function AgentSummary({ agent, t }: { agent: AgentRecord; t: Translator }) {
  return (
    <div className="agent-summary">
      <div>
        <strong>{agent.token.name}</strong>
        <span>{agent.online ? agent.remoteAddr : t('offline')}</span>
      </div>
      <div>
        <StatusPill label={agent.online ? t('online') : agent.token.active ? t('offline') : t('disabled')} tone={agent.online ? 'good' : agent.token.active ? 'warn' : 'off'} />
        <small>{formatTemplate(t('webAppsCount'), { count: agent.routeCount })}</small>
      </div>
    </div>
  );
}

function buildActivityItems(
  sessions: AgentSession[],
  events: EventLog[],
  tokenById: Map<string, TunnelToken>,
  t: Translator,
  locale: Locale
) {
  const sessionItems: ActivityItem[] = sessions.map((session) => {
    const disconnected = Boolean(session.disconnectedAt);
    return {
      id: `session-${session.id}`,
      category: 'connections',
      sortTime: new Date(session.connectedAt).getTime(),
      type: t('session'),
      title: tokenById.get(session.tokenId)?.name ?? shortID(session.tokenId),
      details: `${t('remoteAddress')}: ${session.remoteAddr}`,
      meta: `${t('duration')}: ${formatDuration(session.connectedAt, session.disconnectedAt, locale)}`,
      status: disconnected ? t('disconnected') : t('online'),
      statusTone: disconnected ? 'off' : 'good'
    };
  });

  const eventItems: ActivityItem[] = events.map((event) => ({
    id: `event-${event.id}`,
    category: eventCategory(event.type),
    sortTime: new Date(event.createdAt).getTime(),
    type: event.type,
    title: event.message,
    details: event.details || t('details'),
    meta: t('event')
  }));

  return [...sessionItems, ...eventItems].sort((a, b) => b.sortTime - a.sortTime);
}

function eventCategory(type: string): ActivityFilter {
  if (type.startsWith('route') || type.startsWith('service')) {
    return 'webApps';
  }
  if (type.startsWith('token')) {
    return 'tokens';
  }
  if (type.startsWith('admin_api_key')) {
    return 'apiKeys';
  }
  if (type.startsWith('agent') || type.startsWith('desktop_device')) {
    return 'connections';
  }
  return 'system';
}

function activityFilterLabel(filter: ActivityFilter, t: Translator) {
  const labels: Record<ActivityFilter, TranslationKey> = {
    all: 'all',
    connections: 'activityConnections',
    webApps: 'activityWebApps',
    tokens: 'activityTokens',
    apiKeys: 'activityApiKeys',
    system: 'activitySystem'
  };
  return t(labels[filter]);
}

function routeStatus(route: Route, onlineTokenIds: Set<string>, t: Translator) {
  if (!route.tokenId) {
    return <StatusPill label={t('routeNeedsAgent')} tone="warn" />;
  }
  if (!route.active) {
    return <StatusPill label={t('disabled')} tone="off" />;
  }
  if (!onlineTokenIds.has(route.tokenId)) {
    return <StatusPill label={t('webAppOffline')} tone="warn" />;
  }
  return <StatusPill label={t('running')} tone="good" />;
}

function viewTitle(view: View, t: Translator) {
  const titles: Record<View, TranslationKey> = {
    overview: 'navOverview',
    agents: 'navAgents',
    routes: 'navRoutes',
    tokens: 'navTokens',
    apiKeys: 'adminApiKeys',
    activity: 'navActivity'
  };
  return t(titles[view]);
}

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDuration(start: string, end: string | undefined, locale: Locale) {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (locale === 'zh-CN') {
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
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
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

function errorMessage(err: unknown, t: Translator) {
  if (err instanceof ApiError || err instanceof Error) {
    return err.message;
  }
  return t('requestFailed');
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), template);
}

function initialLocale(): Locale {
  const stored = readStorage(localeStorageKey);
  if (isLocale(stored)) {
    return stored;
  }
  const language = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase();
  return language.startsWith('zh') ? 'zh-CN' : 'en-US';
}

function initialThemeMode(): ThemeMode {
  const stored = readStorage(themeStorageKey);
  return isThemeMode(stored) ? stored : 'system';
}

function resolveTheme(mode: ThemeMode): EffectiveTheme {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore unavailable storage, such as hardened privacy contexts.
  }
}

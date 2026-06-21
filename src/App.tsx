import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Globe2,
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
  Search,
  Server,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  Wifi,
  XCircle
} from 'lucide-react';
import {
  ActivityObjectType,
  ActivityRecord,
  AdminUser,
  ApiError,
  DesktopRecord,
  OverviewResponse,
  Route,
  RouteInput,
  TrafficRange,
  WebAppRecord,
  api
} from './lib/api';
import { Locale, ThemeMode, TranslationKey, Translator, isLocale, isThemeMode, makeTranslator } from './lib/i18n';

type LoadState = 'loading' | 'ready' | 'anonymous';
type View = 'overview' | 'desktops' | 'webapps' | 'admins' | 'activity';
type RouteMode = 'service' | 'host';
type EffectiveTheme = 'light' | 'dark';
type AdminUserStatus = 'active' | 'disabled';

type RouteForm = {
  id?: string;
  mode: RouteMode;
  serviceName: string;
  publicHost: string;
  targetUrl: string;
  tokenId: string;
  active: boolean;
};

type AdminUserForm = {
  id?: string;
  username: string;
  password: string;
  status: AdminUserStatus;
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

const emptyAdminUserForm = (): AdminUserForm => ({
  username: '',
  password: '',
  status: 'active'
});

const emptyOverview = (range: TrafficRange): OverviewResponse => ({
  range,
  desktopConnectionCount: 0,
  webAppCount: 0,
  totalTrafficBytes: 0,
  resources: {
    totalDesktops: 0,
    onlineDesktops: 0,
    totalWebApps: 0,
    activeWebApps: 0,
    activeStreams: 0,
    totalStreams: 0
  },
  traffic: []
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
  const [view, setViewState] = useState<View>(() => viewFromPath(currentPath()));
  const [overviewRange, setOverviewRange] = useState<TrafficRange>('hour');
  const [overview, setOverview] = useState<OverviewResponse>(() => emptyOverview('hour'));
  const [desktops, setDesktops] = useState<DesktopRecord[]>([]);
  const [webapps, setWebapps] = useState<WebAppRecord[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityObjectType>('all');
  const [activityQuery, setActivityQuery] = useState('');
  const [activityItems, setActivityItems] = useState<ActivityRecord[]>([]);
  const [routeForm, setRouteForm] = useState<RouteForm>(emptyRoute());
  const [adminUserForm, setAdminUserForm] = useState<AdminUserForm>(emptyAdminUserForm());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const navigate = useCallback((next: View) => {
    setViewState(next);
    const path = viewPath(next);
    if (currentPath() !== path) {
      window.history.pushState({ view: next }, '', path);
    }
  }, []);

  useEffect(() => {
    const path = viewPath(viewFromPath(currentPath()));
    if (currentPath() !== path) {
      window.history.replaceState({ view: viewFromPath(path) }, '', path);
    }
    const onPopState = () => {
      const next = viewFromPath(currentPath());
      setViewState(next);
      const normalized = viewPath(next);
      if (currentPath() !== normalized) {
        window.history.replaceState({ view: next }, '', normalized);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextOverview, nextDesktops, nextWebapps, nextAdminUsers, nextActivity] = await Promise.all([
        api.overview(overviewRange),
        api.desktops(),
        api.webapps(),
        api.adminUsers(),
        api.activity(activityFilter, activityQuery)
      ]);
      setOverview(nextOverview ?? emptyOverview(overviewRange));
      setDesktops(nextDesktops ?? []);
      setWebapps(nextWebapps ?? []);
      setAdminUsers(nextAdminUsers ?? []);
      setActivityItems(nextActivity ?? []);
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }, [activityFilter, activityQuery, overviewRange, t]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const activeDesktops = useMemo(() => desktops.filter((desktop) => desktop.tokenActive), [desktops]);

  useEffect(() => {
    if (!routeForm.tokenId && activeDesktops.length > 0) {
      setRouteForm((current) => ({ ...current, tokenId: activeDesktops[0].tokenId }));
    }
  }, [activeDesktops, routeForm.tokenId]);

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
      setRouteForm(emptyRoute(activeDesktops[0]?.tokenId ?? routeForm.tokenId));
      navigate('webapps');
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
    navigate('webapps');
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

  async function closeDesktopConnection(desktop: DesktopRecord) {
    if (!desktop.sessionId) {
      setError(t('noActiveSession'));
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.closeSession(desktop.sessionId);
      setNotice(t('connectionClosed'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function deactivateDesktop(desktop: DesktopRecord) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.deleteToken(desktop.tokenId);
      setNotice(t('deviceDeactivated'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function saveAdminUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const username = adminUserForm.username.trim();
      const password = adminUserForm.password.trim();
      if (!username) {
        throw new Error(t('errorEnterAdminUsername'));
      }
      if (!adminUserForm.id && !password) {
        throw new Error(t('errorEnterAdminPassword'));
      }
      if (adminUserForm.id) {
        await api.updateAdminUser(adminUserForm.id, {
          username,
          ...(password ? { password } : {}),
          status: adminUserForm.status
        });
        setNotice(t('adminUserUpdated'));
      } else {
        await api.createAdminUser({
          username,
          password,
          status: adminUserForm.status
        });
        setNotice(t('adminUserCreated'));
      }
      setAdminUserForm(emptyAdminUserForm());
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  function editAdminUser(user: AdminUser) {
    navigate('admins');
    setAdminUserForm({
      id: user.id,
      username: user.username,
      password: '',
      status: user.status
    });
  }

  async function disableAdminUser(user: AdminUser) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.disableAdminUser(user.id);
      setNotice(t('adminUserDisabled'));
      if (adminUserForm.id === user.id) {
        setAdminUserForm(emptyAdminUserForm());
      }
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
          <NavButton active={view === 'overview'} icon={<LayoutDashboard size={16} />} onClick={() => navigate('overview')}>
            {t('navOverview')}
          </NavButton>
          <NavButton active={view === 'desktops'} icon={<Server size={16} />} onClick={() => navigate('desktops')}>
            {t('navDesktops')}
          </NavButton>
          <NavButton active={view === 'webapps'} icon={<Globe2 size={16} />} onClick={() => navigate('webapps')}>
            {t('navWebApps')}
          </NavButton>
          <NavButton active={view === 'activity'} icon={<Activity size={16} />} onClick={() => navigate('activity')}>
            {t('navActivity')}
          </NavButton>
        </nav>
        <UserMenu
          locale={locale}
          setLocale={setLocale}
          setThemeMode={setThemeMode}
          t={t}
          themeMode={themeMode}
          username={username}
          onAdmins={() => navigate('admins')}
          onLogout={logout}
        />
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
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}
        {notice ? <div className="alert success">{notice}</div> : null}

        {view === 'overview' ? (
          <OverviewView
            locale={locale}
            overview={overview}
            range={overviewRange}
            setRange={setOverviewRange}
            t={t}
            recentActivity={activityItems}
            webapps={webapps}
            onEditRoute={editRoute}
          />
        ) : null}

        {view === 'desktops' ? (
          <DesktopsView
            busy={busy}
            desktops={desktops}
            locale={locale}
            t={t}
            onClose={closeDesktopConnection}
            onDeactivate={deactivateDesktop}
          />
        ) : null}

        {view === 'webapps' ? (
          <WebAppsView
            busy={busy}
            desktopOptions={activeDesktops}
            routeForm={routeForm}
            setRouteForm={setRouteForm}
            t={t}
            webapps={webapps}
            locale={locale}
            onDelete={removeRoute}
            onEdit={editRoute}
            onSave={saveRoute}
          />
        ) : null}

        {view === 'admins' ? (
          <AdminUsersView
            adminForm={adminUserForm}
            adminUsers={adminUsers}
            busy={busy}
            locale={locale}
            setAdminForm={setAdminUserForm}
            t={t}
            onCancel={() => setAdminUserForm(emptyAdminUserForm())}
            onDisable={disableAdminUser}
            onEdit={editAdminUser}
            onSave={saveAdminUser}
          />
        ) : null}

        {view === 'activity' ? (
          <ActivityView
            filter={activityFilter}
            items={activityItems}
            locale={locale}
            query={activityQuery}
            setFilter={setActivityFilter}
            setQuery={setActivityQuery}
            t={t}
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
  onAdmins,
  onLogout
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  t: Translator;
  themeMode: ThemeMode;
  username: string;
  onAdmins: () => void;
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
              onAdmins();
              setOpen(false);
            }}
          >
            <ShieldCheck size={16} />
            {t('adminUsers')}
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
  locale,
  overview,
  range,
  recentActivity,
  setRange,
  t,
  webapps,
  onEditRoute
}: {
  locale: Locale;
  overview: OverviewResponse;
  range: TrafficRange;
  recentActivity: ActivityRecord[];
  setRange: (range: TrafficRange) => void;
  t: Translator;
  webapps: WebAppRecord[];
  onEditRoute: (route: Route) => void;
}) {
  const recentConnection = overview.recentConnectionAt ? formatTime(overview.recentConnectionAt, locale) : t('never');
  const recentIdentity = overview.recentIdentity || overview.recentDevice || t('none');

  return (
    <>
      <section className="status-grid" aria-label={t('resourceOverview')}>
        <MetricTile
          icon={overview.desktopConnectionCount > 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          label={t('desktopConnections')}
          value={overview.desktopConnectionCount}
          tone={overview.desktopConnectionCount > 0 ? 'good' : 'warn'}
        />
        <MetricTile icon={<Globe2 size={18} />} label={t('webAppConnections')} value={overview.webAppCount} />
        <MetricTile icon={<Activity size={18} />} label={t('totalTraffic')} value={formatBytes(overview.totalTrafficBytes)} />
        <MetricTile icon={<ClockIcon />} label={t('recentConnection')} value={recentConnection} />
        <MetricTile icon={<UserRound size={18} />} label={t('recentIdentity')} value={recentIdentity} />
        <MetricTile icon={<RouteIcon size={18} />} label={t('activeStreams')} value={overview.resources.activeStreams} />
      </section>

      <section className="grid-two">
        <section className="panel">
          <div className="panel-title spread">
            <div className="panel-title-main">
              <Activity size={18} />
              <h2>{t('traffic')}</h2>
            </div>
            <SegmentedRange value={range} onChange={setRange} t={t} />
          </div>
          <TrafficChart points={overview.traffic} t={t} />
        </section>

        <section className="panel">
          <PanelTitle icon={<Server size={18} />} title={t('resourceOverview')} />
          <div className="summary-list">
            <SummaryRow label={t('totalDesktops')} value={overview.resources.totalDesktops} />
            <SummaryRow label={t('onlineDesktops')} value={overview.resources.onlineDesktops} />
            <SummaryRow label={t('totalWebApps')} value={overview.resources.totalWebApps} />
            <SummaryRow label={t('activeWebApps')} value={overview.resources.activeWebApps} />
            <SummaryRow label={t('totalStreams')} value={overview.resources.totalStreams} />
            <SummaryRow label={t('recentDevice')} value={overview.recentDevice || t('none')} />
          </div>
        </section>
      </section>

      <section className="grid-two">
        <section className="panel">
          <PanelTitle icon={<Globe2 size={18} />} title={t('webAppOverview')} />
          <WebAppsTable
            locale={locale}
            readonlyDelete
            t={t}
            webapps={webapps.slice(0, 6)}
            onDelete={() => undefined}
            onEdit={onEditRoute}
          />
        </section>

        <section className="panel">
          <PanelTitle icon={<Activity size={18} />} title={t('recentActivity')} />
          <ActivityList items={recentActivity.slice(0, 6)} locale={locale} t={t} />
        </section>
      </section>
    </>
  );
}

function DesktopsView({
  busy,
  desktops,
  locale,
  t,
  onClose,
  onDeactivate
}: {
  busy: boolean;
  desktops: DesktopRecord[];
  locale: Locale;
  t: Translator;
  onClose: (desktop: DesktopRecord) => void;
  onDeactivate: (desktop: DesktopRecord) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return desktops;
    }
    return desktops.filter((desktop) => desktopSearchText(desktop).includes(needle));
  }, [desktops, query]);

  return (
    <section className="stack">
      <section className="panel">
        <SearchField label={t('searchDesktops')} value={query} onChange={setQuery} />
        <DataTable
          empty={t('noDesktops')}
          columns={[t('publicUrl'), t('status'), t('connectionIdentity'), t('traffic'), t('webApp'), '']}
          rows={visible.map((desktop) => [
            <HostCell host={desktop.publicHost} url={desktop.publicUrl} t={t} />,
            <StatusPill
              label={desktop.online ? t('online') : desktop.tokenActive ? t('offline') : t('disabled')}
              tone={desktop.online ? 'good' : desktop.tokenActive ? 'warn' : 'off'}
            />,
            <div className="table-meta">
              <strong>{desktopDisplayName(desktop)}</strong>
              <small>{desktop.remoteAddr || desktop.ownerEmail || desktop.deviceId}</small>
              <small>{desktop.sessionId ? `${t('currentSession')}: ${shortID(desktop.sessionId)}` : t('noSession')}</small>
              <small>
                {t('lastConnected')}: {desktop.lastConnectedAt ? formatTime(desktop.lastConnectedAt, locale) : t('never')}
              </small>
            </div>,
            <TrafficMeta stats={desktop.traffic} t={t} />,
            formatTemplate(t('webAppsCount'), { count: desktop.webAppCount }),
            <div className="row-actions">
              <button
                aria-label={t('closeConnection')}
                className="icon"
                disabled={busy || !desktop.sessionId}
                title={t('closeConnection')}
                onClick={() => onClose(desktop)}
              >
                <XCircle size={15} />
              </button>
              {desktop.tokenActive ? (
                <button
                  aria-label={t('deactivateDevice')}
                  className="icon danger"
                  disabled={busy}
                  title={t('deactivateDevice')}
                  onClick={() => onDeactivate(desktop)}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ])}
        />
      </section>
    </section>
  );
}

function WebAppsView({
  busy,
  desktopOptions,
  locale,
  routeForm,
  setRouteForm,
  t,
  webapps,
  onDelete,
  onEdit,
  onSave
}: {
  busy: boolean;
  desktopOptions: DesktopRecord[];
  locale: Locale;
  routeForm: RouteForm;
  setRouteForm: (updater: RouteForm | ((current: RouteForm) => RouteForm)) => void;
  t: Translator;
  webapps: WebAppRecord[];
  onDelete: (route: Route) => void;
  onEdit: (route: Route) => void;
  onSave: (event: FormEvent) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return webapps;
    }
    return webapps.filter((webapp) => webappSearchText(webapp).includes(needle));
  }, [query, webapps]);

  return (
    <section className="stack">
      <section className="panel">
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
            {t('navDesktops')}
            <select
              value={routeForm.tokenId}
              onChange={(event) => setRouteForm((current) => ({ ...current, tokenId: event.target.value }))}
            >
              <option value="">{t('selectDesktopAgent')}</option>
              {desktopOptions.map((desktop) => (
                <option value={desktop.tokenId} key={desktop.tokenId}>
                  {desktopDisplayName(desktop)}
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
          <button className="primary" disabled={busy || desktopOptions.length === 0}>
            {routeForm.id ? <Save size={16} /> : <Plus size={16} />}
            {routeForm.id ? t('save') : t('deployWebApp')}
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelTitle icon={<Globe2 size={18} />} title={t('webAppList')} />
        <SearchField label={t('searchWebApps')} value={query} onChange={setQuery} />
        <WebAppsTable locale={locale} t={t} webapps={visible} onDelete={onDelete} onEdit={onEdit} />
      </section>
    </section>
  );
}

function AdminUsersView({
  adminForm,
  adminUsers,
  busy,
  locale,
  setAdminForm,
  t,
  onCancel,
  onDisable,
  onEdit,
  onSave
}: {
  adminForm: AdminUserForm;
  adminUsers: AdminUser[];
  busy: boolean;
  locale: Locale;
  setAdminForm: (updater: AdminUserForm | ((current: AdminUserForm) => AdminUserForm)) => void;
  t: Translator;
  onCancel: () => void;
  onDisable: (user: AdminUser) => void;
  onEdit: (user: AdminUser) => void;
  onSave: (event: FormEvent) => void;
}) {
  return (
    <section className="grid-two">
      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title={adminForm.id ? t('editAdminUser') : t('createAdminUser')} />
        <form className="deploy-form compact-form" onSubmit={onSave}>
          <label>
            {t('username')}
            <input
              value={adminForm.username}
              onChange={(event) => setAdminForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="admin"
            />
          </label>
          <label>
            {adminForm.id ? t('newPassword') : t('password')}
            <input
              type="password"
              value={adminForm.password}
              onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={adminForm.id ? t('passwordOptional') : t('password')}
            />
          </label>
          <label>
            {t('status')}
            <select
              value={adminForm.status}
              onChange={(event) =>
                setAdminForm((current) => ({ ...current, status: event.target.value as AdminUserStatus }))
              }
            >
              <option value="active">{t('active')}</option>
              <option value="disabled">{t('disabled')}</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {adminForm.id ? <Save size={16} /> : <Plus size={16} />}
            {adminForm.id ? t('save') : t('create')}
          </button>
          {adminForm.id ? (
            <button className="ghost" type="button" onClick={onCancel}>
              {t('cancel')}
            </button>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title={t('adminUserList')} />
        <DataTable
          empty={t('noAdminUsers')}
          columns={[t('username'), t('status'), t('lastLogin'), t('updatedAt'), '']}
          rows={adminUsers.map((user) => [
            <strong className={user.status === 'active' ? '' : 'muted'}>{user.username}</strong>,
            <StatusPill label={user.status === 'active' ? t('active') : t('disabled')} tone={user.status === 'active' ? 'good' : 'off'} />,
            user.lastLoginAt ? formatTime(user.lastLoginAt, locale) : <span className="muted">{t('never')}</span>,
            formatTime(user.updatedAt, locale),
            <div className="row-actions">
              <button className="icon" title={t('editAdminUser')} onClick={() => onEdit(user)}>
                <Pencil size={15} />
              </button>
              {user.status === 'active' ? (
                <button className="icon danger" title={t('disableAdminUser')} onClick={() => onDisable(user)}>
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ])}
        />
      </section>
    </section>
  );
}

function ActivityView({
  filter,
  items,
  locale,
  query,
  setFilter,
  setQuery,
  t
}: {
  filter: ActivityObjectType;
  items: ActivityRecord[];
  locale: Locale;
  query: string;
  setFilter: (filter: ActivityObjectType) => void;
  setQuery: (query: string) => void;
  t: Translator;
}) {
  const filters: ActivityObjectType[] = ['all', 'desktop', 'webapp', 'admin', 'system'];

  return (
    <section className="panel">
      <PanelTitle icon={<Activity size={18} />} title={t('activityLog')} />
      <div className="toolbar">
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
        <SearchField label={t('searchActivity')} value={query} onChange={setQuery} />
      </div>
      <ActivityList items={items} locale={locale} t={t} />
    </section>
  );
}

function ActivityList({ items, locale, t }: { items: ActivityRecord[]; locale: Locale; t: Translator }) {
  if (items.length === 0) {
    return <div className="empty">{t('noActivity')}</div>;
  }
  return (
    <div className="activity-list">
      {items.map((item) => (
        <div className="activity-row" key={item.id}>
          <span className="activity-category">{activityFilterLabel(item.objectType, t)}</span>
          <div className="activity-main">
            <strong>{item.message}</strong>
            <small>{item.details || item.publicHost || t('details')}</small>
            <small>{activityMeta(item, t)}</small>
          </div>
          <code>{item.type}</code>
          {activityStatus(item, t)}
          <time>{formatTime(item.createdAt, locale)}</time>
        </div>
      ))}
    </div>
  );
}

function WebAppsTable({
  locale,
  readonlyDelete,
  t,
  webapps,
  onDelete,
  onEdit
}: {
  locale: Locale;
  readonlyDelete?: boolean;
  t: Translator;
  webapps: WebAppRecord[];
  onDelete: (route: Route) => void;
  onEdit: (route: Route) => void;
}) {
  return (
    <DataTable
      empty={t('noWebApps')}
      columns={[t('webApp'), t('route'), t('localTarget'), t('status'), t('traffic'), '']}
      rows={webapps.map((webapp) => [
        <div className="table-meta">
          <HostCell host={webapp.publicHost} url={webapp.publicUrl} t={t} />
          <small>{webapp.name || webapp.routeId}</small>
        </div>,
        <code>{shortID(webapp.routeId)}</code>,
        <code>{webapp.targetUrl}</code>,
        webAppStatus(webapp, t),
        <div className="table-meta">
          <TrafficMeta stats={webapp.traffic} t={t} />
          <small>
            {t('lastAccess')}: {webapp.lastAccessAt ? formatTime(webapp.lastAccessAt, locale) : t('never')}
          </small>
        </div>,
        <div className="row-actions">
          <button className="icon" title={t('editWebApp')} onClick={() => onEdit(webapp.route)}>
            <Pencil size={15} />
          </button>
          {readonlyDelete ? null : (
            <button className="icon danger" title={t('webAppDeleted')} onClick={() => onDelete(webapp.route)}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ])}
    />
  );
}

function HostCell({ host, url, t }: { host: string; url: string; t: Translator }) {
  return (
    <div className="host-cell">
      <strong>{host}</strong>
      <button className="inline-icon" title={t('copyPublicUrl')} onClick={() => copyText(url || publicURL(host))}>
        <Link2 size={14} />
      </button>
    </div>
  );
}

function TrafficMeta({ stats, t }: { stats: { requestCount: number; bytesIn: number; bytesOut: number }; t: Translator }) {
  return (
    <div className="traffic-meta">
      <strong>{formatBytes(stats.bytesIn + stats.bytesOut)}</strong>
      <small>{formatTemplate(t('trafficInOut'), { in: formatBytes(stats.bytesIn), out: formatBytes(stats.bytesOut) })}</small>
      <small>{formatTemplate(t('requestCount'), { count: stats.requestCount })}</small>
    </div>
  );
}

function SearchField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-field">
      <Search size={15} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} aria-label={label} />
    </label>
  );
}

function SegmentedRange({ value, onChange, t }: { value: TrafficRange; onChange: (range: TrafficRange) => void; t: Translator }) {
  const ranges: TrafficRange[] = ['hour', 'day', 'month'];
  return (
    <div className="segmented range-segmented" role="group" aria-label={t('trafficRange')}>
      {ranges.map((range) => (
        <button key={range} className={value === range ? 'active' : ''} onClick={() => onChange(range)}>
          {t(range)}
        </button>
      ))}
    </div>
  );
}

function TrafficChart({ points, t }: { points: OverviewResponse['traffic']; t: Translator }) {
  if (points.length === 0) {
    return <div className="empty">{t('noTraffic')}</div>;
  }
  const max = Math.max(...points.map((point) => point.totalBytes), 1);
  return (
    <div className="traffic-chart" aria-label={t('traffic')}>
      {points.map((point) => (
        <div className="traffic-bar" key={point.bucket}>
          <div className="traffic-track">
            <span
              className="traffic-fill in"
              style={{ height: `${Math.max(3, (point.bytesIn / max) * 100)}%` }}
              title={formatTemplate(t('bytesInValue'), { value: formatBytes(point.bytesIn) })}
            />
            <span
              className="traffic-fill out"
              style={{ height: `${Math.max(3, (point.bytesOut / max) * 100)}%` }}
              title={formatTemplate(t('bytesOutValue'), { value: formatBytes(point.bytesOut) })}
            />
          </div>
          <small>{point.label}</small>
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
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
  const textValue = String(value);
  const textClass = textValue.length > 12 ? ' text' : '';
  return (
    <div className={`metric ${tone ?? ''}${textClass}`}>
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

function ClockIcon() {
  return <Clock3 size={18} />;
}

function webAppStatus(webapp: WebAppRecord, t: Translator) {
  if (!webapp.tokenId) {
    return <StatusPill label={t('routeNeedsAgent')} tone="warn" />;
  }
  if (!webapp.active) {
    return <StatusPill label={t('disabled')} tone="off" />;
  }
  if (!webapp.online) {
    return <StatusPill label={t('webAppOffline')} tone="warn" />;
  }
  return <StatusPill label={t('running')} tone="good" />;
}

function activityStatus(item: ActivityRecord, t: Translator) {
  if (item.error) {
    return <StatusPill label={t('error')} tone="warn" />;
  }
  if (item.statusCode) {
    const tone = item.statusCode >= 500 ? 'warn' : item.statusCode >= 400 ? 'off' : 'good';
    return <StatusPill label={String(item.statusCode)} tone={tone} />;
  }
  return <span />;
}

function activityMeta(item: ActivityRecord, t: Translator) {
  const parts = [
    item.publicHost,
    item.routeId ? `${t('route')}: ${shortID(item.routeId)}` : '',
    item.sessionId ? `${t('session')}: ${shortID(item.sessionId)}` : '',
    item.bytesIn || item.bytesOut
      ? formatTemplate(t('trafficInOut'), { in: formatBytes(item.bytesIn ?? 0), out: formatBytes(item.bytesOut ?? 0) })
      : '',
    item.error ? `${t('error')}: ${item.error}` : ''
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : t('event');
}

function activityFilterLabel(filter: ActivityObjectType, t: Translator) {
  const labels: Record<ActivityObjectType, TranslationKey> = {
    all: 'all',
    desktop: 'activityDesktop',
    webapp: 'activityWebApps',
    admin: 'activityAdmins',
    system: 'activitySystem'
  };
  return t(labels[filter]);
}

function desktopDisplayName(desktop: DesktopRecord) {
  return desktop.deviceName || desktop.tokenName || desktop.ownerName || desktop.ownerEmail || desktop.deviceId;
}

function desktopSearchText(desktop: DesktopRecord) {
  return [
    desktop.deviceName,
    desktop.deviceId,
    desktop.ownerName,
    desktop.ownerEmail,
    desktop.ownerUserId,
    desktop.publicHost,
    desktop.remoteAddr,
    desktop.tokenName,
    desktop.sessionId
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function webappSearchText(webapp: WebAppRecord) {
  return [
    webapp.name,
    webapp.publicHost,
    webapp.targetUrl,
    webapp.routeId,
    webapp.deviceName,
    webapp.deviceId,
    webapp.tokenId
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function viewTitle(view: View, t: Translator) {
  const titles: Record<View, TranslationKey> = {
    overview: 'navOverview',
    desktops: 'navDesktops',
    webapps: 'navWebApps',
    admins: 'adminUsers',
    activity: 'navActivity'
  };
  return t(titles[view]);
}

function viewFromPath(path: string): View {
  switch (path) {
    case '/desktops':
      return 'desktops';
    case '/webapps':
      return 'webapps';
    case '/activity':
      return 'activity';
    case '/admins':
      return 'admins';
    case '/overview':
    default:
      return 'overview';
  }
}

function viewPath(view: View) {
  const paths: Record<View, string> = {
    overview: '/overview',
    desktops: '/desktops',
    webapps: '/webapps',
    activity: '/activity',
    admins: '/admins'
  };
  return paths[view];
}

function currentPath() {
  return typeof window === 'undefined' ? '/overview' : window.location.pathname || '/';
}

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function shortID(value: string) {
  return value.length > 14 ? `${value.slice(0, 14)}...` : value;
}

function publicURL(host: string) {
  return `https://${host}`;
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

function formatBytes(value: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let next = Math.max(0, value);
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  if (unit === 0) {
    return `${Math.round(next)} ${units[unit]}`;
  }
  return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)} ${units[unit]}`;
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

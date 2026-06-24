# AGENTS.md

本文件给后续在 `tunnel-hub-website` 中工作的编码代理和开发者使用。请先读 `README.md`，再按本文件约定改动。

## 1. 项目概览

`tunnel-hub-website` 是 Tunnel Hub 管理控制台，面向管理员查看系统概览、Desktop 在线状态、WebApp 发布、管理员账号、活动日志和连接状态。

服务端在 sibling 项目 `tunnel-hub-server`。本项目不实现业务持久化，不直接处理 tunnel 流量，只通过 HTTP 调用 server API。

## 2. 技术栈

- React + TypeScript。
- Vite 开发、构建和 dev proxy。
- Vitest + jsdom + Testing Library。
- `lucide-react` 图标。
- CSS 使用 `src/styles.css` 的全局样式。
- Docker 构建阶段使用 Node，运行阶段使用 Nginx 静态托管。

## 3. 架构设计

前端是单页管理应用：

1. `src/main.tsx` 挂载 React 应用。
2. `src/App.tsx` 维护登录态、路由视图、语言、主题、数据加载和表单状态。
3. `src/lib/api.ts` 封装 `/api/admin` 请求，统一 `credentials: include` 和 JSON 错误处理。
4. `src/lib/i18n.ts` 提供 `zh-CN` / `en-US` 文案和主题模式类型。
5. `vite.config.ts` 在本地开发时把 `/api` 代理到 `VITE_PROXY_TARGET`。
6. `nginx.conf` 只做静态文件和 SPA fallback。

生产时，website 和 server 是两个服务。宿主机反向代理负责按路径拆流，website 容器内部不要增加 `/api` 或 `/tunnel` 代理。

## 4. 目录结构

- `src/App.tsx`: 主 UI、视图切换、数据加载、表单提交、管理操作。
- `src/lib/api.ts`: API 类型、请求封装和 endpoint 调用。
- `src/lib/i18n.ts`: 语言、主题文案和 translator。
- `src/styles.css`: 全局样式和响应式布局。
- `src/App.test.tsx`: UI/交互测试。
- `src/lib/api.test.ts`: API client 测试。
- `src/test/setup.ts`: 测试环境初始化。
- `vite.config.ts`: Vite、Vitest 和本地 dev proxy 配置。
- `Dockerfile`, `nginx.conf`, `compose.yml`: 静态站点容器部署。

## 5. 数据结构

前端类型以 `src/lib/api.ts` 为准，核心类型包括：

- `OverviewResponse`: 总览指标、资源数和流量序列。
- `DesktopRecord`: Desktop 设备、owner、public host、token、在线状态和流量统计。
- `WebAppRecord`: Desktop WebApp、route、target URL、在线状态和访问统计。
- `ActivityRecord`: 活动日志、traffic event、session event、admin/system event。
- `AdminUser`: 本地管理用户。
- `Route`, `TunnelToken`, `AgentSession`, `AgentRecord`, `Metrics`: server 管理对象。

不要在前端新增与 server 不一致的领域字段；API 返回变化时先同步 `tunnel-hub-server` 的 handler/response，再更新这里的类型和测试。

## 6. API 定义

`src/lib/api.ts` 当前封装：

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `/api/admin/routes`
- `/api/admin/services/{name}`
- `/api/admin/tokens`
- `/api/admin/users`
- `GET /api/admin/overview?range=hour|day|month`
- `GET /api/admin/desktops`
- `GET /api/admin/webapps`
- `GET /api/admin/activity`
- `GET /api/admin/events`
- `GET /api/admin/metrics`
- `GET /api/admin/agents`
- `GET /api/admin/sessions`
- `POST /api/admin/sessions/{id}/close`

请求默认带 cookie。`VITE_API_BASE_URL` 为空时走同源 `/api/admin`；本地 dev server 用 Vite proxy 转发 `/api`。

## 7. 开发要点

- 保持本项目是管理控制台，不实现 Relay、Desktop 注册或 tunnel 协议业务逻辑。
- 不引入新的状态管理库或 UI 框架，除非需求明确且现有结构难以维护。
- 生产 API 拆流在宿主机 Nginx/Caddy 完成，不要改 `nginx.conf` 去代理 API。
- API 路径、权限和字段以 `tunnel-hub-server/internal/admin/server.go` 与 `src/lib/api.ts` 为准。
- 表单提交后要调用 `loadData` 或局部刷新，避免 UI 和 server 状态不一致。
- `localStorage` 只用于语言/主题等偏好，不保存密码、JWT、token 或敏感数据。
- 前端错误提示应使用 `ApiError` 的 message，不要暴露 token、cookie 或 Authorization header。
- UI 改动需检查中英文文案和响应式布局。

## 8. 开发流程

```bash
cd tunnel-hub-website
npm install
npm test
npm run build
npm run dev
```

本地联调 server：

```bash
cd ../tunnel-hub-server
go run ./cmd/relay
```

如果 Relay 不在 `127.0.0.1:8080`，修改 `.env` 的 `VITE_PROXY_TARGET`。

## 9. 已知约束与注意事项

- 手动 token 创建 endpoint 当前 server 返回 405；不要在 UI 中假设可手动创建 tunnel token。
- `/api/desktop/*` 和 `/tunnel` 不是本管理前端的直接职责。
- build 会同时跑两个 TypeScript 配置：`tsconfig.json` 和 `tsconfig.node.json`。
- 不提交 `node_modules/`、`dist/`、`*.tsbuildinfo`、`.env`、`.DS_Store`。
- 如果环境限制导致无法运行验证命令，最终说明里必须明确列出未运行项和原因。

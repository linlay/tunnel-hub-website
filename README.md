# Tunnel Hub Website

## 1. 项目简介

`tunnel-hub-website` 是 Tunnel Hub 的 React + Vite + TypeScript 管理控制台。它负责展示和操作 overview、Desktop、WebApp、管理员、活动日志等管理功能，并通过 `/api/admin` 调用 `tunnel-hub-server`。

本项目只托管静态 SPA，不在容器内代理 `/api/admin`、`/api/desktop` 或 `/tunnel`。生产环境由宿主机 Nginx/Caddy 把页面请求转给 website，把 API 和 tunnel 请求转给 server。

## 2. 快速开始

### 前置要求

- Node.js
- npm
- 本地或远程可访问的 `tunnel-hub-server`

### 本地启动

```bash
cd tunnel-hub-website
cp .env.example .env
npm install
npm test
npm run build
npm run dev
```

Vite dev server 默认监听 `http://127.0.0.1:5173`。开发时 `/api` 会代理到 `VITE_PROXY_TARGET`，默认是 `http://127.0.0.1:8080`。

### 预览构建产物

```bash
npm run build
npm run preview
```

## 3. 配置说明

复制 `.env.example` 为 `.env` 后按本地环境调整。`.env` 不提交。

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 空 | API 基地址。生产同源部署时保持为空；分离域名访问时可设为 Relay 地址。 |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:8080` | Vite dev server 的 `/api` 代理目标。 |
| `WEBSITE_HTTP_PORT` | `11963` | `compose.yml` 暴露静态站点容器的宿主机端口。 |

前端会用 `localStorage` 保存语言和主题偏好，不保存管理密码或 tunnel token。

## 4. 部署与打包

### 静态构建

```bash
cd tunnel-hub-website
npm run build
```

构建产物位于 `dist/`，可由任意静态服务器托管。

### Docker 镜像

```bash
docker build -t tunnel-hub-website:latest .
```

Dockerfile 使用 Node 构建，再用 Nginx 托管 `/usr/share/nginx/html`。

### Docker Compose

```bash
cp .env.example .env
docker compose -f compose.yml up -d --build
```

默认监听 `127.0.0.1:11963`。需要修改端口时设置 `WEBSITE_HTTP_PORT`。

### 生产路由

推荐宿主机反向代理配置：

- `tunnel-hub.zenmind.cc/`: website 容器。
- `tunnel-hub.zenmind.cc/api/admin`: `tunnel-hub-server`。
- `tunnel-hub.zenmind.cc/api/desktop`: `tunnel-hub-server`。
- `tunnel-hub.zenmind.cc/api/components`: `tunnel-hub-server`。
- `tunnel-hub.zenmind.cc/tunnel`: `tunnel-hub-server`，必须支持 WebSocket upgrade。

website 容器里的 `nginx.conf` 只做 SPA fallback，不要把 API 代理规则加回容器内。

## 5. 运维

### 日志

```bash
docker logs tunnel-hub-website
```

浏览器端异常以浏览器控制台和页面错误提示为准；API 错误来自 `src/lib/api.ts` 的 `ApiError`。

### 常见排查

- 页面能打开但数据为空：检查 `/api/admin/me` 是否返回 200，以及浏览器 cookie 是否被同源/HTTPS 策略拦截。
- 本地开发 API 404：确认 `VITE_PROXY_TARGET` 指向正在运行的 Relay。
- 生产 API 404：确认宿主机 Nginx/Caddy 把 `/api/admin` 转发到 server，而不是 website 容器。
- 登录后立刻失效：检查 server 的 `ADMIN_SESSION_TTL`、`COOKIE_SECURE`、TLS 和域名。
- WebSocket/tunnel 不通：这是 server 和宿主机反向代理问题，website 容器不处理 `/tunnel`。

## 6. 开发命令

```bash
npm install
npm test
npm run build
npm run dev
npm run preview
```

提交前至少运行 `npm test` 和 `npm run build`。API 类型变化时同步更新 `src/lib/api.ts` 以及相关 UI 测试。

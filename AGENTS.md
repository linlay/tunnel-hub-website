# AGENTS.md

本仓库是 Tunnel Hub 的 React + Vite + TypeScript 管理前端。服务端在 sibling 仓库 `/Users/linlay/Project/zenmind-tunnel-hub/tunnel-hub-server`。

## 项目结构

- `src/lib/api.ts`: 管理 API client，默认 `VITE_API_BASE_URL` 为空，生产同源访问 `/api/admin`。
- `src/App.tsx`: 中文管理控制台 UI 和页面状态。
- `src/styles.css`: 全局样式。
- `Dockerfile`、`nginx.conf`、`compose.yml`: 独立 website 容器部署，只托管 SPA 静态文件，不代理 API 或 `/tunnel`。

## 常用命令

```bash
npm install
npm test
npm run build
npm run dev
```

## 开发约定

- 沿用现有 React/Vite/Vitest/lucide-react，不引入新状态管理库或 UI 框架，除非需求明确。
- 不要提交本地生成物：`node_modules/`、`dist/`、`*.tsbuildinfo`、`.env`、`.DS_Store`。
- API 路径和类型以 `src/lib/api.ts` 以及服务端 `internal/admin/server.go` 为准。
- 生产环境由宿主机 Nginx 把 `/api/admin` 和 `/tunnel` 分到 Relay，website 容器不要增加反向代理规则。

## 推荐验证

```bash
npm test
npm run build
```

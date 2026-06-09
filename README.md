# Tunnel Hub Website

React + Vite management console for Tunnel Hub.

The website is deployed as a standalone static site container. It intentionally does not proxy `/api/admin` or `/tunnel`; the host Nginx routes those paths directly to `tunnel-hub-server`.

## Commands

Copy `.env.example` to `.env` for local development, then adjust the API base URL or dev proxy target as needed. Vite loads `.env` automatically for the website, and `compose.yml` uses `WEBSITE_HTTP_PORT` from the same file.

```bash
npm install
npm test
npm run build
npm run dev
```

For local development with a separate Relay:

```bash
npm run dev
```

Set `VITE_PROXY_TARGET` in `.env` if the Relay is not running at `http://127.0.0.1:8080`. Leave `VITE_API_BASE_URL` empty for same-origin production deployments.

## Production

```bash
docker compose -f compose.yml up -d --build
```

Set `WEBSITE_HTTP_PORT=11963` in `.env` for the production host. Public TLS and `/api/admin` routing are handled by `/etc/nginx/sites-available/tunnel-hub.zenmind.cc.conf`.

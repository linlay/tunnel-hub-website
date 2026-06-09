# Tunnel Hub Website

React + Vite management console for Tunnel Hub.

The website is deployed as a standalone static site container. It intentionally does not proxy `/api/admin` or `/tunnel`; the host Nginx routes those paths directly to `tunnel-hub-server`.

## Commands

```bash
npm install
npm test
npm run build
npm run dev
```

For local development with a separate Relay:

```bash
VITE_PROXY_TARGET=http://127.0.0.1:8080 npm run dev
```

## Production

```bash
docker compose -f compose.yml up -d --build
```

Set `WEBSITE_HTTP_PORT=11963` in `.env` for the production host. Public TLS and `/api/admin` routing are handled by `/etc/nginx/sites-available/tunnel-hub.zenmind.cc.conf`.

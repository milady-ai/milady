# Milaidy Cloud Deployment Guide

## Quick Start

```bash
# Clone and install
git clone <repo>
cd milaidy-dev
bun install

# Start development servers
./start-services.sh start

# Access at http://localhost:2138
```

## Port Configuration

**Default Architecture:**
- **API Server**: `http://localhost:31337` (runtime + WebSocket + REST API)
- **UI Dev Server**: `http://localhost:2138` (Vite, proxies `/api` to 31337)

The UI automatically proxies all `/api/*` and `/ws` requests to the API server, so you only need to access port 2138.

## Service Management

### Commands
```bash
./start-services.sh start       # Start both API + UI
./start-services.sh stop        # Stop all services
./start-services.sh restart     # Restart all services
./start-services.sh status      # Check status
./start-services.sh logs        # View last 100 log lines
./start-services.sh logs:follow # Tail logs in real-time
```

### Logs
- Combined log: `/tmp/milaidy-dev.log`
- Contains output from both API and UI servers

### Process Management
- PID file: `/tmp/milaidy-dev.pid`
- Auto-kills zombie processes on ports 31337 and 2138
- Uses `bun run dev` (which runs `scripts/dev-ui.mjs`)

## Remote Access

### SSH Tunnel (Recommended)

Forward the UI port to access the full stack:

```bash
# Simple (UI only, proxies to API internally)
ssh -L 2138:localhost:2138 user@server

# Or forward both (redundant but works)
ssh -L 2138:localhost:2138 -L 31337:localhost:31337 user@server
```

Then access at: `http://localhost:2138`

### Cloudflare Tunnel (Not Recommended)

Avoid due to rate limiting issues. Use SSH tunnel instead.

## Cloud Onboarding

### Routes
- `/` - Advanced onboarding (full configuration)
- `/cloud` - Simplified cloud-first flow (device auth)

### Cloud Onboarding Flow

**Step 1: Connect**
- Click "connect" button
- Generates device fingerprint (canvas, WebGL, screen, timezone, UA)
- Calls `POST /api/cloud/elizacloud/device-auth`
- Auto-creates elizacloud account if new device
- Stores credentials in localStorage

**Step 2: Plan**
- Free: Shared infra, platform keys, rate limited
- Power ($29/mo): Dedicated container, BYO keys, SSH access

**Step 3: Vibe**
- Select personality preset (style + system prompt)

**Step 4: Submit**
- `POST /api/onboarding` with all config + elizacloud credentials
- Marks onboarding complete
- Reloads to main app (`window.location.href = "/"`)

### Technical Details

**Device Auth Endpoint:**
```bash
POST /api/cloud/elizacloud/device-auth
Content-Type: application/json

{
  "deviceId": "device_<hash>",
  "platform": "browser",
  "deviceName": "milaidy-web"
}

# Response:
{
  "userId": "...",
  "organizationId": "...",
  "apiKey": "eliza_xxxxx",
  "credits": 100,
  "isNewUser": true
}
```

**Onboarding Submit:**
```bash
POST /api/onboarding
Content-Type: application/json

{
  "name": "Milaidy",
  "theme": "milady",
  "runMode": "cloud",
  "sandboxMode": "light",
  "bio": [...],
  "systemPrompt": "...",
  "style": {...},
  "cloudProvider": "elizacloud",
  "smallModel": "anthropic/claude-sonnet-4-5",
  "largeModel": "anthropic/claude-opus-4-6",
  "elizaCloudApiKey": "eliza_xxxxx",
  "elizaCloudUserId": "...",
  "elizaCloudOrgId": "..."
}
```

## Troubleshooting

### Services Won't Start

**Check if ports are in use:**
```bash
lsof -ti:31337
lsof -ti:2138
```

**Force cleanup:**
```bash
./start-services.sh stop
```

**View logs:**
```bash
./start-services.sh logs
```

### UI Can't Reach API

**Verify API is responding:**
```bash
curl http://localhost:31337/api/status
```

Should return:
```json
{"state":"not_started","agentName":"Maren","runMode":"local"}
```

**Check Vite proxy config:**
Located in `apps/app/vite.config.ts`:
```typescript
proxy: {
  "/api": {
    target: "http://localhost:31337",
    changeOrigin: true,
  },
  "/ws": {
    target: "ws://localhost:31337",
    ws: true,
  },
}
```

### Onboarding Stuck

**Symptoms:**
- Cloud onboarding stuck on "starting ur agent..."
- Onboarding complete but UI doesn't transition

**Fix:**
- Already fixed in current version (uses `window.location.href = "/"`)
- Clear browser localStorage and retry
- Check Network tab for failed `/api/onboarding` POST

**Debug:**
```bash
# Check API logs
./start-services.sh logs | grep onboarding

# Test endpoint directly
curl -X POST http://localhost:31337/api/onboarding \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","theme":"milady"}'
```

### Port 2187 Health Check Errors

**Issue:** Old code referenced wrong port for health checks

**Status:** FIXED - All port references updated to 31337 (API) / 2138 (UI)

**Verification:**
```bash
# Should work
curl http://localhost:31337/api/status

# Should NOT be used
curl http://localhost:2187/health  # ❌ Wrong port
```

## Environment Variables

### API Server
```bash
MILADY_API_PORT=31337              # API port
MILADY_API_BIND=127.0.0.1          # Bind address
ELIZAOS_CLOUD_BASE_URL=https://www.elizacloud.ai/api/v1
```

### UI Server
```bash
MILAIDY_API_PORT=31337             # Proxy target (must match API port)
```

### Set via .env (optional)
```bash
# Create .env in project root
echo "MILADY_API_BIND=0.0.0.0" > .env
```

## Known Issues & Status

### Fixed ✅
- Port configuration mismatch (31337/2138 standardized)
- Cloud onboarding stuck on "starting" (reload after submit)
- Device auth endpoint (restored for pairing-style UX)
- Service management script (simplified to single dev process)
- Port 2187 references (removed, using correct ports)

### Pending 🚧
- `/api/onboarding` agent creation (currently logs data only)
- Cloud backup system integration (elizacloud snapshots)
- Multi-tenant instance spawning (docker containers)
- SSH key distribution for Power tier users

## Production Deployment

### Build
```bash
bun run build
```

Output: `dist/` (server) + `apps/app/dist/` (UI)

### Deploy
```bash
# Copy built files to production server
scp -r dist/ apps/app/dist/ user@server:/opt/milaidy/

# On server, start with pm2 or systemd
pm2 start dist/entry.js --name milaidy-api
# Serve UI with nginx/caddy
```

### Nginx Config Example
```nginx
server {
    listen 80;
    server_name milaidy.yourdomain.com;
    
    # UI static files
    location / {
        root /opt/milaidy/apps/app/dist;
        try_files $uri /index.html;
    }
    
    # API proxy
    location /api {
        proxy_pass http://localhost:31337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:31337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

## Development Scripts

```bash
bun run dev          # Start both API + UI (via dev-ui.mjs)
bun run dev:ui       # UI only (assumes API running)
bun run dev:all      # Alternative full-stack dev mode
bun run build        # Production build
bun run typecheck    # TypeScript validation
bun run lint         # Biome linting
bun run lint:fix     # Auto-fix linting issues
```

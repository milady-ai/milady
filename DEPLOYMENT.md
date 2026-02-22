# Milaidy Deployment Guide

This guide covers production deployment of Milaidy with reverse proxy configurations for nginx and Caddy.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Reverse Proxy Setup](#reverse-proxy-setup)
  - [nginx Configuration](#nginx-configuration)
  - [Caddy Configuration](#caddy-configuration)
- [SSL/TLS Certificates](#ssltls-certificates)
- [Architecture Decisions](#architecture-decisions)
- [Monitoring and Logging](#monitoring-and-logging)

## Prerequisites

- Node.js 18+ installed
- A domain name pointing to your server
- SSL certificate (Let's Encrypt recommended)
- nginx or Caddy installed
- Systemd or another process manager (PM2 recommended)

## Environment Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Configure essential environment variables:

```bash
# ── Discord Bot Configuration ──────────────────────────────
VITE_DISCORD_CLIENT_ID=your_discord_app_client_id
VITE_DISCORD_REDIRECT_URI=https://yourdomain.com/discord-callback

# ── Cloud Provider Configuration ───────────────────────────
ELIZAOS_CLOUD_BASE_URL=https://www.elizacloud.ai
CONTAINER_API_PORT=2187  # Cloud container API port

# ── API Server Configuration ───────────────────────────────
MILADY_API_PORT=31337
MILADY_API_BIND=127.0.0.1  # Use 127.0.0.1 behind reverse proxy

# ── Database Configuration ─────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/milaidy
```

3. Build the application:

```bash
npm install
npm run build
```

## Reverse Proxy Setup

A reverse proxy is **required** for production deployments to handle:
- SSL/TLS termination
- Request routing
- Load balancing
- Static asset caching
- Security headers

### nginx Configuration

#### Basic Configuration

Create `/etc/nginx/sites-available/milaidy.conf`:

```nginx
# Milaidy API upstream
upstream milaidy_api {
    server 127.0.0.1:31337;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/milaidy-access.log;
    error_log /var/log/nginx/milaidy-error.log;

    # API Proxy
    location /api/ {
        proxy_pass http://milaidy_api;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # WebSocket support (if needed)
    location /ws {
        proxy_pass http://milaidy_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files (if serving frontend from same domain)
    location / {
        root /var/www/milaidy/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

#### Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/milaidy.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Advanced: Rate Limiting

Add rate limiting to protect against abuse:

```nginx
# Add to http block in /etc/nginx/nginx.conf
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

# Add to server block
location /api/cloud/login {
    limit_req zone=login_limit burst=2 nodelay;
    proxy_pass http://milaidy_api;
    # ... other proxy settings
}

location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://milaidy_api;
    # ... other proxy settings
}
```

### Caddy Configuration

Caddy provides automatic HTTPS with Let's Encrypt and simpler configuration.

Create `/etc/caddy/Caddyfile`:

```caddy
# Basic Configuration
yourdomain.com {
    # Automatic HTTPS via Let's Encrypt
    
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }

    # API reverse proxy
    handle /api/* {
        reverse_proxy localhost:31337 {
            # Health check
            health_uri /api/health
            health_interval 30s
            health_timeout 5s
            
            # Timeouts
            transport http {
                dial_timeout 10s
                response_header_timeout 60s
                read_timeout 60s
                write_timeout 60s
            }
        }
    }

    # WebSocket support
    handle /ws {
        reverse_proxy localhost:31337
    }

    # Static files (optional)
    handle /* {
        root * /var/www/milaidy/dist
        try_files {path} {path}/ /index.html
        file_server
    }

    # Logging
    log {
        output file /var/log/caddy/milaidy-access.log
        format json
    }
}
```

#### Advanced: Rate Limiting with Caddy

Install the rate limit plugin and configure:

```caddy
yourdomain.com {
    # Rate limiting
    rate_limit {
        zone api {
            key {remote_host}
            events 100
            window 1m
        }
        zone login {
            key {remote_host}
            events 5
            window 1m
        }
    }

    handle /api/cloud/login {
        rate_limit login
        reverse_proxy localhost:31337
    }

    handle /api/* {
        rate_limit api
        reverse_proxy localhost:31337
    }

    # ... rest of configuration
}
```

#### Reload Caddy:

```bash
sudo systemctl reload caddy
```

## SSL/TLS Certificates

### Using Let's Encrypt with Certbot (nginx)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
sudo certbot renew --dry-run  # Test auto-renewal
```

### Using Caddy (Automatic)

Caddy handles SSL automatically. Just ensure your domain DNS points to your server.

## Architecture Decisions

### Direct Container API vs elizacloud API

**Decision: Use direct container API for Discord OAuth**

**Rationale:**
- Discord OAuth flow requires direct access to the agent container's runtime
- The elizacloud API does not expose Discord-specific endpoints
- Container runs the full agent runtime with Discord client setup
- Direct container access is required for real-time Discord bot operations

**Implementation:**
- Container port is configurable via `CONTAINER_API_PORT` environment variable (default: 2187)
- Discord OAuth endpoint: `POST /api/cloud/discord/connect`
- Proxies OAuth code to: `http://{containerIp}:{CONTAINER_API_PORT}/api/discord/connect`

**Security Considerations:**
- Container IPs are private (not exposed to clients)
- OAuth codes are single-use and time-limited
- API endpoint validates all required parameters before forwarding
- Structured logging tracks all Discord OAuth attempts

### Error Handling Architecture

All API errors follow a consistent structure:

```typescript
{
  "error": "Human-readable error message"
}
```

**Error Handling Features:**
- Consistent error response format across all endpoints
- Structured logging with context (endpoint, parameters, status codes)
- Proper HTTP status codes (4xx for client errors, 5xx for server errors)
- Timeout handling with configurable timeouts
- Network error categorization (timeout vs. connection failure)

## Monitoring and Logging

### Application Logging

Milaidy uses structured logging with the ElizaOS logger:

```bash
# View logs in production
pm2 logs milaidy

# Filter by log level
pm2 logs milaidy --lines 100 | grep ERROR

# Follow logs in real-time
pm2 logs milaidy --raw
```

### Key Log Categories

- `[cloud-login]` - Authentication flow events
- `[cloud-device-auth]` - Device authentication
- `[cloud-agent-create]` - Agent creation operations
- `[cloud-discord]` - Discord OAuth operations
- `[cloud-routes]` - General API errors

### nginx Logs

```bash
# Access logs
tail -f /var/log/nginx/milaidy-access.log

# Error logs
tail -f /var/log/nginx/milaidy-error.log

# Analyze traffic
sudo apt install goaccess
goaccess /var/log/nginx/milaidy-access.log --log-format=COMBINED
```

### Caddy Logs

```bash
# View logs (JSON format)
sudo journalctl -u caddy -f

# Parse specific logs
sudo tail -f /var/log/caddy/milaidy-access.log | jq .
```

### Health Checks

Add a health check endpoint to your API:

```typescript
// src/api/health-routes.ts
export function handleHealthRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): boolean {
  if (pathname === "/api/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
    return true;
  }
  return false;
}
```

Monitor with:

```bash
# Simple check
curl https://yourdomain.com/api/health

# Continuous monitoring
watch -n 5 'curl -s https://yourdomain.com/api/health | jq .'
```

## Process Management

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start npm --name "milaidy" -- start

# Configure auto-restart
pm2 startup
pm2 save

# Monitor
pm2 monit

# Restart on changes
pm2 restart milaidy

# View logs
pm2 logs milaidy
```

### Using systemd

Create `/etc/systemd/system/milaidy.service`:

```ini
[Unit]
Description=Milaidy API Server
After=network.target

[Service]
Type=simple
User=milaidy
WorkingDirectory=/opt/milaidy
EnvironmentFile=/opt/milaidy/.env
ExecStart=/usr/bin/node /opt/milaidy/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable milaidy
sudo systemctl start milaidy
sudo journalctl -u milaidy -f
```

## Security Checklist

- [ ] SSL/TLS certificate installed and auto-renewing
- [ ] Firewall configured (only 80, 443 open)
- [ ] API bound to localhost (not 0.0.0.0)
- [ ] Environment variables secured (not in version control)
- [ ] Rate limiting enabled
- [ ] Security headers configured
- [ ] Database credentials rotated
- [ ] Logs monitored for suspicious activity
- [ ] Backups configured
- [ ] Process manager auto-restart enabled

## Troubleshooting

### API not responding

```bash
# Check if process is running
pm2 status
# or
sudo systemctl status milaidy

# Check if port is listening
sudo netstat -tlnp | grep 31337

# Check nginx/caddy is running
sudo systemctl status nginx
# or
sudo systemctl status caddy
```

### SSL certificate issues

```bash
# Test certificate
curl -vI https://yourdomain.com

# Renew Let's Encrypt
sudo certbot renew --force-renewal

# Check Caddy auto-cert
sudo caddy validate --config /etc/caddy/Caddyfile
```

### High memory usage

```bash
# Check process stats
pm2 monit

# Restart if needed
pm2 restart milaidy

# Increase Node.js memory limit
node --max-old-space-size=4096 dist/index.js
```

## Support

For issues and questions:
- GitHub Issues: [Your repo URL]
- Documentation: [Your docs URL]
- Discord: [Your Discord server]

FROM node:22-bookworm

# Install Bun (primary package manager and build tool)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

ARG MILADY_DOCKER_APT_PACKAGES=""
RUN if [ -n "$MILADY_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $MILADY_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Copy dependency manifests first for better layer caching
COPY package.json bun.lock* .npmrc ./
COPY apps/app/package.json ./apps/app/package.json
COPY apps/app/electron/package.json ./apps/app/electron/package.json
COPY packages/mldy/package.json ./packages/mldy/package.json
COPY packages/plugin-coding-agent/package.json ./packages/plugin-coding-agent/package.json
COPY packages/plugin-claude-code-workbench/package.json ./packages/plugin-claude-code-workbench/package.json
COPY packages/plugin-pi-ai/package.json ./packages/plugin-pi-ai/package.json
COPY packages/plugin-repoprompt/package.json ./packages/plugin-repoprompt/package.json
COPY packages/plugin-ui/package.json ./packages/plugin-ui/package.json
COPY packages/psyop/package.json ./packages/psyop/package.json
COPY deploy/cloud-agent-template/package.json ./deploy/cloud-agent-template/package.json
COPY scripts ./scripts

# Install dependencies (no lockfile in repo; bun resolves from package.json).
RUN bun install

# Copy source and build (includes apps/app/dist UI bundle)
COPY . .
RUN bun run build

ENV NODE_ENV=production

# Allow non-root user to write temp files during runtime.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
USER node

# Default: bind to 0.0.0.0 in containers so the service is reachable.
# Set MILADY_API_TOKEN in production to require auth.
ENV MILADY_API_BIND="0.0.0.0"

# Kinsta sets PORT env var; bridge it to MILADY_PORT.
# Falls back to 2138 if PORT is not set.
EXPOSE 2138

# Start the API server + dashboard UI.
# Uses shell form so $PORT is expanded at runtime.
CMD sh -c "MILADY_PORT=${PORT:-2138} node milady.mjs start"

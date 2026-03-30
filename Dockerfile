# ==============================================================================
# Stage 1: Builder — install all deps, resolve LFS assets, build
# ==============================================================================
ARG NODE_VERSION=22
ARG BUN_VERSION=1.3.10
ARG OCI_SOURCE="https://github.com/milady-ai/milady"
ARG OCI_TITLE="Milady Agent"
ARG OCI_DESCRIPTION="Milady agent runtime and application shell"
ARG OCI_LICENSES="MIT"
ARG VERSION=""
ARG VERSION_CLEAN=""
ARG REVISION=""

FROM node:${NODE_VERSION}-bookworm AS builder
ARG BUN_VERSION

# Install Bun (primary package manager and build tool)
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD="true"

ARG MILADY_DOCKER_APT_PACKAGES=""
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git git-lfs $MILADY_DOCKER_APT_PACKAGES && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Copy full source so Bun can resolve all workspaces declared in package.json.
COPY . .

# Pull large media tracked by Git LFS when git metadata is available (e.g. Railway GitHub deploy).
RUN if [ -d .git ]; then \
      git lfs install --local && \
      git lfs pull || true; \
    fi

# If pointer files remain (common in some cloud build contexts), fallback to
# cloning the repo and pulling LFS assets directly, then overwrite local media.
ARG MILADY_LFS_REPO_URL=""
ARG MILADY_LFS_REF=""
ARG MILADY_LFS_COMMIT=""
ARG GITHUB_TOKEN=""
RUN set -e; \
    GITHUB_TOKEN="${GITHUB_TOKEN}"; \
    REPO_URL_RAW="$MILADY_LFS_REPO_URL"; \
    if [ -z "$REPO_URL_RAW" ] && [ -d .git ]; then REPO_URL_RAW="$(git config --get remote.origin.url || true)"; fi; \
    if [ -z "$REPO_URL_RAW" ]; then REPO_URL_RAW="https://github.com/miladybsc/milady.git"; fi; \
    if echo "$REPO_URL_RAW" | grep -q '^git@github.com:'; then REPO_URL_RAW="$(echo "$REPO_URL_RAW" | sed -E 's#^git@github.com:(.+)$#https://github.com/\1#')"; fi; \
    if echo "$REPO_URL_RAW" | grep -q '^ssh://git@github.com/'; then REPO_URL_RAW="$(echo "$REPO_URL_RAW" | sed -E 's#^ssh://git@github.com/#https://github.com/#')"; fi; \
    POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms apps/app/public/animations || true)"; \
    if [ -n "$POINTERS" ]; then \
      echo '[build] Unresolved Git LFS pointers detected in build context; attempting fallback clone...'; \
      REPO_URL="$REPO_URL_RAW"; \
      REF="$MILADY_LFS_REF"; \
      COMMIT="$MILADY_LFS_COMMIT"; \
      if [ -z "$REF" ] && [ -n "${RAILWAY_GIT_BRANCH:-}" ]; then REF="${RAILWAY_GIT_BRANCH}"; fi; \
      if [ -z "$REF" ]; then REF="main"; fi; \
      if [ -z "$COMMIT" ] && [ -n "${RAILWAY_GIT_COMMIT_SHA:-}" ]; then COMMIT="${RAILWAY_GIT_COMMIT_SHA}"; fi; \
      if [ -n "$GITHUB_TOKEN" ] && echo "$REPO_URL" | grep -q '^https://github.com/'; then \
        REPO_URL="$(echo "$REPO_URL" | sed "s#^https://#https://x-access-token:${GITHUB_TOKEN}@#")"; \
      fi; \
      rm -rf /tmp/milady-lfs-src; \
      if git -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false clone --depth 1 --branch "$REF" "$REPO_URL" /tmp/milady-lfs-src; then \
        cd /tmp/milady-lfs-src; \
        if [ -n "$COMMIT" ]; then \
          git -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false fetch --depth 1 origin "$COMMIT" && GIT_LFS_SKIP_SMUDGE=1 git checkout "$COMMIT"; \
        fi; \
        git lfs install --local; \
        # LFS budget/quota can block fetch; continue so media.githubusercontent fallback can run.
        git lfs fetch origin "$REF" --include='apps/app/public/vrms' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/mixamo' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/emotes' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/idle.glb' || true; \
        git lfs checkout apps/app/public/vrms || true; \
        git lfs checkout apps/app/public/animations/mixamo || true; \
        git lfs checkout apps/app/public/animations/emotes || true; \
        git lfs checkout apps/app/public/animations/idle.glb || true; \
        cd /app; \
        rm -rf apps/app/public/vrms apps/app/public/animations; \
        mkdir -p apps/app/public/vrms/previews apps/app/public/vrms/backgrounds apps/app/public/animations; \
        for vrm_id in 1 4 5 9; do \
          if [ -f "/tmp/milady-lfs-src/apps/app/public/vrms/milady-${vrm_id}.vrm" ]; then \
            gzip -c "/tmp/milady-lfs-src/apps/app/public/vrms/milady-${vrm_id}.vrm" > "apps/app/public/vrms/milady-${vrm_id}.vrm.gz"; \
          fi; \
          if [ -f "/tmp/milady-lfs-src/apps/app/public/vrms/previews/milady-${vrm_id}.png" ]; then \
            cp -a "/tmp/milady-lfs-src/apps/app/public/vrms/previews/milady-${vrm_id}.png" apps/app/public/vrms/previews/; \
          fi; \
        done; \
        for bg_id in 1 4 5 9; do \
          if [ -f "/tmp/milady-lfs-src/apps/app/public/vrms/backgrounds/milady-${bg_id}.png" ]; then \
            cp -a "/tmp/milady-lfs-src/apps/app/public/vrms/backgrounds/milady-${bg_id}.png" apps/app/public/vrms/backgrounds/; \
          fi; \
        done; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/mixamo apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/emotes apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/idle.glb apps/app/public/animations/ || true; \
        rm -f apps/app/public/animations/emotes/idle.glb apps/app/public/animations/emotes/punch.glb apps/app/public/animations/mixamo/Crying.fbx; \
        find apps/app/public/animations -type f \( -name '*.glb' -o -name '*.fbx' \) -exec sh -c 'gzip -c "$1" > "$1.gz" && rm -f "$1"' _ {} \; ; \
        rm -rf /tmp/milady-lfs-src; \
      else \
        echo '[build] WARNING: fallback clone failed; continuing with existing assets.'; \
      fi; \
    fi; \
    MEDIA_REPO="$REPO_URL_RAW"; \
    MEDIA_REPO_PATH="$(echo "$MEDIA_REPO" | sed -E 's#^https://([^@/]+@)?github.com/([^/]+/[^/.]+)(\\.git)?$#\\2#')"; \
    if [ -z "$MEDIA_REPO_PATH" ] || [ "$MEDIA_REPO_PATH" = "$MEDIA_REPO" ]; then MEDIA_REPO_PATH="miladybsc/milady"; fi; \
    MEDIA_REF="$MILADY_LFS_REF"; \
    if [ -z "$MEDIA_REF" ] && [ -n "${RAILWAY_GIT_BRANCH:-}" ]; then MEDIA_REF="${RAILWAY_GIT_BRANCH}"; fi; \
    if [ -z "$MEDIA_REF" ]; then MEDIA_REF="main"; fi; \
    VRM_POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms || true)"; \
    if [ -n "$VRM_POINTERS" ]; then \
      echo '[build] VRM pointers detected after LFS restore; attempting media.githubusercontent fallback...'; \
      echo "$VRM_POINTERS" | while IFS= read -r FILE; do \
        [ -z "$FILE" ] && continue; \
        URL="https://media.githubusercontent.com/media/${MEDIA_REPO_PATH}/${MEDIA_REF}/${FILE}"; \
        echo "[build] downloading $FILE"; \
        curl -fsSL "$URL" -o "$FILE" || true; \
      done; \
    fi; \
    VRM_POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms || true)"; \
    if [ -n "$VRM_POINTERS" ]; then \
      echo '[build] ERROR: unresolved Git LFS pointers remain in VRM assets:'; \
      echo "$VRM_POINTERS"; \
      exit 1; \
    fi; \
    ANIMATION_POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/animations || true)"; \
    if [ -n "$ANIMATION_POINTERS" ]; then \
      echo '[build] WARNING: unresolved Git LFS pointers remain in animation assets; build will continue.'; \
      echo "$ANIMATION_POINTERS" | head -n 60; \
    fi

# Install dependencies with the committed lockfile while skipping third-party
# postinstall hooks that may fail in cloud builders. Then run our required
# local patch/link scripts before building.
RUN bun install --frozen-lockfile --ignore-scripts
RUN node ./scripts/link-browser-server.mjs && node ./scripts/patch-deps.mjs
RUN bun run build

# ==============================================================================
# Stage 2: Runtime — lean production image without dev deps, source, or build tools
# ==============================================================================
FROM node:${NODE_VERSION}-bookworm AS runtime
ARG BUN_VERSION
ARG OCI_SOURCE
ARG OCI_TITLE
ARG OCI_DESCRIPTION
ARG OCI_LICENSES
ARG VERSION
ARG VERSION_CLEAN
ARG REVISION
LABEL org.opencontainers.image.title="${OCI_TITLE}" \
      org.opencontainers.image.description="${OCI_DESCRIPTION}" \
      org.opencontainers.image.source="${OCI_SOURCE}" \
      org.opencontainers.image.url="${OCI_SOURCE}" \
      org.opencontainers.image.version="${VERSION_CLEAN}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="${OCI_LICENSES}"

# Install Bun (needed at runtime for bun-native modules)
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
ENV PATH="/root/.bun/bin:/app/node_modules/.bin:${PATH}"

WORKDIR /app
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD="true"

ARG MILADY_DOCKER_APT_PACKAGES=""
RUN if [ -n "$MILADY_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $MILADY_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Copy workspace node_modules
COPY --from=builder /app/node_modules ./node_modules

# Ensure tsx is available (bun symlinks don't survive docker COPY)
RUN cd /app && npm install tsx 2>/dev/null || true

# Copy build outputs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/app/dist ./apps/app/dist

# Copy entrypoint and runtime scripts
COPY --from=builder /app/milady.mjs ./milady.mjs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/packages ./packages

# Copy resolved VRM/animation assets (from LFS or fallback)
COPY --from=builder /app/apps/app/public ./apps/app/public

# Copy workspace package.json files so Node module resolution works
COPY --from=builder /app/apps/app/package.json ./apps/app/package.json
COPY --from=builder /app/apps/app/node_modules ./apps/app/node_modules

# Bun preserves workspace packages as symlinks in node_modules. The runtime
# needs the matching package trees present for those links to resolve.
RUN mkdir -p /app/node_modules/@miladyai && \
    ln -sf ../../packages/shared /app/node_modules/@miladyai/shared && \
    ln -sf ../../packages/ui /app/node_modules/@miladyai/ui && \
    ln -sf ../../packages/plugin-wechat /app/node_modules/@miladyai/plugin-wechat && \
    ln -sf ../../packages/vrm-utils /app/node_modules/@miladyai/vrm-utils

ENV NODE_ENV=production
ENV MILADY_PORT=2138
ENV MILADY_API_BIND="0.0.0.0"
ENV MILADY_STATE_DIR="/data/.milady"
ENV MILADY_CONFIG_PATH="/data/.milady/milady.json"
ENV PGLITE_DATA_DIR="/data/.milady/workspace/.eliza/.elizadb"

# Railway volume mount target. If /data is backed by a persistent volume,
# onboarding/config/database survive redeploys.
RUN mkdir -p /data/.milady/workspace/.eliza/.elizadb

EXPOSE 2138

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD sh -lc 'port="${PORT:-${MILADY_PORT:-2138}}"; code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/api/health")"; [ "$code" = "200" ] || [ "$code" = "401" ]'

ENTRYPOINT ["sh", "./scripts/docker-entrypoint.sh"]
CMD ["node", "milady.mjs", "start"]

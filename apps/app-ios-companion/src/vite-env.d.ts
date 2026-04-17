/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MILADY_AGENT_URL?: string;
  readonly VITE_MILADY_APNS_ENABLED?: string;
  readonly VITE_MILADY_LOG_LEVEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Bridge type definition + accessor. Single source of truth for the polyfill.
// The bridge is provided by the Swift host via globalThis.__MILADY_BRIDGE__.

export interface MiladyBridge {
  readonly version: "v1";

  // Filesystem
  fs_read_text(path: string, encoding?: "utf8" | "ascii"): string | null;
  fs_read_bytes(path: string): Uint8Array | null;
  fs_write_text(path: string, data: string): boolean;
  fs_write_bytes(path: string, data: Uint8Array): boolean;
  fs_append_text(path: string, data: string): boolean;
  fs_exists(path: string): boolean;
  fs_mkdir(path: string, recursive: boolean): boolean;
  fs_readdir(path: string): string[] | null;
  fs_stat(path: string): {
    size: number;
    mtime_ms: number;
    is_directory: boolean;
    is_file: boolean;
  } | null;
  fs_remove(path: string, recursive?: boolean): boolean;
  fs_rename(from: string, to: string): boolean;
  fs_copy(from: string, to: string): boolean;
  fs_last_error(): string | null;

  // Sandbox paths
  paths_app_support(): string;
  paths_documents(): string;
  paths_caches(): string;
  paths_tmp(): string;
  paths_bundle(): string;
  paths_bundle_resource(name: string, ext: string): string | null;

  // Crypto
  crypto_random_bytes(len: number): Uint8Array;
  crypto_random_uuid(): string;
  crypto_hash(
    algo: "sha256" | "sha512" | "sha1" | "md5",
    data: Uint8Array,
  ): Uint8Array;
  crypto_hmac(
    algo: "sha256" | "sha512" | "sha1",
    key: Uint8Array,
    data: Uint8Array,
  ): Uint8Array;
  crypto_pbkdf2(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    key_length: number,
    digest: "sha256" | "sha512" | "sha1",
  ): Uint8Array;
  crypto_aes_gcm_encrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad?: Uint8Array,
  ): { ciphertext: Uint8Array; tag: Uint8Array } | null;
  crypto_aes_gcm_decrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    tag: Uint8Array,
    aad?: Uint8Array,
  ): Uint8Array | null;

  // HTTP client
  http_fetch(opts: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: Uint8Array;
    timeout_ms?: number;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: Uint8Array;
    error?: string;
  }>;

  // HTTP server
  http_serve_start(opts: { port: number; handler_token: string }): {
    ok: boolean;
    port: number;
    error?: string;
  };
  http_serve_register_handler(
    token: string,
    handler: (req: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: Uint8Array;
    }) => Promise<{
      status: number;
      headers?: Record<string, string>;
      body?: Uint8Array | string;
    }>,
  ): void;
  http_serve_stop(token: string): void;

  // SQLite (PGlite replacement — WebAssembly is unreliable in JSContext on
  // iOS 16.4+, so we use the native libsqlite3 system framework instead).
  sqlite_open(opts: {
    path: string;
    readonly?: boolean;
    timeout_ms?: number;
  }): { db_id: number } | { error: string };
  sqlite_close(db_id: number): boolean;
  sqlite_exec(
    db_id: number,
    sql: string,
  ): { rows_affected: number } | { error: string };
  sqlite_query(
    db_id: number,
    sql: string,
    params?: Array<string | number | boolean | null | Uint8Array>,
  ):
    | {
        columns: string[];
        rows: Array<Array<string | number | null | Uint8Array>>;
      }
    | { error: string };
  sqlite_prepare(
    db_id: number,
    sql: string,
  ): { stmt_id: number } | { error: string };
  sqlite_step(
    stmt_id: number,
    params?: Array<string | number | boolean | null | Uint8Array>,
  ):
    | { done: boolean; row?: Array<string | number | null | Uint8Array> }
    | { error: string };
  sqlite_finalize(stmt_id: number): boolean;
  sqlite_version(): { sqlite: string; sqlite_vec?: string };

  // Llama
  llama_load_model(opts: {
    path: string;
    context_size?: number;
    use_gpu?: boolean;
    threads?: number;
  }): Promise<{ context_id: number } | { error: string }>;
  llama_generate(opts: {
    context_id: number;
    prompt: string;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop?: string[];
    stream_callback_token?: string;
  }): Promise<
    | {
        text: string;
        prompt_tokens: number;
        output_tokens: number;
        duration_ms: number;
      }
    | { error: string }
  >;
  llama_register_stream_callback(
    token: string,
    on_token: (token: string, is_last: boolean) => void,
  ): void;
  llama_cancel(context_id: number): void;
  llama_free(context_id: number): void;
  llama_hardware_info(): {
    backend: "metal" | "cpu";
    total_ram_gb: number;
    available_ram_gb: number;
    cpu_cores: number;
    is_simulator: boolean;
    metal_supported: boolean;
  };

  // Logging
  log(level: "debug" | "info" | "warn" | "error", message: string): void;

  // Process / env
  now_ns(): number;
  argv(): string[];
  env_get(key: string): string | undefined;
  env_set(key: string, value: string): void;
  env_keys(): string[];
  exit(code: number): void;

  // UI bridge
  ui_post_message(channel: string, payload: unknown): void;
  ui_register_handler(
    method: string,
    handler: (args: unknown) => Promise<unknown>,
  ): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __MILADY_BRIDGE__: MiladyBridge | undefined;
  // eslint-disable-next-line no-var
  var __MILADY_BRIDGE_VERSION__: string | undefined;
}

let cached: MiladyBridge | null = null;

export function getBridge(): MiladyBridge {
  if (cached) return cached;
  const b = (globalThis as { __MILADY_BRIDGE__?: MiladyBridge })
    .__MILADY_BRIDGE__;
  if (!b) {
    throw new Error(
      "[milady-polyfill] __MILADY_BRIDGE__ missing — Swift host must install bridge before evaluating polyfill",
    );
  }
  cached = b;
  return b;
}

export function hasBridge(): boolean {
  return Boolean(
    (globalThis as { __MILADY_BRIDGE__?: MiladyBridge }).__MILADY_BRIDGE__,
  );
}

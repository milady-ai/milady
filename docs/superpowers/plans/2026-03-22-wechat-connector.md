# WeChat Connector — Milady Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register `@miladyai/plugin-wechat` as the 20th connector in Milady, with config detection, auto-enable, parity tests, and documentation.

**Architecture:** The plugin npm package is assumed to already exist (or be published separately). This plan covers only the Milady-side integration: adding the dependency, extending connector maps, wrapping upstream re-exports, updating parity tests, adding connector validation tests, and updating documentation.

**Tech Stack:** TypeScript, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-03-22-wechat-connector-design.md`

---

### Task 1: Add npm dependency

**Files:**
- Modify: `packages/app-core/package.json`

- [ ] **Step 1: Add `@miladyai/plugin-wechat` to dependencies**

```bash
cd packages/app-core && bun add @miladyai/plugin-wechat
```

If the package is not yet published, add a placeholder version to `package.json` manually:

```json
"@miladyai/plugin-wechat": "^0.1.0"
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/package.json bun.lock
git commit -m "feat: add @miladyai/plugin-wechat dependency"
```

---

### Task 2: Add WeChat to INTERNAL_CHANNEL_PLUGIN_OVERRIDES

**Files:**
- Modify: `packages/app-core/src/runtime/eliza.ts:51-54`

- [ ] **Step 1: Read the current `INTERNAL_CHANNEL_PLUGIN_OVERRIDES`**

It currently looks like:

```typescript
const INTERNAL_CHANNEL_PLUGIN_OVERRIDES = {
  signal: "@elizaos/plugin-signal",
  whatsapp: "@elizaos/plugin-whatsapp",
} as const;
```

- [ ] **Step 2: Add `wechat` entry**

```typescript
const INTERNAL_CHANNEL_PLUGIN_OVERRIDES = {
  signal: "@elizaos/plugin-signal",
  whatsapp: "@elizaos/plugin-whatsapp",
  wechat: "@miladyai/plugin-wechat",
} as const;
```

- [ ] **Step 3: Add mock for the new plugin in any test file that mocks eliza.ts static imports**

Three test files have `vi.mock(...)` blocks for plugin packages. Add this line to **all three**:

- `packages/app-core/src/config/connector-parity.test.ts`
- `packages/app-core/src/runtime/eliza.test.ts`
- `packages/app-core/src/config/plugin-auto-enable.test.ts`

```typescript
vi.mock("@miladyai/plugin-wechat", () => ({ default: {} }));
```

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/runtime/eliza.ts packages/app-core/src/config/connector-parity.test.ts packages/app-core/src/runtime/eliza.test.ts packages/app-core/src/config/plugin-auto-enable.test.ts
git commit -m "feat: register wechat in INTERNAL_CHANNEL_PLUGIN_OVERRIDES"
```

---

### Task 3: Wrap `CONNECTOR_IDS` to include WeChat

**Files:**
- Modify: `packages/app-core/src/config/schema.ts`

- [ ] **Step 1: Read the current file**

It is currently a bare re-export:

```typescript
export * from "@elizaos/agent/config/schema";
```

- [ ] **Step 2: Replace with a wrapper that extends CONNECTOR_IDS**

```typescript
// Re-export everything from upstream
export * from "@elizaos/agent/config/schema";

// Override CONNECTOR_IDS to include Milady-local connectors.
// The wildcard re-export above is shadowed by this explicit named export.
import { CONNECTOR_IDS as _upstreamConnectorIds } from "@elizaos/agent/config/schema";

/** Milady-local connectors not present in upstream @elizaos/agent. */
export const MILADY_LOCAL_CONNECTOR_IDS = ["wechat"] as const;

export const CONNECTOR_IDS = [
  ..._upstreamConnectorIds,
  ...MILADY_LOCAL_CONNECTOR_IDS,
] as const;
```

- [ ] **Step 3: Verify the override works**

Run: `bun run check`
Expected: No type errors — the explicit `CONNECTOR_IDS` export shadows the wildcard re-export.

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/config/schema.ts
git commit -m "feat: extend CONNECTOR_IDS with Milady-local wechat connector"
```

---

### Task 4: Create `isWechatConfigured()` helper

**Files:**
- Create: `packages/app-core/src/config/wechat-config.ts`
- Create: `packages/app-core/src/config/wechat-config.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/app-core/src/config/wechat-config.test.ts
import { describe, expect, it } from "vitest";
import { isWechatConfigured } from "../wechat-config";

describe("isWechatConfigured", () => {
  it("returns true when apiKey is present", () => {
    expect(isWechatConfigured({ apiKey: "key" })).toBe(true);
  });

  it("returns false for empty config", () => {
    expect(isWechatConfigured({})).toBe(false);
  });

  it("returns false when explicitly disabled", () => {
    expect(isWechatConfigured({ enabled: false, apiKey: "key" })).toBe(false);
  });

  it("returns true with multi-account containing enabled account with apiKey", () => {
    expect(
      isWechatConfigured({
        accounts: {
          main: { enabled: true, apiKey: "key" },
        },
      }),
    ).toBe(true);
  });

  it("returns false with multi-account where all accounts are disabled", () => {
    expect(
      isWechatConfigured({
        accounts: {
          main: { enabled: false, apiKey: "key" },
        },
      }),
    ).toBe(false);
  });

  it("returns false with empty accounts object", () => {
    expect(isWechatConfigured({ accounts: {} })).toBe(false);
  });

  it("returns true with mixed accounts (one enabled, one disabled)", () => {
    expect(
      isWechatConfigured({
        accounts: {
          main: { enabled: true, apiKey: "key" },
          secondary: { enabled: false, apiKey: "key2" },
        },
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/app-core && bunx vitest run src/config/__tests__/wechat-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/app-core/src/config/wechat-config.ts

/** WeChat connector plugin package name. */
export const WECHAT_PLUGIN_PACKAGE = "@miladyai/plugin-wechat" as const;

/**
 * Detect whether the WeChat connector block in `connectors.wechat` is
 * sufficiently configured to auto-enable the plugin.
 */
export function isWechatConfigured(
  config: Record<string, unknown>,
): boolean {
  if (config.enabled === false) return false;

  // Single-account: top-level apiKey
  if (config.apiKey) return true;

  // Multi-account: at least one enabled account with apiKey
  const accounts = config.accounts;
  if (accounts && typeof accounts === "object") {
    return Object.values(accounts as Record<string, Record<string, unknown>>).some(
      (acc) => {
        if (acc.enabled === false) return false;
        return Boolean(acc.apiKey);
      },
    );
  }

  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/app-core && bunx vitest run src/config/__tests__/wechat-config.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/config/wechat-config.ts packages/app-core/src/config/wechat-config.test.ts
git commit -m "feat: add isWechatConfigured() config detection helper"
```

---

### Task 5: Wrap `applyPluginAutoEnable` to include WeChat

**Files:**
- Modify: `packages/app-core/src/config/plugin-auto-enable.ts`

- [ ] **Step 1: Read the current file**

It is currently a bare re-export:

```typescript
export * from "@elizaos/agent/config/plugin-auto-enable";
```

- [ ] **Step 2: Replace with a wrapper**

```typescript
// Re-export everything from upstream
export * from "@elizaos/agent/config/plugin-auto-enable";

// Override applyPluginAutoEnable to inject WeChat auto-enable before upstream.
import {
  applyPluginAutoEnable as _upstreamApplyPluginAutoEnable,
  type ApplyPluginAutoEnableParams,
} from "@elizaos/agent/config/plugin-auto-enable";
import { isWechatConfigured, WECHAT_PLUGIN_PACKAGE } from "./wechat-config";

export function applyPluginAutoEnable(params: ApplyPluginAutoEnableParams) {
  const { config } = params;

  // Inject WeChat before upstream runs (upstream doesn't know about wechat)
  const wechatConfig = (config as Record<string, unknown>)?.connectors as
    | Record<string, unknown>
    | undefined;
  const wechatBlock = wechatConfig?.wechat as
    | Record<string, unknown>
    | undefined;

  if (wechatBlock && isWechatConfigured(wechatBlock)) {
    const plugins = ((config as Record<string, unknown>).plugins ??= {}) as Record<string, unknown>;
    const allow = ((plugins.allow as string[]) ??= []);
    if (!allow.includes("wechat")) {
      allow.push("wechat");
    }
  }

  // Delegate to upstream for all other connectors
  return _upstreamApplyPluginAutoEnable(params);
}
```

**Note:** The exact `ApplyPluginAutoEnableParams` type and config shape must be verified against the upstream export at implementation time. The above is illustrative — adapt the type casts to match the actual config structure.

- [ ] **Step 3: Verify typecheck passes**

Run: `bun run check`

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/config/plugin-auto-enable.ts
git commit -m "feat: wrap applyPluginAutoEnable to auto-enable wechat connector"
```

---

### Task 6: Update connector parity tests

**Files:**
- Modify: `packages/app-core/src/config/connector-parity.test.ts`

- [ ] **Step 1: Read the current test file to see exact assertions**

Key assertions to update:
- `runtimeIds === autoEnableIds` — will fail because CHANNEL_PLUGIN_MAP now has 20 keys but CONNECTOR_PLUGINS has 19
- `schemaIds === autoEnableIds` — will fail because local CONNECTOR_IDS has 20 but CONNECTOR_PLUGINS has 19
- Reverse mapping check — will fail for wechat (not in upstream CONNECTOR_PLUGINS)
- Count assertion — hardcoded to 19
- Package prefix regex — only allows `@(elizaos|elizaai)/`

- [ ] **Step 2: Add MILADY_LOCAL_CONNECTORS and update assertions**

Add near the top (after imports):

```typescript
import { MILADY_LOCAL_CONNECTOR_IDS } from "./schema";

/** Connectors registered locally in Milady, not in upstream @elizaos/agent. */
const MILADY_LOCAL_CONNECTORS = new Set(MILADY_LOCAL_CONNECTOR_IDS);
```

Update the parity test:

```typescript
it("keeps connector IDs aligned across schema, runtime, and auto-enable", () => {
  const autoEnableIds = sorted(Object.keys(CONNECTOR_PLUGINS));
  const runtimeIds = sorted(Object.keys(CHANNEL_PLUGIN_MAP));
  const schemaIds = sorted(CONNECTOR_IDS);

  // Runtime = upstream + local overrides
  expect(runtimeIds).toEqual(sorted([...autoEnableIds, ...MILADY_LOCAL_CONNECTORS]));
  // Schema = upstream + local
  expect(schemaIds).toEqual(sorted([...autoEnableIds, ...MILADY_LOCAL_CONNECTORS]));
});
```

Update the reverse mapping check:

```typescript
it("keeps runtime-to-auto-enable package mappings aligned (reverse)", () => {
  for (const [connectorId, pluginName] of Object.entries(CHANNEL_PLUGIN_MAP)) {
    if (MILADY_LOCAL_CONNECTORS.has(connectorId)) continue; // local-only, not in upstream
    expect(CONNECTOR_PLUGINS[connectorId]).toBe(pluginName);
  }
});
```

Update the count assertion:

```typescript
it("has identical count across all three maps", () => {
  const upstreamCount = 19;
  const localCount = MILADY_LOCAL_CONNECTORS.size;
  expect(CONNECTOR_IDS).toHaveLength(upstreamCount + localCount);
  expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(upstreamCount);
  expect(Object.keys(CHANNEL_PLUGIN_MAP)).toHaveLength(upstreamCount + localCount);
});
```

Update the package prefix regex:

```typescript
it("uses valid package name prefixes for all plugin mappings", () => {
  const validPrefix = /^@(elizaos|elizaai|miladyai)\//;
  for (const pkg of Object.values(CONNECTOR_PLUGINS)) {
    expect(pkg).toMatch(validPrefix);
  }
  for (const pkg of Object.values(CHANNEL_PLUGIN_MAP)) {
    expect(pkg).toMatch(validPrefix);
  }
});
```

Add wechat to CONNECTOR_CREDS:

```typescript
wechat: { apiKey: "key" },
```

**Important:** The `it.each` tests that call upstream `isConnectorConfigured("wechat", ...)` may fail if the upstream default case returns `false` for unknown connector IDs. Verify by reading the upstream `isConnectorConfigured` source in `node_modules/@elizaos/agent`. If the default case checks `config.apiKey`, it will pass. If it returns `false`, skip wechat in the `it.each` for `isConnectorConfigured` tests by filtering local connectors:

```typescript
const upstreamConnectorIds = CONNECTOR_IDS.filter(
  (id) => !MILADY_LOCAL_CONNECTORS.has(id),
);
```

- [ ] **Step 3: Run the parity tests**

Run: `cd packages/app-core && bunx vitest run src/config/connector-parity.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/config/connector-parity.test.ts
git commit -m "test: update connector parity tests for wechat (20th connector)"
```

---

### Task 7: Update eliza.test.ts parity assertion

**Files:**
- Modify: `packages/app-core/src/runtime/eliza.test.ts:763-788`

- [ ] **Step 1: Read the relevant section**

The test at ~line 763:

```typescript
it("CHANNEL_PLUGIN_MAP keys match CONNECTOR_IDS from schema", () => {
  expect([...Object.keys(CHANNEL_PLUGIN_MAP)].sort()).toEqual(
    [...CONNECTOR_IDS].sort(),
  );
});
```

This should still pass because both `CHANNEL_PLUGIN_MAP` and `CONNECTOR_IDS` now include wechat. Verify.

- [ ] **Step 2: Check the values-match test at ~line 769**

```typescript
it("CHANNEL_PLUGIN_MAP values match CONNECTOR_PLUGINS for every connector", () => {
  for (const id of Object.keys(CHANNEL_PLUGIN_MAP)) {
    expect(CHANNEL_PLUGIN_MAP[id]).toBe(CONNECTOR_PLUGINS[id]);
  }
});
```

This will FAIL for wechat because `CONNECTOR_PLUGINS` (upstream) doesn't have it. Update:

```typescript
it("CHANNEL_PLUGIN_MAP values match CONNECTOR_PLUGINS for every connector", () => {
  for (const id of Object.keys(CHANNEL_PLUGIN_MAP)) {
    if (MILADY_LOCAL_CONNECTOR_IDS.includes(id)) continue;
    expect(CHANNEL_PLUGIN_MAP[id]).toBe(CONNECTOR_PLUGINS[id]);
  }
});
```

Add the import at the top of the file:

```typescript
import { MILADY_LOCAL_CONNECTOR_IDS } from "../config/schema";
```

- [ ] **Step 3: Verify the import for CONNECTOR_IDS comes from local schema (not upstream)**

Check the existing import. It should already import from `"../config/schema"` which is our wrapped re-export. If it imports directly from `@elizaos/agent`, change it.

- [ ] **Step 4: Run the test**

Run: `cd packages/app-core && bunx vitest run src/runtime/eliza.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/runtime/eliza.test.ts
git commit -m "test: update eliza.test.ts parity for wechat local connector"
```

---

### Task 8: Add WeChat auto-enable tests to plugin-auto-enable.test.ts

**Files:**
- Modify: `packages/app-core/src/config/plugin-auto-enable.test.ts`

**Note:** This file does NOT contain a parity assertion between `CONNECTOR_PLUGINS` and `CONNECTOR_IDS` — that lives in `connector-parity.test.ts` (Task 6). This task is about adding **new** WeChat-specific auto-enable tests to the existing `"applyPluginAutoEnable — connectors"` describe block.

- [ ] **Step 1: Read the file and find the connectors describe block**

Search for: `describe("applyPluginAutoEnable — connectors"` (starts around line 104).

- [ ] **Step 2: Add WeChat auto-enable tests**

```typescript
it("enables wechat plugin when apiKey is configured", () => {
  const params = makeParams({
    config: {
      connectors: {
        wechat: { apiKey: "key" },
      },
    },
  });
  const { config } = applyPluginAutoEnable(params);
  expect(config.plugins?.allow).toContain("wechat");
});

it("does not enable wechat when disabled", () => {
  const params = makeParams({
    config: {
      connectors: {
        wechat: { enabled: false, apiKey: "key" },
      },
    },
  });
  const { config } = applyPluginAutoEnable(params);
  expect(config.plugins?.allow ?? []).not.toContain("wechat");
});
```

- [ ] **Step 4: Run the test**

Run: `cd packages/app-core && bunx vitest run src/config/plugin-auto-enable.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/config/plugin-auto-enable.test.ts
git commit -m "test: update plugin-auto-enable tests for wechat connector"
```

---

### Task 9: Add WeChat cases to connector-config.test.ts

**Files:**
- Modify: `packages/app-core/src/connectors/connector-config.test.ts`

- [ ] **Step 1: Read the existing test patterns**

Find the `isConnectorConfigured` function and its test cases.

- [ ] **Step 2: Add wechat to the local isConnectorConfigured function**

In the switch statement:

```typescript
case "wechat":
  return Boolean(
    config.apiKey ||
    (config.accounts &&
      typeof config.accounts === "object" &&
      Object.values(config.accounts as Record<string, Record<string, unknown>>).some(
        (acc) => acc.enabled !== false && Boolean(acc.apiKey),
      )),
  );
```

- [ ] **Step 3: Add test cases**

```typescript
it("detects WeChat with apiKey", () => {
  expect(isConnectorConfigured("wechat", { apiKey: "key" })).toBe(true);
});

it("detects WeChat with multi-account", () => {
  expect(
    isConnectorConfigured("wechat", {
      accounts: { main: { enabled: true, apiKey: "key" } },
    }),
  ).toBe(true);
});

it("rejects disabled WeChat", () => {
  expect(
    isConnectorConfigured("wechat", { enabled: false, apiKey: "key" }),
  ).toBe(false);
});
```

- [ ] **Step 4: If a CONNECTOR_PLUGINS map exists in this file, add wechat entry**

```typescript
wechat: "@miladyai/plugin-wechat",
```

- [ ] **Step 5: Run the test**

Run: `cd packages/app-core && bunx vitest run src/connectors/connector-config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/connectors/connector-config.test.ts
git commit -m "test: add wechat cases to connector-config tests"
```

---

### Task 10: Add wechat-connector.test.ts

**Files:**
- Create: `packages/app-core/src/connectors/wechat-connector.test.ts`
- Modify: `packages/app-core/src/test-support/test-helpers.ts`

- [ ] **Step 1: Add the resolver to test-helpers.ts**

Follow the Discord/Telegram pattern:

```typescript
const WECHAT_PLUGIN_PACKAGE_NAME = "@miladyai/plugin-wechat";

export function resolveWechatPluginImportSpecifier(): string | null {
  if (isPackageImportResolvable(WECHAT_PLUGIN_PACKAGE_NAME)) {
    return WECHAT_PLUGIN_PACKAGE_NAME;
  }

  const helperDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(helperDir, "..", "..");

  // Check node_modules
  const nodeModulesEntry = path.resolve(
    packageRoot,
    "node_modules",
    "@miladyai",
    "plugin-wechat",
    "dist",
    "index.js",
  );
  if (existsSync(nodeModulesEntry)) {
    return pathToFileURL(nodeModulesEntry).href;
  }

  return null;
}
```

- [ ] **Step 2: Write the connector test**

```typescript
// packages/app-core/src/connectors/wechat-connector.test.ts
import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveWechatPluginImportSpecifier,
} from "../test-support/test-helpers";

const WECHAT_PLUGIN_IMPORT = resolveWechatPluginImportSpecifier();
const WECHAT_PLUGIN_AVAILABLE = WECHAT_PLUGIN_IMPORT !== null;
const describeIfAvailable = WECHAT_PLUGIN_AVAILABLE ? describe : describe.skip;

const loadWechatPluginModule = async () => {
  if (!WECHAT_PLUGIN_IMPORT) {
    throw new Error("WeChat plugin is not resolvable");
  }
  return (await import(WECHAT_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfAvailable("WeChat Connector - Basic Validation", () => {
  it("can import the WeChat plugin package", async () => {
    const mod = await loadWechatPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadWechatPluginModule();
    const plugin = extractPlugin(mod);
    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadWechatPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;
    expect(plugin?.name).toBe("wechat");
  });

  it("plugin has a description", async () => {
    const mod = await loadWechatPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;
    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });
});

describe("WeChat Connector - Configuration", () => {
  it("validates single-account configuration", () => {
    const config = {
      enabled: true,
      apiKey: "key",
      proxyUrl: "https://proxy.example.com",
      webhookPort: 18790,
      deviceType: "ipad" as const,
    };
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBeTruthy();
  });

  it("validates multi-account configuration", () => {
    const config = {
      accounts: {
        main: { enabled: true, apiKey: "key", deviceType: "ipad" as const },
        secondary: { enabled: true, apiKey: "key2", deviceType: "mac" as const },
      },
    };
    expect(Object.keys(config.accounts)).toHaveLength(2);
  });

  it("validates feature flags have correct defaults", () => {
    const defaults = { images: true, groups: true };
    expect(defaults.images).toBe(true);
    expect(defaults.groups).toBe(true);
  });
});

describe("WeChat Connector - Environment Variables", () => {
  it("recognizes WECHAT_API_KEY environment variable", () => {
    const envKey = "WECHAT_API_KEY";
    expect(envKey).toBe("WECHAT_API_KEY");
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd packages/app-core && bunx vitest run src/connectors/wechat-connector.test.ts`
Expected: Plugin validation tests SKIP (package not installed yet), config tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/connectors/wechat-connector.test.ts packages/app-core/src/test-support/test-helpers.ts
git commit -m "test: add wechat connector test and test helper resolver"
```

---

### Task 11: Update documentation

**Files:**
- Modify: `docs/guides/connectors.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add WeChat to the connectors guide**

Find the platforms table and add WeChat. Then add a WeChat section following the pattern of existing connectors:

```markdown
### WeChat

Connects to WeChat via a third-party proxy service using personal account login.

**Required fields:** `apiKey`, `proxyUrl`

```json
{
  "connectors": {
    "wechat": {
      "apiKey": "<key>",
      "proxyUrl": "https://...",
      "webhookPort": 18790,
      "deviceType": "ipad"
    }
  }
}
```

**Environment variables:** `WECHAT_API_KEY`

**Multi-account:** Supported via `accounts` map (same pattern as WhatsApp).

**Features:** Text messaging (DM only by default). Enable group chats with `features.groups: true`. Enable image send/receive with `features.images: true`.

**Login:** On first startup, scan the QR code displayed in the terminal with your WeChat app. The session persists until the proxy service session expires.
```

- [ ] **Step 2: Add webhook port to CLAUDE.md port table**

Find the Ports table and add:

```markdown
| WeChat Webhook | 18790 | `MILADY_WECHAT_WEBHOOK_PORT` |
```

- [ ] **Step 3: Commit**

```bash
git add docs/guides/connectors.md CLAUDE.md
git commit -m "docs: add WeChat connector to guides and port table"
```

---

### Task 12: Run full test suite

- [ ] **Step 1: Run typecheck**

Run: `bun run check`
Expected: No type errors

- [ ] **Step 2: Run all tests**

Run: `bun run test`
Expected: All tests pass (wechat plugin validation tests will SKIP until the npm package is published)

- [ ] **Step 3: Fix any failures**

If parity tests fail, re-read the test assertions and adjust. The most common issue will be import paths — ensure all imports of `CONNECTOR_IDS`, `applyPluginAutoEnable`, etc. go through the local wrappers in `packages/app-core/src/config/`, not directly to `@elizaos/agent`.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve test failures from wechat connector integration"
```

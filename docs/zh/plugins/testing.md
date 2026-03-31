---
title: "插件测试"
sidebarTitle: "测试"
description: "使用 Vitest 对 elizaOS 插件进行单元测试、集成测试和 E2E 测试的模式。"
---

本指南涵盖了 elizaOS 插件的测试模式——从单独测试操作和提供者的单元测试，到与运行时的集成测试，以及在插件中嵌入测试套件。

<div id="setup">

## 配置

</div>

插件使用 [Vitest](https://vitest.dev/) 作为测试运行器。将其添加到插件的开发依赖中：

```json
{
  "devDependencies": {
    "vitest": "^4.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

<div id="mock-runtime-factory">

## Mock 运行时工厂

</div>

大多数插件测试需要一个 mock 的 `IAgentRuntime`。创建一个共享的辅助函数：

```typescript
// tests/helpers.ts
import { vi } from 'vitest';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';

export function createMockRuntime(
  overrides?: Partial<IAgentRuntime>
): IAgentRuntime {
  return {
    agentId: 'test-agent-00000000-0000-0000-0000-000000000000',
    getSetting: vi.fn((key: string) => process.env[key]),
    getService: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    composeState: vi.fn().mockResolvedValue({} as State),
    ...overrides,
  } as unknown as IAgentRuntime;
}

export function createMockMessage(
  text: string,
  overrides?: Partial<Memory>
): Memory {
  return {
    id: 'msg-00000000-0000-0000-0000-000000000000',
    entityId: 'user-00000000-0000-0000-0000-000000000000',
    roomId: 'room-00000000-0000-0000-0000-000000000000',
    content: { text },
    createdAt: Date.now(),
    ...overrides,
  } as Memory;
}
```

---

<div id="unit-testing-actions">

## 操作的单元测试

</div>

独立测试 `validate` 和 `handler` 方法：

```typescript
// tests/actions/weather.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkWeatherAction } from '../../src/actions/weather';
import { createMockRuntime, createMockMessage } from '../helpers';

describe('checkWeatherAction', () => {
  let runtime: ReturnType<typeof createMockRuntime>;

  beforeEach(() => {
    runtime = createMockRuntime({
      getSetting: vi.fn((key) => {
        if (key === 'WEATHER_API_KEY') return 'test-key-123';
        return undefined;
      }),
    });
  });

  describe('validate', () => {
    it('returns true when API key is configured', async () => {
      const message = createMockMessage('What is the weather?');
      const result = await checkWeatherAction.validate(runtime, message);
      expect(result).toBe(true);
    });

    it('returns false when API key is missing', async () => {
      const noKeyRuntime = createMockRuntime();
      const message = createMockMessage('What is the weather?');
      const result = await checkWeatherAction.validate(noKeyRuntime, message);
      expect(result).toBe(false);
    });
  });

  describe('handler', () => {
    it('returns weather data on success', async () => {
      // Mock the fetch call
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ temp: 22, condition: 'Sunny' }),
      });

      const message = createMockMessage('Weather in Tokyo');
      const state = {} as any;
      const result = await checkWeatherAction.handler(
        runtime,
        message,
        state,
        { parameters: { city: 'Tokyo' } }
      );

      expect(result.success).toBe(true);
      expect(result.text).toContain('Tokyo');
    });

    it('returns error on API failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const message = createMockMessage('Weather in Tokyo');
      const state = {} as any;
      const result = await checkWeatherAction.handler(
        runtime,
        message,
        state,
        { parameters: { city: 'Tokyo' } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
```

---

<div id="unit-testing-providers">

## 提供者的单元测试

</div>

提供者返回上下文字符串。测试输出格式是否正确以及是否包含预期数据：

```typescript
// tests/providers/status.test.ts
import { describe, it, expect } from 'vitest';
import { pluginStatusProvider } from '../../src/providers/status';
import { createMockRuntime, createMockMessage } from '../helpers';

describe('pluginStatusProvider', () => {
  it('returns active status when API key is set', async () => {
    process.env.WEATHER_API_KEY = 'test-key';
    const runtime = createMockRuntime();
    const message = createMockMessage('hello');

    const result = await pluginStatusProvider.get(runtime, message);

    expect(result).toBeDefined();
    expect(typeof result.text).toBe('string');
    expect(result.text).toContain('active');

    delete process.env.WEATHER_API_KEY;
  });

  it('returns inactive status when API key is missing', async () => {
    delete process.env.WEATHER_API_KEY;
    const runtime = createMockRuntime();
    const message = createMockMessage('hello');

    const result = await pluginStatusProvider.get(runtime, message);

    expect(result.text).toContain('missing');
  });
});
```

---

<div id="unit-testing-services">

## 服务的单元测试

</div>

测试服务是否能正常启动和停止，且不会泄漏资源：

```typescript
// tests/services/weather-cache.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WeatherCacheService } from '../../src/services/weather-cache';
import { createMockRuntime } from '../helpers';

describe('WeatherCacheService', () => {
  let service: { stop: () => Promise<void> } | undefined;

  it('starts without errors', async () => {
    const runtime = createMockRuntime();
    service = await WeatherCacheService.start(runtime) as any;
    expect(service).toBeDefined();
    expect(service.stop).toBeTypeOf('function');
  });

  it('stops cleanly', async () => {
    const runtime = createMockRuntime();
    service = await WeatherCacheService.start(runtime) as any;
    await expect(service.stop()).resolves.toBeUndefined();
    service = undefined;
  });

  afterEach(async () => {
    if (service) await service.stop();
  });
});
```

---

<div id="integration-testing">

## 集成测试

</div>

对于需要完整运行时（数据库、内存、状态组合）的测试，请初始化一个测试运行时：

```typescript
// tests/integration/plugin.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IAgentRuntime } from '@elizaos/core';
import weatherPlugin from '../../src/index';

describe('weather plugin integration', () => {
  let runtime: IAgentRuntime;

  beforeAll(async () => {
    // If your test setup bootstraps a real runtime:
    // runtime = await createTestRuntime({ plugins: [weatherPlugin] });

    // Or use a mock with real state composition:
    runtime = {
      agentId: 'test-agent',
      getSetting: (key: string) => process.env[key],
      logger: console,
      // Add other methods your plugin needs
    } as unknown as IAgentRuntime;

    // Initialize the plugin
    if (weatherPlugin.init) {
      await weatherPlugin.init({}, runtime);
    }
  });

  it('registers all actions', () => {
    expect(weatherPlugin.actions).toHaveLength(1);
    expect(weatherPlugin.actions![0].name).toBe('CHECK_WEATHER');
  });

  it('registers all providers', () => {
    expect(weatherPlugin.providers).toHaveLength(1);
    expect(weatherPlugin.providers![0].name).toBe('weatherPluginStatus');
  });

  it('plugin init logs correctly', () => {
    // Verify init was called without errors
    expect(weatherPlugin.name).toBe('weather-plugin');
  });
});
```

---

<div id="mocking-patterns">

## Mocking 模式

</div>

<div id="mocking-llm-responses">

### Mock LLM 响应

</div>

当测试通过 `runtime.useModel` 调用 LLM 的操作时：

```typescript
const runtime = createMockRuntime({
  useModel: vi.fn().mockResolvedValue({
    text: 'The weather in Tokyo is 22°C and sunny.',
  }),
});
```

<div id="mocking-database-calls">

### Mock 数据库调用

</div>

```typescript
const runtime = createMockRuntime({
  getMemoryManager: vi.fn().mockReturnValue({
    searchMemories: vi.fn().mockResolvedValue([]),
    createMemory: vi.fn().mockResolvedValue(undefined),
  }),
});
```

<div id="mocking-external-apis">

### Mock 外部 API

</div>

在 `globalThis.fetch` 上使用 `vi.fn()` 或注入一个 mock HTTP 客户端：

```typescript
globalThis.fetch = vi.fn()
  .mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: 'first call' }),
  })
  .mockResolvedValueOnce({
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
  });
```

---

<div id="testsuite-embedded-plugin-tests">

## TestSuite：嵌入式插件测试

</div>

插件可以通过 `tests` 字段嵌入测试。当用户执行 `milady plugins test <name>` 时，这些测试会运行：

```typescript
import type { Plugin, TestSuite, Memory } from '@elizaos/core';
import { checkWeatherAction } from './actions/weather';

const weatherTests: TestSuite = {
  name: 'weather-plugin-tests',
  tests: [
    {
      name: 'action validates with API key',
      fn: async (runtime) => {
        const msg = { content: { text: 'weather' } } as Memory;
        const valid = await checkWeatherAction.validate(runtime, msg);
        if (!valid) throw new Error('Expected validation to pass');
      },
    },
    {
      name: 'provider returns context',
      fn: async (runtime) => {
        const msg = { content: { text: 'status' } } as Memory;
        const result = await pluginStatusProvider.get(runtime, msg);
        if (!result.text) throw new Error('Expected non-empty text');
      },
    },
  ],
};

const weatherPlugin: Plugin = {
  name: 'weather-plugin',
  description: 'Weather information plugin',
  actions: [checkWeatherAction],
  providers: [pluginStatusProvider],
  tests: [weatherTests],
};

export default weatherPlugin;
```

---

<div id="running-tests">

## 运行测试

</div>

```bash
# Run all tests
vitest run

# Run with coverage report
vitest run --coverage

# Run a specific test file
vitest run tests/actions/weather.test.ts

# Watch mode (re-runs on file changes)
vitest watch
```

<div id="coverage-thresholds">

### 覆盖率阈值

</div>

单体仓库在 `vitest.config.ts` 中强制执行最低覆盖率：

| 指标 | 最低要求 |
|--------|---------|
| 行覆盖率 | 25% |
| 函数覆盖率 | 25% |
| 语句覆盖率 | 25% |
| 分支覆盖率 | 15% |

对于独立发布的插件，建议达到 **80% 的覆盖率**——这是推荐的质量标准。

---

<div id="e2e-testing">

## E2E 测试

</div>

对于使用运行中的代理进行端到端测试，启动模板包含一个 Cypress 脚手架：

```
my-plugin/
├── cypress/
│   ├── e2e/
│   │   └── plugin.cy.ts
│   └── support/
│       └── commands.ts
└── cypress.config.ts
```

E2E 测试启动代理、加载插件，并通过聊天或 API 验证行为：

```typescript
// cypress/e2e/plugin.cy.ts
describe('Weather Plugin E2E', () => {
  it('responds to weather queries', () => {
    cy.request('POST', 'http://localhost:18789/api/chat', {
      message: 'What is the weather in London?',
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.text).to.include('London');
    });
  });
});
```

---

<div id="related">

## 相关内容

</div>

- [创建插件](/zh/plugins/create-a-plugin) — 从零开始构建插件
- [插件模式](/zh/plugins/patterns) — 常见实现模式
- [插件模式定义](/zh/plugins/schemas) — 完整类型参考
- [贡献指南](/zh/guides/contribution-guide) — 单体仓库的测试规范

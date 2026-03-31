---
title: "Pruebas de Plugins"
sidebarTitle: "Pruebas"
description: "Patrones de pruebas unitarias, de integración y E2E para plugins de elizaOS usando Vitest."
---

Esta guía cubre patrones de pruebas para plugins de elizaOS — desde pruebas unitarias de acciones y proveedores individuales hasta pruebas de integración con el runtime, e incorporación de suites de pruebas en tu plugin.

<div id="setup">

## Configuración

</div>

Los plugins usan [Vitest](https://vitest.dev/) como ejecutor de pruebas. Agrégalo a las dependencias de desarrollo de tu plugin:

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

## Fábrica de Runtime Mock

</div>

La mayoría de las pruebas de plugins necesitan un `IAgentRuntime` mock. Crea un helper compartido:

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

## Pruebas Unitarias de Acciones

</div>

Prueba los métodos `validate` y `handler` de forma independiente:

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

## Pruebas Unitarias de Proveedores

</div>

Los proveedores devuelven cadenas de contexto. Prueba que la salida esté bien formateada y contenga los datos esperados:

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

## Pruebas Unitarias de Servicios

</div>

Prueba que los servicios se inicien y detengan correctamente sin fugas de recursos:

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

## Pruebas de Integración

</div>

Para pruebas que necesitan el runtime completo (base de datos, memoria, composición de estado), inicializa un runtime de prueba:

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

## Patrones de Mocking

</div>

<div id="mocking-llm-responses">

### Mocking de Respuestas LLM

</div>

Al probar acciones que llaman al LLM a través de `runtime.useModel`:

```typescript
const runtime = createMockRuntime({
  useModel: vi.fn().mockResolvedValue({
    text: 'The weather in Tokyo is 22°C and sunny.',
  }),
});
```

<div id="mocking-database-calls">

### Mocking de Llamadas a Base de Datos

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

### Mocking de APIs Externas

</div>

Usa `vi.fn()` en `globalThis.fetch` o inyecta un cliente HTTP mock:

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

## TestSuite: Pruebas Embebidas de Plugin

</div>

Los plugins pueden incorporar pruebas a través del campo `tests`. Estas se ejecutan cuando los usuarios ejecutan `milady plugins test <name>`:

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

## Ejecutar Pruebas

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

### Umbrales de Cobertura

</div>

El monorepo impone una cobertura mínima en `vitest.config.ts`:

| Métrica | Mínimo |
|--------|---------|
| Líneas | 25% |
| Funciones | 25% |
| Sentencias | 25% |
| Ramas | 15% |

Para plugins publicados de forma independiente, apunta a un **80% de cobertura** — este es el nivel recomendado de calidad.

---

<div id="e2e-testing">

## Pruebas E2E

</div>

Para pruebas de extremo a extremo con un agente en ejecución, la plantilla de inicio incluye una estructura de Cypress:

```
my-plugin/
├── cypress/
│   ├── e2e/
│   │   └── plugin.cy.ts
│   └── support/
│       └── commands.ts
└── cypress.config.ts
```

Las pruebas E2E inician el agente, cargan el plugin y verifican el comportamiento a través del chat o la API:

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

## Relacionado

</div>

- [Crear un Plugin](/es/plugins/create-a-plugin) — Construye un plugin desde cero
- [Patrones de Plugin](/es/plugins/patterns) — Patrones de implementación comunes
- [Esquemas de Plugin](/es/plugins/schemas) — Referencia completa de tipos
- [Guía de Contribución](/es/guides/contribution-guide) — Convenciones de pruebas para el monorepo

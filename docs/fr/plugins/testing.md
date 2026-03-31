---
title: "Tester les Plugins"
sidebarTitle: "Tests"
description: "Patrons de tests unitaires, d'intégration et E2E pour les plugins elizaOS avec Vitest."
---

Ce guide couvre les patrons de tests pour les plugins elizaOS — des tests unitaires d'actions et de fournisseurs individuels aux tests d'intégration avec le runtime, en passant par l'intégration de suites de tests dans votre plugin.

<div id="setup">

## Configuration

</div>

Les plugins utilisent [Vitest](https://vitest.dev/) comme exécuteur de tests. Ajoutez-le aux dépendances de développement de votre plugin :

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

## Fabrique de Runtime Mock

</div>

La plupart des tests de plugins nécessitent un `IAgentRuntime` mock. Créez un helper partagé :

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

## Tests Unitaires des Actions

</div>

Testez les méthodes `validate` et `handler` de manière indépendante :

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

## Tests Unitaires des Fournisseurs

</div>

Les fournisseurs retournent des chaînes de contexte. Testez que la sortie est bien formatée et contient les données attendues :

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

## Tests Unitaires des Services

</div>

Testez que les services démarrent et s'arrêtent proprement sans fuite de ressources :

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

## Tests d'Intégration

</div>

Pour les tests qui nécessitent le runtime complet (base de données, mémoire, composition d'état), initialisez un runtime de test :

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

## Patrons de Mocking

</div>

<div id="mocking-llm-responses">

### Mocking des Réponses LLM

</div>

Lors du test d'actions qui appellent le LLM via `runtime.useModel` :

```typescript
const runtime = createMockRuntime({
  useModel: vi.fn().mockResolvedValue({
    text: 'The weather in Tokyo is 22°C and sunny.',
  }),
});
```

<div id="mocking-database-calls">

### Mocking des Appels à la Base de Données

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

### Mocking des APIs Externes

</div>

Utilisez `vi.fn()` sur `globalThis.fetch` ou injectez un client HTTP mock :

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

## TestSuite : Tests Embarqués de Plugin

</div>

Les plugins peuvent intégrer des tests via le champ `tests`. Ceux-ci s'exécutent lorsque les utilisateurs lancent `milady plugins test <name>` :

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

## Exécuter les Tests

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

### Seuils de Couverture

</div>

Le monorepo impose une couverture minimale dans `vitest.config.ts` :

| Métrique | Minimum |
|--------|---------|
| Lignes | 25% |
| Fonctions | 25% |
| Instructions | 25% |
| Branches | 15% |

Pour les plugins publiés de manière autonome, visez une **couverture de 80%** — c'est le niveau recommandé pour la qualité.

---

<div id="e2e-testing">

## Tests E2E

</div>

Pour les tests de bout en bout avec un agent en cours d'exécution, le modèle de démarrage inclut une structure Cypress :

```
my-plugin/
├── cypress/
│   ├── e2e/
│   │   └── plugin.cy.ts
│   └── support/
│       └── commands.ts
└── cypress.config.ts
```

Les tests E2E démarrent l'agent, chargent le plugin et vérifient le comportement via le chat ou l'API :

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

## Liens Connexes

</div>

- [Créer un Plugin](/fr/plugins/create-a-plugin) — Construire un plugin à partir de zéro
- [Patrons de Plugin](/fr/plugins/patterns) — Patrons d'implémentation courants
- [Schémas de Plugin](/fr/plugins/schemas) — Référence complète des types
- [Guide de Contribution](/fr/guides/contribution-guide) — Conventions de tests pour le monorepo

---
title: "Elegir el punto de extensión adecuado"
sidebarTitle: "Guía de decisión"
description: "Cuándo usar Actions, Providers, Services, Skills, Routes, Event Handlers o Evaluators"
---

elizaOS ofrece múltiples formas de extender el comportamiento del agente. Esta guía te ayuda a elegir la correcta.

<div id="quick-decision-tree">

## Árbol de decisión rápido

</div>

**"Quiero que mi agente HAGA algo cuando se le pida"** → [Action](#actions)

**"Quiero inyectar contexto en cada respuesta"** → [Provider](#providers)

**"Necesito un proceso en segundo plano ejecutándose"** → [Service](#services)

**"Quiero añadir conocimiento/instrucciones sin código"** → [Skill](#skills)

**"Necesito un endpoint HTTP"** → [Route](#routes)

**"Quiero reaccionar a eventos del sistema"** → [Event Handler](#event-handlers)

**"Quiero evaluar la calidad de las respuestas"** → [Evaluator](#evaluators)

---

<div id="comparison-table">

## Tabla comparativa

</div>

| Característica | Action | Provider | Service | Skill | Route |
|---------|--------|----------|---------|-------|-------|
| Activado por | Mensaje del usuario (el LLM selecciona) | Cada ciclo de inferencia | Inicialización del plugin | Mensaje del usuario (el LLM selecciona) | Solicitud HTTP |
| Devuelve | ActionResult | Context string | -- | Respuesta del agente | Respuesta HTTP |
| Tiene ciclo de vida | No | No | Sí (start/stop) | No | No |
| Requiere TypeScript | Sí | Sí | Sí | No (markdown) | Sí |
| Recarga en caliente | Rebuild + restart | Rebuild + restart | Rebuild + restart | Editar markdown + restart | Rebuild + restart |
| Se ejecuta en segundo plano | No | No | Sí | No | No |

---

<div id="actions">

## Actions

</div>

Úsalo cuando el agente deba **realizar una tarea** en respuesta a la entrada del usuario. El LLM selecciona acciones de las opciones registradas basándose en la descripción y los ejemplos.

```typescript
import type { Action } from '@elizaos/core';

const sendEmailAction: Action = {
  name: 'SEND_EMAIL',
  description: 'Send an email to a specified recipient',
  similes: ['EMAIL', 'MAIL', 'SEND_MESSAGE'],
  validate: async (runtime, message) => {
    return !!runtime.getSetting('SMTP_HOST');
  },
  handler: async (runtime, message, state) => {
    // Parse recipient and body from message, send email
    return { success: true, text: 'Email sent!' };
  },
};
```

**Ideal para:** Llamadas a API, mutaciones de datos, uso de herramientas, operaciones con archivos, integración con servicios externos

---

<div id="providers">

## Providers

</div>

Úsalo cuando necesites **inyectar información** en el contexto del agente antes de cada respuesta. Los Providers se ejecutan automáticamente en cada ciclo de inferencia.

```typescript
import type { Provider } from '@elizaos/core';

const timeProvider: Provider = {
  name: 'current-time',
  description: 'Provides current date and time',
  position: 'BEFORE_ACTIONS',
  get: async (runtime, message) => ({
    text: `Current time: ${new Date().toISOString()}`,
  }),
};
```

**Ideal para:** Datos en tiempo real, preferencias del usuario, estado del sistema, consultas a bases de datos, contexto del entorno

---

<div id="services">

## Services

</div>

Úsalo cuando necesites un **proceso en segundo plano de larga ejecución** con ciclo de vida de inicio y apagado.

```typescript
import { defineService } from '@elizaos/core';

const webhookService = defineService({
  serviceType: 'webhook-listener',
  description: 'Listens for incoming webhooks',
  start: async (runtime) => {
    // Start HTTP listener, WebSocket connection, etc.
  },
  stop: async () => {
    // Clean up connections and resources
  },
});
```

**Ideal para:** Conexiones WebSocket, polling, tareas cron, consumidores de colas, gestión de caché

---

<div id="skills">

## Skills

</div>

Úsalo cuando quieras **extender el comportamiento del agente con instrucciones** en lugar de código ejecutable. Los Skills están basados en markdown y no requieren TypeScript.

```markdown
---
name: git-helper
description: Help users with git commands and workflows
---

When asked about git, provide clear explanations and commands.
Always suggest safe operations first (status, log, diff before reset, force-push).
```

**Ideal para:** Conocimiento del dominio, flujos de trabajo, conjuntos de instrucciones, ingeniería de prompts, procedimientos de tareas

---

<div id="routes">

## Routes

</div>

Úsalo cuando necesites exponer **endpoints HTTP** desde tu plugin.

```typescript
import type { Route } from '@elizaos/core';

const healthRoute: Route = {
  type: 'GET',
  path: '/my-plugin/health',
  public: true,
  handler: async (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  },
};
```

**Ideal para:** Webhooks, páginas de estado, APIs de plugins, servicio de archivos, integraciones externas

---

<div id="event-handlers">

## Event Handlers

</div>

Úsalo cuando necesites **reaccionar a eventos del sistema** (mensajes, conexiones, acciones).

```typescript
import type { Plugin } from '@elizaos/core';

const analyticsPlugin: Plugin = {
  name: 'analytics',
  events: {
    MESSAGE_RECEIVED: [
      async (runtime, event) => {
        // Log message analytics
      },
    ],
    ACTION_STARTED: [
      async (runtime, event) => {
        // Track action usage
      },
    ],
  },
};
```

Eventos disponibles: `MESSAGE_RECEIVED`, `VOICE_MESSAGE_RECEIVED`, `WORLD_CONNECTED`, `WORLD_JOINED`, `ACTION_STARTED`, `ACTION_COMPLETED`

**Ideal para:** Registro, analítica, efectos secundarios, notificaciones, registros de auditoría

---

<div id="evaluators">

## Evaluators

</div>

Úsalo cuando necesites **evaluar la calidad de las respuestas** o desencadenar acciones de seguimiento después de que el agente responda.

```typescript
import type { Evaluator } from '@elizaos/core';

const sentimentEvaluator: Evaluator = {
  name: 'sentiment-check',
  description: 'Assess sentiment of agent responses',
  alwaysRun: true,
  validate: async (runtime, message) => true,
  handler: async (runtime, message) => {
    // Analyze response sentiment, log metrics, trigger alerts
  },
};
```

**Ideal para:** Monitoreo de calidad, verificaciones de cumplimiento, señales de aprendizaje, efectos secundarios post-respuesta

---

<div id="combining-extension-points">

## Combinación de puntos de extensión

</div>

Muchos plugins utilizan múltiples puntos de extensión juntos:

| Tipo de plugin | Combinación típica |
|-------------|-------------------|
| Integración de API | Action (llamadas a API) + Provider (contexto de estado) + Service (renovación de tokens) |
| Conector de plataforma | Service (ciclo de vida de conexión) + Event Handler (mensajes) + Route (webhooks) |
| Monitoreo | Evaluator (verificaciones de calidad) + Provider (contexto de métricas) + Route (panel de control) |
| Conocimiento | Provider (inyección de contexto) + Skill (instrucciones) |

---

<div id="related">

## Relacionado

</div>

- [Crear un Plugin](/es/plugins/create-a-plugin) -- Construye un plugin desde cero
- [Desarrollo de Plugins](/es/plugins/development) -- Referencia completa de la API para todos los puntos de extensión
- [Documentación de Skills](/es/plugins/skills) -- Profundización en skills
- [Patrones de Plugins](/es/plugins/patterns) -- Patrones de implementación comunes

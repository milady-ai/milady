---
title: Descripción general de los plugins
sidebarTitle: Descripción general
description: El sistema de plugins de Milady proporciona capacidades modulares — proveedores de modelos, conectores de plataformas, integraciones DeFi y características personalizadas.
---

Los plugins son el mecanismo principal de extensión para Milady. Cada capacidad más allá del runtime principal — desde proveedores de LLM hasta interacciones con blockchain — se entrega como un plugin.

<div id="what-is-a-plugin">

## ¿Qué es un Plugin?

</div>

Un plugin es un módulo autónomo que registra uno o más de los siguientes:

- **Actions** — Cosas que el agente puede hacer (por ejemplo, enviar un tweet, intercambiar tokens)
- **Providers** — Contexto inyectado en el prompt del agente (por ejemplo, saldo de la billetera, hora)
- **Evaluators** — Lógica de posprocesamiento que se ejecuta después de cada respuesta
- **Services** — Procesos en segundo plano de larga ejecución (por ejemplo, tareas cron, listeners de eventos)

<div id="plugin-categories">

## Categorías de Plugins

</div>

<CardGroup cols={2}>

<Card title="Plugins principales" icon="cube" href="/es/plugin-registry/knowledge">
  Plugins esenciales que se incluyen con cada instalación de Milady — knowledge, database, form, cron, shell, agent-skills, trajectory-logger y agent-orchestrator.
</Card>

<Card title="Proveedores de modelos" icon="brain" href="/es/plugin-registry/llm/openai">
  Integraciones de LLM para OpenAI, Anthropic, Google Gemini, Google Antigravity, Groq, Ollama, OpenRouter, DeepSeek, xAI, Mistral, Cohere, Together, Qwen, Minimax, Pi AI, Perplexity, Zai, Vercel AI Gateway y Eliza Cloud.
</Card>

<Card title="Conectores de plataformas" icon="plug" href="/es/plugin-registry/platform/discord">
  Puentes hacia más de 18 plataformas de mensajería mediante auto-habilitación (Discord, Telegram, Twitter, Slack, WhatsApp, Signal, iMessage, BlueBubbles, Blooio, MS Teams, Google Chat, Mattermost, Farcaster, Twitch, WeChat, Feishu, Matrix, Nostr). Conectores adicionales (Bluesky, Instagram, Lens, LINE, Zalo, Twilio, GitHub, Gmail Watch, Nextcloud Talk, Tlon) están disponibles en el registro de elizaOS.
</Card>

<Card title="DeFi y Blockchain" icon="wallet" href="/es/plugin-registry/defi/evm">
  Interacciones on-chain para cadenas EVM y Solana — transferencias de tokens, swaps y protocolos DeFi.
</Card>

<Card title="Plugins de características" icon="wand-magic-sparkles" href="/es/plugin-registry/browser">
  Capacidades extendidas — control del navegador, generación de imágenes, texto a voz, voz a texto, uso de computadora, programación cron, visión, shell, webhooks, generación de medios FAL, música Suno, diagnósticos OpenTelemetry, pagos x402, sincronización de bóvedas Obsidian, Gmail Watch, ajuste de personalidad, seguimiento de experiencia, habilidades de agente, banco de trabajo Claude Code, RepoPrompt y más.
</Card>

</CardGroup>

<div id="how-plugins-load">

## Cómo se cargan los Plugins

</div>

Los plugins se cargan durante la inicialización del runtime en este orden:

1. **Plugin de Milady** — El plugin puente (`createMiladyPlugin()`) que proporciona contexto del workspace, claves de sesión, emotes, acciones personalizadas y acciones de ciclo de vida. Siempre es el primero en el array de plugins.
2. **Plugins pre-registrados** — `@elizaos/plugin-sql` y `@elizaos/plugin-local-embedding` se pre-registran antes de `runtime.initialize()` para prevenir condiciones de carrera.
3. **Plugins principales** — Siempre se cargan: `sql`, `local-embedding`, `form`, `knowledge`, `trajectory-logger`, `agent-orchestrator`, `cron`, `shell`, `agent-skills` (ver `packages/agent/src/runtime/core-plugins.ts`). Plugins adicionales como `pdf`, `cua`, `browser`, `computeruse`, `obsidian`, `code`, `repoprompt`, `claude-code-workbench`, `vision`, `cli`, `edge-tts`, `elevenlabs`, `discord`, `telegram` y `twitch` son opcionales y se cargan cuando sus feature flags o variables de entorno están configuradas.
4. **Plugins auto-habilitados** — Los plugins de conectores, proveedores, características, streaming, suscripción, hooks (webhooks + Gmail Watch) y generación de medios se auto-habilitan según la configuración y variables de entorno (ver [Arquitectura](/es/plugins/architecture) para los mapas completos).
5. **Plugins expulsados** — Sobrecargas locales descubiertas desde `~/.milady/plugins/ejected/`. Cuando existe una copia expulsada, tiene prioridad sobre la versión publicada en npm.
6. **Plugins instalados por el usuario** — Registrados en `plugins.installs` en `milady.json`. Se recopilan antes de los plugins drop-in; cualquier nombre de plugin ya presente aquí tiene precedencia.
7. **Plugins personalizados/drop-in** — Escaneados desde `~/.milady/plugins/custom/` y cualquier ruta adicional en `plugins.load.paths`. Los plugins cuyos nombres ya existen en `plugins.installs` se omiten (regla de precedencia de `mergeDropInPlugins`).

```json
// milady.json plugin configuration
{
  "plugins": {
    "allow": ["@elizaos/plugin-openai", "discord"],
    "entries": {
      "openai": { "enabled": true }
    }
  },
  "connectors": {
    "discord": { "token": "..." }
  }
}
```

<div id="plugin-lifecycle">

## Ciclo de vida del Plugin

</div>

```
Install → Register → Initialize → Active → Shutdown
```

1. **Install** — El paquete del plugin se resuelve (npm o local)
2. **Register** — Las acciones, proveedores, evaluadores y servicios se registran con el runtime
3. **Initialize** — Se llama a `init()` con el contexto del runtime
4. **Active** — El plugin procesa eventos y proporciona capacidades
5. **Shutdown** — Se llama a `cleanup()` al detener el runtime

<div id="managing-plugins">

## Gestión de Plugins

</div>

<div id="install-from-registry">

### Instalar desde el Registro

</div>

```bash
milady plugins install @elizaos/plugin-openai
```

<div id="list-installed-plugins">

### Listar Plugins instalados

</div>

```bash
milady plugins list
```

<div id="enable-disable">

### Habilitar/Deshabilitar

</div>

```bash
milady plugins enable plugin-name
milady plugins disable plugin-name
```

<div id="eject-copy-to-local">

### Expulsar (Copiar a local)

</div>

```bash
milady plugins eject plugin-name
```

Consulta [Expulsar Plugin](/es/plugins/plugin-eject) para detalles sobre cómo personalizar plugins expulsados.

<div id="related">

## Relacionado

</div>

- [Arquitectura de Plugins](/es/plugins/architecture) — Análisis profundo del sistema de plugins
- [Crear un Plugin](/es/plugins/create-a-plugin) — Tutorial paso a paso
- [Desarrollo de Plugins](/es/plugins/development) — Guía de desarrollo y API
- [Registro de Plugins](/es/plugins/registry) — Explorar plugins disponibles

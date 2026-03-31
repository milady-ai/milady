---
title: Guía del Registro de Plugins
description: Cómo descubrir, configurar, enviar y mantener plugins en el registro de plugins de Milady/elizaOS.
---

# Guía del Registro de Plugins

El registro de plugins es el índice central de plugins disponibles de elizaOS. Esta guía cubre cómo descubrir, usar y enviar plugins al registro.

<div id="table-of-contents">

## Tabla de Contenidos

</div>

1. [¿Qué es el Registro?](#what-is-the-registry)
2. [Descubrir Plugins](#discovering-plugins)
3. [Usar Plugins](#using-plugins)
4. [Manifiesto de Plugin](#plugin-manifest)
5. [Enviar Plugins](#submitting-plugins)
6. [Categorías de Plugins](#plugin-categories)
7. [Convenciones de Nombres](#naming-conventions)

---

<div id="what-is-the-registry">

## ¿Qué es el Registro?

</div>

El registro de plugins es:

- **Un índice JSON** (`plugins.json`) que lista todos los plugins conocidos
- **Metadatos** incluyendo nombre, descripción, categoría y configuración
- **Sistema de descubrimiento** para encontrar y cargar plugins

Milady incluye un `plugins.json` integrado que contiene más de 90 plugins del ecosistema elizaOS.

---

<div id="discovering-plugins">

## Descubrir Plugins

</div>

<div id="list-available-plugins">

### Listar Plugins Disponibles

</div>

```bash
milady plugins list
```

<div id="search-plugins">

### Buscar Plugins

</div>

```bash
milady plugins list --search telegram
```

<div id="view-plugin-details">

### Ver Detalles del Plugin

</div>

```bash
milady plugins info telegram
```

<div id="browse-by-category">

### Explorar por Categoría

</div>

```bash
milady plugins list --category connector
milady plugins list --category model
milady plugins list --category tool
```

<div id="programmatic-access">

### Acceso Programático

</div>

```typescript
import pluginIndex from "miladyai/plugins.json";

// List all plugins
for (const plugin of pluginIndex.plugins) {
  console.log(`${plugin.id}: ${plugin.description}`);
}

// Find by category
const connectors = pluginIndex.plugins.filter(p => p.category === "connector");
```

---

<div id="using-plugins">

## Usar Plugins

</div>

<div id="install-via-npm">

### Instalar vía npm

</div>

La mayoría de los plugins son paquetes npm:

```bash
# Install the Telegram connector
bun add @elizaos/plugin-telegram
```

<div id="configure-in-miladyjson">

### Configurar en milady.json

</div>

```json
{
  "plugins": [
    "@elizaos/plugin-telegram",
    "@elizaos/plugin-discord",
    "@elizaos/plugin-openai"
  ]
}
```

<div id="environment-variables">

### Variables de Entorno

</div>

La mayoría de los plugins requieren configuración mediante variables de entorno:

```bash
# .env or environment
TELEGRAM_BOT_TOKEN=your-bot-token
DISCORD_BOT_TOKEN=your-discord-token
OPENAI_API_KEY=sk-...
```

<div id="auto-enable-based-on-credentials">

### Habilitación Automática Basada en Credenciales

</div>

Milady puede habilitar automáticamente plugins cuando sus credenciales requeridas están presentes:

```json
{
  "plugins": {
    "autoEnable": true
  }
}
```

Con `autoEnable`, si `TELEGRAM_BOT_TOKEN` está configurado, el plugin de Telegram se carga automáticamente.

---

<div id="plugin-manifest">

## Manifiesto de Plugin

</div>

Cada plugin en el registro tiene una entrada de manifiesto:

```json
{
  "id": "telegram",
  "dirName": "plugin-telegram",
  "name": "Telegram",
  "npmName": "@elizaos/plugin-telegram",
  "description": "Telegram bot connector for Eliza agents",
  "category": "connector",
  "envKey": "TELEGRAM_BOT_TOKEN",
  "configKeys": [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_USERNAME",
    "TELEGRAM_CHANNEL_IDS"
  ],
  "version": "2.0.0-alpha.4",
  "pluginDeps": [],
  "pluginParameters": {
    "TELEGRAM_BOT_TOKEN": {
      "type": "string",
      "description": "Telegram Bot API token from @BotFather",
      "required": true,
      "sensitive": true
    },
    "TELEGRAM_BOT_USERNAME": {
      "type": "string",
      "description": "Bot username (without @)",
      "required": false,
      "sensitive": false
    }
  }
}
```

<div id="manifest-fields">

### Campos del Manifiesto

</div>

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador corto (ej., `telegram`) |
| `dirName` | Nombre del directorio en el repositorio |
| `name` | Nombre legible para humanos |
| `npmName` | Nombre del paquete npm |
| `description` | Qué hace el plugin |
| `category` | Categoría del plugin |
| `envKey` | Variable de entorno principal |
| `configKeys` | Todas las claves de configuración |
| `version` | Versión actual |
| `pluginDeps` | Otros plugins de los que depende |
| `pluginParameters` | Definiciones detalladas de parámetros |

---

<div id="submitting-plugins">

## Enviar Plugins

</div>

<div id="option-1-official-plugins-elizaos">

### Opción 1: Plugins Oficiales (@elizaos)

</div>

Para que los plugins se incluyan en el espacio de nombres oficial `@elizaos`:

1. **Crea un PR** en la organización [elizaos-plugins](https://github.com/elizaos-plugins)
2. **Sigue las convenciones** (ver abajo)
3. **Incluye pruebas** y documentación
4. **Pasa la revisión** de los mantenedores

<div id="option-2-community-plugins">

### Opción 2: Plugins de la Comunidad

</div>

Publica en npm con nombres de la comunidad:

```json
{
  "name": "elizaos-plugin-my-feature",
  "version": "1.0.0"
}
```

O usa un paquete con alcance:

```json
{
  "name": "@yourorg/elizaos-plugin-my-feature"
}
```

<div id="option-3-local-registry">

### Opción 3: Registro Local

</div>

Para plugins privados/internos, mantén un registro local:

```json
// custom-plugins.json
{
  "$schema": "plugin-index-v1",
  "plugins": [
    {
      "id": "internal-crm",
      "npmName": "@internal/plugin-crm",
      "description": "Internal CRM integration",
      "category": "connector"
    }
  ]
}
```

---

<div id="plugin-categories">

## Categorías de Plugins

</div>

<div id="connector">

### connector

</div>

Integraciones de servicios externos y plataformas de mensajería.

| Plugin | Descripción |
|--------|-------------|
| `telegram` | Bot de Telegram |
| `discord` | Bot de Discord |
| `slack` | Integración de Slack |
| `twitter` | Twitter/X |
| `whatsapp` | WhatsApp (vía Baileys) |
| `signal` | Mensajero Signal |
| `imessage` | iMessage (macOS) |

<div id="model">

### model

</div>

Proveedores de modelos de IA e inferencia.

| Plugin | Descripción |
|--------|-------------|
| `openai` | Modelos GPT de OpenAI |
| `anthropic` | Modelos Claude |
| `ollama` | Modelos locales de Ollama |
| `groq` | Inferencia de Groq |
| `openrouter` | Puerta de enlace OpenRouter |
| `google-genai` | Google Gemini |

<div id="tool">

### tool

</div>

Utilidades y capacidades.

| Plugin | Descripción |
|--------|-------------|
| `browser` | Navegación web |
| `shell` | Ejecución de comandos de shell |
| `code` | Generación/ejecución de código |
| `repoprompt` | Orquestación CLI de RepoPrompt |
| `vision` | Análisis de imágenes |
| `knowledge` | RAG/base de conocimientos |
| `mcp` | Model Context Protocol |

<div id="memory">

### memory

</div>

Sistemas de almacenamiento y memoria.

| Plugin | Descripción |
|--------|-------------|
| `sql` | Adaptador de base de datos SQL |
| `local-embedding` | Generación local de embeddings |

<div id="automation">

### automation

</div>

Programación y automatización.

| Plugin | Descripción |
|--------|-------------|
| `cron` | Tareas programadas |
| `scheduling` | Integración de calendario |

---

<div id="naming-conventions">

## Convenciones de Nombres

</div>

<div id="package-names">

### Nombres de Paquetes

</div>

**Plugins oficiales:**
```
@elizaos/plugin-{feature}
```

Ejemplos:
- `@elizaos/plugin-telegram`
- `@elizaos/plugin-openai`
- `@elizaos/plugin-browser`

**Plugins de la comunidad:**
```
elizaos-plugin-{feature}
@yourorg/plugin-{feature}
```

Ejemplos:
- `elizaos-plugin-my-integration`
- `@acme/plugin-internal-tool`

<div id="plugin-ids">

### IDs de Plugin

</div>

Identificadores cortos en minúsculas:

```
telegram
discord
openai
my-feature
```

<div id="action-names">

### Nombres de Acciones

</div>

MAYÚSCULAS_CON_GUIONES_BAJOS:

```
SEND_MESSAGE
GENERATE_IMAGE
FETCH_DATA
```

---

<div id="plugin-configuration-schema">

## Esquema de Configuración de Plugin

</div>

Los plugins pueden definir su esquema de configuración para la generación de UI:

```json
{
  "pluginParameters": {
    "API_KEY": {
      "type": "string",
      "description": "API key for authentication",
      "required": true,
      "sensitive": true
    },
    "ENDPOINT_URL": {
      "type": "string",
      "description": "API endpoint URL",
      "required": false,
      "sensitive": false
    },
    "TIMEOUT_MS": {
      "type": "number",
      "description": "Request timeout in milliseconds",
      "required": false,
      "sensitive": false
    },
    "DEBUG_MODE": {
      "type": "boolean",
      "description": "Enable debug logging",
      "required": false,
      "sensitive": false
    }
  }
}
```

<div id="parameter-types">

### Tipos de Parámetros

</div>

| Tipo | Descripción |
|------|-------------|
| `string` | Valor de texto |
| `number` | Valor numérico |
| `boolean` | Verdadero/falso |

<div id="parameter-flags">

### Indicadores de Parámetros

</div>

| Indicador | Descripción |
|-----------|-------------|
| `required` | Debe ser proporcionado |
| `sensitive` | Debe ocultarse en la UI (contraseñas, tokens) |

---

<div id="regenerating-the-registry">

## Regenerar el Registro

</div>

Si mantienes un fork o un registro personalizado:

```bash
# Generate plugins.json from installed plugins
pnpm generate:plugins
```

Esto escanea `node_modules/@elizaos/plugin-*` y genera un índice actualizado.

---

<div id="examples">

## Ejemplos

</div>

<div id="finding-a-model-provider">

### Encontrar un Proveedor de Modelos

</div>

```bash
# List model plugins
milady plugins list --category model

# Check OpenAI plugin info
milady plugins info openai

# Install and configure
pnpm add @elizaos/plugin-openai
echo "OPENAI_API_KEY=sk-..." >> .env
```

<div id="adding-multiple-connectors">

### Agregar Múltiples Conectores

</div>

```json
// milady.json
{
  "plugins": [
    "@elizaos/plugin-telegram",
    "@elizaos/plugin-discord",
    "@elizaos/plugin-slack"
  ]
}
```

```bash
# .env
TELEGRAM_BOT_TOKEN=...
DISCORD_BOT_TOKEN=...
SLACK_BOT_TOKEN=...
```

<div id="using-community-plugins">

### Usar Plugins de la Comunidad

</div>

```bash
# Install community plugin
pnpm add elizaos-plugin-custom-feature

# Add to config
# milady.json
{
  "plugins": [
    "@elizaos/plugin-openai",
    "elizaos-plugin-custom-feature"
  ]
}
```

---

<div id="next-steps">

## Próximos Pasos

</div>

- [Guía de Desarrollo de Plugins](/es/plugins/development) — Crea tus propios plugins
- [Desarrollo Local de Plugins](/es/plugins/local-plugins) — Desarrolla sin publicar
- [Guía de Contribución](./contributing.md) — Envía plugins upstream

---

<div id="registry-runbook">

## Manual de Operaciones del Registro

</div>

<div id="setup-checklist">

### Lista de Verificación de Configuración

</div>

1. Asegúrate de que los metadatos del plugin existan y sean válidos en `plugins.json`.
2. Asegúrate de que los paquetes instalables se resuelvan desde npm o tu registro interno.
3. Asegúrate de que las claves de entorno requeridas para cada plugin estén documentadas en el manifiesto.
4. Para operaciones de registro on-chain, configura `EVM_PRIVATE_KEY` y establece `mainnetRpc`, `registryAddress` y `collectionAddress` en la configuración del agente.
5. Verifica que el directorio de instalación de plugins sea escribible: `ls -ld ~/.milady/plugins/installed/`.

<div id="failure-modes">

### Modos de Fallo

</div>

**Búsqueda en el registro de plugins:**

- La búsqueda en el registro no devuelve resultados:
  Confirma que `plugins.json` esté actualizado y que los IDs de los plugins estén escritos correctamente.
- La instalación tiene éxito pero el plugin no se carga:
  Confirma que las claves de entorno requeridas estén configuradas y que el plugin esté habilitado en `plugins.allow` o `plugins.entries`.
- Desfase de versión entre el manifiesto y el paquete:
  Regenera los metadatos del registro y confirma el manifiesto actualizado.

**Resolución e instalación de NPM:**

- `npm pack` o `bun install` falla durante la instalación del plugin:
  Verifica la conectividad de red al registro npm. El instalador recurre a una clonación directa de git si npm falla — si ambos fallan, la especificación del paquete probablemente sea inválida.
- Punto de entrada no encontrado después de la instalación:
  El instalador busca `package.json` en el directorio destino. Confirma que el paquete tenga un campo `main` o `module` válido, o que `index.js`/`index.ts` exista en la raíz del paquete.
- Corrupción por instalación concurrente:
  El instalador usa un bloqueo de serialización. Si una instalación anterior falló, el estado de bloqueo obsoleto puede bloquear nuevas instalaciones. Reinicia el agente para limpiar los bloqueos en memoria.

**Operaciones de registro/drop on-chain:**

- La transacción se revierte o expira:
  Verifica que `EVM_PRIVATE_KEY` tenga saldo de gas suficiente. Confirma que `mainnetRpc` sea accesible y no esté limitado por tasa. El servicio de tx reintenta con gas escalado — si todos los reintentos fallan, el error incluye la razón de reversión.
- La llamada al contrato del registro devuelve datos vacíos:
  Confirma que `registryAddress` y `collectionAddress` apunten a contratos desplegados en la cadena correcta. Usa un explorador de bloques para verificar el estado del contrato.
- Conflicto de nonce en transacciones secuenciales rápidas:
  El servicio de tx gestiona el nonce localmente. Si una transacción de billetera externa cambia el nonce, reinicia el agente para resincronizar.

<div id="recovery-procedures">

### Procedimientos de Recuperación

</div>

1. **Estado obsoleto del plugin:** Elimina `~/.milady/plugins/installed/<plugin-name>/` y remueve la entrada de `milady.json` bajo `plugins.installs`, luego reinstala.
2. **Metadatos del registro desincronizados:** Ejecuta `milady plugin sync` o actualiza manualmente `plugins.json` desde el registro upstream.
3. **Transacción on-chain atascada:** Verifica la transacción pendiente en un explorador de bloques. Si está atascada, el agente reintentará con más gas en el próximo intento. Acelerar manualmente vía billetera es seguro — el agente relee el nonce en la próxima llamada.

<div id="verification-commands">

### Comandos de Verificación

</div>

```bash
# Plugin registry and installer tests
bunx vitest run src/services/plugin-installer.test.ts src/services/skill-marketplace.test.ts src/services/mcp-marketplace.test.ts

# Plugin install e2e lifecycle
bunx vitest run --config vitest.e2e.config.ts test/plugin-install.e2e.test.ts test/skills-marketplace-api.e2e.test.ts test/skills-marketplace-services.e2e.test.ts

# On-chain service tests
bunx vitest run src/api/tx-service.test.ts src/api/registry-service.test.ts src/api/drop-service.test.ts

# API server e2e (includes registry routes)
bunx vitest run --config vitest.e2e.config.ts test/api-server.e2e.test.ts

bun run typecheck
```

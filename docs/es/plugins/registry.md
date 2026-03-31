---
title: "Registro de Plugins"
sidebarTitle: "Registro"
description: "Cómo Milady descubre, almacena en caché y resuelve plugins desde el registro remoto."
---

El registro de plugins es el sistema que descubre, almacena en caché y resuelve plugins y aplicaciones para los agentes de Milady. Combina un índice local incluido con un registro remoto alojado en GitHub, utilizando una caché de 3 niveles para funcionar sin conexión, en paquetes de aplicaciones de escritorio y en desarrollo.

<div id="table-of-contents">

## Tabla de Contenidos

</div>

1. [¿Qué es el Registro?](#what-is-the-registry)
2. [Caché de 3 Niveles](#3-tier-caching)
3. [Registro Remoto](#remote-registry)
4. [Resolución de Plugins](#plugin-resolution)
5. [Comandos CLI](#cli-commands)
6. [Campos del Manifiesto de Plugin](#plugin-manifest-fields)
7. [Registro de Apps](#apps-registry)
8. [Acceso Programático](#programmatic-access)

---

<div id="what-is-the-registry">

## ¿Qué es el Registro?

</div>

El registro tiene dos capas:

<div id="bundled-registry-pluginsjson">

### Registro Incluido (`plugins.json`)

</div>

Un archivo JSON local incluido con Milady que contiene metadatos de ~97 plugins del ecosistema elizaOS. Cada entrada incluye el id del plugin, nombre del paquete npm, categoría, variables de entorno, versión, dependencias y definiciones detalladas de parámetros. Este archivo sigue el esquema `plugin-index-v1`.

```json
{
  "$schema": "plugin-index-v1",
  "generatedAt": "2026-02-09T20:23:38.561Z",
  "count": 97,
  "plugins": [
    {
      "id": "telegram",
      "dirName": "plugin-telegram",
      "name": "Telegram",
      "npmName": "@elizaos/plugin-telegram",
      "description": "Telegram bot connector for Eliza agents",
      "category": "connector",
      "envKey": "TELEGRAM_BOT_TOKEN",
      "configKeys": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME"],
      "version": "2.0.0-alpha.4",
      "pluginDeps": [],
      "pluginParameters": { ... }
    }
  ]
}
```

El `plugins.json` incluido es utilizado por el comando `milady plugins config` para buscar definiciones de parámetros, claves de entorno y sugerencias de interfaz para la configuración de plugins.

<div id="remote-registry-github">

### Registro Remoto (GitHub)

</div>

El registro remoto está alojado en el repositorio de GitHub `elizaos-plugins/registry` en la rama `next`. El cliente del registro obtiene datos de dos endpoints remotos:

| Endpoint | URL | Formato |
|----------|-----|---------|
| **Primario** | `https://raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json` | JSON enriquecido con información de git, versiones npm, estrellas, temas, metadatos de apps |
| **Alternativo** | `https://raw.githubusercontent.com/elizaos-plugins/registry/next/index.json` | Mapeo mínimo de nombre a referencia git |

El `generated-registry.json` primario contiene un objeto `registry` indexado por nombre de paquete, donde cada entrada proporciona:

- Repositorio Git, ramas para v0/v1/v2
- Nombre del paquete npm y cadenas de versión para v0/v1/v2
- Indicadores de soporte de versión (`supports: { v0, v1, v2 }`)
- Descripción, página principal, temas, cantidad de estrellas, lenguaje
- Metadatos de app (para entradas con `kind: "app"`)

Si el endpoint primario falla, el cliente recurre a `index.json`, que es un `Record<string, string>` plano que mapea nombres de paquetes a referencias `github:owner/repo`. Este respaldo proporciona solo las coordenadas de git sin metadatos enriquecidos.

---

<div id="3-tier-caching">

## Caché de 3 Niveles

</div>

El cliente del registro (`src/services/registry-client.ts`) utiliza una estrategia de resolución de 3 niveles para minimizar las solicitudes de red y soportar operación sin conexión:

```
Memory Cache  -->  File Cache  -->  Network Fetch
  (in-process)     (~/.milady/     (GitHub raw)
                    cache/
                    registry.json)
```

<div id="tier-1-memory-cache">

### Nivel 1: Caché en Memoria

</div>

Un `Map<string, RegistryPluginInfo>` en proceso mantenido en el estado a nivel de módulo. Se verifica primero en cada llamada a `getRegistryPlugins()`. Se invalida después de que expire el TTL.

<div id="tier-2-file-cache">

### Nivel 2: Caché en Archivo

</div>

Un archivo JSON en `~/.milady/cache/registry.json` que contiene el mapa de plugins serializado y una marca de tiempo `fetchedAt`. Se verifica cuando la caché en memoria está vacía o expirada. Se escribe de forma asíncrona después de cada obtención exitosa de la red.

La caché en archivo almacena entradas como `{ fetchedAt: number, plugins: Array<[string, RegistryPluginInfo]> }` y se invalida cuando el TTL expira.

<div id="tier-3-network-fetch">

### Nivel 3: Obtención de Red

</div>

Obtiene `generated-registry.json` desde GitHub (con respaldo a `index.json`). Solo se alcanza cuando tanto la caché en memoria como la de archivo están vacías o expiradas.

<div id="cache-ttl">

### TTL de Caché

</div>

Todos los niveles comparten un TTL de 1 hora (`3_600_000` ms). Después de la expiración, la siguiente llamada a `getRegistryPlugins()` recorre los niveles en cascada hasta obtener datos frescos.

<div id="force-refresh">

### Actualización Forzada

</div>

Llama a `refreshRegistry()` para limpiar tanto la caché en memoria como la de archivo, y luego obtener datos de la red:

```typescript
import { refreshRegistry } from "milady/services/registry-client";

const plugins = await refreshRegistry();
```

O desde la CLI:

```bash
milady plugins refresh
```

---

<div id="plugin-resolution">

## Resolución de Plugins

</div>

Al buscar un plugin por nombre mediante `getPluginInfo(name)`, el cliente del registro prueba tres estrategias en orden:

1. **Coincidencia exacta** -- busca el nombre directamente en el mapa del registro (ej., `@elizaos/plugin-telegram`)
2. **Prefijo @elizaos/** -- si el nombre no comienza con `@`, antepone `@elizaos/` e intenta de nuevo (ej., `plugin-telegram` se convierte en `@elizaos/plugin-telegram`)
3. **Escaneo de sufijo simple** -- elimina cualquier prefijo de scope de la entrada y escanea todas las claves del registro buscando una que termine con `/<bare-name>` (ej., `plugin-telegram` coincide con `@elizaos/plugin-telegram`)

La CLI también normaliza la entrada del usuario mediante `normalizePluginName()`:

- `@scope/plugin-x` -- se usa tal cual
- `plugin-x` -- se usa tal cual
- `x` -- se expande a `@elizaos/plugin-x`

Se admite la fijación de versión con el separador `@`:

```bash
milady plugins install twitter@1.2.3
milady plugins install @custom/plugin-x@2.0.0
milady plugins install twitter@next    # dist-tags work too
```

---

<div id="cli-commands">

## Comandos CLI

</div>

Todos los comandos de plugins están bajo `milady plugins`. Ejecuta `milady plugins --help` para la lista completa.

<div id="milady-plugins-list">

### `milady plugins list`

</div>

Lista todos los plugins del registro remoto.

```bash
# List all plugins (default limit: 30)
milady plugins list

# Search by keyword
milady plugins list -q telegram

# Increase the result limit
milady plugins list --limit 100
```

<div id="milady-plugins-search-query">

### `milady plugins search <query>`

</div>

Busca en el registro por palabra clave con puntuación de relevancia.

```bash
milady plugins search "discord bot"
milady plugins search openai --limit 5
```

Los resultados muestran un porcentaje de coincidencia basado en la puntuación entre nombre, descripción y temas.

<div id="milady-plugins-info-name">

### `milady plugins info <name>`

</div>

Muestra información detallada sobre un plugin específico: repositorio, página principal, lenguaje, estrellas, temas, versiones npm y versiones de elizaOS soportadas.

```bash
milady plugins info telegram
milady plugins info @elizaos/plugin-openai
```

<div id="milady-plugins-install-name">

### `milady plugins install <name>`

</div>

Instala un plugin desde el registro en `~/.milady/plugins/installed/<name>/`.

```bash
# Install by shorthand (expands to @elizaos/plugin-telegram)
milady plugins install telegram

# Install a specific version
milady plugins install telegram@1.2.3

# Install without restarting the agent
milady plugins install telegram --no-restart
```

El instalador usa npm/bun para instalar en un directorio de prefijo aislado. Si eso falla, recurre a clonar el repositorio de GitHub del plugin. La instalación se registra en `milady.json`.

<div id="milady-plugins-uninstall-name">

### `milady plugins uninstall <name>`

</div>

Elimina un plugin instalado por el usuario.

```bash
milady plugins uninstall @elizaos/plugin-telegram
milady plugins uninstall telegram --no-restart
```

<div id="milady-plugins-installed">

### `milady plugins installed`

</div>

Lista todos los plugins que fueron instalados desde el registro (no los incluidos).

```bash
milady plugins installed
```

<div id="milady-plugins-refresh">

### `milady plugins refresh`

</div>

Fuerza la actualización de la caché del registro (limpia la caché en memoria + archivo, obtiene datos de GitHub).

```bash
milady plugins refresh
```

<div id="milady-plugins-config-name">

### `milady plugins config <name>`

</div>

Muestra o edita interactivamente los parámetros de configuración de un plugin.

```bash
# View current config values
milady plugins config telegram

# Interactive edit mode
milady plugins config telegram --edit
```

En modo de edición, la CLI recorre cada parámetro, mostrando los valores actuales (ocultando los sensibles) y solicitando nuevos valores. Los cambios se guardan en `milady.json`.

<div id="milady-plugins-test">

### `milady plugins test`

</div>

Valida plugins personalizados en `~/.milady/plugins/custom/`. Verifica que cada directorio de plugin tenga un punto de entrada válido y exporte un objeto Plugin con `name` y `description`.

```bash
milady plugins test
```

<div id="milady-plugins-add-path-path">

### `milady plugins add-path <path>`

</div>

Registra un directorio adicional de búsqueda de plugins en el archivo de configuración.

```bash
milady plugins add-path ~/my-plugins
```

<div id="milady-plugins-paths">

### `milady plugins paths`

</div>

Lista todos los directorios de búsqueda de plugins y su contenido.

```bash
milady plugins paths
```

<div id="milady-plugins-open-name-or-path">

### `milady plugins open [name-or-path]`

</div>

Abre un directorio de plugin (o la carpeta de plugins personalizados) en tu editor.

```bash
# Open the custom plugins folder
milady plugins open

# Open a specific custom plugin
milady plugins open my-plugin
```

---

<div id="plugin-manifest-fields">

## Campos del Manifiesto de Plugin

</div>

<div id="bundled-registry-fields-pluginsjson">

### Campos del Registro Incluido (`plugins.json`)

</div>

Cada entrada en el `plugins.json` incluido usa este esquema:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | Identificador corto (ej., `telegram`, `openai`) |
| `dirName` | `string` | Nombre del directorio en el repositorio fuente (ej., `plugin-telegram`) |
| `name` | `string` | Nombre legible para mostrar |
| `npmName` | `string` | Nombre completo del paquete npm (ej., `@elizaos/plugin-telegram`) |
| `description` | `string` | Qué hace el plugin |
| `category` | `string` | Categoría del plugin: `connector`, `model`, `tool`, `memory`, `automation` |
| `envKey` | `string` | Variable de entorno principal que activa este plugin |
| `configKeys` | `string[]` | Todas las variables de entorno que lee este plugin |
| `version` | `string` | Versión publicada actual |
| `pluginDeps` | `string[]` | IDs de otros plugins de los que depende |
| `pluginParameters` | `object` | Definiciones detalladas de parámetros (ver abajo) |

<div id="parameter-definitions">

### Definiciones de Parámetros

</div>

Cada clave en `pluginParameters` mapea a:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `type` | `"string" \| "number" \| "boolean"` | Tipo de valor |
| `description` | `string` | Texto de ayuda legible |
| `required` | `boolean` | Si el parámetro debe estar configurado |
| `sensitive` | `boolean` | Si se debe ocultar el valor en la interfaz (tokens, contraseñas) |

<div id="remote-registry-fields-generated-registryjson">

### Campos del Registro Remoto (`generated-registry.json`)

</div>

Las entradas en el registro remoto enriquecido usan una estructura diferente:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `git.repo` | `string` | Ruta `owner/repo` de GitHub |
| `git.v0` / `v1` / `v2` | `{ branch: string \| null }` | Rama de Git para cada versión de elizaOS |
| `npm.repo` | `string` | Nombre del paquete npm |
| `npm.v0` / `v1` / `v2` | `string \| null` | Versión npm publicada por versión de elizaOS |
| `supports` | `{ v0, v1, v2: boolean }` | Qué versiones de elizaOS son soportadas |
| `description` | `string` | Descripción del plugin |
| `homepage` | `string \| null` | URL de la página principal |
| `topics` | `string[]` | Temas / etiquetas de GitHub |
| `stargazers_count` | `number` | Cantidad de estrellas en GitHub |
| `language` | `string` | Lenguaje principal (generalmente `TypeScript`) |
| `kind` | `"app" \| undefined` | Se establece como `"app"` para aplicaciones ejecutables |
| `app` | `object \| undefined` | Metadatos de la app (ver Registro de Apps abajo) |

---

<div id="apps-registry">

## Registro de Apps

</div>

El registro tiene soporte de primera clase para **apps** -- aplicaciones ejecutables que son distintas de los plugins estándar. Una entrada se trata como app cuando:

- Su campo `kind` es `"app"`, o
- Tiene un objeto `appMeta` / `app`, o
- Coincide con una anulación local de app codificada (ej., `@elizaos/app-babylon`)

<div id="app-metadata-fields">

### Campos de Metadatos de App

</div>

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `displayName` | `string` | Nombre mostrado en la interfaz |
| `category` | `string` | Categoría de la app (ej., `game`) |
| `launchType` | `string` | Cómo se lanza la app: `url`, `connect`, `local` |
| `launchUrl` | `string \| null` | URL para lanzar o conectar |
| `icon` | `string \| null` | URL del icono |
| `capabilities` | `string[]` | Capacidades de la app |
| `minPlayers` / `maxPlayers` | `number \| null` | Límites de cantidad de jugadores (para apps de juegos) |
| `viewer` | `object` | Configuración de incrustación: `url`, `embedParams`, `postMessageAuth`, `sandbox` |

<div id="app-specific-functions">

### Funciones Específicas de Apps

</div>

```typescript
import { listApps, getAppInfo, searchApps } from "milady/services/registry-client";

// List all registered apps, sorted by stars
const apps = await listApps();

// Look up a specific app
const app = await getAppInfo("@elizaos/app-babylon");

// Search apps by query (scores against displayName and capabilities too)
const results = await searchApps("game", 10);
```

<div id="local-workspace-app-discovery">

### Descubrimiento de Apps en Espacio de Trabajo Local

</div>

El cliente del registro también descubre apps desde directorios locales del espacio de trabajo. Escanea:

1. Directorios `plugins/` en las raíces del espacio de trabajo buscando carpetas que comiencen con `app-`
2. Plugins instalados por el usuario en `~/.milady/plugins/installed/` con `kind: "app"` en su package.json

Los metadatos de apps locales se fusionan con los datos del registro remoto, con los valores locales teniendo prioridad para campos como `description`, `homepage` y `localPath`.

---

<div id="programmatic-access">

## Acceso Programático

</div>

<div id="core-functions">

### Funciones Principales

</div>

El cliente del registro exporta estas funciones desde `src/services/registry-client.ts`:

```typescript
import {
  getRegistryPlugins,  // Get all plugins (3-tier cached)
  refreshRegistry,     // Force network refresh
  getPluginInfo,       // Look up a single plugin by name
  searchPlugins,       // Fuzzy search plugins
  listApps,            // List all app-kind entries
  getAppInfo,          // Look up a single app
  searchApps,          // Search apps
  listNonAppPlugins,   // List plugins excluding apps
  searchNonAppPlugins, // Search plugins excluding apps
} from "milady/services/registry-client";
```

<div id="usage-example">

### Ejemplo de Uso

</div>

```typescript
// Fetch the full registry (cached)
const registry = await getRegistryPlugins();
console.log(`${registry.size} plugins loaded`);

// Look up a plugin (tries exact, @elizaos/ prefix, bare suffix)
const info = await getPluginInfo("telegram");
if (info) {
  console.log(info.name);       // "@elizaos/plugin-telegram"
  console.log(info.gitRepo);    // "elizaos-plugins/plugin-telegram"
  console.log(info.npm.v2Version); // "2.0.0-alpha.4"
}

// Search with relevance scoring
const results = await searchPlugins("discord", 10);
for (const r of results) {
  console.log(`${r.name} (${(r.score * 100).toFixed(0)}% match)`);
}
```

<div id="rest-api">

### API REST

</div>

Cuando el servidor del agente está en ejecución, el registro también está disponible vía HTTP:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/registry/plugins` | Lista todos los plugins con estado de instalado/cargado/incluido |
| `GET` | `/api/registry/plugins/:name` | Busca un plugin específico |
| `GET` | `/api/registry/search?q=<query>&limit=<n>` | Busca plugins por palabra clave |
| `POST` | `/api/registry/refresh` | Fuerza la actualización de la caché del registro |

<div id="search-scoring">

### Puntuación de Búsqueda

</div>

El algoritmo de búsqueda puntúa las entradas comparando la consulta contra:

- **Nombre del plugin** (coincidencia exacta: +100, parcial: +50)
- **Descripción** (contiene la consulta: +30)
- **Temas / etiquetas** (contiene la consulta: +25)
- **Términos individuales de la consulta** (separados por espacios, puntuados por separado: +8 a +15 cada uno)
- **Bonificaciones por estrellas** (>100: +3, >500: +3, >1000: +4)

Los resultados se ordenan por puntuación descendente, luego por cantidad de estrellas como desempate.

---

---

<div id="plugin-ecosystem">

## Ecosistema de Plugins

</div>

<div id="organization-structure">

### Estructura de la Organización

</div>

Los plugins oficiales de elizaOS se encuentran en la organización de GitHub [`elizaos-plugins`](https://github.com/elizaos-plugins). El registro indexa plugins de esta organización automáticamente.

| Repositorio | Contenido |
|-------------|-----------|
| `elizaos-plugins/registry` | Índice del registro (`index.json`, `generated-registry.json`), sitio del registro |
| `elizaos-plugins/plugin-*` | Paquetes individuales de plugins oficiales |

<div id="naming-conventions">

### Convenciones de Nomenclatura

</div>

Sigue estos patrones de nomenclatura para facilitar el descubrimiento:

| Alcance | Patrón | Ejemplo |
|---------|--------|---------|
| Oficial | `@elizaos/plugin-<name>` | `@elizaos/plugin-telegram` |
| Organización | `@yourorg/plugin-<name>` | `@acme/plugin-crm` |
| Comunidad | `elizaos-plugin-<name>` | `elizaos-plugin-weather` |

El prefijo `plugin-` es requerido para el descubrimiento automático. El escáner del registro reconoce los tres patrones.

<div id="submitting-a-plugin-to-the-registry">

### Enviar un Plugin al Registro

</div>

1. **Publicar en npm** — Sigue la [Guía de Publicación](/es/plugins/publish)
2. **Abrir un PR** en [`elizaos-plugins/registry`](https://github.com/elizaos-plugins/registry) agregando tu plugin a `index.json`:

```json
{
  "@yourorg/plugin-weather": "github:yourorg/plugin-weather"
}
```

3. **Incluir en tu PR:**
   - Nombre del plugin, descripción y categoría
   - Un manifiesto `elizaos.plugin.json` funcional en tu paquete
   - Al menos un conjunto de pruebas que pase
   - README con instrucciones de configuración

4. **El CI del registro** valida que tu plugin compila, carga y pasa las pruebas
5. Una vez fusionado, tu plugin aparece en `milady plugins search` y en el sitio del registro

<div id="registry-site">

### Sitio del Registro

</div>

El registro tiene una interfaz web navegable alojada en `registry/site/`. Los usuarios pueden:
- Explorar plugins por categoría (Core, Proveedores de Modelos, Conectores, DeFi, Características)
- Buscar por nombre, descripción o etiquetas
- Ver detalles del plugin, comandos de instalación y configuración

---

<div id="next-steps">

## Próximos Pasos

</div>

- [Guía de Desarrollo de Plugins](/es/plugins/development) -- Crea tus propios plugins
- [Desarrollo Local de Plugins](/es/plugins/local-plugins) -- Desarrolla sin publicar
- [Guía de Publicación](/es/plugins/publish) -- Publica en npm y el registro
- [Guía de Contribución](/es/guides/contribution-guide) -- Envía plugins upstream

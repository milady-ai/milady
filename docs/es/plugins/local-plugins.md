---
title: "Plugins Locales"
sidebarTitle: "Plugins Locales"
description: "Desarrolla plugins localmente sin publicarlos en npm."
---

Esta guía cubre el desarrollo de plugins localmente sin publicarlos en npm: integraciones personalizadas, plugins privados, prototipado rápido y extracción de plugins upstream para su modificación.

<div id="table-of-contents">

## Tabla de Contenidos

</div>

1. [Ubicaciones de Plugins](#plugin-locations)
2. [Prioridad de Carga de Plugins](#plugin-loading-priority)
3. [Crear un Plugin Local](#creating-a-local-plugin)
4. [Configuración](#configuration)
5. [Instalador de Plugins](#plugin-installer)
6. [Extracción de Plugins Upstream](#ejecting-upstream-plugins)
7. [Flujo de Trabajo de Desarrollo](#development-workflow)
8. [Depuración](#debugging)
9. [Variables de Entorno](#environment-variables)
10. [Migración a npm](#migrating-to-npm)

---

<div id="plugin-locations">

## Ubicaciones de Plugins

</div>

Milady descubre plugins en tres ubicaciones dentro del directorio de estado (`~/.milady/` por defecto):

<div id="1-ejected-plugins">

### 1. Plugins Extraídos

</div>

Plugins upstream clonados localmente para su modificación:

```
~/.milady/plugins/ejected/<plugin-name>/
```

Estos son creados por el sistema de extracción (ver [Extracción de Plugins Upstream](#ejecting-upstream-plugins)). Cada subdirectorio es un repositorio git completo con código fuente editable.

<div id="2-installed-plugins">

### 2. Plugins Instalados

</div>

Plugins instalados en tiempo de ejecución a través del gestor de plugins o CLI:

```
~/.milady/plugins/installed/<sanitised-name>/
```

Cada plugin obtiene un directorio aislado con su propio `package.json` y `node_modules/`. El instalador crea un `package.json` mínimo `{ "private": true, "dependencies": {} }`, y luego ejecuta `bun add <package>` (o `npm install` como alternativa) dentro de ese directorio.

<div id="3-custom-drop-in-plugins">

### 3. Plugins Personalizados (Drop-in)

</div>

Plugins escritos manualmente colocados directamente en el directorio personalizado:

```
~/.milady/plugins/custom/<your-plugin>/
```

Cualquier subdirectorio aquí con un `package.json` se descubre automáticamente al inicio. Esta es la forma más sencilla de agregar un plugin local: simplemente colócalo y reinicia.

<div id="4-extra-load-paths">

### 4. Rutas de Carga Adicionales

</div>

Se pueden especificar directorios adicionales en `milady.json`:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "~/shared-plugins",
        "/opt/team-plugins"
      ]
    }
  }
}
```

Cada directorio se escanea de la misma forma que `plugins/custom/` -- los subdirectorios con un `package.json` se tratan como plugins.

<div id="full-directory-layout">

### Estructura Completa de Directorios

</div>

```
~/.milady/
├── milady.json              # Main config file
├── plugins/
│   ├── ejected/              # Git-cloned upstream plugins for editing
│   │   └── plugin-telegram/
│   │       ├── .upstream.json
│   │       ├── package.json
│   │       ├── src/
│   │       └── dist/
│   ├── installed/            # Runtime-installed plugins (managed by plugin-installer)
│   │   └── _elizaos_plugin-twitter/
│   │       ├── package.json
│   │       └── node_modules/
│   └── custom/               # Hand-written drop-in plugins
│       └── my-plugin/
│           ├── package.json
│           ├── src/
│           └── dist/
```

---

<div id="plugin-loading-priority">

## Prioridad de Carga de Plugins

</div>

Cuando múltiples fuentes proporcionan el mismo nombre de plugin, Milady utiliza esta precedencia (de mayor a menor):

| Prioridad | Fuente | Ruta | Caso de uso |
|-----------|--------|------|-------------|
| 1 | **Extraído** | `~/.milady/plugins/ejected/` | Modificar el código fuente de un plugin upstream |
| 2 | **Sobreescritura de workspace** | Mecanismo interno de desarrollo | Solo para contribuidores de Milady |
| 3 | **npm oficial** (con registro de instalación) | `node_modules/@elizaos/plugin-*` | Los plugins estándar `@elizaos/*` prefieren las copias incluidas |
| 4 | **Instalado por el usuario** (con registro de instalación) | `~/.milady/plugins/installed/` | Plugins de terceros instalados en tiempo de ejecución |
| 5 | **Local @milady** | `src/plugins/` (dist compilado) | Plugins integrados de Milady |
| 6 | **npm alternativo** | `import(name)` | Importación dinámica como último recurso |

Los plugins personalizados/drop-in se fusionan en los registros de instalación antes de la resolución, por lo que participan en las prioridades 3-4 dependiendo de su nombre de paquete.

La lista de denegación (`plugins.deny` en `milady.json`) tiene precedencia absoluta -- los plugins denegados nunca se cargan independientemente de su fuente.

---

<div id="creating-a-local-plugin">

## Crear un Plugin Local

</div>

<div id="step-1-create-the-directory">

### Paso 1: Crear el Directorio

</div>

```bash
mkdir -p ~/.milady/plugins/custom/my-plugin/src
cd ~/.milady/plugins/custom/my-plugin
```

<div id="step-2-initialize-packagejson">

### Paso 2: Inicializar package.json

</div>

```bash
cat > package.json << 'EOF'
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@elizaos/core": "^2.0.0"
  }
}
EOF
```

<div id="step-3-add-tsconfigjson">

### Paso 3: Agregar tsconfig.json

</div>

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

<div id="step-4-write-the-plugin">

### Paso 4: Escribir el Plugin

</div>

```typescript
// src/index.ts
import type { Plugin, Action, Provider } from "@elizaos/core";

const greetAction: Action = {
  name: "GREET_USER",
  similes: ["SAY_HELLO", "WELCOME"],
  description: "Greets the user by name",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    const name = options?.parameters?.name ?? "friend";
    return {
      success: true,
      text: `Hello, ${name}! Welcome to Milady.`,
    };
  },
  parameters: [
    {
      name: "name",
      description: "Name of the person to greet",
      required: false,
      schema: { type: "string", default: "friend" },
    },
  ],
};

const statusProvider: Provider = {
  name: "myPluginStatus",
  get: async (runtime, message, state) => {
    return {
      text: "My plugin is active and running.",
    };
  },
};

const plugin: Plugin = {
  name: "my-plugin",
  description: "A local development plugin",
  actions: [greetAction],
  providers: [statusProvider],
  init: async (config, runtime) => {
    runtime.logger?.info("[my-plugin] Initialized successfully");
  },
};

export default plugin;
```

<div id="step-5-install-dependencies-and-build">

### Paso 5: Instalar Dependencias y Compilar

</div>

```bash
cd ~/.milady/plugins/custom/my-plugin
bun install
bun run build
```

<div id="step-6-restart-milady">

### Paso 6: Reiniciar Milady

</div>

```bash
# If running in terminal
milady start

# Or restart via the agent chat
# Type: /restart
```

Al iniciar, deberías ver en los registros:

```
[milady] Discovered 1 custom plugin(s): my-plugin
```

---

<div id="configuration">

## Configuración

</div>

<div id="allow-and-deny-lists">

### Listas de Permitidos y Denegados

</div>

Controla qué plugins se cargan a través de `milady.json`:

```json
{
  "plugins": {
    "allow": ["my-plugin", "telegram", "@elizaos/plugin-discord"],
    "deny": ["@elizaos/plugin-shell"]
  }
}
```

Cuando se establece `allow`, solo se cargan los plugins listados (además de los plugins principales). La lista `deny` siempre gana -- un plugin denegado nunca se carga aunque aparezca en `allow`.

Los nombres de plugins se pueden especificar como:
- Nombre completo del paquete: `@elizaos/plugin-telegram`
- Identificador corto: `telegram` (se resuelve como `@elizaos/plugin-telegram`)
- Nombre personalizado: `my-plugin` (coincide con el campo `name` en el `package.json` de tu plugin)

<div id="per-plugin-settings">

### Configuración por Plugin

</div>

Configura plugins individuales bajo `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "my-plugin": {
        "enabled": true,
        "config": {
          "apiEndpoint": "https://api.example.com",
          "maxRetries": 3
        }
      },
      "telegram": {
        "enabled": false
      }
    }
  }
}
```

Establecer `enabled: false` en una entrada impide que ese plugin se cargue, incluso si la lógica de habilitación automática lo activaría de otra manera.

<div id="auto-enable-system">

### Sistema de Habilitación Automática

</div>

Milady habilita automáticamente los plugins basándose en tu configuración:

- **Plugins de conector**: Si un conector (telegram, discord, slack, etc.) tiene credenciales configuradas en `connectors`, su plugin se habilita automáticamente.
- **Plugins de proveedor**: Si una variable de entorno de clave API está configurada (por ejemplo, `ANTHROPIC_API_KEY`), el plugin de proveedor correspondiente se habilita automáticamente.
- **Plugins de funcionalidad**: Si un indicador de funcionalidad está habilitado en `features`, su plugin se habilita automáticamente.

Esto sucede al inicio a través de `applyPluginAutoEnable()` y no modifica tu archivo de configuración -- solo afecta el conjunto de plugins en memoria para esa sesión.

---

<div id="plugin-installer">

## Instalador de Plugins

</div>

El instalador de plugins (`plugin-installer.ts`) gestiona la instalación en tiempo de ejecución de plugins desde el registro.

<div id="how-it-works">

### Cómo Funciona

</div>

1. **Resuelve** el nombre del plugin contra el registro de plugins
2. **Instala** a través de `bun add` (preferido) o `npm install` (alternativa) en un directorio aislado en `~/.milady/plugins/installed/<sanitised-name>/`
3. **Recurre** a `git clone` si la instalación por npm falla
4. **Valida** que el plugin instalado tenga un punto de entrada resoluble
5. **Registra** la instalación en `milady.json` bajo `plugins.installs`
6. **Activa** un reinicio del agente para cargar el nuevo plugin

<div id="package-name-sanitisation">

### Sanitización del Nombre del Paquete

</div>

El instalador sanitiza los nombres de paquetes para nombres de directorio reemplazando caracteres no alfanuméricos (excepto `.`, `-`, `_`) con guiones bajos. Por ejemplo, `@elizaos/plugin-twitter` se convierte en `_elizaos_plugin-twitter`.

<div id="install-record">

### Registro de Instalación

</div>

Cada plugin instalado se registra en `milady.json`:

```json
{
  "plugins": {
    "installs": {
      "@elizaos/plugin-twitter": {
        "source": "npm",
        "spec": "@elizaos/plugin-twitter@1.0.0",
        "installPath": "/Users/you/.milady/plugins/installed/_elizaos_plugin-twitter",
        "version": "1.0.0",
        "installedAt": "2026-02-19T12:00:00.000Z"
      }
    }
  }
}
```

<div id="serialisation">

### Serialización

</div>

El instalador utiliza un bloqueo de serialización para evitar que las instalaciones concurrentes corrompan la configuración. Las solicitudes de instalación múltiples se ponen en cola y se ejecutan secuencialmente.

<div id="uninstalling">

### Desinstalación

</div>

La desinstalación elimina el directorio del plugin del disco y borra su registro de `milady.json`. Los plugins principales/integrados no se pueden desinstalar. El desinstalador se niega a eliminar directorios fuera de `~/.milady/plugins/installed/` como medida de seguridad.

---

<div id="ejecting-upstream-plugins">

## Extracción de Plugins Upstream

</div>

El sistema de extracción te permite clonar el código fuente de un plugin upstream, modificarlo y hacer que Milady cargue tu copia local en lugar del paquete npm.

<div id="eject-via-agent-chat">

### Extraer a través del Chat del Agente

</div>

```
eject the telegram plugin so I can edit its source
```

<div id="eject-manually">

### Extraer Manualmente

</div>

```bash
git clone --branch 1.x --depth 1 \
  https://github.com/elizaos-plugins/plugin-telegram.git \
  ~/.milady/plugins/ejected/plugin-telegram

cd ~/.milady/plugins/ejected/plugin-telegram
bun install
bun run build
```

<div id="upstream-tracking">

### Seguimiento de Upstream

</div>

Cada plugin extraído tiene un `.upstream.json` en su raíz:

```json
{
  "$schema": "milady-upstream-v1",
  "source": "github:elizaos-plugins/plugin-telegram",
  "gitUrl": "https://github.com/elizaos-plugins/plugin-telegram.git",
  "branch": "1.x",
  "commitHash": "093613e...",
  "ejectedAt": "2026-02-19T08:00:00Z",
  "npmPackage": "@elizaos/plugin-telegram",
  "npmVersion": "1.6.4",
  "lastSyncAt": null,
  "localCommits": 0
}
```

<div id="syncing-with-upstream">

### Sincronización con Upstream

</div>

```bash
cd ~/.milady/plugins/ejected/plugin-telegram
git fetch origin
git pull --rebase origin 1.x
bun run build
```

O a través del chat del agente: `sync the ejected telegram plugin`

<div id="reverting-reinject">

### Revertir (Reinyectar)

</div>

Elimina el directorio extraído para volver a la versión npm:

```bash
rm -rf ~/.milady/plugins/ejected/plugin-telegram
# Restart milady -- it will load the npm version again
```

O a través del chat del agente: `reinject the telegram plugin`

---

<div id="development-workflow">

## Flujo de Trabajo de Desarrollo

</div>

<div id="edit-build-restart-cycle">

### Ciclo de Editar-Compilar-Reiniciar

</div>

El ciclo de desarrollo estándar para plugins locales:

```bash
# Terminal 1: Watch and rebuild on changes
cd ~/.milady/plugins/custom/my-plugin
bun run dev  # runs tsc --watch

# Terminal 2: Run milady
milady start
```

Después de hacer cambios, el observador de TypeScript recompila `dist/` automáticamente. Aún necesitas reiniciar el agente para cargar la nueva compilación:

- Escribe `/restart` en el chat del agente, o
- Presiona Ctrl+C y ejecuta `milady start` de nuevo

<div id="testing-your-plugin">

### Probar tu Plugin

</div>

Chatea con el agente y activa tu acción:

```
You: Greet me as Alice
Agent: Hello, Alice! Welcome to Milady.
```

Revisa los registros para ver el mensaje de inicialización de tu plugin y cualquier salida de depuración.

<div id="quick-iteration-without-tsc---watch">

### Iteración Rápida Sin tsc --watch

</div>

Si prefieres compilaciones manuales:

```bash
cd ~/.milady/plugins/custom/my-plugin
bun run build && milady start
```

<div id="using-source-directly-development-only">

### Usar el Código Fuente Directamente (Solo Desarrollo)

</div>

Para prototipado rápido, puedes apuntar `main` al código fuente TypeScript:

```json
{
  "main": "src/index.ts"
}
```

El entorno de ejecución de Milady puede importar archivos TypeScript directamente en modo de desarrollo. Cambia a `dist/index.js` antes de distribuir.

<div id="configuration-driven-loading">

### Carga Basada en Configuración

</div>

Carga un plugin desde cualquier ruta usando `milady.json`:

```json
{
  "plugins": {
    "entries": {
      "my-plugin": {
        "enabled": true,
        "path": "~/projects/my-plugin/dist"
      }
    }
  }
}
```

La ruta soporta expansión de tilde (`~/`) y rutas tanto relativas como absolutas. Esto es útil cuando tu plugin se encuentra fuera de los directorios estándar de plugins.

<div id="rapid-iteration-tips">

### Consejos para Iteración Rápida

</div>

1. **Usa `LOG_LEVEL=debug`** para ver los registros de carga, descubrimiento e inicialización de plugins
2. **Verifica el orden de carga de plugins** en los registros de depuración -- busca `Loading plugin: your-plugin-name`
3. **Prueba acciones a través del chat** -- escribe mensajes que activen la función de validación de tu acción
4. **Usa la API REST** para pruebas programáticas:

```bash
# List loaded plugins
curl http://localhost:18789/api/plugins

# Search the registry
curl http://localhost:18789/api/registry/search?q=my-plugin
```

5. **Ejecuta múltiples instancias** con diferentes configuraciones usando `ELIZAOS_CONFIG_DIR`:

```bash
# Instance with your dev plugin
ELIZAOS_CONFIG_DIR=./config-dev milady start

# Instance with production plugins
ELIZAOS_CONFIG_DIR=./config-prod milady start
```

---

<div id="debugging">

## Depuración

</div>

<div id="log-levels">

### Niveles de Registro

</div>

Milady lee el nivel de registro de la variable de entorno `LOG_LEVEL` o de `logging.level` en la configuración. Si `LOG_LEVEL` está configurado en el entorno, tiene precedencia sobre el valor de configuración.

```bash
# Verbose logging via environment variable
LOG_LEVEL=debug milady start
```

O configúralo en `milady.json`:

```json
{
  "logging": {
    "level": "debug"
  }
}
```

Niveles disponibles: `debug`, `info`, `warn`, `error` (por defecto).

<div id="plugin-logging">

### Registro de Plugins

</div>

Usa el logger del entorno de ejecución dentro de tu plugin:

```typescript
init: async (config, runtime) => {
  runtime.logger?.debug("[my-plugin] Detailed debug info", { config });
  runtime.logger?.info("[my-plugin] Plugin initialized");
  runtime.logger?.warn("[my-plugin] Something looks off");
  runtime.logger?.error("[my-plugin] Something failed", { error: "details" });
},
```

<div id="source-maps">

### Source Maps

</div>

Habilita los source maps para obtener trazas de pila legibles que apunten a tu código fuente TypeScript:

```bash
NODE_OPTIONS="--enable-source-maps" milady start
```

Asegúrate de que `"sourceMap": true` esté configurado en tu `tsconfig.json` (incluido en la plantilla anterior).

<div id="vs-code-debugging">

### Depuración con VS Code

</div>

Crea `.vscode/launch.json` en tu proyecto:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Milady",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "milady", "start"],
      "cwd": "${workspaceFolder}",
      "env": {
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

Coloca puntos de interrupción en los archivos TypeScript de tu plugin y lanza con F5.

<div id="common-issues">

### Problemas Comunes

</div>

**El plugin no se descubre al inicio:**
- Verifica que el directorio del plugin esté directamente bajo `~/.milady/plugins/custom/` (no anidado más profundo)
- Confirma que `package.json` existe y tiene un campo `name`
- Verifica que `main` en `package.json` apunte a un archivo existente
- Busca `[milady] Discovered N custom plugin(s)` en los registros de inicio

**El plugin se descubre pero no se carga:**
- Ejecuta `bun run build` -- el directorio `dist/` puede estar faltando
- Verifica que la exportación por defecto sea un objeto Plugin válido con `name` y `description`
- Revisa los errores de importación en los registros: `LOG_LEVEL=debug milady start`

**El plugin está denegado o filtrado:**
- Revisa `plugins.deny` en `milady.json` -- el nombre de tu plugin puede estar listado
- Si `plugins.allow` está configurado, tu plugin debe estar en la lista de permitidos
- Verifica que `plugins.entries.<name>.enabled` no esté configurado como `false`

**Errores de compilación de TypeScript:**
```bash
cd ~/.milady/plugins/custom/my-plugin
bun run tsc --noEmit  # Type-check without emitting
```

---

<div id="environment-variables">

## Variables de Entorno

</div>

Estas variables de entorno afectan las rutas y el comportamiento de los plugins. Están definidas en `src/config/paths.ts`.

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `MILADY_STATE_DIR` | `~/.milady` | Sobreescribe el directorio de estado. Cambia dónde se almacenan los plugins, la configuración y las credenciales. |
| `MILADY_CONFIG_PATH` | `~/.milady/milady.json` | Sobreescribe la ruta del archivo de configuración directamente. |
| `MILADY_OAUTH_DIR` | `~/.milady/credentials` | Sobreescribe el directorio de credenciales OAuth. |
| `LOG_LEVEL` | `error` | Establece la verbosidad del registro: `debug`, `info`, `warn`, `error`. |
| `MILADY_DISABLE_WORKSPACE_PLUGIN_OVERRIDES` | sin configurar | Establece a `1` para deshabilitar las sobreescrituras de plugins del workspace (mecanismo solo para desarrollo). |
| `ELIZAOS_CONFIG_DIR` | sin configurar | Sobreescribe el directorio de configuración de elizaOS core. Útil para ejecutar múltiples instancias de agentes con diferentes configuraciones de plugins. |

Cuando `MILADY_STATE_DIR` está configurado, todas las rutas derivadas cambian en consecuencia:
- Plugins: `$MILADY_STATE_DIR/plugins/installed/`, `$MILADY_STATE_DIR/plugins/custom/`, `$MILADY_STATE_DIR/plugins/ejected/`
- Configuración: `$MILADY_STATE_DIR/milady.json` (a menos que `MILADY_CONFIG_PATH` también esté configurado)
- Caché de modelos: `$MILADY_STATE_DIR/models/`

---

<div id="migrating-to-npm">

## Migración a npm

</div>

Cuando tu plugin esté listo para distribución:

<div id="1-update-packagejson">

### 1. Actualizar package.json

</div>

```json
{
  "name": "@yourorg/plugin-my-feature",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "bun run build"
  },
  "peerDependencies": {
    "@elizaos/core": "^2.0.0"
  }
}
```

<div id="2-build-and-publish">

### 2. Compilar y Publicar

</div>

```bash
cd ~/.milady/plugins/custom/my-plugin
bun run build
npm pack              # Preview what gets published
npm publish --access public
```

<div id="3-install-via-milady">

### 3. Instalar a través de Milady

</div>

Una vez publicado, instala a través del chat del agente o directamente en la configuración:

```json
{
  "plugins": {
    "allow": ["@yourorg/plugin-my-feature"]
  }
}
```

Elimina la copia local de `~/.milady/plugins/custom/` para evitar cargar ambas versiones.

---

<div id="next-steps">

## Próximos Pasos

</div>

- [Guía de Desarrollo de Plugins](/es/plugins/development) -- Referencia completa de la API de plugins
- [Documentación de Skills](/es/plugins/skills) -- Extensiones más ligeras
- [Guía de Contribución](/es/guides/contribution-guide) -- Contribuir plugins upstream

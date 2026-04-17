---
title: "Plugin de Gestor de Secretos"
sidebarTitle: "Secrets Manager"
description: "Almacenamiento seguro de secretos, mapeo de variables de entorno, inyección de secretos en tiempo de ejecución y cifrado para agentes Milady."
---

El plugin Secrets Manager proporciona almacenamiento seguro y cifrado para claves API y otros valores de configuración sensibles. Se carga temprano en la secuencia de inicio — antes de cualquier plugin de conector o proveedor — para que los secretos estén disponibles en el momento de inicialización de los plugins.

**Package:** `@elizaos/plugin-secrets-manager` (importado estáticamente — disponible pero no incluido en el conjunto predeterminado de plugins principales; podría reactivarse en una futura versión)

<div id="overview">
## Descripción general
</div>

Los secretos almacenados a través del Secrets Manager son:

- Cifrados en reposo usando AES-256-GCM
- Descifrados solo en tiempo de ejecución cuando lo solicita un plugin autorizado
- Auditados — todo acceso a secretos se registra (solo el nombre de la clave, nunca el valor)
- Con alcance por agente — los secretos no se filtran entre agentes

<div id="setting-secrets">
## Configuración de Secretos
</div>

<div id="via-the-admin-panel">
### A través del Panel de Administración
</div>

Navegue a **Agent → Settings → Secrets** y agregue pares clave-valor.

<div id="via-the-cli">
### A través del CLI
</div>

```bash
# Open the config file in your editor
$EDITOR "$(milady config path)"
# Add the key under the "secrets" section
```

<div id="via-configuration-file">
### A través del Archivo de Configuración
</div>

Los secretos pueden incluirse en `milady.json` (no recomendado para producción — use variables de entorno en su lugar):

```json
{
  "secrets": {
    "OPENAI_API_KEY": "<OPENAI_API_KEY>",
    "TELEGRAM_BOT_TOKEN": "123456:ABC..."
  }
}
```

<div id="via-environment-variables">
### A través de Variables de Entorno
</div>

Cualquier variable de entorno presente al inicio está disponible automáticamente como secreto. Los plugins acceden a ellas a través de `runtime.getSetting()` que verifica tanto los secretos almacenados como `process.env`.

```bash
OPENAI_API_KEY=sk-... TELEGRAM_BOT_TOKEN=123456:ABC... milady start
```

<div id="accessing-secrets-in-plugins">
## Acceso a Secretos en Plugins
</div>

Los plugins siempre deben usar `runtime.getSetting()` en lugar de leer `process.env` directamente. El Secrets Manager garantiza que se devuelva el valor correcto independientemente del backend de almacenamiento.

```typescript
import type { Plugin } from "@elizaos/core";

const myPlugin: Plugin = {
  name: "my-plugin",
  description: "Plugin demonstrating secret access",

  init: async (_config, runtime) => {
    const apiKey = runtime.getSetting("MY_API_KEY");

    if (!apiKey) {
      throw new Error("[my-plugin] MY_API_KEY is required but not set");
    }

    runtime.logger?.info("[my-plugin] API key loaded (length: " + apiKey.length + ")");
  },
};
```

<div id="secret-resolution-order">
## Orden de Resolución de Secretos
</div>

Cuando se llama a `runtime.getSetting("KEY")`, el Secrets Manager resuelve en este orden:

1. Secretos específicos del agente almacenados en la base de datos (prioridad más alta)
2. Objeto `settings.secrets` del archivo de personaje
3. Variables de entorno `process.env`
4. Secretos globales de `~/.milady/secrets`

<div id="environment-variable-mapping">
## Mapeo de Variables de Entorno
</div>

El Secrets Manager mapea nombres de variables de entorno a los requisitos de los plugins. Cuando un plugin declara `requiredSecrets` en su manifiesto, el panel de administración solicita esos valores y los almacena de forma segura.

```json
{
  "requiredSecrets": ["OPENAI_API_KEY"],
  "optionalSecrets": ["OPENAI_ORG_ID"]
}
```

<div id="encryption">
## Cifrado
</div>

Los secretos en reposo se cifran usando:

- Algoritmo: AES-256-GCM
- Derivación de clave: PBKDF2-SHA256
- Sal: Sal aleatoria por agente almacenada por separado de los valores cifrados

La clave de cifrado se deriva de una clave maestra que nunca se almacena en disco.

<div id="audit-logging">
## Registro de Auditoría
</div>

Todo acceso a secretos se registra en el nivel `debug`:

```
[secrets-manager] Secret accessed: OPENAI_API_KEY (by: plugin-openai)
```

El valor real del secreto nunca se registra.

<div id="configuration">
## Configuración
</div>

| Configuración | Descripción | Predeterminado |
|---------|-------------|---------|
| `secrets.encryption` | Habilitar cifrado en reposo | `true` |
| `secrets.auditLog` | Habilitar registro de auditoría de acceso | `true` |

<div id="related">
## Relacionado
</div>

- [Plugin SQL](/plugin-registry/sql) — Backend de base de datos para almacenamiento cifrado de secretos
- [Guía de Configuración](/es/configuration) — Referencia completa de configuración
- [Arquitectura de Plugins](/es/plugins/architecture) — Cómo se inyectan los secretos al inicio

---
title: "Plugin de Anthropic"
sidebarTitle: "Anthropic"
description: "Proveedor de modelos Anthropic Claude para Milady — Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 y los modelos de pensamiento extendido."
---

El plugin de Anthropic conecta los agentes de Milady con la API de Claude de Anthropic, proporcionando acceso a las familias de modelos Claude 4.6, 4.5, 4 y 3, incluyendo las variantes Opus, Sonnet y Haiku.

**Package:** `@elizaos/plugin-anthropic`

<div id="installation">

## Instalación

</div>

```bash
milady plugins install anthropic
```

<div id="auto-enable">

## Activación automática

</div>

El plugin se activa automáticamente cuando `ANTHROPIC_API_KEY` o `CLAUDE_API_KEY` está presente:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

<div id="configuration">

## Configuración

</div>

| Variable de entorno | Requerido | Descripción |
|---------------------|-----------|-------------|
| `ANTHROPIC_API_KEY` | Sí* | Clave API de Anthropic desde [console.anthropic.com](https://console.anthropic.com) |
| `CLAUDE_API_KEY` | Sí* | Alias de `ANTHROPIC_API_KEY` |
| `ANTHROPIC_API_URL` | No | URL base personalizada |

*Se requiere `ANTHROPIC_API_KEY` o `CLAUDE_API_KEY`.

<div id="miladyjson-example">

### Ejemplo de milady.json

</div>

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514"
      }
    }
  }
}
```

<div id="supported-models">

## Modelos compatibles

</div>

<div id="claude-4546-family">

### Familia Claude 4.5/4.6

</div>

| Modelo | Contexto | Mejor para |
|--------|----------|------------|
| `claude-opus-4-6` | 200k | El más capaz, razonamiento complejo, contexto de 1M disponible |
| `claude-sonnet-4-6` | 200k | Último Sonnet, rendimiento y costo equilibrados |
| `claude-haiku-4-5-20251001` | 200k | Tareas rápidas y ligeras |

<div id="claude-4-family">

### Familia Claude 4

</div>

| Modelo | Contexto | Mejor para |
|--------|----------|------------|
| `claude-opus-4-20250514` | 200k | Razonamiento complejo |
| `claude-sonnet-4-20250514` | 200k | Rendimiento y costo equilibrados |
| `claude-sonnet-4.5` | 200k | Programación mejorada |
| `claude-3-5-haiku-20241022` | 200k | Respuestas rápidas |

<div id="claude-37-family">

### Familia Claude 3.7

</div>

| Modelo | Contexto | Mejor para |
|--------|----------|------------|
| `claude-3-7-sonnet-20250219` | 200k | Pensamiento extendido, tareas agénticas |

<div id="claude-35-family">

### Familia Claude 3.5

</div>

| Modelo | Contexto | Mejor para |
|--------|----------|------------|
| `claude-3-5-sonnet-20241022` | 200k | Generación de código, análisis |
| `claude-3-5-haiku-20241022` | 200k | Respuestas rápidas |

<div id="claude-3-family">

### Familia Claude 3

</div>

| Modelo | Contexto | Mejor para |
|--------|----------|------------|
| `claude-3-opus-20240229` | 200k | Análisis profundo |
| `claude-3-sonnet-20240229` | 200k | Equilibrado |
| `claude-3-haiku-20240307` | 200k | Eficiente en costos |

<div id="model-type-mapping">

## Mapeo de tipos de modelo

</div>

| Tipo de modelo elizaOS | Modelo Anthropic |
|------------------------|-----------------|
| `TEXT_SMALL` | `claude-3-5-haiku-20241022` |
| `TEXT_LARGE` | `claude-sonnet-4-20250514` |
| `OBJECT_SMALL` | `claude-3-5-haiku-20241022` |
| `OBJECT_LARGE` | `claude-sonnet-4-20250514` |

<div id="features">

## Características

</div>

- Respuestas en streaming
- Uso de herramientas (llamada a funciones)
- Visión (entrada de imágenes en todos los modelos)
- Pensamiento extendido (claude-3-7-sonnet, claude-opus-4-6)
- Salida JSON estructurada mediante uso de herramientas
- Ventana de contexto de 200k tokens en todos los modelos
- Caché de prompts para reducción de costos en contextos repetidos

<div id="extended-thinking">

## Pensamiento extendido

</div>

Claude 3.7 Sonnet y Claude Opus 4 (`claude-opus-4-20250514`) admiten pensamiento extendido — un modo donde el modelo razona paso a paso antes de responder. Esto es particularmente efectivo para razonamiento complejo, matemáticas y planificación de múltiples pasos.

```typescript
const response = await runtime.useModel("TEXT_LARGE", {
  prompt: "Design a database schema for a multi-tenant SaaS application.",
  thinking: { type: "enabled", budgetTokens: 10000 },
});
```

<div id="rate-limits-and-pricing">

## Límites de tasa y precios

</div>

Los límites de tasa dependen de tu nivel de uso en Anthropic. Consulta [docs.anthropic.com/en/api/rate-limits](https://docs.anthropic.com/en/api/rate-limits) para los límites actuales.

Precios: [anthropic.com/pricing](https://www.anthropic.com/pricing)

<div id="related">

## Relacionado

</div>

- [Plugin de OpenAI](/es/plugin-registry/llm/openai) — Modelos GPT-4o y de razonamiento
- [Plugin de OpenRouter](/es/plugin-registry/llm/openrouter) — Enrutamiento entre proveedores incluyendo Anthropic
- [Proveedores de modelos](/es/runtime/models) — Comparar todos los proveedores

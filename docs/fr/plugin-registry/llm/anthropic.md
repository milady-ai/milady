---
title: "Plugin Anthropic"
sidebarTitle: "Anthropic"
description: "Fournisseur de modèles Anthropic Claude pour Milady — Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 et les modèles de réflexion étendue."
---

Le plugin Anthropic connecte les agents Milady à l'API Claude d'Anthropic, fournissant l'accès aux familles de modèles Claude 4.6, 4.5, 4 et 3, y compris les variantes Opus, Sonnet et Haiku.

**Package:** `@elizaos/plugin-anthropic`

<div id="installation">

## Installation

</div>

```bash
milady plugins install anthropic
```

<div id="auto-enable">

## Activation automatique

</div>

Le plugin s'active automatiquement lorsque `ANTHROPIC_API_KEY` ou `CLAUDE_API_KEY` est présent :

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

<div id="configuration">

## Configuration

</div>

| Variable d'environnement | Requis | Description |
|--------------------------|--------|-------------|
| `ANTHROPIC_API_KEY` | Oui* | Clé API Anthropic depuis [console.anthropic.com](https://console.anthropic.com) |
| `CLAUDE_API_KEY` | Oui* | Alias pour `ANTHROPIC_API_KEY` |
| `ANTHROPIC_API_URL` | Non | URL de base personnalisée |

*`ANTHROPIC_API_KEY` ou `CLAUDE_API_KEY` est requis.

<div id="miladyjson-example">

### Exemple milady.json

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

## Modèles pris en charge

</div>

<div id="claude-4546-family">

### Famille Claude 4.5/4.6

</div>

| Modèle | Contexte | Idéal pour |
|--------|----------|------------|
| `claude-opus-4-6` | 200k | Le plus performant, raisonnement complexe, contexte de 1M disponible |
| `claude-sonnet-4-6` | 200k | Dernier Sonnet, performance et coût équilibrés |
| `claude-haiku-4-5-20251001` | 200k | Tâches rapides et légères |

<div id="claude-4-family">

### Famille Claude 4

</div>

| Modèle | Contexte | Idéal pour |
|--------|----------|------------|
| `claude-opus-4-20250514` | 200k | Raisonnement complexe |
| `claude-sonnet-4-20250514` | 200k | Performance et coût équilibrés |
| `claude-sonnet-4.5` | 200k | Programmation améliorée |
| `claude-3-5-haiku-20241022` | 200k | Réponses rapides |

<div id="claude-37-family">

### Famille Claude 3.7

</div>

| Modèle | Contexte | Idéal pour |
|--------|----------|------------|
| `claude-3-7-sonnet-20250219` | 200k | Réflexion étendue, tâches agentiques |

<div id="claude-35-family">

### Famille Claude 3.5

</div>

| Modèle | Contexte | Idéal pour |
|--------|----------|------------|
| `claude-3-5-sonnet-20241022` | 200k | Génération de code, analyse |
| `claude-3-5-haiku-20241022` | 200k | Réponses rapides |

<div id="claude-3-family">

### Famille Claude 3

</div>

| Modèle | Contexte | Idéal pour |
|--------|----------|------------|
| `claude-3-opus-20240229` | 200k | Analyse approfondie |
| `claude-3-sonnet-20240229` | 200k | Équilibré |
| `claude-3-haiku-20240307` | 200k | Économique |

<div id="model-type-mapping">

## Correspondance des types de modèle

</div>

| Type de modèle elizaOS | Modèle Anthropic |
|------------------------|-----------------|
| `TEXT_SMALL` | `claude-3-5-haiku-20241022` |
| `TEXT_LARGE` | `claude-sonnet-4-20250514` |
| `OBJECT_SMALL` | `claude-3-5-haiku-20241022` |
| `OBJECT_LARGE` | `claude-sonnet-4-20250514` |

<div id="features">

## Fonctionnalités

</div>

- Réponses en streaming
- Utilisation d'outils (appel de fonctions)
- Vision (entrée d'images sur tous les modèles)
- Réflexion étendue (claude-3-7-sonnet, claude-opus-4-6)
- Sortie JSON structurée via l'utilisation d'outils
- Fenêtre de contexte de 200k tokens sur tous les modèles
- Mise en cache des prompts pour réduction des coûts sur les contextes répétés

<div id="extended-thinking">

## Réflexion étendue

</div>

Claude 3.7 Sonnet et Claude Opus 4 (`claude-opus-4-20250514`) prennent en charge la réflexion étendue — un mode où le modèle raisonne étape par étape avant de répondre. C'est particulièrement efficace pour le raisonnement complexe, les mathématiques et la planification en plusieurs étapes.

```typescript
const response = await runtime.useModel("TEXT_LARGE", {
  prompt: "Design a database schema for a multi-tenant SaaS application.",
  thinking: { type: "enabled", budgetTokens: 10000 },
});
```

<div id="rate-limits-and-pricing">

## Limites de débit et tarification

</div>

Les limites de débit dépendent de votre niveau d'utilisation Anthropic. Consultez [docs.anthropic.com/en/api/rate-limits](https://docs.anthropic.com/en/api/rate-limits) pour les limites actuelles.

Tarification : [anthropic.com/pricing](https://www.anthropic.com/pricing)

<div id="related">

## Associé

</div>

- [Plugin OpenAI](/fr/plugin-registry/llm/openai) — Modèles GPT-4o et de raisonnement
- [Plugin OpenRouter](/fr/plugin-registry/llm/openrouter) — Routage entre fournisseurs, y compris Anthropic
- [Fournisseurs de modèles](/fr/runtime/models) — Comparer tous les fournisseurs

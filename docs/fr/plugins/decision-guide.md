---
title: "Choisir le bon point d'extension"
sidebarTitle: "Guide de décision"
description: "Quand utiliser les Actions, Providers, Services, Skills, Routes, Event Handlers ou Evaluators"
---

elizaOS offre plusieurs façons d'étendre le comportement de l'agent. Ce guide vous aide à choisir la bonne.

<div id="quick-decision-tree">

## Arbre de décision rapide

</div>

**"Je veux que mon agent FASSE quelque chose quand on le lui demande"** → [Action](#actions)

**"Je veux injecter du contexte dans chaque réponse"** → [Provider](#providers)

**"J'ai besoin d'un processus en arrière-plan"** → [Service](#services)

**"Je veux ajouter des connaissances/instructions sans code"** → [Skill](#skills)

**"J'ai besoin d'un endpoint HTTP"** → [Route](#routes)

**"Je veux réagir aux événements du système"** → [Event Handler](#event-handlers)

**"Je veux évaluer la qualité des réponses"** → [Evaluator](#evaluators)

---

<div id="comparison-table">

## Tableau comparatif

</div>

| Caractéristique | Action | Provider | Service | Skill | Route |
|---------|--------|----------|---------|-------|-------|
| Déclenché par | Message utilisateur (le LLM sélectionne) | Chaque cycle d'inférence | Initialisation du plugin | Message utilisateur (le LLM sélectionne) | Requête HTTP |
| Retourne | ActionResult | Context string | -- | Réponse de l'agent | Réponse HTTP |
| A un cycle de vie | Non | Non | Oui (start/stop) | Non | Non |
| Nécessite TypeScript | Oui | Oui | Oui | Non (markdown) | Oui |
| Rechargement à chaud | Rebuild + restart | Rebuild + restart | Rebuild + restart | Modifier le markdown + restart | Rebuild + restart |
| S'exécute en arrière-plan | Non | Non | Oui | Non | Non |

---

<div id="actions">

## Actions

</div>

À utiliser lorsque l'agent doit **effectuer une tâche** en réponse à une entrée utilisateur. Le LLM sélectionne les actions parmi les options enregistrées en se basant sur la description et les exemples.

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

**Idéal pour :** Appels API, mutations de données, utilisation d'outils, opérations sur les fichiers, intégration de services externes

---

<div id="providers">

## Providers

</div>

À utiliser lorsque vous devez **injecter des informations** dans le contexte de l'agent avant chaque réponse. Les Providers s'exécutent automatiquement à chaque cycle d'inférence.

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

**Idéal pour :** Données en temps réel, préférences utilisateur, état du système, requêtes en base de données, contexte d'environnement

---

<div id="services">

## Services

</div>

À utiliser lorsque vous avez besoin d'un **processus en arrière-plan de longue durée** avec un cycle de vie de démarrage et d'arrêt.

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

**Idéal pour :** Connexions WebSocket, polling, tâches cron, consommateurs de files d'attente, gestion du cache

---

<div id="skills">

## Skills

</div>

À utiliser lorsque vous souhaitez **étendre le comportement de l'agent avec des instructions** plutôt que du code exécutable. Les Skills sont basés sur le markdown et ne nécessitent pas TypeScript.

```markdown
---
name: git-helper
description: Help users with git commands and workflows
---

When asked about git, provide clear explanations and commands.
Always suggest safe operations first (status, log, diff before reset, force-push).
```

**Idéal pour :** Connaissances du domaine, flux de travail, ensembles d'instructions, ingénierie de prompts, procédures de tâches

---

<div id="routes">

## Routes

</div>

À utiliser lorsque vous devez exposer des **endpoints HTTP** depuis votre plugin.

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

**Idéal pour :** Webhooks, pages de statut, APIs de plugins, service de fichiers, intégrations externes

---

<div id="event-handlers">

## Event Handlers

</div>

À utiliser lorsque vous devez **réagir aux événements du système** (messages, connexions, actions).

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

Événements disponibles : `MESSAGE_RECEIVED`, `VOICE_MESSAGE_RECEIVED`, `WORLD_CONNECTED`, `WORLD_JOINED`, `ACTION_STARTED`, `ACTION_COMPLETED`

**Idéal pour :** Journalisation, analytique, effets de bord, notifications, pistes d'audit

---

<div id="evaluators">

## Evaluators

</div>

À utiliser lorsque vous devez **évaluer la qualité des réponses** ou déclencher des actions de suivi après la réponse de l'agent.

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

**Idéal pour :** Surveillance de la qualité, vérifications de conformité, signaux d'apprentissage, effets de bord post-réponse

---

<div id="combining-extension-points">

## Combinaison des points d'extension

</div>

De nombreux plugins utilisent plusieurs points d'extension ensemble :

| Type de plugin | Combinaison typique |
|-------------|-------------------|
| Intégration API | Action (appels API) + Provider (contexte d'état) + Service (renouvellement de tokens) |
| Connecteur de plateforme | Service (cycle de vie de connexion) + Event Handler (messages) + Route (webhooks) |
| Surveillance | Evaluator (vérifications de qualité) + Provider (contexte de métriques) + Route (tableau de bord) |
| Connaissance | Provider (injection de contexte) + Skill (instructions) |

---

<div id="related">

## Ressources associées

</div>

- [Créer un Plugin](/fr/plugins/create-a-plugin) -- Construire un plugin de zéro
- [Développement de Plugins](/fr/plugins/development) -- Référence complète de l'API pour tous les points d'extension
- [Documentation des Skills](/fr/plugins/skills) -- Plongée approfondie dans les skills
- [Patrons de Plugins](/fr/plugins/patterns) -- Patrons d'implémentation courants

---
title: Guide du Registre de Plugins
description: Comment découvrir, configurer, soumettre et maintenir des plugins dans le registre de plugins Milady/elizaOS.
---

# Guide du Registre de Plugins

Le registre de plugins est l'index central des plugins elizaOS disponibles. Ce guide couvre la découverte, l'utilisation et la soumission de plugins au registre.

<div id="table-of-contents">

## Table des Matières

</div>

1. [Qu'est-ce que le Registre ?](#what-is-the-registry)
2. [Découvrir des Plugins](#discovering-plugins)
3. [Utiliser des Plugins](#using-plugins)
4. [Manifeste de Plugin](#plugin-manifest)
5. [Soumettre des Plugins](#submitting-plugins)
6. [Catégories de Plugins](#plugin-categories)
7. [Conventions de Nommage](#naming-conventions)

---

<div id="what-is-the-registry">

## Qu'est-ce que le Registre ?

</div>

Le registre de plugins est :

- **Un index JSON** (`plugins.json`) listant tous les plugins connus
- **Des métadonnées** incluant le nom, la description, la catégorie et la configuration
- **Un système de découverte** pour trouver et charger des plugins

Milady est livré avec un `plugins.json` intégré contenant plus de 90 plugins de l'écosystème elizaOS.

---

<div id="discovering-plugins">

## Découvrir des Plugins

</div>

<div id="list-available-plugins">

### Lister les Plugins Disponibles

</div>

```bash
milady plugins list
```

<div id="search-plugins">

### Rechercher des Plugins

</div>

```bash
milady plugins list --search telegram
```

<div id="view-plugin-details">

### Voir les Détails d'un Plugin

</div>

```bash
milady plugins info telegram
```

<div id="browse-by-category">

### Parcourir par Catégorie

</div>

```bash
milady plugins list --category connector
milady plugins list --category model
milady plugins list --category tool
```

<div id="programmatic-access">

### Accès Programmatique

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

## Utiliser des Plugins

</div>

<div id="install-via-npm">

### Installer via npm

</div>

La plupart des plugins sont des paquets npm :

```bash
# Install the Telegram connector
bun add @elizaos/plugin-telegram
```

<div id="configure-in-miladyjson">

### Configurer dans milady.json

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

### Variables d'Environnement

</div>

La plupart des plugins nécessitent une configuration via des variables d'environnement :

```bash
# .env or environment
TELEGRAM_BOT_TOKEN=your-bot-token
DISCORD_BOT_TOKEN=your-discord-token
OPENAI_API_KEY=sk-...
```

<div id="auto-enable-based-on-credentials">

### Activation Automatique Basée sur les Identifiants

</div>

Milady peut activer automatiquement les plugins lorsque leurs identifiants requis sont présents :

```json
{
  "plugins": {
    "autoEnable": true
  }
}
```

Avec `autoEnable`, si `TELEGRAM_BOT_TOKEN` est défini, le plugin Telegram se charge automatiquement.

---

<div id="plugin-manifest">

## Manifeste de Plugin

</div>

Chaque plugin dans le registre possède une entrée de manifeste :

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

### Champs du Manifeste

</div>

| Champ | Description |
|-------|-------------|
| `id` | Identifiant court (ex., `telegram`) |
| `dirName` | Nom du répertoire dans le dépôt |
| `name` | Nom lisible par l'humain |
| `npmName` | Nom du paquet npm |
| `description` | Ce que fait le plugin |
| `category` | Catégorie du plugin |
| `envKey` | Variable d'environnement principale |
| `configKeys` | Toutes les clés de configuration |
| `version` | Version actuelle |
| `pluginDeps` | Autres plugins dont il dépend |
| `pluginParameters` | Définitions détaillées des paramètres |

---

<div id="submitting-plugins">

## Soumettre des Plugins

</div>

<div id="option-1-official-plugins-elizaos">

### Option 1 : Plugins Officiels (@elizaos)

</div>

Pour que les plugins soient inclus dans l'espace de noms officiel `@elizaos` :

1. **Créez une PR** dans l'organisation [elizaos-plugins](https://github.com/elizaos-plugins)
2. **Suivez les conventions** (voir ci-dessous)
3. **Incluez des tests** et de la documentation
4. **Passez la revue** des mainteneurs

<div id="option-2-community-plugins">

### Option 2 : Plugins Communautaires

</div>

Publiez sur npm avec un nommage communautaire :

```json
{
  "name": "elizaos-plugin-my-feature",
  "version": "1.0.0"
}
```

Ou utilisez un paquet scopé :

```json
{
  "name": "@yourorg/elizaos-plugin-my-feature"
}
```

<div id="option-3-local-registry">

### Option 3 : Registre Local

</div>

Pour des plugins privés/internes, maintenez un registre local :

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

## Catégories de Plugins

</div>

<div id="connector">

### connector

</div>

Intégrations de services externes et plateformes de messagerie.

| Plugin | Description |
|--------|-------------|
| `telegram` | Bot Telegram |
| `discord` | Bot Discord |
| `slack` | Intégration Slack |
| `twitter` | Twitter/X |
| `whatsapp` | WhatsApp (via Baileys) |
| `signal` | Messagerie Signal |
| `imessage` | iMessage (macOS) |

<div id="model">

### model

</div>

Fournisseurs de modèles d'IA et inférence.

| Plugin | Description |
|--------|-------------|
| `openai` | Modèles GPT d'OpenAI |
| `anthropic` | Modèles Claude |
| `ollama` | Modèles locaux Ollama |
| `groq` | Inférence Groq |
| `openrouter` | Passerelle OpenRouter |
| `google-genai` | Google Gemini |

<div id="tool">

### tool

</div>

Utilitaires et capacités.

| Plugin | Description |
|--------|-------------|
| `browser` | Navigation web |
| `shell` | Exécution de commandes shell |
| `code` | Génération/exécution de code |
| `repoprompt` | Orchestration CLI RepoPrompt |
| `vision` | Analyse d'images |
| `knowledge` | RAG/base de connaissances |
| `mcp` | Model Context Protocol |

<div id="memory">

### memory

</div>

Systèmes de stockage et de mémoire.

| Plugin | Description |
|--------|-------------|
| `sql` | Adaptateur de base de données SQL |
| `local-embedding` | Génération locale d'embeddings |

<div id="automation">

### automation

</div>

Planification et automatisation.

| Plugin | Description |
|--------|-------------|
| `cron` | Tâches planifiées |
| `scheduling` | Intégration de calendrier |

---

<div id="naming-conventions">

## Conventions de Nommage

</div>

<div id="package-names">

### Noms de Paquets

</div>

**Plugins officiels :**
```
@elizaos/plugin-{feature}
```

Exemples :
- `@elizaos/plugin-telegram`
- `@elizaos/plugin-openai`
- `@elizaos/plugin-browser`

**Plugins communautaires :**
```
elizaos-plugin-{feature}
@yourorg/plugin-{feature}
```

Exemples :
- `elizaos-plugin-my-integration`
- `@acme/plugin-internal-tool`

<div id="plugin-ids">

### IDs de Plugin

</div>

Identifiants courts en minuscules :

```
telegram
discord
openai
my-feature
```

<div id="action-names">

### Noms d'Actions

</div>

MAJUSCULES_AVEC_UNDERSCORES :

```
SEND_MESSAGE
GENERATE_IMAGE
FETCH_DATA
```

---

<div id="plugin-configuration-schema">

## Schéma de Configuration de Plugin

</div>

Les plugins peuvent définir leur schéma de configuration pour la génération d'UI :

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

### Types de Paramètres

</div>

| Type | Description |
|------|-------------|
| `string` | Valeur texte |
| `number` | Valeur numérique |
| `boolean` | Vrai/faux |

<div id="parameter-flags">

### Indicateurs de Paramètres

</div>

| Indicateur | Description |
|------------|-------------|
| `required` | Doit être fourni |
| `sensitive` | Doit être masqué dans l'UI (mots de passe, tokens) |

---

<div id="regenerating-the-registry">

## Régénérer le Registre

</div>

Si vous maintenez un fork ou un registre personnalisé :

```bash
# Generate plugins.json from installed plugins
pnpm generate:plugins
```

Ceci scanne `node_modules/@elizaos/plugin-*` et génère un index mis à jour.

---

<div id="examples">

## Exemples

</div>

<div id="finding-a-model-provider">

### Trouver un Fournisseur de Modèles

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

### Ajouter Plusieurs Connecteurs

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

### Utiliser des Plugins Communautaires

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

## Prochaines Étapes

</div>

- [Guide de Développement de Plugins](/fr/plugins/development) — Créez vos propres plugins
- [Développement Local de Plugins](/fr/plugins/local-plugins) — Développez sans publier
- [Guide de Contribution](./contributing.md) — Soumettez des plugins en amont

---

<div id="registry-runbook">

## Manuel d'Opérations du Registre

</div>

<div id="setup-checklist">

### Liste de Vérification de Configuration

</div>

1. Assurez-vous que les métadonnées du plugin existent et sont valides dans `plugins.json`.
2. Assurez-vous que les paquets installables se résolvent depuis npm ou votre registre interne.
3. Assurez-vous que les clés d'environnement requises pour chaque plugin sont documentées dans le manifeste.
4. Pour les opérations de registre on-chain, définissez `EVM_PRIVATE_KEY` et configurez `mainnetRpc`, `registryAddress` et `collectionAddress` dans la configuration de l'agent.
5. Vérifiez que le répertoire d'installation des plugins est accessible en écriture : `ls -ld ~/.milady/plugins/installed/`.

<div id="failure-modes">

### Modes de Défaillance

</div>

**Recherche dans le registre de plugins :**

- La recherche dans le registre ne retourne aucun résultat :
  Confirmez que `plugins.json` est à jour et que les IDs des plugins sont correctement orthographiés.
- L'installation réussit mais le plugin ne se charge pas :
  Confirmez que les clés d'environnement requises sont définies et que le plugin est activé dans `plugins.allow` ou `plugins.entries`.
- Décalage de version entre le manifeste et le paquet :
  Régénérez les métadonnées du registre et validez le manifeste mis à jour.

**Résolution et installation NPM :**

- `npm pack` ou `bun install` échoue pendant l'installation du plugin :
  Vérifiez la connectivité réseau au registre npm. L'installateur se rabat sur un clone git direct si npm échoue — si les deux échouent, la spécification du paquet est probablement invalide.
- Point d'entrée introuvable après l'installation :
  L'installateur vérifie la présence de `package.json` dans le répertoire cible. Confirmez que le paquet possède un champ `main` ou `module` valide, ou que `index.js`/`index.ts` existe à la racine du paquet.
- Corruption par installation concurrente :
  L'installateur utilise un verrou de sérialisation. Si une installation précédente a planté, l'état de verrou obsolète peut bloquer les nouvelles installations. Redémarrez l'agent pour effacer les verrous en mémoire.

**Opérations de registre/drop on-chain :**

- La transaction est annulée ou expire :
  Vérifiez que `EVM_PRIVATE_KEY` dispose d'un solde de gas suffisant. Confirmez que `mainnetRpc` est accessible et n'est pas limité en débit. Le service tx réessaie avec du gas croissant — si toutes les tentatives échouent, l'erreur inclut la raison de l'annulation.
- L'appel au contrat du registre retourne des données vides :
  Confirmez que `registryAddress` et `collectionAddress` pointent vers des contrats déployés sur la bonne chaîne. Utilisez un explorateur de blocs pour vérifier l'état du contrat.
- Conflit de nonce sur des transactions séquentielles rapides :
  Le service tx gère le nonce localement. Si une transaction de portefeuille externe modifie le nonce, redémarrez l'agent pour resynchroniser.

<div id="recovery-procedures">

### Procédures de Récupération

</div>

1. **État obsolète du plugin :** Supprimez `~/.milady/plugins/installed/<plugin-name>/` et retirez l'entrée de `milady.json` sous `plugins.installs`, puis réinstallez.
2. **Métadonnées du registre désynchronisées :** Exécutez `milady plugin sync` ou mettez manuellement à jour `plugins.json` depuis le registre en amont.
3. **Transaction on-chain bloquée :** Vérifiez la transaction en attente sur un explorateur de blocs. Si elle est bloquée, l'agent réessaiera avec plus de gas lors de la prochaine tentative. Accélérer manuellement via le portefeuille est sûr — l'agent relit le nonce lors du prochain appel.

<div id="verification-commands">

### Commandes de Vérification

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

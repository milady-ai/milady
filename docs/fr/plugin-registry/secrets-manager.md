---
title: "Plugin Gestionnaire de Secrets"
sidebarTitle: "Secrets Manager"
description: "Stockage sécurisé des secrets, mappage de variables d'environnement, injection de secrets à l'exécution et chiffrement pour les agents Milady."
---

Le plugin Secrets Manager fournit un stockage sécurisé et chiffré pour les clés API et autres valeurs de configuration sensibles. Il est chargé tôt dans la séquence de démarrage — avant tout plugin de connecteur ou de fournisseur — afin que les secrets soient disponibles au moment de l'initialisation des plugins.

**Package:** `@elizaos/plugin-secrets-manager` (importé statiquement — disponible mais pas dans l'ensemble par défaut des plugins principaux ; pourrait être réactivé dans une version future)

<div id="overview">
## Vue d'ensemble
</div>

Les secrets stockés via le Secrets Manager sont :

- Chiffrés au repos avec AES-256-GCM
- Déchiffrés uniquement à l'exécution lorsqu'ils sont demandés par un plugin autorisé
- Audités — tous les accès aux secrets sont journalisés (nom de la clé uniquement, jamais la valeur)
- Isolés par agent — les secrets ne fuient pas entre les agents

<div id="setting-secrets">
## Configuration des Secrets
</div>

<div id="via-the-admin-panel">
### Via le Panneau d'Administration
</div>

Naviguez vers **Agent → Settings → Secrets** et ajoutez des paires clé-valeur.

<div id="via-the-cli">
### Via le CLI
</div>

```bash
# Open the config file in your editor
$EDITOR "$(milady config path)"
# Add the key under the "secrets" section
```

<div id="via-configuration-file">
### Via le Fichier de Configuration
</div>

Les secrets peuvent être inclus dans `milady.json` (non recommandé pour la production — utilisez plutôt des variables d'environnement) :

```json
{
  "secrets": {
    "OPENAI_API_KEY": "<OPENAI_API_KEY>",
    "TELEGRAM_BOT_TOKEN": "123456:ABC..."
  }
}
```

<div id="via-environment-variables">
### Via les Variables d'Environnement
</div>

Toute variable d'environnement présente au démarrage est automatiquement disponible en tant que secret. Les plugins y accèdent via `runtime.getSetting()` qui vérifie à la fois les secrets stockés et `process.env`.

```bash
OPENAI_API_KEY=sk-... TELEGRAM_BOT_TOKEN=123456:ABC... milady start
```

<div id="accessing-secrets-in-plugins">
## Accès aux Secrets dans les Plugins
</div>

Les plugins doivent toujours utiliser `runtime.getSetting()` plutôt que de lire `process.env` directement. Le Secrets Manager garantit que la valeur correcte est retournée quel que soit le backend de stockage.

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
## Ordre de Résolution des Secrets
</div>

Lorsque `runtime.getSetting("KEY")` est appelé, le Secrets Manager résout dans cet ordre :

1. Secrets spécifiques à l'agent stockés dans la base de données (priorité la plus élevée)
2. Objet `settings.secrets` du fichier de personnage
3. Variables d'environnement `process.env`
4. Secrets globaux depuis `~/.milady/secrets`

<div id="environment-variable-mapping">
## Mappage des Variables d'Environnement
</div>

Le Secrets Manager fait correspondre les noms de variables d'environnement aux exigences des plugins. Lorsqu'un plugin déclare `requiredSecrets` dans son manifeste, le panneau d'administration demande ces valeurs et les stocke de manière sécurisée.

```json
{
  "requiredSecrets": ["OPENAI_API_KEY"],
  "optionalSecrets": ["OPENAI_ORG_ID"]
}
```

<div id="encryption">
## Chiffrement
</div>

Les secrets au repos sont chiffrés avec :

- Algorithme : AES-256-GCM
- Dérivation de clé : PBKDF2-SHA256
- Sel : Sel aléatoire par agent stocké séparément des valeurs chiffrées

La clé de chiffrement est dérivée d'une clé maître qui n'est jamais stockée sur le disque.

<div id="audit-logging">
## Journalisation d'Audit
</div>

Tous les accès aux secrets sont journalisés au niveau `debug` :

```
[secrets-manager] Secret accessed: OPENAI_API_KEY (by: plugin-openai)
```

La valeur réelle du secret n'est jamais journalisée.

<div id="configuration">
## Configuration
</div>

| Paramètre | Description | Défaut |
|---------|-------------|---------|
| `secrets.encryption` | Activer le chiffrement au repos | `true` |
| `secrets.auditLog` | Activer la journalisation d'audit des accès | `true` |

<div id="related">
## Associé
</div>

- [Plugin SQL](/plugin-registry/sql) — Backend de base de données pour le stockage chiffré des secrets
- [Guide de Configuration](/fr/configuration) — Référence complète de configuration
- [Architecture des Plugins](/fr/plugins/architecture) — Comment les secrets sont injectés au démarrage

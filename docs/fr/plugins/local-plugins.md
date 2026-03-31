---
title: "Plugins Locaux"
sidebarTitle: "Plugins Locaux"
description: "Développez des plugins localement sans les publier sur npm."
---

Ce guide couvre le développement de plugins localement sans les publier sur npm : intégrations personnalisées, plugins privés, prototypage rapide et extraction de plugins upstream pour modification.

<div id="table-of-contents">

## Table des Matières

</div>

1. [Emplacements des Plugins](#plugin-locations)
2. [Priorité de Chargement des Plugins](#plugin-loading-priority)
3. [Créer un Plugin Local](#creating-a-local-plugin)
4. [Configuration](#configuration)
5. [Installateur de Plugins](#plugin-installer)
6. [Extraction de Plugins Upstream](#ejecting-upstream-plugins)
7. [Flux de Travail de Développement](#development-workflow)
8. [Débogage](#debugging)
9. [Variables d'Environnement](#environment-variables)
10. [Migration vers npm](#migrating-to-npm)

---

<div id="plugin-locations">

## Emplacements des Plugins

</div>

Milady découvre les plugins à partir de trois emplacements dans le répertoire d'état (`~/.milady/` par défaut) :

<div id="1-ejected-plugins">

### 1. Plugins Extraits

</div>

Plugins upstream clonés localement pour modification :

```
~/.milady/plugins/ejected/<plugin-name>/
```

Ceux-ci sont créés par le système d'extraction (voir [Extraction de Plugins Upstream](#ejecting-upstream-plugins)). Chaque sous-répertoire est un dépôt git complet avec du code source modifiable.

<div id="2-installed-plugins">

### 2. Plugins Installés

</div>

Plugins installés à l'exécution via le gestionnaire de plugins ou le CLI :

```
~/.milady/plugins/installed/<sanitised-name>/
```

Chaque plugin obtient un répertoire isolé avec son propre `package.json` et `node_modules/`. L'installateur crée un `package.json` minimal `{ "private": true, "dependencies": {} }`, puis exécute `bun add <package>` (ou `npm install` en secours) dans ce répertoire.

<div id="3-custom-drop-in-plugins">

### 3. Plugins Personnalisés (Drop-in)

</div>

Plugins écrits manuellement placés directement dans le répertoire personnalisé :

```
~/.milady/plugins/custom/<your-plugin>/
```

Tout sous-répertoire ici contenant un `package.json` est automatiquement découvert au démarrage. C'est la façon la plus simple d'ajouter un plugin local -- il suffit de le déposer et de redémarrer.

<div id="4-extra-load-paths">

### 4. Chemins de Chargement Supplémentaires

</div>

Des répertoires supplémentaires peuvent être spécifiés dans `milady.json` :

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

Chaque répertoire est scanné de la même manière que `plugins/custom/` -- les sous-répertoires contenant un `package.json` sont traités comme des plugins.

<div id="full-directory-layout">

### Structure Complète des Répertoires

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

## Priorité de Chargement des Plugins

</div>

Lorsque plusieurs sources fournissent le même nom de plugin, Milady utilise cette priorité (de la plus haute à la plus basse) :

| Priorité | Source | Chemin | Cas d'utilisation |
|----------|--------|--------|-------------------|
| 1 | **Extrait** | `~/.milady/plugins/ejected/` | Modifier le code source d'un plugin upstream |
| 2 | **Remplacement de workspace** | Mécanisme interne de développement | Contributeurs Milady uniquement |
| 3 | **npm officiel** (avec enregistrement d'installation) | `node_modules/@elizaos/plugin-*` | Les plugins standard `@elizaos/*` préfèrent les copies incluses |
| 4 | **Installé par l'utilisateur** (avec enregistrement d'installation) | `~/.milady/plugins/installed/` | Plugins tiers installés à l'exécution |
| 5 | **Local @milady** | `src/plugins/` (dist compilé) | Plugins intégrés de Milady |
| 6 | **npm de secours** | `import(name)` | Importation dynamique en dernier recours |

Les plugins personnalisés/drop-in sont fusionnés dans les enregistrements d'installation avant la résolution, ils participent donc aux priorités 3-4 selon leur nom de paquet.

La liste de refus (`plugins.deny` dans `milady.json`) a une priorité absolue -- les plugins refusés ne sont jamais chargés quelle que soit leur source.

---

<div id="creating-a-local-plugin">

## Créer un Plugin Local

</div>

<div id="step-1-create-the-directory">

### Étape 1 : Créer le Répertoire

</div>

```bash
mkdir -p ~/.milady/plugins/custom/my-plugin/src
cd ~/.milady/plugins/custom/my-plugin
```

<div id="step-2-initialize-packagejson">

### Étape 2 : Initialiser package.json

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

### Étape 3 : Ajouter tsconfig.json

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

### Étape 4 : Écrire le Plugin

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

### Étape 5 : Installer les Dépendances et Compiler

</div>

```bash
cd ~/.milady/plugins/custom/my-plugin
bun install
bun run build
```

<div id="step-6-restart-milady">

### Étape 6 : Redémarrer Milady

</div>

```bash
# If running in terminal
milady start

# Or restart via the agent chat
# Type: /restart
```

Au démarrage, vous devriez voir dans les journaux :

```
[milady] Discovered 1 custom plugin(s): my-plugin
```

---

<div id="configuration">

## Configuration

</div>

<div id="allow-and-deny-lists">

### Listes d'Autorisation et de Refus

</div>

Contrôlez quels plugins se chargent via `milady.json` :

```json
{
  "plugins": {
    "allow": ["my-plugin", "telegram", "@elizaos/plugin-discord"],
    "deny": ["@elizaos/plugin-shell"]
  }
}
```

Lorsque `allow` est défini, seuls les plugins listés sont chargés (plus les plugins principaux). La liste `deny` l'emporte toujours -- un plugin refusé n'est jamais chargé même s'il apparaît dans `allow`.

Les noms de plugins peuvent être spécifiés comme :
- Nom complet du paquet : `@elizaos/plugin-telegram`
- Identifiant court : `telegram` (se résout en `@elizaos/plugin-telegram`)
- Nom personnalisé : `my-plugin` (correspond au champ `name` dans le `package.json` de votre plugin)

<div id="per-plugin-settings">

### Paramètres par Plugin

</div>

Configurez les plugins individuellement sous `plugins.entries` :

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

Définir `enabled: false` sur une entrée empêche ce plugin de se charger, même si la logique d'activation automatique l'activerait autrement.

<div id="auto-enable-system">

### Système d'Activation Automatique

</div>

Milady active automatiquement les plugins en fonction de votre configuration :

- **Plugins de connecteur** : Si un connecteur (telegram, discord, slack, etc.) a des identifiants configurés sous `connectors`, son plugin est automatiquement activé.
- **Plugins de fournisseur** : Si une variable d'environnement de clé API est définie (par exemple, `ANTHROPIC_API_KEY`), le plugin de fournisseur correspondant est automatiquement activé.
- **Plugins de fonctionnalité** : Si un indicateur de fonctionnalité est activé sous `features`, son plugin est automatiquement activé.

Cela se produit au démarrage via `applyPluginAutoEnable()` et ne modifie pas votre fichier de configuration -- cela n'affecte que l'ensemble de plugins en mémoire pour cette session.

---

<div id="plugin-installer">

## Installateur de Plugins

</div>

L'installateur de plugins (`plugin-installer.ts`) gère l'installation à l'exécution des plugins depuis le registre.

<div id="how-it-works">

### Comment Ça Fonctionne

</div>

1. **Résout** le nom du plugin dans le registre de plugins
2. **Installe** via `bun add` (préféré) ou `npm install` (secours) dans un répertoire isolé à `~/.milady/plugins/installed/<sanitised-name>/`
3. **Se rabat** sur `git clone` si l'installation npm échoue
4. **Valide** que le plugin installé a un point d'entrée résolvable
5. **Enregistre** l'installation dans `milady.json` sous `plugins.installs`
6. **Déclenche** un redémarrage de l'agent pour charger le nouveau plugin

<div id="package-name-sanitisation">

### Assainissement du Nom de Paquet

</div>

L'installateur assainit les noms de paquets pour les noms de répertoire en remplaçant les caractères non alphanumériques (sauf `.`, `-`, `_`) par des underscores. Par exemple, `@elizaos/plugin-twitter` devient `_elizaos_plugin-twitter`.

<div id="install-record">

### Enregistrement d'Installation

</div>

Chaque plugin installé est suivi dans `milady.json` :

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

### Sérialisation

</div>

L'installateur utilise un verrou de sérialisation pour empêcher les installations concurrentes de corrompre la configuration. Les demandes d'installation multiples sont mises en file d'attente et exécutées séquentiellement.

<div id="uninstalling">

### Désinstallation

</div>

La désinstallation supprime le répertoire du plugin du disque et efface son enregistrement de `milady.json`. Les plugins principaux/intégrés ne peuvent pas être désinstallés. Le désinstallateur refuse de supprimer des répertoires en dehors de `~/.milady/plugins/installed/` par mesure de sécurité.

---

<div id="ejecting-upstream-plugins">

## Extraction de Plugins Upstream

</div>

Le système d'extraction vous permet de cloner le code source d'un plugin upstream, de le modifier et de faire charger par Milady votre copie locale à la place du paquet npm.

<div id="eject-via-agent-chat">

### Extraire via le Chat de l'Agent

</div>

```
eject the telegram plugin so I can edit its source
```

<div id="eject-manually">

### Extraire Manuellement

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

### Suivi de l'Upstream

</div>

Chaque plugin extrait a un `.upstream.json` à sa racine :

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

### Synchronisation avec l'Upstream

</div>

```bash
cd ~/.milady/plugins/ejected/plugin-telegram
git fetch origin
git pull --rebase origin 1.x
bun run build
```

Ou via le chat de l'agent : `sync the ejected telegram plugin`

<div id="reverting-reinject">

### Réversion (Réinjection)

</div>

Supprimez le répertoire extrait pour revenir à la version npm :

```bash
rm -rf ~/.milady/plugins/ejected/plugin-telegram
# Restart milady -- it will load the npm version again
```

Ou via le chat de l'agent : `reinject the telegram plugin`

---

<div id="development-workflow">

## Flux de Travail de Développement

</div>

<div id="edit-build-restart-cycle">

### Cycle Éditer-Compiler-Redémarrer

</div>

La boucle de développement standard pour les plugins locaux :

```bash
# Terminal 1: Watch and rebuild on changes
cd ~/.milady/plugins/custom/my-plugin
bun run dev  # runs tsc --watch

# Terminal 2: Run milady
milady start
```

Après avoir fait des modifications, le surveillant TypeScript recompile `dist/` automatiquement. Vous devez encore redémarrer l'agent pour charger la nouvelle compilation :

- Tapez `/restart` dans le chat de l'agent, ou
- Appuyez sur Ctrl+C et exécutez `milady start` à nouveau

<div id="testing-your-plugin">

### Tester Votre Plugin

</div>

Chattez avec l'agent et déclenchez votre action :

```
You: Greet me as Alice
Agent: Hello, Alice! Welcome to Milady.
```

Vérifiez les journaux pour le message d'initialisation de votre plugin et toute sortie de débogage.

<div id="quick-iteration-without-tsc---watch">

### Itération Rapide Sans tsc --watch

</div>

Si vous préférez les compilations manuelles :

```bash
cd ~/.milady/plugins/custom/my-plugin
bun run build && milady start
```

<div id="using-source-directly-development-only">

### Utiliser le Code Source Directement (Développement Uniquement)

</div>

Pour le prototypage rapide, vous pouvez pointer `main` vers le code source TypeScript :

```json
{
  "main": "src/index.ts"
}
```

L'environnement d'exécution de Milady peut importer des fichiers TypeScript directement en mode développement. Passez à `dist/index.js` avant de distribuer.

<div id="configuration-driven-loading">

### Chargement Basé sur la Configuration

</div>

Chargez un plugin depuis n'importe quel chemin en utilisant `milady.json` :

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

Le chemin prend en charge l'expansion du tilde (`~/`) et les chemins relatifs et absolus. Ceci est utile lorsque votre plugin se trouve en dehors des répertoires de plugins standard.

<div id="rapid-iteration-tips">

### Conseils pour l'Itération Rapide

</div>

1. **Utilisez `LOG_LEVEL=debug`** pour voir les journaux de chargement, découverte et initialisation des plugins
2. **Vérifiez l'ordre de chargement des plugins** dans les journaux de débogage -- cherchez `Loading plugin: your-plugin-name`
3. **Testez les actions via le chat** -- tapez des messages qui déclenchent la fonction de validation de votre action
4. **Utilisez l'API REST** pour les tests programmatiques :

```bash
# List loaded plugins
curl http://localhost:18789/api/plugins

# Search the registry
curl http://localhost:18789/api/registry/search?q=my-plugin
```

5. **Exécutez plusieurs instances** avec différentes configurations en utilisant `ELIZAOS_CONFIG_DIR` :

```bash
# Instance with your dev plugin
ELIZAOS_CONFIG_DIR=./config-dev milady start

# Instance with production plugins
ELIZAOS_CONFIG_DIR=./config-prod milady start
```

---

<div id="debugging">

## Débogage

</div>

<div id="log-levels">

### Niveaux de Journalisation

</div>

Milady lit le niveau de journalisation à partir de la variable d'environnement `LOG_LEVEL` ou de `logging.level` dans la configuration. Si `LOG_LEVEL` est défini dans l'environnement, il a priorité sur la valeur de configuration.

```bash
# Verbose logging via environment variable
LOG_LEVEL=debug milady start
```

Ou définissez-le dans `milady.json` :

```json
{
  "logging": {
    "level": "debug"
  }
}
```

Niveaux disponibles : `debug`, `info`, `warn`, `error` (par défaut).

<div id="plugin-logging">

### Journalisation des Plugins

</div>

Utilisez le logger de l'environnement d'exécution dans votre plugin :

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

Activez les source maps pour obtenir des traces de pile lisibles pointant vers votre code source TypeScript :

```bash
NODE_OPTIONS="--enable-source-maps" milady start
```

Assurez-vous que `"sourceMap": true` est défini dans votre `tsconfig.json` (inclus dans le modèle ci-dessus).

<div id="vs-code-debugging">

### Débogage avec VS Code

</div>

Créez `.vscode/launch.json` dans votre projet :

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

Placez des points d'arrêt dans les fichiers TypeScript de votre plugin et lancez avec F5.

<div id="common-issues">

### Problèmes Courants

</div>

**Le plugin n'est pas découvert au démarrage :**
- Vérifiez que le répertoire du plugin est directement sous `~/.milady/plugins/custom/` (pas imbriqué plus profondément)
- Confirmez que `package.json` existe et a un champ `name`
- Vérifiez que `main` dans `package.json` pointe vers un fichier existant
- Cherchez `[milady] Discovered N custom plugin(s)` dans les journaux de démarrage

**Le plugin est découvert mais ne se charge pas :**
- Exécutez `bun run build` -- le répertoire `dist/` peut être manquant
- Vérifiez que l'export par défaut est un objet Plugin valide avec `name` et `description`
- Vérifiez les erreurs d'importation dans les journaux : `LOG_LEVEL=debug milady start`

**Le plugin est refusé ou filtré :**
- Vérifiez `plugins.deny` dans `milady.json` -- le nom de votre plugin peut y figurer
- Si `plugins.allow` est défini, votre plugin doit être dans la liste d'autorisation
- Vérifiez que `plugins.entries.<name>.enabled` n'est pas défini sur `false`

**Erreurs de compilation TypeScript :**
```bash
cd ~/.milady/plugins/custom/my-plugin
bun run tsc --noEmit  # Type-check without emitting
```

---

<div id="environment-variables">

## Variables d'Environnement

</div>

Ces variables d'environnement affectent les chemins et le comportement des plugins. Elles sont définies dans `src/config/paths.ts`.

| Variable | Par défaut | Description |
|----------|------------|-------------|
| `MILADY_STATE_DIR` | `~/.milady` | Remplace le répertoire d'état. Change l'emplacement de stockage des plugins, de la configuration et des identifiants. |
| `MILADY_CONFIG_PATH` | `~/.milady/milady.json` | Remplace directement le chemin du fichier de configuration. |
| `MILADY_OAUTH_DIR` | `~/.milady/credentials` | Remplace le répertoire des identifiants OAuth. |
| `LOG_LEVEL` | `error` | Définit la verbosité de la journalisation : `debug`, `info`, `warn`, `error`. |
| `MILADY_DISABLE_WORKSPACE_PLUGIN_OVERRIDES` | non défini | Définir à `1` pour désactiver les remplacements de plugins du workspace (mécanisme de développement uniquement). |
| `ELIZAOS_CONFIG_DIR` | non défini | Remplace le répertoire de configuration d'elizaOS core. Utile pour exécuter plusieurs instances d'agents avec différentes configurations de plugins. |

Lorsque `MILADY_STATE_DIR` est défini, tous les chemins dérivés changent en conséquence :
- Plugins : `$MILADY_STATE_DIR/plugins/installed/`, `$MILADY_STATE_DIR/plugins/custom/`, `$MILADY_STATE_DIR/plugins/ejected/`
- Configuration : `$MILADY_STATE_DIR/milady.json` (sauf si `MILADY_CONFIG_PATH` est également défini)
- Cache des modèles : `$MILADY_STATE_DIR/models/`

---

<div id="migrating-to-npm">

## Migration vers npm

</div>

Lorsque votre plugin est prêt pour la distribution :

<div id="1-update-packagejson">

### 1. Mettre à Jour package.json

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

### 2. Compiler et Publier

</div>

```bash
cd ~/.milady/plugins/custom/my-plugin
bun run build
npm pack              # Preview what gets published
npm publish --access public
```

<div id="3-install-via-milady">

### 3. Installer via Milady

</div>

Une fois publié, installez via le chat de l'agent ou directement dans la configuration :

```json
{
  "plugins": {
    "allow": ["@yourorg/plugin-my-feature"]
  }
}
```

Supprimez la copie locale de `~/.milady/plugins/custom/` pour éviter de charger les deux versions.

---

<div id="next-steps">

## Prochaines Étapes

</div>

- [Guide de Développement de Plugins](/fr/plugins/development) -- Référence complète de l'API des plugins
- [Documentation des Skills](/fr/plugins/skills) -- Extensions plus légères
- [Guide de Contribution](/fr/guides/contribution-guide) -- Contribuer des plugins upstream

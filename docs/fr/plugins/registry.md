---
title: "Registre de Plugins"
sidebarTitle: "Registre"
description: "Comment Milady découvre, met en cache et résout les plugins depuis le registre distant."
---

Le registre de plugins est le système qui découvre, met en cache et résout les plugins et applications pour les agents Milady. Il combine un index local intégré avec un registre distant hébergé sur GitHub, utilisant un cache à 3 niveaux pour fonctionner hors ligne, dans les bundles d'applications de bureau et en développement.

<div id="table-of-contents">

## Table des Matières

</div>

1. [Qu'est-ce que le Registre ?](#what-is-the-registry)
2. [Cache à 3 Niveaux](#3-tier-caching)
3. [Registre Distant](#remote-registry)
4. [Résolution de Plugins](#plugin-resolution)
5. [Commandes CLI](#cli-commands)
6. [Champs du Manifeste de Plugin](#plugin-manifest-fields)
7. [Registre d'Apps](#apps-registry)
8. [Accès Programmatique](#programmatic-access)

---

<div id="what-is-the-registry">

## Qu'est-ce que le Registre ?

</div>

Le registre comporte deux couches :

<div id="bundled-registry-pluginsjson">

### Registre Intégré (`plugins.json`)

</div>

Un fichier JSON local livré avec Milady contenant les métadonnées de ~97 plugins de l'écosystème elizaOS. Chaque entrée inclut l'id du plugin, le nom du paquet npm, la catégorie, les variables d'environnement, la version, les dépendances et les définitions détaillées des paramètres. Ce fichier suit le schéma `plugin-index-v1`.

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

Le `plugins.json` intégré est utilisé par la commande `milady plugins config` pour rechercher les définitions de paramètres, les clés d'environnement et les indications d'interface pour la configuration des plugins.

<div id="remote-registry-github">

### Registre Distant (GitHub)

</div>

Le registre distant est hébergé sur le dépôt GitHub `elizaos-plugins/registry` sur la branche `next`. Le client du registre récupère les données depuis deux endpoints distants :

| Endpoint | URL | Format |
|----------|-----|--------|
| **Primaire** | `https://raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json` | JSON enrichi avec infos git, versions npm, étoiles, sujets, métadonnées d'apps |
| **Secours** | `https://raw.githubusercontent.com/elizaos-plugins/registry/next/index.json` | Mappage minimal nom vers référence git |

Le `generated-registry.json` primaire contient un objet `registry` indexé par nom de paquet, chaque entrée fournissant :

- Dépôt Git, branches pour v0/v1/v2
- Nom du paquet npm et chaînes de version pour v0/v1/v2
- Indicateurs de support de version (`supports: { v0, v1, v2 }`)
- Description, page d'accueil, sujets, nombre d'étoiles, langage
- Métadonnées d'app (pour les entrées avec `kind: "app"`)

Si l'endpoint primaire échoue, le client se rabat sur `index.json`, qui est un `Record<string, string>` plat mappant les noms de paquets vers des références `github:owner/repo`. Ce secours fournit uniquement les coordonnées git sans métadonnées enrichies.

---

<div id="3-tier-caching">

## Cache à 3 Niveaux

</div>

Le client du registre (`src/services/registry-client.ts`) utilise une stratégie de résolution à 3 niveaux pour minimiser les requêtes réseau et supporter le fonctionnement hors ligne :

```
Memory Cache  -->  File Cache  -->  Network Fetch
  (in-process)     (~/.milady/     (GitHub raw)
                    cache/
                    registry.json)
```

<div id="tier-1-memory-cache">

### Niveau 1 : Cache Mémoire

</div>

Un `Map<string, RegistryPluginInfo>` en processus maintenu dans l'état au niveau du module. Vérifié en premier à chaque appel à `getRegistryPlugins()`. Invalidé après l'expiration du TTL.

<div id="tier-2-file-cache">

### Niveau 2 : Cache Fichier

</div>

Un fichier JSON situé à `~/.milady/cache/registry.json` contenant la carte des plugins sérialisée et un horodatage `fetchedAt`. Vérifié quand le cache mémoire est vide ou expiré. Écrit de manière asynchrone après chaque récupération réseau réussie.

Le cache fichier stocke les entrées sous la forme `{ fetchedAt: number, plugins: Array<[string, RegistryPluginInfo]> }` et est invalidé quand le TTL expire.

<div id="tier-3-network-fetch">

### Niveau 3 : Récupération Réseau

</div>

Récupère `generated-registry.json` depuis GitHub (avec repli sur `index.json`). Atteint uniquement quand les caches mémoire et fichier sont tous deux vides ou expirés.

<div id="cache-ttl">

### TTL du Cache

</div>

Tous les niveaux partagent un TTL d'1 heure (`3_600_000` ms). Après expiration, le prochain appel à `getRegistryPlugins()` cascade à travers les niveaux jusqu'à obtenir des données fraîches.

<div id="force-refresh">

### Rafraîchissement Forcé

</div>

Appelez `refreshRegistry()` pour vider le cache mémoire et le cache fichier, puis récupérer depuis le réseau :

```typescript
import { refreshRegistry } from "milady/services/registry-client";

const plugins = await refreshRegistry();
```

Ou depuis la CLI :

```bash
milady plugins refresh
```

---

<div id="plugin-resolution">

## Résolution de Plugins

</div>

Lors de la recherche d'un plugin par nom via `getPluginInfo(name)`, le client du registre essaie trois stratégies dans l'ordre :

1. **Correspondance exacte** -- recherche le nom directement dans la carte du registre (ex., `@elizaos/plugin-telegram`)
2. **Préfixe @elizaos/** -- si le nom ne commence pas par `@`, ajoute `@elizaos/` et réessaie (ex., `plugin-telegram` devient `@elizaos/plugin-telegram`)
3. **Scan de suffixe simple** -- supprime tout préfixe de scope de l'entrée et scanne toutes les clés du registre pour en trouver une se terminant par `/<bare-name>` (ex., `plugin-telegram` correspond à `@elizaos/plugin-telegram`)

La CLI normalise également l'entrée de l'utilisateur via `normalizePluginName()` :

- `@scope/plugin-x` -- utilisé tel quel
- `plugin-x` -- utilisé tel quel
- `x` -- étendu en `@elizaos/plugin-x`

L'épinglage de version est supporté avec le séparateur `@` :

```bash
milady plugins install twitter@1.2.3
milady plugins install @custom/plugin-x@2.0.0
milady plugins install twitter@next    # dist-tags work too
```

---

<div id="cli-commands">

## Commandes CLI

</div>

Toutes les commandes de plugins sont sous `milady plugins`. Exécutez `milady plugins --help` pour la liste complète.

<div id="milady-plugins-list">

### `milady plugins list`

</div>

Liste tous les plugins du registre distant.

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

Recherche dans le registre par mot-clé avec scoring de pertinence.

```bash
milady plugins search "discord bot"
milady plugins search openai --limit 5
```

Les résultats affichent un pourcentage de correspondance basé sur le scoring entre nom, description et sujets.

<div id="milady-plugins-info-name">

### `milady plugins info <name>`

</div>

Affiche des informations détaillées sur un plugin spécifique : dépôt, page d'accueil, langage, étoiles, sujets, versions npm et versions d'elizaOS supportées.

```bash
milady plugins info telegram
milady plugins info @elizaos/plugin-openai
```

<div id="milady-plugins-install-name">

### `milady plugins install <name>`

</div>

Installe un plugin depuis le registre dans `~/.milady/plugins/installed/<name>/`.

```bash
# Install by shorthand (expands to @elizaos/plugin-telegram)
milady plugins install telegram

# Install a specific version
milady plugins install telegram@1.2.3

# Install without restarting the agent
milady plugins install telegram --no-restart
```

L'installateur utilise npm/bun pour installer dans un répertoire de préfixe isolé. En cas d'échec, il se rabat sur le clonage du dépôt GitHub du plugin. L'installation est suivie dans `milady.json`.

<div id="milady-plugins-uninstall-name">

### `milady plugins uninstall <name>`

</div>

Supprime un plugin installé par l'utilisateur.

```bash
milady plugins uninstall @elizaos/plugin-telegram
milady plugins uninstall telegram --no-restart
```

<div id="milady-plugins-installed">

### `milady plugins installed`

</div>

Liste tous les plugins installés depuis le registre (pas les intégrés).

```bash
milady plugins installed
```

<div id="milady-plugins-refresh">

### `milady plugins refresh`

</div>

Force le rafraîchissement du cache du registre (vide le cache mémoire + fichier, récupère depuis GitHub).

```bash
milady plugins refresh
```

<div id="milady-plugins-config-name">

### `milady plugins config <name>`

</div>

Affiche ou édite interactivement les paramètres de configuration d'un plugin.

```bash
# View current config values
milady plugins config telegram

# Interactive edit mode
milady plugins config telegram --edit
```

En mode édition, la CLI parcourt chaque paramètre, affichant les valeurs actuelles (masquant les sensibles) et demandant de nouvelles valeurs. Les modifications sont enregistrées dans `milady.json`.

<div id="milady-plugins-test">

### `milady plugins test`

</div>

Valide les plugins personnalisés dans `~/.milady/plugins/custom/`. Vérifie que chaque répertoire de plugin possède un point d'entrée valide et exporte un objet Plugin avec `name` et `description`.

```bash
milady plugins test
```

<div id="milady-plugins-add-path-path">

### `milady plugins add-path <path>`

</div>

Enregistre un répertoire de recherche de plugins supplémentaire dans le fichier de configuration.

```bash
milady plugins add-path ~/my-plugins
```

<div id="milady-plugins-paths">

### `milady plugins paths`

</div>

Liste tous les répertoires de recherche de plugins et leur contenu.

```bash
milady plugins paths
```

<div id="milady-plugins-open-name-or-path">

### `milady plugins open [name-or-path]`

</div>

Ouvre un répertoire de plugin (ou le dossier de plugins personnalisés) dans votre éditeur.

```bash
# Open the custom plugins folder
milady plugins open

# Open a specific custom plugin
milady plugins open my-plugin
```

---

<div id="plugin-manifest-fields">

## Champs du Manifeste de Plugin

</div>

<div id="bundled-registry-fields-pluginsjson">

### Champs du Registre Intégré (`plugins.json`)

</div>

Chaque entrée dans le `plugins.json` intégré utilise ce schéma :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string` | Identifiant court (ex., `telegram`, `openai`) |
| `dirName` | `string` | Nom du répertoire dans le dépôt source (ex., `plugin-telegram`) |
| `name` | `string` | Nom d'affichage lisible |
| `npmName` | `string` | Nom complet du paquet npm (ex., `@elizaos/plugin-telegram`) |
| `description` | `string` | Ce que fait le plugin |
| `category` | `string` | Catégorie du plugin : `connector`, `model`, `tool`, `memory`, `automation` |
| `envKey` | `string` | Variable d'environnement principale qui active ce plugin |
| `configKeys` | `string[]` | Toutes les variables d'environnement lues par ce plugin |
| `version` | `string` | Version publiée actuelle |
| `pluginDeps` | `string[]` | IDs des autres plugins dont celui-ci dépend |
| `pluginParameters` | `object` | Définitions détaillées des paramètres (voir ci-dessous) |

<div id="parameter-definitions">

### Définitions des Paramètres

</div>

Chaque clé dans `pluginParameters` mappe vers :

| Champ | Type | Description |
|-------|------|-------------|
| `type` | `"string" \| "number" \| "boolean"` | Type de valeur |
| `description` | `string` | Texte d'aide lisible |
| `required` | `boolean` | Si le paramètre doit être défini |
| `sensitive` | `boolean` | Si la valeur doit être masquée dans l'interface (tokens, mots de passe) |

<div id="remote-registry-fields-generated-registryjson">

### Champs du Registre Distant (`generated-registry.json`)

</div>

Les entrées du registre distant enrichi utilisent une structure différente :

| Champ | Type | Description |
|-------|------|-------------|
| `git.repo` | `string` | Chemin `owner/repo` GitHub |
| `git.v0` / `v1` / `v2` | `{ branch: string \| null }` | Branche Git pour chaque version d'elizaOS |
| `npm.repo` | `string` | Nom du paquet npm |
| `npm.v0` / `v1` / `v2` | `string \| null` | Version npm publiée par version d'elizaOS |
| `supports` | `{ v0, v1, v2: boolean }` | Quelles versions d'elizaOS sont supportées |
| `description` | `string` | Description du plugin |
| `homepage` | `string \| null` | URL de la page d'accueil |
| `topics` | `string[]` | Sujets / tags GitHub |
| `stargazers_count` | `number` | Nombre d'étoiles GitHub |
| `language` | `string` | Langage principal (généralement `TypeScript`) |
| `kind` | `"app" \| undefined` | Défini comme `"app"` pour les applications lançables |
| `app` | `object \| undefined` | Métadonnées de l'app (voir Registre d'Apps ci-dessous) |

---

<div id="apps-registry">

## Registre d'Apps

</div>

Le registre offre un support de première classe pour les **apps** -- des applications lançables distinctes des plugins standard. Une entrée est traitée comme une app quand :

- Son champ `kind` est `"app"`, ou
- Elle possède un objet `appMeta` / `app`, ou
- Elle correspond à un remplacement local d'app codé en dur (ex., `@elizaos/app-babylon`)

<div id="app-metadata-fields">

### Champs de Métadonnées d'App

</div>

| Champ | Type | Description |
|-------|------|-------------|
| `displayName` | `string` | Nom affiché dans l'interface |
| `category` | `string` | Catégorie de l'app (ex., `game`) |
| `launchType` | `string` | Comment l'app se lance : `url`, `connect`, `local` |
| `launchUrl` | `string \| null` | URL pour lancer ou se connecter |
| `icon` | `string \| null` | URL de l'icône |
| `capabilities` | `string[]` | Capacités de l'app |
| `minPlayers` / `maxPlayers` | `number \| null` | Limites du nombre de joueurs (pour les apps de jeux) |
| `viewer` | `object` | Configuration d'intégration : `url`, `embedParams`, `postMessageAuth`, `sandbox` |

<div id="app-specific-functions">

### Fonctions Spécifiques aux Apps

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

### Découverte d'Apps dans l'Espace de Travail Local

</div>

Le client du registre découvre également les apps depuis les répertoires locaux de l'espace de travail. Il scanne :

1. Les répertoires `plugins/` dans les racines de l'espace de travail pour les dossiers commençant par `app-`
2. Les plugins installés par l'utilisateur dans `~/.milady/plugins/installed/` avec `kind: "app"` dans leur package.json

Les métadonnées des apps locales sont fusionnées avec les données du registre distant, les valeurs locales ayant priorité pour les champs comme `description`, `homepage` et `localPath`.

---

<div id="programmatic-access">

## Accès Programmatique

</div>

<div id="core-functions">

### Fonctions Principales

</div>

Le client du registre exporte ces fonctions depuis `src/services/registry-client.ts` :

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

### Exemple d'Utilisation

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

Quand le serveur de l'agent est en cours d'exécution, le registre est également disponible via HTTP :

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/registry/plugins` | Liste tous les plugins avec le statut installé/chargé/intégré |
| `GET` | `/api/registry/plugins/:name` | Recherche un plugin spécifique |
| `GET` | `/api/registry/search?q=<query>&limit=<n>` | Recherche de plugins par mot-clé |
| `POST` | `/api/registry/refresh` | Force le rafraîchissement du cache du registre |

<div id="search-scoring">

### Scoring de Recherche

</div>

L'algorithme de recherche score les entrées en comparant la requête contre :

- **Nom du plugin** (correspondance exacte : +100, partielle : +50)
- **Description** (contient la requête : +30)
- **Sujets / tags** (contient la requête : +25)
- **Termes individuels de la requête** (séparés par espaces, scorés séparément : +8 à +15 chacun)
- **Bonus d'étoiles** (>100 : +3, >500 : +3, >1000 : +4)

Les résultats sont triés par score décroissant, puis par nombre d'étoiles comme départage.

---

---

<div id="plugin-ecosystem">

## Écosystème de Plugins

</div>

<div id="organization-structure">

### Structure de l'Organisation

</div>

Les plugins officiels d'elizaOS se trouvent dans l'organisation GitHub [`elizaos-plugins`](https://github.com/elizaos-plugins). Le registre indexe automatiquement les plugins de cette organisation.

| Dépôt | Contenu |
|-------|---------|
| `elizaos-plugins/registry` | Index du registre (`index.json`, `generated-registry.json`), site du registre |
| `elizaos-plugins/plugin-*` | Paquets individuels de plugins officiels |

<div id="naming-conventions">

### Conventions de Nommage

</div>

Suivez ces patrons de nommage pour la découvrabilité :

| Portée | Patron | Exemple |
|--------|--------|---------|
| Officiel | `@elizaos/plugin-<name>` | `@elizaos/plugin-telegram` |
| Organisation | `@yourorg/plugin-<name>` | `@acme/plugin-crm` |
| Communauté | `elizaos-plugin-<name>` | `elizaos-plugin-weather` |

Le préfixe `plugin-` est requis pour la découverte automatique. Le scanner du registre reconnaît les trois patrons.

<div id="submitting-a-plugin-to-the-registry">

### Soumettre un Plugin au Registre

</div>

1. **Publier sur npm** — Suivez le [Guide de Publication](/fr/plugins/publish)
2. **Ouvrir une PR** sur [`elizaos-plugins/registry`](https://github.com/elizaos-plugins/registry) en ajoutant votre plugin à `index.json` :

```json
{
  "@yourorg/plugin-weather": "github:yourorg/plugin-weather"
}
```

3. **Inclure dans votre PR :**
   - Nom du plugin, description et catégorie
   - Un manifeste `elizaos.plugin.json` fonctionnel dans votre paquet
   - Au moins une suite de tests qui passe
   - README avec instructions de configuration

4. **Le CI du registre** valide que votre plugin compile, charge et passe les tests
5. Une fois fusionné, votre plugin apparaît dans `milady plugins search` et sur le site du registre

<div id="registry-site">

### Site du Registre

</div>

Le registre dispose d'une interface web navigable hébergée depuis `registry/site/`. Les utilisateurs peuvent :
- Parcourir les plugins par catégorie (Core, Fournisseurs de Modèles, Connecteurs, DeFi, Fonctionnalités)
- Rechercher par nom, description ou tags
- Voir les détails du plugin, les commandes d'installation et la configuration

---

<div id="next-steps">

## Prochaines Étapes

</div>

- [Guide de Développement de Plugins](/fr/plugins/development) -- Créez vos propres plugins
- [Développement Local de Plugins](/fr/plugins/local-plugins) -- Développez sans publier
- [Guide de Publication](/fr/plugins/publish) -- Publiez sur npm et le registre
- [Guide de Contribution](/fr/guides/contribution-guide) -- Soumettez des plugins en amont

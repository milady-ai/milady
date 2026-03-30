---
title: Connecteur Nextcloud Talk
sidebarTitle: Nextcloud Talk
description: Connectez votre agent à Nextcloud Talk en utilisant le package @elizaos/plugin-nextcloud-talk.
---

Connectez votre agent à Nextcloud Talk pour la messagerie de collaboration auto-hébergée.

<div id="overview">

## Vue d'ensemble

</div>

Le connecteur Nextcloud Talk est un plugin elizaOS qui relie votre agent aux salons Nextcloud Talk. Il prend en charge les conversations en messages directs et en groupe sur des instances Nextcloud auto-hébergées. Ce connecteur est disponible dans le registre de plugins.

<div id="package-info">

## Informations du package

</div>

| Champ | Valeur |
|-------|--------|
| Package | `@elizaos/plugin-nextcloud-talk` |
| Clé de configuration | `connectors.nextcloud-talk` |
| Installation | `milady plugins install nextcloud-talk` |

<div id="setup-requirements">

## Prérequis de configuration

</div>

- URL du serveur Nextcloud et identifiants

<div id="configuration">

## Configuration

</div>

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

<div id="features">

## Fonctionnalités

</div>

- Messagerie par salons
- Support des conversations directes et de groupe
- Intégration avec la plateforme de collaboration auto-hébergée

<div id="related">

## Associé

</div>

- [Vue d'ensemble des connecteurs](/fr/guides/connectors#nextcloud-talk)

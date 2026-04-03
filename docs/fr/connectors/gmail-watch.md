---
title: Connecteur Gmail Watch
sidebarTitle: Gmail Watch
description: Surveillez les boîtes de réception Gmail en utilisant le package @elizaos/plugin-gmail-watch.
---

Surveillez les boîtes de réception Gmail pour les messages entrants via Pub/Sub.

<div id="overview">

## Vue d'ensemble

</div>

Le connecteur Gmail Watch est un plugin elizaOS qui surveille les boîtes de réception Gmail via Google Cloud Pub/Sub. Il détecte les nouveaux messages et déclenche des événements d'agent. Ce connecteur est activé via des feature flags plutôt que la section `connectors`. Disponible dans le registre de plugins.

<div id="package-info">

## Informations du package

</div>

| Champ | Valeur |
|-------|--------|
| Package | `@elizaos/plugin-gmail-watch` |
| Feature flag | `features.gmailWatch` |
| Installation | `milady plugins install gmail-watch` |

<div id="setup-requirements">

## Prérequis de configuration

</div>

- Compte de service Google Cloud ou identifiants OAuth avec accès à l'API Gmail
- Sujet Pub/Sub configuré pour les notifications push Gmail

<div id="configuration">

## Configuration

</div>

Gmail Watch est activé via la section `features` :

```json
{
  "features": {
    "gmailWatch": true
  }
}
```

<div id="features">

## Fonctionnalités

</div>

- Surveillance des messages Gmail via Pub/Sub
- Renouvellement automatique des abonnements de surveillance
- Gestion des événements d'emails entrants

<div id="related">

## Associé

</div>

- [Vue d'ensemble des connecteurs](/fr/guides/connectors#gmail-watch)

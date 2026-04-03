---
title: Conector de Gmail Watch
sidebarTitle: Gmail Watch
description: Monitorea bandejas de entrada de Gmail usando el paquete @elizaos/plugin-gmail-watch.
---

Monitorea bandejas de entrada de Gmail para mensajes entrantes usando Pub/Sub.

<div id="overview">

## Descripción general

</div>

El conector Gmail Watch es un plugin de elizaOS que monitorea bandejas de entrada de Gmail a través de Google Cloud Pub/Sub. Observa nuevos mensajes y activa eventos del agente. Este conector se habilita mediante feature flags en lugar de la sección `connectors`. Disponible en el registro de plugins.

<div id="package-info">

## Información del paquete

</div>

| Campo | Valor |
|-------|-------|
| Paquete | `@elizaos/plugin-gmail-watch` |
| Feature flag | `features.gmailWatch` |
| Instalación | `milady plugins install gmail-watch` |

<div id="setup-requirements">

## Requisitos de configuración

</div>

- Cuenta de servicio de Google Cloud o credenciales OAuth con acceso a la API de Gmail
- Tema Pub/Sub configurado para notificaciones push de Gmail

<div id="configuration">

## Configuración

</div>

Gmail Watch se habilita a través de la sección `features`:

```json
{
  "features": {
    "gmailWatch": true
  }
}
```

<div id="features">

## Características

</div>

- Vigilancia de mensajes de Gmail mediante Pub/Sub
- Renovación automática de suscripciones de vigilancia
- Manejo de eventos de correo entrante

<div id="related">

## Relacionado

</div>

- [Descripción general de conectores](/es/guides/connectors#gmail-watch)

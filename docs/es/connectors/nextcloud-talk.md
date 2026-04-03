---
title: Conector de Nextcloud Talk
sidebarTitle: Nextcloud Talk
description: Conecta tu agente a Nextcloud Talk usando el paquete @elizaos/plugin-nextcloud-talk.
---

Conecta tu agente a Nextcloud Talk para mensajería de colaboración autoalojada.

<div id="overview">

## Descripción general

</div>

El conector de Nextcloud Talk es un plugin de elizaOS que conecta tu agente a las salas de Nextcloud Talk. Soporta conversaciones de mensajes directos y grupales en instancias autoalojadas de Nextcloud. Este conector está disponible en el registro de plugins.

<div id="package-info">

## Información del paquete

</div>

| Campo | Valor |
|-------|-------|
| Paquete | `@elizaos/plugin-nextcloud-talk` |
| Clave de configuración | `connectors.nextcloud-talk` |
| Instalación | `milady plugins install nextcloud-talk` |

<div id="setup-requirements">

## Requisitos de configuración

</div>

- URL del servidor Nextcloud y credenciales

<div id="configuration">

## Configuración

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

## Características

</div>

- Mensajería basada en salas
- Soporte de conversaciones directas y grupales
- Integración con plataforma de colaboración autoalojada

<div id="related">

## Relacionado

</div>

- [Descripción general de conectores](/es/guides/connectors#nextcloud-talk)

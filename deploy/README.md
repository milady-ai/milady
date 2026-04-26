# Milady Deploy Config

Milady uses the generic deployment toolkit in `eliza/packages/app-core/deploy/`.

> **Prerequisite:** The `eliza/` submodule must be initialized before these scripts are available.
> Run `git submodule update --init --recursive` or `bun run setup:upstreams` from the repo root.

Use these commands from this directory:

```bash
bash ../eliza/packages/app-core/deploy/docker-setup.sh
bash ../eliza/packages/app-core/deploy/deploy-to-nodes.sh --status
```

Files in this directory:

- `Dockerfile.ci`: CI build image
- `deploy.env`: Milady-specific overrides for the generic deploy defaults
- `nodes.json`: Milady node inventory and SSH settings
- `systemd/`: systemd unit files and install script for bare-metal deployments

Generic deployment docs live here:

- `../eliza/packages/app-core/deploy/README.md`

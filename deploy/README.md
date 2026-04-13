# Milady Deploy Config

Milady uses the generic deployment toolkit in `eliza/packages/app-core/deploy/`.

Use these commands from this directory:

```bash
bash ../eliza/packages/app-core/deploy/docker-setup.sh
bash ../eliza/packages/app-core/deploy/deploy-to-nodes.sh --status
```

Files in this directory:

- `deploy.env`: Milady-specific overrides for the generic deploy defaults
- `nodes.json`: Milady node inventory and SSH settings

Generic deployment docs live here:

- `../eliza/packages/app-core/deploy/README.md`

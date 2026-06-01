# scripts/

Milady-only lifecycle shims for installing, building, starting, and running the
app from this workspace.

Keep this folder small. If a script is generally useful to elizaOS, put it in
`eliza/packages/app-core/scripts/` and call it through:

```bash
node scripts/run-eliza-app-core-script.mjs <script-name> [...args]
```

Root scripts should only remain here when they need Milady-specific package
mode behavior, workspace layout, npm packaging, or runtime patches.

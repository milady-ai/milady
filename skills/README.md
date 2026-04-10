# Skills

Default skills shipped with Milady. Additional skills are available from the
[Milady Skills Registry](https://github.com/milady-ai/skills) and can be
installed via the Skills marketplace tab in the UI or:

```bash
npx skills add milady-ai/skills/<skill-name>
```

## Directory Layout

```
skills/
  eliza-cloud/           Eliza Cloud backend, apps, monetization, containers
  elizaos/               elizaOS runtime and plugin abstractions
  milady/                Milady product and repo architecture
  milady-development/    Repo-specific Milady development workflow
  .cache/                Runtime catalog cache (gitignored)
```

The agent runtime reads skills from `~/.milady/skills/` (user state dir).
`scripts/ensure-skills.mjs` seeds all shipped skills on first run without
overwriting an existing user-customized skill.

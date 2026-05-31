# /electrobun-update

Wire or audit Electrobun updater behavior.

Check:

- `release.baseUrl` configured for non-dev builds.
- Build scripts for canary/stable.
- Artifact upload workflow and static host path.
- Old patch retention policy.
- `Updater.checkForUpdate`, `downloadUpdate`, and `applyUpdate` usage.
- User consent/unsaved-work handling before applying updates.
- Error states and offline behavior.
- Security/privacy implications of update metadata and host.

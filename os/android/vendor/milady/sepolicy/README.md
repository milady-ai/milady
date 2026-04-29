# MiladyOS sepolicy

Custom selinux policy for the Milady privileged system app and the
on-device agent it spawns.

`BOARD_VENDOR_SEPOLICY_DIRS += vendor/milady/sepolicy` (in
`milady_common.mk`) wires this directory into the board policy. Soong
globs `*.te`, `file_contexts`, and `seapp_contexts` flat at the top
level of the configured dir — so policy lives directly under
`sepolicy/`, not nested in `private/` / `public/` (those subdirs only
apply to platform `system/sepolicy/`).

## Layout

- `file_contexts` — labels for paths the Milady app or its agent
  runtime creates. Paths under `/data/data/<pkg>/` are NOT labeled by
  installd from this file; the agent service must call `restorecon`
  after copying the bun binary out of `assets/agent/`.
- `milady_agent.te` — domain + types for the on-device agent
  (`milady_agent`, `milady_agent_exec`, `milady_agent_data`).

## The `milady_agent` domain

The Milady priv-app runs in the standard AOSP `priv_app` domain (set by
`seapp_contexts`'s default privileged-app rule, since we don't override
`seinfo`). When that priv-app spawns its on-device agent — `bun` plus a
bundled `@elizaos/agent` — running it in `priv_app` would give it the
priv-app's full policy: SDK Sandbox access, perfetto, virtualization
service, network stats, and so on. Far broader than the agent needs.

`milady_agent.te` carves the agent into a tighter domain.

### What the agent is allowed to do

- Execute its bundled binary tree (`bun`, `ld-musl-*.so.1`,
  `libstdc++.so`, `libgcc_s.so` — all labeled `milady_agent_exec`).
- Read/write its own state dir (`milady_agent_data`).
- Open TCP sockets via the standard `netdomain` attribute. The agent is
  expected to bind to `127.0.0.1:31337` only — SELinux cannot enforce
  the host:port choice (it's a userspace bind() argument, not a label
  decision); that constraint lives in the agent's own code.
- Search/read its parent priv-app data dir (so it can resolve its own
  bundle path on startup).

### What the agent is forbidden from doing

- Acquire any Linux capability (`neverallow milady_agent self:capability *`).
- Write to anything outside `milady_agent_data` (`neverallow ... ~{milady_agent_exec milady_agent_data privapp_data_file ...}:file …`).
- Create raw / netlink / packet / route sockets — only stream/dgram.
- Transition to any other domain (`priv_app`, `shell`, `su`, etc.).
- Register binder services, set system properties, or touch cgroups.

### How the labels actually reach the files

`file_contexts` in this directory lists patterns like:

```
/data/data/com\.miladyai\.milady/files/agent/bin(/.*)?  u:object_r:milady_agent_exec:s0
/data/data/com\.miladyai\.milady/files/agent(/.*)?      u:object_r:milady_agent_data:s0
```

But Android's `installd` does NOT consult `file_contexts` for files it
creates inside an app's data dir — it labels them via
`seapp_contexts` (which only knows `privapp_data_file`). For
`milady_agent_exec` to actually stick to the bun binary on disk, the
`MiladyAgentService` Java code must explicitly invoke
`SELinux.restoreconRecursive("/data/data/com.miladyai.milady/files/agent")`
after copying `assets/agent/` into place. That's the contract Phase B
(the foreground service) has to honour.

### How the domain transition fires

`milady_agent.te` declares:

```
domain_auto_trans(priv_app, milady_agent_exec, milady_agent)
```

When the priv_app `execve()`s a file labeled `milady_agent_exec`, the
kernel automatically transitions the new process into `milady_agent`.
No runtime opt-in; if the binary is correctly labeled, the transition
is automatic.

If the binary is NOT correctly labeled (because `restorecon` was
forgotten), the child will run in `priv_app`. Production builds catch
this in `boot-validate.mjs`'s logcat scan — `avc: denied` lines
involving `milady_agent` would be visible. Lack of `milady_agent` in
`ps -Z` for the child process is the more obvious symptom.

## Adding rules

1. Reproduce the failure on a userdebug Cuttlefish boot.
2. `adb logcat -d | grep 'avc:'` — copy the denial.
3. Run `audit2allow` against the denial to draft an allow rule.
4. Decide whether the rule belongs in `milady_agent.te` (anything the
   agent legitimately needs) or whether the denial points at a real
   bug in what the agent is doing. The neverallow set in
   `milady_agent.te` is the contract — if a denial would require
   crossing one of those, fix the agent, not the policy.
5. Rebuild and verify the denial is gone with `dmesg | grep avc`.

Never commit overly broad `allow` rules — every line of policy is a
security trade. Prefer narrow types (`milady_agent_data` for state,
`milady_agent_exec` for binaries) over reusing `system_data_file` or
`privapp_data_file` for agent-owned data.

## Audit-only mode

For initial bring-up, denials log without enforcing if the device is
set permissive (`adb shell setenforce 0`). Production builds run
enforcing — the policy here is the production target, not a relaxed
stub.

If the policy was relaxed during bring-up (e.g. the `dontaudit` lines
in `milady_agent.te` for proc/sysfs noise), the relaxation should be
followed up with a tighter `allow` once the actual access pattern is
known and the cause is something the agent legitimately needs.

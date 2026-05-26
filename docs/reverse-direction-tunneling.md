# Reverse-direction tunneling: Mac connects to a mobile-hosted agent

Status: Design + scaffolding landed. Tunnel transport itself is a follow-on.

## Problem

Today's `device-bridge` is asymmetric. The agent runs on a Mac (or a remote
server), and the phone is a *device* that dials in via WebSocket to offer
on-device inference. `eliza/packages/ui/src/services/local-inference/device-bridge.ts`
runs the WebSocket *server*; `eliza/packages/ui/src/services/local-inference/device-bridge.ts`
(`startDeviceBridgeClient`) runs the WebSocket *client* on the phone. The
agent-side bridge attaches to a Node HTTP server at
`/api/local-inference/device-bridge` and only accepts connections.

The reverse direction — a Mac that wants to dial an agent running on the
user's phone — is blocked by the platforms themselves:

- iOS apps cannot bind a publicly reachable listening socket. Background
  network operations are tightly scoped and any inbound port the OS
  permits (NWListener etc.) is reachable only from the same private
  network and only while the app is foregrounded.
- Android can in theory bind a port from a foreground service, but
  most users sit behind NAT and have no public address, and AOSP/MiladyOS
  variants intentionally restrict listening sockets.
- Both platforms can, however, hold a stable *outbound* connection. A
  tunnel relay flips the connection direction so the phone dials *out*,
  the Mac dials *out*, and a relay or overlay network in the middle
  brokers traffic.

Three primitives currently make this realistic for us:

1. **Eliza Cloud managed gateway relay**
   (`eliza/plugins/plugin-elizacloud/src/services/cloud-managed-gateway-relay.ts`).
   A Node-hosted agent registers a session against
   `/eliza/gateway-relay/sessions`, long-polls for inbound JSON-RPC
   requests at `/eliza/gateway-relay/sessions/<id>/next`, and posts
   results back. This is exactly the pattern we need; it is currently
   limited to Node runtimes and to message-RPC, but the wire shape is
   general.
2. **Tailscale**. Eliza Cloud already exposes
   `POST /api/v1/apis/tunnels/tailscale/auth-key` (see
   `eliza/plugins/plugin-elizacloud/src/utils/cloud-sdk/public-routes.ts:268`),
   so the cloud already understands how to mint tailnet auth-keys for an
   app. There is no embedded tailscaled in the iOS/Android shells today,
   but the cloud half exists.
3. **ngrok / Cloudflare quick-tunnel / similar**. The Mac side already
   ships an Electrobun shell that can run an ngrok agent today; the
   phone side has no embedded ngrok binary.

## Today's runtime modes

`eliza/packages/ui/src/platform/ios-runtime.ts` is the source of truth for
the per-launch mobile runtime selection. Modes:

| Mode | Phone behaviour | Mac behaviour |
| --- | --- | --- |
| `cloud` | Phone is a thin client of Eliza Cloud. | n/a |
| `cloud-hybrid` | Phone dials a Mac/server agent via WebSocket device-bridge and offers on-device inference. | Hosts the agent; phone is a device. |
| `remote-mac` | Phone is a thin client of a Mac-hosted API base. | Hosts the agent. |
| `local` | Phone hosts the agent in-process (iOS ITTP) or via loopback (Android). | n/a |

None of these let the **Mac** connect to a phone-hosted agent.

## New mode: `tunnel-to-mobile`

The phone hosts the agent (same code path as `local`) **and** opens an
outbound tunnel so a Mac can reach the agent. The Mac dials the tunneled
URL the same way it would dial any `remote-mac` API base, but the
backing server is the phone.

Naming: `tunnel-to-mobile` is from the connecting client's perspective
("the Mac is going to tunnel-to-mobile"). It is recorded in the
**phone's** `ios-runtime` config because the phone is the side that
selects "host agent + open tunnel" as its runtime stance. The mode
maps 1:1 to the persisted `MobileRuntimeMode` enum.

## Design options

### Option A — Cloud-managed relay (chosen as first transport)

Reuse `CloudManagedGatewayRelayService` semantics but generalize it to
relay HTTP-shaped requests against the phone's local agent API. The
phone session registers with the cloud, long-polls for inbound requests
addressed to the user's logged-in account, and replies. The Mac sends a
request to Eliza Cloud that names the target session; the cloud queues
the request and waits for the phone to drain it.

Trade-offs:
- No new infrastructure on the phone (no embedded tailscaled / wireguard
  / quic listener).
- Inherits Cloud auth: only the user's own paired devices can address
  each other. No firewall holes, no port forwarding, no public IPs.
- Latency floor is the round-trip through Cloud plus the long-poll
  cadence (currently 250 ms idle + 25 s long-poll window).
- Bandwidth-bounded: streaming model output through the relay is fine,
  binary blobs over a few MB should not be.
- Already exists end-to-end for messages — extending the method set is
  incremental.

### Option B — Eliza Cloud managed Headscale tailnet

Cloud mints a tailnet auth-key per pairing. The phone runs an embedded
tailscale userspace daemon (e.g. `tsnet`) and joins the tailnet, the
Mac joins the same tailnet, the Mac dials
`http://<phone-magic-dns>:31337/...`. Cloud already has the
`tailscale/auth-key` endpoint.

Trade-offs:
- Real point-to-point connection, no relay hop.
- Userspace tailscale on iOS is technically possible (`tsnet-go` linked
  through libtsnet) but ships ~20 MB of native code. Background lifetime
  is the hard problem — iOS will suspend the daemon when the app
  backgrounds unless we register it as a long-running task type
  (VoIP/audio/location all have policy issues) or accept that the
  tunnel goes down with the foreground.
- Android can pin a foreground service with a notification, but battery
  cost is real and AOSP/MiladyOS variants may not permit it.
- Cloud already understands tailnet ACLs, so authorization is just
  "is this Mac on the same tailnet as this phone?".

### Option C — ngrok / Cloudflare quick-tunnel adapter

Phone embeds a tunnel client (ngrok-go, cloudflared-go) and presents a
random https URL on each session. Mac dials that URL.

Trade-offs:
- Simplest to reason about: dropped into existing `remote-mac` mode
  with a tunneled URL.
- Requires third-party credentials per user (ngrok auth-token,
  Cloudflare Zero-Trust account). Eliza Cloud does not currently
  proxy or manage these.
- Same background-lifetime problem as B on iOS.
- Public URL is a tempting target; auth becomes a token on the phone's
  agent API, which already exists (`ELIZA_AGENT_API_TOKEN` etc.).

### Recommended path

Phase 1 lands the cloud-managed relay (Option A) because it shares the
auth model with the existing gateway relay and needs zero embedded
native code on the phone. Phase 2 evaluates managed Headscale
(Option B) once we know how often a Mac actually wants to reach a
phone-hosted agent in real use. Option C is a fallback for users who
opt out of Cloud entirely.

## Components introduced now

1. **Runtime mode `tunnel-to-mobile`** added to `IosRuntimeMode`,
   normalized aliases `tunnel-to-mobile` / `mobile-tunnel` /
   `host-with-tunnel`. The phone treats this as a `local`-plus-tunnel
   mode; the on-device agent boots the same way, plus the new tunnel
   bridge is started.
2. **Capacitor plugin shell `MobileAgentBridge`** under
   `eliza/packages/native-plugins/mobile-agent-bridge/`. Web/iOS/Android
   stubs only — locks the JS-facing API surface
   (`startInboundTunnel`, `stopInboundTunnel`, `getTunnelStatus`) so the
   Mac-side client can be wired today and the native transports can be
   filled in independently. Mirrors the structure of
   `eliza/packages/native-plugins/gateway/`.
3. **Mac-side `TunnelToMobileClient`** under
   `eliza/packages/app-core/src/services/tunnel-to-mobile/`. Thin TS
   client that, given a relay URL, device ID and pairing token, opens a
   WebSocket up to the relay and proxies frames into the local
   `DeviceBridge` connection surface the same way an iPhone would. The
   server-side `DeviceBridge` does not need to know whether the device
   on the other end is a phone or a tunnel-bridged phone; the frames are
   the same.

What is explicitly **not** implemented yet (deliberate scope):

- Embedded tailscale / wireguard / quic daemon on iOS or Android.
- Cloud relay extension for arbitrary HTTP/WS proxying (the existing
  `cloud-managed-gateway-relay` is message-RPC only, not a general
  tunnel).
- UI for choosing `tunnel-to-mobile` in first-run (the
  `MobileRuntimeMode` enum is extended; the first-run picker can pick
  it up in a separate change).
- Battery/lifetime hardening (foreground service notifications, etc.)

## Phased plan

1. **P0 (this change)**: runtime mode + tests + native plugin shell +
   Mac client shell + this doc.
2. **P1**: implement cloud relay extension. Add
   `/eliza/agent-relay/sessions` (or similar) endpoints to the cloud
   that proxy generic JSON frames between a phone session and a Mac
   session keyed by user. Wire the new `MobileAgentBridge.startInboundTunnel`
   to dial it from the phone; wire `TunnelToMobileClient` on the Mac to
   dial the user-end of the same endpoint.
3. **P2**: optional Headscale path. If P1 latency is unacceptable for
   the use cases that actually show up, embed `tsnet` on the phone,
   issue auth-keys via the existing
   `POST /api/v1/apis/tunnels/tailscale/auth-key` endpoint, and switch
   the connection model to direct dial.
4. **P3**: first-run UI + first-class settings toggle, mDNS discovery
   for same-LAN dial (skip the tunnel when both devices are on the
   same network), battery/lifetime hardening per platform.

## Security and trust model

The relay path inherits Eliza Cloud auth: the phone authenticates with
the user's cloud credential, the Mac authenticates with the same
credential. The relay only forwards frames between sessions that share
a user ID. No public endpoint is created; no third-party tunnel
provider sees user content unless the user explicitly chooses ngrok /
Cloudflare in P2/P3. The phone's local agent API token (the same one
that protects the on-device `local` mode today) authorizes individual
RPC frames end-to-end so the relay only sees ciphertext-equivalent
JSON.

## Open questions

- Does the relay need to terminate streaming responses (token-by-token
  generation) frame-by-frame, or batch? Long-poll suits batch; SSE-style
  channels need a different transport.
- What is the cost model? Cloud-relayed bytes count against the user's
  cloud bandwidth budget. Direct tailnet bytes do not.
- Background lifetime: when the phone backgrounds, does the agent
  continue running? On iOS the answer is generally no without a
  qualified background mode. The relay should report
  "session offline" cleanly and the Mac UI should surface that.

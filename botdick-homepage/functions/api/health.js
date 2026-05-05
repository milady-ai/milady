import { getStore, json } from "../_shared/botdick-state.js";

export function onRequestGet({ env }) {
  return json({
    ok: true,
    service: "botdick-homepage",
    kv: Boolean(getStore(env)),
    ingestAuthConfigured: Boolean(env?.BOTDICK_INGEST_TOKEN),
  });
}

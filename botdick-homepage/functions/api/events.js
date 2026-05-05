import {
  applyEvents,
  corsHeaders,
  getStore,
  isAuthorized,
  json,
  readState,
  writeState,
} from "../_shared/botdick-state.js";

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) {
    return json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!getStore(env)) {
    return json(
      {
        ok: false,
        error: "BOTDICK_STATE KV binding is missing; event was not persisted",
      },
      { status: 503 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const incomingEvents = Array.isArray(payload?.events) ? payload.events : [payload];
  if (incomingEvents.length === 0 || incomingEvents.length > 12) {
    return json({ ok: false, error: "send 1-12 events per request" }, { status: 400 });
  }

  const state = await readState(env);
  const nextState = applyEvents(state, incomingEvents);
  await writeState(env, nextState);

  return json({
    ok: true,
    accepted: incomingEvents.length,
    state: nextState,
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

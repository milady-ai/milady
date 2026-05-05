import {
  corsHeaders,
  getStore,
  isAuthorized,
  json,
  readState,
  runAutomation,
  writeState,
} from "../../_shared/botdick-state.js";

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) {
    return json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!getStore(env)) {
    return json(
      {
        ok: false,
        error: "BOTDICK_STATE KV binding is missing; automation result was not persisted",
      },
      { status: 503 },
    );
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const state = await readState(env);
  const { state: nextState, result } = runAutomation(state, payload);
  await writeState(env, nextState);

  return json({
    ...result,
    state: nextState,
  });
}

export async function onRequestGet({ env }) {
  const state = await readState(env);
  return json({
    ok: true,
    tasks: state.automation.tasks,
    ideas: state.ideas,
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

import {
  corsHeaders,
  getStore,
  isAuthorized,
  json,
  progressLifecycleTask,
  readState,
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
        error: "BOTDICK_STATE KV binding is missing; task progress was not persisted",
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

  const state = await readState(env);
  const { state: nextState, task, event } = progressLifecycleTask(state, payload);
  await writeState(env, nextState);

  return json({
    ok: true,
    task,
    event,
    state: nextState,
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

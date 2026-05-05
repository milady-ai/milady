import { corsHeaders, json, readState } from "../_shared/botdick-state.js";

export async function onRequestGet({ env }) {
  const state = await readState(env);
  return json(state);
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

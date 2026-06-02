const DEFAULT_LIFEOPS_API_BASES = [
  "http://127.0.0.1:31337",
  "http://localhost:31337",
  "http://127.0.0.1:2138",
  "http://localhost:2138",
];

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/g, "");
}

export function readLifeOpsApiBases(explicit, env = process.env) {
  return [
    explicit,
    env.MILADY_LIFEOPS_API_BASE,
    env.LIFEOPS_API_BASE,
    env.ELIZA_API_BASE,
  ]
    .flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .concat(DEFAULT_LIFEOPS_API_BASES)
    .map(normalizeBaseUrl)
    .filter((value, index, all) => all.indexOf(value) === index);
}

export function lifeopsConnectorParams(options) {
  const params = new URLSearchParams();
  if (options.side) params.set("side", options.side);
  if (options.mode) params.set("mode", options.mode);
  if (options.grantId) params.set("grantId", options.grantId);
  return params;
}

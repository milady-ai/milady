/**
 * Location Module — STUB
 *
 * Geolocation is not yet available in Electrobun.
 */

function notAvailable(feature: string) {
  return Promise.resolve({ error: `${feature} not available in Electrobun yet` });
}

export const locationHandlers: Record<string, (args: unknown[]) => Promise<unknown>> = {
  "location:getCurrentPosition": () => notAvailable("location:getCurrentPosition"),
  "location:watchPosition": () => notAvailable("location:watchPosition"),
  "location:clearWatch": () => Promise.resolve(),
  "location:getLastKnownLocation": () => Promise.resolve(null),
};

export function getLocationManager() {
  return { setMainWindow: () => {}, dispose: () => {} };
}

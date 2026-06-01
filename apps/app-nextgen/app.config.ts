/**
 * Milady Nextgen — app identity.
 *
 * Single source of truth for the nextgen renderer's identity. The desktop/mobile
 * build scripts parse `appId` / `appName` / `desktop.urlScheme` / `namespace`
 * out of this file (by regex, see read-app-identity.mjs) to set ELIZA_APP_NAME /
 * ELIZA_APP_ID / ELIZA_URL_SCHEME / ELIZA_NAMESPACE for the Electrobun shell.
 */
export const appConfig = {
  appId: "ai.milady.milady",
  appName: "Milady",
  namespace: "milady",
  urlScheme: "milady",
  desktop: {
    bundleId: "ai.milady.milady",
    urlScheme: "milady",
  },
};

export default appConfig;

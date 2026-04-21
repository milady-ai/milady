export const WECHAT_PLUGIN_PACKAGE = "@elizaos/plugin-wechat";

export function isWechatConnectorConfigured(config) {
  if (!config || config.enabled === false) {
    return false;
  }

  if (config.apiKey) {
    return true;
  }

  const accounts = config.accounts;
  if (accounts && typeof accounts === "object") {
    return Object.values(accounts).some((account) => {
      if (
        !account ||
        typeof account !== "object" ||
        account.enabled === false
      ) {
        return false;
      }
      return Boolean(account.apiKey);
    });
  }

  return false;
}

const plugin = {};

export default plugin;

const webview = document.querySelector("electrobun-webview") as any;
if (webview) {
  webview.setNavigationRules([
    "^*",
    "https://trusted.example.com/*",
    "https://cdn.trusted.example.com/*",
    "^http://*",
  ]);
  webview.on("did-navigate", (event: CustomEvent) => {
    console.log("Sandboxed webview navigated", event.detail?.url);
  });
  webview.on("host-message", (event: CustomEvent) => {
    const detail = event.detail;
    if (typeof detail !== "object" || detail === null) return;
    console.log("Validated host message", detail);
  });
}

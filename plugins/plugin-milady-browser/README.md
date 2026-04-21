# @miladyai/plugin-milady-browser

Local Milady desktop browser control plugin.

What this slice does:

- Opens browser tabs as hidden background `BrowserWindow`s in Electrobun
- Keeps tabs alive while their view is closed
- Lets an Eliza agent list, open, navigate, show, hide, close, snapshot, and evaluate tabs
- Uses a loopback-only HTTP bridge with bearer auth between the desktop shell and the embedded agent runtime

What it does not do yet:

- Inject a production dapp wallet provider into arbitrary websites
- Render a dedicated browser management UI inside the Milady web app
- Expose rich multi-tab visuals beyond native show/hide windows

Why not an iframe:

- Cross-origin iframes do not give the agent full browser control
- Wallet injection for external sites needs a privileged webview/preload boundary
- Background persistence and tab/session storage belong in the desktop shell, not in the Milady app frame

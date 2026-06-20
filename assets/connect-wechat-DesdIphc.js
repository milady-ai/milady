import{n as e,r as t}from"./index-B1lOhjHW.js";var n=t();function r(t){let r={a:`a`,code:`code`,h1:`h1`,h2:`h2`,li:`li`,ol:`ol`,p:`p`,pre:`pre`,span:`span`,strong:`strong`,table:`table`,tbody:`tbody`,td:`td`,th:`th`,thead:`thead`,tr:`tr`,ul:`ul`,...e(),...t.components},{Callout:i,Steps:o}=r;return i||a(`Callout`,!0),o||a(`Steps`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`connect-to-wechat`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#connect-to-wechat`,children:`Connect to WeChat`})}),`
`,(0,n.jsxs)(r.p,{children:[`WeChat is the dominant messaging and social platform in mainland China. WeChat does `,(0,n.jsx)(r.strong,{children:`not`}),` have a public API for personal accounts, so this connector works through a third-party proxy service that emulates a WeChat client and exposes a local HTTP API. The Milady plugin then talks to that proxy.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` set up a WeChat proxy service, configure the plugin, scan the QR code.`]}),`
`,(0,n.jsx)(i,{kind:`warning`,title:`Read this first`,children:(0,n.jsx)(r.p,{children:`This connector uses an unofficial path: a proxy service pretends to be a WeChat client on your behalf. WeChat's terms of service technically don't allow this, and WeChat does occasionally ban accounts that use it. Use a dedicated account, not your personal one, and never paste your real WeChat Pay or banking-linked account into any proxy service.`})}),`
`,(0,n.jsx)(r.h2,{id:`what-you-need-before-you-start`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-you-need-before-you-start`,children:`What you need before you start`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A WeChat account`}),` you can afford to lose if it gets banned. Create a new one specifically for this.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A WeChat proxy service`}),` — see the "Picking a proxy" section below.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A second device`}),` (phone with WeChat installed) to scan the login QR code.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Milady running`}),` with a working provider.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`picking-a-proxy`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#picking-a-proxy`,children:`Picking a proxy`})}),`
`,(0,n.jsx)(r.p,{children:`You have two realistic options:`}),`
`,(0,n.jsxs)(r.ol,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Run your own proxy on a Mac or Linux server.`}),` Open-source projects exist — search for "wechaty" or "ItChat-Puppet" on GitHub. This is the most private path but requires dev setup.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Use a hosted proxy service.`}),` Several commercial services offer this for a fee. Evaluate the provider carefully — the proxy sees every message, attachment, and contact that flows through your account.`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Whichever you pick, you'll end up with:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[`An `,(0,n.jsx)(r.strong,{children:`API key`}),` the proxy service issues you`]}),`
`,(0,n.jsxs)(r.li,{children:[`A `,(0,n.jsx)(r.strong,{children:`proxy URL`}),` you can reach from your Milady machine`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`step-1--set-up-the-proxy-service`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-1--set-up-the-proxy-service`,children:`Step 1 — Set up the proxy service`})}),`
`,(0,n.jsx)(r.p,{children:`Follow the proxy service's own documentation. At the end you should have:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`API key (paste into Milady)`}),`
`,(0,n.jsxs)(r.li,{children:[`Proxy URL (e.g. `,(0,n.jsx)(r.code,{children:`https://wechat-proxy.yourservice.com`}),` or `,(0,n.jsx)(r.code,{children:`http://localhost:3001`}),` for a local one)`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`step-2--configure-the-plugin-in-miladyjson`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-2--configure-the-plugin-in-miladyjson`,children:`Step 2 — Configure the plugin in milady.json`})}),`
`,(0,n.jsxs)(r.p,{children:[`The WeChat connector is unusual — it's configured through `,(0,n.jsx)(r.code,{children:`milady.json`}),` directly, not just the plugin Configure panel, because it has structured config fields that don't fit the flat env-var UI.`]}),`
`,(0,n.jsxs)(r.p,{children:[`Open `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/milady.json`}),` and add a `,(0,n.jsx)(r.code,{children:`connectors.wechat`}),` block:`]}),`
`,(0,n.jsx)(n.Fragment,{children:(0,n.jsx)(r.pre,{className:`shiki github-dark`,style:{backgroundColor:`#24292e`,color:`#e1e4e8`},tabIndex:`0`,children:(0,n.jsxs)(r.code,{children:[(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`{`})}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`  "connectors"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`    "wechat"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`      "apiKey"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"your-proxy-api-key"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`      "proxyUrl"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"https://your-proxy-service/api"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`      "deviceType"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"ipad"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`      "features"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`        "images"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`false`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`        "groups"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`false`})]}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`      }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`    }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`  }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`}`})})]})})}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Field meanings:`})}),`
`,(0,n.jsxs)(r.table,{children:[(0,n.jsx)(r.thead,{children:(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.th,{children:`Field`}),(0,n.jsx)(r.th,{children:`What it does`})]})}),(0,n.jsxs)(r.tbody,{children:[(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.strong,{children:`apiKey`})}),(0,n.jsx)(r.td,{children:`Auth credential for your proxy service. Required.`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.strong,{children:`proxyUrl`})}),(0,n.jsx)(r.td,{children:`Base URL of your proxy service. Required.`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.strong,{children:`deviceType`})}),(0,n.jsxs)(r.td,{children:[(0,n.jsx)(r.code,{children:`ipad`}),` (default) or `,(0,n.jsx)(r.code,{children:`mac`}),` — emulates what kind of WeChat client. iPad is less likely to bump you off other active sessions.`]})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.strong,{children:`features.images`})}),(0,n.jsx)(r.td,{children:`Enable image send/receive. Off by default.`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.strong,{children:`features.groups`})}),(0,n.jsx)(r.td,{children:`Enable group chat support. Off by default.`})]})]})]}),`
`,(0,n.jsx)(i,{kind:`tip`,children:(0,n.jsxs)(r.p,{children:[`Keep `,(0,n.jsx)(`code`,{children:`features.groups`}),` off for your first run. Group support multiplies the volume of events the bot sees and makes rate limits easier to hit.`]})}),`
`,(0,n.jsx)(r.h2,{id:`step-3--restart-milady-and-scan-the-qr-code`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-3--restart-milady-and-scan-the-qr-code`,children:`Step 3 — Restart Milady and scan the QR code`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsx)(`li`,{children:`Restart Milady (or reload the WeChat plugin from Settings → Plugins).`}),(0,n.jsx)(`li`,{children:`Milady's terminal / status panel will show a QR code.`}),(0,n.jsxs)(`li`,{children:[`Open WeChat on your phone → `,(0,n.jsx)(`strong`,{children:`Me → Settings → Account & Security → Manage Devices → Sign in to Web WeChat`}),`.`]}),(0,n.jsx)(`li`,{children:`Scan the QR code from Milady with your phone.`}),(0,n.jsx)(`li`,{children:`Confirm the login on your phone.`})]}),`
`,(0,n.jsx)(r.p,{children:`Milady's WeChat plugin now holds a session. The session persists — you don't need to rescan every time unless WeChat invalidates it.`}),`
`,(0,n.jsx)(r.h2,{id:`step-4--test-it`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-4--test-it`,children:`Step 4 — Test it`})}),`
`,(0,n.jsx)(r.p,{children:`Send a WeChat message from another account to the account you just logged in with. Milady should see it and respond.`}),`
`,(0,n.jsx)(r.h2,{id:`multiple-accounts`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#multiple-accounts`,children:`Multiple accounts`})}),`
`,(0,n.jsxs)(r.p,{children:[`If you want the agent to run multiple WeChat accounts (e.g. one for each region or purpose), use the `,(0,n.jsx)(r.code,{children:`accounts`}),` map:`]}),`
`,(0,n.jsx)(n.Fragment,{children:(0,n.jsx)(r.pre,{className:`shiki github-dark`,style:{backgroundColor:`#24292e`,color:`#e1e4e8`},tabIndex:`0`,children:(0,n.jsxs)(r.code,{children:[(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`{`})}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`  "connectors"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`    "wechat"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`      "proxyUrl"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"https://your-proxy/api"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`      "accounts"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`        "cn-main"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: { `}),(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`"apiKey"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"key1"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:` },`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`        "hk-backup"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: { `}),(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`"apiKey"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"key2"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:` }`})]}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`      }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`    }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`  }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`}`})})]})})}),`
`,(0,n.jsx)(r.p,{children:`Each account gets its own QR scan and its own session.`}),`
`,(0,n.jsx)(r.h2,{id:`troubleshooting`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#troubleshooting`,children:`Troubleshooting`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`QR code scan succeeds but Milady says "not logged in."`}),`
Usually means the proxy service didn't get a valid session back from WeChat. Check the proxy service's own logs.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Messages arrive but agent never replies.`}),`
Check `,(0,n.jsx)(r.code,{children:`features.images`}),` if the incoming message has a picture — images are off by default and the agent won't process attachments it can't decode.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Account gets banned or locked.`}),`
This happens. Recovery is possible through WeChat's identity verification flow on your phone, but the path out of a ban sometimes requires Chinese-language ID verification. Have a fallback account ready if this connector matters to you.`]}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.a,{href:`/docs/intermediate/connect-feishu`,children:`Connect to Feishu / Lark`}),` — for work chat in China, Feishu has an official API and is much less risky.`]}),`
`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
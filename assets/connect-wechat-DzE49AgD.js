import{u as o,j as e}from"./index-BfT5spx2.js";function c(n){const s={a:"a",code:"code",h1:"h1",h2:"h2",li:"li",ol:"ol",p:"p",pre:"pre",span:"span",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...o(),...n.components},{Callout:l,Steps:r}=s;return l||i("Callout"),r||i("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(s.h1,{id:"connect-to-wechat",children:e.jsx(s.a,{className:"anchor",href:"#connect-to-wechat",children:"Connect to WeChat"})}),`
`,e.jsxs(s.p,{children:["WeChat is the dominant messaging and social platform in mainland China. WeChat does ",e.jsx(s.strong,{children:"not"})," have a public API for personal accounts, so this connector works through a third-party proxy service that emulates a WeChat client and exposes a local HTTP API. The Milady plugin then talks to that proxy."]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"What you'll learn:"})," set up a WeChat proxy service, configure the plugin, scan the QR code."]}),`
`,e.jsx(l,{kind:"warning",title:"Read this first",children:e.jsx(s.p,{children:"This connector uses an unofficial path: a proxy service pretends to be a WeChat client on your behalf. WeChat's terms of service technically don't allow this, and WeChat does occasionally ban accounts that use it. Use a dedicated account, not your personal one, and never paste your real WeChat Pay or banking-linked account into any proxy service."})}),`
`,e.jsx(s.h2,{id:"what-you-need-before-you-start",children:e.jsx(s.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A WeChat account"})," you can afford to lose if it gets banned. Create a new one specifically for this."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A WeChat proxy service"}),' — see the "Picking a proxy" section below.']}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A second device"})," (phone with WeChat installed) to scan the login QR code."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(s.h2,{id:"picking-a-proxy",children:e.jsx(s.a,{className:"anchor",href:"#picking-a-proxy",children:"Picking a proxy"})}),`
`,e.jsx(s.p,{children:"You have two realistic options:"}),`
`,e.jsxs(s.ol,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Run your own proxy on a Mac or Linux server."}),' Open-source projects exist — search for "wechaty" or "ItChat-Puppet" on GitHub. This is the most private path but requires dev setup.']}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Use a hosted proxy service."})," Several commercial services offer this for a fee. Evaluate the provider carefully — the proxy sees every message, attachment, and contact that flows through your account."]}),`
`]}),`
`,e.jsx(s.p,{children:"Whichever you pick, you'll end up with:"}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:["An ",e.jsx(s.strong,{children:"API key"})," the proxy service issues you"]}),`
`,e.jsxs(s.li,{children:["A ",e.jsx(s.strong,{children:"proxy URL"})," you can reach from your Milady machine"]}),`
`]}),`
`,e.jsx(s.h2,{id:"step-1--set-up-the-proxy-service",children:e.jsx(s.a,{className:"anchor",href:"#step-1--set-up-the-proxy-service",children:"Step 1 — Set up the proxy service"})}),`
`,e.jsx(s.p,{children:"Follow the proxy service's own documentation. At the end you should have:"}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsx(s.li,{children:"API key (paste into Milady)"}),`
`,e.jsxs(s.li,{children:["Proxy URL (e.g. ",e.jsx(s.code,{children:"https://wechat-proxy.yourservice.com"})," or ",e.jsx(s.code,{children:"http://localhost:3001"})," for a local one)"]}),`
`]}),`
`,e.jsx(s.h2,{id:"step-2--configure-the-plugin-in-miladyjson",children:e.jsx(s.a,{className:"anchor",href:"#step-2--configure-the-plugin-in-miladyjson",children:"Step 2 — Configure the plugin in milady.json"})}),`
`,e.jsxs(s.p,{children:["The WeChat connector is unusual — it's configured through ",e.jsx(s.code,{children:"milady.json"})," directly, not just the plugin Configure panel, because it has structured config fields that don't fit the flat env-var UI."]}),`
`,e.jsxs(s.p,{children:["Open ",e.jsx(s.code,{children:"~/.milady/milady.json"})," and add a ",e.jsx(s.code,{children:"connectors.wechat"})," block:"]}),`
`,e.jsx(e.Fragment,{children:e.jsx(s.pre,{className:"shiki github-dark",style:{backgroundColor:"#24292e",color:"#e1e4e8"},tabIndex:"0",children:e.jsxs(s.code,{children:[e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"{"})}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'  "connectors"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'    "wechat"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'      "apiKey"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"your-proxy-api-key"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'      "proxyUrl"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"https://your-proxy-service/api"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'      "deviceType"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"ipad"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'      "features"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'        "images"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#79B8FF"},children:"false"}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'        "groups"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#79B8FF"},children:"false"})]}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"      }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"    }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"  }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"}"})})]})})}),`
`,e.jsx(s.p,{children:e.jsx(s.strong,{children:"Field meanings:"})}),`
`,e.jsxs(s.table,{children:[e.jsx(s.thead,{children:e.jsxs(s.tr,{children:[e.jsx(s.th,{children:"Field"}),e.jsx(s.th,{children:"What it does"})]})}),e.jsxs(s.tbody,{children:[e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"apiKey"})}),e.jsx(s.td,{children:"Auth credential for your proxy service. Required."})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"proxyUrl"})}),e.jsx(s.td,{children:"Base URL of your proxy service. Required."})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"deviceType"})}),e.jsxs(s.td,{children:[e.jsx(s.code,{children:"ipad"})," (default) or ",e.jsx(s.code,{children:"mac"})," — emulates what kind of WeChat client. iPad is less likely to bump you off other active sessions."]})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"features.images"})}),e.jsx(s.td,{children:"Enable image send/receive. Off by default."})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"features.groups"})}),e.jsx(s.td,{children:"Enable group chat support. Off by default."})]})]})]}),`
`,e.jsx(l,{kind:"tip",children:e.jsxs(s.p,{children:["Keep ",e.jsx("code",{children:"features.groups"})," off for your first run. Group support multiplies the volume of events the bot sees and makes rate limits easier to hit."]})}),`
`,e.jsx(s.h2,{id:"step-3--restart-milady-and-scan-the-qr-code",children:e.jsx(s.a,{className:"anchor",href:"#step-3--restart-milady-and-scan-the-qr-code",children:"Step 3 — Restart Milady and scan the QR code"})}),`
`,e.jsxs(r,{children:[e.jsx("li",{children:"Restart Milady (or reload the WeChat plugin from Settings → Plugins)."}),e.jsx("li",{children:"Milady's terminal / status panel will show a QR code."}),e.jsxs("li",{children:["Open WeChat on your phone → ",e.jsx("strong",{children:"Me → Settings → Account & Security → Manage Devices → Sign in to Web WeChat"}),"."]}),e.jsx("li",{children:"Scan the QR code from Milady with your phone."}),e.jsx("li",{children:"Confirm the login on your phone."})]}),`
`,e.jsx(s.p,{children:"Milady's WeChat plugin now holds a session. The session persists — you don't need to rescan every time unless WeChat invalidates it."}),`
`,e.jsx(s.h2,{id:"step-4--test-it",children:e.jsx(s.a,{className:"anchor",href:"#step-4--test-it",children:"Step 4 — Test it"})}),`
`,e.jsx(s.p,{children:"Send a WeChat message from another account to the account you just logged in with. Milady should see it and respond."}),`
`,e.jsx(s.h2,{id:"multiple-accounts",children:e.jsx(s.a,{className:"anchor",href:"#multiple-accounts",children:"Multiple accounts"})}),`
`,e.jsxs(s.p,{children:["If you want the agent to run multiple WeChat accounts (e.g. one for each region or purpose), use the ",e.jsx(s.code,{children:"accounts"})," map:"]}),`
`,e.jsx(e.Fragment,{children:e.jsx(s.pre,{className:"shiki github-dark",style:{backgroundColor:"#24292e",color:"#e1e4e8"},tabIndex:"0",children:e.jsxs(s.code,{children:[e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"{"})}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'  "connectors"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'    "wechat"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'      "proxyUrl"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"https://your-proxy/api"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'      "accounts"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'        "cn-main"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": { "}),e.jsx(s.span,{style:{color:"#79B8FF"},children:'"apiKey"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"key1"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:" },"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'        "hk-backup"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": { "}),e.jsx(s.span,{style:{color:"#79B8FF"},children:'"apiKey"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"key2"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:" }"})]}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"      }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"    }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"  }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"}"})})]})})}),`
`,e.jsx(s.p,{children:"Each account gets its own QR scan and its own session."}),`
`,e.jsx(s.h2,{id:"troubleshooting",children:e.jsx(s.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:'QR code scan succeeds but Milady says "not logged in."'}),`
Usually means the proxy service didn't get a valid session back from WeChat. Check the proxy service's own logs.`]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Messages arrive but agent never replies."}),`
Check `,e.jsx(s.code,{children:"features.images"})," if the incoming message has a picture — images are off by default and the agent won't process attachments it can't decode."]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Account gets banned or locked."}),`
This happens. Recovery is possible through WeChat's identity verification flow on your phone, but the path out of a ban sometimes requires Chinese-language ID verification. Have a fallback account ready if this connector matters to you.`]}),`
`,e.jsx(s.h2,{id:"whats-next",children:e.jsx(s.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.a,{href:"/docs/intermediate/connect-feishu",children:"Connect to Feishu / Lark"})," — for work chat in China, Feishu has an official API and is much less risky."]}),`
`]})]})}function a(n={}){const{wrapper:s}={...o(),...n.components};return s?e.jsx(s,{...n,children:e.jsx(c,{...n})}):c(n)}function i(n,s){throw new Error("Expected component `"+n+"` to be defined: you likely forgot to import, pass, or provide it.")}export{a as default};

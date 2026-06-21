import{n as e,r as t}from"./index-DXnzbmOt.js";var n=t();function r(t){let r={a:`a`,code:`code`,h1:`h1`,h2:`h2`,li:`li`,p:`p`,strong:`strong`,table:`table`,tbody:`tbody`,td:`td`,th:`th`,thead:`thead`,tr:`tr`,ul:`ul`,...e(),...t.components},{Callout:i,Steps:o}=r;return i||a(`Callout`,!0),o||a(`Steps`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`connect-to-zalo-personal-account`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#connect-to-zalo-personal-account`,children:`Connect to Zalo (personal account)`})}),`
`,(0,n.jsx)(i,{kind:`warning`,children:(0,n.jsxs)(r.p,{children:[`The Zalo User connector uses an `,(0,n.jsx)(`strong`,{children:`unofficial API`}),` — it logs in as a personal Zalo account rather than using an Official Account. This violates Zalo's terms of service and can get your account banned. Use a dedicated account, not your main one. If your use case is business-facing, use `,(0,n.jsx)(`a`,{href:`/docs/intermediate/connect-zalo`,children:`the official Zalo OA connector`}),` instead.`]})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` export your Zalo session from a real Zalo client, point Milady at the session files, and connect.`]}),`
`,(0,n.jsx)(r.h2,{id:`what-you-need-before-you-start`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-you-need-before-you-start`,children:`What you need before you start`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A dedicated Zalo account`}),` — create a fresh one.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Either an iPhone/Android with official Zalo installed`}),`, or a Zalo web session running in a browser where you can read cookies.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Milady running`}),` with a working provider.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`step-1--export-session-data`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-1--export-session-data`,children:`Step 1 — Export session data`})}),`
`,(0,n.jsx)(r.p,{children:`The connector reads the same session information the official Zalo client uses — cookies, device IMEI, user agent. You need to grab these from a live Zalo session and save them to a file Milady can read.`}),`
`,(0,n.jsx)(r.p,{children:`Exact extraction depends on your platform. The general shape:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Zalo on desktop browser:`}),` open devtools → Application → Cookies → `,(0,n.jsx)(r.code,{children:`chat.zalo.me`}),` → copy all cookies to a JSON file.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Zalo mobile app:`}),` requires a rooted / jailbroken device and is much harder. Most users use the browser path.`]}),`
`]}),`
`,(0,n.jsxs)(r.p,{children:[`Save the cookies as JSON at a path you'll reference, e.g. `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/zalouser-cookies.json`}),`.`]}),`
`,(0,n.jsx)(r.h2,{id:`step-2--get-your-imei-and-user-agent`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-2--get-your-imei-and-user-agent`,children:`Step 2 — Get your IMEI and User Agent`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`IMEI:`}),` the official mobile Zalo app uses a device IMEI to identify sessions. You can extract yours from the Zalo desktop app's local storage — or, if unavailable, generate a plausible one and hope for the best (this is unreliable).`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`User Agent:`}),` the browser user agent string from the device where you captured the cookies. Copy from devtools → Network → any request → Request Headers.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`step-3--hand-everything-to-milady`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-3--hand-everything-to-milady`,children:`Step 3 — Hand everything to Milady`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsxs)(`li`,{children:[`Open Milady. Go to `,(0,n.jsx)(`strong`,{children:`Settings → Plugins → Zalo User → Configure`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Set `,(0,n.jsx)(`strong`,{children:`Cookie path`}),` to the absolute path of the JSON file from Step 1.`]}),(0,n.jsxs)(`li`,{children:[`Paste the `,(0,n.jsx)(`strong`,{children:`IMEI`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Paste the `,(0,n.jsx)(`strong`,{children:`User agent`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Click `,(0,n.jsx)(`strong`,{children:`Save`}),`.`]})]}),`
`,(0,n.jsx)(r.h2,{id:`step-4--test`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-4--test`,children:`Step 4 — Test`})}),`
`,(0,n.jsx)(r.p,{children:`Send a Zalo message from another account to the account you used for the cookies. If everything is set up right, Milady will see it and reply.`}),`
`,(0,n.jsx)(r.h2,{id:`multi-account-profiles`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#multi-account-profiles`,children:`Multi-account profiles`})}),`
`,(0,n.jsxs)(r.p,{children:[`If you want to run multiple personal Zalo accounts simultaneously, use the `,(0,n.jsx)(r.strong,{children:`Profiles`}),` field to pass a JSON array of separate session configs. Each profile needs its own cookie path, IMEI, and user agent.`]}),`
`,(0,n.jsx)(r.h2,{id:`useful-options`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#useful-options`,children:`Useful options`})}),`
`,(0,n.jsxs)(r.table,{children:[(0,n.jsx)(r.thead,{children:(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.th,{children:`Option`}),(0,n.jsx)(r.th,{children:`What it does`})]})}),(0,n.jsxs)(r.tbody,{children:[(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.strong,{children:`Allowed threads`})}),(0,n.jsx)(r.td,{children:`Restrict the bot to replying only in specific conversation threads. Empty = all threads.`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.strong,{children:`DM policy / Group policy`})}),(0,n.jsxs)(r.td,{children:[`Standard `,(0,n.jsx)(r.code,{children:`allow-all`}),` / `,(0,n.jsx)(r.code,{children:`allow-from`}),` pattern.`]})]})]})]}),`
`,(0,n.jsx)(r.h2,{id:`troubleshooting`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#troubleshooting`,children:`Troubleshooting`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`"Session invalid" on startup.`}),`
Cookies expired. Log in to Zalo on the browser again, re-export, update the file.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`IMEI mismatch error.`}),`
The IMEI doesn't match the session — Zalo ties cookies to specific device IDs. You need to re-capture both together from the same live session.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Account gets flagged or disconnected mid-session.`}),`
This is the normal failure mode for unofficial-API Zalo access. Your session will eventually end, sometimes within hours, sometimes within weeks. Re-export and continue — or switch to the `,(0,n.jsx)(r.a,{href:`/docs/intermediate/connect-zalo`,children:`official OA connector`}),`.`]}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.a,{href:`/docs/intermediate/connect-zalo`,children:`Connect to Zalo (Official Account)`}),` — the official, ToS-compliant path. Strongly preferred if you have the option.`]}),`
`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
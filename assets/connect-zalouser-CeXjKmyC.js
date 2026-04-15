import{u as a,j as e}from"./index-BfT5spx2.js";function i(s){const n={a:"a",code:"code",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...a(),...s.components},{Callout:o,Steps:t}=n;return o||r("Callout"),t||r("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"connect-to-zalo-personal-account",children:e.jsx(n.a,{className:"anchor",href:"#connect-to-zalo-personal-account",children:"Connect to Zalo (personal account)"})}),`
`,e.jsx(o,{kind:"warning",children:e.jsxs(n.p,{children:["The Zalo User connector uses an ",e.jsx("strong",{children:"unofficial API"})," — it logs in as a personal Zalo account rather than using an Official Account. This violates Zalo's terms of service and can get your account banned. Use a dedicated account, not your main one. If your use case is business-facing, use ",e.jsx("a",{href:"/docs/intermediate/connect-zalo",children:"the official Zalo OA connector"})," instead."]})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," export your Zalo session from a real Zalo client, point Milady at the session files, and connect."]}),`
`,e.jsx(n.h2,{id:"what-you-need-before-you-start",children:e.jsx(n.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A dedicated Zalo account"})," — create a fresh one."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Either an iPhone/Android with official Zalo installed"}),", or a Zalo web session running in a browser where you can read cookies."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(n.h2,{id:"step-1--export-session-data",children:e.jsx(n.a,{className:"anchor",href:"#step-1--export-session-data",children:"Step 1 — Export session data"})}),`
`,e.jsx(n.p,{children:"The connector reads the same session information the official Zalo client uses — cookies, device IMEI, user agent. You need to grab these from a live Zalo session and save them to a file Milady can read."}),`
`,e.jsx(n.p,{children:"Exact extraction depends on your platform. The general shape:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Zalo on desktop browser:"})," open devtools → Application → Cookies → ",e.jsx(n.code,{children:"chat.zalo.me"})," → copy all cookies to a JSON file."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Zalo mobile app:"})," requires a rooted / jailbroken device and is much harder. Most users use the browser path."]}),`
`]}),`
`,e.jsxs(n.p,{children:["Save the cookies as JSON at a path you'll reference, e.g. ",e.jsx(n.code,{children:"~/.milady/zalouser-cookies.json"}),"."]}),`
`,e.jsx(n.h2,{id:"step-2--get-your-imei-and-user-agent",children:e.jsx(n.a,{className:"anchor",href:"#step-2--get-your-imei-and-user-agent",children:"Step 2 — Get your IMEI and User Agent"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"IMEI:"})," the official mobile Zalo app uses a device IMEI to identify sessions. You can extract yours from the Zalo desktop app's local storage — or, if unavailable, generate a plausible one and hope for the best (this is unreliable)."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"User Agent:"})," the browser user agent string from the device where you captured the cookies. Copy from devtools → Network → any request → Request Headers."]}),`
`]}),`
`,e.jsx(n.h2,{id:"step-3--hand-everything-to-milady",children:e.jsx(n.a,{className:"anchor",href:"#step-3--hand-everything-to-milady",children:"Step 3 — Hand everything to Milady"})}),`
`,e.jsxs(t,{children:[e.jsxs("li",{children:["Open Milady. Go to ",e.jsx("strong",{children:"Settings → Plugins → Zalo User → Configure"}),"."]}),e.jsxs("li",{children:["Set ",e.jsx("strong",{children:"Cookie path"})," to the absolute path of the JSON file from Step 1."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"IMEI"}),"."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"User agent"}),"."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Save"}),"."]})]}),`
`,e.jsx(n.h2,{id:"step-4--test",children:e.jsx(n.a,{className:"anchor",href:"#step-4--test",children:"Step 4 — Test"})}),`
`,e.jsx(n.p,{children:"Send a Zalo message from another account to the account you used for the cookies. If everything is set up right, Milady will see it and reply."}),`
`,e.jsx(n.h2,{id:"multi-account-profiles",children:e.jsx(n.a,{className:"anchor",href:"#multi-account-profiles",children:"Multi-account profiles"})}),`
`,e.jsxs(n.p,{children:["If you want to run multiple personal Zalo accounts simultaneously, use the ",e.jsx(n.strong,{children:"Profiles"})," field to pass a JSON array of separate session configs. Each profile needs its own cookie path, IMEI, and user agent."]}),`
`,e.jsx(n.h2,{id:"useful-options",children:e.jsx(n.a,{className:"anchor",href:"#useful-options",children:"Useful options"})}),`
`,e.jsxs(n.table,{children:[e.jsx(n.thead,{children:e.jsxs(n.tr,{children:[e.jsx(n.th,{children:"Option"}),e.jsx(n.th,{children:"What it does"})]})}),e.jsxs(n.tbody,{children:[e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Allowed threads"})}),e.jsx(n.td,{children:"Restrict the bot to replying only in specific conversation threads. Empty = all threads."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"DM policy / Group policy"})}),e.jsxs(n.td,{children:["Standard ",e.jsx(n.code,{children:"allow-all"})," / ",e.jsx(n.code,{children:"allow-from"})," pattern."]})]})]})]}),`
`,e.jsx(n.h2,{id:"troubleshooting",children:e.jsx(n.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:'"Session invalid" on startup.'}),`
Cookies expired. Log in to Zalo on the browser again, re-export, update the file.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"IMEI mismatch error."}),`
The IMEI doesn't match the session — Zalo ties cookies to specific device IDs. You need to re-capture both together from the same live session.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Account gets flagged or disconnected mid-session."}),`
This is the normal failure mode for unofficial-API Zalo access. Your session will eventually end, sometimes within hours, sometimes within weeks. Re-export and continue — or switch to the `,e.jsx(n.a,{href:"/docs/intermediate/connect-zalo",children:"official OA connector"}),"."]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/intermediate/connect-zalo",children:"Connect to Zalo (Official Account)"})," — the official, ToS-compliant path. Strongly preferred if you have the option."]}),`
`]})]})}function c(s={}){const{wrapper:n}={...a(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(i,{...s})}):i(s)}function r(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{c as default};

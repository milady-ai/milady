import{u as a,j as e}from"./index-BfT5spx2.js";function r(n){const s={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",hr:"hr",li:"li",p:"p",strong:"strong",ul:"ul",...a(),...n.components},{Callout:i,Steps:t}=s;return i||o("Callout"),t||o("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(s.h1,{id:"connect-to-whatsapp",children:e.jsx(s.a,{className:"anchor",href:"#connect-to-whatsapp",children:"Connect to WhatsApp"})}),`
`,e.jsxs(s.p,{children:["WhatsApp has ",e.jsx(s.strong,{children:"two very different modes"})," and picking the right one matters. Read this page carefully before starting — they have different setup effort, different reliability, and different risk profiles."]}),`
`,e.jsx(s.h2,{id:"pick-your-mode",children:e.jsx(s.a,{className:"anchor",href:"#pick-your-mode",children:"Pick your mode"})}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Cloud API (recommended for anything serious):"})," use Meta's official WhatsApp Business Platform. Requires a business, a verified phone number, and app approval from Meta. More work up front, works reliably forever."]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Baileys (for tinkerers):"})," uses an unofficial API that scans a QR code to log in as your personal WhatsApp account. Works in five minutes, but ",e.jsx(s.strong,{children:"violates WhatsApp's terms of service"})," and can get your personal account banned — sometimes immediately, sometimes after weeks."]}),`
`,e.jsx(s.p,{children:"The rest of this page has two halves — scroll to the mode you picked."}),`
`,e.jsx(s.hr,{}),`
`,e.jsx(s.h2,{id:"mode-1--cloud-api-official",children:e.jsx(s.a,{className:"anchor",href:"#mode-1--cloud-api-official",children:"Mode 1 — Cloud API (official)"})}),`
`,e.jsx(s.h3,{id:"what-you-need",children:e.jsx(s.a,{className:"anchor",href:"#what-you-need",children:"What you need"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A Meta Business account"})," and a real business entity (even a sole proprietorship works)."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A phone number"})," that's not currently registered on WhatsApp. You'll register it through Meta."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Facebook Developer account"})," at ",e.jsx("a",{href:"https://developers.facebook.com",children:"developers.facebook.com"}),"."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Milady on a public URL"})," (Cloud API pushes messages via webhook — see tunneling options below)."]}),`
`]}),`
`,e.jsx(s.h3,{id:"step-1--create-the-meta-app",children:e.jsx(s.a,{className:"anchor",href:"#step-1--create-the-meta-app",children:"Step 1 — Create the Meta app"})}),`
`,e.jsxs(t,{children:[e.jsxs("li",{children:["Open ",e.jsx("a",{href:"https://developers.facebook.com/apps",children:"developers.facebook.com/apps"})," and click ",e.jsx("strong",{children:"Create App"}),"."]}),e.jsxs("li",{children:["Pick ",e.jsx("strong",{children:"Business"})," as the use case."]}),e.jsx("li",{children:"Give it a name and link it to your Meta Business account."})]}),`
`,e.jsx(s.h3,{id:"step-2--add-whatsapp-to-the-app",children:e.jsx(s.a,{className:"anchor",href:"#step-2--add-whatsapp-to-the-app",children:"Step 2 — Add WhatsApp to the app"})}),`
`,e.jsxs(t,{children:[e.jsxs("li",{children:["In the new app's dashboard, click ",e.jsx("strong",{children:"Add Product"})," → find ",e.jsx("strong",{children:"WhatsApp"})," → ",e.jsx("strong",{children:"Set up"}),"."]}),e.jsx("li",{children:"Follow Meta's guided flow to associate a phone number. You can use the test number Meta provides for free during development, then add your real number later."}),e.jsxs("li",{children:["Copy the ",e.jsx("strong",{children:"Phone Number ID"})," and ",e.jsx("strong",{children:"WhatsApp Business Account ID"})," shown on the API Setup page."]})]}),`
`,e.jsx(s.h3,{id:"step-3--generate-a-permanent-access-token",children:e.jsx(s.a,{className:"anchor",href:"#step-3--generate-a-permanent-access-token",children:"Step 3 — Generate a permanent access token"})}),`
`,e.jsxs(t,{children:[e.jsx("li",{children:"In Meta Business Settings → Users → System Users → Add."}),e.jsx("li",{children:"Create a system user, assign it to the WhatsApp Business Account with full permissions."}),e.jsxs("li",{children:["Generate a token for it with ",e.jsx("code",{children:"whatsapp_business_messaging"})," and ",e.jsx("code",{children:"whatsapp_business_management"})," scopes. Never-expiring is the right option for production use."]}),e.jsx("li",{children:"Copy the token."})]}),`
`,e.jsx(s.h3,{id:"step-4--set-up-the-webhook",children:e.jsx(s.a,{className:"anchor",href:"#step-4--set-up-the-webhook",children:"Step 4 — Set up the webhook"})}),`
`,e.jsxs(t,{children:[e.jsx("li",{children:"Back in the app dashboard → WhatsApp → Configuration."}),e.jsxs("li",{children:["Callback URL: ",e.jsx("code",{children:"https://<your-public-milady-url>/webhooks/whatsapp"})]}),e.jsx("li",{children:"Verify token: pick any string — this is just used to verify the handshake. Save it, you'll paste it into Milady too."}),e.jsx("li",{children:"Meta pings the URL to verify. Milady must be running and reachable for this to succeed."}),e.jsxs("li",{children:["Subscribe to ",e.jsx("strong",{children:"messages"})," and ",e.jsx("strong",{children:"message_status"})," events."]})]}),`
`,e.jsx(s.h3,{id:"step-5--hand-credentials-to-milady",children:e.jsx(s.a,{className:"anchor",href:"#step-5--hand-credentials-to-milady",children:"Step 5 — Hand credentials to Milady"})}),`
`,e.jsxs(t,{children:[e.jsx("li",{children:"Settings → Plugins → WhatsApp → Configure."}),e.jsxs("li",{children:["Set ",e.jsx("strong",{children:"Mode"})," to ",e.jsx("code",{children:"cloud"}),"."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Access token"})," from Step 3."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Phone Number ID"})," and ",e.jsx("strong",{children:"Business Account ID"})," from Step 2."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Webhook verify token"})," you chose in Step 4."]}),e.jsx("li",{children:"Save."})]}),`
`,e.jsx(s.h3,{id:"step-6--test",children:e.jsx(s.a,{className:"anchor",href:"#step-6--test",children:"Step 6 — Test"})}),`
`,e.jsx(s.p,{children:"Send a WhatsApp message to the registered business number from a personal phone. Milady should reply within a couple of seconds."}),`
`,e.jsx(s.hr,{}),`
`,e.jsx(s.h2,{id:"mode-2--baileys-personal-qr-code-tos-violating",children:e.jsx(s.a,{className:"anchor",href:"#mode-2--baileys-personal-qr-code-tos-violating",children:"Mode 2 — Baileys (personal, QR code, ToS-violating)"})}),`
`,e.jsx(s.h3,{id:"what-you-need-1",children:e.jsx(s.a,{className:"anchor",href:"#what-you-need-1",children:"What you need"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A personal WhatsApp account"})," you can afford to lose. Never use your main number."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A persistent directory"})," for session files so you don't have to re-scan the QR code after every restart."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(s.h3,{id:"step-1--pick-a-session-directory",children:e.jsx(s.a,{className:"anchor",href:"#step-1--pick-a-session-directory",children:"Step 1 — Pick a session directory"})}),`
`,e.jsxs(s.p,{children:["Pick an absolute path on your machine, e.g. ",e.jsx(s.code,{children:"~/.milady/whatsapp-auth/"}),". Milady will store the encrypted session here."]}),`
`,e.jsx(s.h3,{id:"step-2--configure-the-plugin",children:e.jsx(s.a,{className:"anchor",href:"#step-2--configure-the-plugin",children:"Step 2 — Configure the plugin"})}),`
`,e.jsxs(t,{children:[e.jsx("li",{children:"Settings → Plugins → WhatsApp → Configure."}),e.jsxs("li",{children:["Set ",e.jsx("strong",{children:"Mode"})," to ",e.jsx("code",{children:"baileys"}),"."]}),e.jsxs("li",{children:["Set ",e.jsx("strong",{children:"Auth dir"})," to the absolute path from Step 1."]}),e.jsx("li",{children:"Save."})]}),`
`,e.jsx(s.h3,{id:"step-3--scan-the-qr-code",children:e.jsx(s.a,{className:"anchor",href:"#step-3--scan-the-qr-code",children:"Step 3 — Scan the QR code"})}),`
`,e.jsxs(t,{children:[e.jsx("li",{children:"Milady shows a QR code in its console or status panel."}),e.jsx("li",{children:"On your phone, open WhatsApp → Settings → Linked Devices → Link a Device → scan the code."}),e.jsx("li",{children:"Milady is now connected. The session file is saved to your auth dir for reuse."})]}),`
`,e.jsx(s.h3,{id:"step-4--test",children:e.jsx(s.a,{className:"anchor",href:"#step-4--test",children:"Step 4 — Test"})}),`
`,e.jsx(s.p,{children:"Send yourself a message from another WhatsApp account. Milady should see it and reply."}),`
`,e.jsx(i,{kind:"danger",title:"Baileys bans",children:e.jsx(s.p,{children:"Meta actively detects and bans unofficial WhatsApp clients. Timelines vary — some users run Baileys for years, some get banned in hours. There is no appeal. Your phone number is tied to your WhatsApp account; if it's banned, that number cannot register again for weeks or months."})}),`
`,e.jsx(s.hr,{}),`
`,e.jsx(s.h2,{id:"troubleshooting",children:e.jsx(s.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Cloud API: webhook verification fails during setup."}),`
Milady must be running and publicly reachable at the URL you entered. The verify token must match on both sides exactly.`]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Cloud API: messages arrive but replies go nowhere."}),`
Check the access token hasn't expired (for system user tokens this shouldn't happen, but double-check the scopes include `,e.jsx(s.code,{children:"whatsapp_business_messaging"}),")."]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Baileys: QR code doesn't scan."}),`
The code expires after 20 seconds. Restart the plugin — it'll generate a new one.`]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:'Baileys: "Connection closed" errors after being stable.'}),`
Usually means the session was invalidated from the phone side (another device linked, or WhatsApp detected the login). Delete the auth dir and rescan.`]}),`
`,e.jsx(s.h2,{id:"whats-next",children:e.jsx(s.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.a,{href:"/docs/intermediate/connect-telegram",children:"Connect to Telegram"})," — if WhatsApp's tradeoffs are too much, Telegram bots are the friendliest messaging platform for automation."]}),`
`]})]})}function l(n={}){const{wrapper:s}={...a(),...n.components};return s?e.jsx(s,{...n,children:e.jsx(r,{...n})}):r(n)}function o(n,s){throw new Error("Expected component `"+n+"` to be defined: you likely forgot to import, pass, or provide it.")}export{l as default};

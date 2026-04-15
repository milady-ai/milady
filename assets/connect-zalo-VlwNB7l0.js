import{u as r,j as e}from"./index-BfT5spx2.js";function t(s){const n={a:"a",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...r(),...s.components},{Steps:o}=n;return o||a("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"connect-to-zalo",children:e.jsx(n.a,{className:"anchor",href:"#connect-to-zalo",children:"Connect to Zalo"})}),`
`,e.jsxs(n.p,{children:["Zalo is Vietnam's dominant messaging and social platform. This connector uses the ",e.jsx(n.strong,{children:"official Zalo Official Account API"})," — the one Zalo blesses for businesses and app developers. For a personal-account path with different tradeoffs, see ",e.jsx(n.a,{href:"/docs/intermediate/connect-zalouser",children:"Connect to Zalo (personal)"}),"."]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," create a Zalo Official Account, register an app in the Zalo developer portal, generate OAuth tokens, and point Milady at them."]}),`
`,e.jsx(n.h2,{id:"what-you-need-before-you-start",children:e.jsx(n.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A Zalo account"})," (personal) — you'll use it to sign in to the developer portal."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A Zalo Official Account (OA)"})," — you can create one at ",e.jsx("a",{href:"https://oa.zalo.me",children:"oa.zalo.me"}),". For serious use it helps to have a Vietnamese business entity, but individual OAs are also possible."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A publicly reachable HTTPS URL"})," for Milady (Zalo pushes messages via webhook)."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(n.h2,{id:"step-1--create-a-zalo-official-account",children:e.jsx(n.a,{className:"anchor",href:"#step-1--create-a-zalo-official-account",children:"Step 1 — Create a Zalo Official Account"})}),`
`,e.jsxs(o,{children:[e.jsxs("li",{children:["Open ",e.jsx("a",{href:"https://oa.zalo.me",children:"oa.zalo.me"})," and sign in with your personal Zalo account."]}),e.jsx("li",{children:"Follow the OA creation flow. Pick a category appropriate for what the bot will do."}),e.jsx("li",{children:"Note the OA's ID."})]}),`
`,e.jsx(n.h2,{id:"step-2--register-an-app-in-the-zalo-developer-portal",children:e.jsx(n.a,{className:"anchor",href:"#step-2--register-an-app-in-the-zalo-developer-portal",children:"Step 2 — Register an app in the Zalo developer portal"})}),`
`,e.jsxs(o,{children:[e.jsxs("li",{children:["Open ",e.jsx("a",{href:"https://developers.zalo.me",children:"developers.zalo.me"})," and sign in."]}),e.jsx("li",{children:"Create a new app. Link it to the OA you created in Step 1."}),e.jsxs("li",{children:["In the app settings, copy the ",e.jsx("strong",{children:"App ID"})," and ",e.jsx("strong",{children:"Secret Key"}),"."]})]}),`
`,e.jsx(n.h2,{id:"step-3--get-oauth-access--refresh-tokens",children:e.jsx(n.a,{className:"anchor",href:"#step-3--get-oauth-access--refresh-tokens",children:"Step 3 — Get OAuth access + refresh tokens"})}),`
`,e.jsx(n.p,{children:"Zalo's Official Account API uses OAuth. You authorize your OA once, and the developer portal gives you an access token (short-lived) and a refresh token (long-lived)."}),`
`,e.jsxs(o,{children:[e.jsxs("li",{children:["In the developer portal, go to your app → ",e.jsx("strong",{children:"API Explorer"})," or the OAuth flow page."]}),e.jsx("li",{children:"Authorize your OA. The portal returns an access token and a refresh token."}),e.jsx("li",{children:"Copy both. Milady will use the refresh token to get new access tokens automatically once the current one expires (every few hours)."})]}),`
`,e.jsx(n.h2,{id:"step-4--set-up-the-webhook",children:e.jsx(n.a,{className:"anchor",href:"#step-4--set-up-the-webhook",children:"Step 4 — Set up the webhook"})}),`
`,e.jsxs(o,{children:[e.jsxs("li",{children:["In the Zalo developer portal, set the app's ",e.jsx("strong",{children:"Webhook URL"})," to ",e.jsx("code",{children:"https://<your-public-milady-url>/webhooks/zalo"}),"."]}),e.jsx("li",{children:"Zalo verifies the URL — Milady must be running and reachable."}),e.jsx("li",{children:"Subscribe to the events you need: incoming messages, user follow/unfollow, etc."})]}),`
`,e.jsx(n.h2,{id:"step-5--hand-credentials-to-milady",children:e.jsx(n.a,{className:"anchor",href:"#step-5--hand-credentials-to-milady",children:"Step 5 — Hand credentials to Milady"})}),`
`,e.jsxs(o,{children:[e.jsxs("li",{children:["Open Milady. Go to ",e.jsx("strong",{children:"Settings → Plugins → Zalo → Configure"}),"."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"App ID"})," and ",e.jsx("strong",{children:"Secret Key"})," from Step 2."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Access token"})," and ",e.jsx("strong",{children:"Refresh token"})," from Step 3."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Save"}),"."]})]}),`
`,e.jsx(n.h2,{id:"step-6--test",children:e.jsx(n.a,{className:"anchor",href:"#step-6--test",children:"Step 6 — Test"})}),`
`,e.jsx(n.p,{children:"From another Zalo account, message your OA. Within a few seconds Milady should reply."}),`
`,e.jsx(n.h2,{id:"troubleshooting",children:e.jsx(n.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:'"Invalid access token" after a few hours.'}),`
Access tokens expire and need refreshing. Milady does this automatically if the refresh token is correct. If it's not, you'll need to re-run the OAuth flow in Step 3.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Webhook verification fails."}),`
Milady's public URL isn't reachable, or the tunnel is down.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Messages arrive but replies never send."}),`
OA might not have the right scopes. Check the Zalo developer portal → app permissions and make sure Messaging is approved.`]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/intermediate/connect-zalouser",children:"Connect to Zalo (personal)"})," — if you want to use a personal Zalo account instead of an Official Account."]}),`
`]})]})}function l(s={}){const{wrapper:n}={...r(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(t,{...s})}):t(s)}function a(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{l as default};

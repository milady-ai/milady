import{u as r,j as e}from"./index-BfT5spx2.js";function i(o){const n={a:"a",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...r(),...o.components},{Steps:s}=n;return s||t("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"connect-to-blooio",children:e.jsx(n.a,{className:"anchor",href:"#connect-to-blooio",children:"Connect to Blooio"})}),`
`,e.jsx(n.p,{children:'Blooio is a service that bridges SMS and iMessage via an API — you get a phone number, a key, and the ability to send text messages programmatically from that number. Good for cases where you want to send SMS from a "real" number without paying Twilio rates.'}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," sign up for Blooio, copy your API key and phone number, configure the webhook, hand everything to Milady."]}),`
`,e.jsx(n.h2,{id:"what-you-need-before-you-start",children:e.jsx(n.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A Blooio account"})," at ",e.jsx("a",{href:"https://bloo.io",children:"bloo.io"}),"."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A publicly reachable HTTPS URL"})," for Milady (Blooio pushes incoming SMS via webhook)."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(n.h2,{id:"step-1--sign-up-and-get-a-number",children:e.jsx(n.a,{className:"anchor",href:"#step-1--sign-up-and-get-a-number",children:"Step 1 — Sign up and get a number"})}),`
`,e.jsxs(s,{children:[e.jsxs("li",{children:["Open ",e.jsx("a",{href:"https://bloo.io",children:"bloo.io"})," and sign up."]}),e.jsx("li",{children:"Follow the onboarding to associate a phone number. Depending on your plan you may get a new number or bring your own."}),e.jsxs("li",{children:["In the dashboard, go to ",e.jsx("strong",{children:"API → Keys"})," and copy your ",e.jsx("strong",{children:"API key"}),"."]}),e.jsxs("li",{children:["Copy your ",e.jsx("strong",{children:"phone number"})," in the format Blooio shows (usually E.164 like ",e.jsx("code",{children:"+15551234567"}),")."]})]}),`
`,e.jsx(n.h2,{id:"step-2--configure-the-webhook",children:e.jsx(n.a,{className:"anchor",href:"#step-2--configure-the-webhook",children:"Step 2 — Configure the webhook"})}),`
`,e.jsxs(s,{children:[e.jsxs("li",{children:["In the Blooio dashboard, find ",e.jsx("strong",{children:"Webhooks"})," or ",e.jsx("strong",{children:"Incoming messages"}),"."]}),e.jsxs("li",{children:["Set the webhook URL to ",e.jsx("code",{children:"https://<your-public-milady-url>/webhooks/blooio"}),"."]}),e.jsxs("li",{children:["Generate or set a ",e.jsx("strong",{children:"webhook secret"})," — any long random string. Save it."]}),e.jsx("li",{children:"Save."})]}),`
`,e.jsx(n.h2,{id:"step-3--hand-credentials-to-milady",children:e.jsx(n.a,{className:"anchor",href:"#step-3--hand-credentials-to-milady",children:"Step 3 — Hand credentials to Milady"})}),`
`,e.jsxs(s,{children:[e.jsxs("li",{children:["Open Milady. Go to ",e.jsx("strong",{children:"Settings → Plugins → Blooio → Configure"}),"."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"API key"})," from Step 1."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Phone number"})," from Step 1."]}),e.jsxs("li",{children:["Set ",e.jsx("strong",{children:"Webhook URL"})," to the public Milady URL you configured in Blooio."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Webhook secret"})," from Step 2."]}),e.jsxs("li",{children:["Leave ",e.jsx("strong",{children:"Base URL"})," as default unless Blooio told you otherwise."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Save"}),"."]})]}),`
`,e.jsx(n.h2,{id:"step-4--test-it",children:e.jsx(n.a,{className:"anchor",href:"#step-4--test-it",children:"Step 4 — Test it"})}),`
`,e.jsx(n.p,{children:"From your phone, send a text to the Blooio number. Within a few seconds Milady should reply."}),`
`,e.jsx(n.h2,{id:"troubleshooting",children:e.jsx(n.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Incoming texts don't reach Milady."}),`
Milady's public URL isn't reachable, or the webhook secret doesn't match. Blooio's dashboard usually has a delivery log — check it for the last few attempts.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:'Outgoing texts fail with "insufficient credit" or similar.'}),`
Check your Blooio plan and add credit if needed.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"International destinations fail."}),`
Blooio, like most SMS services, restricts which country codes you can send to by default. Check your plan's allowed destinations.`]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/intermediate/connect-twilio",children:"Connect to Twilio"})," — if you want fuller control, global reach, and voice calls in addition to SMS, Twilio is the bigger but more expensive option."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/intermediate/connect-imessage",children:"Connect to iMessage (macOS)"})," — if blue bubbles matter to you and Milady runs on a Mac."]}),`
`]})]})}function h(o={}){const{wrapper:n}={...r(),...o.components};return n?e.jsx(n,{...o,children:e.jsx(i,{...o})}):i(o)}function t(o,n){throw new Error("Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}export{h as default};

import{u as a,j as e}from"./index-BfT5spx2.js";function t(s){const n={a:"a",code:"code",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...a(),...s.components},{Steps:r}=n;return r||i("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"connect-to-farcaster",children:e.jsx(n.a,{className:"anchor",href:"#connect-to-farcaster",children:"Connect to Farcaster"})}),`
`,e.jsx(n.p,{children:"Farcaster is a decentralized social protocol with a thriving crypto-native user base. Your Milady agent can post casts, reply to mentions, and have a real presence on the network. Setup uses Warpcast (the main Farcaster client) plus Neynar (the indexer that makes Farcaster data accessible via API)."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," get your Farcaster ID, create a signer through Neynar, and point Milady at both. About ten minutes."]}),`
`,e.jsx(n.h2,{id:"what-you-need-before-you-start",children:e.jsx(n.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A Warpcast account"})," at ",e.jsx("a",{href:"https://warpcast.com",children:"warpcast.com"}),". Signing up costs a one-time $5 to register on-chain."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A Neynar account"})," at ",e.jsx("a",{href:"https://neynar.com",children:"neynar.com"})," — the indexer that bridges Farcaster to regular web APIs. Free tier is generous."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(n.h2,{id:"step-1--get-your-fid",children:e.jsx(n.a,{className:"anchor",href:"#step-1--get-your-fid",children:"Step 1 — Get your FID"})}),`
`,e.jsxs(n.p,{children:["Your ",e.jsx(n.strong,{children:"FID (Farcaster ID)"})," is a number that identifies your account on-chain."]}),`
`,e.jsxs(r,{children:[e.jsxs("li",{children:["Open your Warpcast profile. The URL looks like ",e.jsx("code",{children:e.jsx(n.a,{href:"https://warpcast.com/yourusername",children:"https://warpcast.com/yourusername"})}),"."]}),e.jsxs("li",{children:["Click your profile picture or the hamburger menu → ",e.jsx("strong",{children:"About"}),"."]}),e.jsxs("li",{children:["The FID is shown in the profile details, or visible in URLs like ",e.jsx("code",{children:"warpcast.com/~/profiles/12345"}),"."]})]}),`
`,e.jsxs(n.p,{children:["Alternatively: ask any Farcaster user for their FID lookup link, or use ",e.jsx(n.code,{children:"https://api.neynar.com/v2/farcaster/user/by_username?username=yourusername"})," once you have a Neynar API key."]}),`
`,e.jsx(n.h2,{id:"step-2--sign-up-for-neynar-and-get-an-api-key",children:e.jsx(n.a,{className:"anchor",href:"#step-2--sign-up-for-neynar-and-get-an-api-key",children:"Step 2 — Sign up for Neynar and get an API key"})}),`
`,e.jsxs(r,{children:[e.jsxs("li",{children:["Open ",e.jsx("a",{href:"https://neynar.com",children:"neynar.com"})," and create an account."]}),e.jsxs("li",{children:["In the Neynar dashboard, go to ",e.jsx("strong",{children:"API keys"}),"."]}),e.jsx("li",{children:"Copy your API key. Free tier gives you plenty of requests for a personal bot."})]}),`
`,e.jsx(n.h2,{id:"step-3--create-a-signer-for-your-fid",children:e.jsx(n.a,{className:"anchor",href:"#step-3--create-a-signer-for-your-fid",children:"Step 3 — Create a signer for your FID"})}),`
`,e.jsxs(n.p,{children:["A ",e.jsx(n.strong,{children:"signer"})," is a delegated key that Neynar uses to post and react on your behalf. You create it once and reuse it — you don't have to sign individual posts with your root Farcaster key."]}),`
`,e.jsxs(r,{children:[e.jsxs("li",{children:["In the Neynar dashboard, go to ",e.jsx("strong",{children:"Signers → Create a signer"}),"."]}),e.jsx("li",{children:"Neynar walks you through an approval flow: you scan a QR code or open a deep link in Warpcast to authorize the signer on-chain. This costs a small amount of gas (Neynar subsidizes it in free tier)."}),e.jsxs("li",{children:["Once approved, Neynar gives you a ",e.jsx("strong",{children:"Signer UUID"}),". Copy it."]})]}),`
`,e.jsx(n.h2,{id:"step-4--hand-credentials-to-milady",children:e.jsx(n.a,{className:"anchor",href:"#step-4--hand-credentials-to-milady",children:"Step 4 — Hand credentials to Milady"})}),`
`,e.jsxs(r,{children:[e.jsxs("li",{children:["Open Milady. Go to ",e.jsx("strong",{children:"Settings → Plugins → Farcaster → Configure"}),"."]}),e.jsxs("li",{children:["Set ",e.jsx("strong",{children:"FID"})," to your Farcaster ID from Step 1 (just the number)."]}),e.jsxs("li",{children:["Set ",e.jsx("strong",{children:"Signer UUID"})," to the UUID from Step 3."]}),e.jsxs("li",{children:["Paste your ",e.jsx("strong",{children:"Neynar API key"})," from Step 2."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Save"}),"."]})]}),`
`,e.jsx(n.h2,{id:"step-5--test-it",children:e.jsx(n.a,{className:"anchor",href:"#step-5--test-it",children:"Step 5 — Test it"})}),`
`,e.jsx(n.p,{children:"From another Farcaster account, mention your bot's @username in a cast. Within a minute, Milady should see it and reply."}),`
`,e.jsx(n.h2,{id:"useful-options",children:e.jsx(n.a,{className:"anchor",href:"#useful-options",children:"Useful options"})}),`
`,e.jsxs(n.table,{children:[e.jsx(n.thead,{children:e.jsxs(n.tr,{children:[e.jsx(n.th,{children:"Option"}),e.jsx(n.th,{children:"What it does"})]})}),e.jsxs(n.tbody,{children:[e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Enable cast"})}),e.jsx(n.td,{children:"Lets the agent post autonomously on an interval. Off by default — mention-only is safer."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Cast interval min / max"})}),e.jsx(n.td,{children:"Minutes between autonomous casts. 60/180 is a reasonable starting range."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Max cast length"})}),e.jsx(n.td,{children:"Farcaster caps casts at 320 characters. Don't raise."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Poll interval"})}),e.jsx(n.td,{children:"Seconds between notification checks. Default is fine."})]})]})]}),`
`,e.jsx(n.h2,{id:"autonomous-posting",children:e.jsx(n.a,{className:"anchor",href:"#autonomous-posting",children:"Autonomous posting"})}),`
`,e.jsx(n.p,{children:"Enabling autonomous casts is more culturally fraught on Farcaster than on Twitter — the network is small enough that bad bots get called out quickly. If you enable it:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Start with long intervals (120/240 minutes minimum)."}),`
`,e.jsx(n.li,{children:"Monitor replies for the first few days and prune behaviors that embarrass you."}),`
`,e.jsx(n.li,{children:"Consider posting from a clearly-labeled bot account rather than your main FID."}),`
`]}),`
`,e.jsx(n.h2,{id:"troubleshooting",children:e.jsx(n.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:'"Invalid FID" when saving.'}),`
FID must be just the number (e.g. `,e.jsx(n.code,{children:"12345"}),"), not ",e.jsx(n.code,{children:"@username"})," or a URL."]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:'"Signer not approved."'}),`
You created the signer in Step 3 but didn't complete the on-chain approval flow in Warpcast. Go back to Neynar's signers page and click the pending signer — it'll show the QR/deep link to finish.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Mentions aren't being seen."}),`
Neynar indexes the network, so this usually means the Neynar API key is wrong or you hit rate limits. Check the Neynar dashboard for usage stats.`]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/intermediate/connect-bluesky",children:"Connect to Bluesky"})," — similar decentralized-social vibe, zero on-chain costs."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/intermediate/connect-nostr",children:"Connect to Nostr"})," — the other big decentralized social protocol."]}),`
`]})]})}function c(s={}){const{wrapper:n}={...a(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(t,{...s})}):t(s)}function i(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{c as default};

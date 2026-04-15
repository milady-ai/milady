import{u as a,j as e}from"./index-BfT5spx2.js";function o(n){const s={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",li:"li",p:"p",pre:"pre",span:"span",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...a(),...n.components},{Callout:r,Steps:t}=s;return r||i("Callout"),t||i("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(s.h1,{id:"connect-to-nostr",children:e.jsx(s.a,{className:"anchor",href:"#connect-to-nostr",children:"Connect to Nostr"})}),`
`,e.jsx(s.p,{children:"Nostr is a decentralized protocol where your identity is a cryptographic keypair, not an account on any server. Your Milady agent can post notes, reply to mentions, and respond to DMs across the Nostr relay network — no signup, no API key, no central service to revoke access."}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"What you'll learn:"})," generate a keypair (or reuse one you already have), pick relays, and point Milady at it. About ten minutes."]}),`
`,e.jsx(s.h2,{id:"what-you-need-before-you-start",children:e.jsx(s.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"A Nostr keypair"})," — either one you already have from Damus, Primal, Amethyst, or another Nostr client, or a new one we'll generate below."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(r,{kind:"warning",title:"Your private key is your identity",children:e.jsxs(s.p,{children:["On Nostr, the private key (",e.jsx("strong",{children:"nsec"}),") ",e.jsx("em",{children:"is"})," your account. Anyone who has it can post as you, forever — there's no password reset, no customer support, no central authority. Treat it like you'd treat a crypto wallet private key."]})}),`
`,e.jsx(s.h2,{id:"step-1--get-a-keypair",children:e.jsx(s.a,{className:"anchor",href:"#step-1--get-a-keypair",children:"Step 1 — Get a keypair"})}),`
`,e.jsx(s.h3,{id:"if-you-already-use-nostr",children:e.jsx(s.a,{className:"anchor",href:"#if-you-already-use-nostr",children:"If you already use Nostr"})}),`
`,e.jsx(s.p,{children:"Export your private key from your existing client:"}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Damus (iOS):"})," Settings → Keys → Copy private key (nsec)"]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Primal:"})," Settings → Your account → Export → nsec"]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Amethyst (Android):"})," Three-dot menu → Backup keys → Copy nsec"]}),`
`]}),`
`,e.jsxs(s.p,{children:["The key starts with ",e.jsx(s.code,{children:"nsec1..."}),". Copy it."]}),`
`,e.jsx(s.h3,{id:"if-youre-new-to-nostr",children:e.jsx(s.a,{className:"anchor",href:"#if-youre-new-to-nostr",children:"If you're new to Nostr"})}),`
`,e.jsx(s.p,{children:"Easiest path is to install any Nostr client (Damus, Primal, Amethyst, Iris, etc.), complete their onboarding to create an account, then export the private key as above. The client also sets up a display name, profile picture, etc., which saves you from configuring them through Milady."}),`
`,e.jsx(r,{kind:"tip",children:e.jsx(s.p,{children:"You can use the same nsec across every Nostr client and across Milady simultaneously. That's the whole point of the protocol — your identity is portable."})}),`
`,e.jsx(s.h2,{id:"step-2--pick-relays",children:e.jsx(s.a,{className:"anchor",href:"#step-2--pick-relays",children:"Step 2 — Pick relays"})}),`
`,e.jsxs(s.p,{children:["Nostr posts travel through ",e.jsx(s.strong,{children:"relays"})," — independent servers that forward events. Your agent connects to a list of relays and publishes/subscribes to each. For reliability, configure 3–5 popular ones:"]}),`
`,e.jsx(e.Fragment,{children:e.jsx(s.pre,{className:"shiki github-dark",style:{backgroundColor:"#24292e",color:"#e1e4e8"},tabIndex:"0",children:e.jsxs(s.code,{children:[e.jsx(s.span,{className:"line",children:e.jsx(s.span,{children:"wss://relay.damus.io"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{children:"wss://relay.nostr.band"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{children:"wss://nos.lol"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{children:"wss://relay.primal.net"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{children:"wss://nostr.wine"})})]})})}),`
`,e.jsx(s.p,{children:"You can add or remove later. More relays = more reach but also more bandwidth."}),`
`,e.jsx(s.h2,{id:"step-3--hand-the-keypair-to-milady",children:e.jsx(s.a,{className:"anchor",href:"#step-3--hand-the-keypair-to-milady",children:"Step 3 — Hand the keypair to Milady"})}),`
`,e.jsxs(t,{children:[e.jsxs("li",{children:["Open Milady. Go to ",e.jsx("strong",{children:"Settings → Plugins → Nostr → Configure"}),"."]}),e.jsxs("li",{children:["Paste your ",e.jsx("strong",{children:"nsec"})," private key into the private key field."]}),e.jsxs("li",{children:["Paste the comma-separated relay list from Step 2 into the ",e.jsx("strong",{children:"Relays"})," field."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Save"}),"."]})]}),`
`,e.jsx(s.h2,{id:"step-4--test-it",children:e.jsx(s.a,{className:"anchor",href:"#step-4--test-it",children:"Step 4 — Test it"})}),`
`,e.jsx(s.p,{children:"From any Nostr client, mention your public key (npub, which you can get from any client's profile page for your account) in a note. Within a minute, Milady's reply should appear on the same thread."}),`
`,e.jsx(s.h2,{id:"useful-options",children:e.jsx(s.a,{className:"anchor",href:"#useful-options",children:"Useful options"})}),`
`,e.jsxs(s.table,{children:[e.jsx(s.thead,{children:e.jsxs(s.tr,{children:[e.jsx(s.th,{children:"Option"}),e.jsx(s.th,{children:"What it does"})]})}),e.jsxs(s.tbody,{children:[e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"DM policy"})}),e.jsxs(s.td,{children:[e.jsx(s.code,{children:"allow-all"})," responds to every direct message. ",e.jsx(s.code,{children:"allow-from"})," restricts to a list of public keys."]})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"Allow from"})}),e.jsxs(s.td,{children:["Comma-separated list of npub public keys allowed to DM the agent. Only used when DM policy is ",e.jsx(s.code,{children:"allow-from"}),"."]})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.strong,{children:"Enabled"})}),e.jsx(s.td,{children:"Master on/off switch for the connector."})]})]})]}),`
`,e.jsx(s.h2,{id:"troubleshooting",children:e.jsx(s.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"The agent never sees mentions."}),`
Either the relays you picked aren't receiving traffic for your npub, or the relays Milady is connected to don't overlap with the relays the mention was sent to. Add more relays on both sides — `,e.jsx(s.code,{children:"wss://relay.damus.io"})," is a near-universal inclusion."]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:'"Invalid nsec" when saving.'}),`
Make sure you pasted the nsec, not the hex private key. nsec starts with `,e.jsx(s.code,{children:"nsec1..."}),". Some clients show both — use nsec for Milady."]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Direct messages aren't getting through."}),`
Nostr DMs are NIP-04 encrypted. Both sides need clients that support NIP-04 (all major clients do). If you're using a NIP-17 capable client on the sender side, DMs won't decrypt on Milady yet.`]}),`
`,e.jsx(s.h2,{id:"whats-next",children:e.jsx(s.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(s.p,{children:[e.jsx(s.a,{href:"/docs/advanced/multi-connector-setup",children:"Running multiple connectors"}),' — pair Nostr with Bluesky and Farcaster for full "fediverse + decentralized socials" coverage from one agent.']})]})}function c(n={}){const{wrapper:s}={...a(),...n.components};return s?e.jsx(s,{...n,children:e.jsx(o,{...n})}):o(n)}function i(n,s){throw new Error("Expected component `"+n+"` to be defined: you likely forgot to import, pass, or provide it.")}export{c as default};

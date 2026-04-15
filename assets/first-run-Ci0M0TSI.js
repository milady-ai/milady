import{u as s,j as e}from"./index-BfT5spx2.js";function i(r){const n={a:"a",h1:"h1",h2:"h2",li:"li",ol:"ol",p:"p",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...s(),...r.components},{Callout:t}=n;return t||a("Callout"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"your-first-launch",children:e.jsx(n.a,{className:"anchor",href:"#your-first-launch",children:"Your first launch"})}),`
`,e.jsx(n.p,{children:"The first time you open Milady, it walks you through a short onboarding flow to get an agent running. This page is a tour of what you'll see so nothing feels mysterious."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," what each onboarding step does, what you're actually choosing, and how to change your mind later."]}),`
`,e.jsx(n.h2,{id:"before-you-start",children:e.jsx(n.a,{className:"anchor",href:"#before-you-start",children:"Before you start"})}),`
`,e.jsx(n.p,{children:"You'll need one of the following to give your agent a brain:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"An API key"})," from a provider like OpenAI, Anthropic, OpenRouter, or another supported service. This is the fastest option — paste the key and you're live."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A local model"})," running via ",e.jsx(n.a,{href:"https://ollama.ai",children:"Ollama"}),". No key required; it runs entirely on your machine."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"An Eliza Cloud account"})," if you want a managed provider that's designed for Milady specifically."]}),`
`]}),`
`,e.jsx(n.p,{children:"Don't have any of these yet? That's fine — pick one during the provider step. You can also start with a free tier from OpenAI or Anthropic to get going in under a minute."}),`
`,e.jsx(n.h2,{id:"step-1--server-picker",children:e.jsx(n.a,{className:"anchor",href:"#step-1--server-picker",children:"Step 1 — Server picker"})}),`
`,e.jsxs(n.p,{children:["Milady separates ",e.jsx(n.strong,{children:"where the runtime lives"})," from ",e.jsx(n.strong,{children:"what language model powers it"}),". The server picker is step zero: it asks where your agent should run."]}),`
`,e.jsxs(n.table,{children:[e.jsx(n.thead,{children:e.jsxs(n.tr,{children:[e.jsx(n.th,{children:"Option"}),e.jsx(n.th,{children:"What it means"}),e.jsx(n.th,{children:"When to pick it"})]})}),e.jsxs(n.tbody,{children:[e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Local"})}),e.jsx(n.td,{children:"The Milady runtime runs on this computer. Everything stays on your machine."}),e.jsx(n.td,{children:"Almost everyone. This is the default."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"LAN"})}),e.jsx(n.td,{children:"The runtime lives on another machine on your network (another laptop, a home server)."}),e.jsx(n.td,{children:"You've already got Milady running elsewhere and want this machine to be a remote control."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Remote"})}),e.jsx(n.td,{children:"The runtime lives at a custom URL you specify."}),e.jsx(n.td,{children:"Self-hosting on a VPS, Docker host, or similar."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Eliza Cloud"})}),e.jsx(n.td,{children:"The runtime is hosted by Eliza Cloud. No local install needed."}),e.jsx(n.td,{children:"You want the simplest possible setup and don't want to manage a runtime."})]})]})]}),`
`,e.jsx(t,{kind:"tip",children:e.jsxs(n.p,{children:["Picking ",e.jsx(n.strong,{children:"Local"})," is the right answer for most people. You can switch later if you set up a server somewhere else."]})}),`
`,e.jsx(n.h2,{id:"step-2--identity",children:e.jsx(n.a,{className:"anchor",href:"#step-2--identity",children:"Step 2 — Identity"})}),`
`,e.jsx(n.p,{children:"This is where you name your agent and pick a character. A character is the combination of personality, voice, and avatar that shapes how Milady feels to talk to."}),`
`,e.jsx(n.p,{children:"You'll see a small gallery of built-in characters. Pick one that looks interesting. Don't overthink it — you can change character anytime, and every character can be customized later."}),`
`,e.jsx(n.p,{children:`The name you give here is what the agent will call itself in responses. "Milady" is the default. If you call it something else, it'll introduce itself that way.`}),`
`,e.jsx(n.h2,{id:"step-3--provider",children:e.jsx(n.a,{className:"anchor",href:"#step-3--provider",children:"Step 3 — Provider"})}),`
`,e.jsx(n.p,{children:"Now you pick the brain. Three categories:"}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Cloud providers"})," — OpenAI, Anthropic, OpenRouter, Eliza Cloud, etc. You paste an API key, pick a model, done. Fast, capable, but your messages get sent to the provider for inference."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Local providers"})," — Ollama running on your machine. Nothing leaves your computer. Slower on most hardware, but free and fully private."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Bring your own key"}),` — if you have a provider Milady supports and a key for it, this is the same as "Cloud" above. You don't need an Eliza Cloud account.`]}),`
`]}),`
`,e.jsx(t,{kind:"note",children:e.jsxs(n.p,{children:["You're picking a ",e.jsx(n.strong,{children:"starting"})," provider here. Milady supports mixing and matching later — chat goes to one provider, voice synthesis to another, embeddings to a third. Start simple."]})}),`
`,e.jsx(n.p,{children:"After you pick, Milady runs a quick connection test (is the API key valid? does the local model respond?) and moves on."}),`
`,e.jsx(n.h2,{id:"step-4--activate",children:e.jsx(n.a,{className:"anchor",href:"#step-4--activate",children:"Step 4 — Activate"})}),`
`,e.jsx(n.p,{children:`You'll see a "ready" confirmation. Click through, and Milady hands you the main interface: a chat view, the character's avatar, and a settings gear.`}),`
`,e.jsxs(n.p,{children:["Total time so far: ",e.jsx(n.strong,{children:"two to five minutes"})," if you have an API key in hand, ",e.jsx(n.strong,{children:"ten minutes"})," if you're installing Ollama for the first time, ",e.jsx(n.strong,{children:"less than a minute"})," if you picked Eliza Cloud."]}),`
`,e.jsx(n.h2,{id:"what-about-ios-and-android",children:e.jsx(n.a,{className:"anchor",href:"#what-about-ios-and-android",children:"What about iOS and Android?"})}),`
`,e.jsxs(n.p,{children:["On phones, the onboarding flow is almost identical — same server picker, same identity step, same provider step — but the default is usually Eliza Cloud because running a local model on a phone is rarely practical. You can still point a phone at a desktop running Milady (pick ",e.jsx(n.strong,{children:"LAN"})," or ",e.jsx(n.strong,{children:"Remote"}),") if you want."]}),`
`,e.jsx(n.h2,{id:"i-want-to-change-my-mind",children:e.jsx(n.a,{className:"anchor",href:"#i-want-to-change-my-mind",children:"I want to change my mind"})}),`
`,e.jsx(n.p,{children:"Every choice from onboarding is editable after the fact:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Character, name, avatar, voice"})," — Settings → Character"]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Provider"})," — Settings → Providers"]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Server (local/LAN/remote/cloud)"})," — Restart Milady and re-pick at first launch, or Settings → Server"]}),`
`]}),`
`,e.jsx(n.p,{children:`There's no "wrong" onboarding choice. Pick something, move on, change it when you want.`}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/beginner/your-first-chat",children:"Your first chat"})," — send the first message and understand what's happening behind the scenes."]})]})}function l(r={}){const{wrapper:n}={...s(),...r.components};return n?e.jsx(n,{...r,children:e.jsx(i,{...r})}):i(r)}function a(r,n){throw new Error("Expected component `"+r+"` to be defined: you likely forgot to import, pass, or provide it.")}export{l as default};

import{u as l,j as e}from"./index-BfT5spx2.js";function r(s){const n={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",li:"li",p:"p",strong:"strong",ul:"ul",...l(),...s.components},{Callout:i,Steps:o}=n;return i||a("Callout"),o||a("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"picking-a-provider",children:e.jsx(n.a,{className:"anchor",href:"#picking-a-provider",children:"Picking a provider"})}),`
`,e.jsxs(n.p,{children:["A ",e.jsx(n.strong,{children:"provider"})," is the language model service that powers your agent's responses. Milady doesn't ship its own model — you pick one, and every message you send gets answered by whichever provider you're pointed at."]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," what the three main provider types are, how to pick the right one for day one, and how to change your mind."]}),`
`,e.jsx(n.h2,{id:"the-three-kinds-of-provider",children:e.jsx(n.a,{className:"anchor",href:"#the-three-kinds-of-provider",children:"The three kinds of provider"})}),`
`,e.jsx(n.h3,{id:"1-cloud-api-openai-anthropic-openrouter-etc",children:e.jsx(n.a,{className:"anchor",href:"#1-cloud-api-openai-anthropic-openrouter-etc",children:"1. Cloud API (OpenAI, Anthropic, OpenRouter, etc.)"})}),`
`,e.jsx(n.p,{children:"You sign up for an account with a commercial provider, get an API key, paste it into Milady, and go. The provider runs the model on their hardware and charges you per token (usually fractions of a cent per message, billed to your account there — not to Milady)."}),`
`,e.jsx(n.p,{children:e.jsx(n.strong,{children:"Pros:"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Fastest and most capable models available right now."}),`
`,e.jsx(n.li,{children:"Zero hardware requirements on your end — works on a 5-year-old laptop."}),`
`,e.jsx(n.li,{children:"Your provider handles model updates, scaling, reliability."}),`
`]}),`
`,e.jsx(n.p,{children:e.jsx(n.strong,{children:"Cons:"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Your messages leave your machine for inference. The text of what you send (plus some context) goes to the provider. They have their own privacy policy; read it."}),`
`,e.jsx(n.li,{children:"Costs money per use. Usually small, but it's real."}),`
`,e.jsx(n.li,{children:"Requires an API key from a third party."}),`
`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Who this is for:"})," people who want the smartest available responses and don't mind that inference happens in the cloud. The vast majority of new Milady users pick this on day one."]}),`
`,e.jsx(n.h3,{id:"2-local-ollama--a-downloaded-model",children:e.jsx(n.a,{className:"anchor",href:"#2-local-ollama--a-downloaded-model",children:"2. Local (Ollama + a downloaded model)"})}),`
`,e.jsxs(n.p,{children:["You install ",e.jsx(n.a,{href:"https://ollama.ai",children:"Ollama"}),", download a model file (a few GB), and Milady talks to Ollama running on your machine. Nothing ever leaves your computer."]}),`
`,e.jsx(n.p,{children:e.jsx(n.strong,{children:"Pros:"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Completely private. Messages never leave your hardware."}),`
`,e.jsx(n.li,{children:"Free after the initial model download."}),`
`,e.jsx(n.li,{children:"Works offline."}),`
`]}),`
`,e.jsx(n.p,{children:e.jsx(n.strong,{children:"Cons:"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Slower on most consumer hardware. A gaming rig with a modern GPU is fine; a MacBook Air with integrated graphics will feel noticeably slower than a cloud model."}),`
`,e.jsx(n.li,{children:"The best local models (as of now) are still a step behind the best cloud models."}),`
`,e.jsx(n.li,{children:"You're responsible for picking a model and keeping it updated."}),`
`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Who this is for:"})," privacy-conscious users, people with capable local GPUs, anyone who wants to run offline, and anyone who thinks cloud pricing gets ugly at scale."]}),`
`,e.jsx(n.h3,{id:"3-eliza-cloud",children:e.jsx(n.a,{className:"anchor",href:"#3-eliza-cloud",children:"3. Eliza Cloud"})}),`
`,e.jsx(n.p,{children:"Eliza Cloud is a managed service built specifically for Milady. You sign in, Milady picks routes for you, and you stop thinking about it."}),`
`,e.jsx(n.p,{children:e.jsx(n.strong,{children:"Pros:"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Zero setup. No API keys, no provider accounts, no model selection."}),`
`,e.jsx(n.li,{children:"Handles chat, voice, embeddings, images in one place."}),`
`,e.jsx(n.li,{children:"Works on phones and tablets where local inference isn't practical."}),`
`]}),`
`,e.jsx(n.p,{children:e.jsx(n.strong,{children:"Cons:"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Pricing model is subscription-based rather than pay-per-token."}),`
`,e.jsx(n.li,{children:"Another service you're trusting with your messages (same privacy tradeoff as any cloud API)."}),`
`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Who this is for:"})," people who want turnkey, people on phones, people who tried one of the other options and don't want to deal with provider config."]}),`
`,e.jsx(n.h2,{id:"a-simple-decision-tree",children:e.jsx(n.a,{className:"anchor",href:"#a-simple-decision-tree",children:"A simple decision tree"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Do you have a capable GPU and care a lot about privacy?"})," → Local (Ollama). Install Ollama, pick a model like ",e.jsx(n.code,{children:"llama3.1"})," or ",e.jsx(n.code,{children:"qwen2.5"}),", plug it into Milady."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Do you want the fastest setup with the smartest model, and you're OK paying per token?"})," → Cloud API. Sign up with Anthropic or OpenAI, grab a key, paste it in."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Do you want one account that handles everything with zero config?"})," → Eliza Cloud."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Not sure?"})," → Cloud API with the free credits most providers give new accounts. You can switch later with two clicks."]}),`
`]}),`
`,e.jsx(n.h2,{id:"how-to-switch",children:e.jsx(n.a,{className:"anchor",href:"#how-to-switch",children:"How to switch"})}),`
`,e.jsx(n.p,{children:"Settings → Providers shows your current provider and a list of supported alternatives. Switching is:"}),`
`,e.jsxs(o,{children:[e.jsx("li",{children:"Click the provider you want."}),e.jsx("li",{children:"Paste the new credential (API key for cloud providers, URL for a local server, sign-in for Eliza Cloud)."}),e.jsx("li",{children:"Milady runs a connection test."}),e.jsx("li",{children:"If it passes, new messages start going through the new provider. Your existing conversations aren't affected."})]}),`
`,e.jsx(i,{kind:"tip",children:e.jsxs(n.p,{children:["You don't have to use the same provider for everything. Milady can route chat to one provider, voice synthesis to another, and embeddings to a third. That's covered in ",e.jsx(n.a,{href:"/docs/intermediate/switching-providers",children:"Switching providers mid-flight"}),"."]})}),`
`,e.jsx(n.h2,{id:"costs-realistically",children:e.jsx(n.a,{className:"anchor",href:"#costs-realistically",children:"Costs, realistically"})}),`
`,e.jsx(n.p,{children:"If you're on a cloud provider, you'll want a rough sense of what messages cost. The numbers move around as providers update pricing, but as a ballpark for a typical Milady conversation:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A short chat exchange"})," (your message + the agent's response) usually runs well under a cent on most models."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Voice transcription and synthesis"})," add a small amount on top if you're using a cloud voice provider."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Casual daily use"})," — a handful of conversations a day — typically lands in the single-digit dollars per month range."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Heavy use with a premium model"})," (the biggest Claude or GPT model) can stretch into tens of dollars per month."]}),`
`]}),`
`,e.jsx(n.p,{children:"Every provider shows you a running cost in their dashboard. Check it the first week so you know what your actual usage looks like."}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/beginner/settings-basics",children:"Settings basics"})," — the handful of settings worth knowing about on day one."]})]})}function d(s={}){const{wrapper:n}={...l(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(r,{...s})}):r(s)}function a(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{d as default};

import{n as e,r as t}from"./index-DXnzbmOt.js";var n=t();function r(t){let r={a:`a`,code:`code`,h1:`h1`,h2:`h2`,h3:`h3`,li:`li`,p:`p`,strong:`strong`,ul:`ul`,...e(),...t.components},{Callout:i,Steps:o}=r;return i||a(`Callout`,!0),o||a(`Steps`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`picking-a-provider`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#picking-a-provider`,children:`Picking a provider`})}),`
`,(0,n.jsxs)(r.p,{children:[`A `,(0,n.jsx)(r.strong,{children:`provider`}),` is the language model service that powers your agent's responses. Milady doesn't ship its own model — you pick one, and every message you send gets answered by whichever provider you're pointed at.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` what the three main provider types are, how to pick the right one for day one, and how to change your mind.`]}),`
`,(0,n.jsx)(r.h2,{id:`the-three-kinds-of-provider`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#the-three-kinds-of-provider`,children:`The three kinds of provider`})}),`
`,(0,n.jsx)(r.h3,{id:`1-cloud-api-openai-anthropic-openrouter-etc`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#1-cloud-api-openai-anthropic-openrouter-etc`,children:`1. Cloud API (OpenAI, Anthropic, OpenRouter, etc.)`})}),`
`,(0,n.jsx)(r.p,{children:`You sign up for an account with a commercial provider, get an API key, paste it into Milady, and go. The provider runs the model on their hardware and charges you per token (usually fractions of a cent per message, billed to your account there — not to Milady).`}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Pros:`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Fastest and most capable models available right now.`}),`
`,(0,n.jsx)(r.li,{children:`Zero hardware requirements on your end — works on a 5-year-old laptop.`}),`
`,(0,n.jsx)(r.li,{children:`Your provider handles model updates, scaling, reliability.`}),`
`]}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Cons:`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Your messages leave your machine for inference. The text of what you send (plus some context) goes to the provider. They have their own privacy policy; read it.`}),`
`,(0,n.jsx)(r.li,{children:`Costs money per use. Usually small, but it's real.`}),`
`,(0,n.jsx)(r.li,{children:`Requires an API key from a third party.`}),`
`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Who this is for:`}),` people who want the smartest available responses and don't mind that inference happens in the cloud. The vast majority of new Milady users pick this on day one.`]}),`
`,(0,n.jsx)(r.h3,{id:`2-local-ollama--a-downloaded-model`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#2-local-ollama--a-downloaded-model`,children:`2. Local (Ollama + a downloaded model)`})}),`
`,(0,n.jsxs)(r.p,{children:[`You install `,(0,n.jsx)(r.a,{href:`https://ollama.com`,children:`Ollama`}),`, download a model file (a few GB), and Milady talks to Ollama running on your machine. Nothing ever leaves your computer.`]}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Pros:`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Completely private. Messages never leave your hardware.`}),`
`,(0,n.jsx)(r.li,{children:`Free after the initial model download.`}),`
`,(0,n.jsx)(r.li,{children:`Works offline.`}),`
`]}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Cons:`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Slower on most consumer hardware. A gaming rig with a modern GPU is fine; a MacBook Air with integrated graphics will feel noticeably slower than a cloud model.`}),`
`,(0,n.jsx)(r.li,{children:`The best local models (as of now) are still a step behind the best cloud models.`}),`
`,(0,n.jsx)(r.li,{children:`You're responsible for picking a model and keeping it updated.`}),`
`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Who this is for:`}),` privacy-conscious users, people with capable local GPUs, anyone who wants to run offline, and anyone who thinks cloud pricing gets ugly at scale.`]}),`
`,(0,n.jsx)(r.h3,{id:`3-eliza-cloud`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#3-eliza-cloud`,children:`3. Eliza Cloud`})}),`
`,(0,n.jsx)(r.p,{children:`Eliza Cloud is a managed service built specifically for Milady. You sign in, Milady picks routes for you, and you stop thinking about it.`}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Pros:`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Zero setup. No API keys, no provider accounts, no model selection.`}),`
`,(0,n.jsx)(r.li,{children:`Handles chat, voice, embeddings, images in one place.`}),`
`,(0,n.jsx)(r.li,{children:`Works on phones and tablets where local inference isn't practical.`}),`
`]}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Cons:`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Pricing model is subscription-based rather than pay-per-token.`}),`
`,(0,n.jsx)(r.li,{children:`Another service you're trusting with your messages (same privacy tradeoff as any cloud API).`}),`
`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Who this is for:`}),` people who want turnkey, people on phones, people who tried one of the other options and don't want to deal with provider config.`]}),`
`,(0,n.jsx)(r.h2,{id:`a-simple-decision-tree`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#a-simple-decision-tree`,children:`A simple decision tree`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Do you have a capable GPU and care a lot about privacy?`}),` → Local (Ollama). Install Ollama, pick a model like `,(0,n.jsx)(r.code,{children:`llama3.3`}),` or `,(0,n.jsx)(r.code,{children:`gemma3:4b`}),`, plug it into Milady.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Do you want the fastest setup with the smartest model, and you're OK paying per token?`}),` → Cloud API. Sign up with Anthropic or OpenAI, grab a key, paste it in.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Do you want one account that handles everything with zero config?`}),` → Eliza Cloud.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Not sure?`}),` → Cloud API with the free credits most providers give new accounts. You can switch later with two clicks.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`how-to-switch`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#how-to-switch`,children:`How to switch`})}),`
`,(0,n.jsx)(r.p,{children:`Settings → Providers shows your current provider and a list of supported alternatives. Switching is:`}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsx)(`li`,{children:`Click the provider you want.`}),(0,n.jsx)(`li`,{children:`Paste the new credential (API key for cloud providers, URL for a local server, sign-in for Eliza Cloud).`}),(0,n.jsx)(`li`,{children:`Milady runs a connection test.`}),(0,n.jsx)(`li`,{children:`If it passes, new messages start going through the new provider. Your existing conversations aren't affected.`})]}),`
`,(0,n.jsx)(i,{kind:`tip`,children:(0,n.jsxs)(r.p,{children:[`You don't have to use the same provider for everything. Milady can route chat to one provider, voice synthesis to another, and embeddings to a third. That's covered in `,(0,n.jsx)(r.a,{href:`/docs/intermediate/switching-providers`,children:`Switching providers mid-flight`}),`.`]})}),`
`,(0,n.jsx)(r.h2,{id:`costs-realistically`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#costs-realistically`,children:`Costs, realistically`})}),`
`,(0,n.jsx)(r.p,{children:`If you're on a cloud provider, you'll want a rough sense of what messages cost. The numbers move around as providers update pricing, but as a ballpark for a typical Milady conversation:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A short chat exchange`}),` (your message + the agent's response) usually runs well under a cent on most models.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Voice transcription and synthesis`}),` add a small amount on top if you're using a cloud voice provider.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Casual daily use`}),` — a handful of conversations a day — typically lands in the single-digit dollars per month range.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Heavy use with a premium model`}),` (the biggest Claude or GPT model) can stretch into tens of dollars per month.`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Every provider shows you a running cost in their dashboard. Check it the first week so you know what your actual usage looks like.`}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.a,{href:`/docs/beginner/settings-basics`,children:`Settings basics`}),` — the handful of settings worth knowing about on day one.`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
import{u as o,j as e}from"./index-BfT5spx2.js";function t(s){const n={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",li:"li",p:"p",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...o(),...s.components},{Callout:r}=n;return r||i("Callout"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"privacy-data-and-what-stays-local",children:e.jsx(n.a,{className:"anchor",href:"#privacy-data-and-what-stays-local",children:"Privacy, data, and what stays local"})}),`
`,e.jsx(n.p,{children:`Milady is local-first by design, but "local-first" isn't "nothing ever leaves your machine." If you use a cloud language model, your messages get sent to it. If you connect to Discord, your messages travel through Discord's servers. This page tells you exactly what happens to your data and how to tune what leaves your machine.`}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," where each piece of your data lives, what gets sent where during normal use, and how to minimize what leaves your machine if you care about that."]}),`
`,e.jsx(n.h2,{id:"what-lives-on-your-machine",children:e.jsx(n.a,{className:"anchor",href:"#what-lives-on-your-machine",children:"What lives on your machine"})}),`
`,e.jsxs(n.p,{children:["Everything below lives in ",e.jsx(n.code,{children:"~/.milady/"})," (macOS/Linux) or ",e.jsx(n.code,{children:"%USERPROFILE%\\.milady\\"})," (Windows):"]}),`
`,e.jsxs(n.table,{children:[e.jsx(n.thead,{children:e.jsxs(n.tr,{children:[e.jsx(n.th,{children:"What"}),e.jsx(n.th,{children:"Where"}),e.jsx(n.th,{children:"Notes"})]})}),e.jsxs(n.tbody,{children:[e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Configuration"})}),e.jsx(n.td,{children:e.jsx(n.code,{children:"milady.json"})}),e.jsx(n.td,{children:"Every setting from the UI. Including API keys (encrypted at rest)."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Conversations"})}),e.jsx(n.td,{children:"Local database"}),e.jsx(n.td,{children:"Every message you've ever sent and every response received."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Characters"})}),e.jsx(n.td,{children:e.jsx(n.code,{children:"characters/"})}),e.jsx(n.td,{children:"Your character definitions — name, personality, voice preferences."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Uploaded documents (knowledge)"})}),e.jsx(n.td,{children:"Local database"}),e.jsx(n.td,{children:"The original files plus their vector embeddings."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Avatars (VRM files)"})}),e.jsxs(n.td,{children:[e.jsx(n.code,{children:"avatars/"})," or referenced from wherever you uploaded them."]}),e.jsx(n.td,{})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Logs"})}),e.jsx(n.td,{children:e.jsx(n.code,{children:"logs/"})}),e.jsx(n.td,{children:"Diagnostic logs. Rotated automatically."})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:e.jsx(n.strong,{children:"Cached data"})}),e.jsx(n.td,{children:e.jsx(n.code,{children:"cache/"})}),e.jsx(n.td,{children:"Model response cache, asset cache. Cleared on demand."})]})]})]}),`
`,e.jsxs(n.p,{children:["This directory is ",e.jsx(n.strong,{children:"your data"}),". Back it up if you care. Migrate it to a new machine by copying it. Never delete it in anger."]}),`
`,e.jsx(r,{kind:"tip",children:e.jsxs(n.p,{children:["If you want to know what's in your Milady install without opening the app, open ",e.jsx("code",{children:"~/.milady/"})," in a file browser. The directory structure is human-readable. The only thing you can't inspect directly is the SQLite conversation database (use a SQLite browser if you really want to)."]})}),`
`,e.jsx(n.h2,{id:"what-leaves-your-machine-during-normal-use",children:e.jsx(n.a,{className:"anchor",href:"#what-leaves-your-machine-during-normal-use",children:"What leaves your machine during normal use"})}),`
`,e.jsx(n.p,{children:`Here's the honest accounting. "Leaves your machine" means "gets sent over the network to another party."`}),`
`,e.jsx(n.h3,{id:"1-language-model-inference-chat-provider",children:e.jsx(n.a,{className:"anchor",href:"#1-language-model-inference-chat-provider",children:"1. Language model inference (chat provider)"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Every message you send is sent to your chat provider."})," Plus context: the character's personality, recent conversation history, relevant knowledge chunks if any."]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:["If your provider is ",e.jsx(n.strong,{children:"local (Ollama)"}),": this stays on your machine. Nothing leaves."]}),`
`,e.jsxs(n.li,{children:["If your provider is ",e.jsx(n.strong,{children:"cloud (OpenAI, Anthropic, OpenRouter, Eliza Cloud, etc.)"}),": the request goes to their servers. They see the full context of your conversation during inference. Most providers retain logs for some period — read their privacy policy."]}),`
`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you can do about it:"})," use a local provider. Ollama + llama3.1 is a fully local setup where chat never leaves your machine. Tradeoff: slower and less capable than cloud models."]}),`
`,e.jsx(n.h3,{id:"2-voice-synthesis-tts",children:e.jsx(n.a,{className:"anchor",href:"#2-voice-synthesis-tts",children:"2. Voice synthesis (TTS)"})}),`
`,e.jsx(n.p,{children:"Every response your agent speaks aloud gets sent to your TTS provider to synthesize."}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Local TTS"}),": none of the big players offer a great local option yet. Edge TTS goes over the network, but to Microsoft's edge servers, which is faster than most US cloud."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Cloud TTS"}),": ElevenLabs, OpenAI, Google, etc. They see the text your agent is speaking. Most retain logs."]}),`
`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you can do about it:"})," turn voice off entirely if you don't need it. Text-only chat doesn't touch a TTS provider."]}),`
`,e.jsx(n.h3,{id:"3-speech-recognition-stt",children:e.jsx(n.a,{className:"anchor",href:"#3-speech-recognition-stt",children:"3. Speech recognition (STT)"})}),`
`,e.jsx(n.p,{children:"If you use talk mode, your microphone audio gets sent to an STT provider for transcription."}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Some providers support on-device models (Whisper.cpp for example). If your STT is local, this stays on your machine."}),`
`,e.jsx(n.li,{children:"Cloud providers see your voice audio."}),`
`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you can do about it:"})," use a local STT like Whisper, or don't use talk mode."]}),`
`,e.jsx(n.h3,{id:"4-embeddings-for-knowledgememory-search",children:e.jsx(n.a,{className:"anchor",href:"#4-embeddings-for-knowledgememory-search",children:"4. Embeddings for knowledge/memory search"})}),`
`,e.jsx(n.p,{children:"When you upload a document or search your memory, Milady computes vector embeddings for the text. If your embeddings provider is cloud-based, the text gets sent there briefly during the embedding computation."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you can do about it:"})," use a local embeddings model (Ollama has ",e.jsx(n.code,{children:"nomic-embed-text"})," and others that work well)."]}),`
`,e.jsx(n.h3,{id:"5-connector-traffic",children:e.jsx(n.a,{className:"anchor",href:"#5-connector-traffic",children:"5. Connector traffic"})}),`
`,e.jsx(n.p,{children:"If you've enabled Discord, Telegram, iMessage, etc., every message your agent receives or sends goes through that platform's servers. Discord sees all the Discord messages. Telegram sees all the Telegram messages. That's inherent to the platform — nothing Milady can do about it."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you can do about it:"})," don't connect to platforms you don't want sending messages through."]}),`
`,e.jsx(n.h3,{id:"6-telemetry-off-by-default",children:e.jsx(n.a,{className:"anchor",href:"#6-telemetry-off-by-default",children:"6. Telemetry (off by default)"})}),`
`,e.jsxs(n.p,{children:["Milady has opt-in telemetry that reports anonymized diagnostic data: crash reports, feature usage counts, performance metrics. ",e.jsx(n.strong,{children:"It is off by default on desktop."})," You can enable it in Settings → Privacy → Telemetry if you want to help improve Milady."]}),`
`,e.jsx(n.p,{children:`Telemetry never includes conversation contents, API keys, character details, or anything personally identifiable. It's the kind of thing that tells the team "40% of users enable Discord" not "user X sent message Y."`}),`
`,e.jsx(n.h3,{id:"7-plugin-behavior",children:e.jsx(n.a,{className:"anchor",href:"#7-plugin-behavior",children:"7. Plugin behavior"})}),`
`,e.jsx(n.p,{children:"Every plugin you install can make its own network requests. A web search plugin sends your queries to a search provider. A weather plugin talks to a weather API. A calendar plugin talks to your calendar provider. Plugins are listed in Settings → Plugins; each one documents what it sends where."}),`
`,e.jsx(n.h2,{id:"what-does-not-leave-your-machine",children:e.jsx(n.a,{className:"anchor",href:"#what-does-not-leave-your-machine",children:"What does NOT leave your machine"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Your character files and personality prompts (except when they're sent as context to your chat provider during inference — but the files themselves stay local)."}),`
`,e.jsx(n.li,{children:"Your conversation history — it's stored locally. The provider sees individual messages during inference but never has a persistent copy of your full history."}),`
`,e.jsxs(n.li,{children:["Your ",e.jsx(n.code,{children:"milady.json"})," config — never transmitted anywhere."]}),`
`,e.jsx(n.li,{children:"Your local database."}),`
`,e.jsxs(n.li,{children:["Your ",e.jsx(n.code,{children:"~/.milady/"})," directory as a whole."]}),`
`,e.jsx(n.li,{children:"Your wallet private keys (if you use the wallet features) — stored encrypted at rest, used for signing locally, only the signed transactions go out on-chain."}),`
`]}),`
`,e.jsx(n.h2,{id:"the-fully-local-setup",children:e.jsx(n.a,{className:"anchor",href:"#the-fully-local-setup",children:'The "fully local" setup'})}),`
`,e.jsx(n.p,{children:"If you want to minimize what leaves your machine, here's the stack:"}),`
`,e.jsxs(n.table,{children:[e.jsx(n.thead,{children:e.jsxs(n.tr,{children:[e.jsx(n.th,{children:"Slot"}),e.jsx(n.th,{children:"Choice"})]})}),e.jsxs(n.tbody,{children:[e.jsxs(n.tr,{children:[e.jsx(n.td,{children:"Chat provider"}),e.jsx(n.td,{children:"Ollama + a local model (llama3.1, qwen2.5, etc.)"})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:"TTS"}),e.jsx(n.td,{children:"Edge TTS (goes to MS servers but no auth / no account needed), or skip voice"})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:"STT"}),e.jsx(n.td,{children:"Local Whisper (via Ollama or a Whisper plugin), or skip talk mode"})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:"Embeddings"}),e.jsx(n.td,{children:"Ollama nomic-embed-text"})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:"Connectors"}),e.jsx(n.td,{children:"None, or only ones you explicitly want"})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:"Telemetry"}),e.jsx(n.td,{children:"Off (default)"})]}),e.jsxs(n.tr,{children:[e.jsx(n.td,{children:"Plugins"}),e.jsx(n.td,{children:"Only ones whose network behavior you're OK with"})]})]})]}),`
`,e.jsx(n.p,{children:"With this setup, running a normal text-only chat conversation stays entirely on your machine. The only thing that touches the network is your model downloads when you first pull them from Ollama."}),`
`,e.jsx(n.h2,{id:"developer-debug-features",children:e.jsx(n.a,{className:"anchor",href:"#developer-debug-features",children:"Developer debug features"})}),`
`,e.jsx(n.p,{children:"There are a few env vars that control developer diagnostic features. You should not turn any of these on unless you're actively debugging something:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:e.jsx(n.code,{children:"MILADY_CAPTURE_PROMPTS=1"})})," — dumps every raw prompt (including user messages) to disk under ",e.jsx(n.code,{children:".tmp/prompt-captures/"}),". ",e.jsx(n.strong,{children:"Never enable this in production use."})," The capture files contain your conversations in plain text."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:e.jsx(n.code,{children:"MILADY_TTS_DEBUG=1"})})," — verbose TTS pipeline tracing. Safe to run, but noisy."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:e.jsx(n.code,{children:"MILADY_PROMPT_TRACE=1"})})," — logs prompt compaction stats to the console. Safe."]}),`
`]}),`
`,e.jsxs(n.p,{children:["If you accidentally turned one of these on, delete the ",e.jsx(n.code,{children:".tmp/"})," directory in your Milady install and unset the env var."]}),`
`,e.jsx(n.h2,{id:"how-do-i-see-whats-happening-in-real-time",children:e.jsx(n.a,{className:"anchor",href:"#how-do-i-see-whats-happening-in-real-time",children:`"How do I see what's happening in real time?"`})}),`
`,e.jsx(n.p,{children:"Settings → Advanced → Observability shows you:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Live logs from the runtime."}),`
`,e.jsx(n.li,{children:"A request log for every call Milady is making to external services (which provider, which endpoint, how long it took)."}),`
`,e.jsx(n.li,{children:"Token usage counters for your language model provider."}),`
`]}),`
`,e.jsx(n.p,{children:"This is the honest window into what Milady is doing behind the scenes. If you're worried about an unexpected network call, this is where you confirm what's actually happening."}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/advanced/power-user-shortcuts",children:"Power user shortcuts"})," — keybindings, a few CLI commands, and the handful of dev endpoints worth knowing."]})]})}function l(s={}){const{wrapper:n}={...o(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(t,{...s})}):t(s)}function i(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{l as default};

import{u as r,j as e}from"./index-BfT5spx2.js";function a(s){const n={a:"a",blockquote:"blockquote",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",li:"li",ol:"ol",p:"p",strong:"strong",ul:"ul",...r(),...s.components},{Callout:t}=n;return t||i("Callout"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"make-it-yours",children:e.jsx(n.a,{className:"anchor",href:"#make-it-yours",children:"Make it yours"})}),`
`,e.jsx(n.p,{children:"Milady ships with a handful of built-in characters — different names, voices, and avatars. Out of the box they're fine, but most people want to tweak at least one thing. This page is about what you can change and how far you can push it without breaking anything."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"}),' how to change name, personality, voice, and avatar; how to write a personality that actually produces the tone you want; and what the "system prompt" field does.']}),`
`,e.jsx(n.h2,{id:"the-four-knobs",children:e.jsx(n.a,{className:"anchor",href:"#the-four-knobs",children:"The four knobs"})}),`
`,e.jsxs(n.p,{children:["Open ",e.jsx(n.strong,{children:"Settings → Character"}),". You'll see:"]}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Name"})," — what the agent calls itself."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Personality"})," — a short description of how it should behave."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Voice"})," — TTS provider + voice selection."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Avatar"})," — which VRM character file gets rendered in the companion window."]}),`
`]}),`
`,e.jsx(n.p,{children:"Changes take effect immediately. You don't need to restart."}),`
`,e.jsx(n.h2,{id:"name",children:e.jsx(n.a,{className:"anchor",href:"#name",children:"Name"})}),`
`,e.jsxs(n.p,{children:["Self-explanatory. Whatever you type here is what the agent will introduce itself as, what it'll refer to itself as in responses (",e.jsx(n.code,{children:"I'm <name>…"}),"), and what shows up in its header in the chat UI."]}),`
`,e.jsxs(n.p,{children:["Pro tip: don't use your own name. It gets confusing fast when you ask it something and it says ",e.jsx(n.code,{children:"Sure, <your name>, I can help with…"})]}),`
`,e.jsx(n.h2,{id:"personality",children:e.jsx(n.a,{className:"anchor",href:"#personality",children:"Personality"})}),`
`,e.jsx(n.p,{children:"This is the most powerful knob. Whatever you write here becomes part of the prompt that gets sent to the language model on every message."}),`
`,e.jsx(n.h3,{id:"a-rough-recipe",children:e.jsx(n.a,{className:"anchor",href:"#a-rough-recipe",children:"A rough recipe"})}),`
`,e.jsx(n.p,{children:"A good personality field has three things:"}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A voice"})," — formal, casual, terse, verbose, snarky, earnest, whatever you want."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Domain hints"}),' — what the agent is supposed to be good at. "Helpful for coding questions" or "Focused on writing and editing" or "An expert on video games."']}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Explicit don'ts"}),` — things you don't want it doing. "Never use emoji" or "Don't start responses with 'As an AI…'" or "Avoid corporate-speak."`]}),`
`]}),`
`,e.jsx(n.p,{children:"Keep it to a few sentences. Longer is not better — the model is already good at following short, clear style guides, and long prompts can sometimes drown out the specific thing you asked."}),`
`,e.jsx(n.h3,{id:"example-terse-coding-assistant",children:e.jsx(n.a,{className:"anchor",href:"#example-terse-coding-assistant",children:"Example: terse coding assistant"})}),`
`,e.jsxs(n.blockquote,{children:[`
`,e.jsx(n.p,{children:'You are a terse, direct coding assistant. Give me the shortest correct answer. Skip apologies and prefaces. If I ask a yes/no question, answer yes or no first and then explain. Never use emoji. Never say "Certainly!" or "Of course!"'}),`
`]}),`
`,e.jsx(n.h3,{id:"example-friendly-writing-partner",children:e.jsx(n.a,{className:"anchor",href:"#example-friendly-writing-partner",children:"Example: friendly writing partner"})}),`
`,e.jsxs(n.blockquote,{children:[`
`,e.jsx(n.p,{children:"You are a warm, conversational writing partner. You help me draft and edit short-form writing — essays, emails, tweets. You read what I send carefully and respond with specific, actionable feedback rather than generic praise. You never suggest changes without explaining why."}),`
`]}),`
`,e.jsx(n.h3,{id:"example-lore-heavy-character",children:e.jsx(n.a,{className:"anchor",href:"#example-lore-heavy-character",children:"Example: lore-heavy character"})}),`
`,e.jsxs(n.blockquote,{children:[`
`,e.jsx(n.p,{children:"You are Iris, a retired astronomer who now tends a small lighthouse on a fictional island. You speak in complete sentences with a slight Victorian cadence. You often compare things to the night sky. You are patient, curious, and quietly funny. You are not a chatbot and you never refer to yourself as one."}),`
`]}),`
`,e.jsx(n.h3,{id:"what-personality-is-not",children:e.jsx(n.a,{className:"anchor",href:"#what-personality-is-not",children:"What personality is not"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Not a safety filter."}),' If your personality says "never talk about topic X," the model will usually comply, but this is a style preference, not a guarantee. For real content filtering, use provider-level settings.']}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Not memory."})," The personality is static. If you tell your agent a fact during a conversation, don't expect it to end up in the personality automatically. For persistent facts, use ",e.jsx(n.a,{href:"/docs/intermediate/memory-and-knowledge",children:"Memory and knowledge"}),"."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Not a skill system."}),' "You are an expert in Python" does not actually give the agent Python expertise — it gives it an expert ',e.jsx(n.em,{children:"voice"}),". The underlying language model is doing the real work."]}),`
`]}),`
`,e.jsx(n.h2,{id:"voice",children:e.jsx(n.a,{className:"anchor",href:"#voice",children:"Voice"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Settings → Character → Voice"})," (or Settings → Voice, same section)."]}),`
`,e.jsx(n.p,{children:"Two things to pick:"}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"TTS provider"}),` — ElevenLabs, OpenAI, Azure, Google, Cartesia, Edge TTS, and others. Some need their own API key (you'll see a "needs key" label next to them). Edge TTS is free and decent. ElevenLabs is expensive and excellent.`]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Voice"})," — each provider has its own catalog. You'll see a list with a preview button. Click preview to hear a short sample of each one."]}),`
`]}),`
`,e.jsx(t,{kind:"tip",children:e.jsx(n.p,{children:"You can use a different provider for voice than for chat. Your chat can go to Claude or GPT while your voice goes to ElevenLabs. In fact this is usually the right move — chat quality and voice quality are different problems, and the best vendor for each is rarely the same."})}),`
`,e.jsx(n.h3,{id:"voice-modes-on-elevenlabs",children:e.jsx(n.a,{className:"anchor",href:"#voice-modes-on-elevenlabs",children:"Voice modes on ElevenLabs"})}),`
`,e.jsx(n.p,{children:"ElevenLabs specifically has two modes: a fast, lower-latency path (the default for real-time chat) and a higher-quality path (slower, better for longer form). The fast mode is what Milady uses by default. If you want the higher-quality mode for reading longer responses aloud, there's a toggle in the voice settings."}),`
`,e.jsx(n.h2,{id:"avatar",children:e.jsx(n.a,{className:"anchor",href:"#avatar",children:"Avatar"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Settings → Character → Avatar"}),"."]}),`
`,e.jsxs(n.p,{children:["The avatar is a VRM 3D model file. Milady ships with several built-in characters, and you can also load your own ",e.jsx(n.code,{children:".vrm"})," file from disk."]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Picking a built-in"})," — scroll the gallery, click the one you want. The VRM loads and renders in the companion window."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Loading a custom VRM"}),' — click "Upload custom" and pick a ',e.jsx(n.code,{children:".vrm"})," file. It gets copied into your ",e.jsx(n.code,{children:"~/.milady/"})," directory and persists across launches."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"No avatar"}),` — if you don't want the 3D character, there's a "None" option. The companion window collapses to show just the chat.`]}),`
`]}),`
`,e.jsx(n.h3,{id:"where-to-find-vrm-files",children:e.jsx(n.a,{className:"anchor",href:"#where-to-find-vrm-files",children:"Where to find VRM files"})}),`
`,e.jsxs(n.p,{children:["The ",e.jsx(n.a,{href:"https://hub.vroid.com/",children:"VRoid Hub"})," has a huge library of free and paid VRM characters. ",e.jsx(n.a,{href:"https://booth.pm/",children:"Booth"})," has more. You can also make your own in ",e.jsx(n.a,{href:"https://vroid.com/en/studio",children:"VRoid Studio"})," — it's free and surprisingly capable for making custom characters."]}),`
`,e.jsx(t,{kind:"note",children:e.jsx(n.p,{children:"VRM is a standard file format for humanoid 3D characters. Milady supports both VRM 0.x and VRM 1.0 files. If you pick a VRM that has weird lighting or missing expressions in Milady but looks fine in another VRM viewer, it might be using a feature Milady doesn't render yet — file an issue."})}),`
`,e.jsx(n.h2,{id:"nothing-is-permanent",children:e.jsx(n.a,{className:"anchor",href:"#nothing-is-permanent",children:"Nothing is permanent"})}),`
`,e.jsx(n.p,{children:"Everything on this page is reversible. If you write a personality that makes your agent annoying, delete it and start over. If you load a VRM that doesn't work right, pick a different one. If you pick a voice you hate on the third message, switch. None of this is destructive."}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/intermediate/memory-and-knowledge",children:"Memory and knowledge"})," — how to make your agent remember things across conversations and how to teach it from your own documents."]})]})}function h(s={}){const{wrapper:n}={...r(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(a,{...s})}):a(s)}function i(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{h as default};

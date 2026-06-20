import{n as e,r as t}from"./index-DZypq9Su.js";var n=t();function r(t){let r={a:`a`,blockquote:`blockquote`,code:`code`,em:`em`,h1:`h1`,h2:`h2`,h3:`h3`,li:`li`,ol:`ol`,p:`p`,strong:`strong`,ul:`ul`,...e(),...t.components},{Callout:i}=r;return i||a(`Callout`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`make-it-yours`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#make-it-yours`,children:`Make it yours`})}),`
`,(0,n.jsx)(r.p,{children:`Milady ships with a handful of built-in characters — different names, voices, and avatars. Out of the box they're fine, but most people want to tweak at least one thing. This page is about what you can change and how far you can push it without breaking anything.`}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` how to change name, personality, voice, and avatar; how to write a personality that actually produces the tone you want; and what the "system prompt" field does.`]}),`
`,(0,n.jsx)(r.h2,{id:`the-four-knobs`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#the-four-knobs`,children:`The four knobs`})}),`
`,(0,n.jsxs)(r.p,{children:[`Open `,(0,n.jsx)(r.strong,{children:`Settings → Character`}),`. You'll see:`]}),`
`,(0,n.jsxs)(r.ol,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Name`}),` — what the agent calls itself.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Personality`}),` — a short description of how it should behave.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Voice`}),` — TTS provider + voice selection.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Avatar`}),` — which VRM character file gets rendered in the companion window.`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Changes take effect immediately. You don't need to restart.`}),`
`,(0,n.jsx)(r.h2,{id:`name`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#name`,children:`Name`})}),`
`,(0,n.jsxs)(r.p,{children:[`Self-explanatory. Whatever you type here is what the agent will introduce itself as, what it'll refer to itself as in responses (`,(0,n.jsx)(r.code,{children:`I'm <name>…`}),`), and what shows up in its header in the chat UI.`]}),`
`,(0,n.jsxs)(r.p,{children:[`Pro tip: don't use your own name. It gets confusing fast when you ask it something and it says `,(0,n.jsx)(r.code,{children:`Sure, <your name>, I can help with…`})]}),`
`,(0,n.jsx)(r.h2,{id:`personality`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#personality`,children:`Personality`})}),`
`,(0,n.jsx)(r.p,{children:`This is the most powerful knob. Whatever you write here becomes part of the prompt that gets sent to the language model on every message.`}),`
`,(0,n.jsx)(r.h3,{id:`a-rough-recipe`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#a-rough-recipe`,children:`A rough recipe`})}),`
`,(0,n.jsx)(r.p,{children:`A good personality field has three things:`}),`
`,(0,n.jsxs)(r.ol,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A voice`}),` — formal, casual, terse, verbose, snarky, earnest, whatever you want.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Domain hints`}),` — what the agent is supposed to be good at. "Helpful for coding questions" or "Focused on writing and editing" or "An expert on video games."`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Explicit don'ts`}),` — things you don't want it doing. "Never use emoji" or "Don't start responses with 'As an AI…'" or "Avoid corporate-speak."`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Keep it to a few sentences. Longer is not better — the model is already good at following short, clear style guides, and long prompts can sometimes drown out the specific thing you asked.`}),`
`,(0,n.jsx)(r.h3,{id:`example-terse-coding-assistant`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#example-terse-coding-assistant`,children:`Example: terse coding assistant`})}),`
`,(0,n.jsxs)(r.blockquote,{children:[`
`,(0,n.jsx)(r.p,{children:`You are a terse, direct coding assistant. Give me the shortest correct answer. Skip apologies and prefaces. If I ask a yes/no question, answer yes or no first and then explain. Never use emoji. Never say "Certainly!" or "Of course!"`}),`
`]}),`
`,(0,n.jsx)(r.h3,{id:`example-friendly-writing-partner`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#example-friendly-writing-partner`,children:`Example: friendly writing partner`})}),`
`,(0,n.jsxs)(r.blockquote,{children:[`
`,(0,n.jsx)(r.p,{children:`You are a warm, conversational writing partner. You help me draft and edit short-form writing — essays, emails, tweets. You read what I send carefully and respond with specific, actionable feedback rather than generic praise. You never suggest changes without explaining why.`}),`
`]}),`
`,(0,n.jsx)(r.h3,{id:`example-lore-heavy-character`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#example-lore-heavy-character`,children:`Example: lore-heavy character`})}),`
`,(0,n.jsxs)(r.blockquote,{children:[`
`,(0,n.jsx)(r.p,{children:`You are Iris, a retired astronomer who now tends a small lighthouse on a fictional island. You speak in complete sentences with a slight Victorian cadence. You often compare things to the night sky. You are patient, curious, and quietly funny. You are not a chatbot and you never refer to yourself as one.`}),`
`]}),`
`,(0,n.jsx)(r.h3,{id:`what-personality-is-not`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-personality-is-not`,children:`What personality is not`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Not a safety filter.`}),` If your personality says "never talk about topic X," the model will usually comply, but this is a style preference, not a guarantee. For real content filtering, use provider-level settings.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Not memory.`}),` The personality is static. If you tell your agent a fact during a conversation, don't expect it to end up in the personality automatically. For persistent facts, use `,(0,n.jsx)(r.a,{href:`/docs/intermediate/memory-and-knowledge`,children:`Memory and knowledge`}),`.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Not a skill system.`}),` "You are an expert in Python" does not actually give the agent Python expertise — it gives it an expert `,(0,n.jsx)(r.em,{children:`voice`}),`. The underlying language model is doing the real work.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`voice`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#voice`,children:`Voice`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Settings → Character → Voice`}),` (or Settings → Voice, same section).`]}),`
`,(0,n.jsx)(r.p,{children:`Two things to pick:`}),`
`,(0,n.jsxs)(r.ol,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`TTS provider`}),` — ElevenLabs, OpenAI, Azure, Google, Cartesia, Edge TTS, and others. Some need their own API key (you'll see a "needs key" label next to them). Edge TTS is free and decent. ElevenLabs is expensive and excellent.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Voice`}),` — each provider has its own catalog. You'll see a list with a preview button. Click preview to hear a short sample of each one.`]}),`
`]}),`
`,(0,n.jsx)(i,{kind:`tip`,children:(0,n.jsx)(r.p,{children:`You can use a different provider for voice than for chat. Your chat can go to Claude or GPT while your voice goes to ElevenLabs. In fact this is usually the right move — chat quality and voice quality are different problems, and the best vendor for each is rarely the same.`})}),`
`,(0,n.jsx)(r.h3,{id:`voice-modes-on-elevenlabs`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#voice-modes-on-elevenlabs`,children:`Voice modes on ElevenLabs`})}),`
`,(0,n.jsx)(r.p,{children:`ElevenLabs specifically has two modes: a fast, lower-latency path (the default for real-time chat) and a higher-quality path (slower, better for longer form). The fast mode is what Milady uses by default. If you want the higher-quality mode for reading longer responses aloud, there's a toggle in the voice settings.`}),`
`,(0,n.jsx)(r.h2,{id:`avatar`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#avatar`,children:`Avatar`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Settings → Character → Avatar`}),`.`]}),`
`,(0,n.jsxs)(r.p,{children:[`The avatar is a VRM 3D model file. Milady ships with several built-in characters, and you can also load your own `,(0,n.jsx)(r.code,{children:`.vrm`}),` file from disk.`]}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Picking a built-in`}),` — scroll the gallery, click the one you want. The VRM loads and renders in the companion window.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Loading a custom VRM`}),` — click "Upload custom" and pick a `,(0,n.jsx)(r.code,{children:`.vrm`}),` file. It gets copied into your `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/`}),` directory and persists across launches.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`No avatar`}),` — if you don't want the 3D character, there's a "None" option. The companion window collapses to show just the chat.`]}),`
`]}),`
`,(0,n.jsx)(r.h3,{id:`where-to-find-vrm-files`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#where-to-find-vrm-files`,children:`Where to find VRM files`})}),`
`,(0,n.jsxs)(r.p,{children:[`The `,(0,n.jsx)(r.a,{href:`https://hub.vroid.com/`,children:`VRoid Hub`}),` has a huge library of free and paid VRM characters. `,(0,n.jsx)(r.a,{href:`https://booth.pm/`,children:`Booth`}),` has more. You can also make your own in `,(0,n.jsx)(r.a,{href:`https://vroid.com/en/studio`,children:`VRoid Studio`}),` — it's free and surprisingly capable for making custom characters.`]}),`
`,(0,n.jsx)(i,{kind:`note`,children:(0,n.jsx)(r.p,{children:`VRM is a standard file format for humanoid 3D characters. Milady supports both VRM 0.x and VRM 1.0 files. If you pick a VRM that has weird lighting or missing expressions in Milady but looks fine in another VRM viewer, it might be using a feature Milady doesn't render yet — file an issue.`})}),`
`,(0,n.jsx)(r.h2,{id:`nothing-is-permanent`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#nothing-is-permanent`,children:`Nothing is permanent`})}),`
`,(0,n.jsx)(r.p,{children:`Everything on this page is reversible. If you write a personality that makes your agent annoying, delete it and start over. If you load a VRM that doesn't work right, pick a different one. If you pick a voice you hate on the third message, switch. None of this is destructive.`}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.a,{href:`/docs/intermediate/memory-and-knowledge`,children:`Memory and knowledge`}),` — how to make your agent remember things across conversations and how to teach it from your own documents.`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
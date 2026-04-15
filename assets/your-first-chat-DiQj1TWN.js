import{u as i,j as e}from"./index-BfT5spx2.js";function s(o){const n={a:"a",blockquote:"blockquote",code:"code",em:"em",h1:"h1",h2:"h2",li:"li",ol:"ol",p:"p",strong:"strong",ul:"ul",...i(),...o.components},{Callout:t}=n;return t||r("Callout"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"your-first-chat",children:e.jsx(n.a,{className:"anchor",href:"#your-first-chat",children:"Your first chat"})}),`
`,e.jsx(n.p,{children:"You've finished onboarding and you're staring at the chat view. Time to send something."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," how to send a message, what happens when you do, how voice works, and where your conversation actually lives."]}),`
`,e.jsx(n.h2,{id:"say-hi",children:e.jsx(n.a,{className:"anchor",href:"#say-hi",children:"Say hi"})}),`
`,e.jsx(n.p,{children:"Click the chat input at the bottom of the window and type something. A good first message is anything you'd say to a new assistant:"}),`
`,e.jsxs(n.blockquote,{children:[`
`,e.jsx(n.p,{children:'"Hey — what can you do?"'}),`
`,e.jsx(n.p,{children:'"Tell me about yourself."'}),`
`,e.jsxs(n.p,{children:[`"What's the weather like?" `,e.jsx(n.em,{children:"(spoiler: it probably doesn't know the weather yet)"})]}),`
`]}),`
`,e.jsx(n.p,{children:"Hit Enter. A few things happen in the next couple of seconds:"}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsx(n.li,{children:"Your message gets stored locally in the conversation."}),`
`,e.jsx(n.li,{children:"The character's avatar reacts — a subtle animation, maybe a head turn."}),`
`,e.jsx(n.li,{children:"Milady sends your message plus some context (who your agent is, recent conversation history) to whichever language model provider you picked."}),`
`,e.jsx(n.li,{children:"The response streams back. You'll see text appearing word by word."}),`
`,e.jsx(n.li,{children:"If voice is enabled, the character speaks the response out loud while the text renders."}),`
`,e.jsx(n.li,{children:"The whole exchange gets saved to your local database."}),`
`]}),`
`,e.jsx(n.p,{children:"That's the round trip. Do it a few times to get a feel for how your agent responds."}),`
`,e.jsx(n.h2,{id:"turn-voice-on-or-off",children:e.jsx(n.a,{className:"anchor",href:"#turn-voice-on-or-off",children:"Turn voice on (or off)"})}),`
`,e.jsx(n.p,{children:"By default, voice is on — Milady speaks responses aloud using the voice you picked during onboarding. If you'd rather read in silence, there's a speaker icon near the chat that toggles it."}),`
`,e.jsx(t,{kind:"tip",children:e.jsx(n.p,{children:"Headphones are strongly recommended the first time you hear it. The default voices are good, and hearing an AI talk back through laptop speakers in a quiet room is a weirder experience than you might expect."})}),`
`,e.jsx(n.p,{children:"If voice is on but you don't hear anything, check:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Your system audio output is pointed at the right device."}),`
`,e.jsx(n.li,{children:"The voice toggle is actually on (icon isn't crossed out)."}),`
`,e.jsx(n.li,{children:"You're not in Do Not Disturb / focus mode that silences app audio."}),`
`]}),`
`,e.jsx(n.h2,{id:"talk-mode",children:e.jsx(n.a,{className:"anchor",href:"#talk-mode",children:"Talk mode"})}),`
`,e.jsx(n.p,{children:'Want to have a hands-free conversation? Open the chat, click the microphone, and talk. Milady transcribes what you say, sends it through the model, and speaks the response back. This is "talk mode."'}),`
`,e.jsx(n.p,{children:"Talk mode uses your system microphone and Milady's speech-to-text pipeline. First time you enable it, your OS will ask for microphone permission — grant it. If you skip the prompt, you can re-enable it later in your system privacy settings (macOS: System Settings → Privacy & Security → Microphone; Windows: Settings → Privacy → Microphone)."}),`
`,e.jsx(n.h2,{id:"where-does-the-conversation-live",children:e.jsx(n.a,{className:"anchor",href:"#where-does-the-conversation-live",children:"Where does the conversation live?"})}),`
`,e.jsxs(n.p,{children:["Right on your machine, in a local database under ",e.jsx(n.code,{children:"~/.milady/"})," (Windows: ",e.jsx(n.code,{children:"%USERPROFILE%\\.milady\\"}),")."]}),`
`,e.jsx(n.p,{children:"That means:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"You can close Milady and reopen it later — the conversation is still there."}),`
`,e.jsx(n.li,{children:"Your messages aren't synced to a Milady-owned cloud. There isn't one."}),`
`,e.jsxs(n.li,{children:["If you're using a cloud language model (like OpenAI), the message gets sent to them ",e.jsx(n.em,{children:"during inference"}),", but the transcript is stored with you, not them."]}),`
`,e.jsxs(n.li,{children:["Backups and migrations are your responsibility. If you want to move Milady to a new machine, copy the ",e.jsx(n.code,{children:"~/.milady/"})," directory and you're done."]}),`
`]}),`
`,e.jsx(n.h2,{id:"starting-a-new-conversation",children:e.jsx(n.a,{className:"anchor",href:"#starting-a-new-conversation",children:"Starting a new conversation"})}),`
`,e.jsx(n.p,{children:`There's a "new chat" button near the conversation list. Click it to start fresh with a blank slate. Your previous conversations don't disappear — they're just shelved under the chat list. Click any of them to pick up where you left off.`}),`
`,e.jsx(t,{kind:"note",children:e.jsx(n.p,{children:"Each conversation is independent. Your agent remembers things you told it in one conversation, but it won't automatically surface them in a new conversation unless you've set up memory / knowledge (we'll cover that in the Intermediate tier)."})}),`
`,e.jsx(n.h2,{id:"things-to-try-before-moving-on",children:e.jsx(n.a,{className:"anchor",href:"#things-to-try-before-moving-on",children:"Things to try before moving on"})}),`
`,e.jsx(n.p,{children:"A few prompts that show off different capabilities:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Ask about itself."}),' "What model are you running?" "What character are you?" "Where does your memory live?"']}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Ask for help with something concrete."}),' "Help me write a short birthday message for a friend." Real tasks show you the tone and style best.']}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Ask it to remember something."}),` "Remember that my favorite color is green." Then start a new conversation and ask "what's my favorite color?" and see what happens. (Spoiler: nothing, yet — persistent memory across sessions requires a step you'll learn in the Intermediate tier.)`]}),`
`]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/beginner/picking-a-provider",children:"Picking a provider"})," — a deeper look at the provider choice you made during onboarding, and how to pick something different if it's not working out."]})]})}function h(o={}){const{wrapper:n}={...i(),...o.components};return n?e.jsx(n,{...o,children:e.jsx(s,{...o})}):s(o)}function r(o,n){throw new Error("Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}export{h as default};

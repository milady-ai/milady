import{n as e,r as t}from"./index-DZypq9Su.js";var n=t();function r(t){let r={a:`a`,blockquote:`blockquote`,code:`code`,em:`em`,h1:`h1`,h2:`h2`,li:`li`,ol:`ol`,p:`p`,strong:`strong`,ul:`ul`,...e(),...t.components},{Callout:i}=r;return i||a(`Callout`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`your-first-chat`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#your-first-chat`,children:`Your first chat`})}),`
`,(0,n.jsx)(r.p,{children:`You've finished onboarding and you're staring at the chat view. Time to send something.`}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` how to send a message, what happens when you do, how voice works, and where your conversation actually lives.`]}),`
`,(0,n.jsx)(r.h2,{id:`say-hi`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#say-hi`,children:`Say hi`})}),`
`,(0,n.jsx)(r.p,{children:`Click the chat input at the bottom of the window and type something. A good first message is anything you'd say to a new assistant:`}),`
`,(0,n.jsxs)(r.blockquote,{children:[`
`,(0,n.jsx)(r.p,{children:`"Hey — what can you do?"`}),`
`,(0,n.jsx)(r.p,{children:`"Tell me about yourself."`}),`
`,(0,n.jsxs)(r.p,{children:[`"What's the weather like?" `,(0,n.jsx)(r.em,{children:`(spoiler: it probably doesn't know the weather yet)`})]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Hit Enter. A few things happen in the next couple of seconds:`}),`
`,(0,n.jsxs)(r.ol,{children:[`
`,(0,n.jsx)(r.li,{children:`Your message gets stored locally in the conversation.`}),`
`,(0,n.jsx)(r.li,{children:`The character's avatar reacts — a subtle animation, maybe a head turn.`}),`
`,(0,n.jsx)(r.li,{children:`Milady sends your message plus some context (who your agent is, recent conversation history) to whichever language model provider you picked.`}),`
`,(0,n.jsx)(r.li,{children:`The response streams back. You'll see text appearing word by word.`}),`
`,(0,n.jsx)(r.li,{children:`If voice is enabled, the character speaks the response out loud while the text renders.`}),`
`,(0,n.jsx)(r.li,{children:`The whole exchange gets saved to your local database.`}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`That's the round trip. Do it a few times to get a feel for how your agent responds.`}),`
`,(0,n.jsx)(r.h2,{id:`turn-voice-on-or-off`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#turn-voice-on-or-off`,children:`Turn voice on (or off)`})}),`
`,(0,n.jsx)(r.p,{children:`By default, voice is on — Milady speaks responses aloud using the voice you picked during onboarding. If you'd rather read in silence, there's a speaker icon near the chat that toggles it.`}),`
`,(0,n.jsx)(i,{kind:`tip`,children:(0,n.jsx)(r.p,{children:`Headphones are strongly recommended the first time you hear it. The default voices are good, and hearing an AI talk back through laptop speakers in a quiet room is a weirder experience than you might expect.`})}),`
`,(0,n.jsx)(r.p,{children:`If voice is on but you don't hear anything, check:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Your system audio output is pointed at the right device.`}),`
`,(0,n.jsx)(r.li,{children:`The voice toggle is actually on (icon isn't crossed out).`}),`
`,(0,n.jsx)(r.li,{children:`You're not in Do Not Disturb / focus mode that silences app audio.`}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`talk-mode`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#talk-mode`,children:`Talk mode`})}),`
`,(0,n.jsx)(r.p,{children:`Want to have a hands-free conversation? Open the chat, click the microphone, and talk. Milady transcribes what you say, sends it through the model, and speaks the response back. This is "talk mode."`}),`
`,(0,n.jsx)(r.p,{children:`Talk mode uses your system microphone and Milady's speech-to-text pipeline. First time you enable it, your OS will ask for microphone permission — grant it. If you skip the prompt, you can re-enable it later in your system privacy settings (macOS: System Settings → Privacy & Security → Microphone; Windows: Settings → Privacy → Microphone).`}),`
`,(0,n.jsx)(r.h2,{id:`where-does-the-conversation-live`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#where-does-the-conversation-live`,children:`Where does the conversation live?`})}),`
`,(0,n.jsxs)(r.p,{children:[`Right on your machine, in a local database under `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/`}),` (Windows: `,(0,n.jsx)(r.code,{children:`%USERPROFILE%\\.local\\state\\milady\\`}),`).`]}),`
`,(0,n.jsx)(r.p,{children:`That means:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`You can close Milady and reopen it later — the conversation is still there.`}),`
`,(0,n.jsx)(r.li,{children:`Your messages aren't synced to a Milady-owned cloud. There isn't one.`}),`
`,(0,n.jsxs)(r.li,{children:[`If you're using a cloud language model (like OpenAI), the message gets sent to them `,(0,n.jsx)(r.em,{children:`during inference`}),`, but the transcript is stored with you, not them.`]}),`
`,(0,n.jsxs)(r.li,{children:[`Backups and migrations are your responsibility. If you want to move Milady to a new machine, copy the `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/`}),` directory and you're done.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`starting-a-new-conversation`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#starting-a-new-conversation`,children:`Starting a new conversation`})}),`
`,(0,n.jsx)(r.p,{children:`There's a "new chat" button near the conversation list. Click it to start fresh with a blank slate. Your previous conversations don't disappear — they're just shelved under the chat list. Click any of them to pick up where you left off.`}),`
`,(0,n.jsx)(i,{kind:`note`,children:(0,n.jsx)(r.p,{children:`Each conversation is independent. Your agent remembers things you told it in one conversation, but it won't automatically surface them in a new conversation unless you've set up memory / knowledge (we'll cover that in the Intermediate tier).`})}),`
`,(0,n.jsx)(r.h2,{id:`things-to-try-before-moving-on`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#things-to-try-before-moving-on`,children:`Things to try before moving on`})}),`
`,(0,n.jsx)(r.p,{children:`A few prompts that show off different capabilities:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Ask about itself.`}),` "What model are you running?" "What character are you?" "Where does your memory live?"`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Ask for help with something concrete.`}),` "Help me write a short birthday message for a friend." Real tasks show you the tone and style best.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Ask it to remember something.`}),` "Remember that my favorite color is green." Then start a new conversation and ask "what's my favorite color?" and see what happens. (Spoiler: nothing, yet — persistent memory across sessions requires a step you'll learn in the Intermediate tier.)`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.a,{href:`/docs/beginner/picking-a-provider`,children:`Picking a provider`}),` — a deeper look at the provider choice you made during onboarding, and how to pick something different if it's not working out.`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
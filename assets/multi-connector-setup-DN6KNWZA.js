import{u as r,j as e}from"./index-BfT5spx2.js";function s(o){const n={a:"a",h1:"h1",h2:"h2",li:"li",ol:"ol",p:"p",strong:"strong",ul:"ul",...r(),...o.components},{Callout:t}=n;return t||i("Callout"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"running-multiple-connectors",children:e.jsx(n.a,{className:"anchor",href:"#running-multiple-connectors",children:"Running multiple connectors"})}),`
`,e.jsx(n.p,{children:"You've got Milady connected to Discord. Now you want Telegram too. And iMessage. And maybe Slack next week. This page is about running multiple connectors at the same time without your agent getting confused, losing context, or double-replying to the same conversation."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," how Milady handles messages from multiple platforms at once, how to keep contexts separate (or shared, if you want), and the common pitfalls."]}),`
`,e.jsx(n.h2,{id:"the-short-version",children:e.jsx(n.a,{className:"anchor",href:"#the-short-version",children:"The short version"})}),`
`,e.jsx(n.p,{children:"Connectors are independent. Each one runs as its own thread that listens for messages, hands them to your agent, and sends responses back. Enabling a second connector doesn't touch the first — they don't know about each other."}),`
`,e.jsxs(n.p,{children:["From your agent's perspective, every message comes in with a ",e.jsx(n.strong,{children:"source"}),': "this is from Discord channel #general" or "this is from Telegram DM with Alice." The agent sees the source and the message, and responds. Milady then routes the response back to the right platform automatically.']}),`
`,e.jsx(n.p,{children:"You can run as many connectors at the same time as you want. The limits are your provider rate limits (how many requests per minute your language model lets you make) and your own attention, not Milady itself."}),`
`,e.jsx(n.h2,{id:"enabling-a-second-connector",children:e.jsx(n.a,{className:"anchor",href:"#enabling-a-second-connector",children:"Enabling a second connector"})}),`
`,e.jsx(n.p,{children:"Follow the connector-specific walkthroughs from the intermediate tier:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:e.jsx(n.a,{href:"/docs/intermediate/connect-discord",children:"Connect to Discord"})}),`
`,e.jsx(n.li,{children:e.jsx(n.a,{href:"/docs/intermediate/connect-telegram",children:"Connect to Telegram"})}),`
`]}),`
`,e.jsx(n.p,{children:"For iMessage, Slack, WhatsApp, Matrix, and others, open Settings → Connectors and click the one you want. Each connector has its own setup flow, but they all follow the same pattern: paste credentials, configure filters, click save."}),`
`,e.jsx(n.h2,{id:"do-connectors-share-memory",children:e.jsx(n.a,{className:"anchor",href:"#do-connectors-share-memory",children:"Do connectors share memory?"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"By default, no."})," Each connector — and each channel within a connector — has its own memory thread. Conversations in #general on Discord are independent of conversations in Telegram DMs with your friend Alice. This is usually what you want: you don't want your Discord server members seeing things your Telegram friends told you."]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"If you want shared context"}),", there are two levers:"]}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Knowledge"}),": knowledge is global by default. Anything you upload to the Knowledge tab is available to every connector. Use this for reference material you want the agent to know about everywhere."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Character"}),`: the character's personality and system prompt are also global. One character, multiple connectors. If you want to project the same "voice" across Discord and Telegram, that's automatic.`]}),`
`]}),`
`,e.jsxs(n.p,{children:["If you want ",e.jsx(n.strong,{children:"conversations"}),` to merge across connectors (say, "treat Discord DM with Bob and Telegram DM with Bob as the same conversation"), that's called `,e.jsx(n.strong,{children:"contact linking"})," and it's an opt-in feature — Settings → Memory → Contact linking. Set up per-person. Most people don't need this."]}),`
`,e.jsx(t,{kind:"warning",children:e.jsx(n.p,{children:"Don't enable contact linking without thinking about it. If you link a person across platforms and that person says something in a Discord server group chat, their message might end up as context in your Telegram DM with them. This gets weird fast."})}),`
`,e.jsx(n.h2,{id:"rate-limits-and-cost",children:e.jsx(n.a,{className:"anchor",href:"#rate-limits-and-cost",children:"Rate limits and cost"})}),`
`,e.jsx(n.p,{children:"Every message across every connector hits your language model provider. If you're on a cloud provider, each message costs something. Add up every connector × every channel × every response and you can get to real money faster than you expect."}),`
`,e.jsx(n.p,{children:"A few practical tips:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Scope each connector tightly."})," Don't let Discord listen in every channel of a busy server. Pick 1–3 channels."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:'Use "only respond to mentions"'})," on high-traffic connectors. The bot only replies when someone explicitly asks for it, which drops cost by 90%+ in active servers."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Set up different providers per connector"})," (yes, you can). Route Discord to a cheaper model because the traffic volume is higher, and keep your desktop chat on the premium one. Covered in ",e.jsx(n.a,{href:"/docs/intermediate/switching-providers",children:"Switching providers"}),"."]}),`
`]}),`
`,e.jsx(n.h2,{id:"avoiding-loops",children:e.jsx(n.a,{className:"anchor",href:"#avoiding-loops",children:"Avoiding loops"})}),`
`,e.jsxs(n.p,{children:["If you have two bots in the same place — say, Milady + another AI bot in a Discord channel — they can start talking to each other and run up your bill in an hour. Every connector has an ",e.jsx(n.strong,{children:"ignore bot messages"})," option, on by default. Don't turn it off unless you specifically want your Milady agent to interact with other bots."]}),`
`,e.jsx(t,{kind:"tip",children:e.jsx(n.p,{children:"If you notice your Milady is replying to a conversation that's moving suspiciously fast, check whether another bot is in the channel. A loop between two bots is almost always the cause."})}),`
`,e.jsx(n.h2,{id:"debugging-my-agent-is-responding-on-the-wrong-connector",children:e.jsx(n.a,{className:"anchor",href:"#debugging-my-agent-is-responding-on-the-wrong-connector",children:'Debugging "my agent is responding on the wrong connector"'})}),`
`,e.jsx(n.p,{children:"This usually isn't Milady's fault — it's a connector configuration issue. Check:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Which channels is Discord listening in?"})," Settings → Connectors → Discord → Channel IDs."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Which chats is Telegram allowed in?"})," Settings → Connectors → Telegram → Allowed chats."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Does the bot have permission to post in the channel it's reading?"})," Sometimes a bot can read messages but can't write (Discord role permissions, or a Telegram group that's moderator-only)."]}),`
`]}),`
`,e.jsx(n.p,{children:"When in doubt, temporarily disable all connectors except the one you're troubleshooting and narrow down from there."}),`
`,e.jsx(n.h2,{id:"turning-a-connector-off-temporarily",children:e.jsx(n.a,{className:"anchor",href:"#turning-a-connector-off-temporarily",children:"Turning a connector off temporarily"})}),`
`,e.jsx(n.p,{children:'Settings → Connectors → pick the connector → toggle the "enabled" switch off. The connector disconnects, and messages from that platform stop being processed. Your credentials are still saved — flip the switch back on to reconnect.'}),`
`,e.jsx(n.p,{children:"This is useful for pausing Milady during a big event (you don't want your agent responding in a work Slack during an all-hands you're sitting in) without having to re-enter credentials later."}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/advanced/wallet-and-payments",children:"Wallet and payments"})," — if you want your agent to handle on-chain actions, manage a small budget, or use Vincent/Steward for automated payments."]})]})}function c(o={}){const{wrapper:n}={...r(),...o.components};return n?e.jsx(n,{...o,children:e.jsx(s,{...o})}):s(o)}function i(o,n){throw new Error("Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}export{c as default};

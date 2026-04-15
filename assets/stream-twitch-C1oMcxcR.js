import{u as o,j as e}from"./index-BfT5spx2.js";function s(n){const t={a:"a",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...o(),...n.components},{Callout:r,Steps:i}=t;return r||a("Callout"),i||a("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(t.h1,{id:"stream-to-twitch",children:e.jsx(t.a,{className:"anchor",href:"#stream-to-twitch",children:"Stream to Twitch"})}),`
`,e.jsxs(t.p,{children:["Give Milady a ",e.jsx(t.strong,{children:"Stream"})," tab and let your agent go live on your Twitch channel — video, audio, the whole thing. This is different from the ",e.jsx(t.a,{href:"/docs/intermediate/connect-twitch",children:"Twitch chat connector"}),", which just puts a bot in chat; this plugin actually pushes video via RTMP."]}),`
`,e.jsxs(t.p,{children:[e.jsx(t.strong,{children:"What you'll learn:"})," grab a stream key from Twitch, paste it into Milady, start streaming."]}),`
`,e.jsx(t.h2,{id:"what-you-need-before-you-start",children:e.jsx(t.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(t.ul,{children:[`
`,e.jsxs(t.li,{children:[e.jsx(t.strong,{children:"A Twitch account"})," — personal or a dedicated streaming account."]}),`
`,e.jsxs(t.li,{children:[e.jsx(t.strong,{children:"A Twitch channel with streaming enabled."})," For new accounts Twitch may require phone verification before your first stream."]}),`
`,e.jsxs(t.li,{children:[e.jsx(t.strong,{children:"The Enable Streaming plugin active in Milady"})," — it adds the Stream tab. This usually turns on automatically when any streaming destination plugin is configured."]}),`
`,e.jsxs(t.li,{children:[e.jsx(t.strong,{children:"A machine with enough CPU/GPU to encode video in real time."})," This is more hardware-intensive than any other connector."]}),`
`,e.jsxs(t.li,{children:[e.jsx(t.strong,{children:"Milady running"})," with a working provider."]}),`
`]}),`
`,e.jsx(t.h2,{id:"step-1--get-your-twitch-stream-key",children:e.jsx(t.a,{className:"anchor",href:"#step-1--get-your-twitch-stream-key",children:"Step 1 — Get your Twitch stream key"})}),`
`,e.jsxs(i,{children:[e.jsxs("li",{children:["Sign in at ",e.jsx("a",{href:"https://dashboard.twitch.tv",children:"dashboard.twitch.tv"}),"."]}),e.jsxs("li",{children:["Left sidebar: ",e.jsx("strong",{children:"Settings → Stream"}),"."]}),e.jsxs("li",{children:["Under ",e.jsx("strong",{children:"Primary Stream Key"}),", click ",e.jsx("strong",{children:"Copy"}),"."]})]}),`
`,e.jsx(r,{kind:"danger",title:"Stream keys are dangerous",children:e.jsx(t.p,{children:"Anyone who has your stream key can broadcast to your Twitch channel as you. If it leaks — screenshots, shared screens, logs — regenerate it immediately from the same page. Never paste it into a public chat, a git commit, or a screen recording."})}),`
`,e.jsx(t.h2,{id:"step-2--hand-the-key-to-milady",children:e.jsx(t.a,{className:"anchor",href:"#step-2--hand-the-key-to-milady",children:"Step 2 — Hand the key to Milady"})}),`
`,e.jsxs(i,{children:[e.jsxs("li",{children:["Open Milady. Go to ",e.jsx("strong",{children:"Settings → Plugins → Twitch Streaming → Configure"}),"."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Stream key"}),"."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Save"}),"."]})]}),`
`,e.jsx(t.h2,{id:"step-3--go-live",children:e.jsx(t.a,{className:"anchor",href:"#step-3--go-live",children:"Step 3 — Go live"})}),`
`,e.jsxs(i,{children:[e.jsxs("li",{children:["Open the ",e.jsx("strong",{children:"Stream"})," tab in Milady."]}),e.jsx("li",{children:"Pick Twitch as the destination."}),e.jsxs("li",{children:["Hit ",e.jsx("strong",{children:"Go Live"}),"."]}),e.jsxs("li",{children:["Open ",e.jsx("code",{children:"twitch.tv/yourchannel"})," in a separate browser — after a few seconds of buffering, you should see the stream."]})]}),`
`,e.jsx(t.h2,{id:"stream-quality-tips",children:e.jsx(t.a,{className:"anchor",href:"#stream-quality-tips",children:"Stream quality tips"})}),`
`,e.jsxs(t.ul,{children:[`
`,e.jsx(t.li,{children:"Twitch supports up to 1080p60 but only pays out to Partners/Affiliates at higher tiers. For a first stream, 720p30 is easier on your hardware and looks fine."}),`
`,e.jsx(t.li,{children:"If your stream lags or drops frames, lower the bitrate in the Stream tab until it's stable."}),`
`,e.jsx(t.li,{children:"Wired ethernet is dramatically more reliable than Wi-Fi for streaming. Plug in if you can."}),`
`]}),`
`,e.jsx(t.h2,{id:"troubleshooting",children:e.jsx(t.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(t.p,{children:[e.jsx(t.strong,{children:'Milady shows "stream failed" immediately after clicking Go Live.'}),`
Stream key is wrong, or your Twitch account isn't allowed to stream yet. Go back to Twitch, verify the key, and confirm your account has streaming enabled (some new accounts require phone verification).`]}),`
`,e.jsxs(t.p,{children:[e.jsx(t.strong,{children:'Stream starts but Twitch shows "reconnecting" repeatedly.'}),`
Network instability or a bitrate too high for your uplink. Lower the bitrate in Milady's Stream tab.`]}),`
`,e.jsxs(t.p,{children:[e.jsx(t.strong,{children:"Stream looks choppy even though the bitrate is low."}),`
CPU/GPU can't keep up with the encoder. Pick a more efficient codec (H.264 over AV1) and a lower resolution in Milady's stream settings.`]}),`
`,e.jsx(t.h2,{id:"whats-next",children:e.jsx(t.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(t.ul,{children:[`
`,e.jsxs(t.li,{children:[e.jsx(t.a,{href:"/docs/advanced/stream-youtube",children:"Stream to YouTube"})," — works alongside Twitch if you want to multi-stream."]}),`
`,e.jsxs(t.li,{children:[e.jsx(t.a,{href:"/docs/advanced/stream-custom-rtmp",children:"Stream to custom RTMP"})," — for Kick, Facebook Live, TikTok, or self-hosted destinations."]}),`
`]})]})}function c(n={}){const{wrapper:t}={...o(),...n.components};return t?e.jsx(t,{...n,children:e.jsx(s,{...n})}):s(n)}function a(n,t){throw new Error("Expected component `"+n+"` to be defined: you likely forgot to import, pass, or provide it.")}export{c as default};

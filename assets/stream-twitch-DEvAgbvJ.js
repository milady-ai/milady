import{n as e,r as t}from"./index-LACVjOgv.js";var n=t();function r(t){let r={a:`a`,h1:`h1`,h2:`h2`,li:`li`,p:`p`,strong:`strong`,ul:`ul`,...e(),...t.components},{Callout:i,Steps:o}=r;return i||a(`Callout`,!0),o||a(`Steps`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`stream-to-twitch`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#stream-to-twitch`,children:`Stream to Twitch`})}),`
`,(0,n.jsxs)(r.p,{children:[`Give Milady a `,(0,n.jsx)(r.strong,{children:`Stream`}),` tab and let your agent go live on your Twitch channel — video, audio, the whole thing. This is different from the `,(0,n.jsx)(r.a,{href:`/docs/intermediate/connect-twitch`,children:`Twitch chat connector`}),`, which just puts a bot in chat; this plugin actually pushes video via RTMP.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` grab a stream key from Twitch, paste it into Milady, start streaming.`]}),`
`,(0,n.jsx)(r.h2,{id:`what-you-need-before-you-start`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-you-need-before-you-start`,children:`What you need before you start`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A Twitch account`}),` — personal or a dedicated streaming account.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A Twitch channel with streaming enabled.`}),` For new accounts Twitch may require phone verification before your first stream.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`The Enable Streaming plugin active in Milady`}),` — it adds the Stream tab. This usually turns on automatically when any streaming destination plugin is configured.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A machine with enough CPU/GPU to encode video in real time.`}),` This is more hardware-intensive than any other connector.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Milady running`}),` with a working provider.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`step-1--get-your-twitch-stream-key`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-1--get-your-twitch-stream-key`,children:`Step 1 — Get your Twitch stream key`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsxs)(`li`,{children:[`Sign in at `,(0,n.jsx)(`a`,{href:`https://dashboard.twitch.tv`,children:`dashboard.twitch.tv`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Left sidebar: `,(0,n.jsx)(`strong`,{children:`Settings → Stream`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Under `,(0,n.jsx)(`strong`,{children:`Primary Stream Key`}),`, click `,(0,n.jsx)(`strong`,{children:`Copy`}),`.`]})]}),`
`,(0,n.jsx)(i,{kind:`danger`,title:`Stream keys are dangerous`,children:(0,n.jsx)(r.p,{children:`Anyone who has your stream key can broadcast to your Twitch channel as you. If it leaks — screenshots, shared screens, logs — regenerate it immediately from the same page. Never paste it into a public chat, a git commit, or a screen recording.`})}),`
`,(0,n.jsx)(r.h2,{id:`step-2--hand-the-key-to-milady`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-2--hand-the-key-to-milady`,children:`Step 2 — Hand the key to Milady`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsxs)(`li`,{children:[`Open Milady. Go to `,(0,n.jsx)(`strong`,{children:`Settings → Plugins → Twitch Streaming → Configure`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Paste the `,(0,n.jsx)(`strong`,{children:`Stream key`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Click `,(0,n.jsx)(`strong`,{children:`Save`}),`.`]})]}),`
`,(0,n.jsx)(r.h2,{id:`step-3--go-live`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-3--go-live`,children:`Step 3 — Go live`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsxs)(`li`,{children:[`Open the `,(0,n.jsx)(`strong`,{children:`Stream`}),` tab in Milady.`]}),(0,n.jsx)(`li`,{children:`Pick Twitch as the destination.`}),(0,n.jsxs)(`li`,{children:[`Hit `,(0,n.jsx)(`strong`,{children:`Go Live`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Open `,(0,n.jsx)(`code`,{children:`twitch.tv/yourchannel`}),` in a separate browser — after a few seconds of buffering, you should see the stream.`]})]}),`
`,(0,n.jsx)(r.h2,{id:`stream-quality-tips`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#stream-quality-tips`,children:`Stream quality tips`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Twitch supports up to 1080p60 but only pays out to Partners/Affiliates at higher tiers. For a first stream, 720p30 is easier on your hardware and looks fine.`}),`
`,(0,n.jsx)(r.li,{children:`If your stream lags or drops frames, lower the bitrate in the Stream tab until it's stable.`}),`
`,(0,n.jsx)(r.li,{children:`Wired ethernet is dramatically more reliable than Wi-Fi for streaming. Plug in if you can.`}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`troubleshooting`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#troubleshooting`,children:`Troubleshooting`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Milady shows "stream failed" immediately after clicking Go Live.`}),`
Stream key is wrong, or your Twitch account isn't allowed to stream yet. Go back to Twitch, verify the key, and confirm your account has streaming enabled (some new accounts require phone verification).`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Stream starts but Twitch shows "reconnecting" repeatedly.`}),`
Network instability or a bitrate too high for your uplink. Lower the bitrate in Milady's Stream tab.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Stream looks choppy even though the bitrate is low.`}),`
CPU/GPU can't keep up with the encoder. Pick a more efficient codec (H.264 over AV1) and a lower resolution in Milady's stream settings.`]}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.a,{href:`/docs/advanced/stream-youtube`,children:`Stream to YouTube`}),` — works alongside Twitch if you want to multi-stream.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.a,{href:`/docs/advanced/stream-custom-rtmp`,children:`Stream to custom RTMP`}),` — for Kick, Facebook Live, TikTok, or self-hosted destinations.`]}),`
`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
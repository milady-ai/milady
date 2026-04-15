import{u as a,j as e}from"./index-BfT5spx2.js";function r(t){const n={a:"a",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...a(),...t.components},{Callout:s,Steps:i}=n;return s||o("Callout"),i||o("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"stream-to-youtube-live",children:e.jsx(n.a,{className:"anchor",href:"#stream-to-youtube-live",children:"Stream to YouTube Live"})}),`
`,e.jsx(n.p,{children:"Push your Milady agent's stream to YouTube Live. Setup is as straightforward as Twitch once you've enabled live streaming on your YouTube channel — the only catch is that Google requires phone verification and a 24-hour waiting period for brand-new channels."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," enable live streaming on YouTube, grab your stream key, connect Milady."]}),`
`,e.jsx(n.h2,{id:"what-you-need-before-you-start",children:e.jsx(n.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A YouTube channel"})," with ",e.jsx(n.strong,{children:"live streaming enabled"}),". Google requires:",`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"A verified phone number on the Google account."}),`
`,e.jsx(n.li,{children:"No live streaming restrictions in the last 90 days."}),`
`,e.jsx(n.li,{children:"A waiting period of up to 24 hours after enabling live streaming for the first time."}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Milady running"})," with a working provider."]}),`
`,e.jsx(n.li,{children:e.jsx(n.strong,{children:"Hardware that can encode video in real time."})}),`
`]}),`
`,e.jsx(n.h2,{id:"step-1--enable-live-streaming-one-time",children:e.jsx(n.a,{className:"anchor",href:"#step-1--enable-live-streaming-one-time",children:"Step 1 — Enable live streaming (one-time)"})}),`
`,e.jsxs(i,{children:[e.jsxs("li",{children:["Open ",e.jsx("a",{href:"https://studio.youtube.com",children:"studio.youtube.com"}),"."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Create → Go Live"})," in the top right."]}),e.jsx("li",{children:"YouTube walks you through phone verification if you haven't done it."}),e.jsx("li",{children:"After verification, YouTube says live streaming will be available within 24 hours. For most accounts it's instant, but budget for the delay on a new account."})]}),`
`,e.jsx(n.h2,{id:"step-2--create-a-stream-and-grab-the-key",children:e.jsx(n.a,{className:"anchor",href:"#step-2--create-a-stream-and-grab-the-key",children:"Step 2 — Create a stream and grab the key"})}),`
`,e.jsxs(i,{children:[e.jsxs("li",{children:["Once live streaming is active, in YouTube Studio click ",e.jsx("strong",{children:"Create → Go Live"})," again."]}),e.jsxs("li",{children:["Pick ",e.jsx("strong",{children:"Streaming software"})," (as opposed to webcam or mobile)."]}),e.jsx("li",{children:"Fill in the stream's title, description, privacy (public / unlisted / private), and category."}),e.jsxs("li",{children:["Under ",e.jsx("strong",{children:"Stream settings"}),", find the ",e.jsx("strong",{children:"Stream key"}),". Click the copy button."]}),e.jsxs("li",{children:["Also note the ",e.jsx("strong",{children:"Stream URL"})," — YouTube's default is ",e.jsx("code",{children:"rtmp://a.rtmp.youtube.com/live2"}),"."]})]}),`
`,e.jsx(s,{kind:"warning",children:e.jsx(n.p,{children:"YouTube stream keys — like Twitch's — are essentially broadcasting passwords. Keep them private and regenerate if they leak."})}),`
`,e.jsx(n.h2,{id:"step-3--hand-everything-to-milady",children:e.jsx(n.a,{className:"anchor",href:"#step-3--hand-everything-to-milady",children:"Step 3 — Hand everything to Milady"})}),`
`,e.jsxs(i,{children:[e.jsxs("li",{children:["Open Milady. Go to ",e.jsx("strong",{children:"Settings → Plugins → YouTube Streaming → Configure"}),"."]}),e.jsxs("li",{children:["Paste the ",e.jsx("strong",{children:"Stream key"}),"."]}),e.jsxs("li",{children:["Leave ",e.jsx("strong",{children:"RTMP URL"})," as default (",e.jsx("code",{children:"rtmp://a.rtmp.youtube.com/live2"}),") unless YouTube told you otherwise."]}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Save"}),"."]})]}),`
`,e.jsx(n.h2,{id:"step-4--go-live",children:e.jsx(n.a,{className:"anchor",href:"#step-4--go-live",children:"Step 4 — Go live"})}),`
`,e.jsxs(i,{children:[e.jsxs("li",{children:["Open the ",e.jsx("strong",{children:"Stream"})," tab in Milady."]}),e.jsx("li",{children:"Pick YouTube as the destination."}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Go Live"}),"."]}),e.jsx("li",{children:"Return to YouTube Studio's Live Control Room — after 15–30 seconds of buffering, you'll see a preview of the stream."}),e.jsxs("li",{children:["Once the preview shows your stream, click ",e.jsx("strong",{children:"Go Live"})," on YouTube's side to actually publish it to viewers."]})]}),`
`,e.jsx(n.h2,{id:"troubleshooting",children:e.jsx(n.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:'"Stream key not found" or Milady errors immediately.'}),`
Key is wrong, or you copied a scheduled stream's key before the stream started. YouTube stream keys can be persistent or per-event depending on how you set up the stream — persistent keys (from Settings) are easier for testing.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Milady is streaming but YouTube Live Control Room never shows the preview."}),`
You may have pasted the key from a "Scheduled for later" stream that hasn't opened yet. Either wait until the scheduled time, or create a new immediate stream.`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Stream starts but audio is silent."}),`
Audio isn't being captured on Milady's side. Check the Stream tab's audio source — many streaming setups default to "no audio" on first use.`]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/advanced/stream-twitch",children:"Stream to Twitch"})," — the other major platform, often streamed simultaneously."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.a,{href:"/docs/advanced/stream-custom-rtmp",children:"Stream to custom RTMP"})," — for everything that isn't Twitch or YouTube."]}),`
`]})]})}function h(t={}){const{wrapper:n}={...a(),...t.components};return n?e.jsx(n,{...t,children:e.jsx(r,{...t})}):r(t)}function o(t,n){throw new Error("Expected component `"+t+"` to be defined: you likely forgot to import, pass, or provide it.")}export{h as default};

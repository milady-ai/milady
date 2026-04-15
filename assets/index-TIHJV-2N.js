import{u as r,j as e}from"./index-BfT5spx2.js";function s(i){const n={a:"a",code:"code",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...r(),...i.components};return e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"for-developers",children:e.jsx(n.a,{className:"anchor",href:"#for-developers",children:"For developers"})}),`
`,e.jsx(n.p,{children:"These consumer docs are deliberately light on code. If you're building on Milady — writing a plugin, hitting the REST API, using the CLI, embedding the runtime, or trying to understand how the agent loader actually works — you want the full developer reference instead."}),`
`,e.jsx(n.p,{children:e.jsxs(n.strong,{children:["Go to ",e.jsx(n.a,{href:"https://docs.milady.ai",children:"docs.milady.ai"}),"."]})}),`
`,e.jsx(n.h2,{id:"whats-over-there",children:e.jsx(n.a,{className:"anchor",href:"#whats-over-there",children:"What's over there"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"REST API reference"})," — every endpoint the runtime exposes, with request/response schemas, auth rules, and examples."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Plugin SDK"})," — how plugins are structured, how to write one, how to publish to the Milady plugin registry, and the exact shape of actions, providers, services, and evaluators."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"CLI reference"})," — every ",e.jsx(n.code,{children:"milady"})," subcommand, flag, and env var."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Runtime internals"})," — the agent loop, memory system, provider routing, event bus, and service lifecycle."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Architecture guide"})," — how Milady wraps elizaOS, how the Bun CLI talks to the Electrobun desktop shell, and how the feature components in ",e.jsx(n.code,{children:"@elizaos/app-core"})," get consumed by the Vite shell at ",e.jsx(n.code,{children:"apps/homepage/"}),"."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Connectors"})," — per-platform setup guides at the full detail level (webhooks, scopes, rate limits, signature verification)."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Configuration schema"})," — every field in ",e.jsx(n.code,{children:"~/.milady/milady.json"}),", with types, defaults, and precedence rules."]}),`
`]}),`
`,e.jsx(n.h2,{id:"when-to-use-which",children:e.jsx(n.a,{className:"anchor",href:"#when-to-use-which",children:"When to use which"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"You are here (milady.ai/docs)"})," if you want to:"]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Install Milady, pick a provider, have your first chat."}),`
`,e.jsx(n.li,{children:"Connect it to Discord or Telegram without writing code."}),`
`,e.jsx(n.li,{children:"Change the personality, voice, or avatar."}),`
`,e.jsx(n.li,{children:"Understand privacy, memory, and how your data moves."}),`
`,e.jsx(n.li,{children:"Install a plugin someone else wrote, without touching the codebase."}),`
`]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Go to docs.milady.ai"})," if you want to:"]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Write a plugin, action, provider, or service."}),`
`,e.jsx(n.li,{children:"Call the REST API from your own code."}),`
`,e.jsx(n.li,{children:"Embed the runtime in another app."}),`
`,e.jsx(n.li,{children:"Contribute to Milady itself."}),`
`,e.jsx(n.li,{children:"Run Milady on Linux from the CLI without the desktop app."}),`
`,e.jsx(n.li,{children:"Understand the plugin resolution, NODE_PATH setup, or bun-exports patching that makes dynamic imports work."}),`
`]}),`
`,e.jsxs(n.p,{children:["Both docs sites are maintained together. If something is missing from either, it's a bug — file it at ",e.jsx(n.a,{href:"https://github.com/milady-ai/milady/issues",children:"github.com/milady-ai/milady"}),"."]})]})}function o(i={}){const{wrapper:n}={...r(),...i.components};return n?e.jsx(n,{...i,children:e.jsx(s,{...i})}):s(i)}export{o as default};

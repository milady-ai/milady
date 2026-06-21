import{n as e,r as t}from"./index-DXnzbmOt.js";var n=t();function r(t){let r={a:`a`,code:`code`,h1:`h1`,h2:`h2`,li:`li`,p:`p`,strong:`strong`,ul:`ul`,...e(),...t.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`for-developers`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#for-developers`,children:`For developers`})}),`
`,(0,n.jsx)(r.p,{children:`These consumer docs are deliberately light on code. If you're building on Milady — writing a plugin, hitting the REST API, using the CLI, embedding the runtime, or trying to understand how the agent loader actually works — you want the full developer reference instead.`}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsxs)(r.strong,{children:[`Go to `,(0,n.jsx)(r.a,{href:`https://docs.milady.ai`,children:`docs.milady.ai`}),`.`]})}),`
`,(0,n.jsx)(r.h2,{id:`whats-over-there`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-over-there`,children:`What's over there`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`REST API reference`}),` — every endpoint the runtime exposes, with request/response schemas, auth rules, and examples.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Plugin SDK`}),` — how plugins are structured, how to write one, how to publish to the Milady plugin registry, and the exact shape of actions, providers, services, and evaluators.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`CLI reference`}),` — every `,(0,n.jsx)(r.code,{children:`milady`}),` subcommand, flag, and env var.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Runtime internals`}),` — the agent loop, memory system, provider routing, event bus, and service lifecycle.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Architecture guide`}),` — how Milady wraps elizaOS, how the Bun CLI talks to the Electrobun desktop shell, and how the feature components in `,(0,n.jsx)(r.code,{children:`@elizaos/app-core`}),` get consumed by the Vite shell at `,(0,n.jsx)(r.code,{children:`apps/homepage/`}),`.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Connectors`}),` — per-platform setup guides at the full detail level (webhooks, scopes, rate limits, signature verification).`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Configuration schema`}),` — every field in `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/milady.json`}),`, with types, defaults, and precedence rules.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`when-to-use-which`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#when-to-use-which`,children:`When to use which`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`You are here (milady.ai/docs)`}),` if you want to:`]}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Install Milady, pick a provider, have your first chat.`}),`
`,(0,n.jsx)(r.li,{children:`Connect it to Discord or Telegram without writing code.`}),`
`,(0,n.jsx)(r.li,{children:`Change the personality, voice, or avatar.`}),`
`,(0,n.jsx)(r.li,{children:`Understand privacy, memory, and how your data moves.`}),`
`,(0,n.jsx)(r.li,{children:`Install a plugin someone else wrote, without touching the codebase.`}),`
`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Go to docs.milady.ai`}),` if you want to:`]}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Write a plugin, action, provider, or service.`}),`
`,(0,n.jsx)(r.li,{children:`Call the REST API from your own code.`}),`
`,(0,n.jsx)(r.li,{children:`Embed the runtime in another app.`}),`
`,(0,n.jsx)(r.li,{children:`Contribute to Milady itself.`}),`
`,(0,n.jsx)(r.li,{children:`Run Milady on Linux from the CLI without the desktop app.`}),`
`,(0,n.jsx)(r.li,{children:`Understand the plugin resolution, NODE_PATH setup, or bun-exports patching that makes dynamic imports work.`}),`
`]}),`
`,(0,n.jsxs)(r.p,{children:[`Both docs sites are maintained together. If something is missing from either, it's a bug — file it at `,(0,n.jsx)(r.a,{href:`https://github.com/milady-ai/milady/issues`,children:`github.com/milady-ai/milady`}),`.`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}export{i as default};
import{u as r,j as e}from"./index-BfT5spx2.js";function l(i){const n={a:"a",code:"code",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...r(),...i.components},{Callout:s,Steps:t}=n;return s||a("Callout"),t||a("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"plugins-for-non-developers",children:e.jsx(n.a,{className:"anchor",href:"#plugins-for-non-developers",children:"Plugins for non-developers"})}),`
`,e.jsx(n.p,{children:"Milady has a plugin system. Developers use it to extend what their agent can do — wire up new platforms, add new actions, pull in new data sources. You don't need to be a developer to use plugins someone else has written."}),`
`,e.jsxs(n.p,{children:["This page is about installing and enabling plugins from Milady's plugin registry ",e.jsx(n.strong,{children:"without touching code"}),". If you can install the desktop app, you can do this."]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," what plugins are, how to browse the registry, how to install one, how to enable it, and how to troubleshoot when a plugin isn't doing what you expect."]}),`
`,e.jsx(n.h2,{id:"what-a-plugin-actually-is",children:e.jsx(n.a,{className:"anchor",href:"#what-a-plugin-actually-is",children:"What a plugin actually is"})}),`
`,e.jsx(n.p,{children:"A plugin is a packaged bundle of extra capabilities your agent can use. Common kinds:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Connector plugins"})," — add support for a new platform (Discord, Telegram, iMessage, Slack, Matrix, WhatsApp, etc. are all connector plugins)."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Action plugins"})," — teach your agent to do new things (search the web, check weather, run code, control smart home devices, look up prices)."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Data provider plugins"})," — give your agent access to a new data source (calendar, email, a specific API)."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Model provider plugins"})," — add support for a new language model service."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Character plugins"})," — ship a pre-built character, personality, voice, and avatar as a single package."]}),`
`]}),`
`,e.jsx(n.p,{children:"Milady ships with a set of core plugins already installed. Everything else is optional and lives in the registry."}),`
`,e.jsx(n.h2,{id:"browsing-the-registry",children:e.jsx(n.a,{className:"anchor",href:"#browsing-the-registry",children:"Browsing the registry"})}),`
`,e.jsxs(n.p,{children:["Open ",e.jsx(n.strong,{children:"Settings → Plugins"}),". You'll see:"]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Installed"})," — plugins that are already on your machine. Enable / disable with the toggle."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Registry"})," — the full catalog. Browse, filter by category, search by name."]}),`
`]}),`
`,e.jsx(n.p,{children:"Each registry entry tells you:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"What the plugin does (a one-line description)."}),`
`,e.jsx(n.li,{children:"What category it's in."}),`
`,e.jsx(n.li,{children:"Who maintains it (Milady team, Eliza team, or a third party)."}),`
`,e.jsx(n.li,{children:'What credentials or setup it needs (some plugins are "free" — no key required; others need API keys).'}),`
`,e.jsx(n.li,{children:"A link to its detailed setup guide."}),`
`]}),`
`,e.jsx(s,{kind:"tip",children:e.jsx(n.p,{children:`Read the "setup needs" section before installing. A plugin that needs an API key from a service you haven't signed up for will sit unused until you get the key, which is a waste of a click.`})}),`
`,e.jsx(n.h2,{id:"installing-a-plugin",children:e.jsx(n.a,{className:"anchor",href:"#installing-a-plugin",children:"Installing a plugin"})}),`
`,e.jsxs(t,{children:[e.jsx("li",{children:"Open Settings → Plugins → Registry."}),e.jsx("li",{children:"Find the plugin you want. Click it for the detail view."}),e.jsxs("li",{children:["Click ",e.jsx("strong",{children:"Install"}),". Milady downloads the plugin package and registers it with the runtime."]}),e.jsx("li",{children:"Restart the agent if Milady prompts you. Most plugins can activate without a restart, but some (especially connectors) need a fresh agent process to load correctly."})]}),`
`,e.jsx(n.p,{children:'After install, the plugin appears in the "Installed" tab, initially disabled.'}),`
`,e.jsx(n.h2,{id:"enabling-a-plugin",children:e.jsx(n.a,{className:"anchor",href:"#enabling-a-plugin",children:"Enabling a plugin"})}),`
`,e.jsxs(t,{children:[e.jsx("li",{children:"Open Settings → Plugins → Installed."}),e.jsx("li",{children:"Click the plugin you just installed. A detail panel opens on the right."}),e.jsx("li",{children:"If the plugin needs credentials (an API key, a token, a URL), paste them now."}),e.jsxs("li",{children:["Toggle ",e.jsx("strong",{children:"Enabled"}),"."]}),e.jsx("li",{children:"Milady loads the plugin and confirms it's active."})]}),`
`,e.jsx(n.p,{children:`If the plugin needs credentials and you don't have them yet, its enable toggle stays disabled and shows a "credentials required" warning. Click the plugin to see exactly what's needed and where to get it.`}),`
`,e.jsx(n.h2,{id:"using-a-plugin",children:e.jsx(n.a,{className:"anchor",href:"#using-a-plugin",children:"Using a plugin"})}),`
`,e.jsx(n.p,{children:"Different plugin types show up in different places:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Connector plugins"})," appear in Settings → Connectors."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Action plugins"}),` don't have a UI — they just make new capabilities available to your agent. You'll notice them when you ask your agent to do something and it actually does it instead of saying "I can't." For example, if you install a "web search" plugin, your agent can answer questions that require current information it doesn't have in its training data.`]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Model provider plugins"})," appear in Settings → Providers as a new option in the chat/voice/embeddings lists."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Character plugins"})," appear in Settings → Character → Gallery."]}),`
`]}),`
`,e.jsx(n.h2,{id:"disabling-and-uninstalling",children:e.jsx(n.a,{className:"anchor",href:"#disabling-and-uninstalling",children:"Disabling and uninstalling"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Disable"})," (Settings → Plugins → Installed → toggle off): plugin stays installed, stops being active. Instant, reversible."]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Uninstall"})," (Settings → Plugins → Installed → Uninstall button): plugin is removed from disk. Its credentials might still be stored in ",e.jsx(n.code,{children:"~/.milady/milady.json"})," — Milady asks whether to wipe them when you uninstall."]}),`
`,e.jsx(n.p,{children:"Always disable before uninstalling if you might want the plugin back. Reinstalling is fast, but re-entering credentials is annoying."}),`
`,e.jsx(n.h2,{id:"plugin-trust",children:e.jsx(n.a,{className:"anchor",href:"#plugin-trust",children:"Plugin trust"})}),`
`,e.jsx(n.p,{children:"Milady's plugin registry has two tiers:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Verified"})," plugins have been reviewed by the Milady team and marked safe. They show a verified badge. The core connectors, official model providers, and common capabilities are all verified."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Community"})," plugins are written by third parties. They work, but Milady hasn't audited them. They show a community badge."]}),`
`]}),`
`,e.jsx(s,{kind:"warning",children:e.jsx(n.p,{children:`A plugin runs with the same permissions as Milady itself. That means it can read your config, access your wallet if enabled, and talk to the network. Community plugins are fine for most use cases, but don't install one without at least checking who made it and what it does. "I found this on the registry" isn't the same as "this is safe to run."`})}),`
`,e.jsx(n.p,{children:"If you want to be extra cautious: community plugins are also on GitHub under the author's account. You can read the source before installing. For most consumer use cases, verified plugins cover what you need without the review step."}),`
`,e.jsx(n.h2,{id:"updating-plugins",children:e.jsx(n.a,{className:"anchor",href:"#updating-plugins",children:"Updating plugins"})}),`
`,e.jsx(n.p,{children:`Settings → Plugins → Installed shows a "Updates available" badge if any of your installed plugins have newer versions in the registry. Click the plugin and then click Update. Updates usually don't break things, but if something was working before an update and doesn't work after, check the plugin's changelog on its registry page.`}),`
`,e.jsx(n.h2,{id:"common-plugin-problems",children:e.jsx(n.a,{className:"anchor",href:"#common-plugin-problems",children:"Common plugin problems"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Plugin enabled but nothing is happening"})," — Milady might need a restart. Settings → Advanced → Restart agent."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:'"Credentials invalid"'})," — you pasted the wrong key, or the key is missing permissions the plugin expects. Double-check against the plugin's setup guide."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Plugin isn't in the registry even though I heard about it"})," — make sure you're on the latest Milady. Older versions might not have the newest plugins yet."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Plugin crashed the agent"})," — rare but possible. Disable the plugin and file an issue on its repo (or the Milady repo for official plugins)."]}),`
`]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/advanced/privacy-and-data",children:"Privacy, data, and what stays local"})," — where your data lives, what gets sent where, and how to minimize what leaves your machine."]})]})}function d(i={}){const{wrapper:n}={...r(),...i.components};return n?e.jsx(n,{...i,children:e.jsx(l,{...i})}):l(i)}function a(i,n){throw new Error("Expected component `"+i+"` to be defined: you likely forgot to import, pass, or provide it.")}export{d as default};

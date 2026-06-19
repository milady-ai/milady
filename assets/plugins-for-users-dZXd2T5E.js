import{n as e,r as t}from"./index-LACVjOgv.js";var n=t();function r(t){let r={a:`a`,code:`code`,h1:`h1`,h2:`h2`,li:`li`,p:`p`,strong:`strong`,ul:`ul`,...e(),...t.components},{Callout:i,Steps:o}=r;return i||a(`Callout`,!0),o||a(`Steps`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`plugins-for-non-developers`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#plugins-for-non-developers`,children:`Plugins for non-developers`})}),`
`,(0,n.jsx)(r.p,{children:`Milady has a plugin system. Developers use it to extend what their agent can do — wire up new platforms, add new actions, pull in new data sources. You don't need to be a developer to use plugins someone else has written.`}),`
`,(0,n.jsxs)(r.p,{children:[`This page is about installing and enabling plugins from Milady's plugin registry `,(0,n.jsx)(r.strong,{children:`without touching code`}),`. If you can install the desktop app, you can do this.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` what plugins are, how to browse the registry, how to install one, how to enable it, and how to troubleshoot when a plugin isn't doing what you expect.`]}),`
`,(0,n.jsx)(r.h2,{id:`what-a-plugin-actually-is`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-a-plugin-actually-is`,children:`What a plugin actually is`})}),`
`,(0,n.jsx)(r.p,{children:`A plugin is a packaged bundle of extra capabilities your agent can use. Common kinds:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Connector plugins`}),` — add support for a new platform (Discord, Telegram, iMessage, Slack, Matrix, WhatsApp, etc. are all connector plugins).`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Action plugins`}),` — teach your agent to do new things (search the web, check weather, run code, control smart home devices, look up prices).`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Data provider plugins`}),` — give your agent access to a new data source (calendar, email, a specific API).`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Model provider plugins`}),` — add support for a new language model service.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Character plugins`}),` — ship a pre-built character, personality, voice, and avatar as a single package.`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Milady ships with a set of core plugins already installed. Everything else is optional and lives in the registry.`}),`
`,(0,n.jsx)(r.h2,{id:`browsing-the-registry`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#browsing-the-registry`,children:`Browsing the registry`})}),`
`,(0,n.jsxs)(r.p,{children:[`Open `,(0,n.jsx)(r.strong,{children:`Settings → Plugins`}),`. You'll see:`]}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Installed`}),` — plugins that are already on your machine. Enable / disable with the toggle.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Registry`}),` — the full catalog. Browse, filter by category, search by name.`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Each registry entry tells you:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`What the plugin does (a one-line description).`}),`
`,(0,n.jsx)(r.li,{children:`What category it's in.`}),`
`,(0,n.jsx)(r.li,{children:`Who maintains it (Milady team, Eliza team, or a third party).`}),`
`,(0,n.jsx)(r.li,{children:`What credentials or setup it needs (some plugins are "free" — no key required; others need API keys).`}),`
`,(0,n.jsx)(r.li,{children:`A link to its detailed setup guide.`}),`
`]}),`
`,(0,n.jsx)(i,{kind:`tip`,children:(0,n.jsx)(r.p,{children:`Read the "setup needs" section before installing. A plugin that needs an API key from a service you haven't signed up for will sit unused until you get the key, which is a waste of a click.`})}),`
`,(0,n.jsx)(r.h2,{id:`installing-a-plugin`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#installing-a-plugin`,children:`Installing a plugin`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsx)(`li`,{children:`Open Settings → Plugins → Registry.`}),(0,n.jsx)(`li`,{children:`Find the plugin you want. Click it for the detail view.`}),(0,n.jsxs)(`li`,{children:[`Click `,(0,n.jsx)(`strong`,{children:`Install`}),`. Milady downloads the plugin package and registers it with the runtime.`]}),(0,n.jsx)(`li`,{children:`Restart the agent if Milady prompts you. Most plugins can activate without a restart, but some (especially connectors) need a fresh agent process to load correctly.`})]}),`
`,(0,n.jsx)(r.p,{children:`After install, the plugin appears in the "Installed" tab, initially disabled.`}),`
`,(0,n.jsx)(r.h2,{id:`enabling-a-plugin`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#enabling-a-plugin`,children:`Enabling a plugin`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsx)(`li`,{children:`Open Settings → Plugins → Installed.`}),(0,n.jsx)(`li`,{children:`Click the plugin you just installed. A detail panel opens on the right.`}),(0,n.jsx)(`li`,{children:`If the plugin needs credentials (an API key, a token, a URL), paste them now.`}),(0,n.jsxs)(`li`,{children:[`Toggle `,(0,n.jsx)(`strong`,{children:`Enabled`}),`.`]}),(0,n.jsx)(`li`,{children:`Milady loads the plugin and confirms it's active.`})]}),`
`,(0,n.jsx)(r.p,{children:`If the plugin needs credentials and you don't have them yet, its enable toggle stays disabled and shows a "credentials required" warning. Click the plugin to see exactly what's needed and where to get it.`}),`
`,(0,n.jsx)(r.h2,{id:`using-a-plugin`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#using-a-plugin`,children:`Using a plugin`})}),`
`,(0,n.jsx)(r.p,{children:`Different plugin types show up in different places:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Connector plugins`}),` appear in Settings → Connectors.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Action plugins`}),` don't have a UI — they just make new capabilities available to your agent. You'll notice them when you ask your agent to do something and it actually does it instead of saying "I can't." For example, if you install a "web search" plugin, your agent can answer questions that require current information it doesn't have in its training data.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Model provider plugins`}),` appear in Settings → Providers as a new option in the chat/voice/embeddings lists.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Character plugins`}),` appear in Settings → Character → Gallery.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`disabling-and-uninstalling`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#disabling-and-uninstalling`,children:`Disabling and uninstalling`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Disable`}),` (Settings → Plugins → Installed → toggle off): plugin stays installed, stops being active. Instant, reversible.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Uninstall`}),` (Settings → Plugins → Installed → Uninstall button): plugin is removed from disk. Its credentials might still be stored in `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/milady.json`}),` — Milady asks whether to wipe them when you uninstall.`]}),`
`,(0,n.jsx)(r.p,{children:`Always disable before uninstalling if you might want the plugin back. Reinstalling is fast, but re-entering credentials is annoying.`}),`
`,(0,n.jsx)(r.h2,{id:`plugin-trust`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#plugin-trust`,children:`Plugin trust`})}),`
`,(0,n.jsx)(r.p,{children:`Milady's plugin registry has two tiers:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Verified`}),` plugins have been reviewed by the Milady team and marked safe. They show a verified badge. The core connectors, official model providers, and common capabilities are all verified.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Community`}),` plugins are written by third parties. They work, but Milady hasn't audited them. They show a community badge.`]}),`
`]}),`
`,(0,n.jsx)(i,{kind:`warning`,children:(0,n.jsx)(r.p,{children:`A plugin runs with the same permissions as Milady itself. That means it can read your config, access your wallet if enabled, and talk to the network. Community plugins are fine for most use cases, but don't install one without at least checking who made it and what it does. "I found this on the registry" isn't the same as "this is safe to run."`})}),`
`,(0,n.jsx)(r.p,{children:`If you want to be extra cautious: community plugins are also on GitHub under the author's account. You can read the source before installing. For most consumer use cases, verified plugins cover what you need without the review step.`}),`
`,(0,n.jsx)(r.h2,{id:`updating-plugins`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#updating-plugins`,children:`Updating plugins`})}),`
`,(0,n.jsx)(r.p,{children:`Settings → Plugins → Installed shows a "Updates available" badge if any of your installed plugins have newer versions in the registry. Click the plugin and then click Update. Updates usually don't break things, but if something was working before an update and doesn't work after, check the plugin's changelog on its registry page.`}),`
`,(0,n.jsx)(r.h2,{id:`common-plugin-problems`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#common-plugin-problems`,children:`Common plugin problems`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Plugin enabled but nothing is happening`}),` — Milady might need a restart. Settings → Advanced → Restart agent.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`"Credentials invalid"`}),` — you pasted the wrong key, or the key is missing permissions the plugin expects. Double-check against the plugin's setup guide.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Plugin isn't in the registry even though I heard about it`}),` — make sure you're on the latest Milady. Older versions might not have the newest plugins yet.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Plugin crashed the agent`}),` — rare but possible. Disable the plugin and file an issue on its repo (or the Milady repo for official plugins).`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.a,{href:`/docs/advanced/privacy-and-data`,children:`Privacy, data, and what stays local`}),` — where your data lives, what gets sent where, and how to minimize what leaves your machine.`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
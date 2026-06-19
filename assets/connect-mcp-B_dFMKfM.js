import{n as e,r as t}from"./index-Dvvh3c9f.js";var n=t();function r(t){let r={a:`a`,code:`code`,h1:`h1`,h2:`h2`,li:`li`,p:`p`,pre:`pre`,span:`span`,strong:`strong`,table:`table`,tbody:`tbody`,td:`td`,th:`th`,thead:`thead`,tr:`tr`,ul:`ul`,...e(),...t.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`connect-mcp-servers-model-context-protocol`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#connect-mcp-servers-model-context-protocol`,children:`Connect MCP servers (Model Context Protocol)`})}),`
`,(0,n.jsxs)(r.p,{children:[`MCP — the `,(0,n.jsx)(r.strong,{children:`Model Context Protocol`}),` — is a standard for giving AI agents access to external tools, files, databases, and APIs. Think of it as "plugin for the plugin": you point Milady at one or more MCP servers, and your agent gains whatever capabilities those servers expose. Web search, file system access, databases, GitHub APIs, browser automation — all through one common interface.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` what MCP is in plain language, how to configure Milady to talk to one or more MCP servers, and where to find ones worth trying.`]}),`
`,(0,n.jsx)(r.h2,{id:`what-mcp-is-in-one-paragraph`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-mcp-is-in-one-paragraph`,children:`What MCP is, in one paragraph`})}),`
`,(0,n.jsx)(r.p,{children:`Most AI features require writing custom code to bolt them onto your agent. MCP inverts that: the server author writes it once, exposes it in a standard shape, and any MCP-aware agent (Milady, Claude Desktop, Cursor, and many others) can use it instantly. The result is a rapidly growing ecosystem of reusable capabilities.`}),`
`,(0,n.jsx)(r.h2,{id:`what-you-need-before-you-start`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-you-need-before-you-start`,children:`What you need before you start`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`At least one MCP server`}),` you want to use. See "Finding MCP servers" below.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Milady running`}),` with a working provider.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Node.js or Bun installed`}),` if the MCP server you pick is Node-based (most are). Python-based servers need Python.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`finding-mcp-servers`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#finding-mcp-servers`,children:`Finding MCP servers`})}),`
`,(0,n.jsxs)(r.p,{children:[`The easiest starting point is the `,(0,n.jsx)(r.a,{href:`https://github.com/modelcontextprotocol/servers`,children:`official MCP servers directory`}),` — a curated list maintained by the protocol's authors. Notable ones:`]}),`
`,(0,n.jsxs)(r.table,{children:[(0,n.jsx)(r.thead,{children:(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.th,{children:`Server`}),(0,n.jsx)(r.th,{children:`What it does`})]})}),(0,n.jsxs)(r.tbody,{children:[(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.code,{children:`@modelcontextprotocol/server-filesystem`})}),(0,n.jsx)(r.td,{children:`Read/write files in allowed directories`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.code,{children:`@modelcontextprotocol/server-github`})}),(0,n.jsx)(r.td,{children:`Interact with GitHub repos (alternative to Milady's GitHub connector)`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.code,{children:`@modelcontextprotocol/server-postgres`})}),(0,n.jsx)(r.td,{children:`Run read-only SQL against a Postgres database`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.code,{children:`@modelcontextprotocol/server-brave-search`})}),(0,n.jsx)(r.td,{children:`Web search via Brave`})]}),(0,n.jsxs)(r.tr,{children:[(0,n.jsx)(r.td,{children:(0,n.jsx)(r.code,{children:`@modelcontextprotocol/server-puppeteer`})}),(0,n.jsx)(r.td,{children:`Control a headless browser`})]})]})]}),`
`,(0,n.jsx)(r.p,{children:`Third-party servers are everywhere — search GitHub for "mcp server" to find ones for Linear, Slack, Notion, Jira, AWS, and more.`}),`
`,(0,n.jsx)(r.h2,{id:`step-1--configure-mcp-in-miladyjson`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-1--configure-mcp-in-miladyjson`,children:`Step 1 — Configure MCP in milady.json`})}),`
`,(0,n.jsxs)(r.p,{children:[`The MCP connector is configured through `,(0,n.jsx)(r.code,{children:`~/.local/state/milady/milady.json`}),` because MCP configuration is structurally richer than a flat list of env vars. Add an `,(0,n.jsx)(r.code,{children:`mcp`}),` block:`]}),`
`,(0,n.jsx)(n.Fragment,{children:(0,n.jsx)(r.pre,{className:`shiki github-dark`,style:{backgroundColor:`#24292e`,color:`#e1e4e8`},tabIndex:`0`,children:(0,n.jsxs)(r.code,{children:[(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`{`})}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`  "connectors"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`    "mcp"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`      "servers"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`        "filesystem"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`          "command"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"npx"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`          "args"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: [`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`            "-y"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`            "@modelcontextprotocol/server-filesystem"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`            "/Users/you/Documents/milady-workspace"`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`          ]`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`        },`})}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`        "brave-search"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`          "command"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"npx"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`,`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`          "args"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: [`}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"-y"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`, `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"@modelcontextprotocol/server-brave-search"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`],`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`          "env"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: {`})]}),`
`,(0,n.jsxs)(r.span,{className:`line`,children:[(0,n.jsx)(r.span,{style:{color:`#79B8FF`},children:`            "BRAVE_API_KEY"`}),(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`: `}),(0,n.jsx)(r.span,{style:{color:`#9ECBFF`},children:`"your-brave-key"`})]}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`          }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`        }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`      }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`    }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`  }`})}),`
`,(0,n.jsx)(r.span,{className:`line`,children:(0,n.jsx)(r.span,{style:{color:`#E1E4E8`},children:`}`})})]})})}),`
`,(0,n.jsx)(r.p,{children:(0,n.jsx)(r.strong,{children:`Key shape:`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`Each MCP server gets a key (the name you'll see in the UI).`}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.code,{children:`command`}),` is what Milady runs to start the server. Usually `,(0,n.jsx)(r.code,{children:`npx`}),`, `,(0,n.jsx)(r.code,{children:`bun x`}),`, `,(0,n.jsx)(r.code,{children:`python`}),`, or an absolute binary path.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.code,{children:`args`}),` is the command arguments.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.code,{children:`env`}),` passes environment variables to the server process — this is where API keys live.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`step-2--restart-milady`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-2--restart-milady`,children:`Step 2 — Restart Milady`})}),`
`,(0,n.jsx)(r.p,{children:`MCP servers are started when Milady starts. Restart the app after editing the config. On startup you should see log lines confirming each server connected.`}),`
`,(0,n.jsx)(r.h2,{id:`step-3--use-it`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-3--use-it`,children:`Step 3 — Use it`})}),`
`,(0,n.jsx)(r.p,{children:`Start a chat with your agent and ask for something the server can provide:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Filesystem server:`}),` "list the markdown files in my milady-workspace"`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Brave search:`}),` "search the web for the latest Rust release"`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Postgres server:`}),` "show me the 10 most recent rows from the orders table"`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`If the agent can call the tool, it will; if not, check the status panel for connection errors.`}),`
`,(0,n.jsx)(r.h2,{id:`troubleshooting`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#troubleshooting`,children:`Troubleshooting`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`"MCP server failed to start."`}),`
Check the command and args are exactly right. `,(0,n.jsx)(r.code,{children:`npx -y ...`}),` triggers auto-install of the npm package; first run takes time.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`The agent doesn't discover the tool.`}),`
Confirm the server is running — Milady's MCP panel shows connected servers and their exposed tools. If a server connects but exposes no tools, there's a version mismatch or the server itself is misconfigured.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Permissions errors on the filesystem server.`}),`
The filesystem server is sandboxed to the directories you pass in `,(0,n.jsx)(r.code,{children:`args`}),`. It can only read/write inside those paths. Either add the path you need, or move the files somewhere the server can see.`]}),`
`,(0,n.jsx)(r.h2,{id:`security-note`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#security-note`,children:`Security note`})}),`
`,(0,n.jsxs)(r.p,{children:[`MCP servers run as child processes of Milady with whatever permissions Milady has. A filesystem server you gave access to `,(0,n.jsx)(r.code,{children:`~/Documents`}),` can read everything in Documents. A database server has whatever DB permissions its connection string grants. `,(0,n.jsx)(r.strong,{children:`Only run MCP servers from sources you trust`}),`, and scope each one to the smallest set of resources it needs.`]}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.a,{href:`/docs/advanced/plugins-for-users`,children:`Plugins for non-developers`}),` — if MCP feels like too much, many use cases are better served by a regular Milady plugin.`]}),`
`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}export{i as default};
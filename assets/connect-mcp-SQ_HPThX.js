import{u as l,j as e}from"./index-BfT5spx2.js";function r(n){const s={a:"a",code:"code",h1:"h1",h2:"h2",li:"li",p:"p",pre:"pre",span:"span",strong:"strong",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...l(),...n.components};return e.jsxs(e.Fragment,{children:[e.jsx(s.h1,{id:"connect-mcp-servers-model-context-protocol",children:e.jsx(s.a,{className:"anchor",href:"#connect-mcp-servers-model-context-protocol",children:"Connect MCP servers (Model Context Protocol)"})}),`
`,e.jsxs(s.p,{children:["MCP — the ",e.jsx(s.strong,{children:"Model Context Protocol"}),' — is a standard for giving AI agents access to external tools, files, databases, and APIs. Think of it as "plugin for the plugin": you point Milady at one or more MCP servers, and your agent gains whatever capabilities those servers expose. Web search, file system access, databases, GitHub APIs, browser automation — all through one common interface.']}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"What you'll learn:"})," what MCP is in plain language, how to configure Milady to talk to one or more MCP servers, and where to find ones worth trying."]}),`
`,e.jsx(s.h2,{id:"what-mcp-is-in-one-paragraph",children:e.jsx(s.a,{className:"anchor",href:"#what-mcp-is-in-one-paragraph",children:"What MCP is, in one paragraph"})}),`
`,e.jsx(s.p,{children:"Most AI features require writing custom code to bolt them onto your agent. MCP inverts that: the server author writes it once, exposes it in a standard shape, and any MCP-aware agent (Milady, Claude Desktop, Cursor, and many others) can use it instantly. The result is a rapidly growing ecosystem of reusable capabilities."}),`
`,e.jsx(s.h2,{id:"what-you-need-before-you-start",children:e.jsx(s.a,{className:"anchor",href:"#what-you-need-before-you-start",children:"What you need before you start"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"At least one MCP server"}),' you want to use. See "Finding MCP servers" below.']}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Milady running"})," with a working provider."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Node.js or Bun installed"})," if the MCP server you pick is Node-based (most are). Python-based servers need Python."]}),`
`]}),`
`,e.jsx(s.h2,{id:"finding-mcp-servers",children:e.jsx(s.a,{className:"anchor",href:"#finding-mcp-servers",children:"Finding MCP servers"})}),`
`,e.jsxs(s.p,{children:["The easiest starting point is the ",e.jsx(s.a,{href:"https://github.com/modelcontextprotocol/servers",children:"official MCP servers directory"})," — a curated list maintained by the protocol's authors. Notable ones:"]}),`
`,e.jsxs(s.table,{children:[e.jsx(s.thead,{children:e.jsxs(s.tr,{children:[e.jsx(s.th,{children:"Server"}),e.jsx(s.th,{children:"What it does"})]})}),e.jsxs(s.tbody,{children:[e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.code,{children:"@modelcontextprotocol/server-filesystem"})}),e.jsx(s.td,{children:"Read/write files in allowed directories"})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.code,{children:"@modelcontextprotocol/server-github"})}),e.jsx(s.td,{children:"Interact with GitHub repos (alternative to Milady's GitHub connector)"})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.code,{children:"@modelcontextprotocol/server-postgres"})}),e.jsx(s.td,{children:"Run read-only SQL against a Postgres database"})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.code,{children:"@modelcontextprotocol/server-brave-search"})}),e.jsx(s.td,{children:"Web search via Brave"})]}),e.jsxs(s.tr,{children:[e.jsx(s.td,{children:e.jsx(s.code,{children:"@modelcontextprotocol/server-puppeteer"})}),e.jsx(s.td,{children:"Control a headless browser"})]})]})]}),`
`,e.jsx(s.p,{children:'Third-party servers are everywhere — search GitHub for "mcp server" to find ones for Linear, Slack, Notion, Jira, AWS, and more.'}),`
`,e.jsx(s.h2,{id:"step-1--configure-mcp-in-miladyjson",children:e.jsx(s.a,{className:"anchor",href:"#step-1--configure-mcp-in-miladyjson",children:"Step 1 — Configure MCP in milady.json"})}),`
`,e.jsxs(s.p,{children:["The MCP connector is configured through ",e.jsx(s.code,{children:"~/.milady/milady.json"})," because MCP configuration is structurally richer than a flat list of env vars. Add an ",e.jsx(s.code,{children:"mcp"})," block:"]}),`
`,e.jsx(e.Fragment,{children:e.jsx(s.pre,{className:"shiki github-dark",style:{backgroundColor:"#24292e",color:"#e1e4e8"},tabIndex:"0",children:e.jsxs(s.code,{children:[e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"{"})}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'  "connectors"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'    "mcp"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'      "servers"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'        "filesystem"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'          "command"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"npx"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'          "args"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": ["})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#9ECBFF"},children:'            "-y"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#9ECBFF"},children:'            "@modelcontextprotocol/server-filesystem"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#9ECBFF"},children:'            "/Users/you/Documents/milady-workspace"'})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"          ]"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"        },"})}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'        "brave-search"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'          "command"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"npx"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:","})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'          "args"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": ["}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"-y"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:", "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"@modelcontextprotocol/server-brave-search"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:"],"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'          "env"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": {"})]}),`
`,e.jsxs(s.span,{className:"line",children:[e.jsx(s.span,{style:{color:"#79B8FF"},children:'            "BRAVE_API_KEY"'}),e.jsx(s.span,{style:{color:"#E1E4E8"},children:": "}),e.jsx(s.span,{style:{color:"#9ECBFF"},children:'"your-brave-key"'})]}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"          }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"        }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"      }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"    }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"  }"})}),`
`,e.jsx(s.span,{className:"line",children:e.jsx(s.span,{style:{color:"#E1E4E8"},children:"}"})})]})})}),`
`,e.jsx(s.p,{children:e.jsx(s.strong,{children:"Key shape:"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsx(s.li,{children:"Each MCP server gets a key (the name you'll see in the UI)."}),`
`,e.jsxs(s.li,{children:[e.jsx(s.code,{children:"command"})," is what Milady runs to start the server. Usually ",e.jsx(s.code,{children:"npx"}),", ",e.jsx(s.code,{children:"bun x"}),", ",e.jsx(s.code,{children:"python"}),", or an absolute binary path."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.code,{children:"args"})," is the command arguments."]}),`
`,e.jsxs(s.li,{children:[e.jsx(s.code,{children:"env"})," passes environment variables to the server process — this is where API keys live."]}),`
`]}),`
`,e.jsx(s.h2,{id:"step-2--restart-milady",children:e.jsx(s.a,{className:"anchor",href:"#step-2--restart-milady",children:"Step 2 — Restart Milady"})}),`
`,e.jsx(s.p,{children:"MCP servers are started when Milady starts. Restart the app after editing the config. On startup you should see log lines confirming each server connected."}),`
`,e.jsx(s.h2,{id:"step-3--use-it",children:e.jsx(s.a,{className:"anchor",href:"#step-3--use-it",children:"Step 3 — Use it"})}),`
`,e.jsx(s.p,{children:"Start a chat with your agent and ask for something the server can provide:"}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Filesystem server:"}),' "list the markdown files in my milady-workspace"']}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Brave search:"}),' "search the web for the latest Rust release"']}),`
`,e.jsxs(s.li,{children:[e.jsx(s.strong,{children:"Postgres server:"}),' "show me the 10 most recent rows from the orders table"']}),`
`]}),`
`,e.jsx(s.p,{children:"If the agent can call the tool, it will; if not, check the status panel for connection errors."}),`
`,e.jsx(s.h2,{id:"troubleshooting",children:e.jsx(s.a,{className:"anchor",href:"#troubleshooting",children:"Troubleshooting"})}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:'"MCP server failed to start."'}),`
Check the command and args are exactly right. `,e.jsx(s.code,{children:"npx -y ..."})," triggers auto-install of the npm package; first run takes time."]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"The agent doesn't discover the tool."}),`
Confirm the server is running — Milady's MCP panel shows connected servers and their exposed tools. If a server connects but exposes no tools, there's a version mismatch or the server itself is misconfigured.`]}),`
`,e.jsxs(s.p,{children:[e.jsx(s.strong,{children:"Permissions errors on the filesystem server."}),`
The filesystem server is sandboxed to the directories you pass in `,e.jsx(s.code,{children:"args"}),". It can only read/write inside those paths. Either add the path you need, or move the files somewhere the server can see."]}),`
`,e.jsx(s.h2,{id:"security-note",children:e.jsx(s.a,{className:"anchor",href:"#security-note",children:"Security note"})}),`
`,e.jsxs(s.p,{children:["MCP servers run as child processes of Milady with whatever permissions Milady has. A filesystem server you gave access to ",e.jsx(s.code,{children:"~/Documents"})," can read everything in Documents. A database server has whatever DB permissions its connection string grants. ",e.jsx(s.strong,{children:"Only run MCP servers from sources you trust"}),", and scope each one to the smallest set of resources it needs."]}),`
`,e.jsx(s.h2,{id:"whats-next",children:e.jsx(s.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(s.ul,{children:[`
`,e.jsxs(s.li,{children:[e.jsx(s.a,{href:"/docs/advanced/plugins-for-users",children:"Plugins for non-developers"})," — if MCP feels like too much, many use cases are better served by a regular Milady plugin."]}),`
`]})]})}function t(n={}){const{wrapper:s}={...l(),...n.components};return s?e.jsx(s,{...n,children:e.jsx(r,{...n})}):r(n)}export{t as default};

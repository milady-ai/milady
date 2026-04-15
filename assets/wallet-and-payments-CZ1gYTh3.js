import{u as o,j as e}from"./index-BfT5spx2.js";function i(t){const n={a:"a",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",li:"li",ol:"ol",p:"p",strong:"strong",ul:"ul",...o(),...t.components},{Callout:a,Steps:s}=n;return a||r("Callout"),s||r("Steps"),e.jsxs(e.Fragment,{children:[e.jsx(n.h1,{id:"wallet-and-payments",children:e.jsx(n.a,{className:"anchor",href:"#wallet-and-payments",children:"Wallet and payments"})}),`
`,e.jsx(n.p,{children:"Milady has optional wallet and payment features for use cases where your agent needs to handle money. This is specifically for on-chain actions (crypto wallets) and agent-budgeted services — it's not about charging your credit card or paying for SaaS subscriptions."}),`
`,e.jsx(n.p,{children:"Most Milady users will never need this page. If you don't have a use case involving crypto or automated per-action payments, skip it and come back if you ever do."}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"What you'll learn:"})," what each wallet component is, when to use which, and how to not lose money."]}),`
`,e.jsx(n.h2,{id:"whats-actually-in-here",children:e.jsx(n.a,{className:"anchor",href:"#whats-actually-in-here",children:"What's actually in here"})}),`
`,e.jsxs(n.p,{children:["Open ",e.jsx(n.strong,{children:"Settings → Wallet"}),". You'll see three main things:"]}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"EVM wallet"})," — a standard Ethereum-compatible wallet your agent can use for on-chain transactions."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Vincent"}),' — a delegated-authority system where you grant your agent specific, scoped permissions to act on your behalf (think "a spending budget with rules").']}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Steward"})," — an account provisioning service that handles the boring parts (gas, signing, rate limiting)."]}),`
`]}),`
`,e.jsx(n.p,{children:"You can enable any combination. They're not mutually exclusive."}),`
`,e.jsx(a,{kind:"danger",children:e.jsxs(n.p,{children:["Before you start: ",e.jsx("strong",{children:"do not use your main wallet with Milady"}),". Create a new wallet specifically for your agent. Fund it with only what you'd be comfortable losing if something goes wrong — a bug, a compromised machine, a prompt injection that tricks your agent into sending funds somewhere unexpected. Treat it like a dev wallet."]})}),`
`,e.jsx(n.h2,{id:"evm-wallet",children:e.jsx(n.a,{className:"anchor",href:"#evm-wallet",children:"EVM wallet"})}),`
`,e.jsx(n.p,{children:"The EVM wallet is a standard Ethereum-compatible wallet that Milady stores in your local config directory. Your agent can use it to:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Send transactions (transfers, contract calls)"}),`
`,e.jsx(n.li,{children:"Sign messages"}),`
`,e.jsx(n.li,{children:"Interact with smart contracts"}),`
`,e.jsx(n.li,{children:"Hold and move ERC-20 tokens"}),`
`]}),`
`,e.jsx(n.h3,{id:"setting-one-up",children:e.jsx(n.a,{className:"anchor",href:"#setting-one-up",children:"Setting one up"})}),`
`,e.jsx(n.p,{children:"You have three options:"}),`
`,e.jsxs(s,{children:[e.jsxs("li",{children:[e.jsx("strong",{children:"Generate a new wallet"})," (recommended for first-time users) — Milady creates a fresh wallet keypair, shows you the mnemonic ",e.jsx("strong",{children:"once"}),", and stores the private key encrypted at rest."]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Import an existing wallet"})," via mnemonic or private key — if you already have a dev wallet you want to use."]}),e.jsxs("li",{children:[e.jsx("strong",{children:"Connect to a hardware wallet"})," (Ledger) — your Milady agent signs via the hardware wallet, so the private key never leaves the device. Slower but safest."]})]}),`
`,e.jsx(a,{kind:"warning",children:e.jsx(n.p,{children:'If you pick "generate," write the mnemonic down on paper and store it somewhere physical. Milady shows it to you once. If you lose it and your machine dies, the wallet and everything in it are unrecoverable.'})}),`
`,e.jsx(n.h3,{id:"what-network-am-i-on",children:e.jsx(n.a,{className:"anchor",href:"#what-network-am-i-on",children:"What network am I on?"})}),`
`,e.jsxs(n.p,{children:["Check Settings → Wallet → Network. Default is usually Ethereum mainnet, but you can switch to any EVM-compatible network (Polygon, Base, Arbitrum, a local Anvil node for testing). For first-time use, ",e.jsx(n.strong,{children:"run on a testnet first."})," Sepolia is free and works the same as mainnet for everything except the dollar value."]}),`
`,e.jsx(n.h2,{id:"vincent",children:e.jsx(n.a,{className:"anchor",href:"#vincent",children:"Vincent"})}),`
`,e.jsx(n.p,{children:`Vincent is a permission layer. Instead of handing your agent unlimited access to your wallet, you use Vincent to grant scoped capabilities: "you can spend up to X per day, only on contracts I've pre-approved, only for purposes matching this description."`}),`
`,e.jsx(n.p,{children:"Think of it as an allowance with rules. Your agent has autonomy within those rules, but can't exceed them."}),`
`,e.jsx(n.h3,{id:"when-to-use-vincent",children:e.jsx(n.a,{className:"anchor",href:"#when-to-use-vincent",children:"When to use Vincent"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Recurring small payments"})," — your agent handles a subscription, a tip jar, a streaming payment, etc."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Scoped trading"})," — your agent can trade within a specific budget and pair list but not move the underlying collateral."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Automated service payments"})," — your agent pays for API calls, cloud compute, or other services on a schedule."]}),`
`]}),`
`,e.jsx(n.h3,{id:"when-not-to",children:e.jsx(n.a,{className:"anchor",href:"#when-not-to",children:"When not to"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"One-off large transactions"})," — approve those manually."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Anything where you'd regret the worst-case outcome."})," Vincent reduces risk, it doesn't eliminate it."]}),`
`]}),`
`,e.jsx(n.h2,{id:"steward",children:e.jsx(n.a,{className:"anchor",href:"#steward",children:"Steward"})}),`
`,e.jsx(n.p,{children:`Steward handles the operational glue: gas management, signing queues, rate limiting, error recovery. You don't really "use" Steward directly — it runs behind Vincent and the EVM wallet, making them work smoothly. The main thing you need to know is that it exists and that its status shows up in the wallet settings.`}),`
`,e.jsx(n.p,{children:"If Steward is showing errors, your agent's on-chain actions will start failing or getting delayed. Usually it means gas prices spiked, your funded wallet ran dry, or the network you're on is congested. Fix whichever of those applies."}),`
`,e.jsx(n.h2,{id:"funding-your-wallet",children:e.jsx(n.a,{className:"anchor",href:"#funding-your-wallet",children:"Funding your wallet"})}),`
`,e.jsx(n.p,{children:"Once the wallet is set up:"}),`
`,e.jsxs(s,{children:[e.jsx("li",{children:"Copy the wallet address from Settings → Wallet."}),e.jsx("li",{children:"Send a small amount of the relevant token (ETH on mainnet, testnet ETH on Sepolia, MATIC on Polygon, etc.) from your main wallet or from a faucet."}),e.jsx("li",{children:"Wait for the transaction to confirm. You'll see the balance update in Settings → Wallet."})]}),`
`,e.jsxs(n.p,{children:[e.jsx(n.strong,{children:"Start with a tiny amount."})," Seriously. For your first on-chain action, fund with the minimum viable balance — enough for a couple of transactions, nothing more."]}),`
`,e.jsx(n.h2,{id:"monitoring",children:e.jsx(n.a,{className:"anchor",href:"#monitoring",children:"Monitoring"})}),`
`,e.jsxs(n.p,{children:[`Settings → Wallet → Activity shows you every transaction your agent has initiated, with status (pending, confirmed, failed) and details. Check this after any action until you trust the setup. It also has a "pending approvals" section if you've enabled the approval-required mode where your agent can `,e.jsx(n.em,{children:"propose"})," a transaction but you have to click to sign it."]}),`
`,e.jsx(n.h3,{id:"approval-required-mode",children:e.jsx(n.a,{className:"anchor",href:"#approval-required-mode",children:"Approval-required mode"})}),`
`,e.jsx(n.p,{children:"This is an on/off toggle that makes every transaction require your manual approval. Your agent queues up actions, you see them in the pending list, and you click approve or reject."}),`
`,e.jsx(a,{kind:"tip",children:e.jsx(n.p,{children:"Turn on approval-required mode for the first week. It's a pain, but it means you see exactly what your agent is trying to do before anything actually happens. After a week you'll know whether to trust the setup enough to turn it off, narrow the scope, or just leave it on forever."})}),`
`,e.jsx(n.h2,{id:"things-that-can-go-wrong",children:e.jsx(n.a,{className:"anchor",href:"#things-that-can-go-wrong",children:"Things that can go wrong"})}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Your private key leaks."})," If your machine is compromised or your ",e.jsx(n.code,{children:"~/.milady/"})," directory gets exfiltrated, anyone with the key can drain the wallet. This is why you use a fresh wallet with minimal funds."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A prompt injection tricks your agent into sending funds."})," If your agent is reading messages from a connector (Discord, Telegram) and someone sends a cleverly-crafted message, it's theoretically possible to get the agent to take an action you didn't intend. Vincent limits the blast radius but doesn't eliminate the risk."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Gas spikes strand a transaction."})," Your agent submits a tx with a gas price that's too low for current network conditions, the tx sits in the mempool forever. Steward handles most of this, but not all of it."]}),`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"A contract call behaves unexpectedly."})," Smart contracts have bugs. If your agent interacts with a buggy contract, funds can be lost. This is not specific to Milady — it's a general truth of on-chain anything."]}),`
`]}),`
`,e.jsx(n.h2,{id:"whats-next",children:e.jsx(n.a,{className:"anchor",href:"#whats-next",children:"What's next"})}),`
`,e.jsxs(n.p,{children:[e.jsx(n.a,{href:"/docs/advanced/plugins-for-users",children:"Plugins for non-developers"})," — how to install and enable plugins from the Milady registry without touching code."]})]})}function h(t={}){const{wrapper:n}={...o(),...t.components};return n?e.jsx(n,{...t,children:e.jsx(i,{...t})}):i(t)}function r(t,n){throw new Error("Expected component `"+t+"` to be defined: you likely forgot to import, pass, or provide it.")}export{h as default};

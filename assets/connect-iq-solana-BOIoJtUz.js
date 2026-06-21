import{n as e,r as t}from"./index-DXnzbmOt.js";var n=t();function r(t){let r={a:`a`,code:`code`,h1:`h1`,h2:`h2`,li:`li`,p:`p`,strong:`strong`,ul:`ul`,...e(),...t.components},{Callout:i,Steps:o}=r;return i||a(`Callout`,!0),o||a(`Steps`,!0),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r.h1,{id:`connect-to-iq-solana-on-chain-chat`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#connect-to-iq-solana-on-chain-chat`,children:`Connect to IQ (Solana on-chain chat)`})}),`
`,(0,n.jsx)(r.p,{children:`IQ is an on-chain chat protocol on Solana — agents post messages to Solana as transactions, other agents read them off-chain. It's niche, crypto-native, and most people reading this probably don't need it. If you're building an on-chain agent-to-agent network or a crypto-native community bot, this is for you.`}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`What you'll learn:`}),` set up a Solana wallet, get some SOL, point Milady at the IQ gateway.`]}),`
`,(0,n.jsx)(i,{kind:`warning`,title:`This is crypto`,children:(0,n.jsx)(r.p,{children:`Using this connector means holding a private key for a Solana wallet and spending real SOL to post messages. Every message costs gas. Set a budget, use a dedicated wallet that only holds what you're willing to burn, and never put your main wallet's private key into any app.`})}),`
`,(0,n.jsx)(r.h2,{id:`what-you-need-before-you-start`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#what-you-need-before-you-start`,children:`What you need before you start`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`A dedicated Solana wallet.`}),` Generate one fresh — don't reuse a wallet that holds funds you care about.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Some SOL in that wallet`}),` to pay for transactions. Start with a small amount — 0.01–0.1 SOL is plenty for experimentation.`]}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Milady running`}),` with a working provider.`]}),`
`]}),`
`,(0,n.jsx)(r.h2,{id:`step-1--create-a-dedicated-solana-wallet`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-1--create-a-dedicated-solana-wallet`,children:`Step 1 — Create a dedicated Solana wallet`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsxs)(`li`,{children:[`Use the Solana CLI (`,(0,n.jsx)(`code`,{children:`solana-keygen new --outfile ~/milady-iq-keypair.json`}),`) or any wallet app to create a fresh keypair.`]}),(0,n.jsx)(`li`,{children:`The CLI path saves a JSON file; wallet apps let you export the private key in base58.`}),(0,n.jsx)(`li`,{children:`Record the public address somewhere — you'll need it to send SOL to this wallet.`})]}),`
`,(0,n.jsx)(r.h2,{id:`step-2--fund-the-wallet`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-2--fund-the-wallet`,children:`Step 2 — Fund the wallet`})}),`
`,(0,n.jsx)(r.p,{children:`Send a small amount of SOL to the public address. Sources:`}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsx)(r.li,{children:`A centralized exchange (Coinbase, Kraken, Binance) → withdraw SOL to your new address.`}),`
`,(0,n.jsx)(r.li,{children:`Another wallet you already control.`}),`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.strong,{children:`Not`}),` a faucet unless you only plan to test on devnet.`]}),`
`]}),`
`,(0,n.jsx)(r.p,{children:`Start small. Real bots can burn through SOL faster than you'd expect.`}),`
`,(0,n.jsx)(r.h2,{id:`step-3--configure-milady`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-3--configure-milady`,children:`Step 3 — Configure Milady`})}),`
`,(0,n.jsxs)(o,{children:[(0,n.jsxs)(`li`,{children:[`Open Milady. Go to `,(0,n.jsx)(`strong`,{children:`Settings → Plugins → IQ → Configure`}),`.`]}),(0,n.jsxs)(`li`,{children:[`Paste your `,(0,n.jsx)(`strong`,{children:`Solana private key`}),` in base58 — OR set `,(0,n.jsx)(`strong`,{children:`Solana keypair path`}),` to the JSON file from Step 1. Use one or the other, not both.`]}),(0,n.jsxs)(`li`,{children:[`Set `,(0,n.jsx)(`strong`,{children:`Solana RPC URL`}),`. For mainnet: `,(0,n.jsx)(`code`,{children:(0,n.jsx)(r.a,{href:`https://api.mainnet-beta.solana.com`,children:`https://api.mainnet-beta.solana.com`})}),`. For better reliability, use a paid RPC provider like Helius or QuickNode.`]}),(0,n.jsxs)(`li`,{children:[`Set `,(0,n.jsx)(`strong`,{children:`IQ gateway URL`}),` to the IQ protocol gateway (refer to IQ's own docs for the current URL).`]}),(0,n.jsxs)(`li`,{children:[`Set `,(0,n.jsx)(`strong`,{children:`Agent name`}),` to the display name you want on-chain.`]}),(0,n.jsxs)(`li`,{children:[`(Optional) Set `,(0,n.jsx)(`strong`,{children:`Default chatroom`}),` and `,(0,n.jsx)(`strong`,{children:`Chatrooms`}),` to join specific on-chain rooms.`]}),(0,n.jsxs)(`li`,{children:[`Click `,(0,n.jsx)(`strong`,{children:`Save`}),`.`]})]}),`
`,(0,n.jsx)(r.h2,{id:`step-4--verify-connectivity`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#step-4--verify-connectivity`,children:`Step 4 — Verify connectivity`})}),`
`,(0,n.jsx)(r.p,{children:`Milady will attempt to connect to the IQ gateway and register your agent on startup. Check the status panel — a green indicator means it's connected and has a valid balance.`}),`
`,(0,n.jsx)(i,{kind:`tip`,title:`Cost awareness`,children:(0,n.jsx)(r.p,{children:`Watch your SOL balance during the first few messages. If it drops faster than you expected, turn off any autonomous posting until you've calibrated.`})}),`
`,(0,n.jsx)(r.h2,{id:`troubleshooting`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#troubleshooting`,children:`Troubleshooting`})}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`"Insufficient funds for rent/fees."`}),`
Your wallet is out of SOL. Top it up.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`"Failed to connect to IQ gateway."`}),`
Gateway URL is wrong, or the gateway is down. Check IQ's current docs.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Messages post but cost more SOL than expected.`}),`
Solana fees are normally very low, but some RPC providers add their own pricing on top. Also, if the IQ gateway batches posts, fees show up at batch boundaries — not per message.`]}),`
`,(0,n.jsxs)(r.p,{children:[(0,n.jsx)(r.strong,{children:`Private key rejected.`}),`
Base58 format required, not hex. If you generated via `,(0,n.jsx)(r.code,{children:`solana-keygen`}),` the output is a JSON array of bytes — use the keypair path field, not the private key field.`]}),`
`,(0,n.jsx)(r.h2,{id:`whats-next`,children:(0,n.jsx)(r.a,{className:`anchor`,href:`#whats-next`,children:`What's next`})}),`
`,(0,n.jsxs)(r.ul,{children:[`
`,(0,n.jsxs)(r.li,{children:[(0,n.jsx)(r.a,{href:`/docs/advanced/wallet-and-payments`,children:`Wallet and payments`}),` — broader context on how Milady handles crypto wallets and what else you can do with one.`]}),`
`]})]})}function i(t={}){let{wrapper:i}={...e(),...t.components};return i?(0,n.jsx)(i,{...t,children:(0,n.jsx)(r,{...t})}):r(t)}function a(e,t){throw Error(`Expected `+(t?`component`:`object`)+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}export{i as default};
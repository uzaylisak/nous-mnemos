# Nous Mnemos

> *Talk to a Nous AI. Seal the conversation forever on Base. Anyone can verify it. Only you can read it.*

**Live →** [nous-mnemos.vercel.app](https://nous-mnemos.vercel.app)  
**Contract →** [0x31F20E2a1882c85c2355CE269152C7791159Bb8d](https://sepolia.basescan.org/address/0x31F20E2a1882c85c2355CE269152C7791159Bb8d) on Base Sepolia

---

## What is Nous Mnemos?

Nous Mnemos is a fully on-chain AI conversation recorder powered by the **[Nous Research](https://nousresearch.com)** inference API. Every conversation you have with a Nous model can be cryptographically sealed on the Base blockchain — permanently, immutably, and privately.

The conversation is encrypted with a key only your wallet can derive. The encrypted record lives on-chain forever. Anyone can verify the record was sealed at a specific time by a specific wallet — but only you can decrypt and read the contents.

---

## Powered by Nous Research

This project is built entirely on top of the **[Nous Research inference API](https://nousresearch.com)**, running models from the Hermes family:

| Model | Description |
|-------|-------------|
| `Hermes-3-Llama-3.1-70B` | Flagship instruction-following model |
| `Hermes-3-Llama-3.1-8B` | Lightweight, fast responses |
| `Hermes-2-Pro-Llama-3-8B` | Function calling & structured outputs |

Nous Research builds some of the most capable open-source language models in the world. Mnemos is a demonstration of what's possible when you combine Nous models with cryptographic provenance — giving AI conversations a permanent, verifiable identity.

→ [nousresearch.com](https://nousresearch.com)  
→ [Nous on X/Twitter](https://x.com/NousResearch)  
→ [Nous on Hugging Face](https://huggingface.co/NousResearch)

---

## Features

- **🤖 Chat with Nous AI** — Direct access to Nous Research models via your own API key (BYO-key, no middleman)
- **🔐 End-to-end encryption** — Conversations are encrypted with AES-GCM before leaving your browser. The key is derived from your wallet signature — nothing is ever stored in plaintext
- **⛓️ On-chain attestation** — Records are sealed on the `NousRecord` smart contract on Base Sepolia. Your wallet self-attests each record with a secp256k1 signature
- **✅ Public verifiability** — Anyone with the record ID can verify: the author wallet, the model used, the timestamp, and cryptographic hashes of the original content
- **🔑 Self-attestation model** — No trusted third party required. Your wallet signs the record digest directly — the contract verifies the signature on-chain
- **🌊 Streaming responses** — Real-time token streaming from Nous API via Server-Sent Events
- **📖 Conversation explorer** — Browse all on-chain records from any wallet address, with built-in cryptographic verification
- **🎭 Personas** — Create custom system prompts / AI personas for different use cases
- **📱 Fully client-side** — No backend required. All encryption, signing, and contract interaction happens in your browser

---

## How it works

```
User types a message
       │
       ▼
Nous Research API (Hermes model)
       │  streaming tokens
       ▼
Response rendered in browser
       │
       │  [user clicks "Seal"]
       ▼
1. keccak256 hashes computed for prompt + response
2. Encryption key derived: wallet.sign("Nous Mnemos — encryption key v1") → HKDF → AES-GCM key
3. Conversation encrypted and embedded on-chain (onchain:0x... in arweaveCid field)
4. Record digest computed (binds: contract address, chain ID, author, model, all hashes)
5. Wallet signs digest → self-attestation signature
6. NousRecord.seal() called → record anchored on Base Sepolia forever
```

The smart contract verifies that the signature was produced by the author's wallet. No external attester, no admin, no upgrade keys — just math.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Browser (client)                │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Chat UI  │  │pipeline.js│  │  contract.js │  │
│  │(React 18)│  │(encrypt, │  │ (ethers v6,  │  │
│  │          │◄─┤ hash,    ├─►│  NousRecord) │  │
│  │          │  │ sign)    │  │              │  │
│  └──────────┘  └────┬─────┘  └──────┬───────┘  │
│                     │               │          │
└─────────────────────┼───────────────┼──────────┘
                      │               │
                      ▼               ▼
              Nous Research API   Base Sepolia
              (Hermes models)    (NousRecord.sol)
```

No build step. No bundler. Pure HTML + Babel CDN + React 18 — loads instantly, works anywhere.

---

## Smart Contract

**`NousRecord.sol`** — deployed on Base Sepolia

```
Address:  0x31F20E2a1882c85c2355CE269152C7791159Bb8d
Network:  Base Sepolia (Chain ID: 84532)
License:  MIT
```

Key design decisions:
- **No upgrades, no pausing, no admin over records** — once sealed, a record is permanent
- **Self-attestation allowed** — the author's wallet can sign its own record without being in any registry
- **EIP-191 signatures** — standard `personal_sign` compatible with MetaMask, Coinbase Wallet, WalletConnect
- **Cross-chain replay protection** — digest binds `address(this)` + `block.chainid`
- **EIP-2 upper-s rejection** — prevents signature malleability

```solidity
function seal(
    bytes32 conversationId,
    string calldata model,
    bytes32 promptHash,
    bytes32 responseHash,
    bytes32 plaintextHash,
    bytes32 ciphertextHash,
    string calldata arweaveCid,
    bytes  calldata attesterSig
) external returns (uint256 id)
```

---

## Getting Started

### 1. Get a Nous API Key
Sign up at [nousresearch.com](https://nousresearch.com) and generate an inference API key.

### 2. Get testnet ETH
You need a small amount of Base Sepolia ETH for gas. The app's **Settings → Get testnet ETH** section links to free faucets:
- [Alchemy Faucet](https://www.alchemy.com/faucets/base-sepolia)
- [QuickNode Faucet](https://faucet.quicknode.com/base/sepolia)
- [Base Official Faucet](https://faucet.base.org)

> 0.01 test ETH is enough for hundreds of seal transactions.

### 3. Open the app
Go to [nous-mnemos.vercel.app](https://nous-mnemos.vercel.app) and follow the onboarding:
1. Connect your wallet (MetaMask, Coinbase Wallet, WalletConnect, etc.)
2. Switch to Base Sepolia network
3. Enter your Nous API key in Settings
4. Start chatting

### 4. Seal a conversation
After any conversation, click **Seal** to anchor it on-chain:
1. First wallet signature — derives your encryption key
2. Second wallet signature — self-attests the record
3. The conversation is encrypted, embedded on-chain, and sealed forever

---

## Project Structure

```
nous-mnemos/
├── ui_kits/web_app/        # Frontend (static site, no build step)
│   ├── index.html          # Entry point — CDN scripts, Babel transform
│   ├── pipeline.js         # Core logic: hashing, encryption, API calls, sealing
│   ├── contract.js         # Ethers v6 wrapper for NousRecord.sol
│   ├── App.jsx             # Router, wallet context
│   ├── Chat.jsx            # Chat interface + seal flow
│   ├── Explorer.jsx        # On-chain record browser + verifier
│   ├── Settings.jsx        # API key, faucets, preferences
│   └── ...                 # Other pages
├── contracts/
│   ├── src/NousRecord.sol  # The smart contract
│   ├── scripts/deploy.js   # Hardhat deploy → writes nousRecordDeployment.json
│   └── hardhat.config.js
└── vercel.json             # Vercel static deployment config
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18 (via Babel CDN), no bundler |
| Styling | CSS custom properties, glassmorphism |
| Wallet | ethers.js v6, EIP-1193 |
| Encryption | Web Crypto API — AES-GCM + HKDF |
| Hashing | keccak256 (ethers.js) |
| LLM | Nous Research Hermes (OpenAI-compatible API) |
| Blockchain | Base Sepolia (EVM) |
| Contract | Solidity ^0.8.24, Hardhat |
| Hosting | Vercel (static) |

---

## License

MIT — do whatever you want with it.

---

<p align="center">
  Built with <a href="https://nousresearch.com">Nous Research</a> · Sealed on <a href="https://base.org">Base</a>
</p>

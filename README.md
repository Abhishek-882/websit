# Websit — Ban-Proof Lightweight Solana Token Discovery Platform

A lightweight, ban-proof token radar focused on **5 core metrics**:
1. **Market Cap**: Real-time valuation from DexScreener free tier with instant range filters & presets.
2. **Age**: Token pair launch age (`12m`, `1h 30m`, `1d`) with instant presets.
3. **Smart Money**: Official GMGN smart wallet count — **STRICTLY active holders holding ≥ $50 USD value** (excludes sold out / dust).
4. **KOL**: Official GMGN renowned influencer count — **STRICTLY active holders holding ≥ $50 USD value** (excludes dumped).
5. **Fund in Dev**: Dev wallet live SOL balance via Solana RPC, CEX funding origin (`Binance`, `Bybit`, `FixedFloat`, etc.), and dev status (`Holding`, `Dumped 100%`, `CTO`).

---

## 🛡️ Anti-Ban Architecture
- **Stage 1 (DexScreener Discovery & Pre-Filter)**: Queries DexScreener (300 req/min, 0 API key required) and filters out dead/low-liquidity (&lt; $1k) pairs upfront.
- **Stage 2 (GMGN Key Pool Enrichment)**: 5 API keys with Round-Robin arbitration, serialized **2,000ms inter-request delay**, and **+15s clock drift shield** (~2–4 tokens enriched per cycle).
- **Autonomous 60s Scanning**: Fully hands-free background scanner; no manual button that could risk IP bans.
- **100% In-Memory Client Filtering**: Instant panel filters (&lt;1ms) with 0 API calls on filter changes.
- **Anti-Spam Toast Alerts**: Corner popup when a newly scanned token matches active user filters (max 1 popup per 8s, 30m deduplication cooldown per token, with audio chime & mute toggle).
- **Live Ticker**: Header displays real-time `● Live | Updated Xs ago` ticking continuously every second.
- **0% 3D Bloat**: Fast DOM rendering without heavy WebGL shaders or memory bloat.

---

## 🚀 Quickstart

### 1. Build and Run from Root
```bash
# Install dependencies
npm install --prefix backend
npm install --prefix frontend

# Build frontend and deploy to backend/public
npm run build

# Run unit and anti-ban tests
npm test

# Start production server
npm start
```

Access the dashboard at `http://localhost:3001`.

---

## 🧪 Testing
Run the comprehensive test suite verifying pacing, clock drift buffer, pre-filter, dev classification, and strict holder filtering:
```bash
npm test
```

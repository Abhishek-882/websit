# websit — Ban-Proof Lightweight Solana Token Discovery Platform

A lightweight, ban-proof token radar focused on the **5 core metrics**:
1. **Market Cap**: Real-time valuation with flexible range filters.
2. **Age**: Token launch age (`15m`, `1h 30m`, `12h`) with instant presets.
3. **Smart Money**: GMGN official smart degen count and smart wallet badges.
4. **KOL**: GMGN official renowned KOL count and influencer tags.
5. **Fund in Dev**: Dev wallet SOL balance, CEX funding origin (`Binance`, `FixedFloat`, `Bybit`, etc.), and dev sold/holding status.

---

## 🛡️ Anti-Ban Architecture
- **DexScreener-First Discovery**: Zero API key required, 300 req/min for candidate discovery and prices.
- **Strict GMGN Key Pool**: 5 API keys with Round-Robin arbitration, serialized **2,000ms inter-request pacing**, and **+15s clock drift safety buffer**.
- **Aggressive Caching**: 5–10 minute in-memory caching ensures that all user filter tweaks execute in `<1ms` with **0 external API calls**.
- **Relaxed Scan Cadence**: 60s–90s scan interval, enriching at most 5–10 tokens per cycle (~2–3 GMGN calls/min total).
- **0% 3D Bloat**: Stripped of heavy 3D canvases, Three.js shaders, and complex bytecode dumps for instant page loads.

---

## 🚀 Quickstart

### Prerequisites
- Node.js >= 18
- npm

### 1. Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Build Frontend
```bash
cd frontend
npm run build
```

### 3. Run Production Server
```bash
cd ../backend
npm start
```
The platform will be live at `http://localhost:3001`.

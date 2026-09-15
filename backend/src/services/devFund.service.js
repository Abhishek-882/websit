import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';

const KNOWN_CEX_SIGNATURES = [
  { match: 'binance', name: 'Binance' },
  { match: 'bybit', name: 'Bybit' },
  { match: 'coinbase', name: 'Coinbase' },
  { match: 'fixedfloat', name: 'FixedFloat' },
  { match: 'changenow', name: 'ChangeNOW' },
  { match: 'okx', name: 'OKX' },
  { match: 'gate', name: 'Gate.io' },
  { match: 'kucoin', name: 'KuCoin' },
  { match: 'mexc', name: 'MEXC' },
  { match: 'kraken', name: 'Kraken' },
  { match: 'htx', name: 'HTX' },
];

export class DevFundService {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
    this.devCache = new Map(); // devAddress -> { devBalanceSol, cachedAt }
    this.cacheTtlMs = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Parse human-readable CEX or funding wallet label
   */
  classifyFundingSource(rawSource, rawAmount) {
    if (!rawSource) return { source: 'Unknown', isCex: false, amountSol: null };

    const lower = String(rawSource).toLowerCase();
    const matchedCex = KNOWN_CEX_SIGNATURES.find(c => lower.includes(c.match));

    let parsedAmount = null;
    if (rawAmount) {
      const num = parseFloat(rawAmount);
      if (!isNaN(num) && num > 0) parsedAmount = Math.round(num * 100) / 100;
    }

    if (matchedCex) {
      return {
        source: matchedCex.name,
        isCex: true,
        amountSol: parsedAmount,
      };
    }

    // If it's a Solana address, truncate it
    if (rawSource.length >= 32) {
      return {
        source: `${rawSource.slice(0, 4)}...${rawSource.slice(-4)}`,
        isCex: false,
        amountSol: parsedAmount,
      };
    }

    return {
      source: rawSource,
      isCex: false,
      amountSol: parsedAmount,
    };
  }

  /**
   * Fetch live on-chain balance for developer Solana address.
   * Multi-RPC failover across publicnode, official mainnet, and ankr.
   */
  async getDevSolBalance(devAddress) {
    if (!devAddress) return null;

    const cached = this.devCache.get(devAddress);
    if (cached && (Date.now() - cached.cachedAt) < this.cacheTtlMs) {
      return cached.devBalanceSol;
    }

    const RPCS = [
      RPC_URL,
      'https://solana-rpc.publicnode.com',
      'https://api.mainnet-beta.solana.com',
      'https://rpc.ankr.com/solana',
    ];

    for (const rpc of RPCS) {
      try {
        const resp = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [devAddress, { commitment: 'confirmed' }],
          }),
          signal: AbortSignal.timeout(4000),
        });

        if (resp.ok) {
          const data = await resp.json();
          const lamports = data?.result?.value;
          if (typeof lamports === 'number') {
            const sol = Math.round((lamports / 1e9) * 1000) / 1000;
            this.devCache.set(devAddress, { devBalanceSol: sol, cachedAt: Date.now() });
            return sol;
          }
        }
      } catch {
        // Try next RPC in pool
      }
    }

    // Secondary fallback via Connection
    try {
      if (this.connection) {
        const pubkey = new PublicKey(devAddress);
        const lamports = await this.connection.getBalance(pubkey);
        const sol = Math.round((lamports / 1e9) * 1000) / 1000;
        this.devCache.set(devAddress, { devBalanceSol: sol, cachedAt: Date.now() });
        return sol;
      }
    } catch {
      // Fallback
    }

    return null;
  }

  /**
   * Enrich dev funding & net-worth data from GMGN dev telemetry + on-chain balance
   */
  async resolveDevFund(gmgnDevInfo, coinDevAddress = null, solPriceUsd = 150) {
    const devAddress = gmgnDevInfo?.creator_address || gmgnDevInfo?.address || coinDevAddress || null;
    const rawFundFrom = gmgnDevInfo?.fund_from || null;
    const rawFundAmount = gmgnDevInfo?.fund_amount || null;

    const funding = this.classifyFundingSource(rawFundFrom, rawFundAmount);
    const solBalance = devAddress ? await this.getDevSolBalance(devAddress) : null;
    const devBalanceUsd = solBalance !== null ? Math.round(solBalance * solPriceUsd) : (funding.amountSol ? Math.round(funding.amountSol * solPriceUsd) : null);

    const creatorStatus = String(gmgnDevInfo?.creator_token_status || '').toLowerCase();
    const isDumped = creatorStatus.includes('close') || creatorStatus.includes('dump') || creatorStatus.includes('sold') || creatorStatus === 'creator_close';
    const isCto = Boolean(gmgnDevInfo?.cto_flag);

    let statusLabel = 'Holding';
    if (isCto) {
      statusLabel = 'CTO';
    } else if (isDumped) {
      statusLabel = 'Dumped 100%';
    }

    return {
      devAddress,
      devBalanceSol: solBalance,
      devBalanceUsd: devBalanceUsd,
      fundingSource: funding.source,
      isCexFunded: funding.isCex,
      fundingAmountSol: funding.amountSol,
      fundingDisplay: funding.amountSol ? `${funding.source} (${funding.amountSol} SOL)` : funding.source,
      devStatus: statusLabel,
      isDumped,
      isCto,
    };
  }
}

export const devFundService = new DevFundService();

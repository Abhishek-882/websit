import { Connection, PublicKey } from '@solana/web3.js';
import { solscanService } from './solscan.service.js';

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
    this.mintToCreatorCache = new Map(); // mintAddress -> { creatorAddress, cachedAt }
    this.cacheTtlMs = 15 * 60 * 1000; // 15 minutes
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
   * Resolve true on-chain creator / fee-payer wallet directly from token mint creation tx.
   * Eliminates any dependency on GMGN for developer address discovery.
   */
  async resolveCreatorFromMint(mintAddress) {
    if (!mintAddress || typeof mintAddress !== 'string') return null;

    const cached = this.mintToCreatorCache.get(mintAddress);
    if (cached && (Date.now() - cached.cachedAt) < this.cacheTtlMs) {
      return cached.creatorAddress;
    }

    const RPCS = [
      RPC_URL,
      'https://solana-rpc.publicnode.com',
      'https://api.mainnet-beta.solana.com',
    ];

    for (const rpc of RPCS) {
      try {
        // 1. Get earliest signatures for mint address
        const sigResp = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [mintAddress, { limit: 50 }],
          }),
          signal: AbortSignal.timeout(4000),
        });

        if (!sigResp.ok) continue;
        const sigData = await sigResp.json();
        const sigs = sigData?.result;
        if (!Array.isArray(sigs) || sigs.length === 0) continue;

        // Earliest available tx in signature window
        const oldestSig = sigs[sigs.length - 1].signature;

        // 2. Fetch parsed transaction to extract creation signer / fee payer
        const txResp = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'getTransaction',
            params: [oldestSig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
          }),
          signal: AbortSignal.timeout(4000),
        });

        if (!txResp.ok) continue;
        const txData = await txResp.json();
        const txResult = txData?.result;
        
        let creator = null;

        // Extract from transaction accountKeys (signer 0 is standard fee payer / creator)
        const accountKeys = txResult?.transaction?.message?.accountKeys;
        if (Array.isArray(accountKeys) && accountKeys.length > 0) {
          const firstKey = accountKeys[0];
          creator = typeof firstKey === 'string' ? firstKey : (firstKey?.pubkey || null);
        }

        // Validate creator is not the mint address itself
        if (creator && creator !== mintAddress && creator.length >= 32 && creator.length <= 44) {
          this.mintToCreatorCache.set(mintAddress, { creatorAddress: creator, cachedAt: Date.now() });
          return creator;
        }
      } catch {
        // Failover to next RPC
      }
    }

    return null;
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
   * Enrich dev funding & net-worth data from GMGN dev telemetry + on-chain balance.
   * GUARANTEE: Never treats the token mint address as the developer wallet.
   */
  async resolveDevFund(gmgnDevInfo = {}, mintAddress = null, solPriceUsd = 145) {
    let devAddress = gmgnDevInfo?.creator_address || gmgnDevInfo?.creator || null;

    // Reject if devAddress is mistakenly equal to the token mint
    if (devAddress && mintAddress && devAddress === mintAddress) {
      devAddress = null;
    }

    // If GMGN did not supply a creator address, resolve on-chain via Solana RPC
    if (!devAddress && mintAddress) {
      devAddress = await this.resolveCreatorFromMint(mintAddress);
    }

    // Audit dev funds via Solscan API when devAddress is available
    let solscanData = null;
    if (devAddress) {
      try {
        solscanData = await solscanService.checkDevFunds(devAddress);
      } catch {
        // Handled gracefully
      }
    }

    const rawFundFrom = solscanData?.fundingFrom || gmgnDevInfo?.fund_from || null;
    const rawFundAmount = solscanData?.fundingAmountSol || gmgnDevInfo?.fund_amount || null;

    const funding = this.classifyFundingSource(rawFundFrom, rawFundAmount);
    
    // Prefer Solscan/RPC verified balance
    let solBalance = (solscanData && typeof solscanData.devBalanceSol === 'number')
      ? solscanData.devBalanceSol
      : (devAddress ? await this.getDevSolBalance(devAddress) : null);
    
    // Compute USD balance from live on-chain SOL or CEX funding amount
    let devBalanceUsd = null;
    if (solBalance !== null && solBalance > 0) {
      devBalanceUsd = Math.round(solBalance * solPriceUsd);
    } else if (funding.amountSol && funding.amountSol > 0) {
      devBalanceUsd = Math.round(funding.amountSol * solPriceUsd);
    } else if (solBalance === 0) {
      devBalanceUsd = 0;
    }

    const creatorStatus = String(gmgnDevInfo?.creator_token_status || '').toLowerCase();
    const isDumped = creatorStatus.includes('close') || creatorStatus.includes('dump') || creatorStatus.includes('sold') || creatorStatus === 'creator_close';
    const isCto = Boolean(gmgnDevInfo?.cto_flag);

    let statusLabel = 'Holding';
    if (isCto) {
      statusLabel = 'CTO';
    } else if (isDumped) {
      statusLabel = 'Dumped 100%';
    }

    const fundingDisplay = funding.amountSol
      ? `${funding.source} (${funding.amountSol} SOL)`
      : (funding.source !== 'Unknown' ? funding.source : (devAddress ? `${devAddress.slice(0, 4)}...${devAddress.slice(-4)}` : 'Direct'));

    return {
      devAddress,
      devBalanceSol: solBalance,
      devBalanceUsd,
      fundingSource: funding.source !== 'Unknown' ? funding.source : (devAddress ? `${devAddress.slice(0, 4)}...${devAddress.slice(-4)}` : 'Direct'),
      isCexFunded: funding.isCex,
      fundingAmountSol: funding.amountSol,
      fundingDisplay,
      devStatus: statusLabel,
      isDumped,
      isCto,
      solscanUrl: devAddress ? `https://solscan.io/account/${devAddress}` : null,
      solscanVerified: Boolean(solscanData?.isVerified),
    };
  }
}

export const devFundService = new DevFundService();

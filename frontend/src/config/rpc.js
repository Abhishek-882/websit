import { Connection } from '@solana/web3.js';

// RPC endpoint configuration — separated from main.jsx to avoid circular imports

// Support optional user-provided RPC via environment variable
const USER_RPC = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOLANA_RPC_URL)
  ? import.meta.env.VITE_SOLANA_RPC_URL
  : '';

// Verified browser-friendly public Solana Mainnet RPCs (free, permissive CORS: *)
export const PUBLIC_NODE_RPC = 'https://solana-rpc.publicnode.com';
export const PUBLIC_NODE_ALT = 'https://solana.publicnode.com';
export const PUBLIC_RPC = PUBLIC_NODE_RPC;

// Ordered fallback list for browser client:
// 1. User-configured RPC (e.g. Helius/QuickNode/Triton)
// 2. Verified PublicNode endpoints (permissive CORS, fast response)
export const RPC_ENDPOINTS = [
  ...(USER_RPC ? [USER_RPC] : []),
  PUBLIC_NODE_RPC,
  PUBLIC_NODE_ALT,
];

export const PRIMARY_ENDPOINT = RPC_ENDPOINTS[0];

export const CONNECTION_CONFIG = {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
};

/**
 * Fetch the latest blockhash with multi-tier fallback resilience:
 * Tier 1: Same-origin backend gateway (/api/rpc/blockhash, <15ms, 0 CORS risk)
 * Tier 2: Direct browser connections to PublicNode pool
 */
export async function getRecentBlockhashWithFallback(preferredConn = null) {
  // 1. Try Backend Gateway (<15ms, pre-cached, zero CORS or key leakage)
  try {
    const res = await fetch('/api/rpc/blockhash');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.blockhash) {
        return {
          blockhash: data.blockhash,
          lastValidBlockHeight: data.lastValidBlockHeight,
          connection: preferredConn || new Connection(PUBLIC_NODE_RPC, 'confirmed'),
        };
      }
    }
  } catch (err) {
    console.warn('[RPC Gateway] Proxy blockhash unavailable, falling back to direct RPC:', err.message);
  }

  // 2. Direct Browser Client Pool Fallback
  const candidateConnections = [];
  if (preferredConn && preferredConn.rpcEndpoint) {
    candidateConnections.push(preferredConn);
  }
  for (const ep of [PUBLIC_NODE_RPC, PUBLIC_NODE_ALT]) {
    if (!preferredConn || ep !== preferredConn.rpcEndpoint) {
      candidateConnections.push(new Connection(ep, 'confirmed'));
    }
  }

  let lastError = null;
  for (const conn of candidateConnections) {
    try {
      const res = await Promise.race([
        conn.getLatestBlockhash('confirmed'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout (5s)')), 5000))
      ]);
      if (res && res.blockhash) {
        return {
          blockhash: res.blockhash,
          lastValidBlockHeight: res.lastValidBlockHeight,
          connection: conn,
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[RPC Fallback] Blockhash failed on ${conn.rpcEndpoint}:`, err.message);
    }
  }
  throw new Error(`Failed to get recent blockhash across all RPC endpoints: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Confirm transaction across available RPC endpoints.
 */
export async function confirmTransactionWithFallback(signature, blockhash, lastValidBlockHeight, preferredConn = null) {
  const candidateConnections = [];
  if (preferredConn && preferredConn.rpcEndpoint) {
    candidateConnections.push(preferredConn);
  }
  for (const ep of [PUBLIC_NODE_RPC, PUBLIC_NODE_ALT]) {
    if (!preferredConn || ep !== preferredConn.rpcEndpoint) {
      candidateConnections.push(new Connection(ep, 'confirmed'));
    }
  }

  let lastError = null;
  for (const conn of candidateConnections) {
    try {
      const confirmPromise = blockhash && lastValidBlockHeight
        ? conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
        : conn.confirmTransaction(signature, 'confirmed');

      const res = await Promise.race([
        confirmPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Confirmation timeout (15s)')), 15000))
      ]);
      if (res?.value?.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(res.value.err)}`);
      }
      return res;
    } catch (err) {
      lastError = err;
      console.warn(`[RPC Fallback] Confirm failed on ${conn.rpcEndpoint}:`, err.message);
    }
  }
  throw new Error(`Transaction confirmation failed across endpoints: ${lastError?.message || 'Timeout'}`);
}

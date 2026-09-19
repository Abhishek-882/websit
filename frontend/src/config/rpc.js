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
 * Confirm transaction using canonical signature status polling.
 * Eliminates false-positive "Signature has expired: block height exceeded" errors.
 */
export async function confirmTransactionWithFallback(signature, preferredConn = null, maxTimeoutMs = 30000) {
  const candidateConnections = [];
  if (preferredConn && preferredConn.rpcEndpoint) {
    candidateConnections.push(preferredConn);
  }
  for (const ep of [PUBLIC_NODE_RPC, PUBLIC_NODE_ALT]) {
    if (!preferredConn || ep !== preferredConn.rpcEndpoint) {
      candidateConnections.push(new Connection(ep, 'confirmed'));
    }
  }

  const startTime = Date.now();

  while (Date.now() - startTime < maxTimeoutMs) {
    for (const conn of candidateConnections) {
      try {
        const res = await conn.getSignatureStatuses([signature]);
        const status = res?.value?.[0];
        if (status) {
          if (status.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            return { signature, status: status.confirmationStatus };
          }
        }
      } catch (err) {
        if (err.message?.includes('Transaction failed on-chain')) {
          throw err;
        }
        // Ignore network timeouts while polling
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  return null;
}

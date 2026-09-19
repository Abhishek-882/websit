import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * RpcProxyService
 * Production-grade RPC gateway providing:
 * 1. Connection pooling with circuit-breaking failover.
 * 2. In-memory caching for blockhash (1.5s) and balances (3.0s).
 * 3. Whitelisted JSON-RPC forwarding for browser clients to eliminate CORS/401/403 errors.
 */
export class RpcProxyService {
  constructor() {
    this.endpoints = [
      process.env.SOLANA_RPC_URL,
      'https://solana-rpc.publicnode.com',
      'https://solana.publicnode.com',
      'https://api.mainnet-beta.solana.com',
    ].filter(Boolean);

    this.connections = this.endpoints.map(ep => ({
      url: ep,
      conn: new Connection(ep, { commitment: 'confirmed' }),
      failCount: 0,
      unhealthyUntil: 0,
    }));

    this.cachedBlockhash = null;
    this.blockhashExpiresAt = 0;
    this.balanceCache = new Map(); // address -> { balanceSol, lamports, expiresAt }
  }

  /**
   * Get the first currently healthy connection in the pool.
   */
  getHealthyConnection() {
    const now = Date.now();
    for (const item of this.connections) {
      if (item.unhealthyUntil <= now) return item;
    }
    // If all connections are flagged unhealthy, reset circuit breakers and use primary
    this.connections.forEach(c => {
      c.unhealthyUntil = 0;
      c.failCount = 0;
    });
    return this.connections[0];
  }

  /**
   * Get latest blockhash with 1.5s caching and automatic failover.
   */
  async getLatestBlockhash() {
    const now = Date.now();
    if (this.cachedBlockhash && now < this.blockhashExpiresAt) {
      return { ...this.cachedBlockhash, cached: true };
    }

    const item = this.getHealthyConnection();
    try {
      const res = await item.conn.getLatestBlockhash('confirmed');
      this.cachedBlockhash = {
        blockhash: res.blockhash,
        lastValidBlockHeight: res.lastValidBlockHeight,
      };
      this.blockhashExpiresAt = now + 1500;
      return { ...this.cachedBlockhash, cached: false };
    } catch (err) {
      item.failCount++;
      item.unhealthyUntil = now + 30000;
      // Failover to next healthy connection
      const fallback = this.getHealthyConnection();
      const res = await fallback.conn.getLatestBlockhash('confirmed');
      this.cachedBlockhash = {
        blockhash: res.blockhash,
        lastValidBlockHeight: res.lastValidBlockHeight,
      };
      this.blockhashExpiresAt = now + 1500;
      return { ...this.cachedBlockhash, cached: false };
    }
  }

  /**
   * Get wallet balance with 3.0s caching and failover.
   */
  async getBalance(address) {
    if (!address) throw new Error('Address is required');
    const pubkey = new PublicKey(address);
    const now = Date.now();

    const cached = this.balanceCache.get(address);
    if (cached && now < cached.expiresAt) {
      return { balanceSol: cached.balanceSol, lamports: cached.lamports, cached: true };
    }

    const item = this.getHealthyConnection();
    try {
      const lamports = await item.conn.getBalance(pubkey);
      const balanceSol = lamports / LAMPORTS_PER_SOL;
      this.balanceCache.set(address, { balanceSol, lamports, expiresAt: now + 3000 });
      return { balanceSol, lamports, cached: false };
    } catch (err) {
      item.failCount++;
      item.unhealthyUntil = now + 30000;
      const fallback = this.getHealthyConnection();
      const lamports = await fallback.conn.getBalance(pubkey);
      const balanceSol = lamports / LAMPORTS_PER_SOL;
      this.balanceCache.set(address, { balanceSol, lamports, expiresAt: now + 3000 });
      return { balanceSol, lamports, cached: false };
    }
  }

  /**
   * Forward a whitelisted JSON-RPC request to the Solana cluster.
   */
  async forwardJsonRpc(body) {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid JSON-RPC request payload');
    }

    const ALLOWED_METHODS = new Set([
      'getLatestBlockhash',
      'getBalance',
      'getAccountInfo',
      'getTokenAccountsByOwner',
      'getSignatureStatuses',
      'sendTransaction',
      'simulateTransaction',
      'getFeeForMessage',
      'getBlockHeight',
      'getSlot',
    ]);

    if (!ALLOWED_METHODS.has(body.method)) {
      throw new Error(`RPC method ${body.method} is not permitted through gateway`);
    }

    const item = this.getHealthyConnection();
    const res = await fetch(item.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Upstream RPC returned HTTP ${res.status}: ${res.statusText}`);
    }

    return res.json();
  }
}

export const rpcProxyService = new RpcProxyService();

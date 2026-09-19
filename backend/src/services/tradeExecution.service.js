import axios from 'axios';
import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';

export const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

export const JITO_BLOCK_ENGINES = [
  'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
];

export class TradeExecutionService {
  constructor() {
    this.tipFloorCache = null;
    this.tipFloorCacheTime = 0;
    this.tipCacheTtlMs = 10000; // 10 seconds
  }

  async getTipFloor() {
    const now = Date.now();
    if (this.tipFloorCache && (now - this.tipFloorCacheTime < this.tipCacheTtlMs)) {
      return this.tipFloorCache;
    }

    try {
      const res = await axios.get('https://bundles.jito.wtf/api/v1/bundles/tip_floor', { timeout: 3000 });
      if (Array.isArray(res.data) && res.data.length > 0) {
        this.tipFloorCache = res.data[0];
        this.tipFloorCacheTime = now;
        return this.tipFloorCache;
      }
    } catch (err) {
      // Fallback floor
    }

    return this.tipFloorCache || {
      landed_tips_50th_percentile: 0.000005,
      landed_tips_95th_percentile: 0.00005,
      landed_tips_99th_percentile: 0.0001,
    };
  }

  async calculateDynamicTip(tradeSizeSol = 0.1, jitoTier = 'fast') {
    const floor = await this.getTipFloor();
    const p50 = floor.landed_tips_50th_percentile || 0.00005;
    const p99 = floor.landed_tips_99th_percentile || 0.0001;
    const maxTip = Math.min(0.01, tradeSizeSol * 0.05);

    let baseTip;
    if (jitoTier === 'medium') {
      // Medium: use p50 floor — cheaper, still lands most bundles
      baseTip = Math.max(0.00001, Math.min(maxTip, p50 * 1.1));
    } else {
      // Fast (default): use p99 floor x 1.15 — highest priority
      baseTip = Math.max(0.00002, Math.min(maxTip, p99 * 1.15));
    }

    return {
      tipSol: baseTip,
      tipLamports: Math.floor(baseTip * LAMPORTS_PER_SOL),
      p50,
      p99,
      tier: jitoTier,
    };
  }

  getRandomTipAccount() {
    const idx = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
    return new PublicKey(JITO_TIP_ACCOUNTS[idx]);
  }

  async execute({ connection, tx, keypair, tradeSizeSol = 0.1, useJito = true, jitoTier = 'fast' }) {
    const t0 = Date.now();

    if (useJito) {
      try {
        const { tipSol, tipLamports } = await this.calculateDynamicTip(tradeSizeSol, jitoTier);
        const tipAccount = this.getRandomTipAccount();

        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        const tipInstruction = SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: tipAccount,
          lamports: tipLamports,
        });

        const tipMsg = new TransactionMessage({
          payerKey: keypair.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: [tipInstruction],
        }).compileToV0Message();

        const tipTx = new VersionedTransaction(tipMsg);
        tipTx.sign([keypair]);

        const bundleTxs = [
          Buffer.from(tx.serialize()).toString('base64'),
          Buffer.from(tipTx.serialize()).toString('base64'),
        ];

        const engineUrl = JITO_BLOCK_ENGINES[Math.floor(Math.random() * JITO_BLOCK_ENGINES.length)];
        const res = await axios.post(
          engineUrl,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'sendBundle',
            params: [bundleTxs],
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000,
          }
        );

        const bundleId = res.data?.result;
        if (bundleId) {
          const elapsed = Date.now() - t0;
          const rawSig = tx.signatures[0];
          const sig = bs58.encode(rawSig);

          console.log(`[Trade Execution] ⚡ Jito bundle landed in ${elapsed}ms (tx: ${sig.slice(0, 10)}..., tip: ${tipSol.toFixed(6)} SOL)`);

          connection.confirmTransaction(
            { signature: sig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
            'confirmed'
          ).catch(() => {});

          return {
            success: true,
            method: 'jito_bundle',
            txSignature: sig,
            bundleId,
            tipSol,
            latencyMs: elapsed,
          };
        }
      } catch (jitoErr) {
        console.warn(`[Trade Execution] Jito fallback triggered: ${jitoErr.message}`);
      }
    }

    // Fallback: Standard RPC
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    const elapsed = Date.now() - t0;
    console.log(`[Trade Execution] Standard RPC landed in ${elapsed}ms (tx: ${sig.slice(0, 10)}...)`);

    connection.confirmTransaction(sig, 'confirmed').catch(() => {});

    return {
      success: true,
      method: 'standard_rpc',
      txSignature: sig,
      latencyMs: elapsed,
    };
  }
}

export const tradeExecutionService = new TradeExecutionService();

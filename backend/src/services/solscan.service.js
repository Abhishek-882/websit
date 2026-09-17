import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjcmVhdGVkQXQiOjE3NTcwNDgxOTIzMjksImVtYWlsIjoidmFyc2hhOTk2MzNAZ21haWwuY29tIiwiYWN0aW9uIjoidG9rZW4tYXBpIiwiYXBpVmVyc2lvbiI6InYyIiwiaWF0IjoxNzU3MDQ4MTkyfQ.jswPNZNilb8Iasj88YnTU8DMwiFHVcxHxKQ2sCKVi98';

export class SolscanService {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
    this.cache = new Map(); // address -> { data, cachedAt }
    this.cacheTtlMs = 15 * 60 * 1000;
  }

  /**
   * Check dev wallet funds via Solscan API with automated on-chain RPC fallback
   */
  async checkDevFunds(devAddress) {
    if (!devAddress || typeof devAddress !== 'string' || devAddress.length < 32) {
      return null;
    }

    const cached = this.cache.get(devAddress);
    if (cached && (Date.now() - cached.cachedAt) < this.cacheTtlMs) {
      return cached.data;
    }

    // 1. Try Solscan Pro v2 API account detail
    let solscanResult = null;
    if (SOLSCAN_API_KEY) {
      try {
        const detailUrl = `https://pro-api.solscan.io/v2.0/account/detail?address=${devAddress}`;
        const res = await axios.get(detailUrl, {
          headers: {
            'Accept': 'application/json',
            'token': SOLSCAN_API_KEY,
          },
          timeout: 4000,
        });

        if (res.status === 200 && res.data?.success && res.data?.data) {
          const acc = res.data.data;
          const lamports = Number(acc.lamports || acc.balance || 0);
          const sol = Math.round((lamports / 1e9) * 1000) / 1000;
          solscanResult = {
            source: 'solscan',
            devBalanceSol: sol,
            devAddress,
            accountType: acc.type || 'system_account',
            isVerified: true,
          };
        }
      } catch (err) {
        // Solscan unauthorized or rate limited -> proceed to transfers or RPC
      }

      // Try Solscan transfers for funding origin
      try {
        const transferUrl = `https://pro-api.solscan.io/v2.0/account/transfer?address=${devAddress}&page_size=10`;
        const res = await axios.get(transferUrl, {
          headers: {
            'Accept': 'application/json',
            'token': SOLSCAN_API_KEY,
          },
          timeout: 4000,
        });

        if (res.status === 200 && res.data?.success && Array.isArray(res.data?.data)) {
          const transfers = res.data.data;
          for (const tr of transfers) {
            const to = tr.to_address || tr.dst;
            const from = tr.from_address || tr.src;
            const amt = (parseFloat(tr.amount || 0)) / (tr.decimals ? Math.pow(10, tr.decimals) : 1e9);

            if (to === devAddress && from !== devAddress && amt >= 0.1) {
              solscanResult = {
                ...(solscanResult || { source: 'solscan', devAddress }),
                fundingFrom: from,
                fundingAmountSol: Math.round(amt * 100) / 100,
              };
              break;
            }
          }
        }
      } catch {
        // Ignore and fall through
      }
    }

    // 2. If Solscan API didn't yield full data, query Solana on-chain RPC
    if (!solscanResult || solscanResult.devBalanceSol === undefined) {
      try {
        const pubkey = new PublicKey(devAddress);
        const lamports = await this.connection.getBalance(pubkey);
        const sol = Math.round((lamports / 1e9) * 1000) / 1000;
        solscanResult = {
          source: solscanResult ? 'solscan+rpc' : 'solana_rpc',
          devAddress,
          devBalanceSol: sol,
          fundingFrom: solscanResult?.fundingFrom || null,
          fundingAmountSol: solscanResult?.fundingAmountSol || null,
          isVerified: true,
        };
      } catch (rpcErr) {
        // Handled
      }
    }

    if (solscanResult) {
      this.cache.set(devAddress, { data: solscanResult, cachedAt: Date.now() });
    }

    return solscanResult;
  }
}

export const solscanService = new SolscanService();

import { OpenApiClient } from 'gmgn-cli/dist/client/OpenApiClient.js';

export const DEFAULT_GMGN_KEY_PAIRS = [
  {
    id: 1,
    apiKey: 'gmgn_53de6fb22b3fd814a80c1001f415c886',
    publicKey: 'MCowBQYDK2VwAyEA12NPsUQIAlkDfXaf1k22j5kJb6nRnRoL+Tj/ZfeR/LY=',
  },
  {
    id: 2,
    apiKey: 'gmgn_4d56d11c7331e1bc88d969efcf38f843',
    publicKey: 'MCowBQYDK2VwAyEAYy4yaFo7EtZp4BYJFBbXCXCE0jOJVO6LchQ1cFO3lAo=',
  },
  {
    id: 3,
    apiKey: 'gmgn_72c9409fdf75739774c4da90bace2f66',
    publicKey: 'MCowBQYDK2VwAyEANlPM/ts1h7VTDL/qd3KIH1OhnSZNwQViZq350TJI/FE=',
  },
  {
    id: 4,
    apiKey: 'gmgn_28c34d1605cb3007de11109744330e68',
    publicKey: 'MCowBQYDK2VwAyEA6+tDehKPvPU7opSubNWEJEaK8FI0OB5/FGr0E4nzzHw=',
  },
  {
    id: 5,
    apiKey: 'gmgn_d4afcd22dc05f611afd9cff4dc96a823',
    publicKey: 'MCowBQYDK2VwAyEAb19Dduxys0THMUn/X9VVsenbKa2CZZjIycs9VeEsu7Q=',
  },
];

export class GMGNKeyPool {
  constructor(customKeys = null) {
    this.host = 'https://openapi.gmgn.ai';
    this.keys = [];
    this.rrIndex = 0;
    this.globalRateLimitedUntil = 0;
    this.lastRequestTimestamp = 0;
    this.pacingDelayMs = 2000; // Strict 2,000ms delay between consecutive requests
    this._queueTail = Promise.resolve();
    this._initKeys(customKeys);
  }

  isAvailable() {
    const now = Date.now();
    return now >= this.globalRateLimitedUntil && this.keys.some(k => k.rateLimitedUntil <= now);
  }

  getCooldownRemainingSec() {
    const now = Date.now();
    if (now >= this.globalRateLimitedUntil) return 0;
    return Math.ceil((this.globalRateLimitedUntil - now) / 1000);
  }

  _initKeys(customKeys) {
    let keyList = customKeys && customKeys.length > 0 ? customKeys : DEFAULT_GMGN_KEY_PAIRS;

    if (process.env.GMGN_API_KEY && !keyList.some(k => k.apiKey === process.env.GMGN_API_KEY)) {
      keyList.unshift({
        id: 0,
        apiKey: process.env.GMGN_API_KEY,
        publicKey: null,
      });
    }

    this.keys = keyList.map(item => ({
      id: item.id,
      apiKey: item.apiKey,
      publicKey: item.publicKey || null,
      client: new OpenApiClient({
        apiKey: item.apiKey,
        host: this.host,
      }),
      rateLimitedUntil: 0,
      activeRequests: 0,
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      lastLatencyMs: 0,
      lastUsedAt: 0,
    }));

    console.log(`[GMGN Key Pool] Initialized with ${this.keys.length} rate-limit protected API clients (pacing: ${this.pacingDelayMs}ms).`);
  }

  acquireKey(excludeId = null) {
    const now = Date.now();
    const available = this.keys.filter(k => k.rateLimitedUntil <= now && k.id !== excludeId);

    if (available.length > 0) {
      const minActive = Math.min(...available.map(k => k.activeRequests));
      const leastActive = available.filter(k => k.activeRequests === minActive);
      const chosen = leastActive[this.rrIndex % leastActive.length];
      this.rrIndex = (this.rrIndex + 1) % 1000000;
      return chosen;
    }

    const candidates = excludeId ? this.keys.filter(k => k.id !== excludeId) : this.keys;
    if (candidates.length === 0) return this.keys[0];
    return [...candidates].sort((a, b) => a.rateLimitedUntil - b.rateLimitedUntil)[0];
  }

  async execute(operationName, fn, maxAttempts = 3) {
    const queueAction = async () => {
      const now = Date.now();
      if (now < this.globalRateLimitedUntil) {
        const remainingSec = Math.ceil((this.globalRateLimitedUntil - now) / 1000);
        throw new Error(`GMGN IP cooldown active (${remainingSec}s remaining)`);
      }

      // Enforce strict serialized pacing delay between consecutive requests
      const timeSinceLast = Date.now() - (this.lastRequestTimestamp || 0);
      if (timeSinceLast < this.pacingDelayMs) {
        await new Promise(r => setTimeout(r, this.pacingDelayMs - timeSinceLast));
      }
      this.lastRequestTimestamp = Date.now();

      let lastError = null;
      let excludedId = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const keyEntry = this.acquireKey(excludedId);
        keyEntry.activeRequests++;
        keyEntry.totalRequests++;
        keyEntry.lastUsedAt = Date.now();
        const t0 = Date.now();

        try {
          const result = await fn(keyEntry.client, keyEntry);
          const elapsed = Date.now() - t0;
          keyEntry.lastLatencyMs = elapsed;
          keyEntry.successCount++;
          keyEntry.activeRequests = Math.max(0, keyEntry.activeRequests - 1);
          return result;
        } catch (err) {
          const elapsed = Date.now() - t0;
          keyEntry.lastLatencyMs = elapsed;
          keyEntry.errorCount++;
          keyEntry.activeRequests = Math.max(0, keyEntry.activeRequests - 1);
          lastError = err;

          const isIpBan =
            err?.apiError === 'RATE_LIMIT_BANNED' ||
            (err?.message && (err.message.includes('RATE_LIMIT_BANNED') || err.message.includes('IP is temporarily banned')));

          if (isIpBan) {
            let waitMs = 45000;
            if (err?.resetAtUnix) {
              waitMs = Math.max((err.resetAtUnix * 1000) - Date.now() + 15000, 15000);
            } else if (err?.message) {
              const match = err.message.match(/~(\d+)s remaining/);
              if (match) {
                waitMs = (parseInt(match[1], 10) + 15) * 1000;
              }
            }
            this.globalRateLimitedUntil = Date.now() + waitMs;
            console.warn(
              `[GMGN Key Pool] IP rate-limit cooldown engaged until ${new Date(this.globalRateLimitedUntil).toLocaleTimeString()} (${Math.ceil(waitMs / 1000)}s).`
            );
            throw err;
          }

          const isRateLimit =
            err?.status === 429 ||
            err?.apiError === 'RATE_LIMIT_EXCEEDED' ||
            (err?.message && (err.message.includes('429') || err.message.includes('RATE_LIMIT')));

          if (isRateLimit) {
            const resetUnix = err?.resetAtUnix;
            const waitMs = resetUnix ? Math.max((resetUnix * 1000) - Date.now() + 10000, 10000) : 35000;
            keyEntry.rateLimitedUntil = Date.now() + waitMs;
            console.warn(
              `[GMGN Key Pool] Key #${keyEntry.id} rate-limited for ${Math.ceil(waitMs / 1000)}s during ${operationName}. Failing over to sibling key.`
            );
            excludedId = keyEntry.id;
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }

          throw err;
        }
      }

      throw lastError || new Error(`All attempts failed for ${operationName}`);
    };

    const currentPromise = this._queueTail.then(queueAction, queueAction);
    this._queueTail = currentPromise;
    return currentPromise;
  }

  /**
   * Fetches official GMGN token metadata containing:
   * - wallet_tags_stat (smart_wallets, renowned_wallets)
   * - dev (creator_address, creator_token_status, fund_from, fund_from_ts, cto_flag)
   * - creation_timestamp / open_timestamp
   * - price & total_supply
   */
  async getTokenInfo(chain, address) {
    return this.execute(`getTokenInfo(${address.slice(0, 6)})`, client =>
      client.getTokenInfo(chain, address)
    );
  }

  /**
   * Fetches top traders to inspect live holding balances:
   * - tr.usd_value (current holding value in USD)
   * - tr.sell_amount_percentage (percentage sold)
   * - tr.tags / tr.maker_token_tags (smart_degen, renowned, kol, etc.)
   */
  async getTokenTopTraders(chain, address, extra = { limit: 50 }) {
    return this.execute(`getTokenTopTraders(${address.slice(0, 6)})`, client =>
      client.getTokenTopTraders(chain, address, extra)
    );
  }

  getHealth() {
    const now = Date.now();
    return {
      available: this.isAvailable(),
      cooldownRemainingSec: this.getCooldownRemainingSec(),
      pacingDelayMs: this.pacingDelayMs,
      keys: this.keys.map(k => ({
        id: k.id,
        isAvailable: k.rateLimitedUntil <= now,
        rateLimitedUntil: k.rateLimitedUntil > now ? new Date(k.rateLimitedUntil).toISOString() : null,
        successCount: k.successCount,
        errorCount: k.errorCount,
        lastLatencyMs: k.lastLatencyMs,
      })),
    };
  }
}

export const gmgnKeyPool = new GMGNKeyPool();

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_BOT_CONFIG = {
  autoBuy: false,
  orderType: 'market', // 'market' | 'limit'
  isExact: false, // EXACT toggle
  limitDipPct: 20, // Fibonacci retracement spot (-10%, -20%, -30%, or custom %)
  buyAmountSol: 0.1,
  maxPositions: 5,
  slippageBps: 500,
  useJito: true,
  closingType: 'amount', // 'amount' | 'holding'
  advancedStrategyEnabled: true,
  strategyRules: [
    { id: '1', type: 'TP', triggerPct: 100, ddPct: 0, sellPct: 50 },
    { id: '2', type: 'TP DD', triggerPct: 100, ddPct: 20, sellPct: 50 },
    { id: '3', type: 'SL DD', triggerPct: 0, ddPct: 20, sellPct: 100 },
    { id: '4', type: 'SL', triggerPct: -50, ddPct: 0, sellPct: 100 },
  ],
  stopLossPct: -50,
  tpLevels: [
    { triggerPct: 50,  closePct: 50 },
    { triggerPct: 100, closePct: 30 },
    { triggerPct: 200, closePct: 20 },
  ],
};

export const useBotStore = create(
  persist(
    (set, get) => ({
      // Wallet
      connectedWallet: null,
      setConnectedWallet: (wallet) => set({ connectedWallet: wallet }),

      // Session Wallet
      sessionPubkey: null,
      sessionBalanceSol: 0,
      setSessionPubkey: (pk) => set({ sessionPubkey: pk }),
      setSessionBalance: (bal) => set({ sessionBalanceSol: bal }),

      // Bot Config
      botConfig: DEFAULT_BOT_CONFIG,
      setBotConfig: (config) => set({ botConfig: config }),
      updateBotConfig: (patch) => set(s => ({ botConfig: { ...s.botConfig, ...patch } })),
      updateTP: (idx, patch) => set(s => {
        const tpLevels = [...s.botConfig.tpLevels];
        tpLevels[idx] = { ...tpLevels[idx], ...patch };
        return { botConfig: { ...s.botConfig, tpLevels } };
      }),

      // Advanced Strategy Rules (GMGN Style)
      addStrategyRule: (rule) => set(s => ({
        botConfig: {
          ...s.botConfig,
          strategyRules: [
            ...(s.botConfig.strategyRules || []),
            rule || { id: String(Date.now()), type: 'TP', triggerPct: 100, ddPct: 0, sellPct: 50 }
          ]
        }
      })),
      removeStrategyRule: (idx) => set(s => ({
        botConfig: {
          ...s.botConfig,
          strategyRules: (s.botConfig.strategyRules || []).filter((_, i) => i !== idx)
        }
      })),
      updateStrategyRule: (idx, patch) => set(s => {
        const rules = [...(s.botConfig.strategyRules || [])];
        rules[idx] = { ...rules[idx], ...patch };
        return { botConfig: { ...s.botConfig, strategyRules: rules } };
      }),

      // Trades & Positions
      trades: [],
      setTrades: (trades) => set({ trades }),

      // Modals
      isBotModalOpen: false,
      setIsBotModalOpen: (isOpen) => set({ isBotModalOpen: isOpen }),
      isTradesModalOpen: false,
      setIsTradesModalOpen: (isOpen) => set({ isTradesModalOpen: isOpen }),
    }),
    {
      name: 'solana-bot-store',
      partialize: (s) => ({
        botConfig: s.botConfig,
        sessionPubkey: s.sessionPubkey,
      }),
    }
  )
);

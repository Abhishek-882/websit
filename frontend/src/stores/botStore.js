import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_BOT_CONFIG = {
  autoBuy: false,
  buyAmountSol: 0.1,
  maxPositions: 5,
  slippageBps: 500,
  useJito: true,
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

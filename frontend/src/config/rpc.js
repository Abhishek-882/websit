// RPC endpoint configuration — separated from main.jsx to avoid circular imports

export const HELIUS_FREE = 'https://mainnet.helius-rpc.com/?api-key=a0de82d8-cd9f-4eb3-b09b-f6527fe4f72a';
export const TRITON_FREE = 'https://solana-mainnet.rpc.extrnode.com';
export const PUBLIC_RPC  = 'https://api.mainnet-beta.solana.com';

// Ordered fallback list: fastest first, public RPC last resort
export const RPC_ENDPOINTS = [HELIUS_FREE, TRITON_FREE, PUBLIC_RPC];

export const PRIMARY_ENDPOINT = HELIUS_FREE;

export const CONNECTION_CONFIG = {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
};

export function isWalletAdapterCompatibleWallet(wallet) {
  return false;
}

export class StandardWalletAdapter {
  constructor({ wallet } = {}) {
    this.wallet = wallet;
    this.name = wallet?.name || 'StandardWallet';
  }
  destroy() {}
}

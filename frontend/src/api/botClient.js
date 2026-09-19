/**
 * Bot Client API
 * Connects frontend to backend /api/bot endpoints.
 */

async function request(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`/api/bot${path}`, {
    headers,
    ...options,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Bot API error');
  return data;
}

export const botApi = {
  createSession: (userWallet, botConfig) =>
    request('/session', {
      method: 'POST',
      body: JSON.stringify({ userWallet, botConfig }),
    }),

  importSession: (privateKey, userWallet) =>
    request('/session/import', {
      method: 'POST',
      body: JSON.stringify({ privateKey, userWallet }),
    }),

  reactivateSession: (sessionPubkey, userWallet) =>
    request('/session/reactivate', {
      method: 'POST',
      body: JSON.stringify({ sessionPubkey, userWallet }),
    }),

  getSession: (wallet) => request(`/session/${wallet || 'current'}`),

  deleteSession: (userWallet) =>
    request('/session/delete', {
      method: 'POST',
      body: JSON.stringify({ userWallet }),
    }),

  getSessionBackups: (wallet) => request(`/session/backups/${wallet}`),

  withdrawSession: (userWallet) =>
    request('/withdraw', {
      method: 'POST',
      body: JSON.stringify({ userWallet }),
    }),

  updateConfig: (userWallet, botConfig) =>
    request('/config', {
      method: 'POST',
      body: JSON.stringify({ userWallet, botConfig }),
    }),

  getConfig: (wallet) => request(`/config/${wallet}`),

  getTrades: (wallet) => request(`/trades/${wallet}`),

  exportKey: (userWallet, signature, message, sessionPubkey) =>
    request('/export-key', {
      method: 'POST',
      body: JSON.stringify({ userWallet, signature, message, sessionPubkey }),
    }),

  verifyDeposit: (userWallet, txSignature) =>
    request('/verify-deposit', {
      method: 'POST',
      body: JSON.stringify({ userWallet, txSignature }),
    }),

  manualBuy: (payload) =>
    request('/manual-buy', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  manualSell: (payload) =>
    request('/manual-sell', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSetFiles: (wallet) => request(`/set-files/${wallet}`),

  saveSetFile: (userWallet, setFile) =>
    request('/set-file', {
      method: 'POST',
      body: JSON.stringify({ userWallet, setFile }),
    }),

  deleteSetFile: (userWallet, id) =>
    request('/set-file', {
      method: 'DELETE',
      body: JSON.stringify({ userWallet, id }),
    }),

  activateSetFile: (userWallet, id) =>
    request('/set-file/activate', {
      method: 'POST',
      body: JSON.stringify({ userWallet, id }),
    }),

  deactivateSetFile: (userWallet) =>
    request('/set-file/deactivate', {
      method: 'POST',
      body: JSON.stringify({ userWallet }),
    }),
};

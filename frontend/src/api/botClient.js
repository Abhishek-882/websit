/**
 * Bot Client API
 * Connects frontend to backend /api/bot endpoints.
 */

async function request(path, options = {}) {
  const res = await fetch(`/api/bot${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
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

  getSession: (wallet) => request(`/session/${wallet}`),

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
};

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'local_db.json');

// In-memory local state backed by JSON file
let localDb = {
  trades: [],
  limit_orders: [],
  session_wallets: [],
  bot_configs: {},
  set_files: [],
  bought_tokens: [],
  users: [],
  auth_otps: []
};

function ensureLocalFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(LOCAL_DB_FILE)) {
    try {
      const content = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      localDb = { ...localDb, ...JSON.parse(content) };
      if (!Array.isArray(localDb.trades)) localDb.trades = [];
      if (!Array.isArray(localDb.limit_orders)) localDb.limit_orders = [];
      if (!Array.isArray(localDb.session_wallets)) localDb.session_wallets = [];
      if (!localDb.bot_configs) localDb.bot_configs = {};
      if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
      if (!Array.isArray(localDb.bought_tokens)) localDb.bought_tokens = [];
    } catch {
      // fresh file if corrupt
    }
  } else {
    saveLocalFile();
  }
}

function saveLocalFile() {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(localDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Error saving local DB:', err.message);
  }
}

export async function initializeDB() {
  ensureLocalFile();
  console.log(`✅ [DB] Local trading database initialized at: ${LOCAL_DB_FILE}`);
}

// ── Trade helpers ──────────────────────────────────────────────────

export async function recordTrade(trade) {
  ensureLocalFile();
  const id = localDb.trades.length + 1;
  const item = {
    id,
    ...trade,
    status: 'open',
    tp1_hit: false,
    tp2_hit: false,
    tp3_hit: false,
    created_at: new Date().toISOString(),
    closed_at: null,
  };
  localDb.trades.unshift(item);
  saveLocalFile();
  return item;
}

export async function hasBought(coinAddress, walletAddress) {
  ensureLocalFile();
  return localDb.trades.some(
    t => t.coin_address === coinAddress && t.wallet_address === walletAddress && t.status === 'open'
  );
}

export async function getTrades(walletAddress) {
  ensureLocalFile();
  return localDb.trades.filter(t => !walletAddress || t.wallet_address === walletAddress);
}

export async function updateTradeTP(tradeId, tpLevel) {
  ensureLocalFile();
  const item = localDb.trades.find(t => t.id === tradeId);
  if (item) {
    item[`tp${tpLevel}_hit`] = true;
    saveLocalFile();
  }
}

export async function closeTrade(tradeId, closeData = {}) {
  ensureLocalFile();
  const item = localDb.trades.find(t => t.id === tradeId);
  if (item) {
    item.status = 'closed';
    item.closed_at = new Date().toISOString();
    Object.assign(item, closeData);
    saveLocalFile();
  }
  return item;
}

// ── Limit Order helpers ──────────────────────────────────────────

export async function createLimitOrder(order) {
  ensureLocalFile();
  if (!Array.isArray(localDb.limit_orders)) localDb.limit_orders = [];
  const id = localDb.limit_orders.length + 1;
  const item = {
    id,
    ...order,
    status: 'pending', // 'pending', 'filled', 'cancelled'
    created_at: new Date().toISOString(),
    filled_at: null,
  };
  localDb.limit_orders.unshift(item);
  saveLocalFile();
  return item;
}

export async function getPendingLimitOrders(tokenAddress = null) {
  ensureLocalFile();
  if (!Array.isArray(localDb.limit_orders)) localDb.limit_orders = [];
  return localDb.limit_orders.filter(
    o => o.status === 'pending' && (!tokenAddress || o.tokenAddress === tokenAddress)
  );
}

export async function hasPendingLimitOrder(tokenAddress, userWallet) {
  ensureLocalFile();
  if (!Array.isArray(localDb.limit_orders)) localDb.limit_orders = [];
  return localDb.limit_orders.some(
    o => o.tokenAddress === tokenAddress && o.userWallet === userWallet && o.status === 'pending'
  );
}

export async function fillLimitOrder(orderId, fillData = {}) {
  ensureLocalFile();
  if (!Array.isArray(localDb.limit_orders)) localDb.limit_orders = [];
  const item = localDb.limit_orders.find(o => o.id === orderId);
  if (item) {
    item.status = 'filled';
    item.filled_at = new Date().toISOString();
    Object.assign(item, fillData);
    saveLocalFile();
  }
  return item;
}

export async function cancelLimitOrder(orderId) {
  ensureLocalFile();
  if (!Array.isArray(localDb.limit_orders)) localDb.limit_orders = [];
  const item = localDb.limit_orders.find(o => o.id === orderId);
  if (item) {
    item.status = 'cancelled';
    item.cancelled_at = new Date().toISOString();
    saveLocalFile();
  }
  return item;
}

// ── Session wallet helpers ─────────────────────────────────────────

export async function saveSessionWallet({ userWallet, sessionPubkey, encryptedPrivkey, botConfig }) {
  ensureLocalFile();
  const existingIdx = localDb.session_wallets.findIndex(s => s.user_wallet === userWallet);
  const now = new Date().toISOString();
  const sessionData = {
    id: existingIdx >= 0 ? localDb.session_wallets[existingIdx].id : localDb.session_wallets.length + 1,
    user_wallet: userWallet,
    session_pubkey: sessionPubkey,
    encrypted_privkey: encryptedPrivkey,
    is_active: true,
    bot_config: botConfig || {},
    created_at: existingIdx >= 0 ? localDb.session_wallets[existingIdx].created_at : now,
    updated_at: now,
  };

  if (existingIdx >= 0) {
    localDb.session_wallets[existingIdx] = sessionData;
  } else {
    localDb.session_wallets.push(sessionData);
  }
  saveLocalFile();
}

export async function getSessionWallet(userWallet) {
  ensureLocalFile();
  return localDb.session_wallets.find(s => s.user_wallet === userWallet && s.is_active) || null;
}

export async function getAllActiveSessions() {
  ensureLocalFile();
  return localDb.session_wallets.filter(s => s.is_active);
}

export async function updateBotConfig(userWallet, botConfig) {
  ensureLocalFile();
  const session = localDb.session_wallets.find(s => s.user_wallet === userWallet);
  if (session) {
    session.bot_config = { ...session.bot_config, ...botConfig };
    session.updated_at = new Date().toISOString();
  }
  localDb.bot_configs[userWallet] = { ...(localDb.bot_configs[userWallet] || {}), ...botConfig };
  saveLocalFile();
}

export async function getBotConfig(userWallet) {
  ensureLocalFile();
  const session = localDb.session_wallets.find(s => s.user_wallet === userWallet);
  return session?.bot_config || localDb.bot_configs[userWallet] || null;
}

export async function deactivateSession(userWallet) {
  ensureLocalFile();
  const session = localDb.session_wallets.find(s => s.user_wallet === userWallet);
  if (session) {
    session.is_active = false;
    session.updated_at = new Date().toISOString();
    saveLocalFile();
  }
}

// ── Set File helpers ───────────────────────────────────────────────

export async function saveSetFile(userWallet, setFile) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  
  const existingIdx = localDb.set_files.findIndex(s => s.id === setFile.id && s.userWallet === userWallet);
  const now = new Date().toISOString();
  
  if (existingIdx >= 0) {
    localDb.set_files[existingIdx] = { ...localDb.set_files[existingIdx], ...setFile, updatedAt: now };
  } else {
    localDb.set_files.push({ ...setFile, userWallet, createdAt: now, updatedAt: now });
  }
  saveLocalFile();
  return existingIdx >= 0 ? localDb.set_files[existingIdx] : localDb.set_files[localDb.set_files.length - 1];
}

export async function getSetFiles(userWallet) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  return localDb.set_files.filter(s => s.userWallet === userWallet);
}

export async function getSetFile(userWallet, setFileId) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  return localDb.set_files.find(s => s.id === setFileId && s.userWallet === userWallet) || null;
}

export async function deleteSetFile(userWallet, setFileId) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  const idx = localDb.set_files.findIndex(s => s.id === setFileId && s.userWallet === userWallet);
  if (idx >= 0) {
    localDb.set_files.splice(idx, 1);
    saveLocalFile();
    return true;
  }
  return false;
}

export async function getActiveSetFile(userWallet) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  return localDb.set_files.find(s => s.userWallet === userWallet && s.isActive) || null;
}

export async function setActiveSetFile(userWallet, setFileId) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  let activated = null;
  for (const s of localDb.set_files) {
    if (s.userWallet === userWallet) {
      if (s.id === setFileId) {
        s.isActive = true;
        activated = s;
      } else {
        s.isActive = false;
      }
      s.updatedAt = new Date().toISOString();
    }
  }
  saveLocalFile();
  return activated;
}

// ── Bought Token Tracker ───────────────────────────────────────────

export async function addBoughtToken(userWallet, tokenAddress) {
  ensureLocalFile();
  if (!Array.isArray(localDb.bought_tokens)) localDb.bought_tokens = [];
  
  localDb.bought_tokens.push({
    userWallet,
    tokenAddress,
    boughtAt: new Date().toISOString()
  });
  saveLocalFile();
}

export async function isBoughtRecently(userWallet, tokenAddress, cooldownDays) {
  if (!cooldownDays || cooldownDays <= 0) return false;
  
  ensureLocalFile();
  if (!Array.isArray(localDb.bought_tokens)) localDb.bought_tokens = [];
  
  const cutoffTime = Date.now() - (cooldownDays * 24 * 60 * 60 * 1000);
  
  return localDb.bought_tokens.some(bt => 
    bt.userWallet === userWallet && 
    bt.tokenAddress === tokenAddress && 
    new Date(bt.boughtAt).getTime() > cutoffTime
  );
}

// ── Auth & Users ───────────────────────────────────────────────────

export async function findOrCreateUser(email) {
  ensureLocalFile();
  if (!Array.isArray(localDb.users)) localDb.users = [];
  
  let user = localDb.users.find(u => u.email === email);
  if (!user) {
    user = { id: localDb.users.length + 1, email, wallets: [], createdAt: new Date().toISOString() };
    localDb.users.push(user);
    saveLocalFile();
  }
  return user;
}

export async function addWalletToUser(email, walletAddress) {
  ensureLocalFile();
  if (!Array.isArray(localDb.users)) localDb.users = [];
  let user = localDb.users.find(u => u.email === email);
  if (user && !user.wallets.includes(walletAddress)) {
    user.wallets.push(walletAddress);
    saveLocalFile();
  }
}

export async function getUser(email) {
  ensureLocalFile();
  if (!Array.isArray(localDb.users)) localDb.users = [];
  return localDb.users.find(u => u.email === email) || null;
}

export async function saveOtp(email, otp) {
  ensureLocalFile();
  if (!Array.isArray(localDb.auth_otps)) localDb.auth_otps = [];
  
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  localDb.auth_otps.push({ email, otp, expiresAt, used: false });
  saveLocalFile();
}

export async function verifyAndConsumeOtp(email, otp) {
  ensureLocalFile();
  if (!Array.isArray(localDb.auth_otps)) localDb.auth_otps = [];
  
  const now = new Date().toISOString();
  const validOtpIndex = localDb.auth_otps.findIndex(o => o.email === email && o.otp === otp && !o.used && o.expiresAt > now);
  
  if (validOtpIndex >= 0) {
    localDb.auth_otps[validOtpIndex].used = true;
    saveLocalFile();
    return true;
  }
  return false;
}


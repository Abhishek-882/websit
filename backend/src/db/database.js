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
  session_wallets: [],
  bot_configs: {},
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
      if (!Array.isArray(localDb.session_wallets)) localDb.session_wallets = [];
      if (!localDb.bot_configs) localDb.bot_configs = {};
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

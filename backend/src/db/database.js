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

const SEED_DB_FILE = path.join(DATA_DIR, 'seed_db.json');

function ensureLocalFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // If local_db.json is missing on fresh deployment, seed it from seed_db.json
  if (!fs.existsSync(LOCAL_DB_FILE) && fs.existsSync(SEED_DB_FILE)) {
    try {
      const seedContent = fs.readFileSync(SEED_DB_FILE, 'utf-8');
      fs.writeFileSync(LOCAL_DB_FILE, seedContent, 'utf-8');
    } catch (e) {
      console.warn('[DB] Failed to initialize from seed_db.json:', e.message);
    }
  }

  if (fs.existsSync(LOCAL_DB_FILE)) {
    try {
      const content = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      localDb = { ...localDb, ...JSON.parse(content) };
      if (!Array.isArray(localDb.trades)) localDb.trades = [];
      if (!Array.isArray(localDb.limit_orders)) localDb.limit_orders = [];
      if (!Array.isArray(localDb.session_wallets)) localDb.session_wallets = [];
      if (!Array.isArray(localDb.session_wallets_backup)) localDb.session_wallets_backup = [];
      if (!localDb.bot_configs) localDb.bot_configs = {};
      if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
      // Auto-migrate any legacy set files missing a unique id
      localDb.set_files.forEach((sf, idx) => {
        if (!sf.id) {
          sf.id = `set_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        }
      });
      if (!Array.isArray(localDb.bought_tokens)) localDb.bought_tokens = [];
      if (!Array.isArray(localDb.users)) localDb.users = [];
      if (!Array.isArray(localDb.auth_otps)) localDb.auth_otps = [];
    } catch {
      // fresh file if corrupt
    }
  } else {
    saveLocalFile();
  }

  // Merge any seed records if localDb is missing seeded sessions or users
  if (fs.existsSync(SEED_DB_FILE)) {
    try {
      const seedData = JSON.parse(fs.readFileSync(SEED_DB_FILE, 'utf-8'));
      let modified = false;
      if (Array.isArray(seedData.session_wallets)) {
        seedData.session_wallets.forEach(sw => {
          if (!localDb.session_wallets.some(s => s.session_pubkey === sw.session_pubkey)) {
            localDb.session_wallets.push(sw);
            modified = true;
          }
        });
      }
      if (Array.isArray(seedData.session_wallets_backup)) {
        seedData.session_wallets_backup.forEach(sw => {
          if (!localDb.session_wallets_backup.some(s => s.session_pubkey === sw.session_pubkey)) {
            localDb.session_wallets_backup.push(sw);
            modified = true;
          }
        });
      }
      if (Array.isArray(seedData.users)) {
        seedData.users.forEach(u => {
          if (!localDb.users.some(existing => existing.email === u.email)) {
            localDb.users.push(u);
            modified = true;
          }
        });
      }
      if (modified) saveLocalFile();
    } catch {
      // ignore
    }
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

export async function saveSessionWallet({ userWallet, userEmail, sessionPubkey, encryptedPrivkey, botConfig }) {
  ensureLocalFile();
  if (!Array.isArray(localDb.session_wallets)) localDb.session_wallets = [];
  if (!Array.isArray(localDb.session_wallets_backup)) localDb.session_wallets_backup = [];

  const existingIdx = localDb.session_wallets.findIndex(s =>
    (userWallet && s.user_wallet === userWallet) ||
    (userEmail && s.user_email === userEmail) ||
    (sessionPubkey && s.session_pubkey === sessionPubkey)
  );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours active window

  const existingWallet = existingIdx >= 0 ? localDb.session_wallets[existingIdx].user_wallet : null;
  const existingEmail = existingIdx >= 0 ? localDb.session_wallets[existingIdx].user_email : null;

  const sessionData = {
    id: existingIdx >= 0 ? localDb.session_wallets[existingIdx].id : localDb.session_wallets.length + 1,
    user_wallet: userWallet || existingWallet || null,
    user_email: userEmail || existingEmail || null,
    session_pubkey: sessionPubkey,
    encrypted_privkey: encryptedPrivkey,
    is_active: true,
    bot_config: botConfig || {},
    created_at: existingIdx >= 0 ? localDb.session_wallets[existingIdx].created_at : now.toISOString(),
    session_started_at: existingIdx >= 0 ? (localDb.session_wallets[existingIdx].session_started_at || now.toISOString()) : now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expiresAt,
  };

  if (existingIdx >= 0) {
    localDb.session_wallets[existingIdx] = sessionData;
  } else {
    localDb.session_wallets.push(sessionData);
  }

  // Backup vault: ensure this session's encrypted private key is permanently recorded
  const backupIdx = localDb.session_wallets_backup.findIndex(b => b.session_pubkey === sessionPubkey);
  if (backupIdx >= 0) {
    localDb.session_wallets_backup[backupIdx] = {
      ...localDb.session_wallets_backup[backupIdx],
      user_wallet: userWallet || localDb.session_wallets_backup[backupIdx].user_wallet || null,
      user_email: userEmail || localDb.session_wallets_backup[backupIdx].user_email || null,
      encrypted_privkey: encryptedPrivkey,
      updated_at: now.toISOString(),
      status: 'active',
    };
  } else {
    localDb.session_wallets_backup.push({
      user_wallet: userWallet || null,
      user_email: userEmail || null,
      session_pubkey: sessionPubkey,
      encrypted_privkey: encryptedPrivkey,
      created_at: now.toISOString(),
      status: 'active',
    });
  }

  if (userEmail && userWallet) {
    await addWalletToUser(userEmail, userWallet);
  }

  saveLocalFile();
  return sessionData;
}

export async function getSessionWallet(userWallet, userEmail = null) {
  ensureLocalFile();
  if (!Array.isArray(localDb.session_wallets)) localDb.session_wallets = [];
  let session = localDb.session_wallets.find(s =>
    s.is_active && (
      (userWallet && s.user_wallet === userWallet) ||
      (userEmail && s.user_email === userEmail)
    )
  );

  // Auto-heal: If no active session in session_wallets, check if an archived key exists for this user/email
  if (!session && Array.isArray(localDb.session_wallets_backup)) {
    const backupMatch = localDb.session_wallets_backup.slice().reverse().find(b =>
      (userWallet && b.user_wallet === userWallet) ||
      (userEmail && b.user_email === userEmail)
    );
    if (backupMatch) {
      session = {
        id: localDb.session_wallets.length + 1,
        user_wallet: backupMatch.user_wallet || userWallet || null,
        user_email: backupMatch.user_email || userEmail || null,
        session_pubkey: backupMatch.session_pubkey,
        encrypted_privkey: backupMatch.encrypted_privkey,
        is_active: true,
        bot_config: {},
        created_at: backupMatch.created_at || new Date().toISOString(),
        session_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      localDb.session_wallets.push(session);
      saveLocalFile();
    }
  }

  if (!session) return null;

  // Sync wallet / email if one was missing
  if (userWallet && !session.user_wallet) session.user_wallet = userWallet;
  if (userEmail && !session.user_email) session.user_email = userEmail;

  // Refresh 24-hour active window so it never expires while user or background bot is running
  const now = new Date();
  session.updated_at = now.toISOString();
  session.expires_at = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  saveLocalFile();
  return session;
}

export async function reactivateSessionWallet(userWallet, sessionPubkey, userEmail = null) {
  ensureLocalFile();
  if (!Array.isArray(localDb.session_wallets)) localDb.session_wallets = [];
  if (!Array.isArray(localDb.session_wallets_backup)) localDb.session_wallets_backup = [];

  // Deactivate any currently active session for this user/email
  localDb.session_wallets.forEach(s => {
    if ((userWallet && s.user_wallet === userWallet) || (userEmail && s.user_email === userEmail)) {
      s.is_active = false;
    }
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Check if already in session_wallets
  const existing = localDb.session_wallets.find(s => s.session_pubkey === sessionPubkey);
  if (existing) {
    existing.is_active = true;
    if (userWallet) existing.user_wallet = userWallet;
    if (userEmail) existing.user_email = userEmail;
    existing.updated_at = now.toISOString();
    existing.expires_at = expiresAt;
    saveLocalFile();
    return existing;
  }

  // Check backup vault
  const backup = localDb.session_wallets_backup.find(b => b.session_pubkey === sessionPubkey);
  if (backup) {
    const newSession = {
      id: localDb.session_wallets.length + 1,
      user_wallet: userWallet || backup.user_wallet || null,
      user_email: userEmail || backup.user_email || null,
      session_pubkey: backup.session_pubkey,
      encrypted_privkey: backup.encrypted_privkey,
      is_active: true,
      bot_config: {},
      created_at: backup.created_at || now.toISOString(),
      session_started_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt,
    };
    localDb.session_wallets.push(newSession);
    saveLocalFile();
    return newSession;
  }

  throw new Error(`Session keypair ${sessionPubkey} not found in database or backup vault.`);
}

export async function getAllActiveSessions() {
  ensureLocalFile();
  if (!Array.isArray(localDb.session_wallets)) localDb.session_wallets = [];
  return localDb.session_wallets.filter(s => s.is_active === true);
}

export async function updateBotConfig(userWallet, botConfig, userEmail = null) {
  ensureLocalFile();
  const session = localDb.session_wallets.find(s =>
    (userWallet && s.user_wallet === userWallet) ||
    (userEmail && s.user_email === userEmail)
  );
  if (session) {
    session.bot_config = { ...session.bot_config, ...botConfig };
    session.updated_at = new Date().toISOString();
  }
  if (userWallet) localDb.bot_configs[userWallet] = { ...(localDb.bot_configs[userWallet] || {}), ...botConfig };
  if (userEmail) localDb.bot_configs[userEmail] = { ...(localDb.bot_configs[userEmail] || {}), ...botConfig };
  saveLocalFile();
}

export async function getBotConfig(userWallet, userEmail = null) {
  ensureLocalFile();
  const session = localDb.session_wallets.find(s =>
    (userWallet && s.user_wallet === userWallet) ||
    (userEmail && s.user_email === userEmail)
  );
  return session?.bot_config || (userWallet && localDb.bot_configs[userWallet]) || (userEmail && localDb.bot_configs[userEmail]) || null;
}

export async function deactivateSession(userWallet, userEmail = null) {
  ensureLocalFile();
  if (Array.isArray(localDb.session_wallets)) {
    const sessions = localDb.session_wallets.filter(s =>
      (userWallet && s.user_wallet === userWallet) ||
      (userEmail && s.user_email === userEmail)
    );
    sessions.forEach(s => {
      s.is_active = false;
      s.updated_at = new Date().toISOString();
    });
  }
  saveLocalFile();
}

export async function archiveSessionWallet({ userWallet, userEmail, sessionPubkey, encryptedPrivkey, refundTx, refundedSol, archivedAt, reason }) {
  ensureLocalFile();
  if (!Array.isArray(localDb.session_wallets_backup)) localDb.session_wallets_backup = [];

  localDb.session_wallets_backup.push({
    user_wallet: userWallet || null,
    user_email: userEmail || null,
    session_pubkey: sessionPubkey,
    encrypted_privkey: encryptedPrivkey,
    refund_tx: refundTx || null,
    refunded_sol: refundedSol || 0,
    archived_at: archivedAt || new Date().toISOString(),
    reason: reason || 'deleted',
    status: 'archived',
  });

  // Remove from active session wallets so clean recreation can happen immediately
  if (Array.isArray(localDb.session_wallets)) {
    const idx = localDb.session_wallets.findIndex(s =>
      (userWallet && s.user_wallet === userWallet) ||
      (userEmail && s.user_email === userEmail) ||
      (s.session_pubkey === sessionPubkey)
    );
    if (idx >= 0) {
      localDb.session_wallets.splice(idx, 1);
    }
  }

  saveLocalFile();
}

export async function getArchivedSessions(userWallet, userEmail = null) {
  ensureLocalFile();
  if (!Array.isArray(localDb.session_wallets_backup)) return [];
  return localDb.session_wallets_backup.filter(s =>
    (userWallet && s.user_wallet === userWallet) ||
    (userEmail && s.user_email === userEmail)
  );
}

// ── Set File helpers ───────────────────────────────────────────────

export async function saveSetFile(userWallet, setFile) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];

  // Guarantee every set file has an immutable, unique ID
  if (!setFile.id) {
    setFile.id = `set_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const existingIdx = localDb.set_files.findIndex(s => String(s.id) === String(setFile.id) && s.userWallet === userWallet);
  const now = new Date().toISOString();

  // Any new set file is deactivated by default (isActive: false) unless explicitly set to true
  const shouldBeActive = setFile.isActive === true;
  setFile.isActive = shouldBeActive;

  const userFiles = localDb.set_files.filter(s => s.userWallet === userWallet && String(s.id) !== String(setFile.id));

  if (shouldBeActive) {
    // Deactivate all other set files for this user so only one is active
    userFiles.forEach(s => { s.isActive = false; });

    // Sync active set file reference to user's active session
    if (Array.isArray(localDb.session_wallets)) {
      const session = localDb.session_wallets.find(s => s.user_wallet === userWallet && s.is_active);
      if (session) {
        session.active_set_file_id = setFile.id;
        session.updated_at = now;
      }
    }
  } else {
    // If saving as deactivated, check if this file was previously the active file for session
    if (Array.isArray(localDb.session_wallets)) {
      const session = localDb.session_wallets.find(s => s.user_wallet === userWallet && s.is_active);
      if (session && session.active_set_file_id === setFile.id) {
        session.active_set_file_id = null;
        session.updated_at = now;
      }
    }
  }

  if (existingIdx >= 0) {
    localDb.set_files[existingIdx] = { ...localDb.set_files[existingIdx], ...setFile, userWallet, updatedAt: now };
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
  return localDb.set_files.find(s => String(s.id) === String(setFileId) && s.userWallet === userWallet) || null;
}

export async function deleteSetFile(userWallet, setFileId) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  const idx = localDb.set_files.findIndex(s => String(s.id) === String(setFileId) && s.userWallet === userWallet);
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
  const userFiles = localDb.set_files.filter(s => s.userWallet === userWallet);
  return userFiles.find(s => s.isActive === true) || null;
}

export async function setActiveSetFile(userWallet, setFileId) {
  ensureLocalFile();
  if (!Array.isArray(localDb.set_files)) localDb.set_files = [];
  let activated = null;
  for (const s of localDb.set_files) {
    if (s.userWallet === userWallet) {
      if (setFileId && String(s.id) === String(setFileId)) {
        s.isActive = true;
        activated = s;
      } else {
        s.isActive = false;
      }
      s.updatedAt = new Date().toISOString();
    }
  }

  // Sync with active session wallet
  if (Array.isArray(localDb.session_wallets)) {
    const session = localDb.session_wallets.find(s => s.user_wallet === userWallet && s.is_active);
    if (session) {
      session.active_set_file_id = activated ? activated.id : null;
      session.updated_at = new Date().toISOString();
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

// ── PIN helpers ────────────────────────────────────────────────────

export async function saveUserPin(email, pinHash) {
  ensureLocalFile();
  if (!Array.isArray(localDb.users)) localDb.users = [];
  let user = localDb.users.find(u => u.email === email);
  if (!user) {
    user = { id: localDb.users.length + 1, email, wallets: [], createdAt: new Date().toISOString() };
    localDb.users.push(user);
  }
  user.pinHash = pinHash;
  user.pinSetAt = new Date().toISOString();
  saveLocalFile();
}

export async function getUserPin(email) {
  ensureLocalFile();
  if (!Array.isArray(localDb.users)) localDb.users = [];
  const user = localDb.users.find(u => u.email === email);
  return user?.pinHash || null;
}



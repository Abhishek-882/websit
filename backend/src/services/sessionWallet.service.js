import { Keypair, Connection, PublicKey, Transaction,
         SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';
import { saveSessionWallet, getSessionWallet, deactivateSession, archiveSessionWallet, getArchivedSessions, getActiveSetFile, getSetFiles, setActiveSetFile } from '../db/database.js';

const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_SECRET || 'MEME_CAT_32_CHAR_SECRET_KEY!99';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * SessionWalletService — manages bot-controlled session keypairs.
 *
 * Flow:
 *  1. User clicks "Create Session Wallet" in frontend.
 *  2. Backend generates a session keypair & encrypts the private key with AES-256-CBC.
 *  3. Returns public key for user to fund with trading SOL.
 *  4. Bot uses the session keypair to buy/sell autonomously with zero browser popups.
 *  5. User can withdraw remaining SOL back anytime.
 */
export class SessionWalletService {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
  }

  /**
   * Create or retrieve a session wallet for a user.
   */
  async createSession(userWallet, botConfig = {}) {
    // Check if user has an active set file bound to the session
    const activeSet = await getActiveSetFile(userWallet);

    const existing = await getSessionWallet(userWallet);
    if (existing) {
      return { sessionPubkey: existing.session_pubkey };
    }

    // Generate fresh Solana keypair
    const keypair = Keypair.generate();
    const pubkey  = keypair.publicKey.toBase58();
    const privkey = bs58.encode(keypair.secretKey);

    // Encrypt the private key before storing
    const encryptedPrivkey = this._encrypt(privkey);

    await saveSessionWallet({
      userWallet,
      sessionPubkey:    pubkey,
      encryptedPrivkey,
      botConfig,
    });

    console.log(`[SESSION] Created session wallet for ${userWallet.slice(0,8)}... → ${pubkey.slice(0,8)}...`);
    return { sessionPubkey: pubkey };
  }

  /**
   * Reconstruct the session Keypair for signing transactions.
   */
  async getKeypair(userWallet) {
    const session = await getSessionWallet(userWallet);
    if (!session) throw new Error(`No active session for wallet ${userWallet}`);
    const privkey = this._decrypt(session.encrypted_privkey);
    const secretKey = bs58.decode(privkey);
    return Keypair.fromSecretKey(secretKey);
  }

  /**
   * Get the session wallet's current SOL balance.
   */
  async getSessionBalance(userWallet) {
    const session = await getSessionWallet(userWallet);
    if (!session) return 0;
    try {
      const lamports = await this.connection.getBalance(new PublicKey(session.session_pubkey));
      return lamports / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  /**
   * Get session wallet details.
   */
  async getSession(userWallet) {
    const session = await getSessionWallet(userWallet);
    if (!session) return null;
    const balance = await this.getSessionBalance(userWallet);
    return {
      sessionPubkey: session.session_pubkey,
      balanceSol: balance,
      isActive: session.is_active,
      createdAt: session.created_at,
      sessionStartedAt: session.session_started_at || session.created_at,
    };
  }

  /**
   * Verify an Ed25519 message signature from a connected Solana wallet (e.g. Phantom).
   */
  verifySignature(userWallet, signature, message) {
    try {
      const rawPub = bs58.decode(userWallet);
      if (rawPub.length !== 32) return false;

      const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
      const publicKeyObject = crypto.createPublicKey({
        key: Buffer.concat([spkiHeader, rawPub]),
        format: 'der',
        type: 'spki',
      });

      let sigBuf;
      if (typeof signature === 'string') {
        try {
          const decoded = bs58.decode(signature);
          if (decoded.length === 64) {
            sigBuf = Buffer.from(decoded);
          }
        } catch {
          // not base58
        }
        if (!sigBuf) {
          sigBuf = Buffer.from(signature, 'hex');
        }
      } else if (Buffer.isBuffer(signature) || signature instanceof Uint8Array) {
        sigBuf = Buffer.from(signature);
      }

      if (!sigBuf || sigBuf.length !== 64) {
        return false;
      }

      const msgBuf = Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8');
      return crypto.verify(null, msgBuf, publicKeyObject, sigBuf);
    } catch (e) {
      console.warn('[SESSION] Signature verification error:', e.message);
      return false;
    }
  }

  /**
   * Export decrypted private key for user self-custody.
   * Requires proof of Phantom wallet ownership via cryptographic signature.
   */
  async exportPrivateKey(userWallet, signature, message, sessionPubkey = null) {
    if (!this.verifySignature(userWallet, signature, message)) {
      throw new Error('Invalid cryptographic signature. Ownership of Phantom wallet could not be verified.');
    }

    let session = null;
    if (sessionPubkey) {
      const active = await getSessionWallet(userWallet);
      if (active && active.session_pubkey === sessionPubkey) {
        session = active;
      } else {
        const backups = await getArchivedSessions(userWallet);
        const match = backups.find(b => b.session_pubkey === sessionPubkey);
        if (match) session = match;
      }
    } else {
      session = await getSessionWallet(userWallet);
    }

    if (!session) {
      throw new Error(`No active or archived session wallet found for address ${userWallet}`);
    }

    const privkey = this._decrypt(session.encrypted_privkey);
    return {
      sessionPubkey: session.session_pubkey,
      privateKey: privkey,
    };
  }

  /**
   * Verify an on-chain deposit transaction and refresh live session balance.
   */
  async verifyDeposit(userWallet, txSignature) {
    const session = await getSessionWallet(userWallet);
    if (!session) {
      throw new Error(`No session wallet found for ${userWallet}`);
    }

    if (txSignature) {
      try {
        await this.connection.confirmTransaction(txSignature, 'confirmed');
      } catch (err) {
        console.warn(`[SESSION] Confirm transaction notice for ${txSignature.slice(0, 10)}...:`, err.message);
      }
    }

    const balanceSol = await this.getSessionBalance(userWallet);
    return {
      success: true,
      sessionPubkey: session.session_pubkey,
      balanceSol,
      txSignature,
    };
  }

  /**
   * Withdraw all funds: session wallet → user main wallet.
   */
  async withdrawAll(userWallet) {
    const keypair  = await this.getKeypair(userWallet);
    const balance  = await this.connection.getBalance(keypair.publicKey);
    if (balance === 0) throw new Error('Session wallet has no SOL to withdraw');

    const fee     = 5000; // ~0.000005 SOL
    const amount  = balance - fee;
    if (amount <= 0) throw new Error('Insufficient balance after network fee');

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey:   new PublicKey(userWallet),
        lamports:   amount,
      })
    );

    const sig = await sendAndConfirmTransaction(this.connection, tx, [keypair]);
    console.log(`[SESSION] Withdrew ${amount / LAMPORTS_PER_SOL} SOL back to ${userWallet.slice(0,8)}...`);
    return { signature: sig, amountSol: amount / LAMPORTS_PER_SOL };
  }

  /**
   * Deactivate session
   */
  async deactivate(userWallet) {
    await deactivateSession(userWallet);
    console.log(`[SESSION] Deactivated session for ${userWallet.slice(0,8)}...`);
  }

  /**
   * Safely deletes a session wallet:
   * 1. Checks on-chain balance.
   * 2. If balance > 0 (greater than gas fee), sweeps 100% of remaining funds back to the user's main wallet.
   * 3. Permanently archives the private key in the backup vault so it is NEVER lost.
   * 4. Clears active session so user can create a brand new one immediately.
   */
  async deleteAndRefundSession(userWallet) {
    const session = await getSessionWallet(userWallet);
    if (!session) {
      return {
        success: true,
        refundedSol: 0,
        refundTx: null,
        message: 'No active session wallet found to delete.',
      };
    }

    let refundTx = null;
    let refundedSol = 0;

    try {
      const keypair = await this.getKeypair(userWallet);
      const balance = await this.connection.getBalance(keypair.publicKey);
      const networkFee = 5000; // ~0.000005 SOL
      const transferAmount = balance - networkFee;

      if (transferAmount > 0) {
        console.log(`[SESSION DELETE] Found ${balance / LAMPORTS_PER_SOL} SOL. Automatically refunding ${transferAmount / LAMPORTS_PER_SOL} SOL to ${userWallet.slice(0, 8)}...`);
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey:   new PublicKey(userWallet),
            lamports:   transferAmount,
          })
        );
        refundTx = await sendAndConfirmTransaction(this.connection, tx, [keypair]);
        refundedSol = transferAmount / LAMPORTS_PER_SOL;
        console.log(`[SESSION DELETE] Refund successful! Tx: ${refundTx}`);
      }
    } catch (refundErr) {
      console.error(`[SESSION DELETE] Auto-refund failed:`, refundErr.message);
      throw new Error(`Refund transfer failed: ${refundErr.message}. Session was NOT deleted to protect your funds.`);
    }

    // Always archive the encrypted key in the permanent backup vault so funds/keys are NEVER lost
    await archiveSessionWallet({
      userWallet,
      sessionPubkey: session.session_pubkey,
      encryptedPrivkey: session.encrypted_privkey,
      refundTx,
      refundedSol,
      archivedAt: new Date().toISOString(),
      reason: 'user_delete_and_reset',
    });

    // Remove from active sessions
    await deactivateSession(userWallet);

    return {
      success: true,
      sessionPubkey: session.session_pubkey,
      refundedSol,
      refundTx,
      message: refundedSol > 0
        ? `Session safely deleted! Automatically refunded ${refundedSol.toFixed(4)} SOL back to your connected Phantom wallet. Private key permanently preserved in backup vault.`
        : `Session safely deleted and private key permanently preserved in backup vault.`,
    };
  }

  async getBackups(userWallet) {
    const raw = await getArchivedSessions(userWallet);
    return (raw || []).map(b => ({
      session_pubkey: b.session_pubkey,
      refund_tx: b.refund_tx,
      refunded_sol: b.refunded_sol,
      archived_at: b.archived_at,
      status: b.status,
      reason: b.reason,
    }));
  }

  // ── Encryption helpers ──

  _encrypt(text) {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv  = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  _decrypt(encryptedText) {
    const [ivHex, encrypted] = encryptedText.split(':');
    const key  = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv   = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const sessionWalletService = new SessionWalletService();

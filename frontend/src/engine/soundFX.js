/**
 * SoundFX Engine
 * Synthesizes subtle, pleasant alert chimes using the browser Web Audio API.
 * Eliminates external mp3 assets, prevents 404s, and respects user mute preferences.
 */

class SoundFX {
  constructor() {
    this.audioCtx = null;
    this.muted = localStorage.getItem('websit_sound_muted') === 'true';
  }

  getAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  isMuted() {
    return this.muted;
  }

  setMuted(val) {
    this.muted = Boolean(val);
    localStorage.setItem('websit_sound_muted', String(this.muted));
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Plays a pleasant 2-tone chime when a high-priority token matches active filters
   */
  playAlertChime() {
    if (this.muted) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Note 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.38);

      // Note 2: 880.00 Hz (A5) - slightly delayed
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880.0, now + 0.12);

      gain2.gain.setValueAtTime(0.001, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.15, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.58);
    } catch (err) {
      // Audio playback silently guarded against autoplay policy constraints
    }
  }
}

export const soundFX = new SoundFX();

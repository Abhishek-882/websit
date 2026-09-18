import React, { useState, useEffect } from 'react';
import {
  IconSettings,
  IconCheck,
  IconVolume,
  IconVolumeX,
  IconPlay,
  IconSliders,
  IconEye,
  IconEyeOff,
} from './Icons';
import { soundFX } from '../engine/soundFX';

export const DEFAULT_USER_PREFERENCES = {
  slippagePercent: 1.0,
  hapticFeedback: true,
  audioVolume: 80,
  audioStyle: 'sonar',
  density: 'comfortable',
  stealthMode: false,
  refreshInterval: 30,
  playIntroOnOpen: true,
};

export function loadUserPreferences() {
  if (typeof window === 'undefined') return DEFAULT_USER_PREFERENCES;
  try {
    const raw = localStorage.getItem('memecat_user_preferences');
    if (raw) {
      return { ...DEFAULT_USER_PREFERENCES, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[MEME_CAT] Error loading user preferences:', e);
  }
  return DEFAULT_USER_PREFERENCES;
}

export function saveUserPreferences(prefs) {
  try {
    localStorage.setItem('memecat_user_preferences', JSON.stringify(prefs));
  } catch (e) {
    console.warn('[MEME_CAT] Error saving user preferences:', e);
  }
}

export function triggerHaptic(type = 'tap') {
  if (typeof window === 'undefined' || !window.navigator?.vibrate) return;
  try {
    const prefs = loadUserPreferences();
    if (!prefs.hapticFeedback) return;
    if (type === 'tap') window.navigator.vibrate(15);
    else if (type === 'success') window.navigator.vibrate([20, 60, 20]);
    else if (type === 'alert') window.navigator.vibrate([40, 40, 40, 40]);
  } catch (e) {
    // Ignore vibration errors on unsupported devices
  }
}

export default function UserSettingsModal({
  isOpen,
  onClose,
  preferences,
  onUpdatePreferences,
  onReplayIntro,
}) {
  const [prefs, setPrefs] = useState(preferences || DEFAULT_USER_PREFERENCES);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (preferences) setPrefs(preferences);
  }, [preferences]);

  if (!isOpen) return null;

  const updateField = (field, val) => {
    triggerHaptic('tap');
    const updated = { ...prefs, [field]: val };
    setPrefs(updated);
    onUpdatePreferences(updated);
    saveUserPreferences(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleTestVibration = () => {
    if (typeof window !== 'undefined' && window.navigator?.vibrate) {
      window.navigator.vibrate([30, 50, 30, 50, 30]);
    }
  };

  const handleTestAudio = () => {
    soundFX.playHighAlert();
  };

  const handleResetDefaults = () => {
    triggerHaptic('alert');
    setPrefs(DEFAULT_USER_PREFERENCES);
    onUpdatePreferences(DEFAULT_USER_PREFERENCES);
    saveUserPreferences(DEFAULT_USER_PREFERENCES);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#090d16] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-700/60 text-cyan-400">
              <IconSettings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2 font-mono">
                <span>COMFORT &amp; TRADING PREFERENCES</span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Customize your MEME_CAT workspace experience
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-sm font-mono"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-6 overflow-y-auto text-xs text-slate-300">
          
          {/* 1. Quick Buy Slippage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-white font-mono flex items-center gap-1.5">
                <IconSliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Default Quick-Buy Slippage</span>
              </label>
              <span className="font-mono text-cyan-300 font-bold bg-cyan-950/70 border border-cyan-800/80 px-2 py-0.5 rounded">
                {prefs.slippagePercent}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Protection against MEV and price fluctuations on 1-click buys.
            </p>
            <div className="grid grid-cols-5 gap-2 pt-1">
              {[0.5, 1.0, 2.5, 5.0, 10.0].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateField('slippagePercent', val)}
                  className={`py-1.5 rounded-lg border font-mono font-bold text-xs transition-all active:scale-95 ${
                    prefs.slippagePercent === val
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                      : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>

          {/* 2. Mobile Haptic Feedback */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="space-y-0.5">
              <div className="font-bold text-white font-mono flex items-center gap-2">
                <span>Haptic Feedback (Vibration)</span>
                {prefs.hapticFeedback && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700/80 text-emerald-300 font-mono">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Tactile feedback on mobile for trades, clicks &amp; coin match alerts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {prefs.hapticFeedback && (
                <button
                  type="button"
                  onClick={handleTestVibration}
                  className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] text-cyan-300 hover:bg-slate-700 font-mono"
                  title="Test vibration on phone"
                >
                  Test
                </button>
              )}
              <button
                type="button"
                onClick={() => updateField('hapticFeedback', !prefs.hapticFeedback)}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  prefs.hapticFeedback ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    prefs.hapticFeedback ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 3. Audio Chime Alert Settings */}
          <div className="space-y-2.5 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between">
              <div className="font-bold text-white font-mono flex items-center gap-2">
                <IconVolume className="w-4 h-4 text-cyan-400" />
                <span>Audio Alert Chime &amp; Volume</span>
              </div>
              <button
                type="button"
                onClick={handleTestAudio}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950/80 border border-cyan-700/80 text-cyan-300 text-[11px] font-mono hover:bg-cyan-900/80 active:scale-95"
              >
                <IconPlay className="w-2.5 h-2.5" />
                <span>Test Chime</span>
              </button>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <span className="text-slate-400 font-mono text-xs w-16">
                Vol: {prefs.audioVolume}%
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={prefs.audioVolume}
                onChange={(e) => updateField('audioVolume', Number(e.target.value))}
                className="flex-1 accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* 4. Display Density */}
          <div className="space-y-2">
            <label className="font-bold text-white font-mono">
              Interface Display Density
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => updateField('density', 'comfortable')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  prefs.density === 'comfortable'
                    ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-bold font-mono text-xs text-cyan-300">Comfortable</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Spacious cards, relaxed readability</div>
              </button>

              <button
                type="button"
                onClick={() => updateField('density', 'compact')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  prefs.density === 'compact'
                    ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-bold font-mono text-xs text-cyan-300">Compact High-Density</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Tighter rows, maximum tokens per screen</div>
              </button>
            </div>
          </div>

          {/* 5. Privacy / Public Stealth Mode */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="space-y-0.5">
              <div className="font-bold text-white font-mono flex items-center gap-1.5">
                {prefs.stealthMode ? (
                  <IconEyeOff className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <IconEye className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Public Stealth Mode</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Blurs wallet balances and financial totals when trading in public or on stream.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateField('stealthMode', !prefs.stealthMode)}
              className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                prefs.stealthMode ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  prefs.stealthMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 6. Cinematic Startup Animation */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="space-y-0.5">
              <div className="font-bold text-white font-mono">
                Cinematic Intro on Startup
              </div>
              <p className="text-[11px] text-slate-400">
                Plays futuristic MEME_CAT radar initialization animation on app open.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReplayIntro?.();
                }}
                className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-cyan-300 hover:bg-slate-700 text-[11px] font-mono active:scale-95"
              >
                Replay Now
              </button>
              <button
                type="button"
                onClick={() => updateField('playIntroOnOpen', !prefs.playIntroOnOpen)}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  prefs.playIntroOnOpen ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    prefs.playIntroOnOpen ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors font-mono"
          >
            Reset to Defaults
          </button>

          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 animate-pulse">
                <IconCheck className="w-3.5 h-3.5" />
                <span>Preferences Saved</span>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition-all active:scale-95 shadow-md shadow-cyan-900/40"
            >
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

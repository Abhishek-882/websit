import React, { useState, useEffect } from 'react';
import { IconRadar } from './Icons';

export default function IntroAnimation({ onFinish }) {
  const [phase, setPhase] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Stage sequence
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1300);
    const t3 = setTimeout(() => setPhase(3), 2000);
    const t4 = setTimeout(() => {
      setIsFadingOut(true);
    }, 2700);
    const t5 = setTimeout(() => {
      onFinish?.();
    }, 3200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [onFinish]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      onFinish?.();
    }, 250);
  };

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[250] bg-[#050811] flex flex-col items-center justify-center overflow-hidden cursor-pointer select-none transition-opacity duration-500 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Cybernetic Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#06b6d40a_1px,transparent_1px),linear-gradient(to_bottom,#06b6d40a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Atmospheric Radial Glows */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute w-[400px] h-[400px] rounded-full bg-purple-500/10 blur-[100px] pointer-events-none" />

      {/* Sweeping Laser Radar Scanner Line */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4] opacity-40 animate-[radarScan_3s_ease-in-out_infinite]" />
      </div>

      {/* Top Controls: Skip */}
      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSkip();
          }}
          className="px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 hover:border-cyan-500/60 text-slate-300 hover:text-cyan-300 text-xs font-mono font-semibold transition-all backdrop-blur-md shadow-lg active:scale-95"
        >
          SKIP [ESC]
        </button>
      </div>

      {/* Central Holographic Emblem & Radar Reticle */}
      <div className="relative flex flex-col items-center justify-center z-10 scale-95 sm:scale-100">
        {/* Concentric Rotating Radar Rings */}
        <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
          {/* Outer Ring */}
          <div className="absolute inset-0 rounded-full border border-cyan-500/20 border-dashed animate-[spin_20s_linear_infinite]" />
          
          {/* Middle Ring with Cyan Accent Markers */}
          <div className="absolute inset-4 rounded-full border border-cyan-500/30 border-t-cyan-400 border-r-transparent animate-[spin_12s_linear_infinite_reverse]" />
          
          {/* Inner Ring with Purple Accent */}
          <div className="absolute inset-10 rounded-full border border-purple-500/30 border-b-purple-400 border-l-transparent animate-[spin_8s_linear_infinite]" />

          {/* Crosshair Target Axes */}
          <div className="absolute w-full h-[1px] bg-cyan-500/20" />
          <div className="absolute h-full w-[1px] bg-cyan-500/20" />

          {/* Central Logo Box */}
          <div className="relative w-24 h-24 rounded-2xl bg-slate-950/90 border-2 border-cyan-500/60 shadow-[0_0_30px_rgba(6,182,212,0.35)] flex items-center justify-center backdrop-blur-xl group">
            <IconRadar className="w-12 h-12 text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)] animate-pulse" />
            <div className="absolute -bottom-2 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/60 text-[9px] font-mono font-black text-cyan-300 tracking-wider uppercase">
              SOLANA
            </div>
          </div>
        </div>

        {/* App Title & Typography */}
        <div className="mt-8 text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-purple-300 font-mono drop-shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            MEME_CAT
          </h1>
          <p className="text-xs sm:text-sm font-mono tracking-widest text-slate-400 uppercase">
            AUTONOMOUS ON-CHAIN DISCOVERY MATRIX
          </p>
        </div>

        {/* Telemetry Initialization Feed */}
        <div className="mt-6 w-72 sm:w-84 h-16 bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 font-mono text-[11px] text-slate-400 flex flex-col justify-center space-y-1 shadow-inner backdrop-blur-md">
          {phase === 0 && (
            <div className="flex items-center gap-2 text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>&gt; INITIALIZING MEME_CAT PROTOCOL...</span>
            </div>
          )}
          {phase === 1 && (
            <div className="flex items-center gap-2 text-purple-300">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>&gt; CONNECTING GMGN TELEMETRY...</span>
            </div>
          )}
          {phase === 2 && (
            <div className="flex items-center gap-2 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>&gt; FAST-GATING ENGINES ARMED</span>
            </div>
          )}
          {phase >= 3 && (
            <div className="flex items-center gap-2 text-cyan-300 font-bold">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>&gt; SYSTEM READY • ENTERING TERMINAL</span>
            </div>
          )}
          
          {/* Progress Bar */}
          <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-purple-500 h-1 transition-all duration-500 rounded-full"
              style={{
                width: phase === 0 ? '25%' : phase === 1 ? '55%' : phase === 2 ? '85%' : '100%',
              }}
            />
          </div>
        </div>

        <p className="mt-4 text-[10px] font-mono text-slate-500">
          Tap anywhere to enter immediately
        </p>
      </div>
    </div>
  );
}

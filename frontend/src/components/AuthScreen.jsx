import React, { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = '/api';

// ── Icons ──────────────────────────────────────────────────────────

const IconMail = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const IconLock = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const IconCheck = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const IconEye = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const IconEyeOff = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

// ── PIN Dot Entry (4 digits, visual only) ──────────────────────────

function PinDots({ pin, showDigits, maxLen = 4 }) {
  return (
    <div className="flex gap-4 justify-center my-4">
      {Array.from({ length: maxLen }).map((_, i) => (
        <div
          key={i}
          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
            i < pin.length
              ? 'border-cyan-500 bg-cyan-950/50'
              : 'border-slate-700 bg-[#111520]'
          }`}
        >
          {i < pin.length && (
            <span className="text-white font-bold font-mono text-lg">
              {showDigits ? pin[i] : '•'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Numpad ─────────────────────────────────────────────────────────

function Numpad({ onPress, onDelete }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];
  return (
    <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto mt-2">
      {keys.map((k, i) => {
        if (k === '') return <div key={i} />;
        return (
          <button
            key={k}
            type="button"
            onClick={() => k === 'DEL' ? onDelete() : onPress(k)}
            className={`h-14 rounded-xl font-bold text-lg transition-all active:scale-95 ${
              k === 'DEL'
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm'
                : 'bg-[#1e293b] hover:bg-[#263549] text-white'
            }`}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

/**
 * Auth flow:
 *   'pin_login'  — user has email in localStorage & PIN set on server
 *   'email'      — step 1: enter Gmail
 *   'otp'        — step 2: enter 6-digit code
 *   'set_pin'    — step 3: create 4-digit PIN (first-time only)
 */
export default function AuthScreen({ onAuthSuccess }) {
  // Determine initial mode
  const savedEmail = localStorage.getItem('auth_email') || '';

  const [mode, setMode] = useState('checking'); // 'checking' while we probe /auth/pin-status
  const [email, setEmail] = useState(savedEmail);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep, setPinStep] = useState('enter'); // 'enter' | 'confirm'
  const [showDigits, setShowDigits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);
  const cooldownRef = useRef(null);
  const inputsRef = useRef([]);
  const emailInputRef = useRef(null);
  // JWT from OTP step — needed to call /auth/set-pin
  const pendingTokenRef = useRef(null);

  // ── On mount: determine which screen to show ───────────────────
  useEffect(() => {
    if (!savedEmail) {
      setMode('email');
      return;
    }
    // Check if this email has a PIN configured on server
    fetch(`${API_BASE}/auth/pin-status?email=${encodeURIComponent(savedEmail)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.hasPin) {
          setMode('pin_login');
        } else {
          setMode('email');
        }
      })
      .catch(() => setMode('email'));
  }, []); // eslint-disable-line

  // ── OTP countdown timer ────────────────────────────────────────
  useEffect(() => {
    if (mode === 'otp') {
      inputsRef.current[0]?.focus();
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      cooldownRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      setCooldown(60);
    }
    return () => {
      clearInterval(timerRef.current);
      clearInterval(cooldownRef.current);
    };
  }, [mode]);

  // ── Keyboard support for PIN numpad ───────────────────────────
  useEffect(() => {
    if (mode !== 'pin_login' && mode !== 'set_pin') return;
    const handler = (e) => {
      if (/^\d$/.test(e.key)) handlePinPress(e.key);
      else if (e.key === 'Backspace') handlePinDelete();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, pin, pinConfirm, pinStep]); // eslint-disable-line

  // ── Send OTP ───────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (!email || !email.endsWith('@gmail.com')) {
      setError('Please enter a valid @gmail.com address');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to send verification code');
      // Save email so PIN login knows which account to use
      localStorage.setItem('auth_email', email);
      setMode('otp');
      setTimeLeft(300);
      setOtp(['', '', '', '', '', '']);
      setSuccessMsg(data.message || 'Code sent to your Gmail inbox.');
    } catch (err) {
      if (err.name === 'AbortError') setError('Request timed out. Please try again.');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Verify OTP ─────────────────────────────────────────────────
  const handleVerifyOtp = async (code) => {
    const codeStr = code || otp.join('');
    if (codeStr.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: codeStr }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Verification failed');

      // Store JWT for use in set-pin call
      pendingTokenRef.current = data.token;

      if (data.hasPinSet) {
        // PIN already set — go straight in
        onAuthSuccess(data.token, email);
      } else {
        // First time — ask user to create a PIN
        setMode('set_pin');
        setPin('');
        setPinConfirm('');
        setPinStep('enter');
      }
    } catch (err) {
      if (err.name === 'AbortError') setError('Verification timed out. Please try again.');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── OTP digit input handler ────────────────────────────────────
  const handleOtpChange = (idx, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 5) inputsRef.current[idx + 1]?.focus();
    if (next.every(d => d !== '')) handleVerifyOtp(next.join(''));
  };

  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputsRef.current[idx - 1]?.focus();
  };

  // ── PIN numpad handlers ────────────────────────────────────────
  const handlePinPress = useCallback((digit) => {
    if (mode === 'pin_login') {
      setPin(prev => prev.length < 4 ? prev + digit : prev);
    } else if (mode === 'set_pin') {
      if (pinStep === 'enter') setPin(prev => prev.length < 4 ? prev + digit : prev);
      else setPinConfirm(prev => prev.length < 4 ? prev + digit : prev);
    }
  }, [mode, pinStep]);

  const handlePinDelete = useCallback(() => {
    if (mode === 'pin_login') setPin(prev => prev.slice(0, -1));
    else if (mode === 'set_pin') {
      if (pinStep === 'enter') setPin(prev => prev.slice(0, -1));
      else setPinConfirm(prev => prev.slice(0, -1));
    }
  }, [mode, pinStep]);

  // Auto-submit when 4th digit entered
  useEffect(() => {
    if (mode === 'pin_login' && pin.length === 4) handleVerifyPin();
  }, [pin]); // eslint-disable-line

  useEffect(() => {
    if (mode === 'set_pin' && pinStep === 'enter' && pin.length === 4) {
      setPinStep('confirm');
      setPinConfirm('');
    }
  }, [pin, pinStep, mode]);

  useEffect(() => {
    if (mode === 'set_pin' && pinStep === 'confirm' && pinConfirm.length === 4) {
      handleSavePin();
    }
  }, [pinConfirm, pinStep, mode]); // eslint-disable-line

  // ── Verify PIN login ───────────────────────────────────────────
  const handleVerifyPin = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${API_BASE}/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: savedEmail || email, pin }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Incorrect PIN');
      onAuthSuccess(data.token, data.user?.email || savedEmail);
    } catch (err) {
      if (err.name === 'AbortError') setError('Request timed out. Please try again.');
      else setError(err.message);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  // ── Save new PIN ───────────────────────────────────────────────
  const handleSavePin = async () => {
    if (pin !== pinConfirm) {
      setError('PINs do not match. Please try again.');
      setPinStep('enter');
      setPin('');
      setPinConfirm('');
      return;
    }
    if (!pendingTokenRef.current) {
      setError('Session error. Please log in again.');
      setMode('email');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${API_BASE}/auth/set-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pendingTokenRef.current}`,
        },
        body: JSON.stringify({ pin }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save PIN');
      onAuthSuccess(pendingTokenRef.current, email);
    } catch (err) {
      if (err.name === 'AbortError') setError('Request timed out. Please try again.');
      else setError(err.message);
      setPin('');
      setPinConfirm('');
      setPinStep('enter');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared UI ──────────────────────────────────────────────────

  const ErrorBox = ({ msg }) => msg ? (
    <div className="mb-4 p-3 bg-red-900/20 border border-red-500/40 rounded-lg text-red-400 text-sm text-center">
      {msg}
    </div>
  ) : null;

  const SuccessBox = ({ msg }) => msg ? (
    <div className="mb-4 p-3 bg-emerald-900/20 border border-emerald-500/40 rounded-lg text-emerald-400 text-sm text-center">
      {msg}
    </div>
  ) : null;

  // ── Screens ────────────────────────────────────────────────────

  if (mode === 'checking') {
    return (
      <div className="fixed inset-0 z-[200] bg-[#080b12] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // PIN login screen (returning user with PIN set)
  if (mode === 'pin_login') {
    const displayEmail = savedEmail || email;
    return (
      <div className="fixed inset-0 z-[200] bg-[#080b12] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-xs bg-[#0a0e18] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-cyan-900/30 rounded-full flex items-center justify-center mb-4">
              <IconLock className="w-7 h-7 text-cyan-400" />
            </div>
            <h2 className="text-xl font-black text-white text-center">Enter Your PIN</h2>
            {displayEmail && (
              <p className="text-xs text-slate-500 text-center mt-1 font-mono">{displayEmail}</p>
            )}
          </div>

          <ErrorBox msg={error} />

          <PinDots pin={pin} showDigits={showDigits} />

          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowDigits(v => !v)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
            >
              {showDigits ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
              {showDigits ? 'Hide' : 'Show'}
            </button>
          </div>

          <Numpad onPress={handlePinPress} onDelete={handlePinDelete} />

          {loading && (
            <p className="text-center text-xs text-slate-500 mt-4 animate-pulse">Verifying...</p>
          )}

          <button
            onClick={() => { setMode('email'); setPin(''); setError(null); }}
            className="w-full mt-6 text-xs text-slate-500 hover:text-slate-300 underline text-center transition-colors"
          >
            Use Gmail OTP instead
          </button>
        </div>
      </div>
    );
  }

  // Set PIN screen (first time after OTP verified)
  if (mode === 'set_pin') {
    const isConfirmStep = pinStep === 'confirm';
    const currentPin = isConfirmStep ? pinConfirm : pin;
    return (
      <div className="fixed inset-0 z-[200] bg-[#080b12] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-xs bg-[#0a0e18] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
              <IconLock className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-black text-white text-center">
              {isConfirmStep ? 'Confirm Your PIN' : 'Create a 4-Digit PIN'}
            </h2>
            <p className="text-xs text-slate-400 text-center mt-2">
              {isConfirmStep
                ? 'Enter the same PIN again to confirm'
                : 'You will use this PIN to log in on future visits'}
            </p>
          </div>

          <ErrorBox msg={error} />

          <PinDots pin={currentPin} showDigits={showDigits} />

          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowDigits(v => !v)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
            >
              {showDigits ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
              {showDigits ? 'Hide' : 'Show'}
            </button>
          </div>

          <Numpad onPress={handlePinPress} onDelete={handlePinDelete} />

          {loading && (
            <p className="text-center text-xs text-slate-500 mt-4 animate-pulse">Saving PIN...</p>
          )}
        </div>
      </div>
    );
  }

  // Email step (step 1)
  if (mode === 'email') {
    return (
      <div className="fixed inset-0 z-[200] bg-[#080b12] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0a0e18] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-cyan-900/30 rounded-full flex items-center justify-center mb-4">
              <IconMail className="w-7 h-7 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-black text-white text-center">Secure Authentication</h2>
            <p className="text-sm text-slate-400 text-center mt-2">
              Enter your Gmail address to receive a verification code
            </p>
          </div>

          <ErrorBox msg={error} />

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">Gmail Address</label>
              <input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                placeholder="you@gmail.com"
                className="w-full bg-[#111520] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                onKeyDown={e => e.key === 'Enter' && handleSendCode()}
                autoFocus
              />
            </div>
            <button
              onClick={handleSendCode}
              disabled={loading || !email}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </div>

          <p className="text-[11px] text-slate-600 text-center mt-6">
            Only @gmail.com addresses are supported. The code expires in 5 minutes.
          </p>
        </div>
      </div>
    );
  }

  // OTP step (step 2)
  return (
    <div className="fixed inset-0 z-[200] bg-[#080b12] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0a0e18] border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-cyan-900/30 rounded-full flex items-center justify-center mb-4">
            <IconCheck className="w-7 h-7 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-black text-white text-center">Check Your Gmail</h2>
          <p className="text-sm text-slate-400 text-center mt-2">
            A 6-digit code was sent to <span className="text-white font-semibold">{email}</span>
          </p>
        </div>

        <ErrorBox msg={error} />
        <SuccessBox msg={successMsg} />

        <div className="mb-2 p-3 bg-slate-900/70 border border-slate-800 rounded-xl text-center">
          <p className="text-xs text-amber-400 font-medium">Check your Spam / Junk folder if the code is not in your inbox.</p>
        </div>

        <div className="flex justify-between gap-2 mb-5 mt-4">
          {otp.map((d, i) => (
            <input
              key={i}
              ref={el => inputsRef.current[i] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleOtpChange(i, e.target.value)}
              onKeyDown={e => handleOtpKey(i, e)}
              className="w-12 h-14 bg-[#111520] border border-slate-700 rounded-xl text-center text-xl font-mono text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
          ))}
        </div>

        <button
          onClick={() => handleVerifyOtp()}
          disabled={loading || otp.some(d => !d) || timeLeft === 0}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? 'Verifying...' : (
            <><IconCheck className="w-5 h-5" /> Verify Code</>
          )}
        </button>

        <div className="flex items-center justify-between text-xs font-mono text-slate-500 mt-4">
          <span>Expires in: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
          <button
            onClick={handleSendCode}
            disabled={cooldown > 0 || loading}
            className="text-cyan-400 hover:text-cyan-300 disabled:text-slate-600 underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
          </button>
        </div>

        <button
          onClick={() => { setMode('email'); setOtp(['', '', '', '', '', '']); setError(null); setSuccessMsg(null); }}
          className="w-full mt-4 text-xs text-slate-500 hover:text-slate-300 underline text-center transition-colors"
        >
          Change email address
        </button>
      </div>
    </div>
  );
}

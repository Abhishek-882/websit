import React, { useState, useRef, useEffect } from 'react';

const API_BASE = '/api';

const IconMail = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const IconCheck = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function AuthScreen({ onAuthSuccess }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [timeLeft, setTimeLeft] = useState(300); // 5 mins
  const [cooldown, setCooldown] = useState(0); // 60s for resend
  const [backupOtp, setBackupOtp] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  const timerRef = useRef(null);
  const cooldownRef = useRef(null);
  const inputsRef = useRef([]);

  useEffect(() => {
    if (step === 2) {
      inputsRef.current[0]?.focus();
      
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      cooldownRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setCooldown(60);
    }
    return () => {
      clearInterval(timerRef.current);
      clearInterval(cooldownRef.current);
    };
  }, [step]);

  const handleSendCode = async () => {
    if (!email || !email.endsWith('@gmail.com')) {
      setError('Please enter a valid @gmail.com address');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to send OTP');
      
      setStep(2);
      setTimeLeft(300);
      setCooldown(60);
      if (data.backupOtp) {
        setBackupOtp(data.backupOtp);
        setInfoMsg(data.message || 'Verification code generated');
        const digits = data.backupOtp.split('');
        if (digits.length === 6) {
          setOtp(digits);
        }
      } else {
        setBackupOtp(null);
        setInfoMsg(data.message || 'OTP sent to your Gmail inbox (check spam/junk folder).');
        setOtp(['', '', '', '', '', '']);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Server request timed out. Please try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code) => {
    const codeStr = code || otp.join('');
    if (codeStr.length !== 6) return;

    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: codeStr }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to verify OTP');
      
      onAuthSuccess(data.token);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Verification timed out. Please try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (idx, val) => {
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[idx] = val;
    setOtp(newOtp);

    if (val && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
    
    if (newOtp.every(d => d !== '')) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#080b12] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0a0e18] border border-slate-800 rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-cyan-900/30 rounded-full flex items-center justify-center mb-4">
            <IconMail className="w-6 h-6 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-black text-white text-center">Secure Authentication</h2>
          <p className="text-sm text-slate-400 text-center mt-2">
            Login with your Gmail to access Solana Radar
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Gmail Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full bg-[#111520] border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                onKeyDown={e => e.key === 'Enter' && handleSendCode()}
              />
            </div>
            <button
              onClick={handleSendCode}
              disabled={loading || !email}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Code'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-center text-slate-300 mb-3">
                Enter the 6-digit code for <br/><strong className="text-white">{email}</strong>
              </p>

              {backupOtp ? (
                <div className="mb-4 p-3 bg-cyan-950/70 border border-cyan-500/50 rounded-lg text-center space-y-1 shadow-lg">
                  <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider block">Instant Verification Code</span>
                  <div className="font-mono text-2xl font-black text-white tracking-widest bg-cyan-900/50 py-1 px-4 rounded border border-cyan-400/40 inline-block my-1">
                    {backupOtp}
                  </div>
                  <p className="text-[10px] text-cyan-200/80">
                    Code pre-filled below. Click "Verify & Continue" to enter.
                  </p>
                </div>
              ) : (
                <div className="mb-3 p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-center">
                  <p className="text-xs text-slate-300">{infoMsg || 'Code sent to your Gmail inbox.'}</p>
                  <p className="text-[10px] text-amber-400 mt-0.5">Please check your Spam/Junk folder if not in inbox.</p>
                </div>
              )}

              <div className="flex justify-between gap-2 mb-2">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={el => inputsRef.current[i] = el}
                    type="text"
                    maxLength={1}
                    value={d}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="w-12 h-14 bg-[#111520] border border-slate-700 rounded-lg text-center text-xl font-mono text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => handleVerify()}
              disabled={loading || otp.some(d => !d) || timeLeft === 0}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Verifying...' : (
                <>
                  <IconCheck className="w-5 h-5" /> Verify Code
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Code expires in: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
              <button
                onClick={handleSendCode}
                disabled={cooldown > 0 || loading}
                className="text-cyan-400 hover:text-cyan-300 disabled:text-slate-600 underline"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

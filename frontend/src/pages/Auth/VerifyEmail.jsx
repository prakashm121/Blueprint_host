import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';

export default function VerifyEmail() {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token found.');
      return;
    }
    api.get('/api/v1/auth/verify', { params: { token } })
      .then((res) => {
        setStatus('success');
        setMessage(res.data?.message || 'Email verified successfully.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.detail || 'Verification failed.');
      });
  }, []);

  return (
    <div className="min-h-screen bg-background-deep text-on-surface font-sans flex flex-col items-center justify-center relative px-6 py-12 overflow-hidden bg-grid-pattern">
      
      {/* Decorative Lights depending on the verification state */}
      {status === 'loading' && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-primary-fixed-dim/10 rounded-full blur-[80px] pointer-events-none transition-all"></div>
      )}
      {status === 'success' && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-success/10 rounded-full blur-[80px] pointer-events-none transition-all"></div>
      )}
      {status === 'error' && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-red-500/10 rounded-full blur-[80px] pointer-events-none transition-all"></div>
      )}

      {/* Main Glass Form Container */}
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative z-10 flex flex-col items-center border border-border-subtle text-center">
        
        {/* Loading State Rendering Layout */}
        {status === 'loading' && (
          <div className="py-6 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-container/20 border border-primary-container/30 flex items-center justify-center text-primary-fixed-dim mb-5 shadow-sm">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-on-surface">Validating credentials</h1>
            <p className="text-xs text-on-surface-variant mt-2 max-w-xs leading-relaxed">
              Securing encryption channels and verifying your account configuration. Please hold...
            </p>
          </div>
        )}

        {/* Success State Rendering Layout */}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-success/10 border border-success/30 flex items-center justify-center text-success mb-5 shadow-sm">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-on-surface">Email verified</h1>
            <p className="text-xs text-on-surface-variant mt-2 mb-6 max-w-xs leading-relaxed">
              {message || "Your academic profile is ready. You may now continue onto your dashboard setup."}
            </p>
            <Link 
              to="/login" 
              className="w-full bg-surface-container-highest hover:bg-surface-bright text-on-surface font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 cursor-pointer border border-border-subtle transition-all active:scale-[0.98]"
            >
              Sign In
            </Link>
          </>
        )}

        {/* Error State Rendering Layout */}
        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-5 shadow-sm">
              <XCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-on-surface">Verification failed</h1>
            <p className="text-xs text-on-surface-variant mt-2 mb-6 max-w-xs leading-relaxed">
              {message || "The confirmation security token has either expired, or was corrupted during execution."}
            </p>
            <Link 
              to="/login" 
              className="w-full bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 cursor-pointer border border-border-subtle transition-all active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </>
        )}

      </div>
    </div>
  );
}
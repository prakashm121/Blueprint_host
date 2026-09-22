import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Award, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [token, navigate]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error("Google login error:", err);
      setError(err.message || 'Failed to login with Google.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
      <div className="absolute top-1/4 -left-64 w-96 h-96 bg-primary-fixed-dim/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-64 w-96 h-96 bg-primary-fixed-dim/10 rounded-full blur-[128px] pointer-events-none" />

      {/* Back to Home Link */}
      <Link 
        to="/" 
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors z-20 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>

      {/* Main Glass Form Container */}
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative z-10 flex flex-col items-center border border-border-subtle">
        
        {/* Brand Logo */}
        <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary-fixed-dim mb-4 border border-border-subtle">
          <Award className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-on-surface">Blueprint</h2>
        <p className="text-xs text-on-surface-variant mb-8 mt-1 text-center">Sign in to your engineering career tracker</p>

        {/* Validation Errors & Alerts */}
        {error && (
          <div className="w-full bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          type="button"
          className="flex items-center justify-center gap-3 w-full py-3 border border-border-subtle bg-surface-container hover:bg-surface-container-high rounded-lg text-sm font-semibold cursor-pointer transition-colors text-on-surface disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

      </div>
    </div>
  );
}


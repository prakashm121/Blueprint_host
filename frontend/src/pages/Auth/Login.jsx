import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import ThemeToggle from '../../components/ThemeToggle';
import PlanModel from '../../components/model/PlanModel';
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
    <div className="animate-page-in blueprint-grid relative flex min-h-screen flex-col bg-background-deep px-5 py-6 text-paper">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-line transition-colors hover:text-paper"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to home
        </Link>
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center gap-10 py-10 lg:justify-between">
        {/* Large screens only: on a phone the sign-in button should be the first thing on screen. */}
        <div className="hidden w-full max-w-[30rem] lg:block">
          <PlanModel
            progress={1 / 12}
            variant="hero"
            label="3D model of a plan tower with only its first floor built."
            className="aspect-square w-full"
          />
          <p className="mt-1 text-center text-sm text-line">Week one starts the moment you sign in.</p>
        </div>

        <main className="crop-marks w-full max-w-[26rem] border border-paper/35 bg-surface-card px-7 py-9 sm:px-10 sm:py-11">
          <BrandMark className="h-11 w-11" />
          <h1 className="type-title mt-7 text-[1.9rem] text-paper">Sign in to Blueprint</h1>
          <p className="mt-3 leading-relaxed text-line">
            Use your Google account. If you&rsquo;re new, this also creates your account.
          </p>

          {error && (
            <div role="alert" className="mt-6 border-l-2 border-redline bg-redline/10 px-4 py-3 text-sm leading-relaxed text-paper">
              <p className="font-semibold">Google sign-in didn&rsquo;t start.</p>
              <p className="mt-1 text-line">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            type="button"
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg bg-paper px-5 py-3.5 text-[0.95rem] font-semibold text-background-deep transition-colors hover:bg-paper/90 active:translate-y-px disabled:cursor-wait disabled:opacity-80"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Opening Google&hellip;
              </>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <p className="mt-6 text-sm leading-relaxed text-line">
            After signing in you&rsquo;ll set a target role and rate your skills, then Blueprint drafts your first plan.
          </p>
        </main>
      </div>
    </div>
  );
}

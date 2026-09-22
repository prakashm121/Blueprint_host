import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';

export default function CheckEmail() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') || 'your inbox';

  return (
    <div className="min-h-screen bg-background-deep text-on-surface font-sans flex flex-col items-center justify-center relative px-6 py-12 overflow-hidden bg-grid-pattern">
      
      {/* Decorative Accent Lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-primary-fixed-dim/10 rounded-full blur-[80px] pointer-events-none"></div>

      {/* Navigation Link back to Login */}
      <Link
        to="/login"
        className="absolute top-8 left-8 text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-surface-container-low border border-transparent hover:border-border-subtle transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Login
      </Link>

      {/* Glassmorphic Panel Container */}
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative z-10 flex flex-col items-center border border-border-subtle text-center">
        
        {/* Animated Status Icon Frame */}
        <div className="w-14 h-14 rounded-2xl bg-primary-container/20 border border-primary-container/30 flex items-center justify-center text-primary-fixed-dim mb-5 shadow-sm animate-pulse">
          <Mail className="w-6 h-6" />
        </div>

        {/* Headings */}
        <h1 className="text-xl font-bold tracking-tight text-on-surface">Check your email</h1>
        <p className="text-xs text-on-surface-variant mt-3 mb-5 leading-relaxed max-w-xs">
          We sent a secure verification activation link to <br />
          <span className="text-primary-fixed-dim font-semibold bg-surface-container/60 border border-border-subtle/50 px-2 py-0.5 rounded mt-1 inline-block break-all">
            {email}
          </span>
        </p>

        {/* Information Callout */}
        <div className="w-full bg-surface-container/40 border border-border-subtle/40 rounded-xl p-3.5 mb-8 text-left">
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            <span className="font-bold text-on-surface">Didn't find it?</span> Make sure to inspect your spam or promotions folder. If the activation window expires, you can issue a fresh token using the resend action on the login page.
          </p>
        </div>

        {/* Primary Navigation Button */}
        <Link
          to="/login"
          className="w-full bg-surface-container-highest hover:bg-surface-bright text-on-surface font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 cursor-pointer border border-border-subtle transition-all active:scale-[0.98]"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}
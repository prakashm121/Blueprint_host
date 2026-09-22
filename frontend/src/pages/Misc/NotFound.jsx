import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-16 sm:px-8">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/95 p-10 text-center shadow-2xl shadow-slate-950/40">
        <p className="text-sm uppercase tracking-[0.35em] text-sky-400/80">Page not found</p>
        <h1 className="mt-5 text-4xl font-semibold text-white">Sorry, we couldn't find that page.</h1>
        <p className="mt-4 text-slate-400">The page you're looking for may have moved or no longer exists.</p>
        <Link
          to="/"
          className="mt-8 inline-flex rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  );
}

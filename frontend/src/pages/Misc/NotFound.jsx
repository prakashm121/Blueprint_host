import { Link } from 'react-router-dom';
import { BrandMark } from '../../components/BrandMark';
import PlanModel from '../../components/model/PlanModel';

export default function NotFound() {
  return (
    <div className="animate-page-in blueprint-grid flex min-h-screen items-center justify-center bg-background-deep px-5 py-16 text-paper">
      <div className="grid w-full max-w-4xl items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10">
        {/* A floor knocked out of the tower: the page that should be here. */}
        <PlanModel
          variant="broken"
          label="3D model of a plan tower with one floor knocked out of place."
          className="mx-auto aspect-[4/3] w-full max-w-sm md:max-w-none"
        />

        <main className="crop-marks w-full border border-paper/35 bg-surface-card px-7 py-10 sm:px-10">
          <BrandMark className="h-10 w-10" />
          <p className="mt-7 text-sm font-semibold text-highlight">404</p>
          <h1 className="type-title mt-2 text-3xl text-paper">This page isn&rsquo;t on the plan.</h1>
          <p className="mt-3 leading-relaxed text-line">
            The link may be out of date, or the page has moved. Head back and pick up where you left off.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-highlight px-5 text-sm font-semibold text-ink transition-colors hover:bg-primary-fixed"
            >
              Go to dashboard
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-paper/35 px-5 text-sm font-semibold text-paper transition-colors hover:border-paper/70"
            >
              Home page
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}

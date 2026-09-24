import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import FetchBar from './FetchBar';

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-dvh overflow-hidden bg-background-deep text-on-surface antialiased">
      <Sidebar />
      <FetchBar />
      <main className="relative h-dvh flex-1 overflow-y-auto">
        {/* Keyed by path so each page settles in when you navigate to it. */}
        <div key={pathname} className="animate-page-in h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background-deep font-body-base antialiased text-on-surface">
      <Sidebar />
      <main className="flex-1 overflow-y-auto h-screen relative pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

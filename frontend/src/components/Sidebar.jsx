import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Notifications from '../pages/Notifications/Notifications';

/** Shared nav-item class builder */
const navCls = (isActive) =>
  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
    isActive
      ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
  }`;

const childNavCls = (isActive) =>
  `flex items-center gap-3 px-4 py-2 rounded-xl transition-all font-medium text-sm ml-6 ${
    isActive
      ? 'text-primary bg-primary/5'
      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
  }`;

/** The nav link list, reused by both sidebar and mobile drawer */
function NavLinks({ onNavigate, isInterviewHubActive, interviewHubOpen, setInterviewHubOpen, setNotificationsOpen }) {
  return (
    <>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavLink to="/dashboard" className={({ isActive }) => navCls(isActive)} onClick={onNavigate}>
          <span className="material-symbols-outlined text-[20px]">dashboard</span>
          Dashboard
        </NavLink>

        <NavLink to="/planner" className={({ isActive }) => navCls(isActive)} onClick={onNavigate}>
          <span className="material-symbols-outlined text-[20px]">calendar_today</span>
          Weekly Planner
        </NavLink>

        <NavLink to="/mentor" className={({ isActive }) => navCls(isActive)} onClick={onNavigate}>
          <span className="material-symbols-outlined text-[20px]">smart_toy</span>
          AI Mentor
        </NavLink>

        <NavLink to="/vault" className={({ isActive }) => navCls(isActive)} onClick={onNavigate}>
          <span className="material-symbols-outlined text-[20px]">inventory_2</span>
          Knowledge Vault
        </NavLink>

        {/* Expandable Interview Hub */}
        <div className="space-y-1">
          <button
            onClick={() => setInterviewHubOpen(!interviewHubOpen)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-medium text-sm ${
              isInterviewHubActive
                ? 'bg-surface-container text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">code_blocks</span>
              Interview Hub
            </div>
            <span className={`material-symbols-outlined text-[20px] transition-transform ${interviewHubOpen ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {interviewHubOpen && (
            <div className="space-y-1 mt-1">
              <NavLink to="/interview-hub/dsa" className={({ isActive }) => childNavCls(isActive)} onClick={onNavigate}>
                <span className="material-symbols-outlined text-[18px]">terminal</span>
                Coding Problems
              </NavLink>
              <NavLink to="/interview-hub/qa" className={({ isActive }) => childNavCls(isActive)} onClick={onNavigate}>
                <span className="material-symbols-outlined text-[18px]">forum</span>
                Interview Q&A
              </NavLink>
              <NavLink to="/interview-hub/quiz" className={({ isActive }) => childNavCls(isActive)} onClick={onNavigate}>
                <span className="material-symbols-outlined text-[18px]">quiz</span>
                Quiz Engine
              </NavLink>
            </div>
          )}
        </div>

        <NavLink to="/resume-analyser" className={({ isActive }) => navCls(isActive)} onClick={onNavigate}>
          <span className="material-symbols-outlined text-[20px]">description</span>
          Resume Analyser
        </NavLink>
      </nav>

      <div className="p-4 shrink-0 border-t border-border-subtle space-y-2">
        <button
          onClick={() => { setNotificationsOpen(true); if (onNavigate) onNavigate(); }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          Notifications
        </button>

        <NavLink
          to="/profile"
          className={({ isActive }) => navCls(isActive)}
          onClick={onNavigate}
        >
          <span className="material-symbols-outlined text-[20px]">account_circle</span>
          Profile
        </NavLink>
      </div>
    </>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const isInterviewHubActive = location.pathname.startsWith('/interview-hub');

  const [interviewHubOpen, setInterviewHubOpen] = useState(isInterviewHubActive);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sharedProps = {
    isInterviewHubActive,
    interviewHubOpen,
    setInterviewHubOpen,
    setNotificationsOpen,
  };

  return (
    <>
      {/* ── DESKTOP SIDEBAR (md and above) ─────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-surface-card border-r border-border-subtle h-screen flex-col z-20">
        <div className="p-5 flex items-center gap-2 border-b border-border-subtle shrink-0">
          <span className="text-xl font-bold tracking-tight text-on-surface">Blueprint</span>
        </div>
        <NavLinks {...sharedProps} />
      </aside>

      {/* ── MOBILE TOP BAR (below md) ──────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-surface-card border-b border-border-subtle flex items-center justify-between px-4 h-14 shadow-sm">
        <div className="flex items-center gap-2">
          
          <span className="text-base font-bold tracking-tight text-on-surface">Blueprint</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          aria-label="Open menu"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>
      </header>

      {/* ── MOBILE DRAWER OVERLAY ──────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-surface-card border-r border-border-subtle flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 h-14 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2">
                <div className="bg-primary text-on-primary font-bold text-base rounded-lg w-7 h-7 flex items-center justify-center">
                  P
                </div>
                <span className="text-base font-bold tracking-tight text-on-surface">PlacementOS</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
                aria-label="Close menu"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 flex flex-col overflow-y-auto">
              <NavLinks
                {...sharedProps}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS DRAWER (global) ─────────────────────────── */}
      <Notifications isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}

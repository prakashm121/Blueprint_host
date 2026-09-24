import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Check, Inbox } from 'lucide-react';
import { usePresence } from '../../lib/motion';

const TYPE_STYLES = {
  system:      { bg: 'color-mix(in srgb, var(--tone-blue) 12%, transparent)', text: 'var(--tone-blue)', border: 'color-mix(in srgb, var(--tone-blue) 20%, transparent)' },
  planner:     { bg: 'color-mix(in srgb, var(--tone-violet) 12%, transparent)', text: 'var(--tone-violet)', border: 'color-mix(in srgb, var(--tone-violet) 20%, transparent)' },
  mentor:      { bg: 'color-mix(in srgb, var(--tone-orange) 12%, transparent)', text: 'var(--tone-orange)', border: 'color-mix(in srgb, var(--tone-orange) 20%, transparent)' },
  achievement: { bg: 'color-mix(in srgb, var(--tone-green) 12%, transparent)', text: 'var(--tone-green)', border: 'color-mix(in srgb, var(--tone-green) 20%, transparent)' },
  default:     { bg: 'color-mix(in srgb, var(--tone-slate) 12%, transparent)', text: 'var(--tone-slate)', border: 'color-mix(in srgb, var(--tone-slate) 20%, transparent)' },
};

export default function Notifications({ isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const { mounted, closing } = usePresence(isOpen, 200);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/api/v1/notifications/');
      return res.data;
    },
    enabled: isOpen,
  });

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const filtered = filter === 'unread'
    ? notifications.filter((n) => !n.read_at)
    : notifications;

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Notifications">
      {/* Backdrop */}
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'backdrop-out' : 'backdrop-in'}`} onClick={onClose} />
      {/* Drawer panel: slides in from the right, and back out */}
      <div
        className={`relative w-full max-w-md h-full bg-surface-card border-l border-border-subtle shadow-2xl flex flex-col text-on-surface ${
          closing ? 'panel-out pointer-events-none' : 'panel-in'
        }`}
      >

        {/* ── Header (fixed, never scrolls) ── */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border-subtle space-y-4">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-on-surface tracking-tight">Notifications</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">Updates & system activity</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Filter tabs + Mark all read */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl border border-border-subtle">
              {['all', 'unread'].map((f) => {
                const count = f === 'unread' ? unreadCount : notifications.length;
                const isActive = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex min-h-10 sm:min-h-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="capitalize">{f}</span>
                    <span className={`text-[10px] font-bold ${isActive ? 'text-primary/70' : 'text-on-surface-variant/50'}`}>
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="min-h-10 rounded-lg px-2 text-xs font-semibold text-primary hover:text-primary/80 transition shrink-0"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* ── Scrollable notification list ── */}
        <div key={filter} className="stagger-list flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {isLoading && (
            <div className="py-16 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-on-surface-variant">Loading notifications...</p>
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-border-subtle bg-surface-container/40">
              <Inbox className="h-7 w-7 text-on-surface-variant/30 mb-3" />
              <p className="text-sm font-medium text-on-surface-variant">All caught up!</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">No notifications in "{filter}" filter.</p>
            </div>
          )}

          {!isLoading && filtered.map((n) => {
            const typeKey = n.notification_type?.toLowerCase() || 'default';
            const badge = TYPE_STYLES[typeKey] || TYPE_STYLES.default;
            const isUnread = !n.read_at;

            return (
              <div
                key={n.id}
                className={`group relative rounded-xl border p-4 transition-all duration-150 ${
                  isUnread
                    ? 'bg-surface-container border-border-subtle hover:border-primary/30'
                    : 'bg-surface-container/30 border-border-subtle/40 opacity-60 transition-opacity duration-500'
                }`}
              >
                {/* Unread indicator dot */}
                {isUnread && (
                  <span className="absolute top-4 left-2.5 w-1.5 h-1.5 rounded-full bg-primary block" />
                )}

                <div className="pl-2">
                  {/* Top row: title + badge + mark-read button */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <h4 className={`text-sm font-semibold tracking-tight truncate max-w-[200px] ${isUnread ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                        {n.title}
                      </h4>
                      <span
                        className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border shrink-0"
                        style={{ background: badge.bg, color: badge.text, borderColor: badge.border }}
                      >
                        {n.notification_type || 'system'}
                      </span>
                    </div>

                    {isUnread && (
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 inline-flex h-6 w-6 pointer-coarse:h-10 pointer-coarse:w-10 items-center justify-center rounded-md border border-border-subtle bg-surface-card text-on-surface-variant hover:border-primary hover:text-primary transition cursor-pointer"
                        title="Mark as read"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Body */}
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {n.body}
                  </p>

                  {/* Action link */}
                  {n.action_url && (
                    <div className="mt-2">
                      <Link
                        to={n.action_url}
                        onClick={onClose}
                        className="-ml-1 inline-flex min-h-9 items-center rounded-md px-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition"
                      >
                        View details →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
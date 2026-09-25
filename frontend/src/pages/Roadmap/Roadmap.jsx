import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useInView } from '../../lib/motion';
import {
  ArrowLeft, Map, Sparkles, CheckCircle2, Circle, Loader2,
  BookOpen, Code2, Layers, FileText, Briefcase, Building2, Mic,
  RefreshCw,
} from 'lucide-react';

const CATEGORY_META = {
  'DSA':                  { icon: Code2,      color: 'text-violet-400',  bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: 'bg-violet-500' },
  'Subjects':             { icon: BookOpen,   color: 'text-highlight',     bg: 'bg-highlight/10',    border: 'border-highlight/20',    dot: 'bg-highlight' },
  'System Design':        { icon: Layers,     color: 'text-amber-400',   bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  dot: 'bg-amber-500' },
  'Resume':               { icon: FileText,   color: 'text-emerald-400', bg: 'bg-emerald-500/10',border: 'border-emerald-500/20',dot: 'bg-emerald-500' },
  'Projects':             { icon: Briefcase,  color: 'text-orange-400',  bg: 'bg-orange-500/10', border: 'border-orange-500/20', dot: 'bg-orange-500' },
  'Company Preparation':  { icon: Building2,  color: 'text-pink-400',    bg: 'bg-pink-500/10',   border: 'border-pink-500/20',   dot: 'bg-pink-500' },
  'Mock Interview':       { icon: Mic,        color: 'text-highlight',    bg: 'bg-highlight/10',   border: 'border-highlight/20',   dot: 'bg-highlight' },
};

const STATUS_CYCLE = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' };

/**
 * Splits a milestone description into its bullet points.
 *
 * Normally each bullet is on its own line ("- First step\n- Second step"). Some older
 * AI-generated roadmaps were saved with the bullets run together on one line instead
 * (e.g. "...language.- Study Operating Systems...- Master Database..."), because the
 * newline never made it into the JSON. Before splitting on real line breaks, insert a
 * break wherever a sentence ends and is immediately followed by "- " and a capital
 * letter, which is the specific shape that bug produces — this won't touch ordinary
 * hyphenated words like "front-end", since those never follow a period.
 */
function splitDescriptionPoints(description) {
  const normalized = description
    .replace(/\r\n/g, '\n')
    .replace(/\.-\s+(?=[A-Z])/g, '.\n- ');
  return normalized
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

// ── Inline generator panel — shown when no roadmap exists ─────────────────────
function GenerateRoadmapPanel({ onGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      await api.post('/api/v1/onboarding/generate-roadmap');
      onGenerated();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to generate roadmap. Please try again.');
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-deep flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 bg-highlight/10 rounded-3xl flex items-center justify-center">
          {generating
            ? <div className="w-10 h-10 rounded-full border-2 border-primary-fixed border-t-transparent animate-spin" />
            : <Map className="w-10 h-10 text-highlight" />}
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-paper">
            {generating ? 'Building your roadmap…' : 'No roadmap yet'}
          </h2>
          <p className="text-line text-sm leading-relaxed">
            {generating
              ? 'Our AI is generating a personalised milestone roadmap based on your profile and career goals. This takes 10–20 seconds.'
              : "You haven't generated your role roadmap yet. Click below — no need to redo onboarding."}
          </p>
        </div>
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-highlight px-4 py-3 text-base font-semibold text-ink transition hover:bg-primary-fixed disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            : <><Sparkles className="w-4 h-4" /> Generate my roadmap</>}
        </button>
        <Link to="/dashboard" className="inline-block text-sm text-line hover:text-on-surface transition">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}

// ── Zigzag milestone card (left / right alternating) ──────────────────────────
function MilestoneCard({ milestone, index, onStatusChange, isPending, justChanged }) {
  // Each milestone fades up once as it scrolls into view (on the card itself, so odd/even zigzag still works).
  const [revealRef, revealed] = useInView({ threshold: 0.2 });
  const meta = CATEGORY_META[milestone.category] || CATEGORY_META['DSA'];
  const Icon = meta.icon;
  const isCompleted = milestone.status === 'completed';
  const isInProgress = milestone.status === 'in_progress';

  return (
    <div ref={revealRef} data-revealed={revealed} className="reveal relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">

      {/* Centre dot / status button */}
      <button
        onClick={() => onStatusChange(milestone.id, STATUS_CYCLE[milestone.status])}
        title="Click to cycle status"
        className={`
          flex items-center justify-center w-10 h-10 rounded-full border shadow shrink-0 z-10
          ${justChanged && isCompleted ? 'success-ring' : ''}
          md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2
          transition-all duration-200 hover:scale-110
          ${isCompleted
            ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
            : isInProgress
              ? 'border-highlight/40 bg-highlight/20 text-highlight'
              : 'border-border-subtle bg-background-deep text-line hover:border-outline'}
        `}
      >
        {/* Keyed by status so the icon pops when the person changes it */}
        <span key={isPending ? 'pending' : milestone.status} className={justChanged && !isPending ? 'pop' : ''}>
          {isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : isCompleted
              ? <CheckCircle2 className="w-4 h-4" />
              : isInProgress
                ? <Circle className="w-4 h-4 fill-highlight/30" />
                : <Icon className="w-4 h-4" />}
        </span>
      </button>

      {/* Card */}
      <div className={`
        w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-5 rounded-2xl border backdrop-blur
        transition-all duration-200 hover:border-outline cursor-default
        ${isCompleted
          ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70'
          : isInProgress
            ? 'border-highlight/30 bg-highlight/5'
            : 'border-border-subtle bg-surface-card/40'}
      `}>
        {/* Category badge */}
        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold mb-3 ${meta.bg} ${meta.color} border ${meta.border}`}>
          <Icon className="w-3 h-3" />
          {milestone.category}
        </span>

        {/* Title */}
        <h3 className={`text-sm font-bold leading-snug mb-1 ${isCompleted ? 'line-through text-line' : 'text-paper'}`}>
          {milestone.title}
        </h3>

        {/* Description / Tasks */}
        {milestone.description && (
          <div className="mt-3 space-y-2">
            {splitDescriptionPoints(milestone.description).map((cleanLine, i) => {
              return (
                <div key={i} className="flex items-start gap-2 text-xs text-line group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-surface-container-high shrink-0 mt-1 transition-colors group-hover/item:bg-highlight/50" />
                  <span className="leading-relaxed">{cleanLine}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Status label */}
        {isInProgress && (
          <p className="mt-2 text-xs font-semibold text-highlight">● In Progress</p>
        )}
        {isCompleted && (
          <p className="mt-2 text-xs font-semibold text-emerald-400">✓ Completed</p>
        )}
        {!isInProgress && !isCompleted && (
          <p className="mt-2 text-xs text-outline">Click the dot to start →</p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Roadmap() {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState(null);
  const [lastChanged, setLastChanged] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['roadmap'],
    queryFn: () => api.get('/api/v1/roadmap').then(r => r.data),
    retry: 1,
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/api/v1/roadmap/milestones/${id}`, { status }),
    onMutate: ({ id }) => setUpdatingId(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap'] }),
    onSettled: () => setUpdatingId(null),
  });

  const handleRegenerate = async () => {
    if (!window.confirm('This will replace your current roadmap with a fresh AI-generated one. Continue?')) return;
    setRegenerating(true);
    setRegenError('');
    try {
      await api.post('/api/v1/onboarding/generate-roadmap');
      await queryClient.invalidateQueries({ queryKey: ['roadmap'] });
    } catch {
      setRegenError('Failed to regenerate. Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const milestones = data?.milestones || [];
  const totalCount = milestones.length;
  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const inProgressCount = milestones.filter(m => m.status === 'in_progress').length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-deep flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-highlight border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-line text-sm">Loading your roadmap…</p>
        </div>
      </div>
    );
  }

  // ── No roadmap ─────────────────────────────────────────────────────────────
  if (isError || !data) {
    return <GenerateRoadmapPanel onGenerated={() => refetch()} />;
  }

  // ── Has roadmap ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background-deep text-paper pb-16 selection:bg-highlight/30">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-50 w-full border-b border-border-subtle px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 bg-background-deep/90 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-card/80 text-line transition hover:border-outline hover:text-paper"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-paper tracking-tight whitespace-nowrap">Role Roadmap</h1>
            <p className="truncate text-[11px] text-highlight uppercase tracking-wider font-semibold">{data.role}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm text-line">
            <span className="text-paper font-semibold">{completedCount}</span>/{totalCount} done
            {inProgressCount > 0 && <span className="text-xs text-highlight">· {inProgressCount} in progress</span>}
          </div>
          <div className="w-12 sm:w-20 h-1.5 rounded-full bg-surface-container overflow-hidden">
            <div className="bar-grow h-full bg-highlight rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-sm font-semibold text-highlight">{progressPct}%</span>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Regenerate roadmap"
            aria-label="Regenerate roadmap"
            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-card/80 text-line transition hover:border-outline hover:text-paper disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {regenError && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{regenError}</div>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-6 py-8">

        {/* ── Hero ── */}
        <div className="mb-10 text-center">
          <div className="mx-auto w-16 h-16 bg-highlight/10 rounded-2xl flex items-center justify-center mb-4">
            <Map className="w-8 h-8 text-highlight" />
          </div>
          <h2 className="text-2xl font-bold text-paper mb-2">Your Path to {data.role}</h2>
          <p className="text-sm text-line max-w-md mx-auto">
            A comprehensive, step-by-step guide tailored to your weak areas and target companies.
            Follow this roadmap alongside your Weekly Planner.
          </p>
          <p className="mt-2 text-xs text-line">
            Click any milestone dot to mark it <span className="text-highlight">In Progress</span> or <span className="text-emerald-400">Completed</span>.
          </p>
        </div>

        {/* ── Zigzag timeline ── */}
        <div className="space-y-8 relative
          before:absolute before:inset-0
          before:ml-5 before:-translate-x-px
          md:before:mx-auto md:before:translate-x-0
          before:h-full before:w-0.5
          before:bg-gradient-to-b before:from-transparent before:via-surface-container before:to-transparent">

          {milestones.map((milestone, index) => (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              index={index}
              onStatusChange={(id, status) => {
                setLastChanged(id);
                updateStatus({ id, status });
              }}
              justChanged={lastChanged === milestone.id}
              isPending={updatingId === milestone.id}
            />
          ))}
        </div>

        {/* ── Completion banner ── */}
        {completedCount === totalCount && totalCount > 0 && (
          <div className="mt-12 text-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-paper font-bold text-lg mb-1">Roadmap Complete! 🎉</h3>
            <p className="text-line text-sm">
              You've completed every milestone. Head to the planner to schedule your mock interviews and final prep.
            </p>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm text-on-surface hover:text-paper hover:border-outline transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Generate a new roadmap
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import PlanModel from '../../components/model/PlanModel';
import { useCountUp } from '../../lib/motion';
import {
  Briefcase, ClipboardList, MessageSquare, Sparkles, Target, BookOpen,
  Code2, FileText, LogOut, Plus, User, Map, Check,
} from 'lucide-react';

const tileData = [
  { title: 'Weekly planner', text: 'This week’s tasks and today’s schedule.', icon: ClipboardList, link: '/planner' },
  { title: 'Roadmap', text: 'Milestones for your target role.', icon: Map, link: '/roadmap' },
  { title: 'AI mentor', text: 'Explain a topic or plan your next steps.', icon: MessageSquare, link: '/mentor' },
  { title: 'Knowledge vault', text: 'Bookmarks, saved insights and notes.', icon: BookOpen, link: '/vault' },
  { title: 'Coding problems', text: 'Practise by topic, difficulty and company.', icon: Code2, link: '/interview-hub/dsa' },
  { title: 'Interview Q&A', text: 'Open-ended questions for your role.', icon: Briefcase, link: '/interview-hub/qa' },
  { title: 'Quiz', text: 'Timed multiple-choice rounds on core subjects.', icon: Target, link: '/interview-hub/quiz' },
  { title: 'Resume analyser', text: 'ATS score and feedback for your target role.', icon: FileText, link: '/resume-analyser' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  // -- Working API Query --
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("No user");
      const { data: userRow } = await supabase.from('users').select('*').eq('supabase_id', userData.user.id).single();
      if (!userRow) throw new Error("No user row");
      
      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userRow.id).single();

      // Fetch active weekly plan
      const { data: plan } = await supabase.from('weekly_plans')
        .select('total_tasks, completed_tasks, completion_percentage')
        .eq('user_id', userRow.id)
        .eq('status', 'active')
        .maybeSingle();

      const weekly_total = plan?.total_tasks || 0;
      const weekly_completed = plan?.completed_tasks || 0;
      const planner_completion = plan?.completion_percentage || 0;

      // Fetch next milestone
      let next_milestone = "Complete onboarding to generate your roadmap";
      const { data: roadmap } = await supabase.from('role_roadmaps').select('id').eq('user_id', userRow.id).maybeSingle();
      if (roadmap) {
        const { data: milestone } = await supabase.from('roadmap_milestones')
          .select('title')
          .eq('roadmap_id', roadmap.id)
          .eq('status', 'pending')
          .order('priority_order', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (milestone) {
          next_milestone = milestone.title;
        } else {
          next_milestone = "All roadmap milestones completed";
        }
      } else if (profile?.college_name) {
        next_milestone = "Create your first weekly plan";
      }

      // Unread notifications
      const { count: unreadCount } = await supabase.from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userRow.id)
        .eq('is_read', false);

      // DSA Stats (overall readiness needs it)
      const { count: dsaSolved } = await supabase.from('user_coding_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userRow.id)
        .eq('status', 'solved');
      const dsa_total = 3632; // Assuming a fixed total or fetch dynamically if needed

      const dsa_score = dsa_total > 0 ? Math.min((dsaSolved / dsa_total) * 100, 100) : 0;
      const weekly_score = weekly_total > 0 ? (weekly_completed / weekly_total * 100) : 0;
      const overall_readiness = Math.round((dsa_score * 0.5 + weekly_score * 0.5) * 10) / 10;

      return {
        profile: {
          full_name: profile?.full_name || userRow.full_name,
          college_name: profile?.college_name,
          degree: profile?.degree,
          graduation_year: profile?.graduation_year,
          target_role: userRow.target_role
        },
        overall_readiness,
        weekly_tasks_completed: weekly_completed,
        weekly_tasks_total: weekly_total,
        next_milestone,
        planner_completion,
        dsa_solved: dsaSolved || 0,
        dsa_total,
        unread_notifications_count: unreadCount || 0,
      };
    },
    retry: false,
  });

  const queryClient = useQueryClient();
  const [newItemText, setNewItemText] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("DSA");
  // The task the person just ticked, so only that one plays the completion animation.
  const [justToggled, setJustToggled] = useState(null);

  // Daily plan is fetched fresh every time (staleTime: 0) so new task completions 
  // show up immediately without a page reload.
  const { data: dailyPlanData } = useQuery({
    queryKey: ['dailyPlan'],
    queryFn: async () => {
      try {
        const res = await api.post('/api/v1/planner/daily', { available_minutes: 120, custom_tasks: [] });
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 0,
  });

  const focusItems = useMemo(() => {
    if (!dailyPlanData?.daily_plan) return [];
    return dailyPlanData.daily_plan.map((t, i) => ({
      id: t.id ?? `custom-${i}`,
      text: t.title,
      completed: t.status === 'Completed',
      category: t.category || 'Custom',
    }));
  }, [dailyPlanData]);

  // DSA stats aggregated from Supabase
  const { data: dsaStats } = useQuery({
    queryKey: ['dsaStats'],
    queryFn: async () => {
      const { data } = await supabase.from('user_coding_progress').select('id').eq('status', 'solved');
      const { count } = await supabase.from('dsa_problems').select('*', { count: 'exact', head: true });
      return { total_solved: data?.length || 0, total_target: count || 3632 };
    },
    staleTime: 1000 * 60 * 10,
  });

  // Subject confidence from assessments API (KPI Card 2)
  const { data: subjectData } = useQuery({
    queryKey: ['subjectBreakdown'],
    queryFn: () => api.get('/api/v1/assessments/subjects').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });

  // Quiz accuracy aggregated directly from Supabase
  const { data: quizStats } = useQuery({
    queryKey: ['quizStats'],
    queryFn: async () => {
      const { data } = await supabase.from('user_quiz_sessions').select('total_questions, correct_count');
      const rows = data || [];
      const total_attempted = rows.reduce((acc, r) => acc + (r.total_questions || 0), 0);
      const total_correct = rows.reduce((acc, r) => acc + (r.correct_count || 0), 0);
      const accuracy_pct = total_attempted > 0 ? Math.round((total_correct / total_attempted) * 100) : 0;
      return { total_attempted, total_correct, accuracy_pct };
    },
    staleTime: 1000 * 60 * 5,
  });

  // -- Dynamic Variables Mapping --
  const profile = data?.profile ?? {};
  const stats = {
    overall_readiness: data?.overall_readiness ?? 0,
    weekly_tasks_completed: data?.weekly_tasks_completed ?? 0,
    weekly_tasks_total: data?.weekly_tasks_total ?? 0,
    planner_completion: data?.planner_completion ?? 0,
    dsa_solved: dsaStats?.total_solved ?? data?.dsa_solved ?? 0,
    dsa_total: dsaStats?.total_target ?? data?.dsa_total ?? 3632,
  };

  // Subject confidence computed values
  const confidentCount = subjectData?.confident_count ?? 0;
  const subjectTotal = subjectData?.total ?? 0;
  // Merge all groups for chip display: subjects + dsa + role_specific
  const subjectList = [];
  (subjectData?.categories ?? []).forEach(cat => {
    subjectList.push(...cat.skills);
  });

  // Quiz accuracy computed values
  const quizAttempted = quizStats?.total_attempted ?? 0;
  const quizCorrect = quizStats?.total_correct ?? 0;
  const quizAccuracy = quizStats?.accuracy_pct ?? 0;

  const welcomeName = useMemo(() => {
    if (isLoading) return '';
    if (isError) return '';
    return profile.full_name || '';
  }, [profile.full_name, isError, isLoading]);

  const targetDsa = stats.dsa_total;
  const dsaPercent = targetDsa > 0 ? Math.min((stats.dsa_solved / targetDsa) * 100, 100) : 0;
  const weeklyTaskPercent = stats.weekly_tasks_total > 0
    ? (stats.weekly_tasks_completed / stats.weekly_tasks_total) * 100
    : 0;

  // -- Helper Functions --
  const getReadinessLabel = (score) => {
    if (score >= 85) return 'Placement ready';
    if (score >= 60) return 'On track';
    if (score >= 30) return 'Building momentum';
    return 'Just getting started';
  };

  const handleToggleTask = (id) => {
    setJustToggled(id);
    // Optimistic UI only — task status update goes through planner task endpoint
    queryClient.setQueryData(['dailyPlan'], old => {
      if (!old) return old;
      return {
        ...old,
        daily_plan: old.daily_plan.map(t =>
          (t.id ?? `custom-${t.title}`) === id ? { ...t, status: t.status === 'Completed' ? 'Pending' : 'Completed' } : t
        ),
      };
    });
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    try {
      // POST to the planner API to persist the custom task
      await api.post('/api/v1/planner/daily', {
        available_minutes: 120,
        custom_tasks: [newItemText.trim()],
      });
      queryClient.invalidateQueries({ queryKey: ['dailyPlan'] });
    } catch {
      // Silent fail — UI still shows it optimistically via invalidation
    }
    setNewItemText("");
  };

  const readiness = Math.max(0, Math.min(100, Math.round(stats.overall_readiness)));
  const readinessShown = useCountUp(readiness, { active: !isLoading, duration: 1400 });
  const focusDone = focusItems.filter((i) => i.completed).length;
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-full bg-background-deep pb-16 text-on-surface">
      <div className="stagger-in mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:py-10">

        {/* Header */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-line">{todayLabel}</p>
            <h1 className="type-title mt-1 text-3xl text-paper sm:text-[2.4rem]">
              Welcome back{welcomeName ? `, ${welcomeName}` : ''}
            </h1>
          </div>
          <div className="flex gap-2">
            <Link to="/profile" className={btnGhost}>
              <User className="h-4 w-4" aria-hidden="true" />
              Edit profile
            </Link>
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); logout(); navigate('/login'); }}
              className={`${btnGhost} cursor-pointer`}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </header>

        {isError && (
          <div role="alert" className="border-l-2 border-redline bg-redline/10 px-4 py-3 text-sm text-paper">
            Your summary didn&rsquo;t load. Refresh the page, or sign out and back in.
          </div>
        )}

        {/* Title block: who this plan is drawn for */}
        <dl className="grid grid-cols-1 border border-paper/35 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <div className="border-b border-border-subtle px-5 py-4 sm:border-b-0 sm:border-r">
            <dt className="text-xs font-medium text-line">Target role</dt>
            <dd className="mt-1 font-semibold text-paper">
              {profile.target_role || <Link to="/profile" className="text-highlight underline underline-offset-4">Set your target role</Link>}
            </dd>
          </div>
          <div className="border-b border-border-subtle px-5 py-4 sm:border-b-0 sm:border-r">
            <dt className="text-xs font-medium text-line">Next milestone</dt>
            <dd className="mt-1 font-semibold text-paper">
              <Link to="/roadmap" className="decoration-highlight underline-offset-4 hover:underline">
                {data?.next_milestone ?? 'Finish setting up your profile'}
              </Link>
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className="text-xs font-medium text-line">Unread notifications</dt>
            <dd className="mt-1 font-semibold tabular-nums text-paper">{data?.unread_notifications_count ?? 0}</dd>
          </div>
        </dl>

        {/* Readiness + measurements */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-label="Progress">
          <div className="sheet flex flex-col p-6 sm:p-7">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-line">Placement readiness</h2>
                <p className="type-display mt-4 text-[4.25rem] tabular-nums text-paper">
                  {isLoading ? '–' : readinessShown}
                  <span className="ml-1 text-3xl text-line">%</span>
                </p>
                <p className="mt-1 text-lg font-semibold text-paper">{getReadinessLabel(readiness)}</p>
              </div>
              {/* Readiness as a building: one floor per twelfth, the next floor highlighted. */}
              <div className="-my-3 -mr-3 h-44 w-36 shrink-0 sm:h-48 sm:w-44">
                {!isLoading && (
                  <PlanModel
                    progress={readiness / 100}
                    variant="compact"
                    label={`Your readiness drawn as a 12-floor tower: ${Math.round((readiness / 100) * 12)} floors built.`}
                    className="h-full w-full"
                  />
                )}
              </div>
            </div>

            <ReadinessScale value={isLoading ? 0 : readiness} />

            <p className="mt-5 text-sm leading-relaxed text-line">
              Half of this comes from coding problems solved, half from this week&rsquo;s plan.
            </p>
            <button type="button" onClick={() => navigate('/planner')} className={`${btnOutline} mt-6`}>
              Open weekly planner
            </button>
          </div>

          <div className="sheet grid grid-cols-1 sm:grid-cols-2">
            <Measure
              label="Coding problems solved"
              to="/interview-hub/dsa"
              pct={dsaPercent}
              hint="Pick a topic and difficulty to keep this moving."
              className="border-b border-border-subtle sm:border-r"
            >
              <Figure value={stats.dsa_solved} of={`of ${targetDsa.toLocaleString('en-IN')}`} />
            </Measure>

            <Measure
              label="Subject confidence"
              to="/subjects"
              className="border-b border-border-subtle"
            >
              {subjectTotal > 0 ? (
                <Figure value={confidentCount} of={`of ${subjectTotal} confident`} />
              ) : (
                <p className="text-lg font-semibold text-paper">Not rated yet</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {subjectList.length > 0 ? (
                  subjectList.slice(0, 6).map((s) => (
                    <span key={s.skill_key} className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-2 py-0.5 text-[0.72rem] text-paper">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${s.confidence >= 70 ? 'bg-success' : s.confidence >= 40 ? 'bg-warning' : 'bg-redline'}`}
                        aria-hidden="true"
                      />
                      {s.label}
                    </span>
                  ))
                ) : (
                  <span className="text-[0.8rem] text-line">Rate your subjects to see where you stand.</span>
                )}
              </div>
            </Measure>

            <Measure
              label="This week’s tasks"
              to="/planner"
              pct={weeklyTaskPercent}
              hint="From your active weekly plan."
              className="border-b border-border-subtle sm:border-b-0 sm:border-r"
            >
              <Figure value={stats.weekly_tasks_completed} of={`of ${stats.weekly_tasks_total} done`} />
            </Measure>

            <Measure
              label="Quiz accuracy"
              to="/interview-hub/quiz"
              pct={quizAttempted > 0 ? quizAccuracy : null}
              hint={quizAttempted > 0 ? `${quizCorrect} correct of ${quizAttempted} answered` : 'Take a quiz to start tracking accuracy.'}
            >
              {quizAttempted > 0 ? (
                <Figure value={quizAccuracy} suffix="%" />
              ) : (
                <p className="text-lg font-semibold text-paper">No quizzes yet</p>
              )}
            </Measure>
          </div>
        </section>

        {/* Today's focus */}
        <section className="sheet" aria-labelledby="focus-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle px-5 py-4 sm:px-6">
            <h2 id="focus-heading" className="type-title text-xl text-paper">Today&rsquo;s focus</h2>
            {focusItems.length > 0 && (
              <p className="text-sm tabular-nums text-line">{focusDone} of {focusItems.length} done</p>
            )}
          </div>

          {focusItems.length === 0 ? (
            <p className="px-5 py-7 leading-relaxed text-line sm:px-6">
              Nothing scheduled for today yet. Add a task below, or generate this week&rsquo;s plan in the{' '}
              <Link to="/planner" className="text-paper underline decoration-highlight underline-offset-4">weekly planner</Link>.
            </p>
          ) : (
            <ul className="grid max-h-[26rem] overflow-y-auto sm:grid-cols-2">
              {focusItems.map((item) => (
                <li key={item.id} className="border-b border-border-subtle sm:odd:border-r">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.completed}
                    onClick={() => handleToggleTask(item.id)}
                    className="flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-paper/[0.04] sm:px-6"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors duration-200 ${
                        item.completed ? 'border-highlight bg-highlight text-ink' : 'border-paper/50'
                      } ${item.completed && justToggled === item.id ? 'success-ring' : ''}`}
                      aria-hidden="true"
                    >
                      {item.completed && (
                        <Check className={`h-3.5 w-3.5 ${justToggled === item.id ? 'pop-check' : ''}`} strokeWidth={3} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="highlighter text-[0.95rem] font-medium text-paper" data-on={item.completed}>
                        {item.text}
                      </span>
                      <span className="mt-1 block text-xs text-line">{item.category}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddTask} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:px-6">
            <label htmlFor="focus-task" className="sr-only">Add a task for today</label>
            <input
              id="focus-task"
              type="text"
              required
              placeholder="Add a task for today"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-container-lowest px-3.5 py-2.5 text-sm text-paper placeholder:text-line/70 transition-colors focus:border-highlight focus:outline-none"
            />
            <div className="flex gap-2">
              <select
                aria-label="Category"
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                className="flex-1 cursor-pointer rounded-lg border border-border-subtle bg-surface-container-lowest px-3 py-2.5 text-sm text-paper focus:border-highlight focus:outline-none sm:flex-none"
              >
                <option value="DSA">DSA</option>
                <option value="DBMS">DBMS</option>
                <option value="OS">OS</option>
                <option value="System Design">System design</option>
                <option value="Resume">Resume</option>
              </select>
              <button type="submit" className={btnPrimary}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add
              </button>
            </div>
          </form>
        </section>

        {/* Tools index */}
        <section aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="type-title text-xl text-paper">Your tools</h2>
          <ul className="mt-4 grid border-t border-border-subtle sm:grid-cols-2 lg:grid-cols-4">
            {tileData.map((tile) => {
              const Icon = tile.icon;
              return (
                <li key={tile.title} className="border-b border-border-subtle">
                  <Link
                    to={tile.link}
                    className="group flex h-full items-start gap-3 py-4 pr-4 transition-colors hover:bg-paper/[0.04] sm:px-4"
                  >
                    <Icon className="nudge-x mt-0.5 h-5 w-5 shrink-0 text-line transition-[color,transform] duration-200 group-hover:text-highlight" aria-hidden="true" />
                    <span>
                      <span className="block font-semibold text-paper">{tile.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-line">{tile.text}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Mentor note */}
        <aside className="flex flex-col gap-5 border-l-2 border-highlight bg-surface-card px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-highlight" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-paper">Not sure what to work on next?</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-line">
                The AI mentor can see your plan and progress. Ask it to explain a topic, look at your weak areas, or plan your next few days.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/mentor')} className={`${btnPrimary} cursor-pointer`}>
            Ask the mentor
          </button>
        </aside>

      </div>
    </div>
  );
}

const btnPrimary =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-primary-fixed active:translate-y-px';
const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3.5 py-2 text-sm font-medium text-line transition-colors hover:border-outline hover:text-paper';
const btnOutline =
  'inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-paper/35 px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:border-paper/70 hover:bg-paper/5';

/** Readiness drawn on a ruler: minor ticks every 10, major at 0 / 50 / 100. */
function ReadinessScale({ value }) {
  return (
    <div className="mt-7" aria-hidden="true">
      <div className="relative h-7">
        <span
          className="absolute -top-0.5 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-highlight transition-[left] duration-700 ease-[var(--ease-draft)]"
          style={{ left: `${value}%` }}
        />
        <div className="absolute inset-x-0 bottom-0 h-px bg-paper/50" />
        {Array.from({ length: 11 }).map((_, i) => (
          <span
            key={i}
            className={`absolute bottom-0 w-px bg-paper/50 ${i % 5 === 0 ? 'h-3.5' : 'h-2'}`}
            style={{ left: `${i * 10}%` }}
          />
        ))}
        <div
          className="bar-grow absolute bottom-0 left-0 h-[3px] bg-highlight transition-[width] duration-700 ease-[var(--ease-draft)]"
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[0.7rem] tabular-nums text-line">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** A measured figure; numbers count up to their value when data arrives. */
function Figure({ value, of, suffix = '' }) {
  const shown = useCountUp(typeof value === 'number' ? value : 0, { active: typeof value === 'number' });
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="type-title text-[2rem] tabular-nums text-paper">
        {typeof value === 'number' ? shown.toLocaleString('en-IN') : value}
        {suffix}
      </span>
      {of && <span className="text-sm tabular-nums text-line">{of}</span>}
    </p>
  );
}

function Measure({ label, to, pct = null, hint, className = '', children }) {
  return (
    <Link to={to} className={`group flex flex-col p-5 transition-colors hover:bg-paper/[0.04] sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-line">{label}</h3>
        <span className="nudge material-symbols-outlined text-[18px] text-line transition-[color,transform] duration-200 group-hover:text-paper" aria-hidden="true">
          arrow_outward
        </span>
      </div>
      <div className="mt-3 flex-1">{children}</div>
      {pct != null && (
        <div className="mt-4 h-[3px] w-full bg-paper/15">
          <div className="bar-grow h-full bg-highlight transition-[width] duration-700 ease-[var(--ease-draft)]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </div>
      )}
      {hint && <p className="mt-2.5 text-[0.8rem] leading-relaxed text-line">{hint}</p>}
    </Link>
  );
}

import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import {
  Bell, Briefcase, ClipboardList, MessageSquare,
  Sparkles, ChevronRight, Target, BookOpen, Code2,
  FileText, LogOut, CheckSquare, Square, Plus, User, Map,
  Brain, BarChart2
} from 'lucide-react';

const tileData = [
  { title: 'Planner', text: 'Organize weekly goals and deadlines in one place.', icon: ClipboardList, link: '/planner', color: '#b4c5ff' },
  { title: 'Role Roadmap', text: 'View your step-by-step career path and learning milestones.', icon: Map, link: '/roadmap', color: '#38bdf8' },
  { title: 'AI Mentor', text: 'Ask questions, get interview prep help, and refine your resume.', icon: MessageSquare, link: '/mentor', color: '#c0c1ff' },
  { title: 'Knowledge Vault', text: 'Save notes, flashcards, and topic references for review.', icon: BookOpen, link: '/vault', color: '#10B981' },
  { title: 'DSA Practice', text: 'Master data structures and algorithms with curated problems.', icon: Code2, link: '/interview-hub/dsa', color: '#F43F5E' },
  { title: 'Interview Q&A', text: 'Prepare confidently with company-specific behavioral and technical questions.', icon: Briefcase, link: '/interview-hub/qa', color: '#d4e4fa' },
  { title: 'Quiz Engine', text: 'Test your knowledge across core subjects with rapid MCQs.', icon: Target, link: '/interview-hub/quiz', color: '#8B5CF6' },
  { title: 'Resume Analyzer', text: 'Upload and analyze your resume to improve your fit.', icon: FileText, link: null, color: '#F59E0B' }
];

export default function Dashboard() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  
  // -- Working API Query --
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: async () => {
      const response = await api.get('/api/v1/dashboard');
      return response.data;
    },
    retry: false,
  });

  const queryClient = useQueryClient();
  const [newItemText, setNewItemText] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("DSA");

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

  // DSA stats from hub API for real total
  const { data: dsaStats } = useQuery({
    queryKey: ['dsaStats'],
    queryFn: () => api.get('/api/v1/hub/stats/dsa').then(r => r.data),
    staleTime: 1000 * 60 * 10,
  });

  // Subject confidence from assessments API (KPI Card 2)
  const { data: subjectData } = useQuery({
    queryKey: ['subjectBreakdown'],
    queryFn: () => api.get('/api/v1/assessments/subjects').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });

  // Quiz accuracy from hub stats API (KPI Card 4)
  const { data: quizStats } = useQuery({
    queryKey: ['quizStats'],
    queryFn: () => api.get('/api/v1/hub/stats/quiz').then(r => r.data),
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
  const subjectTotal  = subjectData?.total ?? 0;
  // Merge all groups for chip display: subjects + dsa + role_specific
  const subjectList = [];
  (subjectData?.categories ?? []).forEach(cat => {
    subjectList.push(...cat.skills);
  });

  // Quiz accuracy computed values
  const quizAttempted = quizStats?.total_attempted ?? 0;
  const quizCorrect   = quizStats?.total_correct ?? 0;
  const quizAccuracy  = quizStats?.accuracy_pct ?? 0;

  const welcomeName = useMemo(() => {
    if (isLoading) return '…';
    if (isError) return '';
    return profile.full_name || 'Blueprint User';
  }, [profile.full_name, isError, isLoading]);

  const targetDsa = stats.dsa_total; 
  const dsaPercent = targetDsa > 0 ? Math.min((stats.dsa_solved / targetDsa) * 100, 100) : 0;
  const weeklyTaskPercent = stats.weekly_tasks_total > 0 
    ? (stats.weekly_tasks_completed / stats.weekly_tasks_total) * 100 
    : 0;

  // -- Helper Functions --
  const getReadinessLabel = (score) => {
    if (score >= 85) return "Top 10% • Placement Ready";
    if (score >= 75) return "Needs Work • Action Needed";
    return "Critical Review Required";
  };

  const getStrokeDashOffset = (score) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    return circumference - (score / 100) * circumference;
  };

  const handleToggleTask = (id) => {
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

  return (
    <div className="min-h-screen bg-background-deep text-on-surface font-sans pb-12 overflow-x-hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">

        {/* Global Control Bar */}
        <div className="flex justify-end gap-4 mb-2">
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-xl bg-surface-card px-4 py-2 text-sm text-on-surface-variant border border-border-subtle hover:border-outline hover:text-on-surface transition-all"
          >
            <User className="h-4 w-4" />
            Edit Profile
          </Link>
          <button
            onClick={async () => { await supabase.auth.signOut(); logout(); navigate('/login'); }}
            className="flex items-center gap-2 rounded-xl bg-surface-card px-4 py-2 text-sm text-on-surface-variant border border-border-subtle hover:border-outline hover:text-on-surface transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        {/* Premium Welcome Banner Card */}
        <div className="relative bg-surface-card border border-border-subtle rounded-2xl p-6 overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-fixed-dim/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="relative z-10">
            <h2 className="text-xl font-bold text-on-surface tracking-tight">Welcome back, {welcomeName} 👋</h2>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              Your next milestone target is: <span className="text-primary-fixed-dim font-semibold">{data?.next_milestone ?? 'Complete onboarding profile'}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 bg-surface-container-high border border-border-subtle rounded-xl py-2 px-4 shrink-0 relative z-10">
            <Target className="w-5 h-5 text-primary-fixed-dim" />
            <div className="text-left">
              <span className="block text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Target Objective</span>
              <span className="text-xs text-on-surface font-semibold">{profile.target_role || 'Software Engineer (L3)'}</span>
            </div>
          </div>
        </div>

        {/* Core Layout Grid: Placement Index & 2x2 Metric Stack */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Block: Placement Readiness Circular Gauge */}
          <div className="lg:col-span-5 bg-surface-card border border-border-subtle rounded-2xl p-6 flex flex-col items-center justify-between min-h-75">
            <div className="w-full flex justify-between items-center border-b border-border-subtle/40 pb-3">
              <h3 className="text-sm font-semibold text-on-surface">Placement Readiness</h3>
              <span className="text-[10px] bg-primary-container/20 text-primary-fixed-dim font-bold px-2 py-0.5 rounded-full border border-primary-container/30">
                Overall Match
              </span>
            </div>

            <div className="relative flex items-center justify-center my-6">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="50" stroke="var(--color-border-subtle)" strokeWidth="10" fill="transparent" />
                <circle
                  cx="64" cy="64" r="50" stroke="var(--color-primary-fixed-dim)" strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={getStrokeDashOffset(stats.overall_readiness)}
                  strokeLinecap="round" fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-3xl font-extrabold text-on-surface tracking-tight">{stats.overall_readiness}%</span>
                <span className="block text-[10px] text-on-surface-variant font-medium mt-0.5">EST. INDEX</span>
              </div>
            </div>

            <div className="w-full text-center space-y-4">
              <div>
                <p className="text-sm font-bold text-on-surface">{getReadinessLabel(stats.overall_readiness)}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Based on system evaluations across all core modules</p>
              </div>
              <button
                onClick={() => navigate("/planner")}
                className="w-full flex items-center justify-center gap-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs py-2.5 rounded-xl border border-border-subtle transition-colors cursor-pointer"
              >
                View Detailed Breakdown
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Block: 2x2 Dynamic Stats Grid */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* KPI Card 1: Algo Solved */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 flex flex-col justify-between card-hover-effect">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Algo Solved</span>
                  <p className="text-2xl font-bold text-on-surface mt-1">
                    {stats.dsa_solved} <span className="text-xs text-on-surface-variant">/ {targetDsa}</span>
                  </p>
                </div>
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                  <Code2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                  <div className="bg-success h-full rounded-full transition-all duration-500" style={{ width: `${dsaPercent}%` }}></div>
                </div>
                <span className="text-[10px] text-on-surface-variant block">Review structural coding challenges regularly</span>
              </div>
            </div>

            {/* KPI Card 2: Subject Confidence */}
            <div
              className="bg-surface-card border border-border-subtle rounded-2xl p-5 flex flex-col justify-between card-hover-effect cursor-pointer"
              onClick={() => navigate('/subjects')}
              title="Manage subject confidence"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Subject Confidence</span>
                  {subjectTotal > 0 ? (
                    <p className="text-2xl font-bold text-on-surface mt-1">
                      {confidentCount} <span className="text-xs text-on-surface-variant">/ {subjectTotal} confident</span>
                    </p>
                  ) : (
                    <p className="text-sm text-on-surface-variant mt-2">Rate your subjects</p>
                  )}
                </div>
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed-dim/10 text-primary-fixed-dim">
                  <Brain className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {subjectList.length > 0 ? (
                  subjectList.slice(0, 6).map((s) => (
                    <span
                      key={s.skill_key}
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md border ${
                        s.confidence >= 70
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : s.confidence >= 40
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}
                    >
                      {s.label}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-on-surface-variant">Complete onboarding to see subject scores</span>
                )}
              </div>
            </div>

            {/* KPI Card 3: Weekly Progress */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 flex flex-col justify-between card-hover-effect">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Weekly Tasks</span>
                  <p className="text-2xl font-bold text-on-surface mt-1">
                    {stats.weekly_tasks_completed} <span className="text-xs text-on-surface-variant">/ {stats.weekly_tasks_total}</span>
                  </p>
                </div>
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim">
                  <ClipboardList className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                  <div className="bg-tertiary-fixed-dim h-full rounded-full transition-all duration-500" style={{ width: `${weeklyTaskPercent}%` }}></div>
                </div>
                <span className="text-[10px] text-on-surface-variant block">Keep planning tasks updated to track growth</span>
              </div>
            </div>

            {/* KPI Card 4: Quiz Accuracy */}
            <div
              className="bg-surface-card border border-border-subtle rounded-2xl p-5 flex flex-col justify-between card-hover-effect cursor-pointer"
              onClick={() => navigate('/interview-hub/quiz')}
              title="Go to Quiz Engine"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Quiz Accuracy</span>
                  {quizAttempted > 0 ? (
                    <p className="text-2xl font-bold text-on-surface mt-1">
                      {quizAccuracy}% <span className="text-xs text-on-surface-variant">accuracy</span>
                    </p>
                  ) : (
                    <p className="text-sm text-on-surface-variant mt-2">No quizzes yet</p>
                  )}
                </div>
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <BarChart2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                  <div className="bg-warning h-full rounded-full transition-all duration-500" style={{ width: `${quizAccuracy}%` }}></div>
                </div>
                {quizAttempted > 0 ? (
                  <span className="text-[10px] text-on-surface-variant block">
                    {quizCorrect} correct of {quizAttempted} attempted
                  </span>
                ) : (
                  <span className="text-[10px] text-on-surface-variant block">Take a quiz to start tracking accuracy</span>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Today's Focus Grid - Full Width */}
        <div className="mt-2">
          {/* Interactive Checklist */}
          <div className="w-full bg-surface-card border border-border-subtle rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-border-subtle/40 pb-3 mb-4">
                <h3 className="text-sm font-semibold text-on-surface">Today's Focus Tasks</h3>
                <span className="text-xs text-on-surface-variant font-medium">
                  {focusItems.filter((i) => i.completed).length} / {focusItems.length} Completed
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-75 overflow-y-auto pr-2 no-scrollbar">
                {focusItems.map((item) => (
                  <div
                    key={item.id} onClick={() => handleToggleTask(item.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border border-border-subtle/50 hover:bg-surface-container-low transition-all cursor-pointer ${
                      item.completed ? "opacity-60 bg-surface-container/40" : ""
                    }`}
                  >
                    <button className="text-primary-fixed-dim transition-colors cursor-pointer shrink-0">
                      {item.completed ? <CheckSquare className="w-4 h-4 fill-primary-fixed-dim/20" /> : <Square className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs text-on-surface font-medium truncate ${item.completed ? "line-through text-on-surface-variant" : ""}`}>
                        {item.text}
                      </p>
                      <span className="text-[9px] bg-background-deep text-on-surface-variant border border-border-subtle font-bold tracking-wider px-1.5 py-0.5 rounded uppercase mt-1 inline-block">
                        {item.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <form onSubmit={handleAddTask} className="mt-4 pt-4 border-t border-border-subtle/40 flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text" required placeholder="Add immediate focus target..."
                value={newItemText} onChange={(e) => setNewItemText(e.target.value)}
                className="w-full flex-1 bg-surface-container border border-border-subtle rounded-lg py-2 px-3 text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary-fixed-dim transition-all"
              />
              <div className="flex w-full sm:w-auto gap-2">
                <select
                  value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)}
                  className="flex-1 sm:flex-none bg-surface-container border border-border-subtle rounded-lg py-2 px-2 text-[10px] font-bold text-on-surface-variant uppercase focus:outline-none cursor-pointer"
                >
                  <option value="DSA">DSA</option>
                  <option value="DBMS">DBMS</option>
                  <option value="OS">OS</option>
                  <option value="System Design">SYS</option>
                  <option value="Resume">CV</option>
                </select>
                <button type="submit" className="bg-primary-container hover:bg-primary-container/80 text-on-primary-fixed border border-primary-container/50 p-2 rounded-lg transition-colors cursor-pointer shrink-0">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Preparation Feature Navigation Grid */}
        <div className="mt-2">
          <h3 className="text-sm font-semibold text-on-surface mb-4">Preparation Modules</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {tileData.map((tile) => {
              const Icon = tile.icon;
              const Wrapper = tile.link ? Link : 'div';
              const wrapperProps = tile.link ? { to: tile.link } : {};
              return (
                <Wrapper
                  key={tile.title}
                  {...wrapperProps}
                  className="group flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm transition hover:-translate-y-1 hover:border-outline cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: `${tile.color}15`, color: tile.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {tile.link ? (
                      <ChevronRight className="h-4 w-4 text-on-surface-variant transition group-hover:text-on-surface group-hover:translate-x-0.5" />
                    ) : (
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-medium text-on-surface-variant border border-border-subtle">Soon</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-on-surface">{tile.title}</h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant line-clamp-2">{tile.text}</p>
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </div>

        {/* AI Mentor Call-to-Action Action Item Banner */}
        <div className="mt-2 bg-linear-to-r from-primary-container/10 to-transparent border border-border-subtle rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary-container/20 border border-primary-container/30 flex items-center justify-center text-primary-fixed-dim shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-primary-fixed-dim uppercase tracking-wider">AI Mentor Insights • Action Required</h4>
              <p className="text-sm font-semibold text-on-surface mt-1">Ready for your next targeted interview session?</p>
              <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed max-w-2xl">
                Break down your comprehensive goals into structured milestones via the planner dashboard. For live mock review metrics, direct evaluation checks, and resume optimizations, chat with your AI Mentor.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/mentor")}
            className="bg-primary-container hover:bg-primary-container/80 text-shadow-primary-fixed-dim border-primary-container/30 font-semibold text-xs py-2.5 px-5 rounded-xl shrink-0 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Chat with Mentor
          </button>
        </div>

      </div>
    </div>
  );
}

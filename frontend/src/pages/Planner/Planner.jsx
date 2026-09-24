import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';
import {
  Plus, Check, Trash2, Clock, LayoutList,
  ArrowLeft, Sparkles, Target, Tag
} from 'lucide-react';

// Tones are theme tokens (index.css), so the chips stay readable in both themes.
const CATEGORY_COLORS = {
  DSA: { bg: 'color-mix(in srgb, var(--tone-violet) 12%, transparent)', text: 'var(--tone-violet)', border: 'color-mix(in srgb, var(--tone-violet) 25%, transparent)' },
  Subjects: { bg: 'color-mix(in srgb, var(--tone-blue) 12%, transparent)', text: 'var(--tone-blue)', border: 'color-mix(in srgb, var(--tone-blue) 25%, transparent)' },
  Resume: { bg: 'color-mix(in srgb, var(--tone-green) 12%, transparent)', text: 'var(--tone-green)', border: 'color-mix(in srgb, var(--tone-green) 25%, transparent)' },
  Projects: { bg: 'color-mix(in srgb, var(--tone-orange) 12%, transparent)', text: 'var(--tone-orange)', border: 'color-mix(in srgb, var(--tone-orange) 25%, transparent)' },
  'Company Preparation': { bg: 'color-mix(in srgb, var(--tone-rose) 12%, transparent)', text: 'var(--tone-rose)', border: 'color-mix(in srgb, var(--tone-rose) 25%, transparent)' },
  'Mock Interview': { bg: 'color-mix(in srgb, var(--tone-sky) 12%, transparent)', text: 'var(--tone-sky)', border: 'color-mix(in srgb, var(--tone-sky) 25%, transparent)' },
  Custom: { bg: 'color-mix(in srgb, var(--tone-slate) 12%, transparent)', text: 'var(--tone-slate)', border: 'color-mix(in srgb, var(--tone-slate) 25%, transparent)' },
};

const PRIORITY_ICONS = {
  Critical: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🟢',
};

const DAYS_OF_WEEK = ["All", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Planner() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [activeDayFilter, setActiveDayFilter] = useState("All");
  // The task just ticked, so only that one plays the completion animation.
  const [justToggled, setJustToggled] = useState(null);

  const [newTask, setNewTask] = useState({
    title: '',
    category: 'Custom',
    priority: 'Medium',
    estimated_minutes: 30
  });

  const { data: plan, isLoading: loadingPlan } = useQuery({
    queryKey: ['plannerPlan'],
    queryFn: async () => {
      const res = await api.get('/api/v1/planner/plans');
      return res.data;
    }
  });
  
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').limit(1).single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000
  });
  
  const { data: roadmap } = useQuery({
    queryKey: ['roadmap'],
    queryFn: async () => {
      const res = await api.get('/api/v1/roadmap');
      return res.data;
    },
    staleTime: 5 * 60 * 1000
  });

  const targetRole = profile?.target_role || "Software Engineer";
  const loading = loadingPlan;

  const fetchPlan = () => queryClient.invalidateQueries(['plannerPlan']);

  const generatePlan = async () => {
    setCreating(true);
    try {
      await api.post('/api/v1/planner/plans', { title: '' });
      fetchPlan();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }) => {
      await api.patch(`/api/v1/planner/tasks/${taskId}`, { status: newStatus });
    },
    onMutate: async ({ taskId, newStatus }) => {
      await queryClient.cancelQueries(['plannerPlan']);
      const previousPlan = queryClient.getQueryData(['plannerPlan']);
      if (previousPlan) {
        queryClient.setQueryData(['plannerPlan'], {
          ...previousPlan,
          tasks: previousPlan.tasks.map(t =>
            t.id === taskId ? { ...t, status: newStatus } : t
          )
        });
      }
      return { previousPlan };
    },
    onError: (err, variables, context) => {
      if (context?.previousPlan) {
        queryClient.setQueryData(['plannerPlan'], context.previousPlan);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(['plannerPlan']);
    }
  });

  const toggleTask = (task) => {
    setJustToggled(task.id);
    const newStatus = (task.status || '').toLowerCase() === 'completed' ? 'Pending' : 'Completed';
    toggleMutation.mutate({ taskId: task.id, newStatus });
  };

  const deleteTask = async (taskId) => {
    try {
      await api.delete(`/api/v1/planner/tasks/${taskId}`);
      fetchPlan();
    } catch (err) {
      console.error(err);
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!plan || !newTask.title.trim()) return;
    try {
      await api.post(`/api/v1/planner/plans/${plan.id}/tasks`, newTask);
      setNewTask({ title: '', category: 'Custom', priority: 'Medium', estimated_minutes: 30 });
      setShowAddTask(false);
      fetchPlan();
    } catch (err) {
      console.error(err);
    }
  };

  // --- DYNAMIC JAVASCRIPT CALENDAR DATE CALCULATION ENGINE ---
  const calculateTaskDayName = (startDateStr, taskIndex) => {
    if (!startDateStr) return "Monday";

    // Split the YYYY-MM-DD string and construct a local date at noon
    // This prevents UTC-to-local timezone shift bugs where dates jump to the previous day
    const [y, m, d] = startDateStr.split('-');
    const baseDate = new Date(y, m - 1, d, 12, 0, 0);

    if (isNaN(baseDate.getTime())) return "Monday";

    // Sequentially offset days based on task sequence grouping (distributes tasks evenly across a 7-day cycle)
    const dayOffset = taskIndex % 7;
    const targetDate = new Date(baseDate);
    targetDate.setDate(baseDate.getDate() + dayOffset);

    // Dynamic localization parser maps exactly into "Monday", "Tuesday", etc.
    return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(targetDate);
  };

  // Safe processing array injecting calculated calendar parameters
  const processedTasks = plan?.tasks ? plan.tasks.map((task, index) => {
    // Rely on the backend's explicit display_order to prevent days from shuffling if tasks are deleted/carried over
    const offsetIndex = task.display_order !== undefined ? task.display_order : index;
    return {
      ...task,
      displayDay: task.day || calculateTaskDayName(plan.start_date, offsetIndex)
    };
  }) : [];

  const filteredTasks = processedTasks.filter(t => {
    if (activeDayFilter === "All") return true;
    return t.displayDay.toLowerCase() === activeDayFilter.toLowerCase();
  });

  const progressPct = plan ? Math.round(plan.completion_percentage || 0) : 0;
  const completedCount = plan?.completed_tasks || 0;
  const totalCount = plan?.total_tasks || 0;

  const getCategoryProgress = (catName) => {
    if (!plan?.tasks) return 0;
    const catTasks = plan.tasks.filter(t => t.category?.toLowerCase() === catName.toLowerCase());
    if (catTasks.length === 0) return 0;
    const completed = catTasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
    return Math.round((completed / catTasks.length) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-deep flex items-center justify-center">
        <div className="animate-pulse text-line text-lg">Running structural date operations...</div>
      </div>
    );
  }

  // Find first pending milestone for context
  let nextMilestone = null;
  if (roadmap?.milestones) {
    const pending = [...roadmap.milestones].sort((a, b) => a.priority_order - b.priority_order).filter(m => m.status === 'pending');
    if (pending.length > 0) nextMilestone = pending[0];
  }


  return (
    <div className="min-h-screen bg-background-deep text-paper font-sans pb-12 selection:bg-highlight/30 w-full max-w-[100vw] overflow-x-hidden">

      {/* Top Header Bar */}
      <div className="w-full border-b border-border-subtle px-4 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4 bg-background-deep/80 backdrop-blur sticky top-0 z-50">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-card/80 text-line transition hover:border-outline hover:text-paper"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-paper tracking-tight">Weekly Planner</h1>
            {plan ? (
              <p className="text-[11px] text-line uppercase tracking-wider font-semibold">
                Week &bull; {plan.start_date} — {plan.end_date}
              </p>
            ) : (
              <p className="text-[11px] text-line uppercase tracking-wider font-semibold">
                {targetRole} Track
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {plan && totalCount > 0 && (totalCount - completedCount) <= 2 && (
            <button
              onClick={generatePlan}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 text-xs font-bold text-indigo-400 transition hover:bg-indigo-500/20 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {creating ? 'Generating...' : 'Generate Next Week'}
            </button>
          )}
          {plan && totalCount > 0 && (
            <button
              onClick={() => setShowAddTask(!showAddTask)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-highlight px-4 py-2 text-xs font-semibold text-ink shadow-lg shadow-highlight/20 transition hover:bg-primary-fixed cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">

        {(!plan || totalCount === 0) && (
          <div className="flex flex-col items-center justify-center pt-20 pb-10">
            <div className="bg-surface-card/40 border border-border-subtle rounded-3xl p-10 max-w-md text-center shadow-xl backdrop-blur-sm">
              <div className="mx-auto w-16 h-16 bg-highlight/10 rounded-2xl flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-highlight" />
              </div>
              <h2 className="text-xl font-bold text-paper mb-3">Plan Your Week</h2>
              <p className="text-sm text-line mb-8 leading-relaxed">
                Generate a personalized weekly plan consisting of 7 tailored tasks designed to advance you toward your target role as a <strong className="text-on-surface">{targetRole}</strong>.
              </p>
              <button
                onClick={generatePlan}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-highlight px-5 py-3.5 text-sm font-bold text-ink shadow-lg shadow-highlight/20 transition hover:bg-primary-fixed cursor-pointer disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <div className="h-4 w-4 border-2 border-background-deep border-t-transparent rounded-full animate-spin"></div>
                    Generating AI Plan...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Generate Weekly Plan
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Roadmap Milestone Context Panel */}
      {nextMilestone && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <Link to="/roadmap" className="flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface-card/50 hover:bg-surface-container/50 hover:border-border-subtle transition">
            <Target className="h-5 w-5 text-highlight shrink-0" />
            <div>
              <p className="text-[10px] text-line font-bold uppercase tracking-wider mb-0.5">Working toward roadmap milestone</p>
              <p className="text-sm font-semibold text-paper">{nextMilestone.title} <span className="text-line font-normal">({nextMilestone.category})</span></p>
            </div>
            <ArrowLeft className="h-4 w-4 text-outline rotate-180 ml-auto" />
          </Link>
        </div>
      )}

      {/* Main Content Area */}
      {plan && totalCount > 0 && (
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Content Stream */}
          <div className="lg:col-span-8 space-y-6">

            {/* Day Filter Tab Bar */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 border-b border-border-subtle no-scrollbar">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day}
                  onClick={() => setActiveDayFilter(day)}
                  className={`min-h-10 sm:min-h-0 py-1.5 px-3.5 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-all ${activeDayFilter === day
                    ? "bg-highlight text-ink font-bold"
                    : "text-line hover:text-paper hover:bg-surface-card"
                    }`}
                >
                  {day}
                </button>
              ))}
            </div>

            {/* Add Custom Task Dropdown Form */}
            {showAddTask && (
              <form
                onSubmit={addTask}
                className="rounded-2xl border border-border-subtle bg-surface-card/40 p-5 shadow-lg backdrop-blur space-y-4"
              >
                <h3 className="text-sm font-bold text-paper">Manual Metric Addition</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-line block mb-1">Task Details</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-border-subtle bg-background-deep px-3 py-2.5 text-sm text-paper outline-none focus:border-highlight transition"
                      value={newTask.title}
                      onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="e.g. Analyze memory layout architecture bounds"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-line block mb-1">Category Mapping</label>
                    <select
                      className="w-full rounded-xl border border-border-subtle bg-background-deep px-3 py-2.5 text-xs text-paper outline-none focus:border-highlight cursor-pointer"
                      value={newTask.category}
                      onChange={e => setNewTask({ ...newTask, category: e.target.value })}
                    >
                      {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-line block mb-1">Priority Metric</label>
                    <select
                      className="w-full rounded-xl border border-border-subtle bg-background-deep px-3 py-2.5 text-xs text-paper outline-none focus:border-highlight cursor-pointer"
                      value={newTask.priority}
                      onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                    >
                      <option value="Low">Low Scale</option>
                      <option value="Medium">Medium Scale</option>
                      <option value="High">High Scale</option>
                      <option value="Critical">Critical Scale</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-line block mb-1">Allocated Minutes</label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-border-subtle bg-background-deep px-3 py-2.5 text-xs text-paper outline-none focus:border-highlight transition"
                      value={newTask.estimated_minutes}
                      onChange={e => setNewTask({ ...newTask, estimated_minutes: parseInt(e.target.value) || 30 })}
                      min="5"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 justify-end">
                  <button type="button" onClick={() => setShowAddTask(false)} className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-semibold text-line transition hover:bg-surface-card">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-xl bg-highlight px-4 py-2 text-xs font-semibold text-ink transition hover:bg-primary-fixed">
                    Commit Task
                  </button>
                </div>
              </form>
            )}

            {/* Feed Card Renderer (re-staggers when the day filter changes) */}
            <div key={activeDayFilter} className="stagger-list space-y-4">
              {filteredTasks.length === 0 ? (
                <div className="bg-surface-card/20 border border-dashed border-border-subtle rounded-2xl p-12 text-center text-line text-xs flex flex-col items-center justify-center">
                  <LayoutList className="w-8 h-8 opacity-20 mb-2" />
                  No parameters listed under sequence filter "{activeDayFilter}".
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const cat = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.Custom;
                  const isDone = (task.status || '').toLowerCase() === 'completed';
                  return (
                    <div
                      key={task.id}
                      className={`lift group relative flex items-start gap-4 rounded-2xl border p-5 ${isDone
                        ? 'border-border-subtle bg-surface-card/20 opacity-50'
                        : 'border-border-subtle bg-surface-card/50 hover:border-border-subtle'
                        }`}
                    >
                      <button
                        onClick={() => toggleTask(task)}
                        aria-label={isDone ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
                        className={`relative mt-0.5 shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-md border transition cursor-pointer before:absolute before:-inset-3 before:content-[''] ${isDone
                          ? 'border-highlight bg-highlight text-ink'
                          : 'border-outline hover:border-primary-fixed'
                          } ${isDone && justToggled === task.id ? 'success-ring' : ''}`}
                      >
                        {isDone && <Check className={`h-3.5 w-3.5 stroke-3 ${justToggled === task.id ? 'pop-check' : ''}`} />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span className="text-[9px] bg-background-deep border border-border-subtle text-highlight font-extrabold tracking-wider px-2 py-0.5 rounded uppercase">
                              {task.displayDay}
                            </span>
                            <h4 className={`text-sm font-bold mt-1.5 transition-all ${isDone ? 'line-through text-line' : 'text-paper'}`}>
                              {task.title}
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                            <span className="text-[9px] bg-background-deep border border-border-subtle text-line font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                              {PRIORITY_ICONS[task.priority] || '⚪'} {task.priority}
                            </span>
                            <span
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                              style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}
                            >
                              {task.category}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center gap-4 text-[10px] text-line font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {task.estimated_minutes || 30} mins
                          </span>
                          <span className={`flex items-center gap-1 ${isDone ? "text-emerald-500" : "text-amber-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isDone ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                            {task.status || 'Pending'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 inline-flex h-7 w-7 pointer-coarse:h-10 pointer-coarse:w-10 items-center justify-center rounded-lg text-line transition hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* Right Metric Grid Section */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-surface-card/40 border border-border-subtle rounded-2xl p-6 flex flex-col items-center shadow-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-line w-full border-b border-border-subtle pb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-highlight" />
                Weekly Progress Gauge
              </h3>

              <div className="relative flex items-center justify-center my-6">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle cx="48" cy="48" r="38" stroke="color-mix(in srgb, var(--color-paper) 12%, transparent)" strokeWidth="5" fill="transparent" />
                  <circle
                    cx="48"
                    cy="48"
                    r="38"
                    stroke="var(--color-highlight)"
                    strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 38}`}
                    strokeDashoffset={`${(2 * Math.PI * 38) * (1 - progressPct / 100)}`}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                    style={{ '--ring-full': `${2 * Math.PI * 38}`, animation: 'ring-in var(--dur-4) var(--ease-draft) backwards' }}
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-xl font-extrabold text-paper">{progressPct}%</span>
                  <span className="block text-[8px] text-line font-bold uppercase">MET</span>
                </div>
              </div>

              <p className="text-xs font-semibold text-paper text-center">
                {completedCount} of {totalCount} Tasks Checked
              </p>
            </div>

            {/* Category distributions progress bars */}
            <div className="bg-surface-card/40 border border-border-subtle rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-bold text-line uppercase tracking-wider flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-highlight" />
                Category Analytics
              </h4>

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-on-surface">Data Structures & Algos</span>
                    <span className="text-highlight">{getCategoryProgress("DSA")}%</span>
                  </div>
                  <div className="w-full bg-background-deep rounded-full h-1.5 overflow-hidden border border-border-subtle">
                    <div className="bar-grow bg-highlight h-full rounded-full transition-all duration-300" style={{ width: `${getCategoryProgress("DSA")}%` }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-on-surface">Core Subjects (DBMS/OS)</span>
                    <span className="text-highlight">{getCategoryProgress("Subjects")}%</span>
                  </div>
                  <div className="w-full bg-background-deep rounded-full h-1.5 overflow-hidden border border-border-subtle">
                    <div className="bar-grow bg-highlight h-full rounded-full transition-all duration-300" style={{ width: `${getCategoryProgress("Subjects")}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
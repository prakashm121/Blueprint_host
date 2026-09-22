import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import {
  Plus, Check, Trash2, Clock, LayoutList,
  ArrowLeft, Sparkles, Target, Flame, Tag
} from 'lucide-react';

const CATEGORY_COLORS = {
  DSA: { bg: 'rgba(168,85,247,0.12)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  Subjects: { bg: 'rgba(59,130,246,0.12)', text: '#93c5fd', border: 'rgba(59,130,246,0.25)' },
  Resume: { bg: 'rgba(34,197,94,0.12)', text: '#86efac', border: 'rgba(34,197,94,0.25)' },
  Projects: { bg: 'rgba(251,146,60,0.12)', text: '#fdba74', border: 'rgba(251,146,60,0.25)' },
  'Company Preparation': { bg: 'rgba(244,63,94,0.12)', text: '#fda4af', border: 'rgba(244,63,94,0.25)' },
  'Mock Interview': { bg: 'rgba(14,165,233,0.12)', text: '#7dd3fc', border: 'rgba(14,165,233,0.25)' },
  Custom: { bg: 'rgba(148,163,184,0.12)', text: '#cbd5e1', border: 'rgba(148,163,184,0.25)' },
};

const PRIORITY_ICONS = {
  Critical: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🟢',
};

const DAYS_OF_WEEK = ["All", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Planner() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [activeDayFilter, setActiveDayFilter] = useState("All");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [roadmap, setRoadmap] = useState(null);

  const [newTask, setNewTask] = useState({
    title: '',
    category: 'Custom',
    priority: 'Medium',
    estimated_minutes: 30
  });

  const fetchPlan = async () => {
    try {
      const res = await api.get('/api/v1/planner/plans');
      setPlan(res.data);
    } catch (err) {
      console.error("Failed to load plan track:", err);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/v1/profile/');
      if (res.data?.target_role) {
        setTargetRole(res.data.target_role);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRoadmap = async () => {
    try {
      const res = await api.get('/api/v1/roadmap');
      setRoadmap(res.data);
    } catch (err) {
      console.error("Failed to load roadmap:", err);
    }
  };

  useEffect(() => {
    fetchPlan();
    fetchProfile();
    fetchRoadmap();
  }, []);

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

  const toggleTask = async (task) => {
    const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    try {
      await api.patch(`/api/v1/planner/tasks/${task.id}`, { status: newStatus });
      fetchPlan();
    } catch (err) {
      console.error(err);
    }
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
    const completed = catTasks.filter(t => t.status === 'Completed').length;
    return Math.round((completed / catTasks.length) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 text-lg">Running structural date operations...</div>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12 selection:bg-sky-500/30">

      {/* Top Header Bar */}
      <div className="w-full border-b border-slate-900 px-6 py-4 flex items-center justify-between bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 transition hover:border-slate-600 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Weekly Planner</h1>
            {plan ? (
              <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                Week • {plan.start_date} — {plan.end_date}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
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
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">

        {(!plan || totalCount === 0) && (
          <div className="flex flex-col items-center justify-center pt-20 pb-10">
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-10 max-w-md text-center shadow-xl backdrop-blur-sm">
              <div className="mx-auto w-16 h-16 bg-sky-500/10 rounded-2xl flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-sky-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Plan Your Week</h2>
              <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                Generate a personalized weekly plan consisting of 7 tailored tasks designed to advance you toward your target role as a <strong className="text-slate-300">{targetRole}</strong>.
              </p>
              <button
                onClick={generatePlan}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 cursor-pointer disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
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
          <Link to="/roadmap" className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 hover:border-slate-700 transition">
            <Target className="h-5 w-5 text-sky-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Working toward roadmap milestone</p>
              <p className="text-sm font-semibold text-white">{nextMilestone.title} <span className="text-slate-500 font-normal">({nextMilestone.category})</span></p>
            </div>
            <ArrowLeft className="h-4 w-4 text-slate-600 rotate-180 ml-auto" />
          </Link>
        </div>
      )}

      {/* Main Content Area */}
      {plan && totalCount > 0 && (
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Content Stream */}
          <div className="lg:col-span-8 space-y-6">

            {/* Day Filter Tab Bar */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 border-b border-slate-900 no-scrollbar">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day}
                  onClick={() => setActiveDayFilter(day)}
                  className={`py-1.5 px-3.5 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-all ${activeDayFilter === day
                    ? "bg-sky-500 text-slate-950 font-bold"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
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
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-lg backdrop-blur space-y-4"
              >
                <h3 className="text-sm font-bold text-white">Manual Metric Addition</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Task Details</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500 transition"
                      value={newTask.title}
                      onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="e.g. Analyze memory layout architecture bounds"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Category Mapping</label>
                    <select
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-sky-500 cursor-pointer"
                      value={newTask.category}
                      onChange={e => setNewTask({ ...newTask, category: e.target.value })}
                    >
                      {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Priority Metric</label>
                    <select
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-sky-500 cursor-pointer"
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
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Allocated Minutes</label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-sky-500 transition"
                      value={newTask.estimated_minutes}
                      onChange={e => setNewTask({ ...newTask, estimated_minutes: parseInt(e.target.value) || 30 })}
                      min="5"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 justify-end">
                  <button type="button" onClick={() => setShowAddTask(false)} className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-900">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400">
                    Commit Task
                  </button>
                </div>
              </form>
            )}

            {/* Feed Card Renderer */}
            <div className="space-y-4">
              {filteredTasks.length === 0 ? (
                <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
                  <LayoutList className="w-8 h-8 opacity-20 mb-2" />
                  No parameters listed under sequence filter "{activeDayFilter}".
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const cat = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.Custom;
                  const isDone = task.status === 'Completed';
                  return (
                    <div
                      key={task.id}
                      className={`group relative flex items-start gap-4 rounded-2xl border p-5 transition-all duration-200 ${isDone
                        ? 'border-slate-900 bg-slate-900/20 opacity-50'
                        : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                        }`}
                    >
                      <button
                        onClick={() => toggleTask(task)}
                        className={`mt-0.5 shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-md border transition cursor-pointer ${isDone
                          ? 'border-sky-500 bg-sky-500 text-slate-950'
                          : 'border-slate-600 hover:border-sky-400'
                          }`}
                      >
                        {isDone && <Check className="h-3.5 w-3.5 stroke-3" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <span className="text-[9px] bg-slate-950 border border-slate-800 text-sky-400 font-extrabold tracking-wider px-2 py-0.5 rounded uppercase">
                              {task.displayDay}
                            </span>
                            <h4 className={`text-sm font-bold mt-1.5 transition-all ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
                              {task.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] bg-slate-950 border border-slate-800 text-slate-400 font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
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

                        <div className="mt-2.5 flex items-center gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
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
                        className="shrink-0 opacity-0 group-hover:opacity-100 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
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
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col items-center shadow-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 w-full border-b border-slate-800 pb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-400" />
                Weekly Progress Gauge
              </h3>

              <div className="relative flex items-center justify-center my-6">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle cx="48" cy="48" r="38" stroke="rgba(51, 65, 85, 0.15)" strokeWidth="5" fill="transparent" />
                  <circle
                    cx="48"
                    cy="48"
                    r="38"
                    stroke="#0ea5e9"
                    strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 38}`}
                    strokeDashoffset={`${(2 * Math.PI * 38) * (1 - progressPct / 100)}`}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-xl font-extrabold text-white">{progressPct}%</span>
                  <span className="block text-[8px] text-slate-500 font-bold uppercase">MET</span>
                </div>
              </div>

              <p className="text-xs font-semibold text-white text-center">
                {completedCount} of {totalCount} Tasks Checked
              </p>
            </div>

            {/* Category distributions progress bars */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-sky-400" />
                Category Analytics
              </h4>

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Data Structures & Algos</span>
                    <span className="text-sky-400">{getCategoryProgress("DSA")}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-900">
                    <div className="bg-sky-500 h-full rounded-full transition-all duration-300" style={{ width: `${getCategoryProgress("DSA")}%` }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Core Subjects (DBMS/OS)</span>
                    <span className="text-sky-400">{getCategoryProgress("Subjects")}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-900">
                    <div className="bg-sky-500 h-full rounded-full transition-all duration-300" style={{ width: `${getCategoryProgress("Subjects")}%` }}></div>
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
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { ArrowLeft, Save, CheckCircle2, Brain, Code2, Sparkles } from 'lucide-react';

// ─── Calibration hints ───────────────────────────────────────────────────────
const CALIBRATION_HINTS = {
  // Core subjects
  operating_systems:     'Can you explain process scheduling, deadlocks, and virtual memory without looking it up?',
  dbms:                  'Can you write complex SQL JOINs, explain ACID properties, and discuss indexing strategies?',
  computer_networks:     'Do you understand TCP/IP, DNS resolution, HTTP vs HTTPS, and OSI layers end to end?',
  system_design:         'Can you design a URL shortener or chat system with scale, caching, and load balancing in mind?',
  // DSA
  arrays_strings:        'Can you solve Two Sum, Sliding Window, and prefix sum problems without hints?',
  trees_graphs:          'Can you traverse trees and graphs, implement BFS/DFS, and explain when to use each?',
  dynamic_programming:   'Can you identify DP sub-problems and solve knapsack, LCS, or coin change from scratch?',
  sorting_searching:     'Can you implement binary search and merge sort from memory, and analyse their complexity?',
  // Role-specific
  distributed_systems:   'Do you understand consistency models, CAP theorem, and distributed consensus?',
  caching_redis:         'Can you explain cache eviction policies, Redis data structures, and cache-aside pattern?',
  api_design:            'Can you design a RESTful API with pagination, versioning, and proper error codes?',
  sql_advanced:          'Can you write window functions, CTEs, and optimise slow queries using EXPLAIN?',
  javascript_typescript: 'Are you comfortable with closures, async/await, generics, and strict TypeScript?',
  css_layout:            'Can you implement complex layouts with Flexbox, Grid, and responsive breakpoints?',
  browser_apis:          'Do you understand the event loop, Web Workers, Service Workers, and Fetch API?',
  react_patterns:        'Can you implement custom hooks, Context, code-splitting, and performance optimisations?',
  python_data:           'Are you comfortable with pandas, NumPy, and writing efficient data pipelines?',
  distributed_computing: 'Do you understand MapReduce, Spark, and distributed data partitioning?',
  statistics:            'Can you explain hypothesis testing, distributions, and Bayes theorem with examples?',
  linux_shell:           'Can you write shell scripts, manage processes, and navigate the Linux filesystem?',
  docker_kubernetes:     'Can you containerise an app, write a Dockerfile, and understand K8s pods and services?',
  cicd_pipelines:        'Can you set up a CI/CD pipeline from scratch with tests, builds, and deployments?',
  cloud_platforms:       'Are you familiar with IAM, compute, storage, and networking concepts on AWS/GCP/Azure?',
  linear_algebra:        'Do you understand matrix operations, eigenvalues, and how they apply to ML?',
  python_ml:             'Are you comfortable with scikit-learn, PyTorch, or TensorFlow for model training?',
  model_evaluation:      'Can you explain precision, recall, F1, AUC-ROC, and pick the right metric for a problem?',
};

const CATEGORY_META = {
  'Core Subjects':       { icon: Brain,    colour: 'text-highlight',     bg: 'bg-highlight/10',     border: 'border-highlight/20' },
  'DSA':                 { icon: Code2,    colour: 'text-violet-400',   bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  'Backend':             { icon: Sparkles, colour: 'text-amber-400',    bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  'Frontend':            { icon: Sparkles, colour: 'text-pink-400',     bg: 'bg-pink-500/10',    border: 'border-pink-500/20' },
  'Database':            { icon: Sparkles, colour: 'text-emerald-400',  bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  'System Design':       { icon: Sparkles, colour: 'text-orange-400',   bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  'DevOps':              { icon: Sparkles, colour: 'text-highlight',     bg: 'bg-highlight/10',    border: 'border-highlight/20' },
  'Testing & QA':        { icon: Sparkles, colour: 'text-rose-400',     bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
  'UI/UX & Design':      { icon: Sparkles, colour: 'text-fuchsia-400',  bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
  'AI & ML':             { icon: Sparkles, colour: 'text-indigo-400',   bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  'Data Analytics & BI': { icon: Sparkles, colour: 'text-secondary',     bg: 'bg-secondary/10',    border: 'border-secondary/20' },
  'Security & Networking':{ icon: Sparkles, colour: 'text-red-400',      bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  'Programming Languages':{ icon: Sparkles, colour: 'text-lime-400',     bg: 'bg-lime-500/10',    border: 'border-lime-500/20' },
  'Behavioral':          { icon: Sparkles, colour: 'text-teal-400',     bg: 'bg-teal-500/10',    border: 'border-teal-500/20' },
  'default':             { icon: Sparkles, colour: 'text-line',     bg: 'bg-outline/10',    border: 'border-outline/20' },
};

function confidenceColour(v) {
  if (v >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
  if (v >= 40) return { bar: 'bg-amber-500',   text: 'text-amber-400' };
  return              { bar: 'bg-red-500',     text: 'text-red-400' };
}

function SkillSlider({ item, value, onChange }) {
  const hint  = CALIBRATION_HINTS[item.skill_key];
  const { bar, text } = confidenceColour(value);
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-4 transition hover:border-border-default">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-on-surface">{item.label}</span>
        <span className={`text-sm font-bold tabular-nums ${text}`}>{value}%</span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-surface-container-high mb-3 overflow-hidden">
        <div
          className={`bar-grow ${bar} h-full rounded-full transition-all duration-300`}
          style={{ width: `${value}%` }}
        />
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={value}
        onChange={(e) => onChange(item.skill_key, Number(e.target.value))}
        className="h-8 w-full accent-highlight cursor-pointer"
      />
      {hint && (
        <p className="mt-2 text-[11px] text-on-surface-variant leading-relaxed italic">{hint}</p>
      )}
    </div>
  );
}

export default function Subjects() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [local, setLocal] = useState({});   // { skill_key: confidence }
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['subjectBreakdown'],
    queryFn: () => api.get('/api/v1/assessments/subjects').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  });

  // Initialise local state from fetched data
  useEffect(() => {
    if (!data?.categories) return;
    const initial = {};
    data.categories.forEach(cat => {
      cat.skills.forEach(s => {
        initial[s.skill_key] = s.confidence;
      });
    });
    setLocal(initial);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload) => api.patch('/api/v1/assessments/subjects', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectBreakdown'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleChange = (key, val) => setLocal(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    const updates = Object.entries(local).map(([skill_key, confidence]) => ({ skill_key, confidence }));
    mutation.mutate({ role: data?.role || "Software Engineer", updates });
  };

  // ─── Render section ────────────────────────────────────────────────────────
  const renderCategory = (category) => {
    if (!category?.skills?.length) return null;
    const meta  = CATEGORY_META[category.name] ?? CATEGORY_META.default;
    const Icon  = meta.icon;
    return (
      <section key={category.name}>
        <div className={`flex items-center gap-2 mb-4 px-1`}>
          <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${meta.bg} border ${meta.border}`}>
            <Icon className={`h-3.5 w-3.5 ${meta.colour}`} />
          </div>
          <h2 className={`text-sm font-bold uppercase tracking-widest ${meta.colour}`}>{category.name}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {category.skills.map(item => (
            <SkillSlider
              key={item.skill_key}
              item={item}
              value={local[item.skill_key] ?? item.confidence}
              onChange={handleChange}
            />
          ))}
        </div>
      </section>
    );
  };

  const confidentCount = data?.confident_count ?? 0;
  const total          = data?.total ?? 0;

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => navigate('/dashboard')}
              className="-ml-2 mb-2 flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs text-on-surface-variant hover:text-on-surface transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-on-surface">Subject Confidence</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Rate how confident you feel in each area. These scores shape your weekly plan and AI mentor.
            </p>
          </div>

          {/* Stats badge */}
          {total > 0 && (
            <div className="shrink-0 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3 text-center">
              <p className="text-2xl font-bold text-on-surface tabular-nums">{confidentCount}</p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">/ {total} confident</p>
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-highlight border-t-transparent animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && total === 0 && (
          <div className="rounded-2xl border border-border-subtle bg-surface-card p-10 text-center">
            <Brain className="mx-auto mb-3 h-8 w-8 text-on-surface-variant" />
            <p className="text-sm font-semibold text-on-surface">No subjects assessed yet</p>
            <p className="mt-1 text-xs text-on-surface-variant">Complete onboarding to set your initial confidence scores.</p>
            <button
              onClick={() => navigate('/onboarding')}
              className="mt-4 rounded-xl bg-highlight px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-fixed transition"
            >
              Start Onboarding
            </button>
          </div>
        )}

        {/* Sliders */}
        {!isLoading && total > 0 && (
          <div className="space-y-10">
            {data?.categories?.map(cat => renderCategory(cat))}

            {/* Save button */}
            <div className="sticky bottom-4 flex justify-center">
              <button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="flex items-center gap-2 rounded-2xl bg-highlight px-8 py-3 text-sm font-semibold text-ink shadow-lg shadow-highlight/20 transition hover:bg-primary-fixed disabled:opacity-60"
              >
                {saved ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Saved!
                  </>
                ) : mutation.isPending ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-background-deep/40 border-t-transparent animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Confidence Levels
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

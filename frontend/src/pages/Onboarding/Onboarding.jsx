import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { ChevronRight, Sparkles, Target, GraduationCap, Check, Map, User } from 'lucide-react';

const STEPS = ['profile', 'goals', 'role_skills', 'roadmap'];

const PREPARATION_OPTIONS = [
  { value: 'beginner', label: 'Just starting',  desc: "I haven't really begun yet" },
  { value: 'early',    label: 'Early stage',    desc: "I've done some practice but nothing structured" },
  { value: 'mid',      label: 'Midway',         desc: "I'm preparing consistently but still building skills" },
  { value: 'late',     label: 'Late stage',     desc: "Interviews are coming up soon" },
];

// Text-anchored 5-option scale — replaces ambiguous sliders
const CONFIDENCE_OPTIONS = [
  { value: 0,  label: "Never heard of it" },
  { value: 25, label: "I've read about it" },
  { value: 50, label: "I understand the concepts" },
  { value: 75, label: "I've used it in projects" },
  { value: 90, label: "I could teach it" },
];

function StepIndicator({ current }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
            i <= idx ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-500'
          }`}>
            {i < idx ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-8 ${i < idx ? 'bg-sky-500' : 'bg-slate-800'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function ConfidenceRating({ label, value, onChange }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-sm font-medium text-slate-200 mb-3">{label}</p>
      <div className="flex flex-wrap gap-2">
        {CONFIDENCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition border ${
              value === opt.value
                ? 'bg-sky-500 border-sky-500 text-slate-950'
                : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState('profile');
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [roleCatalog, setRoleCatalog] = useState(null);
  const [profileData, setProfileData] = useState({ college_name: '', degree: '', graduation_year: '', cgpa: '' });
  const [preparationStatus, setPreparationStatus] = useState('early');
  const [confidence, setConfidence] = useState({});
  const [goals, setGoals] = useState({ target_role: '', target_companies: [] });
  const [generating, setGenerating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/v1/onboarding/status').catch(() => ({ data: {} })),
      api.get('/api/v1/onboarding/catalog').catch(() => ({ data: null })),
      api.get('/api/v1/assessments/subjects').catch(() => ({ data: null }))
    ]).then(([statusRes, catalogRes, subjectsRes]) => {
      const s = statusRes.data?.onboarding_step;
      if (s === 'completed') { window.location.href = '/roadmap'; return; }
      if (s && STEPS.includes(s)) setStep(s);
      else if (s === 'assessment') setStep('role_skills');
      else if (s === 'generate_roadmap') setStep('roadmap');

      const existingMap = {};
      if (subjectsRes.data) {
        [...(subjectsRes.data.subjects || []), ...(subjectsRes.data.dsa || [])].forEach((item) => {
          existingMap[item.skill_key] = item.confidence;
        });
      }

      const catData = catalogRes.data;
      if (catData) {
        setCatalog(catData);
        const initial = {};
        [...(catData.subjects || []), ...(catData.dsa_topics || [])].forEach((item) => {
          const raw = existingMap[item.key] !== undefined ? existingMap[item.key] : 25;
          // Snap to nearest text-anchored option value
          const snapped = CONFIDENCE_OPTIONS.reduce((prev, curr) =>
            Math.abs(curr.value - raw) < Math.abs(prev.value - raw) ? curr : prev
          ).value;
          initial[item.key] = snapped;
        });
        setConfidence(initial);
        if (!goals.target_role && catData.target_roles?.length) {
          setGoals((g) => ({ ...g, target_role: catData.target_roles[0] }));
        }
      }
      setInitialLoading(false);
    });
  }, [navigate]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.patch('/api/v1/profile/', profileData);
      setStep('goals');
    } catch {
      setError('Failed to save profile. Please try again.');
    }
  };

  const saveRoleSkills = async () => {
    setError('');
    if (!roleCatalog) return;
    const updates = [];
    roleCatalog.categories.forEach(cat => {
      cat.skills.forEach(s => {
        updates.push({ skill_key: s.key, confidence: confidence[s.key] ?? 25 });
      });
    });
    try {
      await api.post('/api/v1/onboarding/role-skills', { updates });
      setShowSummary(true);
    } catch {
      setError('Failed to save assessment.');
    }
  };

  const saveGoals = async () => {
    setError('');
    try {
      await api.post('/api/v1/onboarding/goals', { ...goals, preparation_status: preparationStatus });
      const res = await api.get(`/api/v1/onboarding/role-skills-catalog?role=${encodeURIComponent(goals.target_role)}`);
      setRoleCatalog(res.data);
      
      const newConf = { ...confidence };
      res.data.categories.forEach(cat => {
        cat.skills.forEach(s => {
          if (newConf[s.key] === undefined) newConf[s.key] = 25;
        });
      });
      setConfidence(newConf);
      setStep('role_skills');
    } catch {
      setError('Failed to save goals.');
    }
  };

  const generateRoadmap = async () => {
    setShowSummary(false);
    setGenerating(true);
    setStep('roadmap');
    setError('');
    try {
      await api.post('/api/v1/onboarding/generate-roadmap');
      window.location.href = '/roadmap';
    } catch {
      setError('Failed to generate your roadmap. Please try again.');
      setGenerating(false);
    }
  };

  const skipToRoadmap = () => { window.location.href = '/roadmap'; };


  const toggleCompany = (name) => {
    setGoals((g) => ({
      ...g,
      target_companies: g.target_companies.includes(name)
        ? g.target_companies.filter((c) => c !== name)
        : [...g.target_companies, name].slice(0, 5),
    }));
  };

  const allSkills = roleCatalog ? roleCatalog.categories.flatMap(c => c.skills) : [];
  const weakAreas = allSkills.filter(s => (confidence[s.key] ?? 25) <= 25).map(s => s.label);
  const strongAreas = allSkills.filter(s => (confidence[s.key] ?? 25) >= 75).map(s => s.label);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin mb-4"></div>
        <p className="text-sm text-slate-400 font-medium tracking-widest uppercase">Loading Onboarding...</p>
      </div>
    );
  }

  // Personalization summary — shown after goals, before roadmap generation
  if (showSummary) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100 sm:px-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/95 p-8 shadow-2xl backdrop-blur">
          <div className="text-center mb-8">
            <p className="text-sm uppercase tracking-[0.35em] text-sky-400/80 mb-2">Almost there</p>
            <h1 className="text-3xl font-semibold text-white">Here's what Blueprint learned about you</h1>
            <p className="text-slate-400 text-sm mt-2">Your roadmap will be tailored to all of this.</p>
          </div>
          <div className="space-y-3 mb-8">
            {[
              { label: 'Target Role', value: goals.target_role },
              { label: 'Target Companies', value: goals.target_companies.join(', ') || 'Not selected' },
              { label: 'Preparation Stage', value: PREPARATION_OPTIONS.find(o => o.value === preparationStatus)?.label || preparationStatus },
              { label: 'Weak Areas', value: weakAreas.slice(0, 3).join(', ') || 'None identified', warn: weakAreas.length > 0 },
              { label: 'Strong Areas', value: strongAreas.slice(0, 3).join(', ') || 'None identified yet' },
            ].map(row => (
              <div key={row.label} className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                <span className="text-sm text-slate-400 font-medium w-44 shrink-0">{row.label}</span>
                <span className={`text-sm font-semibold text-right ${row.warn ? 'text-amber-400' : 'text-sky-300'}`}>{row.value}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={generateRoadmap}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            <Sparkles className="h-4 w-4" /> Generate my personalized roadmap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/95 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <div className="mb-4 space-y-3 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-sky-400/80">Onboarding</p>
          <h1 className="text-3xl font-semibold text-white">
            {step === 'profile' && 'Tell us about yourself'}
            {step === 'goals' && 'Set your career goals'}
            {step === 'role_skills' && 'Rate your current knowledge'}
            {step === 'roadmap' && 'Generating your roadmap'}
          </h1>
        </div>

        <StepIndicator current={step} />
        {error && <div className="mb-4 rounded-2xl border border-red-600/20 bg-red-600/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        {step === 'profile' && (
          <form onSubmit={saveProfile} className="grid gap-5">
            {[
              { label: 'College / University', name: 'college_name', type: 'text', required: true },
              { label: 'Degree (e.g., B.Tech)', name: 'degree', type: 'text' },
              { label: 'Graduation Year', name: 'graduation_year', type: 'number' },
              { label: 'Current CGPA', name: 'cgpa', type: 'number', step: '0.01' },
            ].map((field) => (
              <label key={field.name} className="block text-sm font-medium text-slate-200">
                {field.label}
                <input
                  type={field.type}
                  step={field.step}
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                  value={profileData[field.name]}
                  onChange={(e) => setProfileData({
                    ...profileData,
                    [field.name]: field.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value,
                  })}
                  required={field.required}
                />
              </label>
            ))}

            {/* Preparation status — additive new field */}
            <div>
              <p className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-sky-400" /> Where are you in your placement prep?
              </p>
              <div className="space-y-2">
                {PREPARATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPreparationStatus(opt.value)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                      preparationStatus === opt.value
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-200">{opt.label}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-400">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {step === 'role_skills' && roleCatalog && (
          <div className="space-y-6">
            <p className="text-sm text-slate-400">
              Rate your skills for <strong className="text-sky-400">{goals.target_role}</strong>.
            </p>
            {roleCatalog.categories.map((cat, idx) => (
              <div key={cat.name}>
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
                  {idx === 0 ? <GraduationCap className="h-4 w-4 text-sky-400" /> : <div className="w-4" />}
                  {cat.name}
                </p>
                <div className="space-y-3">
                  {cat.skills.map((s) => (
                    <ConfidenceRating key={s.key} label={s.label} value={confidence[s.key] ?? 25} onChange={(v) => setConfidence({ ...confidence, [s.key]: v })} />
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={saveRoleSkills} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-400">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 'goals' && catalog && (
          <div className="space-y-6">
            <label className="block text-sm font-medium text-slate-200">
              Target role
              <select
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400"
                value={goals.target_role}
                onChange={(e) => setGoals({ ...goals, target_role: e.target.value })}
              >
                {catalog.target_roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                <Target className="h-4 w-4 text-sky-400" /> Target companies (pick up to 5)
              </p>
              <div className="flex flex-wrap gap-2">
                {catalog.sample_companies.map((co) => (
                  <button key={co} type="button" onClick={() => toggleCompany(co)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                      goals.target_companies.includes(co) ? 'bg-sky-500 text-slate-950' : 'border border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                    }`}>
                    {co}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={saveGoals} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-400">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 'roadmap' && (
          <div className="text-center space-y-6">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-500/10 text-sky-300 mx-auto">
              {generating ? (
                <div className="w-10 h-10 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
              ) : (
                <Map className="h-10 w-10" />
              )}
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-white">
                {generating ? 'Building your personalized roadmap…' : 'Ready to map your journey?'}
              </h2>
              <p className="text-slate-400 leading-6 text-sm">
                {generating
                  ? 'Our AI is analysing your weak areas and career goals. This takes 10–20 seconds.'
                  : "We'll generate a role-specific milestone roadmap tailored to your skills and target companies."}
              </p>
            </div>
            {!generating && (
              <button type="button" onClick={generateRoadmap} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-400">
                <Sparkles className="h-4 w-4" /> Generate my roadmap
              </button>
            )}
            <button type="button" onClick={skipToRoadmap} className="text-sm text-slate-500 hover:text-slate-300 transition">
              Skip for now → Go to roadmap
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

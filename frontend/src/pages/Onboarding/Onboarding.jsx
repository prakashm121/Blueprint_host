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
    <div className="mb-6 flex items-center justify-center gap-1.5 sm:mb-8 sm:gap-2">
      {STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1.5 sm:gap-2">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 sm:h-8 sm:w-8 ${
            i <= idx ? 'bg-highlight text-ink' : 'bg-surface-container text-line'
          }`}>
            {i < idx ? <Check className="pop-check h-4 w-4" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-5 transition-colors duration-300 sm:w-8 ${i < idx ? 'bg-highlight' : 'bg-surface-container'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function ConfidenceRating({ label, value, onChange }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-background-deep/60 p-3.5 sm:p-4">
      <p className="text-sm font-medium text-paper mb-3">{label}</p>
      <div className="flex flex-wrap gap-2">
        {CONFIDENCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`min-h-9 rounded-xl px-3 py-1.5 text-xs font-medium transition border ${
              value === opt.value
                ? 'bg-highlight border-highlight text-ink'
                : 'border-border-subtle bg-background-deep text-on-surface hover:border-outline'
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
      <div className="min-h-screen bg-background-deep flex flex-col items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-highlight border-t-transparent animate-spin mb-4"></div>
        <p className="text-sm text-line font-medium tracking-widest uppercase">Loading Onboarding...</p>
      </div>
    );
  }

  // Personalization summary — shown after goals, before roadmap generation
  if (showSummary) {
    return (
      <div className="animate-page-in min-h-screen bg-background-deep px-3 py-6 text-paper sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border-subtle bg-surface-card/95 p-5 shadow-2xl backdrop-blur sm:rounded-3xl sm:p-8">
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-[0.25em] text-highlight/80 sm:text-sm sm:tracking-[0.35em] mb-2">Almost there</p>
            <h1 className="text-2xl font-semibold text-paper sm:text-3xl">Here's what Blueprint learned about you</h1>
            <p className="text-line text-sm mt-2">Your roadmap will be tailored to all of this.</p>
          </div>
          <div className="stagger-list space-y-3 mb-8">
            {[
              { label: 'Target Role', value: goals.target_role },
              { label: 'Target Companies', value: goals.target_companies.join(', ') || 'Not selected' },
              { label: 'Preparation Stage', value: PREPARATION_OPTIONS.find(o => o.value === preparationStatus)?.label || preparationStatus },
              { label: 'Weak Areas', value: weakAreas.slice(0, 3).join(', ') || 'None identified', warn: weakAreas.length > 0 },
              { label: 'Strong Areas', value: strongAreas.slice(0, 3).join(', ') || 'None identified yet' },
            ].map(row => (
              <div key={row.label} className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-background-deep/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span className="text-sm text-line font-medium sm:w-44 sm:shrink-0">{row.label}</span>
                <span className={`min-w-0 break-words text-sm font-semibold sm:text-right ${row.warn ? 'text-amber-400' : 'text-primary-fixed'}`}>{row.value}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={generateRoadmap}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-highlight px-4 py-3 text-base font-semibold text-ink transition hover:bg-primary-fixed"
          >
            <Sparkles className="h-4 w-4" /> Generate my personalized roadmap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-in min-h-screen bg-background-deep px-3 py-6 text-paper sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border-subtle bg-surface-card/95 p-5 shadow-2xl shadow-ink/40 backdrop-blur sm:rounded-3xl sm:p-8">
        <div className="mb-4 space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-highlight/80 sm:text-sm sm:tracking-[0.35em]">Onboarding</p>
          <h1 className="text-2xl font-semibold text-paper sm:text-3xl">
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
              <label key={field.name} className="block text-sm font-medium text-paper">
                {field.label}
                <input
                  type={field.type}
                  step={field.step}
                  className="mt-2 w-full rounded-2xl border border-border-subtle bg-background-deep px-4 py-3 text-paper outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-highlight/20"
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
              <p className="text-sm font-medium text-paper mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-highlight" /> Where are you in your placement prep?
              </p>
              <div className="space-y-2">
                {PREPARATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPreparationStatus(opt.value)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                      preparationStatus === opt.value
                        ? 'border-highlight bg-highlight/10'
                        : 'border-border-subtle bg-background-deep/60 hover:border-outline'
                    }`}
                  >
                    <span className="text-sm font-semibold text-paper">{opt.label}</span>
                    <span className="block text-xs text-line mt-0.5">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-highlight px-4 py-3 text-base font-semibold text-ink transition hover:bg-primary-fixed">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {step === 'role_skills' && roleCatalog && (
          <div className="space-y-6">
            <p className="text-sm text-line">
              Rate your skills for <strong className="text-highlight">{goals.target_role}</strong>.
            </p>
            {roleCatalog.categories.map((cat, idx) => (
              <div key={cat.name}>
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-on-surface">
                  {idx === 0 ? <GraduationCap className="h-4 w-4 text-highlight" /> : <div className="w-4" />}
                  {cat.name}
                </p>
                <div className="space-y-3">
                  {cat.skills.map((s) => (
                    <ConfidenceRating key={s.key} label={s.label} value={confidence[s.key] ?? 25} onChange={(v) => setConfidence({ ...confidence, [s.key]: v })} />
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={saveRoleSkills} className="sticky bottom-3 z-10 flex w-full items-center justify-center gap-2 rounded-2xl bg-highlight px-4 py-3 text-base font-semibold text-ink shadow-lg shadow-ink/30 transition hover:bg-primary-fixed">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 'goals' && catalog && (
          <div className="space-y-6">
            <label className="block text-sm font-medium text-paper">
              Target role
              <select
                className="mt-2 w-full rounded-2xl border border-border-subtle bg-background-deep px-4 py-3 text-paper outline-none transition focus:border-primary-fixed"
                value={goals.target_role}
                onChange={(e) => setGoals({ ...goals, target_role: e.target.value })}
              >
                {catalog.target_roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-paper">
                <Target className="h-4 w-4 text-highlight" /> Target companies (pick up to 5)
              </p>
              <div className="flex flex-wrap gap-2">
                {catalog.sample_companies.map((co) => (
                  <button key={co} type="button" onClick={() => toggleCompany(co)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                      goals.target_companies.includes(co) ? 'bg-highlight text-ink' : 'border border-border-subtle bg-background-deep text-on-surface hover:border-outline'
                    }`}>
                    {co}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={saveGoals} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-highlight px-4 py-3 text-base font-semibold text-ink transition hover:bg-primary-fixed">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 'roadmap' && (
          <div className="text-center space-y-6">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-highlight/10 text-primary-fixed mx-auto">
              {generating ? (
                <div className="w-10 h-10 rounded-full border-2 border-primary-fixed border-t-transparent animate-spin" />
              ) : (
                <Map className="h-10 w-10" />
              )}
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-paper">
                {generating ? 'Building your personalized roadmap…' : 'Ready to map your journey?'}
              </h2>
              <p className="text-line leading-6 text-sm">
                {generating
                  ? 'Our AI is analysing your weak areas and career goals. This takes 10–20 seconds.'
                  : "We'll generate a role-specific milestone roadmap tailored to your skills and target companies."}
              </p>
            </div>
            {!generating && (
              <button type="button" onClick={generateRoadmap} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-highlight px-4 py-3 text-base font-semibold text-ink transition hover:bg-primary-fixed">
                <Sparkles className="h-4 w-4" /> Generate my roadmap
              </button>
            )}
            <button type="button" onClick={skipToRoadmap} className="text-sm text-line hover:text-on-surface transition">
              Skip for now → Go to roadmap
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import qaData from '../../data/qa_filters.json';
import dsaData from '../../data/filters.json';
import {
  ArrowLeft, Save, User, GraduationCap, Briefcase,
  X, Plus, Code2, Link as LinkIcon, Phone
} from 'lucide-react';

const SECTIONS = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'academic', label: 'Academic', icon: GraduationCap },
  { id: 'career', label: 'Career Goals', icon: Briefcase },
  { id: 'social', label: 'Social Links', icon: LinkIcon },
];

export default function Profile() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('personal');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [cgpaError, setCgpaError] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    phone_number: '',
    bio: '',
    college_name: '',
    degree: '',
    specialization: '',
    graduation_year: '',
    cgpa: '',
    target_role: '',
    target_companies: [],
    preparation_status: 'early',
    linkedin_url: '',
    github_username: '',
    avatar_url: '',
  });

  useEffect(() => {
    api.get('/api/v1/profile/')
      .then(res => {
        const d = res.data;
        setForm({
          full_name: d.full_name || '',
          phone_number: d.phone_number || '',
          bio: d.bio || '',
          college_name: d.college_name || '',
          degree: d.degree || '',
          specialization: d.specialization || '',
          graduation_year: d.graduation_year ? String(d.graduation_year) : '',
          cgpa: d.cgpa !== null && d.cgpa !== undefined ? String(d.cgpa) : '',
          target_role: d.target_role || '',
          target_companies: d.target_companies || [],
          preparation_status: d.preparation_status || 'early',
          linkedin_url: d.linkedin_url || '',
          github_username: d.github_username || '',
          avatar_url: d.avatar_url || '',
        });
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validateCgpa = val => {
    const n = parseFloat(val);
    if (val === '') return null;
    if (isNaN(n)) return 'Invalid CGPA';
    if (n < 0 || n > 10) return 'CGPA must be between 0 and 10';
    return null;
  };

  const handleCompanyInput = val => {
    setCompanyInput(val);
    if (val.length < 2) { setSuggestions([]); return; }
    const matches = (dsaData.companies || [])
      .filter(c => c.toLowerCase().includes(val.toLowerCase()))
      .slice(0, 8);
    setSuggestions(matches);
  };

  const addCompany = name => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (form.target_companies.length >= 10) return;
    if (form.target_companies.includes(trimmed)) { setCompanyInput(''); setSuggestions([]); return; }
    set('target_companies', [...form.target_companies, trimmed]);
    setCompanyInput('');
    setSuggestions([]);
  };

  const removeCompany = name => {
    set('target_companies', form.target_companies.filter(c => c !== name));
  };

  const handleSave = async e => {
    e.preventDefault();
    const cgpaErr = validateCgpa(form.cgpa);
    if (cgpaErr) { setCgpaError(cgpaErr); return; }
    setCgpaError('');
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.patch('/api/v1/profile/', {
        ...form,
        cgpa: form.cgpa ? parseFloat(form.cgpa) : null,
        graduation_year: form.graduation_year ? parseInt(form.graduation_year) : null,
      });
      setSuccess('Profile saved successfully! If you changed your target role, regenerate your roadmap.');
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full bg-surface-container-low border border-border-subtle rounded-xl px-4 py-3 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:border-primary/50 transition-all";
  const labelClass = "block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5";

  if (loading) return (
    <div className="min-h-screen bg-background-deep flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background-deep text-on-surface font-sans">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/dashboard"
            className="p-2 rounded-xl bg-surface-card border border-border-subtle hover:border-outline transition-all text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">Edit Profile</h1>
            <p className="text-xs text-on-surface-variant mt-0.5">Update your placement preparation profile</p>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Section Nav */}
          <aside className="lg:col-span-1">
            <nav className="flex flex-row lg:flex-col gap-2">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left w-full
                    ${activeSection === s.id
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-surface-card text-on-surface-variant border border-border-subtle hover:border-outline'}`}
                >
                  <s.icon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:block">{s.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Form */}
          <form onSubmit={handleSave} className="lg:col-span-3 space-y-6">

            {/* Personal */}
            {activeSection === 'personal' && (
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-bold text-on-surface border-b border-border-subtle/40 pb-3">Personal Information</h2>
                <div>
                  <label className={labelClass}>Full Name</label>
                  <input className={inputClass} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Your full name" />
                </div>
                <div>
                  <label className={labelClass}>Phone Number <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                  <input className={inputClass} value={form.phone_number} onChange={e => set('phone_number', e.target.value)} placeholder="+91 9876543210" />
                </div>
                <div>
                  <label className={labelClass}>Bio <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                  <textarea className={`${inputClass} resize-none`} rows={3} value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="A short bio about yourself..." />
                </div>
              </div>
            )}

            {/* Academic */}
            {activeSection === 'academic' && (
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-bold text-on-surface border-b border-border-subtle/40 pb-3">Academic Details</h2>
                <div>
                  <label className={labelClass}>College / University</label>
                  <input className={inputClass} value={form.college_name} onChange={e => set('college_name', e.target.value)} placeholder="IIT Bombay, NIT Trichy, etc." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Degree <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                    <input className={inputClass} value={form.degree} onChange={e => set('degree', e.target.value)} placeholder="B.Tech, M.Tech…" />
                  </div>
                  <div>
                    <label className={labelClass}>Specialization <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                    <input className={inputClass} value={form.specialization} onChange={e => set('specialization', e.target.value)} placeholder="CSE, ECE…" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Graduation Year <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                    <input type="number" className={inputClass} value={form.graduation_year} onChange={e => set('graduation_year', e.target.value)} placeholder="2025" min="2000" max="2035" />
                  </div>
                  <div>
                    <label className={labelClass}>CGPA <span className="text-on-surface-variant/50 normal-case font-normal">(0–10 scale, optional)</span></label>
                    <input
                      type="number" step="0.01" min="0" max="10"
                      className={`${inputClass} ${cgpaError ? 'border-rose-500/50' : ''}`}
                      value={form.cgpa}
                      onChange={e => { set('cgpa', e.target.value); setCgpaError(validateCgpa(e.target.value) || ''); }}
                      placeholder="8.5"
                    />
                    {cgpaError && <p className="mt-1 text-xs text-rose-400">{cgpaError}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Career Goals */}
            {activeSection === 'career' && (
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-bold text-on-surface border-b border-border-subtle/40 pb-3">Career Goals</h2>
                <div>
                  <label className={labelClass}>Target Role</label>
                  <select className={inputClass} value={form.target_role} onChange={e => set('target_role', e.target.value)}>
                    <option value="">Select a target role…</option>
                    {(qaData.roles || []).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Target Companies <span className="text-on-surface-variant/50 normal-case font-normal">(up to 10)</span></label>
                  <div className="relative">
                    <input
                      value={companyInput}
                      onChange={e => handleCompanyInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompany(companyInput); }}}
                      placeholder="Search or type a company name…"
                      className={inputClass}
                    />
                    {suggestions.length > 0 && (
                      <ul className="absolute top-full left-0 right-0 z-10 bg-surface-container border border-border-subtle rounded-xl mt-1 overflow-hidden shadow-lg max-h-48 overflow-y-auto">
                        {suggestions.map(s => (
                          <li key={s}>
                            <button type="button" onClick={() => addCompany(s)}
                              className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-high transition-colors">
                              {s}
                            </button>
                          </li>
                        ))}
                        {companyInput.trim() && !(dsaData.companies || []).includes(companyInput.trim()) && (
                          <li>
                            <button type="button" onClick={() => addCompany(companyInput)}
                              className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-primary/10 transition-colors flex items-center gap-2">
                              <Plus className="w-4 h-4" />
                              Add "{companyInput.trim()}"
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  {form.target_companies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {form.target_companies.map(c => (
                        <span key={c} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container border border-border-subtle rounded-full text-xs text-on-surface">
                          {c}
                          <button type="button" onClick={() => removeCompany(c)} className="text-on-surface-variant hover:text-rose-400 transition-colors ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <span className="text-[10px] text-on-surface-variant self-center">{form.target_companies.length}/10</span>
                    </div>
                  )}
                </div>

                {/* Preparation Stage */}
                <div>
                  <label className={labelClass}>Preparation Stage</label>
                  <p className="text-[11px] text-on-surface-variant mb-3 -mt-1">
                    This shapes AI urgency, roadmap sequencing, and weekly plan priorities.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { value: 'not_started',   label: 'Just Starting',     desc: 'Day 1 of prep' },
                      { value: 'early',         label: 'Building Basics',   desc: '3–6 months out' },
                      { value: 'mid',           label: 'Interview Prep',    desc: '1–3 months out' },
                      { value: 'final_stretch', label: 'Final Sprint',      desc: 'Under 1 month' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set('preparation_status', opt.value)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          form.preparation_status === opt.value
                            ? 'bg-primary/10 border-primary/40 text-primary'
                            : 'bg-surface-container border-border-subtle text-on-surface-variant hover:border-outline'
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="text-[10px] mt-0.5 opacity-70">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Social */}
            {activeSection === 'social' && (
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-bold text-on-surface border-b border-border-subtle/40 pb-3">Social Links</h2>
                <div>
                  <label className={labelClass}>LinkedIn URL <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
                    <input className={`${inputClass} pl-10`} value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/yourname" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>GitHub Username <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                  <div className="relative">
                    <Code2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
                    <input className={`${inputClass} pl-10`} value={form.github_username} onChange={e => set('github_username', e.target.value)} placeholder="your-username" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Avatar URL <span className="text-on-surface-variant/50 normal-case font-normal">(optional)</span></label>
                  <input className={inputClass} value={form.avatar_url} onChange={e => set('avatar_url', e.target.value)} placeholder="https://..." />
                  {form.avatar_url && (
                    <img src={form.avatar_url} alt="Avatar preview" className="mt-3 w-16 h-16 rounded-full object-cover border-2 border-border-subtle" onError={e => e.target.style.display = 'none'} />
                  )}
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !!cgpaError}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}

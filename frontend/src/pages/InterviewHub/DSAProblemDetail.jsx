import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';

const DIFF_COLORS = {
  Easy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Hard: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export default function DSAProblemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: problem, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['dsaProblem', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('dsa_problems').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const error = queryError ? 'Failed to load problem.' : null;
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [solved, setSolved] = useState(false);
  const [hintsOpen, setHintsOpen] = useState({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/v1/hub/coding/${id}`);
        setProblem(res.data);
        // Check if already solved/bookmarked by this user
        try {
          const progressRes = await api.get(`/api/v1/hub/coding/${id}/progress`);
          if (progressRes.data.status === 'solved') setSolved(true);
        } catch { /* not yet attempted */ }
      } catch {
        setError('Failed to load problem.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleAddNote = async () => {
    if (!notes.trim() || !problem) return;
    // Persist notes to the Knowledge Vault
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from('users').select('id').eq('supabase_id', userData.user.id).single();
      await supabase.from('vault_items').insert([{
        user_id: userRow.id,
        item_type: 'PERSONAL_NOTE',
        reference_type: 'DSA',
        reference_id: problem.id,
        title: `Notes: ${problem.title}`,
        content: notes.trim(),
      }]);
    } catch { /* silent fallback */ }
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
    setSavedNotes(prev => [{ text: notes, date }, ...prev]);
    setNotes('');
  };

  const handleToggleSolved = async () => {
    const newStatus = solved ? 'attempted' : 'solved';
    setSolved(!solved); // optimistic update
    try {
      await api.post(`/api/v1/hub/coding/${id}/progress`, { status: newStatus });
    } catch {
      setSolved(solved); // revert on failure
    }
  };

  const toggleHint = key => setHintsOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSaveToVault = async () => {
    if (!problem) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from('users').select('id').eq('supabase_id', userData.user.id).single();
      await supabase.from('vault_items').insert([{
        user_id: userRow.id,
        item_type: 'BOOKMARK',
        reference_type: 'DSA',
        reference_id: problem.id,
        title: problem.title,
        content: `Difficulty: ${problem.difficulty} | Topics: ${(problem.topic_tags || []).join(', ')}`,
      }]);
    } catch { /* silent */ }
    setBookmarked(true);
  };

  if (loading) {
    return (
      <div className="bg-background-deep min-h-screen flex items-center justify-center text-on-surface-variant">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs tracking-widest uppercase opacity-50">Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background-deep min-h-screen flex items-center justify-center text-on-surface-variant p-6">
        <div className="text-center space-y-4 max-w-sm">
          <span className="material-symbols-outlined text-4xl text-rose-400 block">error</span>
          <p className="text-sm">{error}</p>
          <button onClick={() => navigate(-1)} className="px-5 py-2 bg-surface-container border border-border-subtle rounded-xl text-xs font-bold hover:bg-surface-container-high transition-all">
            Back to Problems
          </button>
        </div>
      </div>
    );
  }

  const diff = problem?.difficulty || 'Easy';
  const diffColor = DIFF_COLORS[diff] || DIFF_COLORS.Easy;
  const companies = Array.isArray(problem?.companies) ? problem.companies : [];
  const topics = Array.isArray(problem?.topic_tags) ? problem.topic_tags : [];

  return (
    <div className="bg-background-deep text-on-surface font-body-base min-h-screen">

      {/* Top Bar */}
      <header className="sticky top-0 z-40 h-16 bg-background-deep border-b border-border-subtle backdrop-blur-md flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider group"
          >
            <span className="material-symbols-outlined text-lg transition-transform group-hover:-translate-x-1">arrow_back</span>
            Back
          </button>
          <div className="h-4 w-px bg-border-subtle hidden md:block"></div>
          <div className="hidden md:flex items-center gap-3">
            <span className="text-sm font-semibold text-on-surface">{problem?.title}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${diffColor}`}>{diff}</span>
            {problem?.acRate && (
              <span className="text-xs text-on-surface-variant">
                Acceptance: <span className="text-primary font-semibold">{parseFloat(problem.acRate).toFixed(1)}%</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleSolved}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
              solved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-surface-container text-on-surface-variant border-border-subtle hover:border-emerald-500/30 hover:text-emerald-400'
            }`}
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `'FILL' ${solved ? 1 : 0}` }}>check_circle</span>
            {solved ? 'Solved' : 'Mark Solved'}
          </button>
          <button
            onClick={handleSaveToVault}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
              bookmarked ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-border-subtle hover:border-primary/30 hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `'FILL' ${bookmarked ? 1 : 0}` }}>bookmark</span>
            {bookmarked ? 'Saved' : 'Save'}
          </button>
          <a
            href={problem?.problem_URL || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:brightness-110 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">rocket_launch</span>
            <span className="hidden sm:inline">Solve on LeetCode</span>
            <span className="sm:hidden">Solve</span>
          </a>
        </div>
      </header>

      {/* Page Body */}
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left: Problem Content */}
        <div className="lg:col-span-8 space-y-4">

          {/* Mobile title */}
          <div className="md:hidden space-y-2">
            <h2 className="text-xl font-bold text-on-surface">{problem?.title}</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${diffColor}`}>{diff}</span>
              {problem?.acRate && <span className="text-xs text-on-surface-variant">Acceptance: {parseFloat(problem.acRate).toFixed(1)}%</span>}
            </div>
          </div>

          {/* Problem Description from DB */}
          <section className="bg-surface-container border border-border-subtle rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-subtle/50">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">description</span>
                Problem Description
              </h3>
              {problem?.frontend_id && (
                <span className="text-xs font-mono text-on-surface-variant opacity-50">#{problem.frontend_id}</span>
              )}
            </div>
            <article className="text-sm text-on-surface-variant leading-relaxed overflow-x-auto">
              {problem?.content ? (
                <div className="dynamic-html-content" dangerouslySetInnerHTML={{ __html: problem.content }} />
              ) : (
                <p className="italic opacity-40 text-xs">No description available.</p>
              )}
            </article>

            {/* Company Tags from DB */}
            {companies.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border-subtle flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-on-surface-variant/60 uppercase font-bold tracking-wider">Asked by:</span>
                {companies.slice(0, 10).map(c => (
                  <span key={c} className="px-2 py-0.5 bg-surface-container-high border border-border-subtle rounded text-xs text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors cursor-default">
                    {c}
                  </span>
                ))}
                {companies.length > 10 && (
                  <span className="text-[10px] text-primary/70 font-semibold">+{companies.length - 10} more</span>
                )}
              </div>
            )}
          </section>

          {/* Topic Tags from DB */}
          {topics.length > 0 && (
            <section className="bg-surface-container border border-border-subtle rounded-xl p-4">
              <h4 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">tag</span>Topics
              </h4>
              <div className="flex flex-wrap gap-2">
                {topics.map(tag => (
                  <Link
                    key={tag}
                    to={`/mentor?teach=${encodeURIComponent(tag)}`}
                    className="px-3 py-1 bg-surface-container-low border border-border-subtle rounded-lg text-xs text-on-surface hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-1"
                    title={`Ask AI to teach: ${tag}`}
                  >
                    {tag}
                    <span className="material-symbols-outlined text-[10px] opacity-50">school</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: Notes + Actions */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">

          {/* Action Buttons (mobile) */}
          <div className="flex gap-2 sm:hidden">
            <button
              onClick={handleToggleSolved}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-lg border transition-all ${solved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-surface-container text-on-surface-variant border-border-subtle'}`}
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `'FILL' ${solved ? 1 : 0}` }}>check_circle</span>
              {solved ? 'Solved' : 'Mark Solved'}
            </button>
            <button
              onClick={handleSaveToVault}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-lg border transition-all ${bookmarked ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-border-subtle'}`}
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `'FILL' ${bookmarked ? 1 : 0}` }}>bookmark</span>
              {bookmarked ? 'Saved' : 'Save'}
            </button>
          </div>

          {/* Notes Section */}
          <section className="bg-surface-container border border-border-subtle rounded-xl p-4 space-y-3 shadow-sm">
            <h4 className="text-xs font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-primary">edit_note</span>
              My Notes
            </h4>
            <textarea
              className="w-full bg-surface-container-low border border-border-subtle rounded-lg p-3 text-xs text-on-surface outline-none focus:border-primary/50 transition-all min-h-[120px] resize-none placeholder:text-on-surface-variant/30"
              placeholder="Write your approach, time/space complexity, edge cases…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <button
              onClick={handleAddNote}
              className="w-full py-2 bg-surface-container-high hover:bg-surface-container-highest border border-border-subtle text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Note
            </button>

            {savedNotes.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border-subtle/50">
                {savedNotes.map((note, idx) => (
                  <div key={idx} className="p-3 bg-surface-container-low rounded-lg border border-border-subtle group relative">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] font-mono text-primary/70">{note.date}</span>
                      <button
                        onClick={() => setSavedNotes(prev => prev.filter((_, j) => j !== idx))}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400/60 hover:text-rose-400"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                    <p className="text-xs text-on-surface-variant/90 leading-relaxed">{note.text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Ask AI */}
          <section className="rounded-xl p-4 relative overflow-hidden border border-border-subtle" style={{ background: 'rgba(30,41,59,0.7)', backdropFilter: 'blur(12px)' }}>
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-lg">school</span>
              <span className="text-xs font-bold text-primary uppercase tracking-wider">AI Teacher</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
              Want a personalized explanation of this problem's core concepts and patterns?
            </p>
            <Link
              to={`/mentor?teach=${encodeURIComponent(problem?.title || '')}`}
              className="flex items-center justify-center gap-2 w-full py-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white text-xs font-bold rounded-xl transition-all"
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              Ask AI to Teach This
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';
import qaData from '../../data/qa_filters.json';

// High-fidelity iconography & descriptive copy lookup map for roles (Including our virtual UI/UX Designer role)
const ROLE_METADATA = {
  'Backend Engineer': { icon: 'dns', desc: 'Server architectures, databases, system protocols, and query routing.' },
  'Frontend Engineer': { icon: 'web_asset', desc: 'UI lifecycles, virtual DOM sync, bundle size optimization, and styles.' },
  'Full Stack Engineer': { icon: 'layers', desc: 'End-to-end integration matrices, client states, and api routing layers.' },
  'Software Engineer': { icon: 'computer', desc: 'Object-oriented logic, standard computer science subjects, and algorithms.' },
  'DevOps Engineer': { icon: 'terminal', desc: 'CI/CD pipeline state machines, infrastructure code, and virtualization.' },
  'Data Scientist': { icon: 'analytics', desc: 'Data structures, metric validation parameters, and analytics paradigms.' },
  'ML Engineer': { icon: 'model_training', desc: 'Neural network training arrays, optimization vectors, and matrix tensors.' },
  'Data Engineer': { icon: 'database', desc: 'Distributed pipelines, storage clusters, warehousing, and ETL nodes.' },
  'QA Engineer': { icon: 'fact_check', desc: 'Automated evaluation sequences, end-to-end telemetry tests, and reliability.' },
  'Security Engineer': { icon: 'shield', desc: 'Cryptographical protocols, vulnerability mitigations, and network perimeter safety.' },
  'HR': { icon: 'groups', desc: 'Behavioral response frameworks, engineering culture sync, and team dynamics.' },
  'UI/UX Designer': { icon: 'palette', desc: 'Interface design systems, high-fidelity mockups, component user flows, and wireframes.' }
};

export default function InterviewQAEngine() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active filter states synchronized directly to URL parameters
  const activeRole = searchParams.get('role') || '';
  const activeCategory = searchParams.get('category') || '';
  const activeSkill = searchParams.get('skill') || ''; 
  const activeDifficulty = searchParams.get('difficulty') || '';

  const queryClient = useQueryClient();
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [revealedAnswer, setRevealedAnswer] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  // Combine the DB roles
  const visibleRoles = qaData.roles;

  // Handle category option matrix context drops safely
  const relevantCategories = activeRole && qaData.role_categories[activeRole] ? qaData.role_categories[activeRole] : qaData.categories;
  const relevantSkills = activeCategory && qaData.category_skills && qaData.category_skills[activeCategory] ? qaData.category_skills[activeCategory] : [];

  const updateQueryParam = (key, val) => {
    const newParams = new URLSearchParams(searchParams);
    if (val) { newParams.set(key, val); } else { newParams.delete(key); }
    if (key === 'role') { newParams.delete('category'); newParams.delete('skill'); }
    if (key === 'category') { newParams.delete('skill'); }
    setSearchParams(newParams);
    setSelectedQuestion(null);
    setRevealedAnswer(false);
  };

  const fetchQuestions = async ({ pageParam = 0 }) => {
    let query = supabase.from('interview_questions').select('*');
    if (pageParam > 0) query = query.gt('id', pageParam);
    if (activeRole) query = query.contains('roles', [activeRole]);
    if (activeCategory) query = query.eq('category', activeCategory);
    if (activeSkill) query = query.eq('skill', activeSkill);
    if (activeDifficulty) query = query.eq('difficulty', activeDifficulty);
    
    query = query.order('id', { ascending: true }).limit(20);
    const { data, error } = await query;
    if (error) throw error;
    
    const next_cursor = data.length === 20 ? data[19].id : null;
    return { items: data, next_cursor };
  };

  const {
    data,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    status
  } = useInfiniteQuery({
    queryKey: ['interviewQuestions', activeRole, activeCategory, activeSkill, activeDifficulty],
    queryFn: fetchQuestions,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });

  const questions = data ? data.pages.flatMap(page => page.items) : [];
  const loadingList = status === 'pending';
  const error = queryError ? 'Failed to acquire questions from active index.' : null;
  const hasMore = hasNextPage;

  // Auto-select first item
  useEffect(() => {
    if (questions.length > 0 && !selectedQuestion && !loadingList) {
      setSelectedQuestion(questions[0]);
    } else if (questions.length === 0 && !loadingList) {
      setSelectedQuestion(null);
    }
  }, [questions, selectedQuestion, loadingList]);

  const loadMore = () => {
    if (hasNextPage && !loadingMore) fetchNextPage();
  };

  const loadQuestionDetails = (id) => {
    const q = questions.find(x => x.id === id);
    if (q) {
      setSelectedQuestion(q);
      setRevealedAnswer(false);
      setBookmarked(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async ({ q, itemType }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from('users').select('id').eq('supabase_id', userData.user.id).single();
      
      const { error } = await supabase.from('vault_items').insert([{
        user_id: userRow.id,
        itemType: itemType,
        reference_type: 'INTERVIEW',
        reference_id: q.id,
        title: q.title,
        content: q.body || '',
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      setBookmarked(true);
      queryClient.invalidateQueries(['vaultItems']);
    }
  });

  const bookmarking = saveMutation.isPending;
  const markingReviewed = saveMutation.isPending;

  const handleBookmark = () => {
    if (!selectedQuestion || bookmarking) return;
    saveMutation.mutate({ q: selectedQuestion, itemType: 'BOOKMARK' });
  };

  const handleMarkReviewedAndNext = () => {
    if (!selectedQuestion || markingReviewed) return;
    saveMutation.mutate({ q: selectedQuestion, itemType: 'BOOKMARK' }, {
      onSuccess: () => {
        setBookmarked(true);
        const curPos = questions.findIndex(x => x.id === selectedQuestion.id);
        if (curPos !== -1 && curPos < questions.length - 1) {
          loadQuestionDetails(questions[curPos + 1].id);
        }
      }
    });
  };

  // Needed variables for UI compatibility
  const loadingDetail = false;
  return (
    <div className="bg-background-deep text-on-surface font-body-base antialiased min-h-screen">
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          
          {/* Section Navigation Header Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
            <div>
              <h2 className="text-2xl font-bold text-on-surface tracking-tight">Interview Q&A</h2>
              <p className="text-xs text-on-surface-variant">Review advanced target technical query maps across domain contexts.</p>
            </div>
          </div>

          {/* Role Specification Grid (Now Rendering visibleRoles with the 12th card setup) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary">Role Specifications</h3>
                <p className="text-[11px] text-on-surface-variant">Isolate specific technical tracking nodes to preview questions.</p>
              </div>
              {(activeRole || activeCategory || activeSkill || activeDifficulty) && (
                <button 
                  onClick={() => setSearchParams(new URLSearchParams())}
                  className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span> Clear Filter Configurations
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {visibleRoles.map((roleName) => {
                const isActive = activeRole === roleName;
                const meta = ROLE_METADATA[roleName] || { icon: 'shield_person', desc: 'Domain specific parameters.' };
                return (
                  <div
                    key={roleName}
                    onClick={() => updateQueryParam('role', isActive ? '' : roleName)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all group relative ${
                      isActive ? 'bg-primary/10 border-primary shadow-sm' : 'bg-surface-container border-border-subtle hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className={`material-symbols-outlined text-base ${isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`}>
                        {meta.icon}
                      </span>
                      <h4 className="font-bold text-xs text-on-surface tracking-tight">{roleName}</h4>
                    </div>
                    <p className="text-[10px] text-on-surface-variant/80 leading-relaxed line-clamp-2">{meta.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controls Filter Dropdowns Panel Block (4 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-surface-container p-4 rounded-xl border border-border-subtle">
            
            {/* Technical Category Select Node */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Dynamic Technical Category</label>
              <select
                value={activeCategory}
                onChange={(e) => updateQueryParam('category', e.target.value)}
                className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-primary/50 transition-all"
              >
                <option value="">{activeRole ? `All Categories for ${activeRole}` : 'Select a Category Track'}</option>
                {relevantCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Language / Specific Design Tool Selector Option */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Language / Specific Skill</label>
              <select
                value={activeSkill}
                onChange={(e) => updateQueryParam('skill', e.target.value)}
                disabled={!activeCategory || relevantSkills.length === 0}
                className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-primary/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!activeCategory ? (
                  <option value="">Select Category First</option>
                ) : relevantSkills.length === 0 ? (
                  <option value="">No sub-skills available</option>
                ) : (
                  <>
                    <option value="">All Sub-Skills</option>
                    {relevantSkills.map(sk => (
                      <option key={sk} value={sk}>{sk}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Complexity Rating Tiers */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Complexity Grading Map</label>
              <select
                value={activeDifficulty}
                onChange={(e) => updateQueryParam('difficulty', e.target.value)}
                className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-primary/50 transition-all"
              >
                <option value="">All Complexity Tiers</option>
                {qaData.difficulties.map(diff => (
                  <option key={diff} value={diff}>{diff} Challenge</option>
                ))}
              </select>
            </div>

            {/* Live Counts Display Slot */}
            <div className="flex items-end justify-start sm:justify-end">
              <div className="text-right">
                <span className="text-[10px] font-mono block text-on-surface-variant uppercase tracking-widest">Cached Nodes Available</span>
                <span className="text-lg font-bold text-emerald-400 font-mono leading-none">
                  {loadingList ? '...' : questions.length} Found
                </span>
              </div>
            </div>
          </div>

          {/* Core Splitscreen Layout Blocks */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Feed Panel Index */}
            <div className="lg:col-span-5 space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {loadingList ? (
                <div className="p-8 text-center text-xs text-on-surface-variant flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  Querying target indexes...
                </div>
              ) : questions.length === 0 ? (
                <div className="p-8 text-center bg-surface-container/40 border border-border-subtle rounded-xl text-xs text-on-surface-variant italic">
                  No interview question nodes match the selected filter configuration vectors.
                </div>
              ) : (
                questions.map((q) => {
                  const isCurrent = selectedQuestion?.id === q.id;
                  return (
                    <div
                      key={q.id}
                      onClick={() => loadQuestionDetails(q.id)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-2 relative overflow-hidden group ${
                        isCurrent ? 'bg-surface-container-high border-primary shadow-sm' : 'bg-surface-container border-border-subtle hover:border-border-strong'
                      }`}
                    >
                      <h4 className={`text-xs font-semibold leading-relaxed transition-colors ${isCurrent ? 'text-primary' : 'text-on-surface'}`}>
                        {q.title}
                      </h4>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[9px] px-1.5 py-0.5 bg-surface-container-low text-on-surface-variant rounded border border-border-subtle truncate max-w-[180px]">
                          {q.skill ? `${q.category} &bull; ${q.skill}` : q.category}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                          q.difficulty === 'Easy' ? 'text-emerald-400' : q.difficulty === 'Medium' ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {q.difficulty}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2 text-xs font-semibold text-primary border border-primary/20 rounded-xl hover:bg-primary/10 transition-all disabled:opacity-50"
                >
                  {loadingMore ? 'Loadingâ€¦' : 'Load More'}
                </button>
              )}
            </div>

            {/* Right Card Panel Space Workspace Container */}
            <div className="lg:col-span-7">
              {loadingDetail ? (
                <div className="bg-surface-container border border-border-subtle rounded-2xl p-16 text-center text-xs text-on-surface-variant flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  Loading complete response metadata...
                </div>
              ) : selectedQuestion ? (
                <div className="bg-surface-container border border-border-subtle rounded-2xl p-6 shadow-sm space-y-6">
                  
                  <div className="flex flex-wrap justify-between items-center gap-2 border-b border-border-subtle/50 pb-4">
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest rounded border border-primary/20">
                        {selectedQuestion.skill ? `${selectedQuestion.category} / ${selectedQuestion.skill}` : selectedQuestion.category}
                      </span>
                      <p className="text-[11px] text-on-surface-variant">Complexity Index: <span className="text-on-surface font-semibold">{selectedQuestion.difficulty}</span></p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleBookmark}
                        disabled={bookmarking || bookmarked}
                        title="Save to Vault"
                        className={`p-1.5 border rounded-lg transition-colors ${
                          bookmarked
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-surface-container-low border-border-subtle text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm block">{bookmarked ? 'bookmark_added' : 'bookmark'}</span>
                      </button>
                      <Link
                        to={`/mentor?teach=${encodeURIComponent(selectedQuestion?.title || '')}`}
                        title="Ask AI to teach this"
                        className="p-1.5 bg-surface-container-low border border-border-subtle rounded-lg text-on-surface-variant hover:text-primary hover:border-primary/30 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm block">school</span>
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold tracking-widest text-primary uppercase block">Question Prompt</span>
                    <h3 className="text-base font-bold text-on-surface leading-snug">
                      {selectedQuestion.title}
                    </h3>
                  </div>

                  <div className="pt-2 border-t border-border-subtle/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase block">Expert Explanation Model</span>
                      {!revealedAnswer && (
                        <button
                          onClick={() => setRevealedAnswer(true)}
                          className="px-3 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:brightness-110 transition-all flex items-center gap-1 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-xs">visibility</span> Reveal Target Solution
                        </button>
                      )}
                    </div>

                    {revealedAnswer ? (
                      <div className="bg-surface-container-low border border-border-subtle p-4 rounded-xl space-y-3 shadow-inner animate-fadeIn">
                        <p className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
                          {selectedQuestion.body || 'No explanation summary available for this catalog record.'}
                        </p>
                      </div>
                    ) : (
                      <div 
                        onClick={() => setRevealedAnswer(true)}
                        className="bg-surface-container-low/60 border border-dashed border-border-subtle p-8 rounded-xl text-center cursor-pointer hover:bg-surface-container-low/90 hover:border-primary/50 transition-all group"
                      >
                        <span className="material-symbols-outlined text-2xl text-on-surface-variant/40 group-hover:text-primary transition-colors block mb-1">lock</span>
                        <p className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">Click to verify solution pattern vector</p>
                        <p className="text-[10px] text-on-surface-variant/60 mt-0.5">Understand core conceptual principles and implementation targets.</p>
                      </div>
                    )}
                  </div>

                  {revealedAnswer && (
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-border-subtle/40">
                      <button
                        onClick={() => setRevealedAnswer(false)}
                        className="px-3 py-1.5 text-[11px] font-medium text-on-surface-variant hover:text-on-surface transition-all"
                      >
                        Collapse Solution
                      </button>
                      <button
                        onClick={handleMarkReviewedAndNext}
                        disabled={markingReviewed}
                        className="px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 disabled:opacity-50"
                      >
                        {markingReviewed ? 'Savingâ€¦' : 'Mark Reviewed & Next'}
                        <span className="material-symbols-outlined text-xs">done_all</span>
                      </button>
                    </div>
                  )}

                </div>
              ) : (
                <div className="bg-surface-container border border-border-subtle border-dashed rounded-2xl p-16 text-center text-xs text-on-surface-variant italic">
                  Select a targeted parameter track node on the left index panel to open code prompt maps.
                </div>
              )}
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import qaData from '../../data/qa_filters.json';
import FilterSheet, { FilterBar, FilterSelect } from '../../components/FilterSheet';
import { usePresence } from '../../lib/motion';

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
  const [searchParams, setSearchParams] = useSearchParams();

  // Active filter states synchronized directly to URL parameters
  const activeRole = searchParams.get('role') || '';
  const activeCategory = searchParams.get('category') || '';
  const activeSkill = searchParams.get('skill') || ''; 
  const activeDifficulty = searchParams.get('difficulty') || '';

  const queryClient = useQueryClient();
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false); // phones: answer panel slides over the list
  const panel = usePresence(detailOpen, 180);
  const [revealedAnswer, setRevealedAnswer] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  // Combine the DB roles
  const visibleRoles = qaData.roles;

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

  const questions = useMemo(() => (data ? data.pages.flatMap(page => page.items) : []), [data]);
  const loadingList = status === 'pending';
  const error = queryError ? 'Failed to acquire questions from active index.' : null;
  const hasMore = hasNextPage;

  const isWide = () => window.matchMedia('(min-width: 1024px)').matches;

  // Side-by-side layout shows the first question straight away; on phones the list comes first.
  useEffect(() => {
    if (loadingList) return;
    if (questions.length === 0) setSelectedQuestion(null);
    else if (!selectedQuestion && isWide()) setSelectedQuestion(questions[0]);
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
      if (!isWide()) setDetailOpen(true);
    }
  };

  // Phone answer panel: Escape closes it.
  useEffect(() => {
    if (!detailOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDetailOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailOpen]);

  // ---- Filters popup: drafted, then applied together ----
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState({ role: '', category: '', skill: '', difficulty: '' });
  const openFilters = () => {
    setDraft({ role: activeRole, category: activeCategory, skill: activeSkill, difficulty: activeDifficulty });
    setFiltersOpen(true);
  };
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const applyFilters = () => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(draft)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next);
    setSelectedQuestion(null);
    setRevealedAnswer(false);
    setFiltersOpen(false);
  };
  // The category list depends on the role, and the skill list on the category.
  const draftCategories = draft.role && qaData.role_categories[draft.role] ? qaData.role_categories[draft.role] : qaData.categories;
  const draftSkills = draft.category && qaData.category_skills?.[draft.category] ? qaData.category_skills[draft.category] : [];
  const setDraftRole = (role) =>
    setDraft((d) => {
      const cats = role && qaData.role_categories[role] ? qaData.role_categories[role] : qaData.categories;
      const keepCat = cats.includes(d.category);
      return { ...d, role, category: keepCat ? d.category : '', skill: keepCat ? d.skill : '' };
    });

  const activeFilters = [
    activeRole && { key: 'role', label: activeRole },
    activeCategory && { key: 'category', label: activeCategory },
    activeSkill && { key: 'skill', label: activeSkill },
    activeDifficulty && { key: 'difficulty', label: activeDifficulty },
  ].filter(Boolean);

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

  const position = selectedQuestion ? questions.findIndex((x) => x.id === selectedQuestion.id) + 1 : 0;
  const difficultyTone = (d) => (d === 'Easy' ? 'text-emerald-400' : d === 'Medium' ? 'text-amber-400' : 'text-rose-400');

  const detail = selectedQuestion ? (
    <div className="space-y-6 rounded-2xl border border-border-subtle bg-surface-container p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle/50 pb-4">
        <div className="space-y-1.5">
          <span className="inline-block rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {selectedQuestion.skill ? `${selectedQuestion.category} / ${selectedQuestion.skill}` : selectedQuestion.category}
          </span>
          <p className="text-xs text-on-surface-variant">
            Difficulty: <span className={`font-semibold ${difficultyTone(selectedQuestion.difficulty)}`}>{selectedQuestion.difficulty}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBookmark}
            disabled={bookmarking || bookmarked}
            data-tip={bookmarked ? 'Saved to vault' : 'Save to vault'}
            aria-label={bookmarked ? 'Saved to vault' : 'Save to vault'}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
              bookmarked
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                : 'border-border-subtle bg-surface-container-low text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span key={String(bookmarked)} className={`material-symbols-outlined text-[20px] ${bookmarked ? 'pop' : ''}`}>
              {bookmarked ? 'bookmark_added' : 'bookmark'}
            </span>
          </button>
          <Link
            to={`/mentor?teach=${encodeURIComponent(selectedQuestion?.title || '')}`}
            data-tip="Ask the mentor to teach this"
            aria-label="Ask the AI mentor to teach this"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-surface-container-low text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">school</span>
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-xs font-semibold text-primary">Question</span>
        <h3 className="text-lg font-bold leading-snug text-on-surface">{selectedQuestion.title}</h3>
      </div>

      <div className="space-y-4 border-t border-border-subtle/40 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="block text-xs font-semibold text-emerald-400">Answer</span>
          {!revealedAnswer && (
            <button
              onClick={() => setRevealedAnswer(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span> Show answer
            </button>
          )}
        </div>

        {revealedAnswer ? (
          <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-container-low p-4" style={{ animation: 'dialog-in var(--dur-3) var(--ease-settle) both' }}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">
              {selectedQuestion.body || 'No answer has been written for this question yet.'}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealedAnswer(true)}
            className="group w-full cursor-pointer rounded-xl border border-dashed border-border-subtle bg-surface-container-low/60 p-8 text-center transition-all hover:border-primary/50 hover:bg-surface-container-low/90"
          >
            <span className="material-symbols-outlined mb-1 block text-2xl text-on-surface-variant/50 transition-colors group-hover:text-primary">lock</span>
            <span className="block text-sm font-medium text-on-surface-variant transition-colors group-hover:text-on-surface">Try answering it yourself first</span>
            <span className="mt-0.5 block text-xs text-on-surface-variant/70">Then tap here to compare with the model answer.</span>
          </button>
        )}
      </div>

      {revealedAnswer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle/40 pt-4">
          <button
            onClick={() => setRevealedAnswer(false)}
            className="min-h-9 px-3 text-xs font-medium text-on-surface-variant transition-all hover:text-on-surface"
          >
            Hide answer
          </button>
          <button
            onClick={handleMarkReviewedAndNext}
            disabled={markingReviewed}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-4 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-on-primary disabled:opacity-50"
          >
            {markingReviewed ? 'Saving…' : 'Save and next question'}
            <span className="material-symbols-outlined text-[16px]">done_all</span>
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="min-h-full bg-background-deep text-on-surface antialiased">
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
        {/* Header: title and filters */}
        <div className="space-y-3 border-b border-border-subtle pb-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="type-title text-2xl text-on-surface">Interview Q&amp;A</h2>
              <p className="text-sm text-on-surface-variant">Open-ended questions by role, topic and skill. Tap one to practise it.</p>
            </div>
            <p className="text-sm tabular-nums text-on-surface-variant">
              {loadingList ? 'Loading…' : `${questions.length}${hasMore ? '+' : ''} questions`}
            </p>
          </div>
          {/* Phones: filters open in a popup */}
          <div className="md:hidden">
            <FilterBar active={activeFilters} onOpen={openFilters} onRemove={(key) => updateQueryParam(key, '')} />
          </div>
        </div>

        {/* Larger screens: filters sit on the page and apply as you choose them */}
        <div className="hidden space-y-4 md:block">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-on-surface">Role</h3>
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">restart_alt</span> Clear filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-4 lg:gap-3">
            {visibleRoles.map((roleName) => {
              const isActive = activeRole === roleName;
              const meta = ROLE_METADATA[roleName] || { icon: 'shield_person', desc: '' };
              return (
                <button
                  type="button"
                  key={roleName}
                  aria-pressed={isActive}
                  onClick={() => updateQueryParam('role', isActive ? '' : roleName)}
                  className={`lift group w-full cursor-pointer rounded-xl border p-3.5 text-left ${
                    isActive ? 'border-primary bg-primary/10 shadow-sm' : 'border-border-subtle bg-surface-container hover:border-outline'
                  }`}
                >
                  <span className="mb-1.5 flex items-center gap-2.5">
                    <span className={`material-symbols-outlined text-base ${isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span className="text-sm font-bold text-on-surface">{roleName}</span>
                  </span>
                  <span className="line-clamp-2 block text-xs leading-relaxed text-on-surface-variant/80">{meta.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-xl border border-border-subtle bg-surface-container p-4">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-on-surface-variant">Category</span>
              <select
                value={activeCategory}
                onChange={(e) => updateQueryParam('category', e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-border-subtle bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-primary/50"
              >
                <option value="">{activeRole ? `All categories for ${activeRole}` : 'All categories'}</option>
                {(activeRole && qaData.role_categories[activeRole] ? qaData.role_categories[activeRole] : qaData.categories).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-on-surface-variant">Skill</span>
              <select
                value={activeSkill}
                onChange={(e) => updateQueryParam('skill', e.target.value)}
                disabled={!activeCategory || !(qaData.category_skills?.[activeCategory]?.length > 0)}
                className="w-full cursor-pointer rounded-xl border border-border-subtle bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {!activeCategory ? (
                  <option value="">Choose a category first</option>
                ) : !(qaData.category_skills?.[activeCategory]?.length > 0) ? (
                  <option value="">No skills for this category</option>
                ) : (
                  <>
                    <option value="">All skills</option>
                    {qaData.category_skills[activeCategory].map((sk) => <option key={sk} value={sk}>{sk}</option>)}
                  </>
                )}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-on-surface-variant">Difficulty</span>
              <select
                value={activeDifficulty}
                onChange={(e) => updateQueryParam('difficulty', e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-border-subtle bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-primary/50"
              >
                <option value="">All difficulties</option>
                {qaData.difficulties.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Question list */}
          <div className="stagger-list space-y-2 lg:col-span-5 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto lg:pr-2">
            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center text-sm text-rose-400">
                Questions didn&rsquo;t load. Check your connection and refresh the page.
              </div>
            )}
            {loadingList ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="shimmer space-y-2 rounded-xl border border-border-subtle bg-surface-container p-4">
                  <div className="h-3.5 w-4/5 rounded bg-surface-container-high" />
                  <div className="h-3 w-1/3 rounded bg-surface-container-high" />
                </div>
              ))
            ) : questions.length === 0 && !error ? (
              <div className="rounded-xl border border-dashed border-border-subtle bg-surface-container/40 p-8 text-center">
                <p className="text-sm text-on-surface-variant">No questions match these filters.</p>
                <button type="button" onClick={openFilters} className="mt-3 text-sm font-semibold text-primary underline underline-offset-4">
                  Change filters
                </button>
              </div>
            ) : (
              questions.map((q) => {
                const isCurrent = selectedQuestion?.id === q.id;
                return (
                  <button
                    type="button"
                    key={q.id}
                    onClick={() => loadQuestionDetails(q.id)}
                    className={`lift group flex w-full cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left ${
                      isCurrent ? 'border-primary bg-surface-container-high shadow-sm' : 'border-border-subtle bg-surface-container hover:border-outline'
                    }`}
                  >
                    <span className={`text-sm font-semibold leading-relaxed transition-colors ${isCurrent ? 'text-primary' : 'text-on-surface'}`}>
                      {q.title}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="max-w-[70%] truncate rounded border border-border-subtle bg-surface-container-low px-1.5 py-0.5 text-[11px] text-on-surface-variant">
                        {q.skill ? `${q.category} / ${q.skill}` : q.category}
                      </span>
                      <span className={`text-xs font-semibold ${difficultyTone(q.difficulty)}`}>{q.difficulty}</span>
                    </span>
                  </button>
                );
              })
            )}
            {hasMore && !loadingList && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="min-h-10 w-full rounded-xl border border-primary/20 text-sm font-semibold text-primary transition-all hover:bg-primary/10 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more questions'}
              </button>
            )}
          </div>

          {/* Answer panel: beside the list on wide screens */}
          <div className="hidden lg:col-span-7 lg:block">
            {detail ?? (
              <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-container p-16 text-center text-sm text-on-surface-variant">
                Pick a question from the list to practise it.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phones: the answer panel slides in over the list */}
      {panel.mounted && selectedQuestion && (
        <div
          className={`fixed inset-0 z-[75] flex flex-col bg-background-deep lg:hidden ${panel.closing ? 'panel-out pointer-events-none' : 'panel-in'}`}
          role="dialog"
          aria-modal="true"
          aria-label="Question"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2">
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-on-surface transition-colors hover:bg-paper/5"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_back</span>
              Questions
            </button>
            <span className="pr-2 text-xs tabular-nums text-on-surface-variant">
              {position} of {questions.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{detail}</div>
        </div>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={closeFilters}
        onApply={applyFilters}
        onClear={() => setDraft({ role: '', category: '', skill: '', difficulty: '' })}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-line">Role</legend>
          <div className="grid grid-cols-2 gap-2">
            {visibleRoles.map((roleName) => {
              const on = draft.role === roleName;
              const meta = ROLE_METADATA[roleName] || { icon: 'shield_person' };
              return (
                <button
                  type="button"
                  key={roleName}
                  aria-pressed={on}
                  onClick={() => setDraftRole(on ? '' : roleName)}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors ${
                    on ? 'border-highlight bg-highlight text-ink' : 'border-border-subtle text-paper hover:border-outline'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{meta.icon}</span>
                  <span className="min-w-0 py-1.5 leading-tight">{roleName}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <FilterSelect
          label={draft.role ? `Category for ${draft.role}` : 'Category'}
          value={draft.category}
          onChange={(v) => setDraft((d) => ({ ...d, category: v, skill: '' }))}
        >
          <option value="">All categories</option>
          {draftCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </FilterSelect>

        <FilterSelect
          label="Skill"
          value={draft.skill}
          onChange={(v) => setDraft((d) => ({ ...d, skill: v }))}
          disabled={!draft.category || draftSkills.length === 0}
        >
          {!draft.category ? (
            <option value="">Choose a category first</option>
          ) : draftSkills.length === 0 ? (
            <option value="">No skills for this category</option>
          ) : (
            <>
              <option value="">All skills</option>
              {draftSkills.map((sk) => <option key={sk} value={sk}>{sk}</option>)}
            </>
          )}
        </FilterSelect>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-line">Difficulty</legend>
          <div className="grid grid-cols-4 gap-2">
            {[['', 'Any'], ...qaData.difficulties.map((d) => [d, d])].map(([v, l]) => (
              <button
                key={l}
                type="button"
                aria-pressed={draft.difficulty === v}
                onClick={() => setDraft((d) => ({ ...d, difficulty: v }))}
                className={`min-h-11 cursor-pointer rounded-lg border text-sm font-semibold transition-colors ${
                  draft.difficulty === v ? 'border-highlight bg-highlight text-ink' : 'border-border-subtle text-paper hover:border-outline'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      </FilterSheet>
    </div>
  );
}

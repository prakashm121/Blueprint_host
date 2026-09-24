import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';
import filterData from '../../data/filters.json';
import FilterSheet, { FilterBar, FilterSelect } from '../../components/FilterSheet';

const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

const DIFFICULTY_COLORS = {
  EASY: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: 'bg-emerald-500/10 text-emerald-400', iconHover: 'group-hover:bg-emerald-500/20', symbol: 'code' },
  MEDIUM: { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: 'bg-amber-500/10 text-amber-400', iconHover: 'group-hover:bg-amber-500/20', symbol: 'terminal' },
  HARD: { badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: 'bg-rose-500/10 text-rose-400', iconHover: 'group-hover:bg-rose-500/20', symbol: 'memory' },
};

function ProblemCard({ problem, onOpen, companyFilter }) {
  const colors = DIFFICULTY_COLORS[problem.difficulty] || DIFFICULTY_COLORS.EASY;
  
  // 1. Safely parse companies (Handles both Arrays and Strings)
  const rawCompanies = Array.isArray(problem.companies) 
    ? problem.companies 
    : (typeof problem.companies === 'string' ? problem.companies.split(',').map(c => c.trim()) : []);
  
  const displayedCompanies = companyFilter && rawCompanies.includes(companyFilter)
    ? [companyFilter]
    : rawCompanies.slice(0, 3);
  
  const remainingCompaniesCount = rawCompanies.length - displayedCompanies.length;

  // 2. Safely parse topics (Fixing the hidden bug)
  const rawTopics = Array.isArray(problem.topic_tags)
    ? problem.topic_tags
    : (typeof problem.topic_tags === 'string' ? problem.topic_tags.split(',').map(t => t.replace(/['\[\]]/g, '').trim()) : []);
  
  const topics = rawTopics.slice(0, 2);
  const acceptance = problem.acRate ? `${parseFloat(problem.acRate).toFixed(1)}%` : '—';
  // Use first topic as the AI teach target
  const firstTopic = rawTopics[0] || problem.title || '';

  return (
    <div
      className="lift group bg-surface-card border border-border-subtle rounded-xl p-5 hover:border-primary/40 hover:bg-surface-container-high cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm shrink-0"
      onClick={() => onOpen(problem.id)}
    >
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <div className={`p-3 ${colors.icon} rounded-xl ${colors.iconHover} transition-colors shrink-0 hidden sm:block`}>
          <span className="material-symbols-outlined text-xl">{colors.symbol}</span>
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h4 className="font-semibold text-on-surface group-hover:text-primary transition-colors truncate max-w-[280px] md:max-w-md text-base leading-snug">
              {problem.title}
            </h4>
            <span className={`px-2 py-0.5 ${colors.badge} text-[10px] font-bold uppercase tracking-wider rounded-md border`}>
              {problem.difficulty || 'EASY'}
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2 text-xs text-on-surface-variant">
            {topics.map(t => (
              <Link
                key={t}
                to={`/mentor?teach=${encodeURIComponent(t)}`}
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center min-h-8 sm:min-h-0 px-2 py-0.5 bg-surface-container-low rounded border border-border-subtle text-[11px] hover:border-primary/40 hover:text-primary transition-colors"
                title={`Ask AI to teach: ${t}`}
              >
                {t}
              </Link>
            ))}
            {topics.length > 0 && <span className="text-border-subtle">&bull;</span>}
            <span>Acceptance: <span className="text-on-surface font-medium">{acceptance}</span></span>
          </div>

          {displayedCompanies.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-on-surface-variant/60 mr-0.5">business</span>
              {displayedCompanies.map((company, idx) => (
                <span key={idx} className="bg-surface-container border border-border-subtle text-on-surface-variant text-[10px] font-medium px-2 py-0.5 rounded">
                  {company}
                </span>
              ))}
              {remainingCompaniesCount > 0 && (
                <span className="text-[10px] text-primary/80 font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                  +{remainingCompaniesCount} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 justify-end shrink-0 pt-2 sm:pt-0 border-t border-border-subtle/40 sm:border-t-0">
        <button
          data-tip="Bookmark"
          aria-label="Bookmark"
          className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container"
          onClick={e => {
            e.stopPropagation(); 
          }}
        >
          <span className="material-symbols-outlined text-xl">bookmark</span>
        </button>
        <button 
          className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 text-xs font-bold rounded-lg hover:bg-primary hover:text-on-primary transition-all"
        >
          Open
        </button>
      </div>
    </div>
  );
}

export default function DSAEngine() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const company = searchParams.get('company') || '';
  const topic = searchParams.get('topic') || '';
  const difficulty = searchParams.get('difficulty') || '';

  const updateParam = (key, val) => {
    const newParams = new URLSearchParams(searchParams);
    val ? newParams.set(key, val) : newParams.delete(key);
    setSearchParams(newParams);
  };

  // Filters live in a popup; choices are drafted there and applied together.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState({ company, topic, difficulty });
  const openFilters = () => {
    setDraft({ company, topic, difficulty });
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
    setFiltersOpen(false);
  };
  const activeFilters = [
    company && { key: 'company', label: company },
    topic && { key: 'topic', label: topic },
    difficulty && { key: 'difficulty', label: DIFFICULTY_LABELS[difficulty] ?? difficulty },
  ].filter(Boolean);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dsaStats'],
    queryFn: async () => {
      const r = await api.get('/api/v1/hub/stats/dsa');
      return r.data;
    },
    staleTime: 5 * 60 * 1000
  });

  const fetchProblems = async ({ pageParam = 0 }) => {
    let query = supabase.from('dsa_problems').select('*');
    if (pageParam > 0) query = query.gt('id', pageParam);
    if (company && company !== "All") query = query.contains('companies', [company]);
    if (topic && topic !== "All") query = query.contains('topic_tags', [topic]);
    if (difficulty && difficulty !== "All") query = query.eq('difficulty', difficulty);
    
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
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    queryKey: ['dsaProblems', company, topic, difficulty],
    queryFn: fetchProblems,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });

  const problems = data ? data.pages.flatMap(page => page.items) : [];
  const initialLoad = status === 'pending';
  const loading = isFetchingNextPage;
  const hasMore = hasNextPage;
  const error = queryError;

  const loaderRef = useRef(null);

  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { threshold: 0.1 });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto flex flex-col gap-4 md:gap-6 min-h-0">
        
        {/* Main Title Header */}
        <div className="shrink-0 space-y-3 pb-4 border-b border-border-subtle">
          <div>
            <h2 className="type-title text-2xl text-on-surface">Coding problems</h2>
            <p className="text-sm text-on-surface-variant">Practise by topic, difficulty and company. Open a problem to solve it.</p>
          </div>
          {/* Phones: filters open in a popup */}
          <div className="md:hidden">
            <FilterBar active={activeFilters} onOpen={openFilters} onRemove={(key) => updateParam(key, '')} />
          </div>
        </div>

        {/* Mobile-only compact stats strip */}
        <div className="lg:hidden shrink-0 bg-surface-container border border-border-subtle rounded-xl p-3 flex items-center justify-between gap-3">
          {statsLoading ? (
            <div className="shimmer h-3 bg-surface-container-high rounded w-24" />
          ) : (
            <>
              <div className="text-sm font-bold text-on-surface">
                {stats?.total_solved ?? 0}<span className="text-xs font-normal text-on-surface-variant">/{stats?.total_target ?? 500} solved</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-emerald-400 font-bold">{stats?.easy_solved ?? 0} Easy</span>
                <span className="text-xs text-amber-400 font-bold">{stats?.medium_solved ?? 0} Med</span>
                <span className="text-xs text-rose-400 font-bold">{stats?.hard_solved ?? 0} Hard</span>
                <span className="text-xs text-on-surface-variant">&#128293; {stats?.streak ?? 0} days</span>
              </div>
            </>
          )}
        </div>

        {/* Grid Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 min-h-0">
            
            {/* Problems Stream View Column */}
            <div className="lg:col-span-8 flex flex-col h-full space-y-4 min-h-0">
              
              {/* Larger screens: filters sit on the page */}
              <div className="hidden shrink-0 grid-cols-3 gap-2 rounded-xl border border-border-subtle bg-surface-container p-3 md:grid">
                <select
                  aria-label="Company"
                  value={company}
                  onChange={e => updateParam('company', e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-border-subtle bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-primary/50"
                >
                  <option value="">All companies</option>
                  {filterData.companies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  aria-label="Topic"
                  value={topic}
                  onChange={e => updateParam('topic', e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-border-subtle bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-primary/50"
                >
                  <option value="">All topics</option>
                  {filterData.topics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  aria-label="Difficulty"
                  value={difficulty}
                  onChange={e => updateParam('difficulty', e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-border-subtle bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-primary/50"
                >
                  <option value="">All difficulties</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>

              {/* Problem list — only this scrolls */}
              <div className="stagger-list flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 pb-4">
                {error && (
                  <div className="text-center py-8 text-rose-400 bg-rose-500/5 rounded-xl border border-rose-500/10 text-sm">
                    Problems didn&rsquo;t load. Check your connection and refresh the page.
                  </div>
                )}
                
                {initialLoad && !error && (
                  [...Array(4)].map((_, i) => (
                    <div key={i} className="shimmer bg-surface-card border border-border-subtle rounded-xl p-5 flex gap-4">
                      <div className="w-10 h-10 bg-surface-container rounded-lg shrink-0"></div>
                      <div className="flex-1 space-y-3 py-1">
                        <div className="h-4 bg-surface-container rounded w-1/3"></div>
                        <div className="h-3 bg-surface-container rounded w-1/2"></div>
                      </div>
                    </div>
                  ))
                )}
                
                {!initialLoad && problems.length === 0 && !error && (
                  <div className="text-center py-12 text-on-surface-variant bg-surface-container-low rounded-xl border border-border-subtle border-dashed">
                    <span className="material-symbols-outlined text-4xl opacity-40 mb-2 block">search_off</span>
                    <p className="font-medium text-on-surface text-sm">No problems match these filters.</p>
                    <button type="button" onClick={openFilters} className="mt-3 text-sm font-semibold text-primary underline underline-offset-4">Change filters</button>
                  </div>
                )}

                {problems.map(p => (
                  <ProblemCard key={p.id} problem={p} onOpen={id => navigate(`/interview-hub/dsa/${id}`)} companyFilter={company} />
                ))}

                <div ref={loaderRef} className="flex justify-center py-4">
                  {loading && !initialLoad && (
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      Loading more problems…
                    </div>
                  )}
                  {!hasMore && problems.length > 0 && (
                    <p className="text-on-surface-variant/60 text-xs">That&rsquo;s every problem for these filters.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Stats sidebar — desktop only (mobile has compact strip above) */}
            <aside className="hidden lg:flex lg:col-span-4 flex-col h-full overflow-y-auto custom-scrollbar space-y-4 pr-2">
              <section className="bg-surface-container border border-border-subtle rounded-xl p-5 shadow-sm">
                {statsLoading ? (
                  <div className="shimmer space-y-3">
                    <div className="h-3 bg-surface-container-high rounded w-1/3"></div>
                    <div className="h-8 bg-surface-container-high rounded w-1/2"></div>
                    <div className="h-2 bg-surface-container-high rounded"></div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Progress</p>
                        <h3 className="text-3xl font-bold tracking-tight">
                          {stats?.total_solved ?? 0}
                          <span className="text-base font-normal text-on-surface-variant">/{stats?.total_target ?? 500}</span>
                        </h3>
                        <p className="text-xs text-on-surface-variant mt-1">Problems Solved</p>
                      </div>
                      <div className="bg-surface-container-high px-3 py-2 rounded-xl border border-border-subtle text-center min-w-[70px]">
                        <p className="text-[9px] uppercase font-bold text-on-surface-variant/60">Streak</p>
                        <p className="text-xl font-bold text-amber-400 leading-none my-0.5">{stats?.streak ?? 0}</p>
                        <p className="text-[8px] text-amber-400/80 uppercase font-bold tracking-wider">Days</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 mb-4">
                      <div className="flex justify-between text-xs">
                        <span className="text-on-surface-variant">Overall Progress</span>
                        <span className="text-emerald-400 font-semibold">
                          {stats?.total_target ? ((stats.total_solved / stats.total_target) * 100).toFixed(1).replace(/\.0$/, '') : 0}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden border border-border-subtle">
                        <div
                          className="bar-grow h-full bg-emerald-500 transition-all duration-700 rounded-full"
                          style={{ width: `${stats?.total_target ? Math.min((stats.total_solved / stats.total_target) * 100, 100) : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center bg-emerald-500/5 border border-emerald-500/10 rounded-lg py-2">
                        <p className="text-emerald-400 font-bold text-lg leading-none">{stats?.easy_solved ?? 0}</p>
                        <p className="text-[9px] text-on-surface-variant uppercase font-bold mt-0.5">Easy</p>
                      </div>
                      <div className="text-center bg-amber-500/5 border border-amber-500/10 rounded-lg py-2">
                        <p className="text-amber-400 font-bold text-lg leading-none">{stats?.medium_solved ?? 0}</p>
                        <p className="text-[9px] text-on-surface-variant uppercase font-bold mt-0.5">Medium</p>
                      </div>
                      <div className="text-center bg-rose-500/5 border border-rose-500/10 rounded-lg py-2">
                        <p className="text-rose-400 font-bold text-lg leading-none">{stats?.hard_solved ?? 0}</p>
                        <p className="text-[9px] text-on-surface-variant uppercase font-bold mt-0.5">Hard</p>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {/* AI Teacher Box */}
              <section className="bg-surface-container border border-border-subtle rounded-xl overflow-hidden shadow-sm">
                <div className="bg-primary/5 p-4 flex items-center gap-3 border-b border-border-subtle">
                  <span className="material-symbols-outlined text-primary text-xl">school</span>
                  <h4 className="font-semibold text-sm text-on-surface">AI Teacher</h4>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-on-surface-variant/90 leading-relaxed">
                    Click any topic tag on a problem card to open an AI teaching session on that concept.
                  </p>
                  <Link
                    to="/mentor"
                    className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:brightness-110 transition-all shadow-sm"
                  >
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                    Open AI Mentor
                  </Link>
                </div>
              </section>
            </aside>
            
          </div>
        </main>

      <FilterSheet open={filtersOpen} onClose={closeFilters} onApply={applyFilters} onClear={() => setDraft({ company: '', topic: '', difficulty: '' })}>
        <FilterSelect label="Company" value={draft.company} onChange={(v) => setDraft((d) => ({ ...d, company: v }))}>
          <option value="">All companies</option>
          {filterData.companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </FilterSelect>
        <FilterSelect label="Topic" value={draft.topic} onChange={(v) => setDraft((d) => ({ ...d, topic: v }))}>
          <option value="">All topics</option>
          {filterData.topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </FilterSelect>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-line">Difficulty</legend>
          <div className="grid grid-cols-4 gap-2">
            {[['', 'Any'], ['EASY', 'Easy'], ['MEDIUM', 'Medium'], ['HARD', 'Hard']].map(([v, l]) => (
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


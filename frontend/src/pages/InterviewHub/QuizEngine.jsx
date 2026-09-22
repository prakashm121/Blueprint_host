import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import quizData from '../../data/quiz_filters.json';

const SECTION_ICONS = {
  'AI & ML':          { icon: 'psychology', desc: 'Neural networks, training optimization, and modeling vectors.' },
  'DevOps Engineer':  { icon: 'terminal',   desc: 'CI/CD pipeline matrices, infrastructure as code, and cloud architectures.' },
  'React Engineer':   { icon: 'code',       desc: 'Dynamic state synchronization, custom hooks, and layout rendering optimization.' },
  'SAP Engineer':     { icon: 'layers',     desc: 'Enterprise data architecture, ABAP logic, and business workflows.' },
  'Numerical Ability':{ icon: 'calculate',  desc: 'Mathematical reasoning, metrics verification, and strategic calculation.' },
  'Logical Reasoning':{ icon: 'extension',  desc: 'Pattern deduction, system matrix isolation, and sequence routing.' },
  'Verbal Ability':   { icon: 'translate',  desc: 'Syntactical comprehension, grammar validation, and vocabulary mapping.' },
};

export default function QuizEngine() {
  const navigate       = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const section    = searchParams.get('section')    || '';
  const topic      = searchParams.get('topic')      || '';
  const difficulty = searchParams.get('difficulty') || '';

  // ── Machine states ──────────────────────────────────────────────────────
  const [quizStarted,    setQuizStarted]    = useState(false);
  const [questions,      setQuestions]      = useState([]);
  const [currentIdx,     setCurrentIdx]     = useState(0);
  const [selectedAnswers,setSelectedAnswers]= useState({});   // { [idx]: "A"|"B"|"C"|"D" }
  const [quizCompleted,  setQuizCompleted]  = useState(false);

  // Submission states
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState(null);
  const [attemptResult,  setAttemptResult]  = useState(null); // server response

  // Review mode: show per-question breakdown after results land
  const [reviewIdx,      setReviewIdx]      = useState(0);

  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);
  const [timeLeft,setTimeLeft]  = useState(600);
  const timerRef = useRef(null);

  const availableTopics = section && quizData.section_topics[section]
    ? quizData.section_topics[section]
    : Object.values(quizData.section_topics).flat();

  const updateParam = (key, val) => {
    const newParams = new URLSearchParams(searchParams);
    if (val) { newParams.set(key, val); } else { newParams.delete(key); }
    if (key === 'section') newParams.delete('topic');
    setSearchParams(newParams);
  };

  // ── Fetch questions ──────────────────────────────────────────────────────
  const startQuizSession = () => {
    setLoading(true);
    setError(null);
    setAttemptResult(null);
    setSubmitError(null);

    api.get('/api/v1/hub/quiz', {
      params: {
        limit: 15,
        ...(section    && { section }),
        ...(topic      && { topic }),
        ...(difficulty && { difficulty }),
      },
    })
      .then(res => {
        const fetchedItems = res.data?.items || res.data || [];
        if (fetchedItems.length === 0) {
          setError('No evaluation nodes matching your configured vectors were located.');
        } else {
          setQuestions(fetchedItems);
          setSelectedAnswers({});
          setCurrentIdx(0);
          setReviewIdx(0);
          setTimeLeft(fetchedItems.length * 60);
          setQuizStarted(true);
          setQuizCompleted(false);
        }
      })
      .catch(() => setError('Failed to seed evaluation nodes. Please sync connection and retry.'))
      .finally(() => setLoading(false));
  };

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quizStarted || quizCompleted || questions.length === 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmitAttempt(true);   // auto-submit on timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [quizStarted, quizCompleted, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleOptionSelect = (optionKey) => {
    if (quizCompleted) return;
    setSelectedAnswers(prev => ({ ...prev, [currentIdx]: optionKey }));
  };

  // ── Server-side submission ───────────────────────────────────────────────
  /**
   * Builds the answers payload from (questions × selectedAnswers),
   * POST to /quiz/attempt, and stores the server's per-question results.
   * Questions with no selection are skipped — the server only evaluates
   * what was actually answered.
   */
  const handleSubmitAttempt = (timedOut = false) => {
    clearInterval(timerRef.current);

    const answers = questions
      .map((q, idx) => ({
        quiz_id:         q.id,
        selected_option: selectedAnswers[idx] ?? null,
      }))
      .filter(a => a.selected_option !== null);

    if (answers.length === 0) {
      // Nothing answered — show completed screen without a server call
      setQuizCompleted(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    api.post('/api/v1/hub/quiz/attempt', { answers })
      .then(res => {
        setAttemptResult(res.data);
        setReviewIdx(0);
        setQuizCompleted(true);
      })
      .catch(() => {
        setSubmitError('Failed to sync results. Your answers are preserved — please retry.');
      })
      .finally(() => setSubmitting(false));
  };

  // ── Derived helpers for results view ────────────────────────────────────
  const resultMap = attemptResult
    ? Object.fromEntries(attemptResult.results.map(r => [r.quiz_id, r]))
    : {};

  const reviewQuestion = attemptResult?.results[reviewIdx] ?? null;

  const answeredCount   = Object.keys(selectedAnswers).length;
  const unansweredCount = questions.length - answeredCount;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-background-deep text-on-surface font-body-base antialiased min-h-screen">
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">

          {/* ── SubHeader ── */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
            <div>
              <h2 className="text-2xl font-bold text-on-surface tracking-tight">Quiz Engine</h2>
              <p className="text-xs text-on-surface-variant">Calibrate operational competency profiles dynamically.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ── Primary Workspace ── */}
            <div className="lg:col-span-8 space-y-4">

              {error && (
                <div className="text-center py-6 text-rose-400 bg-rose-500/5 rounded-xl border border-rose-500/10 text-sm">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="bg-surface-container border border-border-subtle rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-xs text-on-surface-variant">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Initializing track profile buffers...
                </div>

              ) : !quizStarted ? (

                /* ══════════════════ STEP 1: LOBBY ══════════════════ */
                <div className="space-y-6 bg-surface-container border border-border-subtle rounded-2xl p-6 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">Targeted Training Setup</h3>
                    <p className="text-xs text-on-surface-variant">Select your primary focus trajectory to benchmark operational precision metrics.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quizData.sections.map((secName) => {
                      const isActive      = section === secName;
                      const designConfig  = SECTION_ICONS[secName] || { icon: 'school', desc: 'Verify specialized domain criteria matrices.' };
                      return (
                        <div
                          key={secName}
                          onClick={() => updateParam('section', isActive ? '' : secName)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all group ${
                            isActive
                              ? 'bg-primary/10 border-primary shadow-sm'
                              : 'bg-surface-container-low border-border-subtle hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant group-hover:text-primary'}`}>
                              <span className="material-symbols-outlined text-lg block">{designConfig.icon}</span>
                            </div>
                            <h4 className="font-semibold text-xs text-on-surface">{secName}</h4>
                          </div>
                          <p className="text-[11px] text-on-surface-variant leading-relaxed">{designConfig.desc}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                        Sub-Topic Filter {section && `(${section})`}
                      </label>
                      <select value={topic} onChange={e => updateParam('topic', e.target.value)}
                        className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-primary/50 transition-all">
                        <option value="">{section ? 'All Topics in this Role' : 'Select a Track First'}</option>
                        {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Target Complexity Profile</label>
                      <select value={difficulty} onChange={e => updateParam('difficulty', e.target.value)}
                        className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-primary/50 transition-all">
                        <option value="">All Thresholds</option>
                        <option value="Easy">Easy Level Core</option>
                        <option value="Medium">Medium Level Challenge</option>
                        <option value="Hard">Advanced Complexity Matrix</option>
                      </select>
                    </div>
                  </div>

                  <button onClick={startQuizSession}
                    className="w-full py-3 bg-primary text-white text-xs font-bold rounded-xl hover:brightness-110 shadow-sm transition-all flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-base">rocket_launch</span>
                    Initialize Evaluation Session
                  </button>
                </div>

              ) : !quizCompleted ? (

                /* ══════════════════ STEP 2: ACTIVE QUIZ ══════════════════ */
                <div className="bg-surface-container border border-border-subtle rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex justify-between items-center border-b border-border-subtle/50 pb-4">
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider rounded-md border border-primary/20">
                        {questions[currentIdx]?.section || 'Core Spec'}
                      </span>
                      <p className="text-xs text-on-surface-variant">
                        Active Target Domain: <span className="text-on-surface font-medium">{questions[currentIdx]?.topic || 'General'}</span>
                      </p>
                    </div>
                    <span className="text-xs font-mono bg-surface-container-high px-2.5 py-1 border border-border-subtle rounded-lg text-on-surface-variant">
                      Node <span className="text-on-surface font-bold">{currentIdx + 1}</span> of {questions.length}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold leading-relaxed text-on-surface">
                    {questions[currentIdx]?.question}
                  </h3>

                  <div className="grid grid-cols-1 gap-2.5">
                    {[
                      { key: 'A', text: questions[currentIdx]?.option_a },
                      { key: 'B', text: questions[currentIdx]?.option_b },
                      { key: 'C', text: questions[currentIdx]?.option_c },
                      { key: 'D', text: questions[currentIdx]?.option_d },
                    ].map((opt) => {
                      const isSelected = selectedAnswers[currentIdx] === opt.key;
                      return (
                        <button key={opt.key} onClick={() => handleOptionSelect(opt.key)}
                          className={`w-full text-left p-3.5 rounded-xl border text-xs flex items-center gap-3.5 transition-all group ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-on-surface'
                              : 'bg-surface-container-low border-border-subtle hover:border-primary/40 text-on-surface-variant hover:text-on-surface'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md font-bold flex items-center justify-center transition-colors shrink-0 text-[10px] ${
                            isSelected ? 'bg-primary text-white' : 'bg-surface-container-high border border-border-subtle'
                          }`}>
                            {opt.key}
                          </div>
                          <span className="leading-relaxed flex-1">{opt.text}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Submit error inline */}
                  {submitError && (
                    <div className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-xl px-4 py-3">
                      {submitError}
                      <button
                        onClick={() => handleSubmitAttempt()}
                        className="ml-3 underline font-semibold hover:text-rose-300 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-border-subtle/50">
                    <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(prev => prev - 1)}
                      className="px-4 py-2 bg-surface-container-high border border-border-subtle text-xs font-semibold rounded-xl text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-all flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                    </button>

                    {currentIdx < questions.length - 1 ? (
                      <button onClick={() => setCurrentIdx(prev => prev + 1)}
                        className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:brightness-110 shadow-sm transition-all flex items-center gap-1.5">
                        Next Node <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubmitAttempt()}
                        disabled={submitting}
                        className="px-5 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:brightness-110 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {submitting ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            Commit Sync Results <span className="material-symbols-outlined text-sm">check_circle</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

              ) : (

                /* ══════════════════ STEP 3: RESULTS ══════════════════ */
                <div className="space-y-4">

                  {/* Score summary card */}
                  <div className="bg-surface-container border border-border-subtle rounded-2xl p-6 shadow-sm text-center space-y-5">
                    <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mx-auto">
                      <span className="material-symbols-outlined text-2xl">workspace_premium</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight">Synchronization Finalized</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">Telemetry benchmarks recorded.</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
                      <div className="bg-surface-container-low border border-border-subtle p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Accuracy</p>
                        <h4 className="text-xl font-bold text-emerald-400 mt-0.5">
                          {attemptResult ? `${attemptResult.score_pct}%` : '—'}
                        </h4>
                      </div>
                      <div className="bg-surface-container-low border border-border-subtle p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Correct</p>
                        <h4 className="text-xl font-bold text-emerald-400 mt-0.5">
                          {attemptResult?.correct ?? '—'}
                          <span className="text-xs text-on-surface-variant font-normal"> /{attemptResult?.total ?? questions.length}</span>
                        </h4>
                      </div>
                      <div className="bg-surface-container-low border border-border-subtle p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Wrong</p>
                        <h4 className="text-xl font-bold text-rose-400 mt-0.5">
                          {attemptResult?.incorrect ?? '—'}
                        </h4>
                      </div>
                      <div className="bg-surface-container-low border border-border-subtle p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Skipped</p>
                        <h4 className="text-xl font-bold text-amber-400 mt-0.5">{unansweredCount}</h4>
                      </div>
                    </div>

                    <button onClick={() => { setQuizStarted(false); setQuizCompleted(false); setAttemptResult(null); }}
                      className="px-5 py-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white text-xs font-bold rounded-xl transition-all shadow-sm">
                      Configure Another Track
                    </button>
                  </div>

                  {/* Per-question review */}
                  {attemptResult && attemptResult.results.length > 0 && (
                    <div className="bg-surface-container border border-border-subtle rounded-2xl p-6 shadow-sm space-y-5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-on-surface">Question Review</h4>
                        <span className="text-xs font-mono text-on-surface-variant">
                          {reviewIdx + 1} / {attemptResult.results.length}
                        </span>
                      </div>

                      {/* Question text */}
                      <p className="text-sm font-medium text-on-surface leading-relaxed">
                        {reviewQuestion?.question}
                      </p>

                      {/* Options with correct/wrong highlighting */}
                      <div className="grid grid-cols-1 gap-2">
                        {['A', 'B', 'C', 'D'].map(key => {
                          const text        = reviewQuestion?.[`option_${key.toLowerCase()}`];
                          const isCorrect   = reviewQuestion?.correct_ans === key;
                          const isSelected  = reviewQuestion?.selected_option === key;
                          const isWrong     = isSelected && !isCorrect;

                          return (
                            <div key={key}
                              className={`p-3 rounded-xl border text-xs flex items-center gap-3 transition-all ${
                                isCorrect
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                                  : isWrong
                                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                                  : 'bg-surface-container-low border-border-subtle text-on-surface-variant'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-md font-bold flex items-center justify-center shrink-0 text-[10px] ${
                                isCorrect ? 'bg-emerald-500 text-white'
                                : isWrong ? 'bg-rose-500 text-white'
                                : 'bg-surface-container-high border border-border-subtle'
                              }`}>
                                {key}
                              </div>
                              <span className="flex-1">{text}</span>
                              {isCorrect && (
                                <span className="material-symbols-outlined text-sm text-emerald-400 shrink-0">check_circle</span>
                              )}
                              {isWrong && (
                                <span className="material-symbols-outlined text-sm text-rose-400 shrink-0">cancel</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Status label */}
                      <div className="flex items-center gap-2">
                        {reviewQuestion?.is_correct ? (
                          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider rounded-lg">Correct</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold uppercase tracking-wider rounded-lg">
                            {reviewQuestion?.selected_option ? 'Incorrect' : 'Skipped'}
                          </span>
                        )}
                      </div>

                      {/* Review nav */}
                      <div className="flex items-center justify-between pt-2 border-t border-border-subtle/50">
                        <button disabled={reviewIdx === 0} onClick={() => setReviewIdx(prev => prev - 1)}
                          className="px-4 py-2 bg-surface-container-high border border-border-subtle text-xs font-semibold rounded-xl text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-all flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">arrow_back</span> Previous
                        </button>

                        {/* Jump map */}
                        <div className="flex flex-wrap gap-1 justify-center max-w-[200px]">
                          {attemptResult.results.map((r, idx) => (
                            <button key={idx} onClick={() => setReviewIdx(idx)}
                              className={`w-6 h-6 rounded-md text-[9px] font-bold border transition-all flex items-center justify-center ${
                                reviewIdx === idx
                                  ? 'bg-primary border-primary text-white'
                                  : r.is_correct
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : !r.selected_option
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              }`}
                            >
                              {idx + 1}
                            </button>
                          ))}
                        </div>

                        <button disabled={reviewIdx === attemptResult.results.length - 1} onClick={() => setReviewIdx(prev => prev + 1)}
                          className="px-4 py-2 bg-surface-container-high border border-border-subtle text-xs font-semibold rounded-xl text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-all flex items-center gap-1.5">
                          Next <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Sidebar ── */}
            <aside className="lg:col-span-4 space-y-4">
              <section className="bg-surface-container border border-border-subtle rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Session Clock</p>
                    <h3 className={`text-2xl font-bold font-mono tracking-tight ${quizStarted && !quizCompleted && timeLeft < 60 ? 'text-rose-400 animate-pulse' : 'text-on-surface'}`}>
                      {quizStarted ? formatTime(timeLeft) : '——'}
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">Time Remaining</p>
                  </div>
                  <div className="bg-surface-container-high px-3 py-1.5 rounded-xl border border-border-subtle text-center min-w-[75px]">
                    <p className="text-[9px] uppercase font-bold text-on-surface-variant/60">Attempted</p>
                    <p className="text-lg font-bold text-emerald-400 leading-none my-0.5">{answeredCount}</p>
                    <p className="text-[8px] text-on-surface-variant uppercase font-bold tracking-wider">Nodes</p>
                  </div>
                </div>

                {quizStarted && questions.length > 0 && !quizCompleted && (
                  <div className="space-y-2 pt-3 border-t border-border-subtle/40">
                    <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Pipeline Node Map</p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {questions.map((_, idx) => {
                        const isCurrent  = currentIdx === idx;
                        const isAnswered = selectedAnswers[idx] !== undefined;
                        return (
                          <button key={idx} onClick={() => setCurrentIdx(idx)}
                            className={`w-6 h-6 rounded-md text-[10px] font-bold border transition-all flex items-center justify-center ${
                              isCurrent
                                ? 'bg-primary border-primary text-white shadow-sm'
                                : isAnswered
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-surface-container-low border-border-subtle text-on-surface-variant'
                            }`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Early submit shortcut while quiz is active */}
                {quizStarted && !quizCompleted && answeredCount > 0 && (
                  <div className="pt-3 border-t border-border-subtle/40 mt-3">
                    <button
                      onClick={() => handleSubmitAttempt()}
                      disabled={submitting}
                      className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-sm">done_all</span>
                      Submit {answeredCount}/{questions.length} Answers
                    </button>
                  </div>
                )}
              </section>
            </aside>

          </div>
        </main>
      </div>
    </div>
  );
}
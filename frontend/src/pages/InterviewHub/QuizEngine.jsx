import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';
import quizData from '../../data/quiz_filters.json';

const SECTION_ICONS = {
  'AI & ML': { icon: 'psychology', desc: 'Neural networks, training optimization, and modeling vectors.' },
  'Backend': { icon: 'dns', desc: 'Server architecture, API design, and asynchronous data processing.' },
  'Behavioral': { icon: 'handshake', desc: 'Interpersonal communication, leadership, and conflict resolution.' },
  'Blockchain': { icon: 'currency_bitcoin', desc: 'Decentralized ledgers, smart contracts, and Web3 paradigms.' },
  'Core Subjects': { icon: 'menu_book', desc: 'Fundamental computer science theory, OS, and object-oriented principles.' },
  'DSA': { icon: 'account_tree', desc: 'Algorithmic efficiency, graph theory, and data structure manipulation.' },
  'Data Analytics & BI': { icon: 'insights', desc: 'Data visualization, business intelligence, and statistical reporting.' },
  'Database': { icon: 'database', desc: 'SQL/NoSQL structures, query optimization, and data modeling.' },
  'DevOps': { icon: 'cloud_sync', desc: 'Infrastructure orchestration, continuous integration, and containerization.' },
  'Emerging Tech': { icon: 'memory', desc: 'IoT integration, quantum computing concepts, and augmented reality.' },
  'Frontend': { icon: 'web', desc: 'Client-side rendering, component states, and responsive UI design.' },
  'Programming Languages': { icon: 'code_blocks', desc: 'Syntax paradigms, memory management, and compilation workflows.' },
  'Security & Networking': { icon: 'security', desc: 'Protocol validation, penetration testing, and cryptography.' },
  'System Design': { icon: 'architecture', desc: 'Scalable infrastructure, load balancing, and microservices architecture.' },
  'Testing & QA': { icon: 'bug_report', desc: 'Test automation frameworks, quality assurance, and unit testing.' },
  'UI/UX & Design': { icon: 'design_services', desc: 'User experience flows, wireframing, and interactive prototyping.' },
  'DevOps Engineer': { icon: 'terminal', desc: 'CI/CD pipeline matrices, infrastructure as code, and cloud architectures.' },
  'React Engineer': { icon: 'code', desc: 'Dynamic state synchronization, custom hooks, and layout rendering optimization.' },
  'SAP Engineer': { icon: 'layers', desc: 'Enterprise data architecture, ABAP logic, and business workflows.' },
  'Numerical Ability': { icon: 'calculate', desc: 'Mathematical reasoning, metrics verification, and strategic calculation.' },
  'Logical Reasoning': { icon: 'extension', desc: 'Pattern deduction, system matrix isolation, and sequence routing.' },
  'Verbal Ability': { icon: 'translate', desc: 'Syntactical comprehension, grammar validation, and vocabulary mapping.' },
};

export default function QuizEngine() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const section = searchParams.get('section') || '';
  const topic = searchParams.get('topic') || '';
  const difficulty = searchParams.get('difficulty') || '';

  // ── Machine states ──────────────────────────────────────────────────────
  const [quizStarted, setQuizStarted] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});   // { [idx]: "A"|"B"|"C"|"D" }
  const [quizCompleted, setQuizCompleted] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");

  const handleGenerateQuestions = async () => {
    setGenerating(true);
    setGenStatus("Initializing AI Generation...");
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch("http://127.0.0.1:8000/api/v1/hub/quiz/generate/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          section: section || null,
          topic: topic || null,
          difficulty: difficulty || "Medium",
          role: null,
          category: null,
          skill: null
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });
        if (chunkValue) {
          const lines = chunkValue.split("\n\n");
          for (let line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.status) {
                  setGenStatus(data.status);
                  if (data.status === "complete") {
                    setGenerating(false);
                    startQuizSession(); 
                  }
                } else if (data.error) {
                  setError(data.error);
                  setGenerating(false);
                }
              } catch(e) {}
            }
          }
        }
      }
    } catch (e) {
      setError("Generation request failed.");
      setGenerating(false);
    }
  };


  // Submission states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [attemptResult, setAttemptResult] = useState(null); // server response

  // Review mode: show per-question breakdown after results land
  const [reviewIdx, setReviewIdx] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(600);
  const timerRef = useRef(null);

  const availableTopics = section && quizData.section_topics[section]
    ? quizData.section_topics[section]
    : [...new Set(Object.values(quizData.section_topics).flat())].sort();

  const updateParam = (key, val) => {
    const newParams = new URLSearchParams(searchParams);
    if (val) { newParams.set(key, val); } else { newParams.delete(key); }
    if (key === 'section') newParams.delete('topic');
    setSearchParams(newParams);
  };

  // ── Fetch questions ──────────────────────────────────────────────────────
  const [isPoolExhausted, setIsPoolExhausted] = useState(false);
  const [remainingCount, setRemainingCount] = useState(null);

  const startQuizSession = (replay = false) => {
    setLoading(true);
    setError(null);
    setAttemptResult(null);
    setSubmitError(null);
    setIsPoolExhausted(false);

    api.post('/api/v1/hub/quiz/session', {
      limit: 15,
      section: section || "All",
      topic: topic || "All",
      difficulty: difficulty || "All",
      replay: replay
    })
      .then(res => {
        const fetchedItems = res.data?.questions || [];
        if (fetchedItems.length === 0) {
          setError('OUT_OF_STOCK');
        } else {
          setQuestions(fetchedItems);
          setSelectedAnswers({});
          setCurrentIdx(0);
          setReviewIdx(0);
          setTimeLeft(fetchedItems.length * 60);
          setQuizStarted(true);
          setQuizCompleted(false);
          setIsPoolExhausted(res.data.completed);
          setRemainingCount(res.data.remaining_questions);
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
        quiz_id: q.id,
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

  const answeredCount = Object.keys(selectedAnswers).length;
  const unansweredCount = questions.length - answeredCount;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-background-deep text-on-surface font-body-base antialiased min-h-screen">
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-3 sm:space-y-6">

          {/* ── SubHeader ── */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-4 pb-2 sm:pb-4 border-b border-border-subtle">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-on-surface tracking-tight">Quiz Engine</h1>
              <p className="text-xs text-on-surface-variant">Calibrate operational competency profiles dynamically.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ── Primary Workspace ── */}
            <div className="lg:col-span-8 space-y-4">

                            {error && error === 'OUT_OF_STOCK' && !generating && (
                <div className="bg-surface-container p-6 rounded-2xl border border-primary/20 text-center">
                  <span className="material-symbols-outlined text-4xl text-on-surface/40 mb-2">inventory_2</span>
                  <h3 className="text-xl font-bold text-on-surface mb-2">Out of Stock</h3>
                  <p className="text-on-surface/60 mb-6 max-w-sm mx-auto">
                    There are no evaluation nodes matching these specific vectors. 
                    Would you like to dynamically synthesize new ones using AI?
                  </p>
                  <button
                    onClick={handleGenerateQuestions}
                    className="bg-primary hover:bg-primary-hover text-on-primary font-bold py-3 px-8 rounded-xl transition-colors inline-flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined">auto_awesome</span>
                    Auto-Generate with AI
                  </button>
                </div>
              )}

              {generating && (
                <div className="bg-surface-container p-6 rounded-2xl border border-primary/20 text-center">
                  <div className="animate-spin text-primary mx-auto mb-4 w-12 h-12 flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl">autorenew</span>
                  </div>
                  <h3 className="text-xl font-bold text-on-surface mb-2">Synthesizing Nodes</h3>
                  <p className="text-primary font-mono text-sm animate-pulse">
                    {genStatus}
                  </p>
                </div>
              )}

              {error && error !== 'OUT_OF_STOCK' && (
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

                /* â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull; STEP 1: LOBBY â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull; */
                <div className="h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-10rem)] flex flex-col min-h-0 space-y-6 bg-surface-container border border-border-subtle rounded-2xl px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">Targeted Training Setup</h3>
                    <p className="text-xs text-on-surface-variant">Select your primary focus trajectory to benchmark operational precision metrics.</p>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
                    {quizData.sections.map((secName) => {
                      const isActive = section === secName;
                      const designConfig = SECTION_ICONS[secName] || { icon: 'school', desc: 'Verify specialized domain criteria matrices.' };
                      return (
                        <div
                          key={secName}
                          onClick={() => updateParam('section', isActive ? '' : secName)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all group ${isActive
                              ? 'bg-primary/10 border-primary shadow-sm'
                              : 'bg-surface-container-low border-border-subtle hover:border-primary/40'
                            }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant group-hover:text-primary'}`}>
                              <span className="material-symbols-outlined text-lg block">{designConfig.icon}</span>
                            </div>
                            <h4 className="font-semibold text-xs text-on-surface">{secName}</h4>
                          </div>
                          <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">{designConfig.desc}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="shrink-0 space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-border-subtle">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex flex-col justify-end space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                        Sub-Topic Filter {section && `(${section})`}
                      </label>
                      <select value={topic} onChange={e => updateParam('topic', e.target.value)}
                        className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-primary/50 transition-all">
                        <option value="">{section ? 'All Topics in this Role' : 'Select a Track First'}</option>
                        {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col justify-end space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Target Complexity</label>
                      <select value={difficulty} onChange={e => updateParam('difficulty', e.target.value)}
                        className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-primary/50 transition-all">
                        <option value="">All Thresholds</option>
                        <option value="Easy">Easy Level Core</option>
                        <option value="Medium">Medium Level Challenge</option>
                        <option value="Hard">Advanced Complexity Matrix</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button onClick={() => startQuizSession(false)}
                      className="w-full py-2 sm:py-3 px-1 sm:px-2 bg-primary text-on-primary text-[10px] sm:text-xs font-bold rounded-xl hover:brightness-110 shadow-sm transition-all flex items-center justify-center gap-1 sm:gap-2">
                      <span className="material-symbols-outlined text-base">rocket_launch</span>
                      <span className="hidden sm:inline">Initialize Evaluation Session</span>
                      <span className="sm:hidden leading-tight">Start Session</span>
                    </button>
                    <button onClick={() => startQuizSession(true)}
                      className="w-full py-2 sm:py-3 px-1 sm:px-2 bg-transparent border border-primary/30 text-primary text-[10px] sm:text-xs font-bold rounded-xl hover:bg-primary/10 shadow-sm transition-all flex items-center justify-center gap-1 sm:gap-2 text-center">
                      <span className="material-symbols-outlined text-base">replay</span>
                      <span className="hidden sm:inline">Practice Again (Include Attempted)</span>
                      <span className="sm:hidden leading-tight">Practice Again</span>
                    </button>
                  </div>
                </div>

              </div>

              ) : !quizCompleted ? (

                /* â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull; STEP 2: ACTIVE QUIZ â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull; */
                <div className="h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-10rem)] flex flex-col min-h-0 bg-surface-container border border-border-subtle rounded-2xl p-4 sm:p-6 shadow-sm space-y-0">
                  <div className="shrink-0 flex justify-between items-center border-b border-border-subtle/50 pb-3 sm:pb-4 mb-4 sm:mb-6">
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

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 space-y-6 pb-2">
                    <h3 key={`q-${currentIdx}`} className="text-base font-semibold leading-relaxed text-on-surface" style={{ animation: 'list-in var(--dur-3) var(--ease-settle) backwards' }}>
                    {questions[currentIdx]?.question}
                  </h3>

                  <div key={`o-${currentIdx}`} className="stagger-list grid grid-cols-1 gap-2.5">
                    {questions[currentIdx]?.options?.map((opt) => {
                      const isSelected = selectedAnswers[currentIdx] === opt.option_id;
                      return (
                        <button key={opt.option_id} onClick={() => handleOptionSelect(opt.option_id)}
                          className={`w-full text-left p-3.5 rounded-xl border text-xs flex items-center gap-3.5 transition-all group ${isSelected
                              ? 'bg-primary/10 border-primary text-on-surface'
                              : 'bg-surface-container-low border-border-subtle hover:border-primary/40 text-on-surface-variant hover:text-on-surface'
                            }`}
                        >
                          <div key={isSelected ? 'on' : 'off'} className={`w-5 h-5 rounded-md font-bold flex items-center justify-center transition-colors shrink-0 text-[10px] ${isSelected ? 'pop bg-primary text-on-primary' : 'bg-surface-container-high border border-border-subtle'
                            }`}>
                            {opt.display_id}
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

                  </div>

                  <div className="shrink-0 flex items-center justify-between pt-3 sm:pt-4 mt-4 sm:mt-6 border-t border-border-subtle/50">
                    <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(prev => prev - 1)}
                      className="px-4 py-2 bg-surface-container-high border border-border-subtle text-xs font-semibold rounded-xl text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-all flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                    </button>

                    {currentIdx < questions.length - 1 ? (
                      <button onClick={() => setCurrentIdx(prev => prev + 1)}
                        className="px-5 py-2 bg-primary text-on-primary text-xs font-bold rounded-xl hover:brightness-110 shadow-sm transition-all flex items-center gap-1.5">
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

                /* â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull; STEP 3: RESULTS â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull;â&bull; */
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
                          {attemptResult ? `${attemptResult.score_pct}%` : '--'}
                        </h4>
                      </div>
                      <div className="bg-surface-container-low border border-border-subtle p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Correct</p>
                        <h4 className="text-xl font-bold text-emerald-400 mt-0.5">
                          {attemptResult?.correct ?? '--'}
                          <span className="text-xs text-on-surface-variant font-normal"> /{attemptResult?.total ?? questions.length}</span>
                        </h4>
                      </div>
                      <div className="bg-surface-container-low border border-border-subtle p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Wrong</p>
                        <h4 className="text-xl font-bold text-rose-400 mt-0.5">
                          {attemptResult?.incorrect ?? '--'}
                        </h4>
                      </div>
                      <div className="bg-surface-container-low border border-border-subtle p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Skipped</p>
                        <h4 className="text-xl font-bold text-amber-400 mt-0.5">{unansweredCount}</h4>
                      </div>
                    </div>

                    {isPoolExhausted && (
                      <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                        🎉 You've completed all unseen questions in this topic! You can practice again to include historical attempts.
                      </div>
                    )}
                    
                    <div className="flex justify-center gap-3">
                      <button onClick={() => { setQuizStarted(false); setQuizCompleted(false); setAttemptResult(null); }}
                        className="px-5 py-2 bg-surface-container-high text-on-surface border border-border-subtle hover:bg-surface-container-highest text-xs font-bold rounded-xl transition-all shadow-sm">
                        Back to Setup
                      </button>
                      <button onClick={() => startQuizSession(true)}
                        className="px-5 py-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-on-primary text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">replay</span> Practice Again
                      </button>
                    </div>
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
                        {questions[reviewIdx]?.options?.map(opt => {
                          const key = opt.option_id;
                          const text = opt.text;
                          const isCorrect = reviewQuestion?.correct_ans === key;
                          const isSelected = reviewQuestion?.selected_option === key;
                          const isWrong = isSelected && !isCorrect;

                          return (
                            <div key={key}
                              className={`p-3 rounded-xl border text-xs flex items-center gap-3 transition-all ${isCorrect
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                                  : isWrong
                                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                                    : 'bg-surface-container-low border-border-subtle text-on-surface-variant'
                                }`}
                            >
                              <div className={`w-5 h-5 rounded-md font-bold flex items-center justify-center shrink-0 text-[10px] ${isCorrect ? 'bg-emerald-500 text-white'
                                  : isWrong ? 'bg-rose-500 text-white'
                                    : 'bg-surface-container-high border border-border-subtle'
                                }`}>
                                {opt.display_id}
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
                      <div className="flex flex-col gap-4 pt-4 border-t border-border-subtle/50">
                        {/* Jump map */}
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {attemptResult.results.map((r, idx) => (
                            <button key={idx} onClick={() => setReviewIdx(idx)}
                              className={`w-9 h-9 sm:w-6 sm:h-6 rounded-md text-xs sm:text-[10px] font-bold border transition-all flex items-center justify-center ${reviewIdx === idx
                                  ? 'bg-primary border-primary text-on-primary'
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

                        <div className="flex justify-between w-full">
                          <button disabled={reviewIdx === 0} onClick={() => setReviewIdx(prev => prev - 1)}
                            className="px-4 py-2 bg-surface-container-high border border-border-subtle text-xs font-semibold rounded-xl text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-all flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Previous
                          </button>

                          <button disabled={reviewIdx === attemptResult.results.length - 1} onClick={() => setReviewIdx(prev => prev + 1)}
                            className="px-4 py-2 bg-surface-container-high border border-border-subtle text-xs font-semibold rounded-xl text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-all flex items-center gap-1.5">
                            Next <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Sidebar ── */}
            <aside className={`lg:col-span-4 space-y-4 ${!quizStarted ? 'hidden lg:block' : ''}`}>
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
                        const isCurrent = currentIdx === idx;
                        const isAnswered = selectedAnswers[idx] !== undefined;
                        return (
                          <button key={idx} onClick={() => setCurrentIdx(idx)}
                            className={`w-9 h-9 sm:w-6 sm:h-6 rounded-md text-xs sm:text-[10px] font-bold border transition-all flex items-center justify-center ${isCurrent
                                ? 'bg-primary border-primary text-on-primary shadow-sm'
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

import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  XCircle,
  History,
  Clock,
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

export default function ResumeAnalyser() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isScanned, setIsScanned] = useState(false);
  const fileInputRef = useRef(null);
  const resultRef = useRef(null);
  const lastFileRef = useRef(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get('/api/v1/resume/history');
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to fetch resume history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFile = async (selectedFile) => {
    if (!selectedFile) return;
    if (selectedFile.type !== 'application/pdf') {
      setError("Please upload a valid PDF file.");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("File is too large. Maximum size is 5MB.");
      return;
    }

    setFile(selectedFile);
    lastFileRef.current = selectedFile;
    setError(null);
    setUploading(true);
    setAnalysis(null);
    setIsScanned(false);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await api.post('/api/v1/resume/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // 60s timeout
      });

      setAnalysis(res.data);
      if (res.data.extraction_method === 'gemini_vision') {
        setIsScanned(true);
      }
      fetchHistory(); // refresh history
      
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);

    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;

      if (status === 422) {
        setError(data?.detail || "Could not extract text. Please ensure the PDF is text-based and not a scanned image.");
      } else if (status === 429) {
        setError(data?.detail || "You have reached your daily limit of 1 resume analysis. Please try again tomorrow.");
      } else if (err.code === "ECONNABORTED" || status === 504) {
        setError("Analysis timed out. Please try again later.");
      } else {
        setError(data?.detail?.message || data?.detail || "Upload failed. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const loadPastAnalysis = (past) => {
    setUploading(true);
    setError(null);
    setAnalysis(null);
    
    api.get(`/api/v1/resume/${past.id}`)
      .then((res) => {
        setAnalysis(res.data);
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 200);
      })
      .catch((err) => {
        setError("Failed to load previous analysis.");
      })
      .finally(() => setUploading(false));
  };

  // Helper to render score ring
  const renderScoreRing = (score) => {
    const validScore = score || 0;
    let color = "text-red-500";
    if (validScore >= 80) color = "text-green-500";
    else if (validScore >= 50) color = "text-yellow-500";

    return (
      <div className="relative w-32 h-32 flex items-center justify-center mx-auto">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-surface-variant stroke-current"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            strokeWidth="3"
          />
          <path
            className={clsx(color, "stroke-current")}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            strokeWidth="3"
            strokeDasharray={`${validScore}, 100`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-on-surface">{validScore}</span>
          <span className="text-xs text-on-surface-variant uppercase font-semibold tracking-wider">ATS Score</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-screen bg-background-deep text-on-surface">
      {/* Main Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Resume Analyser</h1>
            <p className="text-on-surface-variant">
              Upload your resume to get instant, AI-powered ATS scoring and tailored feedback based on your target role.
            </p>
          </div>

          {/* Upload Area */}
          <div
            className={clsx(
              "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-colors relative",
              uploading ? "border-primary/50 bg-primary/5" : "border-surface-variant hover:border-primary/50 bg-surface/30 cursor-pointer"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFile(e.target.files[0])}
              accept=".pdf"
              className="hidden"
            />
            
            {uploading ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-on-surface">
                    Analysing your resume…
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {isScanned
                      ? "Scanned PDF detected — processing images (10–18 seconds)"
                      : "Usually takes 3–6 seconds"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-4 py-6 pointer-events-none">
                <div className="w-16 h-16 bg-surface-variant rounded-full flex items-center justify-center">
                  <UploadCloud className="w-8 h-8 text-on-surface-variant" />
                </div>
                <div>
                  <p className="text-lg font-semibold">Click or drag your PDF here</p>
                  <p className="text-sm text-on-surface-variant mt-1">Only text-extractable PDFs are supported. Max 5MB.</p>
                </div>
                <button className="btn-primary mt-4 pointer-events-auto" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Select File
                </button>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold">Upload Failed</h3>
                <p className="text-sm opacity-90 mt-1">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-red-500/20 rounded-lg">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Results Area */}
          {analysis && analysis.feedback && (
            <div ref={resultRef} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-4">
              
              {/* Fallback Banner */}
              {analysis.feedback._analysis_failed && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-300">
                      Analysis temporarily unavailable
                    </p>
                    <p className="text-xs text-amber-300/80 mt-0.5">
                      Your resume was saved. The AI service is currently busy. Please retry in a moment.
                    </p>
                  </div>
                  <button
                    onClick={() => lastFileRef.current && handleFile(lastFileRef.current)}
                    className="px-4 py-2 text-xs font-bold text-amber-300 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-all"
                  >
                    Retry Analysis
                  </button>
                </div>
              )}

              {/* Main Score & Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card col-span-1 flex flex-col items-center justify-center p-8">
                  {renderScoreRing(analysis.ats_score)}
                  <p className="text-center text-sm text-on-surface-variant mt-4">
                    Based on industry standards for your target role.
                  </p>
                </div>
                <div className="card col-span-1 md:col-span-2 p-6 flex flex-col justify-center">
                  <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Overall Summary
                  </h3>
                  <p className="text-on-surface leading-relaxed">
                    {analysis.feedback.summary}
                  </p>
                  
                  {analysis.feedback.target_role_fit && (
                    <div className="mt-4 p-4 bg-surface rounded-xl border border-surface-variant">
                      <p className="text-sm text-on-surface-variant font-medium mb-1">Target Role Fit</p>
                      <p className="text-sm font-medium">{analysis.feedback.target_role_fit}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Strengths & Improvements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-6 border-t-4 border-t-green-500">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    Key Strengths
                  </h3>
                  <ul className="space-y-3">
                    {analysis.feedback.strengths?.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                        <span className="text-on-surface/90">{item}</span>
                      </li>
                    ))}
                    {!analysis.feedback.strengths?.length && (
                      <p className="text-sm text-on-surface-variant italic">No specific strengths highlighted.</p>
                    )}
                  </ul>
                </div>

                <div className="card p-6 border-t-4 border-t-amber-500">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-400">
                    <TrendingUp className="w-5 h-5" />
                    Areas to Improve
                  </h3>
                  <ul className="space-y-3">
                    {analysis.feedback.improvements?.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span className="text-on-surface/90">{item}</span>
                      </li>
                    ))}
                    {!analysis.feedback.improvements?.length && (
                      <p className="text-sm text-on-surface-variant italic">Your resume looks incredibly solid!</p>
                    )}
                  </ul>
                </div>
              </div>

              {/* Sections Breakdown */}
              {analysis.feedback.sections && (
                <div className="card p-6">
                  <h3 className="text-lg font-bold mb-6">Detailed Section Breakdown</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(analysis.feedback.sections).map(([key, val]) => (
                      <div key={key} className="p-4 bg-surface rounded-xl border border-surface-variant hover:border-primary/30 transition-colors">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold capitalize text-on-surface">{key}</span>
                          <span className={clsx(
                            "text-xs font-bold px-2 py-1 rounded-full",
                            val.score >= 80 ? "bg-green-500/10 text-green-400" :
                            val.score >= 50 ? "bg-yellow-500/10 text-yellow-400" :
                            "bg-red-500/10 text-red-400"
                          )}>
                            {val.score}/100
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant leading-relaxed">
                          {val.notes}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Keywords */}
              {analysis.feedback.keywords_missing && analysis.feedback.keywords_missing.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-lg font-bold mb-4">Missing Keywords for Target Role</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysis.feedback.keywords_missing.map((kw, idx) => (
                      <span key={idx} className="px-3 py-1 bg-surface-variant text-on-surface-variant rounded-lg text-sm font-medium border border-white/5">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* Sidebar: History */}
      <div className="w-80 border-l border-surface-variant bg-surface/30 p-6 flex flex-col hidden lg:flex">
        <div className="flex items-center gap-2 mb-6">
          <History className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-lg tracking-wide">Analysis History</h2>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {loadingHistory ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 opacity-60">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No past analyses found.</p>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                className={clsx(
                  "p-4 rounded-xl border transition-all cursor-pointer",
                  analysis?.id === item.id 
                    ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.1)]" 
                    : "bg-surface border-surface-variant hover:border-primary/50 hover:bg-surface-variant/50"
                )}
                onClick={() => loadPastAnalysis(item)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold px-2 py-1 bg-surface-variant text-on-surface rounded-md">
                    Score: {item.failed ? "N/A" : item.ats_score}
                  </span>
                  <span className="text-[10px] text-on-surface-variant flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-medium truncate" title={item.file_name}>
                  {item.file_name || "Resume.pdf"}
                </p>
                {item.failed && (
                  <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Analysis Failed
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

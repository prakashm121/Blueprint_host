import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { ArrowLeft, Send, Bot, Loader2, PlusCircle, Bookmark } from 'lucide-react';

const SUGGESTIONS = [
  'How is my placement readiness?',
  'Teach me Dynamic Programming',
  'Help me with Amazon Leadership Principles',
  'Suggest system design topics',
];

export default function Mentor() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const bottomRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [savedMsgIds, setSavedMsgIds] = useState(new Set());

  const handleSaveInsight = async (msgContent, index) => {
    if (savedMsgIds.has(index)) return;
    try {
      await api.post('/api/v1/vault/', {
        item_type: 'AI_INSIGHT',
        reference_type: 'NONE',
        title: 'AI Career Coach Insight',
        content: msgContent,
      });
      setSavedMsgIds(prev => new Set(prev).add(index));
    } catch (e) {
      console.error('Failed to save insight', e);
    }
  };

  const fetchConversations = () => {
    return api.get('/api/v1/mentor/conversations').then(res => {
      setConversations(res.data || []);
      return res.data || [];
    });
  };

  const loadConversation = (id) => {
    if (id === conversationId) return;
    setConversationId(id);
    setHistoryLoading(true);
    setMessages([]);
    api.get(`/api/v1/mentor/conversations/${id}`)
      .then(res => {
        if (res?.data?.messages) {
          setMessages(res.data.messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.created_at,
          })));
        }
      })
      .finally(() => setHistoryLoading(false));
  };

  // Fetch conversations on mount but default to a new chat
  useEffect(() => {
    fetchConversations().finally(() => setHistoryLoading(false));
  }, []);

  const hasSentTeachRef = useRef(false);

  // Handle ?teach= param — auto-send a teacher message after history loads, only once per session
  useEffect(() => {
    if (historyLoading || hasSentTeachRef.current) return;
    const teachTopic = searchParams.get('teach');
    if (teachTopic) {
      hasSentTeachRef.current = true;
      sendMessage(`Teach me about: ${teachTopic}`);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('teach');
      setSearchParams(newParams, { replace: true });
    }
  }, [historyLoading, searchParams, setSearchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    setInput('');
    setLoading(true);
    const userMsg = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Create conversation on first message if needed
      let convId = conversationId;
      if (!convId) {
        const convRes = await api.post('/api/v1/mentor/conversations', {
          title: trimmed.slice(0, 60),
        });
        convId = convRes.data.id;
        setConversationId(convId);
        fetchConversations();
      }

      const res = await api.post(
        `/api/v1/mentor/conversations/${convId}/message`,
        { content: trimmed },
      );

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.content,
        timestamp: res.data.created_at,
      }]);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: status === 429
          ? (detail || 'You\'ve sent too many messages. Please wait a moment.')
          : 'Sorry, I could not respond right now. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
  };

  const fmtTime = ts => ts
    ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="h-screen bg-background-deep text-on-surface font-sans flex flex-col overflow-hidden">

      {/* Top Nav */}
      <div className="w-full border-b border-border-subtle/50 px-6 py-4 flex items-center justify-between bg-background-deep/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-lg hover:bg-surface-container"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile-only history button */}
          <button
            onClick={() => setMobileHistoryOpen(true)}
            className="md:hidden flex items-center gap-2 text-xs font-medium text-on-surface-variant border border-border-subtle bg-surface-card px-3 py-2 rounded-xl hover:border-outline hover:text-on-surface transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            History
          </button>
          <button
            onClick={startNewConversation}
            className="flex items-center gap-2 text-xs font-medium text-on-surface-variant border border-border-subtle bg-surface-card px-3 py-2 rounded-xl hover:border-outline hover:text-on-surface transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            New Chat
          </button>
        </div>
      </div>

      {/* Main Interface */}
      <div className="flex-1 w-full max-w-[1400px] mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0">
        
        {/* Sidebar — desktop only */}
        <div className="hidden md:flex flex-col bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-2xl h-full">
          <div className="p-4 border-b border-border-subtle/40 bg-surface-container-low/30">
            <h3 className="text-sm font-bold text-on-surface">Past Conversations</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            <button 
              onClick={startNewConversation}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${
                conversationId === null 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 inline mr-2 -mt-0.5" />
              New Conversation
            </button>
            
            {conversations.length > 0 && (
              <div className="pt-2 pb-1 px-3 text-[10px] font-semibold text-on-surface-variant/50 uppercase tracking-wider">
                History
              </div>
            )}
            {conversations.map(c => (
              <button 
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${
                  conversationId === c.id 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                {c.title || 'New Conversation'}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Container */}
        <div className="md:col-span-3 bg-surface-card border border-border-subtle rounded-2xl flex flex-col overflow-hidden shadow-2xl h-full">

          {/* Chat Header */}
          <div className="flex items-center justify-between p-5 border-b border-border-subtle/40 bg-surface-container-low/30">
            <div className="flex items-center gap-3">
              <Bot className="w-7 h-7 text-primary-fixed-dim" />
              <div>
                <h2 className="text-base font-bold text-on-surface tracking-tight">AI Career Coach</h2>
                <p className="text-[11px] text-success font-medium flex items-center gap-1.5 mt-0.5 tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.5)]"></span>
                  Active · Grounded in your progress
                </p>
              </div>
            </div>
            <span className="text-[10px] text-on-surface-variant border border-border-subtle bg-surface-container-high px-3 py-1 rounded-full font-bold tracking-wider">
              GEMINI FLASH
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {historyLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-on-surface-variant" />
              </div>
            )}

            {!historyLoading && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60 mt-12">
                <Bot className="w-12 h-12 text-on-surface-variant mb-4" />
                <h3 className="text-lg font-semibold text-on-surface">How can I assist your prep today?</h3>
                <p className="text-sm text-on-surface-variant mt-2 max-w-sm leading-relaxed">
                  Ask for system design help, algorithm hints, teaching explanations, or resume tips tailored to your profile.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' ? (
                  <div className="w-full border-l-2 border-primary-container/30 pl-4 py-1">
                    <div className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-wrap font-mono">
                      {msg.content}
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <button 
                        onClick={() => handleSaveInsight(msg.content, i)}
                        disabled={savedMsgIds.has(i)}
                        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                          savedMsgIds.has(i) ? 'text-amber-400' : 'text-on-surface-variant/50 hover:text-amber-400'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        {savedMsgIds.has(i) ? 'Saved to Vault' : 'Save Insight'}
                      </button>
                      <div className="text-[10px] text-on-surface-variant/40 font-mono uppercase">
                        {fmtTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[75%]">
                    <div className="rounded-2xl rounded-tr-sm bg-primary-container/20 border border-primary-container/30 px-5 py-3 text-sm leading-relaxed text-primary-fixed-dim">
                      {msg.content}
                    </div>
                    <div className="text-[10px] text-on-surface-variant/40 text-right mt-1 font-mono uppercase">
                      {fmtTime(msg.timestamp)}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="w-full border-l-2 border-primary-container/30 pl-4 py-1 flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary-fixed-dim" />
                <span className="text-sm text-on-surface-variant font-mono">Synthesizing response...</span>
              </div>
            )}
            <div ref={bottomRef} className="h-4" />
          </div>

          {/* Suggestions + Input */}
          <div className="p-5 border-t border-border-subtle/40 bg-surface-container-low/30">
            {messages.length === 0 && !historyLoading && (
              <div className="flex flex-wrap gap-2.5 mb-4">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="rounded-full border border-border-subtle bg-surface-container-low px-4 py-1.5 text-xs font-medium text-on-surface-variant transition hover:border-primary-fixed-dim/50 hover:text-on-surface hover:bg-surface-container cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder='Ask anything — or try "Teach me Graphs"'
                className="w-full bg-background-deep border border-border-subtle rounded-full py-3.5 pl-6 pr-14 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none transition-all focus:border-primary-fixed-dim/60 focus:bg-surface-container-low"
                disabled={loading || historyLoading}
              />
              <button
                type="submit"
                disabled={loading || historyLoading || !input.trim()}
                className="absolute right-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:text-primary-fixed-dim hover:bg-surface-container disabled:opacity-40 cursor-pointer"
              >
                <Send className="h-4 w-4 -ml-0.5" />
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* Mobile history bottom-sheet */}
      {mobileHistoryOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end"
          onClick={() => setMobileHistoryOpen(false)}
        >
          <div
            className="w-full bg-surface-card border-t border-border-subtle rounded-t-2xl max-h-[65vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
              <h3 className="font-bold text-on-surface text-sm">Conversations</h3>
              <button
                onClick={() => setMobileHistoryOpen(false)}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <button
                onClick={() => { startNewConversation(); setMobileHistoryOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${
                  conversationId === null
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5 inline mr-2 -mt-0.5" />
                New Conversation
              </button>
              {conversations.length > 0 && (
                <div className="pt-2 pb-1 px-3 text-[10px] font-semibold text-on-surface-variant/50 uppercase tracking-wider">
                  History
                </div>
              )}
              {conversations.map(c => (
                <button
                  key={c.id}
                  onClick={() => { loadConversation(c.id); setMobileHistoryOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${
                    conversationId === c.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                >
                  {c.title || 'New Conversation'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
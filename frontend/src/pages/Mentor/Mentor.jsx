import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Send, Bot, Loader2, PlusCircle, Bookmark, BookmarkCheck, History } from 'lucide-react';
import { usePresence } from '../../lib/motion';

const SUGGESTIONS = [
  'How is my placement readiness?',
  'Teach me Dynamic Programming',
  'Help me with Amazon Leadership Principles',
  'Suggest system design topics',
];

const AssistantMessage = React.memo(function AssistantMessage({ content, streaming }) {
  if (streaming) {
    return (
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-on-surface-variant">
        {content}
        <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-primary-fixed-dim rounded-sm animate-pulse" />
      </div>
    );
  }
  return (
    <div className="prose prose-invert max-w-none text-sm leading-7 text-on-surface-variant">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-on-surface mt-2 mb-4">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-on-surface mt-6 mb-3">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-on-surface mt-5 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-4 last:mb-0">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-on-surface">
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 space-y-2 mb-4">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 space-y-2 mb-4">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-1">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary-container/50 pl-4 my-4 italic text-on-surface-variant/80">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            return !match ? (
              <code
                className="px-1.5 py-0.5 mx-0.5 rounded-md bg-surface-container-high text-primary-fixed-dim text-[13px] font-mono"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code
                className="text-[13px] leading-6 font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-5 p-4 rounded-xl bg-background-deep border border-border-subtle overflow-x-auto shadow-inner">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-fixed-dim hover:underline [overflow-wrap:anywhere]"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr className="my-6 border-border-subtle" />
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-5 rounded-xl border border-border-subtle">
              <table className="w-full text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-semibold text-on-surface bg-surface-container">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 border-t border-border-subtle">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
export default function Mentor() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  const streamQueueRef = useRef('');
  const streamDisplayedRef = useRef('');
  const streamTimerRef = useRef(null);

  const getNextVisibleChunk = (text) => {
    if (!text) return ['', ''];
    let target = 4;
    if (text.length > 120) target = 12;
    else if (text.length > 60) target = 8;
    if (text.length <= target) return [text, ''];
    const candidate = text.slice(0, target);
    const lastSpace = candidate.lastIndexOf(' ');
    if (lastSpace >= 3) {
      return [text.slice(0, lastSpace + 1), text.slice(lastSpace + 1)];
    }
    return [text.slice(0, target), text.slice(target)];
  };

  const startVisualStream = () => {
    if (streamTimerRef.current) return;
    streamTimerRef.current = setInterval(() => {
      const queue = streamQueueRef.current;
      if (!queue) {
        clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
        return;
      }
      const [visible, remaining] = getNextVisibleChunk(queue);
      streamQueueRef.current = remaining;
      streamDisplayedRef.current += visible;
      setStreamingContent(streamDisplayedRef.current);
    }, 30);
  };

  const stopVisualStream = () => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  };

  const resetVisualStream = () => {
    stopVisualStream();
    streamQueueRef.current = '';
    streamDisplayedRef.current = '';
    setStreamingContent('');
  };
  const [historyLoading, setHistoryLoading] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const historySheet = usePresence(mobileHistoryOpen, 200);
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

  const fetchConversations = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return [];

    // We need the internal user ID, but we can query by supabase_id if we join, or just fetch our user row first.
    const { data: userRow } = await supabase.from('users').select('id').eq('supabase_id', userData.user.id).single();
    if (!userRow) return [];

    const { data, error } = await supabase
      .from('mentor_conversations')
      .select('*')
      .eq('user_id', userRow.id)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error(error);
      return [];
    }
    setConversations(data || []);
    return data || [];
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
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [streamingContent, messages.length]);

  const sendMessage = async (text) => {
  const trimmed = (text || input).trim();
  if (!trimmed || loading) return;

  setInput('');
  setLoading(true);

  const userMsg = {
    role: 'user',
    content: trimmed,
    timestamp: new Date().toISOString(),
  };
  setMessages(prev => [...prev, userMsg]);

  try {
    let convId = conversationId;
    if (!convId) {
      const convRes = await api.post(
        '/api/v1/mentor/conversations',
        { title: trimmed.slice(0, 60) }
      );
      convId = convRes.data.id;
      setConversationId(convId);
      fetchConversations();
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const token = useAuthStore.getState().token || '';

    resetVisualStream();

    const streamRes = await fetch(
      `${apiBase}/api/v1/mentor/conversations/${convId}/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: trimmed, model_override: selectedModel || null }),
      }
    );

    if (!streamRes.ok) {
      const errText = await streamRes.text();
      if (streamRes.status === 429) {
        // Rate/quota limit: show the server's explanation instead of a generic failure.
        let limitMessage = 'You are sending messages too quickly. Please try again later.';
        try { limitMessage = JSON.parse(errText).detail || limitMessage; } catch { /* keep default */ }
        const limitError = new Error(limitMessage);
        limitError.userMessage = limitMessage;
        throw limitError;
      }
      throw new Error(`Stream error ${streamRes.status}: ${errText}`);
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let finalTs = new Date().toISOString();
    let streamErrored = false;

    outer:
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        
        const payload = line.slice(5).trim();
        if (!payload) continue;

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        if (parsed.error) {
          console.error('[Stream] backend error:', parsed.error);
          streamErrored = true;
          stopVisualStream();
          streamQueueRef.current = '';
          setStreamingContent('');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Sorry, I could not respond right now. Please try again.',
            timestamp: new Date().toISOString(),
          }]);
          break outer;
        }

        if (parsed.done) {
          finalTs = parsed.created_at || finalTs;
          continue;
        }

        if (parsed.chunk) {
          streamQueueRef.current += parsed.chunk;
          startVisualStream();
        }
      }
    }

    if (!streamErrored) {
      stopVisualStream();
      if (streamQueueRef.current) {
        streamDisplayedRef.current += streamQueueRef.current;
        streamQueueRef.current = '';
      }
      const finalContent = streamDisplayedRef.current;
      if (finalContent) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: finalContent,
          timestamp: finalTs,
        }]);
      }
      setStreamingContent('');
    }

  } catch (err) {
    console.error('[Mentor Stream]', err);
    stopVisualStream();
    streamQueueRef.current = '';
    streamDisplayedRef.current = '';
    setStreamingContent('');
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: err.userMessage || 'Sorry, I could not respond right now. Please try again.',
      timestamp: new Date().toISOString(),
    }]);
  } finally {
    setLoading(false);
  }
};

    const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setInput('');
    resetVisualStream();
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('teach');
    setSearchParams(newParams, { replace: true });
  };

  const fmtTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

return (
  <div className="h-full min-h-0 bg-background-deep text-on-surface font-sans flex flex-col overflow-hidden w-full max-w-[100vw]">

    {/* Top Nav */}
    <div className="w-full border-b border-border-subtle/50 px-4 py-3 sm:py-4 flex flex-row items-center justify-between gap-3 bg-background-deep/80 backdrop-blur sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="inline-flex h-10 w-10 items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors rounded-lg hover:bg-surface-container"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {/* Mobile-only history button */}
        <button
          onClick={() => setMobileHistoryOpen(true)}
          className="md:hidden flex min-h-10 items-center gap-2 text-xs font-medium text-on-surface-variant border border-border-subtle bg-surface-card px-3 py-2 rounded-xl hover:border-outline hover:text-on-surface transition-all"
        >
          <History className="w-4 h-4" aria-hidden="true" />
          History
        </button>
        <button
          onClick={startNewConversation}
          className="flex min-h-10 items-center gap-2 text-xs font-medium text-on-surface-variant border border-border-subtle bg-surface-card px-3 py-2 rounded-xl hover:border-outline hover:text-on-surface transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          New Chat
        </button>
      </div>
    </div>

    {/* Main Interface */}
    <div className="flex-1 w-full max-w-[1400px] mx-auto px-3 py-3 sm:px-4 sm:py-8 grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0">

      {/* Sidebar — desktop only */}
      <div className="hidden md:flex flex-col bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-2xl h-full">
        <div className="p-4 border-b border-border-subtle/40 bg-surface-container-low/30">
          <h3 className="text-sm font-bold text-on-surface">Past Conversations</h3>
        </div>
        <div className="stagger-list flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          <button
            onClick={startNewConversation}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${conversationId === null
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
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${conversationId === c.id
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
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-[10px] text-on-surface-variant border border-border-subtle bg-surface-container-high px-2.5 py-1 min-h-9 rounded-full font-bold tracking-wider outline-none cursor-pointer hover:bg-surface-container-highest transition-colors appearance-none text-center max-w-[120px] sm:max-w-none truncate"
          >
            <option value="">AUTO (GEMINI FLASH)</option>
            <option value="gemini-3.8-flash">GEMINI 3.8 FLASH</option>
            <option value="gemini-3.7-flash">GEMINI 3.7 FLASH</option>
            <option value="gemini-3.6-flash">GEMINI 3.6 FLASH</option>
            <option value="gemini-3.5-flash">GEMINI 3.5 FLASH</option>
            <option value="gemini-2.5-flash">GEMINI 2.5 FLASH</option>
            <option value="gemini-2.5-flash-lite">GEMINI 2.5 FLASH LITE</option>
          </select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          {historyLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-on-surface-variant" />
            </div>
          )}

          {!historyLoading && messages.length === 0 && !loading && (
            // Empty chat: the suggestions live here, inside the conversation, as things to ask.
            <div className="flex min-h-full flex-col items-center justify-center py-4 text-center">
              <Bot className="mb-4 h-11 w-11 text-on-surface-variant/70" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-on-surface">What should we work on today?</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-on-surface-variant">
                Ask for a topic explained, hints on a problem, system design help or resume tips. I can see your plan and progress.
              </p>
              <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border-subtle bg-surface-container-low px-4 py-3 text-left text-sm font-medium text-on-surface transition hover:border-outline hover:bg-surface-container"
                    style={{ animation: `rise-in 0.45s var(--ease-settle) ${0.08 * i}s both` }}
                  >
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">chat_bubble</span>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animation: 'list-in var(--dur-3) var(--ease-settle) backwards' }}
            >
              {msg.role === 'assistant' ? (
                <div className="w-full border-l-2 border-primary-container/30 pl-5 py-2">
                  <AssistantMessage content={msg.content} />
                  <div className="flex justify-between items-center mt-5 pt-3 border-t border-border-subtle/30">
                    {!msg._streaming && !msg.content.startsWith('Sorry, I') && (
                    <button
                      onClick={() => handleSaveInsight(msg.content, i)}
                      disabled={savedMsgIds.has(i)}
                      className={`-ml-1 flex min-h-9 items-center gap-1.5 rounded-md px-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${savedMsgIds.has(i)
                          ? 'text-amber-400'
                          : 'text-on-surface-variant/50 hover:text-amber-400'
                        }`}
                    >
                      {savedMsgIds.has(i)
                        ? <BookmarkCheck className="pop w-3.5 h-3.5" />
                        : <Bookmark className="w-3.5 h-3.5" />}
                      {savedMsgIds.has(i) ? 'Saved to vault' : 'Save insight'}
                    </button>
                    )}
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
            <div className="flex w-full justify-start">
              <div className="w-full border-l-2 border-primary-container/30 pl-5 py-2">
                {streamingContent ? (
                  <AssistantMessage content={streamingContent} streaming={true} />
                ) : (
                  <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                    <Loader2 className="h-4 w-4 animate-spin text-primary-fixed-dim" />
                    <span>Thinking...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-4" />
        </div>

        {/* Input */}
        <div className="p-3 sm:p-5 border-t border-border-subtle/40 bg-surface-container-low/30">
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
    {historySheet.mounted && (
      <div className="md:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Conversations">
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${historySheet.closing ? 'backdrop-out' : 'backdrop-in'}`}
          onClick={() => setMobileHistoryOpen(false)}
        />
        <div
          className={`as-sheet relative w-full bg-surface-card border-t border-border-subtle rounded-t-2xl max-h-[65vh] flex flex-col ${
            historySheet.closing ? 'dialog-out pointer-events-none' : 'dialog-in'
          }`}
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
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${conversationId === null
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
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors truncate ${conversationId === c.id
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
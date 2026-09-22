import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\Mentor\Mentor.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';"""

import_replacement = """import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';"""

content = content.replace(import_target, import_replacement)

# Replace Logic
logic_target = """  const [conversations, setConversations] = useState([]);
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
  }, []);"""

logic_replacement = """  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const bottomRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [savedMsgIds, setSavedMsgIds] = useState(new Set());
  
  const queryClient = useQueryClient();

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

  const { data: conversations = [], isLoading: convLoading } = useQuery({
    queryKey: ['mentorConversations'],
    queryFn: async () => {
      const res = await api.get('/api/v1/mentor/conversations');
      return res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

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
  };"""

fetch_target = """        convId = convRes.data.id;
        setConversationId(convId);
        fetchConversations();
      }"""

fetch_replacement = """        convId = convRes.data.id;
        setConversationId(convId);
        queryClient.invalidateQueries(['mentorConversations']);
      }"""

content = content.replace(logic_target, logic_replacement)
content = content.replace(fetch_target, fetch_replacement)
# fix historyLoading reference in useEffect
effect_target = """  useEffect(() => {
    if (historyLoading || hasSentTeachRef.current) return;"""
effect_replacement = """  useEffect(() => {
    if (convLoading || historyLoading || hasSentTeachRef.current) return;"""
content = content.replace(effect_target, effect_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Mentor.jsx updated successfully!")

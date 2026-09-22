# -*- coding: utf-8 -*-
import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\InterviewHub\DSAProblemDetail.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../api';"""

import_replacement = """import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';"""

content = content.replace(import_target, import_replacement)

# Replace Logic
logic_target = """  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      await api.post('/api/v1/vault/', {
        item_type: 'PERSONAL_NOTE',
        reference_type: 'DSA',
        reference_id: problem.id,
        title: `Notes: ${problem.title}`,
        content: notes.trim(),
      });
    } catch { /* silent — store locally as fallback */ }
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
    setSavedNotes(prev => [{ text: notes, date }, ...prev]);
    setNotes('');
  };"""

logic_replacement = """  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [solved, setSolved] = useState(false);
  const [hintsOpen, setHintsOpen] = useState({});

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

  useEffect(() => {
    async function loadProgress() {
      if (!problem) return;
      try {
        const progressRes = await api.get(`/api/v1/hub/coding/${id}/progress`);
        if (progressRes.data.status === 'solved') setSolved(true);
      } catch { /* not yet attempted */ }
    }
    loadProgress();
  }, [id, problem]);

  const handleAddNote = async () => {
    if (!notes.trim() || !problem) return;
    // Persist notes to the Knowledge Vault using Supabase Direct
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
  };"""

vault_target = """  const handleSaveToVault = async () => {
    if (!problem) return;
    try {
      await api.post('/api/v1/vault/', {
        item_type: 'BOOKMARK',
        reference_type: 'DSA',
        reference_id: problem.id,
        title: problem.title,
        content: `Difficulty: ${problem.difficulty} | Topics: ${(problem.topic_tags || []).join(', ')}`,
      });
    } catch { /* silent */ }
    setBookmarked(true);
  };"""

vault_replacement = """  const handleSaveToVault = async () => {
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
  };"""

content = content.replace(logic_target, logic_replacement)
content = content.replace(vault_target, vault_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("DSAProblemDetail.jsx updated successfully!")

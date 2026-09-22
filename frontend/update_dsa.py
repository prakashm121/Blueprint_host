import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\InterviewHub\DSAEngine.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../../api';
import filterData from '../../data/filters.json';"""

import_replacement = """import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { supabase } from '../../lib/supabase';
import filterData from '../../data/filters.json';"""

content = content.replace(import_target, import_replacement)

# Replace Logic
logic_target = """export default function DSAEngine() {
  const navigate = useNavigate();
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [nextCursor, setNextCursor] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const company = searchParams.get('company') || '';
  const topic = searchParams.get('topic') || '';
  const difficulty = searchParams.get('difficulty') || '';

  const updateParam = (key, val) => {
    const newParams = new URLSearchParams(searchParams);
    val ? newParams.set(key, val) : newParams.delete(key);
    setSearchParams(newParams);
  };

  const fetchStats = useCallback(() => {
    api.get('/api/v1/hub/stats/dsa')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const loaderRef = useRef(null);
  const fetchingRef = useRef(false);

  const fetchProblems = useCallback(async (cursor, reset = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const params = { last_id: cursor, limit: 20, ...(company && { company }), ...(topic && { topic }), ...(difficulty && { difficulty }) };
      const res = await api.get('/api/v1/hub/coding', { params });
      const { items, next_cursor } = res.data;

      setProblems(prev => {
        if (reset) return items;
        const existingIds = new Set(prev.map(p => p.id));
        return [...prev, ...items.filter(p => !existingIds.has(p.id))];
      });
      setNextCursor(next_cursor ?? 0);
      setHasMore(items.length === 20 && next_cursor != null);
    } catch (err) {
      setError('Failed to load problems. Please try again.');
    } finally {
      setLoading(false);
      setInitialLoad(false);
      fetchingRef.current = false;
    }
  }, [company, topic, difficulty]);

  useEffect(() => {
    setProblems([]);
    setNextCursor(0);
    setHasMore(true);
    setInitialLoad(true);
    fetchProblems(0, true);
  }, [company, topic, difficulty, fetchProblems]);

  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !fetchingRef.current) {
        fetchProblems(nextCursor);
      }
    }, { threshold: 0.1 });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, fetchProblems]);"""


logic_replacement = """export default function DSAEngine() {
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

  // Phase 3: Stats via React Query & FastAPI
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dsaStats'],
    queryFn: () => api.get('/api/v1/hub/stats/dsa').then(res => res.data),
    staleTime: 5 * 60 * 1000,
  });

  // Phase 4: Infinite Query via Supabase Direct
  const fetchProblems = async ({ pageParam = 0 }) => {
    let query = supabase.from('dsa_problems').select('*');
    
    if (pageParam > 0) {
      query = query.gt('id', pageParam);
    }
    
    if (company && company !== "All") {
      query = query.contains('companies', [company]);
    }
    if (topic && topic !== "All") {
      query = query.contains('topic_tags', [topic]);
    }
    if (difficulty && difficulty !== "All") {
      query = query.eq('difficulty', difficulty);
    }
    
    query = query.order('id', { ascending: true }).limit(20);
    
    const { data, error } = await query;
    if (error) throw error;
    
    const next_cursor = data.length === 20 ? data[19].id : null;
    return { items: data, next_cursor };
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    queryKey: ['dsaProblems', company, topic, difficulty],
    queryFn: fetchProblems,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });

  const problems = data ? data.pages.flatMap(page => page.items) : [];
  const initialLoad = status === 'pending';
  const loading = isFetchingNextPage;
  const hasMore = hasNextPage;

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);"""

content = content.replace(logic_target, logic_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("DSAEngine.jsx updated successfully!")

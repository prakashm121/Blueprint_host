import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\InterviewHub\InterviewQAEngine.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../../api';
import qaData from '../../data/qa_filters.json';"""

import_replacement = """import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';
import qaData from '../../data/qa_filters.json';"""

content = content.replace(import_target, import_replacement)

# Replace State and Logic
logic_target = """  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [nextCursor, setNextCursor] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);
  const [revealedAnswer, setRevealedAnswer] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  // Combine the DB roles
  const visibleRoles = qaData.roles;

  // Handle category option matrix context drops safely
  const relevantCategories =
  activeRole && qaData.role_categories[activeRole]
    ? qaData.role_categories[activeRole]
    : qaData.categories;

  // Extract nested sub-skills contextually when a parent category is selected
  const relevantSkills = activeCategory && qaData.category_skills && qaData.category_skills[activeCategory]
    ? qaData.category_skills[activeCategory]
    : [];

  // Update query parameters safely with cascading resets
  const updateQueryParam = (key, val) => {
    const newParams = new URLSearchParams(searchParams);
    if (val) {
      newParams.set(key, val);
    } else {
      newParams.delete(key);
    }
    
    // Cascading State Flush: Reset children when selection context changes
    if (key === 'role') {
      newParams.delete('category');
      newParams.delete('skill');
    }
    if (key === 'category') {
      newParams.delete('skill');
    }
    
    setSearchParams(newParams);
    setSelectedQuestion(null);
    setRevealedAnswer(false);
  };

  // Fetch items from backend API
  useEffect(() => {
    setLoadingList(true);
    setError(null);

    const params = {
      limit: 20,
      ...(activeRole && { role: activeRole }),
      ...(activeCategory && { category: activeCategory }),
      ...(activeSkill && { skill: activeSkill }), 
      ...(activeDifficulty && { difficulty: activeDifficulty })
    };

    api.get('/api/v1/hub/interview', { params })
      .then(res => {
        const dataItems = res.data?.items || res.data || [];
        const nc = res.data?.next_cursor ?? 0;
        setQuestions(dataItems);
        setNextCursor(nc);
        setHasMore(dataItems.length === 20 && nc != null);
        if (dataItems.length > 0) {
          loadQuestionDetails(dataItems[0].id);
        } else {
          setSelectedQuestion(null);
        }
      })
      .catch(() => setError('Failed to acquire questions from active index.'))
      .finally(() => setLoadingList(false));
  }, [activeRole, activeCategory, activeSkill, activeDifficulty]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const params = {
      limit: 20,
      last_id: nextCursor,
      ...(activeRole && { role: activeRole }),
      ...(activeCategory && { category: activeCategory }),
      ...(activeSkill && { skill: activeSkill }),
      ...(activeDifficulty && { difficulty: activeDifficulty }),
    };
    api.get('/api/v1/hub/interview', { params })
      .then(res => {
        const newItems = res.data?.items || [];
        const nc = res.data?.next_cursor ?? 0;
        setQuestions(prev => [...prev, ...newItems]);
        setNextCursor(nc);
        setHasMore(newItems.length === 20 && nc != null);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const loadQuestionDetails = (id) => {
    setLoadingDetail(true);
    setRevealedAnswer(false);
    setBookmarked(false);
    api.get(`/api/v1/hub/interview/${id}`)
      .then(res => { setSelectedQuestion(res.data); })
      .catch(() => setError('Failed to sync complete item body structure.'))
      .finally(() => setLoadingDetail(false));
  };

  const saveToVault = async (q, itemType = 'BOOKMARK') => {
    try {
      await api.post('/api/v1/vault/', {
        item_type: itemType,
        reference_type: 'INTERVIEW',
        reference_id: q.id,
        title: q.title,
        content: q.body || '',
      });
    } catch { /* silent */ }
  };

  const handleBookmark = async () => {
    if (!selectedQuestion || bookmarking) return;
    setBookmarking(true);
    await saveToVault(selectedQuestion, 'BOOKMARK');
    setBookmarked(true);
    setBookmarking(false);
  };

  const handleMarkReviewedAndNext = async () => {
    if (!selectedQuestion || markingReviewed) return;
    setMarkingReviewed(true);
    await saveToVault(selectedQuestion, 'BOOKMARK');
    const curPos = questions.findIndex(x => x.id === selectedQuestion.id);
    if (curPos !== -1 && curPos < questions.length - 1) {
      loadQuestionDetails(questions[curPos + 1].id);
    }
    setMarkingReviewed(false);
  };"""


logic_replacement = """  const queryClient = useQueryClient();
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [revealedAnswer, setRevealedAnswer] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  // Combine the DB roles
  const visibleRoles = qaData.roles;

  // Handle category option matrix context drops safely
  const relevantCategories = activeRole && qaData.role_categories[activeRole] ? qaData.role_categories[activeRole] : qaData.categories;
  const relevantSkills = activeCategory && qaData.category_skills && qaData.category_skills[activeCategory] ? qaData.category_skills[activeCategory] : [];

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
    if (activeRole) query = query.eq('role', activeRole);
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

  const questions = data ? data.pages.flatMap(page => page.items) : [];
  const loadingList = status === 'pending';
  const error = queryError ? 'Failed to acquire questions from active index.' : null;
  const hasMore = hasNextPage;

  // Auto-select first item
  useEffect(() => {
    if (questions.length > 0 && !selectedQuestion && !loadingList) {
      setSelectedQuestion(questions[0]);
    } else if (questions.length === 0 && !loadingList) {
      setSelectedQuestion(null);
    }
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
    }
  };

  const saveMutation = useMutation({
    mutationFn: async ({ q, itemType }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from('users').select('id').eq('supabase_id', userData.user.id).single();
      
      const { error } = await supabase.from('vault_items').insert([{
        user_id: userRow.id,
        item_type: itemType,
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
  };"""

content = content.replace(logic_target, logic_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("InterviewQAEngine.jsx updated successfully!")

import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\InterviewHub\QuizEngine.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import quizData from '../../data/quiz_filters.json';"""

import_replacement = """import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';
import quizData from '../../data/quiz_filters.json';"""

content = content.replace(import_target, import_replacement)

# Replace Logic
logic_target = """  const [loading, setLoading]   = useState(false);
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

  // -- Fetch questions ------------------------------------------------------
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
  };"""

logic_replacement = """  const [error,   setError]     = useState(null);
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

  // -- Fetch questions ------------------------------------------------------
  const { refetch: fetchQuestions, isFetching: loading } = useQuery({
    queryKey: ['quizQuestions', section, topic, difficulty],
    queryFn: async () => {
      let query = supabase.from('quiz_questions').select('*').limit(15);
      if (section) query = query.eq('section', section);
      if (topic) query = query.eq('topic', topic);
      if (difficulty) query = query.eq('difficulty', difficulty);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: false,
    staleTime: 5 * 60 * 1000,
  });

  const startQuizSession = async () => {
    setError(null);
    setAttemptResult(null);
    setSubmitError(null);

    try {
      const res = await fetchQuestions();
      const fetchedItems = res.data || [];
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
    } catch (e) {
      setError('Failed to seed evaluation nodes. Please sync connection and retry.');
    }
  };"""

content = content.replace(logic_target, logic_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("QuizEngine.jsx updated successfully!")

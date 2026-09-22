import os
import re

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\InterviewHub\QuizEngine.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Logic using regex to handle whitespace safely
pattern = re.compile(r"api\.get\('/api/v1/hub/quiz',\s*\{\s*params:\s*\{\s*limit:\s*15,\s*\.\.\.\(section\s*&&\s*\{.*?\}\)\s*\}\)\s*\.then\(res\s*=>\s*\{.*?\}\)\s*\.catch\(\(\)\s*=>.*?\)\s*\.finally\(\(\)\s*=>.*?\);", re.DOTALL)

replacement = """
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
"""

content = re.sub(pattern, replacement, content)

# We also need to add the fetchQuestions React Query block above startQuizSession
query_block = """
  const { refetch: fetchQuestions, isFetching: loadingQuery } = useQuery({
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
"""

# Insert query block right before startQuizSession
content = content.replace("const startQuizSession = () => {", query_block + "\n  const startQuizSession = async () => {")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("QuizEngine fixed successfully!")

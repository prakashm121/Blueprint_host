import { useEffect } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing/Landing';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Dashboard from './pages/Dashboard/Dashboard';
import Onboarding from './pages/Onboarding/Onboarding';
import Planner from './pages/Planner/Planner';
import Roadmap from './pages/Roadmap/Roadmap';
import Mentor from './pages/Mentor/Mentor';
import CheckEmail from './pages/Auth/CheckEmail';
import NotFound from './pages/Misc/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import DSAEngine from './pages/InterviewHub/DSAEngine';
import DSAProblemDetail from './pages/InterviewHub/DSAProblemDetail';
import InterviewQAEngine from './pages/InterviewHub/InterviewQAEngine';
import QuizEngine from './pages/InterviewHub/QuizEngine';
import VaultDashboard from './pages/Vault/VaultDashboard';
import Profile from './pages/Profile/Profile';
import ResumeAnalyser from './pages/ResumeAnalyser/ResumeAnalyser';
import Subjects from './pages/Subjects/Subjects';

function App() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const setAuthLoading = useAuthStore((state) => state.setAuthLoading);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuth(session.user, session.access_token);
        document.cookie = `sb_access_token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`;
      } else {
        logout();
        document.cookie = 'sb_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
      setAuthLoading(false);
    }).catch(() => {
      setAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuth(session.user, session.access_token);
        document.cookie = `sb_access_token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`;
      } else {
        logout();
        document.cookie = 'sb_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth, logout]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/check-email" element={<CheckEmail />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/mentor" element={<Mentor />} />
          <Route path="/interview-hub/dsa" element={<DSAEngine />} />
          <Route path="/interview-hub/dsa/:id" element={<DSAProblemDetail />} />
          <Route path="/interview-hub/qa" element={<InterviewQAEngine />} />
          <Route path="/interview-hub/quiz" element={<QuizEngine />} />
          <Route path="/vault" element={<VaultDashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/resume-analyser" element={<ResumeAnalyser />} />
          <Route path="/subjects" element={<Subjects />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;



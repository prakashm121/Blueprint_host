import { useEffect } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

function LandingRoute() {
  const token = useAuthStore((state) => state.token);
  const isAuthLoading = useAuthStore((state) => state.isAuthLoading);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Initializing...</div>
      </div>
    );
  }

  return token ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function App() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const setAuthLoading = useAuthStore((state) => state.setAuthLoading);

  useEffect(() => {
    // Render's free tier sleeps after 15 min idle; wake the API on every visit so it's warm by the time the user needs it.
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/health`, { mode: 'no-cors' }).catch(() => {});
  }, []);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuth(session.user, session.access_token);
      } else {
        logout();
      }
      setAuthLoading(false);
    }).catch(() => {
      setAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuth(session.user, session.access_token);
      } else {
        logout();
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth, logout]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
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



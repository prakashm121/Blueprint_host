import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../api';
import Layout from './Layout';
import LoadingScreen from './LoadingScreen';

export default function ProtectedRoute() {
  const token = useAuthStore((state) => state.token);
  const isAuthLoading = useAuthStore((state) => state.isAuthLoading);
  const location = useLocation();
  const [onboardingDone, setOnboardingDone] = useState(null);

  useEffect(() => {
    if (!token) return;
    api.get('/api/v1/auth/me')
      .then((res) => setOnboardingDone(res.data.onboarding_completed))
      .catch(() => setOnboardingDone(true));
  }, [token]);

  if (isAuthLoading) {
    return (
      <LoadingScreen label="Checking your session…" />
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (onboardingDone === null) {
    return (
      <LoadingScreen label="Loading your plan…" />
    );
  }

  if (!onboardingDone && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (onboardingDone && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }

  if (location.pathname === '/onboarding') {
    return <Outlet />;
  }

  return <Layout />;
}

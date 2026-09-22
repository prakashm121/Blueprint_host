import { Navigate } from 'react-router-dom';

export default function Register() {
  // Authentication is now fully handled by Supabase Google OAuth via the Login page.
  // Registration and Login are the same flow.
  return <Navigate to="/login" replace />;
}

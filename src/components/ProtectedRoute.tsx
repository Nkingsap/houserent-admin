import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading } = useAuth();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!session || !isAdmin) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

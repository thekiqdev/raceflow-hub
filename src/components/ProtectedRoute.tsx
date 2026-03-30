import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { getDashboardRoute } from '@/lib/utils/navigation';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'organizer' | 'runner';
  redirectTo?: string;
}

/**
 * Protege rotas por autenticação e, opcionalmente, por role (Etapa 4: redirect via getDashboardRoute).
 * /admin/* → admin; /organizador/* → organizer; /corredor/* → runner.
 */
export function ProtectedRoute({ 
  children, 
  requiredRole,
  redirectTo = '/auth'
}: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Check role if required
  if (requiredRole) {
    const hasRole = user.roles?.includes(requiredRole);
    
    if (!hasRole) {
      return <Navigate to={getDashboardRoute(user)} replace />;
    }
  }

  return <>{children}</>;
}





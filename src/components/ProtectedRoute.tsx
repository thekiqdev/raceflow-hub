import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'organizer' | 'runner';
  redirectTo?: string;
}

/**
 * ProtectedRoute component
 * Protects routes that require authentication
 * Optionally checks for specific roles
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
      // Redirect to appropriate dashboard based on user's actual role
      if (user.roles?.includes('admin')) {
        return <Navigate to="/admin/dashboard" replace />;
      }
      if (user.roles?.includes('organizer')) {
        return <Navigate to="/organizer/dashboard" replace />;
      }
      return <Navigate to="/runner/dashboard" replace />;
    }
  }

  return <>{children}</>;
}





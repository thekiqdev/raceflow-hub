import { User } from '@/lib/api/auth';

/**
 * Get the appropriate dashboard route based on user roles
 * Priority: admin > organizer > runner
 */
export const getDashboardRoute = (user: User | null): string => {
  if (!user || !user.roles || user.roles.length === 0) {
    return '/runner/dashboard';
  }

  // Check roles in priority order
  if (user.roles.includes('admin')) {
    return '/admin/dashboard';
  }
  
  if (user.roles.includes('organizer')) {
    return '/organizer/dashboard';
  }
  
  // Default to runner dashboard
  return '/runner/dashboard';
};






import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthResponse, register as apiRegister, login as apiLogin, logout as apiLogout, getCurrentUser } from '@/lib/api/auth';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  register: (data: any) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user from localStorage and validate token
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token');
      const storedUser = localStorage.getItem('auth_user');

      if (token && storedUser) {
        try {
          // Validate token by fetching current user
          const response = await getCurrentUser();
          if (response.success && response.data) {
            setUser(response.data);
          } else {
            // Token invalid, clear storage
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
          }
        } catch (error) {
          console.error('Failed to validate token:', error);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
        }
      }

      setLoading(false);
    };

    initAuth();

    // Listen for logout events
    const handleLogout = () => {
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    };

    window.addEventListener('auth:logout', handleLogout);

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const register = async (data: any): Promise<boolean> => {
    try {
      const response = await apiRegister(data);
      
      if (response.success && response.data) {
        const { user: newUser, token } = response.data;
        
        // Store token and user
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(newUser));
        
        // Fetch full user data
        const userResponse = await getCurrentUser();
        if (userResponse.success && userResponse.data) {
          const fullUser = userResponse.data;
          // Ensure roles array exists and has at least 'runner'
          if (!fullUser.roles || fullUser.roles.length === 0) {
            console.warn('⚠️ User registered but no roles found, defaulting to runner');
            fullUser.roles = ['runner'];
          }
          setUser(fullUser);
          localStorage.setItem('auth_user', JSON.stringify(fullUser));
        } else {
          // Fallback: use data from registration response
          const fallbackUser = {
            id: newUser.id,
            email: newUser.email,
            email_verified: false,
            profile: newUser.profile,
            roles: newUser.roles && newUser.roles.length > 0 ? newUser.roles : ['runner'],
          };
          setUser(fallbackUser);
          localStorage.setItem('auth_user', JSON.stringify(fallbackUser));
        }

        toast.success('Registro realizado com sucesso!');
        return true;
      } else {
        toast.error(response.error || response.message || 'Erro ao registrar');
        return false;
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Erro ao registrar. Tente novamente.');
      return false;
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await apiLogin({ email, password });
      
      if (response.success && response.data) {
        const { user: loggedUser, token } = response.data;
        
        // Store token and user
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(loggedUser));
        
        // Fetch full user data
        const userResponse = await getCurrentUser();
        if (userResponse.success && userResponse.data) {
          setUser(userResponse.data);
        } else {
          setUser({
            id: loggedUser.id,
            email: loggedUser.email,
            email_verified: false,
            profile: loggedUser.profile,
            roles: loggedUser.roles,
          });
        }

        toast.success('Login realizado com sucesso!');
        return true;
      } else {
        toast.error(response.error || response.message || 'Email ou senha inválidos');
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Erro ao fazer login. Tente novamente.');
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiLogout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      toast.success('Logout realizado com sucesso!');
    }
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const response = await getCurrentUser();
      if (response.success && response.data) {
        setUser(response.data);
        localStorage.setItem('auth_user', JSON.stringify(response.data));
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
    register,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};






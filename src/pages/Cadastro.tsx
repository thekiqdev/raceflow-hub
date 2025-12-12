import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Index from "./Index";
import { MultiStepRegistration } from "@/components/MultiStepRegistration";
import { useAuth } from "@/contexts/AuthContext";

export default function Cadastro() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    // Se o usuário já estiver autenticado, redireciona para o dashboard
    if (isAuthenticated) {
      const currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
      const dashboardRoute = currentUser.roles?.includes('admin')
        ? '/admin/dashboard'
        : currentUser.roles?.includes('organizer')
        ? '/organizer/dashboard'
        : '/runner/dashboard';
      navigate(dashboardRoute);
      return;
    }

    // Abre o dialog de cadastro se houver parâmetro ref ou se a rota for /cadastro
    const ref = searchParams.get('ref');
    if (ref || window.location.pathname === '/cadastro') {
      setRegistrationOpen(true);
    }
  }, [searchParams, isAuthenticated, navigate]);

  const handleRegistrationClose = (open: boolean) => {
    setRegistrationOpen(open);
    // Se fechar sem cadastrar, redireciona para home
    if (!open) {
      navigate('/');
    }
  };

  return (
    <>
      <Index />
      <MultiStepRegistration 
        open={registrationOpen} 
        onOpenChange={handleRegistrationClose} 
      />
    </>
  );
}


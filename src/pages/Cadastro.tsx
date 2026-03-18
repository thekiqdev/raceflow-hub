import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Index from "./Index";
import { MultiStepRegistration } from "@/components/MultiStepRegistration";
import { useAuth } from "@/contexts/AuthContext";
import { getDashboardRoute } from "@/lib/utils/navigation";

export default function Cadastro() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      const currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
      navigate(getDashboardRoute(currentUser));
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


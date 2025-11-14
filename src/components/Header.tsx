import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { User, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
export function Header() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    
    if (data) {
      setUserProfile(data);
    }
  };

  return <header className="bg-black text-white py-4 sticky top-0 z-50">
      <div className="container mx-auto px-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="border-2 border-white px-4 py-2">
            <span className="text-xl font-bold">CRONOTEAM</span>
            <div className="text-xs">CRONOMETRAGEM</div>
          </div>
        </Link>
        
        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="hover:text-primary transition-colors">
            HOME
          </Link>
          <Link to="/events" className="hover:text-primary transition-colors">
            INSCRIÇÕES
          </Link>
          
          <Link to="/orcamento" className="hover:text-primary transition-colors">
            ORÇAMENTO
          </Link>
          <Link to="/faq" className="hover:text-primary transition-colors">
            DÚVIDAS
          </Link>
          <Link to="/" className="hover:text-primary transition-colors">
            RESULTADOS
          </Link>
        </nav>

        {user && userProfile ? (
          <Button 
            onClick={() => navigate("/runner/dashboard")}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
          >
            <User className="h-5 w-5" />
            {userProfile.full_name || "Perfil"}
          </Button>
        ) : (
          <Button 
            onClick={() => navigate("/auth")}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
          >
            <LogIn className="h-5 w-5" />
            Entrar
          </Button>
        )}
      </div>
    </header>;
}
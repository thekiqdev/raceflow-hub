import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { User, LogIn, FileText, Trophy, UserCircle, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
export function Header() {
  const navigate = useNavigate();
  const { toast } = useToast();
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

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Erro ao sair",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Logout realizado",
        description: "Você saiu da sua conta com sucesso.",
      });
      navigate("/");
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-white text-green-600 text-xs font-bold">
                    {userProfile.full_name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:inline">{userProfile.full_name || "Perfil"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-background z-50" align="end" sideOffset={5}>
              <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/runner/dashboard")}>
                <FileText className="mr-2 h-4 w-4" />
                <span>Minhas Inscrições</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/runner/dashboard")}>
                <Trophy className="mr-2 h-4 w-4" />
                <span>Meus Resultados</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/runner/profile")}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Meu Perfil</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
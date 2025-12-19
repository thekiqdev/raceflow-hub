import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { OrganizerSidebar } from "@/components/organizer/OrganizerSidebar";
import OrganizerDashboardOverview from "@/components/organizer/OrganizerDashboardOverview";
import OrganizerEvents from "@/components/organizer/OrganizerEvents";
import OrganizerRegistrations from "@/components/organizer/OrganizerRegistrations";
import OrganizerFinancial from "@/components/organizer/OrganizerFinancial";
import OrganizerSettings from "@/components/organizer/OrganizerSettings";
import OrganizerReports from "@/components/organizer/OrganizerReports";
import { OrganizerGroupLeaders } from "@/components/organizer/OrganizerGroupLeaders";
import { getOrganizerSettings } from "@/lib/api/organizerSettings";

const OrganizerDashboard = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [organizerName, setOrganizerName] = useState<string>("");

  useEffect(() => {
    // Escutar evento para navegar para uma seção
    const handleNavigateToSection = (event: CustomEvent) => {
      setActiveSection(event.detail);
    };

    window.addEventListener('organizer:navigate-to-section', handleNavigateToSection as EventListener);
    
    return () => {
      window.removeEventListener('organizer:navigate-to-section', handleNavigateToSection as EventListener);
    };
  }, []);

  useEffect(() => {
    const loadOrganizerName = async () => {
      try {
        const response = await getOrganizerSettings();
        if (response.success && response.data) {
          // Priorizar organization_name, depois full_name, depois email do usuário
          const name = response.data.organization_name || 
                      response.data.full_name || 
                      user?.email || 
                      "Organizador";
          setOrganizerName(name);
        } else {
          // Fallback para o nome do perfil do usuário
          const name = user?.profile?.full_name || user?.email || "Organizador";
          setOrganizerName(name);
        }
      } catch (error) {
        console.error("Erro ao carregar nome do organizador:", error);
        // Fallback para o nome do perfil do usuário
        const name = user?.profile?.full_name || user?.email || "Organizador";
        setOrganizerName(name);
      }
    };

    if (user) {
      loadOrganizerName();
    }
  }, [user]);

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <OrganizerDashboardOverview />;
      case "events":
        return <OrganizerEvents />;
      case "registrations":
        return <OrganizerRegistrations />;
      case "financial":
        return <OrganizerFinancial />;
      case "group-leaders":
        return <OrganizerGroupLeaders />;
      case "reports":
        return <OrganizerReports />;
      case "results":
        return <div className="text-center py-12 text-muted-foreground">Seção de Resultados em desenvolvimento</div>;
      case "messages":
        return <div className="text-center py-12 text-muted-foreground">Seção de Mensagens em desenvolvimento</div>;
      case "settings":
        return <OrganizerSettings />;
      default:
        return <OrganizerDashboardOverview />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background via-muted/20 to-background">
        <OrganizerSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
        
        <div className="flex-1 flex flex-col">
          <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">
                  RunEvents Organizador
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {organizerName || "Organizador"}
                </span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </Button>
              </div>
            </div>
          </nav>

          <main className="flex-1 p-8">
            {renderContent()}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default OrganizerDashboard;
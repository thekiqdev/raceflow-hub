import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LogOut } from "lucide-react";
import { OrganizerSidebar } from "@/components/organizer/OrganizerSidebar";
import OrganizerDashboardOverview from "@/components/organizer/OrganizerDashboardOverview";
import OrganizerEvents from "@/components/organizer/OrganizerEvents";
import OrganizerRegistrations from "@/components/organizer/OrganizerRegistrations";
import OrganizerFinancial from "@/components/organizer/OrganizerFinancial";
import OrganizerSettings from "@/components/organizer/OrganizerSettings";

const OrganizerDashboard = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("dashboard");

  const handleSignOut = () => {
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
      case "reports":
        return <div className="text-center py-12 text-muted-foreground">Seção de Relatórios em desenvolvimento</div>;
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
                  João Silva
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
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import DashboardOverview from "@/components/admin/DashboardOverview";
import UserManagement from "@/components/admin/UserManagement";
import EventManagement from "@/components/admin/EventManagement";
import FinancialManagement from "@/components/admin/FinancialManagement";
import AdvancedReports from "@/components/admin/AdvancedReports";
import SystemSettings from "@/components/admin/SystemSettings";
import CommunicationSupport from "@/components/admin/CommunicationSupport";
import KnowledgeBase from "@/components/admin/KnowledgeBase";
import HomeCustomization from "@/components/admin/HomeCustomization";
import TransferManagement from "@/components/admin/TransferManagement";
import { getSystemSettings } from "@/lib/api/systemSettings";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeSection, setActiveSection] = useState("overview");
  const [transfersEnabled, setTransfersEnabled] = useState(false);

  useEffect(() => {
    loadSystemSettings();
    
    // Escutar evento para navegar para uma seção
    const handleNavigateToSection = (event: CustomEvent) => {
      setActiveSection(event.detail);
    };

    // Escutar atualizações de configurações
    const handleSettingsUpdate = () => {
      loadSystemSettings();
    };

    window.addEventListener('admin:navigate-to-section', handleNavigateToSection as EventListener);
    window.addEventListener('admin-settings-updated', handleSettingsUpdate);
    
    return () => {
      window.removeEventListener('admin:navigate-to-section', handleNavigateToSection as EventListener);
      window.removeEventListener('admin-settings-updated', handleSettingsUpdate);
    };
  }, []);

  useEffect(() => {
    // Redirect if transfers section is active but module is disabled
    if (activeSection === "transfers" && !transfersEnabled) {
      setActiveSection("overview");
    }
  }, [activeSection, transfersEnabled]);

  const loadSystemSettings = async () => {
    try {
      const response = await getSystemSettings();
      if (response.success && response.data) {
        setTransfersEnabled(response.data.enabled_modules?.transfers || false);
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return <DashboardOverview />;
      case "users":
        return <UserManagement />;
      case "events":
        return <EventManagement />;
      case "financial":
        return <FinancialManagement />;
      case "reports":
        return <AdvancedReports />;
      case "knowledge":
        return <KnowledgeBase />;
      case "customize":
        return <HomeCustomization />;
      case "settings":
        return <SystemSettings />;
      case "support":
        return <CommunicationSupport />;
      case "transfers":
        return <TransferManagement />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background via-muted/20 to-background">
        <AdminSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
        
        <div className="flex-1 flex flex-col">
          <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">
                  RunEvents Admin
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Super Admin
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

export default AdminDashboard;

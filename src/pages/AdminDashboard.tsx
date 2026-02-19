import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
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
import { GroupLeadersManagement } from "@/components/admin/GroupLeadersManagement";
import QuotesManagement from "@/components/admin/QuotesManagement";
import AdminRegistrations from "@/components/admin/AdminRegistrations";
import { getSystemSettings } from "@/lib/api/systemSettings";
import { getAdminPath, getAdminSectionFromPath, getBreadcrumbForPath } from "@/lib/utils/navigation";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const location = useLocation();
  const { logout } = useAuth();
  const [transfersEnabled, setTransfersEnabled] = useState(false);

  // Sincronizar URL → activeSection: derivar da URL (pathname ou param)
  const activeSection = getAdminSectionFromPath(location.pathname);

  useEffect(() => {
    if (!sectionParam || sectionParam === "" || sectionParam === "dashboard") {
      navigate(getAdminPath("overview"), { replace: true });
    }
  }, [sectionParam, navigate]);

  useEffect(() => {
    loadSystemSettings();

    const handleNavigateToSection = (event: CustomEvent) => {
      navigate(getAdminPath(event.detail));
    };
    const handleSettingsUpdate = () => {
      loadSystemSettings();
    };

    window.addEventListener("admin:navigate-to-section", handleNavigateToSection as EventListener);
    window.addEventListener("admin-settings-updated", handleSettingsUpdate);

    return () => {
      window.removeEventListener("admin:navigate-to-section", handleNavigateToSection as EventListener);
      window.removeEventListener("admin-settings-updated", handleSettingsUpdate);
    };
  }, [navigate]);

  useEffect(() => {
    if (activeSection === "transfers" && !transfersEnabled) {
      navigate(getAdminPath("overview"), { replace: true });
    }
  }, [activeSection, transfersEnabled, navigate]);

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
      case "registrations":
        return <AdminRegistrations />;
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
      case "group-leaders":
        return <GroupLeadersManagement />;
      case "quotes":
        return <QuotesManagement />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background via-muted/20 to-background">
        <AdminSidebar activeSection={activeSection} />
        
        <div className="flex-1 flex flex-col">
          <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div className="flex flex-col gap-0.5">
                  <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">
                    Cronoteam Admin
                  </h1>
                  {(() => {
                    const breadcrumb = getBreadcrumbForPath(location.pathname);
                    return breadcrumb ? (
                      <p className="text-xs text-muted-foreground" aria-label="Navegação">
                        {breadcrumb.area} &gt; {breadcrumb.sectionLabel}
                      </p>
                    ) : null;
                  })()}
                </div>
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

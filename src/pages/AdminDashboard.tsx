import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, LayoutDashboard, Users, Calendar, DollarSign, FileText, Settings, MessageSquare } from "lucide-react";
import DashboardOverview from "@/components/admin/DashboardOverview";
import UserManagement from "@/components/admin/UserManagement";
import EventManagement from "@/components/admin/EventManagement";
import FinancialManagement from "@/components/admin/FinancialManagement";
import AdvancedReports from "@/components/admin/AdvancedReports";
import SystemSettings from "@/components/admin/SystemSettings";
import CommunicationSupport from "@/components/admin/CommunicationSupport";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const handleSignOut = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            RunEvents Admin
          </h1>
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

      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-7 w-full h-auto p-1">
            <TabsTrigger value="overview" className="flex flex-col items-center gap-1 py-3">
              <LayoutDashboard className="h-4 w-4" />
              <span className="text-xs">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex flex-col items-center gap-1 py-3">
              <Users className="h-4 w-4" />
              <span className="text-xs">Usuários</span>
            </TabsTrigger>
            <TabsTrigger value="events" className="flex flex-col items-center gap-1 py-3">
              <Calendar className="h-4 w-4" />
              <span className="text-xs">Eventos</span>
            </TabsTrigger>
            <TabsTrigger value="financial" className="flex flex-col items-center gap-1 py-3">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Financeiro</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex flex-col items-center gap-1 py-3">
              <FileText className="h-4 w-4" />
              <span className="text-xs">Relatórios</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex flex-col items-center gap-1 py-3">
              <Settings className="h-4 w-4" />
              <span className="text-xs">Configurações</span>
            </TabsTrigger>
            <TabsTrigger value="support" className="flex flex-col items-center gap-1 py-3">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs">Suporte</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <DashboardOverview />
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          <TabsContent value="events">
            <EventManagement />
          </TabsContent>

          <TabsContent value="financial">
            <FinancialManagement />
          </TabsContent>

          <TabsContent value="reports">
            <AdvancedReports />
          </TabsContent>

          <TabsContent value="settings">
            <SystemSettings />
          </TabsContent>

          <TabsContent value="support">
            <CommunicationSupport />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;

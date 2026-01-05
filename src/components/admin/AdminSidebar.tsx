import { LayoutDashboard, Users, Calendar, DollarSign, FileText, Settings, MessageSquare, Building2, Palette, ArrowRightLeft, UserCog, Calculator } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getSystemSettings } from "@/lib/api/systemSettings";
import { getNewQuotesCount } from "@/lib/api/quotes";

interface AdminSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const menuItems = [
  { id: "overview", title: "Dashboard", icon: LayoutDashboard },
  { id: "users", title: "Usuários", icon: Users },
  { id: "events", title: "Eventos", icon: Calendar },
  { id: "quotes", title: "Orçamentos", icon: Calculator, badge: true },
  { id: "financial", title: "Financeiro", icon: DollarSign },
  { id: "transfers", title: "Transferências", icon: ArrowRightLeft },
  { id: "group-leaders", title: "Líderes de Grupo", icon: UserCog },
  { id: "reports", title: "Relatórios", icon: FileText },
  { id: "knowledge", title: "Base de Conhecimento", icon: FileText },
  { id: "customize", title: "Personalizar", icon: Palette },
  { id: "settings", title: "Configurações", icon: Settings },
  { id: "support", title: "Suporte", icon: MessageSquare },
];

export function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
  const { open } = useSidebar();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [transfersEnabled, setTransfersEnabled] = useState(false);
  const [newQuotesCount, setNewQuotesCount] = useState(0);

  useEffect(() => {
    loadAdminLogo();
    loadSystemSettings();
    loadNewQuotesCount();
    
    // Listen for logo updates
    const handleLogoUpdate = () => {
      loadAdminLogo();
    };
    
    // Listen for settings updates
    const handleSettingsUpdate = () => {
      loadSystemSettings();
    };
    
    // Listen for quotes updates
    const handleQuotesUpdate = () => {
      loadNewQuotesCount();
    };
    
    window.addEventListener('admin-logo-updated', handleLogoUpdate);
    window.addEventListener('admin-settings-updated', handleSettingsUpdate);
    window.addEventListener('quotes-updated', handleQuotesUpdate);
    
    // Refresh quotes count every 30 seconds
    const interval = setInterval(loadNewQuotesCount, 30000);
    
    return () => {
      window.removeEventListener('admin-logo-updated', handleLogoUpdate);
      window.removeEventListener('admin-settings-updated', handleSettingsUpdate);
      window.removeEventListener('quotes-updated', handleQuotesUpdate);
      clearInterval(interval);
    };
  }, []);

  const loadAdminLogo = () => {
    const savedLogo = localStorage.getItem('admin-logo');
    if (savedLogo) {
      setLogoUrl(savedLogo);
    }
  };

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

  const loadNewQuotesCount = async () => {
    try {
      const response = await getNewQuotesCount();
      if (response.success && response.data) {
        setNewQuotesCount(response.data.count);
      }
    } catch (error) {
      console.error("Erro ao carregar contagem de orçamentos:", error);
    }
  };

  return (
    <Sidebar className={open ? "w-60" : "w-14"} collapsible="icon">
      <SidebarContent>
        {/* Logo Section */}
        <div className="p-4">
          <div className={`flex items-center justify-center ${open ? 'h-20' : 'h-12'} transition-all`}>
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Logo" 
                className={`object-contain ${open ? 'max-h-20 max-w-full' : 'max-h-12 max-w-12'}`}
              />
            ) : (
              <div className={`flex items-center justify-center bg-primary/10 rounded-lg ${open ? 'w-full h-20' : 'w-12 h-12'}`}>
                <Building2 className={`text-primary ${open ? 'h-10 w-10' : 'h-6 w-6'}`} />
              </div>
            )}
          </div>
        </div>
        
        <Separator className="my-2" />
        
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems
                .filter((item) => {
                  // Hide transfers menu item if module is disabled
                  if (item.id === "transfers" && !transfersEnabled) {
                    return false;
                  }
                  return true;
                })
                .map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => onSectionChange(item.id)}
                      isActive={activeSection === item.id}
                      className="hover:bg-muted/50 relative"
                    >
                      <item.icon className="h-4 w-4" />
                      {open && (
                        <>
                          <span>{item.title}</span>
                          {item.badge && newQuotesCount > 0 && (
                            <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                              {newQuotesCount > 9 ? '9+' : newQuotesCount}
                            </span>
                          )}
                        </>
                      )}
                      {!open && item.badge && newQuotesCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                          {newQuotesCount > 9 ? '9+' : newQuotesCount}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

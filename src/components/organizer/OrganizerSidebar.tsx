import { LayoutDashboard, Calendar, Users, DollarSign, FileText, MessageSquare, Settings, BarChart3, Trophy, Building2, UserCog } from "lucide-react";
import { getNewContactMessagesCount } from "@/lib/api/contactMessages";
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
import { useEffect, useState } from "react";

interface OrganizerSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const menuItems = [
  { id: "dashboard", title: "Dashboard", icon: LayoutDashboard },
  { id: "events", title: "Eventos", icon: Calendar },
  { id: "registrations", title: "Inscrições", icon: Users },
  { id: "financial", title: "Financeiro", icon: DollarSign },
  { id: "group-leaders", title: "Líderes de Grupo", icon: UserCog },
  { id: "reports", title: "Relatórios", icon: FileText },
  { id: "results", title: "Resultados", icon: Trophy },
  { id: "messages", title: "Mensagens", icon: MessageSquare, badge: true },
  { id: "settings", title: "Configurações", icon: Settings },
];

export function OrganizerSidebar({ activeSection, onSectionChange }: OrganizerSidebarProps) {
  const { open } = useSidebar();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [newMessagesCount, setNewMessagesCount] = useState(0);

  useEffect(() => {
    loadOrganizerLogo();
    loadNewMessagesCount();
    
    // Listen for logo updates
    const handleLogoUpdate = () => {
      loadOrganizerLogo();
    };
    
    // Listen for messages updates
    const handleMessagesUpdate = () => {
      loadNewMessagesCount();
    };
    
    window.addEventListener('organizer-logo-updated', handleLogoUpdate);
    window.addEventListener('contact-messages-updated', handleMessagesUpdate);
    
    // Refresh messages count every 30 seconds
    const interval = setInterval(loadNewMessagesCount, 30000);
    
    return () => {
      window.removeEventListener('organizer-logo-updated', handleLogoUpdate);
      window.removeEventListener('contact-messages-updated', handleMessagesUpdate);
      clearInterval(interval);
    };
  }, []);

  const loadOrganizerLogo = () => {
    const savedLogo = localStorage.getItem('organizer-logo');
    if (savedLogo) {
      setLogoUrl(savedLogo);
    }
  };

  const loadNewMessagesCount = async () => {
    try {
      const response = await getNewContactMessagesCount();
      if (response.success && response.data) {
        setNewMessagesCount(response.data.count);
      }
    } catch (error) {
      console.error("Erro ao carregar contagem de mensagens:", error);
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
              {menuItems.map((item) => (
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
                        {item.badge && newMessagesCount > 0 && (
                          <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                            {newMessagesCount > 9 ? '9+' : newMessagesCount}
                          </span>
                        )}
                      </>
                    )}
                    {!open && item.badge && newMessagesCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                        {newMessagesCount > 9 ? '9+' : newMessagesCount}
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

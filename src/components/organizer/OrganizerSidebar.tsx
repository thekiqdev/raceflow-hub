import { LayoutDashboard, Calendar, Users, DollarSign, FileText, MessageSquare, Settings, BarChart3, Trophy, Building2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

interface OrganizerSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const menuItems = [
  { id: "dashboard", title: "Dashboard", icon: LayoutDashboard },
  { id: "events", title: "Eventos", icon: Calendar },
  { id: "registrations", title: "Inscrições", icon: Users },
  { id: "financial", title: "Financeiro", icon: DollarSign },
  { id: "reports", title: "Relatórios", icon: FileText },
  { id: "results", title: "Resultados", icon: Trophy },
  { id: "messages", title: "Mensagens", icon: MessageSquare },
  { id: "settings", title: "Configurações", icon: Settings },
];

export function OrganizerSidebar({ activeSection, onSectionChange }: OrganizerSidebarProps) {
  const { open } = useSidebar();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadOrganizerLogo();
  }, []);

  const loadOrganizerLogo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('organizer_settings')
        .select('logo_url')
        .eq('organizer_id', user.id)
        .single();

      if (data?.logo_url) {
        setLogoUrl(data.logo_url);
      }
    } catch (error) {
      console.error('Error loading logo:', error);
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
                    className="hover:bg-muted/50"
                  >
                    <item.icon className="h-4 w-4" />
                    {open && <span>{item.title}</span>}
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

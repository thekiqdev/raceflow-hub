import { LayoutDashboard, Calendar, Users, DollarSign, FileText, MessageSquare, Settings, BarChart3, Trophy } from "lucide-react";
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

  return (
    <Sidebar className={open ? "w-60" : "w-14"} collapsible="icon">
      <SidebarContent>
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

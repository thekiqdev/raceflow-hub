import { useParams } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { OrganizerSidebar } from "@/components/organizer/OrganizerSidebar";
import { EventRegistrationsPanel } from "@/components/event-registrations/EventRegistrationsPanel";
import { useNavigate, useLocation } from "react-router-dom";
import { getOrganizerPath, getBreadcrumbForPath } from "@/lib/utils/navigation";
import { useEffect, useState } from "react";
import { getOrganizerSettings } from "@/lib/api/organizerSettings";

export default function OrganizerEventRegistrationsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const breadcrumb = getBreadcrumbForPath(location.pathname);
  const [organizerName, setOrganizerName] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await getOrganizerSettings();
        if (response.success && response.data) {
          setOrganizerName(
            response.data.organization_name || response.data.full_name || user?.email || "Organizador"
          );
        } else {
          setOrganizerName(user?.profile?.full_name || user?.email || "Organizador");
        }
      } catch {
        setOrganizerName(user?.profile?.full_name || user?.email || "Organizador");
      }
    };
    if (user) void load();
  }, [user]);

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  if (!eventId) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen min-w-0 w-full bg-gradient-to-br from-background via-muted/20 to-background">
        <OrganizerSidebar activeSection="events" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div className="flex flex-col gap-0.5">
                  <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">Cronoteam Organizador</h1>
                  {breadcrumb ? (
                    <p className="text-xs text-muted-foreground" aria-label="Navegação">
                      {breadcrumb.area} &gt; {breadcrumb.sectionLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">{organizerName || "Organizador"}</span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </Button>
              </div>
            </div>
          </nav>
          <main className="min-h-0 min-w-0 flex-1 p-8">
            <EventRegistrationsPanel eventId={eventId} rolePage="organizer" backPath={getOrganizerPath("events")} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

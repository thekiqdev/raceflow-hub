import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  User,
  CreditCard,
  Bell,
  LogOut,
  ChevronRight,
  FileText,
  Shield,
  Settings,
  Edit,
  Loader2,
  UserCog,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileEditDialog } from "./profile/ProfileEditDialog";
import { DocumentsManagement } from "./profile/DocumentsManagement";
import { PrivacySettings } from "./profile/PrivacySettings";
import { PaymentHistory } from "./profile/PaymentHistory";
import { NotificationSettings } from "./profile/NotificationSettings";
import { AccountSettings } from "./profile/AccountSettings";
import { LeaderDashboard } from "./leader/LeaderDashboard";
import { getOwnProfile, type Profile } from "@/lib/api/profiles";
import { getRunnerStats, type RunnerStats } from "@/lib/api/runnerStats";
import { getMyGroupLeader } from "@/lib/api/groupLeaders";

export function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<RunnerStats | null>(null);
  const [isLeader, setIsLeader] = useState(false);

  const [openDialogs, setOpenDialogs] = useState({
    editProfile: false,
    documents: false,
    privacy: false,
    payments: false,
    notifications: false,
    account: false,
    leaderDashboard: false,
  });

  useEffect(() => {
    if (user) {
      loadProfileData();
    }

    // Listen for profile update events
    const handleProfileUpdate = () => {
      loadProfileData();
    };

    window.addEventListener('profile:updated', handleProfileUpdate);

    return () => {
      window.removeEventListener('profile:updated', handleProfileUpdate);
    };
  }, [user]);

  const loadProfileData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [profileResponse, statsResponse, leaderResponse] = await Promise.all([
        getOwnProfile(),
        getRunnerStats(),
        getMyGroupLeader().catch(() => ({ success: false, data: null })),
      ]);

      if (profileResponse.success && profileResponse.data) {
        setProfile(profileResponse.data);
      } else {
        toast.error(profileResponse.error || "Erro ao carregar perfil");
      }

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      } else {
        toast.error(statsResponse.error || "Erro ao carregar estatísticas");
      }

      // Check if user is a leader
      if (leaderResponse.success && leaderResponse.data) {
        setIsLeader(true);
      } else {
        setIsLeader(false);
      }
    } catch (error: any) {
      console.error("Error loading profile data:", error);
      toast.error(error.message || "Erro ao carregar dados do perfil");
    } finally {
      setLoading(false);
    }
  };
  
  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  const openDialog = (dialog: keyof typeof openDialogs) => {
    setOpenDialogs({ ...openDialogs, [dialog]: true });
  };

  const closeDialog = (dialog: keyof typeof openDialogs) => {
    setOpenDialogs({ ...openDialogs, [dialog]: false });
  };

  const MenuSection = ({ title, items }: { title: string; items: Array<{ icon: any; label: string; action: () => void; badge?: string }> }) => (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3 px-4">{title}</h3>
      <Card>
        <CardContent className="p-0">
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index}>
                <button
                  onClick={item.action}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <Badge variant="secondary" className="text-xs">
                        {item.badge}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
                {index < items.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );

  if (loading) {
    return (
      <div className="pb-20">
        <div className="bg-gradient-hero p-6 pb-12">
          <h1 className="text-2xl font-bold text-white mb-6">Meu Perfil</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="pb-20">
        <div className="bg-gradient-hero p-6 pb-12">
          <h1 className="text-2xl font-bold text-white mb-6">Meu Perfil</h1>
        </div>
        <div className="px-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Erro ao carregar perfil</p>
              <Button onClick={loadProfileData} className="mt-4">
                Tentar Novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6 pb-12">
        <h1 className="text-2xl font-bold text-white mb-6">Meu Perfil</h1>
        
        {/* Profile Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {profile.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="font-semibold text-lg">{profile.full_name}</h2>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => openDialog("editProfile")}
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Inscrições</div>
                <div className="text-xl font-bold text-primary">{stats?.total_registrations || 0}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Completadas</div>
                <div className="text-xl font-bold text-secondary">{stats?.completed_races || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Menu Sections */}
      <div className="px-4 -mt-6">
        {isLeader && (
          <MenuSection
            title="Líder de Grupo"
            items={[
              {
                icon: UserCog,
                label: "Painel do Líder",
                action: () => openDialog("leaderDashboard"),
              },
            ]}
          />
        )}

        <MenuSection
          title="Dados Pessoais"
          items={[
            {
              icon: User,
              label: "Meus Dados",
              action: () => openDialog("editProfile"),
            },
            {
              icon: FileText,
              label: "Documentos",
              action: () => openDialog("documents"),
            },
            {
              icon: Shield,
              label: "Privacidade (LGPD)",
              action: () => openDialog("privacy"),
            },
          ]}
        />

        <MenuSection
          title="Financeiro"
          items={[
            {
              icon: CreditCard,
              label: "Histórico de Pagamentos",
              action: () => openDialog("payments"),
            },
          ]}
        />

        <MenuSection
          title="Configurações"
          items={[
            {
              icon: Bell,
              label: "Notificações",
              action: () => openDialog("notifications"),
            },
            {
              icon: Settings,
              label: "Configurações da Conta",
              action: () => openDialog("account"),
            },
          ]}
        />

        {/* Sign Out Button */}
        <div className="mb-6">
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair da Conta
          </Button>
        </div>

        {/* App Version */}
        <div className="text-center text-xs text-muted-foreground mb-4">
          RunEvents v1.0.0
        </div>
      </div>

      {/* Dialogs */}
      <ProfileEditDialog
        open={openDialogs.editProfile}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog("editProfile");
            loadProfileData(); // Reload profile after edit
          }
        }}
        profile={profile}
      />
      <DocumentsManagement
        open={openDialogs.documents}
        onOpenChange={(open) => !open && closeDialog("documents")}
      />
      <PrivacySettings
        open={openDialogs.privacy}
        onOpenChange={(open) => !open && closeDialog("privacy")}
      />
      <PaymentHistory
        open={openDialogs.payments}
        onOpenChange={(open) => !open && closeDialog("payments")}
      />
      <NotificationSettings
        open={openDialogs.notifications}
        onOpenChange={(open) => !open && closeDialog("notifications")}
      />
      <AccountSettings
        open={openDialogs.account}
        onOpenChange={(open) => !open && closeDialog("account")}
      />

      {/* Leader Dashboard Dialog */}
      {isLeader && (
        <Dialog open={openDialogs.leaderDashboard} onOpenChange={(open) => {
          if (!open) closeDialog("leaderDashboard");
        }}>
          <DialogContent className="max-w-full max-h-[90vh] overflow-y-auto p-0">
            <LeaderDashboard />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

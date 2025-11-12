import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Mail,
  Phone,
  Calendar,
  Edit,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  FileText,
  Shield,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function Profile() {
  const navigate = useNavigate();
  const [profile] = useState({
    full_name: "João Silva",
    email: "joao.silva@email.com",
    phone: "(11) 98765-4321",
    cpf: "123.456.789-00",
    birth_date: "1990-05-15",
    gender: "Masculino",
  });

  const handleSignOut = () => {
    toast.success("Logout realizado com sucesso!");
    navigate("/");
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
                  {profile.full_name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="font-semibold text-lg">{profile.full_name}</h2>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              </div>
              <Button variant="ghost" size="icon">
                <Edit className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Provas</div>
                <div className="text-xl font-bold text-primary">12</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Pódios</div>
                <div className="text-xl font-bold text-secondary">3</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Menu Sections */}
      <div className="px-4 -mt-6">
        <MenuSection
          title="Dados Pessoais"
          items={[
            {
              icon: User,
              label: "Meus Dados",
              action: () => toast.info("Editar dados pessoais"),
            },
            {
              icon: FileText,
              label: "Documentos",
              action: () => toast.info("Gerenciar documentos"),
            },
            {
              icon: Shield,
              label: "Privacidade (LGPD)",
              action: () => toast.info("Configurações de privacidade"),
            },
          ]}
        />

        <MenuSection
          title="Financeiro"
          items={[
            {
              icon: CreditCard,
              label: "Histórico de Pagamentos",
              action: () => toast.info("Ver pagamentos"),
            },
          ]}
        />

        <MenuSection
          title="Configurações"
          items={[
            {
              icon: Bell,
              label: "Notificações",
              action: () => toast.info("Configurar notificações"),
              badge: "3 novas",
            },
            {
              icon: HelpCircle,
              label: "Ajuda e Suporte",
              action: () => toast.info("Central de ajuda"),
            },
            {
              icon: Settings,
              label: "Configurações da Conta",
              action: () => toast.info("Configurações"),
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
    </div>
  );
}

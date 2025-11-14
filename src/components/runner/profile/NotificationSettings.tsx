import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Calendar, Trophy, Megaphone, Mail } from "lucide-react";
import { toast } from "sonner";

interface NotificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSettings({ open, onOpenChange }: NotificationSettingsProps) {
  const [settings, setSettings] = useState({
    raceReminders: true,
    resultsPublication: true,
    newRegistrations: true,
    promotions: false,
    organizerUpdates: true,
  });

  const handleToggle = (key: keyof typeof settings, checked: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: checked }));
    toast.success("Preferências de notificação atualizadas");
  };

  const notifications = [
    {
      id: "raceReminders",
      icon: Calendar,
      title: "Lembretes de Corrida",
      description: "Receba lembretes antes das suas corridas inscritas",
      value: settings.raceReminders,
    },
    {
      id: "resultsPublication",
      icon: Trophy,
      title: "Publicação de Resultados",
      description: "Seja notificado quando os resultados das suas corridas forem publicados",
      value: settings.resultsPublication,
    },
    {
      id: "newRegistrations",
      icon: Bell,
      title: "Abertura de Inscrições",
      description: "Receba avisos de inscrições abertas em corridas próximas a você",
      value: settings.newRegistrations,
    },
    {
      id: "promotions",
      icon: Megaphone,
      title: "Promoções",
      description: "Receba ofertas especiais e descontos em inscrições",
      value: settings.promotions,
    },
    {
      id: "organizerUpdates",
      icon: Mail,
      title: "Atualizações do Organizador",
      description: "Receba comunicados importantes dos organizadores das suas corridas",
      value: settings.organizerUpdates,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações de Notificações</DialogTitle>
          <DialogDescription>
            Escolha quais notificações você deseja receber
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-4">
          {notifications.map((notification) => {
            const Icon = notification.icon;
            return (
              <Card key={notification.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3 flex-1">
                      <Icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <Label
                          htmlFor={notification.id}
                          className="text-sm font-semibold cursor-pointer"
                        >
                          {notification.title}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {notification.description}
                        </p>
                      </div>
                    </div>
                    <Switch
                      id={notification.id}
                      checked={notification.value}
                      onCheckedChange={(checked) =>
                        handleToggle(notification.id as keyof typeof settings, checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

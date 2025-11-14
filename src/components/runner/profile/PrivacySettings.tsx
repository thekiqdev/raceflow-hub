import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Unlock, Info } from "lucide-react";
import { toast } from "sonner";

interface PrivacySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrivacySettings({ open, onOpenChange }: PrivacySettingsProps) {
  const [isPublicProfile, setIsPublicProfile] = useState(false);

  const handleToggle = (checked: boolean) => {
    setIsPublicProfile(checked);
    toast.success(
      checked
        ? "Perfil público: Outras pessoas podem inscrever você usando seu CPF"
        : "Perfil privado: Apenas você pode fazer inscrições"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações de Privacidade</DialogTitle>
          <DialogDescription>
            Defina quem pode fazer inscrições em provas usando seus dados
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Card className="border-2">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    {isPublicProfile ? (
                      <Unlock className="w-5 h-5 text-primary" />
                    ) : (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    )}
                    <Label htmlFor="public-profile" className="text-base font-semibold cursor-pointer">
                      Perfil Público
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isPublicProfile
                      ? "Qualquer pessoa com seu CPF pode fazer inscrições para você"
                      : "Apenas você pode fazer suas próprias inscrições"}
                  </p>
                </div>
                <Switch
                  id="public-profile"
                  checked={isPublicProfile}
                  onCheckedChange={handleToggle}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Como funciona:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>
                      <strong>Perfil Público:</strong> Útil para quando amigos ou familiares querem
                      inscrever você em corridas
                    </li>
                    <li>
                      <strong>Perfil Privado:</strong> Maior controle sobre suas inscrições e dados
                    </li>
                  </ul>
                  <p className="text-xs pt-2">
                    Você pode alterar esta configuração a qualquer momento
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Unlock, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getOwnProfile, updateOwnProfile } from "@/lib/api/profiles";
import { useAuth } from "@/contexts/AuthContext";

interface PrivacySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrivacySettings({ open, onOpenChange }: PrivacySettingsProps) {
  const { user } = useAuth();
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load current privacy setting when dialog opens
  useEffect(() => {
    if (open && user) {
      loadPrivacySetting();
    }
  }, [open, user]);

  const loadPrivacySetting = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await getOwnProfile();
      if (response.success && response.data) {
        setIsPublicProfile(response.data.is_public || false);
      }
    } catch (error) {
      console.error("Error loading privacy setting:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!user) {
      toast.error("Você precisa estar logado para alterar esta configuração");
      return;
    }

    setSaving(true);
    try {
      const response = await updateOwnProfile({ is_public: checked });
      if (response.success) {
        setIsPublicProfile(checked);
        toast.success(
          checked
            ? "Perfil público: Outras pessoas podem inscrever você usando seu CPF"
            : "Perfil privado: Apenas você pode fazer inscrições"
        );
      } else {
        toast.error(response.error || "Erro ao atualizar configuração de privacidade");
      }
    } catch (error: any) {
      console.error("Error updating privacy setting:", error);
      toast.error("Erro ao atualizar configuração de privacidade");
    } finally {
      setSaving(false);
    }
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
                  disabled={loading || saving}
                />
                {(loading || saving) && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-2" />
                )}
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

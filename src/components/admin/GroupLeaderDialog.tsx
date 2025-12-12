import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { type GroupLeader } from "@/lib/api/groupLeaders";
import { type UserWithStats } from "@/lib/api/userManagement";

interface GroupLeaderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leader: GroupLeader | null;
  availableUsers: UserWithStats[];
  onSave: (data: { user_id: string; commission_percentage?: number | null }) => void;
}

export function GroupLeaderDialog({
  open,
  onOpenChange,
  leader,
  availableUsers,
  onSave,
}: GroupLeaderDialogProps) {
  const [userId, setUserId] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (leader) {
        setUserId(leader.user_id);
        setCommissionPercentage(
          leader.commission_percentage !== null ? leader.commission_percentage.toString() : ""
        );
      } else {
        setUserId("");
        setCommissionPercentage("");
      }
    }
  }, [open, leader]);

  const handleSave = async () => {
    if (!userId) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        user_id: userId,
        commission_percentage: commissionPercentage ? parseFloat(commissionPercentage) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = availableUsers.find((u) => u.id === userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{leader ? "Editar Líder" : "Criar Novo Líder"}</DialogTitle>
          <DialogDescription>
            {leader
              ? "Atualize as informações do líder de grupo"
              : "Selecione um usuário para torná-lo líder de grupo"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="user_id">Usuário *</Label>
            <Select
              value={userId}
              onValueChange={setUserId}
              disabled={!!leader} // Não permite alterar usuário ao editar
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers
                  .filter((user) => user.profile) // Apenas usuários com perfil
                  .map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.profile?.full_name || user.email} ({user.email})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedUser && (
              <p className="text-xs text-muted-foreground">
                CPF: {selectedUser.profile?.cpf || "N/A"}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="commission_percentage">
              Percentual de Comissão (%)
            </Label>
            <Input
              id="commission_percentage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="Deixe vazio para usar percentual global"
              value={commissionPercentage}
              onChange={(e) => setCommissionPercentage(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se deixado vazio, será usado o percentual global configurado nas configurações do sistema
            </p>
          </div>

          {leader && (
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-sm font-semibold">Código de Referência</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm font-mono bg-background px-2 py-1 rounded flex-1">
                    {leader.referral_code}
                  </code>
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold">Link de Referência</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs font-mono bg-background px-2 py-1 rounded flex-1 truncate">
                    {window.location.origin}/cadastro?ref={leader.referral_code}
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !userId}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              leader ? "Salvar" : "Criar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


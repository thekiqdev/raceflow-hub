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
  onSave: (data: { user_id: string }) => void;
}

export function GroupLeaderDialog({
  open,
  onOpenChange,
  leader,
  availableUsers,
  onSave,
}: GroupLeaderDialogProps) {
  const [userId, setUserId] = useState("");
  const [referralCode, setReferralCode] = useState<string>("");
  const [codeError, setCodeError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (leader) {
        setUserId(leader.user_id);
        setReferralCode(leader.referral_code || "");
      } else {
        setUserId("");
        setReferralCode("");
      }
      setCodeError("");
    }
  }, [open, leader]);

  const validateCode = (code: string): boolean => {
    const regex = /^[A-Z]{3}[0-9]{3}$/;
    if (!code.trim()) {
      setCodeError("");
      return true; // Código vazio é válido (não será atualizado)
    }
    if (!regex.test(code.toUpperCase())) {
      setCodeError("Código deve ter formato: 3 letras maiúsculas + 3 números (ex: ABC123)");
      return false;
    }
    setCodeError("");
    return true;
  };

  const handleCodeChange = (value: string) => {
    const upperValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setReferralCode(upperValue);
    validateCode(upperValue);
  };

  const handleSave = async () => {
    if (!userId) {
      return;
    }

    // Validar código se foi alterado
    if (leader && referralCode && referralCode !== leader.referral_code) {
      if (!validateCode(referralCode)) {
        return;
      }
    }

    setSaving(true);
    try {
      const saveData: any = {
        user_id: userId,
      };
      
      // Incluir código apenas se estiver editando e o código foi alterado
      if (leader && referralCode && referralCode !== leader.referral_code) {
        saveData.referral_code = referralCode;
      }
      
      await onSave(saveData);
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
                {availableUsers.length === 0 ? (
                  <SelectItem value="no-users" disabled>
                    Nenhum runner disponível
                  </SelectItem>
                ) : (
                  availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email} ({user.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedUser && (
              <p className="text-xs text-muted-foreground">
                CPF: {selectedUser.cpf || "N/A"}
              </p>
            )}
          </div>

          {leader && (
            <>
              <div className="space-y-2">
                <Label htmlFor="referral_code">
                  Código de Referência
                </Label>
                <Input
                  id="referral_code"
                  type="text"
                  placeholder="ABC123"
                  value={referralCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  maxLength={6}
                  className={codeError ? "border-destructive" : ""}
                />
                {codeError && (
                  <p className="text-xs text-destructive">{codeError}</p>
                )}
                {!codeError && referralCode && (
                  <p className="text-xs text-muted-foreground">
                    Formato: 3 letras maiúsculas + 3 números
                  </p>
                )}
              </div>
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-sm font-semibold">Link de Referência</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs font-mono bg-background px-2 py-1 rounded flex-1 truncate">
                      {window.location.origin}/cadastro?ref={referralCode || leader.referral_code}
                    </code>
                  </div>
                </div>
              </div>
            </>
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


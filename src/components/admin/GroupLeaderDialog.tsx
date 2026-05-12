import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { type GroupLeader } from "@/lib/api/groupLeaders";
import { getAthletes, type UserWithStats } from "@/lib/api/userManagement";
import { useDebounce } from "@/hooks/useDebounce";

interface GroupLeaderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leader: GroupLeader | null;
  onSave: (data: { user_id: string }) => void;
}

export function GroupLeaderDialog({
  open,
  onOpenChange,
  leader,
  onSave,
}: GroupLeaderDialogProps) {
  const [userId, setUserId] = useState("");
  const [referralCode, setReferralCode] = useState<string>("");
  const [codeError, setCodeError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebounce(userSearch, 400);
  const [availableUsers, setAvailableUsers] = useState<UserWithStats[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);

  useEffect(() => {
    if (open) {
      if (leader) {
        setUserId(leader.user_id);
        setReferralCode(leader.referral_code || "");
        setSelectedUser({
          id: leader.user_id,
          name: leader.user_name || leader.user_email || "Usuário",
          email: leader.user_email || "",
          phone: leader.user_phone || "",
          status: leader.is_active ? "active" : "inactive",
          created_at: leader.created_at,
          cpf: leader.user_cpf || undefined,
        });
      } else {
        setUserId("");
        setReferralCode("");
        setSelectedUser(null);
      }
      setUserSearch("");
      setCodeError("");
    }
  }, [open, leader]);

  const loadAvailableUsers = useCallback(async () => {
    if (!open || leader) return;

    setLoadingUsers(true);
    try {
      const response = await getAthletes(debouncedUserSearch || undefined, {
        page: 1,
        page_size: 30,
      });
      if (response.success && response.data && "items" in response.data) {
        setAvailableUsers(response.data.items);
      } else {
        setAvailableUsers([]);
      }
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      setAvailableUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [open, leader, debouncedUserSearch]);

  useEffect(() => {
    void loadAvailableUsers();
  }, [loadAvailableUsers]);

  const validateCode = (code: string): boolean => {
    const regex = /^[A-Z]{3}[0-9]{3}$/;
    if (!code.trim()) {
      setCodeError("");
      return true;
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

  const handleSelectUser = (user: UserWithStats) => {
    setUserId(user.id);
    setSelectedUser(user);
  };

  const handleSave = async () => {
    if (!userId) {
      return;
    }

    if (leader && referralCode && referralCode !== leader.referral_code) {
      if (!validateCode(referralCode)) {
        return;
      }
    }

    setSaving(true);
    try {
      const saveData: { user_id: string; referral_code?: string } = {
        user_id: userId,
      };

      if (leader && referralCode && referralCode !== leader.referral_code) {
        saveData.referral_code = referralCode;
      }

      await onSave(saveData);
    } finally {
      setSaving(false);
    }
  };

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
            {leader ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="font-medium">{selectedUser?.name || leader.user_name || "N/A"}</div>
                <div className="text-muted-foreground">{selectedUser?.email || leader.user_email || "N/A"}</div>
                {selectedUser?.cpf && (
                  <div className="mt-1 text-xs text-muted-foreground">CPF: {selectedUser.cpf}</div>
                )}
              </div>
            ) : (
              <>
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou CPF..."
                />
                <div className="max-h-56 overflow-y-auto rounded-lg border">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : availableUsers.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum runner encontrado
                    </div>
                  ) : (
                    availableUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                          userId === user.id ? "bg-muted" : ""
                        }`}
                      >
                        <span className="font-medium">{user.name || user.email}</span>
                        <span className="text-muted-foreground">{user.email}</span>
                      </button>
                    ))
                  )}
                </div>
                {selectedUser && (
                  <p className="text-xs text-muted-foreground">
                    Selecionado: {selectedUser.name || selectedUser.email}
                    {selectedUser.cpf ? ` • CPF: ${selectedUser.cpf}` : ""}
                  </p>
                )}
              </>
            )}
          </div>

          {leader && (
            <>
              <div className="space-y-2">
                <Label htmlFor="referral_code">Código de Referência</Label>
                <Input
                  id="referral_code"
                  type="text"
                  placeholder="ABC123"
                  value={referralCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  maxLength={6}
                  className={codeError ? "border-destructive" : ""}
                />
                {codeError && <p className="text-xs text-destructive">{codeError}</p>}
                {!codeError && referralCode && (
                  <p className="text-xs text-muted-foreground">
                    Formato: 3 letras maiúsculas + 3 números
                  </p>
                )}
              </div>
              <div className="space-y-2 rounded-lg bg-muted p-4">
                <div>
                  <Label className="text-sm font-semibold">Link de Referência</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs font-mono">
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

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminTransferRegistration } from "@/lib/api/admin";
import { unmask } from "@/lib/utils/masks";

export function canAdminTransferRegistration(reg: {
  status?: string;
  payment_status?: string | null;
  transferred_to_registration_id?: string | null;
}): boolean {
  const s = reg.status || "";
  const p = reg.payment_status || "";
  if (s === "cancelled" || s === "refunded" || s === "transferred") return false;
  if (reg.transferred_to_registration_id) return false;
  if (p !== "paid") return false;
  if (p === "refunded") return false;
  return true;
}

interface TransferRegistrationAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string | null;
  /** Ex.: nome do corredor e código da inscrição */
  subtitle?: string;
  onSuccess: () => void;
}

export function TransferRegistrationAdminDialog({
  open,
  onOpenChange,
  registrationId,
  subtitle,
  onSuccess,
}: TransferRegistrationAdminDialogProps) {
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCpf("");
      setEmail("");
      setReason("");
      setConfirmed(false);
    }
  }, [open, registrationId]);

  const handleSubmit = async () => {
    if (!registrationId) return;
    const cleanCpf = unmask(cpf).replace(/\D/g, "");
    const emailTrim = email.trim().toLowerCase();
    if (cleanCpf.length !== 11 && !emailTrim) {
      toast.error("Informe o CPF (11 dígitos) ou o e-mail do novo titular");
      return;
    }
    if (!confirmed) {
      toast.error("Confirme que deseja realizar a transferência");
      return;
    }

    setSubmitting(true);
    try {
      const response = await adminTransferRegistration(registrationId, {
        cpf: cleanCpf.length === 11 ? cleanCpf : undefined,
        email: emailTrim || undefined,
        confirm: true,
        reason: reason.trim() || undefined,
      });
      if (response.success) {
        toast.success(response.message || "Inscrição transferida com sucesso");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(response.message || response.error || "Não foi possível transferir");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao transferir";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir inscrição</DialogTitle>
          <DialogDescription className="text-left space-y-1">
            <span>
              Cria uma nova inscrição confirmada/paga para o novo titular; a inscrição original permanece como
              registro transferido (mesmo atleta), vinculada à nova, sem nova cobrança nem taxa de plataforma.
            </span>
            {subtitle ? (
              <span className="block text-foreground font-medium pt-1">{subtitle}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="transfer-cpf">CPF do novo titular</Label>
            <Input
              id="transfer-cpf"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-email">E-mail do novo titular</Label>
            <Input
              id="transfer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="atleta@email.com"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Preencha CPF ou e-mail (ou ambos; busca prioriza CPF).</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-reason">Motivo (opcional)</Label>
            <Textarea
              id="transfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex.: solicitação do atleta / correção de titular"
            />
          </div>
          <div className="flex items-start gap-2 rounded-md border p-3">
            <Checkbox
              id="transfer-confirm"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            <label htmlFor="transfer-confirm" className="text-sm leading-tight cursor-pointer">
              Confirmo a transferência desta inscrição para o atleta indicado, sem gerar cobrança ou novo convite de
              líder.
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || !registrationId}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transferindo…
              </>
            ) : (
              "Transferir"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

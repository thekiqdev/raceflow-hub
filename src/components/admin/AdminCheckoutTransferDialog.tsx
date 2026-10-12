import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { unmask } from '@/lib/utils/masks';
import {
  requestCheckoutTransfer,
  decideCheckoutTransfer,
  readCheckoutTransfer,
  type CheckoutTransfer,
} from '@/lib/api/checkoutTransfers';

interface AdminCheckoutTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string | null;
  subtitle?: string;
  onSuccess: () => void;
}

/** Transferência administrativa de ingresso de compra em grupo (pedido), com aprovação sem taxa. */
export function AdminCheckoutTransferDialog({
  open,
  onOpenChange,
  registrationId,
  subtitle,
  onSuccess,
}: AdminCheckoutTransferDialogProps) {
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transfer, setTransfer] = useState<CheckoutTransfer | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setCpf('');
      setEmail('');
      setReason('');
      setConfirmed(false);
      setTransfer(null);
      setRequestKey(crypto.randomUUID());
    }
  }, [open, registrationId]);

  async function approveIfNeeded(current: CheckoutTransfer, notes?: string) {
    if (current.status === 'completed') return current;
    if (current.status !== 'pending' && current.status !== 'approved') return current;
    if (!current.new_runner_id) return current;
    const approved = await decideCheckoutTransfer(current.id, {
      status: 'approved',
      admin_notes: notes || reason.trim() || undefined,
    });
    if (!approved.success || !approved.data) {
      throw new Error(approved.error || 'Não foi possível aprovar a transferência.');
    }
    return approved.data;
  }

  const handleSubmit = async () => {
    if (!registrationId) return;
    const cleanCpf = unmask(cpf).replace(/\D/g, '');
    const emailTrim = email.trim().toLowerCase();
    if (cleanCpf.length !== 11 && !emailTrim) {
      toast.error('Informe o CPF (11 dígitos) ou o e-mail do novo titular');
      return;
    }
    if (!confirmed) {
      toast.error('Confirme que deseja realizar a transferência');
      return;
    }

    setSubmitting(true);
    try {
      const created = await requestCheckoutTransfer(registrationId, {
        request_key: requestKey,
        new_runner_cpf: cleanCpf.length === 11 ? cleanCpf : undefined,
        new_runner_email: emailTrim || undefined,
        reason: reason.trim() || undefined,
      });
      if (!created.success || !created.data) {
        throw new Error(created.error || 'Não foi possível criar a solicitação de transferência.');
      }
      let current = created.data;
      current = await approveIfNeeded(current);
      setTransfer(current);
      if (current.status === 'completed') {
        toast.success('Transferência concluída.');
        onSuccess();
        onOpenChange(false);
        return;
      }
      if (!current.new_runner_id) {
        toast.message('Solicitação registrada. O novo titular precisa completar o cadastro antes da conclusão.');
        return;
      }
      toast.message('Solicitação pendente. Atualize a situação ou aprove quando o destinatário estiver pronto.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível transferir a inscrição.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshOrApprove = async () => {
    if (!transfer?.id) return;
    setSubmitting(true);
    try {
      const refreshed = await readCheckoutTransfer(transfer.id);
      if (!refreshed.success || !refreshed.data) {
        throw new Error(refreshed.error || 'Não foi possível consultar a transferência.');
      }
      let current = refreshed.data;
      current = await approveIfNeeded(current);
      setTransfer(current);
      if (current.status === 'completed') {
        toast.success('Transferência concluída.');
        onSuccess();
        onOpenChange(false);
        return;
      }
      if (!current.new_runner_id) {
        toast.message('Aguardando o novo titular completar o cadastro.');
        return;
      }
      toast.message('Ainda pendente. Verifique elegibilidade do destinatário.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar a transferência.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transferir inscrição (compra em grupo)</DialogTitle>
          <DialogDescription>
            {subtitle || 'Informe o novo titular. A aprovação administrativa conclui sem cobrar a taxa ao comprador.'}
          </DialogDescription>
        </DialogHeader>

        {!transfer && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="admin-checkout-transfer-cpf">CPF do novo titular</Label>
              <Input
                id="admin-checkout-transfer-cpf"
                inputMode="numeric"
                maxLength={14}
                value={cpf}
                disabled={submitting}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-checkout-transfer-email">E-mail do novo titular</Label>
              <Input
                id="admin-checkout-transfer-email"
                type="email"
                value={email}
                disabled={submitting}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-checkout-transfer-reason">Motivo (opcional)</Label>
              <Textarea
                id="admin-checkout-transfer-reason"
                value={reason}
                disabled={submitting}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirmed} disabled={submitting} onCheckedChange={(v) => setConfirmed(v === true)} />
              <span>Confirmo a transferência deste ingresso do pedido para o novo titular.</span>
            </label>
          </div>
        )}

        {transfer && (
          <div className="space-y-3 py-2 text-sm">
            <p role="status">
              {transfer.status === 'completed'
                ? 'Transferência concluída.'
                : transfer.new_runner_id
                  ? 'Solicitação pronta para aprovação administrativa.'
                  : 'Aguardando o novo titular completar o cadastro com CPF/e-mail informados.'}
            </p>
            <p className="text-muted-foreground break-all">Referência: {transfer.id}</p>
            <p>Status: <strong>{transfer.status}</strong></p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {!transfer && (
            <Button className="min-h-11 w-full" disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Transferir inscrição
            </Button>
          )}
          {transfer && transfer.status !== 'completed' && (
            <Button className="min-h-11 w-full" disabled={submitting} onClick={() => void handleRefreshOrApprove()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {transfer.new_runner_id ? 'Aprovar e concluir' : 'Atualizar situação'}
            </Button>
          )}
          <Button variant="outline" className="min-h-11 w-full" disabled={submitting} onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

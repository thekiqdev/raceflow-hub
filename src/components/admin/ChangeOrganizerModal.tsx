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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeEventOrganizer } from "@/lib/api/changeEventOrganizer";
import { getOrganizers } from "@/lib/api/userManagement";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserCog, CheckCircle, AlertCircle, Info } from "lucide-react";

export interface ChangeOrganizerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: { id: string; organizer_id?: string; title: string; organizer?: string } | null;
  onSuccess?: () => void;
}

export function ChangeOrganizerModal({
  open,
  onOpenChange,
  event,
  onSuccess,
}: ChangeOrganizerModalProps) {
  const { toast } = useToast();
  const [organizers, setOrganizers] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [loadingOrganizers, setLoadingOrganizers] = useState(false);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>("");
  const [step, setStep] = useState<"select" | "dry_run_done" | "confirm" | "done">("select");
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setStep("select");
      setDryRunResult(null);
      setResult(null);
      setSelectedOrganizerId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !event) return;
    setLoadingOrganizers(true);
    getOrganizers()
      .then((res) => {
        if (res.success && res.data) {
          setOrganizers(
            res.data.map((u: any) => ({
              id: u.id,
              name: u.name || u.full_name || u.email || u.id,
              email: u.email,
            }))
          );
        }
      })
      .catch(() => {
        toast({
          title: "Erro",
          description: "Não foi possível carregar a lista de organizadores.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingOrganizers(false));
  }, [open, event, toast]);

  const handleDryRun = async () => {
    if (!event?.id || !selectedOrganizerId) return;
    setExecuting(true);
    try {
      const res = await changeEventOrganizer(event.id, selectedOrganizerId, true);
      const data = res as any;
      if (data.success !== false) {
        setDryRunResult(data);
        setStep("dry_run_done");
      } else {
        toast({
          title: "Simulação",
          description: data.message || "Nenhuma alteração seria feita (dry run).",
        });
        setDryRunResult(data);
        setStep("dry_run_done");
      }
    } catch (err: any) {
      toast({
        title: "Erro na simulação",
        description: err?.message || "Falha ao executar dry run.",
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleConfirmExecute = async () => {
    if (!event?.id || !selectedOrganizerId) return;
    setExecuting(true);
    try {
      const res = await changeEventOrganizer(event.id, selectedOrganizerId, false);
      const data = res as any;
      const payload = data?.details && data.details.status ? data.details : data;
      setResult(payload);
      setStep("done");
      if (payload.status === "success") {
        toast({ title: "Migração concluída", description: payload.message || "Organizador alterado com sucesso." });
        onSuccess?.();
      } else if (payload.status === "skipped") {
        toast({ title: "Migração não executada", description: payload.message || "Nenhuma alteração necessária." });
      } else if (payload.status === "inconsistent") {
        toast({
          title: "Verificação pós-migração falhou",
          description: payload.message || "Consulte validation_errors.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: payload.message || payload.error || data.error || "Falha na migração.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Falha ao alterar organizador.",
        variant: "destructive",
      });
      setResult({ status: "error", message: err?.message });
      setStep("done");
    } finally {
      setExecuting(false);
    }
  };

  const handleClose = () => {
    if (!executing) {
      setStep("select");
      setDryRunResult(null);
      setResult(null);
      setSelectedOrganizerId("");
      onOpenChange(false);
    }
  };

  const currentOrganizerId = event?.organizer_id || "";
  const organizersFiltered = organizers.filter((o) => o.id !== currentOrganizerId);

  const getStatusMessage = () => {
    if (!result) return null;
    switch (result.status) {
      case "success":
        return { text: "Migração concluída com sucesso.", icon: CheckCircle, variant: "success" as const };
      case "skipped":
        return { text: result.message || "Nenhuma alteração necessária (evento já do organizador ou dry run).", icon: Info, variant: "default" as const };
      case "inconsistent":
        return { text: "Migração aplicada, mas a verificação pós-migração encontrou inconsistências. Consulte os detalhes.", icon: AlertCircle, variant: "destructive" as const };
      default:
        return { text: result.message || result.error || "Ocorreu um erro.", icon: AlertCircle, variant: "destructive" as const };
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Alterar organizador do evento
          </DialogTitle>
          <DialogDescription>
            {event?.title && (
              <span className="block mt-1 font-medium text-foreground">{event.title}</span>
            )}
            Migre a propriedade do evento para outro organizador. Recomenda-se executar a simulação antes.
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <>
            <div className="space-y-2">
              <Label>Novo organizador</Label>
              <Select
                value={selectedOrganizerId}
                onValueChange={setSelectedOrganizerId}
                disabled={loadingOrganizers}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingOrganizers ? "Carregando..." : "Selecione o organizador"} />
                </SelectTrigger>
                <SelectContent>
                  {organizersFiltered.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} {org.email ? `(${org.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={executing}>
                Cancelar
              </Button>
              <Button onClick={handleDryRun} disabled={!selectedOrganizerId || executing}>
                {executing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Simular (dry run)
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "dry_run_done" && dryRunResult && (
          <>
            <div className="space-y-3 text-sm">
              <p className="font-medium">Resumo da simulação</p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                {dryRunResult.summary?.total_coupons != null && (
                  <li>Total de cupons do evento: {dryRunResult.summary.total_coupons}</li>
                )}
                {dryRunResult.summary?.exclusivos != null && (
                  <li>Cupons exclusivos (transferência): {dryRunResult.summary.exclusivos}</li>
                )}
                {dryRunResult.summary?.compartilhados != null && (
                  <li>Cupons compartilhados (duplicação): {dryRunResult.summary.compartilhados}</li>
                )}
                {dryRunResult.summary?.invitations_to_update != null && (
                  <li>Convites a reassociar: {dryRunResult.summary.invitations_to_update}</li>
                )}
                {dryRunResult.summary?.leaders_to_reuse != null && (
                  <li>Líderes já existentes na lista do novo organizador: {dryRunResult.summary.leaders_to_reuse}</li>
                )}
                {(dryRunResult.summary?.leaders_to_link ?? dryRunResult.summary?.leaders_to_create) != null && (
                  <li>Líderes a vincular (passarão a aparecer na lista): {dryRunResult.summary?.leaders_to_link ?? dryRunResult.summary?.leaders_to_create}</li>
                )}
                {(dryRunResult.summary?.leaders_mapped_to_existing ?? 0) > 0 && (
                  <li>Líderes mapeados por email/telefone (também vinculados a B): {dryRunResult.summary.leaders_mapped_to_existing}</li>
                )}
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select")} disabled={executing}>
                Voltar
              </Button>
              <Button variant="outline" onClick={handleClose} disabled={executing}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmExecute} disabled={executing}>
                {executing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmar e executar
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "done" && result && (() => {
          const statusMsg = getStatusMessage();
          const Icon = statusMsg?.icon ?? Info;
          return (
          <>
            <div className="space-y-3">
              {statusMsg && (
                <div className={`flex items-start gap-2 p-3 rounded-md ${statusMsg.variant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
                  <Icon className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{statusMsg.text}</p>
                </div>
              )}
              {result.validation_errors && (
                <div className="text-sm">
                  <p className="font-medium text-destructive">Detalhes:</p>
                  <ul className="list-disc pl-4 mt-1 text-muted-foreground">
                    {(Array.isArray(result.validation_errors)
                      ? result.validation_errors
                      : [result.validation_errors]
                    ).map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.migration_id && (
                <p className="text-xs text-muted-foreground font-mono">
                  migration_id: {result.migration_id}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Fechar</Button>
            </DialogFooter>
          </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}

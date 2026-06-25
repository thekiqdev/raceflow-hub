import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  createExternalEvent,
  updateExternalEvent,
  getExternalEvent,
} from "@/lib/api/externalEvents";
import {
  datetimeLocalToIso,
  getExternalUrlValidationState,
  toDatetimeLocalValue,
} from "@/lib/utils/externalEventForm";
import { ExternalEventBannerUploadCard } from "./ExternalEventBannerUploadCard";
import { OrganizerSearchPicker, type SelectedOrganizer } from "./OrganizerSearchPicker";
import { ExternalEventSummaryCard } from "./ExternalEventSummaryCard";
import { cn } from "@/lib/utils";

interface ExternalEventFormProps {
  mode: "create" | "edit";
  eventId?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function ExternalEventForm({ mode, eventId, onCancel, onSuccess }: ExternalEventFormProps) {
  const isEdit = mode === "edit";
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<SelectedOrganizer | null>(null);
  const [externalUrl, setExternalUrl] = useState("");

  const urlState = getExternalUrlValidationState(externalUrl);

  useEffect(() => {
    if (!isEdit || !eventId) return;

    const load = async () => {
      setLoading(true);
      try {
        const response = await getExternalEvent(eventId);
        if (!response.success || !response.data) {
          toast.error(response.error || "Erro ao carregar evento externo");
          return;
        }
        const event = response.data;
        setTitle(event.title || "");
        setEventDate(toDatetimeLocalValue(event.event_date));
        setBannerUrl(event.banner_url || null);
        setExternalUrl(event.external_url || "");
        if (event.organizer_id) {
          setOrganizer({
            id: event.organizer_id,
            name: event.organizer_name || event.organizer_id,
            email: event.organizer_contact_email || "",
            phone: event.organizer_contact_phone || "",
            organizationName: event.organizer_organization_name || null,
          });
        }
      } catch {
        toast.error("Erro ao carregar evento externo");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isEdit, eventId]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Informe o nome do evento");
      return;
    }
    if (!bannerUrl) {
      toast.error("O banner é obrigatório");
      return;
    }
    if (!eventDate) {
      toast.error("Informe a data do evento");
      return;
    }
    if (!organizer) {
      toast.error("Selecione o organizador");
      return;
    }
    if (urlState !== "valid") {
      toast.error("Informe um link externo válido");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        banner_url: bannerUrl,
        event_date: datetimeLocalToIso(eventDate),
        organizer_id: organizer.id,
        external_url: externalUrl.trim(),
      };

      const response =
        isEdit && eventId
          ? await updateExternalEvent(eventId, payload)
          : await createExternalEvent({ ...payload, status: "published" });

      if (response.success) {
        toast.success(isEdit ? "Evento externo atualizado" : "Evento externo criado com sucesso");
        onSuccess();
      } else {
        toast.error(response.message || response.error || "Erro ao salvar evento externo");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao salvar evento externo";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Evento</CardTitle>
              <CardDescription>Dados básicos exibidos na plataforma.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="external-title">Nome do Evento *</Label>
                <Input
                  id="external-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Maratona Internacional 2026"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-date">Data do Evento *</Label>
                <Input
                  id="external-date"
                  type="datetime-local"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Banner</CardTitle>
              <CardDescription>Imagem de destaque do evento na home e listagens.</CardDescription>
            </CardHeader>
            <CardContent>
              <ExternalEventBannerUploadCard value={bannerUrl} onChange={setBannerUrl} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organizador</CardTitle>
              <CardDescription>Vincule o evento ao perfil do organizador responsável.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrganizerSearchPicker value={organizer} onChange={setOrganizer} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inscrição Externa</CardTitle>
              <CardDescription>Link para onde os atletas serão direcionados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="external-url">Link Externo *</Label>
              <Input
                id="external-url"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://..."
              />
              <p className="text-sm text-muted-foreground">
                Os atletas serão direcionados para este endereço ao clicar no evento.
              </p>
              {externalUrl.trim() && (
                <div
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    urlState === "valid" ? "text-green-600" : "text-destructive"
                  )}
                >
                  {urlState === "valid" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>URL válida</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>URL inválida</span>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-1">
          <div className="xl:sticky xl:top-24">
            <ExternalEventSummaryCard
              bannerUrl={bannerUrl}
              title={title}
              eventDate={eventDate}
              organizer={organizer}
              externalUrl={externalUrl}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Salvar alterações" : "Salvar Evento Externo"}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getOrganizers } from "@/lib/api/userManagement";
import {
  createExternalEvent,
  updateExternalEvent,
  getExternalEvent,
} from "@/lib/api/externalEvents";
import type { Event } from "@/lib/api/events";
import { toDatetimeLocalValue, datetimeLocalToIso } from "@/lib/utils/externalEventForm";

type DialogMode = "create" | "edit" | "view";

interface ExternalEventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  eventId?: string | null;
  mode?: DialogMode;
}

export function ExternalEventFormDialog({
  open,
  onOpenChange,
  onSuccess,
  eventId,
  mode = "create",
}: ExternalEventFormDialogProps) {
  const readOnly = mode === "view";
  const isEdit = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [organizers, setOrganizers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [organizerSearch, setOrganizerSearch] = useState("");

  const [title, setTitle] = useState("");
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [organizerId, setOrganizerId] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [organizerLabel, setOrganizerLabel] = useState("");

  useEffect(() => {
    if (!open) return;

    const loadOrganizers = async () => {
      try {
        const response = await getOrganizers(organizerSearch || undefined);
        if (response.success && response.data) {
          setOrganizers(
            response.data.map((org) => ({
              id: org.id,
              name: org.name || org.email,
              email: org.email,
            }))
          );
        }
      } catch {
        toast.error("Erro ao carregar organizadores");
      }
    };

    if (!readOnly) {
      void loadOrganizers();
    }
  }, [open, organizerSearch, readOnly]);

  useEffect(() => {
    if (!open) return;

    if ((isEdit || readOnly) && eventId) {
      const loadEvent = async () => {
        setLoading(true);
        try {
          const response = await getExternalEvent(eventId);
          if (response.success && response.data) {
            applyEvent(response.data);
          } else {
            toast.error(response.error || "Erro ao carregar evento externo");
          }
        } catch {
          toast.error("Erro ao carregar evento externo");
        } finally {
          setLoading(false);
        }
      };
      void loadEvent();
    } else if (mode === "create") {
      resetForm();
    }
  }, [open, eventId, isEdit, readOnly, mode]);

  const applyEvent = (event: Event) => {
    setTitle(event.title || "");
    setBannerUrl(event.banner_url || null);
    setEventDate(toDatetimeLocalValue(event.event_date));
    setOrganizerId(event.organizer_id || "");
    setExternalUrl(event.external_url || "");
    setStatus(event.status === "draft" ? "draft" : "published");
    setOrganizerLabel(event.organizer_name || "");
  };

  const resetForm = () => {
    setTitle("");
    setBannerUrl(null);
    setEventDate("");
    setOrganizerId("");
    setExternalUrl("");
    setStatus("published");
    setOrganizerSearch("");
    setOrganizerLabel("");
  };

  const handleSubmit = async () => {
    if (readOnly) return;

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
    if (!organizerId) {
      toast.error("Selecione o organizador");
      return;
    }
    if (!externalUrl.trim()) {
      toast.error("Informe o link externo");
      return;
    }

    try {
      new URL(externalUrl.trim());
    } catch {
      toast.error("Link externo inválido");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        banner_url: bannerUrl,
        event_date: datetimeLocalToIso(eventDate),
        organizer_id: organizerId,
        external_url: externalUrl.trim(),
        status,
      };

      const response = isEdit && eventId
        ? await updateExternalEvent(eventId, payload)
        : await createExternalEvent(payload);

      if (response.success) {
        toast.success(isEdit ? "Evento externo atualizado" : "Evento externo criado");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(response.message || response.error || "Erro ao salvar evento externo");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar evento externo");
    } finally {
      setSaving(false);
    }
  };

  const filteredOrganizers = organizers.filter((org) => {
    if (!organizerSearch.trim()) return true;
    const q = organizerSearch.toLowerCase();
    return org.name.toLowerCase().includes(q) || org.email.toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "Evento Externo" : isEdit ? "Editar Evento Externo" : "Novo Evento Externo"}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "Visualização do evento externo vinculado ao seu perfil."
              : "Evento com inscrição em site externo — não utiliza o checkout da plataforma."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="external-event-title">Nome do Evento *</Label>
              <Input
                id="external-event-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Maratona Internacional 2026"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-2">
              <Label>Banner *</Label>
              {readOnly && bannerUrl ? (
                <img src={bannerUrl} alt={title} className="max-h-40 rounded-md border object-contain" />
              ) : (
                <FileUpload
                  type="banner"
                  inputId="external-event-banner"
                  value={bannerUrl}
                  onChange={setBannerUrl}
                  disabled={readOnly}
                  label="Imagem do banner"
                  description="JPEG, PNG, WEBP ou GIF (máx. 10MB)"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="external-event-date">Data do Evento *</Label>
              <Input
                id="external-event-date"
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="external-organizer-search">Organizador *</Label>
              {readOnly ? (
                <p className="text-sm">{organizerLabel || organizerId}</p>
              ) : (
                <>
                  <Input
                    id="external-organizer-search"
                    placeholder="Buscar organizador..."
                    value={organizerSearch}
                    onChange={(e) => setOrganizerSearch(e.target.value)}
                  />
                  <Select value={organizerId} onValueChange={setOrganizerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o organizador" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredOrganizers.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name} ({org.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="external-url">Link Externo *</Label>
              {readOnly ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline break-all"
                >
                  {externalUrl}
                </a>
              ) : (
                <Input
                  id="external-url"
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://..."
                />
              )}
            </div>

            {!readOnly && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "published")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="published">Publicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button onClick={handleSubmit} disabled={saving || loading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Salvar" : "Criar Evento Externo"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

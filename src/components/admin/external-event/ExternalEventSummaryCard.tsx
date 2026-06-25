import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, ExternalLink, ImageIcon, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SelectedOrganizer } from "./OrganizerSearchPicker";
import { getExternalUrlValidationState } from "@/lib/utils/externalEventForm";

interface ExternalEventSummaryCardProps {
  bannerUrl: string | null;
  title: string;
  eventDate: string;
  organizer: SelectedOrganizer | null;
  externalUrl: string;
  className?: string;
}

function formatEventDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
}

export function ExternalEventSummaryCard({
  bannerUrl,
  title,
  eventDate,
  organizer,
  externalUrl,
  className,
}: ExternalEventSummaryCardProps) {
  const urlState = getExternalUrlValidationState(externalUrl);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resumo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-lg border bg-muted/20 aspect-[1920/800] max-h-36">
          {bannerUrl ? (
            <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Nome</p>
            <p className="font-medium">{title.trim() || "—"}</p>
          </div>

          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Data</p>
              <p className="font-medium">{formatEventDate(eventDate)}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5">Organizador</p>
              <p className="font-medium truncate">{organizer?.name || "—"}</p>
              {organizer?.email && (
                <p className="text-xs text-muted-foreground truncate">{organizer.email}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5">Destino da inscrição</p>
              {urlState === "valid" ? (
                <p className="font-medium text-primary break-all">{externalUrl.trim()}</p>
              ) : (
                <p className="font-medium text-muted-foreground">—</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

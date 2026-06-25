import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ExternalEventForm } from "@/components/admin/external-event/ExternalEventForm";
import { getAdminPath } from "@/lib/utils/navigation";

export default function EditExternalEventPage() {
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();

  if (!eventId) {
    return null;
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
            onClick={() => navigate(getAdminPath("events"))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Editar Evento Externo</h2>
          <p className="text-muted-foreground max-w-2xl">
            Atualize as informações do evento divulgado na Cronoteam com inscrição externa.
          </p>
        </div>
      </div>

      <ExternalEventForm
        mode="edit"
        eventId={eventId}
        onCancel={() => navigate(getAdminPath("events"))}
        onSuccess={() => navigate(getAdminPath("events"))}
      />
    </div>
  );
}

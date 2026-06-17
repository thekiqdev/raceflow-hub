import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Eye, Check, CheckCircle, MessageCircle } from "lucide-react";
import type { ContactMessage } from "@/lib/api/contactMessages";
import {
  buildClientContactWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppDigits,
} from "@/lib/utils/whatsapp";

interface ContactMessageRowActionsProps {
  message: ContactMessage;
  onView: (id: string) => void;
  onMarkViewed: (id: string) => void;
  onResolve: (id: string) => void;
  updating?: boolean;
}

export function ContactMessageRowActions({
  message,
  onView,
  onMarkViewed,
  onResolve,
  updating = false,
}: ContactMessageRowActionsProps) {
  const whatsappPhone = normalizeWhatsAppDigits(message.phone || "");
  const canWhatsApp = Boolean(whatsappPhone);

  const handleWhatsApp = () => {
    if (!whatsappPhone) {
      return;
    }
    window.open(
      buildWhatsAppUrl(whatsappPhone, buildClientContactWhatsAppMessage()),
      "_blank",
      "noopener,noreferrer"
    );
  };

  const whatsappButton = (
    <Button
      variant="ghost"
      size="sm"
      className="text-green-600 hover:text-green-700 hover:bg-green-50"
      disabled={!canWhatsApp || updating}
      onClick={handleWhatsApp}
    >
      <MessageCircle className="h-4 w-4 mr-1" />
      WhatsApp
    </Button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={updating}
          onClick={() => onView(message.id)}
        >
          <Eye className="h-4 w-4 mr-1" />
          Visualizar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={updating || message.status !== "new"}
          onClick={() => onMarkViewed(message.id)}
        >
          <Check className="h-4 w-4 mr-1" />
          Lida
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={updating || message.status === "closed"}
          onClick={() => onResolve(message.id)}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Resolver
        </Button>
        {canWhatsApp ? (
          whatsappButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{whatsappButton}</span>
            </TooltipTrigger>
            <TooltipContent>Cliente não informou telefone.</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

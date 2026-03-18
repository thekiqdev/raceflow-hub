import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import {
  getRegistrationsWithMissingAttributes,
  type MissingAttributesRegistration,
} from "@/lib/api/registrations";
import { toast } from "sonner";

interface MissingAttributesAlertProps {
  onSelectClick: () => void;
}

export function MissingAttributesAlert({ onSelectClick }: MissingAttributesAlertProps) {
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<MissingAttributesRegistration[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadMissingAttributes();
  }, []);

  const loadMissingAttributes = async () => {
    try {
      setLoading(true);
      const response = await getRegistrationsWithMissingAttributes();
      console.log("🔍 MissingAttributesAlert - Response:", response);
      if (response.success && response.data) {
        console.log("🔍 MissingAttributesAlert - Registrations with missing attributes:", response.data);
        setRegistrations(response.data);
      } else {
        console.log("🔍 MissingAttributesAlert - No registrations with missing attributes");
      }
    } catch (error: any) {
      console.error("❌ Erro ao carregar inscrições com atributos pendentes:", error);
      // Não mostrar erro ao usuário, apenas não exibir o alerta
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Salvar no localStorage para não mostrar novamente nesta sessão
    localStorage.setItem("missingAttributesAlertDismissed", "true");
  };

  // Verificar se foi descartado nesta sessão
  useEffect(() => {
    const dismissedInSession = localStorage.getItem("missingAttributesAlertDismissed");
    if (dismissedInSession === "true") {
      setDismissed(true);
    }
  }, []);

  // Debug: logar estado atual
  useEffect(() => {
    console.log("🔍 MissingAttributesAlert - Estado:", {
      loading,
      registrationsCount: registrations.length,
      dismissed,
      shouldShow: !loading && registrations.length > 0 && !dismissed,
      registrations: registrations,
    });
  }, [loading, registrations, dismissed]);

  // Não exibir se estiver carregando, não houver registrações ou foi descartado
  if (loading) {
    return null; // Ainda carregando
  }

  if (dismissed) {
    console.log("🔍 MissingAttributesAlert - Não exibindo: alerta foi descartado pelo usuário");
    return null;
  }

  if (registrations.length === 0) {
    console.log("🔍 MissingAttributesAlert - Não exibindo: nenhuma inscrição com atributos pendentes encontrada");
    return null;
  }

  const totalCount = registrations.length;
  const totalProducts = registrations.reduce(
    (sum, reg) => sum + reg.products_with_missing_attributes.length,
    0
  );

  return (
    <Alert className="m-4 mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <AlertTitle className="text-yellow-800 dark:text-yellow-200">
            Seleção de Atributos Pendente
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-300 mt-1">
            Você tem {totalCount} {totalCount === 1 ? "inscrição" : "inscrições"} com {totalProducts}{" "}
            {totalProducts === 1 ? "produto" : "produtos"} que precisam de seleção de atributos (ex: tamanho).
            Complete essas informações para garantir que seu kit seja preparado corretamente.
          </AlertDescription>
          <div className="flex gap-2 mt-3">
            <Button
              onClick={onSelectClick}
              size="sm"
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Selecionar Agora
            </Button>
            <Button
              onClick={handleDismiss}
              variant="ghost"
              size="sm"
              className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900"
            >
              Lembrar Depois
            </Button>
          </div>
        </div>
        <Button
          onClick={handleDismiss}
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  );
}

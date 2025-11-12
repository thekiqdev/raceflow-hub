import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Event {
  title: string;
}

interface Props {
  event: Event;
  registrationId: string;
}

export function RegistrationSuccess({ event, registrationId }: Props) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">🎉 Inscrição Confirmada!</h2>
            <p className="text-muted-foreground">
              Sua inscrição para <strong>{event.title}</strong> foi realizada
              com sucesso!
            </p>
          </div>

          <Card className="bg-muted">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                Código da Inscrição
              </p>
              <p className="text-lg font-mono font-bold">
                {registrationId.substring(0, 8).toUpperCase()}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3 pt-4">
            <Button className="w-full" size="lg">
              <Download className="mr-2 h-4 w-4" />
              Baixar Comprovante (PDF)
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/dashboard")}
            >
              Ver Minhas Inscrições
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              <Home className="mr-2 h-4 w-4" />
              Voltar para Início
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              📧 Enviamos um e-mail de confirmação com todos os detalhes da sua
              inscrição e informações sobre a retirada do kit.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

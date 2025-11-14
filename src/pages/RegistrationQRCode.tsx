import { useParams, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Calendar, MapPin, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function RegistrationQRCode() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Mock data - will be replaced with real data from backend
  const registration = {
    id: id || "1",
    event_title: "Corrida de São Silvestre 2024",
    event_date: "2024-12-31T07:00:00Z",
    location: "São Paulo - SP",
    category: "10K - Masculino",
    bib_number: "1234",
    runner_name: "João da Silva",
    runner_cpf: "123.456.789-00",
    status: "paid",
  };

  // URL that will be encoded in QR code
  const validationUrl = `${window.location.origin}/registration/validate/${registration.id}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-hero p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-white">Minha Inscrição</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* QR Code Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center">QR Code da Inscrição</CardTitle>
            <p className="text-sm text-muted-foreground text-center">
              Apresente este código no dia do evento
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG
                value={validationUrl}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{registration.bib_number}</p>
              <p className="text-sm text-muted-foreground">Número de Peito</p>
            </div>
          </CardContent>
        </Card>

        {/* Event Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{registration.event_title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{registration.location}</span>
            </div>
            <div className="pt-3 border-t">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Categoria:</span>
                <span className="font-medium">{registration.category}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium text-green-600">Confirmada</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Runner Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Dados do Corredor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Nome:</span>
              <span className="font-medium">{registration.runner_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">CPF:</span>
              <span className="font-medium">{registration.runner_cpf}</span>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              💡 Salve uma captura de tela deste código ou mantenha este aplicativo aberto
              para apresentar no momento da retirada do kit
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

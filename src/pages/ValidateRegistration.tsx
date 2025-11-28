import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, MapPin, User, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
export default function ValidateRegistration() {
  const {
    id
  } = useParams();
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
    runner_email: "joao@email.com",
    runner_phone: "(11) 98765-4321",
    status: "paid",
    payment_status: "paid",
    total_amount: 89.90,
    kit_collected: false
  };
  const isConfirmed = registration.status === "paid" && registration.payment_status === "paid";
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-hero p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-white">Validação de Inscrição</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* Status Card */}
        <Card className={isConfirmed ? "border-green-500 bg-green-50" : "border-yellow-500 bg-yellow-50"}>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3">
              {isConfirmed ? <>
                  <CheckCircle className="h-16 w-16 text-green-600" />
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-green-800">Inscrição Confirmada</h2>
                    <p className="text-sm text-green-700 mt-1">
                      Pagamento aprovado e inscrição válida
                    </p>
                  </div>
                  <Badge className="bg-green-600 text-white text-base px-4 py-1">
                    Status: CONFIRMADA
                  </Badge>
                </> : <>
                  <AlertCircle className="h-16 w-16 text-yellow-600" />
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-yellow-800">Inscrição Pendente</h2>
                    <p className="text-sm text-yellow-700 mt-1">
                      Aguardando confirmação de pagamento
                    </p>
                  </div>
                  <Badge className="bg-yellow-600 text-white text-base px-4 py-1">
                    Status: PENDENTE
                  </Badge>
                </>}
            </div>
          </CardContent>
        </Card>

        {/* Event Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes do Evento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <h3 className="font-semibold text-primary">{registration.event_title}</h3>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                locale: ptBR
              })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{registration.location}</span>
            </div>
          </CardContent>
        </Card>

        {/* Registration Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes da Inscrição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Categoria:</span>
              <span className="font-medium">{registration.category}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-medium">R$ {registration.total_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kit Retirado:</span>
              <span className={registration.kit_collected ? "text-green-600" : "text-yellow-600"}>
                {registration.kit_collected ? "Sim" : "Não"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Runner Information */}
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
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">E-mail:</span>
              <span className="font-medium">{registration.runner_email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Telefone:</span>
              <span className="font-medium">{registration.runner_phone}</span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {isConfirmed && !registration.kit_collected && <Button className="w-full" size="lg">
            <CheckCircle className="h-5 w-5 mr-2" />
            Confirmar Retirada do Kit
          </Button>}
      </div>
    </div>;
}
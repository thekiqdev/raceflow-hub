import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, MapPin, QrCode, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Registration {
  id: string;
  event_title: string;
  event_date: string;
  location: string;
  category: string;
  bib_number: string | null;
  status: "paid" | "pending" | "cancelled";
  payment_status: "paid" | "pending";
  total_amount: number;
}

export function MyRegistrations() {
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  useEffect(() => {
    // Mock registrations data
    const mockRegistrations: Registration[] = [
      {
        id: "1",
        event_title: "Corrida de São Silvestre 2024",
        event_date: "2024-12-31T07:00:00Z",
        location: "São Paulo - SP",
        category: "10K - Masculino",
        bib_number: "1234",
        status: "paid",
        payment_status: "paid",
        total_amount: 89.90,
      },
      {
        id: "2",
        event_title: "Maratona do Rio 2025",
        event_date: "2025-06-15T06:00:00Z",
        location: "Rio de Janeiro - RJ",
        category: "5K - Masculino",
        bib_number: null,
        status: "pending",
        payment_status: "pending",
        total_amount: 120.00,
      },
    ];
    setRegistrations(mockRegistrations);
  }, []);

  const activeRegistrations = registrations.filter((r) => r.status === "paid");
  const pendingRegistrations = registrations.filter((r) => r.status === "pending");
  const cancelledRegistrations = registrations.filter((r) => r.status === "cancelled");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-accent">Confirmada</Badge>;
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return null;
    }
  };

  const RegistrationCard = ({ registration }: { registration: Registration }) => (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-semibold text-sm flex-1 pr-2">{registration.event_title}</h3>
          {getStatusBadge(registration.status)}
        </div>

        <div className="space-y-2 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            <span>{registration.location}</span>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Categoria:</span>
            <span className="font-medium">{registration.category}</span>
          </div>
          {registration.bib_number && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Número de peito:</span>
              <span className="font-semibold text-primary">{registration.bib_number}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Valor pago:</span>
            <span className="font-medium">R$ {registration.total_amount.toFixed(2)}</span>
          </div>
        </div>

        {registration.status === "paid" && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => navigate(`/registration/qrcode/${registration.id}`)}
          >
            <QrCode className="h-3 w-3 mr-1" />
            Mostrar Inscrição
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6">
        <h1 className="text-2xl font-bold text-white">Minhas Inscrições</h1>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-6">
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="active">
              Ativas ({activeRegistrations.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pendentes ({pendingRegistrations.length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              Canceladas ({cancelledRegistrations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">Nenhuma inscrição ativa</p>
                <Button>Explorar Corridas</Button>
              </div>
            ) : (
              activeRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {pendingRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Nenhuma inscrição pendente</p>
              </div>
            ) : (
              pendingRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="space-y-4">
            {cancelledRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Nenhuma inscrição cancelada</p>
              </div>
            ) : (
              cancelledRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Edit, Eye, CheckCircle, XCircle, Ban, ExternalLink, BarChart } from "lucide-react";

const EventManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");

  // Mock data
  const events = [
    { 
      id: 1, 
      title: "Corrida de São Silvestre 2024", 
      organizer: "Maria Santos", 
      date: "2024-12-31", 
      city: "São Paulo", 
      status: "ativo",
      registrations: 523,
      revenue: 128000,
      avgTicket: 245
    },
    { 
      id: 2, 
      title: "Maratona do Rio 2025", 
      organizer: "Carlos Eventos", 
      date: "2025-06-15", 
      city: "Rio de Janeiro", 
      status: "pendente",
      registrations: 0,
      revenue: 0,
      avgTicket: 0
    },
    { 
      id: 3, 
      title: "Meia Maratona de Curitiba", 
      organizer: "Maria Santos", 
      date: "2025-03-20", 
      city: "Curitiba", 
      status: "ativo",
      registrations: 287,
      revenue: 65000,
      avgTicket: 226
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ativo":
        return "default";
      case "pendente":
        return "secondary";
      case "finalizado":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão de Eventos</h2>
        <p className="text-muted-foreground">Gerenciar todos os eventos da plataforma</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>Aprovar, visualizar e gerenciar eventos</CardDescription>
          <div className="flex gap-2 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, organizador ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Organizador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Inscrições</TableHead>
                <TableHead>Faturamento</TableHead>
                <TableHead>Ticket Médio</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">{event.title}</TableCell>
                  <TableCell>{event.organizer}</TableCell>
                  <TableCell>{new Date(event.date).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{event.city}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(event.status)}>
                      {event.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{event.registrations}</TableCell>
                  <TableCell>R$ {event.revenue.toLocaleString()}</TableCell>
                  <TableCell>R$ {event.avgTicket}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {event.status === "pendente" ? (
                        <>
                          <Button size="icon" variant="ghost" title="Aprovar">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Reprovar">
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" title="Visualizar">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Estatísticas">
                            <BarChart className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Bloquear">
                            <Ban className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Ver página pública">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Relatórios rápidos */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Eventos com Mais Atletas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Corrida de São Silvestre</span>
                <span className="font-bold">523</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meia Maratona de Curitiba</span>
                <span className="font-bold">287</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Eventos com Maior Faturamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Corrida de São Silvestre</span>
                <span className="font-bold">R$ 128k</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meia Maratona de Curitiba</span>
                <span className="font-bold">R$ 65k</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Solicitações de Reembolso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Corrida de São Silvestre</span>
                <span className="font-bold text-red-500">5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meia Maratona de Curitiba</span>
                <span className="font-bold text-red-500">2</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EventManagement;

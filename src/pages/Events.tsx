import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Search, MapPin, Calendar as CalendarIcon, LogOut } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url: string | null;
}

const Events = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Mock events data for testing
    const mockEvents: Event[] = [
      {
        id: "1",
        title: "Corrida de São Silvestre 2024",
        description: "A tradicional corrida de São Silvestre que marca o fim do ano na capital paulista. 15km de pura emoção.",
        event_date: "2024-12-31T07:00:00Z",
        location: "Av. Paulista",
        city: "São Paulo",
        state: "SP",
        banner_url: null,
      },
      {
        id: "2",
        title: "Maratona do Rio 2025",
        description: "Meia maratona pelos principais pontos turísticos do Rio de Janeiro. Vista deslumbrante da cidade maravilhosa.",
        event_date: "2025-06-15T06:00:00Z",
        location: "Zona Sul",
        city: "Rio de Janeiro",
        state: "RJ",
        banner_url: null,
      },
      {
        id: "3",
        title: "Meia Maratona de Florianópolis",
        description: "Corrida à beira-mar na ilha de Florianópolis. Paisagens incríveis e clima perfeito para correr.",
        event_date: "2025-09-20T07:30:00Z",
        location: "Beira-mar Norte",
        city: "Florianópolis",
        state: "SC",
        banner_url: null,
      },
      {
        id: "4",
        title: "Circuito das Estações - Curitiba",
        description: "Corrida de 10km pelos parques mais bonitos de Curitiba. Evento para toda a família.",
        event_date: "2025-03-15T06:30:00Z",
        location: "Parque Barigui",
        city: "Curitiba",
        state: "PR",
        banner_url: null,
      },
      {
        id: "5",
        title: "Corrida do Bem - Belo Horizonte",
        description: "Corrida beneficente de 5km. Toda a arrecadação será destinada a instituições de caridade.",
        event_date: "2025-05-10T07:00:00Z",
        location: "Lagoa da Pampulha",
        city: "Belo Horizonte",
        state: "MG",
        banner_url: null,
      },
    ];
    setEvents(mockEvents);
    setLoading(false);
  }, []);

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.state.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSignOut = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1
            className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            RunEvents
          </h1>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Explorar Eventos</h2>
          <p className="text-muted-foreground mb-4">
            Encontre a próxima corrida perfeita para você
          </p>
          
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar por nome, cidade ou estado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm ? "Nenhum evento encontrado" : "Nenhum evento disponível no momento"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <Card key={event.id} className="hover:shadow-lg transition-shadow overflow-hidden">
                {event.banner_url && (
                  <div className="h-48 bg-muted overflow-hidden">
                    <img
                      src={event.banner_url}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="line-clamp-1">{event.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {event.description || "Corrida de rua"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(event.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-2 h-4 w-4" />
                    {event.city}, {event.state}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full">Ver Detalhes</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Events;
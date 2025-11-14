import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate, useParams } from "react-router-dom";
import {
  MapPin,
  Calendar,
  Clock,
  ArrowLeft,
  Users,
  Trophy,
  DollarSign,
  FileText,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";
import heroImage from "@/assets/hero-running.jpg";
import { EventResults } from "@/components/event/EventResults";
import { RegistrationFlow } from "@/components/event/RegistrationFlow";
import { FlipCountdown } from "@/components/event/FlipCountdown";
import { ContactDialog } from "@/components/event/ContactDialog";
import { CreditCard, Smartphone, Barcode, Building2, Mail, Phone } from "lucide-react";

interface EventDetail {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url: string | null;
  regulation_url: string | null;
  status: string;
}

interface Category {
  id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
}

interface Kit {
  id: string;
  name: string;
  description: string | null;
  price: number;
}

const EventDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [showBottomBar, setShowBottomBar] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBottomBar(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Mock event data
    const mockEvent: EventDetail = {
      id: id || "1",
      title: "Corrida de São Silvestre 2024",
      description:
        "A tradicional corrida de São Silvestre é um dos eventos mais esperados do ano. Venha participar desta celebração esportiva que reúne milhares de corredores de todo o Brasil.",
      event_date: "2024-12-31T07:00:00Z",
      location: "Avenida Paulista, 1000",
      city: "São Paulo",
      state: "SP",
      banner_url: null,
      regulation_url: null,
      status: "published", // Change to "finished" to show results
    };

    const mockCategories: Category[] = [
      {
        id: "1",
        name: "5K - Masculino",
        distance: "5km",
        price: 50,
        max_participants: 500,
      },
      {
        id: "2",
        name: "5K - Feminino",
        distance: "5km",
        price: 50,
        max_participants: 500,
      },
      {
        id: "3",
        name: "10K - Masculino",
        distance: "10km",
        price: 80,
        max_participants: 300,
      },
      {
        id: "4",
        name: "10K - Feminino",
        distance: "10km",
        price: 80,
        max_participants: 300,
      },
    ];

    const mockKits: Kit[] = [
      {
        id: "1",
        name: "Kit Básico",
        description: "Camiseta + Número de peito + Chip",
        price: 0,
      },
      {
        id: "2",
        name: "Kit Premium",
        description: "Camiseta + Número de peito + Chip + Boné + Mochila",
        price: 30,
      },
      {
        id: "3",
        name: "Kit VIP",
        description: "Camiseta + Número de peito + Chip + Boné + Mochila + Squeeze + Medalha especial",
        price: 60,
      },
    ];

    setEvent(mockEvent);
    setCategories(mockCategories);
    setKits(mockKits);
  }, [id]);

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-card border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">RunEvents</h1>
          </div>
          <Button className="bg-accent hover:bg-accent/90" size="sm">
            <MessageSquare className="mr-2 h-4 w-4" />
            (85) 99108-4183
          </Button>
        </div>
      </nav>

      {/* Event Banner */}
      <section className="relative h-[400px] flex items-end overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={event.banner_url || heroImage}
            alt={event.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </div>

        <div className="relative z-10 container mx-auto px-4 pb-8 text-white">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{event.title}</h1>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span>{format(new Date(event.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{format(new Date(event.event_date), "HH:mm", { locale: ptBR })}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <span>
                {event.location}, {event.city} - {event.state}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Event Content */}
      <section className="py-12 pb-28">
        {/* Results - Full Width for finished events */}
        {event.status === "finished" && (
          <div className="mb-8">
            <EventResults />
          </div>
        )}
        
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Sobre o Evento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{event.description}</p>
                </CardContent>
              </Card>

              {/* Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Categorias Disponíveis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div>
                          <h3 className="font-semibold">{category.name}</h3>
                          <p className="text-sm text-muted-foreground">Distância: {category.distance}</p>
                          {category.max_participants && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Users className="h-3 w-3" />
                              Máximo: {category.max_participants} participantes
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            R$ {category.price.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Kits */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Kits Disponíveis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    {kits.map((kit) => (
                      <Card key={kit.id} className="border-2 hover:border-primary transition-colors">
                        <CardHeader>
                          <CardTitle className="text-lg">{kit.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground mb-4">{kit.description}</p>
                          <p className="text-2xl font-bold text-primary">
                            {kit.price === 0 ? "Incluído" : `+ R$ ${kit.price.toFixed(2)}`}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Regulation */}
              {event.regulation_url && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Regulamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full" asChild>
                      <a href={event.regulation_url} target="_blank" rel="noopener noreferrer">
                        Baixar Regulamento (PDF)
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Registration Card - Hide for finished events */}
              {event.status !== "finished" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Inscreva-se</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">A partir de:</p>
                      <p className="text-3xl font-bold text-primary">
                        R$ {Math.min(...categories.map((c) => c.price)).toFixed(2)}
                      </p>
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => setIsRegistrationOpen(true)}
                    >
                      Fazer Inscrição
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Você será direcionado para fazer login ou criar uma conta
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Countdown Timer */}
              {event.status !== "finished" && (
                <FlipCountdown targetDate={event.event_date} />
              )}

              {/* Payment Methods */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Formas de Pagamento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <span className="text-sm">Cartão de Crédito</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Smartphone className="h-5 w-5 text-primary" />
                    <span className="text-sm">PIX</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Barcode className="h-5 w-5 text-primary" />
                    <span className="text-sm">Boleto Bancário</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
                    Parcele em até 12x no cartão de crédito
                  </p>
                </CardContent>
              </Card>

              {/* Organizer Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Organizador
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">RunEvents Organizadora</h4>
                      <p className="text-xs text-muted-foreground">Eventos Esportivos</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">contato@runevents.com</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">(85) 99108-4183</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t">
                    Organizamos eventos esportivos há mais de 10 anos, com foco em proporcionar experiências únicas para corredores de todos os níveis.
                  </p>
                </CardContent>
              </Card>

              {/* Contact Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dúvidas sobre o evento?</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    size="sm"
                    onClick={() => setIsContactOpen(true)}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Entrar em Contato
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Registration Flow Dialog */}
      <RegistrationFlow
        open={isRegistrationOpen}
        onOpenChange={setIsRegistrationOpen}
        event={{
          id: event.id,
          title: event.title,
          event_date: event.event_date,
          location: event.location,
          city: event.city,
          state: event.state,
        }}
        categories={categories}
        kits={kits}
      />

      {/* Bottom Bar - Shows on scroll */}
      {event.status !== "finished" && (
        <div
          className={`fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg z-50 transition-transform duration-300 ${
            showBottomBar ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">A partir de:</p>
                <p className="text-2xl font-bold text-primary">
                  R$ {Math.min(...categories.map((c) => c.price)).toFixed(2)}
                </p>
              </div>
              <Button
                size="lg"
                onClick={() => setIsRegistrationOpen(true)}
                className="px-8"
              >
                Inscreva-se Agora
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Contact Dialog */}
      <ContactDialog 
        open={isContactOpen} 
        onOpenChange={setIsContactOpen}
        eventTitle={event?.title}
      />
    </div>
  );
};

export default EventDetails;

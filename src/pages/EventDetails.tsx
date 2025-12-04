import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { CreditCard, Smartphone, Barcode, Building2, Mail, Phone, Loader2 } from "lucide-react";
import { getEventById } from "@/lib/api/events";
import { getEventCategories } from "@/lib/api/eventCategories";
import { getEventKits } from "@/lib/api/eventKits";
import { getEventPickupLocations } from "@/lib/api/kitPickup";
import { toast } from "sonner";

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
  result_url: string | null;
  status: string;
  organizer_name?: string;
  organizer_logo_url?: string;
  organizer_organization_name?: string;
  organizer_contact_email?: string;
  organizer_contact_phone?: string;
  organizer_website_url?: string;
  organizer_bio?: string;
}

interface Category {
  id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
  batches?: Array<{
    id: string;
    category_id: string;
    price: number;
    valid_from: string;
  }>;
}

interface Kit {
  id: string;
  name: string;
  description: string | null;
  price: number;
  products?: Array<{
    id: string;
    kit_id: string;
    name: string;
    description: string | null;
    type: 'variable' | 'unique';
    image_url: string | null;
    variants?: Array<{
      id: string;
      product_id: string;
      name: string;
    }>;
  }>;
}

// Helper function to format price
const formatPrice = (price: number): string => {
  if (price === 0) return "Grátis";
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
};

const EventDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [pickupLocations, setPickupLocations] = useState<any[]>([]);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [showBottomBar, setShowBottomBar] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [organizerLogoError, setOrganizerLogoError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setShowBottomBar(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const loadEventData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setOrganizerLogoError(false); // Reset logo error when loading new event
        const [eventResponse, categoriesResponse, kitsResponse] = await Promise.all([
          getEventById(id),
          getEventCategories(id),
          getEventKits(id),
          getEventPickupLocations(id).catch(() => ({ success: true, data: [] })),
        ]);

        if (eventResponse.success && eventResponse.data) {
          setEvent({
            id: eventResponse.data.id,
            title: eventResponse.data.title,
            description: eventResponse.data.description || "",
            event_date: eventResponse.data.event_date,
            location: eventResponse.data.location,
            city: eventResponse.data.city,
            state: eventResponse.data.state,
            banner_url: eventResponse.data.banner_url || null,
            regulation_url: eventResponse.data.regulation_url || null,
            result_url: eventResponse.data.result_url || null,
            status: eventResponse.data.status || "published",
            organizer_name: eventResponse.data.organizer_name,
            organizer_logo_url: eventResponse.data.organizer_logo_url,
            organizer_organization_name: eventResponse.data.organizer_organization_name,
            organizer_contact_email: eventResponse.data.organizer_contact_email,
            organizer_contact_phone: eventResponse.data.organizer_contact_phone,
            organizer_website_url: eventResponse.data.organizer_website_url,
            organizer_bio: eventResponse.data.organizer_bio,
          });
        } else {
          toast.error(eventResponse.error || "Erro ao carregar evento");
        }

        console.log('📋 categoriesResponse completo:', {
          success: categoriesResponse.success,
          data: categoriesResponse.data,
          error: categoriesResponse.error,
          message: categoriesResponse.message,
        });

        if (categoriesResponse.success && categoriesResponse.data) {
          console.log('📋 Categories loaded:', categoriesResponse.data);
          setCategories(categoriesResponse.data);
          if (categoriesResponse.data.length === 0) {
            console.warn('⚠️ No categories found for event:', id);
            console.warn('⚠️ Verifique se o evento tem categorias cadastradas no banco de dados');
          }
        } else {
          console.error('❌ Error loading categories:', categoriesResponse.error);
          console.error('❌ Full response:', categoriesResponse);
          toast.error(categoriesResponse.error || "Erro ao carregar categorias");
          setCategories([]);
        }

        if (kitsResponse.success && kitsResponse.data) {
          setKits(kitsResponse.data);
        } else {
          toast.error(kitsResponse.error || "Erro ao carregar kits");
        }

        // Load pickup locations (optional, don't fail if endpoint doesn't exist)
        try {
          const pickupResponse = await getEventPickupLocations(id);
          if (pickupResponse.success && pickupResponse.data) {
            setPickupLocations(pickupResponse.data);
          }
        } catch (pickupError) {
          // Silently fail if pickup locations endpoint doesn't exist or has no data
          console.log("No pickup locations available");
        }
      } catch (error: any) {
        console.error("Error loading event data:", error);
        toast.error(error.message || "Erro ao carregar dados do evento");
      } finally {
        setLoading(false);
      }
    };

    loadEventData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Evento não encontrado</p>
            <Button onClick={() => navigate("/")}>Voltar</Button>
          </CardContent>
        </Card>
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
            onError={(e) => {
              // Fallback para imagem padrão se banner falhar ao carregar
              const target = e.target as HTMLImageElement;
              if (target.src !== heroImage) {
                target.src = heroImage;
              }
            }}
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
                {event.location ? `${event.location}, ` : ''}{event.city} - {event.state}
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
          {/* Event Status Badge */}
          <div className="mb-6 flex items-center gap-2">
            {event.status === "published" && (
              <Badge variant="default" className="text-sm">
                Evento Publicado
              </Badge>
            )}
            {event.status === "draft" && (
              <Badge variant="secondary" className="text-sm">
                Rascunho
              </Badge>
            )}
            {event.status === "ongoing" && (
              <Badge variant="default" className="text-sm bg-green-600">
                Em Andamento
              </Badge>
            )}
            {event.status === "finished" && (
              <Badge variant="outline" className="text-sm">
                Finalizado
              </Badge>
            )}
            {event.status === "cancelled" && (
              <Badge variant="destructive" className="text-sm">
                Cancelado
              </Badge>
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Event Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Informações do Evento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Data do Evento</p>
                      <p className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(event.event_date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Horário de Largada</p>
                      <p className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {format(new Date(event.event_date), "HH:mm", { locale: ptBR })}h
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Localização</p>
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {event.location ? (
                        <>
                          {event.location}, {event.city} - {event.state}
                        </>
                      ) : (
                        <>
                          {event.city} - {event.state}
                        </>
                      )}
                    </p>
                    {event.location && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.location}, ${event.city}, ${event.state}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm mt-1 inline-flex items-center gap-1"
                      >
                        <MapPin className="h-3 w-3" />
                        Ver no Google Maps
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Sobre o Evento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {event.description ? (
                    <div 
                      className="text-muted-foreground leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: event.description.replace(/\n/g, '<br />') }}
                    />
                  ) : (
                    <p className="text-muted-foreground italic">Nenhuma descrição disponível para este evento.</p>
                  )}
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
                    {categories.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        Nenhuma categoria disponível para este evento.
                      </p>
                    ) : (
                      categories.map((category) => {
                        const isFull = category.max_participants !== null && 
                                      category.available_spots !== null && 
                                      category.available_spots <= 0;
                        const isAlmostFull = category.max_participants !== null && 
                                           category.available_spots !== null && 
                                           category.available_spots > 0 && 
                                           category.available_spots <= 5;

                        return (
                          <div
                            key={category.id}
                            className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                              isFull ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{category.name}</h3>
                                {isFull && (
                                  <Badge variant="destructive" className="text-xs">Esgotada</Badge>
                                )}
                                {isAlmostFull && !isFull && (
                                  <Badge variant="secondary" className="text-xs">Últimas vagas</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">Distância: {category.distance}</p>
                              {category.max_participants !== null && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <Users className="h-3 w-3" />
                                  {category.current_registrations !== undefined && category.available_spots !== null ? (
                                    <>
                                      {category.current_registrations} / {category.max_participants} inscritos
                                      {category.available_spots > 0 && (
                                        <span className="text-primary font-medium ml-1">
                                          ({category.available_spots} vagas disponíveis)
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    `Máximo: ${category.max_participants} participantes`
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-2xl font-bold text-primary">
                                {formatPrice(category.price)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
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
                  {kits.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Nenhum kit disponível para este evento.
                    </p>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-4">
                      {kits.map((kit) => (
                        <Card key={kit.id} className="border-2 hover:border-primary transition-colors">
                          <CardHeader>
                            <CardTitle className="text-lg">{kit.name}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            {kit.description && (
                              <p className="text-sm text-muted-foreground mb-4">{kit.description}</p>
                            )}
                            <p className="text-2xl font-bold text-primary">
                              {kit.price === 0 ? "Incluído" : `+ ${formatPrice(kit.price)}`}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Kit Pickup Locations */}
              {pickupLocations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Locais de Retirada dos Kits
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {pickupLocations.map((location) => (
                        <div key={location.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-semibold mb-2">{location.address}</p>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>
                                    {format(new Date(location.pickup_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                                  </span>
                                </div>
                              </div>
                              {location.latitude && location.longitude && (
                                <a
                                  href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-sm mt-2 inline-flex items-center gap-1"
                                >
                                  <MapPin className="h-3 w-3" />
                                  Ver no mapa
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

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
                        <FileText className="mr-2 h-4 w-4" />
                        Baixar Regulamento
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Results - Show when event is finished */}
              {event.status === "finished" && event.result_url && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Resultados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full" asChild>
                      <a href={event.result_url} target="_blank" rel="noopener noreferrer">
                        <Trophy className="mr-2 h-4 w-4" />
                        Ver Resultados
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Registration Card - Hide for finished/cancelled events */}
              {(() => {
                const eventDate = new Date(event.event_date);
                const now = new Date();
                const isPastEvent = eventDate < now;
                const canRegister = event.status === "published" || event.status === "ongoing";
                const isDisabled = event.status === "draft" || event.status === "finished" || event.status === "cancelled" || isPastEvent || !canRegister;

                // ETAPA 7.4: Improved conditional display based on status
                if (event.status === "finished" || event.status === "cancelled") {
                  return (
                    <Card className={event.status === "cancelled" ? "border-destructive" : ""}>
                      <CardHeader>
                        <CardTitle>
                          {event.status === "cancelled" ? "Evento Cancelado" : "Inscrições Encerradas"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                          {event.status === "cancelled" 
                            ? "Este evento foi cancelado. Entre em contato com o organizador para mais informações."
                            : "Este evento já foi realizado. As inscrições estão encerradas."}
                        </p>
                      </CardContent>
                    </Card>
                  );
                }

                return (
                  <Card>
                    <CardHeader>
                      <CardTitle>Inscreva-se</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">A partir de:</p>
                        <p className="text-3xl font-bold text-primary">
                          {categories.length > 0 ? (
                            formatPrice(Math.min(...categories.map((c) => c.price)))
                          ) : (
                            'Grátis'
                          )}
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => setIsRegistrationOpen(true)}
                        disabled={isDisabled}
                      >
                        {isDisabled ? (
                          event.status === "draft" ? "Inscrições Indisponíveis" :
                          event.status === "finished" ? "Inscrições Encerradas" :
                          isPastEvent ? "Evento Já Realizado" :
                          "Inscrições Indisponíveis"
                        ) : (
                          "Fazer Inscrição"
                        )}
                      </Button>
                      {event.status === "draft" && (
                        <p className="text-xs text-center text-muted-foreground">
                          Este evento ainda está em rascunho. As inscrições serão abertas quando o evento for publicado.
                        </p>
                      )}
                      {event.status === "finished" && (
                        <p className="text-xs text-center text-muted-foreground">
                          Este evento já foi finalizado. As inscrições estão encerradas.
                        </p>
                      )}
                      {isPastEvent && event.status !== "finished" && (
                        <p className="text-xs text-center text-muted-foreground">
                          Este evento já foi realizado. Não é mais possível se inscrever.
                        </p>
                      )}
                      {!isDisabled && !isPastEvent && event.status !== "finished" && (
                        <p className="text-xs text-center text-muted-foreground">
                          Você será direcionado para fazer login ou criar uma conta
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Event Cancelled Message */}
              {event.status === "cancelled" && (
                <Card className="border-destructive">
                  <CardContent className="pt-6 text-center">
                    <p className="text-destructive font-semibold mb-2">Evento Cancelado</p>
                    <p className="text-sm text-muted-foreground">
                      Este evento foi cancelado. Entre em contato com o organizador para mais informações.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Countdown Timer - Only for upcoming events */}
              {event.status !== "finished" && event.status !== "cancelled" && new Date(event.event_date) > new Date() && (
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
                    {event.organizer_logo_url && !organizerLogoError ? (
                      <img
                        src={event.organizer_logo_url}
                        alt={event.organizer_organization_name || event.organizer_name || "Organizador"}
                        className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
                        onError={() => setOrganizerLogoError(true)}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-semibold">
                        {event.organizer_organization_name || event.organizer_name || "Organizador"}
                      </h4>
                      {event.organizer_organization_name && event.organizer_name && (
                        <p className="text-xs text-muted-foreground">{event.organizer_name}</p>
                      )}
                    </div>
                  </div>
                  
                  {event.organizer_bio && (
                    <p className="text-sm text-muted-foreground">{event.organizer_bio}</p>
                  )}
                  
                  <div className="space-y-2 pt-2 border-t">
                    {event.organizer_contact_email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`mailto:${event.organizer_contact_email}`}
                          className="text-primary hover:underline"
                        >
                          {event.organizer_contact_email}
                        </a>
                      </div>
                    )}
                    {event.organizer_contact_phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`tel:${event.organizer_contact_phone.replace(/[^\d]/g, '')}`}
                          className="text-primary hover:underline"
                        >
                          {event.organizer_contact_phone}
                        </a>
                      </div>
                    )}
                    {event.organizer_website_url && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={event.organizer_website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Website
                        </a>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      className="w-full mt-3"
                      onClick={() => setIsContactOpen(true)}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Entrar em Contato
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Results Card - Show when result_url exists */}
              {event.result_url && (
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-primary" />
                      Resultados Disponíveis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full" 
                      size="lg"
                      asChild
                    >
                      <a href={event.result_url} target="_blank" rel="noopener noreferrer">
                        <Trophy className="mr-2 h-4 w-4" />
                        Ver Resultados
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}

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
      {event && (
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
            status: event.status,
          }}
          categories={categories}
          kits={kits}
        />
      )}

      {/* Bottom Bar - Shows on scroll - ETAPA 7.4: Improved conditional display */}
      {(() => {
        const eventDate = new Date(event.event_date);
        const now = new Date();
        const isPastEvent = eventDate < now;
        const canRegister = (event.status === "published" || event.status === "ongoing") && !isPastEvent;
        
        if (event.status === "finished" || event.status === "cancelled" || event.status === "draft" || !canRegister) {
          return null;
        }

        return (
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
                    {categories.length > 0 ? (
                      formatPrice(Math.min(...categories.map((c) => c.price)))
                    ) : (
                      'Grátis'
                    )}
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
        );
      })()}
      
      {/* Contact Dialog */}
      <ContactDialog 
        open={isContactOpen} 
        onOpenChange={setIsContactOpen}
        eventTitle={event?.title}
        organizerEmail={event?.organizer_contact_email}
        organizerName={event?.organizer_organization_name || event?.organizer_name}
      />
    </div>
  );
};

export default EventDetails;

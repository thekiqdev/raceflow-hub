import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  MapPin,
  Calendar,
  Clock,
  Users,
  Trophy,
  DollarSign,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from "lucide-react";
import { Header } from "@/components/Header";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateOnlyBrasilia, formatTimeBrasilia, formatDateBrasilia } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import heroImage from "@/assets/hero-running.jpg";
import { RegistrationFlow } from "@/components/event/RegistrationFlow";
import { FlipCountdown } from "@/components/event/FlipCountdown";
import { ContactDialog } from "@/components/event/ContactDialog";
import { CreditCard, Smartphone, Building2, Mail, Phone, Loader2 } from "lucide-react";
import { getEventById } from "@/lib/api/events";
import { getCategories } from "@/lib/api/categories";
import { getEventKits } from "@/lib/api/eventKits";
import { getEventPickupLocations } from "@/lib/api/kitPickup";
import { getModalities, Modality } from "@/lib/api/modalities";
import { toast } from "sonner";
import { getEffectiveRegistrationStatus, getRegistrationStatusMessage, getRegistrationStatusLabel, getRegistrationStatusVariant } from "@/lib/utils/eventRegistration";
import { sanitizeHtml } from "@/lib/utils/sanitizeHtml";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveReferralCoupon } from "@/lib/referralCouponCache";

interface EventDetail {
  id: string;
  slug: string;
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
  registration_status?: 'not_open' | 'open' | 'closed' | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
  pix_enabled?: boolean | null;
  pix_disabled_at?: string | null;
  credit_card_enabled?: boolean | null;
  credit_card_disabled_at?: string | null;
  organizer_name?: string;
  organizer_logo_url?: string;
  organizer_organization_name?: string;
  organizer_contact_email?: string;
  organizer_contact_phone?: string;
  organizer_website_url?: string;
  organizer_bio?: string;
  premiacao?: string | null;
  cronograma?: string | null;
  cronograma_items?: Array<{ id: string; time: string; title: string; description: string | null; display_order: number }>;
}

interface CategoryBatch {
  id: string;
  category_id: string;
  name?: string | null;
  price: number;
  valid_from: string | null;
  valid_to?: string | null;
  created_at?: string | null;
}

interface CategoryCustomField {
  id: string;
  label: string;
  field_type: "text" | "number";
  display_order?: number;
}

interface Category {
  id: string;
  name: string;
  price: number;
  category_type: string;
  gender: string;
  min_age: number | null;
  max_participants: number | null;
  is_default: boolean;
  modality_ids?: string[];
  batches?: CategoryBatch[];
  custom_fields?: CategoryCustomField[];
}

interface Kit {
  id: string;
  name: string;
  description: string | null;
  price: number;
  /** Quando vazio/ausente, o kit não é exibido na página pública (desvinculado de categorias). */
  category_ids?: string[];
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
  if (price === 0) return ""; // Retorna espaço em branco ao invés de "Grátis"
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
};

// Função para formatar data usando UTC para evitar problemas de timezone
const formatDateUTC = (dateString: string | null | undefined): string => {
  if (!dateString) return "";
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    
    // Usa métodos UTC para preservar a data exata que foi salva
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
};

const EventDetails = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id, slug } = useParams();
  // Usar slug se disponível, caso contrário usar id (compatibilidade com UUID)
  const eventIdOrSlug = slug || id;
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [pickupLocations, setPickupLocations] = useState<any[]>([]);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showBottomBar, setShowBottomBar] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [organizerLogoError, setOrganizerLogoError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedRouteImage, setSelectedRouteImage] = useState<string | null>(null);
  const [selectedModalityName, setSelectedModalityName] = useState<string>("");

  useEffect(() => {
    const handleScroll = () => {
      setShowBottomBar(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const loadEventData = async () => {
      if (!eventIdOrSlug) return;

      try {
        setLoading(true);
        setOrganizerLogoError(false); // Reset logo error when loading new event
        const [eventResponse, categoriesResponse, kitsResponse, modalitiesResponse, pickupResponse] = await Promise.all([
          getEventById(eventIdOrSlug),
          getCategories(eventIdOrSlug),
          getEventKits(eventIdOrSlug),
          getModalities(eventIdOrSlug).catch(() => ({ success: true, data: [] })),
          getEventPickupLocations(eventIdOrSlug).catch(() => ({ success: true, data: [] })),
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
            registration_status: eventResponse.data.registration_status || null,
            registration_start_date: eventResponse.data.registration_start_date || null,
            registration_end_date: eventResponse.data.registration_end_date || null,
            registration_auto_mode: eventResponse.data.registration_auto_mode || false,
            pix_enabled: eventResponse.data.pix_enabled !== null && eventResponse.data.pix_enabled !== undefined ? eventResponse.data.pix_enabled : null,
            pix_disabled_at: eventResponse.data.pix_disabled_at || null,
            credit_card_enabled: eventResponse.data.credit_card_enabled !== null && eventResponse.data.credit_card_enabled !== undefined ? eventResponse.data.credit_card_enabled : null,
            credit_card_disabled_at: eventResponse.data.credit_card_disabled_at || null,
            organizer_name: eventResponse.data.organizer_name,
            organizer_logo_url: eventResponse.data.organizer_logo_url,
            organizer_organization_name: eventResponse.data.organizer_organization_name,
            organizer_contact_email: eventResponse.data.organizer_contact_email,
            organizer_contact_phone: eventResponse.data.organizer_contact_phone,
            organizer_website_url: eventResponse.data.organizer_website_url,
            organizer_bio: eventResponse.data.organizer_bio,
            premiacao: eventResponse.data.premiacao ?? null,
            cronograma: eventResponse.data.cronograma ?? null,
            cronograma_items: eventResponse.data.cronograma_items ?? undefined,
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
            console.warn('⚠️ No categories found for event:', eventIdOrSlug);
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

        if (modalitiesResponse.success && modalitiesResponse.data) {
          // Ordenar modalidades por display_order
          const sortedModalities = [...modalitiesResponse.data].sort((a, b) => a.display_order - b.display_order);
          setModalities(sortedModalities);
        } else {
          setModalities([]);
        }

        if (pickupResponse.success && pickupResponse.data) {
          setPickupLocations(pickupResponse.data);
        } else {
          setPickupLocations([]);
        }
      } catch (error: any) {
        console.error("Error loading event data:", error);
        toast.error(error.message || "Erro ao carregar dados do evento");
      } finally {
        setLoading(false);
      }
    };

    loadEventData();
  }, [eventIdOrSlug]);

  /** Categorias que aparecem na página (com ao menos uma modalidade), alinhado ao bloco "Categorias Disponíveis". */
  const publicCategoryIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const c of categories) {
      if (Array.isArray(c.modality_ids) && c.modality_ids.length > 0) {
        ids.add(c.id);
      }
    }
    return ids;
  }, [categories]);

  /** Kits só na vitrine pública se estiverem vinculados a alguma dessas categorias. */
  const visibleKitsForPublicPage = useMemo(() => {
    return kits.filter((kit) => {
      const ids = kit.category_ids;
      if (!Array.isArray(ids) || ids.length === 0) return false;
      return ids.some((id) => publicCategoryIdSet.has(id));
    });
  }, [kits, publicCategoryIdSet]);

  // Cache de cupom/ref da URL para reutilizar ao abrir inscrição depois (ver docs/PLANO_APLICACAO_CACHE_CUPOM.md)
  useEffect(() => {
    if (!event?.id) return;
    const cupom = searchParams.get("cupom")?.trim() || undefined;
    const ref = searchParams.get("ref")?.trim() || undefined;
    if (cupom || ref) {
      saveReferralCoupon(event.id, { cupom, ref });
    }
  }, [event?.id, searchParams]);

  // Atualizar meta tags (Open Graph / Twitter) para preview ao compartilhar link (WhatsApp, redes sociais)
  useEffect(() => {
    if (!event) return;

    const title = `${event.title} | Cronoteam`;
    const description = event.description?.replace(/<[^>]*>/g, "").slice(0, 160) || `Confira ${event.title} - Cronoteam`;
    const imageUrl = event.banner_url
      ? (event.banner_url.startsWith("http") ? event.banner_url : `${window.location.origin}${event.banner_url.startsWith("/") ? "" : "/"}${event.banner_url}`)
      : `${window.location.origin}/favicon.png`;
    const url = window.location.href;

    document.title = title;

    const setMeta = (selector: string, attr: string, value: string) => {
      const el = document.querySelector(selector) as HTMLMetaElement | null;
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:image"]', "content", imageUrl);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:image"]', "content", imageUrl);
    setMeta('meta[name="description"]', "content", description);

    return () => {
      document.title = "cronoteam";
      const defaultImage = "https://cronoteam.com.br/logo-og.png";
      setMeta('meta[property="og:title"]', "content", "cronoteam");
      setMeta('meta[property="og:description"]', "content", "Empresa de cronometragem esportiva.");
      setMeta('meta[property="og:image"]', "content", defaultImage);
      setMeta('meta[name="twitter:title"]', "content", "cronoteam");
      setMeta('meta[name="twitter:description"]', "content", "Empresa de cronometragem esportiva.");
      setMeta('meta[name="twitter:image"]', "content", defaultImage);
      setMeta('meta[name="description"]', "content", "Empresa de cronometragem esportiva.");
    };
  }, [event]);

  const renderCategoryCard = (category: Category) => {
    const isFull = category.max_participants !== null && category.max_participants <= 0;
    const now = new Date();

    const getBatchesStatus = (cat: Category) => {
      if (!cat.batches || cat.batches.length === 0) {
        return { active: [], future: [], expired: [] };
      }

      const active: CategoryBatch[] = [];
      const future: CategoryBatch[] = [];
      const expired: CategoryBatch[] = [];

      cat.batches.forEach((batch) => {
        if (!batch.valid_from) return;

        const startDate = new Date(batch.valid_from);
        if (isNaN(startDate.getTime())) return;

        const endDate = batch.valid_to ? new Date(batch.valid_to) : null;

        if (startDate > now) future.push(batch);
        else if (endDate && endDate < now) expired.push(batch);
        else active.push(batch);
      });

      active.sort((a, b) => new Date(b.valid_from!).getTime() - new Date(a.valid_from!).getTime());
      return { active, future, expired };
    };

    const { active, future, expired } = getBatchesStatus(category);
    const activeBatch = active.length > 0 ? active[0] : null;
    const displayPrice = activeBatch ? activeBatch.price : category.price;

    return (
      <div
        key={category.id}
        className={`p-4 border rounded-lg ${isFull ? "opacity-60" : ""} ${category.is_default ? "border-primary border-2" : ""}`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{category.name}</h3>
              {category.is_default && <Badge variant="default" className="text-xs">Padrão</Badge>}
              {isFull && <Badge variant="destructive" className="text-xs">Esgotada</Badge>}
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              <p className="text-xs text-muted-foreground capitalize">Tipo: {category.category_type}</p>
              {category.gender !== "ambos" && (
                <p className="text-xs text-muted-foreground capitalize">• Gênero: {category.gender}</p>
              )}
              {category.min_age !== null && (
                <p className="text-xs text-muted-foreground">• Idade mínima: {category.min_age} anos</p>
              )}
            </div>
            {category.max_participants !== null && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Users className="h-3 w-3" />
                Máximo: {category.max_participants} participantes
              </p>
            )}
          </div>
          <div className="text-right ml-4">
            <p className="text-2xl font-bold text-primary">{formatPrice(displayPrice)}</p>
            {activeBatch?.name && <p className="text-xs text-muted-foreground mt-1">{activeBatch.name}</p>}
          </div>
        </div>

        {(active.length > 0 || future.length > 0 || expired.length > 0) && (
          <Collapsible
            className="mt-4 pt-4 border-t"
            open={expandedCategories.has(category.id)}
            onOpenChange={(open) => {
              setExpandedCategories((prev) => {
                const next = new Set(prev);
                if (open) next.add(category.id);
                else next.delete(category.id);
                return next;
              });
            }}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <span className="text-xs font-semibold text-muted-foreground">
                  Ver todos os lotes ({active.length + future.length + expired.length})
                </span>
                {expandedCategories.has(category.id) ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {active.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Lotes Disponíveis:</p>
                  <div className="space-y-1">
                    {active.map((batch) => (
                      <div key={batch.id} className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-950/20 p-2 rounded">
                        <span className="font-medium">{batch.name || "Lote Ativo"}</span>
                        <span className="font-bold text-green-700 dark:text-green-400">{formatPrice(batch.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {future.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Lotes Futuros:</p>
                  <div className="space-y-1">
                    {future.map((batch) => (
                      <div key={batch.id} className="flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-950/20 p-2 rounded opacity-75">
                        <span>{batch.name || "Lote Futuro"} - {formatDateUTC(batch.valid_from)}</span>
                        <span className="font-bold text-blue-700 dark:text-blue-400">{formatPrice(batch.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expired.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Lotes Expirados:</p>
                  <div className="space-y-1">
                    {expired.map((batch) => (
                      <div key={batch.id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-950/20 p-2 rounded opacity-50 line-through">
                        <span>{batch.name || "Lote Expirado"}</span>
                        <span className="font-bold text-gray-500">{formatPrice(batch.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  };

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
      <Header />

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
              <span>{formatDateOnlyBrasilia(event.event_date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{formatTimeBrasilia(event.event_date)}</span>
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
        <div className="container mx-auto px-4">
          {/* Event Status Badge */}
          <div className="mb-6 flex items-center gap-2 flex-wrap">
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
            
            {/* Registration Status Badge */}
            {(() => {
              const effectiveStatus = getEffectiveRegistrationStatus(event);
              const statusLabel = getRegistrationStatusLabel(event);
              const statusVariant = getRegistrationStatusVariant(event);
              
              if (effectiveStatus !== null) {
                return (
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant} className="text-sm">
                      {statusLabel}
                    </Badge>
                    {event.registration_auto_mode && effectiveStatus === 'not_open' && event.registration_start_date && (
                      <span className="text-sm text-muted-foreground">
                        Abre em {format(new Date(event.registration_start_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                    {event.registration_auto_mode && effectiveStatus === 'open' && event.registration_end_date && (
                      <span className="text-sm text-muted-foreground">
                        Encerra em {format(new Date(event.registration_end_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                    {event.registration_auto_mode && effectiveStatus === 'closed' && event.registration_end_date && (
                      <span className="text-sm text-muted-foreground">
                        Encerradas em {format(new Date(event.registration_end_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                );
              }
              return null;
            })()}
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
                        {formatDateBrasilia(event.event_date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Horário de Largada</p>
                      <p className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {formatTimeBrasilia(event.event_date)}h
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

              {/* Premiação */}
              {event.premiacao && event.premiacao.trim() !== "" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Premiação
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.premiacao) }}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Cronograma */}
              {(event.cronograma_items && event.cronograma_items.length > 0) || (event.cronograma && event.cronograma.trim() !== "") ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Cronograma
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {event.cronograma_items && event.cronograma_items.length > 0 && (
                      <div className="space-y-2">
                        <ul className="space-y-2 list-none p-0 m-0">
                          {[...event.cronograma_items]
                            .sort((a, b) => a.display_order - b.display_order)
                            .map((item) => (
                              <li key={item.id} className="flex gap-3 items-start border-b border-border/50 pb-2 last:border-0 last:pb-0">
                                <span className="font-mono text-sm font-medium text-foreground shrink-0 w-12">{item.time}</span>
                                <div>
                                  <p className="font-medium text-foreground">{item.title}</p>
                                  {item.description && (
                                    <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>
                                  )}
                                </div>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                    {event.cronograma && event.cronograma.trim() !== "" && (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.cronograma) }}
                      />
                    )}
                  </CardContent>
                </Card>
              ) : null}

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
                    {(() => {
                      const categoriesWithModality = categories.filter(
                        (category) => Array.isArray(category.modality_ids) && category.modality_ids.length > 0
                      );

                      const groupedByModality = modalities
                        .map((modality) => ({
                          modality,
                          categories: categoriesWithModality.filter((category) =>
                            category.modality_ids?.includes(modality.id)
                          ),
                        }))
                        .filter((group) => group.categories.length > 0);

                      if (groupedByModality.length === 0) {
                        return (
                          <p className="text-muted-foreground text-center py-4">
                            Nenhuma categoria disponível para este evento.
                          </p>
                        );
                      }

                      return groupedByModality.map(({ modality, categories: modalityCategories }) => (
                        <div key={modality.id} className="space-y-3">
                          <div className="pb-2 border-b">
                            <h3 className="font-semibold">
                              {modality.name}
                              {modality.distance ? ` - ${modality.distance}` : ""}
                            </h3>
                          </div>
                          <div className="space-y-3">
                            {modalityCategories.map((category) => renderCategoryCard(category))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>

              {/* Modalities */}
              {modalities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Modalidades
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {modalities.map((modality) => (
                        <div
                          key={modality.id}
                          className="p-4 border rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-lg mb-2">{modality.name}</h3>
                              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                <p className="flex items-center gap-1">
                                  <Trophy className="h-4 w-4" />
                                  Distância: {modality.distance}
                                </p>
                                {modality.max_participants !== null && (
                                  <p className="flex items-center gap-1">
                                    <Users className="h-4 w-4" />
                                    Máximo: {modality.max_participants} participantes
                                  </p>
                                )}
                              </div>
                            </div>
                            {modality.route_image_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRouteImage(modality.route_image_url);
                                  setSelectedModalityName(modality.name);
                                }}
                                className="flex items-center gap-2"
                              >
                                <ImageIcon className="h-4 w-4" />
                                Ver Percurso
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Kits */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Kits Disponíveis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {visibleKitsForPublicPage.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Nenhum kit disponível para este evento.
                    </p>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-4">
                      {visibleKitsForPublicPage.map((kit) => (
                        <Card key={kit.id} className="border-2">
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
                      {pickupLocations.map((location) => {
                        // Use pickup_schedule if available, otherwise fallback to pickup_date
                        const hasSchedule = location.pickup_schedule && Array.isArray(location.pickup_schedule) && location.pickup_schedule.length > 0;
                        
                        return (
                          <div key={location.id} className="border rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                {location.name && (
                                  <p className="font-semibold text-lg mb-1">{location.name}</p>
                                )}
                                <p className={`font-semibold mb-2 ${location.name ? 'text-muted-foreground' : ''}`}>
                                  {location.address}
                                </p>
                                
                                {hasSchedule ? (
                                  <div className="space-y-2 mb-3">
                                    {location.pickup_schedule.map((scheduleItem: any, idx: number) => (
                                      <div key={idx} className="space-y-1">
                                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                          <Calendar className="h-4 w-4" />
                                          <span className="font-medium">
                                            {format(new Date(scheduleItem.date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                          </span>
                                        </div>
                                        <div className="ml-5 space-y-1">
                                          {scheduleItem.time_slots && scheduleItem.time_slots.map((slot: any, slotIdx: number) => (
                                            <div key={slotIdx} className="flex items-center gap-1 text-sm text-muted-foreground">
                                              <Clock className="h-3 w-3" />
                                              <span>
                                                {slot.start_time} às {slot.end_time}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : location.pickup_date ? (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                                    <Calendar className="h-4 w-4" />
                                    <span>
                                      {format(new Date(location.pickup_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                                    </span>
                                  </div>
                                ) : null}
                                
                                {location.additional_info && (
                                  <div className="mb-3 p-3 bg-muted/50 rounded-md border-l-2 border-primary">
                                    <p className="text-sm font-medium text-foreground mb-1">ℹ️ Informações Adicionais</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                                      {location.additional_info}
                                    </p>
                                  </div>
                                )}
                                
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
                        );
                      })}
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
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        if (event.regulation_url) {
                          // Corrigir URL se contiver template strings
                          let urlToOpen = event.regulation_url;
                          if (urlToOpen.includes('${')) {
                            const port = window.location.port || '3001';
                            urlToOpen = urlToOpen.replace(/\$\{API_PORT\}/g, port);
                            // Se ainda tiver template strings, usar localhost:3001 como padrão
                            if (urlToOpen.includes('${')) {
                              urlToOpen = urlToOpen.replace(/http:\/\/localhost:\$\{API_PORT\}/g, 'http://localhost:3001');
                            }
                          }
                          window.open(urlToOpen, '_blank');
                        }
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Baixar Regulamento
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
                
                // Calculate effective registration status
                const effectiveStatus = getEffectiveRegistrationStatus(event);
                const registrationMessage = getRegistrationStatusMessage(event);
                
                // Determine if registration is allowed
                // If effectiveStatus is null, use old logic
                const canRegisterByStatus = effectiveStatus === null 
                  ? (event.status === "published" || event.status === "ongoing")
                  : effectiveStatus === 'open';
                
                const isDisabled = event.status === "draft" || 
                  event.status === "finished" || 
                  event.status === "cancelled" || 
                  isPastEvent || 
                  !canRegisterByStatus ||
                  effectiveStatus === 'not_open' ||
                  effectiveStatus === 'closed';

                // ETAPA 7.4: Improved conditional display based on status
                if (event.status === "cancelled") {
                  return (
                    <Card className="border-destructive">
                      <CardHeader>
                        <CardTitle>Evento Cancelado</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                          Este evento foi cancelado. Entre em contato com o organizador para mais informações.
                        </p>
                      </CardContent>
                    </Card>
                  );
                }

                // Se evento está finished e tem result_url, mostrar card de resultados
                if (event.status === "finished" && event.result_url) {
                  return (
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
                          onClick={() => {
                            if (event.result_url) {
                              // Corrigir URL se contiver template strings
                              let urlToOpen = event.result_url;
                              if (urlToOpen.includes('${')) {
                                const port = window.location.port || '3001';
                                urlToOpen = urlToOpen.replace(/\$\{API_PORT\}/g, port);
                                // Se ainda tiver template strings, usar localhost:3001 como padrão
                                if (urlToOpen.includes('${')) {
                                  urlToOpen = urlToOpen.replace(/http:\/\/localhost:\$\{API_PORT\}/g, 'http://localhost:3001');
                                }
                              }
                              window.open(urlToOpen, '_blank');
                            }
                          }}
                        >
                          <Trophy className="mr-2 h-4 w-4" />
                          Ver Resultados
                        </Button>
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
                        {(() => {
                          const getActiveBatch = (cat: Category): CategoryBatch | null => {
                            if (!cat.batches || cat.batches.length === 0) {
                              return null;
                            }

                            const now = new Date();
                            const activeBatches = cat.batches
                              .filter(batch => {
                                if (!batch.valid_from) return false;
                                const startDate = new Date(batch.valid_from);
                                if (isNaN(startDate.getTime()) || startDate > now) return false;
                                if (batch.valid_to) {
                                  const endDate = new Date(batch.valid_to);
                                  if (!isNaN(endDate.getTime()) && endDate < now) return false;
                                }
                                return true;
                              })
                              .sort((a, b) => {
                                const dateA = new Date(a.valid_from!);
                                const dateB = new Date(b.valid_from!);
                                return dateB.getTime() - dateA.getTime();
                              });

                            return activeBatches.length > 0 ? activeBatches[0] : null;
                          };

                          const getActiveBatchPrice = (cat: Category): number => {
                            const activeBatch = getActiveBatch(cat);
                            return activeBatch ? activeBatch.price : cat.price;
                          };

                          const defaultCategory = categories.find(c => c.is_default === true);
                          const categoryToUse = defaultCategory || (categories.length > 0 ? categories.reduce((min, cat) => {
                            const minPrice = getActiveBatchPrice(min);
                            const catPrice = getActiveBatchPrice(cat);
                            return catPrice < minPrice ? cat : min;
                          }) : null);
                          
                          const activeBatch = categoryToUse ? getActiveBatch(categoryToUse) : null;
                          const priceToShow = categoryToUse ? getActiveBatchPrice(categoryToUse) : 0;
                          
                          return (
                            <>
                              {priceToShow > 0 && (
                                <p className="text-sm text-muted-foreground">
                                  Valor:
                                </p>
                              )}
                              <p className="text-3xl font-bold text-primary">
                                {priceToShow > 0 ? formatPrice(priceToShow) : ''}
                              </p>
                              {activeBatch?.name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {activeBatch.name}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-full">
                              <Button
                                className="w-full"
                                size="lg"
                                onClick={() => setIsRegistrationOpen(true)}
                                disabled={isDisabled}
                              >
                                {isDisabled ? (
                                  effectiveStatus === 'not_open' ? "Inscrições em Breve" :
                                  effectiveStatus === 'closed' ? "Inscrições Encerradas" :
                                  event.status === "draft" ? "Inscrições Indisponíveis" :
                                  event.status === "finished" ? "Inscrições Encerradas" :
                                  isPastEvent ? "Evento Já Realizado" :
                                  "Inscrições Indisponíveis"
                                ) : (
                                  "Fazer Inscrição"
                                )}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {isDisabled && (
                            <TooltipContent>
                              <p className="max-w-xs">{registrationMessage}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      {event.status === "draft" && (
                        <p className="text-xs text-center text-muted-foreground">
                          Este evento ainda está em rascunho. As inscrições serão abertas quando o evento for publicado.
                        </p>
                      )}
                      {isPastEvent && event.status !== "finished" && (
                        <p className="text-xs text-center text-muted-foreground">
                          Este evento já foi realizado. Não é mais possível se inscrever.
                        </p>
                      )}
                      {effectiveStatus === 'not_open' && (
                        <p className="text-xs text-center text-muted-foreground">
                          {registrationMessage}
                        </p>
                      )}
                      {effectiveStatus === 'closed' && (
                        <p className="text-xs text-center text-muted-foreground">
                          {registrationMessage}
                        </p>
                      )}
                      {!isDisabled && !isPastEvent && event.status !== "finished" && effectiveStatus !== 'not_open' && effectiveStatus !== 'closed' && (
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
                  <div className="flex items-center gap-3 p-2 rounded-lg">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <span className="text-sm">Cartão de Crédito</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg">
                    <Smartphone className="h-5 w-5 text-primary" />
                    <span className="text-sm">PIX</span>
                  </div>
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
            registration_status: event.registration_status,
            registration_start_date: event.registration_start_date,
            registration_end_date: event.registration_end_date,
            registration_auto_mode: event.registration_auto_mode,
            pix_enabled: event.pix_enabled,
            pix_disabled_at: event.pix_disabled_at,
            credit_card_enabled: event.credit_card_enabled,
            credit_card_disabled_at: event.credit_card_disabled_at,
          }}
          categories={categories}
          kits={kits}
        />
      )}

      {/* Bottom Bar - Shows on scroll - ETAPA 8: Updated with registration status */}
      {(() => {
        const eventDate = new Date(event.event_date);
        const now = new Date();
        const isPastEvent = eventDate < now;
        
        // Calculate effective registration status
        const effectiveStatus = getEffectiveRegistrationStatus(event);
        const canRegisterByStatus = effectiveStatus === null 
          ? (event.status === "published" || event.status === "ongoing")
          : effectiveStatus === 'open';
        
        const canRegister = canRegisterByStatus && !isPastEvent;
        
        if (event.status === "finished" || event.status === "cancelled" || event.status === "draft" || !canRegister || effectiveStatus === 'not_open' || effectiveStatus === 'closed') {
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
                  {(() => {
                    const getActiveBatch = (cat: Category): CategoryBatch | null => {
                      if (!cat.batches || cat.batches.length === 0) {
                        return null;
                      }

                      const now = new Date();
                      const activeBatches = cat.batches
                        .filter(batch => {
                          if (!batch.valid_from) return false;
                          const startDate = new Date(batch.valid_from);
                          if (isNaN(startDate.getTime()) || startDate > now) return false;
                          if (batch.valid_to) {
                            const endDate = new Date(batch.valid_to);
                            if (!isNaN(endDate.getTime()) && endDate < now) return false;
                          }
                          return true;
                        })
                        .sort((a, b) => {
                          const dateA = new Date(a.valid_from!);
                          const dateB = new Date(b.valid_from!);
                          return dateB.getTime() - dateA.getTime();
                        });

                      return activeBatches.length > 0 ? activeBatches[0] : null;
                    };

                    const getActiveBatchPrice = (cat: Category): number => {
                      const activeBatch = getActiveBatch(cat);
                      return activeBatch ? activeBatch.price : cat.price;
                    };

                    const defaultCategory = categories.find(c => c.is_default === true);
                    const categoryToUse = defaultCategory || (categories.length > 0 ? categories.reduce((min, cat) => {
                      const minPrice = getActiveBatchPrice(min);
                      const catPrice = getActiveBatchPrice(cat);
                      return catPrice < minPrice ? cat : min;
                    }) : null);
                    
                    const activeBatch = categoryToUse ? getActiveBatch(categoryToUse) : null;
                    const priceToShow = categoryToUse ? getActiveBatchPrice(categoryToUse) : 0;
                    
                    return (
                      <>
                        {priceToShow > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Valor:
                          </p>
                        )}
                        <p className="text-2xl font-bold text-primary">
                          {priceToShow > 0 ? formatPrice(priceToShow) : ''}
                        </p>
                        {activeBatch?.name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {activeBatch.name}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="lg"
                          onClick={() => setIsRegistrationOpen(true)}
                          className="px-8"
                          disabled={!canRegister}
                        >
                          {!canRegister ? (
                            effectiveStatus === 'not_open' ? "Inscrições em Breve" :
                            effectiveStatus === 'closed' ? "Inscrições Encerradas" :
                            "Inscrições Indisponíveis"
                          ) : (
                            "Inscrever-se aqui"
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canRegister && (
                      <TooltipContent>
                        <p className="max-w-xs">{getRegistrationStatusMessage(event)}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
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
        eventId={event?.id}
      />

      {/* Route Image Dialog */}
      <Dialog open={!!selectedRouteImage} onOpenChange={(open) => !open && setSelectedRouteImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Percurso - {selectedModalityName}</DialogTitle>
          </DialogHeader>
          {selectedRouteImage && (
            <div className="mt-4">
              <img
                src={selectedRouteImage}
                alt={`Percurso da modalidade ${selectedModalityName}`}
                className="w-full h-auto rounded-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = heroImage;
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventDetails;

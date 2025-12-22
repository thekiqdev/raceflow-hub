import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { findUserByCpfOrEmail } from "@/lib/api/registrations";
import { getEvents, type Event } from "@/lib/api/events";
import { getEventCategories } from "@/lib/api/categories";
import { getEventKits, type EventKit } from "@/lib/api/eventKits";
import { createRegistration, type CreateRegistrationData } from "@/lib/api/registrations";
import { useAuth } from "@/contexts/AuthContext";

interface OrganizerRegisterAthleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface Category {
  id: string;
  name: string;
  price: number;
  distance?: string;
  min_age?: number | null;
  gender?: string | null;
}

export function OrganizerRegisterAthleteDialog({
  open,
  onOpenChange,
  onSuccess,
}: OrganizerRegisterAthleteDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [searchType, setSearchType] = useState<"cpf" | "email">("cpf");
  const [searchValue, setSearchValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{
    id: string;
    full_name: string;
    cpf: string;
  } | null>(null);
  
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [kits, setKits] = useState<EventKit[]>([]);
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load events when dialog opens
  useEffect(() => {
    if (open && user) {
      loadEvents();
    }
  }, [open, user]);

  const loadEvents = async () => {
    if (!user) return;
    
    try {
      setLoadingEvents(true);
      const response = await getEvents({ organizer_id: user.id });
      if (response.success && response.data) {
        setEvents(response.data);
      }
    } catch (error) {
      console.error("Error loading events:", error);
      toast.error("Erro ao carregar eventos");
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadCategories = async (eventId: string) => {
    try {
      setLoadingCategories(true);
      const response = await getEventCategories(eventId);
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      toast.error("Erro ao carregar categorias");
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadKits = async (eventId: string) => {
    try {
      const response = await getEventKits(eventId);
      if (response.success && response.data) {
        setKits(response.data);
      }
    } catch (error) {
      console.error("Error loading kits:", error);
    }
  };

  const handleSearch = async () => {
    if (!searchValue.trim()) {
      toast.error("Por favor, informe o CPF ou email");
      return;
    }

    setSearching(true);
    try {
      const cpf = searchType === "cpf" ? searchValue : undefined;
      const email = searchType === "email" ? searchValue : undefined;
      
      const response = await findUserByCpfOrEmail(cpf, email);
      
      if (response.success && response.data) {
        setFoundUser(response.data);
        setStep(2);
      } else {
        toast.error(response.error || "Atleta não encontrado. Verifique o CPF ou email informado.");
      }
    } catch (error: any) {
      console.error("Error searching user:", error);
      toast.error(error.message || "Erro ao buscar atleta");
    } finally {
      setSearching(false);
    }
  };

  const handleEventChange = (eventId: string) => {
    setSelectedEventId(eventId);
    setSelectedCategoryId("");
    setSelectedKitId("");
    if (eventId) {
      loadCategories(eventId);
      loadKits(eventId);
    }
  };

  const handleSubmit = async () => {
    if (!foundUser || !selectedEventId || !selectedCategoryId) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }

    setSubmitting(true);
    try {
      // Calculate total amount from category and kit prices
      const categoryPrice = selectedCategory?.price || 0;
      const kitPrice = selectedKit?.price || 0;
      const calculatedTotal = categoryPrice + kitPrice;

      const registrationData: CreateRegistrationData = {
        event_id: selectedEventId,
        runner_id: foundUser.id,
        category_id: selectedCategoryId,
        kit_id: selectedKitId || undefined,
        payment_method: "pix",
        total_amount: calculatedTotal,
      };

      const response = await createRegistration(registrationData);

      if (response.success) {
        toast.success("Atleta inscrito com sucesso!");
        handleClose();
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(response.error || "Erro ao inscrever atleta");
      }
    } catch (error: any) {
      console.error("Error creating registration:", error);
      toast.error(error.message || "Erro ao inscrever atleta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSearchValue("");
    setFoundUser(null);
    setSelectedEventId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
    onOpenChange(false);
  };

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const selectedKit = kits.find(k => k.id === selectedKitId);
  
  const totalAmount = (selectedCategory?.price || 0) + (selectedKit?.price || 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Inscrever Atleta</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Busque o atleta por CPF ou email para inscrevê-lo no evento"
              : "Selecione o evento, categoria e kit para completar a inscrição"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Buscar por</Label>
              <Select value={searchType} onValueChange={(value: "cpf" | "email") => setSearchType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{searchType === "cpf" ? "CPF" : "Email"}</Label>
              <Input
                placeholder={searchType === "cpf" ? "000.000.000-00" : "email@exemplo.com"}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
              />
            </div>

            {foundUser && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-semibold">{foundUser.full_name}</p>
                <p className="text-sm text-muted-foreground">CPF: {foundUser.cpf}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Evento *</Label>
              <Select
                value={selectedEventId}
                onValueChange={handleEventChange}
                disabled={loadingEvents}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o evento" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEventId && (
              <>
                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={setSelectedCategoryId}
                    disabled={loadingCategories || categories.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                          {category.distance && ` - ${category.distance}`}
                          {category.price > 0 && ` - ${new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(category.price)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Kit (Opcional)</Label>
                  <Select
                    value={selectedKitId}
                    onValueChange={setSelectedKitId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o kit (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sem kit</SelectItem>
                      {kits.map((kit) => (
                        <SelectItem key={kit.id} value={kit.id}>
                          {kit.name}
                          {kit.price > 0 && ` - ${new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(kit.price)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {totalAmount > 0 && (
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Valor Total</p>
                    <p className="text-2xl font-bold text-primary">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(totalAmount)}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleSearch} disabled={searching || !searchValue.trim()}>
                {searching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !selectedEventId || !selectedCategoryId}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inscrevendo...
                  </>
                ) : (
                  "Confirmar Inscrição"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


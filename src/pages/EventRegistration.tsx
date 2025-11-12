import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RegistrationStepCategory } from "@/components/registration/RegistrationStepCategory";
import { RegistrationStepKit } from "@/components/registration/RegistrationStepKit";
import { RegistrationStepRunner } from "@/components/registration/RegistrationStepRunner";
import { RegistrationStepConfirm } from "@/components/registration/RegistrationStepConfirm";
import { RegistrationStepPayment } from "@/components/registration/RegistrationStepPayment";
import { RegistrationSuccess } from "@/components/registration/RegistrationSuccess";

interface Event {
  id: string;
  title: string;
  event_date: string;
  city: string;
  state: string;
  banner_url: string | null;
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

interface RunnerData {
  isForMe: boolean;
  full_name: string;
  cpf: string;
  birth_date: string;
  gender: string;
  phone: string;
}

export default function EventRegistration() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [event, setEvent] = useState<Event | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [loading, setLoading] = useState(true);

  // Form data
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedKit, setSelectedKit] = useState<string>("");
  const [runnerData, setRunnerData] = useState<RunnerData>({
    isForMe: true,
    full_name: "",
    cpf: "",
    birth_date: "",
    gender: "",
    phone: "",
  });
  const [couponCode, setCouponCode] = useState("");
  const [registrationId, setRegistrationId] = useState<string>("");

  useEffect(() => {
    fetchEventData();
  }, [id]);

  const fetchEventData = async () => {
    try {
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", id)
        .single();

      if (eventError) throw eventError;

      const { data: categoriesData, error: categoriesError } = await supabase
        .from("event_categories")
        .select("*")
        .eq("event_id", id);

      if (categoriesError) throw categoriesError;

      const { data: kitsData, error: kitsError } = await supabase
        .from("event_kits")
        .select("*")
        .eq("event_id", id);

      if (kitsError) throw kitsError;

      setEvent(eventData);
      setCategories(categoriesData || []);
      setKits(kitsData || []);
    } catch (error: any) {
      console.error("Error fetching event data:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do evento.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTotalAmount = () => {
    const categoryPrice = categories.find((c) => c.id === selectedCategory)?.price || 0;
    const kitPrice = kits.find((k) => k.id === selectedKit)?.price || 0;
    return categoryPrice + kitPrice;
  };

  const steps = [
    { number: 1, title: "Modalidade" },
    { number: 2, title: "Kit" },
    { number: 3, title: "Dados" },
    { number: 4, title: "Confirmar" },
    { number: 5, title: "Pagamento" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Evento não encontrado</p>
      </div>
    );
  }

  if (registrationId) {
    return <RegistrationSuccess event={event} registrationId={registrationId} />;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-primary-foreground hover:bg-primary-foreground/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-lg line-clamp-1">{event.title}</h1>
            <p className="text-sm text-primary-foreground/80">
              {event.city} - {event.state}
            </p>
          </div>
        </div>

        {/* Steps Progress */}
        <div className="flex justify-between items-center">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    currentStep > step.number
                      ? "bg-primary-foreground text-primary"
                      : currentStep === step.number
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary-foreground/30 text-primary-foreground/60"
                  }`}
                >
                  {currentStep > step.number ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.number
                  )}
                </div>
                <span className="text-xs mt-1 hidden sm:block">{step.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 transition-colors ${
                    currentStep > step.number
                      ? "bg-primary-foreground"
                      : "bg-primary-foreground/30"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto">
        {currentStep === 1 && (
          <RegistrationStepCategory
            categories={categories}
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <RegistrationStepKit
            kits={kits}
            selectedKit={selectedKit}
            onSelect={setSelectedKit}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && (
          <RegistrationStepRunner
            runnerData={runnerData}
            onUpdate={setRunnerData}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 4 && (
          <RegistrationStepConfirm
            event={event}
            category={categories.find((c) => c.id === selectedCategory)!}
            kit={kits.find((k) => k.id === selectedKit)}
            runnerData={runnerData}
            totalAmount={getTotalAmount()}
            couponCode={couponCode}
            onCouponChange={setCouponCode}
            onNext={() => setCurrentStep(5)}
            onBack={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 5 && (
          <RegistrationStepPayment
            event={event}
            totalAmount={getTotalAmount()}
            categoryId={selectedCategory}
            kitId={selectedKit}
            runnerData={runnerData}
            onSuccess={(id) => setRegistrationId(id)}
            onBack={() => setCurrentStep(4)}
          />
        )}
      </div>
    </div>
  );
}

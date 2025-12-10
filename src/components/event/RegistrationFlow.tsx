import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, Calendar, MapPin, Ticket, Download, ChevronDown, ChevronUp, List, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getOwnProfile, getPublicProfileByCpf } from "@/lib/api/profiles";
import { createRegistration, getPaymentStatus } from "@/lib/api/registrations";
import { PixQrCode } from "@/components/payment/PixQrCode";
import { getEventCategories, EventCategory, CategoryBatch } from "@/lib/api/eventCategories";
import { EventKit, KitProduct, ProductVariant } from "@/lib/api/eventKits";

// Re-export ProductVariant type for use in component
type ProductVariantType = ProductVariant;
import { toast } from "sonner";

interface Category extends EventCategory {
  batches?: CategoryBatch[];
}

interface Kit extends EventKit {
  products?: KitProduct[];
}

interface EventInfo {
  id: string;
  title: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  status?: string;
}

interface RegistrationFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventInfo;
  categories: Category[];
  kits: Kit[];
}

// Tamanhos serão obtidos das variações do produto selecionado

// Helper function to format price
const formatPrice = (price: number): string => {
  if (price === 0) return "Grátis";
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
};

export function RegistrationFlow({
  open,
  onOpenChange,
  event,
  categories: initialCategories,
  kits,
}: RegistrationFlowProps) {
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<CategoryBatch | null>(null);
  const [selectedKit, setSelectedKit] = useState<Kit | null>(null);
  const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Map<string, { productId: string; variantId?: string }>>(new Map());
  // State for cascading variant selection: { productId: { attributeName: selectedValue } }
  const [variantSelections, setVariantSelections] = useState<Map<string, Record<string, string>>>(new Map());
  const [shirtSize, setShirtSize] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferCpf, setTransferCpf] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    pix_qr_code?: string | null;
    pix_qr_code_id?: string | null;
    asaas_payment_id?: string;
    status?: string;
    due_date?: string;
    error?: string;
    warning?: string;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'confirmed'>('pending');
  const [isPollingPayment, setIsPollingPayment] = useState(false);
  const [categories, setCategories] = useState<Category[]>(initialCategories || []);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });
  const [isRegistering, setIsRegistering] = useState(false); // Toggle between login and register
  const [registerData, setRegisterData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    cpf: "",
    phone: "",
    birthDate: "",
    gender: "",
  });
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [isRegisteringAccount, setIsRegisteringAccount] = useState(false);
  const [isRegisteringOther, setIsRegisteringOther] = useState(false);
  const [searchCpf, setSearchCpf] = useState("");
  const [isSearchingProfile, setIsSearchingProfile] = useState(false);
  const [otherPersonId, setOtherPersonId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    cpf: "",
  });

  // Calculate total price based on selected batch or category price
  const categoryPrice = selectedBatch?.price || selectedCategory?.price || 0;
  const totalPrice = categoryPrice + (selectedKit?.price || 0);

  // Debug: Log quando o modal abre ou categorias mudam
  useEffect(() => {
    if (open) {
      console.log('🔍 RegistrationFlow opened:', {
        eventId: event.id,
        eventTitle: event.title,
        initialCategoriesCount: initialCategories.length,
        initialCategories: initialCategories,
        currentCategoriesCount: categories.length,
        currentCategories: categories,
        kitsCount: kits.length,
        kits: kits,
      });
      
      // Debug kits and products
      kits.forEach((kit, index) => {
        console.log(`📦 Kit ${index + 1}:`, {
          id: kit.id,
          name: kit.name,
          productsCount: kit.products?.length || 0,
          products: kit.products?.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            variantsCount: p.variants?.length || 0,
            variants: p.variants,
          })),
        });
      });
    }
  }, [open, event, initialCategories, categories, kits]);

  // Sincronizar categorias com props quando mudarem
  useEffect(() => {
    if (initialCategories && initialCategories.length > 0) {
      console.log('🔄 Atualizando categorias das props:', initialCategories.length);
      setCategories(initialCategories);
    }
  }, [initialCategories]);

  // Recarregar categorias quando o modal abre se estiverem vazias
  useEffect(() => {
    const loadCategories = async () => {
      if (open && event.id && categories.length === 0 && !loadingCategories) {
        console.log('🔄 Recarregando categorias porque estão vazias...');
        setLoadingCategories(true);
        try {
          const response = await getEventCategories(event.id);
          console.log('🔄 Categorias recarregadas:', response);
          if (response.success && response.data) {
            setCategories(response.data);
            console.log('✅ Categorias atualizadas:', response.data.length);
          } else {
            console.error('❌ Erro ao recarregar categorias:', response.error);
            toast.error('Erro ao carregar categorias. Tente novamente.');
          }
        } catch (error) {
          console.error('❌ Erro ao recarregar categorias:', error);
          toast.error('Erro ao carregar categorias. Tente novamente.');
        } finally {
          setLoadingCategories(false);
        }
      }
    };

    loadCategories();
  }, [open, event.id]);

  // Load user data when dialog opens or user logs in
  useEffect(() => {
    const loadUserData = async () => {
      if (!open || !user) {
        // Reset form data if user is not logged in
        if (!user && open) {
          setFormData({
            fullName: "",
            email: "",
            phone: "",
            cpf: "",
          });
        }
        return;
      }

      try {
        const profileResponse = await getOwnProfile();
        
        if (profileResponse.success && profileResponse.data) {
          const profile = profileResponse.data;
          setFormData({
            fullName: profile.full_name || "",
            email: user.email || "",
            phone: profile.phone || "",
            cpf: profile.cpf || "",
          });
        } else {
          // If no profile, at least set the email
          setFormData((prev) => ({
            ...prev,
            email: user.email || "",
          }));
        }
      } catch (error) {
        console.error("Error loading user profile:", error);
        // Set email if available
        if (user.email) {
          setFormData((prev) => ({
            ...prev,
            email: user.email || "",
          }));
        }
      }
    };

    loadUserData();
  }, [open, user]);

  const handleCategorySelect = (category: Category) => {
    // Check if category is full
    const isFull = category.max_participants !== null && 
                  category.available_spots !== null && 
                  category.available_spots <= 0;
    
    if (isFull) {
      toast.error("Esta categoria está esgotada. Por favor, escolha outra categoria.");
      return;
    }
    
    setSelectedCategory(category);
    // Reset batch selection when changing category
    setSelectedBatch(null);
    
    // If category has valid batches, select the first one automatically
    if (category.batches && category.batches.length > 0) {
      const now = new Date();
      // Filtrar lotes ativos (data já chegou) e ordenar por data (mais recente primeiro)
      const activeBatches = category.batches
        .filter(batch => {
          if (!batch.valid_from) return false;
          const batchDate = new Date(batch.valid_from);
          return !isNaN(batchDate.getTime()) && batchDate <= now;
        })
        .sort((a, b) => {
          const dateA = new Date(a.valid_from!);
          const dateB = new Date(b.valid_from!);
          // Ordenar do mais recente para o mais antigo
          return dateB.getTime() - dateA.getTime();
        });
      
      if (activeBatches.length > 0) {
        // Auto-select o lote mais recente ativo
        setSelectedBatch(activeBatches[0]);
      }
    }
  };

  const handleBatchSelect = (batch: CategoryBatch) => {
    setSelectedBatch(batch);
  };

  const toggleKitExpansion = (kitId: string, e?: React.MouseEvent) => {
    // Prevent event propagation to avoid triggering kit selection
    if (e) {
      e.stopPropagation();
    }
    setExpandedKits(prev => {
      const newSet = new Set(prev);
      if (newSet.has(kitId)) {
        newSet.delete(kitId);
      } else {
        newSet.add(kitId);
      }
      return newSet;
    });
  };

  const handleProductSelect = (productId: string, kitId: string) => {
    setSelectedProducts(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(kitId);
      
      // If clicking the same product, deselect it
      if (current?.productId === productId) {
        newMap.delete(kitId);
      } else {
        // Select new product (clear variant if it was a variable product)
        newMap.set(kitId, { productId });
      }
      return newMap;
    });
  };

  const handleVariantSelect = (variantId: string, productId: string, kitId: string) => {
    setSelectedProducts(prev => {
      const newMap = new Map(prev);
      newMap.set(kitId, { productId, variantId });
      return newMap;
    });
    // Also update shirtSize for compatibility
    setShirtSize(variantId);
  };

  const handleKitSelect = (kit: Kit, skipValidation = false) => {
    // If skipValidation is true, just select the kit (used when expanding to show products)
    if (skipValidation) {
      setSelectedKit(kit);
      return;
    }
    
    // Check if kit has variable products that need variant selection
    if (kit.products && kit.products.length > 0) {
      const variableProducts = kit.products.filter(p => p.type === 'variable' && p.variants && p.variants.length > 0);
      if (variableProducts.length > 0) {
        const selectedProduct = selectedProducts.get(kit.id);
        // Only allow selection if at least one variant is selected (since we don't require product selection anymore)
        if (!selectedProduct?.variantId) {
          // Don't show error, just don't allow final selection
          // User can still expand to see products and select variants
          return;
        }
      }
    }
    
    setSelectedKit(kit);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogin = async () => {
    if (!loginData.email || !loginData.password) {
      toast.error("Por favor, preencha email e senha");
      return;
    }

    setIsLoggingIn(true);
    try {
      const success = await login(loginData.email, loginData.password);
      if (success) {
        // Login successful - user data will be loaded by useEffect
        setLoginData({ email: "", password: "" });
        setIsRegisteringOther(false);
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Erro ao fazer login. Tente novamente.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async () => {
    if (!registerData.fullName || !registerData.email || !registerData.password || !registerData.cpf || !registerData.phone) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (!lgpdConsent) {
      toast.error("Você precisa concordar com os termos de privacidade");
      return;
    }

    setIsRegisteringAccount(true);
    try {
      const success = await register({
        email: registerData.email,
        password: registerData.password,
        full_name: registerData.fullName,
        cpf: registerData.cpf.replace(/\D/g, ""),
        phone: registerData.phone.replace(/\D/g, ""),
        birth_date: registerData.birthDate || undefined,
        gender: registerData.gender || undefined,
        lgpd_consent: lgpdConsent,
      });

      if (success) {
        // Registration successful - user data will be loaded by useEffect
        setRegisterData({
          fullName: "",
          email: "",
          password: "",
          confirmPassword: "",
          cpf: "",
          phone: "",
          birthDate: "",
          gender: "",
        });
        setLgpdConsent(false);
        setIsRegistering(false); // Switch back to login view
        
        // Wait a bit for user data to be loaded, then redirect
        setTimeout(() => {
          navigate("/runner/dashboard");
        }, 500);
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Erro ao criar conta. Tente novamente.");
    } finally {
      setIsRegisteringAccount(false);
    }
  };

  const handleSearchProfile = async () => {
    if (!searchCpf) {
      toast.error("Por favor, informe o CPF");
      return;
    }

    setIsSearchingProfile(true);
    try {
      const response = await getPublicProfileByCpf(searchCpf);
      if (response.success && response.data) {
        const profile = response.data;
        setFormData({
          fullName: profile.full_name || "",
          email: profile.email || "",
          phone: profile.phone || "",
          cpf: profile.cpf || "",
        });
        setOtherPersonId(profile.id);
        toast.success("Perfil encontrado!");
      } else {
        toast.error(response.error || "Perfil não encontrado ou não está público");
        setFormData({
          fullName: "",
          email: "",
          phone: "",
          cpf: "",
        });
        setOtherPersonId(null);
      }
    } catch (error) {
      console.error("Error searching profile:", error);
      toast.error("Erro ao buscar perfil. Tente novamente.");
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        cpf: "",
      });
      setOtherPersonId(null);
    } finally {
      setIsSearchingProfile(false);
    }
  };

  const handleNextStep = () => {
    setStep((prev) => prev + 1);
  };

  const handlePreviousStep = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    if (!user || !selectedCategory) {
      toast.error("Erro: usuário não autenticado ou categoria não selecionada");
      return;
    }

    // ETAPA 7.1: Validate if event is open for registrations
    if (event.status) {
      if (event.status === "draft") {
        toast.error("Este evento ainda não está aberto para inscrições.");
        return;
      }

      if (event.status === "finished" || event.status === "cancelled") {
        toast.error("Este evento não está mais aceitando inscrições.");
        return;
      }

      // Only 'published' and 'ongoing' statuses allow registrations
      if (event.status !== "published" && event.status !== "ongoing") {
        toast.error("Este evento não está aberto para inscrições no momento.");
        return;
      }
    }

    // Validate event date (don't allow registration in past events)
    const eventDate = new Date(event.event_date);
    const now = new Date();
    if (eventDate < now) {
      toast.error("Não é possível se inscrever em eventos que já aconteceram.");
      return;
    }

    // Validate if category is still available
    if (selectedCategory.max_participants !== null && 
        selectedCategory.available_spots !== null && 
        selectedCategory.available_spots <= 0) {
      toast.error("Esta categoria está esgotada. Por favor, escolha outra categoria.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Create registration
      // Use otherPersonId if registering for someone else, otherwise use logged user id
      const runnerId = otherPersonId || user.id;
      
      const registrationData = {
        event_id: event.id,
        runner_id: runnerId,
        category_id: selectedCategory.id,
        kit_id: selectedKit?.id,
        payment_method: "pix" as const, // Default payment method, can be changed later
        total_amount: totalPrice,
      };

      console.log('📤 Enviando dados de inscrição:', {
        event_id: registrationData.event_id,
        category_id: registrationData.category_id,
        kit_id: registrationData.kit_id,
        total_amount: registrationData.total_amount,
        categoryPrice,
        kitPrice: selectedKit?.price || 0,
        totalPrice,
      });

      const response = await createRegistration(registrationData);

      if (!response.success) {
        throw new Error(response.error || "Erro ao criar inscrição");
      }

      // Generate confirmation code (use the one from API if available, otherwise generate)
      const code = response.data?.confirmation_code || 
        `CONF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      setConfirmationCode(code);
      
      // Save registration ID for transfer functionality
      if (response.data?.id) {
        setRegistrationId(response.data.id);
      }

      // Check if payment is required (total_amount > 0)
      const requiresPayment = totalPrice > 0;
      
      // Check if payment data is in response
      const payment = (response.data as any)?.payment;
      
      if (requiresPayment) {
        // Payment is required - check if payment was created
        if (payment) {
          setPaymentData(payment);
          
          if (payment.error || payment.warning) {
            toast.warning(payment.warning || payment.error || "Inscrição criada, mas houve um problema com o pagamento");
          } else if (payment.pix_qr_code) {
            toast.success("Inscrição criada! Escaneie o QR Code para pagar.");
            // Start polling for payment status
            startPaymentStatusPolling(response.data.id);
          } else {
            toast.success("Inscrição criada! Aguardando geração do QR Code...");
            // Start polling for QR Code
            if (payment.asaas_payment_id) {
              startPollingForQrCode(payment.asaas_payment_id, response.data.id);
            }
          }
        } else {
          // Payment required but not created - show warning
          toast.warning("Inscrição criada, mas o pagamento não foi processado. Entre em contato com o suporte.");
          setPaymentData({
            error: "Pagamento não foi criado",
            warning: "Entre em contato com o suporte para finalizar o pagamento",
          });
        }
      } else {
        // No payment required (free event)
        toast.success("Inscrição realizada com sucesso!");
        setPaymentStatus('paid'); // Mark as paid since no payment is needed
      }
      
      handleNextStep();
    } catch (error: any) {
      console.error("Error creating registration:", error);
      toast.error(error.message || "Erro ao finalizar inscrição");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Polling function to get QR Code if not available immediately
  const startPollingForQrCode = async (asaasPaymentId: string, registrationId: string) => {
    if (!asaasPaymentId) return;

    let attempts = 0;
    const maxAttempts = 5; // Try 5 times (10 seconds total)

    const pollInterval = setInterval(async () => {
      attempts++;
      
      try {
        // Get registration again to check for payment data
        const response = await getPaymentStatus(registrationId);
        
        if (response.success && response.data) {
          // Check if we can get payment data from registration
          // This would require a new endpoint, so for now we'll just check status
          const status = response.data.status;
          
          if (status === 'paid' || status === 'confirmed') {
            setPaymentStatus('paid');
            clearInterval(pollInterval);
            toast.success('Pagamento confirmado!');
            return;
          }
        }
      } catch (error) {
        console.error('Erro ao verificar status do pagamento:', error);
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.log('Polling encerrado após máximo de tentativas');
      }
    }, 2000); // Poll every 2 seconds
  };

  // Polling function to check payment status
  const startPaymentStatusPolling = (registrationId: string) => {
    if (isPollingPayment) return;
    
    setIsPollingPayment(true);
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await getPaymentStatus(registrationId);
        
        if (response.success && response.data) {
          const status = response.data.status;
          
          if (status === 'paid' || status === 'confirmed') {
            setPaymentStatus('paid');
            clearInterval(pollInterval);
            setIsPollingPayment(false);
            toast.success('Pagamento confirmado! Sua inscrição foi confirmada.');
            return;
          }
        }
      } catch (error) {
        console.error('Erro ao verificar status do pagamento:', error);
      }
    }, 5000); // Poll every 5 seconds

    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsPollingPayment(false);
    }, 600000); // 10 minutes
  };

  const handleReset = () => {
    setStep(1);
    setSelectedCategory(null);
    setSelectedBatch(null);
    setSelectedKit(null);
    setExpandedKits(new Set());
    setSelectedProducts(new Map());
    setShirtSize("");
    setConfirmationCode("");
    setPaymentData(null);
    setPaymentStatus('pending');
    setIsPollingPayment(false);
    setFormData({ fullName: "", email: "", phone: "", cpf: "" });
    onOpenChange(false);
  };

  // Reset step when modal closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedCategory(null);
      setSelectedBatch(null);
      setSelectedKit(null);
      setExpandedKits(new Set());
      setSelectedProducts(new Map());
      setShirtSize("");
      setConfirmationCode("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {step === 5 
              ? (totalPrice > 0 && paymentStatus === 'pending' 
                  ? "Pagamento Pendente" 
                  : "Confirmação de Inscrição")
              : `Inscrição - ${event.title}`}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Faça login ou crie uma conta para continuar"}
            {step === 2 && "Selecione a modalidade desejada"}
            {step === 3 && "Escolha o kit e configure os produtos"}
            {step === 4 && "Revise seus dados e finalize a inscrição"}
            {step === 5 && (
              totalPrice > 0 && paymentStatus === 'pending'
                ? "Complete o pagamento para confirmar sua inscrição"
                : "Sua inscrição foi confirmada com sucesso"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        {step <= 5 && (
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step >= s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s}
                </div>
                {s < 5 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step > s ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Personal Data (Login/Register) */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Dados Pessoais</h3>
              
              {/* Only show login/register if user is not logged in */}
              {!user && (
                <>
                  {/* Toggle between Login and Register */}
                  <div className="flex gap-2 mb-4 border-b">
                    <button
                      type="button"
                      onClick={() => setIsRegistering(false)}
                      className={`px-4 py-2 font-medium transition-colors ${
                        !isRegistering
                          ? "border-b-2 border-primary text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Entrar
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRegistering(true)}
                      className={`px-4 py-2 font-medium transition-colors ${
                        isRegistering
                          ? "border-b-2 border-primary text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Criar Conta
                    </button>
                  </div>

                  {!isRegistering ? (
                    // Login Form
                    <div className="grid gap-4">
                  <div>
                    <Label htmlFor="loginEmail">Email *</Label>
                    <Input
                      id="loginEmail"
                      type="email"
                      value={loginData.email}
                      onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="seu@email.com"
                      className="mt-1"
                      disabled={isLoggingIn}
                    />
                  </div>
                  <div>
                    <Label htmlFor="loginPassword">Senha *</Label>
                    <Input
                      id="loginPassword"
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Sua senha"
                      className="mt-1"
                      disabled={isLoggingIn}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && loginData.email && loginData.password) {
                          handleLogin();
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleLogin}
                    disabled={!loginData.email || !loginData.password || isLoggingIn}
                    className="w-full"
                  >
                    {isLoggingIn ? "Entrando..." : "Entrar"}
                  </Button>
                    </div>
                  ) : (
                    // Register Form
                    <div className="grid gap-4">
                      <div>
                        <Label htmlFor="registerFullName">Nome Completo *</Label>
                        <Input
                          id="registerFullName"
                          value={registerData.fullName}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder="Seu nome completo"
                          className="mt-1"
                          disabled={isRegisteringAccount}
                        />
                      </div>
                      <div>
                        <Label htmlFor="registerEmail">Email *</Label>
                        <Input
                          id="registerEmail"
                          type="email"
                          value={registerData.email}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="seu@email.com"
                          className="mt-1"
                          disabled={isRegisteringAccount}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="registerPassword">Senha *</Label>
                          <Input
                            id="registerPassword"
                            type="password"
                            value={registerData.password}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                            placeholder="Mínimo 6 caracteres"
                            className="mt-1"
                            disabled={isRegisteringAccount}
                          />
                        </div>
                        <div>
                          <Label htmlFor="registerConfirmPassword">Confirmar Senha *</Label>
                          <Input
                            id="registerConfirmPassword"
                            type="password"
                            value={registerData.confirmPassword}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            placeholder="Confirme sua senha"
                            className="mt-1"
                            disabled={isRegisteringAccount}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="registerCpf">CPF *</Label>
                          <Input
                            id="registerCpf"
                            value={registerData.cpf}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, cpf: e.target.value }))}
                            placeholder="000.000.000-00"
                            className="mt-1"
                            disabled={isRegisteringAccount}
                          />
                        </div>
                        <div>
                          <Label htmlFor="registerPhone">Telefone *</Label>
                          <Input
                            id="registerPhone"
                            value={registerData.phone}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, phone: e.target.value }))}
                            placeholder="(00) 00000-0000"
                            className="mt-1"
                            disabled={isRegisteringAccount}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="registerBirthDate">Data de Nascimento</Label>
                          <Input
                            id="registerBirthDate"
                            type="date"
                            value={registerData.birthDate}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, birthDate: e.target.value }))}
                            className="mt-1"
                            disabled={isRegisteringAccount}
                          />
                        </div>
                        <div>
                          <Label htmlFor="registerGender">Gênero</Label>
                          <select
                            id="registerGender"
                            value={registerData.gender}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, gender: e.target.value }))}
                            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isRegisteringAccount}
                          >
                            <option value="">Selecione</option>
                            <option value="M">Masculino</option>
                            <option value="F">Feminino</option>
                            <option value="O">Outro</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          id="lgpdConsent"
                          checked={lgpdConsent}
                          onChange={(e) => setLgpdConsent(e.target.checked)}
                          className="mt-1"
                          disabled={isRegisteringAccount}
                        />
                        <Label htmlFor="lgpdConsent" className="text-sm cursor-pointer">
                          Concordo com os termos de privacidade e tratamento de dados pessoais (LGPD) *
                        </Label>
                      </div>
                      <Button
                        type="button"
                        onClick={handleRegister}
                        disabled={
                          !registerData.fullName ||
                          !registerData.email ||
                          !registerData.password ||
                          !registerData.confirmPassword ||
                          !registerData.cpf ||
                          !registerData.phone ||
                          !lgpdConsent ||
                          isRegisteringAccount
                        }
                        className="w-full"
                      >
                        {isRegisteringAccount ? "Criando conta..." : "Criar Conta"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Show user data if logged in */}
            {user && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-4">Meus Dados</h3>
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="fullName">Nome Completo *</Label>
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        disabled
                        className="mt-1 bg-muted"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          disabled
                          className="mt-1 bg-muted"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Telefone *</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          disabled
                          className="mt-1 bg-muted"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="cpf">CPF *</Label>
                      <Input
                        id="cpf"
                        value={formData.cpf}
                        disabled
                        className="mt-1 bg-muted"
                      />
                    </div>
                  </div>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsRegisteringOther(true);
                      setFormData({
                        fullName: "",
                        email: "",
                        phone: "",
                        cpf: "",
                      });
                      setOtherPersonId(null);
                    }}
                    className="w-full mt-4"
                  >
                    Inscrever outra pessoa
                  </Button>
                </div>
              </>
            )}

            {/* Register other person section */}
            {user && isRegisteringOther && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-4">Inscrever Outra Pessoa</h3>
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="searchCpf">CPF da pessoa *</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id="searchCpf"
                          value={searchCpf}
                          onChange={(e) => setSearchCpf(e.target.value)}
                          placeholder="000.000.000-00"
                          disabled={isSearchingProfile}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchCpf) {
                              handleSearchProfile();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={handleSearchProfile}
                          disabled={!searchCpf || isSearchingProfile}
                        >
                          {isSearchingProfile ? "Buscando..." : "Buscar"}
                        </Button>
                      </div>
                    </div>
                    {otherPersonId && (
                      <>
                        <div>
                          <Label htmlFor="otherFullName">Nome Completo *</Label>
                          <Input
                            id="otherFullName"
                            value={formData.fullName}
                            disabled
                            className="mt-1 bg-muted"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="otherEmail">Email *</Label>
                            <Input
                              id="otherEmail"
                              type="email"
                              value={formData.email}
                              disabled
                              className="mt-1 bg-muted"
                            />
                          </div>
                          <div>
                            <Label htmlFor="otherPhone">Telefone *</Label>
                            <Input
                              id="otherPhone"
                              value={formData.phone}
                              disabled
                              className="mt-1 bg-muted"
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="otherCpf">CPF *</Label>
                          <Input
                            id="otherCpf"
                            value={formData.cpf}
                            disabled
                            className="mt-1 bg-muted"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsRegisteringOther(false);
                      setSearchCpf("");
                      setOtherPersonId(null);
                      // Reload user data
                      if (user) {
                        const loadUserData = async () => {
                          try {
                            const profileResponse = await getOwnProfile();
                            if (profileResponse.success && profileResponse.data) {
                              const profile = profileResponse.data;
                              setFormData({
                                fullName: profile.full_name || "",
                                email: user.email || "",
                                phone: profile.phone || "",
                                cpf: profile.cpf || "",
                              });
                            }
                          } catch (error) {
                            console.error("Error loading user profile:", error);
                          }
                        };
                        loadUserData();
                      }
                    }}
                    className="w-full mt-4"
                  >
                    Voltar para meus dados
                  </Button>
                </div>
              </>
            )}

            {/* Navigation button */}
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleNextStep}
                disabled={!user || (isRegisteringOther && !otherPersonId)}
                className="min-w-32"
              >
                Próximo
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Category Selection */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Check if user is logged in but doesn't have runner role */}
            {user && !user.roles?.includes('runner') && (
              <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                      Acesso como Corredor Necessário
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Apenas perfis de corredor podem se inscrever em eventos. Por favor, acesse com uma conta de corredor para continuar.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Only show category selection if user is runner or not logged in */}
            {(!user || user.roles?.includes('runner')) && (
              <>
                <h3 className="text-lg font-semibold">Escolha a Modalidade</h3>
                {loadingCategories ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Carregando categorias...</p>
                </CardContent>
              </Card>
            ) : categories.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground mb-2">
                    Nenhuma categoria disponível para este evento.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Entre em contato com o organizador para mais informações.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={async () => {
                      setLoadingCategories(true);
                      try {
                        const response = await getEventCategories(event.id);
                        if (response.success && response.data) {
                          setCategories(response.data);
                          toast.success('Categorias recarregadas!');
                        } else {
                          toast.error('Erro ao recarregar categorias');
                        }
                      } catch (error) {
                        toast.error('Erro ao recarregar categorias');
                      } finally {
                        setLoadingCategories(false);
                      }
                    }}
                  >
                    Tentar Novamente
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4">
                  {categories.map((category) => {
                    const isFull = category.max_participants !== null && 
                                  category.available_spots !== null && 
                                  category.available_spots <= 0;
                    
                    return (
                      <Card
                        key={category.id}
                        className={`transition-all hover:shadow-md ${
                          isFull 
                            ? "opacity-60 cursor-not-allowed" 
                            : "cursor-pointer"
                        } ${
                          selectedCategory?.id === category.id
                            ? "ring-2 ring-primary"
                            : ""
                        }`}
                        onClick={() => !isFull && handleCategorySelect(category)}
                      >
                      <CardContent className="p-4 flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold">{category.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {category.distance}
                          </p>
                        </div>
                        <div className="text-right">
                          {(() => {
                            const now = new Date();
                            // Filtrar lotes ativos (data já chegou) e ordenar por data (mais recente primeiro)
                            const activeBatches = (category.batches || [])
                              .filter(batch => {
                                if (!batch.valid_from) return false;
                                const batchDate = new Date(batch.valid_from);
                                return !isNaN(batchDate.getTime()) && batchDate <= now;
                              })
                              .sort((a, b) => {
                                const dateA = new Date(a.valid_from!);
                                const dateB = new Date(b.valid_from!);
                                // Ordenar do mais recente para o mais antigo
                                return dateB.getTime() - dateA.getTime();
                              });
                            
                            // Se houver lotes ativos, mostrar APENAS o mais recente (ocultar anteriores)
                            if (activeBatches.length > 0) {
                              const currentBatch = activeBatches[0]; // Lote mais recente ativo
                              const isSelected = selectedCategory?.id === category.id && selectedBatch?.id === currentBatch.id;
                              
                              // Calcular o número do lote (baseado na ordem original de criação)
                              const allBatches = (category.batches || [])
                                .filter(b => b.valid_from)
                                .sort((a, b) => {
                                  const dateA = new Date(a.valid_from!);
                                  const dateB = new Date(b.valid_from!);
                                  return dateA.getTime() - dateB.getTime();
                                });
                              const batchNumber = allBatches.findIndex(b => b.id === currentBatch.id) + 1;
                              
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCategorySelect(category);
                                    handleBatchSelect(currentBatch);
                                  }}
                                  className={`text-left px-2 py-1 rounded text-sm transition-all ${
                                    isSelected
                                      ? "bg-primary text-primary-foreground font-semibold"
                                      : "bg-muted hover:bg-muted/80"
                                  }`}
                                >
                                  <div className="flex justify-between items-center">
                                    <span>{batchNumber}º lote</span>
                                    <span className="font-bold ml-2">
                                      {formatPrice(currentBatch.price)}
                                    </span>
                                  </div>
                                </button>
                              );
                            }
                            
                            // Se não houver lotes ativos, mostrar apenas o preço inicial
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCategorySelect(category);
                                  setSelectedBatch(null);
                                }}
                                className={`text-left px-2 py-1 rounded text-sm transition-all ${
                                  selectedCategory?.id === category.id && !selectedBatch
                                    ? "bg-primary text-primary-foreground font-semibold"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span>Preço inicial</span>
                                  <span className="font-bold ml-2">
                                    {formatPrice(category.price)}
                                  </span>
                                </div>
                              </button>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={handlePreviousStep}
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={handleNextStep}
                    disabled={!selectedCategory || (() => {
                      // If category has active batches, require batch selection
                      if (selectedCategory.batches && selectedCategory.batches.length > 0) {
                        const now = new Date();
                        const activeBatches = selectedCategory.batches
                          .filter(batch => {
                            if (!batch.valid_from) return false;
                            const batchDate = new Date(batch.valid_from);
                            return !isNaN(batchDate.getTime()) && batchDate <= now;
                          })
                          .sort((a, b) => {
                            const dateA = new Date(a.valid_from!);
                            const dateB = new Date(b.valid_from!);
                            return dateB.getTime() - dateA.getTime();
                          });
                        if (activeBatches.length > 0) {
                          // Se houver lote ativo, deve estar selecionado
                          return !selectedBatch || selectedBatch.id !== activeBatches[0].id;
                        }
                      }
                      return false;
                    })()}
                    className="min-w-32"
                  >
                    Próximo
                  </Button>
                </div>
              </>
            )}
              </>
            )}
          </div>
        )}

        {/* Step 3: Kit & Shirt Size Selection */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Escolha o Kit</h3>
              {kits.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">Nenhum kit disponível para este evento.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {kits.map((kit) => {
                    const isExpanded = expandedKits.has(kit.id);
                    const isSelected = selectedKit?.id === kit.id;
                    const kitProducts = kit.products || [];
                    const hasVariableProducts = kitProducts.some(p => p.type === 'variable');
                    const selectedProduct = selectedProducts.get(kit.id);
                    const selectedProductData = selectedProduct ? kitProducts.find(p => p.id === selectedProduct.productId) : null;
                    const needsVariantSelection = selectedProductData?.type === 'variable' && !selectedProduct?.variantId;
                    
                    return (
                      <Card
                        key={kit.id}
                        className={`transition-all hover:shadow-md ${
                          isSelected ? "ring-2 ring-primary" : ""
                        }`}
                      >
                        {kitProducts.length > 0 ? (
                          <Collapsible 
                            open={isExpanded} 
                            onOpenChange={(open) => {
                              console.log('🔄 Collapsible onOpenChange:', { kitId: kit.id, kitName: kit.name, open, isExpanded });
                              if (open) {
                                setExpandedKits(prev => {
                                  const newSet = new Set(prev);
                                  newSet.add(kit.id);
                                  console.log('✅ Kit expandido:', kit.id, 'Expanded kits:', Array.from(newSet));
                                  return newSet;
                                });
                              } else {
                                setExpandedKits(prev => {
                                  const newSet = new Set(prev);
                                  newSet.delete(kit.id);
                                  console.log('❌ Kit colapsado:', kit.id, 'Expanded kits:', Array.from(newSet));
                                  return newSet;
                                });
                              }
                            }}
                          >
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className="w-full text-left p-4 flex justify-between items-start cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Also select the kit when clicking to expand (skip validation to allow viewing products)
                                  console.log('🔘 CollapsibleTrigger clicked:', { kitId: kit.id, kitName: kit.name, isSelected });
                                  if (!isSelected) {
                                    handleKitSelect(kit, true);
                                  }
                                }}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold">{kit.name}</h4>
                                    {isSelected && (
                                      <Badge variant="default" className="text-xs">Kit Selecionado</Badge>
                                    )}
                                  </div>
                                  {kit.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {kit.description}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {kitProducts.length} produto{kitProducts.length > 1 ? 's' : ''} disponível{kitProducts.length > 1 ? 'eis' : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  <div className="text-right">
                                    <p className="text-xl font-bold text-primary">
                                      {kit.price === 0
                                        ? "Incluso"
                                        : `+ ${formatPrice(kit.price)}`}
                                    </p>
                                  </div>
                                  <div className="ml-2">
                                    {isExpanded ? (
                                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>
                              </button>
                            </CollapsibleTrigger>
                          
                            <CollapsibleContent>
                              <div className="px-4 pb-4 space-y-4 border-t">
                                <div className="pt-4 space-y-4">
                                  {/* Show products with their info */}
                                  {kitProducts.map((product) => (
                                    <div key={product.id} className="space-y-3">
                                      <div className="space-y-1">
                                        <h5 className="font-semibold text-base">{product.name}</h5>
                                        {product.description && (
                                          <p className="text-sm text-muted-foreground">
                                            {product.description}
                                          </p>
                                        )}
                                      </div>
                                      
                                      {/* Show variants if product is variable */}
                                      {product.type === 'variable' && product.variants && product.variants.length > 0 && (() => {
                                        // Use saved variant_attributes if available, otherwise reconstruct from variants
                                        const savedAttributeNames = (product as any).variant_attributes as string[] | undefined;
                                        
                                        let attributeOrder: string[] = [];
                                        
                                        if (savedAttributeNames && savedAttributeNames.length > 0) {
                                          // Use saved attribute names
                                          attributeOrder = savedAttributeNames;
                                        } else {
                                          // Fallback: Extract attribute order from variants
                                          // The variant_group_name is the first attribute, and name contains all values separated by " - "
                                          
                                          // First, collect all unique variant_group_name values (first attribute)
                                          const firstAttributes = new Set<string>();
                                          product.variants.forEach(variant => {
                                            if (variant.variant_group_name) {
                                              firstAttributes.add(variant.variant_group_name);
                                            }
                                          });
                                          
                                          // Use the first variant_group_name as the first attribute
                                          if (firstAttributes.size > 0) {
                                            attributeOrder.push(Array.from(firstAttributes)[0]);
                                          }
                                          
                                          // Parse variant names to extract additional attributes
                                          // Find the maximum number of values in any variant name
                                          let maxValues = 0;
                                          product.variants.forEach(variant => {
                                            const values = variant.name.split(' - ').map(v => v.trim());
                                            maxValues = Math.max(maxValues, values.length);
                                          });
                                          
                                          // For each position after the first, use generic names
                                          for (let i = 1; i < maxValues; i++) {
                                            attributeOrder.push(`Atributo ${i + 1}`);
                                          }
                                        }
                                        
                                        // Get current selections for this product
                                        const productKey = `${kit.id}-${product.id}`;
                                        const selections = variantSelections.get(productKey) || {};
                                        
                                        // Filter variants based on previous selections
                                        const getAvailableVariants = (attributeIndex: number): ProductVariant[] => {
                                          return product.variants.filter(variant => {
                                            const variantValues = variant.name.split(' - ').map(v => v.trim());
                                            
                                            // Check all previous attributes
                                            for (let i = 0; i < attributeIndex; i++) {
                                              const attrName = attributeOrder[i];
                                              const selectedValue = selections[attrName];
                                              
                                              if (selectedValue) {
                                                // All attributes use values from the variant name
                                                if (variantValues[i]?.trim() !== selectedValue) {
                                                  return false;
                                                }
                                              }
                                            }
                                            
                                            // Check availability
                                            return variant.available_quantity === null || variant.available_quantity > 0;
                                          });
                                        };
                                        
                                        // Get available values for current attribute
                                        const getAvailableValues = (attributeIndex: number): string[] => {
                                          const availableVariants = getAvailableVariants(attributeIndex);
                                          const values = new Set<string>();
                                          
                                          availableVariants.forEach(variant => {
                                            // Always parse the variant name to get values
                                            const variantValues = variant.name.split(' - ').map(v => v.trim());
                                            
                                            // All attributes use values from the variant name
                                            if (variantValues[attributeIndex]) {
                                              values.add(variantValues[attributeIndex]);
                                            }
                                          });
                                          
                                          return Array.from(values).sort();
                                        };
                                        
                                        return (
                                          <div className="space-y-4 ml-2">
                                            {attributeOrder.map((attrName, attrIndex) => {
                                              const availableValues = getAvailableValues(attrIndex);
                                              const selectedValue = selections[attrName];
                                              
                                              // Don't show this attribute if previous attribute is not selected
                                              if (attrIndex > 0) {
                                                const prevAttrName = attributeOrder[attrIndex - 1];
                                                if (!selections[prevAttrName]) {
                                                  return null;
                                                }
                                              }
                                              
                                              return (
                                                <div key={attrName} className="space-y-2">
                                                  <Label className="text-sm font-semibold">
                                                    {attrName}
                                                  </Label>
                                                  <RadioGroup
                                                    value={selectedValue || ""}
                                                    onValueChange={(value) => {
                                                      const newSelections = { ...selections };
                                                      newSelections[attrName] = value;
                                                      
                                                      // Clear subsequent selections when a previous one changes
                                                      attributeOrder.slice(attrIndex + 1).forEach(clearAttr => {
                                                        delete newSelections[clearAttr];
                                                      });
                                                      
                                                      setVariantSelections(new Map(variantSelections.set(productKey, newSelections)));
                                                      
                                                      // Find the final variant if all attributes are selected
                                                      if (Object.keys(newSelections).length === attributeOrder.length) {
                                                        const finalVariant = product.variants.find(v => {
                                                          const variantValues = v.name.split(' - ').map(val => val.trim());
                                                          
                                                          // Check all attributes
                                                          for (let i = 0; i < attributeOrder.length; i++) {
                                                            const attrName = attributeOrder[i];
                                                            const selectedValue = newSelections[attrName];
                                                            if (variantValues[i]?.trim() !== selectedValue) {
                                                              return false;
                                                            }
                                                          }
                                                          
                                                          return true;
                                                        });
                                                        
                                                        if (finalVariant) {
                                                          handleVariantSelect(finalVariant.id, product.id, kit.id);
                                                        }
                                                      }
                                                    }}
                                                    className={`grid gap-3 ${
                                                      availableValues.length <= 3 ? 'grid-cols-3' : 
                                                      availableValues.length <= 4 ? 'grid-cols-4' : 
                                                      availableValues.length <= 6 ? 'grid-cols-6' : 'grid-cols-3'
                                                    }`}
                                                  >
                                                    {availableValues.map((value) => {
                                                      const isSelected = selectedValue === value;
                                                      
                                                      return (
                                                        <div key={value}>
                                                          <RadioGroupItem
                                                            value={value}
                                                            id={`${productKey}-${attrName}-${value}`}
                                                            className="peer sr-only"
                                                          />
                                                          <Label
                                                            htmlFor={`${productKey}-${attrName}-${value}`}
                                                            className={`flex flex-col items-center justify-center rounded-md border-2 px-3 py-2 cursor-pointer transition-all ${
                                                              isSelected
                                                                ? "border-primary bg-primary text-primary-foreground"
                                                                : "border-muted bg-background hover:bg-accent hover:text-accent-foreground"
                                                            }`}
                                                          >
                                                            <span className="font-medium">{value}</span>
                                                          </Label>
                                                        </div>
                                                      );
                                                    })}
                                                  </RadioGroup>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  ))}
                                  
                                  {/* Show message if no products */}
                                  {kitProducts.length === 0 && (
                                    <div className="text-center py-4 text-muted-foreground">
                                      <p>Nenhum produto disponível para este kit.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ) : (
                          <CardContent 
                            className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleKitSelect(kit)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold">{kit.name}</h4>
                                  {isSelected && (
                                    <Badge variant="default" className="text-xs">Kit Selecionado</Badge>
                                  )}
                                </div>
                                {kit.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {kit.description}
                                  </p>
                                )}
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-xl font-bold text-primary">
                                  {kit.price === 0
                                    ? "Incluso"
                                    : `+ ${formatPrice(kit.price)}`}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>


            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handlePreviousStep}>
                Voltar
              </Button>
              <Button
                onClick={handleNextStep}
                disabled={(() => {
                  if (!selectedKit) return true;
                  
                  // Check if kit has variable products that need variant selection
                  if (selectedKit.products && selectedKit.products.length > 0) {
                    const variableProducts = selectedKit.products.filter(p => p.type === 'variable' && p.variants && p.variants.length > 0);
                    if (variableProducts.length > 0) {
                      // Check if at least one variant is selected (since we don't require product selection anymore)
                      const selectedProduct = selectedProducts.get(selectedKit.id);
                      if (!selectedProduct?.variantId) {
                        return true; // Disable if no variant is selected
                      }
                    }
                  }
                  
                  return false;
                })()}
                className="min-w-32"
              >
                Próximo
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Checkout */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Dados Pessoais</h3>
              
              {!user ? (
                // User not logged in - show login form
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="loginEmail">Email *</Label>
                    <Input
                      id="loginEmail"
                      type="email"
                      value={loginData.email}
                      onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="seu@email.com"
                      className="mt-1"
                      disabled={isLoggingIn}
                    />
                  </div>
                  <div>
                    <Label htmlFor="loginPassword">Senha *</Label>
                    <Input
                      id="loginPassword"
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Sua senha"
                      className="mt-1"
                      disabled={isLoggingIn}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && loginData.email && loginData.password) {
                          handleLogin();
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleLogin}
                    disabled={!loginData.email || !loginData.password || isLoggingIn}
                    className="w-full"
                  >
                    {isLoggingIn ? "Entrando..." : "Entrar"}
                  </Button>
                    </div>
                  ) : (
                // User logged in - show user data (disabled fields)
                <div className="space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="fullName">Nome Completo *</Label>
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        disabled
                        className="mt-1 bg-muted"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          disabled
                          className="mt-1 bg-muted"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Telefone *</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          disabled
                          className="mt-1 bg-muted"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="cpf">CPF *</Label>
                      <Input
                        id="cpf"
                        value={formData.cpf}
                        disabled
                        className="mt-1 bg-muted"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="text-lg font-semibold mb-4">Resumo da Compra</h3>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <span>Modalidade:</span>
                    <span className="font-medium">{selectedCategory?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kit:</span>
                    <span className="font-medium">{selectedKit?.name}</span>
                  </div>
                  {/* Display selected product and variant attributes */}
                  {selectedKit && selectedKit.products && selectedKit.products.length > 0 && (() => {
                    const selectedProduct = selectedProducts.get(selectedKit.id);
                    if (selectedProduct?.variantId) {
                      // Find the selected variant
                      const product = selectedKit.products.find(p => p.id === selectedProduct.productId);
                      const variant = product?.variants?.find(v => v.id === selectedProduct.variantId);
                      
                      if (variant && product) {
                        // Get attribute names from product
                        const attributeNames = (product as any).variant_attributes as string[] | undefined;
                        
                        // Parse variant name to get values
                        const variantValues = variant.name.split(' - ').map(v => v.trim());
                        
                        // Build compact display string
                        if (product.type === 'variable' && attributeNames && attributeNames.length > 0) {
                          const variantDetails = attributeNames
                            .map((attrName, idx) => {
                              const value = variantValues[idx];
                              return value ? `${attrName}: ${value}` : null;
                            })
                            .filter(Boolean)
                            .join(', ');
                          
                          return (
                            <div className="flex justify-between text-xs">
                              <span className="text-foreground/80">{product.name}</span>
                              <span className="text-muted-foreground">{variantDetails}</span>
                            </div>
                          );
                        } else if (variant) {
                          // Fallback: show product and variant name
                          return (
                            <div className="flex justify-between text-xs">
                              <span className="text-foreground/80">{product.name}</span>
                              <span className="text-muted-foreground">{variant.name}</span>
                            </div>
                          );
                        }
                      }
                    }
                    return null;
                  })()}
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span>Valor da modalidade:</span>
                    <span>
                      {formatPrice(selectedBatch?.price || selectedCategory?.price || 0)}
                      {selectedBatch && (() => {
                        // Encontrar o número do lote baseado na ordem original de criação
                        const allBatches = (selectedCategory?.batches || [])
                          .filter(batch => batch.valid_from)
                          .sort((a, b) => {
                            const dateA = new Date(a.valid_from!);
                            const dateB = new Date(b.valid_from!);
                            return dateA.getTime() - dateB.getTime();
                          });
                        const batchIndex = allBatches.findIndex(b => b.id === selectedBatch.id);
                        return batchIndex >= 0 ? (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({batchIndex + 1}º lote)
                          </span>
                        ) : null;
                      })()}
                    </span>
                  </div>
                  {selectedKit && selectedKit.price > 0 && (
                    <div className="flex justify-between items-center">
                      <span>Valor do kit:</span>
                      <span>{formatPrice(selectedKit.price)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">{formatPrice(totalPrice)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handlePreviousStep}>
                Voltar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !user || // User must be logged in
                  isSubmitting ||
                  !formData.fullName ||
                  !formData.email ||
                  !formData.phone ||
                  !formData.cpf ||
                  (isRegisteringOther && !otherPersonId) // If registering other person, must have found profile
                }
                className="min-w-32"
              >
                {isSubmitting ? "Processando..." : "Finalizar Inscrição"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Confirmation Ticket / Payment */}
        {step === 5 && (
          <div className="space-y-6 text-center">
            {/* Show QR Code PIX if payment is pending */}
            {paymentData && paymentData.pix_qr_code && paymentStatus === 'pending' && (
              <div className="space-y-4">
                <PixQrCode
                  pixQrCode={paymentData.pix_qr_code}
                  value={totalPrice}
                  dueDate={paymentData.due_date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  registrationId={confirmationCode}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/runner/dashboard?tab=registrations&subtab=pending");
                  }}
                >
                  <List className="w-4 h-4 mr-2" />
                  Visualizar Inscrições
                </Button>
              </div>
            )}

            {/* Show payment error/warning if exists */}
            {paymentData && (paymentData.error || paymentData.warning) && (
              <Card className="border-yellow-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-yellow-600 mb-2">
                    <span className="text-lg">⚠️</span>
                    <p className="font-medium">Aviso sobre o pagamento</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {paymentData.warning || paymentData.error}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Show success message if payment is confirmed */}
            {paymentStatus === 'paid' && (
              <Card className="border-green-500">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-16 w-16 text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-center mb-2">
                    Pagamento Confirmado!
                  </h3>
                  <p className="text-center text-muted-foreground">
                    Sua inscrição foi confirmada com sucesso
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center">
              {paymentStatus === 'paid' ? (
                <CheckCircle2 className="w-20 h-20 text-green-500" />
              ) : paymentData && paymentData.pix_qr_code ? (
                <CheckCircle2 className="w-20 h-20 text-yellow-500" />
              ) : (
                <CheckCircle2 className="w-20 h-20 text-accent" />
              )}
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-2">
                {paymentStatus === 'paid' 
                  ? 'Inscrição Confirmada!' 
                  : totalPrice > 0 && paymentData && paymentData.pix_qr_code
                  ? 'Inscrição Criada - Aguardando Pagamento'
                  : totalPrice > 0 && paymentData
                  ? 'Inscrição Criada - Aguardando Pagamento'
                  : totalPrice > 0
                  ? 'Inscrição Criada - Aguardando Pagamento'
                  : 'Inscrição Confirmada!'}
              </h3>
              <p className="text-muted-foreground">
                {paymentStatus === 'paid'
                  ? 'Sua inscrição foi confirmada com sucesso'
                  : totalPrice > 0
                  ? 'Complete o pagamento para confirmar sua inscrição'
                  : 'Sua inscrição foi realizada com sucesso'}
              </p>
            </div>

            <Card className="text-left">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Ticket className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Código de Confirmação</p>
                    <p className="text-xl font-bold font-mono">{confirmationCode}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-3">{event.title}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span>
                        {format(new Date(event.event_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span>
                        {event.location} - {event.city}, {event.state}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Atleta:</span>
                    <span className="font-medium">{formData.fullName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Modalidade:</span>
                    <span className="font-medium">{selectedCategory?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kit:</span>
                    <span className="font-medium">{selectedKit?.name}</span>
                  </div>
                  {/* Display selected product and variant attributes */}
                  {selectedKit && selectedKit.products && selectedKit.products.length > 0 && (() => {
                    const selectedProduct = selectedProducts.get(selectedKit.id);
                    if (selectedProduct?.variantId) {
                      // Find the selected variant
                      const product = selectedKit.products.find(p => p.id === selectedProduct.productId);
                      const variant = product?.variants?.find(v => v.id === selectedProduct.variantId);
                      
                      if (variant && product) {
                        // Get attribute names from product
                        const attributeNames = (product as any).variant_attributes as string[] | undefined;
                        
                        // Parse variant name to get values
                        const variantValues = variant.name.split(' - ').map(v => v.trim());
                        
                        // Build compact display string
                        if (product.type === 'variable' && attributeNames && attributeNames.length > 0) {
                          const variantDetails = attributeNames
                            .map((attrName, idx) => {
                              const value = variantValues[idx];
                              return value ? `${attrName}: ${value}` : null;
                            })
                            .filter(Boolean)
                            .join(', ');
                          
                          return (
                            <div className="flex justify-between text-xs">
                              <span className="text-foreground/80">{product.name}</span>
                              <span className="text-muted-foreground">{variantDetails}</span>
                            </div>
                          );
                        } else if (variant) {
                          // Fallback: show product and variant name
                          return (
                            <div className="flex justify-between text-xs">
                              <span className="text-foreground/80">{product.name}</span>
                              <span className="text-muted-foreground">{variant.name}</span>
                            </div>
                          );
                        }
                      }
                    }
                    return null;
                  })()}
                  <div className="flex justify-between text-sm font-bold pt-2">
                    <span>Total Pago:</span>
                    <span className="text-primary">{formatPrice(totalPrice)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {paymentStatus === 'paid' && (
              <div className="bg-muted p-4 rounded-lg text-sm text-left">
                <p className="font-semibold mb-2">Próximos Passos:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Enviamos um email de confirmação para {formData.email}</li>
                  <li>• Você pode retirar seu kit 2 dias antes do evento</li>
                  <li>• Leve um documento com foto no dia da prova</li>
                </ul>
              </div>
            )}
            
            {totalPrice > 0 && paymentStatus === 'pending' && (
              <div className="bg-muted p-4 rounded-lg text-sm text-left">
                <p className="font-semibold mb-2">Aguardando Pagamento:</p>
                <ul className="space-y-1 text-muted-foreground">
                  {paymentData && paymentData.pix_qr_code ? (
                    <>
                      <li>• Escaneie o QR Code acima ou copie o código PIX</li>
                      <li>• O pagamento será confirmado automaticamente</li>
                      <li>• Você receberá um email quando o pagamento for confirmado</li>
                    </>
                  ) : paymentData && paymentData.asaas_payment_id ? (
                    <>
                      <li>• Aguardando geração do QR Code PIX...</li>
                      <li>• O QR Code aparecerá em instantes</li>
                      <li>• Você receberá um email quando o pagamento for confirmado</li>
                    </>
                  ) : (
                    <>
                      <li>• Aguardando processamento do pagamento...</li>
                      <li>• Entre em contato com o suporte se o problema persistir</li>
                    </>
                  )}
                </ul>
              </div>
            )}
            
            {totalPrice === 0 && (
              <div className="bg-muted p-4 rounded-lg text-sm text-left">
                <p className="font-semibold mb-2">Próximos Passos:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Enviamos um email de confirmação para {formData.email}</li>
                  <li>• Você pode retirar seu kit 2 dias antes do evento</li>
                  <li>• Leve um documento com foto no dia da prova</li>
                </ul>
              </div>
            )}

            {/* Botões de ação - mostrar apenas quando pagamento confirmado ou evento gratuito */}
            {(paymentStatus === 'paid' || totalPrice === 0) && (
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => {
                    onOpenChange(false);
                    if (registrationId) {
                      navigate(`/registration/validate/${registrationId}`);
                    }
                  }}
                >
                  <Ticket className="w-4 h-4 mr-2" />
                  Visualizar Inscrição
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => setIsTransferDialogOpen(true)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Transferir
                </Button>
              </div>
            )}
            
            {/* Quando pagamento está pendente sem QR code, mostrar botão Minhas Inscrições */}
            {paymentStatus === 'pending' && totalPrice > 0 && !paymentData?.pix_qr_code && (
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/runner/dashboard?tab=registrations&subtab=pending");
                  }}
                >
                  <List className="w-4 h-4 mr-2" />
                  Minhas Inscrições
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Transfer Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Inscrição</DialogTitle>
            <DialogDescription>
              Informe o email e CPF da pessoa que irá receber a inscrição de {event.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-email">Email do novo titular</Label>
              <Input
                id="transfer-email"
                type="email"
                placeholder="email@exemplo.com"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-cpf">CPF do novo titular</Label>
              <Input
                id="transfer-cpf"
                placeholder="000.000.000-00"
                value={transferCpf}
                onChange={(e) => setTransferCpf(e.target.value)}
                maxLength={14}
              />
              <p className="text-xs text-muted-foreground">
                A pessoa deve estar cadastrada na plataforma com este email e CPF
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsTransferDialogOpen(false);
                setTransferEmail("");
                setTransferCpf("");
              }}
              disabled={isTransferring}
            >
              Cancelar
            </Button>
            <Button 
              onClick={async () => {
                if (!transferEmail.trim() || !transferCpf.trim() || !registrationId) {
                  toast.error("Preencha o email e CPF");
                  return;
                }

                setIsTransferring(true);
                try {
                  const response = await transferRegistration(registrationId, transferEmail.trim(), transferCpf.trim());
                  if (response.success) {
                    toast.success(response.message || "Inscrição transferida com sucesso!");
                    setIsTransferDialogOpen(false);
                    setTransferEmail("");
                    setTransferCpf("");
                    handleReset();
                  } else {
                    toast.error(response.error || response.message || "Erro ao transferir inscrição");
                  }
                } catch (error: any) {
                  console.error("Error transferring registration:", error);
                  toast.error(error.message || "Erro ao transferir inscrição");
                } finally {
                  setIsTransferring(false);
                }
              }}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transferindo...
                </>
              ) : (
                "Confirmar Transferência"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

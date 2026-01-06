import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, Calendar, MapPin, Ticket, Download, ChevronDown, ChevronUp, List, Eye } from "lucide-react";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getOwnProfile, getPublicProfileByCpf } from "@/lib/api/profiles";
import { createRegistration, getPaymentStatus } from "@/lib/api/registrations";
import { PixQrCode } from "@/components/payment/PixQrCode";
import { CreditCardForm } from "@/components/payment/CreditCardForm";
import { CreditCardData, CreditCardHolderInfo } from "@/lib/api/registrations";
import { getEventCategories, EventCategory, CategoryBatch } from "@/lib/api/eventCategories";
import { EventKit, KitProduct, ProductVariant } from "@/lib/api/eventKits";
import { validateCoupon } from "@/lib/api/coupons";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategoriesByModality, type Category as CategoryType, type CategoryGender, type CategoryType as CategoryTypeEnum } from "@/lib/api/categories";

// Re-export ProductVariant type for use in component
type ProductVariantType = ProductVariant;
import { toast } from "sonner";

// Utility function to calculate age from birth date
const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

interface Category extends EventCategory {
  batches?: CategoryBatch[];
}

interface NewCategory extends CategoryType {
  available_spots?: number | null;
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
  if (price === 0) return ""; // Retorna espaço em branco ao invés de "Grátis"
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
  const [searchParams] = useSearchParams();
  const { user, login, register } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedModality, setSelectedModality] = useState<Modality | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<NewCategory | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<CategoryBatch | null>(null);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [availableCategories, setAvailableCategories] = useState<NewCategory[]>([]);
  const [loadingModalities, setLoadingModalities] = useState(false);
  const [selectedKit, setSelectedKit] = useState<Kit | null>(null);
  const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Map<string, { productId: string; variantId?: string }>>(new Map());
  // State for cascading variant selection: { productId: { attributeName: selectedValue } }
  const [variantSelections, setVariantSelections] = useState<Map<string, Record<string, string>>>(new Map());
  const [shirtSize, setShirtSize] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'pix' | 'credit_card' | null>(null);
  const [creditCardData, setCreditCardData] = useState<{
    credit_card: CreditCardData;
    credit_card_holder_info: CreditCardHolderInfo;
  } | null>(null);
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

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; type: 'percentage' | 'fixed' } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Senior discount state
  const [seniorDiscountEnabled, setSeniorDiscountEnabled] = useState(false);
  const [userProfile, setUserProfile] = useState<{ birth_date?: string } | null>(null);
  const [otherPersonProfile, setOtherPersonProfile] = useState<{ birth_date?: string } | null>(null);

  // Platform fee state
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [platformFeeType, setPlatformFeeType] = useState<'fixed' | 'percentage'>('fixed');
  const [platformFeesEnabled, setPlatformFeesEnabled] = useState(false);

  // Calculate total price based on selected batch or category price
  const categoryPrice = selectedBatch?.price || selectedCategory?.price || 0;
  const kitPrice = selectedKit?.price || 0;
  const subtotal = categoryPrice + kitPrice;
  
  // Calculate discounts
  let discountAmount = 0;
  let seniorDiscountAmount = 0;
  
  // Apply senior discount (50% for 60+ years) if enabled and user is eligible
  // Check both logged-in user profile and other person profile
  const profileToCheck = otherPersonId ? otherPersonProfile : userProfile;
  if (seniorDiscountEnabled && profileToCheck?.birth_date) {
    const age = calculateAge(profileToCheck.birth_date);
    if (age >= 60) {
      seniorDiscountAmount = subtotal * 0.5; // 50% discount
    }
  }
  
  // Apply coupon discount (if any)
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percentage') {
      discountAmount = (subtotal * appliedCoupon.discount) / 100;
    } else {
      discountAmount = appliedCoupon.discount;
    }
    // Ensure discount doesn't exceed subtotal
    discountAmount = Math.min(discountAmount, subtotal);
  }
  
  // Calculate total: subtotal - senior discount - coupon discount
  // Senior discount is applied first, then coupon discount on the remaining amount
  const totalAfterSeniorDiscount = Math.max(0, subtotal - seniorDiscountAmount);
  const totalAfterDiscounts = Math.max(0, totalAfterSeniorDiscount - discountAmount);
  
  // Calculate platform fee (applied after discounts)
  let platformFeeAmount = 0;
  if (platformFeesEnabled && platformFee > 0) {
    if (platformFeeType === 'percentage') {
      platformFeeAmount = (totalAfterDiscounts * platformFee) / 100;
    } else {
      platformFeeAmount = platformFee;
    }
  }
  
  const totalPrice = Math.max(0, totalAfterDiscounts + platformFeeAmount);

  // Load system settings and user profile when modal opens
  useEffect(() => {
    if (open) {
      // Load enabled modules to check if senior discount and platform fees are enabled
      const loadSettings = async () => {
        try {
          const response = await getEnabledModules();
          if (response.success && response.data) {
            setSeniorDiscountEnabled(response.data.enabled_modules?.senior_discount_60_plus || false);
            setPlatformFeesEnabled(response.data.enabled_modules?.platform_fees || false);
            setPlatformFee(response.data.platform_fee || 0);
            setPlatformFeeType(response.data.platform_fee_type || 'fixed');
          }
        } catch (error) {
          console.error('Erro ao carregar configurações:', error);
        }
      };

      // Load user profile if logged in
      const loadUserProfile = async () => {
        if (user) {
          try {
            const profileResponse = await getOwnProfile();
            if (profileResponse.success && profileResponse.data) {
              setUserProfile({
                birth_date: profileResponse.data.birth_date,
              });
            }
          } catch (error) {
            console.error('Erro ao carregar perfil:', error);
          }
        }
      };

      // Load modalities when modal opens
      const loadModalities = async () => {
        setLoadingModalities(true);
        try {
          const response = await getModalities(event.id);
          if (response.success && response.data) {
            setModalities(response.data);
            console.log('✅ Modalidades carregadas:', response.data.length);
          } else {
            console.error('Erro ao carregar modalidades:', response.error);
            setModalities([]);
          }
        } catch (error) {
          console.error('Erro ao carregar modalidades:', error);
          setModalities([]);
        } finally {
          setLoadingModalities(false);
        }
      };

      loadSettings();
      loadUserProfile();
      loadModalities();

      // Check for coupon code in URL and apply automatically
      const couponFromUrl = searchParams.get('cupom');
      const refFromUrl = searchParams.get('ref');
      
      console.log('🔍 URL Params:', { coupon: couponFromUrl, ref: refFromUrl, searchParams: searchParams.toString() });
      
      if (couponFromUrl && !appliedCoupon) {
        console.log('✅ Cupom encontrado na URL:', couponFromUrl);
        setCouponCode(couponFromUrl.toUpperCase().trim());
        // Auto-validate coupon from URL
        setTimeout(() => {
          handleValidateCoupon(couponFromUrl.toUpperCase().trim());
        }, 500);
      } else if (!couponFromUrl) {
        console.log('⚠️ Nenhum cupom encontrado na URL');
      }
    } else {
      // Reset states when modal closes
      setSelectedModality(null);
      setSelectedCategory(null);
      setSelectedBatch(null);
      setAvailableCategories([]);
      setStep(1);
    }
  }, [open, user, event.id, searchParams]);

  // Load other person profile when otherPersonId changes
  useEffect(() => {
    const loadOtherPersonProfile = async () => {
      if (otherPersonId) {
        try {
          const profileResponse = await getPublicProfileByCpf(searchCpf);
          if (profileResponse.success && profileResponse.data) {
            setOtherPersonProfile({
              birth_date: profileResponse.data.birth_date,
            });
          }
        } catch (error) {
          console.error('Erro ao carregar perfil da outra pessoa:', error);
        }
      } else {
        setOtherPersonProfile(null);
      }
    };

    loadOtherPersonProfile();
  }, [otherPersonId, searchCpf]);

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

  // Load categories when modality is selected
  useEffect(() => {
    const loadCategoriesForModality = async () => {
      if (selectedModality?.id) {
        setLoadingCategories(true);
        try {
          const response = await getCategoriesByModality(selectedModality.id);
          if (response.success && response.data) {
            // Filter categories based on user profile (gender, age, type)
            const profileToCheck = otherPersonId ? otherPersonProfile : userProfile;
            const userGender = otherPersonId 
              ? formData.gender?.toLowerCase() 
              : user?.profile?.gender?.toLowerCase();
            
            let filteredCategories = response.data;
            
            // Filter by gender
            if (userGender) {
              const genderMap: { [key: string]: CategoryGender } = {
                'm': 'masculino',
                'masculino': 'masculino',
                'f': 'feminino',
                'feminino': 'feminino',
                'o': 'ambos',
                'outro': 'ambos',
              };
              const normalizedGender = genderMap[userGender] || 'ambos';
              
              filteredCategories = filteredCategories.filter(cat => {
                if (cat.gender === 'ambos') return true;
                const matchesGender = cat.gender === normalizedGender;
                if (!matchesGender) {
                  console.log(`⚠️ Categoria ${cat.name} é para ${cat.gender}, mas o usuário é ${normalizedGender}`);
                }
                return matchesGender;
              });
            } else {
              // If no gender, filter out gender-specific categories
              filteredCategories = filteredCategories.filter(cat => {
                if (cat.gender === 'ambos') return true;
                console.log(`⚠️ Categoria ${cat.name} é para ${cat.gender}, mas gênero do usuário não está disponível`);
                return false;
              });
            }
            
            // Filter by age
            if (profileToCheck?.birth_date) {
              const age = calculateAge(profileToCheck.birth_date);
              filteredCategories = filteredCategories.filter(cat => {
                if (cat.min_age === null || cat.min_age === 0) return true;
                const meetsAgeRequirement = age >= cat.min_age;
                if (!meetsAgeRequirement) {
                  console.log(`⚠️ Categoria ${cat.name} requer idade mínima de ${cat.min_age} anos, mas o usuário tem ${age} anos`);
                }
                return meetsAgeRequirement;
              });
            } else {
              // If no birth date, filter out categories with age requirements
              filteredCategories = filteredCategories.filter(cat => {
                if (cat.min_age === null || cat.min_age === 0) return true;
                console.log(`⚠️ Categoria ${cat.name} requer idade mínima de ${cat.min_age} anos, mas data de nascimento não está disponível`);
                return false;
              });
            }
            
            // Add available_spots calculation (if max_participants is set)
            const categoriesWithSpots = await Promise.all(
              filteredCategories.map(async (cat) => {
                if (cat.max_participants !== null && cat.max_participants > 0) {
                  // TODO: Get current registrations count from API
                  // For now, assume available
                  return {
                    ...cat,
                    available_spots: cat.max_participants,
                  };
                }
                return {
                  ...cat,
                  available_spots: null,
                };
              })
            );
            
            setAvailableCategories(categoriesWithSpots);
            console.log('✅ Categorias carregadas para modalidade:', categoriesWithSpots.length);
          } else {
            console.error('Erro ao carregar categorias:', response.error);
            setAvailableCategories([]);
          }
        } catch (error) {
          console.error('Erro ao carregar categorias:', error);
          setAvailableCategories([]);
        } finally {
          setLoadingCategories(false);
        }
      } else {
        setAvailableCategories([]);
      }
    };
    
    loadCategoriesForModality();
  }, [selectedModality, userProfile, otherPersonProfile, otherPersonId, formData.gender]);

  const handleModalitySelect = (modality: Modality) => {
    setSelectedModality(modality);
    setSelectedCategory(null);
    setSelectedBatch(null);
  };

  const handleCategorySelect = (category: NewCategory) => {
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
      // Get referral code from URL
      const referralCodeFromUrl = searchParams.get('ref');
      
      const success = await register({
        email: registerData.email,
        password: registerData.password,
        full_name: registerData.fullName,
        cpf: registerData.cpf.replace(/\D/g, ""),
        phone: registerData.phone.replace(/\D/g, ""),
        birth_date: registerData.birthDate || undefined,
        gender: registerData.gender || undefined,
        lgpd_consent: lgpdConsent,
        referral_code: referralCodeFromUrl ? referralCodeFromUrl.toUpperCase().trim() : undefined,
      });

      if (success) {
        // Registration successful - user data will be loaded by useEffect
        // Update user profile state with birth_date for senior discount calculation
        if (registerData.birthDate) {
          setUserProfile({
            birth_date: registerData.birthDate,
          });
        }

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
        // Update other person profile for senior discount calculation
        setOtherPersonProfile({
          birth_date: profile.birth_date,
        });
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
    setStep((prev) => {
      let nextStep = prev + 1;
      
      console.log(`🔄 handleNextStep chamado:`, {
        prevStep: prev,
        nextStep: nextStep,
        totalPrice,
        categoryPrice,
        kitPrice,
        subtotal,
      });
      
      // If moving from step 5 (summary) and totalPrice is 0 (free event),
      // skip step 6 (payment method selection) and go directly to step 7 (confirmation)
      if (prev === 5 && totalPrice === 0) {
        nextStep = 7; // Skip payment method selection for free events
        // Set default payment method to pix for free events
        setSelectedPaymentMethod('pix');
        console.log(`🔄 Navegando do step ${prev} para step ${nextStep} (pulando seleção de método de pagamento - evento gratuito)`);
      } else {
        console.log(`🔄 Navegando do step ${prev} para step ${nextStep}`);
      }
      
      return nextStep;
    });
  };

  const handlePreviousStep = () => {
    setStep((prev) => {
      let previousStep = prev - 1;
      
      // If moving from step 7 (confirmation) and totalPrice is 0 (free event),
      // skip step 6 (payment method selection) and go directly to step 5 (summary)
      if (prev === 7 && totalPrice === 0) {
        previousStep = 5; // Skip payment method selection for free events
        console.log(`🔄 Voltando do step ${prev} para step ${previousStep} (pulando seleção de método de pagamento - evento gratuito)`);
      } else if (prev === 6 && totalPrice > 0) {
        // If moving from step 6 (payment method) back, go to step 5 (summary)
        previousStep = 5;
        console.log(`🔄 Voltando do step ${prev} para step ${previousStep}`);
      } else {
        console.log(`🔄 Voltando do step ${prev} para step ${previousStep}`);
      }
      
      return previousStep;
    });
  };

  const handleValidateCoupon = async (code?: string) => {
    const codeToValidate = code || couponCode.trim();
    if (!codeToValidate) {
      return;
    }

    setValidatingCoupon(true);
    setCouponError(null);
    if (code) {
      setCouponCode(code);
    }

    try {
      const response = await validateCoupon(codeToValidate, event.id);
      
      if (response.success && response.data) {
        const coupon = response.data;
        setAppliedCoupon({
          code: coupon.code,
          discount: coupon.discount_value,
          type: coupon.type,
        });
        toast.success("Cupom aplicado com sucesso!");
      } else {
        setCouponError(response.error || response.message || "Cupom inválido");
        setAppliedCoupon(null);
      }
    } catch (error: any) {
      console.error("Error validating coupon:", error);
      setCouponError(error.message || "Erro ao validar cupom");
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !selectedModality || !selectedCategory) {
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

    // Validate credit card data if payment method is credit card
    if (selectedPaymentMethod === 'credit_card' && totalPrice > 0 && !creditCardData) {
      toast.error("Por favor, preencha os dados do cartão de crédito.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Create registration
      // Use otherPersonId if registering for someone else, otherwise use logged user id
      const runnerId = otherPersonId || user.id;
      
      const registrationData: any = {
        event_id: event.id,
        runner_id: runnerId,
        category_id: selectedCategory.id,
        kit_id: selectedKit?.id,
        payment_method: selectedPaymentMethod || "pix", // Use selected payment method
        total_amount: totalPrice,
        coupon_code: appliedCoupon?.code || undefined,
      };

      // Add credit card data if payment method is credit card
      if (selectedPaymentMethod === 'credit_card' && creditCardData) {
        registrationData.credit_card = creditCardData.credit_card;
        registrationData.credit_card_holder_info = creditCardData.credit_card_holder_info;
      }

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
      
      // Store registration ID for later use
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
          } else if (payment.payment_method === 'credit_card') {
            // Credit card payment
            if (payment.status === 'CONFIRMED') {
              toast.success("Pagamento aprovado! Sua inscrição foi confirmada.");
              setPaymentStatus('paid');
            } else if (payment.status === 'PENDING' || payment.status === 'AWAITING_RISK_ANALYSIS') {
              toast.info("Pagamento em análise. Você receberá uma confirmação por email quando o pagamento for aprovado.");
              setPaymentStatus('pending');
            } else {
              toast.warning("Pagamento não foi aprovado. Entre em contato com o suporte.");
              setPaymentStatus('pending');
            }
          } else if (payment.pix_qr_code) {
            // PIX payment with QR Code
            toast.success("Inscrição criada! Escaneie o QR Code para pagar.");
            // Start polling for payment status
            startPaymentStatusPolling(response.data.id);
          } else {
            // PIX payment without QR Code yet
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

  const handleDownloadReceipt = async () => {
    if (!registrationId) {
      toast.error("ID da inscrição não encontrado");
      return;
    }

    try {
      const validationUrl = `${window.location.origin}/registration/validate/${registrationId}`;
      
      // Create PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = margin;

      // Title
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("COMPROVANTE DE INSCRIÇÃO", pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      // Event Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(event.title || "Evento", pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      // Confirmation Code
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Código: ${confirmationCode}`, margin, yPos);
      yPos += 10;

      // Registration Date
      const regDate = format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
      doc.text(`Data da Inscrição: ${regDate}`, margin, yPos);
      yPos += 15;

      // Event Details
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO EVENTO:", margin, yPos);
      yPos += 8;
      doc.setFont("helvetica", "normal");
      doc.text(`Evento: ${event.title}`, margin, yPos);
      yPos += 7;
      if (event.event_date) {
        const eventDate = format(new Date(event.event_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
        doc.text(`Data: ${eventDate}`, margin, yPos);
        yPos += 7;
      }
      if (event.location || event.city) {
        const location = event.location || `${event.city || ''}, ${event.state || ''}`.trim();
        doc.text(`Local: ${location}`, margin, yPos);
        yPos += 7;
      }
      yPos += 5;

      // Runner Details
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO CORREDOR:", margin, yPos);
      yPos += 8;
      doc.setFont("helvetica", "normal");
      doc.text(`Nome: ${formData.fullName}`, margin, yPos);
      yPos += 7;
      if (formData.cpf) {
        doc.text(`CPF: ${formData.cpf}`, margin, yPos);
        yPos += 7;
      }
      yPos += 5;

      // Registration Details
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DA INSCRIÇÃO:", margin, yPos);
      yPos += 8;
      doc.setFont("helvetica", "normal");
      if (selectedModality) {
        doc.text(`Modalidade: ${selectedModality.name} (${selectedModality.distance})`, margin, yPos);
        yPos += 7;
      }
      if (selectedCategory) {
        doc.text(`Categoria: ${selectedCategory.name}`, margin, yPos);
        yPos += 7;
      }
      if (selectedKit) {
        doc.text(`Kit: ${selectedKit.name}`, margin, yPos);
        yPos += 7;
      }
      doc.text(`Valor: R$ ${totalPrice.toFixed(2).replace('.', ',')}`, margin, yPos);
      yPos += 7;
      doc.text(`Status: Confirmada`, margin, yPos);
      yPos += 7;
      doc.text(`Status do Pagamento: Pago`, margin, yPos);
      yPos += 15;

      // QR Code
      doc.setFont("helvetica", "bold");
      doc.text("QR CODE DE VALIDAÇÃO:", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      // Generate QR Code as image
      try {
        const QRCodeLib = await import('qrcode');
        const qrCodeSize = 100;
        const qrCodeX = (pageWidth - qrCodeSize) / 2;
        
        // Generate QR code as data URL
        const qrCodeDataUrl = await QRCodeLib.default.toDataURL(validationUrl, {
          width: qrCodeSize,
          margin: 2,
        });
        
        // Add QR code image to PDF
        doc.addImage(qrCodeDataUrl, 'PNG', qrCodeX, yPos, qrCodeSize, qrCodeSize);
        yPos += qrCodeSize + 10;
      } catch (qrError) {
        console.error('Error generating QR code:', qrError);
        doc.text("QR Code não disponível", pageWidth / 2, yPos, { align: "center" });
        yPos += 10;
      }

      // Footer
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text("Escaneie o QR Code acima para validar sua inscrição", pageWidth / 2, yPos, { align: "center" });
      yPos += 7;
      doc.text(`URL: ${validationUrl}`, pageWidth / 2, yPos, { align: "center" });

      // Save PDF
      const fileName = `comprovante_${confirmationCode}_${Date.now()}.pdf`;
      doc.save(fileName);
      
      toast.success("Comprovante baixado com sucesso!");
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast.error("Erro ao gerar comprovante");
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedCategory(null);
    setSelectedBatch(null);
    setSelectedKit(null);
    setCouponCode("");
    setAppliedCoupon(null);
    setCouponError(null);
    setExpandedKits(new Set());
    setSelectedProducts(new Map());
    setVariantSelections(new Map());
    setShirtSize("");
    setConfirmationCode("");
    setRegistrationId(null);
    setPaymentData(null);
    setPaymentStatus('pending');
    setIsPollingPayment(false);
    setSelectedPaymentMethod(null);
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
      setRegistrationId(null);
      setCouponCode("");
      setAppliedCoupon(null);
      setCouponError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {step === 7 
              ? (totalPrice > 0 && paymentStatus === 'pending' 
                  ? "Pagamento Pendente" 
                  : "Confirmação de Inscrição")
              : `Inscrição - ${event.title}`}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Faça login ou crie uma conta para continuar"}
            {step === 2 && "Selecione a modalidade desejada"}
            {step === 3 && "Selecione a categoria"}
            {step === 4 && "Escolha o kit e configure os produtos"}
            {step === 5 && "Revise seus dados e resumo da compra"}
            {step === 6 && "Escolha o método de pagamento"}
            {step === 7 && (
              totalPrice > 0 && paymentStatus === 'pending'
                ? "Complete o pagamento para confirmar sua inscrição"
                : "Sua inscrição foi confirmada com sucesso"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        {step <= 6 && (
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3, 4, 5, 6].map((s) => (
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
                {s < 6 && (
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

        {/* Step 2: Modality Selection */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Check if user is logged in but doesn't have runner, organizer or admin role */}
            {user && !user.roles?.includes('runner') && !user.roles?.includes('organizer') && !user.roles?.includes('admin') && (
              <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                      Acesso Necessário
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Apenas perfis de corredor, organizador ou administrador podem se inscrever em eventos.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Only show modality selection if user is runner, organizer, admin or not logged in */}
            {(!user || user.roles?.includes('runner') || user.roles?.includes('organizer') || user.roles?.includes('admin')) && (
              <>
                <h3 className="text-lg font-semibold">Escolha a Modalidade</h3>
                {loadingModalities ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">Carregando modalidades...</p>
                    </CardContent>
                  </Card>
                ) : modalities.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground mb-2">
                        Nenhuma modalidade disponível para este evento.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Entre em contato com o organizador para mais informações.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid gap-4">
                      {modalities.map((modality) => (
                        <Card
                          key={modality.id}
                          className={`transition-all hover:shadow-md cursor-pointer ${
                            selectedModality?.id === modality.id
                              ? "ring-2 ring-primary"
                              : ""
                          }`}
                          onClick={() => handleModalitySelect(modality)}
                        >
                          <CardContent className="p-4 flex justify-between items-center">
                            <div>
                              <h4 className="font-semibold">{modality.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {modality.distance}
                              </p>
                            </div>
                            {selectedModality?.id === modality.id && (
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            )}
                          </CardContent>
                        </Card>
                      ))}
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
                        disabled={!selectedModality}
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

        {/* Step 3: Category Selection */}
        {step === 3 && (
          <div className="space-y-4">
            {selectedModality && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Modalidade selecionada: <span className="font-semibold">{selectedModality.name} ({selectedModality.distance})</span>
                </p>
              </div>
            )}
            
            <h3 className="text-lg font-semibold">Escolha a Categoria</h3>
            {loadingCategories ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Carregando categorias...</p>
                </CardContent>
              </Card>
            ) : availableCategories.length === 0 ? (
              <>
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground mb-2">
                      {selectedModality 
                        ? "Nenhuma categoria disponível para esta modalidade."
                        : "Selecione uma modalidade primeiro."}
                    </p>
                    {selectedModality && (!userProfile?.birth_date && !otherPersonProfile?.birth_date) && (
                      <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-2">
                        ⚠️ Algumas categorias podem não aparecer porque sua data de nascimento não está cadastrada.
                      </p>
                    )}
                    {selectedModality && (!user?.profile?.gender && !formData.gender) && (
                      <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-2">
                        ⚠️ Algumas categorias podem não aparecer porque seu gênero não está cadastrado.
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Entre em contato com o organizador para mais informações.
                    </p>
                  </CardContent>
                </Card>
                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={handlePreviousStep}
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={handlePreviousStep}
                    variant="outline"
                  >
                    Voltar para Modalidades
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-4">
                  {availableCategories.map((category) => {
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
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-semibold">{category.name}</h4>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge variant="outline">{category.category_type}</Badge>
                                <Badge variant="outline">
                                  {category.gender === 'ambos' ? 'Ambos' : category.gender === 'masculino' ? 'Masculino' : 'Feminino'}
                                </Badge>
                                {category.min_age && (
                                  <Badge variant="outline">Idade mínima: {category.min_age} anos</Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold">
                                {formatPrice(category.price)}
                              </div>
                            </div>
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
                    disabled={!selectedCategory}
                  >
                    Próximo
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Kit & Shirt Size Selection */}
        {step === 4 && (
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
                                        // Debug log
                                        console.log('🔍 Product variants:', product.variants);
                                        console.log('🔍 Product variant_attributes:', (product as any).variant_attributes);
                                        
                                        // Use saved variant_attributes if available, otherwise reconstruct from variants
                                        const savedAttributeNames = (product as any).variant_attributes as string[] | undefined;
                                        
                                        let attributeOrder: string[] = [];
                                        
                                        if (savedAttributeNames && savedAttributeNames.length > 0) {
                                          // Use saved attribute names
                                          attributeOrder = savedAttributeNames;
                                          console.log('✅ Usando atributos salvos:', attributeOrder);
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
                                          
                                          // Debug log
                                          console.log(`🔍 getAvailableValues - attributeIndex: ${attributeIndex}, availableVariants:`, availableVariants.length);
                                          
                                          if (availableVariants.length === 0) {
                                            console.warn('⚠️ Nenhuma variante disponível para o atributo', attributeIndex);
                                            return [];
                                          }
                                          
                                          // Preserve order from variants (first occurrence order)
                                          // Instead of sorting, maintain the order as they appear in variants
                                          const orderedValues: string[] = [];
                                          const seen = new Set<string>();
                                          
                                          availableVariants.forEach(variant => {
                                            // Always parse the variant name to get values
                                            const variantValues = variant.name.split(' - ').map(v => v.trim());
                                            
                                            // Debug log
                                            console.log(`🔍 Variant: ${variant.name}, parsed values:`, variantValues, `attributeIndex: ${attributeIndex}`);
                                            
                                            // All attributes use values from the variant name
                                            if (variantValues[attributeIndex] && !seen.has(variantValues[attributeIndex])) {
                                              orderedValues.push(variantValues[attributeIndex]);
                                              seen.add(variantValues[attributeIndex]);
                                              console.log(`✅ Adicionado valor: ${variantValues[attributeIndex]}`);
                                            }
                                          });
                                          
                                          console.log(`✅ Valores disponíveis para atributo ${attributeIndex}:`, orderedValues);
                                          
                                          return orderedValues;
                                        };
                                        
                                        console.log('🔍 attributeOrder:', attributeOrder);
                                        console.log('🔍 selections:', selections);
                                        
                                        return (
                                          <div className="space-y-4 ml-2">
                                            {attributeOrder.map((attrName, attrIndex) => {
                                              const availableValues = getAvailableValues(attrIndex);
                                              const selectedValue = selections[attrName];
                                              
                                              console.log(`🔍 Atributo ${attrIndex} (${attrName}):`, {
                                                availableValues,
                                                selectedValue,
                                                count: availableValues.length
                                              });
                                              
                                              // Don't show this attribute if previous attribute is not selected
                                              if (attrIndex > 0) {
                                                const prevAttrName = attributeOrder[attrIndex - 1];
                                                if (!selections[prevAttrName]) {
                                                  console.log(`⏭️ Pulando atributo ${attrIndex} porque o anterior não foi selecionado`);
                                                  return null;
                                                }
                                              }
                                              
                                              // Don't show if no values available
                                              if (availableValues.length === 0) {
                                                console.warn(`⚠️ Nenhum valor disponível para atributo ${attrIndex} (${attrName})`);
                                                return null;
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

        {/* Step 5: Resumo da Compra */}
        {step === 5 && (
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
                  {selectedModality && (
                    <div className="flex justify-between">
                      <span>Modalidade:</span>
                      <span className="font-medium">{selectedModality.name} ({selectedModality.distance})</span>
                    </div>
                  )}
                  {selectedCategory && (
                    <div className="flex justify-between">
                      <span>Categoria:</span>
                      <span className="font-medium">{selectedCategory.name}</span>
                    </div>
                  )}
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
                  {/* Coupon input */}
                  <div className="space-y-2">
                    <Label htmlFor="couponCode">Cupom de Desconto</Label>
                    <div className="flex gap-2">
                      <Input
                        id="couponCode"
                        placeholder="Digite o código do cupom"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && couponCode.trim()) {
                            handleValidateCoupon();
                          }
                        }}
                        disabled={validatingCoupon || !!appliedCoupon}
                        className="flex-1"
                      />
                      {appliedCoupon ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponCode("");
                            setCouponError(null);
                          }}
                        >
                          Remover
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleValidateCoupon()}
                          disabled={!couponCode.trim() || validatingCoupon}
                        >
                          {validatingCoupon ? "Validando..." : "Aplicar"}
                        </Button>
                      )}
                    </div>
                    {couponError && (
                      <p className="text-xs text-destructive">{couponError}</p>
                    )}
                    {appliedCoupon && (
                      <p className="text-xs text-green-600">
                        Cupom {appliedCoupon.code} aplicado com sucesso!
                      </p>
                    )}
                  </div>
                  {seniorDiscountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-green-600">
                      <span>Desconto 60+ (50%):</span>
                      <span className="font-semibold">-{formatPrice(seniorDiscountAmount)}</span>
                    </div>
                  )}
                  {appliedCoupon && discountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-green-600">
                      <span>Desconto ({appliedCoupon.code}):</span>
                      <span className="font-semibold">-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  {platformFeeAmount > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span>Taxa da Plataforma {platformFeeType === 'percentage' ? `(${platformFee}%)` : ''}:</span>
                      <span className="font-semibold">+{formatPrice(platformFeeAmount)}</span>
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
              {totalPrice > 0 ? (
                <Button
                  onClick={handleNextStep}
                  disabled={
                    !user || // User must be logged in
                    !formData.fullName ||
                    !formData.email ||
                    !formData.phone ||
                    !formData.cpf ||
                    (isRegisteringOther && !otherPersonId) // If registering other person, must have found profile
                  }
                  className="min-w-32"
                >
                  Ir para Pagamento
                </Button>
              ) : (
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
              )}
            </div>
          </div>
        )}

        {/* Step 6: Payment Method Selection */}
        {step === 6 && (
          <div className="space-y-6">
            {(() => {
              console.log('🔍 Step 6 - Debug:', {
                step,
                totalPrice,
                shouldShowPaymentSelection: totalPrice > 0,
                selectedPaymentMethod,
              });
              return null;
            })()}
            {totalPrice > 0 ? (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-4">Escolha o Método de Pagamento</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Selecione como deseja pagar sua inscrição
                  </p>
                  
                  <RadioGroup 
                    value={selectedPaymentMethod || undefined}
                    onValueChange={(value) => setSelectedPaymentMethod(value as 'pix' | 'credit_card')}
                    className="grid gap-4"
                  >
                    <Card 
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedPaymentMethod === 'pix' ? 'border-primary border-2 bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedPaymentMethod('pix')}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-2xl">📱</span>
                            </div>
                            <div>
                              <h4 className="font-semibold">PIX</h4>
                              <p className="text-sm text-muted-foreground">
                                Aprovação instantânea
                              </p>
                            </div>
                          </div>
                          <RadioGroupItem 
                            value="pix" 
                            className="ml-auto"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedPaymentMethod === 'credit_card' ? 'border-primary border-2 bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedPaymentMethod('credit_card')}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-2xl">💳</span>
                            </div>
                            <div>
                              <h4 className="font-semibold">Cartão de Crédito</h4>
                              <p className="text-sm text-muted-foreground">
                                Pagamento seguro e rápido
                              </p>
                            </div>
                          </div>
                          <RadioGroupItem 
                            value="credit_card" 
                            className="ml-auto"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </RadioGroup>
                </div>

                {/* Credit Card Form - only show if credit card is selected */}
                {selectedPaymentMethod === 'credit_card' && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Dados do Cartão de Crédito</h3>
                    <CreditCardForm
                      onSubmit={(data) => {
                        setCreditCardData(data);
                        // Call handleSubmit with credit card data
                        const submitWithCardData = async () => {
                          if (!user || !selectedModality || !selectedCategory) {
                            toast.error("Erro: usuário não autenticado ou categoria não selecionada");
                            return;
                          }

                          // Validate event status and dates (same as handleSubmit)
                          if (event.status) {
                            if (event.status === "draft") {
                              toast.error("Este evento ainda não está aberto para inscrições.");
                              return;
                            }
                            if (event.status === "finished" || event.status === "cancelled") {
                              toast.error("Este evento não está mais aceitando inscrições.");
                              return;
                            }
                            if (event.status !== "published" && event.status !== "ongoing") {
                              toast.error("Este evento não está aberto para inscrições no momento.");
                              return;
                            }
                          }

                          const eventDate = new Date(event.event_date);
                          const now = new Date();
                          if (eventDate < now) {
                            toast.error("Não é possível se inscrever em eventos que já aconteceram.");
                            return;
                          }

                          if (selectedCategory.max_participants !== null && 
                              selectedCategory.available_spots !== null && 
                              selectedCategory.available_spots <= 0) {
                            toast.error("Esta categoria está esgotada. Por favor, escolha outra categoria.");
                            return;
                          }

                          setIsSubmitting(true);
                          try {
                            const runnerId = otherPersonId || user.id;
                            
                            const registrationData: any = {
                              event_id: event.id,
                              runner_id: runnerId,
                              category_id: selectedCategory.id,
                              kit_id: selectedKit?.id,
                              payment_method: 'credit_card',
                              total_amount: totalPrice,
                              coupon_code: appliedCoupon?.code || undefined,
                              credit_card: data.credit_card,
                              credit_card_holder_info: data.credit_card_holder_info,
                            };

                            const response = await createRegistration(registrationData);

                            if (!response.success) {
                              throw new Error(response.error || "Erro ao criar inscrição");
                            }

                            const code = response.data?.confirmation_code || 
                              `CONF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
                            setConfirmationCode(code);
                            
                            if (response.data?.id) {
                              setRegistrationId(response.data.id);
                            }

                            const requiresPayment = totalPrice > 0;
                            const payment = (response.data as any)?.payment;
                            
                            if (requiresPayment && payment) {
                              setPaymentData(payment);
                              
                              if (payment.error || payment.warning) {
                                toast.warning(payment.warning || payment.error || "Inscrição criada, mas houve um problema com o pagamento");
                              } else if (payment.status === 'CONFIRMED') {
                                toast.success("Pagamento aprovado! Sua inscrição foi confirmada.");
                                setPaymentStatus('paid');
                              } else if (payment.status === 'PENDING' || payment.status === 'AWAITING_RISK_ANALYSIS') {
                                toast.info("Pagamento em análise. Você receberá uma confirmação por email quando o pagamento for aprovado.");
                                setPaymentStatus('pending');
                              } else {
                                toast.warning("Pagamento não foi aprovado. Entre em contato com o suporte.");
                                setPaymentStatus('pending');
                              }
                            } else {
                              toast.success("Inscrição realizada com sucesso!");
                              setPaymentStatus('paid');
                            }
                            
                            handleNextStep();
                          } catch (error: any) {
                            console.error("Error creating registration:", error);
                            toast.error(error.message || "Erro ao finalizar inscrição");
                          } finally {
                            setIsSubmitting(false);
                          }
                        };
                        
                        submitWithCardData();
                      }}
                      onCancel={() => {
                        setSelectedPaymentMethod(null);
                        handlePreviousStep();
                      }}
                      isLoading={isSubmitting}
                    />
                  </div>
                )}

                {/* Show submit button for PIX or if credit card form is not shown */}
                {selectedPaymentMethod !== 'credit_card' && (
                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={handlePreviousStep}>
                      Voltar
                    </Button>
                    <Button 
                      onClick={handleSubmit}
                      disabled={
                        !selectedPaymentMethod ||
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
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  Este evento é gratuito. Não é necessário selecionar método de pagamento.
                </p>
                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={handlePreviousStep}>
                    Voltar
                  </Button>
                  <Button onClick={handleNextStep}>
                    Continuar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 7: Confirmation Ticket / Payment */}
        {step === 7 && (
          <div className="space-y-6 text-center">
            {/* Show QR Code PIX if payment is pending */}
            {paymentData && paymentData.pix_qr_code && paymentStatus === 'pending' && paymentData.payment_method !== 'credit_card' && (
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

            {/* Show credit card payment status */}
            {paymentData && paymentData.payment_method === 'credit_card' && (
              <div className="space-y-4">
                {paymentStatus === 'paid' ? (
                  <Card className="border-green-500">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-green-600 mb-2">
                        <CheckCircle2 className="w-6 h-6" />
                        <p className="font-medium text-lg">Pagamento Aprovado!</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Seu pagamento foi aprovado e sua inscrição está confirmada.
                      </p>
                    </CardContent>
                  </Card>
                ) : paymentData.status === 'PENDING' || paymentData.status === 'AWAITING_RISK_ANALYSIS' ? (
                  <Card className="border-yellow-500">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-yellow-600 mb-2">
                        <span className="text-lg">⏳</span>
                        <p className="font-medium text-lg">Pagamento em Análise</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Seu pagamento está sendo analisado. Você receberá uma confirmação por email quando o pagamento for aprovado.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-red-500">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-red-600 mb-2">
                        <span className="text-lg">❌</span>
                        <p className="font-medium text-lg">Pagamento Não Aprovado</p>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Seu pagamento não foi aprovado. Entre em contato com o suporte para mais informações.
                      </p>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setStep(6); // Go back to payment method selection
                          setSelectedPaymentMethod(null);
                          setCreditCardData(null);
                        }}
                      >
                        Tentar Outro Método de Pagamento
                      </Button>
                    </CardContent>
                  </Card>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/runner/dashboard?tab=registrations");
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
                  ? 'Pagamento confirmado!' 
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
                  ? `Sua inscrição ao evento ${event.title} foi concluída com sucesso.`
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
                  {selectedModality && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Modalidade:</span>
                      <span className="font-medium">{selectedModality.name} ({selectedModality.distance})</span>
                    </div>
                  )}
                  {selectedCategory && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Categoria:</span>
                      <span className="font-medium">{selectedCategory.name}</span>
                    </div>
                  )}
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
                {registrationId ? (
                  <>
                    <Button 
                      variant="outline" 
                      className="flex-1" 
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/registration/validate/${registrationId}`);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Visualizar Inscrição
                    </Button>
                    <Button 
                      className="flex-1"
                      onClick={handleDownloadReceipt}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Inscrição
                    </Button>
                  </>
                ) : (
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Fechar
              </Button>
                )}
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
    </Dialog>
  );
}



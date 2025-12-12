import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getDashboardRoute } from "@/lib/utils/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { maskCpf, maskPhone, maskCep, unmask } from "@/lib/utils/masks";
import { validateCpf, validateCep, validatePhone, validateEmail, validatePassword } from "@/lib/utils/validators";
import { fetchAddressByCep } from "@/lib/api/viacep";

interface MultiStepRegistrationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RegistrationData {
  // Etapa 1: Dados Pessoais
  cpf: string;
  birthDate: string;
  phone: string;
  fullName: string;
  preferredName: string;
  gender: 'M' | 'F' | '';
  
  // Etapa 2: Endereço
  postalCode: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  
  // Etapa 3: Credenciais
  email: string;
  confirmEmail: string;
  password: string;
  confirmPassword: string;
  
  // Etapa 4: Termos
  lgpdConsent: boolean;
}

interface StepErrors {
  [key: string]: string;
}

export function MultiStepRegistration({ open, onOpenChange }: MultiStepRegistrationProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<StepErrors>({});
  const [loadingCep, setLoadingCep] = useState(false);
  const [referralCode, setReferralCode] = useState<string>("");

  // Estado para todos os dados do formulário
  const [formData, setFormData] = useState<RegistrationData>({
    // Etapa 1
    cpf: '',
    birthDate: '',
    phone: '',
    fullName: '',
    preferredName: '',
    gender: '',
    
    // Etapa 2
    postalCode: '',
    street: '',
    addressNumber: '',
    addressComplement: '',
    neighborhood: '',
    city: '',
    state: '',
    
    // Etapa 3
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: '',
    
    // Etapa 4
    lgpdConsent: false,
  });

  // Carregar código de referência da URL
  useEffect(() => {
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) {
      setReferralCode(refFromUrl.toUpperCase().trim());
    }
  }, [searchParams]);

  // Carregar dados do localStorage ao abrir o dialog
  useEffect(() => {
    if (open) {
      const savedData = localStorage.getItem('registration_form_data');
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setFormData(prev => ({ ...prev, ...parsed }));
        } catch (error) {
          console.error('Erro ao carregar dados salvos:', error);
        }
      }
      
      // Carregar referral code salvo se não vier da URL
      const savedReferralCode = localStorage.getItem('registration_referral_code');
      if (savedReferralCode && !searchParams.get('ref')) {
        setReferralCode(savedReferralCode);
      }
    }
  }, [open, searchParams]);

  // Salvar dados no localStorage sempre que houver mudanças
  useEffect(() => {
    if (open) {
      localStorage.setItem('registration_form_data', JSON.stringify(formData));
      if (referralCode) {
        localStorage.setItem('registration_referral_code', referralCode);
      }
    }
  }, [formData, referralCode, open]);

  // Limpar dados ao fechar o dialog
  useEffect(() => {
    if (!open) {
      // Limpar após um delay para não perder dados se o dialog for reaberto rapidamente
      setTimeout(() => {
        localStorage.removeItem('registration_form_data');
        setFormData({
          cpf: '',
          birthDate: '',
          phone: '',
          fullName: '',
          preferredName: '',
          gender: '',
          postalCode: '',
          street: '',
          addressNumber: '',
          addressComplement: '',
          neighborhood: '',
          city: '',
          state: '',
          email: '',
          confirmEmail: '',
          password: '',
          confirmPassword: '',
          lgpdConsent: false,
        });
        setCurrentStep(1);
        setErrors({});
      }, 500);
    }
  }, [open]);

  // Atualizar campo do formulário
  const updateField = (field: keyof RegistrationData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Buscar endereço por CEP
  const handleCepChange = async (cep: string) => {
    // Aplicar máscara
    const maskedCep = maskCep(cep);
    updateField('postalCode', maskedCep);
    
    // Buscar endereço quando CEP estiver completo
    const cleanCep = unmask(maskedCep);
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      try {
        const address = await fetchAddressByCep(maskedCep);
        
        if (address) {
          updateField('street', address.logradouro || '');
          updateField('neighborhood', address.bairro || '');
          updateField('city', address.localidade || '');
          updateField('state', address.uf || '');
          
          // Limpar erro de CEP se encontrado
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.postalCode;
            return newErrors;
          });
        } else {
          toast.error('CEP não encontrado');
          setErrors(prev => ({ ...prev, postalCode: 'CEP não encontrado' }));
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
        toast.error('Erro ao buscar endereço. Tente novamente.');
      } finally {
        setLoadingCep(false);
      }
    }
  };

  // Validação básica por etapa
  const validateStep = (step: number): boolean => {
    const newErrors: StepErrors = {};

    switch (step) {
      case 1:
        // Validar Etapa 1: Dados Pessoais
        if (!formData.cpf || !validateCpf(formData.cpf)) {
          newErrors.cpf = 'CPF inválido';
        }
        if (!formData.birthDate) {
          newErrors.birthDate = 'Data de nascimento é obrigatória';
        }
        if (!formData.phone || !validatePhone(formData.phone)) {
          newErrors.phone = 'Telefone inválido';
        }
        if (!formData.fullName || formData.fullName.trim().length < 3) {
          newErrors.fullName = 'Nome completo deve ter pelo menos 3 caracteres';
        }
        if (!formData.gender) {
          newErrors.gender = 'Selecione o sexo';
        }
        break;

      case 2:
        // Validar Etapa 2: Endereço
        if (!formData.postalCode || !validateCep(formData.postalCode)) {
          newErrors.postalCode = 'CEP inválido';
        }
        if (!formData.street || formData.street.trim().length < 3) {
          newErrors.street = 'Logradouro é obrigatório';
        }
        if (!formData.addressNumber || formData.addressNumber.trim().length === 0) {
          newErrors.addressNumber = 'Número é obrigatório';
        }
        if (!formData.neighborhood || formData.neighborhood.trim().length < 2) {
          newErrors.neighborhood = 'Bairro é obrigatório';
        }
        if (!formData.city || formData.city.trim().length < 2) {
          newErrors.city = 'Cidade é obrigatória';
        }
        if (!formData.state || formData.state.length !== 2) {
          newErrors.state = 'Estado é obrigatório';
        }
        break;

      case 3:
        // Validar Etapa 3: Credenciais
        if (!formData.email || !validateEmail(formData.email)) {
          newErrors.email = 'E-mail inválido';
        }
        if (formData.email && formData.confirmEmail && formData.email !== formData.confirmEmail) {
          newErrors.confirmEmail = 'E-mails não correspondem';
        }
        if (!formData.password || formData.password.length < 6) {
          newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
        }
        if (formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword) {
          newErrors.confirmPassword = 'Senhas não correspondem';
        }
        break;

      case 4:
        // Validar Etapa 4: Termos
        if (!formData.lgpdConsent) {
          newErrors.lgpdConsent = 'Você deve aceitar os termos para continuar';
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Navegar para próxima etapa
  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 4) {
        setCurrentStep(prev => prev + 1);
      }
    } else {
      toast.error('Por favor, corrija os erros antes de continuar');
    }
  };

  // Navegar para etapa anterior
  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      setErrors({});
    }
  };

  // Finalizar cadastro
  const handleSubmit = async () => {
    if (!validateStep(4)) {
      toast.error('Por favor, aceite os termos para finalizar');
      return;
    }

    setLoading(true);

    try {
      const success = await register({
        email: formData.email,
        password: formData.password,
        full_name: formData.fullName,
        cpf: unmask(formData.cpf),
        phone: unmask(formData.phone),
        gender: formData.gender as 'M' | 'F',
        birth_date: formData.birthDate,
        preferred_name: formData.preferredName || undefined,
        postal_code: unmask(formData.postalCode) || undefined,
        street: formData.street || undefined,
        address_number: formData.addressNumber || undefined,
        address_complement: formData.addressComplement || undefined,
        neighborhood: formData.neighborhood || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        lgpd_consent: formData.lgpdConsent,
        referral_code: referralCode || undefined,
      });

      if (success) {
        // Limpar dados salvos
        localStorage.removeItem('registration_form_data');
        localStorage.removeItem('registration_referral_code');
        onOpenChange(false);
        const message = referralCode 
          ? 'Cadastro realizado com sucesso! Você foi referenciado por um líder de grupo.'
          : 'Cadastro realizado com sucesso!';
        toast.success(message);
        
        setTimeout(() => {
          const currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
          navigate(getDashboardRoute(currentUser as any));
        }, 100);
      }
    } catch (error: any) {
      console.error('Erro ao cadastrar:', error);
      
      // Tratar erros específicos do backend
      if (error.message?.includes('Email already registered') || error.message?.includes('email')) {
        toast.error('Este e-mail já está cadastrado. Tente fazer login.');
        setCurrentStep(3);
        setErrors({ email: 'Este e-mail já está cadastrado' });
      } else if (error.message?.includes('CPF already registered') || error.message?.includes('cpf')) {
        toast.error('Este CPF já está cadastrado.');
        setCurrentStep(1);
        setErrors({ cpf: 'Este CPF já está cadastrado' });
      } else {
        toast.error(error.message || 'Erro ao realizar cadastro. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Renderizar indicador de progresso
  const renderProgressIndicator = () => {
    return (
      <div className="flex items-center justify-between mb-6">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center flex-1">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                currentStep >= step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step}
            </div>
            {step < 4 && (
              <div
                className={`flex-1 h-1 mx-2 transition-colors ${
                  currentStep > step ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Renderizar etapa 1: Dados Pessoais
  const renderStep1 = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF *</Label>
          <Input
            id="cpf"
            placeholder="000.000.000-00"
            value={formData.cpf}
            onChange={(e) => updateField('cpf', maskCpf(e.target.value))}
            maxLength={14}
            className={errors.cpf ? "border-destructive" : ""}
          />
          {errors.cpf && <p className="text-sm text-destructive">{errors.cpf}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="birthDate">Data de Nascimento *</Label>
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) => updateField('birthDate', e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className={errors.birthDate ? "border-destructive" : ""}
          />
          {errors.birthDate && <p className="text-sm text-destructive">{errors.birthDate}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Contato/Telefone *</Label>
          <Input
            id="phone"
            placeholder="(00) 00000-0000"
            value={formData.phone}
            onChange={(e) => updateField('phone', maskPhone(e.target.value))}
            maxLength={15}
            className={errors.phone ? "border-destructive" : ""}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">Nome Completo *</Label>
          <Input
            id="fullName"
            placeholder="João da Silva"
            value={formData.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
            className={errors.fullName ? "border-destructive" : ""}
          />
          {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredName">Como você quer ser chamado(a)?</Label>
          <Input
            id="preferredName"
            placeholder="João"
            value={formData.preferredName}
            onChange={(e) => updateField('preferredName', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Sexo *</Label>
          <RadioGroup
            value={formData.gender}
            onValueChange={(value) => updateField('gender', value as 'M' | 'F')}
            className="flex gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="M" id="gender-m" />
              <Label htmlFor="gender-m" className="cursor-pointer">Masculino</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="F" id="gender-f" />
              <Label htmlFor="gender-f" className="cursor-pointer">Feminino</Label>
            </div>
          </RadioGroup>
          {errors.gender && <p className="text-sm text-destructive">{errors.gender}</p>}
        </div>
      </div>
    );
  };

  // Renderizar etapa 2: Endereço
  const renderStep2 = () => {
    // Lista de estados brasileiros
    const estados = [
      { value: 'AC', label: 'Acre' },
      { value: 'AL', label: 'Alagoas' },
      { value: 'AP', label: 'Amapá' },
      { value: 'AM', label: 'Amazonas' },
      { value: 'BA', label: 'Bahia' },
      { value: 'CE', label: 'Ceará' },
      { value: 'DF', label: 'Distrito Federal' },
      { value: 'ES', label: 'Espírito Santo' },
      { value: 'GO', label: 'Goiás' },
      { value: 'MA', label: 'Maranhão' },
      { value: 'MT', label: 'Mato Grosso' },
      { value: 'MS', label: 'Mato Grosso do Sul' },
      { value: 'MG', label: 'Minas Gerais' },
      { value: 'PA', label: 'Pará' },
      { value: 'PB', label: 'Paraíba' },
      { value: 'PR', label: 'Paraná' },
      { value: 'PE', label: 'Pernambuco' },
      { value: 'PI', label: 'Piauí' },
      { value: 'RJ', label: 'Rio de Janeiro' },
      { value: 'RN', label: 'Rio Grande do Norte' },
      { value: 'RS', label: 'Rio Grande do Sul' },
      { value: 'RO', label: 'Rondônia' },
      { value: 'RR', label: 'Roraima' },
      { value: 'SC', label: 'Santa Catarina' },
      { value: 'SP', label: 'São Paulo' },
      { value: 'SE', label: 'Sergipe' },
      { value: 'TO', label: 'Tocantins' },
    ];

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="postalCode">CEP *</Label>
          <div className="relative">
            <Input
              id="postalCode"
              placeholder="00000-000"
              value={formData.postalCode}
              onChange={(e) => handleCepChange(e.target.value)}
              maxLength={9}
              className={errors.postalCode ? "border-destructive" : ""}
              disabled={loadingCep}
            />
            {loadingCep && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {errors.postalCode && <p className="text-sm text-destructive">{errors.postalCode}</p>}
          <p className="text-xs text-muted-foreground">Digite o CEP para buscar o endereço automaticamente</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="street">Logradouro *</Label>
          <Input
            id="street"
            placeholder="Rua, Avenida, etc."
            value={formData.street}
            onChange={(e) => updateField('street', e.target.value)}
            className={errors.street ? "border-destructive" : ""}
            disabled={loadingCep}
          />
          {errors.street && <p className="text-sm text-destructive">{errors.street}</p>}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2 col-span-1">
            <Label htmlFor="addressNumber">Número *</Label>
            <Input
              id="addressNumber"
              placeholder="123"
              value={formData.addressNumber}
              onChange={(e) => updateField('addressNumber', e.target.value)}
              className={errors.addressNumber ? "border-destructive" : ""}
            />
            {errors.addressNumber && <p className="text-sm text-destructive">{errors.addressNumber}</p>}
          </div>

          <div className="space-y-2 col-span-2">
            <Label htmlFor="addressComplement">Complemento</Label>
            <Input
              id="addressComplement"
              placeholder="Apto, Bloco, etc."
              value={formData.addressComplement}
              onChange={(e) => updateField('addressComplement', e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="neighborhood">Bairro *</Label>
          <Input
            id="neighborhood"
            placeholder="Nome do bairro"
            value={formData.neighborhood}
            onChange={(e) => updateField('neighborhood', e.target.value)}
            className={errors.neighborhood ? "border-destructive" : ""}
            disabled={loadingCep}
          />
          {errors.neighborhood && <p className="text-sm text-destructive">{errors.neighborhood}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">Cidade *</Label>
            <Input
              id="city"
              placeholder="Nome da cidade"
              value={formData.city}
              onChange={(e) => updateField('city', e.target.value)}
              className={errors.city ? "border-destructive" : ""}
              disabled={loadingCep}
            />
            {errors.city && <p className="text-sm text-destructive">{errors.city}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">Estado *</Label>
            <Select
              value={formData.state}
              onValueChange={(value) => updateField('state', value)}
              disabled={loadingCep}
            >
              <SelectTrigger className={errors.state ? "border-destructive" : ""}>
                <SelectValue placeholder="Selecione o estado" />
              </SelectTrigger>
              <SelectContent>
                {estados.map((estado) => (
                  <SelectItem key={estado.value} value={estado.value}>
                    {estado.label} ({estado.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.state && <p className="text-sm text-destructive">{errors.state}</p>}
          </div>
        </div>
      </div>
    );
  };

  // Renderizar etapa 3: Credenciais
  const renderStep3 = () => {
    const passwordValidation = validatePassword(formData.password);
    const passwordStrength = formData.password.length >= 8 ? 'strong' : formData.password.length >= 6 ? 'medium' : 'weak';

    return (
      <div className="space-y-4">
        {/* Referral Code - Only show if present */}
        {referralCode && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Código de Referência</Label>
                <p className="text-sm font-semibold text-primary">{referralCode}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Você está se cadastrando através de um líder de grupo
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReferralCode("");
                  localStorage.removeItem('registration_referral_code');
                }}
              >
                Remover
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">E-mail *</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value.toLowerCase().trim())}
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmEmail">Confirme seu e-mail *</Label>
          <Input
            id="confirmEmail"
            type="email"
            placeholder="seu@email.com"
            value={formData.confirmEmail}
            onChange={(e) => updateField('confirmEmail', e.target.value.toLowerCase().trim())}
            className={errors.confirmEmail ? "border-destructive" : ""}
          />
          {errors.confirmEmail && <p className="text-sm text-destructive">{errors.confirmEmail}</p>}
          {formData.email && formData.confirmEmail && formData.email === formData.confirmEmail && (
            <p className="text-sm text-green-600">✓ E-mails correspondem</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha *</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => updateField('password', e.target.value)}
            className={errors.password ? "border-destructive" : ""}
            minLength={6}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
          {formData.password && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={`h-2 flex-1 rounded ${
                  passwordStrength === 'strong' ? 'bg-green-500' :
                  passwordStrength === 'medium' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
                <span className="text-xs text-muted-foreground">
                  {passwordStrength === 'strong' ? 'Forte' :
                   passwordStrength === 'medium' ? 'Média' :
                   'Fraca'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo de 6 caracteres {formData.password.length >= 8 && '✓'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirme sua senha *</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={formData.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            className={errors.confirmPassword ? "border-destructive" : ""}
            minLength={6}
          />
          {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
          {formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && (
            <p className="text-sm text-green-600">✓ Senhas correspondem</p>
          )}
        </div>
      </div>
    );
  };

  // Renderizar etapa 4: Confirmação
  const renderStep4 = () => {
    // Formatar data de nascimento
    const formatDate = (dateString: string) => {
      if (!dateString) return '-';
      const date = new Date(dateString + 'T00:00:00');
      return date.toLocaleDateString('pt-BR');
    };

    // Formatar CPF
    const formatCpf = (cpf: string) => {
      const clean = cpf.replace(/\D/g, '');
      if (clean.length === 11) {
        return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
      }
      return cpf;
    };

    // Formatar telefone
    const formatPhone = (phone: string) => {
      const clean = phone.replace(/\D/g, '');
      if (clean.length === 11) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
      } else if (clean.length === 10) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
      }
      return phone;
    };

    // Formatar CEP
    const formatCep = (cep: string) => {
      const clean = cep.replace(/\D/g, '');
      if (clean.length === 8) {
        return `${clean.slice(0, 5)}-${clean.slice(5)}`;
      }
      return cep;
    };

    return (
      <div className="space-y-6">
        {/* Resumo dos Dados */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Revise seus dados</h3>
          
          {/* Referral Code Badge */}
          {referralCode && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Código de Referência</p>
                  <p className="text-sm font-semibold text-primary">{referralCode}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Dados Pessoais */}
          <div className="space-y-3 p-4 border rounded-lg">
            <h4 className="font-medium text-sm text-muted-foreground uppercase">Dados Pessoais</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Nome Completo:</span>
                <p className="font-medium">{formData.fullName || '-'}</p>
              </div>
              {formData.preferredName && (
                <div>
                  <span className="text-muted-foreground">Como quer ser chamado(a):</span>
                  <p className="font-medium">{formData.preferredName}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">CPF:</span>
                <p className="font-medium">{formatCpf(formData.cpf) || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Data de Nascimento:</span>
                <p className="font-medium">{formatDate(formData.birthDate)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Telefone:</span>
                <p className="font-medium">{formatPhone(formData.phone) || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Sexo:</span>
                <p className="font-medium">{formData.gender === 'M' ? 'Masculino' : formData.gender === 'F' ? 'Feminino' : '-'}</p>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-3 p-4 border rounded-lg">
            <h4 className="font-medium text-sm text-muted-foreground uppercase">Endereço</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">CEP:</span>
                <p className="font-medium">{formatCep(formData.postalCode) || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Estado:</span>
                <p className="font-medium">{formData.state || '-'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Logradouro:</span>
                <p className="font-medium">{formData.street || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Número:</span>
                <p className="font-medium">{formData.addressNumber || '-'}</p>
              </div>
              {formData.addressComplement && (
                <div>
                  <span className="text-muted-foreground">Complemento:</span>
                  <p className="font-medium">{formData.addressComplement}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Bairro:</span>
                <p className="font-medium">{formData.neighborhood || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Cidade:</span>
                <p className="font-medium">{formData.city || '-'}</p>
              </div>
            </div>
          </div>

          {/* Credenciais */}
          <div className="space-y-3 p-4 border rounded-lg">
            <h4 className="font-medium text-sm text-muted-foreground uppercase">Credenciais de Acesso</h4>
            <div className="text-sm">
              <span className="text-muted-foreground">E-mail:</span>
              <p className="font-medium">{formData.email || '-'}</p>
            </div>
          </div>
        </div>

        {/* Termos LGPD */}
        <div className="space-y-2">
          <div className="flex items-start space-x-2">
            <Checkbox
              id="lgpd"
              checked={formData.lgpdConsent}
              onCheckedChange={(checked) => updateField('lgpdConsent', checked as boolean)}
              className={errors.lgpdConsent ? "border-destructive" : ""}
            />
            <Label htmlFor="lgpd" className="text-sm leading-relaxed cursor-pointer">
              Aceito os termos de uso e política de privacidade (LGPD) *
            </Label>
          </div>
          {errors.lgpdConsent && <p className="text-sm text-destructive">{errors.lgpdConsent}</p>}
        </div>
      </div>
    );
  };

  // Renderizar conteúdo da etapa atual
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      default:
        return null;
    }
  };

  // Títulos das etapas
  const stepTitles = [
    'Dados Pessoais',
    'Endereço',
    'Credenciais de Acesso',
    'Confirmação e Termos',
  ];

  const stepDescriptions = [
    'Preencha suas informações pessoais',
    'Informe seu endereço completo',
    'Crie suas credenciais de acesso',
    'Revise seus dados e aceite os termos',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">CRONOTEAM</DialogTitle>
          <DialogDescription className="text-center">
            Cadastro - {stepTitles[currentStep - 1]}
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de Progresso */}
        {renderProgressIndicator()}

        {/* Descrição da Etapa */}
        <p className="text-sm text-muted-foreground text-center mb-6">
          {stepDescriptions[currentStep - 1]}
        </p>

        {/* Conteúdo da Etapa */}
        <div className="min-h-[300px]">
          {renderStepContent()}
        </div>

        {/* Botões de Navegação */}
        <div className="flex justify-between gap-4 mt-6 pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1 || loading}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          {currentStep < 4 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !formData.lgpdConsent}
              className="flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Finalizar Cadastro
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


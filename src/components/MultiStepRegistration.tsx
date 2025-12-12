import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const { register } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<StepErrors>({});

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
    }
  }, [open]);

  // Salvar dados no localStorage sempre que houver mudanças
  useEffect(() => {
    if (open) {
      localStorage.setItem('registration_form_data', JSON.stringify(formData));
    }
  }, [formData, open]);

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

  // Validação básica por etapa
  const validateStep = (step: number): boolean => {
    const newErrors: StepErrors = {};

    switch (step) {
      case 1:
        // Validar Etapa 1: Dados Pessoais
        if (!formData.cpf || formData.cpf.replace(/\D/g, '').length !== 11) {
          newErrors.cpf = 'CPF inválido';
        }
        if (!formData.birthDate) {
          newErrors.birthDate = 'Data de nascimento é obrigatória';
        }
        if (!formData.phone || formData.phone.replace(/\D/g, '').length < 10) {
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
        if (!formData.postalCode || formData.postalCode.replace(/\D/g, '').length !== 8) {
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
        if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          newErrors.email = 'E-mail inválido';
        }
        if (formData.email !== formData.confirmEmail) {
          newErrors.confirmEmail = 'E-mails não correspondem';
        }
        if (!formData.password || formData.password.length < 6) {
          newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
        }
        if (formData.password !== formData.confirmPassword) {
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
        cpf: formData.cpf.replace(/\D/g, ''),
        phone: formData.phone.replace(/\D/g, ''),
        gender: formData.gender as 'M' | 'F',
        birth_date: formData.birthDate,
        preferred_name: formData.preferredName || undefined,
        postal_code: formData.postalCode.replace(/\D/g, ''),
        street: formData.street,
        address_number: formData.addressNumber,
        address_complement: formData.addressComplement || undefined,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        lgpd_consent: formData.lgpdConsent,
      });

      if (success) {
        // Limpar dados salvos
        localStorage.removeItem('registration_form_data');
        onOpenChange(false);
        toast.success('Cadastro realizado com sucesso!');
        
        setTimeout(() => {
          const currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
          navigate(getDashboardRoute(currentUser as any));
        }, 100);
      }
    } catch (error: any) {
      console.error('Erro ao cadastrar:', error);
      toast.error(error.message || 'Erro ao realizar cadastro. Tente novamente.');
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
            onChange={(e) => updateField('cpf', e.target.value)}
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
            onChange={(e) => updateField('phone', e.target.value)}
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
            onValueChange={(value) => updateField('gender', value)}
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

  // Renderizar etapa 2: Endereço (placeholder - será implementado na ETAPA 3)
  const renderStep2 = () => {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Etapa 2: Endereço (em implementação)</p>
      </div>
    );
  };

  // Renderizar etapa 3: Credenciais (placeholder - será implementado na ETAPA 4)
  const renderStep3 = () => {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Etapa 3: Credenciais (em implementação)</p>
      </div>
    );
  };

  // Renderizar etapa 4: Confirmação (placeholder - será implementado na ETAPA 4)
  const renderStep4 = () => {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Etapa 4: Confirmação (em implementação)</p>
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


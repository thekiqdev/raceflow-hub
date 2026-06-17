import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, HelpCircle, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getOwnProfile } from "@/lib/api/profiles";
import { useToast } from "@/hooks/use-toast";
import { createContactMessage } from "@/lib/api/contactMessages";
import { getPublicFormConfigurations, type PublicFormFieldConfiguration } from "@/lib/api/formConfigurations";
import { buildContactWhatsAppMessage, buildWhatsAppUrl } from "@/lib/utils/whatsapp";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle?: string;
  organizerEmail?: string;
  organizerName?: string;
  eventId?: string;
  eventSlug?: string;
}

type ContactStep = "select" | "form";
type ContactType = "event" | "platform" | null;

export const ContactDialog = ({ open, onOpenChange, eventTitle, organizerEmail, organizerName, eventId, eventSlug }: ContactDialogProps) => {
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState<ContactStep>("select");
  const [contactType, setContactType] = useState<ContactType>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const { toast } = useToast();

  // Form fields
  const [formFields, setFormFields] = useState<PublicFormFieldConfiguration[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);

  useEffect(() => {
    if (open) {
      checkAuth();
      resetForm();
      setStep("select");
      setContactType(null);
      loadFormFields();
    }
  }, [open]);

  useEffect(() => {
    if (step === "form" && contactType) {
      loadFormFields();
    }
  }, [step, contactType]);

  const loadFormFields = async () => {
    setLoadingFields(true);
    try {
      const response = await getPublicFormConfigurations("contact");
      if (response.success && response.data && response.data.length > 0) {
        setFormFields(response.data);
        
        // Initialize form data
        const initialData: Record<string, any> = {};
        response.data.forEach((field) => {
          initialData[field.field_key] = "";
        });
        
        // Pre-fill with user data if logged in
        if (isAuthenticated && user) {
          if (userProfile) {
            const nameField = response.data.find(f => f.field_key === 'name');
            const emailField = response.data.find(f => f.field_key === 'email');
            const phoneField = response.data.find(f => f.field_key === 'phone');
            
            if (nameField && userProfile.full_name) {
              initialData['name'] = userProfile.full_name;
            }
            if (emailField && user.email) {
              initialData['email'] = user.email;
            }
            if (phoneField && userProfile.phone) {
              initialData['phone'] = userProfile.phone;
            }
          }
        }
        
        // Pre-fill subject if event type
        if (contactType === "event" && eventTitle) {
          const subjectField = response.data.find(f => f.field_key === 'subject');
          if (subjectField) {
            initialData['subject'] = `Dúvida sobre: ${eventTitle}`;
          }
        } else if (contactType === "platform") {
          const subjectField = response.data.find(f => f.field_key === 'subject');
          if (subjectField) {
            initialData['subject'] = "Dúvida sobre a plataforma";
          }
        }
        
        setFormData(initialData);
      } else {
        // Fallback to default fields
        setFormFields([]);
        setFormData({});
      }
    } catch (error: any) {
      console.error("Error loading contact form fields:", error);
      setFormFields([]);
      setFormData({});
    } finally {
      setLoadingFields(false);
    }
  };

  const checkAuth = async () => {
    if (isAuthenticated && user) {
      setIsLoggedIn(true);
      try {
        const response = await getOwnProfile();
        
        if (response.success && response.data) {
          const profile = response.data;
          setUserProfile(profile);
          
          // Update form data with user info
          setFormData(prev => ({
            ...prev,
            name: profile.full_name || prev.name || "",
            email: user.email || prev.email || "",
            phone: profile.phone || prev.phone || "",
          }));
        }
      } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        if (user.email) {
          setFormData(prev => ({
            ...prev,
            email: user.email || prev.email || "",
          }));
        }
      }
    } else {
      setIsLoggedIn(false);
      setUserProfile(null);
    }
  };

  const resetForm = () => {
    setFormData({});
  };

  const updateField = (fieldKey: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const handleSelectType = (type: ContactType) => {
    setContactType(type);
    setStep("form");
  };

  const handleBack = () => {
    setStep("select");
    setContactType(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const requiredFields = formFields.filter(f => f.field_required);
    const missingFields = requiredFields.filter(f => {
      const value = formData[f.field_key];
      return !value || (typeof value === 'string' && !value.trim());
    });
    
    if (missingFields.length > 0) {
      toast({
        title: "Campos obrigatórios",
        description: `Por favor, preencha todos os campos obrigatórios: ${missingFields.map(f => f.field_label).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Map form data to API format
      const apiData: any = {
        type: contactType || 'platform',
        event_id: contactType === 'event' && eventId ? eventId : undefined,
      };
      
      // Map field_key to API field names
      const fieldMapping: Record<string, string> = {
        'name': 'name',
        'sender_name': 'name',
        'email': 'email',
        'sender_email': 'email',
        'phone': 'phone',
        'sender_phone': 'phone',
        'subject': 'subject',
        'message': 'message',
      };
      
      formFields.forEach((field) => {
        const value = formData[field.field_key];
        if (value !== undefined && value !== null && value !== "") {
          const apiFieldName = fieldMapping[field.field_key] || field.field_key;
          apiData[apiFieldName] = String(value).trim();
        }
      });
      
      // Ensure required fields are present
      if (!apiData.name || !apiData.email || !apiData.subject || !apiData.message) {
        toast({
          title: "Campos obrigatórios",
          description: "Por favor, preencha todos os campos obrigatórios.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      const response = await createContactMessage(apiData);

      if (response.success) {
        const whatsappPhone = response.whatsapp?.phone;

        toast({
          title: "Mensagem enviada com sucesso.",
        });
        
        // Trigger event to update messages count in admin/organizer sidebar
        window.dispatchEvent(new Event('contact-messages-updated'));
        
        onOpenChange(false);
        resetForm();

        if (whatsappPhone) {
          const eventName =
            contactType === "event" ? (eventTitle || "Evento") : "Plataforma Cronoteam";
          const eventUrl =
            contactType === "event"
              ? `${window.location.origin}/evento/${eventSlug || eventId || ""}`
              : window.location.origin;

          const text = buildContactWhatsAppMessage({
            eventName,
            name: apiData.name,
            email: apiData.email,
            phone: apiData.phone,
            subject: apiData.subject,
            message: apiData.message,
            eventUrl,
          });

          setTimeout(() => {
            window.open(
              buildWhatsAppUrl(whatsappPhone, text),
              "_blank",
              "noopener,noreferrer"
            );
          }, 800);
        }
      } else {
        toast({
          title: "Erro ao enviar",
          description: response.error || "Ocorreu um erro ao enviar sua mensagem. Tente novamente.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error submitting contact message:", error);
      toast({
        title: "Erro ao enviar",
        description: error.message || "Ocorreu um erro ao enviar sua mensagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Entre em Contato" : "Enviar Mensagem"}
          </DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground mb-6">
              Selecione o tipo de dúvida para ser direcionado ao setor responsável:
            </p>
            
            <Button
              variant="outline"
              className="w-full h-auto py-6 flex flex-col items-center gap-2 group"
              onClick={() => handleSelectType("event")}
            >
              <MessageSquare className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold">Dúvidas sobre o Evento</div>
                <div className="text-xs text-muted-foreground group-hover:text-white transition-colors">
                  {organizerName ? `Fale diretamente com ${organizerName}` : "Fale diretamente com o organizador do evento"}
                </div>
                {organizerEmail && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {organizerEmail}
                  </div>
                )}
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full h-auto py-6 flex flex-col items-center gap-2 group"
              onClick={() => handleSelectType("platform")}
            >
              <HelpCircle className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold">Dúvidas sobre a Plataforma</div>
                <div className="text-xs text-muted-foreground group-hover:text-white transition-colors">
                  Fale com o suporte da plataforma
                </div>
              </div>
            </Button>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>

            {loadingFields ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : formFields.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Formulário não configurado
              </div>
            ) : (
              <>
                {isLoggedIn && userProfile && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-2">Seus dados:</p>
                    <div className="text-sm space-y-1">
                      <p><strong>Nome:</strong> {userProfile.full_name}</p>
                      <p><strong>Email:</strong> {formData.email || user.email}</p>
                      <p><strong>Telefone:</strong> {userProfile.phone || formData.phone || 'Não informado'}</p>
                    </div>
                  </div>
                )}

                {(() => {
                  // Group fields by row based on width
                  const rows: PublicFormFieldConfiguration[][] = [];
                  let currentRow: PublicFormFieldConfiguration[] = [];
                  let currentRowWidth = 0;

                  formFields.forEach((field) => {
                    // Skip name, email, phone if user is logged in (already shown in info box)
                    if (isLoggedIn && ['name', 'email', 'phone'].includes(field.field_key)) {
                      return;
                    }

                    const width = field.field_width === '50%' ? 50 : 
                                  field.field_width === '33%' ? 33 : 
                                  100;

                    if (currentRowWidth + width > 100 || currentRow.length === 0) {
                      if (currentRow.length > 0) {
                        rows.push([...currentRow]);
                      }
                      currentRow = [field];
                      currentRowWidth = width;
                    } else {
                      currentRow.push(field);
                      currentRowWidth += width;
                    }
                  });

                  if (currentRow.length > 0) {
                    rows.push(currentRow);
                  }

                  return rows.map((row, rowIndex) => (
                    <div key={rowIndex} className="flex flex-wrap gap-4">
                      {row.map((field) => {
                        const fieldValue = formData[field.field_key] || "";
                        
                        return (
                          <div
                            key={field.field_key}
                            className={field.field_width === '50%' ? 'flex-1 min-w-[200px]' : 
                                        field.field_width === '33%' ? 'flex-1 min-w-[150px]' : 
                                        'w-full'}
                          >
                            <div className="space-y-2">
                              <Label htmlFor={field.field_key}>
                                {field.field_label}
                                {field.field_required && <span className="text-destructive ml-1">*</span>}
                              </Label>
                              {field.field_type === 'textarea' ? (
                                <Textarea
                                  id={field.field_key}
                                  value={fieldValue}
                                  onChange={(e) => updateField(field.field_key, e.target.value)}
                                  placeholder={field.field_placeholder}
                                  className="min-h-[120px]"
                                  required={field.field_required}
                                />
                              ) : field.field_type === 'select' ? (
                                <select
                                  id={field.field_key}
                                  value={fieldValue}
                                  onChange={(e) => updateField(field.field_key, e.target.value)}
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  required={field.field_required}
                                >
                                  <option value="">{field.field_placeholder || "Selecione"}</option>
                                  {Array.isArray(field.field_options) && field.field_options.map((option: string, idx: number) => (
                                    <option key={idx} value={option.trim()}>
                                      {option.trim()}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <Input
                                  id={field.field_key}
                                  type={field.field_type === 'email' ? 'email' : 
                                        field.field_type === 'tel' ? 'tel' : 
                                        field.field_type === 'date' ? 'date' : 
                                        field.field_type === 'number' ? 'number' : 
                                        'text'}
                                  value={fieldValue}
                                  onChange={(e) => updateField(field.field_key, e.target.value)}
                                  placeholder={field.field_placeholder}
                                  required={field.field_required}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Enviando..." : "Enviar Mensagem"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

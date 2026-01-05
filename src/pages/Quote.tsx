import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { Facebook, Instagram, MessageCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { createQuote } from "@/lib/api/quotes";
import { getPublicFormConfigurations, type PublicFormFieldConfiguration } from "@/lib/api/formConfigurations";

type QuoteFormValues = Record<string, any>;

export default function Quote() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formFields, setFormFields] = useState<PublicFormFieldConfiguration[]>([]);
  const [formSchema, setFormSchema] = useState<z.ZodObject<any>>(z.object({}));

  useEffect(() => {
    loadFormConfigurations();
  }, []);

  const loadFormConfigurations = async () => {
    setLoading(true);
    try {
      const response = await getPublicFormConfigurations("quote");
      if (response.success && response.data && response.data.length > 0) {
        setFormFields(response.data);
        
        // Build dynamic Zod schema
        const schemaFields: Record<string, z.ZodTypeAny> = {};
        const defaultValues: Record<string, any> = {};
        
        response.data.forEach((field) => {
          let fieldSchema: z.ZodTypeAny;
          
          // Special validation for description field (min 10 chars as per backend)
          if (field.field_key === 'description' || field.field_key === 'message') {
            if (field.field_required) {
              fieldSchema = z.string().min(10, `${field.field_label} deve ter pelo menos 10 caracteres`);
            } else {
              fieldSchema = z.string().min(10, `${field.field_label} deve ter pelo menos 10 caracteres`).optional().or(z.literal(""));
            }
          } else if (field.field_required) {
            switch (field.field_type) {
              case 'email':
                fieldSchema = z.string().email("E-mail inválido").min(1, `${field.field_label} é obrigatório`);
                break;
              case 'number':
                fieldSchema = z.number().min(0, `${field.field_label} deve ser um número válido`);
                break;
              case 'date':
                fieldSchema = z.string().min(1, `${field.field_label} é obrigatório`);
                break;
              default:
                fieldSchema = z.string().min(1, `${field.field_label} é obrigatório`);
            }
          } else {
            switch (field.field_type) {
              case 'email':
                fieldSchema = z.string().email("E-mail inválido").optional().or(z.literal(""));
                break;
              case 'number':
                fieldSchema = z.number().optional().or(z.literal(0));
                break;
              default:
                fieldSchema = z.string().optional().or(z.literal(""));
            }
          }
          
          schemaFields[field.field_key] = fieldSchema;
          defaultValues[field.field_key] = field.field_type === 'number' ? 0 : "";
        });
        
        setFormSchema(z.object(schemaFields));
      } else {
        // Fallback to default fields if no configurations found
        setFormFields([]);
        setFormSchema(z.object({}));
      }
    } catch (error: any) {
      console.error("Error loading form configurations:", error);
      toast.error("Erro ao carregar formulário");
      setFormFields([]);
      setFormSchema(z.object({}));
    } finally {
      setLoading(false);
    }
  };

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {},
  });

  // Update default values when formFields change
  useEffect(() => {
    if (formFields.length > 0) {
      const defaultValues = formFields.reduce((acc, field) => {
        // Always set a defined value to avoid uncontrolled/controlled warning
        acc[field.field_key] = field.field_type === 'number' ? 0 : "";
        return acc;
      }, {} as Record<string, any>);
      form.reset(defaultValues);
    }
  }, [formFields, form]);

  const onSubmit = async (data: QuoteFormValues) => {
    setIsSubmitting(true);
    try {
      // Map field_key to backend API field names
      // This mapping ensures compatibility with the backend schema
      const fieldMapping: Record<string, string> = {
        'fullName': 'full_name',
        'full_name': 'full_name',
        'phone': 'phone',
        'email': 'email',
        'eventLocation': 'event_location',
        'event_location': 'event_location',
        'athletesCount': 'athletes_count',
        'athletes_count': 'athletes_count',
        'sameStartFinish': 'same_start_finish',
        'same_start_finish': 'same_start_finish',
        'electricPower': 'electric_power',
        'electric_power': 'electric_power',
        'additionalPoints': 'additional_points',
        'additional_points': 'additional_points',
        'chestNumbers': 'chest_numbers',
        'chest_numbers': 'chest_numbers',
        'distances': 'distances',
        'timingGate': 'timing_gate',
        'timing_gate': 'timing_gate',
        'cronoteamRegistration': 'cronoteam_registration',
        'cronoteam_registration': 'cronoteam_registration',
        'eventDate': 'event_date',
        'event_date': 'event_date',
        'description': 'description',
      };

      const apiData: any = {};
      const additionalFields: Record<string, any> = {};
      
      // Process all fields: mapped fields go to main object, unmapped fields go to additional_fields
      formFields.forEach((field) => {
        const apiKey = fieldMapping[field.field_key];
        const value = data[field.field_key];
        
        if (value !== undefined && value !== null && value !== "") {
          if (apiKey) {
            // Campo mapeado - vai para o objeto principal
            apiData[apiKey] = typeof value === 'number' ? String(value) : String(value).trim();
          } else {
            // Campo não mapeado - será enviado e o backend salvará em additional_fields
            additionalFields[field.field_key] = typeof value === 'number' ? String(value) : String(value).trim();
          }
        }
      });
      
      // Adicionar campos extras ao objeto principal (o backend vai separar)
      Object.assign(apiData, additionalFields);
      
      console.log('📤 Sending quote data:', apiData);
      console.log('📤 Additional fields being sent:', additionalFields);

      // Ensure required fields are present
      const requiredFields = ['full_name', 'phone', 'email', 'event_location', 'athletes_count', 
                             'same_start_finish', 'electric_power', 'chest_numbers', 'distances',
                             'timing_gate', 'cronoteam_registration', 'event_date', 'description'];
      
      const missingFields = requiredFields.filter(field => !apiData[field] || apiData[field].trim() === '');
      
      if (missingFields.length > 0) {
        toast.error(`Por favor, preencha todos os campos obrigatórios`);
        setIsSubmitting(false);
        return;
      }
      
      // Validate description length (backend requires min 10 chars)
      if (apiData.description && apiData.description.trim().length < 10) {
        toast.error('A descrição deve ter pelo menos 10 caracteres');
        setIsSubmitting(false);
        return;
      }

      const response = await createQuote(apiData);

      if (response.success) {
        toast.success("Orçamento enviado com sucesso! Entraremos em contato em breve.");
        form.reset();
        
        // Trigger event to update quotes count in admin sidebar
        window.dispatchEvent(new Event('quotes-updated'));
      } else {
        toast.error(response.error || "Erro ao enviar orçamento. Tente novamente.");
      }
    } catch (error: any) {
      console.error("Error submitting quote:", error);
      toast.error(error.message || "Erro ao enviar orçamento. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group fields by row based on width
  const groupFieldsByRow = (fields: PublicFormFieldConfiguration[]) => {
    const rows: PublicFormFieldConfiguration[][] = [];
    let currentRow: PublicFormFieldConfiguration[] = [];
    let currentRowWidth = 0;

    fields.forEach((field) => {
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

    return rows;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-12 max-w-3xl">
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (formFields.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold text-center mb-8">
            Formulário de orçamento de provas
          </h1>
          <div className="text-center py-8 text-muted-foreground">
            Formulário não configurado. Entre em contato com o administrador.
          </div>
        </main>
      </div>
    );
  }

  const fieldRows = groupFieldsByRow(formFields);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold text-center mb-8">
          Formulário de orçamento de provas
        </h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {fieldRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex flex-wrap gap-4">
                {row.map((field) => (
                  <FormField
                    key={field.field_key}
                    control={form.control}
                    name={field.field_key}
                    render={({ field: formField }) => (
                      <FormItem className={field.field_width === '50%' ? 'flex-1 min-w-[200px]' : 
                                          field.field_width === '33%' ? 'flex-1 min-w-[150px]' : 
                                          'w-full'}>
                        <FormLabel>
                          {field.field_label}
                          {field.field_required && <span className="text-destructive ml-1">*</span>}
                        </FormLabel>
                        <FormControl>
                          {field.field_type === 'textarea' ? (
                            <Textarea
                              {...formField}
                              value={formField.value ?? ""}
                              placeholder={field.field_placeholder}
                              className="bg-muted"
                              required={field.field_required}
                            />
                          ) : field.field_type === 'select' ? (
                            <Select
                              onValueChange={formField.onChange}
                              value={formField.value ?? ""}
                            >
                              <SelectTrigger className="bg-muted">
                                <SelectValue placeholder={field.field_placeholder || "Selecione"} />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.isArray(field.field_options) && field.field_options.map((option: string, idx: number) => (
                                  <SelectItem key={idx} value={option.trim()}>
                                    {option.trim()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              {...formField}
                              value={formField.value ?? ""}
                              type={field.field_type === 'email' ? 'email' : 
                                    field.field_type === 'tel' ? 'tel' : 
                                    field.field_type === 'date' ? 'date' : 
                                    field.field_type === 'number' ? 'number' : 
                                    'text'}
                              placeholder={field.field_placeholder}
                              className="bg-muted"
                              required={field.field_required}
                            />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            ))}

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSubmitting} size="lg">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Orçamento"
                )}
              </Button>
            </div>
          </form>
        </Form>

        {/* Social Media Links */}
        <div className="mt-12 pt-8 border-t">
          <div className="flex justify-center gap-6">
            <Link
              to="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Facebook className="h-6 w-6" />
            </Link>
            <Link
              to="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Instagram className="h-6 w-6" />
            </Link>
            <Link
              to="https://wa.me"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="h-6 w-6" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

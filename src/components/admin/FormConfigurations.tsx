import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown, Plus, Trash2, Save, Loader2, FileText, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  getFormConfigurations,
  bulkUpdateFormConfigurations,
  createFormFieldConfiguration,
  deleteFormFieldConfiguration,
  type FormFieldConfiguration,
} from "@/lib/api/formConfigurations";

const FormConfigurations = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"quote" | "contact">("quote");
  const [quoteFields, setQuoteFields] = useState<(FormFieldConfiguration & { id?: string })[]>([]);
  const [contactFields, setContactFields] = useState<(FormFieldConfiguration & { id?: string })[]>([]);

  useEffect(() => {
    loadConfigurations();
  }, []);

  const loadConfigurations = async () => {
    setLoading(true);
    try {
      const [quoteResponse, contactResponse] = await Promise.all([
        getFormConfigurations("quote"),
        getFormConfigurations("contact"),
      ]);

      console.log("Quote response:", quoteResponse);
      console.log("Contact response:", contactResponse);

      if (quoteResponse.success) {
        setQuoteFields(quoteResponse.data || []);
      } else {
        console.error("Quote response error:", quoteResponse.error);
        toast.error(quoteResponse.error || "Erro ao carregar campos do formulário de orçamento");
      }
      
      if (contactResponse.success) {
        setContactFields(contactResponse.data || []);
      } else {
        console.error("Contact response error:", contactResponse.error);
        toast.error(contactResponse.error || "Erro ao carregar campos do formulário de contato");
      }
    } catch (error: any) {
      console.error("Error loading form configurations:", error);
      toast.error(error.message || "Erro ao carregar configurações dos formulários");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (formType: "quote" | "contact") => {
    setSaving(true);
    try {
      const fields = formType === "quote" ? quoteFields : contactFields;
      
      // Generate unique field_key for new fields
      const configurations = fields.map((field, index) => {
        let fieldKey = field.field_key || '';
        
        // If it's a temporary field or doesn't have a key, generate a proper key
        if (!fieldKey || (field.id && field.id.startsWith("temp-"))) {
          // Generate key from label (lowercase, replace spaces and special chars)
          fieldKey = (field.field_label || 'campo')
            .toLowerCase()
            .replace(/\s+/g, "")
            .replace(/[^a-z0-9]/g, "");
          
          // Ensure uniqueness
          const existingKeys = fields.map(f => f.field_key).filter(k => k);
          let uniqueKey = fieldKey;
          let counter = 1;
          while (existingKeys.includes(uniqueKey) && counter < fields.length * 2) {
            uniqueKey = `${fieldKey}${counter}`;
            counter++;
          }
          fieldKey = uniqueKey;
        }
        
        // Validate field_width
        const validWidths = ['100%', '50%', '33%'];
        const fieldWidth = field.field_width && validWidths.includes(field.field_width) 
          ? field.field_width 
          : '100%';
        
        const config: any = {
          field_key: fieldKey,
          field_label: field.field_label || 'Campo sem nome',
          field_type: field.field_type || 'text',
          field_required: field.field_required !== undefined ? field.field_required : true,
          field_order: index,
          field_width: fieldWidth,
          field_enabled: field.field_enabled !== undefined ? field.field_enabled : true,
        };
        
        // Only include optional fields if they have values
        if (field.field_placeholder && field.field_placeholder.trim()) {
          config.field_placeholder = field.field_placeholder.trim();
        }
        
        if (field.field_options) {
          // If it's an array, ensure it's not empty
          if (Array.isArray(field.field_options) && field.field_options.length > 0) {
            config.field_options = field.field_options;
          } else if (typeof field.field_options === 'string' && field.field_options.trim()) {
            // If it's a string (from textarea), convert to array
            const options = field.field_options.split('\n').filter(o => o.trim());
            if (options.length > 0) {
              config.field_options = options;
            }
          }
        }
        
        if (field.field_validation && Object.keys(field.field_validation).length > 0) {
          config.field_validation = field.field_validation;
        }
        
        return config;
      });
      
      console.log('Sending configurations:', JSON.stringify(configurations, null, 2));

      const response = await bulkUpdateFormConfigurations(formType, { configurations });

      if (response.success) {
        toast.success(`Configurações do formulário de ${formType === "quote" ? "orçamento" : "contato"} salvas com sucesso!`);
        await loadConfigurations();
      } else {
        toast.error(response.error || "Erro ao salvar configurações");
      }
    } catch (error: any) {
      console.error("Error saving form configurations:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (formType: "quote" | "contact", index: number, updates: Partial<FormFieldConfiguration>) => {
    if (formType === "quote") {
      const newFields = [...quoteFields];
      newFields[index] = { ...newFields[index], ...updates };
      setQuoteFields(newFields);
    } else {
      const newFields = [...contactFields];
      newFields[index] = { ...newFields[index], ...updates };
      setContactFields(newFields);
    }
  };

  const moveField = (formType: "quote" | "contact", index: number, direction: "up" | "down") => {
    const fields = formType === "quote" ? quoteFields : contactFields;
    const newFields = [...fields];
    const newIndex = direction === "up" ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= newFields.length) return;

    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    
    // Update field_order for all fields
    newFields.forEach((field, idx) => {
      field.field_order = idx;
    });

    if (formType === "quote") {
      setQuoteFields(newFields);
    } else {
      setContactFields(newFields);
    }
  };

  const addNewField = (formType: "quote" | "contact") => {
    const fields = formType === "quote" ? quoteFields : contactFields;
    const newField: FormFieldConfiguration & { id?: string } = {
      id: `temp-${Date.now()}`,
      form_type: formType,
      field_key: `newField${fields.length + 1}`,
      field_label: "Novo Campo",
      field_type: "text",
      field_required: true,
      field_order: fields.length,
      field_width: "100%",
      field_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (formType === "quote") {
      setQuoteFields([...quoteFields, newField]);
    } else {
      setContactFields([...contactFields, newField]);
    }
  };

  const removeField = (formType: "quote" | "contact", index: number) => {
    const fields = formType === "quote" ? quoteFields : contactFields;
    const field = fields[index];
    
    // If it's a temporary field (not saved yet), just remove from state
    if (field.id && field.id.startsWith("temp-")) {
      const newFields = fields.filter((_, idx) => idx !== index);
      // Reorder remaining fields
      newFields.forEach((f, idx) => {
        f.field_order = idx;
      });
      
      if (formType === "quote") {
        setQuoteFields(newFields);
      } else {
        setContactFields(newFields);
      }
      return;
    }

    // If it's a saved field, delete from backend
    const handleDelete = async () => {
      if (!field.id) return;
      
      try {
        const response = await deleteFormFieldConfiguration(field.id);
        if (response.success) {
          toast.success("Campo removido com sucesso");
          await loadConfigurations();
        } else {
          toast.error("Erro ao remover campo");
        }
      } catch (error: any) {
        console.error("Error deleting field:", error);
        toast.error("Erro ao remover campo");
      }
    };

    handleDelete();
  };

  const renderFieldEditor = (field: FormFieldConfiguration & { id?: string }, index: number, formType: "quote" | "contact") => {
    return (
      <Card key={field.id} className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-muted-foreground">#{index + 1}</span>
              {field.field_label}
              <Badge variant="outline" className="ml-2">
                {field.field_width || '100%'}
              </Badge>
              {!field.field_enabled && <Badge variant="secondary">Desabilitado</Badge>}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveField(formType, index, "up")}
                disabled={index === 0}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveField(formType, index, "down")}
                disabled={index === (formType === "quote" ? quoteFields : contactFields).length - 1}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeField(formType, index)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Label do Campo</Label>
              <Input
                value={field.field_label}
                onChange={(e) => updateField(formType, index, { field_label: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo do Campo</Label>
              <Select
                value={field.field_type}
                onValueChange={(value: any) => updateField(formType, index, { field_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="tel">Telefone</SelectItem>
                  <SelectItem value="textarea">Área de Texto</SelectItem>
                  <SelectItem value="select">Seleção</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Placeholder</Label>
              <Input
                value={field.field_placeholder || ""}
                onChange={(e) => updateField(formType, index, { field_placeholder: e.target.value })}
                placeholder="Texto de exemplo"
              />
            </div>
            <div>
              <Label>Largura do Campo</Label>
              <Select
                value={field.field_width || "100%"}
                onValueChange={(value: '100%' | '50%' | '33%') => updateField(formType, index, { field_width: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100%">100% (Linha completa)</SelectItem>
                  <SelectItem value="50%">50% (Metade - 2 campos por linha)</SelectItem>
                  <SelectItem value="33%">33% (Um terço - 3 campos por linha)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4 pt-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.field_required}
                  onCheckedChange={(checked) => updateField(formType, index, { field_required: checked })}
                />
                <Label>Obrigatório</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.field_enabled}
                  onCheckedChange={(checked) => updateField(formType, index, { field_enabled: checked })}
                />
                <Label>Habilitado</Label>
              </div>
            </div>
          </div>
          {field.field_type === "select" && (
            <div>
              <Label>Opções (uma por linha)</Label>
              <Textarea
                value={Array.isArray(field.field_options) ? field.field_options.join("\n") : ""}
                onChange={(e) => {
                  const options = e.target.value.split("\n").filter((o) => o.trim());
                  updateField(formType, index, { field_options: options });
                }}
                placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                rows={4}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Chave do Campo</Label>
              <Input
                value={field.field_key}
                onChange={(e) => {
                  // Only allow alphanumeric and underscore, convert to lowercase
                  const newKey = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                  updateField(formType, index, { field_key: newKey });
                }}
                placeholder="campo_exemplo"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Apenas letras minúsculas, números e underscore
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Configurações de Formulários</h2>
        <p className="text-muted-foreground">Edite os campos dos formulários de orçamento e contato</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "quote" | "contact")}>
        <TabsList>
          <TabsTrigger value="quote" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Formulário de Orçamento
          </TabsTrigger>
          <TabsTrigger value="contact" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Formulário de Contato
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quote" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Campos do Formulário de Orçamento</CardTitle>
                  <CardDescription>
                    Configure os campos que aparecem no formulário de solicitação de orçamento
                  </CardDescription>
                </div>
                <Button onClick={() => addNewField("quote")} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Campo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {quoteFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum campo configurado. Clique em "Adicionar Campo" para começar.
                </div>
              ) : (
                <div className="space-y-4">
                  {quoteFields.map((field, index) => renderFieldEditor(field, index, "quote"))}
                </div>
              )}
              <div className="mt-6 flex justify-end">
                <Button onClick={() => handleSave("quote")} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Campos do Formulário de Contato</CardTitle>
                  <CardDescription>
                    Configure os campos que aparecem no formulário de contato dos eventos
                  </CardDescription>
                </div>
                <Button onClick={() => addNewField("contact")} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Campo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contactFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum campo configurado. Clique em "Adicionar Campo" para começar.
                </div>
              ) : (
                <div className="space-y-4">
                  {contactFields.map((field, index) => renderFieldEditor(field, index, "contact"))}
                </div>
              )}
              <div className="mt-6 flex justify-end">
                <Button onClick={() => handleSave("contact")} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FormConfigurations;


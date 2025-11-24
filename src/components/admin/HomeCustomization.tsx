import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Image as ImageIcon } from "lucide-react";

const HomeCustomization = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    hero_title: "",
    hero_subtitle: "",
    hero_image_url: "",
    whatsapp_number: "",
    whatsapp_text: "",
    consultoria_title: "",
    consultoria_description: "",
    stats_events: "",
    stats_events_label: "",
    stats_runners: "",
    stats_runners_label: "",
    stats_cities: "",
    stats_cities_label: "",
    stats_years: "",
    stats_years_label: "",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("home_page_settings")
        .select("*")
        .single();

      if (error) throw error;

      if (data) {
        setSettings({
          hero_title: data.hero_title || "",
          hero_subtitle: data.hero_subtitle || "",
          hero_image_url: data.hero_image_url || "",
          whatsapp_number: data.whatsapp_number || "",
          whatsapp_text: data.whatsapp_text || "",
          consultoria_title: data.consultoria_title || "",
          consultoria_description: data.consultoria_description || "",
          stats_events: data.stats_events || "",
          stats_events_label: data.stats_events_label || "",
          stats_runners: data.stats_runners || "",
          stats_runners_label: data.stats_runners_label || "",
          stats_cities: data.stats_cities || "",
          stats_cities_label: data.stats_cities_label || "",
          stats_years: data.stats_years || "",
          stats_years_label: data.stats_years_label || "",
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("home_page_settings")
        .update(settings)
        .eq("id", "00000000-0000-0000-0000-000000000001");

      if (error) throw error;

      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Personalizar Página Home</h2>
        <p className="text-muted-foreground">
          Configure os textos e imagens que aparecem na página inicial do site
        </p>
      </div>

      <Tabs defaultValue="hero" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="consultoria">Consultoria</TabsTrigger>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
        </TabsList>

        <TabsContent value="hero" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seção Hero (Principal)</CardTitle>
              <CardDescription>
                Configure o banner principal que aparece no topo da página
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hero_title">Título Principal</Label>
                <Input
                  id="hero_title"
                  value={settings.hero_title}
                  onChange={(e) => handleChange("hero_title", e.target.value)}
                  placeholder="Ex: Agende seu Próximo Evento Esportivo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero_subtitle">Subtítulo</Label>
                <Textarea
                  id="hero_subtitle"
                  value={settings.hero_subtitle}
                  onChange={(e) => handleChange("hero_subtitle", e.target.value)}
                  placeholder="Ex: Gestão completa de cronometragem..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero_image_url">URL da Imagem de Fundo</Label>
                <div className="flex gap-2">
                  <Input
                    id="hero_image_url"
                    value={settings.hero_image_url}
                    onChange={(e) => handleChange("hero_image_url", e.target.value)}
                    placeholder="https://exemplo.com/imagem.jpg"
                  />
                  <Button variant="outline" size="icon">
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cole a URL de uma imagem hospedada na web
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seção WhatsApp</CardTitle>
              <CardDescription>
                Configure o número e texto da seção de contato
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="whatsapp_number">Número do WhatsApp</Label>
                <Input
                  id="whatsapp_number"
                  value={settings.whatsapp_number}
                  onChange={(e) => handleChange("whatsapp_number", e.target.value)}
                  placeholder="Ex: +55 85 99108-4183"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp_text">Texto de Contato</Label>
                <Input
                  id="whatsapp_text"
                  value={settings.whatsapp_text}
                  onChange={(e) => handleChange("whatsapp_text", e.target.value)}
                  placeholder="Ex: Entre em contato via WhatsApp"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consultoria" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seção Consultoria</CardTitle>
              <CardDescription>
                Configure os textos da seção de consultoria
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="consultoria_title">Título</Label>
                <Input
                  id="consultoria_title"
                  value={settings.consultoria_title}
                  onChange={(e) => handleChange("consultoria_title", e.target.value)}
                  placeholder="Ex: Consultoria Especializada"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="consultoria_description">Descrição</Label>
                <Textarea
                  id="consultoria_description"
                  value={settings.consultoria_description}
                  onChange={(e) => handleChange("consultoria_description", e.target.value)}
                  placeholder="Descreva os serviços de consultoria..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estatísticas</CardTitle>
              <CardDescription>
                Configure os números e textos da seção de estatísticas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stats_events">Número de Eventos</Label>
                  <Input
                    id="stats_events"
                    value={settings.stats_events}
                    onChange={(e) => handleChange("stats_events", e.target.value)}
                    placeholder="Ex: 500+"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stats_events_label">Label</Label>
                  <Input
                    id="stats_events_label"
                    value={settings.stats_events_label}
                    onChange={(e) => handleChange("stats_events_label", e.target.value)}
                    placeholder="Ex: Eventos Realizados"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stats_runners">Número de Corredores</Label>
                  <Input
                    id="stats_runners"
                    value={settings.stats_runners}
                    onChange={(e) => handleChange("stats_runners", e.target.value)}
                    placeholder="Ex: 50k+"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stats_runners_label">Label</Label>
                  <Input
                    id="stats_runners_label"
                    value={settings.stats_runners_label}
                    onChange={(e) => handleChange("stats_runners_label", e.target.value)}
                    placeholder="Ex: Corredores Atendidos"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stats_cities">Número de Cidades</Label>
                  <Input
                    id="stats_cities"
                    value={settings.stats_cities}
                    onChange={(e) => handleChange("stats_cities", e.target.value)}
                    placeholder="Ex: 100+"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stats_cities_label">Label</Label>
                  <Input
                    id="stats_cities_label"
                    value={settings.stats_cities_label}
                    onChange={(e) => handleChange("stats_cities_label", e.target.value)}
                    placeholder="Ex: Cidades"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stats_years">Anos de Experiência</Label>
                  <Input
                    id="stats_years"
                    value={settings.stats_years}
                    onChange={(e) => handleChange("stats_years", e.target.value)}
                    placeholder="Ex: 10+"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stats_years_label">Label</Label>
                  <Input
                    id="stats_years_label"
                    value={settings.stats_years_label}
                    onChange={(e) => handleChange("stats_years_label", e.target.value)}
                    placeholder="Ex: Anos de Experiência"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
};

export default HomeCustomization;

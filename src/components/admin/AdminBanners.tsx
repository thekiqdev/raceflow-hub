import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { FileUpload } from "@/components/ui/file-upload";
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, Image as ImageIcon, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  type HomeBanner,
} from "@/lib/api/homeBanners";

const emptyForm = {
  image_url: "",
  image_url_mobile: "",
  title: "",
  link_url: "",
  is_active: true,
  display_order: 0,
};

type ViewMode = "list" | "form";

export default function AdminBanners() {
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingBanner, setEditingBanner] = useState<HomeBanner | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadBanners = async () => {
    setLoading(true);
    try {
      const res = await getAllBanners();
      if (res.success && res.data) {
        setBanners(res.data);
      } else {
        toast.error(res.error || "Erro ao carregar banners");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar banners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBanners();
  }, []);

  const openCreate = () => {
    setEditingBanner(null);
    setForm({
      ...emptyForm,
      display_order: banners.length,
    });
    setViewMode("form");
  };

  const openEdit = (banner: HomeBanner) => {
    setEditingBanner(banner);
    setForm({
      image_url: banner.image_url || "",
      image_url_mobile: banner.image_url_mobile ?? "",
      title: banner.title || "",
      link_url: banner.link_url || "",
      is_active: banner.is_active,
      display_order: banner.display_order ?? 0,
    });
    setViewMode("form");
  };

  const goBackToList = () => {
    setViewMode("list");
    setEditingBanner(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    const imageUrl = (form.image_url || "").trim();
    const imageUrlMobile = (form.image_url_mobile || "").trim();
    if (!imageUrl && !imageUrlMobile) {
      toast.error("Informe pelo menos a imagem desktop ou a imagem mobile.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        image_url: imageUrl || null,
        image_url_mobile: imageUrlMobile || null,
        title: form.title.trim() || null,
        link_url: form.link_url.trim() || null,
        is_active: form.is_active,
        display_order: Math.max(0, Number(form.display_order) || 0),
      };
      if (editingBanner) {
        const res = await updateBanner(editingBanner.id, payload);
        if (res.success) {
          toast.success("Banner atualizado.");
          goBackToList();
          loadBanners();
        } else {
          toast.error(res.error || "Erro ao atualizar");
        }
      } else {
        const res = await createBanner(payload);
        if (res.success) {
          toast.success("Banner criado.");
          goBackToList();
          loadBanners();
        } else {
          toast.error(res.error || "Erro ao criar");
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (banner: HomeBanner) => {
    try {
      const res = await updateBanner(banner.id, { is_active: !banner.is_active });
      if (res.success) {
        toast.success(banner.is_active ? "Banner desativado." : "Banner ativado.");
        loadBanners();
      } else {
        toast.error(res.error || "Erro ao atualizar");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar");
    }
  };

  const handleDelete = async (banner: HomeBanner) => {
    if (!confirm("Tem certeza que deseja excluir este banner?")) return;
    try {
      const res = await deleteBanner(banner.id);
      if (res.success) {
        toast.success("Banner excluído.");
        loadBanners();
      } else {
        toast.error(res.error || "Erro ao excluir");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir");
    }
  };

  const moveOrder = async (banner: HomeBanner, direction: "up" | "down") => {
    const idx = banners.findIndex((b) => b.id === banner.id);
    if (idx < 0) return;
    const nextIdx = direction === "up" ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= banners.length) return;
    const other = banners[nextIdx];
    const newOrder = other.display_order;
    const otherNewOrder = banner.display_order;
    try {
      await updateBanner(banner.id, { display_order: newOrder });
      await updateBanner(other.id, { display_order: otherNewOrder });
      toast.success("Ordem atualizada.");
      loadBanners();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao reordenar");
    }
  };

  if (viewMode === "form") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBackToList} title="Voltar à lista">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {editingBanner ? "Editar banner" : "Novo banner"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {editingBanner
                ? "Altere as imagens, título, link ou ordem do banner."
                : "Preencha pelo menos uma imagem (desktop ou mobile)."}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-6 max-w-2xl">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <Label className="text-base font-medium">Banner desktop</Label>
                <p className="text-xs text-muted-foreground">
                  Exibido apenas em telas maiores (PC, tablet). Preview abaixo é só desta imagem.
                </p>
                <FileUpload
                  type="banner"
                  inputId="banner-desktop-input"
                  value={form.image_url || null}
                  onChange={(url) => setForm((p) => ({ ...p, image_url: url || "" }))}
                />
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <Label className="text-base font-medium">Banner mobile</Label>
                <p className="text-xs text-muted-foreground">
                  Exibido apenas em celular. Preview abaixo é só desta imagem. Independente do desktop.
                </p>
                <FileUpload
                  type="banner"
                  inputId="banner-mobile-input"
                  value={form.image_url_mobile || null}
                  onChange={(url) => setForm((p) => ({ ...p, image_url_mobile: url || "" }))}
                />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Informe pelo menos uma das duas imagens (desktop ou mobile). Cada uma aparece só no seu tipo de tela.
              </p>

              <div className="space-y-2">
                <Label htmlFor="banner-title">Título (opcional)</Label>
                <Input
                  id="banner-title"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ex.: Promoção de inscrições"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner-link">Link de destino (opcional)</Label>
                <Input
                  id="banner-link"
                  type="url"
                  value={form.link_url}
                  onChange={(e) => setForm((p) => ({ ...p, link_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="banner-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm((p) => ({ ...p, is_active: checked === true }))
                  }
                />
                <Label htmlFor="banner-active" className="font-normal cursor-pointer">
                  Banner ativo (visível na home)
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner-order">Ordem de exibição</Label>
                <Input
                  id="banner-order"
                  type="number"
                  min={0}
                  value={form.display_order}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, display_order: parseInt(e.target.value, 10) || 0 }))
                  }
                />
                <p className="text-xs text-muted-foreground">Menor número aparece primeiro no slider.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={goBackToList} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingBanner ? "Salvar" : "Criar banner"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Banners</h2>
        <p className="text-muted-foreground">
          Gerencie os banners exibidos no slider da página inicial do site.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Banners da Home</CardTitle>
              <CardDescription>
                Adicione, edite, ative/desative e ordene os banners. Apenas os ativos aparecem na home.
              </CardDescription>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo banner
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : banners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
              <p>Nenhum banner cadastrado.</p>
              <Button variant="outline" className="mt-3" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro banner
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Imagem</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="w-[80px]">Ordem</TableHead>
                  <TableHead className="w-[180px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {banners.map((banner, index) => (
                  <TableRow key={banner.id}>
                    <TableCell>
                      <div className="h-12 w-20 rounded overflow-hidden bg-muted flex-shrink-0">
                        {(banner.image_url || banner.image_url_mobile) ? (
                          <img
                            src={banner.image_url || banner.image_url_mobile || ""}
                            alt={banner.title || "Banner"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {banner.title || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={banner.is_active}
                          onCheckedChange={() => handleToggleActive(banner)}
                          aria-label={banner.is_active ? "Desativar banner" : "Ativar banner"}
                        />
                        <span className="text-sm text-muted-foreground">
                          {banner.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{banner.display_order}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Subir"
                          disabled={index === 0}
                          onClick={() => moveOrder(banner, "up")}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Descer"
                          disabled={index === banners.length - 1}
                          onClick={() => moveOrder(banner, "down")}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          onClick={() => openEdit(banner)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(banner)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

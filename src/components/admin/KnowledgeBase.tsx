import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Edit, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getCategories,
  getArticles,
  createCategory,
  updateCategory,
  deleteCategory,
  createArticle,
  updateArticle,
  deleteArticle,
  toggleArticleStatus,
  type KnowledgeCategory,
  type KnowledgeArticle,
} from "@/lib/api/knowledge";

const KnowledgeBase = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("articles");
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [isArticleDialogOpen, setIsArticleDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null);
  const [editingCategory, setEditingCategory] = useState<KnowledgeCategory | null>(null);
  
  // Form states
  const [articleForm, setArticleForm] = useState({
    title: "",
    slug: "",
    category_id: "",
    content: "",
    status: "rascunho" as "rascunho" | "publicado",
  });
  
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    slug: "",
  });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "articles") {
      const timer = setTimeout(() => {
        loadData();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "articles") {
        const response = await getArticles(searchTerm ? { search: searchTerm } : undefined);
        if (response.success && response.data) {
          setArticles(response.data);
        } else {
          toast.error("Erro ao carregar artigos");
        }
      } else if (activeTab === "categories") {
        const response = await getCategories();
        if (response.success && response.data) {
          setCategories(response.data);
        } else {
          toast.error("Erro ao carregar categorias");
        }
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenArticleDialog = (article?: KnowledgeArticle) => {
    if (article) {
      setEditingArticle(article);
      setArticleForm({
        title: article.title,
        slug: article.slug,
        category_id: article.category_id || "",
        content: article.content,
        status: article.status as "rascunho" | "publicado",
      });
    } else {
      setEditingArticle(null);
      setArticleForm({
        title: "",
        slug: "",
        category_id: "",
        content: "",
        status: "rascunho",
      });
    }
    setIsArticleDialogOpen(true);
  };

  const handleSaveArticle = async () => {
    try {
      if (editingArticle) {
        // Remove category_id if empty, set to null if needed
        const formData: any = { ...articleForm };
        if (formData.category_id === "") {
          formData.category_id = null;
        }
        
        const response = await updateArticle(editingArticle.id, formData);
        if (response.success) {
          toast.success("Artigo atualizado com sucesso!");
          setIsArticleDialogOpen(false);
          setEditingArticle(null);
          loadData();
        } else {
          toast.error(response.error || "Erro ao atualizar artigo");
        }
      } else {
        // Remove category_id if empty
        const formData = { ...articleForm };
        if (!formData.category_id || formData.category_id === "") {
          delete formData.category_id;
        }
        
        const response = await createArticle(formData);
        if (response.success) {
          toast.success("Artigo criado com sucesso!");
          setIsArticleDialogOpen(false);
          loadData();
        } else {
          toast.error(response.error || "Erro ao criar artigo");
        }
      }
    } catch (error) {
      toast.error("Erro ao salvar artigo");
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este artigo?")) {
      return;
    }

    try {
      const response = await deleteArticle(id);
      if (response.success) {
        toast.success("Artigo excluído com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao excluir artigo");
      }
    } catch (error) {
      toast.error("Erro ao excluir artigo");
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const response = await toggleArticleStatus(id);
      if (response.success) {
        toast.success("Status do artigo alterado!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao alterar status");
      }
    } catch (error) {
      toast.error("Erro ao alterar status");
    }
  };

  const handleOpenCategoryDialog = (category?: KnowledgeCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        slug: category.slug,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: "",
        slug: "",
      });
    }
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        const response = await updateCategory(editingCategory.id, categoryForm);
        if (response.success) {
          toast.success("Categoria atualizada com sucesso!");
          setIsCategoryDialogOpen(false);
          setEditingCategory(null);
          loadData();
        } else {
          toast.error(response.error || "Erro ao atualizar categoria");
        }
      } else {
        const response = await createCategory(categoryForm);
        if (response.success) {
          toast.success("Categoria criada com sucesso!");
          setIsCategoryDialogOpen(false);
          loadData();
        } else {
          toast.error(response.error || "Erro ao criar categoria");
        }
      }
    } catch (error) {
      toast.error("Erro ao salvar categoria");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta categoria?")) {
      return;
    }

    try {
      const response = await deleteCategory(id);
      if (response.success) {
        toast.success("Categoria excluída com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao excluir categoria");
      }
    } catch (error) {
      toast.error("Erro ao excluir categoria");
    }
  };

  // Generate slug from title
  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-2">Base de Conhecimento</h2>
          <p className="text-muted-foreground">Gerenciar artigos de dúvidas frequentes</p>
        </div>
        <Dialog open={isArticleDialogOpen} onOpenChange={setIsArticleDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenArticleDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Artigo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingArticle ? "Editar Artigo" : "Novo Artigo"}</DialogTitle>
              <DialogDescription>
                Crie ou edite artigos para a página de dúvidas frequentes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input 
                  id="title" 
                  placeholder="Ex: Como me inscrever em um evento?"
                  value={articleForm.title}
                  onChange={(e) => {
                    setArticleForm({ ...articleForm, title: e.target.value });
                    if (!editingArticle) {
                      setArticleForm({ ...articleForm, title: e.target.value, slug: generateSlug(e.target.value) });
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL)</Label>
                <Input 
                  id="slug" 
                  placeholder="como-me-inscrever"
                  value={articleForm.slug}
                  onChange={(e) => setArticleForm({ ...articleForm, slug: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select 
                  value={articleForm.category_id || "none"} 
                  onValueChange={(value) => setArticleForm({ ...articleForm, category_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Conteúdo</Label>
                <Textarea 
                  id="content" 
                  placeholder="Digite o conteúdo do artigo..." 
                  rows={10}
                  value={articleForm.content}
                  onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={articleForm.status} 
                  onValueChange={(value) => setArticleForm({ ...articleForm, status: value as "rascunho" | "publicado" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="publicado">Publicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsArticleDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveArticle}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="articles">Artigos</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
        </TabsList>

        {/* Artigos */}
        <TabsContent value="articles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Artigos</CardTitle>
              <CardDescription>Gerenciar todos os artigos da base de conhecimento</CardDescription>
              <div className="flex gap-2 pt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar artigos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        loadData();
                      }
                    }}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visualizações</TableHead>
                    <TableHead>Atualizado em</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : articles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum artigo encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    articles.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell className="font-medium">{article.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{article.category_name || "Sem categoria"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={article.status === "publicado" ? "default" : "secondary"}>
                            {article.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{article.views}</TableCell>
                        <TableCell>{new Date(article.updated_at).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenArticleDialog(article)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleStatus(article.id)}
                            >
                              {article.status === "publicado" ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteArticle(article.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categorias */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Categorias</CardTitle>
              <CardDescription>Gerenciar categorias dos artigos</CardDescription>
              <div className="pt-4">
                <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenCategoryDialog()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nova Categoria
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
                      <DialogDescription>
                        Crie ou edite uma categoria para os artigos
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="cat-name">Nome</Label>
                        <Input 
                          id="cat-name" 
                          placeholder="Ex: Inscrições"
                          value={categoryForm.name}
                          onChange={(e) => {
                            setCategoryForm({ 
                              name: e.target.value, 
                              slug: generateSlug(e.target.value) 
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cat-slug">Slug</Label>
                        <Input 
                          id="cat-slug" 
                          placeholder="inscricoes"
                          value={categoryForm.slug}
                          onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveCategory}>
                        Salvar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Nº de Artigos</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : categories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma categoria encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    categories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell className="text-muted-foreground">{category.slug}</TableCell>
                        <TableCell>{category.articles_count || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleOpenCategoryDialog(category)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDeleteCategory(category.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default KnowledgeBase;

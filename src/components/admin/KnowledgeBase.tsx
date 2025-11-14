import { useState } from "react";
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
import { Search, Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const KnowledgeBase = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any>(null);

  // Mock data
  const articles = [
    { 
      id: 1, 
      title: "Como me inscrever em um evento?", 
      slug: "como-me-inscrever", 
      category: "Inscrições",
      content: "Para se inscrever em um evento, acesse a página de eventos...",
      status: "publicado",
      views: 1250,
      createdAt: "2024-01-15",
      updatedAt: "2024-01-20"
    },
    { 
      id: 2, 
      title: "Como faço para cancelar minha inscrição?", 
      slug: "cancelar-inscricao", 
      category: "Inscrições",
      content: "Para cancelar uma inscrição, acesse seu painel...",
      status: "publicado",
      views: 890,
      createdAt: "2024-01-10",
      updatedAt: "2024-01-18"
    },
    { 
      id: 3, 
      title: "Quais são as formas de pagamento?", 
      slug: "formas-pagamento", 
      category: "Pagamento",
      content: "Aceitamos pagamento via PIX, cartão de crédito...",
      status: "rascunho",
      views: 0,
      createdAt: "2024-01-22",
      updatedAt: "2024-01-22"
    },
    { 
      id: 4, 
      title: "Como emitir segunda via do boleto?", 
      slug: "segunda-via-boleto", 
      category: "Pagamento",
      content: "Para emitir a segunda via do boleto...",
      status: "publicado",
      views: 456,
      createdAt: "2024-01-12",
      updatedAt: "2024-01-19"
    },
  ];

  const categories = [
    { id: 1, name: "Inscrições", articlesCount: 12, slug: "inscricoes" },
    { id: 2, name: "Pagamento", articlesCount: 8, slug: "pagamento" },
    { id: 3, name: "Eventos", articlesCount: 15, slug: "eventos" },
    { id: 4, name: "Conta", articlesCount: 6, slug: "conta" },
  ];

  const handleSaveArticle = () => {
    toast.success(editingArticle ? "Artigo atualizado com sucesso!" : "Artigo criado com sucesso!");
    setIsDialogOpen(false);
    setEditingArticle(null);
  };

  const handleDeleteArticle = (id: number) => {
    toast.success("Artigo excluído com sucesso!");
  };

  const handleToggleStatus = (id: number) => {
    toast.success("Status do artigo alterado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-2">Base de Conhecimento</h2>
          <p className="text-muted-foreground">Gerenciar artigos de dúvidas frequentes</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingArticle(null)}>
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
                <Input id="title" placeholder="Ex: Como me inscrever em um evento?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL)</Label>
                <Input id="slug" placeholder="como-me-inscrever" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inscricoes">Inscrições</SelectItem>
                    <SelectItem value="pagamento">Pagamento</SelectItem>
                    <SelectItem value="eventos">Eventos</SelectItem>
                    <SelectItem value="conta">Conta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Conteúdo</Label>
                <Textarea 
                  id="content" 
                  placeholder="Digite o conteúdo do artigo..." 
                  rows={10}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select defaultValue="rascunho">
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
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveArticle}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="articles" className="space-y-4">
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
                  {articles.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell className="font-medium">{article.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{article.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={article.status === "publicado" ? "default" : "secondary"}>
                          {article.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{article.views}</TableCell>
                      <TableCell>{new Date(article.updatedAt).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingArticle(article);
                              setIsDialogOpen(true);
                            }}
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
                  ))}
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
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Categoria
                </Button>
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
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="text-muted-foreground">{category.slug}</TableCell>
                      <TableCell>{category.articlesCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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

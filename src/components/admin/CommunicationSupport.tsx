import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Eye, CheckCircle, Edit, Trash2, Plus } from "lucide-react";

const CommunicationSupport = () => {
  const [searchTerm, setSearchTerm] = useState("");

  // Mock data
  const tickets = [
    { id: 1, user: "Pedro Silva", type: "atleta", subject: "Problema com pagamento", status: "aberto", date: "2024-12-15" },
    { id: 2, user: "Maria Santos", type: "organizador", subject: "Dúvida sobre taxa", status: "respondido", date: "2024-12-14" },
    { id: 3, user: "Ana Costa", type: "atleta", subject: "Cancelamento de inscrição", status: "em_analise", date: "2024-12-13" },
  ];

  const faqs = [
    { id: 1, question: "Como faço para me inscrever em um evento?", category: "Inscrições", status: "publicado" },
    { id: 2, question: "Quais são as formas de pagamento?", category: "Pagamentos", status: "publicado" },
    { id: 3, question: "Posso cancelar minha inscrição?", category: "Suporte", status: "rascunho" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Comunicação e Suporte</h2>
        <p className="text-muted-foreground">Gerenciar chamados, comunicados e FAQ</p>
      </div>

      <Tabs defaultValue="tickets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tickets">Chamados</TabsTrigger>
          <TabsTrigger value="announcements">Comunicados</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        {/* Chamados */}
        <TabsContent value="tickets">
          <Card>
            <CardHeader>
              <CardTitle>Chamados de Suporte</CardTitle>
              <CardDescription>Gerenciar solicitações de atletas e organizadores</CardDescription>
              <div className="relative pt-4">
                <MessageSquare className="absolute left-3 top-7 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar chamados..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>#{ticket.id}</TableCell>
                      <TableCell className="font-medium">{ticket.user}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ticket.type}</Badge>
                      </TableCell>
                      <TableCell>{ticket.subject}</TableCell>
                      <TableCell>{new Date(ticket.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            ticket.status === "aberto" ? "destructive" : 
                            ticket.status === "respondido" ? "default" : "secondary"
                          }
                        >
                          {ticket.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" title="Visualizar">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Responder">
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Encerrar">
                            <CheckCircle className="h-4 w-4" />
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

        {/* Comunicados */}
        <TabsContent value="announcements">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Enviar Comunicado</CardTitle>
                <CardDescription>Notificar usuários sobre atualizações</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Destinatários</label>
                  <select className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 py-2">
                    <option>Todos os usuários</option>
                    <option>Apenas atletas</option>
                    <option>Apenas organizadores</option>
                    <option>Usuários filtrados</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Assunto</label>
                  <Input placeholder="Digite o assunto..." className="mt-2" />
                </div>
                <div>
                  <label className="text-sm font-medium">Mensagem</label>
                  <Textarea 
                    placeholder="Digite a mensagem..." 
                    className="mt-2 min-h-[120px]"
                  />
                </div>
                <Button className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Comunicado
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Templates de Comunicado</CardTitle>
                <CardDescription>Modelos prontos para uso rápido</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Aviso de Novo Evento
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Manutenção do Sistema
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Atualização de Termos
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Promoção Especial
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* FAQ */}
        <TabsContent value="faq">
          <Card>
            <CardHeader>
              <CardTitle>Perguntas Frequentes</CardTitle>
              <CardDescription>Gerenciar FAQ pública da plataforma</CardDescription>
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Nova Pergunta
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pergunta</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faqs.map((faq) => (
                    <TableRow key={faq.id}>
                      <TableCell className="font-medium">{faq.question}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{faq.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={faq.status === "publicado" ? "default" : "secondary"}>
                          {faq.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" title="Editar">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Excluir">
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

export default CommunicationSupport;
